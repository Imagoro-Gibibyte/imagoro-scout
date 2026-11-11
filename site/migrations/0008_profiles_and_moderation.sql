-- Tiers: member < moderator < admin. Moderators review posts and profiles; admins also set
-- members' tiers. Only the operator (the admin API's bearer token) makes admins.
ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin'));
ALTER TABLE accounts ADD COLUMN suspended_at TEXT;

-- A public profile lives at /u/<handle>. Handles are unique regardless of case.
ALTER TABLE account_profiles ADD COLUMN handle TEXT;
ALTER TABLE account_profiles ADD COLUMN public INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX account_profiles_by_handle ON account_profiles (handle COLLATE NOCASE) WHERE handle IS NOT NULL;

-- Profile pictures: screened like post images, square, shown as a circle.
CREATE TABLE account_avatars (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every moderator action. No foreign keys, so the record outlives the accounts in it.
CREATE TABLE moderation_log (
  id INTEGER PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT,
  at TEXT NOT NULL
);
CREATE INDEX moderation_log_by_time ON moderation_log (at);
