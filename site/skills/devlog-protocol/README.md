# Devlog Protocol

A generalized, fill-in-the-blank devlog protocol you adapt to your own site. Includes a config template, a posting client that can pull summaries from your README/setup docs, and setup documentation.

## Contents

- `SKILL.md` — how to fill in the blanks and use.
- `devlog_protocol.py` — generalized posting client.
- `config.example.json` — template config.
- `SETUP.md` — server-side contract to port.
- `README.md` — this file.
- `LICENSE` — Apache-2.0.

## Install

1. Copy the bundle into your project.
2. Copy `config.example.json` to `config.json` and fill in the blanks.
3. Copy `SKILL.md` into your agent's skills folder as `devlog-protocol/SKILL.md`.
4. Set up the server side per `SETUP.md`.

## Usage

```sh
python devlog_protocol.py --config config.json --project project-a --title "Outcome" --body "What changed."
python devlog_protocol.py --config config.json --project project-a --title "Outcome" --summary-from README.md
```

## License

Apache-2.0. See `LICENSE`.
