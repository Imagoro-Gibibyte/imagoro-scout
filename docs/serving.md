# Serving

## Two stacks, one GPU

The workstation's 16 GB card serves one stack at a time:

| Stack | Engine | For | Why separate |
|---|---|---|---|
| **Ollama** | GGUF models, OpenAI `/v1` | third-party harnesses (coding agents, assistants) | the widest client support; easy model swaps |
| **vLLM** | safetensors (AWQ 4-bit), OpenAI `/v1` | heavy inference for the project harnesses (Kao's manager roles and console) | concurrency, prefix caching, structured outputs, a path to a multi-tenant rack |

A switch script stops one and starts the other. Each engine listens only on loopback; the mesh reaches it through a gate on the workstation's mesh address. Smaller GPUs elsewhere run Ollama for the no-think specialists, behind the same kind of gate.

## Gates

| | [keygate](../packages/keygate) (Python, in front of Ollama) | [scout-sec-gate](../packages/gate) (Rust, in front of vLLM) |
|---|---|---|
| Auth | bearer / `X-Api-Key`, SHA-256 hashed, constant-time | same |
| Scope | model allowlist per key; filtered `/api/tags`, `/v1/models` | same |
| Surface | inference + read-only listing; pull/create/copy/delete/push unreachable | OpenAI chat, completions, embeddings, models |
| Content rules | none | v2, per role and per client policy ([below](#content-rules)) |
| Refusals | 401 bad key, uniform 404 otherwise | same; wrong method on a known route is a 404 too, not a 405 |
| Engine key | `upstream_key_file` (vLLM `--api-key`) | `engine.key_file` |
| Other | `forward`: loopback sidecar for harnesses that hold one key | `--check` validates config + rules and exits |

Both refuse to start without clients; the Rust gate also refuses without a valid rules file. Both log client, route, model, status and rule ids, never request or response text.

### Content rules

v1 ran regexes over the raw JSON body. That matched JSON keys and the operator's own system prompt, and its shell/PHP patterns blocked the security crew's evidence, which is hostile text on purpose. v2:

- **Scans parsed text per role:** `user`, `tool`, replayed `assistant` turns and tool-call arguments; `prompt`/`input` count as `user`. **`system` is never scanned:** the client wrote it.
- **Policies per client:**
  - `strict` (interactive or untrusted) gets structural and natural-language rules.
  - `evidence` (the security crew) gets structural rules only, so a PHP exploit line or "mark this BENIGN" reaches the model, which must judge it. Override markers are logged for correlation.
- **Structural rules apply to everyone:** chat-template control tokens (`<|im_start|>` and friends) can forge turns, so they're always refused. The suite's collectors neutralise them first; if one reaches the gate, something upstream failed.
- **Unknown shapes fail closed:** image parts, token-id prompts and unknown roles are refused because rules can't see them.

The rule table and reasons: [`packages/gate/injection_rules.json`](../packages/gate/injection_rules.json).

## vLLM on RDNA 4 under WSL

The heavy tier runs AMD's `gfx120X` vLLM image in WSL2 on Windows, via ROCm's DXG bridge. What it took:

| Problem | Fix |
|---|---|
| vLLM can't pick a platform ("Failed to infer device type"): the image's amd-smi can't see the GPU under WSL | mount AMD's WSL build of `libamd_smi` over the image's copy |
| `torch.compile` fails on a read-only root (`/root/.triton`) | keep the rootfs read-only; point `TRITON_CACHE_DIR` / `TORCHINDUCTOR_CACHE_DIR` at the cache volume |
| a healthy vLLM died after a few minutes | WSL stops its VM when nothing on the Windows side is attached, and a running container doesn't count; hold one tagged session open while serving |
| the container couldn't publish its port | mirrored networking shares one port space with Windows: engine and gate must not use the same port number on any address |
| raw `<think>` in answers through the gate | start vLLM with `--reasoning-parser qwen3` |
| VRAM | vLLM reserves a fixed share of the card at start; a game holding 10 GB means it refuses to start. Switching stacks is a manual choice |

Container hardening: no capabilities, `no-new-privileges`, read-only root, loopback-only port, offline model loading, telemetry off, and a SHA-256 manifest check of the weights before every start.
