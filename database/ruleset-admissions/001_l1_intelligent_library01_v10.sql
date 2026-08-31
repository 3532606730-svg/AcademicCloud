-- Append-only data admission for the v10/prompt-v7 reasoning generation.
-- This is intentionally not a schema migration and does not alter history.

INSERT INTO scholarly_bibliographic_ruleset_registry (
  contract_version, ruleset_version, prompt_version, admitted_at
) VALUES (
  1,
  'l1-intelligent-library01-v10',
  'l1-intelligent-library01-prompt-v7',
  '2026-08-31T00:00:00.000Z'
);
