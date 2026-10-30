# Agent instructions: Imagoro Scout (public)

This repository is the **public mirror** of a private lab. Everything here is either code ported from private repositories or a write-up of them. Treat every change as publishing: once pushed, assume it's copied forever.

Read [docs/publishing.md](docs/publishing.md) first. These instructions turn it into a procedure.

## Hard rules

1. **`python tools/leakcheck.py` is clean before every commit.** CI runs it first and nothing else runs if it fails.
2. **Never allowlist real data.** `tools/leakcheck.allow` is only for made-up values (documentation ranges `192.0.2.x` / `198.51.100.x` / `203.0.113.x`, or invented private ranges) and planted test inputs, each with a reason. A finding on a real address, name or key means **remove it**, then check the git history: if it was ever pushed, tell the operator, because a later commit doesn't unpublish it.
3. **Describe roles, not machines.** Say "the hub", "the agent box", "the workstation", "the mesh". Never use host names, addresses, interface names, usernames, personal paths, domains of deployed sites, or org/repo names of private repositories.
4. **Never publish:**
   - keys, tokens or signing keys;
   - deployment config (units, firewall, VPN, provisioning, ports bound to real addresses);
   - the real protected-node registry;
   - the deployed role prompts or eval corpora;
   - the harness (Kao) source.

   Describe them instead.
5. **Don't invent.** Every claim in a doc or update must be checkable against the private source or a test here: numbers, behaviour, versions. If you can't verify something, leave it out or mark it as planned.
6. **Code here must run.** Every package keeps its tests green (`scripts/test-all.sh`). A port that can't stand alone gets trimmed to what can, or stays a write-up.

## Two kinds of change

### A. Update entry (most common): something meaningful landed in a private repo

1. Draft it from the source PRs or commits, where you can see the private repos:
   ```sh
   python tools/new_update.py --title "Specific outcome, not a file list" --area <harness|serving|security|nav|ui|models|repo> \
       --pr OWNER/REPO#N [--pr ...]          # or: --git <checkout> --range A..B
   ```
   The tool drops PR URLs, trailers and commit hashes, and refuses to write if leakcheck finds anything.
2. **Rewrite the draft as prose,** using the shape in [updates/TEMPLATE.md](updates/TEMPLATE.md):
   - what's different now;
   - **what changed**, grouped by idea and not by commit;
   - **why**, with the evidence: a failure rate, a log symptom, a test that caught it;
   - **what it means** next.

   Delete the HTML comments and the "Notes from the source" section.
3. **One entry per theme.** Several PRs that serve one outcome get one entry. A routine dependency bump doesn't get one.
4. **Add its row to the top** of the table in [updates/README.md](updates/README.md) (newest first): `| date | area | [title](file.md) |`. The date is when the work landed, not today.
5. If the change alters how something works, **also update the matching `docs/` page**, which describes the current state. The entry describes the change.
6. Run `python tools/leakcheck.py`, commit (`updates: <title>`), push, and confirm CI is green.

### B. Code sync: a mirrored package changed upstream

The packages in `packages/` are trimmed copies, adjusted to stand alone. The private side keeps a **source map**: which private path and ref feeds each package, and the exact adjustments each copy needs. The operator's private notes have it. Re-sync only from that map, so the adjustments are re-applied every time:

1. Copy the mirrored files from the upstream ref named in the map, and only those files.
2. **Re-apply every adjustment in the map,** such as fixture rewrites, renamed test identities, moved paths and removed tests. Then read the diff line by line: comments and docstrings carry the most surprises.
3. Run the package's tests, then `scripts/test-all.sh`, then `python tools/leakcheck.py`.
4. Commit as `sync(<package>): <upstream change in one line>`. Mention the upstream ref only as "upstream" in public text, never with the private repo's name.
5. Hand the operator the new upstream ref, so the map stays current.
6. If the change is meaningful, also write an update entry (A).

New packages follow the same path. Decide what can stand alone, copy the minimum, write its README and tests, add it to the table in the root README and to CI, and record it in the private map.

## Writing style for docs and entries

- Plain, specific prose. Tables for comparisons. No marketing words.
- Lead with what the system does now. Put history in `updates/`.
- Numbers need units and a source, e.g. "71 tokens, down from 1,024", "8 of 46 cycles".
- Link the code: `[keygate](../packages/keygate)`.

## Commands

| What | Command |
|---|---|
| everything CI runs | `bash scripts/test-all.sh` (Python 3.11+, Rust, Node 20+; `pip install -e "packages/security-core[dev]"` first) |
| leak check | `python tools/leakcheck.py [paths]` |
| add a private name to the check without publishing it | add the name to `tools/leakcheck.names` (git-ignored), or append `sha256(name)` to `NAME_HASHES` in `tools/leakcheck.py` |
| draft an update | `python tools/new_update.py --title ... --area ... --pr ...` |
| render Modelfiles | `python models/render.py --prompts models/prompts.example --out build/modelfiles` |
