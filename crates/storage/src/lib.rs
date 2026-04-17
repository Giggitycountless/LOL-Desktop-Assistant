use std::{
    error::Error,
    fmt, fs,
    path::{Path, PathBuf},
};

use domain::{
    ActivityEntry, ActivityKind, AppSettings, NewActivityEntry, SettingsValues, StartupPage,
};
use rusqlite::{Connection, OptionalExtension};

const DATABASE_FILE_NAME: &str = "app.sqlite";
const MIGRATION_0001: &str = include_str!("../migrations/0001_initial.sql");
const MIGRATION_0002: &str = include_str!("../migrations/0002_state_foundation.sql");

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

        connection.execute(
            "UPDATE app_settings
            SET startup_page = ?1,
                compact_mode = ?2,
                activity_limit = ?3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1",
            (
                settings.startup_page.as_str(),
                bool_to_int(settings.compact_mode),
                settings.activity_limit,
            ),
        )?;

        read_settings(&connection)
    }

    pub fn list_activity_entries(&self, limit: i64) -> StorageResult<Vec<ActivityEntry>> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;

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

    pub fn create_activity_entry(&self, entry: &NewActivityEntry) -> StorageResult<ActivityEntry> {
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;

        connection.execute(
            "INSERT INTO activity_entries (kind, title, body)
            VALUES (?1, ?2, ?3)",
            (
                entry.kind.as_str(),
                entry.title.as_str(),
                entry.body.as_deref(),
            ),
        )?;

        let id = connection.last_insert_rowid();
        read_activity_entry_by_id(&connection, id)
    }
}

pub type StorageResult<T> = Result<T, StorageError>;

#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    InvalidActivityKind(String),
    InvalidStartupPage(String),
    MissingSchemaVersion,
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "storage I/O error: {error}"),
            Self::Sqlite(error) => write!(formatter, "sqlite error: {error}"),
            Self::InvalidActivityKind(value) => write!(formatter, "invalid activity kind: {value}"),
            Self::InvalidStartupPage(value) => write!(formatter, "invalid startup page: {value}"),
            Self::MissingSchemaVersion => write!(formatter, "schema version metadata is missing"),
        }
    }
}

impl Error for StorageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sqlite(error) => Some(error),
            Self::InvalidActivityKind(_) | Self::InvalidStartupPage(_) => None,
            Self::MissingSchemaVersion => None,
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
            "SELECT startup_page, compact_mode, activity_limit, updated_at
            FROM app_settings
            WHERE id = 1",
            [],
            |row| {
                let startup_page: String = row.get(0)?;

                Ok((
                    startup_page,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(StorageError::from)
        .and_then(|(startup_page, compact_mode, activity_limit, updated_at)| {
            let startup_page = StartupPage::parse(startup_page.as_str())
                .ok_or(StorageError::InvalidStartupPage(startup_page))?;

            Ok(AppSettings {
                startup_page,
                compact_mode: int_to_bool(compact_mode),
                activity_limit,
                updated_at,
            })
        })
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

    fn list_activity_entries(&self, limit: i64) -> Result<Vec<ActivityEntry>, String> {
        SqliteStore::list_activity_entries(self, limit).map_err(|error| error.to_string())
    }

    fn create_activity_entry(&self, entry: NewActivityEntry) -> Result<ActivityEntry, String> {
        SqliteStore::create_activity_entry(self, &entry).map_err(|error| error.to_string())
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
        assert_eq!(store.health().expect("storage health").schema_version, 2);
        assert_eq!(store.get_settings().expect("settings").activity_limit, 100);
        assert_eq!(migration_count(store.database_path()), 2);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn initialization_is_idempotent() {
        let data_dir = unique_temp_dir();

        let first = SqliteStore::initialize(&data_dir).expect("first initialization");
        let second = SqliteStore::initialize(&data_dir).expect("second initialization");

        assert_eq!(first.database_path(), second.database_path());
        assert_eq!(second.health().expect("storage health").schema_version, 2);
        assert_eq!(migration_count(second.database_path()), 2);

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

        assert_eq!(store.health().expect("storage health").schema_version, 2);
        assert_eq!(
            store.get_settings().expect("settings").startup_page,
            StartupPage::Dashboard
        );
        assert_eq!(migration_count(store.database_path()), 2);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn persists_settings() {
        let data_dir = unique_temp_dir();
        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        let settings = store
            .save_settings(&SettingsValues {
                startup_page: StartupPage::Activity,
                compact_mode: true,
                activity_limit: 25,
            })
            .expect("settings saved");

        assert_eq!(settings.startup_page, StartupPage::Activity);
        assert!(settings.compact_mode);
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

        let entries = store.list_activity_entries(10).expect("activity entries");

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, second.id);
        assert_eq!(entries[1].id, first.id);
        assert_eq!(entries[0].body.as_deref(), Some("Body"));

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
}
