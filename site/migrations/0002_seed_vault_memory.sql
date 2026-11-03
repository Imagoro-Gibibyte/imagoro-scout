-- The launch post enters as `pending`, so it goes through the same approve step as anything else.
INSERT INTO posts (id, slug, title, summary, body, skill, author, created_at, updated_at) VALUES (
  'seed-vault-memory',
  'vault-memory',
  'Vault Memory 1.2: plugin, headless setup and archive sorting',
  'Give agents a shared memory in a plain Markdown vault, with or without Obsidian running.',
  '## What it is

Vault Memory gives AI agents a memory they share with you: an [Obsidian](https://obsidian.md) vault of plain Markdown notes. [Download the bundle](/skills#vault-memory) from Skills & Tools.

- **MCP server:** reads and writes the vault for any MCP client, over stdio.
- **Skill:** tells agents to check the vault before starting work.
- **Obsidian plugin:** optional. Sets the vault up, sorts old notes and tests the server.

## Set up with the plugin

You need Python 3.10+ and version 1 of the MCP SDK:

```sh
pip install "mcp<2"
```

- Copy `plugin/main.js` and `plugin/manifest.json` to `.obsidian/plugins/vault-memory/` in your vault, then enable the plugin.
- Run **Initialize vault**. It creates the folders the skill expects and installs the server.
- Copy the MCP config and `SKILL.md` it shows you into your client, with your paths already filled in.
- Run **Test server (headless)** to confirm it works.

The default vault name is `brain`. With any other name, the wizard offers to rename the folder, or keeps your name and fills that in instead.

## Run it without Obsidian

The server doesn''t use Obsidian at all. A vault is just a folder of Markdown files, so it works on a machine with no desktop:

```sh
OBSIDIAN_VAULT=/path/to/vault python obsidian_mcp_server.py
```

It talks MCP over stdio, so normally your MCP client starts it for you. This has been tested on Windows with a fresh install on a separate NTFS drive. Other file systems should work the same way, and the README lists what to watch for.

## Sort old notes

- **Sort existing notes into archive** groups notes by title, then into two-week date folders. It only copies.
- Review `Archive/INDEX.md`, which lists each original and its new path.
- **Apply reviewed archive moves** moves the originals and updates links. Notes edited since copying are left alone.

The README in the bundle has the full setup, every tool and notes on syncing.',
  'vault-memory',
  'Imagoro',
  '2026-11-03T00:00:00.000Z',
  '2026-11-03T00:00:00.000Z'
);
