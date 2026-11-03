#!/usr/bin/env python3
"""Append a dated entry to a local devlog Markdown file."""

import argparse
import os
from datetime import date

DEFAULT_FILE = "DEVLOG.md"
HEADER = "# Devlog\n\nLocal change log. Newest entries at the bottom.\n\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Append a local devlog entry.")
    parser.add_argument("--file", default=DEFAULT_FILE, help="log file (default: %(default)s)")
    parser.add_argument("--project", default="", help="area label (optional)")
    parser.add_argument("--title", required=True, help="entry title")
    parser.add_argument("--body", required=True, help="entry body")
    args = parser.parse_args()

    path = args.file
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            f.write(HEADER)

    today = date.today().isoformat()
    block = f"## {today} — {args.title}\n"
    if args.project:
        block += f"_project: {args.project}_\n"
    block += f"\n{args.body}\n\n"

    with open(path, "a", encoding="utf-8") as f:
        f.write(block)
    print(f"appended to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
