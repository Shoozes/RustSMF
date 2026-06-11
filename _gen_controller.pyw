#!/usr/bin/env python3
import os
import sys
import json
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, filedialog, simpledialog, messagebox
from pathlib import Path

def get_repo_root() -> Path:
    p = Path(__file__).resolve()
    for parent in [p] + list(p.parents):
        if (parent / ".git").exists() or (parent / ".tools").exists():
            return parent
    return p.parent

REPO_ROOT = get_repo_root()
PROJECT_JSON = REPO_ROOT / ".tools" / "project.json"
BANK_PATH = REPO_ROOT / "summary_bank.json"

VALID_EXTS = {
    ".txt", ".md", ".css", ".js", ".mjs", ".ts", ".tsx", ".html",
    ".py", ".pyw", ".jsx",
    ".ps1", ".bat", ".cmd",
    ".json", ".toml", ".yaml", ".yml",
    ".rs", ".c", ".cc", ".cpp", ".h", ".hpp",
    ".glsl", ".vert", ".frag",
    ".ini", ".cfg",
}

def get_valid_files(repo_root):
    try:
        res = subprocess.run(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            cwd=str(repo_root), capture_output=True, check=True
        )
        files = res.stdout.decode('utf-8').split('\0')
        return [f for f in files if f and Path(f).suffix.lower() in VALID_EXTS]
    except Exception:
        return []

class ToolTip:
    """A simple tooltip implementation for Tkinter widgets."""
    def __init__(self, widget, text):
        self.widget = widget
        self.text = text
        self.tipwindow = None
        self.widget.bind("<Enter>", self.show_tip)
        self.widget.bind("<Leave>", self.hide_tip)

    def show_tip(self, event=None):
        if self.tipwindow or not self.text:
            return
        x = self.widget.winfo_rootx() + 20
        y = self.widget.winfo_rooty() + 20
        self.tipwindow = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        
        bg_color = "#333333" if sys.platform != "darwin" else "#ffffe0"
        fg_color = "#ffffff" if sys.platform != "darwin" else "#000000"
        
        label = tk.Label(tw, text=self.text, justify=tk.LEFT, 
                         background=bg_color, foreground=fg_color, 
                         relief=tk.SOLID, borderwidth=1, font=("tahoma", "9", "normal"))
        label.pack(ipadx=4, ipady=2)

    def hide_tip(self, event=None):
        if self.tipwindow:
            self.tipwindow.destroy()
            self.tipwindow = None

class RebuilderFrame(ttk.Frame):
    """The interactive tab to paste LLM payload and rebuild."""
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app
        self.create_widgets()

    def create_widgets(self):
        ttk.Label(self, text="Paste LLM REGION-ONLY output here to safely update source files:").pack(anchor="w", pady=(0, 5))
        
        self.text_area = tk.Text(self, wrap="word", font=("Consolas", 10))
        self.text_area.pack(fill="both", expand=True)
        
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", pady=5)
        
        ttk.Button(btn_frame, text="Clear", command=lambda: self.text_area.delete("1.0", tk.END)).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="Execute Rebuild", command=self.rebuild).pack(side="right", padx=2)

    def rebuild(self):
        content = self.text_area.get("1.0", tk.END).strip()
        if not content:
            messagebox.showwarning("Empty", "Please paste the LLM output first.")
            return
            
        payload_path = REPO_ROOT / ".tools" / "_temp_payload.txt"
        with open(payload_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        rebuilder_script = REPO_ROOT / ".tools" / "_gen_rebuilder.py"
        cmd = [sys.executable, str(rebuilder_script), "rebuild", str(payload_path), "-o", ".", "-v", "--backup"]
        
        self.app.log("\n> Running Rebuilder (with Smart Backup)...\n")
        threading.Thread(target=self.app.execute_cmd, args=(cmd, True, False), daemon=True).start()

class ContextPickerFrame(ttk.Frame):
    """The interactive file explorer & context size estimator tab."""
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app
        self.selected_paths = []
        self.groups = {}
        self.create_widgets()
        self.load_bank()
        
    def create_widgets(self):
        # Top: Group selection
        top_frame = ttk.Frame(self)
        top_frame.pack(fill="x", pady=(0, 5))
        ttk.Label(top_frame, text="Load predefined group:").pack(side="left")
        self.group_cb = ttk.Combobox(top_frame, state="readonly")
        self.group_cb.pack(side="left", fill="x", expand=True, padx=5)
        self.group_cb.bind("<<ComboboxSelected>>", self.on_group_select)
        
        # Middle: Split view (File Explorer | Selected Paths)
        self.h_paned = ttk.PanedWindow(self, orient=tk.HORIZONTAL)
        self.h_paned.pack(fill="both", expand=True, pady=2)
        
        # Left: File Explorer Tree
        tree_frame = ttk.Frame(self.h_paned)
        self.h_paned.add(tree_frame, weight=1)
        ttk.Label(tree_frame, text="Project Explorer:").pack(anchor="w")
        
        self.tree = ttk.Treeview(tree_frame, selectmode="extended", show="tree")
        self.tree.pack(side="left", fill="both", expand=True)
        t_scroll = ttk.Scrollbar(tree_frame, command=self.tree.yview)
        t_scroll.pack(side="right", fill="y")
        self.tree.config(yscrollcommand=t_scroll.set)
        self.tree.bind("<Double-1>", self.add_from_tree)
        
        # Right: Selected Context List
        list_frame = ttk.Frame(self.h_paned)
        self.h_paned.add(list_frame, weight=1)
        ttk.Label(list_frame, text="Selected Context:").pack(anchor="w")
        
        self.listbox = tk.Listbox(list_frame, selectmode="extended")
        self.listbox.pack(side="left", fill="both", expand=True)
        l_scroll = ttk.Scrollbar(list_frame, command=self.listbox.yview)
        l_scroll.pack(side="right", fill="y")
        self.listbox.config(yscrollcommand=l_scroll.set)
        
        # Buttons
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", pady=5)
        ttk.Button(btn_frame, text="Add Selected ->", command=self.add_from_tree).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="<- Remove Selected", command=self.remove_selected).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="Clear All", command=self.clear_all).pack(side="left", padx=2)
        
        # Bottom: Stats & Action
        bottom_frame = ttk.Frame(self)
        bottom_frame.pack(fill="x", pady=2)
        self.lbl_size = tk.Label(bottom_frame, text="Estimated Context Size: 0 KB", font=("Arial", 10, "bold"))
        self.lbl_size.pack(side="left")
        
        ttk.Button(bottom_frame, text="Generate & Open Context", command=self.generate).pack(side="right", padx=2)
        ttk.Button(bottom_frame, text="Save Group As...", command=self.save_group).pack(side="right", padx=2)
        
        # Populate Explorer
        self.populate_tree()

    def populate_tree(self):
        files = get_valid_files(REPO_ROOT)
        added = set()
        
        for f in files:
            parts = Path(f).parts
            current_id = ""
            for i, part in enumerate(parts):
                parent_id = current_id
                current_id = f"{parent_id}/{part}" if parent_id else part
                
                if current_id not in added:
                    is_folder = (i < len(parts) - 1)
                    tags = ("folder",) if is_folder else ("file",)
                    self.tree.insert(parent_id, "end", iid=current_id, text=part, open=False, tags=tags)
                    added.add(current_id)

    def load_bank(self):
        if BANK_PATH.exists():
            try:
                with open(BANK_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.groups = data.get("groups", {})
                    self.group_cb["values"] = list(self.groups.keys())
            except Exception as e:
                self.app.log(f"Error loading bank: {e}\n")
                
    def on_group_select(self, event):
        grp = self.group_cb.get()
        if grp in self.groups:
            paths = self.groups[grp].get("paths", [])
            self.selected_paths = paths.copy()
            self.refresh_list()
            
    def add_from_tree(self, event=None):
        for item in self.tree.selection():
            tags = self.tree.item(item, "tags")
            path_str = item
            if "folder" in tags:
                if not path_str.endswith("/**"):
                    path_str += "/**"
            
            if path_str not in self.selected_paths:
                self.selected_paths.append(path_str)
        self.refresh_list()
            
    def remove_selected(self):
        idxs = list(self.listbox.curselection())
        idxs.reverse()
        for i in idxs:
            self.selected_paths.pop(i)
        self.refresh_list()
        
    def clear_all(self):
        self.selected_paths.clear()
        self.refresh_list()
        
    def refresh_list(self):
        self.listbox.delete(0, tk.END)
        for p in self.selected_paths:
            self.listbox.insert(tk.END, p)
        self.update_size()
        
    def update_size(self):
        total_bytes = 0
        for p_str in self.selected_paths:
            clean_p = p_str.replace("/**", "").replace("/*", "")
            p = REPO_ROOT / clean_p
            if p.is_file():
                total_bytes += p.stat().st_size
            elif p.is_dir():
                for root, _, files in os.walk(p):
                    for f in files:
                        fp = Path(root) / f
                        if fp.is_file():
                            total_bytes += fp.stat().st_size
        
        kb = total_bytes / 1024.0
        self.lbl_size.config(text=f"Estimated Context Size: {kb:.1f} KB")
        
        fg_color = "red" if kb > 200 else ("#ccc" if self.app.tk.call('tk', 'windowingsystem') == 'aqua' else "black")
        self.lbl_size.config(fg=fg_color)
            
    def save_group(self):
        if not self.selected_paths:
            messagebox.showwarning("Empty", "No paths selected to save.")
            return
            
        grp_name = simpledialog.askstring("Save Group", "Enter new group name:")
        if not grp_name or not grp_name.strip():
            return
            
        grp_name = grp_name.strip()
        
        if BANK_PATH.exists():
            try:
                with open(BANK_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                self.app.log(f"Error loading bank for save: {e}\n")
                data = {"groups": {}}
        else:
            data = {"groups": {}}
            
        data.setdefault("groups", {})
        
        if grp_name in data["groups"] and not data["groups"][grp_name].get("_temporary"):
            if not messagebox.askyesno("Overwrite", f"Group '{grp_name}' already exists. Overwrite?"):
                return
                
        data["groups"][grp_name] = {
            "paths": self.selected_paths.copy(),
            "_note": "Saved via Context Picker UI"
        }
        
        try:
            with open(BANK_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            self.app.log(f"Saved group '{grp_name}' to summary_bank.json\n")
            
            self.groups = data["groups"]
            self.group_cb["values"] = list(self.groups.keys())
            self.group_cb.set(grp_name)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save group:\n{e}")

    def generate(self):
        if not self.selected_paths:
            self.app.log("No paths selected to generate context.\n")
            return
            
        if BANK_PATH.exists():
            with open(BANK_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {"groups": {}}
            
        data.setdefault("groups", {})
        data["groups"]["_gui_export"] = {
            "paths": self.selected_paths,
            "_temporary": True,
            "_note": "Generated by Context Picker UI"
        }
        
        with open(BANK_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            
        struct_script = REPO_ROOT / ".tools" / "_gen_struct.py"
        out_file = REPO_ROOT / "_struct_summary.txt"
        cmd = [sys.executable, str(struct_script), "--group", "_gui_export", "--out", str(out_file)]
        
        self.app.log("\n> Generating targeted context block...\n")
        threading.Thread(target=self.app.execute_cmd, args=(cmd, True, True), daemon=True).start()


class ControllerApp(tk.Tk):
    """The unified Unified Dev GUI Controller."""
    def __init__(self):
        super().__init__()
        
        self.paned = ttk.PanedWindow(self, orient=tk.VERTICAL)
        self.paned.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)
        
        self.top_frame = ttk.Frame(self.paned)
        self.paned.add(self.top_frame, weight=5)
        
        self.bottom_frame = ttk.Frame(self.paned)
        self.paned.add(self.bottom_frame, weight=1)
        
        self.notebook = ttk.Notebook(self.top_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        self.console = tk.Text(self.bottom_frame, state='disabled', bg="#1e1e1e", fg="#cccccc", font=("Consolas", 9), height=6)
        self.console.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll = ttk.Scrollbar(self.bottom_frame, command=self.console.yview)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.console.config(yscrollcommand=scroll.set)
        
        # 1. Native Rebuilder Tab (Always First)
        rebuilder_frame = RebuilderFrame(self.notebook, self)
        rebuilder_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.notebook.add(rebuilder_frame, text="Rebuilder")
        
        # 2. Native Context Picker Tab
        picker_frame = ContextPickerFrame(self.notebook, self)
        picker_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.notebook.add(picker_frame, text="Context Picker")

        # 3. Load dynamic tabs, ensuring Git is at the absolute end
        self.load_project_json()
        
    def log(self, msg):
        self.console.configure(state='normal')
        self.console.insert(tk.END, msg)
        self.console.see(tk.END)
        self.console.configure(state='disabled')
        
    def _add_json_tab(self, group_def):
        frame = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(frame, text=group_def.get("label", "Misc"))
        
        for btn in group_def.get("buttons", []):
            btn_widget = ttk.Button(frame, text=btn.get("label", "Button"), 
                                    command=lambda b=btn: self.run_button(b))
            btn_widget.pack(fill="x", pady=3)
            
            desc = btn.get("description")
            if desc:
                ToolTip(btn_widget, desc)

    def load_project_json(self):
        if not PROJECT_JSON.exists():
            self.title("Dev Controller (No project.json found)")
            self.geometry("780x600")
            return
            
        with open(PROJECT_JSON, "r", encoding="utf-8") as f:
            config = json.load(f)
            
        win_cfg = config.get("window", {})
        self.title(win_cfg.get("title", "Dev Controller"))
        self.geometry(f"{win_cfg.get('width', 780)}x{win_cfg.get('height', 600)}")
        
        groups = config.get("groups", [])
        git_group = None
        other_groups = []
        
        for g in groups:
            if g.get("label", "").lower() == "git":
                git_group = g
            else:
                other_groups.append(g)
                
        for g in other_groups:
            self._add_json_tab(g)
            
        if git_group:
            self._add_json_tab(git_group)

    def run_button(self, btn_def):
        script = btn_def.get("script")
        args = btn_def.get("args", [])
        typ = btn_def.get("type")
        prompt_arg = btn_def.get("prompt_arg")
        
        if prompt_arg:
            val = simpledialog.askstring(
                "Input",
                prompt_arg.get("label", "Enter value:"),
                initialvalue=prompt_arg.get("initial_value", "")
            )
            if val is None: 
                return
            if val.strip():
                flag = prompt_arg.get("flag")
                if flag:
                    args = [flag, val] + args
                else:
                    args = [val] + args
                
        if typ == "python":
            cmd = [sys.executable, str(REPO_ROOT / script)] + args
        elif typ == "powershell":
            cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(REPO_ROOT / script)] + args
        elif typ == "open_file":
            filepath = REPO_ROOT / btn_def.get("path", "")
            if sys.platform == "win32": os.startfile(filepath)
            elif sys.platform == "darwin": subprocess.call(["open", filepath])
            else: subprocess.call(["xdg-open", filepath])
            return
        else:
            self.log(f"Unknown type: {typ}\n")
            return
            
        self.log(f"\n> Running: {btn_def.get('label')}\n")
        threading.Thread(target=self.execute_cmd, args=(cmd, btn_def.get("capture", True), False), daemon=True).start()
        
    def execute_cmd(self, cmd, capture, open_summary=False):
        try:
            if capture:
                process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, cwd=str(REPO_ROOT))
                for line in iter(process.stdout.readline, ''):
                    self.after(0, self.log, line)
                process.stdout.close()
                process.wait()
            else:
                subprocess.Popen(cmd, cwd=str(REPO_ROOT)).wait()
            
            self.after(0, self.log, "Task completed.\n")
            
            if open_summary:
                out_file = REPO_ROOT / "_struct_summary.txt"
                if sys.platform == "win32": os.startfile(out_file)
                elif sys.platform == "darwin": subprocess.call(["open", out_file])
                else: subprocess.call(["xdg-open", out_file])
                
        except Exception as e:
            self.after(0, self.log, f"Error executing task: {e}\n")

if __name__ == "__main__":
    app = ControllerApp()
    app.mainloop()
