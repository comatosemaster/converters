-- Email subscriptions: one list (new tools + new guides), double opt-in.
-- Timestamps are ISO 8601 UTC strings (e.g. 2026-10-22T09:00:00.000Z),
-- which sort and compare correctly as text.

CREATE TABLE subscribers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirm_token   TEXT,            -- set while pending; cleared once confirmed
  unsub_token     TEXT NOT NULL,   -- in every email's unsubscribe link
  source          TEXT,            -- where they signed up: footer, blog, request...
  created_at      TEXT NOT NULL,
  confirmed_at    TEXT,
  unsubscribed_at TEXT,
  ip_hash         TEXT             -- salted SHA-256 of the sign-up IP, for abuse limits only
);

CREATE UNIQUE INDEX subscribers_confirm_token ON subscribers (confirm_token) WHERE confirm_token IS NOT NULL;
CREATE UNIQUE INDEX subscribers_unsub_token ON subscribers (unsub_token);
CREATE INDEX subscribers_status ON subscribers (status, created_at);

-- One row per weekly digest. `cutoff` is the newest item date the digest
-- covered: the next digest takes items published after it. (Comparing to
-- sent_at would drop items dated the same day as a send, since tools and
-- articles only have a publication date, not a time.)
CREATE TABLE digests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at         TEXT NOT NULL,
  item_count      INTEGER NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL CHECK (status IN ('partial', 'complete')),
  cutoff          TEXT NOT NULL,
  items_json      TEXT NOT NULL    -- the exact items, so a resumed digest sends the same content
);

-- Who has received which digest - makes sending resumable and never doubles up.
CREATE TABLE digest_sends (
  digest_id     INTEGER NOT NULL REFERENCES digests (id),
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id),
  sent_at       TEXT NOT NULL,
  PRIMARY KEY (digest_id, subscriber_id)
);

-- Sliding-window rate limiting (5 attempts per hour per hashed IP and
-- action). Rows older than a day are deleted by the daily cron.
CREATE TABLE rate_events (
  ip_hash    TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX rate_events_lookup ON rate_events (ip_hash, action, created_at);
