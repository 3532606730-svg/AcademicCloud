-- Account-private current-page OCR. Page images and pending jobs are never stored.
CREATE TABLE personal_local_ocr_pairings (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE RESTRICT,
  code_digest TEXT NOT NULL UNIQUE CHECK (length(code_digest) = 64),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  auth_revision INTEGER NOT NULL CHECK (auth_revision >= 0),
  expires_at TEXT NOT NULL,
  consumed_at TEXT
) STRICT;

CREATE TABLE personal_local_ocr_devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  auth_revision INTEGER NOT NULL CHECK (auth_revision >= 0),
  capabilities TEXT NOT NULL CHECK (length(capabilities) BETWEEN 1 AND 10000),
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  token_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (account_id, id)
) STRICT;
CREATE INDEX personal_local_ocr_devices_account ON personal_local_ocr_devices(account_id, created_at DESC);

CREATE TABLE personal_local_ocr_results (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  device_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  physical_page INTEGER NOT NULL CHECK (physical_page BETWEEN 1 AND 1000000),
  image_width INTEGER NOT NULL CHECK (image_width BETWEEN 1 AND 2000),
  image_height INTEGER NOT NULL CHECK (image_height BETWEEN 1 AND 2800),
  rotation INTEGER NOT NULL CHECK (rotation IN (0, 90, 180, 270)),
  image_sha256 TEXT NOT NULL CHECK (length(image_sha256) = 64),
  origin TEXT NOT NULL CHECK (origin = 'client_rendered_unverified'),
  machine_json TEXT NOT NULL CHECK (length(machine_json) BETWEEN 1 AND 200000),
  corrected_text TEXT CHECK (length(corrected_text) <= 16000),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id, device_id) REFERENCES personal_local_ocr_devices(account_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id, source_id) REFERENCES document_sources(file_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX personal_local_ocr_results_page ON personal_local_ocr_results(account_id, file_id, source_id, physical_page, created_at DESC, id DESC);

CREATE TRIGGER personal_local_ocr_device_identity BEFORE UPDATE OF id, account_id, token_digest, auth_revision, capabilities, created_at, token_expires_at ON personal_local_ocr_devices
BEGIN SELECT RAISE(ABORT, 'local OCR device identity is immutable'); END;
CREATE TRIGGER personal_local_ocr_device_retention BEFORE DELETE ON personal_local_ocr_devices
BEGIN SELECT RAISE(ABORT, 'local OCR devices require revocation'); END;
CREATE TRIGGER personal_local_ocr_result_identity BEFORE UPDATE OF id, account_id, device_id, file_id, source_id, physical_page, image_width, image_height, rotation, image_sha256, origin, machine_json, created_at ON personal_local_ocr_results
BEGIN SELECT RAISE(ABORT, 'local OCR machine result is immutable'); END;
CREATE TRIGGER personal_local_ocr_result_retention BEFORE DELETE ON personal_local_ocr_results
BEGIN SELECT RAISE(ABORT, 'local OCR results must be retained'); END;
