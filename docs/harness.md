# Harness: Kao

Kao is the agentic harness for the Scout suite: it exposes every Scout capability as a **native tool** over MCP (stdio, Content-Length framing) and an HTTP JSON-RPC gateway (`/rpc` with a bearer session, `/health` open). Clients are the desktop Harness Console, the Command Center and MCP-speaking agents. Its source is private; this page describes how it works.

## Shape

| Module | Job |
|---|---|
| `engine` | zero-dependency OpenAI-compatible `/v1` client: explicit timeouts and lengths, fail-closed on any engine error |
| `serving` | role → model routing from the blackboard `config/serving` slot; per-role engine URL and fallback chain (models on that engine) |
| `model-registry` | signed catalog + license gate: an engine's inventory is matched to catalog entries before a role may bind |
| `tools` | native tools: status, roster, models, env, chat, crew plan/run, hazard alerts; every call audited |
| `guard` | the seam check: well-formed UTF-8, NFKC and confusable folding for identifiers, control / bidi / zero-width / tag-character stripping, CRLF-injection refusal, secret redaction in errors |
| `mcp`, `transport` | stdio MCP server (8 MiB frame cap, crash-safe parse), TCP transport that authenticates the first frame, HTTP gateway |

## Rules it enforces

- **Allowlist execution only.** No shell, no blind subprocess: since the rewrite every Scout capability is a native tool.
- **Fail closed.** Unreachable engine or unknown role → the tool returns an error naming the gate; never a guess.
- **Provenance before binding.** A model id is admitted only if it matches an entry in the **Ed25519-signed catalog** (lineage, license, abliterated flag, params, quant, size, digest, aliases). When the engine reports a digest, the alias match must also match the signed digest, so a different blob renamed to an admitted tag is refused. Llama-lineage and unknown-license models are refused outright; there is no "first installed model" fallback.
- **CLI and GUI agree.** Both read and write the same blackboard config slot, so a role change in the console is the same change the CLI sees.

## Serving profiles

Kao gives each role exactly one engine. Two stored profiles switch the manager-class roles between engines:

| Profile | manager / hermes | specialists |
|---|---|---|
| `ollama` | 8B Qwen3 layer on the agent box | 4B specialists on the hub |
| `vllm` | Qwen3-8B-AWQ on the workstation's vLLM | unchanged |

Kao holds a single engine key, so it reaches the keyed vLLM gate through a **loopback sidecar** on its own machine ([keygate `forward`](../packages/keygate)) that swaps in the right key. That also keeps Kao's "local engines only" rule literally true: its engine URL is `127.0.0.1`.

Because each role has one engine, a manager on the `vllm` profile fails closed when the workstation isn't serving. Cross-engine fallback is the next harness change.

## Catalog maintenance

Adding a model: pin a revision, write a SHA-256 manifest of its files, add a catalog entry (digest = the manifest's hash for safetensors models), sign with the catalog key, and verify with the harness's own loader **before** installing. Keep the previous catalog and signature as a backup.
