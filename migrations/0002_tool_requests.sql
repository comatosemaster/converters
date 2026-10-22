-- "Request a Tool" submissions. Managed from the command line only
-- (npm run requests / request:status / request:ship).

CREATE TABLE tool_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  description   TEXT NOT NULL,
  details       TEXT,
  email         TEXT,                                  -- only if the requester gave one
  subscriber_id INTEGER REFERENCES subscribers (id),   -- set when they asked to be emailed
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'planned', 'shipped', 'rejected')),
  shipped_slug  TEXT,                                  -- the tool's id once shipped, e.g. 'pdf-split'
  notified_at   TEXT,                                  -- when their digest said it's live
  created_at    TEXT NOT NULL,
  ip_hash       TEXT
);

CREATE INDEX tool_requests_status ON tool_requests (status, created_at);
