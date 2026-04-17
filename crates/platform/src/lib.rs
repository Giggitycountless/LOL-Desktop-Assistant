use std::{error::Error, path::Path};

use application::{ActivityListInput, ActivityNoteInput, ApplicationError, SettingsInput};
use domain::{ActivityEntry, AppSettings, AppSnapshot, DatabaseStatus, HealthReport};
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSettingsCommand {
    pub settings: SettingsPayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPayload {
    pub startup_page: String,
    pub compact_mode: bool,
    pub activity_limit: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListActivityEntriesCommand {
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivityNoteCommand {
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntriesResponse {
    pub records: Vec<ActivityEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<ApplicationError> for CommandError {
    fn from(error: ApplicationError) -> Self {
        Self {
            code: error.code(),
            message: error.to_string(),
        }
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

pub fn get_app_state(state: &AppState) -> Result<AppSnapshot, CommandError> {
    application::app_snapshot(&state.store).map_err(CommandError::from)
}

pub fn get_settings(state: &AppState) -> Result<AppSettings, CommandError> {
    application::get_settings(&state.store).map_err(CommandError::from)
}

pub fn save_settings(
    state: &AppState,
    command: SaveSettingsCommand,
) -> Result<AppSettings, CommandError> {
    application::save_settings(
        &state.store,
        SettingsInput {
            startup_page: command.settings.startup_page,
            compact_mode: command.settings.compact_mode,
            activity_limit: command.settings.activity_limit,
        },
    )
    .map_err(CommandError::from)
}

pub fn list_activity_entries(
    state: &AppState,
    command: ListActivityEntriesCommand,
) -> Result<ActivityEntriesResponse, CommandError> {
    let entries = application::list_activity_entries(
        &state.store,
        ActivityListInput {
            limit: command.limit,
        },
    )?;

    Ok(ActivityEntriesResponse {
        records: entries.records,
    })
}

pub fn create_activity_note(
    state: &AppState,
    command: CreateActivityNoteCommand,
) -> Result<ActivityEntry, CommandError> {
    application::create_activity_note(
        &state.store,
        ActivityNoteInput {
            title: command.title,
            body: command.body,
        },
    )
    .map_err(CommandError::from)
}
