#!/usr/bin/env python3
"""Generalized devlog protocol client.

Reads a config file (copy config.example.json and fill in the blanks) and posts
an entry to your own devlog endpoint. Can pull a summary from a README/setup doc.

Usage:
  python devlog_protocol.py --config config.json --project X --title "..." --body "..."
  python devlog_protocol.py --config config.json --project X --title "..." --summary-from README.md
"""

import argparse
import json
import os
import re
import sys
import urllib.request


def load_config(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def pull_summary(path):
    """Pull a short summary from a README/setup doc: first non-heading, non-empty paragraph."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    # Try a '## Summary' section first.
    m = re.search(r"(?ms)^##\s*Summary\s*\n(.*?)(?=^##|\Z)", text)
    if m:
        para = m.group(1).strip()
        if para:
            return para.split("\n\n")[0].strip()
    # Otherwise first paragraph after the title.
    lines = text.splitlines()
    buf = []
    started = False
    for line in lines:
        if line.startswith("#"):
            started = True
            continue
        if not started:
            continue
        if line.strip() == "":
            if buf:
                break
            continue
        buf.append(line.strip())
    return " ".join(buf).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Post a devlog entry via your own protocol.")
    parser.add_argument("--config", required=True, help="path to config JSON (filled-in copy of config.example.json)")
    parser.add_argument("--project", required=True, help="project id (must be in config.projects)")
    parser.add_argument("--title", required=True, help="entry title")
    parser.add_argument("--body", default="", help="entry body")
    parser.add_argument("--summary-from", dest="summary_from", default="", help="file to pull a summary from")
    parser.add_argument("--author", default="", help="author (defaults to config.author_default)")
    args = parser.parse_args()

    cfg = load_config(args.config)
    endpoint = cfg["endpoint"]
    origin = cfg.get("origin", endpoint.split("/api/")[0])
    projects = cfg.get("projects", [])
    if args.project not in projects:
        print(f"project {args.project!r} not in config.projects {projects}", file=sys.stderr)
        return 2

    body = args.body
    if args.summary_from:
        summary = pull_summary(args.summary_from)
        if summary:
            body = (body + "\n\n" + summary).strip() if body else summary

    if not body:
        print("body is required (or provide --summary-from)", file=sys.stderr)
        return 2

    payload = {
        "project": args.project,
        "title": args.title,
        "body": body,
        "author": args.author or cfg.get("author_default", "agent"),
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={"Content-Type": "application/json", "Origin": origin, "User-Agent": "devlog-protocol/1"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            result = json.loads(e.read().decode("utf-8"))
        except Exception:
            print(f"HTTP {e.code}: {e.reason}", file=sys.stderr)
            return 1
    print(json.dumps(result, indent=2))
    return 0 if (isinstance(result, dict) and result.get("ok")) else 1


if __name__ == "__main__":
    raise SystemExit(main())
