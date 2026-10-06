ALTER TABLE personal_local_ocr_devices ADD COLUMN transport_features TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(transport_features) AND json_type(transport_features) = 'array');

CREATE TABLE personal_local_ocr_book_jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  auth_revision INTEGER NOT NULL,
  client_request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
  device_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 500),
  state TEXT NOT NULL CHECK (state IN ('queued','running','paused','failed','cancelled','succeeded')),
  error_code TEXT,
  failed_physical_page INTEGER CHECK (failed_physical_page BETWEEN 1 AND page_count),
  attempt_id TEXT,
  lease_expires_at TEXT,
  decoded_page_count INTEGER CHECK (decoded_page_count = page_count),
  capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(account_id, client_request_id),
  FOREIGN KEY(account_id,device_id) REFERENCES personal_local_ocr_devices(account_id,id),
  FOREIGN KEY(file_id,source_id) REFERENCES document_sources(file_id,id)
) STRICT;
CREATE TRIGGER personal_local_ocr_device_transport_identity BEFORE UPDATE OF transport_features ON personal_local_ocr_devices
BEGIN SELECT RAISE(ABORT, 'local OCR transport identity is immutable'); END;
CREATE TRIGGER personal_local_ocr_book_identity BEFORE UPDATE OF id,account_id,auth_revision,client_request_id,request_digest,file_id,source_id,page_count,created_at,expires_at ON personal_local_ocr_book_jobs
BEGIN SELECT RAISE(ABORT, 'local OCR book identity is immutable'); END;
CREATE TRIGGER personal_local_ocr_book_retention BEFORE DELETE ON personal_local_ocr_book_jobs
BEGIN SELECT RAISE(ABORT, 'local OCR book jobs must be retained'); END;
CREATE UNIQUE INDEX personal_local_ocr_book_one_active_account ON personal_local_ocr_book_jobs(account_id)
  WHERE state IN ('queued','running');
CREATE INDEX personal_local_ocr_book_device_queue ON personal_local_ocr_book_jobs(device_id,state,created_at);
CREATE INDEX personal_local_ocr_book_account_source ON personal_local_ocr_book_jobs(account_id,file_id,source_id,created_at);

CREATE TABLE personal_local_ocr_book_page_receipts (
  job_id TEXT NOT NULL REFERENCES personal_local_ocr_book_jobs(id),
  physical_page INTEGER NOT NULL CHECK (physical_page BETWEEN 1 AND 500),
  result_id TEXT NOT NULL REFERENCES personal_local_ocr_results(id),
  accepted_attempt_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY(job_id,physical_page)
) STRICT;
CREATE TRIGGER personal_local_ocr_book_receipt_identity BEFORE UPDATE ON personal_local_ocr_book_page_receipts
BEGIN SELECT RAISE(ABORT, 'local OCR book receipt is immutable'); END;
CREATE TRIGGER personal_local_ocr_book_receipt_retention BEFORE DELETE ON personal_local_ocr_book_page_receipts
BEGIN SELECT RAISE(ABORT, 'local OCR book receipt must be retained'); END;
