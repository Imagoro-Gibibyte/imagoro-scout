UPDATE posts SET body = '## What it is

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

## ALWAYS START HERE folder for machine-specific notes

Some notes have to be read before any other: how to reach a lab node, which services live on it, and the safety rules for admin work. Put them in a folder that sorts first in `Plans Archive.base`, so they land at the top of the "By project" view instead of being buried among dated plans.

Create the folder by hand; the wizard doesn''t make it, because the name and contents are yours:

1. Make `Project Plans/0 ALWAYS START HERE/` (use `0 ` or `* ` as the prefix; `0 ` is portable, since `*` is not allowed in file names on Windows).
2. Add a note there with frontmatter such as:

   ```yaml
   ---
   title: ALWAYS START HERE - SSH and lab network admin
   project: 0 ALWAYS START HERE
   repo: all
   type: agent-guide
   status: active
   created: 2026-01-01
   modified: 2026-01-01
   ---
   ```

   `project: 0 ALWAYS START HERE` is what makes it sort first; the archive base groups by `project` ascending.
3. Write the note as an agent guide: what lives on each node, why the SSH tooling exists, when to use it for development tasks, and the local network admin tidbits (mesh, ports, keygates, secrets handling). Link to the detailed runbooks instead of duplicating them.
4. Update `Project Plans/README.md`''s layout block so the folder is listed at the top.

### Secure host aliasing (short example)

Keep host names, addresses and keys in one SSH config, never in a vault note. A minimal, safe setup:

```ssh-config
# ~/.ssh/config (or an included file such as ~/.ssh/config.scout-agent)
Include ~/.ssh/config.scout-agent

Host dell
  HostName 192.0.2.10          # the node''s LAN address
  User scout
  IdentityFile ~/.ssh/lab_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30

Host nuc
  HostName 192.0.2.11
  User scout
  ProxyJump dell                # reach the node through the first one
  IdentityFile ~/.ssh/lab_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
```

Rules:

- One dedicated key per operator, `chmod 600` on the private key, never committed or copied into the vault.
- `IdentitiesOnly yes` so SSH doesn''t offer unrelated keys.
- Reach a node through another with `ProxyJump` instead of opening it to the internet.
- Read secret directories with `sudo` on the node; don''t copy them off it.
- Revoke and re-issue a key if it leaks; don''t reuse it.




The README in the bundle has the full setup, every tool and notes on syncing.', updated_at = '2026-11-11T07:37:43.728Z' WHERE id = 'seed-vault-memory';