---
title: Kao on vLLM, through the Rust gate
date: 2026-10-30
area: harness
---

# Kao on vLLM, through the Rust gate

Kao's manager roles now run on the workstation's vLLM, and every prompt crosses the mesh through scout-sec-gate. The split between machines is also settled: Kao's agents live on the agent box, its console on the workstation, and heavy inference on the workstation. The security suite stays entirely on the hub and agent box.

## What changed

- **The Rust gate went live** in front of vLLM. Keygate stays in front of the Ollama engines, which the gate's OpenAI-only surface doesn't cover.
- **The path:** Kao on the agent box → a loopback sidecar that adds the key → the gate on the mesh → vLLM on loopback. Kao's signed catalog admitted the vLLM model and resolved both manager roles to it.
- **The console gets its own key.** It has its own gate client under the `strict` policy, so it can be revoked without touching the agents.
- **Consoles ship separately.** The Security Console stays its own app, talking to the hub's signed operator API.

## What the live test caught

- **Raw reasoning in answers.** Through the gate, Kao's manager returned its whole `<think>` block as the answer, and a low token limit could have left no answer at all. Starting vLLM with `--reasoning-parser qwen3` puts reasoning in its own field; a test question went from raw reasoning to a clean 168-character answer.
- **The gate would have exited at boot.** It quit if its mesh address wasn't up yet, the same failure keygate had after a cold restart. It now waits, and validates its bind address up front so waiting can't hide a typo.

## What was verified

From the agent box: 401 without a key, 200 for model listing and chat, and 404 for an override phrase and for a model off Kao's list. Through Kao's own tool, a manager chat returned the answer, and an override phrase was refused with `rule=override_phrases` in the gate log and no prompt text. LAN addresses are refused on both ports.

## What it means

Kao's manager roles now depend on the workstation being in vLLM mode, and fail closed otherwise, because each Kao role has one engine. Cross-engine fallback is the next harness change.
