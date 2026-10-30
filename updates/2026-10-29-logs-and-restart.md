---
title: Logs into the notebook, and surviving a cold restart
date: 2026-10-29
area: security
---

# Logs into the notebook, and surviving a cold restart

The security suite's records now show up as readable notes, and the whole lab came back on its own from a full power-down.

## Logs into the notebook

Every 15 minutes, the hub renders its blackboard into Markdown:
- a daily index;
- analysis cycles with their decisions and findings;
- collector counts;
- evals;
- proposals;
- the audit trail.

It commits to a LAN-only git repo that the operator's notes vault pulls. Telemetry gained its own category (cycle and eval summaries, no case text) with 365-day retention.

Because event text comes from logs, an attacker can influence it. Titles and cells are escaped, and bodies go in code fences longer than any backtick run in the content, so a log line can't plant a link, an embed or a plugin block in the notes. The exporter runs with no network access at all.

## Cold restart

All three machines were powered off and back on. Everything recovered without help except one thing:
- every boot-time task succeeded: tokens re-minted, collectors posted, the first analysis cycle passed in 59 s;
- the hardening persisted: loopback binds, gates, the harness sidecar and the signed catalog.

The workstation's gate started before its VPN address existed, waited five minutes, and gave up. It now waits indefinitely: a gate waiting for its address exposes nothing, and giving up meant the mesh entry stayed closed until someone noticed. The serving check (PASS/FAIL per property) came back all-pass afterwards.
