CREATE TABLE user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL','ARCHIVED')) DEFAULT 'NORMAL',
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','USER')) DEFAULT 'USER',
  email TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE user_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  expires_ts BIGINT NOT NULL,
  last_seen_ts BIGINT NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE memo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL','ARCHIVED')) DEFAULT 'NORMAL',
  content TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC','PROTECTED','PRIVATE')) DEFAULT 'PRIVATE',
  pinned INTEGER NOT NULL CHECK (pinned IN (0,1)) DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{}',
  forget_at BIGINT DEFAULT NULL
);
CREATE INDEX idx_memo_creator_status ON memo(creator_id, row_status, created_ts DESC);
CREATE INDEX idx_memo_visibility ON memo(visibility);
CREATE INDEX idx_memo_forget_at ON memo(forget_at) WHERE forget_at IS NOT NULL;

CREATE TABLE memo_relation (
  memo_id INTEGER NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
  related_memo_id INTEGER NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('REFERENCE','COMMENT')),
  UNIQUE(memo_id, related_memo_id, type)
);
CREATE INDEX idx_memo_relation_related ON memo_relation(related_memo_id);

CREATE TABLE attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  filename TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  memo_id INTEGER REFERENCES memo(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL
);
CREATE INDEX idx_attachment_memo_id ON attachment(memo_id);

CREATE TABLE reaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  creator_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  memo_id INTEGER NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  UNIQUE(creator_id, memo_id, emoji)
);
CREATE INDEX idx_reaction_memo_id ON reaction(memo_id);

CREATE TABLE memo_share (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  memo_id INTEGER NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
  creator_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  expires_ts BIGINT DEFAULT NULL
);
CREATE INDEX idx_memo_share_memo_id ON memo_share(memo_id);

CREATE TABLE inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('UNREAD','ARCHIVED')) DEFAULT 'UNREAD',
  type TEXT NOT NULL CHECK (type IN ('MEMO_COMMENT','MEMO_MENTION')),
  memo_id INTEGER REFERENCES memo(id) ON DELETE CASCADE
);
CREATE INDEX idx_inbox_receiver ON inbox(receiver_id, status);

CREATE TABLE user_setting (
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);

CREATE TABLE instance_setting (
  name TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);
