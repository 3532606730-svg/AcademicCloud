-- Admit the immutable v9/prompt-v6 sparse-output generation without rebuilding
-- or reinterpreting any historical bibliography evidence.

INSERT INTO scholarly_bibliographic_ruleset_registry (
  contract_version, ruleset_version, prompt_version, admitted_at
) VALUES (
  1,
  'l1-intelligent-library01-v9',
  'l1-intelligent-library01-prompt-v6',
  '2026-08-31T00:00:00.000Z'
);
