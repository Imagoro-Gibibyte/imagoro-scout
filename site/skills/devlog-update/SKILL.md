---
name: devlog-update
description: Post a devlog entry to imagoro.net after a meaningful change lands. Use when a feature, fix with user-visible effect, or milestone completes; skip routine bumps and typo fixes. Drafts in the house style and submits via the public API for operator approval.
---

# Devlog Update

## When to use

- A feature, user-visible fix, or milestone has landed (merged PR, released build).
- A decision or measurement worth recording (a failure rate, a benchmark, a new capability).
- Skip: routine dependency bumps, refactors with no observable effect, typo/formatting fixes, work-in-progress.

One entry per theme. Several PRs serving one outcome get one entry, not several.

## What to draft

Fields:
- `project`: one of `imagoro`, `security`, `nav`, `lab`, `voxel`.
- `title`: a specific outcome, not a file list. Short.
- `body`: plain prose, in this shape:
  - what's different now (one or two sentences);
  - what changed, grouped by idea, not by commit;
  - why, with evidence (a failure rate, a log symptom, a test that caught it);
  - what it means next.
- `author`: your name or "agent" (optional).
- `post`: slug of a post this update links to (optional). When set, the update shows up in that post's "Updates" section.

Numbers need units and a source. Describe roles, not machines.

## Public-mirror rules (hard)

Before posting, check the draft against these:
- No host names, addresses, interface names, usernames, personal paths, or domains of deployed sites.
- No keys, tokens, signing keys, or credentials.
- No private repo or org names; describe the system by role ("the hub", "the agent box").
- No deployed role prompts, eval corpora, or protected-node registries.
- No commit hashes or PR URLs.

If unsure, leave it out.

## Leakcheck

If you're in a checkout that has `tools/leakcheck.py`, write the draft to a temp file and run:

```sh
python tools/leakcheck.py path/to/draft.md
```

It must be clean. A finding means remove the offending text, never allowlist it. If the tool isn't available, apply the rules above by hand and keep the wording generic.

## Submitting

The entry date is set server-side to today (UTC); you cannot backdate. Submit with the helper:

```sh
python devlog_post.py --project imagoro --title "Short outcome" --body "Body text..." --author "agent"
```

Or POST JSON directly:

```sh
curl -sS -X POST https://imagoro.net/api/devlog \
  -H 'Content-Type: application/json' \
  -H "Origin: https://imagoro.net" \
  -d '{"project":"imagoro","title":"...","body":"...","author":"agent"}'
```

The response is `{ "ok": true, "status": "pending", "id": "..." }`. The entry is not public until an operator approves it. A rejection comes back as `{ "ok": false, "reasons": [...] }`; fix and resubmit.

Rate limit: a few submissions per visitor per day. Don't retry in a loop.

## After posting

- Note the returned id in your task log.
- Do not claim the change is on the devlog until it's approved; say it's pending review.
- If an entry needs correcting, ask the operator rather than resubmitting a duplicate.
