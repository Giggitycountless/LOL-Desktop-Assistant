pub(crate) const DATABASE_FILE_NAME: &str = "app.sqlite";
pub(crate) const MIGRATION_0001: &str = include_str!("../migrations/0001_initial.sql");
pub(crate) const MIGRATION_0002: &str = include_str!("../migrations/0002_state_foundation.sql");
pub(crate) const MIGRATION_0003: &str = include_str!("../migrations/0003_player_notes.sql");
pub(crate) const MIGRATION_0004: &str = include_str!("../migrations/0004_ranked_champion_cache.sql");
pub(crate) const MIGRATION_0005: &str = include_str!("../migrations/0005_lobby_automation_settings.sql");
pub(crate) const MIGRATION_0006: &str = include_str!("../migrations/0006_language_preference.sql");
