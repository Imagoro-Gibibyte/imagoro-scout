# Setup: your own devlog endpoint

This document describes the contract the `devlog-protocol` client expects, so you can port it to your own site. The reference implementation lives in the imagoro-scout repo (`site/functions/api/devlog/` and `site/migrations/0003_devlog.sql`).

## 1. Database

Create a table:

```sql
CREATE TABLE devlog_entries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  project TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','published','rejected')),
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX devlog_by_status ON devlog_entries (status, date);

CREATE TABLE devlog_limits (
  visitor TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (visitor, day)
) WITHOUT ROWID;
```

## 2. Endpoints

- `GET /api/devlog` — published entries, newest first. Optional `?project=`. Returns JSON array of `{ slug, date, project, title, body, author, published_at }`.
- `GET /api/devlog/:slug` — single published entry.
- `POST /api/devlog` — accepts JSON `{ project, title, body, author? }`. Validates fields, screens links, rate-limits per visitor per day, sets `date` server-side to today (UTC), stores as `pending`, returns `{ ok, status: "pending", id }` or `{ ok: false, reasons: [...] }`. Requires `Origin` header matching the site.
- `GET /api/admin/devlog?status=` — admin list (token-gated).
- `PATCH /api/admin/devlog/:id` — edit title/body/project.
- `POST /api/admin/devlog/:id/approve` — publish.
- `POST /api/admin/devlog/:id/reject` — reject.

## 3. Moderation

Entries are `pending` until an admin approves them. Admin routes are gated by a bearer token (env var). Rate-limit submissions (e.g. 3 per visitor per day).

## 4. Screening

Validate title/body length and project membership. Screen any links in the body (https, no shorteners, no executables, DNS resolution check). Fail closed.

## 5. Frontend

Fetch `/api/devlog` on the devlog page and render entries; fall back to a static seed file when the API is unavailable.

## 6. Environment

- Bind a database (e.g. D1/SQLite/Postgres).
- Set an admin token env var.
- Set a salt for visitor hashing.

## 7. Publishing the skill

Package `SKILL.md`, the client script, `config.example.json`, `SETUP.md`, `README.md`, and `LICENSE` as a bundle. Register it in your skills catalog. Install the SKILL.md into your agents' skills folders.
