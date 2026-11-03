-- Posts stay `pending` until an operator approves them from the editor.
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  skill TEXT,
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX posts_by_status ON posts (status, published_at);

-- D1 allows 2 MB in a row, and the submit limit stays under it. R2 isn't enabled on the account.
CREATE TABLE post_images (
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (post_id, position)
);

CREATE TABLE post_limits (
  visitor TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (visitor, day)
) WITHOUT ROWID;
