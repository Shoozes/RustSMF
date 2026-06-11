#!/usr/bin/env python3
# PROJECT GENA
# File: _gen_bank.py
# Purpose: summary_bank.json generator/maintainer.

from __future__ import annotations

import os
import json
import argparse
import fnmatch
import copy
from pathlib import Path
from typing import Dict, List, Optional, Tuple


DEFAULT_SCHEMA = {
    "defaults": {
        "groups": [],
        "tree": True,
        "max_kb": 200,
        "skip_dirs": [
            "node_modules",
            "venv",
            ".venv",
            "__pycache__",
            "runtime-data",
            "dist",
            "build",
            "release",
            "models",
            "public",
            "tests",
            "test",
            "docs",
            ".git",
            ".agents",
            "target",
            ".secrets",
            ".vscode",
            ".idea",
        ],
    },
    "groups": {},
    "exclusions": {},
}

DEFAULT_SKIP_FILES = [
    "package-lock.json",
    "Cargo.lock",
    "yarn.lock",
    "pnpm-lock.yaml",
    "setup_log.txt",
    "debug_log.txt",
    "_struct_summary.txt",
    "_structure_with_content.txt",
]


def _unique(seq: List[str]) -> List[str]:
    return list(dict.fromkeys([s for s in seq if s]))


def find_repo_root(start: Path) -> Optional[Path]:
    p = start.resolve()
    for cur in [p] + list(p.parents):
        if (cur / ".git").exists():
            return cur
    return None


def load_gitignore(root_dir: str) -> List[str]:
    gitignore_path = os.path.join(root_dir, ".gitignore")
    if os.path.exists(gitignore_path):
        with open(gitignore_path, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip() and not line.startswith("#")]
    return []


def _has_glob_meta(pat: str) -> bool:
    return any(ch in pat for ch in ("*", "?", "["))


def infer_skip_dirnames_from_gitignore(patterns: List[str]) -> List[str]:
    """
    Best-effort inference of directory names from .gitignore patterns so we can prune os.walk early.

    We intentionally keep this conservative:
    - ignore negations (!)
    - treat trailing "/" or "/**" as directory patterns
    - treat simple non-glob patterns (no slashes) as potential directory names
    """
    out: List[str] = []

    for raw in patterns:
        s = (raw or "").strip()
        if not s or s.startswith("#") or s.startswith("!"):
            continue

        anchored = s.startswith("/")
        if anchored:
            s = s[1:]

        # Normalize common "dir/**" case to "dir"
        if s.endswith("/**"):
            s = s[:-3]

        is_dir_pattern = s.endswith("/")
        if is_dir_pattern:
            s = s.rstrip("/")

        if not s:
            continue

        # If pattern has path separators, we can't convert it safely into a single dir name.
        # For our repo tools use-case, the common ignores are top-level (e.g. ".tools/", ".agents/").
        if "/" in s or "\\" in s:
            continue

        # If it has globs, it's not a stable directory name.
        if _has_glob_meta(s):
            continue

        # If it explicitly looked like a directory pattern, keep it.
        # If it's a simple token, keep it as a potential directory name (harmless if no dir matches).
        if is_dir_pattern or (not is_dir_pattern):
            out.append(s)

    return _unique(out)


def is_ignored(rel_path: str, patterns: List[str]) -> bool:
    rel_path = rel_path.replace(os.sep, "/")
    for pattern in patterns:
        anchored = pattern.startswith("/")
        if anchored:
            pattern = pattern[1:]
        if pattern.endswith("/"):
            pattern = pattern[:-1] + "/*"
        if anchored:
            if fnmatch.fnmatch(rel_path, pattern):
                return True
        else:
            parts = rel_path.split("/")
            for i in range(len(parts) + 1):
                subpath = "/".join(parts[:i]) + ("/" if i > 0 else "") + pattern
                if fnmatch.fnmatch(rel_path, subpath):
                    return True
    return False


def collect_all_files(
    root_dir: str,
    skip_dirs: List[str],
    skip_prefixes: Tuple[str, ...],
    skip_suffixes: Tuple[str, ...],
    skip_files: List[str],
    git_patterns: List[str],
) -> Dict[str, object]:
    all_files: Dict[str, List[str]] = {}
    all_dirs: set[str] = set()

    for root, dirs, files in os.walk(root_dir):
        rel_root = os.path.relpath(root, root_dir).replace(os.sep, "/")
        rel_root = "" if rel_root == "." else rel_root

        for d in list(dirs):
            if d.startswith(skip_prefixes):
                dirs.remove(d)
                continue

            rel_d = (rel_root + "/" + d).strip("/") if rel_root else d
            if d in skip_dirs or is_ignored(rel_d, git_patterns):
                dirs.remove(d)
            else:
                all_dirs.add(rel_d)

        for file in files:
            if file in skip_files:
                continue
            if file.startswith(skip_prefixes) or file.endswith(skip_suffixes):
                continue

            rel_path = (rel_root + "/" + file).strip("/") if rel_root else file
            if is_ignored(rel_path, git_patterns):
                continue

            dir_key = rel_root
            all_files.setdefault(dir_key, []).append(file)

    return {"files": all_files, "dirs": all_dirs}


def update_groups(groups: Dict, all_files: Dict[str, object], root_dir: str, auto_add: bool = False) -> None:
    files_map: Dict[str, List[str]] = all_files["files"]  # type: ignore

    for group_name, group in groups.items():
        new_files: List[str] = []

        for old_path in group.get("files", []):
            full_old = os.path.join(root_dir, old_path)
            if os.path.exists(full_old):
                new_files.append(old_path)
                continue

            file_name = os.path.basename(old_path)
            found = False
            for dir_path, files in files_map.items():
                if file_name in files:
                    new_path = (dir_path + "/" + file_name).strip("/")
                    new_files.append(new_path)
                    found = True
                    print(f"Fixed moved file in {group_name}: {old_path} -> {new_path}")
                    break
            if not found:
                print(f"Removed missing file from {group_name}: {old_path}")

        if auto_add:
            relevant_exts = (
                ".txt",
                ".css",
                ".js",
                ".ts",
                ".html",
                ".py",
                ".pyw",
                ".jsx",
                ".ps1",
                ".bat",
                ".json",
                ".tsx",
                ".rs",
                ".glsl",
                ".md",
                ".mjs",
            )
            for dir_path, files in files_map.items():
                if group_name.lower() in dir_path.lower() or any(
                    kw in dir_path for kw in ["server", "backend", "src", "scripts", "config", ".tools"]
                ):
                    for file in files:
                        if file.endswith(relevant_exts):
                            new_path = (dir_path + "/" + file).strip("/")
                            if new_path not in new_files:
                                new_files.append(new_path)
                                print(f"Auto-added to {group_name}: {new_path}")

        group["files"] = sorted(set(new_files))


def update_exclusions(exclusions: Dict, all_dirs: set) -> None:
    for dir_path in sorted(all_dirs):
        if dir_path not in exclusions:
            exclusions[dir_path] = {"note": "[collapsed (+)]"}
            print(f"Added exclusion for new dir: {dir_path}")

    for ex_dir in list(exclusions):
        if ex_dir not in all_dirs:
            del exclusions[ex_dir]
            print(f"Removed unused exclusion: {ex_dir}")


def _load_or_init_bank(bank_path: str) -> Dict:
    if os.path.exists(bank_path):
        with open(bank_path, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    print(f"Initialized new {bank_path} with default schema.")
    return copy.deepcopy(DEFAULT_SCHEMA)


def maintain_summary_bank(
    root_dir: str,
    bank_path: str,
    use_gitignore: bool = True,
    skip_dirs: Optional[List[str]] = None,
    skip_prefixes: Tuple[str, ...] = ("__",),
    skip_suffixes: Tuple[str, ...] = (),
    skip_files: Optional[List[str]] = None,
    auto_add: bool = False,
) -> None:
    if skip_dirs is None:
        skip_dirs = []
    if skip_files is None:
        skip_files = list(DEFAULT_SKIP_FILES)

    enforced_skip_dirs = [".secrets"]

    # Load existing bank first so scan uses existing defaults (fixes the ".agents/.tools exclusions explosion").
    data = _load_or_init_bank(bank_path)
    data.setdefault("defaults", {})
    data.setdefault("groups", {})
    data.setdefault("exclusions", {})

    existing_defaults = data.get("defaults", {}) or {}
    existing_skip = list(existing_defaults.get("skip_dirs", []) or [])
    base_skip = list((DEFAULT_SCHEMA.get("defaults", {}) or {}).get("skip_dirs", []) or [])

    git_patterns = load_gitignore(root_dir) if use_gitignore else []
    inferred_skip = infer_skip_dirnames_from_gitignore(git_patterns) if use_gitignore else []

    scan_skip_dirs = _unique(base_skip + existing_skip + skip_dirs + enforced_skip_dirs + inferred_skip)

    all_files = collect_all_files(
        root_dir=root_dir,
        skip_dirs=scan_skip_dirs,
        skip_prefixes=skip_prefixes,
        skip_suffixes=skip_suffixes,
        skip_files=skip_files,
        git_patterns=git_patterns,
    )

    # Persist merged defaults
    data["defaults"] = data.get("defaults", {}) or {}
    data["defaults"]["skip_dirs"] = sorted(set(scan_skip_dirs))

    update_groups(data["groups"], all_files, root_dir, auto_add)
    update_exclusions(data["exclusions"], all_files["dirs"])  # type: ignore

    with open(bank_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Updated {bank_path}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Maintain summary_bank.json: update file lists, fix moved, add dirs/exclusions."
    )
    parser.add_argument("--root", default=".", help="Project root directory.")
    parser.add_argument("--bank", default="summary_bank.json", help="Path to summary_bank.json.")
    parser.add_argument(
        "--no-gitignore",
        action="store_false",
        dest="use_gitignore",
        default=True,
        help="Ignore .gitignore.",
    )
    parser.add_argument("--skip-dirs", nargs="*", default=None, help="Additional skip_dirs to add to defaults.")
    parser.add_argument("--auto-add", action="store_true", help="Auto-add new relevant files to groups.")
    args = parser.parse_args(argv)

    if args.root and args.root != ".":
        root_path = Path(args.root).expanduser().resolve()
    else:
        root_path = find_repo_root(Path.cwd()) or find_repo_root(Path(__file__).resolve().parent) or Path.cwd().resolve()

    bank_path = Path(args.bank)
    if not bank_path.is_absolute():
        bank_path = root_path / bank_path

    maintain_summary_bank(
        root_dir=str(root_path),
        bank_path=str(bank_path),
        use_gitignore=bool(args.use_gitignore),
        skip_dirs=args.skip_dirs,
        auto_add=bool(args.auto_add),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
