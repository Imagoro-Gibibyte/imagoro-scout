# Vault Memory

Gives AI agents a memory they share with you: an Obsidian vault of plain Markdown notes. The bundle has three parts.

| Part | File | What it does |
|---|---|---|
| MCP server | `obsidian_mcp_server.py` | Reads and writes the vault's Markdown files for any MCP client, over stdio. |
| Skill | `SKILL.md` | Tells agents to check the vault before starting work, and how to find the right notes. |
| Obsidian plugin | `plugin/` | Optional. Sets the vault up, sorts old notes into an archive, and tests the server. |

The server and the skill are all an agent needs. The plugin only makes setup easier, and it needs the Obsidian desktop app.

The server reads files directly, so Obsidian doesn't need to be open, or even installed. It doesn't sync anything. To keep the vault on GitHub, add SyncGit separately (see [Syncing with SyncGit](#syncing-with-syncgit)).

## Vault layout

The skill expects these paths, relative to the vault. Edit `SKILL.md` if your vault is organized differently.

| Path | What it's for |
|---|---|
| `Project Plans/<Project>/` | Plans and dated `*- status.md` notes |
| `Project Plans/_Worktrees/Registry.md` | Maps repos to worktrees |
| `Project Plans/_Worktrees/Prompts.md` | Suggested next steps |
| `Imported Local Docs/` | Repo documents copied into the vault |
| `Archive/` | Older notes, sorted by the plugin |

## Setup

Both ways need Python 3.10+ and the MCP SDK (tested with `mcp` 1.28.1):

```sh
pip install mcp
```

### With the plugin

1. Copy `plugin/main.js` and `plugin/manifest.json` to `<your vault>/.obsidian/plugins/vault-memory/`, then enable **Vault Memory** under Community plugins.
2. Run **Initialize vault** from the command palette. You can use the open vault or create a new one.
3. The wizard creates the layout above without changing existing notes, and installs the server at `~/.vault-memory/obsidian_mcp_server.py`. To use a copy you already have, set **Server path** in the plugin's settings first.
4. Copy the MCP config and `SKILL.md` it shows you into your client. Both already have your paths filled in. See [Install the skill](#install-the-skill) for where `SKILL.md` goes.
5. Run **Test server (headless)** to confirm it works.

The default vault name is `brain`. With any other name, the wizard offers to rename the folder. If you decline, nothing else changes, and the config and skill it shows use your vault's name. On Windows, an open vault's folder usually can't be renamed. If that happens, close the vault, rename the folder, and reopen it.

### Without the plugin

Create the layout above, then replace these placeholders:

| Placeholder | Replace with | Where |
|---|---|---|
| `<VAULT>` | Your vault folder, such as `C:/Notes` or `/srv/notes` | `SKILL.md` (2 places), the client config below |
| `<BUNDLE>` | The folder holding `obsidian_mcp_server.py` | The client config below |

Add the server to your MCP client under the name `brain`, because `SKILL.md` calls the tools `brain.search_notes` and so on. If you use another name, update `SKILL.md` to match.

```json
{
  "brain": {
    "command": "python",
    "args": ["<BUNDLE>/obsidian_mcp_server.py"],
    "env": { "OBSIDIAN_VAULT": "<VAULT>" }
  }
}
```

The surrounding format varies by client. If `python` isn't the interpreter with `mcp` installed, use its full path. Use full paths throughout, because most clients don't expand `~` in config files. In JSON, use forward slashes, even on Windows, or double each backslash.

The server exits with an error if `OBSIDIAN_VAULT` isn't set.

### Install the skill

Copy `SKILL.md` into your agent's skills folder, inside a folder named `vault-memory`. For Claude Code that's `~/.claude/skills/vault-memory/SKILL.md`.

### Headless

On a machine with no desktop, skip the plugin and start the server directly:

```sh
OBSIDIAN_VAULT=/path/to/vault python obsidian_mcp_server.py
```

It talks MCP over stdio, so it waits for a client rather than printing anything. Started this way, it initializes, lists its tools and answers `vault_info`.

## Plugin commands

| Command | What it does |
|---|---|
| Initialize vault | Runs the setup wizard |
| Sort existing notes into archive | Copies notes outside the standard folders into `Archive/` and logs them |
| Apply reviewed archive moves | Moves the originals over their copies, after your review |
| Show status and config | Shows the vault, server path, note counts and MCP client config |
| Test server (headless) | Starts the server and calls `vault_info` |

### Sorting notes

The plugin asks before doing anything, and sorting only copies:

1. **Sort existing notes into archive** groups notes by title similarity, then by two-week period: `Archive/<cluster-slug>/YYYY-MM-DD to YYYY-MM-DD/`. A note with no similar title is filed under the name of its current folder, or `Archive/misc/` if it's at the vault root.
2. Review `Archive/INDEX.md`, which lists each original and its new path. Until you apply, each note exists twice, so search shows both.
3. **Apply reviewed archive moves** moves each original over its copy and updates links to it. A note edited on either side since copying isn't moved, and is marked `changed`.

A note's date comes from its title, then frontmatter `created`, then the file's modified time. Sorting skips dot folders such as `.obsidian` and `.trash`, the standard folders, anything that isn't Markdown, and files over 25 MB.

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
