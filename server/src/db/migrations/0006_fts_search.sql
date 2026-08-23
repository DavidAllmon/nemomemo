-- FTS5 full-text index over memo content (external-content table).
-- Triggers keep it in sync with EVERY write path (routes, tag rename,
-- restored databases re-migrated at boot) by construction.
-- The final INSERT backfills rows that existed before this migration.
-- NOTE: memo_fts is queried via raw SQL only and deliberately absent
-- from db/schema.ts (drizzle never touches virtual tables).

CREATE VIRTUAL TABLE memo_fts USING fts5(
  content,
  content='memo',
  content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER memo_fts_after_insert AFTER INSERT ON memo BEGIN
  INSERT INTO memo_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER memo_fts_after_delete AFTER DELETE ON memo BEGIN
  INSERT INTO memo_fts(memo_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER memo_fts_after_update AFTER UPDATE OF content ON memo BEGIN
  INSERT INTO memo_fts(memo_fts, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO memo_fts(rowid, content) VALUES (new.id, new.content);
END;

INSERT INTO memo_fts(rowid, content) SELECT id, content FROM memo;
