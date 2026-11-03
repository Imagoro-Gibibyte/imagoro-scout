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

## Backing store

This skill is backed by a separate MCP server named `devlog` that writes to `D:/devlog` (a local folder on the D drive). Use the `devlog.*` MCP tools (`write_note`, `append_note`, `read_note`, `list_notes`, `search_notes`) just like the `brain.*` vault tools, but paths are relative to `D:/devlog`. The CLI helper `devlog_log.py` is the offline fallback when the MCP server isn't available.

## Log file

Default: `./DEVLOG.md` in the current directory (CLI fallback). Override with `--file`. The file is created if missing, with a header. When the MCP server is available, prefer writing notes under `D:/devlog` via the `devlog.*` tools.

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

When you're ready to publish, use the `devlog-update` skill to submit the entry via `devlog_post.py` (or the `devlog-protocol` client). Read the local note from `D:/devlog` with the `devlog.*` MCP tools, rewrite it in the public house style, run leakcheck, and submit. Keep private details out of the public version (see devlog-update's public-mirror rules).

Workflow:
1. Read the local entry: `devlog.read_note(path)`.
2. Draft a public version (title, body, project) following devlog-update's rules.
3. Run `python tools/leakcheck.py` on the draft.
4. Submit: `python devlog_post.py --project ... --title ... --body ...`.
