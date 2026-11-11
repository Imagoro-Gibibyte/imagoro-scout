---
name: vault-memory
description: Use the Obsidian vault as agentic memory. Before answering project, worktree, or planning questions, search the vault for relevant notes; prefer vault summaries and status notes over raw repo files; sort and filter by project, date range, and status. Use at the start of repo/worktree tasks and when asked about plans, status, history, or next steps.
---

# Vault Memory

## Purpose
The Obsidian vault (`<VAULT>`) is the human-readable memory layer for this workspace. Use it to recover context, decisions, and status before acting on a repo or worktree.

## When to use
- At the start of any task involving a repo, worktree, branch, or project.
- When asked about plans, status, history, or "what's been done".
- Before proposing changes, to align with documented decisions and rules.
- When a worktree or branch name is mentioned.

## How to query the vault
- Use `brain.search_notes` with the project name, repo name, branch name, or worktree directory name.
- Use `brain.list_notes` under `Project Plans/<Project>` to find plan/status notes.
- Read the newest status note first (date is in the folder/note name).
- Use `brain.read_note` for full content when a note is relevant.
- Check `Project Plans/_Worktrees/Registry.md` for repo/worktree mapping.
- Check `Project Plans/_Worktrees/Prompts.md` for suggested next steps.
- If the `brain.*` tools are not available, read the vault as plain Markdown files: grep/search under `<VAULT>` and read the matching `.md` files directly.

## Sorting and filtering guidance
- Prefer notes under `Project Plans/<Project>/<date range>/`.
- Status notes (`*- status.md`) are the source of truth for current state.
- `AGENTS.md` / `RULES.md` copies are contracts, not status.
- `Imported Local Docs/` contains repo-level docs not otherwise in the vault.
- Worktree directory names and branch names are searchable keys.
- If multiple notes match, prefer the most recent date and the one whose title matches the repo/project exactly.

## Output expectations
- Cite vault note paths in answers when relying on them.
- If no vault note exists for the topic, say so explicitly and suggest importing the relevant local doc.
- Do not paste large raw repo files when a vault summary exists.

## Czkawka (duplicate / audit) sub-skill

The vault MCP server also exposes a precached czkawka cache, so agents can audit
drives/directories and clean up duplicates without running a full czkawka search
on every turn.

### How it works
- Scans run once per *scope* (mode + roots + exclusions) and are stored as scoped
  JSON files under `Project Plans/Czkawka/` (`cache.<slug>.json`), indexed by
  `index.json`. Scopes are precached until the same scope is rescanned or the
  14-day prune limit expires.
- Reads (`czkawka_duplicates`, `czkawka_big_files`, `czkawka_empty_dirs`) hit the
  cache only; they never trigger a scan. Full dumps are discouraged — query with
  filters and limits.
- Writes (`czkawka_scan`) are gated by `CZKAWKA_ALLOW_SCAN=1` in the server env
  and regenerate (replace) the cache for that scope atomically.

### Tools
- `czkawka_cache_status` — binary availability, cache dir, scope counts.
- `czkawka_scopes` — list cached scopes.
- `czkawka_scan` — run a scoped scan (dup / big / empty-folders / empty-files / temp).
- `czkawka_duplicates` / `czkawka_big_files` / `czkawka_empty_dirs` — read slices.
- `czkawka_prune` — delete stale scoped caches (age + count caps).
- `czkawka_quarantine` — move a file into the scope's quarantine folder (never
  deletes; dry-run by default).

### Workflow
1. Check `czkawka_scopes`; if the scope you need is cached and fresh, query it.
2. Otherwise (and only if allowed) `czkawka_scan` with the exact roots/excludes.
3. Review duplicates/big files; `czkawka_quarantine` (dry-run first) to stage
   removals. Permanent deletion is intentionally NOT available in the vault
   variant — use the standalone `czkawka-cli` skill for purging.
4. `czkawka_prune` periodically to drop stale caches.

### Safety
- The vault is context, not source of truth for code. Always verify against the actual repo/worktree before editing.
- Do not write secrets or credentials into vault notes.
- Quarantine, never delete, from inside the vault variant. Purging requires the
  standalone skill with an explicit confirm token.
