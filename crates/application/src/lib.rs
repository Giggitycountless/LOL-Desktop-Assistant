use std::{
    error::Error,
    fmt,
    time::{SystemTime, UNIX_EPOCH},
};

use domain::{
    ActivityEntry, ActivityKind, AppSettings, AppSnapshot, ClearActivityResult, DatabaseStatus,
    HealthReport, ImportLocalDataResult, KdaTag, LeagueClientStatus, LeagueImageAsset,
    LeagueSelfData, LeagueSelfSnapshot, LocalActivityEntry, LocalDataExport, NewActivityEntry,
    RecentChampionSummary, RecentMatchSummary, RecentPerformanceSummary, ServiceStatus,
    SettingsValues, StartupPage,
};

const LOCAL_DATA_FORMAT_VERSION: i64 = 1;
const MIN_ACTIVITY_LIMIT: i64 = 1;
const MAX_ACTIVITY_LIMIT: i64 = 500;
const DEFAULT_ACTIVITY_LIMIT: i64 = 100;
const MAX_ACTIVITY_TITLE_LEN: usize = 120;
const MAX_ACTIVITY_BODY_LEN: usize = 4_000;
const DEFAULT_MATCH_LIMIT: i64 = 6;
const MAX_MATCH_LIMIT: i64 = 20;
const PERFORMANCE_MATCH_COUNT: usize = 6;
const HIGH_KDA_THRESHOLD: f64 = 9.0;
const MAX_LEAGUE_ASSET_ID: i64 = 1_000_000;

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
}

pub trait LeagueClientReader {
    fn status(&self) -> Result<LeagueClientStatus, LeagueClientReadError>;
    fn self_data(&self, match_limit: i64) -> Result<LeagueSelfData, LeagueClientReadError>;
    fn profile_icon(&self, profile_icon_id: i64)
        -> Result<LeagueImageAsset, LeagueClientReadError>;
    fn champion_icon(&self, champion_id: i64) -> Result<LeagueImageAsset, LeagueClientReadError>;
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsInput {
    pub startup_page: String,
    pub compact_mode: bool,
    pub activity_limit: i64,
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
pub struct LeagueProfileIconInput {
    pub profile_icon_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeagueChampionIconInput {
    pub champion_id: i64,
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
        compact_mode: false,
        activity_limit: DEFAULT_ACTIVITY_LIMIT,
    }
}

pub fn app_snapshot(store: &impl AppStore) -> Result<AppSnapshot, ApplicationError> {
    let schema_version = store.schema_version().map_err(ApplicationError::Storage)?;
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
    store.get_settings().map_err(ApplicationError::Storage)
}

pub fn save_settings(
    store: &impl AppStore,
    input: SettingsInput,
) -> Result<AppSettings, ApplicationError> {
    let next_settings = validate_settings(input)?;
    let current_settings = store.get_settings().map_err(ApplicationError::Storage)?;

    if current_settings.values() == next_settings {
        return Ok(current_settings);
    }

    let saved_settings = store
        .save_settings(next_settings)
        .map_err(ApplicationError::Storage)?;

    store
        .create_activity_entry(NewActivityEntry {
            kind: ActivityKind::Settings,
            title: "Settings updated".to_string(),
            body: Some("Application preferences changed".to_string()),
        })
        .map_err(ApplicationError::Storage)?;

    Ok(saved_settings)
}

pub fn list_activity_entries(
    store: &impl AppStore,
    input: ActivityListInput,
) -> Result<ActivityEntries, ApplicationError> {
    let limit = normalize_activity_limit(input.limit.unwrap_or(DEFAULT_ACTIVITY_LIMIT))?;
    let records = store
        .list_activity_entries(limit, input.kind)
        .map_err(ApplicationError::Storage)?;

    Ok(ActivityEntries { records })
}

pub fn create_activity_note(
    store: &impl AppStore,
    input: ActivityNoteInput,
) -> Result<ActivityEntry, ApplicationError> {
    let entry = validate_activity_note(input)?;

    store
        .create_activity_entry(entry)
        .map_err(ApplicationError::Storage)
}

pub fn export_local_data(store: &impl AppStore) -> Result<LocalDataExport, ApplicationError> {
    let settings = store
        .get_settings()
        .map_err(ApplicationError::Storage)?
        .values();
    let activity_entries = store
        .list_all_activity_entries()
        .map_err(ApplicationError::Storage)?
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
        .map_err(ApplicationError::Storage)
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
        .map_err(ApplicationError::Storage)?;

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

fn validate_settings(input: SettingsInput) -> Result<SettingsValues, ApplicationError> {
    let startup_page = StartupPage::parse(input.startup_page.as_str()).ok_or_else(|| {
        ApplicationError::Validation("Startup page must be dashboard, activity, or settings".into())
    })?;

    let values = SettingsValues {
        startup_page,
        compact_mode: input.compact_mode,
        activity_limit: input.activity_limit,
    };

    validate_settings_values(&values)?;
    Ok(values)
}

fn validate_settings_values(settings: &SettingsValues) -> Result<(), ApplicationError> {
    normalize_activity_limit(settings.activity_limit)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use domain::{
        LeagueClientConnection, LeagueClientPhase, LeagueDataSection, LeagueDataWarning,
        MatchResult,
    };
    use std::cell::RefCell;

    #[test]
    fn save_settings_does_not_log_activity_when_values_are_unchanged() {
        let store = FakeStore::new(default_settings());

        let result = save_settings(
            &store,
            SettingsInput {
                startup_page: "dashboard".to_string(),
                compact_mode: false,
                activity_limit: 100,
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
                compact_mode: true,
                activity_limit: 50,
            },
        )
        .expect("settings save succeeds");

        assert_eq!(result.startup_page, StartupPage::Activity);
        assert_eq!(result.activity_limit, 50);
        assert_eq!(store.created_entries.borrow().len(), 1);
        assert_eq!(
            store.created_entries.borrow()[0].kind,
            ActivityKind::Settings
        );
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

        assert_eq!(*reader.last_match_limit.borrow(), Some(6));
        assert_eq!(result.recent_matches.len(), 6);
        assert_eq!(result.recent_performance.match_count, 6);
        assert_eq!(result.recent_performance.average_kda, Some(10.0));
        assert_eq!(result.recent_performance.kda_tag, KdaTag::High);
        assert_eq!(result.recent_performance.recent_champions.len(), 6);
        assert_eq!(result.recent_performance.top_champions.len(), 3);
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
        assert_eq!(*reader.last_match_limit.borrow(), None);
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

    struct FakeStore {
        settings: RefCell<AppSettings>,
        activity_entries: RefCell<Vec<ActivityEntry>>,
        created_entries: RefCell<Vec<NewActivityEntry>>,
        imported_entries: RefCell<Vec<LocalActivityEntry>>,
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
                compact_mode: settings.compact_mode,
                activity_limit: settings.activity_limit,
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
    }

    fn default_settings() -> AppSettings {
        AppSettings {
            startup_page: StartupPage::Dashboard,
            compact_mode: false,
            activity_limit: 100,
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

    struct FakeLeagueClientReader {
        data: LeagueSelfData,
        last_match_limit: RefCell<Option<i64>>,
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
                data,
                last_match_limit: RefCell::new(None),
            }
        }
    }

    impl LeagueClientReader for FakeLeagueClientReader {
        fn status(&self) -> Result<LeagueClientStatus, LeagueClientReadError> {
            Ok(self.data.status.clone())
        }

        fn self_data(&self, match_limit: i64) -> Result<LeagueSelfData, LeagueClientReadError> {
            self.last_match_limit.replace(Some(match_limit));

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
}
