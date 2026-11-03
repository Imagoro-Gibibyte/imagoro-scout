---
name: devlog-local
description: Log a change to a local devlog file instead of posting to a site. Use for private/offline work, drafts, or when no posting endpoint exists. Appends a dated entry to a local Markdown file.
---

# Devlog Local

## When to use

- You want to keep a private running log of changes without publishing.
- You're drafting an entry before posting it publicly.
- There's no posting endpoint (offline, local-only project).
- You want a per-repo or per-vault changelog.

## What to log

Fields:
- `project` (optional): a label for the area (e.g. `imagoro`, `lab`).
- `title`: short outcome.
- `body`: what changed and why.

The entry date is set locally to today.

## Log file

Default: `./DEVLOG.md` in the current directory. Override with `--file`. The file is created if missing, with a header.

## Usage

```sh
python devlog_log.py --title "Watchdog for the inference engine" --body "A small watchdog now checks the engine." --project lab
```

Or with a custom file:

```sh
python devlog_log.py --file docs/CHANGELOG.md --title "..." --body "..."
```

## Format

Entries are appended as:

```md
## 2026-11-03 — Watchdog for the inference engine
_project: lab_

A small watchdog now checks the engine.
```

## Promoting to the public devlog

When you're ready to publish, copy the entry into `devlog-update` and submit via `devlog_post.py`. Keep private details out of the public version (see devlog-update's public-mirror rules).
