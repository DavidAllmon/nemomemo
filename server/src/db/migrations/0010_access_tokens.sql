-- Personal access tokens: bearer auth for scripts, Shortcuts, and bots.
-- Same opaque-token design as user_session (SHA-256 of a random string; the
-- plaintext is shown once at creation and never stored).
CREATE TABLE access_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  -- Keep in sync with ACCESS_TOKEN_SCOPES in shared/src/constants.ts.
  scope TEXT NOT NULL DEFAULT 'FULL' CHECK (scope IN ('CREATE_ONLY', 'FULL')),
  created_ts BIGINT NOT NULL,
  last_used_ts BIGINT,
  expires_ts BIGINT
);

-- The Settings list reads every token of one member.
CREATE INDEX idx_access_token_user ON access_token(user_id);
