-- Wave 1, the time layer: reminders (remind_at [+ recurrence]), message in a
-- bottle (surface_at), and Dory's forgotten-memo counter. The inbox gains
-- three self-notification types; SQLite can't alter a CHECK, so rebuild (again).
ALTER TABLE memo ADD COLUMN remind_at INTEGER;
ALTER TABLE memo ADD COLUMN remind_every TEXT CHECK (remind_every IN ('DAILY','WEEKLY','MONTHLY'));
ALTER TABLE memo ADD COLUMN surface_at INTEGER;
ALTER TABLE user ADD COLUMN dory_forgotten_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_memo_remind_at ON memo(remind_at) WHERE remind_at IS NOT NULL;
CREATE INDEX idx_memo_surface_at ON memo(surface_at) WHERE surface_at IS NOT NULL;

CREATE TABLE inbox_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('UNREAD','READ','ARCHIVED')) DEFAULT 'UNREAD',
  type TEXT NOT NULL CHECK (type IN ('MEMO_COMMENT','MEMO_MENTION','MEMO_THREAD','REMINDER','BOTTLE_ARRIVED','DORY_WARNING')),
  memo_id INTEGER REFERENCES memo(id) ON DELETE CASCADE
);
INSERT INTO inbox_new (id, created_ts, sender_id, receiver_id, status, type, memo_id)
  SELECT id, created_ts, sender_id, receiver_id, status, type, memo_id FROM inbox;
DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX idx_inbox_receiver ON inbox(receiver_id, status);
