---
title: "Where things stood: the foundations"
date: 2026-10-16
area: repo
---

# Where things stood: the foundations

A snapshot of what existed before this log started, so the later entries have context.

## UI

imagoro-ui reached milestone M6:
- a block spec and design tokens;
- a core with a registry, an event bus and fixtures;
- a React renderer with 12 block families;
- a node canvas with an immutable DAG and layered layout;
- the Command Center shell on Tauri v2;
- the ACL role matrix shared with the server;
- Flatpak and Android packaging.

Then came the Harness Console, which reaches the harness through a server-side proxy so the browser never holds the token, and a Scout Harness desktop app.

## Harness

Kao was rewritten so every Scout capability is a native tool, with no subprocess or shell. Guardrails sit at every seam: UTF-8 validity, NFKC and confusable folding, control/bidi/zero-width stripping, and secret redaction. Models gained **signed provenance**: a role may only bind a model listed in an Ed25519-signed catalog with its lineage, license and digest, and the "first installed model" fallback that once ran a Llama-lineage model was removed by construction.

## Nav

The hazard pipeline gained signed, citable events from NWS, WZDx, 511 and TomTom. Clients went coordinate-free, using geohash cells instead of GPS, and coverage now follows coarse demand. Paths became host-independent, so the same code runs on any agent box.

## Process

A sweep of every repo landed about ten PRs that had been merged into dead stacked branches, closed fourteen superseded ones, and fixed a branch ruleset that had blocked every PR merge. The lesson for this log: entries describe what's on the default branch, not what's in flight.
