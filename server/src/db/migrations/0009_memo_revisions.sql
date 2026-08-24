-- Edit history: every content edit stores the words it replaced.
-- FK cascade means purging a memo (purgeMemos, user delete) takes its
-- revisions with it — foreign_keys=ON is set in createDb.
CREATE TABLE memo_revision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memo_id INTEGER NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_ts BIGINT NOT NULL
);

-- History reads newest-first per memo; the prune scans the same shape.
CREATE INDEX idx_memo_revision_memo ON memo_revision(memo_id, created_ts);
