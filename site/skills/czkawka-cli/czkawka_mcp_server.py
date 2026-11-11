"""
Czkawka MCP server (standalone, no vault/Obsidian dependency).

Works with any MCP client over stdio. Provides scoped, precached czkawka audits.

Env:
  CZKAWKA_CLI          path to czkawka_cli (default: czkawka_cli)
  CZKAWKA_CACHE_DIR    cache directory (default: ~/.czkawka-agent)
  CZKAWKA_ALLOW_SCAN   set to 1 to enable scanning (default off)
  CZKAWKA_ROOTS        comma-separated default roots for auto-cache (optional)
  CZKAWKA_PRUNE_DAYS   default 14
  CZKAWKA_PRUNE_COUNT  default 20
  OBSIDIAN_VAULT       if set and the vault MCP is reachable, consolidated mode
                       delegates cache reads/writes to it (optional).
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from mcp.server.fastmcp import FastMCP

CZKAWKA_CLI = os.environ.get("CZKAWKA_CLI", "czkawka_cli")
CZKAWKA_CACHE_DIR = Path(os.environ.get("CZKAWKA_CACHE_DIR", str(Path.home() / ".czkawka-agent"))).expanduser().resolve()
CZKAWKA_ALLOW_SCAN = os.environ.get("CZKAWKA_ALLOW_SCAN", "").lower() in ("1", "true", "yes")
CZKAWKA_PRUNE_DAYS = int(os.environ.get("CZKAWKA_PRUNE_DAYS", "14"))
CZKAWKA_PRUNE_COUNT = int(os.environ.get("CZKAWKA_PRUNE_COUNT", "20"))

mcp = FastMCP("czkawka", instructions=f"Czkawka scoped cache. Cache dir: {CZKAWKA_CACHE_DIR}.")


def _ensure():
    CZKAWKA_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _index_path():
    return CZKAWKA_CACHE_DIR / "index.json"


def _load_index():
    p = _index_path()
    if not p.exists():
        return {"scopes": {}}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"scopes": {}}


def _save_index(index):
    _ensure()
    target = _index_path()
    fd, tmp = tempfile.mkstemp(prefix=".index.", dir=str(CZKAWKA_CACHE_DIR))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2)
            f.write("\n")
        os.replace(tmp, target)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def _slug(mode, roots, excludes):
    key = json.dumps({"mode": mode, "roots": sorted(roots), "excludes": sorted(excludes)}, sort_keys=True)
    h = hashlib.sha256(key.encode()).hexdigest()[:8]
    base = (mode + "-" + (roots[0] if roots else "noroot").replace("\\", "/").rsplit("/", 1)[-1])
    base = "".join(c if c.isalnum() or c in "-_" else "-" for c in base).strip("-") or "scope"
    return f"{base}-{h}"


def _cache_path(slug):
    return CZKAWKA_CACHE_DIR / f"cache.{slug}.json"


def _read_cache(slug):
    p = _cache_path(slug)
    if not p.exists():
        return None, f"ERROR: cache not found for scope {slug!r}"
    try:
        return json.loads(p.read_text(encoding="utf-8")), str(p)
    except (OSError, ValueError) as e:
        return None, f"ERROR: could not read cache {p}: {e}"


def _available():
    return shutil.which(CZKAWKA_CLI) is not None


@mcp.tool()
def czkawka_cache_status() -> str:
    """Cache dir, binary availability, scope counts."""
    _ensure()
    index = _load_index()
    scopes = index.get("scopes", {})
    lines = [
        f"czkawka_cli: {CZKAWKA_CLI} ({'found' if _available() else 'NOT FOUND'})",
        f"cache_dir: {CZKAWKA_CACHE_DIR}",
        f"allow_scan: {CZKAWKA_ALLOW_SCAN}",
        f"prune_days: {CZKAWKA_PRUNE_DAYS}",
        f"prune_count: {CZKAWKA_PRUNE_COUNT}",
        f"scopes: {len(scopes)}",
        f"note: consolidated mode = run the vault-memory 2.0 server instead of this one",
    ]
    for slug, meta in scopes.items():
        lines.append(f"  {slug}: mode={meta.get('mode')} roots={meta.get('roots')} mtime={meta.get('mtime')} entries={meta.get('entries')}")
    return "\n".join(lines)


@mcp.tool()
def czkawka_scopes() -> str:
    """List cached scopes."""
    _ensure()
    index = _load_index()
    scopes = index.get("scopes", {})
    if not scopes:
        return "(no cached scopes; run czkawka_scan)"
    return "\n".join(
        f"{slug}\tmode={m.get('mode')}\troots={','.join(m.get('roots', []))}\tmtime={m.get('mtime')}\tentries={m.get('entries')}"
        for slug, m in scopes.items()
    )


@mcp.tool()
def czkawka_scan(mode: str = "dup", roots: str = "", excludes: str = "",
                 min_size: int = 8192, limit_files: int = 0) -> str:
    """Run czkawka_cli for one scope and cache the result. Gated by CZKAWKA_ALLOW_SCAN."""
    if not CZKAWKA_ALLOW_SCAN:
        return "ERROR: scanning disabled. Set CZKAWKA_ALLOW_SCAN=1."
    if not _available():
        return f"ERROR: czkawka_cli not found ({CZKAWKA_CLI})."
    root_list = [r.strip() for r in roots.split(",") if r.strip()]
    if not root_list:
        # fall back to CZKAWKA_ROOTS
        env_roots = os.environ.get("CZKAWKA_ROOTS", "")
        root_list = [r.strip() for r in env_roots.split(",") if r.strip()]
    if not root_list:
        return "ERROR: at least one root required (roots arg or CZKAWKA_ROOTS)"
    exclude_list = [e.strip() for e in excludes.split(",") if e.strip()]
    mode = mode.strip().lower()
    if mode not in ("dup", "big", "empty-folders", "empty-files", "temp"):
        return f"ERROR: unsupported mode {mode!r}"
    slug = _slug(mode, root_list, exclude_list)
    _ensure()
    lock = CZKAWKA_CACHE_DIR / f".{slug}.lock"
    try:
        fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
    except FileExistsError:
        return f"ERROR: scan in progress for {slug}"
    try:
        cache = _cache_path(slug)
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
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if proc.returncode not in (0, 11):
            return f"ERROR: czkawka_cli failed (rc={proc.returncode}): {proc.stderr.strip()[:500]}"
        entries = 0
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
            if isinstance(data, list):
                entries = len(data)
            elif isinstance(data, dict):
                for v in data.values():
                    if isinstance(v, list):
                        entries += len(v)
                if entries == 0:
                    entries = len(data)
        except (OSError, ValueError):
            entries = -1
        index = _load_index()
        index.setdefault("scopes", {})[slug] = {
            "mode": mode, "roots": root_list, "excludes": exclude_list,
            "mtime": datetime.now(timezone.utc).isoformat(),
            "entries": entries, "cache": cache.name,
        }
        _save_index(index)
        return f"Scanned scope {slug}: mode={mode} roots={root_list} entries={entries} cache={cache}"
    finally:
        try:
            lock.unlink(missing_ok=True)
        except OSError:
            pass


@mcp.tool()
def czkawka_duplicates(scope: str, path_contains: str = "", min_size: int = 0, limit: int = 50) -> str:
    """Read duplicate groups from a cached scope (slices only)."""
    data, info = _read_cache(scope)
    if data is None:
        return info
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
    """Delete stale scoped caches."""
    days = older_than_days or CZKAWKA_PRUNE_DAYS
    cap = max_scopes or CZKAWKA_PRUNE_COUNT
    _ensure()
    index = _load_index()
    scopes = index.get("scopes", {})
    now = datetime.now(timezone.utc)
    removed = []
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
def czkawka_quarantine(scope: str, path: str, dry_run: bool = True, apply: bool = False) -> str:
    """Move a file into the quarantine folder for that scope (never deletes).

    dry_run=True (default) reports only. apply=True required to actually move.
    """
    import shutil as _sh
    src = Path(path)
    if not src.exists() or not src.is_file():
        return f"ERROR: file not found: {path}"
    dest_dir = CZKAWKA_CACHE_DIR / "quarantine" / scope
    dest = dest_dir / src.name
    if dry_run and not apply:
        return f"DRY RUN: would move {src} -> {dest}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    n = 2
    while dest.exists():
        dest = dest_dir / f"{src.stem} ({n}){src.suffix}"
        n += 1
    h_before = hashlib.sha256(src.read_bytes()).hexdigest()
    _sh.move(str(src), str(dest))
    h_after = hashlib.sha256(dest.read_bytes()).hexdigest()
    if h_before != h_after:
        return f"ERROR: hash mismatch after move! {h_before} != {h_after}"
    manifest = dest_dir / "manifest.json"
    try:
        data = json.loads(manifest.read_text()) if manifest.exists() else {"moved": []}
    except (OSError, ValueError):
        data = {"moved": []}
    data["moved"].append({"from": str(src), "to": str(dest), "hash": h_before,
                          "at": datetime.now(timezone.utc).isoformat()})
    manifest.write_text(json.dumps(data, indent=2))
    return f"Quarantined: {src} -> {dest}"


@mcp.tool()
def czkawka_purge(scope: str, confirm: str = "", apply: bool = False) -> str:
    """Permanently delete quarantined items. Requires confirm='PURGE' and apply=True."""
    qdir = CZKAWKA_CACHE_DIR / "quarantine" / scope
    manifest = qdir / "manifest.json"
    if not manifest.exists():
        return f"ERROR: no manifest for scope {scope}"
    data = json.loads(manifest.read_text())
    moved = data.get("moved", [])
    if not moved:
        return "nothing to purge"
    if confirm != "PURGE":
        return "ERROR: confirm='PURGE' required"
    if not apply:
        return f"DRY RUN: would permanently delete {len(moved)} quarantined file(s)"
    deleted = 0
    for m in moved:
        p = Path(m["to"])
        if p.exists():
            if "hash" in m:
                try:
                    if hashlib.sha256(p.read_bytes()).hexdigest() != m["hash"]:
                        continue
                except OSError:
                    pass
            p.unlink()
            deleted += 1
    manifest.write_text(json.dumps({"moved": [], "purged_at": datetime.now(timezone.utc).isoformat()}, indent=2))
    return f"purged {deleted} file(s)"


if __name__ == "__main__":
    if not CZKAWKA_CACHE_DIR.exists():
        CZKAWKA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    mcp.run(transport="stdio")