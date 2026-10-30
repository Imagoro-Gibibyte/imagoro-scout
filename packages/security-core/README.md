# scout-security-core

The parts of the Scout Security Suite that don't need a model, i.e. everything that decides what models may see and what they may do. How they fit together: [docs/security-suite.md](../../docs/security-suite.md).

| Module | Job |
|---|---|
| `blackboard.store` | SQLite blackboard: categories (events, findings, decisions, dev_debug, telemetry), per-role ACL, retention |
| `blackboard.auth` | HMAC role tokens with TTLs, device ids and revocation; entry-token onboarding |
| `blackboard.server`, `client` | stdlib HTTP API: `/v1/read`, `/v1/write`, `/v1/snapshot`, `/v1/stats`; `/v1/keys/{issue,authorize,revoke}`; `/v1/control/*` for executors; `/v1/op/*` for signed operator requests |
| `blackboard.control` | proposals, switches (pause, arm), executor reports, audit trail |
| `blackboard.operator_auth` | Ed25519-signed operator requests: timestamp window, nonce replay check, body hash |
| `injection` | screens text for prompt-injection markers; neutralises chat-template tokens |
| `redact` | deterministic redaction before anything is posted: secrets, keyed-hash usernames, internal host octets, MACs, home paths |
| `protected_nodes` | the countermeasure guard: refuses anything aimed at registered nodes, trusted networks or unattributable sources |
| `executor` | applies approved, guard-rechecked blocks as timed nftables set elements; dry-run by default |
| `runner` | turns crew output into guarded proposals; honours pause and run-now |
| `policy`, `reasoning` | agent loop policy (admin vs specialist), stripping reasoning blocks from answers |

```sh
pip install -e ".[dev]"
pytest          # 29 tests
python -m scout_security.blackboard.server --host 127.0.0.1 --port 8765
```

Not included: the crew itself, the model prompts and eval corpora (private by design), and the host collectors.
