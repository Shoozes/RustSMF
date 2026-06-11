#!/usr/bin/env python3
# project_rebuilder.py
# v0.08 - Foolproof Parsing + Commands + Root-Aware
import os
import argparse
import shutil
import datetime
import sys
import re
from pathlib import Path

def find_repo_root(start_path: Path) -> Path:
    """Finds the project root by looking for .git or .tools directories."""
    for p in [start_path] + list(start_path.parents):
        if (p / ".git").exists() or (p / ".tools").exists():
            return p
    return start_path

def _create_backup(root_dir: str, max_kb: int = 5000, verbose: bool = False) -> None:
    """Safely backups source code to a centralized AppData/Local share directory. Guards against oversized folders."""
    home = Path.home()
    if sys.platform == "win32":
        base_backup_dir = home / "AppData" / "Local" / "GenBackups"
    else:
        base_backup_dir = home / ".local" / "share" / "GenBackups"

    # Folders that make backups too heavy (ignore models, node_modules, etc.)
    skip_dirs = {".git", "node_modules", "runtime-data", "venv", ".venv", "dist", "build", "__pycache__", "target", ".cache"}
    to_backup = []
    total_bytes = 0
    
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for f in files:
            filepath = os.path.join(root, f)
            try:
                size = os.path.getsize(filepath)
                total_bytes += size
                to_backup.append(filepath)
            except OSError:
                pass

    total_kb = total_bytes / 1024.0
    if total_kb > max_kb:
        if verbose:
            print(f"[backup] WARNING: Source size ({total_kb:.1f} KB) exceeds {max_kb} KB limit. Aborting backup.")
        return

    project_name = os.path.basename(os.path.abspath(root_dir)) or "project"
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = base_backup_dir / f"{project_name}_{timestamp}"

    try:
        for src_file in to_backup:
            rel = os.path.relpath(src_file, root_dir)
            dst_file = backup_path / rel
            os.makedirs(os.path.dirname(dst_file), exist_ok=True)
            shutil.copy2(src_file, dst_file)
        if verbose:
            print(f"[backup] Saved {len(to_backup)} files ({total_kb:.1f} KB) to {backup_path}")
    except Exception as e:
        if verbose:
            print(f"[backup] Error during backup: {e}")

def _normalize_rel_path(raw: str) -> str:
    """Normalizes paths for cross-platform usage and ensures forward slashes."""
    p = raw.strip().strip('"').strip("'").replace("\\", "/")
    while "//" in p: p = p.replace("//", "/")
    if p.startswith("./"): p = p[2:]
    return p.strip()

def _is_safe_inside(base_dir: str, target_path: str) -> bool:
    """Security check to ensure written files don't escape the project root."""
    base = os.path.abspath(base_dir)
    target = os.path.abspath(target_path)
    try:
        rel = os.path.relpath(target, base)
    except ValueError:
        return False
    return not rel.startswith(os.pardir + os.sep) and rel != os.pardir

def _extract_directive(line: str):
    """Bulletproof parsing of '#' directives immune to clipboard artifacts."""
    s = line.strip()
    if not s.startswith("#"): return None
    
    parts = s.split(None, 1)
    if not parts: return None
    
    # Strip non-alpha to clean up weird encoding prefix artifacts
    cmd_part = "".join(c for c in parts[0][1:].lower() if c.isalpha())
    rest = parts[1].strip() if len(parts) > 1 else ""
    return (cmd_part, rest)

def rebuild_project(summary_txt: str, output_dir: str, verbose: bool = False, backup: bool = False):
    """Parses REGION-ONLY payload, executes commands, and updates files."""
    actual_root = str(find_repo_root(Path(__file__).resolve()))
    if output_dir == "." or output_dir == actual_root:
        output_dir = actual_root

    if not os.path.exists(summary_txt):
        print(f"[error] Summary file not found: {summary_txt}")
        return

    with open(summary_txt, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    # 1. Parsing Phase
    command_lines = []
    region_entries = []
    
    in_commands = False
    current_file = None
    body_lines = []

    for ln in lines:
        d = _extract_directive(ln)
        
        if d:
            cmd, args = d
            if cmd == "commands":
                in_commands = True
                continue
            elif cmd == "endcommands":
                in_commands = False
                continue
            elif cmd == "region":
                if current_file: region_entries.append((current_file, "\n".join(body_lines)))
                current_file = args
                body_lines = []
                continue
            elif cmd == "endregion":
                if current_file: region_entries.append((current_file, "\n".join(body_lines)))
                current_file = None
                body_lines = []
                continue

        if in_commands:
            if ln.strip(): command_lines.append(ln.strip())
        elif current_file:
            body_lines.append(ln)

    # 2. Execution Phase
    if backup and os.path.exists(output_dir):
        _create_backup(output_dir, max_kb=5000, verbose=verbose)

    os.makedirs(output_dir, exist_ok=True)

    # Handle #commands (delete/move)
    for cmd_raw in command_lines:
        try:
            parts = cmd_raw.split(":", 1)
            if len(parts) < 2: continue
            action = parts[0].strip().lower()
            args = parts[1].strip().split()
            
            if action == "delete":
                for arg in args:
                    rel = _normalize_rel_path(arg)
                    path = os.path.join(output_dir, rel.replace("/", os.sep))
                    if _is_safe_inside(output_dir, path) and os.path.exists(path):
                        if os.path.isdir(path): shutil.rmtree(path)
                        else: os.unlink(path)
                        if verbose: print(f"[delete] {rel}")

            elif action == "move" and len(args) == 2:
                old_rel, new_rel = _normalize_rel_path(args[0]), _normalize_rel_path(args[1])
                old_path = os.path.join(output_dir, old_rel.replace("/", os.sep))
                new_path = os.path.join(output_dir, new_rel.replace("/", os.sep))
                if _is_safe_inside(output_dir, old_path) and _is_safe_inside(output_dir, new_path) and os.path.exists(old_path):
                    os.makedirs(os.path.dirname(new_path), exist_ok=True)
                    shutil.move(old_path, new_path)
                    if verbose: print(f"[move] {old_rel} -> {new_rel}")
        except Exception as e:
            print(f"[error] Failed command '{cmd_raw}': {e}")

    # Handle #region blocks
    written = 0
    for raw_name, content in region_entries:
        rel = _normalize_rel_path(raw_name).strip("/")
        if not rel or ".." in rel.split("/"): continue
        
        target = os.path.join(output_dir, rel.replace("/", os.sep))
        if not _is_safe_inside(output_dir, target): continue

        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            with open(target, "w", encoding="utf-8") as f:
                f.write(content)
            if verbose: print(f"[write] {rel}")
            written += 1
        except Exception as e:
            print(f"[error] Failed to write {rel}: {e}")

    print(f"Success: Processed {len(command_lines)} commands and wrote {written} files into '{output_dir}'")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update project source code via region blocks.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    reb_parser = subparsers.add_parser("rebuild", help="Update project from region summary.")
    reb_parser.add_argument("summary", help="Path to the payload text file.")
    reb_parser.add_argument("-o", "--output", default=".", help="Target output directory.")
    reb_parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging.")
    reb_parser.add_argument("--backup", action="store_true", help="Enable smart backup.")
    args = parser.parse_args()
    if args.command == "rebuild":
        rebuild_project(args.summary, args.output, args.verbose, args.backup)