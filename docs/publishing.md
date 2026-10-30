# What's published, and how it stays safe

This repo is public; the lab it describes isn't, for obvious reasons. Code is ported from private repos, so the line is explicit. The step-by-step procedure for update entries and package syncs, for people and agents alike, is in [AGENTS.md](../AGENTS.md).

## In

- Self-contained components with their tests: the serving gates, the security-suite core (blackboard, screening, redaction, guard, executor), the hazard-source library, the UI core, the model renderer.
- Write-ups of everything else, by role (hub, agent box, workstation), never by host.
- Model choices, assignments and settings; prompt *history* (what changed and why).

## Out

| Not published | Why |
|---|---|
| Host names, addresses, network layout, firewall rules, VPN config, provisioning, deploy scripts and units | a map of the lab |
| Keys, tokens, signing keys, credentials of any kind | obvious |
| The deployed role prompts and eval corpora | they describe what the detectors look for; publishing them helps someone write around them |
| The harness (Kao) source | product code; described in [harness.md](harness.md) instead |
| Real protected-node registries | which machines can never be blocked is exactly what an attacker wants |

Test fixtures use documentation ranges (`203.0.113.x`, `198.51.100.x`) or made-up private ranges, listed in `tools/leakcheck.allow` with a reason.

## Enforced

`tools/leakcheck.py` runs in CI on every push and fails on:

- specific private, CGNAT or mesh host addresses (network constants like `10.0.0.0/8` are fine);
- lab host, account and network names. They're stored as SHA-256 hashes, so the check itself doesn't publish them.
- personal paths;
- key and token shapes: keygate/vLLM keys, private-key blocks, WireGuard keys, GitHub/cloud tokens.

`tools/new_update.py` drafts update entries from PRs and commits. It drops PR URLs, trailers and commit hashes, and refuses to write a draft that leakcheck flags. Entries are then rewritten by hand.

## Checklist before pushing

1. `python tools/leakcheck.py` is clean.
2. New fixtures use documentation or made-up ranges.
3. Describe roles, not machines: "the hub", not its name.
4. Nothing copied from a private repo without reading it first. Comments carry the most surprises.
