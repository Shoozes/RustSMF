#!/usr/bin/env python3
import argparse
import fnmatch
import os
from pathlib import Path
from typing import List, Optional, Sequence, Tuple


DEFAULT_TEXT_EXTS: Tuple[str, ...] = (
    ".txt", ".md", ".css", ".js", ".mjs", ".ts", ".tsx", ".html",
    ".py", ".pyw", ".jsx",
    ".ps1", ".bat", ".cmd",
    ".json", ".toml", ".yaml", ".yml",
    ".rs", ".c", ".cc", ".cpp", ".h", ".hpp",
    ".glsl", ".vert", ".frag",
    ".ini", ".cfg",
)

DEFAULT_SKIP_FILES: List[str] = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "setup_log.txt",
    "debug_log.txt",
    "legacy_code.txt",
    "_generate_structure.py",
    "_gen_controller.pyw",
    "_structure_with_content.txt",
    "_struct_summary.txt",
    "README.md"
]

DEFAULT_SKIP_FOLDERS: List[str] = [
    "node_modules",
    "dist",
    "build",
    "release",
    "venv",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".git",
    ".cache",
    "target",
    ".secrets",
    ".vscode",
    ".idea",
    "_internal",
    "_backup",
    "gen",
    "public",
    "wllama",
    "llama-b8200-bin-win-cuda-13.1-x64_03_03_2026",
    "tests",
    "__tests__",
    "e2e",
    ".tools",
    ".agents",
    "docs"
]


def _to_posix_rel(rel_path: str) -> str:
    rel_path = rel_path.replace(os.sep, "/")
    while rel_path.startswith("./"):
        rel_path = rel_path[2:]
    return rel_path


def find_repo_root(start: Path) -> Optional[Path]:
    p = start.resolve()
    markers = (
        ".git",
        ".gitignore",
        ".tools",
        "_gen_controller.pyw",
        "_gen_controller.bat",
        "AGENTS.md",
    )
    for cur in [p] + list(p.parents):
        for m in markers:
            if (cur / m).exists():
                return cur
    return None


def load_gitignore_patterns(repo_root: Path) -> List[str]:
    p = repo_root / ".gitignore"
    if not p.exists():
        return []
    lines: List[str] = []
    for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = ln.strip()
        if not s or s.startswith("#"):
            continue
        lines.append(s)
    return lines


def _match_gitignore_pattern(rel_posix: str, pattern: str) -> bool:
    anchored = pattern.startswith("/")
    pat = pattern[1:] if anchored else pattern

    if pat.endswith("/"):
        pat = pat[:-1] + "/*"

    if anchored:
        return fnmatch.fnmatch(rel_posix, pat)

    parts = rel_posix.split("/")
    for i in range(len(parts) + 1):
        subpath = "/".join(parts[:i]) + ("/" if i > 0 else "") + pat
        if fnmatch.fnmatch(rel_posix, subpath):
            return True
    return False


def is_ignored_by_gitignore(rel_posix: str, patterns: Sequence[str]) -> bool:
    ignored = False
    for raw in patterns:
        neg = raw.startswith("!")
        pat = raw[1:] if neg else raw
        if not pat:
            continue
        if _match_gitignore_pattern(rel_posix, pat):
            ignored = not neg
    return ignored


def is_probably_binary(data: bytes) -> bool:
    if not data:
        return False
    if b"\x00" in data:
        return True
    sample = data[:4096]
    nontext = 0
    for b in sample:
        if b in (9, 10, 13):
            continue
        if 32 <= b <= 126:
            continue
        nontext += 1
    return (nontext / max(1, len(sample))) > 0.20


def read_text_file_safely(path: Path, max_bytes: int) -> str:
    data = path.read_bytes()
    if is_probably_binary(data):
        return "[Skipped: binary file]"
    if len(data) > max_bytes:
        head = data[:max_bytes]
        try:
            txt = head.decode("utf-8")
        except UnicodeDecodeError:
            txt = head.decode("utf-8", errors="replace")
        return txt.rstrip("\n") + "\n[truncated]"
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("utf-8", errors="replace")


def split_dirs_files(directory: Path) -> Tuple[List[Path], List[Path]]:
    dirs: List[Path] = []
    files: List[Path] = []
    try:
        with os.scandir(directory) as it:
            for entry in it:
                p = Path(entry.path)
                if entry.is_dir(follow_symlinks=False):
                    dirs.append(p)
                else:
                    files.append(p)
    except FileNotFoundError:
        return [], []

    dirs.sort(key=lambda p: p.name.lower())
    files.sort(key=lambda p: (p.name.lower() != "index.html", p.name.lower()))
    return dirs, files


def _emit_chain_from_repo_root(structure_lines: List[str], rel_chain: Path) -> str:
    """
    Emits a single-path chain like:
      ./
      └── frontend
          └── src
              ...
    Returns the prefix to use for children under the final segment.
    """
    parts = [p for p in rel_chain.parts if p and p != "."]
    prefix = ""
    for seg in parts:
        structure_lines.append(f"{prefix}└── {seg}")
        prefix += "   "
    return prefix


def generate_structure_with_content(
    start_dir: str,
    output_file: str = "_structure_with_content.txt",
    skip_folders: Optional[Sequence[str]] = None,
    skip_prefixes: Optional[Sequence[str]] = None,
    skip_suffixes: Optional[Sequence[str]] = None,
    skip_files: Optional[Sequence[str]] = None,
    use_gitignore: bool = True,
    include_exts: Optional[Sequence[str]] = None,
    max_file_kb: int = 256,
) -> None:
    start_path = Path(start_dir).expanduser().resolve()

    repo_root = find_repo_root(start_path) or start_path
    scan_root = start_path

    try:
        rel_scan_root = scan_root.relative_to(repo_root)
    except Exception:
        repo_root = scan_root
        rel_scan_root = Path(".")

    out_path = Path(output_file).expanduser()
    if not out_path.is_absolute():
        out_path = scan_root / out_path

    sfolders = set(skip_folders or [])
    sprefix = tuple(skip_prefixes or ())
    ssuffix = tuple(skip_suffixes or ())
    sfiles = set(skip_files or [])
    exts = tuple(include_exts or DEFAULT_TEXT_EXTS)
    max_bytes = max(1, int(max_file_kb)) * 1024

    git_patterns: List[str] = []
    if use_gitignore:
        git_patterns = load_gitignore_patterns(repo_root)

    structure_lines: List[str] = []
    content_blocks: List[str] = []

    structure_lines.append("./")
    chain_prefix = ""
    if str(rel_scan_root) not in (".", ""):
        chain_prefix = _emit_chain_from_repo_root(structure_lines, rel_scan_root)

    def rel_to_repo(p: Path) -> str:
        return _to_posix_rel(str(p.relative_to(repo_root)))

    def should_skip(full_path: Path) -> bool:
        name = full_path.name

        if name in sfiles:
            return True
        if sprefix and name.startswith(sprefix):
            return True
        if ssuffix and name.endswith(ssuffix):
            return True
        if full_path.is_dir() and name in sfolders:
            return True

        if use_gitignore:
            rel_posix = rel_to_repo(full_path)
            if rel_posix and is_ignored_by_gitignore(rel_posix, git_patterns):
                return True

        return False

    def write_structure(current: Path, prefix: str = "") -> None:
        dirs, files = split_dirs_files(current)
        entries: List[Path] = dirs + files

        filtered: List[Path] = []
        for p in entries:
            if should_skip(p):
                continue
            filtered.append(p)

        for i, p in enumerate(filtered):
            is_last = i == (len(filtered) - 1)
            branch = "└── " if is_last else "├── "
            structure_lines.append(f"{prefix}{branch}{p.name}")

            if p.is_dir():
                sub_prefix = prefix + ("   " if is_last else "│  ")
                write_structure(p, sub_prefix)
                continue

            if p.suffix.lower() in exts:
                rel_posix = rel_to_repo(p)
                file_block: List[str] = [f"#region {rel_posix}"]
                try:
                    txt = read_text_file_safely(p, max_bytes=max_bytes)
                    file_block.extend([ln.rstrip("\n") for ln in txt.splitlines()])
                except Exception as e:
                    file_block.append(f"[Error reading file: {e}]")
                file_block.append("#endregion")
                content_blocks.append("\n".join(file_block))

    write_structure(scan_root, chain_prefix)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(structure_lines) + "\n\n")
        if content_blocks:
            f.write("\n\n".join(content_blocks) + "\n")

    print(f"Structure with content written to {out_path}")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Emit a subtree-only folder tree plus #region blocks of text files."
    )
    ap.add_argument(
        "--root",
        default="",
        help="Start directory to scan downward from. If empty, uses CWD.",
    )
    ap.add_argument(
        "--out",
        default="_structure_with_content.txt",
        help="Output file (relative to the start directory unless absolute).",
    )
    ap.add_argument("--no-gitignore", action="store_true", help="Do not apply .gitignore rules.")
    ap.add_argument("--max-file-kb", type=int, default=256, help="Max bytes per file to embed (KB).")
    ap.add_argument("--skip-folder", action="append", default=[], help="Folder name to skip (repeatable).")
    ap.add_argument("--skip-file", action="append", default=[], help="Filename to skip (repeatable).")
    ap.add_argument("--skip-prefix", action="append", default=[], help="Name prefix to skip (repeatable).")
    ap.add_argument("--skip-suffix", action="append", default=[], help="Name suffix to skip (repeatable).")
    args = ap.parse_args()

    start_dir = args.root.strip() or str(Path.cwd())

    skip_folders = list(dict.fromkeys(DEFAULT_SKIP_FOLDERS + (args.skip_folder or [])))
    skip_files = list(dict.fromkeys(DEFAULT_SKIP_FILES + (args.skip_file or [])))

    generate_structure_with_content(
        start_dir=start_dir,
        output_file=args.out,
        skip_folders=skip_folders,
        skip_prefixes=tuple(args.skip_prefix or ()),
        skip_suffixes=tuple(args.skip_suffix or ()),
        skip_files=skip_files,
        use_gitignore=not args.no_gitignore,
        include_exts=DEFAULT_TEXT_EXTS,
        max_file_kb=int(args.max_file_kb),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())