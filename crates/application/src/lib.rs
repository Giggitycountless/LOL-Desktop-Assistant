use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    error::Error,
    fmt, thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use domain::{
    ActivityEntry, ActivityKind, AppLanguagePreference, AppSettings, AppSnapshot,
    ClearActivityResult, ClearPlayerNoteResult, DatabaseStatus, HealthReport,
    ImportLocalDataResult, KdaTag, LeagueChampionDetails, LeagueChampionSummary,
    LeagueClientStatus, LeagueDataSection, LeagueDataWarning, LeagueGameAsset, LeagueGameAssetKind,
    LeagueImageAsset, LeagueSelfData, LeagueSelfSnapshot, LocalActivityEntry, LocalDataExport,
    MatchResult, NewActivityEntry, ParticipantMetricLeader, ParticipantPublicProfile,
    ParticipantRecentStats, PlayerNoteSummary, PlayerNoteView, PostMatchComparison,
    PostMatchDetail, PostMatchParticipant, PostMatchTeam, PostMatchTeamTotals,
    RankedChampionDataSnapshot, RankedChampionDataStatus, RankedChampionLane, RankedChampionSort,
    RankedChampionStat, RankedChampionStatsResponse, RecentChampionSummary, RecentMatchSummary,
    RecentPerformanceSummary, ServiceStatus, SettingsValues, StartupPage,
};

mod constants;
use constants::*;

fn log_auto_accept_event(message: &str) {
    eprintln!("[auto-accept] {message}");
}

fn log_auto_accept_attempt(attempt: usize, message: &str) {
    eprintln!("[auto-accept] attempt {attempt}: {message}");
}

struct RankedChampionSeed {
    champion_id: i64,
    champion_name: &'static str,
    lane: RankedChampionLane,
    win_rate: f64,
    pick_rate: f64,
    ban_rate: f64,
    games: i64,
}

const RANKED_CHAMPION_SEEDS: &[RankedChampionSeed] = &[
    RankedChampionSeed {
        champion_id: 266,
        champion_name: "Aatrox",
        lane: RankedChampionLane::Top,
        win_rate: 50.8,
        pick_rate: 8.9,
        ban_rate: 12.4,
        games: 184_000,
    },
    RankedChampionSeed {
        champion_id: 122,
        champion_name: "Darius",
        lane: RankedChampionLane::Top,
        win_rate: 51.6,
        pick_rate: 7.2,
        ban_rate: 18.7,
        games: 152_000,
    },
    RankedChampionSeed {
        champion_id: 164,
        champion_name: "Camille",
        lane: RankedChampionLane::Top,
        win_rate: 50.2,
        pick_rate: 5.6,
        ban_rate: 9.8,
        games: 109_000,
    },
    RankedChampionSeed {
        champion_id: 114,
        champion_name: "Fiora",
        lane: RankedChampionLane::Top,
        win_rate: 49.9,
        pick_rate: 6.3,
        ban_rate: 14.6,
        games: 126_000,
    },
    RankedChampionSeed {
        champion_id: 86,
        champion_name: "Garen",
        lane: RankedChampionLane::Top,
        win_rate: 52.1,
        pick_rate: 6.8,
        ban_rate: 7.5,
        games: 139_000,
    },
    RankedChampionSeed {
        champion_id: 64,
        champion_name: "Lee Sin",
        lane: RankedChampionLane::Jungle,
        win_rate: 49.5,
        pick_rate: 14.9,
        ban_rate: 17.2,
        games: 276_000,
    },
    RankedChampionSeed {
        champion_id: 234,
        champion_name: "Viego",
        lane: RankedChampionLane::Jungle,
        win_rate: 50.7,
        pick_rate: 10.8,
        ban_rate: 13.9,
        games: 219_000,
    },
    RankedChampionSeed {
        champion_id: 59,
        champion_name: "Jarvan IV",
        lane: RankedChampionLane::Jungle,
        win_rate: 51.4,
        pick_rate: 8.1,
        ban_rate: 6.2,
        games: 168_000,
    },
    RankedChampionSeed {
        champion_id: 5,
        champion_name: "Xin Zhao",
        lane: RankedChampionLane::Jungle,
        win_rate: 52.3,
        pick_rate: 6.4,
        ban_rate: 5.8,
        games: 132_000,
    },
    RankedChampionSeed {
        champion_id: 131,
        champion_name: "Diana",
        lane: RankedChampionLane::Jungle,
        win_rate: 51.8,
        pick_rate: 5.9,
        ban_rate: 4.7,
        games: 118_000,
    },
    RankedChampionSeed {
        champion_id: 103,
        champion_name: "Ahri",
        lane: RankedChampionLane::Middle,
        win_rate: 51.1,
        pick_rate: 9.6,
        ban_rate: 8.3,
        games: 197_000,
    },
    RankedChampionSeed {
        champion_id: 134,
        champion_name: "Syndra",
        lane: RankedChampionLane::Middle,
        win_rate: 49.8,
        pick_rate: 7.8,
        ban_rate: 7.1,
        games: 158_000,
    },
    RankedChampionSeed {
        champion_id: 61,
        champion_name: "Orianna",
        lane: RankedChampionLane::Middle,
        win_rate: 50.6,
        pick_rate: 6.7,
        ban_rate: 3.2,
        games: 143_000,
    },
    RankedChampionSeed {
        champion_id: 777,
        champion_name: "Yone",
        lane: RankedChampionLane::Middle,
        win_rate: 49.4,
        pick_rate: 11.2,
        ban_rate: 24.5,
        games: 231_000,
    },
    RankedChampionSeed {
        champion_id: 517,
        champion_name: "Sylas",
        lane: RankedChampionLane::Middle,
        win_rate: 50.1,
        pick_rate: 8.4,
        ban_rate: 16.2,
        games: 176_000,
    },
    RankedChampionSeed {
        champion_id: 222,
        champion_name: "Jinx",
        lane: RankedChampionLane::Bottom,
        win_rate: 51.9,
        pick_rate: 12.6,
        ban_rate: 10.4,
        games: 248_000,
    },
    RankedChampionSeed {
        champion_id: 145,
        champion_name: "Kai'Sa",
        lane: RankedChampionLane::Bottom,
        win_rate: 50.4,
        pick_rate: 15.3,
        ban_rate: 11.8,
        games: 289_000,
    },
    RankedChampionSeed {
        champion_id: 81,
        champion_name: "Ezreal",
        lane: RankedChampionLane::Bottom,
        win_rate: 49.7,
        pick_rate: 18.1,
        ban_rate: 6.9,
        games: 321_000,
    },
    RankedChampionSeed {
        champion_id: 51,
        champion_name: "Caitlyn",
        lane: RankedChampionLane::Bottom,
        win_rate: 50.8,
        pick_rate: 10.7,
        ban_rate: 15.1,
        games: 213_000,
    },
    RankedChampionSeed {
        champion_id: 523,
        champion_name: "Aphelios",
        lane: RankedChampionLane::Bottom,
        win_rate: 48.9,
        pick_rate: 7.4,
        ban_rate: 4.3,
        games: 147_000,
    },
    RankedChampionSeed {
        champion_id: 412,
        champion_name: "Thresh",
        lane: RankedChampionLane::Support,
        win_rate: 50.5,
        pick_rate: 12.8,
        ban_rate: 9.6,
        games: 244_000,
    },
    RankedChampionSeed {
        champion_id: 117,
        champion_name: "Lulu",
        lane: RankedChampionLane::Support,
        win_rate: 51.3,
        pick_rate: 8.8,
        ban_rate: 12.9,
        games: 173_000,
    },
    RankedChampionSeed {
        champion_id: 111,
        champion_name: "Nautilus",
        lane: RankedChampionLane::Support,
        win_rate: 50.2,
        pick_rate: 10.5,
        ban_rate: 18.2,
        games: 206_000,
    },
    RankedChampionSeed {
        champion_id: 497,
        champion_name: "Rakan",
        lane: RankedChampionLane::Support,
        win_rate: 52.0,
        pick_rate: 7.9,
        ban_rate: 5.9,
        games: 151_000,
    },
    RankedChampionSeed {
        champion_id: 89,
        champion_name: "Leona",
        lane: RankedChampionLane::Support,
        win_rate: 51.7,
        pick_rate: 7.1,
        ban_rate: 6.8,
        games: 138_000,
    },
];

pub trait AppStore {
    fn schema_version(&self) -> Result<i64, String>;
    fn get_settings(&self) -> Result<AppSettings, String>;
    fn save_settings(&self, settings: SettingsValues) -> Result<AppSettings, String>;
    fn list_activity_entries(
        &self,
        limit: i64,
        kind: Option<ActivityKind>,
    ) -> Result<Vec<ActivityEntry>, String>;
    fn list_all_activity_entries(&self) -> Result<Vec<ActivityEntry>, String>;
    fn create_activity_entry(&self, entry: NewActivityEntry) -> Result<ActivityEntry, String>;
    fn import_local_data(
        &self,
        settings: SettingsValues,
        activity_entries: Vec<LocalActivityEntry>,
    ) -> Result<ImportLocalDataResult, String>;
    fn clear_activity_entries(&self) -> Result<i64, String>;
    fn get_player_note(&self, player_puuid: &str) -> Result<Option<StoredPlayerNote>, String>;
    fn save_player_note(&self, note: StoredPlayerNoteInput) -> Result<StoredPlayerNote, String>;
    fn clear_player_note(&self, player_puuid: &str) -> Result<bool, String>;
    fn latest_ranked_champion_snapshot(&self)
        -> Result<Option<RankedChampionDataSnapshot>, String>;
    fn replace_ranked_champion_snapshot(
        &self,
        snapshot: RankedChampionDataSnapshot,
    ) -> Result<RankedChampionDataSnapshot, String>;
}

pub trait LeagueClientReader {
    fn status(&self) -> Result<LeagueClientStatus, LeagueClientReadError>;
    fn self_data(&self, match_limit: i64) -> Result<LeagueSelfData, LeagueClientReadError>;
    fn profile_icon(&self, profile_icon_id: i64)
        -> Result<LeagueImageAsset, LeagueClientReadError>;
    fn champion_icon(&self, champion_id: i64) -> Result<LeagueImageAsset, LeagueClientReadError>;
    fn game_asset(
        &self,
        kind: LeagueGameAssetKind,
        asset_id: i64,
    ) -> Result<LeagueGameAsset, LeagueClientReadError>;
    fn completed_match(&self, game_id: i64) -> Result<LeagueCompletedMatch, LeagueClientReadError>;
    fn participant_recent_stats(
        &self,
        player_puuid: &str,
        limit: i64,
    ) -> Result<ParticipantRecentStats, LeagueClientReadError>;
    fn participant_recent_stats_batch(
        &self,
        player_puuids: &[String],
        limit: i64,
    ) -> HashMap<String, Result<ParticipantRecentStats, LeagueClientReadError>> {
        player_puuids
            .iter()
            .map(|player_puuid| {
                (
                    player_puuid.clone(),
                    self.participant_recent_stats(player_puuid, limit),
                )
            })
            .collect()
    }
    fn champ_select_session(&self) -> Result<ChampSelectSessionData, LeagueClientReadError>;
    fn summoners_by_ids(&self, ids: &[i64]) -> Vec<SummonerBatchEntry>;
    fn summoners_by_names(&self, names: &[String]) -> Vec<SummonerBatchEntry>;
    fn champion_catalog(&self) -> Result<Vec<LeagueChampionSummary>, LeagueClientReadError>;
    fn champion_details(
        &self,
        champion_id: i64,
    ) -> Result<LeagueChampionDetails, LeagueClientReadError>;
    fn gameflow_phase(&self) -> Result<String, LeagueClientReadError>;
    fn accept_ready_check(&self) -> Result<(), LeagueClientReadError>;
    fn apply_champ_select_preferences(
        &self,
        pick_champion_id: Option<i64>,
        ban_champion_id: Option<i64>,
    ) -> Result<(), LeagueClientReadError>;
}

pub trait RankedChampionDataProvider {
    fn fetch_ranked_champion_snapshot(
        &self,
        input: RankedChampionRefreshInput,
    ) -> Result<RankedChampionDataSnapshot, RankedChampionDataError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LeagueClientReadError {
    ClientUnavailable(String),
    ClientAccess(String),
    Integration(String),
}

impl fmt::Display for LeagueClientReadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ClientUnavailable(message)
            | Self::ClientAccess(message)
            | Self::Integration(message) => formatter.write_str(message),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChampSelectSessionData {
    pub ally_ids: Vec<i64>,
    pub enemy_ids: Vec<i64>,
    pub champion_selections: std::collections::HashMap<i64, i64>,
    pub ally_names: Vec<String>,
    pub enemy_names: Vec<String>,
    pub champion_selections_by_name: std::collections::HashMap<String, i64>,
}

#[derive(Debug, Clone)]
pub struct SummonerBatchEntry {
    pub summoner_id: i64,
    pub puuid: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsInput {
    pub startup_page: String,
    pub language: String,
    pub compact_mode: bool,
    pub activity_limit: i64,
    pub auto_accept_enabled: bool,
    pub auto_pick_enabled: bool,
    pub auto_pick_champion_id: Option<i64>,
    pub auto_ban_enabled: bool,
    pub auto_ban_champion_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivityListInput {
    pub limit: Option<i64>,
    pub kind: Option<ActivityKind>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivityNoteInput {
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivityEntries {
    pub records: Vec<ActivityEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeagueSelfSnapshotInput {
    pub match_limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RankedChampionStatsInput {
    pub lane: Option<RankedChampionLane>,
    pub sort_by: Option<RankedChampionSort>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RankedChampionRefreshInput {
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RankedChampionDataError {
    Unavailable(String),
    InvalidData(String),
}

impl fmt::Display for RankedChampionDataError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unavailable(message) | Self::InvalidData(message) => formatter.write_str(message),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeagueProfileIconInput {
    pub profile_icon_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeagueChampionIconInput {
    pub champion_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeagueChampionDetailsInput {
    pub champion_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeagueGameAssetInput {
    pub kind: LeagueGameAssetKind,
    pub asset_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PostMatchDetailInput {
    pub game_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParticipantPublicProfileInput {
    pub game_id: i64,
    pub participant_id: i64,
    pub recent_limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavePlayerNoteInput {
    pub game_id: i64,
    pub participant_id: i64,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClearPlayerNoteInput {
    pub game_id: i64,
    pub participant_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredPlayerNote {
    pub player_puuid: String,
    pub last_display_name: String,
    pub note: Option<String>,
    pub tags: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredPlayerNoteInput {
    pub player_puuid: String,
    pub last_display_name: String,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LeagueCompletedMatch {
    pub game_id: i64,
    pub queue_name: Option<String>,
    pub played_at: Option<String>,
    pub game_duration_seconds: Option<i64>,
    pub result: MatchResult,
    pub participants: Vec<LeagueCompletedParticipant>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LeagueCompletedParticipant {
    pub participant_id: i64,
    pub team_id: i64,
    pub display_name: String,
    pub player_puuid: Option<String>,
    pub profile_icon_id: Option<i64>,
    pub champion_id: Option<i64>,
    pub champion_name: String,
    pub role: Option<String>,
    pub lane: Option<String>,
    pub result: MatchResult,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub kda: Option<f64>,
    pub cs: i64,
    pub gold_earned: i64,
    pub damage_to_champions: i64,
    pub vision_score: i64,
    pub items: Vec<i64>,
    pub runes: Vec<i64>,
    pub spells: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplicationError {
    Validation(String),
    Storage(String),
    ClientUnavailable(String),
    ClientAccess(String),
    Integration(String),
}

impl ApplicationError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "validation",
            Self::Storage(_) => "storage",
            Self::ClientUnavailable(_) => "clientUnavailable",
            Self::ClientAccess(_) => "clientAccess",
            Self::Integration(_) => "integration",
        }
    }
}

impl fmt::Display for ApplicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation(message)
            | Self::Storage(message)
            | Self::ClientUnavailable(message)
            | Self::ClientAccess(message)
            | Self::Integration(message) => formatter.write_str(message),
        }
    }
}

impl Error for ApplicationError {}

fn storage_failure(operation: &'static str, error: String) -> ApplicationError {
    ApplicationError::Storage(format!("{operation} failed: {error}"))
}

impl From<LeagueClientReadError> for ApplicationError {
    fn from(error: LeagueClientReadError) -> Self {
        match error {
            LeagueClientReadError::ClientUnavailable(message) => Self::ClientUnavailable(message),
            LeagueClientReadError::ClientAccess(message) => Self::ClientAccess(message),
            LeagueClientReadError::Integration(message) => Self::Integration(message),
        }
    }
}

pub fn health_report(database_status: DatabaseStatus, schema_version: Option<i64>) -> HealthReport {
    let status = match database_status {
        DatabaseStatus::Ok => ServiceStatus::Ok,
        DatabaseStatus::Unavailable => ServiceStatus::Degraded,
    };

    HealthReport {
        status,
        database_status,
        schema_version,
    }
}

pub fn settings_defaults() -> SettingsValues {
    SettingsValues {
        startup_page: StartupPage::Dashboard,
        language: AppLanguagePreference::System,
        compact_mode: false,
        activity_limit: DEFAULT_ACTIVITY_LIMIT,
        auto_accept_enabled: true,
        auto_pick_enabled: false,
        auto_pick_champion_id: None,
        auto_ban_enabled: false,
        auto_ban_champion_id: None,
    }
}

pub fn app_snapshot(store: &impl AppStore) -> Result<AppSnapshot, ApplicationError> {
    let schema_version = store
        .schema_version()
        .map_err(|error| storage_failure("read schema version", error))?;
    let settings = get_settings(store)?;
    let recent_activity = list_activity_entries(
        store,
        ActivityListInput {
            limit: Some(settings.activity_limit),
            kind: None,
        },
    )?
    .records;

    Ok(AppSnapshot {
        health: health_report(DatabaseStatus::Ok, Some(schema_version)),
        settings,
        settings_defaults: settings_defaults(),
        recent_activity,
    })
}

pub fn get_settings(store: &impl AppStore) -> Result<AppSettings, ApplicationError> {
    store
        .get_settings()
        .map_err(|error| storage_failure("load settings", error))
}

pub fn save_settings(
    store: &impl AppStore,
    input: SettingsInput,
) -> Result<AppSettings, ApplicationError> {
    let next_settings = validate_settings(input)?;
    let current_settings = store
        .get_settings()
        .map_err(|error| storage_failure("load current settings", error))?;

    if current_settings.values() == next_settings {
        return Ok(current_settings);
    }

    let saved_settings = store
        .save_settings(next_settings)
        .map_err(|error| storage_failure("save settings", error))?;

    store
        .create_activity_entry(NewActivityEntry {
            kind: ActivityKind::Settings,
            title: "Settings updated".to_string(),
            body: Some("Application preferences changed".to_string()),
        })
        .map_err(|error| storage_failure("create settings activity entry", error))?;

    Ok(saved_settings)
}

pub fn list_activity_entries(
    store: &impl AppStore,
    input: ActivityListInput,
) -> Result<ActivityEntries, ApplicationError> {
    let limit = normalize_activity_limit(input.limit.unwrap_or(DEFAULT_ACTIVITY_LIMIT))?;
    let records = store
        .list_activity_entries(limit, input.kind)
        .map_err(|error| storage_failure("list activity entries", error))?;

    Ok(ActivityEntries { records })
}

pub fn create_activity_note(
    store: &impl AppStore,
    input: ActivityNoteInput,
) -> Result<ActivityEntry, ApplicationError> {
    let entry = validate_activity_note(input)?;

    store
        .create_activity_entry(entry)
        .map_err(|error| storage_failure("create activity note", error))
}

pub fn export_local_data(store: &impl AppStore) -> Result<LocalDataExport, ApplicationError> {
    let settings = store
        .get_settings()
        .map_err(|error| storage_failure("load settings for export", error))?
        .values();
    let activity_entries = store
        .list_all_activity_entries()
        .map_err(|error| storage_failure("list activity entries for export", error))?
        .into_iter()
        .map(|entry| LocalActivityEntry {
            kind: entry.kind,
            title: entry.title,
            body: entry.body,
            created_at: entry.created_at,
        })
        .collect();

    Ok(LocalDataExport {
        format_version: LOCAL_DATA_FORMAT_VERSION,
        settings,
        activity_entries,
    })
}

pub fn import_local_data(
    store: &impl AppStore,
    json: &str,
) -> Result<ImportLocalDataResult, ApplicationError> {
    let data: LocalDataExport = serde_json::from_str(json).map_err(|error| {
        ApplicationError::Validation(format!("Import JSON is invalid: {error}"))
    })?;

    if data.format_version != LOCAL_DATA_FORMAT_VERSION {
        return Err(ApplicationError::Validation(format!(
            "Unsupported import format version: {}",
            data.format_version
        )));
    }

    validate_settings_values(&data.settings)?;
    for entry in &data.activity_entries {
        validate_local_activity_entry(entry)?;
    }

    store
        .import_local_data(data.settings, data.activity_entries)
        .map_err(|error| storage_failure("import local data", error))
}

pub fn clear_activity_entries(
    store: &impl AppStore,
    confirm: bool,
) -> Result<ClearActivityResult, ApplicationError> {
    if !confirm {
        return Err(ApplicationError::Validation(
            "Activity clear confirmation is required".to_string(),
        ));
    }

    let deleted_count = store
        .clear_activity_entries()
        .map_err(|error| storage_failure("clear activity entries", error))?;

    Ok(ClearActivityResult { deleted_count })
}

pub fn get_league_client_status(
    reader: &impl LeagueClientReader,
) -> Result<LeagueClientStatus, ApplicationError> {
    reader.status().map_err(ApplicationError::from)
}

pub fn get_league_self_snapshot(
    reader: &impl LeagueClientReader,
    input: LeagueSelfSnapshotInput,
) -> Result<LeagueSelfSnapshot, ApplicationError> {
    let match_limit = normalize_match_limit(input.match_limit.unwrap_or(DEFAULT_MATCH_LIMIT))?;
    let data = reader
        .self_data(match_limit)
        .map_err(ApplicationError::from)?;

    Ok(LeagueSelfSnapshot {
        recent_performance: summarize_recent_performance(&data.recent_matches),
        status: data.status,
        summoner: data.summoner,
        ranked_queues: data.ranked_queues,
        recent_matches: data.recent_matches,
        data_warnings: data.data_warnings,
        refreshed_at: unix_timestamp_seconds(),
    })
}

pub fn get_ranked_champion_stats(input: RankedChampionStatsInput) -> RankedChampionStatsResponse {
    let sort_by = input.sort_by.unwrap_or(RankedChampionSort::Overall);
    let mut records: Vec<RankedChampionStat> = RANKED_CHAMPION_SEEDS
        .iter()
        .filter(|seed| input.lane.is_none_or(|lane| seed.lane == lane))
        .map(ranked_champion_stat)
        .collect();

    records.sort_by(|left, right| compare_ranked_champions(left, right, sort_by));

    RankedChampionStatsResponse {
        lane: input.lane,
        sort_by,
        records,
        source: "Local ranked data sample".to_string(),
        updated_at: "2026-04-24".to_string(),
        generated_at: None,
        imported_at: None,
        patch: None,
        region: None,
        queue: Some("RANKED_SOLO_5x5".to_string()),
        tier: Some("sample".to_string()),
        is_cached: false,
        data_status: RankedChampionDataStatus::Sample,
        status_message: Some(
            "Sample data is shown until ranked champion data is refreshed".to_string(),
        ),
    }
}

pub fn get_ranked_champion_stats_from_store(
    store: &impl AppStore,
    input: RankedChampionStatsInput,
) -> Result<RankedChampionStatsResponse, ApplicationError> {
    match store
        .latest_ranked_champion_snapshot()
        .map_err(ApplicationError::Storage)?
    {
        Some(snapshot) => Ok(ranked_response_from_snapshot(
            snapshot,
            input,
            true,
            RankedChampionDataStatus::Cached,
            None,
        )),
        None => Ok(get_ranked_champion_stats(input)),
    }
}

pub fn refresh_ranked_champion_stats(
    store: &impl AppStore,
    provider: &impl RankedChampionDataProvider,
    input: RankedChampionRefreshInput,
    stats_input: RankedChampionStatsInput,
) -> Result<RankedChampionStatsResponse, ApplicationError> {
    let mut snapshot = match provider.fetch_ranked_champion_snapshot(input) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let cached_snapshot = store
                .latest_ranked_champion_snapshot()
                .map_err(ApplicationError::Storage)?;

            return cached_snapshot.map_or_else(
                || Err(ranked_provider_error(error)),
                |snapshot| {
                    Ok(ranked_response_from_snapshot(
                        snapshot,
                        stats_input,
                        true,
                        RankedChampionDataStatus::StaleCache,
                        Some(
                            "Remote ranked champion data could not be refreshed; showing cached data"
                                .to_string(),
                        ),
                    ))
                },
            );
        }
    };
    snapshot.imported_at = unix_timestamp_seconds();

    let saved = store
        .replace_ranked_champion_snapshot(snapshot)
        .map_err(ApplicationError::Storage)?;

    Ok(ranked_response_from_snapshot(
        saved,
        stats_input,
        true,
        RankedChampionDataStatus::Fresh,
        Some("Ranked champion data refreshed".to_string()),
    ))
}

pub fn get_league_profile_icon(
    reader: &impl LeagueClientReader,
    input: LeagueProfileIconInput,
) -> Result<LeagueImageAsset, ApplicationError> {
    let profile_icon_id = normalize_league_asset_id(input.profile_icon_id, "Profile icon id")?;

    reader
        .profile_icon(profile_icon_id)
        .map_err(ApplicationError::from)
}

pub fn get_league_champion_icon(
    reader: &impl LeagueClientReader,
    input: LeagueChampionIconInput,
) -> Result<LeagueImageAsset, ApplicationError> {
    let champion_id = normalize_league_asset_id(input.champion_id, "Champion id")?;

    reader
        .champion_icon(champion_id)
        .map_err(ApplicationError::from)
}

pub fn get_league_champion_details(
    reader: &impl LeagueClientReader,
    input: LeagueChampionDetailsInput,
) -> Result<LeagueChampionDetails, ApplicationError> {
    let champion_id = normalize_league_asset_id(input.champion_id, "Champion id")?;

    reader
        .champion_details(champion_id)
        .map_err(ApplicationError::from)
}

pub fn get_league_game_asset(
    reader: &impl LeagueClientReader,
    input: LeagueGameAssetInput,
) -> Result<LeagueGameAsset, ApplicationError> {
    let asset_id = normalize_league_asset_id(input.asset_id, "League game asset id")?;

    reader
        .game_asset(input.kind, asset_id)
        .map_err(ApplicationError::from)
}

pub fn get_post_match_detail(
    store: &impl AppStore,
    reader: &impl LeagueClientReader,
    input: PostMatchDetailInput,
) -> Result<PostMatchDetail, ApplicationError> {
    validate_game_id(input.game_id)?;
    let completed_match = reader
        .completed_match(input.game_id)
        .map_err(ApplicationError::from)?;

    post_match_detail_from_completed_match(store, completed_match)
}

pub fn get_post_match_participant_profile(
    store: &impl AppStore,
    reader: &impl LeagueClientReader,
    input: ParticipantPublicProfileInput,
) -> Result<ParticipantPublicProfile, ApplicationError> {
    validate_game_and_participant_ids(input.game_id, input.participant_id)?;
    let recent_limit =
        normalize_match_limit(input.recent_limit.unwrap_or(DEFAULT_PUBLIC_RECENT_LIMIT))?;
    let completed_match = reader
        .completed_match(input.game_id)
        .map_err(ApplicationError::from)?;
    let participant = completed_match
        .participants
        .iter()
        .find(|participant| participant.participant_id == input.participant_id)
        .ok_or_else(|| {
            ApplicationError::Validation(
                "Participant was not found in the completed match".to_string(),
            )
        })?;
    let note = match participant.player_puuid.as_deref() {
        Some(player_puuid) => store
            .get_player_note(player_puuid)
            .map_err(ApplicationError::Storage)?,
        None => None,
    };
    let mut warnings = Vec::new();
    let recent_stats = match participant.player_puuid.as_deref() {
        Some(player_puuid) => match reader.participant_recent_stats(player_puuid, recent_limit) {
            Ok(stats) => Some(stats),
            Err(_) => {
                warnings.push(LeagueDataWarning {
                    section: LeagueDataSection::RecentStats,
                    message: "Participant recent stats are unavailable from the local client"
                        .to_string(),
                });
                None
            }
        },
        None => {
            warnings.push(LeagueDataWarning {
                section: LeagueDataSection::Participants,
                message: "Participant public profile identity is unavailable".to_string(),
            });
            None
        }
    };

    Ok(ParticipantPublicProfile {
        game_id: input.game_id,
        participant_id: input.participant_id,
        display_name: participant.display_name.clone(),
        profile_icon_id: participant.profile_icon_id,
        recent_stats,
        note: note.map(|note| player_note_view(input.game_id, input.participant_id, Some(note))),
        warnings,
    })
}

pub fn save_player_note(
    store: &impl AppStore,
    reader: &impl LeagueClientReader,
    input: SavePlayerNoteInput,
) -> Result<PlayerNoteView, ApplicationError> {
    let (player_puuid, display_name) =
        resolve_post_match_participant_identity(reader, input.game_id, input.participant_id)?;

    save_player_note_for_resolved_player(store, input, player_puuid, display_name)
}

pub fn clear_player_note(
    store: &impl AppStore,
    reader: &impl LeagueClientReader,
    input: ClearPlayerNoteInput,
) -> Result<ClearPlayerNoteResult, ApplicationError> {
    let (player_puuid, _) =
        resolve_post_match_participant_identity(reader, input.game_id, input.participant_id)?;

    clear_player_note_for_resolved_player(store, input, player_puuid.as_str())
}

pub fn save_player_note_for_resolved_player(
    store: &impl AppStore,
    input: SavePlayerNoteInput,
    player_puuid: String,
    display_name: String,
) -> Result<PlayerNoteView, ApplicationError> {
    validate_game_and_participant_ids(input.game_id, input.participant_id)?;
    let note = normalize_player_note(input.note)?;
    let tags = normalize_player_tags(input.tags)?;

    let saved = store
        .save_player_note(StoredPlayerNoteInput {
            player_puuid,
            last_display_name: display_name,
            note,
            tags,
        })
        .map_err(ApplicationError::Storage)?;

    Ok(player_note_view(
        input.game_id,
        input.participant_id,
        Some(saved),
    ))
}

pub fn clear_player_note_for_resolved_player(
    store: &impl AppStore,
    input: ClearPlayerNoteInput,
    player_puuid: &str,
) -> Result<ClearPlayerNoteResult, ApplicationError> {
    validate_game_and_participant_ids(input.game_id, input.participant_id)?;
    let cleared = store
        .clear_player_note(player_puuid)
        .map_err(ApplicationError::Storage)?;

    Ok(ClearPlayerNoteResult { cleared })
}

pub fn player_note_summary(
    store: &impl AppStore,
    player_puuid: Option<&str>,
) -> Result<PlayerNoteSummary, ApplicationError> {
    let Some(player_puuid) = player_puuid else {
        return Ok(PlayerNoteSummary {
            has_note: false,
            tags: Vec::new(),
        });
    };
    let note = store
        .get_player_note(player_puuid)
        .map_err(ApplicationError::Storage)?;

    Ok(PlayerNoteSummary {
        has_note: note.as_ref().is_some_and(|value| value.note.is_some()),
        tags: note.map(|value| value.tags).unwrap_or_default(),
    })
}

pub fn player_note_view(
    game_id: i64,
    participant_id: i64,
    note: Option<StoredPlayerNote>,
) -> PlayerNoteView {
    match note {
        Some(note) => PlayerNoteView {
            game_id,
            participant_id,
            note: note.note,
            tags: note.tags,
            updated_at: Some(note.updated_at),
        },
        None => PlayerNoteView {
            game_id,
            participant_id,
            note: None,
            tags: Vec::new(),
            updated_at: None,
        },
    }
}

fn resolve_post_match_participant_identity(
    reader: &impl LeagueClientReader,
    game_id: i64,
    participant_id: i64,
) -> Result<(String, String), ApplicationError> {
    validate_game_and_participant_ids(game_id, participant_id)?;
    let completed_match = reader
        .completed_match(game_id)
        .map_err(ApplicationError::from)?;
    let participant = completed_match
        .participants
        .iter()
        .find(|participant| participant.participant_id == participant_id)
        .ok_or_else(|| {
            ApplicationError::Validation(
                "Participant was not found in the completed match".to_string(),
            )
        })?;
    let player_puuid = participant.player_puuid.clone().ok_or_else(|| {
        ApplicationError::Validation("Participant cannot be linked to local notes".to_string())
    })?;

    Ok((player_puuid, participant.display_name.clone()))
}

fn post_match_detail_from_completed_match(
    store: &impl AppStore,
    completed_match: LeagueCompletedMatch,
) -> Result<PostMatchDetail, ApplicationError> {
    let mut participants = Vec::new();

    for participant in completed_match.participants {
        let note_summary = player_note_summary(store, participant.player_puuid.as_deref())?;
        participants.push(PostMatchParticipant {
            participant_id: participant.participant_id,
            team_id: participant.team_id,
            display_name: participant.display_name,
            champion_id: participant.champion_id,
            champion_name: participant.champion_name,
            role: participant.role,
            lane: participant.lane,
            profile_icon_id: participant.profile_icon_id,
            result: participant.result,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            kda: participant.kda,
            performance_score: 0.0,
            cs: participant.cs,
            gold_earned: participant.gold_earned,
            damage_to_champions: participant.damage_to_champions,
            vision_score: participant.vision_score,
            items: participant.items,
            runes: participant.runes,
            spells: participant.spells,
            note_summary,
        });
    }

    score_post_match_participants(&mut participants, completed_match.game_duration_seconds);

    let teams = post_match_teams(&participants);
    let comparison = post_match_comparison(&participants);
    let warnings = if participants.len() < 2 {
        vec![LeagueDataWarning {
            section: LeagueDataSection::Participants,
            message: "Only partial participant details were available from the local client"
                .to_string(),
        }]
    } else {
        Vec::new()
    };

    Ok(PostMatchDetail {
        game_id: completed_match.game_id,
        queue_name: completed_match.queue_name,
        played_at: completed_match.played_at,
        game_duration_seconds: completed_match.game_duration_seconds,
        result: completed_match.result,
        teams,
        comparison,
        warnings,
    })
}

fn post_match_teams(participants: &[PostMatchParticipant]) -> Vec<PostMatchTeam> {
    let mut team_ids: Vec<i64> = participants
        .iter()
        .map(|participant| participant.team_id)
        .collect();
    team_ids.sort_unstable();
    team_ids.dedup();

    team_ids
        .into_iter()
        .map(|team_id| {
            let team_participants: Vec<PostMatchParticipant> = participants
                .iter()
                .filter(|participant| participant.team_id == team_id)
                .cloned()
                .collect();
            let totals = team_totals(&team_participants);

            PostMatchTeam {
                team_id,
                result: team_participants
                    .first()
                    .map(|participant| participant.result)
                    .unwrap_or(MatchResult::Unknown),
                participants: team_participants,
                totals,
            }
        })
        .collect()
}

fn score_post_match_participants(
    participants: &mut [PostMatchParticipant],
    game_duration_seconds: Option<i64>,
) {
    for index in 0..participants.len() {
        let team_id = participants[index].team_id;
        let team_kills: i64 = participants
            .iter()
            .filter(|participant| participant.team_id == team_id)
            .map(|participant| participant.kills)
            .sum();
        let team_damage: i64 = participants
            .iter()
            .filter(|participant| participant.team_id == team_id)
            .map(|participant| participant.damage_to_champions)
            .sum();
        let team_gold: i64 = participants
            .iter()
            .filter(|participant| participant.team_id == team_id)
            .map(|participant| participant.gold_earned)
            .sum();

        participants[index].performance_score = participant_performance_score(
            &participants[index],
            team_kills,
            team_damage,
            team_gold,
            game_duration_seconds,
        );
    }
}

fn participant_performance_score(
    participant: &PostMatchParticipant,
    team_kills: i64,
    team_damage: i64,
    team_gold: i64,
    game_duration_seconds: Option<i64>,
) -> f64 {
    let kda = participant.kda.unwrap_or_else(|| {
        calculate_kda(participant.kills, participant.deaths, participant.assists)
    });
    let duration_minutes = game_duration_seconds
        .filter(|seconds| *seconds > 0)
        .map(|seconds| seconds as f64 / 60.0);
    let kill_participation = if team_kills > 0 {
        ((participant.kills + participant.assists) as f64 / team_kills as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let damage_share = if team_damage > 0 {
        capped_ratio(
            participant.damage_to_champions as f64 / team_damage as f64,
            0.35,
        )
    } else {
        0.0
    };
    let gold_share = if team_gold > 0 {
        capped_ratio(participant.gold_earned as f64 / team_gold as f64, 0.28)
    } else {
        0.0
    };
    let cs_pace = duration_minutes
        .map(|minutes| capped_ratio(participant.cs as f64 / minutes, 10.0))
        .unwrap_or(0.0);
    let vision_pace = duration_minutes
        .map(|minutes| capped_ratio(participant.vision_score as f64 / minutes, 2.0))
        .unwrap_or(0.0);
    let result_value = match participant.result {
        MatchResult::Win => 1.0,
        MatchResult::Loss => 0.35,
        MatchResult::Unknown => 0.5,
    };
    let weighted_score = capped_ratio(kda, 12.0) * SCORE_KDA_WEIGHT
        + kill_participation * SCORE_KILL_PARTICIPATION_WEIGHT
        + damage_share * SCORE_DAMAGE_WEIGHT
        + gold_share * SCORE_GOLD_WEIGHT
        + cs_pace * SCORE_CS_WEIGHT
        + vision_pace * SCORE_VISION_WEIGHT
        + result_value * SCORE_RESULT_WEIGHT;

    round_to_tenth((1.0 + weighted_score * 9.0).clamp(0.0, 10.0))
}

fn capped_ratio(value: f64, cap: f64) -> f64 {
    if cap <= 0.0 {
        0.0
    } else {
        (value / cap).clamp(0.0, 1.0)
    }
}

fn team_totals(participants: &[PostMatchParticipant]) -> PostMatchTeamTotals {
    PostMatchTeamTotals {
        kills: participants
            .iter()
            .map(|participant| participant.kills)
            .sum(),
        deaths: participants
            .iter()
            .map(|participant| participant.deaths)
            .sum(),
        assists: participants
            .iter()
            .map(|participant| participant.assists)
            .sum(),
        gold_earned: participants
            .iter()
            .map(|participant| participant.gold_earned)
            .sum(),
        damage_to_champions: participants
            .iter()
            .map(|participant| participant.damage_to_champions)
            .sum(),
        vision_score: participants
            .iter()
            .map(|participant| participant.vision_score)
            .sum(),
    }
}

fn post_match_comparison(participants: &[PostMatchParticipant]) -> PostMatchComparison {
    PostMatchComparison {
        highest_kda: metric_leader(participants, |participant| participant.kda.unwrap_or(0.0)),
        most_cs: metric_leader(participants, |participant| participant.cs as f64),
        most_gold: metric_leader(participants, |participant| participant.gold_earned as f64),
        most_damage: metric_leader(participants, |participant| {
            participant.damage_to_champions as f64
        }),
        highest_vision: metric_leader(participants, |participant| participant.vision_score as f64),
    }
}

fn metric_leader(
    participants: &[PostMatchParticipant],
    metric: impl Fn(&PostMatchParticipant) -> f64,
) -> Option<ParticipantMetricLeader> {
    participants
        .iter()
        .map(|participant| (participant, metric(participant)))
        .max_by(|left, right| {
            left.1
                .partial_cmp(&right.1)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(participant, value)| ParticipantMetricLeader {
            participant_id: participant.participant_id,
            display_name: participant.display_name.clone(),
            value,
        })
}

fn validate_settings(input: SettingsInput) -> Result<SettingsValues, ApplicationError> {
    let startup_page = StartupPage::parse(input.startup_page.as_str()).ok_or_else(|| {
        ApplicationError::Validation("Startup page must be dashboard, activity, or settings".into())
    })?;
    let language = AppLanguagePreference::parse(input.language.as_str())
        .ok_or_else(|| ApplicationError::Validation("Language must be system, zh, or en".into()))?;

    let values = SettingsValues {
        startup_page,
        language,
        compact_mode: input.compact_mode,
        activity_limit: input.activity_limit,
        auto_accept_enabled: input.auto_accept_enabled,
        auto_pick_enabled: input.auto_pick_enabled,
        auto_pick_champion_id: input.auto_pick_champion_id,
        auto_ban_enabled: input.auto_ban_enabled,
        auto_ban_champion_id: input.auto_ban_champion_id,
    };

    validate_settings_values(&values)?;
    Ok(values)
}

fn validate_settings_values(settings: &SettingsValues) -> Result<(), ApplicationError> {
    normalize_activity_limit(settings.activity_limit)?;
    validate_optional_champion_id(settings.auto_pick_champion_id, "Auto pick champion")?;
    validate_optional_champion_id(settings.auto_ban_champion_id, "Auto ban champion")?;

    if settings.auto_pick_enabled && settings.auto_pick_champion_id.is_none() {
        return Err(ApplicationError::Validation(
            "Auto pick requires a champion".to_string(),
        ));
    }

    if settings.auto_ban_enabled && settings.auto_ban_champion_id.is_none() {
        return Err(ApplicationError::Validation(
            "Auto ban requires a champion".to_string(),
        ));
    }

    Ok(())
}

fn validate_optional_champion_id(
    champion_id: Option<i64>,
    label: &str,
) -> Result<(), ApplicationError> {
    if let Some(champion_id) = champion_id {
        normalize_league_asset_id(champion_id, label)?;
    }

    Ok(())
}

fn normalize_activity_limit(limit: i64) -> Result<i64, ApplicationError> {
    if (MIN_ACTIVITY_LIMIT..=MAX_ACTIVITY_LIMIT).contains(&limit) {
        Ok(limit)
    } else {
        Err(ApplicationError::Validation(format!(
            "Activity limit must be between {MIN_ACTIVITY_LIMIT} and {MAX_ACTIVITY_LIMIT}"
        )))
    }
}

fn normalize_match_limit(limit: i64) -> Result<i64, ApplicationError> {
    if (1..=MAX_MATCH_LIMIT).contains(&limit) {
        Ok(limit)
    } else {
        Err(ApplicationError::Validation(format!(
            "Match limit must be between 1 and {MAX_MATCH_LIMIT}"
        )))
    }
}

fn normalize_league_asset_id(id: i64, label: &str) -> Result<i64, ApplicationError> {
    if (1..=MAX_LEAGUE_ASSET_ID).contains(&id) {
        Ok(id)
    } else {
        Err(ApplicationError::Validation(format!(
            "{label} must be between 1 and {MAX_LEAGUE_ASSET_ID}"
        )))
    }
}

fn validate_game_and_participant_ids(
    game_id: i64,
    participant_id: i64,
) -> Result<(), ApplicationError> {
    validate_game_id(game_id)?;

    if participant_id <= 0 {
        return Err(ApplicationError::Validation(
            "Participant id must be greater than 0".to_string(),
        ));
    }

    Ok(())
}

fn validate_game_id(game_id: i64) -> Result<(), ApplicationError> {
    if game_id <= 0 {
        return Err(ApplicationError::Validation(
            "Game id must be greater than 0".to_string(),
        ));
    }

    Ok(())
}

fn normalize_player_note(note: Option<String>) -> Result<Option<String>, ApplicationError> {
    let note = note
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(value) = &note {
        if value.chars().count() > MAX_PLAYER_NOTE_LEN {
            return Err(ApplicationError::Validation(format!(
                "Player note must be {MAX_PLAYER_NOTE_LEN} characters or fewer"
            )));
        }
    }

    Ok(note)
}

fn normalize_player_tags(tags: Vec<String>) -> Result<Vec<String>, ApplicationError> {
    let mut normalized = Vec::new();

    for tag in tags {
        let tag = tag.trim().to_string();
        if tag.is_empty() || normalized.iter().any(|value| value == &tag) {
            continue;
        }

        if tag.chars().count() > MAX_PLAYER_TAG_LEN {
            return Err(ApplicationError::Validation(format!(
                "Player tags must be {MAX_PLAYER_TAG_LEN} characters or fewer"
            )));
        }

        normalized.push(tag);
    }

    if normalized.len() > MAX_PLAYER_TAGS {
        return Err(ApplicationError::Validation(format!(
            "Player tags must include {MAX_PLAYER_TAGS} entries or fewer"
        )));
    }

    Ok(normalized)
}

fn summarize_recent_performance(matches: &[RecentMatchSummary]) -> RecentPerformanceSummary {
    let recent_matches = matches.iter().take(PERFORMANCE_MATCH_COUNT);
    let mut total_kda = 0.0;
    let mut match_count = 0;
    let mut recent_champions = Vec::new();

    for match_summary in recent_matches {
        match_count += 1;
        total_kda += calculate_kda(
            match_summary.kills,
            match_summary.deaths,
            match_summary.assists,
        );
        recent_champions.push(match_summary.champion_name.clone());
    }

    let average_kda = if match_count == 0 {
        None
    } else {
        Some(round_to_tenth(total_kda / match_count as f64))
    };

    let kda_tag = match average_kda {
        Some(value) if value >= HIGH_KDA_THRESHOLD => KdaTag::High,
        Some(_) => KdaTag::Standard,
        None => KdaTag::Unavailable,
    };

    RecentPerformanceSummary {
        match_count,
        average_kda,
        kda_tag,
        recent_champions,
        top_champions: summarize_top_champions(matches),
    }
}

fn summarize_top_champions(matches: &[RecentMatchSummary]) -> Vec<RecentChampionSummary> {
    let mut counts: Vec<(Option<i64>, String, usize, usize)> = Vec::new();

    for (index, match_summary) in matches.iter().take(PERFORMANCE_MATCH_COUNT).enumerate() {
        if let Some((_, _, games, _)) =
            counts
                .iter_mut()
                .find(|(champion_id, champion_name, _, _)| {
                    *champion_id == match_summary.champion_id
                        && champion_name == &match_summary.champion_name
                })
        {
            *games += 1;
            continue;
        }

        counts.push((
            match_summary.champion_id,
            match_summary.champion_name.clone(),
            1,
            index,
        ));
    }

    counts.sort_by(|left, right| right.2.cmp(&left.2).then_with(|| left.3.cmp(&right.3)));
    counts
        .into_iter()
        .take(3)
        .map(
            |(champion_id, champion_name, games, _)| RecentChampionSummary {
                champion_id,
                champion_name,
                games,
            },
        )
        .collect()
}

fn calculate_kda(kills: i64, deaths: i64, assists: i64) -> f64 {
    let contribution = (kills + assists) as f64;

    if deaths <= 0 {
        contribution
    } else {
        contribution / deaths as f64
    }
}

fn round_to_tenth(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn ranked_champion_stat(seed: &RankedChampionSeed) -> RankedChampionStat {
    RankedChampionStat {
        champion_id: seed.champion_id,
        champion_name: seed.champion_name.to_string(),
        champion_alias: None,
        lane: seed.lane,
        win_rate: seed.win_rate,
        pick_rate: seed.pick_rate,
        ban_rate: seed.ban_rate,
        overall_score: ranked_overall_score(seed.win_rate, seed.pick_rate, seed.ban_rate),
        games: seed.games,
        wins: ((seed.games as f64) * (seed.win_rate / 100.0)).round() as i64,
        picks: seed.games,
        bans: ((seed.games as f64) * (seed.ban_rate / 100.0)).round() as i64,
    }
}

fn ranked_response_from_snapshot(
    snapshot: RankedChampionDataSnapshot,
    input: RankedChampionStatsInput,
    is_cached: bool,
    data_status: RankedChampionDataStatus,
    status_message: Option<String>,
) -> RankedChampionStatsResponse {
    let sort_by = input.sort_by.unwrap_or(RankedChampionSort::Overall);
    let mut records: Vec<RankedChampionStat> = snapshot
        .records
        .into_iter()
        .filter(|record| input.lane.is_none_or(|lane| record.lane == lane))
        .collect();

    records.sort_by(|left, right| compare_ranked_champions(left, right, sort_by));

    RankedChampionStatsResponse {
        lane: input.lane,
        sort_by,
        records,
        source: snapshot.source,
        updated_at: snapshot
            .generated_at
            .clone()
            .unwrap_or_else(|| snapshot.imported_at.clone()),
        generated_at: snapshot.generated_at,
        imported_at: Some(snapshot.imported_at),
        patch: snapshot.patch,
        region: snapshot.region,
        queue: snapshot.queue,
        tier: snapshot.tier,
        is_cached,
        data_status,
        status_message,
    }
}

fn ranked_provider_error(error: RankedChampionDataError) -> ApplicationError {
    match error {
        RankedChampionDataError::Unavailable(message)
        | RankedChampionDataError::InvalidData(message) => ApplicationError::Integration(message),
    }
}

fn ranked_overall_score(win_rate: f64, pick_rate: f64, ban_rate: f64) -> f64 {
    round_to_tenth((win_rate * 0.55) + (pick_rate * 0.25) + (ban_rate * 0.20))
}

fn compare_ranked_champions(
    left: &RankedChampionStat,
    right: &RankedChampionStat,
    sort_by: RankedChampionSort,
) -> Ordering {
    let left_value = ranked_sort_value(left, sort_by);
    let right_value = ranked_sort_value(right, sort_by);

    right_value
        .partial_cmp(&left_value)
        .unwrap_or(Ordering::Equal)
        .then_with(|| {
            right
                .overall_score
                .partial_cmp(&left.overall_score)
                .unwrap_or(Ordering::Equal)
        })
        .then_with(|| left.champion_name.cmp(&right.champion_name))
}

fn ranked_sort_value(record: &RankedChampionStat, sort_by: RankedChampionSort) -> f64 {
    match sort_by {
        RankedChampionSort::Overall => record.overall_score,
        RankedChampionSort::WinRate => record.win_rate,
        RankedChampionSort::BanRate => record.ban_rate,
        RankedChampionSort::PickRate => record.pick_rate,
    }
}

fn unix_timestamp_seconds() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn validate_activity_note(input: ActivityNoteInput) -> Result<NewActivityEntry, ApplicationError> {
    let title = input.title.trim().to_string();

    if title.is_empty() {
        return Err(ApplicationError::Validation(
            "Activity note title is required".to_string(),
        ));
    }

    if title.chars().count() > MAX_ACTIVITY_TITLE_LEN {
        return Err(ApplicationError::Validation(format!(
            "Activity note title must be {MAX_ACTIVITY_TITLE_LEN} characters or fewer"
        )));
    }

    let body = input
        .body
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(value) = &body {
        if value.chars().count() > MAX_ACTIVITY_BODY_LEN {
            return Err(ApplicationError::Validation(format!(
                "Activity note body must be {MAX_ACTIVITY_BODY_LEN} characters or fewer"
            )));
        }
    }

    Ok(NewActivityEntry {
        kind: ActivityKind::Note,
        title,
        body,
    })
}

fn validate_local_activity_entry(entry: &LocalActivityEntry) -> Result<(), ApplicationError> {
    if entry.title.trim().is_empty() {
        return Err(ApplicationError::Validation(
            "Imported activity title is required".to_string(),
        ));
    }

    if entry.title.chars().count() > MAX_ACTIVITY_TITLE_LEN {
        return Err(ApplicationError::Validation(format!(
            "Imported activity title must be {MAX_ACTIVITY_TITLE_LEN} characters or fewer"
        )));
    }

    if let Some(value) = &entry.body {
        if value.chars().count() > MAX_ACTIVITY_BODY_LEN {
            return Err(ApplicationError::Validation(format!(
                "Imported activity body must be {MAX_ACTIVITY_BODY_LEN} characters or fewer"
            )));
        }
    }

    if entry.created_at.trim().is_empty() {
        return Err(ApplicationError::Validation(
            "Imported activity createdAt is required".to_string(),
        ));
    }

    Ok(())
}

pub fn get_champ_select_snapshot(
    reader: &(impl LeagueClientReader + Sync),
    recent_limit: i64,
) -> Result<domain::ChampSelectSnapshot, ApplicationError> {
    #[derive(Debug)]
    struct PlayerSeed {
        summoner_id: i64,
        puuid: String,
        display_name: String,
        champion_id: Option<i64>,
        team: domain::ChampSelectTeam,
    }

    let session = reader.champ_select_session()?;
    let mut all_ids: Vec<i64> = session
        .ally_ids
        .iter()
        .chain(session.enemy_ids.iter())
        .copied()
        .collect();
    all_ids.sort_unstable();
    all_ids.dedup();
    let summoners = reader.summoners_by_ids(&all_ids);
    let summoners_by_id: HashMap<i64, SummonerBatchEntry> = summoners
        .into_iter()
        .map(|summoner| (summoner.summoner_id, summoner))
        .collect();
    let all_names: Vec<String> = session
        .ally_names
        .iter()
        .chain(session.enemy_names.iter())
        .filter(|name| !name.trim().is_empty())
        .cloned()
        .collect();
    let summoners_by_name: HashMap<String, SummonerBatchEntry> = reader
        .summoners_by_names(&all_names)
        .into_iter()
        .map(|summoner| {
            (
                normalize_player_name(summoner.display_name.as_str()),
                summoner,
            )
        })
        .collect();

    let mut seeds = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_names = HashSet::new();

    for summoner_id in all_ids {
        let summoner = summoners_by_id.get(&summoner_id);
        let team = if session.ally_ids.contains(&summoner_id) {
            domain::ChampSelectTeam::Ally
        } else {
            domain::ChampSelectTeam::Enemy
        };
        let champion_id = session.champion_selections.get(&summoner_id).copied();
        let puuid = summoner
            .map(|value| value.puuid.clone())
            .unwrap_or_default();
        let display_name = summoner
            .map(|value| value.display_name.clone())
            .unwrap_or_else(|| format!("Summoner {summoner_id}"));

        seen_ids.insert(summoner_id);
        seen_names.insert(normalize_player_name(display_name.as_str()));
        seeds.push(PlayerSeed {
            summoner_id,
            puuid,
            display_name,
            champion_id,
            team,
        });
    }

    for (name, team) in session
        .ally_names
        .iter()
        .map(|name| (name, domain::ChampSelectTeam::Ally))
        .chain(
            session
                .enemy_names
                .iter()
                .map(|name| (name, domain::ChampSelectTeam::Enemy)),
        )
    {
        let normalized_name = normalize_player_name(name.as_str());
        if normalized_name.is_empty() || seen_names.contains(&normalized_name) {
            continue;
        }

        let summoner = summoners_by_name.get(&normalized_name);
        if let Some(summoner) = summoner {
            if seen_ids.contains(&summoner.summoner_id) {
                continue;
            }
            seen_ids.insert(summoner.summoner_id);
        }

        let summoner_id = summoner
            .map(|value| value.summoner_id)
            .unwrap_or_else(|| negative_stable_id(name.as_str()));
        let puuid = summoner
            .map(|value| value.puuid.clone())
            .unwrap_or_default();
        let display_name = summoner
            .map(|value| value.display_name.clone())
            .unwrap_or_else(|| name.clone());
        let champion_id = session
            .champion_selections_by_name
            .get(&normalized_name)
            .copied();

        seen_names.insert(normalized_name);
        seeds.push(PlayerSeed {
            summoner_id,
            puuid,
            display_name,
            champion_id,
            team,
        });
    }

    let recent_stats_by_puuid = if recent_limit <= 0 {
        HashMap::new()
    } else {
        let mut puuids: Vec<String> = seeds
            .iter()
            .map(|seed| seed.puuid.clone())
            .filter(|puuid| !puuid.is_empty())
            .collect();
        puuids.sort_unstable();
        puuids.dedup();
        reader.participant_recent_stats_batch(&puuids, recent_limit)
    };
    let players = seeds
        .into_iter()
        .map(|seed| {
            let recent_stats = recent_stats_by_puuid
                .get(seed.puuid.as_str())
                .and_then(|result| result.clone().ok());

            domain::ChampSelectPlayer {
                summoner_id: seed.summoner_id,
                puuid: seed.puuid,
                display_name: seed.display_name,
                champion_id: seed.champion_id,
                champion_name: None,
                team: seed.team,
                ranked_queues: Vec::new(),
                recent_stats,
            }
        })
        .collect();

    Ok(domain::ChampSelectSnapshot {
        players,
        cached_at: unix_timestamp_seconds(),
    })
}

pub fn get_league_champion_catalog(
    reader: &impl LeagueClientReader,
) -> Result<Vec<LeagueChampionSummary>, ApplicationError> {
    let mut champions = reader.champion_catalog()?;
    champions.sort_by(|left, right| {
        left.champion_name
            .to_ascii_lowercase()
            .cmp(&right.champion_name.to_ascii_lowercase())
            .then(left.champion_id.cmp(&right.champion_id))
    });
    Ok(champions)
}

pub fn run_lobby_automation(
    store: &impl AppStore,
    reader: &impl LeagueClientReader,
) -> Result<(), ApplicationError> {
    run_ready_check_automation(store, reader)?;
    run_champ_select_automation(store, reader)
}

pub fn run_ready_check_automation(
    store: &impl AppStore,
    reader: &impl LeagueClientReader,
) -> Result<(), ApplicationError> {
    let settings = store.get_settings().map_err(ApplicationError::Storage)?;

    if !settings.auto_accept_enabled {
        log_auto_accept_event("skipped because setting is disabled");
        return Ok(());
    }

    if !is_ready_check_active(reader)? {
        log_auto_accept_event("skipped because ReadyCheck is not active");
        return Ok(());
    }
    log_auto_accept_event("ready check detected");

    for (attempt, delay_ms) in READY_CHECK_AUTOMATION_RETRY_DELAYS_MS
        .iter()
        .copied()
        .chain(std::iter::once(0))
        .enumerate()
    {
        let attempt_number = attempt + 1;
        if !is_ready_check_active(reader)? {
            log_auto_accept_attempt(attempt_number, "skipped because phase moved before request");
            return Ok(());
        }

        log_auto_accept_attempt(attempt_number, "sending accept request");
        if let Err(error) = reader.accept_ready_check() {
            log_auto_accept_attempt(attempt_number, "accept request failed");
            if !is_ready_check_active(reader)? {
                log_auto_accept_attempt(
                    attempt_number,
                    "accept response was uncertain but phase moved",
                );
                return Ok(());
            }

            record_system_activity(
                store,
                "Lobby automation accept failed",
                format!("Auto-accept could not reach the League Client: {error}").as_str(),
            );
            return Err(error.into());
        }

        if !is_ready_check_active(reader)? {
            log_auto_accept_attempt(attempt_number, "verified phase moved after accept");
            return Ok(());
        }
        log_auto_accept_attempt(attempt_number, "phase still ReadyCheck after accept");

        if delay_ms > 0 {
            log_auto_accept_attempt(attempt_number, "waiting before retry verification");
            thread::sleep(Duration::from_millis(delay_ms));
        }

        if !is_ready_check_active(reader)? {
            log_auto_accept_attempt(attempt_number, "verified phase moved after delay");
            return Ok(());
        }
        log_auto_accept_attempt(attempt_number, "phase still ReadyCheck after delay");

        if attempt + 1 == READY_CHECK_AUTOMATION_RETRY_DELAYS_MS.len() + 1 {
            break;
        }
    }

    let message =
        "Auto-accept did not move the client out of ReadyCheck after multiple verification attempts"
            .to_string();
    record_system_activity(
        store,
        "Lobby automation requires manual accept",
        "Auto-accept retried, but the client stayed in ReadyCheck. Manual confirmation may still be needed.",
    );
    log_auto_accept_event("failed because phase stayed ReadyCheck after retries");
    Err(ApplicationError::Integration(message))
}

pub fn run_champ_select_automation(
    store: &impl AppStore,
    _reader: &impl LeagueClientReader,
) -> Result<(), ApplicationError> {
    let settings = store.get_settings().map_err(ApplicationError::Storage)?;

    if settings.auto_pick_enabled || settings.auto_ban_enabled {
        log_auto_accept_event("champ-select automation execution is disabled");
    }

    Ok(())
}

fn normalize_player_name(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn is_ready_check_active(reader: &impl LeagueClientReader) -> Result<bool, ApplicationError> {
    Ok(reader.gameflow_phase()?.as_str() == "ReadyCheck")
}

fn record_system_activity(store: &impl AppStore, title: &str, body: &str) {
    let _ = store.create_activity_entry(NewActivityEntry {
        kind: ActivityKind::System,
        title: title.to_string(),
        body: Some(body.to_string()),
    });
}

fn negative_stable_id(value: &str) -> i64 {
    use std::{
        collections::hash_map::DefaultHasher,
        hash::{Hash, Hasher},
    };

    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    -((hasher.finish() & 0x3fff_ffff_ffff) as i64) - 1
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::{
        LeagueClientConnection, LeagueClientPhase, LeagueDataSection, LeagueDataWarning,
        MatchResult,
    };
    use std::{cell::RefCell, sync::Mutex};

    #[test]
    fn save_settings_does_not_log_activity_when_values_are_unchanged() {
        let store = FakeStore::new(default_settings());

        let result = save_settings(
            &store,
            SettingsInput {
                startup_page: "dashboard".to_string(),
                language: "system".to_string(),
                compact_mode: false,
                activity_limit: 100,
                auto_accept_enabled: true,
                auto_pick_enabled: false,
                auto_pick_champion_id: None,
                auto_ban_enabled: false,
                auto_ban_champion_id: None,
            },
        )
        .expect("settings save succeeds");

        assert_eq!(result.startup_page, StartupPage::Dashboard);
        assert_eq!(store.created_entries.borrow().len(), 0);
    }

    #[test]
    fn save_settings_logs_activity_when_values_change() {
        let store = FakeStore::new(default_settings());

        let result = save_settings(
            &store,
            SettingsInput {
                startup_page: "activity".to_string(),
                language: "zh".to_string(),
                compact_mode: true,
                activity_limit: 50,
                auto_accept_enabled: false,
                auto_pick_enabled: true,
                auto_pick_champion_id: Some(103),
                auto_ban_enabled: true,
                auto_ban_champion_id: Some(122),
            },
        )
        .expect("settings save succeeds");

        assert_eq!(result.startup_page, StartupPage::Activity);
        assert_eq!(result.language, AppLanguagePreference::Zh);
        assert_eq!(result.activity_limit, 50);
        assert_eq!(store.created_entries.borrow().len(), 1);
        assert_eq!(
            store.created_entries.borrow()[0].kind,
            ActivityKind::Settings
        );
    }

    #[test]
    fn ready_check_automation_respects_auto_accept_setting() {
        let mut settings = default_settings();
        settings.auto_accept_enabled = false;
        let store = FakeStore::new(settings);
        let reader = FakeLeagueClientReader::new(Vec::new()).with_ready_check_phase();

        run_ready_check_automation(&store, &reader).expect("automation runs");

        assert_eq!(reader.accept_ready_check_count(), 0);
    }

    #[test]
    fn ready_check_automation_calls_reader_when_enabled_and_ready_check_is_active() {
        let store = FakeStore::new(default_settings());
        let reader = FakeLeagueClientReader::new(Vec::new())
            .with_phase_transition_after_accepts(1, "ChampSelect");

        run_ready_check_automation(&store, &reader).expect("automation runs");

        assert_eq!(reader.accept_ready_check_count(), 1);
    }

    #[test]
    fn ready_check_automation_retries_until_phase_changes() {
        let store = FakeStore::new(default_settings());
        let reader = FakeLeagueClientReader::new(Vec::new())
            .with_phase_transition_after_accepts(3, "ChampSelect");

        run_ready_check_automation(&store, &reader).expect("automation runs");

        assert_eq!(reader.accept_ready_check_count(), 3);
    }

    #[test]
    fn ready_check_automation_records_system_activity_when_ready_check_stays_active() {
        let store = FakeStore::new(default_settings());
        let reader = FakeLeagueClientReader::new(Vec::new()).with_ready_check_phase();

        let error =
            run_ready_check_automation(&store, &reader).expect_err("automation should fail");

        assert_eq!(
            error.to_string(),
            "Auto-accept did not move the client out of ReadyCheck after multiple verification attempts"
        );
        assert_eq!(reader.accept_ready_check_count(), 4);
        assert_eq!(store.created_entries.borrow().len(), 1);
        assert_eq!(store.created_entries.borrow()[0].kind, ActivityKind::System);
    }

    #[test]
    fn ready_check_automation_records_system_activity_when_accept_call_errors() {
        let store = FakeStore::new(default_settings());
        let reader = FakeLeagueClientReader::new(Vec::new()).with_ready_check_accept_error(
            LeagueClientReadError::ClientUnavailable("League Client unavailable".to_string()),
        );

        let error =
            run_ready_check_automation(&store, &reader).expect_err("automation should fail");

        assert_eq!(error.code(), "clientUnavailable");
        assert_eq!(reader.accept_ready_check_count(), 1);
        assert_eq!(store.created_entries.borrow().len(), 1);
        assert_eq!(store.created_entries.borrow()[0].kind, ActivityKind::System);
    }

    #[test]
    fn ready_check_automation_treats_accept_error_as_success_when_phase_moves() {
        let store = FakeStore::new(default_settings());
        let reader = FakeLeagueClientReader::new(Vec::new())
            .with_phase_transition_after_accepts(1, "ChampSelect")
            .with_ready_check_accept_error(LeagueClientReadError::Integration(
                "Ready check response was unavailable".to_string(),
            ));

        run_ready_check_automation(&store, &reader).expect("phase movement confirms accept");

        assert_eq!(reader.accept_ready_check_count(), 1);
        assert!(store.created_entries.borrow().is_empty());
    }

    #[test]
    fn create_activity_note_trims_input() {
        let store = FakeStore::new(default_settings());

        let result = create_activity_note(
            &store,
            ActivityNoteInput {
                title: "  First note  ".to_string(),
                body: Some("  Body  ".to_string()),
            },
        )
        .expect("activity note is created");

        assert_eq!(result.title, "First note");
        assert_eq!(result.body.as_deref(), Some("Body"));
    }

    #[test]
    fn list_activity_entries_passes_filter_to_store() {
        let store = FakeStore::new(default_settings());

        let _ = list_activity_entries(
            &store,
            ActivityListInput {
                limit: Some(25),
                kind: Some(ActivityKind::Note),
            },
        )
        .expect("activity entries list");

        assert_eq!(
            *store.last_activity_query.borrow(),
            Some((25, Some(ActivityKind::Note)))
        );
    }

    #[test]
    fn export_local_data_includes_defaults_shape() {
        let store = FakeStore::new(default_settings());
        store.activity_entries.borrow_mut().push(sample_activity(1));

        let data = export_local_data(&store).expect("local data export");

        assert_eq!(data.format_version, 1);
        assert_eq!(data.settings.activity_limit, 100);
        assert_eq!(data.activity_entries.len(), 1);
        assert_eq!(data.activity_entries[0].created_at, "2026-04-18 00:00:00");
    }

    #[test]
    fn import_local_data_rejects_invalid_json_without_writing() {
        let store = FakeStore::new(default_settings());

        let result = import_local_data(
            &store,
            r#"{"formatVersion":1,"settings":{"startupPage":"dashboard","compactMode":false,"activityLimit":999},"activityEntries":[]}"#,
        );

        assert!(matches!(result, Err(ApplicationError::Validation(_))));
        assert_eq!(*store.import_count.borrow(), 0);
    }

    #[test]
    fn import_local_data_validates_then_writes() {
        let store = FakeStore::new(default_settings());

        let result = import_local_data(
            &store,
            r#"{"formatVersion":1,"settings":{"startupPage":"activity","compactMode":true,"activityLimit":50},"activityEntries":[{"kind":"note","title":"Imported","body":null,"createdAt":"2026-04-19 00:00:00"}]}"#,
        )
        .expect("local data import");

        assert_eq!(result.imported_activity_count, 1);
        assert_eq!(result.settings.startup_page, StartupPage::Activity);
        assert_eq!(*store.import_count.borrow(), 1);
    }

    #[test]
    fn clear_activity_requires_confirmation() {
        let store = FakeStore::new(default_settings());

        let result = clear_activity_entries(&store, false);

        assert!(matches!(result, Err(ApplicationError::Validation(_))));
        assert_eq!(*store.clear_count.borrow(), 0);
    }

    #[test]
    fn clear_activity_returns_deleted_count() {
        let store = FakeStore::new(default_settings());
        store.activity_entries.borrow_mut().push(sample_activity(1));
        store.activity_entries.borrow_mut().push(sample_activity(2));

        let result = clear_activity_entries(&store, true).expect("activity clears");

        assert_eq!(result.deleted_count, 2);
        assert_eq!(*store.clear_count.borrow(), 1);
    }

    #[test]
    fn league_self_snapshot_defaults_to_six_matches_and_summarizes_performance() {
        let reader = FakeLeagueClientReader::new((1..=7).map(high_kda_match).collect());

        let result =
            get_league_self_snapshot(&reader, LeagueSelfSnapshotInput { match_limit: None })
                .expect("league self snapshot");

        assert_eq!(*reader.last_match_limit.lock().unwrap(), Some(6));
        assert_eq!(result.recent_matches.len(), 6);
        assert_eq!(result.recent_performance.match_count, 6);
        assert_eq!(result.recent_performance.average_kda, Some(10.0));
        assert_eq!(result.recent_performance.kda_tag, KdaTag::High);
        assert_eq!(result.recent_performance.recent_champions.len(), 6);
        assert_eq!(result.recent_performance.top_champions.len(), 3);
    }

    #[test]
    fn champ_select_snapshot_batches_recent_stats() {
        let mut champion_selections = HashMap::new();
        champion_selections.insert(1, 103);
        champion_selections.insert(2, 222);
        let reader = FakeLeagueClientReader::with_champ_select_data(
            ChampSelectSessionData {
                ally_ids: vec![1, 2],
                enemy_ids: Vec::new(),
                champion_selections,
                ally_names: Vec::new(),
                enemy_names: Vec::new(),
                champion_selections_by_name: HashMap::new(),
            },
            vec![
                SummonerBatchEntry {
                    summoner_id: 1,
                    puuid: "puuid-1".to_string(),
                    display_name: "Player One".to_string(),
                },
                SummonerBatchEntry {
                    summoner_id: 2,
                    puuid: "puuid-2".to_string(),
                    display_name: "Player Two".to_string(),
                },
            ],
            Vec::new(),
        );

        let snapshot = get_champ_select_snapshot(&reader, 6).expect("champ select snapshot reads");

        assert_eq!(snapshot.players.len(), 2);
        assert!(snapshot
            .players
            .iter()
            .all(|player| player.recent_stats.is_some()));
        assert_eq!(
            reader.recent_stats_batch_calls(),
            vec![vec!["puuid-1".to_string(), "puuid-2".to_string()]]
        );
    }

    #[test]
    fn champ_select_recent_stats_failure_keeps_other_players() {
        let reader = FakeLeagueClientReader::with_champ_select_data(
            ChampSelectSessionData {
                ally_ids: vec![1, 2],
                enemy_ids: Vec::new(),
                champion_selections: HashMap::new(),
                ally_names: Vec::new(),
                enemy_names: Vec::new(),
                champion_selections_by_name: HashMap::new(),
            },
            vec![
                SummonerBatchEntry {
                    summoner_id: 1,
                    puuid: "puuid-1".to_string(),
                    display_name: "Player One".to_string(),
                },
                SummonerBatchEntry {
                    summoner_id: 2,
                    puuid: "puuid-2".to_string(),
                    display_name: "Player Two".to_string(),
                },
            ],
            vec!["puuid-2".to_string()],
        );

        let snapshot = get_champ_select_snapshot(&reader, 6).expect("champ select snapshot reads");
        let player_one = snapshot
            .players
            .iter()
            .find(|player| player.display_name == "Player One")
            .expect("player one is present");
        let player_two = snapshot
            .players
            .iter()
            .find(|player| player.display_name == "Player Two")
            .expect("player two is present");

        assert!(player_one.recent_stats.is_some());
        assert!(player_two.recent_stats.is_none());
    }

    #[test]
    fn ranked_champion_stats_filters_lane_and_sorts_by_win_rate() {
        let response = get_ranked_champion_stats(RankedChampionStatsInput {
            lane: Some(RankedChampionLane::Jungle),
            sort_by: Some(RankedChampionSort::WinRate),
        });

        assert_eq!(response.lane, Some(RankedChampionLane::Jungle));
        assert_eq!(response.sort_by, RankedChampionSort::WinRate);
        assert!(response
            .records
            .iter()
            .all(|record| record.lane == RankedChampionLane::Jungle));
        assert!(response
            .records
            .windows(2)
            .all(|records| records[0].win_rate >= records[1].win_rate));
    }

    #[test]
    fn ranked_champion_stats_supports_all_sort_modes() {
        for sort_by in [
            RankedChampionSort::Overall,
            RankedChampionSort::WinRate,
            RankedChampionSort::BanRate,
            RankedChampionSort::PickRate,
        ] {
            let response = get_ranked_champion_stats(RankedChampionStatsInput {
                lane: None,
                sort_by: Some(sort_by),
            });

            assert_eq!(response.sort_by, sort_by);
            assert_eq!(response.records.len(), 25);
            assert!(response.records.windows(2).all(|records| {
                ranked_sort_value(&records[0], sort_by) >= ranked_sort_value(&records[1], sort_by)
            }));
        }
    }

    #[test]
    fn ranked_champion_stats_reads_cached_snapshot_when_available() {
        let store = FakeStore::new(default_settings());
        store
            .ranked_snapshot
            .replace(Some(sample_ranked_snapshot("cached-json")));

        let response = get_ranked_champion_stats_from_store(
            &store,
            RankedChampionStatsInput {
                lane: Some(RankedChampionLane::Middle),
                sort_by: Some(RankedChampionSort::Overall),
            },
        )
        .expect("ranked champion stats reads");

        assert_eq!(response.source, "cached-json");
        assert_eq!(response.patch.as_deref(), Some("26.08"));
        assert!(response.is_cached);
        assert_eq!(response.data_status, RankedChampionDataStatus::Cached);
        assert_eq!(response.records.len(), 1);
        assert_eq!(response.records[0].champion_name, "Ahri");
    }

    #[test]
    fn ranked_champion_refresh_persists_provider_snapshot() {
        let store = FakeStore::new(default_settings());
        let provider = FakeRankedChampionProvider {
            snapshot: sample_ranked_snapshot("remote-json"),
        };

        let response = refresh_ranked_champion_stats(
            &store,
            &provider,
            RankedChampionRefreshInput { url: None },
            RankedChampionStatsInput {
                lane: Some(RankedChampionLane::Middle),
                sort_by: Some(RankedChampionSort::WinRate),
            },
        )
        .expect("ranked champion stats refreshes");

        assert_eq!(response.source, "remote-json");
        assert!(response.is_cached);
        assert_eq!(response.data_status, RankedChampionDataStatus::Fresh);
        assert!(store.ranked_snapshot.borrow().is_some());
        assert_eq!(
            store.ranked_snapshot.borrow().as_ref().unwrap().source,
            "remote-json"
        );
    }

    #[test]
    fn ranked_champion_refresh_returns_stale_cache_when_remote_fails() {
        let store = FakeStore::new(default_settings());
        store
            .ranked_snapshot
            .replace(Some(sample_ranked_snapshot("cached-json")));
        let provider = FailingRankedChampionProvider;

        let response = refresh_ranked_champion_stats(
            &store,
            &provider,
            RankedChampionRefreshInput { url: None },
            RankedChampionStatsInput {
                lane: Some(RankedChampionLane::Middle),
                sort_by: Some(RankedChampionSort::Overall),
            },
        )
        .expect("stale cache is returned");

        assert_eq!(response.source, "cached-json");
        assert_eq!(response.data_status, RankedChampionDataStatus::StaleCache);
        assert_eq!(response.records.len(), 1);
        assert!(response.status_message.unwrap().contains("cached data"));
    }

    #[test]
    fn ranked_champion_refresh_errors_without_cache_when_remote_fails() {
        let store = FakeStore::new(default_settings());
        let provider = FailingRankedChampionProvider;

        let error = refresh_ranked_champion_stats(
            &store,
            &provider,
            RankedChampionRefreshInput { url: None },
            RankedChampionStatsInput {
                lane: None,
                sort_by: None,
            },
        )
        .expect_err("refresh fails without cache");

        assert_eq!(error.code(), "integration");
    }

    #[test]
    fn league_self_snapshot_rejects_invalid_match_limit() {
        let reader = FakeLeagueClientReader::new(Vec::new());

        let result = get_league_self_snapshot(
            &reader,
            LeagueSelfSnapshotInput {
                match_limit: Some(0),
            },
        );

        assert!(matches!(result, Err(ApplicationError::Validation(_))));
        assert_eq!(*reader.last_match_limit.lock().unwrap(), None);
    }

    #[test]
    fn league_self_snapshot_handles_zero_death_matches() {
        let reader = FakeLeagueClientReader::new(vec![sample_match(1, "Ahri", 7, 0, 5)]);

        let result = get_league_self_snapshot(
            &reader,
            LeagueSelfSnapshotInput {
                match_limit: Some(1),
            },
        )
        .expect("league self snapshot");

        assert_eq!(result.recent_performance.average_kda, Some(12.0));
        assert_eq!(result.recent_performance.kda_tag, KdaTag::High);
    }

    #[test]
    fn league_self_snapshot_marks_empty_performance_unavailable() {
        let reader = FakeLeagueClientReader::new(Vec::new());

        let result = get_league_self_snapshot(
            &reader,
            LeagueSelfSnapshotInput {
                match_limit: Some(6),
            },
        )
        .expect("league self snapshot");

        assert_eq!(result.recent_performance.match_count, 0);
        assert_eq!(result.recent_performance.average_kda, None);
        assert_eq!(result.recent_performance.kda_tag, KdaTag::Unavailable);
    }

    #[test]
    fn league_self_snapshot_preserves_unavailable_status() {
        let reader = FakeLeagueClientReader::with_data(LeagueSelfData {
            status: LeagueClientStatus {
                is_running: false,
                lockfile_found: false,
                connection: LeagueClientConnection::Unavailable,
                phase: LeagueClientPhase::NotRunning,
                message: Some("League Client is not running".to_string()),
            },
            summoner: None,
            ranked_queues: Vec::new(),
            recent_matches: Vec::new(),
            data_warnings: Vec::new(),
        });

        let result = get_league_self_snapshot(
            &reader,
            LeagueSelfSnapshotInput {
                match_limit: Some(6),
            },
        )
        .expect("league self snapshot");

        assert_eq!(result.status.phase, LeagueClientPhase::NotRunning);
        assert!(result.summoner.is_none());
        assert!(result.data_warnings.is_empty());
    }

    #[test]
    fn league_self_snapshot_accepts_partial_data_without_error() {
        let reader = FakeLeagueClientReader::with_data(LeagueSelfData {
            status: LeagueClientStatus {
                is_running: true,
                lockfile_found: true,
                connection: LeagueClientConnection::Connected,
                phase: LeagueClientPhase::PartialData,
                message: Some("League Client connected with partial data".to_string()),
            },
            summoner: None,
            ranked_queues: Vec::new(),
            recent_matches: vec![sample_match(1, "Ahri", 1, 1, 1)],
            data_warnings: vec![LeagueDataWarning {
                section: LeagueDataSection::Ranked,
                message: "Ranked data is temporarily unavailable".to_string(),
            }],
        });

        let result = get_league_self_snapshot(
            &reader,
            LeagueSelfSnapshotInput {
                match_limit: Some(6),
            },
        )
        .expect("league self snapshot");

        assert_eq!(result.status.phase, LeagueClientPhase::PartialData);
        assert_eq!(result.data_warnings.len(), 1);
        assert_eq!(result.data_warnings[0].section, LeagueDataSection::Ranked);
    }

    #[test]
    fn league_client_error_codes_are_stable() {
        let unavailable = ApplicationError::from(LeagueClientReadError::ClientUnavailable(
            "League Client is not running".to_string(),
        ));
        let access = ApplicationError::from(LeagueClientReadError::ClientAccess(
            "League Client rejected local authentication".to_string(),
        ));
        let integration = ApplicationError::from(LeagueClientReadError::Integration(
            "League Client returned an unexpected response".to_string(),
        ));

        assert_eq!(unavailable.code(), "clientUnavailable");
        assert_eq!(access.code(), "clientAccess");
        assert_eq!(integration.code(), "integration");
    }

    #[test]
    fn league_profile_icon_validates_id_before_reader_call() {
        let reader = FakeLeagueClientReader::new(Vec::new());

        let result =
            get_league_profile_icon(&reader, LeagueProfileIconInput { profile_icon_id: 0 });

        assert!(matches!(result, Err(ApplicationError::Validation(_))));
    }

    #[test]
    fn league_champion_icon_returns_image_bytes() {
        let reader = FakeLeagueClientReader::new(Vec::new());

        let result =
            get_league_champion_icon(&reader, LeagueChampionIconInput { champion_id: 103 })
                .expect("champion icon reads");

        assert_eq!(result.mime_type, "image/png");
        assert_eq!(result.bytes, vec![103]);
    }

    #[test]
    fn league_game_asset_validates_id_before_reader_call() {
        let reader = FakeLeagueClientReader::new(Vec::new());

        let result = get_league_game_asset(
            &reader,
            LeagueGameAssetInput {
                kind: LeagueGameAssetKind::Item,
                asset_id: 0,
            },
        );

        assert!(matches!(result, Err(ApplicationError::Validation(_))));
    }

    #[test]
    fn league_game_asset_returns_metadata_and_image_bytes() {
        let reader = FakeLeagueClientReader::new(Vec::new());

        let result = get_league_game_asset(
            &reader,
            LeagueGameAssetInput {
                kind: LeagueGameAssetKind::Spell,
                asset_id: 4,
            },
        )
        .expect("game asset reads");

        assert_eq!(result.kind, LeagueGameAssetKind::Spell);
        assert_eq!(result.asset_id, 4);
        assert_eq!(result.name, "Spell 4");
        assert_eq!(result.image.bytes, vec![4]);
    }

    #[test]
    fn player_note_validation_trims_and_deduplicates() {
        let store = FakeStore::new(default_settings());

        let result = save_player_note_for_resolved_player(
            &store,
            SavePlayerNoteInput {
                game_id: 10,
                participant_id: 2,
                note: Some("  Watch roams  ".to_string()),
                tags: vec![
                    " mid ".to_string(),
                    "mid".to_string(),
                    "shotcaller".to_string(),
                ],
            },
            "internal-puuid".to_string(),
            "Visible Player".to_string(),
        )
        .expect("player note saves");

        assert_eq!(result.note.as_deref(), Some("Watch roams"));
        assert_eq!(result.tags, vec!["mid", "shotcaller"]);
        assert_eq!(result.game_id, 10);
        assert_eq!(result.participant_id, 2);
    }

    #[test]
    fn player_note_summary_does_not_require_puuid() {
        let store = FakeStore::new(default_settings());

        let summary = player_note_summary(&store, None).expect("summary reads");

        assert!(!summary.has_note);
        assert!(summary.tags.is_empty());
    }

    #[test]
    fn post_match_detail_groups_teams_and_hydrates_notes() {
        let store = FakeStore::new(default_settings());
        store
            .save_player_note(StoredPlayerNoteInput {
                player_puuid: "self-puuid".to_string(),
                last_display_name: "Player One".to_string(),
                note: Some("Played well".to_string()),
                tags: vec!["carry".to_string()],
            })
            .expect("note saves");
        let reader = FakeLeagueClientReader::with_completed_match(sample_completed_match());

        let detail = get_post_match_detail(&store, &reader, PostMatchDetailInput { game_id: 10 })
            .expect("post-match detail reads");

        assert_eq!(detail.teams.len(), 2);
        assert_eq!(detail.teams[0].participants.len(), 1);
        assert_eq!(detail.teams[0].totals.kills, 7);
        assert_eq!(detail.comparison.most_damage.unwrap().participant_id, 2);
        assert!(detail.teams[0].participants[0].performance_score > 8.0);
        assert!(detail.teams[0].participants[0].note_summary.has_note);
        assert_eq!(
            detail.teams[0].participants[0].note_summary.tags,
            vec!["carry"]
        );
    }

    #[test]
    fn post_match_detail_scores_participants_from_available_stats() {
        let store = FakeStore::new(default_settings());
        let reader = FakeLeagueClientReader::with_completed_match(sample_completed_match());

        let detail = get_post_match_detail(&store, &reader, PostMatchDetailInput { game_id: 10 })
            .expect("post-match detail reads");
        let first_score = detail.teams[0].participants[0].performance_score;
        let second_score = detail.teams[1].participants[0].performance_score;

        assert!((0.0..=10.0).contains(&first_score));
        assert!((0.0..=10.0).contains(&second_score));
        assert!(first_score > second_score);
    }

    #[test]
    fn post_match_detail_warns_when_only_partial_participants_are_available() {
        let store = FakeStore::new(default_settings());
        let mut completed_match = sample_completed_match();
        completed_match.participants.truncate(1);
        let reader = FakeLeagueClientReader::with_completed_match(completed_match);

        let detail = get_post_match_detail(&store, &reader, PostMatchDetailInput { game_id: 10 })
            .expect("post-match detail reads");

        assert_eq!(detail.teams.len(), 1);
        assert_eq!(detail.warnings.len(), 1);
        assert_eq!(detail.warnings[0].section, LeagueDataSection::Participants);
    }

    #[test]
    fn participant_profile_uses_completed_match_context_without_exposing_puuid() {
        let store = FakeStore::new(default_settings());
        let reader = FakeLeagueClientReader::with_completed_match(sample_completed_match());

        let profile = get_post_match_participant_profile(
            &store,
            &reader,
            ParticipantPublicProfileInput {
                game_id: 10,
                participant_id: 2,
                recent_limit: Some(3),
            },
        )
        .expect("participant profile reads");

        assert_eq!(profile.display_name, "Player Two");
        assert_eq!(profile.recent_stats.as_ref().unwrap().match_count, 3);
        assert_eq!(
            profile.recent_stats.as_ref().unwrap().recent_matches.len(),
            3
        );
        assert!(format!("{profile:?}").contains("Player Two"));
        assert!(!format!("{profile:?}").contains("enemy-puuid"));
    }

    struct FakeStore {
        settings: RefCell<AppSettings>,
        activity_entries: RefCell<Vec<ActivityEntry>>,
        created_entries: RefCell<Vec<NewActivityEntry>>,
        imported_entries: RefCell<Vec<LocalActivityEntry>>,
        player_notes: RefCell<Vec<StoredPlayerNote>>,
        ranked_snapshot: RefCell<Option<RankedChampionDataSnapshot>>,
        last_activity_query: RefCell<Option<(i64, Option<ActivityKind>)>>,
        import_count: RefCell<usize>,
        clear_count: RefCell<usize>,
    }

    impl FakeStore {
        fn new(settings: AppSettings) -> Self {
            Self {
                settings: RefCell::new(settings),
                activity_entries: RefCell::new(Vec::new()),
                created_entries: RefCell::new(Vec::new()),
                imported_entries: RefCell::new(Vec::new()),
                player_notes: RefCell::new(Vec::new()),
                ranked_snapshot: RefCell::new(None),
                last_activity_query: RefCell::new(None),
                import_count: RefCell::new(0),
                clear_count: RefCell::new(0),
            }
        }
    }

    impl AppStore for FakeStore {
        fn schema_version(&self) -> Result<i64, String> {
            Ok(2)
        }

        fn get_settings(&self) -> Result<AppSettings, String> {
            Ok(self.settings.borrow().clone())
        }

        fn save_settings(&self, settings: SettingsValues) -> Result<AppSettings, String> {
            let updated = AppSettings {
                startup_page: settings.startup_page,
                language: settings.language,
                compact_mode: settings.compact_mode,
                activity_limit: settings.activity_limit,
                auto_accept_enabled: settings.auto_accept_enabled,
                auto_pick_enabled: settings.auto_pick_enabled,
                auto_pick_champion_id: settings.auto_pick_champion_id,
                auto_ban_enabled: settings.auto_ban_enabled,
                auto_ban_champion_id: settings.auto_ban_champion_id,
                updated_at: "2026-04-18 00:00:00".to_string(),
            };

            self.settings.replace(updated.clone());
            Ok(updated)
        }

        fn list_activity_entries(
            &self,
            limit: i64,
            kind: Option<ActivityKind>,
        ) -> Result<Vec<ActivityEntry>, String> {
            self.last_activity_query.replace(Some((limit, kind)));

            Ok(self
                .activity_entries
                .borrow()
                .iter()
                .filter(|entry| kind.is_none_or(|value| entry.kind == value))
                .take(limit as usize)
                .cloned()
                .collect())
        }

        fn list_all_activity_entries(&self) -> Result<Vec<ActivityEntry>, String> {
            Ok(self.activity_entries.borrow().clone())
        }

        fn create_activity_entry(&self, entry: NewActivityEntry) -> Result<ActivityEntry, String> {
            self.created_entries.borrow_mut().push(entry.clone());

            Ok(ActivityEntry {
                id: self.created_entries.borrow().len() as i64,
                kind: entry.kind,
                title: entry.title,
                body: entry.body,
                created_at: "2026-04-18 00:00:00".to_string(),
            })
        }

        fn import_local_data(
            &self,
            settings: SettingsValues,
            activity_entries: Vec<LocalActivityEntry>,
        ) -> Result<ImportLocalDataResult, String> {
            *self.import_count.borrow_mut() += 1;
            let imported_activity_count = activity_entries.len();
            self.imported_entries.borrow_mut().extend(activity_entries);

            let settings = self.save_settings(settings)?;

            Ok(ImportLocalDataResult {
                settings,
                imported_activity_count,
            })
        }

        fn clear_activity_entries(&self) -> Result<i64, String> {
            *self.clear_count.borrow_mut() += 1;
            let deleted_count = self.activity_entries.borrow().len() as i64;
            self.activity_entries.borrow_mut().clear();
            Ok(deleted_count)
        }

        fn get_player_note(&self, player_puuid: &str) -> Result<Option<StoredPlayerNote>, String> {
            Ok(self
                .player_notes
                .borrow()
                .iter()
                .find(|note| note.player_puuid == player_puuid)
                .cloned())
        }

        fn save_player_note(
            &self,
            note: StoredPlayerNoteInput,
        ) -> Result<StoredPlayerNote, String> {
            let saved = StoredPlayerNote {
                player_puuid: note.player_puuid,
                last_display_name: note.last_display_name,
                note: note.note,
                tags: note.tags,
                updated_at: "2026-04-20 00:00:00".to_string(),
            };
            let mut notes = self.player_notes.borrow_mut();

            if let Some(existing) = notes
                .iter_mut()
                .find(|note| note.player_puuid == saved.player_puuid)
            {
                *existing = saved.clone();
            } else {
                notes.push(saved.clone());
            }

            Ok(saved)
        }

        fn clear_player_note(&self, player_puuid: &str) -> Result<bool, String> {
            let mut notes = self.player_notes.borrow_mut();
            let before = notes.len();
            notes.retain(|note| note.player_puuid != player_puuid);

            Ok(before != notes.len())
        }

        fn latest_ranked_champion_snapshot(
            &self,
        ) -> Result<Option<RankedChampionDataSnapshot>, String> {
            Ok(self.ranked_snapshot.borrow().clone())
        }

        fn replace_ranked_champion_snapshot(
            &self,
            snapshot: RankedChampionDataSnapshot,
        ) -> Result<RankedChampionDataSnapshot, String> {
            self.ranked_snapshot.replace(Some(snapshot.clone()));
            Ok(snapshot)
        }
    }

    struct FakeRankedChampionProvider {
        snapshot: RankedChampionDataSnapshot,
    }

    impl RankedChampionDataProvider for FakeRankedChampionProvider {
        fn fetch_ranked_champion_snapshot(
            &self,
            _input: RankedChampionRefreshInput,
        ) -> Result<RankedChampionDataSnapshot, RankedChampionDataError> {
            Ok(self.snapshot.clone())
        }
    }

    struct FailingRankedChampionProvider;

    impl RankedChampionDataProvider for FailingRankedChampionProvider {
        fn fetch_ranked_champion_snapshot(
            &self,
            _input: RankedChampionRefreshInput,
        ) -> Result<RankedChampionDataSnapshot, RankedChampionDataError> {
            Err(RankedChampionDataError::Unavailable(
                "remote unavailable".to_string(),
            ))
        }
    }

    fn default_settings() -> AppSettings {
        AppSettings {
            startup_page: StartupPage::Dashboard,
            language: AppLanguagePreference::System,
            compact_mode: false,
            activity_limit: 100,
            auto_accept_enabled: true,
            auto_pick_enabled: false,
            auto_pick_champion_id: None,
            auto_ban_enabled: false,
            auto_ban_champion_id: None,
            updated_at: "2026-04-18 00:00:00".to_string(),
        }
    }

    fn sample_activity(id: i64) -> ActivityEntry {
        ActivityEntry {
            id,
            kind: ActivityKind::Note,
            title: format!("Activity {id}"),
            body: None,
            created_at: "2026-04-18 00:00:00".to_string(),
        }
    }

    fn sample_ranked_snapshot(source: &str) -> RankedChampionDataSnapshot {
        RankedChampionDataSnapshot {
            source: source.to_string(),
            patch: Some("26.08".to_string()),
            region: Some("KR".to_string()),
            queue: Some("RANKED_SOLO_5X5".to_string()),
            tier: Some("EMERALD_PLUS".to_string()),
            generated_at: Some("2026-04-25T00:00:00Z".to_string()),
            imported_at: "2026-04-25 00:00:00".to_string(),
            records: vec![
                RankedChampionStat {
                    champion_id: 103,
                    champion_name: "Ahri".to_string(),
                    champion_alias: Some("Ahri".to_string()),
                    lane: RankedChampionLane::Middle,
                    win_rate: 51.4,
                    pick_rate: 10.0,
                    ban_rate: 8.0,
                    overall_score: 90.0,
                    games: 1000,
                    wins: 514,
                    picks: 1000,
                    bans: 80,
                },
                RankedChampionStat {
                    champion_id: 222,
                    champion_name: "Jinx".to_string(),
                    champion_alias: Some("Jinx".to_string()),
                    lane: RankedChampionLane::Bottom,
                    win_rate: 52.1,
                    pick_rate: 12.0,
                    ban_rate: 6.0,
                    overall_score: 88.0,
                    games: 1200,
                    wins: 625,
                    picks: 1200,
                    bans: 72,
                },
            ],
        }
    }

    struct FakeLeagueClientReader {
        champ_select_session: ChampSelectSessionData,
        data: LeagueSelfData,
        completed_match: Mutex<Option<LeagueCompletedMatch>>,
        failed_recent_puuids: Vec<String>,
        gameflow_phase: Mutex<String>,
        last_match_limit: Mutex<Option<i64>>,
        ready_check_accepts: Mutex<i64>,
        ready_check_clears_after: Option<i64>,
        ready_check_next_phase: String,
        ready_check_accept_error: Option<LeagueClientReadError>,
        recent_stats_batch_calls: Mutex<Vec<Vec<String>>>,
        summoners_by_id: Vec<SummonerBatchEntry>,
        summoners_by_name: Vec<SummonerBatchEntry>,
    }

    impl FakeLeagueClientReader {
        fn new(recent_matches: Vec<RecentMatchSummary>) -> Self {
            Self::with_data(LeagueSelfData {
                status: connected_status(),
                summoner: None,
                ranked_queues: Vec::new(),
                recent_matches,
                data_warnings: Vec::new(),
            })
        }

        fn with_data(data: LeagueSelfData) -> Self {
            Self {
                champ_select_session: ChampSelectSessionData {
                    ally_ids: Vec::new(),
                    enemy_ids: Vec::new(),
                    champion_selections: HashMap::new(),
                    ally_names: Vec::new(),
                    enemy_names: Vec::new(),
                    champion_selections_by_name: HashMap::new(),
                },
                data,
                completed_match: Mutex::new(None),
                failed_recent_puuids: Vec::new(),
                gameflow_phase: Mutex::new("None".to_string()),
                last_match_limit: Mutex::new(None),
                ready_check_accepts: Mutex::new(0),
                ready_check_clears_after: None,
                ready_check_next_phase: "ChampSelect".to_string(),
                ready_check_accept_error: None,
                recent_stats_batch_calls: Mutex::new(Vec::new()),
                summoners_by_id: Vec::new(),
                summoners_by_name: Vec::new(),
            }
        }

        fn with_completed_match(completed_match: LeagueCompletedMatch) -> Self {
            Self {
                champ_select_session: ChampSelectSessionData {
                    ally_ids: Vec::new(),
                    enemy_ids: Vec::new(),
                    champion_selections: HashMap::new(),
                    ally_names: Vec::new(),
                    enemy_names: Vec::new(),
                    champion_selections_by_name: HashMap::new(),
                },
                data: LeagueSelfData {
                    status: connected_status(),
                    summoner: None,
                    ranked_queues: Vec::new(),
                    recent_matches: Vec::new(),
                    data_warnings: Vec::new(),
                },
                completed_match: Mutex::new(Some(completed_match)),
                failed_recent_puuids: Vec::new(),
                gameflow_phase: Mutex::new("None".to_string()),
                last_match_limit: Mutex::new(None),
                ready_check_accepts: Mutex::new(0),
                ready_check_clears_after: None,
                ready_check_next_phase: "ChampSelect".to_string(),
                ready_check_accept_error: None,
                recent_stats_batch_calls: Mutex::new(Vec::new()),
                summoners_by_id: Vec::new(),
                summoners_by_name: Vec::new(),
            }
        }

        fn with_champ_select_data(
            champ_select_session: ChampSelectSessionData,
            summoners_by_id: Vec<SummonerBatchEntry>,
            failed_recent_puuids: Vec<String>,
        ) -> Self {
            let mut reader = Self::new(Vec::new());
            reader.champ_select_session = champ_select_session;
            reader.summoners_by_id = summoners_by_id;
            reader.failed_recent_puuids = failed_recent_puuids;
            reader
        }

        fn with_ready_check_phase(self) -> Self {
            *self.gameflow_phase.lock().unwrap() = "ReadyCheck".to_string();
            self
        }

        fn with_phase_transition_after_accepts(mut self, accepts: i64, next_phase: &str) -> Self {
            *self.gameflow_phase.lock().unwrap() = "ReadyCheck".to_string();
            self.ready_check_clears_after = Some(accepts);
            self.ready_check_next_phase = next_phase.to_string();
            if accepts <= 0 {
                *self.gameflow_phase.lock().unwrap() = next_phase.to_string();
            }
            self
        }

        fn with_ready_check_accept_error(mut self, error: LeagueClientReadError) -> Self {
            *self.gameflow_phase.lock().unwrap() = "ReadyCheck".to_string();
            self.ready_check_accept_error = Some(error);
            self
        }

        fn accept_ready_check_count(&self) -> i64 {
            *self.ready_check_accepts.lock().unwrap()
        }

        fn recent_stats_batch_calls(&self) -> Vec<Vec<String>> {
            self.recent_stats_batch_calls.lock().unwrap().clone()
        }
    }

    impl LeagueClientReader for FakeLeagueClientReader {
        fn status(&self) -> Result<LeagueClientStatus, LeagueClientReadError> {
            Ok(self.data.status.clone())
        }

        fn gameflow_phase(&self) -> Result<String, LeagueClientReadError> {
            Ok(self.gameflow_phase.lock().unwrap().clone())
        }

        fn self_data(&self, match_limit: i64) -> Result<LeagueSelfData, LeagueClientReadError> {
            *self.last_match_limit.lock().unwrap() = Some(match_limit);

            Ok(LeagueSelfData {
                status: self.data.status.clone(),
                summoner: self.data.summoner.clone(),
                ranked_queues: self.data.ranked_queues.clone(),
                recent_matches: self
                    .data
                    .recent_matches
                    .iter()
                    .take(match_limit as usize)
                    .cloned()
                    .collect(),
                data_warnings: self.data.data_warnings.clone(),
            })
        }

        fn profile_icon(
            &self,
            profile_icon_id: i64,
        ) -> Result<LeagueImageAsset, LeagueClientReadError> {
            Ok(LeagueImageAsset {
                mime_type: "image/jpeg".to_string(),
                bytes: vec![profile_icon_id as u8],
            })
        }

        fn champion_icon(
            &self,
            champion_id: i64,
        ) -> Result<LeagueImageAsset, LeagueClientReadError> {
            Ok(LeagueImageAsset {
                mime_type: "image/png".to_string(),
                bytes: vec![champion_id as u8],
            })
        }

        fn game_asset(
            &self,
            kind: LeagueGameAssetKind,
            asset_id: i64,
        ) -> Result<LeagueGameAsset, LeagueClientReadError> {
            Ok(LeagueGameAsset {
                kind,
                asset_id,
                name: format!("{kind:?} {asset_id}"),
                description: Some("Local game data asset".to_string()),
                image: LeagueImageAsset {
                    mime_type: "image/png".to_string(),
                    bytes: vec![asset_id as u8],
                },
            })
        }

        fn completed_match(
            &self,
            game_id: i64,
        ) -> Result<LeagueCompletedMatch, LeagueClientReadError> {
            self.completed_match
                .lock()
                .unwrap()
                .clone()
                .filter(|completed_match| completed_match.game_id == game_id)
                .ok_or_else(|| {
                    LeagueClientReadError::Integration(
                        "Completed match was not found in current user's recent history"
                            .to_string(),
                    )
                })
        }

        fn participant_recent_stats(
            &self,
            player_puuid: &str,
            limit: i64,
        ) -> Result<ParticipantRecentStats, LeagueClientReadError> {
            if self
                .failed_recent_puuids
                .iter()
                .any(|value| value == player_puuid)
            {
                return Err(LeagueClientReadError::Integration(
                    "Recent stats unavailable".to_string(),
                ));
            }

            let recent_matches = (1..=limit)
                .map(|id| sample_match(id, format!("Recent Champion {id}").as_str(), 5, 2, 7))
                .collect();

            Ok(ParticipantRecentStats {
                match_count: limit as usize,
                average_kda: Some(3.5),
                recent_champions: vec!["Ahri".to_string()],
                recent_matches,
            })
        }

        fn participant_recent_stats_batch(
            &self,
            player_puuids: &[String],
            limit: i64,
        ) -> HashMap<String, Result<ParticipantRecentStats, LeagueClientReadError>> {
            self.recent_stats_batch_calls
                .lock()
                .unwrap()
                .push(player_puuids.to_vec());

            player_puuids
                .iter()
                .map(|player_puuid| {
                    (
                        player_puuid.clone(),
                        self.participant_recent_stats(player_puuid, limit),
                    )
                })
                .collect()
        }

        fn champ_select_session(&self) -> Result<ChampSelectSessionData, LeagueClientReadError> {
            Ok(self.champ_select_session.clone())
        }

        fn summoners_by_ids(&self, ids: &[i64]) -> Vec<SummonerBatchEntry> {
            self.summoners_by_id
                .iter()
                .filter(|entry| ids.contains(&entry.summoner_id))
                .cloned()
                .collect()
        }

        fn summoners_by_names(&self, names: &[String]) -> Vec<SummonerBatchEntry> {
            let normalized_names: HashSet<String> = names
                .iter()
                .map(|name| normalize_player_name(name.as_str()))
                .collect();
            self.summoners_by_name
                .iter()
                .filter(|entry| {
                    normalized_names.contains(&normalize_player_name(entry.display_name.as_str()))
                })
                .cloned()
                .collect()
        }

        fn champion_catalog(&self) -> Result<Vec<LeagueChampionSummary>, LeagueClientReadError> {
            Ok(vec![LeagueChampionSummary {
                champion_id: 103,
                champion_name: "Ahri".to_string(),
            }])
        }

        fn champion_details(
            &self,
            champion_id: i64,
        ) -> Result<LeagueChampionDetails, LeagueClientReadError> {
            Ok(LeagueChampionDetails {
                champion_id,
                champion_name: "Ahri".to_string(),
                title: Some("the Nine-Tailed Fox".to_string()),
                square_portrait: Some(LeagueImageAsset {
                    mime_type: "image/png".to_string(),
                    bytes: vec![champion_id as u8],
                }),
                abilities: vec![domain::LeagueChampionAbility {
                    slot: "Q".to_string(),
                    name: "Orb of Deception".to_string(),
                    description: "Ahri sends out and pulls back her orb.".to_string(),
                    icon: Some(LeagueImageAsset {
                        mime_type: "image/png".to_string(),
                        bytes: vec![1],
                    }),
                    cooldown: Some("7".to_string()),
                    cost: Some("55".to_string()),
                    range: Some("880".to_string()),
                }],
            })
        }

        fn accept_ready_check(&self) -> Result<(), LeagueClientReadError> {
            let mut accept_count = self.ready_check_accepts.lock().unwrap();
            *accept_count += 1;

            if let Some(target_accepts) = self.ready_check_clears_after {
                if *accept_count >= target_accepts {
                    *self.gameflow_phase.lock().unwrap() = self.ready_check_next_phase.clone();
                }
            }

            if let Some(error) = &self.ready_check_accept_error {
                return Err(error.clone());
            }

            Ok(())
        }

        fn apply_champ_select_preferences(
            &self,
            _pick_champion_id: Option<i64>,
            _ban_champion_id: Option<i64>,
        ) -> Result<(), LeagueClientReadError> {
            Ok(())
        }
    }

    fn connected_status() -> LeagueClientStatus {
        LeagueClientStatus {
            is_running: true,
            lockfile_found: true,
            connection: LeagueClientConnection::Connected,
            phase: LeagueClientPhase::Connected,
            message: None,
        }
    }

    fn high_kda_match(id: i64) -> RecentMatchSummary {
        sample_match(id, format!("Champion {id}").as_str(), 6, 1, 4)
    }

    fn sample_match(
        game_id: i64,
        champion_name: &str,
        kills: i64,
        deaths: i64,
        assists: i64,
    ) -> RecentMatchSummary {
        RecentMatchSummary {
            game_id,
            champion_id: Some(game_id),
            champion_name: champion_name.to_string(),
            queue_name: Some("Ranked Solo/Duo".to_string()),
            result: MatchResult::Win,
            kills,
            deaths,
            assists,
            kda: None,
            played_at: Some("2026-04-19T12:00:00Z".to_string()),
            game_duration_seconds: Some(1800),
        }
    }

    fn sample_completed_match() -> LeagueCompletedMatch {
        LeagueCompletedMatch {
            game_id: 10,
            queue_name: Some("Ranked Solo/Duo".to_string()),
            played_at: Some("2026-04-19T12:00:00Z".to_string()),
            game_duration_seconds: Some(1880),
            result: MatchResult::Win,
            participants: vec![
                LeagueCompletedParticipant {
                    participant_id: 1,
                    team_id: 100,
                    display_name: "Player One".to_string(),
                    player_puuid: Some("self-puuid".to_string()),
                    profile_icon_id: Some(1),
                    champion_id: Some(103),
                    champion_name: "Ahri".to_string(),
                    role: Some("SOLO".to_string()),
                    lane: Some("MIDDLE".to_string()),
                    result: MatchResult::Win,
                    kills: 7,
                    deaths: 1,
                    assists: 8,
                    kda: Some(15.0),
                    cs: 210,
                    gold_earned: 12_000,
                    damage_to_champions: 22_000,
                    vision_score: 18,
                    items: vec![1056, 3020],
                    runes: vec![8112],
                    spells: vec![4, 14],
                },
                LeagueCompletedParticipant {
                    participant_id: 2,
                    team_id: 200,
                    display_name: "Player Two".to_string(),
                    player_puuid: Some("enemy-puuid".to_string()),
                    profile_icon_id: Some(2),
                    champion_id: Some(266),
                    champion_name: "Aatrox".to_string(),
                    role: Some("SOLO".to_string()),
                    lane: Some("TOP".to_string()),
                    result: MatchResult::Loss,
                    kills: 5,
                    deaths: 7,
                    assists: 4,
                    kda: Some(1.3),
                    cs: 180,
                    gold_earned: 10_000,
                    damage_to_champions: 25_000,
                    vision_score: 12,
                    items: vec![1055, 3047],
                    runes: vec![8010],
                    spells: vec![4, 12],
                },
            ],
        }
    }
}
