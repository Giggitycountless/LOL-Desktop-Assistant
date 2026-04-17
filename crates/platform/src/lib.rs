use std::{error::Error, path::Path};

use domain::{DatabaseStatus, HealthReport};
use storage::SqliteStore;
use tauri::{Manager, Runtime};

#[derive(Debug, Clone)]
pub struct AppState {
    store: SqliteStore,
}

impl AppState {
    pub fn initialize(data_dir: impl AsRef<Path>) -> Result<Self, storage::StorageError> {
        Ok(Self {
            store: SqliteStore::initialize(data_dir)?,
        })
    }
}

pub fn setup_app<R: Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn Error>> {
    let data_dir = app.path().app_data_dir()?;
    app.manage(AppState::initialize(data_dir)?);

    Ok(())
}

pub fn healthcheck(state: &AppState) -> HealthReport {
    match state.store.health() {
        Ok(health) => application::health_report(DatabaseStatus::Ok, Some(health.schema_version)),
        Err(_) => application::health_report(DatabaseStatus::Unavailable, None),
    }
}
