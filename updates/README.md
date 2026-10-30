# Updates

Holistic entries: what changed across the system, why, and what it means. They're not changelogs. Each is ported from PRs and commits in the private repos with [`tools/new_update.py`](../tools/new_update.py), then rewritten by hand. Newest first.

| Date | Area | Entry |
|---|---|---|
| 2026-10-30 | harness | [Kao on vLLM, through the Rust gate](2026-10-30-kao-on-vllm.md) |
| 2026-10-29 | security | [Logs into the notebook, and surviving a cold restart](2026-10-29-logs-and-restart.md) |
| 2026-10-28 | serving | [The gate learns to tell evidence from attacks](2026-10-28-gate-content-rules.md) |
| 2026-10-28 | serving | [vLLM on an RDNA 4 card, under WSL](2026-10-28-vllm-on-rdna4.md) |
| 2026-10-28 | models | [Reasoning off has to mean off](2026-10-28-reasoning-off.md) |
| 2026-10-28 | serving | [Heavy models off the small box; keys instead of IP lists](2026-10-28-serving-pivot-and-key-auth.md) |
| 2026-10-27 | security | [Control plane, guarded executor, evals, prompts 1.1 to 1.3](2026-10-27-control-plane.md) |
| 2026-10-27 | security | [The security suite goes live](2026-10-27-security-suite-live.md) |
| 2026-10-16 | repo | [Where things stood: the foundations](2026-10-16-foundations.md) |

## Writing an entry

```sh
python tools/new_update.py --title "Short, specific title" --area serving --pr OWNER/REPO#N
```
Then rewrite the draft as prose, using [TEMPLATE.md](TEMPLATE.md) as the shape, add its row above, and run `python tools/leakcheck.py`.
