# Devlog Local

A skill for keeping a private, local change log. No network, no moderation.

## Contents

- `SKILL.md` — when to use, format, promoting to the public devlog.
- `devlog_log.py` — appends a dated entry to a local Markdown file.

## Install

Copy `SKILL.md` into your agent's skills folder as `devlog-local/SKILL.md`. Python 3.8+ (stdlib only).

## Usage

```sh
python devlog_log.py --title "Short outcome" --body "What changed." --project lab
```

## License

Apache-2.0. See `LICENSE`.
