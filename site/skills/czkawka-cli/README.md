# czkawka-cli

Scoped, precached audits with czkawka. Apache-2.0.

## What it is

A skill + helper CLI + standalone MCP server for running czkawka audits without
flooding an agent's context with one giant JSON. Each scan is scoped (mode +
roots + exclusions) and cached as its own JSON file; agents read slices.

## Contents
- `SKILL.md` — workflow, safety contract, env vars.
- `czkawka_cache.py` — stdlib helper: scan, scopes, prune, quarantine, purge.
- `czkawka_mcp_server.py` — standalone MCP server (stdio).
- `czkawka-cache.example.json` / `index.example.json` — schema examples.
- `LICENSE` — Apache-2.0.

## Requirements
- czkawka_cli on PATH (or `CZKAWKA_CLI`), v12+.
- Python 3.10+ with `pip install "mcp<2"`.

## Setup
1. Install czkawka_cli: https://github.com/qarmin/czkawka/releases
2. `pip install "mcp<2"`
3. Run the server: `python czkawka_mcp_server.py` (stdio).
4. Configure your MCP client with the env vars in SKILL.md.

## Consolidated mode
If `OBSIDIAN_VAULT` points at a vault whose MCP server is running (vault-memory
2.0+), this skill delegates cache reads/writes to that server instead of running
its own, so a single MCP process serves both memory and czkawka.

## Scanning
Scanning is disabled by default. Set `CZKAWKA_ALLOW_SCAN=1` to enable. Reads
from existing caches always work.

## Safety
Quarantine, never delete, on the first pass. Permanent deletion requires
`--purge --confirm PURGE --apply` and re-hashes quarantined items. System/protected
roots are refused unless allowlisted.