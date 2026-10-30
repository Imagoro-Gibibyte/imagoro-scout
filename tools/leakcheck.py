#!/usr/bin/env python3
"""leakcheck: fail if anything lab-specific or secret-shaped is in the tree.

This repo is the public face of a private lab. Code and write-ups are ported from private
repos, so every change runs through this check (CI and the update tool both call it).

What fails:
- specific private / CGNAT / mesh host addresses (network constants like 10.0.0.0/8 are fine;
  documentation ranges 192.0.2.x, 198.51.100.x, 203.0.113.x and loopback are fine)
- lab host and account names, personal paths, private domains
- key / token / private-key shapes

Usage: python tools/leakcheck.py [paths...]   (default: the repo root). Exit 1 on findings.
False positives go in tools/leakcheck.allow as `path:line-substring` (or `path:*`) with a reason.
"""
from __future__ import annotations

import hashlib
import ipaddress
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", "node_modules", "target", "dist", "__pycache__", ".venv", ".pytest_cache"}
SKIP_FILES = {"Cargo.lock", "pnpm-lock.yaml", "package-lock.json", "leakcheck.allow", "leakcheck.names"}
TEXT_EXT = {".py", ".rs", ".ts", ".tsx", ".js", ".mjs", ".json", ".toml", ".md", ".yml", ".yaml",
            ".txt", ".sh", ".ps1", ".cfg", ".ini", ".html", ".css", ".allow", ""}

# Lab host/account/network names that must never appear, stored as SHA-256 so this public
# file doesn't list them. Word tokens (letters, digits, - and _) are hashed lowercase and
# compared. Add more locally, unhashed, in tools/leakcheck.names (git-ignored), or append
# hashes here: python -c "import hashlib;print(hashlib.sha256(b'name').hexdigest())"
NAME_HASHES = {
    "1726258972585b09a3c8222eae8e69e60cc1a2f980812d35b74730d2217118ef",
    "26526383368579428d1b962265d767627d1f585dbdffa54eb01450e303804bc1",
    "2cb7a0dfc67b4ab8474431ad3eec107d08d608bb77936f8b88d063c76ccc1f0a",
    "46a0588db34b12cab3bfd54ef18870b3e92d818a1b0fb27630ea52c7f2050496",
    "539eafe2417c03054931840071708b86e2eec958aadfc2901e96e7eb75530ca3",
    "8fe66fa58e6b39e9e0c2b80d9effc03b1b9fde84ab97edb3387186fe47897a7e",
    "a77d8ff43ace1307abfdb4729c9271f49bd44b229f917f6d78b93c4a4c9d81ea",
    "aa2311111e644efff04a258a4ec5f255e82fb07d10eb29d7abb272e62016ba9e",
    "c4fd70c520f67e4f1a1125e066172d25999eb24fe366188e3c47436addd4e023",
    "c584f09e84f812d37e532f93f85429865f9904a9acf46db3028b8710df171dc2",
    "d5413a94403173b547a0c854e9a100be6a1b62b4243ab78f1dcf029402ebe6ad",
    "d57242fc6bbe2820edfa057a40eb623b84cb2daf73d09a310c5dbdf7d3e204a7",
    "d8c6c567b8823fc2135374b9aa70567d2d8588d433f333645d0c5324891b3549",
    "dcdcfb78c10ff84bcb8d941c40fa237e1de955bd14fd6bfc4c487760dca76c3f",
}
PATTERNS = [
    ("windows user path", re.compile(r"[A-Za-z]:\\\\?Users\\\\?[A-Za-z0-9_.-]+", re.I)),
    ("home path", re.compile(r"/home/[a-z_][a-z0-9_-]*/", re.I)),
    ("keygate key", re.compile(r"\bkg_[A-Za-z0-9_-]{20,}")),
    ("vllm key", re.compile(r"\bvk_[A-Za-z0-9_-]{20,}")),
    ("private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("github token", re.compile(r"\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}")),
    ("api key shape", re.compile(r"\b(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[bp]-[A-Za-z0-9-]{20,})")),
    ("wireguard key", re.compile(r"(PrivateKey|PresharedKey)\s*=\s*[A-Za-z0-9+/]{42,44}=")),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@(gmail|outlook|hotmail|proton|yahoo)\.[a-z]{2,}\b", re.I)),
]
IPV4 = re.compile(r"(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?:/(\d{1,2}))?(?![\d.])")
DOC_NETS = [ipaddress.ip_network(n) for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")]
PRIVATE_NETS = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10")]


TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")
_LOCAL_NAMES: set[str] = set()


def name_hit(word: str) -> bool:
    w = word.lower()
    return hashlib.sha256(w.encode()).hexdigest() in NAME_HASHES or w in _LOCAL_NAMES


def load_local_names() -> None:
    f = ROOT / "tools" / "leakcheck.names"
    if f.exists():
        _LOCAL_NAMES.update(x.strip().lower() for x in f.read_text(encoding="utf-8").splitlines()
                            if x.strip() and not x.startswith("#"))


def ip_findings(line: str) -> list[str]:
    out = []
    for m in IPV4.finditer(line):
        try:
            ip = ipaddress.ip_address(m.group(1))
        except ValueError:
            continue
        prefix = m.group(2)
        if ip.is_loopback or ip.is_unspecified or any(ip in n for n in DOC_NETS):
            continue
        if prefix is not None:
            # A network constant (10.0.0.0/8) is fine; a host with a prefix (e.g. a /16 on a host) is not.
            try:
                if ipaddress.ip_network(f"{ip}/{prefix}", strict=True):
                    continue
            except ValueError:
                pass
        if any(ip in n for n in PRIVATE_NETS) or not ip.is_global:
            out.append(f"private address {m.group(0)}")
    return out


def load_allow() -> list[tuple[str, str]]:
    f = ROOT / "tools" / "leakcheck.allow"
    if not f.exists():
        return []
    out = []
    for raw in f.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line and ":" in line:
            path, sub = line.split(":", 1)
            out.append((path.strip(), sub.strip()))
    return out


def scan_text(rel: str, text: str, allow: list[tuple[str, str]]) -> list[str]:
    findings = []
    for n, line in enumerate(text.splitlines(), 1):
        hits = ip_findings(line)
        hits += [f"lab name '{w}'" for w in TOKEN.findall(line) if name_hit(w)]
        hits += [label for label, rx in PATTERNS if rx.search(line)]
        for h in hits:
            if any(rel.replace("\\", "/") == p and (s == "*" or s in line) for p, s in allow):
                continue
            findings.append(f"{rel}:{n}: {h}: {line.strip()[:120]}")
    return findings


def iter_files(paths: list[Path]):
    for p in paths:
        if p.is_file():
            yield p
            continue
        for f in p.rglob("*"):
            if f.is_file() and not (set(f.relative_to(ROOT).parts) & SKIP_DIRS) and f.name not in SKIP_FILES \
                    and (f.suffix.lower() in TEXT_EXT):
                yield f


def main(argv: list[str]) -> int:
    paths = [Path(a).resolve() for a in argv] or [ROOT]
    allow = load_allow()
    load_local_names()
    findings = []
    for f in iter_files(paths):
        try:
            text = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel = str(f.relative_to(ROOT)) if f.is_relative_to(ROOT) else str(f)
        findings += scan_text(rel, text, allow)
    for line in findings:
        print(line)
    print(f"leakcheck: {len(findings)} finding(s)" if findings else "leakcheck: clean")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
