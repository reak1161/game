CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_rankings_score_time
ON rankings (score DESC, time_ms ASC, id ASC);

