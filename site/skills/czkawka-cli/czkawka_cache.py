#!/usr/bin/env python3
"""Scoped czkawka cache helper (stdlib only).

Computes a scope slug from (mode, roots, excludes), runs czkawka_cli into a
scoped JSON file atomically, updates index.json, and prunes stale caches.

Usage:
  czkawka_cache.py scan --mode dup --roots /a,/b --excludes /a/tmp --cache-dir ~/.czkawka-agent
  czkawka_cache.py scopes --cache-dir ~/.czkawka-agent
  czkawka_cache.py prune --cache-dir ~/.czkawka-agent --days 14 --count 20
  czkawka_cache.py quarantine --src /path/file --scope <slug> --cache-dir ... [--apply]
  czkawka_cache.py purge --scope <slug> --cache-dir ... --confirm <token> [--apply]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def _cache_dir(p):
    d = Path(p).expanduser().resolve()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _index_path(d):
    return d / "index.json"


def _load_index(d):
    p = _index_path(d)
    if not p.exists():
        return {"scopes": {}}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"scopes": {}}


def _save_index(d, index):
    target = _index_path(d)
    fd, tmp = tempfile.mkstemp(prefix=".index.", dir=str(d))
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
    return f"{base}-{h}"[:40]


def _cache_path(d, slug):
    return d / f"cache.{slug}.json"


def _lock_path(d, slug):
    return d / f".{slug}.lock"


def cmd_scan(args):
    roots = [r for r in args.roots.split(",") if r.strip()]
    if not roots:
        print("ERROR: --roots required", file=sys.stderr)
        return 2
    excludes = [e for e in args.excludes.split(",") if e.strip()] if args.excludes else []
    mode = args.mode
    if mode not in ("dup", "big", "empty-folders", "empty-files", "temp"):
        print(f"ERROR: unsupported mode {mode}", file=sys.stderr)
        return 2
    d = _cache_dir(args.cache_dir)
    slug = _slug(mode, roots, excludes)
    lock = _lock_path(d, slug)
    try:
        fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
    except FileExistsError:
        print(f"ERROR: scan in progress for {slug}", file=sys.stderr)
        return 3
    try:
        cache = _cache_path(d, slug)
        try:
            cache.unlink(missing_ok=True)
        except OSError:
            pass
        czk = args.czkawka or os.environ.get("CZKAWKA_CLI", "czkawka_cli")
        cmd = [czk, mode]
        for r in roots:
            cmd += ["-d", r]
        for e in excludes:
            cmd += ["-e", e]
        cmd += ["-C", str(cache), "-N", "-M"]
        if mode == "dup":
            cmd += ["-m", str(args.min_size)]
        elif mode == "big":
            cmd += ["-n", str(args.limit_files or 1000)]
        print("running:", " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode not in (0, 11):
            print(f"ERROR rc={proc.returncode}: {proc.stderr.strip()[:500]}", file=sys.stderr)
            return 1
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
        index = _load_index(d)
        index.setdefault("scopes", {})[slug] = {
            "mode": mode,
            "roots": roots,
            "excludes": excludes,
            "mtime": datetime.now(timezone.utc).isoformat(),
            "entries": entries,
            "cache": cache.name,
        }
        _save_index(d, index)
        print(f"scanned scope={slug} entries={entries} cache={cache}")
        return 0
    finally:
        try:
            lock.unlink(missing_ok=True)
        except OSError:
            pass


def cmd_scopes(args):
    d = _cache_dir(args.cache_dir)
    index = _load_index(d)
    scopes = index.get("scopes", {})
    if not scopes:
        print("(no cached scopes)")
        return 0
    for slug, meta in scopes.items():
        print(f"{slug}\tmode={meta.get('mode')}\troots={','.join(meta.get('roots', []))}\tmtime={meta.get('mtime')}\tentries={meta.get('entries')}")
    return 0


def cmd_prune(args):
    d = _cache_dir(args.cache_dir)
    index = _load_index(d)
    scopes = index.get("scopes", {})
    days = args.days
    cap = args.count
    now = datetime.now(timezone.utc)
    removed = []
    for slug, meta in list(scopes.items()):
        mtime = meta.get("mtime")
        try:
            mt = datetime.fromisoformat(mtime.replace("Z", "+00:00")) if mtime else None
        except (AttributeError, ValueError):
            mt = None
        if mt is not None and (now - mt).days >= days:
            p = _cache_path(d, slug)
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
            removed.append(slug)
            scopes.pop(slug, None)
    if len(scopes) > cap:
        ordered = sorted(scopes.items(), key=lambda kv: kv[1].get("mtime", ""), reverse=True)
        for slug, _ in ordered[cap:]:
            p = _cache_path(d, slug)
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
            removed.append(slug)
            scopes.pop(slug, None)
    index["scopes"] = scopes
    _save_index(d, index)
    print(f"pruned {len(removed)}: {removed}")
    return 0


def _hash_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def cmd_quarantine(args):
    src = Path(args.src)
    if not src.is_file():
        print(f"ERROR: not a file: {src}", file=sys.stderr)
        return 2
    d = _cache_dir(args.cache_dir)
    dest_dir = d / "quarantine" / args.scope
    dest = dest_dir / src.name
    dry = args.dry_run and not args.apply
    if dry:
        print(f"DRY RUN: would move {src} -> {dest}")
        return 0
    if not args.apply:
        print("Refusing: pass --apply to actually move (default dry-run).", file=sys.stderr)
        return 2
    dest_dir.mkdir(parents=True, exist_ok=True)
    n = 2
    while dest.exists():
        dest = dest_dir / f"{src.stem} ({n}){src.suffix}"
        n += 1
    h_before = _hash_file(src)
    shutil.move(str(src), str(dest))
    h_after = _hash_file(dest)
    if h_before != h_after:
        print(f"ERROR: hash mismatch after move! {h_before} != {h_after}", file=sys.stderr)
        return 1
    manifest = dest_dir / "manifest.json"
    try:
        data = json.loads(manifest.read_text()) if manifest.exists() else {"moved": []}
    except (OSError, ValueError):
        data = {"moved": []}
    data["moved"].append({
        "from": str(src), "to": str(dest),
        "hash": h_before,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    manifest.write_text(json.dumps(data, indent=2))
    print(f"quarantined: {src} -> {dest} (hash {h_before[:12]})")
    return 0


def cmd_purge(args):
    d = _cache_dir(args.cache_dir)
    qdir = d / "quarantine" / args.scope
    manifest = qdir / "manifest.json"
    if not manifest.exists():
        print(f"ERROR: no manifest for scope {args.scope}", file=sys.stderr)
        return 2
    data = json.loads(manifest.read_text())
    moved = data.get("moved", [])
    if not moved:
        print("nothing to purge")
        return 0
    if not args.confirm or args.confirm != "PURGE":
        print("ERROR: --confirm PURGE required", file=sys.stderr)
        return 2
    if not args.apply:
        print(f"DRY RUN: would permanently delete {len(moved)} quarantined file(s)")
        for m in moved:
            print("  " + m["to"])
        return 0
    deleted = 0
    for m in moved:
        p = Path(m["to"])
        if p.exists():
            # re-hash check
            if "hash" in m:
                try:
                    if _hash_file(p) != m["hash"]:
                        print(f"SKIP (hash mismatch): {p}", file=sys.stderr)
                        continue
                except OSError:
                    pass
            p.unlink()
            deleted += 1
    # clear manifest
    manifest.write_text(json.dumps({"moved": [], "purged_at": datetime.now(timezone.utc).isoformat()}, indent=2))
    print(f"purged {deleted} file(s)")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Scoped czkawka cache helper")
    ap.add_argument("--cache-dir", default=os.environ.get("CZKAWKA_CACHE_DIR", "~/.czkawka-agent"))
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scan")
    s.add_argument("--mode", default="dup")
    s.add_argument("--roots", default="")
    s.add_argument("--excludes", default="")
    s.add_argument("--min-size", type=int, default=8192)
    s.add_argument("--limit-files", type=int, default=0)
    s.add_argument("--czkawka", default=None)
    s.set_defaults(func=cmd_scan)

    sc = sub.add_parser("scopes")
    sc.set_defaults(func=cmd_scopes)

    pr = sub.add_parser("prune")
    pr.add_argument("--days", type=int, default=int(os.environ.get("CZKAWKA_PRUNE_DAYS", "14")))
    pr.add_argument("--count", type=int, default=int(os.environ.get("CZKAWKA_PRUNE_COUNT", "20")))
    pr.set_defaults(func=cmd_prune)

    q = sub.add_parser("quarantine")
    q.add_argument("--src", required=True)
    q.add_argument("--scope", required=True)
    q.add_argument("--apply", action="store_true")
    q.add_argument("--dry-run", dest="dry_run", action="store_true", default=True)
    q.set_defaults(func=cmd_quarantine)

    pu = sub.add_parser("purge")
    pu.add_argument("--scope", required=True)
    pu.add_argument("--confirm", default="")
    pu.add_argument("--apply", action="store_true")
    pu.set_defaults(func=cmd_purge)

    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()