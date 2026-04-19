use std::{error::Error, path::Path};

use adapters::LocalLeagueClient;
use application::{
    ActivityListInput, ActivityNoteInput, ApplicationError, LeagueSelfSnapshotInput, SettingsInput,
};
use domain::{
    ActivityEntry, ActivityKind, AppSettings, AppSnapshot, ClearActivityResult, DatabaseStatus,
    HealthReport, ImportLocalDataResult, LeagueClientStatus, LeagueSelfSnapshot, LocalDataExport,
    SettingsValues,
};
use serde::{Deserialize, Serialize};
use storage::SqliteStore;
use tauri::{Manager, Runtime};

#[derive(Debug, Clone)]
pub struct AppState {
    store: SqliteStore,
    league_client: LocalLeagueClient,
}

impl AppState {
    pub fn initialize(data_dir: impl AsRef<Path>) -> Result<Self, storage::StorageError> {
        Ok(Self {
            store: SqliteStore::initialize(data_dir)?,
            league_client: LocalLeagueClient::new(),
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
    pub kind: Option<ActivityKind>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivityNoteCommand {
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocalDataCommand {
    pub json: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearActivityEntriesCommand {
    pub confirm: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueSelfSnapshotCommand {
    pub match_limit: Option<i64>,
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

pub fn get_settings_defaults() -> SettingsValues {
    application::settings_defaults()
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
            kind: command.kind,
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

pub fn export_local_data(state: &AppState) -> Result<LocalDataExport, CommandError> {
    application::export_local_data(&state.store).map_err(CommandError::from)
}

pub fn import_local_data(
    state: &AppState,
    command: ImportLocalDataCommand,
) -> Result<ImportLocalDataResult, CommandError> {
    application::import_local_data(&state.store, command.json.as_str()).map_err(CommandError::from)
}

pub fn clear_activity_entries(
    state: &AppState,
    command: ClearActivityEntriesCommand,
) -> Result<ClearActivityResult, CommandError> {
    application::clear_activity_entries(&state.store, command.confirm).map_err(CommandError::from)
}

pub fn get_league_client_status(state: &AppState) -> Result<LeagueClientStatus, CommandError> {
    application::get_league_client_status(&state.league_client).map_err(CommandError::from)
}

pub fn get_league_self_snapshot(
    state: &AppState,
    command: LeagueSelfSnapshotCommand,
) -> Result<LeagueSelfSnapshot, CommandError> {
    application::get_league_self_snapshot(
        &state.league_client,
        LeagueSelfSnapshotInput {
            match_limit: command.match_limit,
        },
    )
    .map_err(CommandError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::{
        ActivityKind, KdaTag, LeagueClientConnection, LeagueClientPhase, MatchResult,
        RecentMatchSummary, RecentPerformanceSummary, StartupPage,
    };
    use serde_json::json;
    use std::{
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn save_settings_accepts_frontend_payload_shape() {
        let command: SaveSettingsCommand = serde_json::from_value(json!({
            "settings": {
                "startupPage": "activity",
                "compactMode": true,
                "activityLimit": 25
            }
        }))
        .expect("frontend-shaped settings command deserializes");

        assert_eq!(command.settings.startup_page, "activity");
        assert!(command.settings.compact_mode);
        assert_eq!(command.settings.activity_limit, 25);
    }

    #[test]
    fn activity_list_accepts_frontend_filter_shape() {
        let command: ListActivityEntriesCommand = serde_json::from_value(json!({
            "limit": 50,
            "kind": "note"
        }))
        .expect("frontend-shaped activity list command deserializes");

        assert_eq!(command.limit, Some(50));
        assert_eq!(command.kind, Some(ActivityKind::Note));
    }

    #[test]
    fn activity_note_accepts_frontend_payload_shape() {
        let command: CreateActivityNoteCommand = serde_json::from_value(json!({
            "title": "Review session",
            "body": "Looked over local state"
        }))
        .expect("frontend-shaped activity command deserializes");

        assert_eq!(command.title, "Review session");
        assert_eq!(command.body.as_deref(), Some("Looked over local state"));
    }

    #[test]
    fn activity_entries_response_serializes_frontend_shape() {
        let response = ActivityEntriesResponse {
            records: vec![ActivityEntry {
                id: 7,
                kind: ActivityKind::Note,
                title: "Smoke note".to_string(),
                body: Some("Created from a manual check".to_string()),
                created_at: "2026-04-18 00:00:00".to_string(),
            }],
        };

        let value = serde_json::to_value(response).expect("response serializes");

        assert_eq!(value["records"][0]["id"], 7);
        assert_eq!(value["records"][0]["kind"], "note");
        assert_eq!(value["records"][0]["createdAt"], "2026-04-18 00:00:00");
        assert!(value["records"][0].get("created_at").is_none());
    }

    #[test]
    fn validation_errors_serialize_command_shape() {
        let error = CommandError::from(ApplicationError::Validation(
            "Activity note title is required".to_string(),
        ));

        let value = serde_json::to_value(error).expect("error serializes");

        assert_eq!(value["code"], "validation");
        assert_eq!(value["message"], "Activity note title is required");
    }

    #[test]
    fn noop_settings_save_does_not_create_activity_entry() {
        let data_dir = unique_temp_dir();
        let state = AppState::initialize(&data_dir).expect("app state initializes");

        let current_settings = get_settings(&state).expect("settings load");
        let saved_settings = save_settings(
            &state,
            SaveSettingsCommand {
                settings: SettingsPayload {
                    startup_page: current_settings.startup_page.as_str().to_string(),
                    compact_mode: current_settings.compact_mode,
                    activity_limit: current_settings.activity_limit,
                },
            },
        )
        .expect("settings save succeeds");
        let entries = list_activity_entries(
            &state,
            ListActivityEntriesCommand {
                limit: Some(10),
                kind: None,
            },
        )
        .expect("activity entries load");

        assert_eq!(saved_settings.startup_page, StartupPage::Dashboard);
        assert!(entries.records.is_empty());

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn export_local_data_serializes_frontend_shape() {
        let data_dir = unique_temp_dir();
        let state = AppState::initialize(&data_dir).expect("app state initializes");

        create_activity_note(
            &state,
            CreateActivityNoteCommand {
                title: "Exported".to_string(),
                body: None,
            },
        )
        .expect("activity note creates");

        let value = serde_json::to_value(export_local_data(&state).expect("local data export"))
            .expect("local data serializes");

        assert_eq!(value["formatVersion"], 1);
        assert_eq!(value["settings"]["startupPage"], "dashboard");
        assert_eq!(value["activityEntries"][0]["kind"], "note");
        assert!(value.get("format_version").is_none());

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn clear_activity_requires_confirm_true() {
        let command: ClearActivityEntriesCommand = serde_json::from_value(json!({
            "confirm": true
        }))
        .expect("frontend-shaped clear command deserializes");

        assert!(command.confirm);
    }

    #[test]
    fn league_self_snapshot_accepts_frontend_payload_shape() {
        let command: LeagueSelfSnapshotCommand = serde_json::from_value(json!({
            "matchLimit": 6
        }))
        .expect("frontend-shaped league snapshot command deserializes");

        assert_eq!(command.match_limit, Some(6));
    }

    #[test]
    fn league_status_serializes_frontend_shape() {
        let value = serde_json::to_value(LeagueClientStatus {
            is_running: true,
            lockfile_found: true,
            connection: LeagueClientConnection::Connected,
            phase: LeagueClientPhase::Connected,
            message: None,
        })
        .expect("league status serializes");

        assert_eq!(value["isRunning"], true);
        assert_eq!(value["lockfileFound"], true);
        assert_eq!(value["connection"], "connected");
        assert_eq!(value["phase"], "connected");
        assert!(value.get("is_running").is_none());
    }

    #[test]
    fn league_self_snapshot_serializes_frontend_shape() {
        let value = serde_json::to_value(LeagueSelfSnapshot {
            status: LeagueClientStatus {
                is_running: true,
                lockfile_found: true,
                connection: LeagueClientConnection::Connected,
                phase: LeagueClientPhase::Connected,
                message: None,
            },
            summoner: None,
            ranked_queues: Vec::new(),
            recent_matches: vec![RecentMatchSummary {
                game_id: 12,
                champion_name: "Ahri".to_string(),
                queue_name: Some("Ranked Solo/Duo".to_string()),
                result: MatchResult::Win,
                kills: 7,
                deaths: 1,
                assists: 8,
                kda: Some(15.0),
                played_at: Some("2026-04-19T12:00:00Z".to_string()),
            }],
            recent_performance: RecentPerformanceSummary {
                match_count: 1,
                average_kda: Some(15.0),
                kda_tag: KdaTag::High,
                recent_champions: vec!["Ahri".to_string()],
            },
            data_warnings: Vec::new(),
            refreshed_at: "123".to_string(),
        })
        .expect("league snapshot serializes");

        assert_eq!(value["recentMatches"][0]["championName"], "Ahri");
        assert_eq!(value["recentPerformance"]["averageKda"], 15.0);
        assert_eq!(value["recentPerformance"]["kdaTag"], "high");
        assert_eq!(value["refreshedAt"], "123");
        assert!(value.get("recent_matches").is_none());
    }

    #[test]
    fn league_client_errors_serialize_command_shape() {
        let error = CommandError::from(ApplicationError::ClientAccess(
            "League Client rejected local authentication".to_string(),
        ));

        let value = serde_json::to_value(error).expect("error serializes");

        assert_eq!(value["code"], "clientAccess");
        assert_eq!(
            value["message"],
            "League Client rejected local authentication"
        );
    }

    fn unique_temp_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after unix epoch")
            .as_nanos();

        env::temp_dir().join(format!(
            "lol_desktop_assistant_platform_test_{}_{}",
            std::process::id(),
            stamp
        ))
    }
}
