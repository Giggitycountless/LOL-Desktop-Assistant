use std::{
    error::Error,
    fmt, fs,
    path::{Path, PathBuf},
};

use domain::{
    ActivityEntry, ActivityKind, AppLanguagePreference, AppSettings, ImportLocalDataResult,
    LocalActivityEntry, NewActivityEntry, RankedChampionDataSnapshot, RankedChampionLane,
    RankedChampionStat, SettingsValues, StartupPage,
};
use rusqlite::{Connection, OptionalExtension};

const DATABASE_FILE_NAME: &str = "app.sqlite";
const MIGRATION_0001: &str = include_str!("../migrations/0001_initial.sql");
const MIGRATION_0002: &str = include_str!("../migrations/0002_state_foundation.sql");
const MIGRATION_0003: &str = include_str!("../migrations/0003_player_notes.sql");
const MIGRATION_0004: &str = include_str!("../migrations/0004_ranked_champion_cache.sql");
const MIGRATION_0005: &str = include_str!("../migrations/0005_lobby_automation_settings.sql");
const MIGRATION_0006: &str = include_str!("../migrations/0006_language_preference.sql");

#[derive(Debug, Clone)]
pub struct SqliteStore {
    database_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageHealth {
    pub schema_version: i64,
}

impl SqliteStore {
    pub fn initialize(data_dir: impl AsRef<Path>) -> StorageResult<Self> {
        fs::create_dir_all(data_dir.as_ref())?;
        let database_path = data_dir.as_ref().join(DATABASE_FILE_NAME);
        let mut connection = Connection::open(&database_path)?;

        configure_connection(&connection)?;
        run_migrations(&mut connection)?;

        Ok(Self { database_path })
    }

    pub fn database_path(&self) -> &Path {
        &self.database_path
    }

    pub fn health(&self) -> StorageResult<StorageHealth> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;

        Ok(StorageHealth {
            schema_version: read_schema_version(&connection)?,
        })
    }

    pub fn get_settings(&self) -> StorageResult<AppSettings> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        read_settings(&connection)
    }

    pub fn save_settings(&self, settings: &SettingsValues) -> StorageResult<AppSettings> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;

        write_settings(&connection, settings)?;

        read_settings(&connection)
    }

    pub fn list_activity_entries(
        &self,
        limit: i64,
        kind: Option<ActivityKind>,
    ) -> StorageResult<Vec<ActivityEntry>> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        list_activity_entries(&connection, Some(limit), kind)
    }

    pub fn list_all_activity_entries(&self) -> StorageResult<Vec<ActivityEntry>> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        list_activity_entries(&connection, None, None)
    }

    pub fn create_activity_entry(&self, entry: &NewActivityEntry) -> StorageResult<ActivityEntry> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;

        insert_activity_entry(&connection, entry)?;

        let id = connection.last_insert_rowid();
        read_activity_entry_by_id(&connection, id)
    }

    pub fn import_local_data(
        &self,
        settings: &SettingsValues,
        activity_entries: &[LocalActivityEntry],
    ) -> StorageResult<ImportLocalDataResult> {
        let mut connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        let transaction = connection.transaction()?;

        write_settings(&transaction, settings)?;
        for entry in activity_entries {
            insert_imported_activity_entry(&transaction, entry)?;
        }

        let settings = read_settings(&transaction)?;
        let imported_activity_count = activity_entries.len();
        transaction.commit()?;

        Ok(ImportLocalDataResult {
            settings,
            imported_activity_count,
        })
    }

    pub fn clear_activity_entries(&self) -> StorageResult<i64> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        let deleted_count = connection.execute("DELETE FROM activity_entries", [])?;

        Ok(deleted_count as i64)
    }

    pub fn get_player_note(
        &self,
        player_puuid: &str,
    ) -> StorageResult<Option<application::StoredPlayerNote>> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        read_player_note(&connection, player_puuid)
    }

    pub fn save_player_note(
        &self,
        note: &application::StoredPlayerNoteInput,
    ) -> StorageResult<application::StoredPlayerNote> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;

        write_player_note(&connection, note)?;
        read_player_note(&connection, note.player_puuid.as_str())?
            .ok_or(StorageError::MissingPlayerNote)
    }

    pub fn clear_player_note(&self, player_puuid: &str) -> StorageResult<bool> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        let deleted_count = connection.execute(
            "DELETE FROM player_notes WHERE player_puuid = ?1",
            [player_puuid],
        )?;

        Ok(deleted_count > 0)
    }

    pub fn latest_ranked_champion_snapshot(
        &self,
    ) -> StorageResult<Option<RankedChampionDataSnapshot>> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        read_latest_ranked_champion_snapshot(&connection)
    }

    pub fn replace_ranked_champion_snapshot(
        &self,
        snapshot: &RankedChampionDataSnapshot,
    ) -> StorageResult<RankedChampionDataSnapshot> {
        let mut connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        let transaction = connection.transaction()?;

        transaction.execute("DELETE FROM ranked_champion_snapshots", [])?;
        insert_ranked_champion_snapshot(&transaction, snapshot)?;
        let saved = read_latest_ranked_champion_snapshot(&transaction)?
            .ok_or(StorageError::MissingRankedChampionSnapshot)?;
        transaction.commit()?;

        Ok(saved)
    }
}

pub type StorageResult<T> = Result<T, StorageError>;

#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    InvalidActivityKind(String),
    InvalidStartupPage(String),
    InvalidLanguagePreference(String),
    MissingSchemaVersion,
    MissingPlayerNote,
    InvalidPlayerTags(String),
    InvalidRankedChampionLane(String),
    MissingRankedChampionSnapshot,
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "storage I/O error: {error}"),
            Self::Sqlite(error) => write!(formatter, "sqlite error: {error}"),
            Self::InvalidActivityKind(value) => write!(formatter, "invalid activity kind: {value}"),
            Self::InvalidStartupPage(value) => write!(formatter, "invalid startup page: {value}"),
            Self::InvalidLanguagePreference(value) => {
                write!(formatter, "invalid language preference: {value}")
            }
            Self::MissingSchemaVersion => write!(formatter, "schema version metadata is missing"),
            Self::MissingPlayerNote => write!(formatter, "player note is missing after save"),
            Self::InvalidPlayerTags(error) => write!(formatter, "invalid player tags: {error}"),
            Self::InvalidRankedChampionLane(value) => {
                write!(formatter, "invalid ranked champion lane: {value}")
            }
            Self::MissingRankedChampionSnapshot => {
                write!(formatter, "ranked champion snapshot is missing after save")
            }
        }
    }
}

impl Error for StorageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sqlite(error) => Some(error),
            Self::InvalidActivityKind(_)
            | Self::InvalidStartupPage(_)
            | Self::InvalidLanguagePreference(_)
            | Self::MissingSchemaVersion
            | Self::MissingPlayerNote
            | Self::InvalidPlayerTags(_)
            | Self::InvalidRankedChampionLane(_)
            | Self::MissingRankedChampionSnapshot => None,
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

fn configure_connection(connection: &Connection) -> StorageResult<()> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

fn run_migrations(connection: &mut Connection) -> StorageResult<()> {
    let transaction = connection.transaction()?;

    transaction.execute_batch(
        "CREATE TABLE IF NOT EXISTS __app_migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    )?;

    for migration in [
        Migration {
            version: 1,
            description: "initial_schema",
            sql: MIGRATION_0001,
        },
        Migration {
            version: 2,
            description: "state_foundation",
            sql: MIGRATION_0002,
        },
        Migration {
            version: 3,
            description: "player_notes",
            sql: MIGRATION_0003,
        },
        Migration {
            version: 4,
            description: "ranked_champion_cache",
            sql: MIGRATION_0004,
        },
        Migration {
            version: 5,
            description: "lobby_automation_settings",
            sql: MIGRATION_0005,
        },
        Migration {
            version: 6,
            description: "language_preference",
            sql: MIGRATION_0006,
        },
    ] {
        let migration_is_applied = transaction
            .query_row(
                "SELECT 1 FROM __app_migrations WHERE version = ?1",
                [migration.version],
                |_| Ok(()),
            )
            .optional()?
            .is_some();

        if !migration_is_applied {
            transaction.execute_batch(migration.sql)?;
            transaction.execute(
                "INSERT INTO __app_migrations (version, description) VALUES (?1, ?2)",
                (migration.version, migration.description),
            )?;
        }
    }

    transaction.commit()?;
    Ok(())
}

struct Migration {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

fn read_schema_version(connection: &Connection) -> StorageResult<i64> {
    connection
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM app_metadata WHERE key = ?1",
            ["schema_version"],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(StorageError::MissingSchemaVersion)
}

fn read_settings(connection: &Connection) -> StorageResult<AppSettings> {
    connection
        .query_row(
            "SELECT startup_page, language, compact_mode, activity_limit, auto_accept_enabled,
                auto_pick_enabled, auto_pick_champion_id, auto_ban_enabled,
                auto_ban_champion_id, updated_at
            FROM app_settings
            WHERE id = 1",
            [],
            |row| {
                let startup_page: String = row.get(0)?;
                let language: String = row.get(1)?;

                Ok((
                    startup_page,
                    language,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, Option<i64>>(8)?,
                    row.get::<_, String>(9)?,
                ))
            },
        )
        .map_err(StorageError::from)
        .and_then(
            |(
                startup_page,
                language,
                compact_mode,
                activity_limit,
                auto_accept_enabled,
                auto_pick_enabled,
                auto_pick_champion_id,
                auto_ban_enabled,
                auto_ban_champion_id,
                updated_at,
            )| {
                let startup_page = StartupPage::parse(startup_page.as_str())
                    .ok_or(StorageError::InvalidStartupPage(startup_page))?;
                let language = AppLanguagePreference::parse(language.as_str())
                    .ok_or(StorageError::InvalidLanguagePreference(language))?;

                Ok(AppSettings {
                    startup_page,
                    language,
                    compact_mode: int_to_bool(compact_mode),
                    activity_limit,
                    auto_accept_enabled: int_to_bool(auto_accept_enabled),
                    auto_pick_enabled: int_to_bool(auto_pick_enabled),
                    auto_pick_champion_id,
                    auto_ban_enabled: int_to_bool(auto_ban_enabled),
                    auto_ban_champion_id,
                    updated_at,
                })
            },
        )
}

fn write_settings(connection: &Connection, settings: &SettingsValues) -> StorageResult<()> {
    connection.execute(
        "UPDATE app_settings
        SET startup_page = ?1,
            language = ?2,
            compact_mode = ?3,
            activity_limit = ?4,
            auto_accept_enabled = ?5,
            auto_pick_enabled = ?6,
            auto_pick_champion_id = ?7,
            auto_ban_enabled = ?8,
            auto_ban_champion_id = ?9,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1",
        (
            settings.startup_page.as_str(),
            settings.language.as_str(),
            bool_to_int(settings.compact_mode),
            settings.activity_limit,
            bool_to_int(settings.auto_accept_enabled),
            bool_to_int(settings.auto_pick_enabled),
            settings.auto_pick_champion_id,
            bool_to_int(settings.auto_ban_enabled),
            settings.auto_ban_champion_id,
        ),
    )?;

    Ok(())
}

fn list_activity_entries(
    connection: &Connection,
    limit: Option<i64>,
    kind: Option<ActivityKind>,
) -> StorageResult<Vec<ActivityEntry>> {
    match (limit, kind) {
        (Some(limit), Some(kind)) => {
            let mut statement = connection.prepare(
                "SELECT id, kind, title, body, created_at
                FROM activity_entries
                WHERE kind = ?1
                ORDER BY created_at DESC, id DESC
                LIMIT ?2",
            )?;

            let records = statement
                .query_map((kind.as_str(), limit), read_activity_entry)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(records)
        }
        (Some(limit), None) => {
            let mut statement = connection.prepare(
                "SELECT id, kind, title, body, created_at
                FROM activity_entries
                ORDER BY created_at DESC, id DESC
                LIMIT ?1",
            )?;

            let records = statement
                .query_map([limit], read_activity_entry)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(records)
        }
        (None, Some(kind)) => {
            let mut statement = connection.prepare(
                "SELECT id, kind, title, body, created_at
                FROM activity_entries
                WHERE kind = ?1
                ORDER BY created_at DESC, id DESC",
            )?;

            let records = statement
                .query_map([kind.as_str()], read_activity_entry)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(records)
        }
        (None, None) => {
            let mut statement = connection.prepare(
                "SELECT id, kind, title, body, created_at
                FROM activity_entries
                ORDER BY created_at DESC, id DESC",
            )?;

            let records = statement
                .query_map([], read_activity_entry)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(records)
        }
    }
}

fn insert_activity_entry(connection: &Connection, entry: &NewActivityEntry) -> StorageResult<()> {
    connection.execute(
        "INSERT INTO activity_entries (kind, title, body)
        VALUES (?1, ?2, ?3)",
        (
            entry.kind.as_str(),
            entry.title.as_str(),
            entry.body.as_deref(),
        ),
    )?;

    Ok(())
}

fn insert_imported_activity_entry(
    connection: &Connection,
    entry: &LocalActivityEntry,
) -> StorageResult<()> {
    connection.execute(
        "INSERT INTO activity_entries (kind, title, body, created_at)
        VALUES (?1, ?2, ?3, ?4)",
        (
            entry.kind.as_str(),
            entry.title.as_str(),
            entry.body.as_deref(),
            entry.created_at.as_str(),
        ),
    )?;

    Ok(())
}

fn read_activity_entry_by_id(connection: &Connection, id: i64) -> StorageResult<ActivityEntry> {
    connection
        .query_row(
            "SELECT id, kind, title, body, created_at
            FROM activity_entries
            WHERE id = ?1",
            [id],
            read_activity_entry,
        )
        .map_err(StorageError::from)
}

fn read_activity_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityEntry> {
    let kind: String = row.get(1)?;

    Ok(ActivityEntry {
        id: row.get(0)?,
        kind: ActivityKind::parse(kind.as_str()).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                1,
                rusqlite::types::Type::Text,
                Box::new(StorageError::InvalidActivityKind(kind)),
            )
        })?,
        title: row.get(2)?,
        body: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn read_player_note(
    connection: &Connection,
    player_puuid: &str,
) -> StorageResult<Option<application::StoredPlayerNote>> {
    connection
        .query_row(
            "SELECT player_puuid, last_display_name, note, tags_json, updated_at
            FROM player_notes
            WHERE player_puuid = ?1",
            [player_puuid],
            |row| {
                let tags_json: String = row.get(3)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    tags_json,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()?
        .map(
            |(player_puuid, last_display_name, note, tags_json, updated_at)| {
                let tags: Vec<String> = serde_json::from_str(tags_json.as_str())
                    .map_err(|error| StorageError::InvalidPlayerTags(error.to_string()))?;

                Ok(application::StoredPlayerNote {
                    player_puuid,
                    last_display_name,
                    note,
                    tags,
                    updated_at,
                })
            },
        )
        .transpose()
}

fn write_player_note(
    connection: &Connection,
    note: &application::StoredPlayerNoteInput,
) -> StorageResult<()> {
    let tags_json = serde_json::to_string(&note.tags)
        .map_err(|error| StorageError::InvalidPlayerTags(error.to_string()))?;

    connection.execute(
        "INSERT INTO player_notes (player_puuid, last_display_name, note, tags_json)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(player_puuid) DO UPDATE SET
            last_display_name = excluded.last_display_name,
            note = excluded.note,
            tags_json = excluded.tags_json,
            updated_at = CURRENT_TIMESTAMP",
        (
            note.player_puuid.as_str(),
            note.last_display_name.as_str(),
            note.note.as_deref(),
            tags_json.as_str(),
        ),
    )?;

    Ok(())
}

fn read_latest_ranked_champion_snapshot(
    connection: &Connection,
) -> StorageResult<Option<RankedChampionDataSnapshot>> {
    let metadata = connection
        .query_row(
            "SELECT id, source, patch, region, queue, tier, generated_at, imported_at
            FROM ranked_champion_snapshots
            ORDER BY imported_at DESC, id DESC
            LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()?;

    let Some((snapshot_id, source, patch, region, queue, tier, generated_at, imported_at)) =
        metadata
    else {
        return Ok(None);
    };

    let records = read_ranked_champion_entries(connection, snapshot_id)?;

    Ok(Some(RankedChampionDataSnapshot {
        source,
        patch,
        region,
        queue,
        tier,
        generated_at,
        imported_at,
        records,
    }))
}

fn read_ranked_champion_entries(
    connection: &Connection,
    snapshot_id: i64,
) -> StorageResult<Vec<RankedChampionStat>> {
    let mut statement = connection.prepare(
        "SELECT champion_id, champion_name, champion_alias, lane, games, wins, picks, bans,
            win_rate, pick_rate, ban_rate, overall_score
        FROM ranked_champion_entries
        WHERE snapshot_id = ?1
        ORDER BY overall_score DESC, champion_name ASC",
    )?;
    let records = statement
        .query_map([snapshot_id], read_ranked_champion_entry)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(records)
}

fn read_ranked_champion_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<RankedChampionStat> {
    let lane: String = row.get(3)?;

    Ok(RankedChampionStat {
        champion_id: row.get(0)?,
        champion_name: row.get(1)?,
        champion_alias: row.get(2)?,
        lane: RankedChampionLane::parse(lane.as_str()).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                Box::new(StorageError::InvalidRankedChampionLane(lane)),
            )
        })?,
        games: row.get(4)?,
        wins: row.get(5)?,
        picks: row.get(6)?,
        bans: row.get(7)?,
        win_rate: row.get(8)?,
        pick_rate: row.get(9)?,
        ban_rate: row.get(10)?,
        overall_score: row.get(11)?,
    })
}

fn insert_ranked_champion_snapshot(
    connection: &Connection,
    snapshot: &RankedChampionDataSnapshot,
) -> StorageResult<()> {
    connection.execute(
        "INSERT INTO ranked_champion_snapshots
            (source, patch, region, queue, tier, generated_at, imported_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            snapshot.source.as_str(),
            snapshot.patch.as_deref(),
            snapshot.region.as_deref(),
            snapshot.queue.as_deref(),
            snapshot.tier.as_deref(),
            snapshot.generated_at.as_deref(),
            snapshot.imported_at.as_str(),
        ),
    )?;
    let snapshot_id = connection.last_insert_rowid();

    for record in &snapshot.records {
        connection.execute(
            "INSERT INTO ranked_champion_entries
                (snapshot_id, champion_id, champion_name, champion_alias, lane, games, wins, picks,
                    bans, win_rate, pick_rate, ban_rate, overall_score)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            (
                snapshot_id,
                record.champion_id,
                record.champion_name.as_str(),
                record.champion_alias.as_deref(),
                record.lane.as_str(),
                record.games,
                record.wins,
                record.picks,
                record.bans,
                record.win_rate,
                record.pick_rate,
                record.ban_rate,
                record.overall_score,
            ),
        )?;
    }

    Ok(())
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn int_to_bool(value: i64) -> bool {
    value != 0
}

impl application::AppStore for SqliteStore {
    fn schema_version(&self) -> Result<i64, String> {
        self.health()
            .map(|health| health.schema_version)
            .map_err(|error| error.to_string())
    }

    fn get_settings(&self) -> Result<AppSettings, String> {
        SqliteStore::get_settings(self).map_err(|error| error.to_string())
    }

    fn save_settings(&self, settings: SettingsValues) -> Result<AppSettings, String> {
        SqliteStore::save_settings(self, &settings).map_err(|error| error.to_string())
    }

    fn list_activity_entries(
        &self,
        limit: i64,
        kind: Option<ActivityKind>,
    ) -> Result<Vec<ActivityEntry>, String> {
        SqliteStore::list_activity_entries(self, limit, kind).map_err(|error| error.to_string())
    }

    fn list_all_activity_entries(&self) -> Result<Vec<ActivityEntry>, String> {
        SqliteStore::list_all_activity_entries(self).map_err(|error| error.to_string())
    }

    fn create_activity_entry(&self, entry: NewActivityEntry) -> Result<ActivityEntry, String> {
        SqliteStore::create_activity_entry(self, &entry).map_err(|error| error.to_string())
    }

    fn import_local_data(
        &self,
        settings: SettingsValues,
        activity_entries: Vec<LocalActivityEntry>,
    ) -> Result<ImportLocalDataResult, String> {
        SqliteStore::import_local_data(self, &settings, &activity_entries)
            .map_err(|error| error.to_string())
    }

    fn clear_activity_entries(&self) -> Result<i64, String> {
        SqliteStore::clear_activity_entries(self).map_err(|error| error.to_string())
    }

    fn get_player_note(
        &self,
        player_puuid: &str,
    ) -> Result<Option<application::StoredPlayerNote>, String> {
        SqliteStore::get_player_note(self, player_puuid).map_err(|error| error.to_string())
    }

    fn save_player_note(
        &self,
        note: application::StoredPlayerNoteInput,
    ) -> Result<application::StoredPlayerNote, String> {
        SqliteStore::save_player_note(self, &note).map_err(|error| error.to_string())
    }

    fn clear_player_note(&self, player_puuid: &str) -> Result<bool, String> {
        SqliteStore::clear_player_note(self, player_puuid).map_err(|error| error.to_string())
    }

    fn latest_ranked_champion_snapshot(
        &self,
    ) -> Result<Option<RankedChampionDataSnapshot>, String> {
        SqliteStore::latest_ranked_champion_snapshot(self).map_err(|error| error.to_string())
    }

    fn replace_ranked_champion_snapshot(
        &self,
        snapshot: RankedChampionDataSnapshot,
    ) -> Result<RankedChampionDataSnapshot, String> {
        SqliteStore::replace_ranked_champion_snapshot(self, &snapshot)
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn initializes_database_and_migrations() {
        let data_dir = unique_temp_dir();

        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        assert!(store.database_path().exists());
        assert_eq!(store.health().expect("storage health").schema_version, 6);
        assert_eq!(store.get_settings().expect("settings").activity_limit, 100);
        assert_eq!(
            store.get_settings().expect("settings").language,
            AppLanguagePreference::System
        );
        assert_eq!(migration_count(store.database_path()), 6);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn initialization_is_idempotent() {
        let data_dir = unique_temp_dir();

        let first = SqliteStore::initialize(&data_dir).expect("first initialization");
        let second = SqliteStore::initialize(&data_dir).expect("second initialization");

        assert_eq!(first.database_path(), second.database_path());
        assert_eq!(second.health().expect("storage health").schema_version, 6);
        assert_eq!(migration_count(second.database_path()), 6);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn upgrades_schema_version_one_database() {
        let data_dir = unique_temp_dir();
        fs::create_dir_all(&data_dir).expect("create test data dir");
        let database_path = data_dir.join(DATABASE_FILE_NAME);
        let connection = Connection::open(&database_path).expect("open v1 database");

        connection
            .execute_batch(
                "CREATE TABLE __app_migrations (
                    version INTEGER PRIMARY KEY,
                    description TEXT NOT NULL,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );",
            )
            .expect("create migration table");
        connection
            .execute_batch(MIGRATION_0001)
            .expect("apply v1 migration");
        connection
            .execute(
                "INSERT INTO __app_migrations (version, description) VALUES (?1, ?2)",
                (1_i64, "initial_schema"),
            )
            .expect("record v1 migration");
        drop(connection);

        let store = SqliteStore::initialize(&data_dir).expect("upgrade database");

        assert_eq!(store.health().expect("storage health").schema_version, 6);
        assert_eq!(
            store.get_settings().expect("settings").startup_page,
            StartupPage::Dashboard
        );
        assert_eq!(
            store.get_settings().expect("settings").language,
            AppLanguagePreference::System
        );
        assert_eq!(migration_count(store.database_path()), 6);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn persists_settings() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        let settings = store
            .save_settings(&SettingsValues {
                startup_page: StartupPage::Activity,
                language: AppLanguagePreference::Zh,
                compact_mode: true,
                activity_limit: 25,
                auto_accept_enabled: false,
                auto_pick_enabled: true,
                auto_pick_champion_id: Some(103),
                auto_ban_enabled: true,
                auto_ban_champion_id: Some(122),
            })
            .expect("settings saved");

        assert_eq!(settings.startup_page, StartupPage::Activity);
        assert_eq!(settings.language, AppLanguagePreference::Zh);
        assert!(settings.compact_mode);
        assert!(!settings.auto_accept_enabled);
        assert!(settings.auto_pick_enabled);
        assert_eq!(settings.auto_pick_champion_id, Some(103));
        assert!(settings.auto_ban_enabled);
        assert_eq!(settings.auto_ban_champion_id, Some(122));
        assert_eq!(store.get_settings().expect("settings").activity_limit, 25);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn creates_and_lists_activity_entries() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        let first = store
            .create_activity_entry(&NewActivityEntry {
                kind: ActivityKind::Note,
                title: "First".to_string(),
                body: None,
            })
            .expect("first activity entry");
        let second = store
            .create_activity_entry(&NewActivityEntry {
                kind: ActivityKind::System,
                title: "Second".to_string(),
                body: Some("Body".to_string()),
            })
            .expect("second activity entry");

        let entries = store
            .list_activity_entries(10, None)
            .expect("activity entries");

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, second.id);
        assert_eq!(entries[1].id, first.id);
        assert_eq!(entries[0].body.as_deref(), Some("Body"));

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn filters_activity_entries_by_kind() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        store
            .create_activity_entry(&NewActivityEntry {
                kind: ActivityKind::Note,
                title: "Note".to_string(),
                body: None,
            })
            .expect("note activity entry");
        store
            .create_activity_entry(&NewActivityEntry {
                kind: ActivityKind::System,
                title: "System".to_string(),
                body: None,
            })
            .expect("system activity entry");

        let entries = store
            .list_activity_entries(10, Some(ActivityKind::System))
            .expect("filtered activity entries");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, ActivityKind::System);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn imports_local_data_transactionally() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        let result = store
            .import_local_data(
                &SettingsValues {
                    startup_page: StartupPage::Activity,
                    language: AppLanguagePreference::En,
                    compact_mode: true,
                    activity_limit: 25,
                    auto_accept_enabled: true,
                    auto_pick_enabled: false,
                    auto_pick_champion_id: None,
                    auto_ban_enabled: false,
                    auto_ban_champion_id: None,
                },
                &[LocalActivityEntry {
                    kind: ActivityKind::Note,
                    title: "Imported".to_string(),
                    body: Some("Preserved".to_string()),
                    created_at: "2026-04-19 12:00:00".to_string(),
                }],
            )
            .expect("local data import");

        let entries = store.list_all_activity_entries().expect("all activity");

        assert_eq!(result.imported_activity_count, 1);
        assert_eq!(result.settings.startup_page, StartupPage::Activity);
        assert_eq!(result.settings.language, AppLanguagePreference::En);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].created_at, "2026-04-19 12:00:00");

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn clears_activity_entries() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        store
            .create_activity_entry(&NewActivityEntry {
                kind: ActivityKind::Note,
                title: "Note".to_string(),
                body: None,
            })
            .expect("activity entry");

        let deleted_count = store.clear_activity_entries().expect("activity clears");

        assert_eq!(deleted_count, 1);
        assert!(store
            .list_all_activity_entries()
            .expect("all activity")
            .is_empty());

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn saves_updates_and_clears_player_notes() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        let saved = store
            .save_player_note(&application::StoredPlayerNoteInput {
                player_puuid: "internal-puuid".to_string(),
                last_display_name: "Visible Player".to_string(),
                note: Some("Strong laner".to_string()),
                tags: vec!["lane".to_string(), "carry".to_string()],
            })
            .expect("player note saves");
        let updated = store
            .save_player_note(&application::StoredPlayerNoteInput {
                player_puuid: "internal-puuid".to_string(),
                last_display_name: "Visible Player".to_string(),
                note: None,
                tags: vec!["calm".to_string()],
            })
            .expect("player note updates");
        let cleared = store
            .clear_player_note("internal-puuid")
            .expect("player note clears");

        assert_eq!(saved.note.as_deref(), Some("Strong laner"));
        assert_eq!(saved.tags, vec!["lane", "carry"]);
        assert_eq!(updated.note, None);
        assert_eq!(updated.tags, vec!["calm"]);
        assert!(cleared);
        assert!(store
            .get_player_note("internal-puuid")
            .expect("player note reads")
            .is_none());

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn stores_and_replaces_ranked_champion_snapshot() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        assert!(store
            .latest_ranked_champion_snapshot()
            .expect("empty ranked snapshot reads")
            .is_none());

        let first = sample_ranked_snapshot("first", 103, RankedChampionLane::Middle);
        let saved = store
            .replace_ranked_champion_snapshot(&first)
            .expect("ranked snapshot saves");
        let second = sample_ranked_snapshot("second", 222, RankedChampionLane::Bottom);
        let replaced = store
            .replace_ranked_champion_snapshot(&second)
            .expect("ranked snapshot replaces");

        assert_eq!(saved.source, "first");
        assert_eq!(saved.records[0].champion_name, "Ahri");
        assert_eq!(replaced.source, "second");
        assert_eq!(replaced.records.len(), 1);
        assert_eq!(replaced.records[0].champion_id, 222);
        assert_eq!(ranked_snapshot_count(store.database_path()), 1);

        let _ = fs::remove_dir_all(data_dir);
    }

    fn unique_temp_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after unix epoch")
            .as_nanos();

        env::temp_dir().join(format!(
            "lol_desktop_assistant_storage_test_{}_{}",
            std::process::id(),
            stamp
        ))
    }

    fn migration_count(database_path: &Path) -> i64 {
        let connection = Connection::open(database_path).expect("open test database");

        connection
            .query_row("SELECT COUNT(*) FROM __app_migrations", [], |row| {
                row.get(0)
            })
            .expect("query migration count")
    }

    fn ranked_snapshot_count(database_path: &Path) -> i64 {
        let connection = Connection::open(database_path).expect("open test database");

        connection
            .query_row(
                "SELECT COUNT(*) FROM ranked_champion_snapshots",
                [],
                |row| row.get(0),
            )
            .expect("query ranked snapshot count")
    }

    fn sample_ranked_snapshot(
        source: &str,
        champion_id: i64,
        lane: RankedChampionLane,
    ) -> RankedChampionDataSnapshot {
        RankedChampionDataSnapshot {
            source: source.to_string(),
            patch: Some("26.08".to_string()),
            region: Some("KR".to_string()),
            queue: Some("RANKED_SOLO_5x5".to_string()),
            tier: Some("EMERALD_PLUS".to_string()),
            generated_at: Some("2026-04-25T00:00:00Z".to_string()),
            imported_at: "2026-04-25 01:00:00".to_string(),
            records: vec![RankedChampionStat {
                champion_id,
                champion_name: if champion_id == 103 { "Ahri" } else { "Jinx" }.to_string(),
                champion_alias: None,
                lane,
                win_rate: 51.2,
                pick_rate: 10.4,
                ban_rate: 8.0,
                overall_score: 90.0,
                games: 1000,
                wins: 512,
                picks: 1000,
                bans: 80,
            }],
        }
    }
}
