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

#[derive(Debug, Clone, PartialEq, Eq)]
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewActivityEntry {
    pub kind: ActivityKind,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
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
