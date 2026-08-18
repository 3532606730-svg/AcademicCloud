-- RF-FRONTMATTEROCR01 adds only immutable candidate provenance. Raw OCR page
-- text, rendered images, PDF bytes, object keys, and whole-document derived
-- text remain outside persistence.

ALTER TABLE scholarly_metadata_suggestion_candidates
  ADD COLUMN evidence_origin TEXT NOT NULL DEFAULT 'legacy_v1'
    CHECK (evidence_origin IN (
      'legacy_v1', 'native_text', 'ocr', 'embedded_pdf_metadata', 'filename'
    ));

ALTER TABLE scholarly_metadata_suggestion_candidates
  ADD COLUMN ocr_engine TEXT
    CHECK (
      ocr_engine IS NULL OR (
        length(ocr_engine) BETWEEN 1 AND 128
        AND ocr_engine = trim(ocr_engine)
        AND instr(ocr_engine, char(0)) = 0
        AND instr(ocr_engine, char(9)) = 0
        AND instr(ocr_engine, char(10)) = 0
        AND instr(ocr_engine, char(13)) = 0
      )
    );

ALTER TABLE scholarly_metadata_suggestion_candidates
  ADD COLUMN ocr_confidence INTEGER
    CHECK (ocr_confidence IS NULL OR ocr_confidence BETWEEN 0 AND 100);

-- Existing migration-019 rows retain the truthful `legacy_v1` marker. Their
-- exact origin remains deterministically recoverable: page evidence was
-- native text, while embedded/filename source types are already explicit.
-- New rows must carry exact prospective provenance.
CREATE TRIGGER scholarly_metadata_suggestion_candidates_provenance_guard_insert
BEFORE INSERT ON scholarly_metadata_suggestion_candidates
WHEN NEW.evidence_origin = 'legacy_v1'
  OR (
    NEW.evidence_origin = 'ocr'
    AND (
      NEW.source_page_index IS NULL
      OR NEW.ocr_engine IS NULL
      OR NEW.ocr_confidence IS NULL
    )
  )
  OR (
    NEW.evidence_origin <> 'ocr'
    AND (NEW.ocr_engine IS NOT NULL OR NEW.ocr_confidence IS NOT NULL)
  )
  OR (
    NEW.evidence_origin IN ('native_text', 'ocr')
    AND (
      NEW.source_page_index IS NULL
      OR NEW.source_type IN ('embedded_pdf_metadata', 'filename')
    )
  )
  OR (
    NEW.evidence_origin = 'embedded_pdf_metadata'
    AND (NEW.source_type <> 'embedded_pdf_metadata' OR NEW.source_page_index IS NOT NULL)
  )
  OR (
    NEW.evidence_origin = 'filename'
    AND (NEW.source_type <> 'filename' OR NEW.source_page_index IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid suggestion evidence provenance');
END;
