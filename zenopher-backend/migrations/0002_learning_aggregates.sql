-- The spec has the cron job aggregate learning events before deleting raw ones, but no table to hold the result.
CREATE TABLE learning_aggregates (
  day        TEXT NOT NULL,                        -- YYYY-MM-DD, UTC
  command_id TEXT NOT NULL,
  mode       TEXT NOT NULL,
  style_id   TEXT NOT NULL DEFAULT '',
  outcome    TEXT NOT NULL,
  count      INTEGER NOT NULL,
  PRIMARY KEY (day, command_id, mode, style_id, outcome)
);
