-- Split "seen it" from "tucked it away": inbox status gains READ between
-- UNREAD and ARCHIVED. SQLite can't alter a CHECK, so rebuild (again).
CREATE TABLE inbox_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('UNREAD','READ','ARCHIVED')) DEFAULT 'UNREAD',
  type TEXT NOT NULL CHECK (type IN ('MEMO_COMMENT','MEMO_MENTION','MEMO_THREAD')),
  memo_id INTEGER REFERENCES memo(id) ON DELETE CASCADE
);
INSERT INTO inbox_new (id, created_ts, sender_id, receiver_id, status, type, memo_id)
  SELECT id, created_ts, sender_id, receiver_id, status, type, memo_id FROM inbox;
DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX idx_inbox_receiver ON inbox(receiver_id, status);
