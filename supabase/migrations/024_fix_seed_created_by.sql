-- BUG-A8-4-L010: Replace NULL created_by in org template seed data with a stable
-- system UUID so FK/policy logic is consistent and not fragile under policy rewrites.
UPDATE mx_classification_library
  SET created_by = '00000000-0000-0000-0000-000000000000'
  WHERE is_org = true AND created_by IS NULL;
