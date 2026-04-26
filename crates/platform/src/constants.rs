use std::time::Duration;

pub(crate) const DEFAULT_RANKED_CHAMPION_DATA_URL: &str = "https://raw.githubusercontent.com/Giggitycountless/LOL-Desktop-Assistant/main/data/ranked-champions/latest.json";
pub(crate) const CHAMP_SELECT_CACHE_TTL: Duration = Duration::from_secs(8);
pub(crate) const RECENT_STATS_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
pub(crate) const RECENT_STATS_FAILURE_CACHE_TTL: Duration = Duration::from_secs(30);
pub(crate) const SUMMONER_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
pub(crate) const SUMMONER_FAILURE_CACHE_TTL: Duration = Duration::from_secs(30);
pub(crate) const CHAMP_SELECT_LIGHT_RECENT_LIMIT: i64 = 0;
pub(crate) const CHAMP_SELECT_HYDRATED_RECENT_LIMIT: i64 = 6;
pub(crate) const CHAMP_SELECT_HYDRATION_DEBOUNCE: Duration = Duration::from_millis(250);
pub(crate) const LEAGUE_EVENT_FALLBACK_POLL: Duration = Duration::from_secs(30);
pub(crate) const GAMEFLOW_PHASE_URI: &str = "/lol-gameflow/v1/gameflow-phase";
pub(crate) const CHAMP_SELECT_SESSION_URI: &str = "/lol-champ-select/v1/session";
