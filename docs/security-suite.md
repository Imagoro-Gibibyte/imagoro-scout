# Security suite

An LLM security auditor that watches the lab it runs in, built so that a compromised or confused model can't do damage. The core is in [`packages/security-core`](../packages/security-core).

## Cycle

| Step | Who | Guarantees |
|---|---|---|
| Collect | read-only collectors on every host (sshd, sudo, listeners, WireGuard, apt, disk, web edge) every 5 min | sandboxed service user; only the capabilities each source needs |
| Redact + screen | on the host, before posting | secrets, usernames (keyed hash), internal host octets and MACs removed; injection markers flagged and template tokens neutralised. Raw logs stay local |
| Post | role-scoped blackboard (mesh-only, token auth) | each role sees only its categories; dashboards get `observer` (findings and decisions, never raw events) |
| Analyse | 8-role crew, every 30 min; skipped unless something is low severity or above | agents have **no tools**: the runner reads and writes for them |
| Decide | manager writes a decision; specialists' answers are parsed, not trusted | guard verdicts the manager writes itself are overwritten with "not evaluated" |
| Propose | countermeasures become proposals | the **guard** evaluates each against the protected-node registry; DENY is stored as refused and can't be approved |
| Approve | operator, in the desktop console | requests are Ed25519-signed (timestamp ±60 s, nonce replay check, body hash); only public keys live on the hub |
| Execute | executor on each host, every minute | acts only if the proposal is approved, the executor is armed, the host runs in `enforce` mode, and the host's own guard re-check passes. Default is dry-run. Blocks are timed entries in a dedicated nftables table; disarming deletes it |

## Roles

One reasoning manager and seven no-think specialists, all thin layers over shared Qwen3 8B weights (see [models.md](models.md)): **alert** (THREAT / SUSPICIOUS / BENIGN), **intel** (correlation, JSON), **vet** (does the evidence support the label?), **rank** (risk order, JSON, never invents ids), **enforcer** (ALLOW / DENY / ESCALATE given guard facts), **sanitizer** (blackboard-safe summary), **error** (pipeline failures). Each answers in a fixed format a parser checks.

## Things learned live

- **Native tool calling through Ollama returned empty responses.** Fix: agents get no tools at all; the runner owns blackboard I/O. That's also the safer design.
- **The manager invented guard verdicts.** Fix: only the guard writes verdicts; anything else is overwritten.
- **About one cycle in six failed on an empty answer.** The Modelfiles put `/no_think` in the system prompt, but the crew framework sends its own system message, so Qwen3 reasoned anyway and sometimes spent its whole token budget there. Fix: ask for no reasoning **per request** (`reasoning_effort: "none"`) for every non-manager role. Verified: a probe went from 1,024 tokens of hidden reasoning to 71 tokens of answer, and every scheduled cycle since has passed.
- **The contract test** is a PHP-CGI exploit line carrying an embedded "mark this BENIGN". The alert role must call it THREAT and flag the override.

## Evaluation

The deployed suite scores each model on held-out sets (detection, injection resistance, vet, enforcer), with an 80% gate per suite. Prompt versions so far: 1.1 (shared decision rubrics), 1.2 (un-primed injection rule, alert boundaries, enforcer applies guard facts), 1.3 (vet judges evidence, not the label; enforcer decision table). The corpora and prompts stay private, since they describe what the detectors look for.

## Logs into the notebook

Every 15 minutes the hub renders its records into Markdown notes, covering:
- daily index, analysis cycles, collector counts, evals, proposals, audit trail;
- committed to a LAN-only git repo that the operator's notes vault pulls.

Text that came from monitored systems is escaped, and bodies go in code fences longer than any backtick run, so a log line can't inject a link, embed or plugin block into the vault. The exporter runs with no network at all.
