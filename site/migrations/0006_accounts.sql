-- Site accounts: identity, a profile, and ownership of submitted posts. They grant nothing
-- outside this site. Passwords and every token are stored only as hashes.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE account_profiles (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  website TEXT
);

-- The cookie carries a random token; only its SHA-256 is kept here.
CREATE TABLE account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent_hash TEXT,
  ip_hash TEXT
);
CREATE INDEX account_sessions_by_account ON account_sessions (account_id);
CREATE INDEX account_sessions_by_expiry ON account_sessions (expires_at);

-- login, logout, password changes and the like. `meta` never holds an address or a secret.
CREATE TABLE account_events (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  meta TEXT
);
CREATE INDEX account_events_by_account ON account_events (account_id, at);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX password_resets_by_account ON password_resets (account_id);
CREATE INDEX password_resets_by_expiry ON password_resets (expires_at);

CREATE TABLE email_verifications (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX email_verifications_by_account ON email_verifications (account_id);
CREATE INDEX email_verifications_by_expiry ON email_verifications (expires_at);

-- Fixed-window counters for the auth routes. `key` is a salted hash of an IP or an email.
CREATE TABLE auth_limits (
  key TEXT NOT NULL,
  window TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (key, window)
) WITHOUT ROWID;

-- Legacy and anonymous posts keep a null owner. An anonymous post's edit-token email is kept
-- only as a salted hash, so a token can be issued to the address that submitted the post.
ALTER TABLE posts ADD COLUMN account_id TEXT REFERENCES accounts (id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN edit_email_hash TEXT;
CREATE INDEX posts_by_account ON posts (account_id, created_at);
