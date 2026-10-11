-- New outlets start as "not registered" (no GST). Existing rows keep their stored scheme.
ALTER TABLE outlets ALTER COLUMN tax_scheme SET DEFAULT 'NONE';
