"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultMemoryPlugin
});
module.exports = __toCommonJS(main_exports);
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");
var import_obsidian = require("obsidian");

// src/core/vault-fs.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
function hash(data) {
  return (0, import_node_crypto.createHash)("sha256").update(data).digest("hex");
}
function nodeVaultFs(root) {
  const full = (path) => (0, import_node_path.join)(root, path);
  async function walk(dir, out) {
    for (const entry of await import_node_fs.promises.readdir(full(dir), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path, out);
      else if (entry.isFile()) {
        const stat = await import_node_fs.promises.stat(full(path));
        out.push({ path, size: stat.size, mtime: stat.mtimeMs });
      }
    }
  }
  return {
    exists: (path) => import_node_fs.promises.access(full(path)).then(() => true, () => false),
    read: (path) => import_node_fs.promises.readFile(full(path)),
    async write(path, data) {
      await import_node_fs.promises.mkdir((0, import_node_path.dirname)(full(path)), { recursive: true });
      await import_node_fs.promises.writeFile(full(path), data);
    },
    remove: (path) => import_node_fs.promises.rm(full(path)),
    async move(from, to) {
      await import_node_fs.promises.mkdir((0, import_node_path.dirname)(full(to)), { recursive: true });
      await import_node_fs.promises.rename(full(from), full(to));
    },
    mkdir: (path) => import_node_fs.promises.mkdir(full(path), { recursive: true }).then(() => void 0),
    async list() {
      const out = [];
      await walk("", out);
      return out.sort((a, b) => a.path.localeCompare(b.path));
    }
  };
}

// src/core/archive.ts
var MAX_BYTES = 25 * 1024 * 1024;
var INDEX_NOTE = "Archive/INDEX.md";
var INDEX_DATA = "Archive/INDEX.json";
var STANDARD_FOLDERS = ["Project Plans", "Imported Local Docs", "Archive"];
var SIMILARITY = 0.5;
var STOP_WORDS = /* @__PURE__ */ new Set(["a", "an", "and", "for", "in", "md", "of", "on", "the", "to", "with"]);
var GENERIC_WORDS = /* @__PURE__ */ new Set([
  "agents",
  "doc",
  "docs",
  "draft",
  "findings",
  "log",
  "logs",
  "note",
  "notes",
  "plan",
  "plans",
  "readme",
  "rules",
  "status"
]);
var DAY_MS = 864e5;
var PERIOD_DAYS = 14;
var PERIOD_ANCHOR = Date.UTC(2026, 0, 5);
var DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
async function scan(vault) {
  const notes = [];
  const skipped = [];
  for (const file of await vault.list()) {
    if (!file.path.toLowerCase().endsWith(".md")) continue;
    if (STANDARD_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`))) continue;
    if (file.size > MAX_BYTES) skipped.push({ path: file.path, reason: "over 25 MB" });
    else notes.push(file);
  }
  return { notes, skipped };
}
function title(path) {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}
function titleWords(path) {
  const words = title(path).replace(new RegExp(DATE, "g"), " ").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word) && !GENERIC_WORDS.has(word) && !/^\d+$/.test(word));
  return new Set(words);
}
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared);
}
function folderSlug(path) {
  const folder = path.split("/").slice(-2, -1)[0] ?? "";
  return folder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "misc";
}
function clusterSlug(paths) {
  if (paths.length === 1) return folderSlug(paths[0]);
  const counts = /* @__PURE__ */ new Map();
  for (const path of paths) for (const word of titleWords(path)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const shared = [...counts].filter(([, n]) => n * 2 > paths.length).sort(([a, n], [b, m]) => m - n || a.localeCompare(b)).slice(0, 3).map(([word]) => word);
  return shared.join("-") || folderSlug(paths[0]);
}
function clusterTitles(paths) {
  const sorted = [...paths].sort();
  const words = sorted.map(titleWords);
  const scores = /* @__PURE__ */ new Map();
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const score = similarity(words[i], words[j]);
      if (score < SIMILARITY) continue;
      scores.set(`${i}:${j}`, score);
      pairs.push({ i, j, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  const groups = sorted.map((_, i) => [i]);
  const groupOf = sorted.map((_, i) => i);
  const matches = (a, b) => scores.has(a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const { i, j } of pairs) {
    const [a, b] = [groupOf[i], groupOf[j]];
    if (a === b || !groups[a].every((x) => groups[b].every((y) => matches(x, y)))) continue;
    for (const member of groups[b]) groupOf[member] = a;
    groups[a].push(...groups[b]);
    groups[b] = [];
  }
  const slugs = /* @__PURE__ */ new Map();
  for (const group of groups.filter((members) => members.length > 0)) {
    const members = group.map((i) => sorted[i]);
    const slug = clusterSlug(members);
    for (const path of members) slugs.set(path, slug);
  }
  return slugs;
}
var FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
function noteDate(file, text) {
  const parse = (match) => match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  const frontmatter = FRONTMATTER.exec(text)?.[1] ?? "";
  const created = /^created:\s*["']?(.+)$/m.exec(frontmatter)?.[1] ?? "";
  const stated = parse(DATE.exec(created)) ?? parse(DATE.exec(title(file.path)));
  return stated !== null ? { ms: stated, source: "stated" } : { ms: file.mtime, source: "file" };
}
function noteType(path) {
  const name = title(path).toLowerCase();
  if (/\bstatus\b/.test(name)) return "status-report";
  if (/\baudit\b|\bfindings\b/.test(name)) return "audit";
  if (/\b(agents|rules)\b/.test(name)) return "agent-guide";
  if (/\bbriefing\b/.test(name)) return "briefing";
  if (/\bplan\b/.test(name)) return "plan";
  return "note";
}
function yamlValue(value) {
  return /^[\w][\w ./-]*$/.test(value) ? value : JSON.stringify(value);
}
function withProperties(text, properties) {
  const match = FRONTMATTER.exec(text);
  const existing = match?.[1] ?? "";
  const has = (key) => new RegExp(`^${key}:`, "m").test(existing);
  const added = Object.entries(properties).filter(([key]) => !has(key)).map(([key, value]) => `${key}: ${yamlValue(value)}`);
  const kept = existing.replace(/^window:.*$/m, `window: ${properties.window}`);
  const block = `---
${[kept, ...added].filter(Boolean).join("\n")}
---`;
  return match ? block + text.slice(match[0].length) : `${block}

${text}`;
}
var isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
function periodFolder(ms) {
  const days = Math.floor((ms - PERIOD_ANCHOR) / DAY_MS);
  const start = PERIOD_ANCHOR + (days - (days % PERIOD_DAYS + PERIOD_DAYS) % PERIOD_DAYS) * DAY_MS;
  return `${isoDay(start)} to ${isoDay(start + (PERIOD_DAYS - 1) * DAY_MS)}`;
}
async function readEntries(vault) {
  if (!await vault.exists(INDEX_DATA)) return [];
  return JSON.parse((await vault.read(INDEX_DATA)).toString("utf8"));
}
async function writeIndex(vault, entries) {
  const cell = (text) => text.replace(/\|/g, "\\|");
  const rows = entries.map((e) => `| ${cell(e.original)} | ${cell(e.copy)} | ${e.status} |`);
  const note = [
    "---",
    "type: index",
    "---",
    "",
    "# Archive index",
    "",
    "`copied`: the original is still in place. `moved`: the copy replaced it. `changed`: one side was edited after copying, so it wasn't moved. `missing`: the original is gone.",
    "",
    "| Original | Archive | Status |",
    "|---|---|---|",
    ...rows,
    ""
  ].join("\n");
  await vault.write(INDEX_DATA, JSON.stringify(entries, null, 2));
  await vault.write(INDEX_NOTE, note);
}
async function copyToArchive(vault, plan) {
  const entries = await readEntries(vault);
  const logged = new Set(entries.map((entry) => entry.original));
  const pending = plan.notes.filter((note) => !logged.has(note.path));
  const clusters = clusterTitles(pending.map((note) => note.path));
  for (const note of pending) {
    const data = await vault.read(note.path);
    const text = data.toString("utf8");
    const date = noteDate(note, text);
    const day = isoDay(date.ms);
    const window = periodFolder(date.ms);
    const cluster = clusters.get(note.path);
    const folder = `Archive/${cluster}/${window}`;
    const name = /^\d{4}-\d{2}-\d{2}\b/.test(title(note.path)) ? title(note.path) : `${day} ${title(note.path)}`;
    let copy = `${folder}/${name}.md`;
    for (let n = 2; await vault.exists(copy); n++) copy = `${folder}/${name} (${n}).md`;
    const archived = Buffer.from(
      withProperties(text, {
        project: cluster,
        repo: "all",
        type: noteType(note.path),
        status: "done",
        created: day,
        modified: isoDay(note.mtime),
        window,
        date_source: date.source,
        filed_from: note.path
      })
    );
    await vault.write(copy, archived);
    entries.push({ original: note.path, copy, hash: hash(data), copyHash: hash(archived), status: "copied" });
  }
  await writeIndex(vault, entries);
  return entries;
}
async function applyMoves(vault) {
  const entries = await readEntries(vault);
  const ready = [];
  for (const entry of entries) {
    if (entry.status === "moved") continue;
    if (!await vault.exists(entry.original) || !await vault.exists(entry.copy)) {
      entry.status = "missing";
      continue;
    }
    const same = hash(await vault.read(entry.original)) === entry.hash && hash(await vault.read(entry.copy)) === entry.copyHash;
    entry.status = same ? "copied" : "changed";
    if (same) ready.push(entry);
  }
  for (const entry of ready) {
    const archived = await vault.read(entry.copy);
    await vault.remove(entry.copy);
    await vault.move(entry.original, entry.copy);
    await vault.write(entry.copy, archived);
    entry.status = "moved";
  }
  await writeIndex(vault, entries);
  return entries;
}

// src/core/server.ts
var import_node_child_process = require("node:child_process");
var import_node_fs2 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path2 = require("node:path");
var STABLE_SERVER_PATH = (0, import_node_path2.join)((0, import_node_os.homedir)(), ".vault-memory", "obsidian_mcp_server.py");
var TIMEOUT_MS = 15e3;
async function installServer(source, path = STABLE_SERVER_PATH) {
  if (await import_node_fs2.promises.access(path).then(() => true, () => false)) return "kept";
  await import_node_fs2.promises.mkdir((0, import_node_path2.dirname)(path), { recursive: true });
  await import_node_fs2.promises.writeFile(path, source);
  return "installed";
}
var slashes = (path) => path.replace(/\\/g, "/");
function mcpSnippet(serverPath, vaultPath) {
  const entry = { brain: { command: "python", args: [slashes(serverPath)], env: { OBSIDIAN_VAULT: slashes(vaultPath) } } };
  return JSON.stringify(entry, null, 2);
}
function patchedSkill(skill, vaultPath) {
  return skill.replaceAll("<VAULT>", slashes(vaultPath));
}
function testServer(python, serverPath, vaultPath) {
  return new Promise((resolve, reject) => {
    const child = (0, import_node_child_process.spawn)(python, [serverPath], { env: { ...process.env, OBSIDIAN_VAULT: vaultPath } });
    let stdout = "";
    let stderr = "";
    let tools = [];
    const finish = (settle) => {
      clearTimeout(timer);
      child.kill();
      settle();
    };
    const fail = (message) => finish(() => reject(new Error(message)));
    const timer = setTimeout(() => fail(`No answer in ${TIMEOUT_MS / 1e3} seconds. ${stderr.slice(-300)}`), TIMEOUT_MS);
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}
`);
    child.on("error", (error) => fail(`Couldn't start ${python}: ${error.message}`));
    child.on("exit", (code) => fail(`The server exited with code ${code}. ${stderr.slice(-300)}`));
    child.stdin.on("error", () => void 0);
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      let end;
      while ((end = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, end).trim();
        stdout = stdout.slice(end + 1);
        if (!line) continue;
        const reply = JSON.parse(line);
        if (reply.error) return fail(reply.error.message);
        if (reply.id === 1) {
          send({ method: "notifications/initialized" });
          send({ id: 2, method: "tools/list" });
        } else if (reply.id === 2) {
          tools = reply.result.tools.map((tool) => tool.name);
          send({ id: 3, method: "tools/call", params: { name: "vault_info", arguments: {} } });
        } else if (reply.id === 3) {
          const vaultInfo = String(reply.result.content?.[0]?.text ?? "");
          finish(() => resolve({ tools, vaultInfo }));
        }
      }
    });
    send({
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vault-memory-plugin", version: "1.2.0" }
      }
    });
  });
}

// src/core/setup.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");

// src/core/plans-base.ts
var PLANS_BASE_PATH = "Project Plans/Plans Archive.base";
var PLANS_BASE = `filters:
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
`;

// src/core/setup.ts
var DEFAULT_VAULT_NAME = "brain";
var FOLDERS = ["Project Plans", "Project Plans/_Worktrees", "Imported Local Docs", "Archive"];
var TEMPLATES = {
  "Project Plans/_Worktrees/Registry.md": "---\ntype: index\n---\n\n# Worktree Registry\n\nMaps each repo to its worktrees. Git stays the source of truth.\n\n## <repo>\n\n- Path:\n- Branch:\n- Remote:\n",
  "Project Plans/_Worktrees/Prompts.md": "---\ntype: index\n---\n\n# Prompts\n\nSuggested next steps for each project.\n\n## <project>\n\n- \n",
  "Project Plans/README.md": "---\ntitle: Project Plans archive\ntype: index\n---\n\n# Project Plans archive\n\n![[Plans Archive.base]]\n",
  [PLANS_BASE_PATH]: PLANS_BASE
};
async function createPrerequisites(vault) {
  const created = [];
  for (const folder of FOLDERS) {
    if (await vault.exists(folder)) continue;
    await vault.mkdir(folder);
    created.push(`${folder}/`);
  }
  for (const [path, text] of Object.entries(TEMPLATES)) {
    if (await vault.exists(path)) continue;
    await vault.write(path, text);
    created.push(path);
  }
  return created;
}
function needsRenamePrompt(vaultPath) {
  return (0, import_node_path3.basename)(vaultPath) !== DEFAULT_VAULT_NAME;
}
async function renameVaultFolder(vaultPath) {
  const target = (0, import_node_path3.join)((0, import_node_path3.dirname)(vaultPath), DEFAULT_VAULT_NAME);
  if (await import_node_fs3.promises.access(target).then(() => true, () => false)) {
    throw new Error(`${target} already exists, so the vault can't take that name.`);
  }
  await import_node_fs3.promises.rename(vaultPath, target);
  return target;
}
async function createVault(parent, name) {
  const path = (0, import_node_path3.join)(parent, name);
  if (await import_node_fs3.promises.access(path).then(() => true, () => false)) throw new Error(`${path} already exists.`);
  await import_node_fs3.promises.mkdir(path, { recursive: true });
  await createPrerequisites(nodeVaultFs(path));
  return path;
}

// assets/obsidian_mcp_server.py
var obsidian_mcp_server_default = `"""
Obsidian vault MCP server (filesystem-backed).

Works with any MCP client over stdio.
Set OBSIDIAN_VAULT to the vault folder; the server won't start without it.
Does not require Obsidian to be running.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

if not os.environ.get("OBSIDIAN_VAULT"):
    raise SystemExit("Set OBSIDIAN_VAULT to your vault folder (see README.md)")
VAULT = Path(os.environ["OBSIDIAN_VAULT"]).expanduser().resolve()

mcp = FastMCP(
    "obsidian",
    instructions=(
        "Obsidian vault tools. "
        f"Vault root: {VAULT}. Paths are vault-relative using forward slashes "
        "(e.g. 'Welcome.md' or 'Folder/foo.md')."
    ),
)


def _safe_path(rel: str) -> Path:
    """Resolve a vault-relative path; block path escape."""
    rel = (rel or "").replace("\\\\", "/").lstrip("/")
    if not rel:
        raise ValueError("path is required")
    target = (VAULT / rel).resolve()
    try:
        target.relative_to(VAULT)
    except ValueError as e:
        raise ValueError(f"path escapes vault: {rel}") from e
    return target


def _rel(path: Path) -> str:
    return path.relative_to(VAULT).as_posix()


def _iter_md(max_files: int = 5000):
    n = 0
    for p in VAULT.rglob("*.md"):
        if any(part.startswith(".") for part in p.relative_to(VAULT).parts):
            # allow reading .obsidian only when explicitly path-addressed; skip in listings/search
            continue
        yield p
        n += 1
        if n >= max_files:
            break


@mcp.tool()
def vault_info() -> str:
    """Return vault path and basic stats (note counts, top-level folders)."""
    if not VAULT.exists():
        return f"Vault missing: {VAULT}"
    notes = list(_iter_md())
    tops = sorted(
        [p.name + ("/" if p.is_dir() else "") for p in VAULT.iterdir() if not p.name.startswith(".")]
    )
    return (
        f"vault: {VAULT}\\n"
        f"markdown_notes: {len(notes)}\\n"
        f"top_level: {', '.join(tops[:40])}"
    )


@mcp.tool()
def list_notes(path: str = "", recursive: bool = True, limit: int = 200) -> str:
    """List markdown notes under a vault-relative folder (default: vault root)."""
    root = VAULT if not path else _safe_path(path)
    if not root.exists():
        return f"Not found: {path or '/'}"
    if root.is_file():
        return _rel(root)
    items = []
    if recursive:
        for p in root.rglob("*.md"):
            if any(part.startswith(".") for part in p.relative_to(VAULT).parts):
                continue
            items.append(_rel(p))
            if len(items) >= limit:
                break
    else:
        for p in sorted(root.iterdir()):
            if p.name.startswith("."):
                continue
            if p.is_dir():
                items.append(_rel(p) + "/")
            elif p.suffix.lower() == ".md":
                items.append(_rel(p))
            if len(items) >= limit:
                break
    return "\\n".join(items) if items else "(empty)"


@mcp.tool()
def read_note(path: str) -> str:
    """Read a note's full markdown content by vault-relative path."""
    p = _safe_path(path)
    if not p.exists():
        return f"ERROR: note not found: {path}"
    if not p.is_file():
        return f"ERROR: not a file: {path}"
    text = p.read_text(encoding="utf-8", errors="replace")
    return f"--- path: {_rel(p)} ---\\n{text}"


@mcp.tool()
def write_note(path: str, content: str, overwrite: bool = False) -> str:
    """Create or overwrite a markdown note. Refuses overwrite unless overwrite=true."""
    p = _safe_path(path)
    if p.exists() and not overwrite:
        return (
            f"ERROR: exists (set overwrite=true to replace): {_rel(p)}. "
            "Use append_note or patch-style edit instead."
        )
    p.parent.mkdir(parents=True, exist_ok=True)
    if not str(p).lower().endswith(".md"):
        # still allow non-md if user insists, but default to .md
        pass
    p.write_text(content, encoding="utf-8")
    return f"Wrote {_rel(p)} ({len(content.splitlines())} lines, {p.stat().st_size} bytes)"


@mcp.tool()
def append_note(path: str, content: str, create_if_missing: bool = True) -> str:
    """Append markdown to a note (creates file if missing when create_if_missing=true)."""
    p = _safe_path(path)
    if not p.exists():
        if not create_if_missing:
            return f"ERROR: missing: {path}"
        p.parent.mkdir(parents=True, exist_ok=True)
        existing = ""
    else:
        existing = p.read_text(encoding="utf-8", errors="replace")
    sep = "" if not existing or existing.endswith("\\n") else "\\n"
    new = existing + sep + content
    if not content.endswith("\\n"):
        new += "\\n"
    p.write_text(new, encoding="utf-8")
    return f"Appended to {_rel(p)} (now {p.stat().st_size} bytes)"


@mcp.tool()
def search_notes(query: str, limit: int = 25, case_sensitive: bool = False) -> str:
    """Full-text search across markdown notes. Returns path + matching line snippets."""
    if not query or not query.strip():
        return "ERROR: query required"
    flags = 0 if case_sensitive else re.IGNORECASE
    try:
        rx = re.compile(re.escape(query) if len(query) < 3 else query, flags)
    except re.error:
        rx = re.compile(re.escape(query), flags)

    hits = []
    for p in _iter_md():
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        matched_lines = []
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                matched_lines.append(f"  L{i}: {line.strip()[:200]}")
                if len(matched_lines) >= 5:
                    break
        if matched_lines:
            hits.append(f"{_rel(p)}\\n" + "\\n".join(matched_lines))
            if len(hits) >= limit:
                break
    if not hits:
        return f"No matches for: {query!r}"
    return f"Found {len(hits)} note(s) for {query!r}:\\n\\n" + "\\n\\n".join(hits)


@mcp.tool()
def list_tags(limit: int = 100) -> str:
    """Scan vault for #tags and frontmatter tags; return counts."""
    tag_re = re.compile(r"(?<!\\w)#([A-Za-z0-9_/\\-]+)")
    counts: dict[str, int] = {}
    for p in _iter_md():
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        # strip fenced code roughly
        body = re.sub(r"\`\`\`.*?\`\`\`", "", text, flags=re.S)
        for m in tag_re.finditer(body):
            t = m.group(1).lower()
            counts[t] = counts.get(t, 0) + 1
        # frontmatter tags:
        if body.startswith("---"):
            end = body.find("\\n---", 3)
            if end > 0:
                fm = body[3:end]
                for m in re.finditer(r"(?m)^\\s*-\\s*([A-Za-z0-9_/\\-]+)\\s*$", fm):
                    # only count if under a tags: key roughly \u2014 still useful
                    t = m.group(1).lower()
                    counts[t] = counts.get(t, 0) + 1
                m2 = re.search(r"(?mi)^tags:\\s*\\[([^\\]]*)\\]", fm)
                if m2:
                    for part in m2.group(1).split(","):
                        t = part.strip().strip("\\"'").lower()
                        if t:
                            counts[t] = counts.get(t, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    if not ranked:
        return "No tags found"
    return "\\n".join(f"#{t}  {n}" for t, n in ranked)


@mcp.tool()
def daily_note(date: Optional[str] = None, content: Optional[str] = None, append: bool = True) -> str:
    """Read or write the daily note. date=YYYY-MM-DD (default today local). If content set, write/append."""
    from datetime import datetime

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    # Prefer existing patterns in this vault
    candidates = [
        VAULT / f"{date}.md",
        VAULT / "daily" / f"{date}.md",
        VAULT / "Daily" / f"{date}.md",
        VAULT / "Journal" / f"{date}.md",
    ]
    target = None
    for c in candidates:
        if c.exists():
            target = c
            break
    if target is None:
        target = candidates[0]

    if content is None:
        if not target.exists():
            return f"No daily note yet for {date} (would be {_rel(target)})"
        return f"--- path: {_rel(target)} ---\\n" + target.read_text(encoding="utf-8", errors="replace")

    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and append:
        existing = target.read_text(encoding="utf-8", errors="replace")
        sep = "" if existing.endswith("\\n") else "\\n"
        target.write_text(existing + sep + content + ("" if content.endswith("\\n") else "\\n"), encoding="utf-8")
        return f"Appended to {_rel(target)}"
    header = f"# {date}\\n\\n" if not target.exists() else ""
    target.write_text(header + content + ("" if content.endswith("\\n") else "\\n"), encoding="utf-8")
    return f"Wrote {_rel(target)}"


if __name__ == "__main__":
    if not VAULT.exists():
        raise SystemExit(f"OBSIDIAN_VAULT does not exist: {VAULT}")
    mcp.run(transport="stdio")`;

// assets/SKILL.md
var SKILL_default = '---\nname: vault-memory\ndescription: Use the Obsidian vault as agentic memory. Before answering project, worktree, or planning questions, search the vault for relevant notes; prefer vault summaries and status notes over raw repo files; sort and filter by project, date range, and status. Use at the start of repo/worktree tasks and when asked about plans, status, history, or next steps.\n---\n\n# Vault Memory\n\n## Purpose\nThe Obsidian vault (`<VAULT>`) is the human-readable memory layer for this workspace. Use it to recover context, decisions, and status before acting on a repo or worktree.\n\n## When to use\n- At the start of any task involving a repo, worktree, branch, or project.\n- When asked about plans, status, history, or "what\'s been done".\n- Before proposing changes, to align with documented decisions and rules.\n- When a worktree or branch name is mentioned.\n\n## How to query the vault\n- Use `brain.search_notes` with the project name, repo name, branch name, or worktree directory name.\n- Use `brain.list_notes` under `Project Plans/<Project>` to find plan/status notes.\n- Read the newest status note first (date is in the folder/note name).\n- Use `brain.read_note` for full content when a note is relevant.\n- Check `Project Plans/_Worktrees/Registry.md` for repo/worktree mapping.\n- Check `Project Plans/_Worktrees/Prompts.md` for suggested next steps.\n- If the `brain.*` tools are not available, read the vault as plain Markdown files: grep/search under `<VAULT>` and read the matching `.md` files directly.\n\n## Sorting and filtering guidance\n- Prefer notes under `Project Plans/<Project>/<date range>/`.\n- Status notes (`*- status.md`) are the source of truth for current state.\n- `AGENTS.md` / `RULES.md` copies are contracts, not status.\n- `Imported Local Docs/` contains repo-level docs not otherwise in the vault.\n- Worktree directory names and branch names are searchable keys.\n- If multiple notes match, prefer the most recent date and the one whose title matches the repo/project exactly.\n\n## Output expectations\n- Cite vault note paths in answers when relying on them.\n- If no vault note exists for the topic, say so explicitly and suggest importing the relevant local doc.\n- Do not paste large raw repo files when a vault summary exists.\n\n## Safety\n- The vault is context, not source of truth for code. Always verify against the actual repo/worktree before editing.\n- Do not write secrets or credentials into vault notes.\n';

// src/main.ts
var DEFAULTS = { serverPath: "", python: "python" };
function ask(app, title2, text, buttons) {
  const modal = new import_obsidian.Modal(app);
  modal.titleEl.setText(title2);
  for (const paragraph of text.split("\n\n")) modal.contentEl.createEl("p", { text: paragraph });
  const row = new import_obsidian.Setting(modal.contentEl);
  for (const [label, action] of Object.entries(buttons)) {
    row.addButton(
      (button) => button.setButtonText(label).onClick(() => {
        modal.close();
        void Promise.resolve(action()).catch((error) => new import_obsidian.Notice(error.message, 1e4));
      })
    );
  }
  modal.open();
}
function showText(app, title2, text) {
  const modal = new import_obsidian.Modal(app);
  modal.titleEl.setText(title2);
  modal.contentEl.createEl("pre", { text }).style.whiteSpace = "pre-wrap";
  new import_obsidian.Setting(modal.contentEl).addButton(
    (button) => button.setButtonText("Copy").onClick(() => void navigator.clipboard.writeText(text))
  );
  modal.open();
}
var VaultMemoryPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULTS };
  }
  get vaultPath() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian.FileSystemAdapter)) throw new Error("Vault Memory needs a desktop vault.");
    return adapter.getBasePath();
  }
  /** Inside Obsidian, moves go through the file manager so that links follow the note. */
  get vault() {
    const plain = nodeVaultFs(this.vaultPath);
    return {
      ...plain,
      // Goes through the vault so its index drops the file before a move takes over the path.
      remove: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof import_obsidian.TFile ? this.app.vault.delete(file) : plain.remove(path);
      },
      move: async (from, to) => {
        const file = this.app.vault.getAbstractFileByPath(from);
        if (!(file instanceof import_obsidian.TFile)) return plain.move(from, to);
        await plain.mkdir(to.slice(0, to.lastIndexOf("/")));
        await this.app.fileManager.renameFile(file, to);
      }
    };
  }
  async onload() {
    this.settings = { ...DEFAULTS, ...await this.loadData() };
    this.addSettingTab(new VaultMemorySettings(this.app, this));
    const commands = [
      ["initialize", "Initialize vault", () => this.initialize()],
      ["sort-archive", "Sort existing notes into archive", () => this.sortIntoArchive()],
      ["apply-moves", "Apply reviewed archive moves", () => this.confirmMoves()],
      ["status", "Show status and config", () => this.showStatus()],
      ["test-server", "Test server (headless)", () => this.testServer()]
    ];
    for (const [id, name, run] of commands) {
      this.addCommand({
        id,
        name,
        callback: () => void Promise.resolve(run()).catch((error) => new import_obsidian.Notice(error.message, 1e4))
      });
    }
  }
  async save() {
    await this.saveData(this.settings);
  }
  initialize() {
    const path = this.vaultPath;
    ask(this.app, "Vault Memory setup", `This vault is "${(0, import_node_path4.basename)(path)}" at ${path}.`, {
      "Use this vault": () => this.useThisVault(),
      "Create new vault": () => this.promptNewVault()
    });
  }
  promptNewVault() {
    const parent = (0, import_node_path4.dirname)(this.vaultPath);
    const modal = new import_obsidian.Modal(this.app);
    let name = DEFAULT_VAULT_NAME;
    modal.titleEl.setText("Create new vault");
    new import_obsidian.Setting(modal.contentEl).setName("Name").setDesc(`Created in ${parent}`).addText((text) => text.setValue(name).onChange((value) => name = value.trim()));
    new import_obsidian.Setting(modal.contentEl).addButton(
      (button) => button.setButtonText("Create").onClick(() => {
        modal.close();
        void this.createNewVault(parent, name).catch((error) => new import_obsidian.Notice(error.message, 1e4));
      })
    );
    modal.open();
  }
  async createNewVault(parent, name) {
    if (!name || /[\\/]/.test(name)) throw new Error("Enter a folder name, not a path.");
    const path = await createVault(parent, name);
    ask(this.app, "Vault created", `Created ${path} with the prerequisite folders. Choose "Open folder as vault" and select it.`, {
      OK: () => this.app.openVaultChooser?.()
    });
    this.showClientSetup(path);
  }
  async useThisVault() {
    const path = this.vaultPath;
    if (!needsRenamePrompt(path)) {
      await this.finishSetup();
      return this.showClientSetup(path);
    }
    ask(
      this.app,
      `Rename to "${DEFAULT_VAULT_NAME}"?`,
      `The skill and MCP config expect a vault named "${DEFAULT_VAULT_NAME}".

Any other name needs edits to SKILL.md (2 places) and to OBSIDIAN_VAULT in your MCP config. If you keep "${(0, import_node_path4.basename)(path)}", the plugin will write those edits out for you.`,
      {
        "Rename folder": () => this.renameThisVault(),
        [`Keep "${(0, import_node_path4.basename)(path)}"`]: async () => {
          await this.finishSetup();
          this.showClientSetup(path);
        }
      }
    );
  }
  async renameThisVault() {
    await this.finishSetup();
    const path = this.vaultPath;
    this.showClientSetup((0, import_node_path4.join)((0, import_node_path4.dirname)(path), DEFAULT_VAULT_NAME));
    try {
      const target = await renameVaultFolder(path);
      new import_obsidian.Notice(`Renamed to ${target}. Reopen it with "Open folder as vault".`, 15e3);
      this.app.openVaultChooser?.();
    } catch (error) {
      new import_obsidian.Notice(
        `The folder couldn't be renamed while open: ${error.message}. Close this vault, rename the folder, then reopen it. The setup is otherwise finished.`,
        2e4
      );
    }
  }
  /** The filled-in client config and skill. `<VAULT>` needs replacing whatever the vault is called. */
  showClientSetup(vaultPath) {
    showText(
      this.app,
      "Client setup",
      `MCP client config:

${mcpSnippet(this.settings.serverPath || STABLE_SERVER_PATH, vaultPath)}

SKILL.md:

${patchedSkill(SKILL_default, vaultPath)}`
    );
  }
  async finishSetup() {
    const created = await createPrerequisites(this.vault);
    const server = await this.ensureServer();
    new import_obsidian.Notice(`Vault Memory: created ${created.length} items. Server ${server}.`, 8e3);
    const { notes } = await scan(this.vault);
    if (notes.length > 0) {
      ask(this.app, "Sort existing notes?", `${notes.length} notes are outside the standard folders. Sort them into the archive now?`, {
        "Review the plan": () => this.sortIntoArchive(),
        "Not now": () => void 0
      });
    }
  }
  /** A path the user gave stays as it is. Otherwise the bundled server goes to a stable path. */
  async ensureServer() {
    if (this.settings.serverPath) return `kept at ${this.settings.serverPath}`;
    const result = await installServer(obsidian_mcp_server_default);
    this.settings.serverPath = STABLE_SERVER_PATH;
    await this.save();
    return `${result} at ${STABLE_SERVER_PATH}`;
  }
  async sortIntoArchive() {
    const plan = await scan(this.vault);
    const skipped = plan.skipped.length ? ` ${plan.skipped.length} over 25 MB will be skipped.` : "";
    ask(
      this.app,
      "Sort notes into the archive?",
      `${plan.notes.length} notes will be copied into Archive/, grouped by title and then by two-week period, and logged in ${INDEX_NOTE}.${skipped}

No original is moved or changed. Moving them is a separate step, after you've reviewed the result.`,
      {
        "Copy to archive": async () => {
          const entries = await copyToArchive(this.vault, plan);
          new import_obsidian.Notice(`Copied. ${entries.length} notes are logged in ${INDEX_NOTE}.`, 1e4);
          await this.app.workspace.openLinkText(INDEX_NOTE, "", true);
        },
        Cancel: () => void 0
      }
    );
  }
  async confirmMoves() {
    const entries = await readEntries(this.vault);
    const waiting = entries.filter((entry) => entry.status !== "moved").length;
    if (waiting === 0) return void new import_obsidian.Notice("No archive moves are waiting.");
    ask(
      this.app,
      "Apply archive moves?",
      `${waiting} originals will be moved over their archive copies. Notes edited since copying are left alone and marked "changed". Links to moved notes are updated.`,
      {
        "Apply moves": async () => {
          const result = await applyMoves(this.vault);
          const count = (status) => result.filter((entry) => entry.status === status).length;
          new import_obsidian.Notice(`Moved ${count("moved")}. Changed ${count("changed")}. Missing ${count("missing")}.`, 1e4);
        },
        Cancel: () => void 0
      }
    );
  }
  async showStatus() {
    const { notes } = await scan(this.vault);
    const entries = await readEntries(this.vault);
    const server = this.settings.serverPath;
    const installed = server && await import_node_fs4.promises.access(server).then(() => true, () => false);
    showText(
      this.app,
      "Vault Memory status",
      [
        `Vault: ${this.vaultPath}`,
        `Server: ${server || "not set"}${server && !installed ? " (missing)" : ""}`,
        `Python: ${this.settings.python}`,
        `Notes outside standard folders: ${notes.length}`,
        `Archive entries: ${entries.length}`,
        "",
        mcpSnippet(server || STABLE_SERVER_PATH, this.vaultPath)
      ].join("\n")
    );
  }
  async testServer() {
    if (!this.settings.serverPath) await this.ensureServer();
    new import_obsidian.Notice("Testing the server\u2026");
    const result = await testServer(this.settings.python, this.settings.serverPath, this.vaultPath);
    showText(this.app, "Server test passed", `Tools: ${result.tools.join(", ")}

${result.vaultInfo}`);
  }
};
var VaultMemorySettings = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Server path").setDesc(`Full path to obsidian_mcp_server.py. Leave empty to install the bundled copy at ${(0, import_node_path4.join)("~", ".vault-memory")}.`).addText(
      (text) => text.setValue(this.plugin.settings.serverPath).onChange(async (value) => {
        this.plugin.settings.serverPath = value.trim();
        await this.plugin.save();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Python").setDesc("The interpreter that has the mcp package installed.").addText(
      (text) => text.setValue(this.plugin.settings.python).onChange(async (value) => {
        this.plugin.settings.python = value.trim() || DEFAULTS.python;
        await this.plugin.save();
      })
    );
    const actions = [
      ["Initialize vault", () => this.plugin.initialize()],
      ["Sort existing notes", () => this.plugin.sortIntoArchive()],
      ["Show status", () => this.plugin.showStatus()],
      ["Test server", () => this.plugin.testServer()]
    ];
    const row = new import_obsidian.Setting(containerEl).setName("Actions");
    for (const [label, run] of actions) {
      row.addButton(
        (button) => button.setButtonText(label).onClick(() => void Promise.resolve(run()).catch((error) => new import_obsidian.Notice(error.message, 1e4)))
      );
    }
  }
};
