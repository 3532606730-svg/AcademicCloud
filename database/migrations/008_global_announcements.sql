-- Layer 2 global homepage announcements. Content is plain text; publication
-- state and effective windows are server-authoritative.

CREATE TABLE announcements (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  title TEXT NOT NULL
    CHECK (
      length(title) BETWEEN 1 AND 200
      AND title = trim(title)
      AND instr(title, char(0)) = 0
      AND instr(title, char(10)) = 0
      AND instr(title, char(13)) = 0
    ),
  body TEXT NOT NULL
    CHECK (
      length(body) BETWEEN 1 AND 4000
      AND length(trim(body)) > 0
      AND instr(body, char(0)) = 0
    ),
  severity TEXT NOT NULL
    CHECK (severity IN ('info', 'warning', 'critical')),
  link_url TEXT
    CHECK (
      link_url IS NULL
      OR (
        length(link_url) BETWEEN 9 AND 2048
        AND link_url = trim(link_url)
        AND substr(link_url, 1, 8) = 'https://'
        AND instr(link_url, char(0)) = 0
        AND instr(link_url, char(10)) = 0
        AND instr(link_url, char(13)) = 0
      )
    ),
  is_active INTEGER NOT NULL DEFAULT 0
    CHECK (is_active IN (0, 1)),
  published_at TEXT
    CHECK (
      published_at IS NULL
      OR (
        length(published_at) = 24
        AND published_at GLOB '????-??-??T??:??:??.???Z'
      )
    ),
  expires_at TEXT
    CHECK (
      expires_at IS NULL
      OR (
        length(expires_at) = 24
        AND expires_at GLOB '????-??-??T??:??:??.???Z'
      )
    ),
  created_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
    CHECK (
      length(created_at) = 24
      AND created_at GLOB '????-??-??T??:??:??.???Z'
    ),
  updated_at TEXT NOT NULL
    CHECK (
      length(updated_at) = 24
      AND updated_at GLOB '????-??-??T??:??:??.???Z'
      AND updated_at >= created_at
    ),
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (published_at IS NULL OR published_at >= created_at),
  CHECK (is_active = 0 OR published_at IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (
    is_active = 0
    OR expires_at IS NULL
    OR expires_at > published_at
  )
) STRICT;

CREATE INDEX announcements_administration_index
  ON announcements(updated_at DESC, id);

CREATE INDEX announcements_effective_index
  ON announcements(is_active, published_at DESC, expires_at, created_at DESC, id);
