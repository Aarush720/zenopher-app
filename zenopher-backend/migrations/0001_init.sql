-- Zenopher D1 schema (spec section 6). IDs are random, timestamps are integer unix seconds.
-- Document content is never stored here: only the R2 key and the hash.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,                 -- random 128-bit, base32
  email          TEXT NOT NULL UNIQUE,             -- lowercased
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_deletion')),
  deletion_at    INTEGER,                          -- unix seconds, end of grace period
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE oauth_links (
  provider TEXT NOT NULL,                          -- 'google'
  subject  TEXT NOT NULL,
  user_id  TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (provider, subject)
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  family_id    TEXT NOT NULL,                      -- for refresh-reuse detection
  refresh_hash TEXT NOT NULL,                      -- SHA-256 of the current refresh token secret
  device       TEXT,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);
CREATE INDEX sessions_family ON sessions(family_id);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (                         -- magic links and verification
  token_hash TEXT PRIMARY KEY,                     -- SHA-256
  user_id    TEXT,
  purpose    TEXT NOT NULL,                        -- 'signin', 'verify'
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE designs (
  id              TEXT PRIMARY KEY,                -- client-generated UUID, validated
  owner_id        TEXT NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  mode            TEXT NOT NULL,                   -- creative, corporate
  style_id        TEXT,                            -- catalog ID and version, e.g. 'bauhaus@3'
  width_px        INTEGER NOT NULL,
  height_px       INTEGER NOT NULL,
  current_version INTEGER NOT NULL,
  wrapped_dek     BLOB NOT NULL,                   -- per-design key, wrapped by the master key
  trashed_at      INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX designs_owner_updated ON designs(owner_id, updated_at);
CREATE INDEX designs_trash ON designs(trashed_at);

CREATE TABLE design_versions (
  design_id    TEXT NOT NULL REFERENCES designs(id),
  version      INTEGER NOT NULL,
  r2_key       TEXT NOT NULL,                      -- encrypted blob
  byte_size    INTEGER NOT NULL,
  content_hash TEXT NOT NULL,                      -- SHA-256 of the plaintext, checked by the server
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (design_id, version)
);

CREATE TABLE assets (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  r2_key     TEXT NOT NULL,
  mime       TEXT NOT NULL,                        -- image/png, image/jpeg, image/webp, application/gzip, font types
  byte_size  INTEGER NOT NULL,
  status     TEXT NOT NULL,                        -- pending, ready, rejected
  created_at INTEGER NOT NULL
);
CREATE INDEX assets_owner ON assets(owner_id);

CREATE TABLE share_grants (
  id              TEXT PRIMARY KEY,
  design_id       TEXT NOT NULL REFERENCES designs(id),
  grantee_user_id TEXT,                            -- null for link shares
  token_hash      TEXT,                            -- link shares only
  permission      TEXT NOT NULL,                   -- view, comment
  expires_at      INTEGER,
  revoked_at      INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX shares_design ON share_grants(design_id);
CREATE UNIQUE INDEX shares_token ON share_grants(token_hash);
CREATE INDEX shares_grantee ON share_grants(grantee_user_id);

CREATE TABLE consents (                            -- append-only
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL REFERENCES users(id),
  purpose        TEXT NOT NULL,                    -- 'critique', 'learning'
  decision       TEXT NOT NULL,                    -- 'granted', 'withdrawn'
  policy_version TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX consents_user ON consents(user_id, purpose, id);

CREATE TABLE learning_events (
  pseudo_id   TEXT NOT NULL,                       -- random per user, not the user ID
  command_id  TEXT NOT NULL,                       -- holds the teacher rule id
  mode        TEXT NOT NULL,
  style_id    TEXT,
  outcome     TEXT NOT NULL,                       -- applied, dismissed, undone
  occurred_at INTEGER NOT NULL
);
CREATE INDEX events_time ON learning_events(occurred_at);
CREATE INDEX events_pseudo ON learning_events(pseudo_id);

CREATE TABLE learning_link (                       -- separate from events
  user_id   TEXT PRIMARY KEY REFERENCES users(id),
  pseudo_id TEXT NOT NULL UNIQUE
);

CREATE TABLE budget (                              -- single row
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  starting_credits REAL NOT NULL,                  -- set in config, corrected weekly
  spent_credits    REAL NOT NULL DEFAULT 0,
  reserved_credits REAL NOT NULL DEFAULT 0,
  reserve_credits  REAL NOT NULL,                  -- never spent on user reviews
  updated_at       INTEGER NOT NULL
);
INSERT INTO budget (id, starting_credits, spent_credits, reserved_credits, reserve_credits, updated_at)
VALUES (1, 150, 0, 0, 10, 0);

CREATE TABLE model_usage (
  request_id   TEXT PRIMARY KEY,
  user_id_hash TEXT NOT NULL,
  reserved     REAL NOT NULL,
  actual       REAL,
  status       TEXT NOT NULL,                      -- reserved, complete, released, failed
  created_at   INTEGER NOT NULL
);
CREATE INDEX usage_status ON model_usage(status, created_at);

CREATE TABLE critique_cache (
  image_hash  TEXT PRIMARY KEY,
  result_text TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,                        -- export, delete_account, delete_learning
  user_id    TEXT NOT NULL,
  status     TEXT NOT NULL,                        -- queued, running, done, failed
  attempts   INTEGER NOT NULL DEFAULT 0,
  run_after  INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX jobs_due ON jobs(status, run_after);

CREATE TABLE rate_counters (
  key          TEXT PRIMARY KEY,                   -- route:scope:hashed-id
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

CREATE TABLE idempotency (
  key        TEXT PRIMARY KEY,                     -- user + client-supplied key
  response   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
