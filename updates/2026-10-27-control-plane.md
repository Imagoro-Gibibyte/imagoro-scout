---
title: Control plane, guarded executor, evals, prompts 1.1 to 1.3
date: 2026-10-27
area: security
---

# Control plane, guarded executor, evals, prompts 1.1 to 1.3

The security suite can now act, but only through four independent locks, and it can prove its models are good enough before they're trusted.

## What changed

- **Operator console**, a Tauri desktop app. Every request is Ed25519-signed with a timestamp, a nonce (replay-checked) and a body hash. The private key lives in the OS credential store; the hub stores only public keys. The console shows status, proposals, the feed and the audit trail, and can pause the crew or collectors, arm the executor, or run a cycle now.
- **Proposals and the executor.** A countermeasure the manager proposes is evaluated by the protected-node guard, and a DENY is stored as refused. Execution needs all four locks:
  1. operator approval;
  2. the executor armed;
  3. the host in `enforce` mode;
  4. the host's own guard re-check.

  Blocks are timed entries in a dedicated nftables table, and disarming deletes the table.
- **Retention:** events 14 days, findings and decisions 180 days, closed proposals 30 days, audit 180 days; revocations are persisted.
- **Evals** score each model on held-out sets (detection, injection resistance, vet, enforcer) with an 80% gate per suite.
- **Prompts 1.1 to 1.3:**
  - 1.1: shared decision rubrics.
  - 1.2: an un-primed injection rule restated after the evidence, plus alert boundaries.
  - 1.3: vet judges the evidence rather than the label; the enforcer gets a decision table.

## Why

A security tool that can block traffic is itself an attack surface. The guard and the human approval mean a manipulated model can propose, at worst, never execute. The evals mean a prompt change has to show it didn't make the models worse before it ships.
