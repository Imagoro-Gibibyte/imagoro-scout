# Models

Every model in the Scout suites is **Qwen3** (Apache-2.0). Abliterated variants are refused by the harness catalog and by [`models/render.py`](../models/render.py). One lineage keeps a role's behaviour the same on whichever machine serves it, and keeps licensing simple. The strongest non-Qwen local options were evaluated and set aside: one on license, the others to avoid drift across peers.

## How roles are built

A Scout "model" is a **thin layer over shared weights**: a system prompt, a temperature, a context size, and reasoning on or off. All eight security roles share one 8B weights file, and the nav specialists share one 4B file, so an 8 GB card serves eight roles without reloading weights. Rebuilding a role after a prompt change takes seconds; tags carry the prompt version (`scout-sec-alert1.3.0`).

Assignments (source of truth: [`models/roles.toml`](../models/roles.toml)):

| Suite | Role | Built from | Temp | Reasoning | Tier |
|---|---|---|---|---|---|
| security | manager | hermes 8B layer | 0.1 | **on** | light, moving to heavy |
| security | error | dev layer | 0.2 | off | light |
| security | enforcer | core layer | 0.0 | off | light |
| security | alert, intel, vet, rank, sanitizer | `qwen3:8b` | 0.0 | off | light |
| nav | manager (hermes) | `qwen3:8b` | 0.1 | **on** | light |
| nav | dev | core layer | 0.2 | off | light |
| nav | core, vet, alert, intel, rank | `qwen3:4b-instruct-2507` | 0.0 | off | edge |
| harness | manager, hermes (`vllm` profile) | `Qwen/Qwen3-8B-AWQ` on vLLM | per request | per request | heavy |

Rules the renderer enforces: contract roles stay at temperature ≤ 0.2; one tag means one setting; no abliterated bases; every role needs a prompt.

## Reasoning: off means off

Qwen3 has a soft switch (`/no_think` in a turn) and a hard one (`enable_thinking`). The Modelfiles put `/no_think` in the system prompt. Agent frameworks replace the Modelfile's system prompt with their own, so the switch silently vanished, and the specialists reasoned on every call. When the reasoning filled `max_tokens`, the answer came back empty and the cycle failed.

The fix is to turn reasoning off **per request**: `reasoning_effort: "none"` on Ollama's OpenAI endpoint, or `chat_template_kwargs: {"enable_thinking": false}` on vLLM. Do this for every role marked non-thinking. Measured: 1,024 tokens of hidden reasoning with an empty answer became 71 tokens with a complete answer.

Where variance is wanted, it's shaped with `top_p` / `top_k`, never by raising temperature on contract roles.

## Prompt history (security roles)

| Version | Change |
|---|---|
| 1.0.0 | first deploy: one role prompt per contract |
| 1.1.0 | shared decision rubrics for alert / vet / enforcer in every path |
| 1.2.0 | un-primed injection rule plus a restatement after the evidence ("sandwich"), alert boundaries and examples, enforcer applies guard facts |
| 1.3.0 | vet judges the evidence, not the label (generic examples), enforcer decision table |

The deployed prompts and eval corpora aren't published. `models/prompts.example/` holds stand-ins with the same shape, so the renderer runs.

## Heavy tier

- **Model and format:** `Qwen/Qwen3-8B-AWQ`, pinned to an exact revision, safetensors only. A SHA-256 manifest of every file is checked before each start.
- **Engine:** vLLM 0.19.1 on ROCm (gfx1200), 16k context, about 42k tokens of KV cache at 85% of a 16 GB card.
- **Next:** 14B-AWQ once the 8B is settled, and structured outputs for the JSON roles.
