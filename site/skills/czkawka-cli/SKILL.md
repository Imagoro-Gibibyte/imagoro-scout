---
name: czkawka-cli
description: Audit drives and directories with czkawka, using precached scoped JSON instead of full searches. Generate and cache a fresh JSON per scope, pull data slices, then make safe, structured drive transfers (quarantine-first, dry-run by default). Use for duplicate cleanup, big-file audits, empty-folder sweeps, and repository/directory audits.
---

# Czkawka CLI

Precached, scoped audits with czkawka. A full system scan is expensive and floods
context, so this skill never holds one giant JSON. Each scan is scoped (mode +
roots + exclusions) and cached as its own JSON file; agents read slices.

## When to use
- Find duplicate files, big files, empty folders/files, temporary files.
- Audit a repository or directory tree before a cleanup or migration.
- Stage safe, structured transfers (move duplicates to quarantine, verify, then purge).

## Do not use for
- Similar images/videos/music (deferred; use czkawka directly if needed).

## Backends (consolidated mode)
- If an Obsidian/vault MCP server is available (`OBSIDIAN_VAULT` configured), this
  skill delegates cache reads/writes to it (one MCP process, one cache store).
- Otherwise it uses a local store under `~/.czkawka-agent/`.

## Scoped caches
- One JSON per scope: `cache.<slug>.json`, where `slug` = mode + short hash of
  (roots, excludes). A small `index.json` lists active scopes.
- Precached until the same scope is rescanned or the 14-day prune limit expires.
- Query tools return slices/summaries, never the full JSON.
- Generation is always delegated to the server (`czkawka_scan`); client-side
  generation is intentionally not provided.

## Workflow
1. `czkawka_scopes` / `czkawka_cache_status` — see what is cached and fresh.
2. If the needed scope is cached and fresh, query it (`czkawka_duplicates`,
   `czkawka_big_files`, `czkawka_empty_dirs`) with filters + limits.
3. Otherwise run `czkawka_scan(mode, roots, excludes)` (requires
   `CZKAWKA_ALLOW_SCAN=1`).
4. Review findings. Stage removals with `czkawka_quarantine` (dry-run first).
5. Permanent deletion only via the helper CLI with `--purge --confirm <token>`,
   after hash verification.
6. `czkawka_prune` to drop stale caches.

## Safety contract (must hold)
- Dry-run by default; `--apply` required to move anything.
- Quarantine, never delete, on the first pass. Manifest records original path,
  destination, hash, timestamp.
- Hash-verify before and after every move; abort on mismatch.
- Refuse roots under protected/system paths unless explicitly allowlisted.
- Purge requires an explicit confirm token and re-hashes quarantined items.
- Never run a full-disk scan unless the operator explicitly asks; prefer scoped
  roots.

## Environment
- `CZKAWKA_CLI` — path to czkawka_cli (default `czkawka_cli`).
- `CZKAWKA_CACHE_DIR` — cache directory (default `~/.czkawka-agent`).
- `CZKAWKA_ALLOW_SCAN` — set to `1` to enable scanning (default off).
- `CZKAWKA_ROOTS` — comma-separated default roots for auto-cache (optional).
- `CZKAWKA_STORE` — `json` (default) or `sqlite` (dell-hosted external db).
- `CZKAWKA_AUTO_CACHE` — set to `1` to enable background full-directory scans.

## Setup
1. Install czkawka_cli (see https://github.com/qarmin/czkawka/releases) and
   ensure it is on PATH, or set `CZKAWKA_CLI`.
2. Install Python 3.10+ and `pip install "mcp<2"`.
3. Run the MCP server: `python czkawka_mcp_server.py` with the env vars above.
4. Point your MCP client at it (stdio).

See README.md for details.