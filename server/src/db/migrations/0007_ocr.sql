-- OCR text for image attachments, searchable via FTS5 (same external-content
-- + trigger pattern as memo_fts in 0006).
ALTER TABLE attachment ADD COLUMN extracted_text TEXT NOT NULL DEFAULT '';

CREATE VIRTUAL TABLE attachment_fts USING fts5(
  extracted_text,
  content='attachment',
  content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER attachment_fts_after_insert AFTER INSERT ON attachment BEGIN
  INSERT INTO attachment_fts(rowid, extracted_text) VALUES (new.id, new.extracted_text);
END;

CREATE TRIGGER attachment_fts_after_delete AFTER DELETE ON attachment BEGIN
  INSERT INTO attachment_fts(attachment_fts, rowid, extracted_text) VALUES ('delete', old.id, old.extracted_text);
END;

CREATE TRIGGER attachment_fts_after_update AFTER UPDATE OF extracted_text ON attachment BEGIN
  INSERT INTO attachment_fts(attachment_fts, rowid, extracted_text) VALUES ('delete', old.id, old.extracted_text);
  INSERT INTO attachment_fts(rowid, extracted_text) VALUES (new.id, new.extracted_text);
END;

INSERT INTO attachment_fts(rowid, extracted_text) SELECT id, extracted_text FROM attachment;
