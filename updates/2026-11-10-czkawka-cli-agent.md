---
title: A czkawka CLI skill and a 2.0 vault-memory backend
date: 2026-11-10
area: repo
---

# A czkawka CLI skill and a 2.0 vault-memory backend

The vault-memory plugin moves to 2.0 and gains a precached czkawka audit cache,
and a new standalone czkawka-cli skill bundle ships alongside it.

## What changed

- Vault-memory 2.0: the MCP server now carries czkawka scoped-cache tools on top
  of the existing vault tools, so one MCP process serves both memory and file
  audits. Scans run once per scope (mode + roots + exclusions) and are cached as
  scoped JSON files under `Project Plans/Czkawka/`, indexed by `index.json`.
  Reads hit the cache only; scans are opt-in via an env flag and regenerate a
  scope atomically. Stale caches are pruned by age and count. Files are
  quarantined, never deleted, from inside the vault variant.
- New `czkawka-cli` skill bundle: a helper CLI and a standalone MCP server for
  scoped, precached audits (duplicates, big files, empty folders) with a
  quarantine-first, dry-run-by-default transfer workflow and a gated purge. It can
  delegate to a vault-memory 2.0 server in consolidated mode.
- The vault-memory skill bundle is rebuilt (main.js) and republished at 2.0.0;
  the catalog gains the czkawka-cli entry.

## Why

A full system scan is large enough to flood an agent's context on every turn,
and rerunning czkawka per question is wasteful. Precaching per scope keeps
repeated queries cheap and keeps each audit readable, while the quarantine-first
contract keeps cleanup safe.

## What it means

Operators can audit and clean drives and repositories through the same MCP that
already holds vault memory, instead of wiring a separate server. The standalone
bundle remains available for machines without a vault. Permanent deletion stays
deliberately out of the vault variant.