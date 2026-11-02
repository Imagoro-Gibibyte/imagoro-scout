# Obsidian vault memory for agents

Gives AI agents read and write access to an Obsidian vault, plus a skill telling them when to use it.

| File | What it is |
|---|---|
| `obsidian_mcp_server.py` | Local MCP server. Reads and writes the vault as plain Markdown files, over stdio. |
| `SKILL.md` | Agent skill: check the vault before starting work on a project. |
| `README.md` | This file. |

The server doesn't sync anything and doesn't need Obsidian running. To keep the vault on GitHub, add SyncGit separately (see [Syncing with SyncGit](#syncing-with-syncgit)).

## Setup

Requires Python 3.10+ and the MCP SDK (tested with `mcp` 1.28.1):

```sh
pip install mcp
```

### 1. Fill in your paths

All local paths in this bundle have been replaced with placeholders. Find and replace them with your own:

| Placeholder | Replace with | Where |
|---|---|---|
| `<VAULT>` | Your vault folder, such as `C:/Notes` or `/srv/notes` | `SKILL.md` (2 places), the client config below |
| `<BUNDLE>` | The folder holding `obsidian_mcp_server.py` | The client config below |

What changed from a personal install:

- **Vault path:** `SKILL.md` now uses `<VAULT>`, and the client config passes it to the server.
- **Server default:** the server no longer has a built-in vault path. Set `OBSIDIAN_VAULT` in the client config, or it exits with an error.
- **Paths inside the vault:** paths like `Project Plans/_Worktrees/Registry.md` are relative to the vault, so they need no replacing unless your folders differ.

Use full paths, because most clients don't expand `~` in config files. In JSON, use forward slashes, even on Windows, or double each backslash.

### 2. Register the server

Add it to your MCP client under the name `brain`, because `SKILL.md` calls the tools `brain.search_notes` and so on. If you use another name, update `SKILL.md` to match.

```json
{
  "brain": {
    "command": "python",
    "args": ["<BUNDLE>/obsidian_mcp_server.py"],
    "env": { "OBSIDIAN_VAULT": "<VAULT>" }
  }
}
```

The surrounding format varies by client. If `python` isn't the interpreter with `mcp` installed, use its full path.

### 3. Install the skill

Copy `SKILL.md` into your agent's skills folder, inside a folder named `vault-memory`. For Claude Code that's `~/.claude/skills/vault-memory/SKILL.md`.

The skill expects this layout. Edit its paths if your vault is organized differently:

- `Project Plans/<Project>/`: plans and dated `*- status.md` notes
- `Project Plans/_Worktrees/Registry.md`: maps repos to worktrees
- `Project Plans/_Worktrees/Prompts.md`: suggested next steps
- `Imported Local Docs/`: repo documents copied into the vault

## Tools

Paths are relative to the vault and use forward slashes, such as `Project Plans/Example/Plan.md`.

| Tool | What it does |
|---|---|
| `write_note(path, content, overwrite=false)` | Creates a note and any missing folders. Returns an error if the note exists, unless `overwrite=true`. |
| `append_note(path, content, create_if_missing=true)` | Adds to the end of a note. Use this for logs and status updates. |
| `daily_note(date?, content?, append=true)` | Reads the daily note, or writes to it if `content` is set. The date defaults to today. |
| `read_note(path)` | Reads one note. |
| `list_notes(path, recursive, limit)` | Lists notes, skipping dot folders such as `.obsidian`. |
| `search_notes(query, limit, case_sensitive)` | Searches note text. |
| `list_tags(limit)` | Lists tags. |
| `vault_info()` | Shows the vault path and top-level folders. |

## Writing safely

- **Keep secrets out.** Never put keys, tokens or credentials in a note, especially if the vault syncs.
- **Paths must stay in the vault.** A path that leaves the vault is refused. Nothing else is restricted: any file type can be written, including inside `.obsidian`, so give notes a `.md` name.
- **Overwrites have no undo.** The tool keeps no backup, so read the note first and prefer `append_note`.
- **Don't write to one note from two places at once.** Each write replaces the whole file, so the earlier write is lost.

## Syncing with SyncGit

[SyncGit](https://github.com/bhoopeshrk) is a separate Obsidian community plugin by Bhoopesh R K. It isn't part of this bundle, and the two don't communicate. The server only changes files on disk; SyncGit notices those changes like any other edit and syncs them to a GitHub repo through the GitHub API.

What matters when agents write to a synced vault:

- **Syncing only runs while Obsidian is open** on that device. A note written while it's closed uploads the next time Obsidian runs.
- **Syncing runs on a timer** that you set in the plugin, so changes aren't on GitHub immediately.
- **Each file is compared with the last synced version:**

| Changed since last sync | Result |
|---|---|
| Only this device | Uploads to GitHub |
| Only GitHub | Replaces the local file, with no prompt |
| Both | Conflict. Automatic syncs skip the file. A manual sync asks you to keep local, remote or both. |
| Deleted on one side | Deleted on the other. A local copy goes to Obsidian's trash. |

- **Agent edits can be replaced.** If GitHub has a newer version from another device, an edit made just before a sync can lose out. After an important write, wait for one sync cycle, then check the note both on disk and on GitHub. If they differ, restore the version you want.
- **Conflicts aren't always visible.** With automatic sync, a conflicted file just stops syncing until you run a manual sync, so run one if a note stops updating.
- **Some files never sync:** `.obsidian/`, trash, anything over 25 MB, and patterns in `.obsidian/.obsidian-sync-ignore`. Add anything that must stay local to that file, and check it before the first sync.

## Before sharing your own copy

This bundle was checked for personal paths, but your edits can add them back. Before compressing it, search the folder for your username, vault path, repo names and any addresses, and leave out `__pycache__`.

## License

Apache-2.0. See `LICENSE`.
