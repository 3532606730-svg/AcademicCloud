-- L2-ADMINPOLISH01 registers Owner announcement deletion in the immutable
-- governance audit vocabulary. Existing announcement and audit rows are not
-- rewritten.

INSERT INTO governance_audit_event_kinds (kind, target_type)
VALUES ('announcements.delete', 'announcement');
