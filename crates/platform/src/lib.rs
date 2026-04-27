use std::{
    collections::HashMap,
    error::Error,
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
    thread,
    time::{Duration, Instant},
};

use adapters::{
    LcuSubscription, LcuWebSocketError, LcuWebSocketEvent, LocalLeagueClient,
    RemoteRankedChampionJsonProvider,
};
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
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio_util::sync::CancellationToken;

mod constants;
use constants::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutomationFeedbackEvent {
    kind: String,
    message: String,
}

fn log_auto_accept_monitor_event(message: &str) {
    eprintln!("[auto-accept-monitor] {message}");
}

fn log_auto_accept_monitor_phase(label: &str, phase: &str) {
    eprintln!("[auto-accept-monitor] {label}: {phase}");
}

#[derive(Debug, Clone)]
pub struct ChampSelectCacheEntry {
    snapshot: domain::ChampSelectSnapshot,
    cached_at: Instant,
    recent_limit: i64,
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

#[derive(Debug, Clone)]
pub struct ChampSelectHydrationState {
    fingerprint: String,
    token: CancellationToken,
}

#[derive(Debug, Clone, Default)]
pub struct LeagueEventServiceState {
    phase: Option<String>,
    fingerprint: String,
}

#[derive(Debug, Default)]
struct CacheMetrics {
    champ_select_cache_hits: AtomicU64,
    champ_select_cache_misses: AtomicU64,
    recent_stats_cache_hits: AtomicU64,
    recent_stats_cache_misses: AtomicU64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheMetricsSnapshot {
    pub champ_select_cache_hits: u64,
    pub champ_select_cache_misses: u64,
    pub recent_stats_cache_hits: u64,
    pub recent_stats_cache_misses: u64,
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
    pub league_event_service_started: Arc<AtomicBool>,
    pub champ_select_hydration: Arc<Mutex<Option<ChampSelectHydrationState>>>,
    pub league_phase: Arc<Mutex<Option<String>>>,
    cache_metrics: Arc<CacheMetrics>,
}

fn lock_or_recover<'a, T>(mutex: &'a Mutex<T>) -> MutexGuard<'a, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
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
            league_event_service_started: Arc::new(AtomicBool::new(false)),
            champ_select_hydration: Arc::new(Mutex::new(None)),
            league_phase: Arc::new(Mutex::new(None)),
            cache_metrics: Arc::new(CacheMetrics::default()),
        })
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            store: self.store.clone(),
            league_client: self.league_client.clone(),
            ranked_champion_provider: self.ranked_champion_provider.clone(),
            champ_select_cache: Mutex::new(lock_or_recover(&self.champ_select_cache).clone()),
            recent_stats_cache: Mutex::new(lock_or_recover(&self.recent_stats_cache).clone()),
            summoner_id_cache: Mutex::new(lock_or_recover(&self.summoner_id_cache).clone()),
            summoner_name_cache: Mutex::new(lock_or_recover(&self.summoner_name_cache).clone()),
            league_event_service_started: Arc::clone(&self.league_event_service_started),
            champ_select_hydration: Arc::clone(&self.champ_select_hydration),
            league_phase: Arc::clone(&self.league_phase),
            cache_metrics: Arc::clone(&self.cache_metrics),
        }
    }
}

struct CachedLeagueClientReader<'a> {
    inner: &'a LocalLeagueClient,
    recent_stats_cache: &'a Mutex<HashMap<String, RecentStatsCacheEntry>>,
    summoner_id_cache: &'a Mutex<HashMap<i64, SummonerCacheEntry>>,
    summoner_name_cache: &'a Mutex<HashMap<String, SummonerCacheEntry>>,
    cache_metrics: &'a Arc<CacheMetrics>,
}

impl LeagueClientReader for CachedLeagueClientReader<'_> {
    fn status(&self) -> Result<LeagueClientStatus, LeagueClientReadError> {
        self.inner.status()
    }

    fn gameflow_phase(&self) -> Result<String, LeagueClientReadError> {
        self.inner.gameflow_phase()
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
        let cache_key = recent_stats_cache_key(player_puuid, limit);
        if let Some(result) = self
            .recent_stats_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(cache_key.as_str())
            .filter(|entry| recent_stats_cache_is_fresh(entry))
            .map(|entry| entry.result.clone())
        {
            self.cache_metrics
                .recent_stats_cache_hits
                .fetch_add(1, Ordering::Relaxed);
            return result;
        }

        let result = self.inner.participant_recent_stats(player_puuid, limit);
        self.cache_metrics
            .recent_stats_cache_misses
            .fetch_add(1, Ordering::Relaxed);
        lock_or_recover(self.recent_stats_cache).insert(
            cache_key,
            RecentStatsCacheEntry {
                result: result.clone(),
                cached_at: Instant::now(),
            },
        );

        result
    }

    fn participant_recent_stats_batch(
        &self,
        player_puuids: &[String],
        limit: i64,
    ) -> HashMap<String, Result<ParticipantRecentStats, LeagueClientReadError>> {
        let mut results = HashMap::new();
        let mut missing_puuids = Vec::new();

        {
            let mut has_cache_hit = false;
            let cache = lock_or_recover(self.recent_stats_cache);
            for player_puuid in player_puuids {
                let cache_key = recent_stats_cache_key(player_puuid, limit);
                match cache
                    .get(cache_key.as_str())
                    .filter(|entry| recent_stats_cache_is_fresh(entry))
                {
                    Some(entry) => {
                        has_cache_hit = true;
                        results.insert(player_puuid.clone(), entry.result.clone());
                    }
                    None => missing_puuids.push(player_puuid.clone()),
                }
            }
            if has_cache_hit {
                self.cache_metrics
                    .recent_stats_cache_hits
                    .fetch_add(1, Ordering::Relaxed);
            }
        }

        if missing_puuids.is_empty() {
            return results;
        }
        self.cache_metrics
            .recent_stats_cache_misses
            .fetch_add(1, Ordering::Relaxed);

        let fetched = self
            .inner
            .participant_recent_stats_batch(&missing_puuids, limit);
        let mut cache = lock_or_recover(self.recent_stats_cache);
        for player_puuid in missing_puuids {
            if let Some(result) = fetched.get(player_puuid.as_str()).cloned() {
                cache.insert(
                    recent_stats_cache_key(player_puuid.as_str(), limit),
                    RecentStatsCacheEntry {
                        result: result.clone(),
                        cached_at: Instant::now(),
                    },
                );
                results.insert(player_puuid, result);
            }
        }

        results
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
            let cache = lock_or_recover(self.summoner_id_cache);
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
            let mut cache = lock_or_recover(self.summoner_id_cache);
            let mut name_cache = lock_or_recover(self.summoner_name_cache);
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
            let cache = lock_or_recover(self.summoner_name_cache);
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
            let mut name_cache = lock_or_recover(self.summoner_name_cache);
            let mut id_cache = lock_or_recover(self.summoner_id_cache);
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

fn recent_stats_cache_key(player_puuid: &str, limit: i64) -> String {
    format!("{player_puuid}:{limit}")
}

fn recent_stats_cache_is_fresh(entry: &RecentStatsCacheEntry) -> bool {
    let ttl = if entry.result.is_ok() {
        RECENT_STATS_CACHE_TTL
    } else {
        RECENT_STATS_FAILURE_CACHE_TTL
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

pub fn start_league_event_service<R: Runtime + 'static>(
    app_handle: AppHandle<R>,
    state: AppState,
) -> bool
where
    AppHandle<R>: Send,
{
    if !mark_league_event_service_started(&state) {
        log_auto_accept_monitor_event("league event service already started");
        return false;
    }

    log_auto_accept_monitor_event("league event service starting");
    thread::spawn(move || league_event_loop(app_handle, state));
    true
}

fn mark_league_event_service_started(state: &AppState) -> bool {
    !state
        .league_event_service_started
        .swap(true, Ordering::SeqCst)
}

fn league_event_loop<R: Runtime + 'static>(app_handle: AppHandle<R>, state: AppState)
where
    AppHandle<R>: Send,
{
    let Ok(runtime) = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
    else {
        log_auto_accept_monitor_event("tokio runtime could not be created");
        return;
    };
    log_auto_accept_monitor_event("league event loop started");
    let mut backoff = LeagueReconnectBackoff::new();
    let mut service_state = LeagueEventServiceState::default();

    loop {
        log_auto_accept_monitor_event("opening websocket session");
        let result = runtime.block_on(league_websocket_session(
            &app_handle,
            &state,
            &mut service_state,
            &mut backoff,
        ));
        if let Err(error) = &result {
            eprintln!("[auto-accept-monitor] websocket session ended: {error:?}");
        }

        service_state.phase = None;
        service_state.fingerprint.clear();
        set_league_phase(&state, None);
        cancel_champ_select_hydration(&state);

        if result.is_err()
            && !run_league_event_http_fallback(&app_handle, &state, &mut service_state)
        {
            log_auto_accept_monitor_event("fallback phase read failed");
            *lock_or_recover(&state.champ_select_cache) = None;
            let _ = app_handle.emit("champ-select-clear", ());
        }

        let delay = backoff.next_delay().min(LEAGUE_EVENT_FALLBACK_POLL);
        eprintln!(
            "[auto-accept-monitor] reconnect scheduled in {}s",
            delay.as_secs()
        );
        thread::sleep(delay);
    }
}

async fn league_websocket_session<R: Runtime + 'static>(
    app_handle: &AppHandle<R>,
    state: &AppState,
    service_state: &mut LeagueEventServiceState,
    backoff: &mut LeagueReconnectBackoff,
) -> Result<(), LcuWebSocketError>
where
    AppHandle<R>: Send,
{
    let mut client = state.league_client.open_websocket().await?;
    log_auto_accept_monitor_event("subscribing to gameflow phase events");
    client
        .subscribe(LcuSubscription::JsonApiEvent(GAMEFLOW_PHASE_URI))
        .await?;
    log_auto_accept_monitor_event("subscribing to champ select session events");
    client
        .subscribe(LcuSubscription::JsonApiEvent(CHAMP_SELECT_SESSION_URI))
        .await?;

    tokio::task::block_in_place(|| {
        run_league_event_http_fallback(app_handle, state, service_state);
    });

    while let Some(event) = client.next_event().await? {
        let was_handled = tokio::task::block_in_place(|| {
            handle_lcu_websocket_event(app_handle, state, service_state, &event)
        });

        if was_handled {
            backoff.reset();
        }
    }

    Err(LcuWebSocketError::Disconnected)
}

fn handle_lcu_websocket_event<R: Runtime + 'static>(
    app_handle: &AppHandle<R>,
    state: &AppState,
    service_state: &mut LeagueEventServiceState,
    event: &LcuWebSocketEvent,
) -> bool
where
    AppHandle<R>: Send,
{
    match event.uri.as_str() {
        GAMEFLOW_PHASE_URI => {
            let Some(phase) = event.data.as_str() else {
                log_auto_accept_monitor_event("gameflow event ignored because phase payload was not text");
                return false;
            };
            if service_state.phase.as_deref() != Some(phase) {
                handle_league_phase_change(app_handle, state, phase);
                service_state.phase = Some(phase.to_string());
            }
            true
        }
        CHAMP_SELECT_SESSION_URI => {
            if service_state.phase.as_deref() != Some("ChampSelect")
                && lock_or_recover(state.league_phase.as_ref()).as_deref() != Some("ChampSelect")
            {
                return false;
            }

            if let Some(fingerprint) = refresh_champ_select_from_event(app_handle, state) {
                service_state.fingerprint = fingerprint;
            }
            true
        }
        _ => false,
    }
}

fn run_league_event_http_fallback<R: Runtime + 'static>(
    app_handle: &AppHandle<R>,
    state: &AppState,
    service_state: &mut LeagueEventServiceState,
) -> bool
where
    AppHandle<R>: Send,
{
    let Ok(phase) = state.league_client.gameflow_phase() else {
        log_auto_accept_monitor_event("fallback gameflow phase unavailable");
        return false;
    };
    log_auto_accept_monitor_phase("fallback gameflow phase", phase.as_str());

    if service_state.phase.as_deref() != Some(phase.as_str()) {
        handle_league_phase_change(app_handle, state, phase.as_str());
        service_state.phase = Some(phase.clone());
    }

    if phase == "ChampSelect" {
        if let Some(fingerprint) = refresh_champ_select_from_event(app_handle, state) {
            service_state.fingerprint = fingerprint;
        }
    }

    true
}

fn handle_league_phase_change<R: Runtime + 'static>(
    app_handle: &AppHandle<R>,
    state: &AppState,
    phase: &str,
) where
    AppHandle<R>: Send,
{
    log_auto_accept_monitor_phase("phase changed", phase);
    let _ = app_handle.emit("league-phase-update", phase);
    set_league_phase(state, Some(phase.to_string()));

    match phase {
        "ReadyCheck" => {
            if let Err(error) = run_ready_check_automation(state) {
                emit_automation_feedback(app_handle, error.message);
            }
        }
        "ChampSelect" => {
            if let Err(error) = run_champ_select_automation(state) {
                emit_automation_feedback(app_handle, error.message);
            }
            if phase == "ChampSelect" {
                let _ = refresh_champ_select_from_event(app_handle, state);
            }
        }
        "GameStart" | "PreEndOfGame" | "None" => {
            cancel_champ_select_hydration(state);
            *lock_or_recover(&state.champ_select_cache) = None;
            let _ = app_handle.emit("champ-select-clear", ());
        }
        _ => {}
    }
}

fn emit_automation_feedback<R: Runtime>(app_handle: &AppHandle<R>, message: String) {
    let _ = app_handle.emit(
        "automation-feedback",
        AutomationFeedbackEvent {
            kind: "error".to_string(),
            message,
        },
    );
}

fn set_league_phase(state: &AppState, phase: Option<String>) {
    *lock_or_recover(state.league_phase.as_ref()) = phase;
}

fn current_league_phase_is(state: &AppState, phase: &str) -> bool {
    lock_or_recover(state.league_phase.as_ref()).as_deref() == Some(phase)
}

fn refresh_champ_select_from_event<R: Runtime + 'static>(
    app_handle: &AppHandle<R>,
    state: &AppState,
) -> Option<String>
where
    AppHandle<R>: Send,
{
    let mut snapshot = build_champ_select_snapshot(state, CHAMP_SELECT_LIGHT_RECENT_LIMIT).ok()?;
    let roster_fingerprint = champ_select_roster_fingerprint(&snapshot);
    let cached_entry = lock_or_recover(&state.champ_select_cache).as_ref().cloned();
    let cached_snapshot = cached_entry.as_ref().map(|entry| entry.snapshot.clone());
    let cached_roster_fingerprint = cached_snapshot
        .as_ref()
        .map(champ_select_roster_fingerprint);
    let cached_recent_limit = cached_entry
        .as_ref()
        .map(|entry| entry.recent_limit)
        .unwrap_or(CHAMP_SELECT_LIGHT_RECENT_LIMIT);
    let needs_hydration = champ_select_cache_needs_hydration(
        cached_roster_fingerprint.as_deref(),
        roster_fingerprint.as_str(),
        cached_recent_limit,
    );

    if cached_roster_fingerprint.as_deref() == Some(roster_fingerprint.as_str()) {
        if let Some(cached_snapshot) = cached_snapshot.as_ref() {
            merge_recent_stats_from_cache(&mut snapshot, cached_snapshot);
        }
    } else {
        cancel_champ_select_hydration(state);
    }

    let fingerprint = champ_select_fingerprint(&snapshot);
    let cached_fingerprint = cached_snapshot.as_ref().map(champ_select_fingerprint);
    if cached_fingerprint.as_deref() == Some(fingerprint.as_str()) {
        if needs_hydration {
            start_champ_select_hydration(app_handle.clone(), state.clone(), roster_fingerprint);
        }
        return Some(fingerprint);
    }

    *lock_or_recover(&state.champ_select_cache) = Some(ChampSelectCacheEntry {
        snapshot: snapshot.clone(),
        cached_at: Instant::now(),
        recent_limit: if cached_roster_fingerprint.as_deref() == Some(roster_fingerprint.as_str()) {
            cached_recent_limit
        } else {
            CHAMP_SELECT_LIGHT_RECENT_LIMIT
        },
    });
    let _ = app_handle.emit("champ-select-update", &snapshot);

    if needs_hydration {
        start_champ_select_hydration(app_handle.clone(), state.clone(), roster_fingerprint);
    }
    Some(fingerprint)
}

fn champ_select_cache_needs_hydration(
    cached_roster_fingerprint: Option<&str>,
    roster_fingerprint: &str,
    cached_recent_limit: i64,
) -> bool {
    cached_roster_fingerprint != Some(roster_fingerprint)
        || cached_recent_limit < CHAMP_SELECT_HYDRATED_RECENT_LIMIT
}

fn start_champ_select_hydration<R: Runtime + 'static>(
    app_handle: AppHandle<R>,
    state: AppState,
    fingerprint: String,
) where
    AppHandle<R>: Send,
{
    let token = CancellationToken::new();
    {
        let mut hydration = lock_or_recover(state.champ_select_hydration.as_ref());
        if hydration
            .as_ref()
            .is_some_and(|entry| entry.fingerprint == fingerprint && !entry.token.is_cancelled())
        {
            return;
        }
        if let Some(entry) = hydration.take() {
            entry.token.cancel();
        }
        *hydration = Some(ChampSelectHydrationState {
            fingerprint: fingerprint.clone(),
            token: token.clone(),
        });
    }

    thread::spawn(move || {
        thread::sleep(CHAMP_SELECT_HYDRATION_DEBOUNCE);
        if token.is_cancelled() {
            return;
        }

        let Ok(snapshot) = build_champ_select_snapshot(&state, CHAMP_SELECT_HYDRATED_RECENT_LIMIT)
        else {
            clear_champ_select_hydration_if_current(&state, fingerprint.as_str());
            return;
        };

        if token.is_cancelled()
            || champ_select_roster_fingerprint(&snapshot) != fingerprint
            || !current_league_phase_is(&state, "ChampSelect")
        {
            if !token.is_cancelled() {
                clear_champ_select_hydration_if_current(&state, fingerprint.as_str());
            }
            return;
        }

        let current_is_same = state
            .champ_select_hydration
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
            .is_some_and(|entry| entry.fingerprint == fingerprint && !entry.token.is_cancelled());
        if !current_is_same {
            return;
        }

        *lock_or_recover(&state.champ_select_cache) = Some(ChampSelectCacheEntry {
            snapshot: snapshot.clone(),
            cached_at: Instant::now(),
            recent_limit: CHAMP_SELECT_HYDRATED_RECENT_LIMIT,
        });
        let mut hydration = lock_or_recover(state.champ_select_hydration.as_ref());
        if hydration
            .as_ref()
            .is_some_and(|entry| entry.fingerprint == fingerprint && !entry.token.is_cancelled())
        {
            *hydration = None;
        }
        drop(hydration);
        let _ = app_handle.emit("champ-select-update", &snapshot);
    });
}

fn cancel_champ_select_hydration(state: &AppState) {
    if let Some(entry) = lock_or_recover(state.champ_select_hydration.as_ref()).take() {
        entry.token.cancel();
    }
}

fn clear_champ_select_hydration_if_current(state: &AppState, fingerprint: &str) {
    let mut hydration = lock_or_recover(state.champ_select_hydration.as_ref());
    if hydration
        .as_ref()
        .is_some_and(|entry| entry.fingerprint == fingerprint && !entry.token.is_cancelled())
    {
        *hydration = None;
    }
}

fn champ_select_fingerprint(snapshot: &domain::ChampSelectSnapshot) -> String {
    let mut parts: Vec<String> = snapshot
        .players
        .iter()
        .map(|player| {
            format!(
                "{}:{}:{}:{:?}:{}",
                player.summoner_id,
                player.display_name,
                player.champion_id.unwrap_or_default(),
                player.team,
                player.puuid
            )
        })
        .collect();
    parts.sort_unstable();
    parts.join("|")
}

fn champ_select_roster_fingerprint(snapshot: &domain::ChampSelectSnapshot) -> String {
    let mut parts: Vec<String> = snapshot
        .players
        .iter()
        .map(|player| {
            format!(
                "{}:{}:{:?}:{}",
                player.summoner_id, player.display_name, player.team, player.puuid
            )
        })
        .collect();
    parts.sort_unstable();
    parts.join("|")
}

fn merge_recent_stats_from_cache(
    snapshot: &mut domain::ChampSelectSnapshot,
    cached_snapshot: &domain::ChampSelectSnapshot,
) {
    let cached_stats: HashMap<String, ParticipantRecentStats> = cached_snapshot
        .players
        .iter()
        .filter_map(|player| {
            player
                .recent_stats
                .clone()
                .map(|stats| (player.puuid.clone(), stats))
        })
        .collect();

    for player in &mut snapshot.players {
        if player.recent_stats.is_none() {
            player.recent_stats = cached_stats.get(player.puuid.as_str()).cloned();
        }
    }
}

#[derive(Debug, Clone)]
struct LeagueReconnectBackoff {
    index: usize,
}

impl LeagueReconnectBackoff {
    const DELAYS: [Duration; 4] = [
        Duration::from_secs(1),
        Duration::from_secs(3),
        Duration::from_secs(10),
        Duration::from_secs(30),
    ];

    fn new() -> Self {
        Self { index: 0 }
    }

    fn next_delay(&mut self) -> Duration {
        let delay = Self::DELAYS[self.index.min(Self::DELAYS.len() - 1)];
        if self.index + 1 < Self::DELAYS.len() {
            self.index += 1;
        }
        delay
    }

    fn reset(&mut self) {
        self.index = 0;
    }
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

pub fn run_ready_check_automation(state: &AppState) -> Result<(), CommandError> {
    application::run_ready_check_automation(&state.store, &state.league_client)
        .map_err(CommandError::from)
}

pub fn run_champ_select_automation(state: &AppState) -> Result<(), CommandError> {
    application::run_champ_select_automation(&state.store, &state.league_client)
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
    let recent_limit = command
        .recent_limit
        .unwrap_or(CHAMP_SELECT_HYDRATED_RECENT_LIMIT);
    if let Some(snapshot) = state
        .champ_select_cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .as_ref()
        .filter(|entry| {
            entry.cached_at.elapsed() < CHAMP_SELECT_CACHE_TTL && entry.recent_limit >= recent_limit
        })
        .map(|entry| entry.snapshot.clone())
    {
        state
            .cache_metrics
            .champ_select_cache_hits
            .fetch_add(1, Ordering::Relaxed);
        return Ok(snapshot);
    }

    state
        .cache_metrics
        .champ_select_cache_misses
        .fetch_add(1, Ordering::Relaxed);
    let snapshot = build_champ_select_snapshot(state, recent_limit)?;
    *lock_or_recover(&state.champ_select_cache) = Some(ChampSelectCacheEntry {
        snapshot: snapshot.clone(),
        cached_at: Instant::now(),
        recent_limit,
    });

    Ok(snapshot)
}

fn build_champ_select_snapshot(
    state: &AppState,
    recent_limit: i64,
) -> Result<domain::ChampSelectSnapshot, CommandError> {
    let cached_reader = CachedLeagueClientReader {
        inner: &state.league_client,
        recent_stats_cache: &state.recent_stats_cache,
        summoner_id_cache: &state.summoner_id_cache,
        summoner_name_cache: &state.summoner_name_cache,
        cache_metrics: &state.cache_metrics,
    };

    application::get_champ_select_snapshot(&cached_reader, recent_limit).map_err(CommandError::from)
}

pub fn cache_metrics_snapshot(state: &AppState) -> CacheMetricsSnapshot {
    CacheMetricsSnapshot {
        champ_select_cache_hits: state
            .cache_metrics
            .champ_select_cache_hits
            .load(Ordering::Relaxed),
        champ_select_cache_misses: state
            .cache_metrics
            .champ_select_cache_misses
            .load(Ordering::Relaxed),
        recent_stats_cache_hits: state
            .cache_metrics
            .recent_stats_cache_hits
            .load(Ordering::Relaxed),
        recent_stats_cache_misses: state
            .cache_metrics
            .recent_stats_cache_misses
            .load(Ordering::Relaxed),
    }
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
        ActivityKind, ChampSelectPlayer, ChampSelectSnapshot, ChampSelectTeam, KdaTag,
        LeagueClientConnection, LeagueClientPhase, LeagueDataSection, LeagueDataWarning,
        MatchResult, ParticipantMetricLeader, ParticipantPublicProfile, ParticipantRecentStats,
        PlayerNoteSummary, PlayerNoteView, PostMatchComparison, PostMatchDetail,
        PostMatchParticipant, PostMatchTeam, PostMatchTeamTotals, RankedChampionLane,
        RankedChampionSort, RecentMatchSummary, RecentPerformanceSummary, StartupPage,
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
    fn reconnect_backoff_uses_fixed_cap() {
        let mut backoff = LeagueReconnectBackoff::new();

        assert_eq!(backoff.next_delay(), Duration::from_secs(1));
        assert_eq!(backoff.next_delay(), Duration::from_secs(3));
        assert_eq!(backoff.next_delay(), Duration::from_secs(10));
        assert_eq!(backoff.next_delay(), Duration::from_secs(30));
        assert_eq!(backoff.next_delay(), Duration::from_secs(30));

        backoff.reset();
        assert_eq!(backoff.next_delay(), Duration::from_secs(1));
    }

    #[test]
    fn league_event_service_guard_only_marks_once() {
        let data_dir = unique_temp_dir();
        let state = AppState::initialize(&data_dir).expect("app state initializes");

        assert!(mark_league_event_service_started(&state));
        assert!(!mark_league_event_service_started(&state));

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn champ_select_snapshot_serializes_without_puuid() {
        let snapshot = sample_champ_select_snapshot();
        let value = serde_json::to_value(&snapshot).expect("snapshot serializes");
        let serialized = value.to_string();

        assert_eq!(value["players"][0]["displayName"], "Player#NA1");
        assert!(value["players"][0].get("puuid").is_none());
        assert!(!serialized.contains("puuid-7"));
    }

    #[test]
    fn champ_select_fingerprint_ignores_recent_stats() {
        let mut snapshot = sample_champ_select_snapshot();
        let initial = champ_select_fingerprint(&snapshot);
        snapshot.players[0].recent_stats = Some(ParticipantRecentStats {
            match_count: 1,
            average_kda: Some(3.0),
            recent_champions: vec!["Ahri".to_string()],
            recent_matches: vec![RecentMatchSummary {
                game_id: 100,
                champion_id: Some(103),
                champion_name: "Ahri".to_string(),
                queue_name: Some("Ranked Solo/Duo".to_string()),
                played_at: Some("2026-04-26 00:00:00".to_string()),
                game_duration_seconds: Some(1800),
                result: MatchResult::Win,
                kills: 5,
                deaths: 1,
                assists: 9,
                kda: Some(14.0),
            }],
        });

        assert_eq!(champ_select_fingerprint(&snapshot), initial);
    }

    #[test]
    fn champ_select_roster_fingerprint_ignores_champion_changes() {
        let mut snapshot = sample_champ_select_snapshot();
        let initial = champ_select_roster_fingerprint(&snapshot);
        let full_initial = champ_select_fingerprint(&snapshot);
        snapshot.players[0].champion_id = Some(99);

        assert_eq!(champ_select_roster_fingerprint(&snapshot), initial);
        assert_ne!(champ_select_fingerprint(&snapshot), full_initial);
    }

    #[test]
    fn champ_select_cache_hydrates_matching_light_roster() {
        assert!(champ_select_cache_needs_hydration(
            Some("same-roster"),
            "same-roster",
            CHAMP_SELECT_LIGHT_RECENT_LIMIT,
        ));
    }

    #[test]
    fn champ_select_cache_skips_hydration_for_matching_hydrated_roster() {
        assert!(!champ_select_cache_needs_hydration(
            Some("same-roster"),
            "same-roster",
            CHAMP_SELECT_HYDRATED_RECENT_LIMIT,
        ));
    }

    #[test]
    fn champ_select_cache_hydrates_new_roster() {
        assert!(champ_select_cache_needs_hydration(
            Some("old-roster"),
            "new-roster",
            CHAMP_SELECT_HYDRATED_RECENT_LIMIT,
        ));
    }

    #[test]
    fn merge_recent_stats_from_cache_preserves_hydrated_rows() {
        let mut cached = sample_champ_select_snapshot();
        cached.players[0].recent_stats = Some(ParticipantRecentStats {
            match_count: 1,
            average_kda: Some(3.0),
            recent_champions: vec!["Ahri".to_string()],
            recent_matches: Vec::new(),
        });
        let mut snapshot = cached.clone();
        snapshot.players[0].champion_id = Some(99);
        snapshot.players[0].recent_stats = None;

        merge_recent_stats_from_cache(&mut snapshot, &cached);

        assert!(snapshot.players[0].recent_stats.is_some());
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

    fn sample_champ_select_snapshot() -> ChampSelectSnapshot {
        ChampSelectSnapshot {
            players: vec![ChampSelectPlayer {
                summoner_id: 7,
                puuid: "puuid-7".to_string(),
                display_name: "Player#NA1".to_string(),
                champion_id: Some(103),
                champion_name: None,
                team: ChampSelectTeam::Ally,
                ranked_queues: Vec::new(),
                recent_stats: None,
            }],
            cached_at: "1770000000".to_string(),
        }
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
