#!/usr/bin/env python3
"""Draft an `updates/` entry from PRs and commits in the private repos.

Entries are holistic write-ups ("what changed and why it matters"), not changelogs, so this
only drafts: it gathers titles, bodies and commit subjects into a skeleton you then edit.
Private references are dropped on the way in (PR URLs, org/repo names, commit hashes), and
the draft is run through leakcheck before it's written; a finding means nothing is written.

  # from pull requests (needs the GitHub CLI, run where you can see the private repos)
  python tools/new_update.py --title "Serving gate gets content rules" --area serving \
      --pr OWNER/REPO#5 --pr OWNER/REPO#12

  # from a commit range in a local checkout
  python tools/new_update.py --title "..." --area security --git ~/src/repo --range main..feature

Output: updates/YYYY-MM-DD-<slug>.md (and the index line to add to updates/README.md).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import leakcheck  # noqa: E402

AREAS = ("harness", "serving", "security", "nav", "ui", "models", "repo")

# Lines that are about the lab or the process, not the work: dropped from bodies.
DROP_LINE = re.compile(
    r"(https?://github\.com/\S+|co-authored-by:|generated with|signed-off-by:|"
    r"^\s*-\s*\[[ x]\]\s*(deploy|ssh|rotate|import)|\b(ssh|scp)\s+\w+[@:])",
    re.I,
)
SHA = re.compile(r"\b[0-9a-f]{7,40}\b")


def clean(text: str) -> str:
    out = []
    for line in (text or "").splitlines():
        if DROP_LINE.search(line):
            continue
        out.append(SHA.sub("<commit>", line))
    return "\n".join(out).strip()


def from_pr(ref: str) -> dict:
    repo, _, num = ref.partition("#")
    raw = subprocess.run(["gh", "pr", "view", num, "-R", repo, "--json", "title,body,mergedAt,commits"],
                         check=True, capture_output=True, text=True).stdout
    d = json.loads(raw)
    return {"title": d["title"], "body": clean(d.get("body", "")),
            "commits": [clean(c["messageHeadline"]) for c in d.get("commits", [])],
            "date": (d.get("mergedAt") or "")[:10]}


def from_git(repo: str, rng: str) -> dict:
    raw = subprocess.run(["git", "-C", repo, "log", "--format=%s%x1f%b%x1e", rng],
                         check=True, capture_output=True, text=True).stdout
    commits, bodies = [], []
    for rec in raw.split("\x1e"):
        if not rec.strip():
            continue
        subj, _, body = rec.partition("\x1f")
        commits.append(clean(subj.strip()))
        if body.strip():
            bodies.append(clean(body))
    return {"title": "", "body": "\n\n".join(bodies), "commits": commits, "date": ""}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def draft(title: str, area: str, sources: list[dict], today: str) -> str:
    lines = [
        "---", f"title: {title}", f"date: {today}", f"area: {area}", "status: draft", "---", "",
        f"# {title}", "",
        "<!-- Rewrite everything below as prose: what changed, why, and what it means for the system. -->",
        "<!-- Keep hosts, addresses, paths and keys out; describe roles (hub, agent box, workstation). -->",
        "", "## What changed", "",
    ]
    for s in sources:
        if s["title"]:
            lines.append(f"- {s['title']}")
        lines += [f"  - {c}" for c in s["commits"][:12]]
    lines += ["", "## Why", "", "<!-- the problem this solved -->", "", "## Notes from the source", ""]
    for s in sources:
        if s["body"]:
            lines += [s["body"], ""]
    lines += ["## What's next", "", "<!-- optional -->", ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Draft an updates/ entry from PRs or commits.")
    ap.add_argument("--title", required=True)
    ap.add_argument("--area", required=True, choices=AREAS)
    ap.add_argument("--pr", action="append", default=[], help="OWNER/REPO#N (repeatable)")
    ap.add_argument("--git", help="local repo path for --range")
    ap.add_argument("--range", help="git revision range, e.g. main..feature")
    ap.add_argument("--date", default=dt.date.today().isoformat())
    a = ap.parse_args(argv)
    sources = [from_pr(p) for p in a.pr]
    if a.git and a.range:
        sources.append(from_git(a.git, a.range))
    if not sources:
        ap.error("give at least one --pr, or --git with --range")

    text = draft(a.title, a.area, sources, a.date)
    leakcheck.load_local_names()
    findings = leakcheck.scan_text("draft", text, [])
    if findings:
        print("refusing to write the draft; leakcheck findings (edit the sources or the private-name list):")
        print("\n".join(findings))
        return 1
    out = ROOT / "updates" / f"{a.date}-{slug(a.title)}.md"
    if out.exists():
        print(f"{out} exists; not overwriting")
        return 1
    out.write_text(text, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}")
    print(f"index line: | {a.date} | {a.area} | [{a.title}]({out.name}) |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
