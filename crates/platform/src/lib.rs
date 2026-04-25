use std::{
    collections::HashMap,
    error::Error,
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};

use adapters::{LocalLeagueClient, RemoteRankedChampionJsonProvider};
use application::{
    ActivityListInput, ActivityNoteInput, ApplicationError, LeagueChampionDetailsInput,
    LeagueChampionIconInput, LeagueClientReadError, LeagueClientReader, LeagueGameAssetInput,
    LeagueProfileIconInput, LeagueSelfSnapshotInput, ParticipantPublicProfileInput,
    PostMatchDetailInput, RankedChampionRefreshInput, RankedChampionStatsInput, SettingsInput,
};
use domain::{
    ActivityEntry, ActivityKind, AppSettings, AppSnapshot, ClearActivityResult,
    ClearPlayerNoteResult, DatabaseStatus, HealthReport, ImportLocalDataResult,
    LeagueChampionDetails, LeagueChampionSummary, LeagueClientStatus, LeagueGameAsset,
    LeagueGameAssetKind, LeagueImageAsset, LeagueSelfData, LeagueSelfSnapshot, LocalDataExport,
    ParticipantPublicProfile, ParticipantRecentStats, PlayerNoteView, PostMatchDetail,
    RankedChampionLane, RankedChampionSort, RankedChampionStatsResponse, SettingsValues,
};
use serde::{Deserialize, Serialize};
use storage::SqliteStore;
use tauri::{Manager, Runtime};

const DEFAULT_RANKED_CHAMPION_DATA_URL: &str = "https://raw.githubusercontent.com/Giggitycountless/LOL-Desktop-Assistant/main/data/ranked-champions/latest.json";
const CHAMP_SELECT_CACHE_TTL: Duration = Duration::from_secs(8);
const RECENT_STATS_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const RECENT_STATS_FAILURE_CACHE_TTL: Duration = Duration::from_secs(30);
const SUMMONER_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const SUMMONER_FAILURE_CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
pub struct ChampSelectCacheEntry {
    snapshot: domain::ChampSelectSnapshot,
    cached_at: Instant,
}

#[derive(Debug, Clone)]
pub struct RecentStatsCacheEntry {
    result: Result<ParticipantRecentStats, LeagueClientReadError>,
    cached_at: Instant,
}

#[derive(Debug, Clone)]
pub struct SummonerCacheEntry {
    entry: Option<application::SummonerBatchEntry>,
    cached_at: Instant,
}

#[derive(Debug)]
pub struct AppState {
    store: SqliteStore,
    league_client: LocalLeagueClient,
    ranked_champion_provider: RemoteRankedChampionJsonProvider,
    pub champ_select_cache: Mutex<Option<ChampSelectCacheEntry>>,
    pub recent_stats_cache: Mutex<HashMap<String, RecentStatsCacheEntry>>,
    pub summoner_id_cache: Mutex<HashMap<i64, SummonerCacheEntry>>,
    pub summoner_name_cache: Mutex<HashMap<String, SummonerCacheEntry>>,
}

impl AppState {
    pub fn initialize(data_dir: impl AsRef<Path>) -> Result<Self, storage::StorageError> {
        Ok(Self {
            store: SqliteStore::initialize(data_dir)?,
            league_client: LocalLeagueClient::new(),
            ranked_champion_provider: RemoteRankedChampionJsonProvider::new(
                DEFAULT_RANKED_CHAMPION_DATA_URL,
            ),
            champ_select_cache: Mutex::new(None),
            recent_stats_cache: Mutex::new(HashMap::new()),
            summoner_id_cache: Mutex::new(HashMap::new()),
            summoner_name_cache: Mutex::new(HashMap::new()),
        })
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            store: self.store.clone(),
            league_client: self.league_client.clone(),
            ranked_champion_provider: self.ranked_champion_provider.clone(),
            champ_select_cache: Mutex::new(self.champ_select_cache.lock().unwrap().clone()),
            recent_stats_cache: Mutex::new(self.recent_stats_cache.lock().unwrap().clone()),
            summoner_id_cache: Mutex::new(self.summoner_id_cache.lock().unwrap().clone()),
            summoner_name_cache: Mutex::new(self.summoner_name_cache.lock().unwrap().clone()),
        }
    }
}

struct CachedLeagueClientReader<'a> {
    inner: &'a LocalLeagueClient,
    recent_stats_cache: &'a Mutex<HashMap<String, RecentStatsCacheEntry>>,
    summoner_id_cache: &'a Mutex<HashMap<i64, SummonerCacheEntry>>,
    summoner_name_cache: &'a Mutex<HashMap<String, SummonerCacheEntry>>,
}

impl LeagueClientReader for CachedLeagueClientReader<'_> {
    fn status(&self) -> Result<LeagueClientStatus, LeagueClientReadError> {
        self.inner.status()
    }

    fn self_data(&self, match_limit: i64) -> Result<LeagueSelfData, LeagueClientReadError> {
        self.inner.self_data(match_limit)
    }

    fn profile_icon(
        &self,
        profile_icon_id: i64,
    ) -> Result<LeagueImageAsset, LeagueClientReadError> {
        self.inner.profile_icon(profile_icon_id)
    }

    fn champion_icon(&self, champion_id: i64) -> Result<LeagueImageAsset, LeagueClientReadError> {
        self.inner.champion_icon(champion_id)
    }

    fn game_asset(
        &self,
        kind: LeagueGameAssetKind,
        asset_id: i64,
    ) -> Result<LeagueGameAsset, LeagueClientReadError> {
        self.inner.game_asset(kind, asset_id)
    }

    fn completed_match(
        &self,
        game_id: i64,
    ) -> Result<application::LeagueCompletedMatch, LeagueClientReadError> {
        self.inner.completed_match(game_id)
    }

    fn participant_recent_stats(
        &self,
        player_puuid: &str,
        limit: i64,
    ) -> Result<ParticipantRecentStats, LeagueClientReadError> {
        let cache_key = format!("{player_puuid}:{limit}");
        if let Some(result) = self
            .recent_stats_cache
            .lock()
            .unwrap()
            .get(cache_key.as_str())
            .filter(|entry| {
                let ttl = if entry.result.is_ok() {
                    RECENT_STATS_CACHE_TTL
                } else {
                    RECENT_STATS_FAILURE_CACHE_TTL
                };
                entry.cached_at.elapsed() < ttl
            })
            .map(|entry| entry.result.clone())
        {
            return result;
        }

        let result = self.inner.participant_recent_stats(player_puuid, limit);
        self.recent_stats_cache.lock().unwrap().insert(
            cache_key,
            RecentStatsCacheEntry {
                result: result.clone(),
                cached_at: Instant::now(),
            },
        );

        result
    }

    fn champ_select_session(
        &self,
    ) -> Result<application::ChampSelectSessionData, LeagueClientReadError> {
        self.inner.champ_select_session()
    }

    fn summoners_by_ids(&self, ids: &[i64]) -> Vec<application::SummonerBatchEntry> {
        let mut entries = Vec::new();
        let mut missing_ids = Vec::new();

        {
            let cache = self.summoner_id_cache.lock().unwrap();
            for id in ids {
                match cache.get(id).filter(|entry| summoner_cache_is_fresh(entry)) {
                    Some(entry) => {
                        if let Some(summoner) = &entry.entry {
                            entries.push(summoner.clone());
                        }
                    }
                    None => missing_ids.push(*id),
                }
            }
        }

        if missing_ids.is_empty() {
            return entries;
        }

        let fetched = self.inner.summoners_by_ids(&missing_ids);
        let fetched_by_id: HashMap<i64, application::SummonerBatchEntry> = fetched
            .iter()
            .cloned()
            .map(|entry| (entry.summoner_id, entry))
            .collect();

        {
            let mut cache = self.summoner_id_cache.lock().unwrap();
            let mut name_cache = self.summoner_name_cache.lock().unwrap();
            for id in missing_ids {
                let entry = fetched_by_id.get(&id).cloned();
                if let Some(summoner) = &entry {
                    name_cache.insert(
                        normalize_player_name(summoner.display_name.as_str()),
                        SummonerCacheEntry {
                            entry: Some(summoner.clone()),
                            cached_at: Instant::now(),
                        },
                    );
                    entries.push(summoner.clone());
                }
                cache.insert(
                    id,
                    SummonerCacheEntry {
                        entry,
                        cached_at: Instant::now(),
                    },
                );
            }
        }

        entries
    }

    fn summoners_by_names(&self, names: &[String]) -> Vec<application::SummonerBatchEntry> {
        let mut entries = Vec::new();
        let mut missing_names = Vec::new();

        {
            let cache = self.summoner_name_cache.lock().unwrap();
            for name in names {
                let normalized_name = normalize_player_name(name.as_str());
                if normalized_name.is_empty() {
                    continue;
                }

                match cache
                    .get(normalized_name.as_str())
                    .filter(|entry| summoner_cache_is_fresh(entry))
                {
                    Some(entry) => {
                        if let Some(summoner) = &entry.entry {
                            entries.push(summoner.clone());
                        }
                    }
                    None => missing_names.push(name.clone()),
                }
            }
        }

        if missing_names.is_empty() {
            return entries;
        }

        let fetched = self.inner.summoners_by_names(&missing_names);
        let fetched_by_name: HashMap<String, application::SummonerBatchEntry> = fetched
            .iter()
            .cloned()
            .map(|entry| (normalize_player_name(entry.display_name.as_str()), entry))
            .collect();

        {
            let mut name_cache = self.summoner_name_cache.lock().unwrap();
            let mut id_cache = self.summoner_id_cache.lock().unwrap();
            for name in missing_names {
                let normalized_name = normalize_player_name(name.as_str());
                let entry = fetched_by_name.get(normalized_name.as_str()).cloned();
                if let Some(summoner) = &entry {
                    id_cache.insert(
                        summoner.summoner_id,
                        SummonerCacheEntry {
                            entry: Some(summoner.clone()),
                            cached_at: Instant::now(),
                        },
                    );
                    entries.push(summoner.clone());
                }
                name_cache.insert(
                    normalized_name,
                    SummonerCacheEntry {
                        entry,
                        cached_at: Instant::now(),
                    },
                );
            }
        }

        entries
    }

    fn champion_catalog(&self) -> Result<Vec<LeagueChampionSummary>, LeagueClientReadError> {
        self.inner.champion_catalog()
    }

    fn champion_details(
        &self,
        champion_id: i64,
    ) -> Result<LeagueChampionDetails, LeagueClientReadError> {
        self.inner.champion_details(champion_id)
    }

    fn accept_ready_check(&self) -> Result<(), LeagueClientReadError> {
        self.inner.accept_ready_check()
    }

    fn apply_champ_select_preferences(
        &self,
        pick_champion_id: Option<i64>,
        ban_champion_id: Option<i64>,
    ) -> Result<(), LeagueClientReadError> {
        self.inner
            .apply_champ_select_preferences(pick_champion_id, ban_champion_id)
    }
}

fn summoner_cache_is_fresh(entry: &SummonerCacheEntry) -> bool {
    let ttl = if entry.entry.is_some() {
        SUMMONER_CACHE_TTL
    } else {
        SUMMONER_FAILURE_CACHE_TTL
    };

    entry.cached_at.elapsed() < ttl
}

fn normalize_player_name(value: &str) -> String {
    value.trim().to_ascii_lowercase()
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
    pub language: String,
    pub compact_mode: bool,
    pub activity_limit: i64,
    pub auto_accept_enabled: bool,
    pub auto_pick_enabled: bool,
    pub auto_pick_champion_id: Option<i64>,
    pub auto_ban_enabled: bool,
    pub auto_ban_champion_id: Option<i64>,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampSelectSnapshotCommand {
    pub recent_limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedChampionStatsCommand {
    pub lane: Option<RankedChampionLane>,
    pub sort_by: Option<RankedChampionSort>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRankedChampionStatsCommand {
    pub url: Option<String>,
    pub lane: Option<RankedChampionLane>,
    pub sort_by: Option<RankedChampionSort>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueProfileIconCommand {
    pub profile_icon_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueChampionIconCommand {
    pub champion_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueChampionDetailsCommand {
    pub champion_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueGameAssetCommand {
    pub kind: LeagueGameAssetKind,
    pub asset_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostMatchDetailCommand {
    pub game_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantPublicProfileCommand {
    pub game_id: i64,
    pub participant_id: i64,
    pub recent_limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlayerNoteCommand {
    pub game_id: i64,
    pub participant_id: i64,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearPlayerNoteCommand {
    pub game_id: i64,
    pub participant_id: i64,
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
            language: command.settings.language,
            compact_mode: command.settings.compact_mode,
            activity_limit: command.settings.activity_limit,
            auto_accept_enabled: command.settings.auto_accept_enabled,
            auto_pick_enabled: command.settings.auto_pick_enabled,
            auto_pick_champion_id: command.settings.auto_pick_champion_id,
            auto_ban_enabled: command.settings.auto_ban_enabled,
            auto_ban_champion_id: command.settings.auto_ban_champion_id,
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

pub fn get_league_champion_catalog(
    state: &AppState,
) -> Result<Vec<LeagueChampionSummary>, CommandError> {
    application::get_league_champion_catalog(&state.league_client).map_err(CommandError::from)
}

pub fn run_lobby_automation(state: &AppState) -> Result<(), CommandError> {
    application::run_lobby_automation(&state.store, &state.league_client)
        .map_err(CommandError::from)
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

pub fn get_champ_select_snapshot(
    state: &AppState,
    command: ChampSelectSnapshotCommand,
) -> Result<domain::ChampSelectSnapshot, CommandError> {
    if let Some(snapshot) = state
        .champ_select_cache
        .lock()
        .unwrap()
        .as_ref()
        .filter(|entry| entry.cached_at.elapsed() < CHAMP_SELECT_CACHE_TTL)
        .map(|entry| entry.snapshot.clone())
    {
        return Ok(snapshot);
    }

    let recent_limit = command.recent_limit.unwrap_or(6);
    let cached_reader = CachedLeagueClientReader {
        inner: &state.league_client,
        recent_stats_cache: &state.recent_stats_cache,
        summoner_id_cache: &state.summoner_id_cache,
        summoner_name_cache: &state.summoner_name_cache,
    };
    let snapshot = application::get_champ_select_snapshot(&cached_reader, recent_limit)?;
    *state.champ_select_cache.lock().unwrap() = Some(ChampSelectCacheEntry {
        snapshot: snapshot.clone(),
        cached_at: Instant::now(),
    });

    Ok(snapshot)
}

pub fn get_ranked_champion_stats(
    state: &AppState,
    command: RankedChampionStatsCommand,
) -> Result<RankedChampionStatsResponse, CommandError> {
    application::get_ranked_champion_stats_from_store(
        &state.store,
        RankedChampionStatsInput {
            lane: command.lane,
            sort_by: command.sort_by,
        },
    )
    .map_err(CommandError::from)
}

pub fn refresh_ranked_champion_stats(
    state: &AppState,
    command: RefreshRankedChampionStatsCommand,
) -> Result<RankedChampionStatsResponse, CommandError> {
    application::refresh_ranked_champion_stats(
        &state.store,
        &state.ranked_champion_provider,
        RankedChampionRefreshInput { url: command.url },
        RankedChampionStatsInput {
            lane: command.lane,
            sort_by: command.sort_by,
        },
    )
    .map_err(CommandError::from)
}

pub fn get_league_profile_icon(
    state: &AppState,
    command: LeagueProfileIconCommand,
) -> Result<LeagueImageAsset, CommandError> {
    application::get_league_profile_icon(
        &state.league_client,
        LeagueProfileIconInput {
            profile_icon_id: command.profile_icon_id,
        },
    )
    .map_err(CommandError::from)
}

pub fn get_league_champion_icon(
    state: &AppState,
    command: LeagueChampionIconCommand,
) -> Result<LeagueImageAsset, CommandError> {
    application::get_league_champion_icon(
        &state.league_client,
        LeagueChampionIconInput {
            champion_id: command.champion_id,
        },
    )
    .map_err(CommandError::from)
}

pub fn get_league_champion_details(
    state: &AppState,
    command: LeagueChampionDetailsCommand,
) -> Result<LeagueChampionDetails, CommandError> {
    application::get_league_champion_details(
        &state.league_client,
        LeagueChampionDetailsInput {
            champion_id: command.champion_id,
        },
    )
    .map_err(CommandError::from)
}

pub fn get_league_game_asset(
    state: &AppState,
    command: LeagueGameAssetCommand,
) -> Result<LeagueGameAsset, CommandError> {
    application::get_league_game_asset(
        &state.league_client,
        LeagueGameAssetInput {
            kind: command.kind,
            asset_id: command.asset_id,
        },
    )
    .map_err(CommandError::from)
}

pub fn get_post_match_detail(
    state: &AppState,
    command: PostMatchDetailCommand,
) -> Result<PostMatchDetail, CommandError> {
    application::get_post_match_detail(
        &state.store,
        &state.league_client,
        PostMatchDetailInput {
            game_id: command.game_id,
        },
    )
    .map_err(CommandError::from)
}

pub fn get_post_match_participant_profile(
    state: &AppState,
    command: ParticipantPublicProfileCommand,
) -> Result<ParticipantPublicProfile, CommandError> {
    application::get_post_match_participant_profile(
        &state.store,
        &state.league_client,
        ParticipantPublicProfileInput {
            game_id: command.game_id,
            participant_id: command.participant_id,
            recent_limit: command.recent_limit,
        },
    )
    .map_err(CommandError::from)
}

pub fn save_player_note(
    state: &AppState,
    command: SavePlayerNoteCommand,
) -> Result<PlayerNoteView, CommandError> {
    application::save_player_note(
        &state.store,
        &state.league_client,
        application::SavePlayerNoteInput {
            game_id: command.game_id,
            participant_id: command.participant_id,
            note: command.note,
            tags: command.tags,
        },
    )
    .map_err(CommandError::from)
}

pub fn clear_player_note(
    state: &AppState,
    command: ClearPlayerNoteCommand,
) -> Result<ClearPlayerNoteResult, CommandError> {
    application::clear_player_note(
        &state.store,
        &state.league_client,
        application::ClearPlayerNoteInput {
            game_id: command.game_id,
            participant_id: command.participant_id,
        },
    )
    .map_err(CommandError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::{
        ActivityKind, KdaTag, LeagueClientConnection, LeagueClientPhase, LeagueDataSection,
        LeagueDataWarning, MatchResult, ParticipantMetricLeader, ParticipantPublicProfile,
        ParticipantRecentStats, PlayerNoteSummary, PlayerNoteView, PostMatchComparison,
        PostMatchDetail, PostMatchParticipant, PostMatchTeam, PostMatchTeamTotals,
        RankedChampionLane, RankedChampionSort, RecentMatchSummary, RecentPerformanceSummary,
        StartupPage,
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
                "language": "en",
                "compactMode": true,
                "activityLimit": 25,
                "autoAcceptEnabled": false,
                "autoPickEnabled": true,
                "autoPickChampionId": 103,
                "autoBanEnabled": true,
                "autoBanChampionId": 122
            }
        }))
        .expect("frontend-shaped settings command deserializes");

        assert_eq!(command.settings.startup_page, "activity");
        assert_eq!(command.settings.language, "en");
        assert!(command.settings.compact_mode);
        assert_eq!(command.settings.activity_limit, 25);
        assert!(!command.settings.auto_accept_enabled);
        assert!(command.settings.auto_pick_enabled);
        assert_eq!(command.settings.auto_pick_champion_id, Some(103));
        assert!(command.settings.auto_ban_enabled);
        assert_eq!(command.settings.auto_ban_champion_id, Some(122));
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
                    language: current_settings.language.as_str().to_string(),
                    compact_mode: current_settings.compact_mode,
                    activity_limit: current_settings.activity_limit,
                    auto_accept_enabled: current_settings.auto_accept_enabled,
                    auto_pick_enabled: current_settings.auto_pick_enabled,
                    auto_pick_champion_id: current_settings.auto_pick_champion_id,
                    auto_ban_enabled: current_settings.auto_ban_enabled,
                    auto_ban_champion_id: current_settings.auto_ban_champion_id,
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
    fn ranked_champion_stats_accepts_frontend_payload_shape() {
        let command: RankedChampionStatsCommand = serde_json::from_value(json!({
            "lane": "jungle",
            "sortBy": "banRate"
        }))
        .expect("frontend-shaped ranked champion stats command deserializes");

        assert_eq!(command.lane, Some(RankedChampionLane::Jungle));
        assert_eq!(command.sort_by, Some(RankedChampionSort::BanRate));
    }

    #[test]
    fn ranked_champion_refresh_accepts_frontend_payload_shape() {
        let command: RefreshRankedChampionStatsCommand = serde_json::from_value(json!({
            "url": "https://raw.githubusercontent.com/example/data/main/ranked-champions/latest.json",
            "lane": "middle",
            "sortBy": "overall"
        }))
        .expect("frontend-shaped ranked champion refresh command deserializes");

        assert_eq!(
            command.url.as_deref(),
            Some(
                "https://raw.githubusercontent.com/example/data/main/ranked-champions/latest.json"
            )
        );
        assert_eq!(command.lane, Some(RankedChampionLane::Middle));
        assert_eq!(command.sort_by, Some(RankedChampionSort::Overall));
    }

    #[test]
    fn ranked_champion_stats_serializes_frontend_shape() {
        let data_dir = unique_temp_dir();
        let state = AppState::initialize(&data_dir).expect("app state initializes");
        let value = serde_json::to_value(
            get_ranked_champion_stats(
                &state,
                RankedChampionStatsCommand {
                    lane: Some(RankedChampionLane::Bottom),
                    sort_by: Some(RankedChampionSort::PickRate),
                },
            )
            .expect("ranked champion stats"),
        )
        .expect("ranked champion stats serializes");

        assert_eq!(value["lane"], "bottom");
        assert_eq!(value["sortBy"], "pickRate");
        assert_eq!(value["records"][0]["lane"], "bottom");
        assert!(value["records"][0]["pickRate"].as_f64().unwrap() >= 0.0);
        assert_eq!(value["isCached"], false);
        assert_eq!(value["dataStatus"], "sample");
        assert_eq!(
            value["statusMessage"],
            "Sample data is shown until ranked champion data is refreshed"
        );
        assert!(value["generatedAt"].is_null());
        assert!(value["importedAt"].is_null());
        assert!(value["records"][0].get("puuid").is_none());
        assert!(value["records"][0].get("authorization").is_none());
        assert!(value["records"][0].get("password").is_none());

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn league_profile_icon_accepts_frontend_payload_shape() {
        let command: LeagueProfileIconCommand = serde_json::from_value(json!({
            "profileIconId": 29
        }))
        .expect("frontend-shaped profile icon command deserializes");

        assert_eq!(command.profile_icon_id, 29);
    }

    #[test]
    fn league_champion_icon_accepts_frontend_payload_shape() {
        let command: LeagueChampionIconCommand = serde_json::from_value(json!({
            "championId": 103
        }))
        .expect("frontend-shaped champion icon command deserializes");

        assert_eq!(command.champion_id, 103);
    }

    #[test]
    fn league_champion_details_accepts_frontend_payload_shape() {
        let command: LeagueChampionDetailsCommand = serde_json::from_value(json!({
            "championId": 103
        }))
        .expect("frontend-shaped champion details command deserializes");

        assert_eq!(command.champion_id, 103);
    }

    #[test]
    fn league_game_asset_accepts_frontend_payload_shape() {
        let command: LeagueGameAssetCommand = serde_json::from_value(json!({
            "kind": "item",
            "assetId": 1054
        }))
        .expect("frontend-shaped game asset command deserializes");

        assert_eq!(command.kind, LeagueGameAssetKind::Item);
        assert_eq!(command.asset_id, 1054);
    }

    #[test]
    fn post_match_commands_accept_frontend_payload_shapes() {
        let detail: PostMatchDetailCommand = serde_json::from_value(json!({
            "gameId": 10
        }))
        .expect("post-match detail command deserializes");
        let profile: ParticipantPublicProfileCommand = serde_json::from_value(json!({
            "gameId": 10,
            "participantId": 2,
            "recentLimit": 6
        }))
        .expect("participant profile command deserializes");
        let note: SavePlayerNoteCommand = serde_json::from_value(json!({
            "gameId": 10,
            "participantId": 2,
            "note": "Helpful teammate",
            "tags": ["support", "calm"]
        }))
        .expect("save player note command deserializes");
        let clear: ClearPlayerNoteCommand = serde_json::from_value(json!({
            "gameId": 10,
            "participantId": 2
        }))
        .expect("clear player note command deserializes");

        assert_eq!(detail.game_id, 10);
        assert_eq!(profile.participant_id, 2);
        assert_eq!(profile.recent_limit, Some(6));
        assert_eq!(note.tags, vec!["support", "calm"]);
        assert_eq!(clear.game_id, 10);
    }

    #[test]
    fn league_status_serializes_frontend_shape() {
        let value = serde_json::to_value(LeagueClientStatus {
            is_running: true,
            lockfile_found: true,
            connection: LeagueClientConnection::Connected,
            phase: LeagueClientPhase::PartialData,
            message: Some("League Client connected with partial data".to_string()),
        })
        .expect("league status serializes");

        assert_eq!(value["isRunning"], true);
        assert_eq!(value["lockfileFound"], true);
        assert_eq!(value["connection"], "connected");
        assert_eq!(value["phase"], "partialData");
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
                champion_id: Some(103),
                champion_name: "Ahri".to_string(),
                queue_name: Some("Ranked Solo/Duo".to_string()),
                result: MatchResult::Win,
                kills: 7,
                deaths: 1,
                assists: 8,
                kda: Some(15.0),
                played_at: Some("2026-04-19T12:00:00Z".to_string()),
                game_duration_seconds: Some(1880),
            }],
            recent_performance: RecentPerformanceSummary {
                match_count: 1,
                average_kda: Some(15.0),
                kda_tag: KdaTag::High,
                recent_champions: vec!["Ahri".to_string()],
                top_champions: Vec::new(),
            },
            data_warnings: vec![LeagueDataWarning {
                section: LeagueDataSection::Ranked,
                message: "Ranked data is temporarily unavailable".to_string(),
            }],
            refreshed_at: "123".to_string(),
        })
        .expect("league snapshot serializes");

        assert_eq!(value["recentMatches"][0]["championName"], "Ahri");
        assert_eq!(value["recentMatches"][0]["championId"], 103);
        assert_eq!(value["recentMatches"][0]["gameDurationSeconds"], 1880);
        assert_eq!(value["recentPerformance"]["averageKda"], 15.0);
        assert_eq!(value["recentPerformance"]["kdaTag"], "high");
        assert_eq!(value["dataWarnings"][0]["section"], "ranked");
        assert_eq!(value["refreshedAt"], "123");
        assert!(value.get("recent_matches").is_none());
        assert!(value.get("data_warnings").is_none());
    }

    #[test]
    fn league_image_asset_serializes_without_lcu_url_fields() {
        let value = serde_json::to_value(LeagueImageAsset {
            mime_type: "image/png".to_string(),
            bytes: vec![1, 2, 3],
        })
        .expect("image asset serializes");

        assert_eq!(value["mimeType"], "image/png");
        assert_eq!(value["bytes"], json!([1, 2, 3]));
        assert!(value.get("url").is_none());
        assert!(value.get("authorization").is_none());
        assert!(value.get("password").is_none());
    }

    #[test]
    fn league_game_asset_serializes_tooltip_metadata_without_lcu_url_fields() {
        let value = serde_json::to_value(LeagueGameAsset {
            kind: LeagueGameAssetKind::Rune,
            asset_id: 8437,
            name: "Grasp of the Undying".to_string(),
            description: Some("Combat keystone".to_string()),
            image: LeagueImageAsset {
                mime_type: "image/png".to_string(),
                bytes: vec![8, 4, 3, 7],
            },
        })
        .expect("game asset serializes");

        assert_eq!(value["kind"], "rune");
        assert_eq!(value["assetId"], 8437);
        assert_eq!(value["name"], "Grasp of the Undying");
        assert_eq!(value["image"]["mimeType"], "image/png");
        assert!(value.get("url").is_none());
        assert!(value.get("authorization").is_none());
        assert!(value.get("password").is_none());
    }

    #[test]
    fn league_champion_details_serializes_without_lcu_url_fields() {
        let value = serde_json::to_value(LeagueChampionDetails {
            champion_id: 103,
            champion_name: "Ahri".to_string(),
            title: Some("the Nine-Tailed Fox".to_string()),
            square_portrait: Some(LeagueImageAsset {
                mime_type: "image/png".to_string(),
                bytes: vec![1, 0, 3],
            }),
            abilities: vec![domain::LeagueChampionAbility {
                slot: "Q".to_string(),
                name: "Orb of Deception".to_string(),
                description: "Ahri sends out and pulls back her orb.".to_string(),
                icon: Some(LeagueImageAsset {
                    mime_type: "image/png".to_string(),
                    bytes: vec![4, 5, 6],
                }),
                cooldown: Some("7".to_string()),
                cost: Some("55".to_string()),
                range: Some("880".to_string()),
            }],
        })
        .expect("champion details serializes");
        let serialized = value.to_string();

        assert_eq!(value["championId"], 103);
        assert_eq!(value["championName"], "Ahri");
        assert_eq!(value["squarePortrait"]["mimeType"], "image/png");
        assert_eq!(value["abilities"][0]["slot"], "Q");
        assert_eq!(value["abilities"][0]["cooldown"], "7");
        assert!(!serialized.contains("authorization"));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("https://"));
        assert!(!serialized.contains("/lol-game-data"));
    }

    #[test]
    fn post_match_detail_serializes_without_internal_identity_fields() {
        let value =
            serde_json::to_value(sample_post_match_detail()).expect("post-match detail serializes");
        let serialized = value.to_string();

        assert_eq!(value["gameId"], 10);
        assert_eq!(value["teams"][0]["participants"][0]["participantId"], 1);
        assert_eq!(
            value["teams"][0]["participants"][0]["performanceScore"],
            8.8
        );
        assert_eq!(
            value["teams"][0]["participants"][0]["noteSummary"]["tags"],
            json!(["carry"])
        );
        assert_eq!(value["comparison"]["mostDamage"]["participantId"], 2);
        assert!(!serialized.contains("puuid"));
        assert!(!serialized.contains("authorization"));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("https://"));
    }

    #[test]
    fn participant_profile_serializes_without_internal_identity_fields() {
        let value = serde_json::to_value(ParticipantPublicProfile {
            game_id: 10,
            participant_id: 2,
            display_name: "Visible Player".to_string(),
            profile_icon_id: Some(29),
            recent_stats: Some(ParticipantRecentStats {
                match_count: 3,
                average_kda: Some(2.5),
                recent_champions: vec!["Ahri".to_string()],
                recent_matches: vec![RecentMatchSummary {
                    game_id: 20,
                    champion_id: Some(103),
                    champion_name: "Ahri".to_string(),
                    queue_name: Some("Ranked Solo/Duo".to_string()),
                    result: MatchResult::Win,
                    kills: 4,
                    deaths: 2,
                    assists: 8,
                    kda: Some(6.0),
                    played_at: Some("2026-04-19T12:00:00Z".to_string()),
                    game_duration_seconds: Some(1800),
                }],
            }),
            note: Some(PlayerNoteView {
                game_id: 10,
                participant_id: 2,
                note: Some("Watch roams".to_string()),
                tags: vec!["mid".to_string()],
                updated_at: Some("2026-04-20 00:00:00".to_string()),
            }),
            warnings: Vec::new(),
        })
        .expect("participant profile serializes");
        let serialized = value.to_string();

        assert_eq!(value["recentStats"]["matchCount"], 3);
        assert_eq!(
            value["recentStats"]["recentMatches"][0]["championName"],
            "Ahri"
        );
        assert_eq!(value["note"]["tags"], json!(["mid"]));
        assert!(!serialized.contains("puuid"));
        assert!(!serialized.contains("authorization"));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("https://"));
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

    fn sample_post_match_detail() -> PostMatchDetail {
        PostMatchDetail {
            game_id: 10,
            queue_name: Some("Ranked Solo/Duo".to_string()),
            played_at: Some("2026-04-19T12:00:00Z".to_string()),
            game_duration_seconds: Some(1880),
            result: MatchResult::Win,
            teams: vec![PostMatchTeam {
                team_id: 100,
                result: MatchResult::Win,
                totals: PostMatchTeamTotals {
                    kills: 7,
                    deaths: 1,
                    assists: 8,
                    gold_earned: 12_000,
                    damage_to_champions: 22_000,
                    vision_score: 18,
                },
                participants: vec![PostMatchParticipant {
                    participant_id: 1,
                    team_id: 100,
                    display_name: "Visible Player".to_string(),
                    champion_id: Some(103),
                    champion_name: "Ahri".to_string(),
                    role: Some("SOLO".to_string()),
                    lane: Some("MIDDLE".to_string()),
                    profile_icon_id: Some(29),
                    result: MatchResult::Win,
                    kills: 7,
                    deaths: 1,
                    assists: 8,
                    kda: Some(15.0),
                    performance_score: 8.8,
                    cs: 210,
                    gold_earned: 12_000,
                    damage_to_champions: 22_000,
                    vision_score: 18,
                    items: vec![1056, 3020],
                    runes: vec![8112],
                    spells: vec![4, 14],
                    note_summary: PlayerNoteSummary {
                        has_note: true,
                        tags: vec!["carry".to_string()],
                    },
                }],
            }],
            comparison: PostMatchComparison {
                highest_kda: Some(ParticipantMetricLeader {
                    participant_id: 1,
                    display_name: "Visible Player".to_string(),
                    value: 15.0,
                }),
                most_cs: None,
                most_gold: None,
                most_damage: Some(ParticipantMetricLeader {
                    participant_id: 2,
                    display_name: "Other Player".to_string(),
                    value: 25_000.0,
                }),
                highest_vision: None,
            },
            warnings: Vec::new(),
        }
    }
}
