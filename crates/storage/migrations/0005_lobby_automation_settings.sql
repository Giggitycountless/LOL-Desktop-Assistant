ALTER TABLE app_settings ADD COLUMN auto_accept_enabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_accept_enabled IN (0, 1));
ALTER TABLE app_settings ADD COLUMN auto_pick_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_pick_enabled IN (0, 1));
ALTER TABLE app_settings ADD COLUMN auto_pick_champion_id INTEGER CHECK (auto_pick_champion_id IS NULL OR auto_pick_champion_id > 0);
ALTER TABLE app_settings ADD COLUMN auto_ban_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_ban_enabled IN (0, 1));
ALTER TABLE app_settings ADD COLUMN auto_ban_champion_id INTEGER CHECK (auto_ban_champion_id IS NULL OR auto_ban_champion_id > 0);

UPDATE app_metadata
SET value = '5',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'schema_version';
