---
name: devlog-protocol
description: A fill-in-the-blank devlog protocol you adapt to your own site. Provides a config template, a generalized posting client, and setup docs. Pulls entry summaries from your README/setup docs.
---

# Devlog Protocol (generalized)

This is a template. Copy it, fill in the blanks, and you get your own devlog posting flow on your own site.

## Fill in the blanks

1. Copy `config.example.json` to `config.json`.
2. Set `endpoint` to your site's devlog API (e.g. `https://yoursite.example/api/devlog`).
3. Set `origin` to your site origin.
4. Set `projects` to your project ids.
5. Set `admin_token_env` to the env var holding your admin token.

## Posting

```sh
python devlog_protocol.py --config config.json --project project-a --title "Outcome" --body "What changed."
```

Pull a summary from a README/setup doc instead of writing one:

```sh
python devlog_protocol.py --config config.json --project project-a --title "Outcome" --summary-from README.md
```

The client reads the first paragraph (or a `## Summary` section) of the file and uses it as the body.

## Server side

You need a moderated devlog API on your site. See `SETUP.md` for the contract (endpoints, schema, moderation) you can port from the imagoro-scout implementation.

## Public-mirror rules

If your devlog is public, apply the same rules as devlog-update: no hosts, addresses, keys, private repo names, or deployed prompts.
