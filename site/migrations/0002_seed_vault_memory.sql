-- The launch post enters as `pending`, so it goes through the same approve step as anything else.
INSERT INTO posts (id, slug, title, summary, body, skill, author, created_at, updated_at) VALUES (
  'seed-vault-memory',
  'vault-memory',
  'Vault Memory 1.1: plugin, headless setup and archive sorting',
  'An Obsidian plugin now sets up the vault, sorts old notes into an archive, and tests the MCP server.',
  '## What it is

Vault Memory gives agents read and write access to an [Obsidian](https://obsidian.md) vault, and a skill telling them to check it before starting work. Get it from [Skills & Tools](/skills#vault-memory).

## The plugin

The first-run wizard creates the folders the skill expects: Project Plans, the worktree registry and prompts notes, Imported Local Docs and Archive. It works with a new vault or an existing one, and asks before it renames anything.

The skill expects a vault named brain. If you keep another name, the plugin writes out the edits you need for SKILL.md and your MCP client config.

## Headless setup

Obsidian doesn''t need to be open. The server reads and writes Markdown files directly, so it works on a machine with no desktop:

OBSIDIAN_VAULT=/path/to/vault python obsidian_mcp_server.py

The plugin''s Test server command starts the server the same way and calls vault_info to confirm it works.

## Sorting old notes

The sort command groups notes by title similarity, then into two-week date folders inside each group. A note with no match keeps its folder name. It copies first and logs every note in Archive/INDEX.md, so you can review the result. Originals stay where they are until you choose to apply the moves.',
  'vault-memory',
  'Imagoro',
  '2026-11-02T00:00:00.000Z',
  '2026-11-02T00:00:00.000Z'
);
