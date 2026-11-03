-- Link devlog updates to a specific post (optional).
ALTER TABLE devlog_entries ADD COLUMN post_slug TEXT;
CREATE INDEX devlog_by_post ON devlog_entries (post_slug, status, date);

-- One-time edit tokens for a post: only a hash is stored, never the plaintext token.
CREATE TABLE edit_tokens (
  id TEXT PRIMARY KEY,
  post_slug TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX edit_tokens_by_post ON edit_tokens (post_slug, created_at);