-- Devlog entries: moderated, newest-first, published on /devlog.
CREATE TABLE devlog_entries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  project TEXT NOT NULL CHECK (project IN ('imagoro','security','nav','lab','voxel')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
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
