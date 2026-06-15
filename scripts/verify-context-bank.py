#!/usr/bin/env python3
"""Validate summary_bank.json structure and referenced paths."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


GLOB_CHARS = set("*?[")


def has_glob(value: str) -> bool:
    return any(ch in value for ch in GLOB_CHARS)


def normalize_path(value: str) -> str:
    return value.replace("\\", "/").strip()


def literal_prefix(pattern: str) -> str:
    parts: list[str] = []
    for part in normalize_path(pattern).split("/"):
        if not part:
            continue
        if has_glob(part):
            break
        parts.append(part)
    return "/".join(parts)


def as_string_list(value: Any, field: str, group_name: str, errors: list[str]) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        errors.append(f"{group_name}.{field} must be a list")
        return []

    out: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            errors.append(f"{group_name}.{field}[{index}] must be a non-empty string")
            continue
        out.append(item)
    return out


def validate_bank(root: Path, bank_path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        data = json.loads(bank_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - command-line verifier should show the parse failure.
        return [f"Could not parse {bank_path}: {exc}"], warnings

    if not isinstance(data, dict):
        return ["summary bank root must be a JSON object"], warnings

    defaults = data.get("defaults")
    groups = data.get("groups")
    if not isinstance(defaults, dict):
        errors.append("defaults must be an object")
        defaults = {}
    if not isinstance(groups, dict):
        errors.append("groups must be an object")
        groups = {}

    default_groups = as_string_list(defaults.get("groups"), "groups", "defaults", errors)
    for group_name in default_groups:
        if group_name not in groups:
            errors.append(f"defaults.groups references missing group: {group_name}")

    for group_name, group in sorted(groups.items()):
        if not isinstance(group, dict):
            errors.append(f"{group_name} must be an object")
            continue

        paths = as_string_list(group.get("paths"), "paths", group_name, errors)
        files = as_string_list(group.get("files"), "files", group_name, errors)
        if files:
            warnings.append(f"{group_name}.files is legacy; prefer paths")

        for field, entries in (("paths", paths), ("files", files)):
            for entry in entries:
                value = normalize_path(entry)
                if "://" in value:
                    warnings.append(f"{group_name}.{field} contains URL-like value, skipped: {entry}")
                    continue
                if value.startswith("/"):
                    errors.append(f"{group_name}.{field} must be repo-relative, not absolute: {entry}")
                    continue

                if has_glob(value):
                    matches = list(root.glob(value))
                    if not matches:
                        prefix = literal_prefix(value)
                        if prefix and not (root / prefix).exists():
                            errors.append(
                                f"{group_name}.{field} glob prefix missing: {entry} (prefix {prefix})"
                            )
                        else:
                            warnings.append(f"{group_name}.{field} glob matched no files: {entry}")
                    continue

                if not (root / value).exists():
                    errors.append(f"{group_name}.{field} missing path: {entry}")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate summary_bank.json path references.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--bank", default="summary_bank.json", help="Path to summary_bank.json.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    bank_path = Path(args.bank)
    if not bank_path.is_absolute():
        bank_path = root / bank_path

    errors, warnings = validate_bank(root, bank_path)
    for warning in warnings:
        print(f"[context-bank warning] {warning}")
    for error in errors:
        print(f"[context-bank error] {error}", file=sys.stderr)

    if errors:
        return 1
    print(f"summary_bank.json OK ({len(warnings)} warnings)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
