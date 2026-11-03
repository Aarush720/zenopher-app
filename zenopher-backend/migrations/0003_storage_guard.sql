CREATE TABLE storage_usage (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  tracked_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

INSERT INTO storage_usage (id, tracked_bytes, updated_at) VALUES (1, 0, unixepoch());
