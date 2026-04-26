use std::time::Duration;

pub(crate) const LOCAL_LCU_HOST: &str = "127.0.0.1";
pub(crate) const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
pub(crate) const LEAGUE_CLIENT_PROCESSES: [&str; 2] = ["LeagueClientUx.exe", "LeagueClient.exe"];
pub(crate) const PROFILE_ICON_MIME: &str = "image/jpeg";
pub(crate) const CHAMPION_ICON_MIME: &str = "image/png";
pub(crate) const GAME_ASSET_MIME: &str = "image/png";
pub(crate) const MAX_COMPLETED_MATCH_SCAN: i64 = 20;
pub(crate) const RANKED_CHAMPION_REMOTE_TIMEOUT: Duration = Duration::from_secs(5);
pub(crate) const RANKED_CHAMPION_FORMAT_VERSION: i64 = 1;
