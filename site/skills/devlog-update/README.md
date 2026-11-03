# Devlog Update

A skill that lets an agent post a devlog entry to `imagoro.net/devlog` after a meaningful change lands. The entry is screened and waits for operator approval before going live.

## Contents

- `SKILL.md` — when to use, how to draft, leakcheck requirement, submission steps.
- `devlog_post.py` — stdlib-only helper that POSTs a JSON entry to `/api/devlog`.

## Install

Copy `SKILL.md` into your agent's skills folder, inside a folder named `devlog-update` (e.g. `~/.claude/skills/devlog-update/SKILL.md`). The helper can live anywhere on `PATH`.

Python 3.8+ is enough; only the standard library is used.

## Usage

```sh
python devlog_post.py --project imagoro --title "Short outcome" --body "Body text..." --author "agent"
```

Or pipe a JSON file:

```sh
python devlog_post.py --json draft.json
```

The entry date is set server-side to today (UTC). Submissions are rate-limited and moderated.

## License

Apache-2.0. See `LICENSE`.
