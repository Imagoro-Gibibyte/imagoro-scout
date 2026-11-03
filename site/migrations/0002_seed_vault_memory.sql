-- The launch post enters as `pending`, so it goes through the same approve step as anything else.
INSERT INTO posts (id, slug, title, summary, body, skill, author, created_at, updated_at) VALUES (
  'seed-vault-memory',
  'vault-memory',
  'Memory MCP: plugin, headless setup and archive sorting',
  'Give agents a shared memory in a plain Markdown vault, with or without Obsidian running.',
  '## What it is

Memory MCP gives AI agents a memory they share with you: an [Obsidian](https://obsidian.md) vault of plain Markdown notes. [Download the bundle](/skills#vault-memory) from Skills & Tools.

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

## Archive base format

The plugin writes `Project Plans/Plans Archive.base` in Obsidian Bases format, so the archive is a sortable table rather than a plain list. The file it creates is:

```yaml
filters:
  and:
    - or:
        - file.inFolder("Project Plans")
        - file.inFolder("Archive")
    - file.ext == "md"
    - type != "index"
formulas:
  age_days: if(created, (today() - date(created)).days, "")
properties:
  file.name:
    displayName: Note
  project:
    displayName: Project
  repo:
    displayName: Repo
  type:
    displayName: Type
  status:
    displayName: Status
  created:
    displayName: Written
  modified:
    displayName: Last modified
  window:
    displayName: Window
  date_source:
    displayName: Date source
  formula.age_days:
    displayName: Age (days)
views:
  - type: table
    name: By project
    groupBy:
      property: project
      direction: ASC
    order:
      - file.name
      - repo
      - type
      - status
      - created
      - modified
      - window
    sort:
      - property: created
        direction: DESC
  - type: table
    name: By repo
    groupBy:
      property: repo
      direction: ASC
    order:
      - file.name
      - project
      - type
      - status
      - created
      - modified
      - date_source
    sort:
      - property: created
        direction: DESC
  - type: table
    name: Approved plans
    filters:
      and:
        - status == "approved"
    order:
      - file.name
      - project
      - repo
      - created
      - modified
      - date_source
    sort:
      - property: created
        direction: ASC
  - type: table
    name: Recently modified
    order:
      - file.name
      - project
      - repo
      - modified
      - created
      - formula.age_days
    sort:
      - property: modified
        direction: DESC
  - type: table
    name: Active only
    filters:
      and:
        - status == "active"
    order:
      - file.name
      - project
      - repo
      - created
      - modified
    sort:
      - property: project
        direction: ASC
```

The posted plugin writes this exact file on first run, so a vault set up by the plugin already has it.


The README in the bundle has the full setup, every tool and notes on syncing.',
  'vault-memory',
  'Imagoro',
  '2026-11-03T00:00:00.000Z',
  '2026-11-03T00:00:00.000Z'
);
