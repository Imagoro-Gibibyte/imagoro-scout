---
title: The gate learns to tell evidence from attacks
date: 2026-10-28
area: serving
---

# The gate learns to tell evidence from attacks

[scout-sec-gate](../packages/gate) went from a scaffold to a working proxy:
- client keys;
- per-client model allowlists;
- content rules;
- streaming to the engine with the engine's own key.

Its rules now understand who's asking and which part of the request they're reading.

## What was wrong

- **Rule loading failed open.** A missing or unparseable rules file meant no screening at all. Now any problem with the rules or config refuses to start, and `--check` validates both.
- **v1 scanned the raw JSON body.** So it matched JSON keys and the operator's own system prompt. Worse, it denied `; curl`, `.php` and `/etc/passwd`, which are exactly what the security crew is supposed to analyse. In front of the suite's models, the gate would have blocked the suite.

## v2

- Rules match the parsed text of `user`, `tool` and replayed `assistant` turns, plus tool-call arguments. They never touch `system`, which the client wrote.
- Each client has a policy:
  - `strict` clients get structural and natural-language rules ("ignore previous instructions", "you are now…").
  - `evidence` clients, the security crew, get structural rules only. Hostile evidence reaches the model, and markers like "mark this BENIGN" are logged.
- Chat-template control tokens are refused for everyone, because they can forge turns.
- Image parts, token-id prompts and unknown roles fail closed, because rules can't inspect them.
- Every refusal is the same 404. The tests caught a gap here: a wrong method on a real route returned the framework's 405, which leaked the route table.

18 tests cover config validation, rules loading, extraction, per-policy screening, and end-to-end behaviour against a fake streaming engine.
