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


# ---------------------------------------------------------------------------
# Czkawka scoped cache (precached JSON payloads)
#
# Instead of running a full czkawka search on every agent turn, scans are run
# once per *scope* (mode + roots + exclusions) and the result is cached as a
# scoped JSON file under the cache directory. Agents read the cache; scans only
# happen on an explicit czkawka_scan / refresh. This keeps large system scans
# out of the agent's context and makes repeated queries cheap.
# ---------------------------------------------------------------------------
import hashlib
import json as _json
import os as _os
import shutil as _shutil
import subprocess as _subprocess
import tempfile as _tempfile
from datetime import datetime, timezone

CZKAWKA_CLI = _os.environ.get("CZKAWKA_CLI", "czkawka_cli")
CZKAWKA_CACHE_DIR = Path(
    _os.environ.get("CZKAWKA_CACHE_DIR", str(VAULT / "Project Plans" / "Czkawka"))
)
CZKAWKA_ALLOW_SCAN = _os.environ.get("CZKAWKA_ALLOW_SCAN", "").lower() in ("1", "true", "yes")
CZKAWKA_PRUNE_DAYS = int(_os.environ.get("CZKAWKA_PRUNE_DAYS", "14"))
CZKAWKA_PRUNE_COUNT = int(_os.environ.get("CZKAWKA_PRUNE_COUNT", "20"))
CZKAWKA_QUARANTINE = CZKAWKA_CACHE_DIR / "quarantine"


def _ensure_cache_dir() -> None:
    CZKAWKA_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _index_path() -> Path:
    return CZKAWKA_CACHE_DIR / "index.json"


def _load_index() -> dict:
    p = _index_path()
    if not p.exists():
        return {"scopes": {}}
    try:
        return _json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"scopes": {}}


def _save_index(index: dict) -> None:
    _ensure_cache_dir()
    target = _index_path()
    fd, tmp = _tempfile.mkstemp(prefix=".index.", dir=str(CZKAWKA_CACHE_DIR))
    try:
        with _os.fdopen(fd, "w", encoding="utf-8") as f:
            _json.dump(index, f, indent=2)
            f.write("\n")
        _os.replace(tmp, target)
    finally:
        try:
            _os.remove(tmp)
        except OSError:
            pass


def _scope_slug(mode: str, roots: list[str], excludes: list[str]) -> str:
    key = _json.dumps({"mode": mode, "roots": sorted(roots), "excludes": sorted(excludes)}, sort_keys=True)
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:8]
    base = (mode + "-" + (roots[0] if roots else "noroot").replace("\\", "/").rsplit("/", 1)[-1])[:24]
    base = "".join(c if c.isalnum() or c in "-_" else "-" for c in base).strip("-") or "scope"
    return f"{base}-{h}"


def _cache_path(slug: str) -> Path:
    return CZKAWKA_CACHE_DIR / f"cache.{slug}.json"


def _lock_path(slug: str) -> Path:
    return CZKAWKA_CACHE_DIR / f".{slug}.lock"


def _read_cache(slug: str) -> tuple[dict | None, str]:
    p = _cache_path(slug)
    if not p.exists():
        return None, f"ERROR: cache not found for scope {slug!r} ({p})"
    try:
        return _json.loads(p.read_text(encoding="utf-8")), str(p)
    except (OSError, ValueError) as e:
        return None, f"ERROR: could not read cache {p}: {e}"


def _czkawka_available() -> bool:
    return _shutil.which(CZKAWKA_CLI) is not None


@mcp.tool()
def czkawka_cache_status() -> str:
    """Return cache directory, binary availability, and scope counts."""
    _ensure_cache_dir()
    index = _load_index()
    scopes = index.get("scopes", {})
    lines = [
        f"czkawka_cli: {CZKAWKA_CLI} ({'found' if _czkawka_available() else 'NOT FOUND'})",
        f"cache_dir: {CZKAWKA_CACHE_DIR}",
        f"allow_scan: {CZKAWKA_ALLOW_SCAN}",
        f"prune_days: {CZKAWKA_PRUNE_DAYS}",
        f"prune_count: {CZKAWKA_PRUNE_COUNT}",
        f"scopes: {len(scopes)}",
    ]
    for slug, meta in scopes.items():
        lines.append(
            f"  {slug}: mode={meta.get('mode')} roots={meta.get('roots')} "
            f"mtime={meta.get('mtime')} entries={meta.get('entries')}"
        )
    return "\n".join(lines)


@mcp.tool()
def czkawka_scopes() -> str:
    """List cached scopes (slug, mode, roots, mtime, entry count)."""
    _ensure_cache_dir()
    index = _load_index()
    scopes = index.get("scopes", {})
    if not scopes:
        return "(no cached scopes; run czkawka_scan to create one)"
    out = []
    for slug, meta in scopes.items():
        out.append(
            f"{slug}\tmode={meta.get('mode')}\troots={','.join(meta.get('roots', []))}\t"
            f"mtime={meta.get('mtime')}\tentries={meta.get('entries')}"
        )
    return "\n".join(out)


@mcp.tool()
def czkawka_scan(
    mode: str = "dup",
    roots: str = "",
    excludes: str = "",
    min_size: int = 8192,
    limit_files: int = 0,
    dry_run: bool = True,
) -> str:
    """Run czkawka_cli for one scope and cache the result as a scoped JSON.

    mode: dup | big | empty-folders | empty-files | temp
    roots: comma-separated absolute directories to scan
    excludes: comma-separated directories to exclude
    Only runs if CZKAWKA_ALLOW_SCAN is enabled; otherwise returns a refusal.
    Regenerates (replaces) any existing cache for the same scope.
    """
    if not CZKAWKA_ALLOW_SCAN:
        return (
            "ERROR: scanning disabled. Set CZKAWKA_ALLOW_SCAN=1 in the server env to enable "
            "czkawka_scan. Reads from existing caches are always available."
        )
    if not _czkawka_available():
        return f"ERROR: czkawka_cli not found ({CZKAWKA_CLI}). Install it and set CZKAWKA_CLI."
    root_list = [r.strip() for r in roots.split(",") if r.strip()]
    if not root_list:
        return "ERROR: at least one root directory is required"
    exclude_list = [e.strip() for e in excludes.split(",") if e.strip()]
    mode = mode.strip().lower()
    if mode not in ("dup", "big", "empty-folders", "empty-files", "temp"):
        return f"ERROR: unsupported mode {mode!r}"
    slug = _scope_slug(mode, root_list, exclude_list)
    _ensure_cache_dir()
    lock = _lock_path(slug)
    # simple lock
    try:
        fd = _os.open(str(lock), _os.O_CREAT | _os.O_EXCL | _os.O_WRONLY)
        _os.close(fd)
    except FileExistsError:
        return f"ERROR: scan already in progress for scope {slug}"
    try:
        cache = _cache_path(slug)
        # delete prior cache for regeneration
        try:
            cache.unlink(missing_ok=True)
        except OSError:
            pass
        cmd = [CZKAWKA_CLI, mode]
        for r in root_list:
            cmd += ["-d", r]
        for e in exclude_list:
            cmd += ["-e", e]
        cmd += ["-C", str(cache), "-N", "-M"]
        if mode == "dup":
            cmd += ["-m", str(min_size)]
        elif mode == "big":
            cmd += ["-n", str(limit_files or 1000)]
        proc = _subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if proc.returncode not in (0, 11):
            return f"ERROR: czkawka_cli failed (rc={proc.returncode}): {proc.stderr.strip()[:500]}"
        # count entries
        entries = 0
        try:
            data = _json.loads(cache.read_text(encoding="utf-8"))
            if isinstance(data, list):
                entries = len(data)
            elif isinstance(data, dict):
                # czkawka dup schema: {size: [[{path,...}, ...], ...]}
                for v in data.values():
                    if isinstance(v, list):
                        entries += len(v)
                if entries == 0:
                    entries = len(data)
        except (OSError, ValueError):
            entries = -1
        index = _load_index()
        index.setdefault("scopes", {})[slug] = {
            "mode": mode,
            "roots": root_list,
            "excludes": exclude_list,
            "mtime": datetime.now(timezone.utc).isoformat(),
            "entries": entries,
            "cache": str(cache.relative_to(VAULT)),
        }
        _save_index(index)
        return (
            f"Scanned scope {slug}: mode={mode} roots={root_list} entries={entries} "
            f"cache={cache}"
        )
    finally:
        try:
            lock.unlink(missing_ok=True)
        except OSError:
            pass


@mcp.tool()
def czkawka_duplicates(scope: str, path_contains: str = "", min_size: int = 0, limit: int = 50) -> str:
    """Read duplicate groups from a cached scope. Returns slices, not the whole cache."""
    data, info = _read_cache(scope)
    if data is None:
        return info
    # czkawka dup schema: {size_str: [[{path, size, hash, modified_date}, ...], ...]}
    groups = []
    if isinstance(data, dict):
        for size_key, grp_list in data.items():
            if not isinstance(grp_list, list):
                continue
            for grp in grp_list:
                if isinstance(grp, list) and len(grp) >= 2:
                    groups.append(grp)
    elif isinstance(data, list):
        groups = [g for g in data if isinstance(g, list) and len(g) >= 2]
    out = []
    shown = 0
    for grp in groups:
        files = [ (g.get("path") if isinstance(g, dict) else str(g)) for g in grp ]
        size = grp[0].get("size") if (grp and isinstance(grp[0], dict)) else None
        hsh = grp[0].get("hash") if (grp and isinstance(grp[0], dict)) else None
        if min_size and size is not None and int(size) < min_size:
            continue
        if path_contains:
            files = [f for f in files if path_contains.lower() in str(f).lower()]
        if not files or len(files) < 2:
            continue
        out.append(f"group size={size} hash={str(hsh)[:12]}")
        for f in files[:10]:
            out.append(f"  {f}")
        if len(files) > 10:
            out.append(f"  ... +{len(files) - 10} more")
        shown += 1
        if shown >= limit:
            break
    if not out:
        return f"No duplicate groups matching filters in scope {scope!r}."
    out.insert(0, f"scope={scope} groups_shown={shown} (limit={limit})")
    return "\n".join(out)


@mcp.tool()
def czkawka_big_files(scope: str, limit: int = 25) -> str:
    """Read the biggest files from a cached scope."""
    data, info = _read_cache(scope)
    if data is None:
        return info
    items = data if isinstance(data, list) else data.get("big_files", data.get("BigFiles", []))
    if not isinstance(items, list):
        items = []
    items = sorted(items, key=lambda x: int(x.get("size", x.get("Size", 0)) or 0), reverse=True)[:limit]
    out = [f"scope={scope} top={len(items)}"]
    for it in items:
        out.append(f"{it.get('size', it.get('Size'))}\t{it.get('path', it.get('Path', it.get('name', '')))}")
    return "\n".join(out) if len(out) > 1 else f"No big files in scope {scope!r}."


@mcp.tool()
def czkawka_empty_dirs(scope: str, limit: int = 100) -> str:
    """Read empty directories from a cached scope."""
    data, info = _read_cache(scope)
    if data is None:
        return info
    items = data if isinstance(data, list) else data.get("empty_folders", data.get("EmptyFolders", []))
    if not isinstance(items, list):
        items = []
    out = [f"scope={scope} count={len(items)} (showing {min(limit, len(items))})"]
    for it in items[:limit]:
        out.append(str(it.get("path", it.get("Path", it)) if isinstance(it, dict) else it))
    return "\n".join(out)


@mcp.tool()
def czkawka_prune(older_than_days: int = 0, max_scopes: int = 0) -> str:
    """Delete stale scoped caches. Defaults to CZKAWKA_PRUNE_DAYS / CZKAWKA_PRUNE_COUNT."""
    days = older_than_days or CZKAWKA_PRUNE_DAYS
    cap = max_scopes or CZKAWKA_PRUNE_COUNT
    _ensure_cache_dir()
    index = _load_index()
    scopes = index.get("scopes", {})
    now = datetime.now(timezone.utc)
    removed = []
    # age-based
    for slug, meta in list(scopes.items()):
        mtime = meta.get("mtime")
        try:
            mt = datetime.fromisoformat(mtime.replace("Z", "+00:00")) if mtime else None
        except (AttributeError, ValueError):
            mt = None
        if mt is not None and (now - mt).days >= days:
            p = _cache_path(slug)
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
            removed.append(slug)
            scopes.pop(slug, None)
    # count-based
    if len(scopes) > cap:
        ordered = sorted(scopes.items(), key=lambda kv: kv[1].get("mtime", ""), reverse=True)
        for slug, _ in ordered[cap:]:
            p = _cache_path(slug)
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
            removed.append(slug)
            scopes.pop(slug, None)
    index["scopes"] = scopes
    _save_index(index)
    return f"Pruned {len(removed)} scope(s): {removed}" if removed else "Nothing to prune."


@mcp.tool()
def czkawka_quarantine(scope: str, path: str, dry_run: bool = True) -> str:
    """Move a file into the quarantine folder for that scope (never deletes).

    dry_run=True (default) reports what would happen without moving anything.
    """
    import shutil as _sh
    src = Path(path)
    if not src.exists() or not src.is_file():
        return f"ERROR: file not found: {path}"
    try:
        src.resolve().relative_to(VAULT)
    except ValueError:
        # allow quarantining files outside vault only if explicitly under an allowed root;
        # here we require the path to be inside the vault for safety.
        return f"ERROR: path must be inside the vault for quarantine via this server: {path}"
    dest_dir = CZKAWKA_QUARANTINE / scope
    dest = dest_dir / src.name
    if dry_run:
        return f"DRY RUN: would move {src} -> {dest}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    # avoid clobber
    n = 2
    while dest.exists():
        dest = dest_dir / f"{src.stem} ({n}){src.suffix}"
        n += 1
    _sh.move(str(src), str(dest))
    # manifest
    manifest = dest_dir / "manifest.json"
    try:
        data = _json.loads(manifest.read_text()) if manifest.exists() else {"moved": []}
    except (OSError, ValueError):
        data = {"moved": []}
    data["moved"].append({"from": str(src), "to": str(dest), "at": datetime.now(timezone.utc).isoformat()})
    manifest.write_text(_json.dumps(data, indent=2))
    return f"Quarantined: {src} -> {dest}"


if __name__ == "__main__":
    if not VAULT.exists():
        raise SystemExit(f"OBSIDIAN_VAULT does not exist: {VAULT}")
    mcp.run(transport="stdio")