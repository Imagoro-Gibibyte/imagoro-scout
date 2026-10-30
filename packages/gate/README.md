# scout-sec-gate

The serving gate in front of an OpenAI-compatible engine (vLLM, llama.cpp server, Ollama `/v1`). Rust, axum + hyper. Design and rule rationale: [docs/serving.md](../../docs/serving.md).

Per request, first failure wins and nothing is forwarded:

1. client key → client (else **401**)
2. route + method are chat / completions / embeddings (POST) or models (GET)
3. body ≤ `max_body_bytes`, valid JSON, string `model`, model on that client's allowlist
4. content extracts into known shapes and passes the rules for the client's `strict` or `evidence` policy
5. forward with the engine's own key; stream the response back

Every refusal but auth is the same 404.

```sh
cargo test                                   # 13 unit + 6 end-to-end
cargo run -- --config gate.example.toml --check
```
Config: [`gate.example.toml`](gate.example.toml). Rules: [`injection_rules.json`](injection_rules.json) (v2: id, pattern, policies, roles, action, severity, why).

Not yet wired: signed request envelopes (`auth::verify_envelope`, needs a replay cache), rate and concurrency limits, unix-socket engine transport.
