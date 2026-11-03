"""
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
    rel = (rel or "").replace("\\", "/").lstrip("/")
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
        f"vault: {VAULT}\n"
        f"markdown_notes: {len(notes)}\n"
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
    return "\n".join(items) if items else "(empty)"


@mcp.tool()
def read_note(path: str) -> str:
    """Read a note's full markdown content by vault-relative path."""
    p = _safe_path(path)
    if not p.exists():
        return f"ERROR: note not found: {path}"
    if not p.is_file():
        return f"ERROR: not a file: {path}"
    text = p.read_text(encoding="utf-8", errors="replace")
    return f"--- path: {_rel(p)} ---\n{text}"


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
    sep = "" if not existing or existing.endswith("\n") else "\n"
    new = existing + sep + content
    if not content.endswith("\n"):
        new += "\n"
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
            hits.append(f"{_rel(p)}\n" + "\n".join(matched_lines))
            if len(hits) >= limit:
                break
    if not hits:
        return f"No matches for: {query!r}"
    return f"Found {len(hits)} note(s) for {query!r}:\n\n" + "\n\n".join(hits)


@mcp.tool()
def list_tags(limit: int = 100) -> str:
    """Scan vault for #tags and frontmatter tags; return counts."""
    tag_re = re.compile(r"(?<!\w)#([A-Za-z0-9_/\-]+)")
    counts: dict[str, int] = {}
    for p in _iter_md():
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        # strip fenced code roughly
        body = re.sub(r"```.*?```", "", text, flags=re.S)
        for m in tag_re.finditer(body):
            t = m.group(1).lower()
            counts[t] = counts.get(t, 0) + 1
        # frontmatter tags:
        if body.startswith("---"):
            end = body.find("\n---", 3)
            if end > 0:
                fm = body[3:end]
                for m in re.finditer(r"(?m)^\s*-\s*([A-Za-z0-9_/\-]+)\s*$", fm):
                    # only count if under a tags: key roughly — still useful
                    t = m.group(1).lower()
                    counts[t] = counts.get(t, 0) + 1
                m2 = re.search(r"(?mi)^tags:\s*\[([^\]]*)\]", fm)
                if m2:
                    for part in m2.group(1).split(","):
                        t = part.strip().strip("\"'").lower()
                        if t:
                            counts[t] = counts.get(t, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    if not ranked:
        return "No tags found"
    return "\n".join(f"#{t}  {n}" for t, n in ranked)


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
        return f"--- path: {_rel(target)} ---\n" + target.read_text(encoding="utf-8", errors="replace")

    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and append:
        existing = target.read_text(encoding="utf-8", errors="replace")
        sep = "" if existing.endswith("\n") else "\n"
        target.write_text(existing + sep + content + ("" if content.endswith("\n") else "\n"), encoding="utf-8")
        return f"Appended to {_rel(target)}"
    header = f"# {date}\n\n" if not target.exists() else ""
    target.write_text(header + content + ("" if content.endswith("\n") else "\n"), encoding="utf-8")
    return f"Wrote {_rel(target)}"


if __name__ == "__main__":
    if not VAULT.exists():
        raise SystemExit(f"OBSIDIAN_VAULT does not exist: {VAULT}")
    mcp.run(transport="stdio")