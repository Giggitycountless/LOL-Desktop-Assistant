ALTER TABLE app_settings ADD COLUMN language TEXT NOT NULL DEFAULT 'system' CHECK (language IN ('system', 'zh', 'en'));

UPDATE app_metadata
SET value = '6',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'schema_version';
