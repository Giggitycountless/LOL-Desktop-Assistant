use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub status: ServiceStatus,
    pub database_status: DatabaseStatus,
    pub schema_version: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    Ok,
    Degraded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseStatus {
    Ok,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub health: HealthReport,
    pub settings: AppSettings,
    pub settings_defaults: SettingsValues,
    pub recent_activity: Vec<ActivityEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub startup_page: StartupPage,
    pub compact_mode: bool,
    pub activity_limit: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsValues {
    pub startup_page: StartupPage,
    pub compact_mode: bool,
    pub activity_limit: i64,
}

impl AppSettings {
    pub fn values(&self) -> SettingsValues {
        SettingsValues {
            startup_page: self.startup_page,
            compact_mode: self.compact_mode,
            activity_limit: self.activity_limit,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StartupPage {
    Dashboard,
    Activity,
    Settings,
}

impl StartupPage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dashboard => "dashboard",
            Self::Activity => "activity",
            Self::Settings => "settings",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "dashboard" => Some(Self::Dashboard),
            "activity" => Some(Self::Activity),
            "settings" => Some(Self::Settings),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: i64,
    pub kind: ActivityKind,
    pub title: String,
    pub body: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewActivityEntry {
    pub kind: ActivityKind,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityKind {
    Note,
    Settings,
    System,
}

impl ActivityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Settings => "settings",
            Self::System => "system",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "note" => Some(Self::Note),
            "settings" => Some(Self::Settings),
            "system" => Some(Self::System),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalActivityEntry {
    pub kind: ActivityKind,
    pub title: String,
    pub body: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataExport {
    pub format_version: i64,
    pub settings: SettingsValues,
    pub activity_entries: Vec<LocalActivityEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocalDataResult {
    pub settings: AppSettings,
    pub imported_activity_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearActivityResult {
    pub deleted_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerNoteSummary {
    pub has_note: bool,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerNoteView {
    pub game_id: i64,
    pub participant_id: i64,
    pub note: Option<String>,
    pub tags: Vec<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearPlayerNoteResult {
    pub cleared: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueClientStatus {
    pub is_running: bool,
    pub lockfile_found: bool,
    pub connection: LeagueClientConnection,
    pub phase: LeagueClientPhase,
    pub message: Option<String>,
}

impl LeagueClientStatus {
    pub fn unavailable(phase: LeagueClientPhase, message: impl Into<String>) -> Self {
        Self {
            is_running: false,
            lockfile_found: false,
            connection: LeagueClientConnection::Unavailable,
            phase,
            message: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LeagueClientConnection {
    Connected,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LeagueClientPhase {
    NotRunning,
    LockfileMissing,
    Connecting,
    Connected,
    Unauthorized,
    NotLoggedIn,
    Patching,
    PartialData,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueSelfSnapshot {
    pub status: LeagueClientStatus,
    pub summoner: Option<CurrentSummonerProfile>,
    pub ranked_queues: Vec<RankedQueueSummary>,
    pub recent_matches: Vec<RecentMatchSummary>,
    pub recent_performance: RecentPerformanceSummary,
    pub data_warnings: Vec<LeagueDataWarning>,
    pub refreshed_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueSelfData {
    pub status: LeagueClientStatus,
    pub summoner: Option<CurrentSummonerProfile>,
    pub ranked_queues: Vec<RankedQueueSummary>,
    pub recent_matches: Vec<RecentMatchSummary>,
    pub data_warnings: Vec<LeagueDataWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueDataWarning {
    pub section: LeagueDataSection,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueImageAsset {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LeagueDataSection {
    Champions,
    Ranked,
    Matches,
    Participants,
    RecentStats,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSummonerProfile {
    pub display_name: String,
    pub summoner_level: i64,
    pub profile_icon_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedQueueSummary {
    pub queue: RankedQueue,
    pub tier: Option<String>,
    pub division: Option<String>,
    pub league_points: Option<i64>,
    pub wins: i64,
    pub losses: i64,
    pub is_ranked: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RankedQueue {
    SoloDuo,
    Flex,
    Other,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentMatchSummary {
    pub game_id: i64,
    pub champion_id: Option<i64>,
    pub champion_name: String,
    pub queue_name: Option<String>,
    pub result: MatchResult,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub kda: Option<f64>,
    pub played_at: Option<String>,
    pub game_duration_seconds: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchResult {
    Win,
    Loss,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentPerformanceSummary {
    pub match_count: usize,
    pub average_kda: Option<f64>,
    pub kda_tag: KdaTag,
    pub recent_champions: Vec<String>,
    pub top_champions: Vec<RecentChampionSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentChampionSummary {
    pub champion_id: Option<i64>,
    pub champion_name: String,
    pub games: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostMatchDetail {
    pub game_id: i64,
    pub queue_name: Option<String>,
    pub played_at: Option<String>,
    pub game_duration_seconds: Option<i64>,
    pub result: MatchResult,
    pub teams: Vec<PostMatchTeam>,
    pub comparison: PostMatchComparison,
    pub warnings: Vec<LeagueDataWarning>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostMatchTeam {
    pub team_id: i64,
    pub result: MatchResult,
    pub participants: Vec<PostMatchParticipant>,
    pub totals: PostMatchTeamTotals,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostMatchParticipant {
    pub participant_id: i64,
    pub team_id: i64,
    pub display_name: String,
    pub champion_id: Option<i64>,
    pub champion_name: String,
    pub role: Option<String>,
    pub lane: Option<String>,
    pub profile_icon_id: Option<i64>,
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
    pub note_summary: PlayerNoteSummary,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostMatchTeamTotals {
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub gold_earned: i64,
    pub damage_to_champions: i64,
    pub vision_score: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostMatchComparison {
    pub highest_kda: Option<ParticipantMetricLeader>,
    pub most_cs: Option<ParticipantMetricLeader>,
    pub most_gold: Option<ParticipantMetricLeader>,
    pub most_damage: Option<ParticipantMetricLeader>,
    pub highest_vision: Option<ParticipantMetricLeader>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantMetricLeader {
    pub participant_id: i64,
    pub display_name: String,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantPublicProfile {
    pub game_id: i64,
    pub participant_id: i64,
    pub display_name: String,
    pub profile_icon_id: Option<i64>,
    pub recent_stats: Option<ParticipantRecentStats>,
    pub note: Option<PlayerNoteView>,
    pub warnings: Vec<LeagueDataWarning>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantRecentStats {
    pub match_count: usize,
    pub average_kda: Option<f64>,
    pub recent_champions: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum KdaTag {
    High,
    Standard,
    Unavailable,
}
