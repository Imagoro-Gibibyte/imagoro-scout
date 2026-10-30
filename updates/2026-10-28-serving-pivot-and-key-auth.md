---
title: Heavy models off the small box; keys instead of IP lists
date: 2026-10-28
area: serving
---

# Heavy models off the small box; keys instead of IP lists

Manager-class models move to the workstation's 16 GB card. The 8 GB agent box keeps the runtimes and the no-think specialists, and every engine now sits on loopback behind a gate that checks a per-client key.

## What changed

- **The pivot.** The agent box's small context windows were a poor fit for managers, and one harness simply refused anything under 64k. The heavy tier becomes the workstation; fallbacks end on the agent box's 8B models.
- **[keygate](../packages/keygate).** Ollama has no authentication, so a small stdlib gate puts it on loopback and exposes a fixed surface on the mesh address:
  - per-client keys, stored hashed;
  - a model allowlist per key;
  - inference and filtered listings only; model management is unreachable;
  - 401 for a bad key, a uniform 404 for anything else refused.

  It runs in front of the workstation and agent-box engines. A loopback `forward` mode lets a harness that holds one key reach a keyed engine.
- **Firewall rules stop listing IPs.** The old rule allowed the mesh plus a few addresses from a network the lab no longer used. It's now one rule scoped to the VPN interface and the gate's program. Mesh addresses are bound to WireGuard keys, so they don't move when the router reassigns DHCP leases.

## What turned up

- The workstation's local 14B models were **abliterated** variants, one of them not even Qwen lineage. They're fine for local experiments, but a mesh client could have requested them. The gate's per-key model lists close that; the mesh gets stock weights only.
- File sharing was listening on the mesh address. It's now blocked there.
