-- Add the MEMO_THREAD inbox type (thread subscriptions: earlier commenters hear
-- about new replies). SQLite can't alter a CHECK constraint, so rebuild the table.
CREATE TABLE inbox_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('UNREAD','ARCHIVED')) DEFAULT 'UNREAD',
  type TEXT NOT NULL CHECK (type IN ('MEMO_COMMENT','MEMO_MENTION','MEMO_THREAD')),
  memo_id INTEGER REFERENCES memo(id) ON DELETE CASCADE
);
INSERT INTO inbox_new (id, created_ts, sender_id, receiver_id, status, type, memo_id)
  SELECT id, created_ts, sender_id, receiver_id, status, type, memo_id FROM inbox;
DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX idx_inbox_receiver ON inbox(receiver_id, status);
