CREATE TABLE product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL CHECK(length(session_id) = 36),
  name TEXT NOT NULL CHECK(name IN (
    'visited',
    'archive_opened',
    'search_used',
    'exported',
    'saved_locally',
    'local_copy_opened',
    'cleared',
    'returned'
  )),
  occurred_on TEXT NOT NULL CHECK(length(occurred_on) = 10),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(session_id, name, occurred_on)
);

CREATE INDEX product_events_created_at_idx ON product_events(created_at);
CREATE INDEX product_events_name_day_idx ON product_events(name, occurred_on);
