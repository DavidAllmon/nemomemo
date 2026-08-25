-- Telegram capture: a chat bound to a member becomes a memo inbox.
-- chat_id is TEXT because Telegram ids are int64 (supergroups are negative and
-- large); storing the digits avoids any float precision question entirely.
CREATE TABLE telegram_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  created_ts BIGINT NOT NULL,
  last_memo_ts BIGINT
);

CREATE INDEX idx_telegram_chat_user ON telegram_chat(user_id);

-- One-time link codes. Short-lived and deleted the moment they're used, so a
-- code that leaks after the fact is worthless.
CREATE TABLE telegram_link_code (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_ts BIGINT NOT NULL,
  expires_ts BIGINT NOT NULL
);
