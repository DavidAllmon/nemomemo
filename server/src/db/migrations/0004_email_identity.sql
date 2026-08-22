-- Email identity: verification timestamp on users + single-use auth tokens
-- (email verification now; password reset in the next release).
ALTER TABLE user ADD COLUMN email_verified_ts BIGINT;

CREATE TABLE auth_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('EMAIL_VERIFY','PASSWORD_RESET')),
  token_hash TEXT NOT NULL UNIQUE,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s','now')),
  expires_ts BIGINT NOT NULL,
  used_ts BIGINT
);
CREATE INDEX idx_auth_token_user ON auth_token(user_id, purpose);
