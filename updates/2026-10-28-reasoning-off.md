---
title: Reasoning off has to mean off
date: 2026-10-28
area: models
---

# Reasoning off has to mean off

About one security cycle in six was failing with "Invalid response from LLM call - None or empty". The cause was a switch that looked set but wasn't.

## What happened

- The specialist roles are meant to run without reasoning, and their Modelfiles end the system prompt with `/no_think`.
- The crew framework sends its own system message, which **replaces** the Modelfile's, so the switch never reached the model.
- Qwen3 reasoned on every specialist call. When the reasoning filled the 1,024-token budget, the visible answer was empty and the cycle failed.

The engine logs gave it away. The failing calls generated exactly 1,023 tokens on a 774-token prompt, with no truncation. A probe then confirmed it: the answer was empty and the hidden reasoning was 3,600 characters.

## The fix

The LLM factory now asks for no reasoning **per request** (`reasoning_effort: "none"`) for every role the model table marks non-thinking. Managers keep reasoning. The same probe returned a complete answer in 71 tokens, and a regression test pins the behaviour.

Result: the next forced cycle completed all eight tasks in 108 s, and every scheduled cycle since has passed, including the first one after a full power-down.

## The lesson

A model-level setting is only a default. If a framework owns the system prompt, anything that matters has to travel on the request. [models.md](../docs/models.md) now says so for both engines.
