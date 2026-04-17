use std::{
    error::Error,
    fmt,
    fs,
    path::{Path, PathBuf},
};

use rusqlite::{Connection, OptionalExtension};

const DATABASE_FILE_NAME: &str = "app.sqlite";
const MIGRATION_0001: &str = include_str!("../migrations/0001_initial.sql");

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
}

pub type StorageResult<T> = Result<T, StorageError>;

#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    MissingSchemaVersion,
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "storage I/O error: {error}"),
            Self::Sqlite(error) => write!(formatter, "sqlite error: {error}"),
            Self::MissingSchemaVersion => write!(formatter, "schema version metadata is missing"),
        }
    }
}

impl Error for StorageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sqlite(error) => Some(error),
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

    let migration_is_applied = transaction
        .query_row(
            "SELECT 1 FROM __app_migrations WHERE version = ?1",
            [1_i64],
            |_| Ok(()),
        )
        .optional()?
        .is_some();

    if !migration_is_applied {
        transaction.execute_batch(MIGRATION_0001)?;
        transaction.execute(
            "INSERT INTO __app_migrations (version, description) VALUES (?1, ?2)",
            (1_i64, "initial_schema"),
        )?;
    }

    transaction.commit()?;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn initializes_database_and_first_migration() {
        let data_dir = unique_temp_dir();

        let store = SqliteStore::initialize(&data_dir).expect("storage initializes");

        assert!(store.database_path().exists());
        assert_eq!(store.health().expect("storage health").schema_version, 1);
        assert_eq!(migration_count(store.database_path()), 1);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn initialization_is_idempotent() {
        let data_dir = unique_temp_dir();

        let first = SqliteStore::initialize(&data_dir).expect("first initialization");
        let second = SqliteStore::initialize(&data_dir).expect("second initialization");

        assert_eq!(first.database_path(), second.database_path());
        assert_eq!(second.health().expect("storage health").schema_version, 1);
        assert_eq!(migration_count(second.database_path()), 1);

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
            .query_row("SELECT COUNT(*) FROM __app_migrations", [], |row| row.get(0))
            .expect("query migration count")
    }
}
