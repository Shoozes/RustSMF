# SKILLS.md — summary_bank.json (Context Keeper)

## Purpose

summary_bank.json is a maintained context keeper that allows agents and developers to quickly zoom into relevant parts of a codebase. It groups related files and folders for features, subsystems, investigations, and issues.

The goal is focused context, not full coverage.

## Core Concepts

Groups  
Named sets of related files and glob patterns that represent a coherent context boundary.

Defaults  
Global settings such as default groups, output size limits, and directories to skip.

Exclusions  
Directories collapsed in tree views for readability. These do not affect file inclusion in groups.

## Expected JSON Shape

```json
{
  "defaults": {
    "groups": ["core", "issue__startup_crash"],
    "group": null,
    "tree": true,
    "max_kb": 200,
    "skip_dirs": ["node_modules", "dist", ".git"]
  },
  "groups": {
    "core": {
      "paths": ["src/main.py", "src/engine/**/*.py"],
      "files": ["src/main.py", "src/engine/runtime.py"]
    },
    "issue__startup_crash": {
      "paths": ["src/app/**", "src/config/*.json"]
    }
  },
  "exclusions": {
    "docs": { "note": "[Collapsed Dir (+)]" },
    "tests": { "note": "[Collapsed Dir (+)]" }
  }
}
```

Rules:

* Paths are relative to repo root.
* Prefer "paths" over "files".
* Glob patterns are supported, including recursive "**".
* Additional metadata fields are allowed and ignored safely.

## Naming Conventions

Use clear prefixes:

feature__name
subsystem__name
issue__name
investigation__name
spike__name

Names should remain stable over time.

## Issue Group Structure

Issue groups should contain actionable diagnostic context.

Example:

```json
{
  "groups": {
    "issue__startup_crash": {
      "status": "regressing",
      "last_seen": "2026-02-18",
      "known_behavior": "Crash during startup when config JSON is invalid.",
      "repro_steps": [
        "Delete runtime-data",
        "Launch with malformed config"
      ],
      "hypotheses": [
        "JSON parsing exception not handled",
        "Fallback config missing"
      ],
      "paths": [
        "src/app/startup/**",
        "src/config/**",
        "scripts/launch/**"
      ]
    }
  }
}
```

## Glob Usage Guidelines

* Use narrow patterns when possible.
* Avoid excessive recursive patterns.
* Prefer targeted directories over entire source trees.

## Ignore Behavior

Keep skip directories aligned with actual generated or dependency folders. Avoid including ignored paths unless explicitly required.

## Exclusions Usage

Use exclusions only to collapse noisy directories in tree views. Do not treat them as security or filtering mechanisms.

## Maintenance Workflow

1. Identify the specific context needed.
2. Create or update a group with only relevant files.
3. Add brief status or description metadata when useful.
4. Periodically prune stale entries.
5. Keep default groups minimal.

## Common Failure Modes

* Overly broad groups.
* Excessive recursive globs.
* Missing issue metadata.
* Bloated default group lists.

Maintaining a clean summary_bank.json ensures fast, accurate context retrieval during development and debugging.