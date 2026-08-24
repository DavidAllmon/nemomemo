-- Trash: a deleted memo lingers here for a week before the scheduler purges it.
-- Nullable like forget_at/surface_at; NULL means "not deleted".
ALTER TABLE memo ADD COLUMN deleted_at INTEGER;

-- The sweep scans by deleted_at; partial keeps the index tiny (nearly every row is NULL).
CREATE INDEX idx_memo_deleted_at ON memo(deleted_at) WHERE deleted_at IS NOT NULL;
