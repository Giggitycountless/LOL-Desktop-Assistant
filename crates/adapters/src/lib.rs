use std::{
    collections::HashMap,
    fmt,
    fs,
    path::PathBuf,
    time::Duration,
};

use application::{LeagueClientReadError, LeagueClientReader};
use domain::{
    CurrentSummonerProfile, LeagueClientConnection, LeagueClientPhase, LeagueClientStatus,
    LeagueDataSection, LeagueDataWarning, LeagueSelfData, MatchResult, RankedQueue,
    RankedQueueSummary, RecentMatchSummary,
};
use reqwest::{blocking::Client, StatusCode};
use serde::Deserialize;
use serde_json::Value;
use sysinfo::{ProcessesToUpdate, System};

const LOCAL_LCU_HOST: &str = "127.0.0.1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const LEAGUE_CLIENT_PROCESSES: [&str; 2] = ["LeagueClientUx.exe", "LeagueClient.exe"];

pub fn layer_name() -> &'static str {
    "adapters"
}

#[derive(Debug, Clone, Default)]
pub struct LocalLeagueClient {
    lockfile_override: Option<PathBuf>,
}

impl LocalLeagueClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_lockfile_path(path: impl Into<PathBuf>) -> Self {
        Self {
            lockfile_override: Some(path.into()),
        }
    }

    fn read_status(&self) -> LeagueClientStatus {
        let session = match self.open_session() {
            SessionOpenResult::Ready(session) => session,
            SessionOpenResult::Status(status) => return status,
        };

        match session.get_json::<LcuSummoner>("/lol-summoner/v1/current-summoner") {
            Ok(_) => connected_status(),
            Err(error) => status_from_request_error(error),
        }
    }

    fn read_self_data(&self, match_limit: i64) -> LeagueSelfData {
        let session = match self.open_session() {
            SessionOpenResult::Ready(session) => session,
            SessionOpenResult::Status(status) => return empty_self_data(status),
        };

        let summoner = match session.get_json::<LcuSummoner>("/lol-summoner/v1/current-summoner") {
            Ok(value) => value,
            Err(error) => return empty_self_data(status_from_request_error(error)),
        };

        build_self_data(session, summoner, match_limit)
    }

    fn open_session(&self) -> SessionOpenResult {
        let lockfile_path = match self.discover_lockfile_path() {
            LockfileDiscovery::Found(path) => path,
            LockfileDiscovery::NotRunning => {
                return SessionOpenResult::Status(unavailable_status(
                    false,
                    false,
                    LeagueClientPhase::NotRunning,
                    "League Client is not running",
                ));
            }
            LockfileDiscovery::LockfileMissing => {
                return SessionOpenResult::Status(unavailable_status(
                    true,
                    false,
                    LeagueClientPhase::LockfileMissing,
                    "League Client is running, but its lockfile was not found",
                ));
            }
        };

        let lockfile_contents = match fs::read_to_string(&lockfile_path) {
            Ok(contents) => contents,
            Err(_) => {
                return SessionOpenResult::Status(unavailable_status(
                    true,
                    true,
                    LeagueClientPhase::Unavailable,
                    "League Client lockfile could not be read",
                ));
            }
        };

        let credentials = match parse_lockfile(lockfile_contents.as_str()) {
            Ok(credentials) => credentials,
            Err(_) => {
                return SessionOpenResult::Status(unavailable_status(
                    true,
                    true,
                    LeagueClientPhase::Unavailable,
                    "League Client lockfile could not be parsed",
                ));
            }
        };

        match LcuSession::new(credentials) {
            Ok(session) => SessionOpenResult::Ready(session),
            Err(_) => SessionOpenResult::Status(unavailable_status(
                true,
                true,
                LeagueClientPhase::Unavailable,
                "League Client local connection could not be prepared",
            )),
        }
    }

    fn discover_lockfile_path(&self) -> LockfileDiscovery {
        if let Some(path) = &self.lockfile_override {
            return if path.exists() {
                LockfileDiscovery::Found(path.clone())
            } else {
                LockfileDiscovery::LockfileMissing
            };
        }

        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);

        let mut client_is_running = false;
        for process in system.processes().values() {
            let process_name = process.name().to_string_lossy();

            if !is_league_client_process(process_name.as_ref()) {
                continue;
            }

            client_is_running = true;
            let Some(executable_path) = process.exe() else {
                continue;
            };
            let Some(client_dir) = executable_path.parent() else {
                continue;
            };

            let lockfile_path = client_dir.join("lockfile");
            if lockfile_path.exists() {
                return LockfileDiscovery::Found(lockfile_path);
            }
        }

        if client_is_running {
            LockfileDiscovery::LockfileMissing
        } else {
            LockfileDiscovery::NotRunning
        }
    }
}

impl LeagueClientReader for LocalLeagueClient {
    fn status(&self) -> Result<LeagueClientStatus, LeagueClientReadError> {
        Ok(self.read_status())
    }

    fn self_data(&self, match_limit: i64) -> Result<LeagueSelfData, LeagueClientReadError> {
        Ok(self.read_self_data(match_limit))
    }
}

enum SessionOpenResult {
    Ready(LcuSession),
    Status(LeagueClientStatus),
}

enum LockfileDiscovery {
    Found(PathBuf),
    NotRunning,
    LockfileMissing,
}

#[derive(Clone, PartialEq, Eq)]
struct LockfileCredentials {
    port: u16,
    password: String,
}

impl fmt::Debug for LockfileCredentials {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LockfileCredentials")
            .field("port", &self.port)
            .field("password", &"<redacted>")
            .finish()
    }
}

fn parse_lockfile(contents: &str) -> Result<LockfileCredentials, LcuAdapterError> {
    let parts: Vec<&str> = contents.trim().split(':').collect();

    if parts.len() != 5 {
        return Err(LcuAdapterError::InvalidLockfile);
    }

    let name = parts[0].trim();
    let pid = parts[1].trim();
    let port = parts[2].trim();
    let password = parts[3].trim();
    let protocol = parts[4].trim();

    if name.is_empty() || password.is_empty() {
        return Err(LcuAdapterError::InvalidLockfile);
    }

    let parsed_pid = pid
        .parse::<u32>()
        .map_err(|_| LcuAdapterError::InvalidLockfile)?;
    if parsed_pid == 0 {
        return Err(LcuAdapterError::InvalidLockfile);
    }

    let port = port
        .parse::<u16>()
        .map_err(|_| LcuAdapterError::InvalidLockfile)?;
    if port == 0 {
        return Err(LcuAdapterError::InvalidLockfile);
    }

    if protocol != "https" {
        return Err(LcuAdapterError::InvalidLockfile);
    }

    Ok(LockfileCredentials {
        port,
        password: password.to_string(),
    })
}

struct LcuSession {
    credentials: LockfileCredentials,
    http_client: Client,
}

impl LcuSession {
    fn new(credentials: LockfileCredentials) -> Result<Self, LcuAdapterError> {
        let http_client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(REQUEST_TIMEOUT)
            .no_proxy()
            .tls_danger_accept_invalid_certs(true)
            .build()
            .map_err(|_| LcuAdapterError::Http)?;

        Ok(Self {
            credentials,
            http_client,
        })
    }

    fn get_json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T, LcuRequestError> {
        let url = format!(
            "https://{LOCAL_LCU_HOST}:{}{}",
            self.credentials.port, path
        );
        let response = self
            .http_client
            .get(url)
            .basic_auth("riot", Some(self.credentials.password.as_str()))
            .send()
            .map_err(|_| LcuRequestError::Unavailable)?;
        let status = response.status();

        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(LcuRequestError::Unauthorized);
        }

        if status == StatusCode::NOT_FOUND {
            return Err(LcuRequestError::NotLoggedIn);
        }

        if status == StatusCode::SERVICE_UNAVAILABLE {
            return Err(LcuRequestError::Patching);
        }

        if !status.is_success() {
            return Err(LcuRequestError::Unavailable);
        }

        response.json::<T>().map_err(|_| LcuRequestError::Unexpected)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LcuRequestError {
    Unauthorized,
    NotLoggedIn,
    Patching,
    Unavailable,
    Unexpected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LcuAdapterError {
    InvalidLockfile,
    Http,
}

fn is_league_client_process(name: &str) -> bool {
    LEAGUE_CLIENT_PROCESSES
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(name))
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

fn unavailable_status(
    is_running: bool,
    lockfile_found: bool,
    phase: LeagueClientPhase,
    message: impl Into<String>,
) -> LeagueClientStatus {
    LeagueClientStatus {
        is_running,
        lockfile_found,
        connection: LeagueClientConnection::Unavailable,
        phase,
        message: Some(message.into()),
    }
}

fn status_from_request_error(error: LcuRequestError) -> LeagueClientStatus {
    match error {
        LcuRequestError::Unauthorized => unavailable_status(
            true,
            true,
            LeagueClientPhase::Unauthorized,
            "League Client rejected local authentication",
        ),
        LcuRequestError::NotLoggedIn => unavailable_status(
            true,
            true,
            LeagueClientPhase::NotLoggedIn,
            "League Client is not logged in yet",
        ),
        LcuRequestError::Patching => unavailable_status(
            true,
            true,
            LeagueClientPhase::Patching,
            "League Client local API is not ready",
        ),
        LcuRequestError::Unavailable => unavailable_status(
            true,
            true,
            LeagueClientPhase::Unavailable,
            "League Client local API is unavailable",
        ),
        LcuRequestError::Unexpected => unavailable_status(
            true,
            true,
            LeagueClientPhase::Unavailable,
            "League Client returned an unexpected response",
        ),
    }
}

fn empty_self_data(status: LeagueClientStatus) -> LeagueSelfData {
    LeagueSelfData {
        status,
        summoner: None,
        ranked_queues: Vec::new(),
        recent_matches: Vec::new(),
        data_warnings: Vec::new(),
    }
}

fn build_self_data(session: LcuSession, summoner: LcuSummoner, match_limit: i64) -> LeagueSelfData {
    let champion_names_result =
        session.get_json::<Vec<LcuChampionSummary>>("/lol-game-data/assets/v1/champion-summary.json");
    let ranked_result = session.get_json::<LcuRankedStats>("/lol-ranked/v1/current-ranked-stats");
    let matches_path = format!(
        "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex={match_limit}"
    );
    let matches_result = session.get_json::<LcuMatchHistoryResponse>(matches_path.as_str());

    compose_self_data(summoner, champion_names_result, ranked_result, matches_result)
}

fn compose_self_data(
    summoner: LcuSummoner,
    champion_names_result: Result<Vec<LcuChampionSummary>, LcuRequestError>,
    ranked_result: Result<LcuRankedStats, LcuRequestError>,
    matches_result: Result<LcuMatchHistoryResponse, LcuRequestError>,
) -> LeagueSelfData {
    let mut warnings = Vec::new();
    let champion_names = match champion_names_result {
        Ok(champions) => champion_name_map(champions),
        Err(error) => {
            warnings.push(data_warning(
                LeagueDataSection::Champions,
                section_error_message("Champion names", error),
            ));
            HashMap::new()
        }
    };
    let ranked_queues = match ranked_result {
        Ok(stats) => map_ranked_queues(stats),
        Err(error) => {
            warnings.push(data_warning(
                LeagueDataSection::Ranked,
                section_error_message("Ranked data", error),
            ));
            Vec::new()
        }
    };
    let recent_matches = match matches_result {
        Ok(history) => map_recent_matches(history, &summoner, &champion_names),
        Err(error) => {
            warnings.push(data_warning(
                LeagueDataSection::Matches,
                section_error_message("Recent matches", error),
            ));
            Vec::new()
        }
    };

    let status = if warnings.is_empty() {
        connected_status()
    } else {
        partial_data_status()
    };

    LeagueSelfData {
        status,
        summoner: Some(summoner.profile()),
        ranked_queues,
        recent_matches,
        data_warnings: warnings,
    }
}

fn partial_data_status() -> LeagueClientStatus {
    LeagueClientStatus {
        is_running: true,
        lockfile_found: true,
        connection: LeagueClientConnection::Connected,
        phase: LeagueClientPhase::PartialData,
        message: Some("League Client connected with partial data".to_string()),
    }
}

fn data_warning(section: LeagueDataSection, message: impl Into<String>) -> LeagueDataWarning {
    LeagueDataWarning {
        section,
        message: message.into(),
    }
}

fn section_error_message(section_name: &str, error: LcuRequestError) -> String {
    match error {
        LcuRequestError::Unauthorized => format!("{section_name} could not be read"),
        LcuRequestError::NotLoggedIn => format!("{section_name} is unavailable before login"),
        LcuRequestError::Patching => format!("{section_name} is unavailable while the client is preparing"),
        LcuRequestError::Unavailable => format!("{section_name} is temporarily unavailable"),
        LcuRequestError::Unexpected => format!("{section_name} returned an unexpected response"),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuSummoner {
    display_name: Option<String>,
    game_name: Option<String>,
    tag_line: Option<String>,
    summoner_level: Option<i64>,
    profile_icon_id: Option<i64>,
    account_id: Option<i64>,
    summoner_id: Option<i64>,
    puuid: Option<String>,
}

impl LcuSummoner {
    fn profile(&self) -> CurrentSummonerProfile {
        CurrentSummonerProfile {
            display_name: self.display_name(),
            summoner_level: self.summoner_level.unwrap_or_default(),
            profile_icon_id: self.profile_icon_id,
        }
    }

    fn display_name(&self) -> String {
        if let Some(value) = non_empty(self.display_name.as_deref()) {
            return value.to_string();
        }

        match (
            non_empty(self.game_name.as_deref()),
            non_empty(self.tag_line.as_deref()),
        ) {
            (Some(game_name), Some(tag_line)) => format!("{game_name}#{tag_line}"),
            (Some(game_name), None) => game_name.to_string(),
            _ => "Current summoner".to_string(),
        }
    }

    fn matches_player(&self, player: &LcuPlayer) -> bool {
        ids_match(self.summoner_id, player.summoner_id)
            || ids_match(self.account_id, player.account_id)
            || ids_match(self.account_id, player.current_account_id)
            || strings_match(self.puuid.as_deref(), player.puuid.as_deref())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuRankedStats {
    #[serde(default)]
    queues: Vec<LcuRankedQueue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuRankedQueue {
    queue_type: Option<String>,
    tier: Option<String>,
    division: Option<String>,
    league_points: Option<i64>,
    wins: Option<i64>,
    losses: Option<i64>,
}

fn map_ranked_queues(stats: LcuRankedStats) -> Vec<RankedQueueSummary> {
    stats
        .queues
        .into_iter()
        .filter_map(|queue| {
            let queue_type = queue.queue_type.as_deref()?;
            let queue_kind = match queue_type {
                "RANKED_SOLO_5x5" => RankedQueue::SoloDuo,
                "RANKED_FLEX_SR" => RankedQueue::Flex,
                _ => RankedQueue::Other,
            };
            let tier = queue.tier.and_then(|value| non_empty_owned(value));
            let division = queue.division.and_then(|value| non_empty_owned(value));
            let is_ranked = tier
                .as_deref()
                .is_some_and(|value| value != "NONE" && value != "UNRANKED");

            Some(RankedQueueSummary {
                queue: queue_kind,
                tier,
                division,
                league_points: queue.league_points,
                wins: queue.wins.unwrap_or_default(),
                losses: queue.losses.unwrap_or_default(),
                is_ranked,
            })
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct LcuChampionSummary {
    id: i64,
    name: String,
}

fn champion_name_map(champions: Vec<LcuChampionSummary>) -> HashMap<i64, String> {
    champions
        .into_iter()
        .filter(|champion| champion.id > 0 && !champion.name.trim().is_empty())
        .map(|champion| (champion.id, champion.name))
        .collect()
}

#[derive(Debug, Deserialize)]
struct LcuMatchHistoryResponse {
    games: Option<LcuGames>,
}

#[derive(Debug, Deserialize)]
struct LcuGames {
    #[serde(default)]
    games: Vec<LcuGame>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuGame {
    game_id: Option<i64>,
    game_creation_date: Option<String>,
    #[serde(rename = "gameCreation")]
    game_creation: Option<Value>,
    queue_id: Option<i64>,
    #[serde(default)]
    participants: Vec<LcuParticipant>,
    #[serde(default)]
    participant_identities: Vec<LcuParticipantIdentity>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuParticipant {
    participant_id: Option<i64>,
    champion_id: Option<i64>,
    champion_name: Option<String>,
    stats: Option<LcuParticipantStats>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuParticipantStats {
    kills: Option<i64>,
    deaths: Option<i64>,
    assists: Option<i64>,
    win: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuParticipantIdentity {
    participant_id: Option<i64>,
    player: Option<LcuPlayer>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcuPlayer {
    summoner_id: Option<i64>,
    account_id: Option<i64>,
    current_account_id: Option<i64>,
    puuid: Option<String>,
}

fn map_recent_matches(
    history: LcuMatchHistoryResponse,
    summoner: &LcuSummoner,
    champion_names: &HashMap<i64, String>,
) -> Vec<RecentMatchSummary> {
    history
        .games
        .map(|games| {
            games
                .games
                .into_iter()
                .filter_map(|game| map_recent_match(game, summoner, champion_names))
                .collect()
        })
        .unwrap_or_default()
}

fn map_recent_match(
    game: LcuGame,
    summoner: &LcuSummoner,
    champion_names: &HashMap<i64, String>,
) -> Option<RecentMatchSummary> {
    let participant_id = game
        .participant_identities
        .iter()
        .find_map(|identity| match &identity.player {
            Some(player) if summoner.matches_player(player) => identity.participant_id,
            _ => None,
        })?;
    let participant = game
        .participants
        .iter()
        .find(|participant| participant.participant_id == Some(participant_id))?;
    let stats = participant.stats.as_ref()?;
    let kills = stats.kills.unwrap_or_default();
    let deaths = stats.deaths.unwrap_or_default();
    let assists = stats.assists.unwrap_or_default();

    Some(RecentMatchSummary {
        game_id: game.game_id?,
        champion_name: participant_champion_name(participant, champion_names),
        queue_name: game.queue_id.and_then(queue_name).map(str::to_string),
        result: match stats.win {
            Some(true) => MatchResult::Win,
            Some(false) => MatchResult::Loss,
            None => MatchResult::Unknown,
        },
        kills,
        deaths,
        assists,
        kda: Some(round_to_tenth(calculate_kda(kills, deaths, assists))),
        played_at: game.game_creation_date.or_else(|| value_to_string(game.game_creation)),
    })
}

fn participant_champion_name(
    participant: &LcuParticipant,
    champion_names: &HashMap<i64, String>,
) -> String {
    if let Some(name) = non_empty(participant.champion_name.as_deref()) {
        return name.to_string();
    }

    participant
        .champion_id
        .and_then(|id| champion_names.get(&id).cloned())
        .or_else(|| participant.champion_id.map(|id| format!("Champion {id}")))
        .unwrap_or_else(|| "Unknown champion".to_string())
}

fn queue_name(queue_id: i64) -> Option<&'static str> {
    match queue_id {
        400 => Some("Normal Draft"),
        420 => Some("Ranked Solo/Duo"),
        430 => Some("Normal Blind"),
        440 => Some("Ranked Flex"),
        450 => Some("ARAM"),
        700 => Some("Clash"),
        1700 => Some("Arena"),
        _ => None,
    }
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

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.and_then(|inner| {
        let trimmed = inner.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn non_empty_owned(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn ids_match(left: Option<i64>, right: Option<i64>) -> bool {
    left.zip(right).is_some_and(|(a, b)| a == b)
}

fn strings_match(left: Option<&str>, right: Option<&str>) -> bool {
    left.zip(right).is_some_and(|(a, b)| a == b)
}

fn value_to_string(value: Option<Value>) -> Option<String> {
    match value {
        Some(Value::String(value)) => Some(value),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const TEST_LOCKFILE_VALUE: &str = "not-a-real-test-value";

    #[test]
    fn parses_valid_lockfile() {
        let credentials = parse_lockfile(
            format!("LeagueClient:1234:2999:{TEST_LOCKFILE_VALUE}:https").as_str(),
        )
        .expect("lockfile parses");

        assert_eq!(credentials.port, 2999);
        assert_eq!(credentials.password, TEST_LOCKFILE_VALUE);
    }

    #[test]
    fn lockfile_credentials_debug_redacts_password() {
        let credentials = parse_lockfile(
            format!("LeagueClient:1234:2999:{TEST_LOCKFILE_VALUE}:https").as_str(),
        )
        .expect("lockfile parses");
        let message = format!("{credentials:?}");

        assert!(message.contains("<redacted>"));
        assert!(!message.contains(TEST_LOCKFILE_VALUE));
    }

    #[test]
    fn rejects_malformed_lockfile_without_exposing_password() {
        let error = parse_lockfile(
            format!("LeagueClient:1234:not-a-port:{TEST_LOCKFILE_VALUE}:https").as_str(),
        )
            .expect_err("lockfile is rejected");
        let message = format!("{error:?}");

        assert!(!message.contains(TEST_LOCKFILE_VALUE));
    }

    #[test]
    fn rejects_non_https_lockfile() {
        let result = parse_lockfile(
            format!("LeagueClient:1234:2999:{TEST_LOCKFILE_VALUE}:http").as_str(),
        );

        assert!(matches!(result, Err(LcuAdapterError::InvalidLockfile)));
    }

    #[test]
    fn request_errors_map_to_specific_safe_statuses() {
        let unauthorized = status_from_request_error(LcuRequestError::Unauthorized);
        let not_logged_in = status_from_request_error(LcuRequestError::NotLoggedIn);
        let patching = status_from_request_error(LcuRequestError::Patching);

        assert_eq!(unauthorized.phase, LeagueClientPhase::Unauthorized);
        assert_eq!(not_logged_in.phase, LeagueClientPhase::NotLoggedIn);
        assert_eq!(patching.phase, LeagueClientPhase::Patching);
        assert!(unauthorized.message.unwrap().contains("authentication"));
        assert!(!format!("{not_logged_in:?}").contains(TEST_LOCKFILE_VALUE));
    }

    #[test]
    fn maps_ranked_solo_and_flex_queues() {
        let queues = map_ranked_queues(LcuRankedStats {
            queues: vec![
                LcuRankedQueue {
                    queue_type: Some("RANKED_SOLO_5x5".to_string()),
                    tier: Some("GOLD".to_string()),
                    division: Some("II".to_string()),
                    league_points: Some(72),
                    wins: Some(20),
                    losses: Some(10),
                },
                LcuRankedQueue {
                    queue_type: Some("RANKED_FLEX_SR".to_string()),
                    tier: None,
                    division: None,
                    league_points: None,
                    wins: Some(0),
                    losses: Some(0),
                },
            ],
        });

        assert_eq!(queues.len(), 2);
        assert_eq!(queues[0].queue, RankedQueue::SoloDuo);
        assert!(queues[0].is_ranked);
        assert_eq!(queues[1].queue, RankedQueue::Flex);
        assert!(!queues[1].is_ranked);
    }

    #[test]
    fn maps_recent_match_for_current_summoner_only() {
        let summoner = sample_summoner();
        let mut champion_names = HashMap::new();
        champion_names.insert(103, "Ahri".to_string());

        let matches = map_recent_matches(
            LcuMatchHistoryResponse {
                games: Some(LcuGames {
                    games: vec![LcuGame {
                        game_id: Some(10),
                        game_creation_date: Some("2026-04-19T12:00:00Z".to_string()),
                        game_creation: None,
                        queue_id: Some(420),
                        participants: vec![
                            LcuParticipant {
                                participant_id: Some(1),
                                champion_id: Some(266),
                                champion_name: None,
                                stats: Some(LcuParticipantStats {
                                    kills: Some(0),
                                    deaths: Some(5),
                                    assists: Some(1),
                                    win: Some(false),
                                }),
                            },
                            LcuParticipant {
                                participant_id: Some(2),
                                champion_id: Some(103),
                                champion_name: None,
                                stats: Some(LcuParticipantStats {
                                    kills: Some(7),
                                    deaths: Some(1),
                                    assists: Some(8),
                                    win: Some(true),
                                }),
                            },
                        ],
                        participant_identities: vec![LcuParticipantIdentity {
                            participant_id: Some(2),
                            player: Some(LcuPlayer {
                                summoner_id: Some(99),
                                account_id: Some(55),
                                current_account_id: None,
                                puuid: Some("self-puuid".to_string()),
                            }),
                        }],
                    }],
                }),
            },
            &summoner,
            &champion_names,
        );

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].champion_name, "Ahri");
        assert_eq!(matches[0].queue_name.as_deref(), Some("Ranked Solo/Duo"));
        assert_eq!(matches[0].kda, Some(15.0));
        assert_eq!(matches[0].result, MatchResult::Win);
    }

    #[test]
    fn optional_ranked_failure_returns_partial_snapshot() {
        let data = compose_self_data(
            sample_summoner(),
            Ok(vec![LcuChampionSummary {
                id: 103,
                name: "Ahri".to_string(),
            }]),
            Err(LcuRequestError::Unavailable),
            Ok(empty_match_history()),
        );

        assert_eq!(data.status.phase, LeagueClientPhase::PartialData);
        assert_eq!(data.summoner.unwrap().display_name, "Player");
        assert_eq!(data.data_warnings.len(), 1);
        assert_eq!(data.data_warnings[0].section, LeagueDataSection::Ranked);
    }

    #[test]
    fn malformed_optional_payload_does_not_drop_summoner() {
        let data = compose_self_data(
            sample_summoner(),
            Err(LcuRequestError::Unexpected),
            Ok(LcuRankedStats { queues: Vec::new() }),
            Err(LcuRequestError::Unexpected),
        );

        assert_eq!(data.status.phase, LeagueClientPhase::PartialData);
        assert!(data.summoner.is_some());
        assert_eq!(data.data_warnings.len(), 2);
        assert!(data
            .data_warnings
            .iter()
            .all(|warning| !warning.message.contains(TEST_LOCKFILE_VALUE)));
    }

    #[test]
    fn missing_override_path_reports_lockfile_missing() {
        let client = LocalLeagueClient::with_lockfile_path(Path::new("missing-lockfile-for-test"));

        assert!(matches!(
            client.discover_lockfile_path(),
            LockfileDiscovery::LockfileMissing
        ));
    }

    fn sample_summoner() -> LcuSummoner {
        LcuSummoner {
            display_name: Some("Player".to_string()),
            game_name: None,
            tag_line: None,
            summoner_level: Some(100),
            profile_icon_id: Some(1),
            account_id: Some(55),
            summoner_id: Some(99),
            puuid: Some("self-puuid".to_string()),
        }
    }

    fn empty_match_history() -> LcuMatchHistoryResponse {
        LcuMatchHistoryResponse {
            games: Some(LcuGames { games: Vec::new() }),
        }
    }
}
