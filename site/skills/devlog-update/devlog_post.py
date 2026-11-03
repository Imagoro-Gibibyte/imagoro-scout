#!/usr/bin/env python3
"""Submit a devlog entry to imagoro.net.

Reads title/body from flags or stdin (JSON) and POSTs to /api/devlog.
Prints the pending id on success or the rejection reasons on failure.
"""

import argparse
import json
import sys
import urllib.request

DEFAULT_URL = "https://imagoro.net/api/devlog"


def main() -> int:
    parser = argparse.ArgumentParser(description="Post a devlog entry.")
    parser.add_argument("--url", default=DEFAULT_URL, help="API endpoint (default: %(default)s)")
    parser.add_argument("--project", help="one of: imagoro, security, nav, lab, voxel")
    parser.add_argument("--title", help="entry title")
    parser.add_argument("--body", help="entry body")
    parser.add_argument("--author", default="", help="author name (optional)")
    parser.add_argument("--post", default="", help="slug of a post this update links to (optional)")
    parser.add_argument("--json", dest="json_file", help="read a JSON object from this file instead of flags")
    args = parser.parse_args()

    if args.json_file:
        with open(args.json_file, encoding="utf-8") as f:
            payload = json.load(f)
    else:
        payload = {
            "project": args.project,
            "title": args.title,
            "body": args.body,
        }
        if args.author:
            payload["author"] = args.author
        if args.post:
            payload["post"] = args.post

    if not payload.get("project") or not payload.get("title") or not payload.get("body"):
        parser.error("--project, --title and --body are required (or use --json)")

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        args.url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Origin": args.url.split("/api/")[0],
            "User-Agent": "devlog-post/1",
        },
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
    if isinstance(result, dict) and result.get("ok"):
        print(json.dumps(result, indent=2))
        return 0
    print(json.dumps(result, indent=2), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
