use std::{error::Error, fmt};

use domain::{
    ActivityEntry, ActivityKind, AppSettings, AppSnapshot, DatabaseStatus, HealthReport,
    NewActivityEntry, ServiceStatus, SettingsValues, StartupPage,
};

const MIN_ACTIVITY_LIMIT: i64 = 1;
const MAX_ACTIVITY_LIMIT: i64 = 500;
const DEFAULT_ACTIVITY_LIMIT: i64 = 100;
const MAX_ACTIVITY_TITLE_LEN: usize = 120;
const MAX_ACTIVITY_BODY_LEN: usize = 4_000;

pub trait AppStore {
    fn schema_version(&self) -> Result<i64, String>;
    fn get_settings(&self) -> Result<AppSettings, String>;
    fn save_settings(&self, settings: SettingsValues) -> Result<AppSettings, String>;
    fn list_activity_entries(&self, limit: i64) -> Result<Vec<ActivityEntry>, String>;
    fn create_activity_entry(&self, entry: NewActivityEntry) -> Result<ActivityEntry, String>;
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
pub enum ApplicationError {
    Validation(String),
    Storage(String),
}

impl ApplicationError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "validation",
            Self::Storage(_) => "storage",
        }
    }
}

impl fmt::Display for ApplicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation(message) | Self::Storage(message) => formatter.write_str(message),
        }
    }
}

impl Error for ApplicationError {}

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

pub fn app_snapshot(store: &impl AppStore) -> Result<AppSnapshot, ApplicationError> {
    let schema_version = store.schema_version().map_err(ApplicationError::Storage)?;
    let settings = get_settings(store)?;
    let recent_activity = list_activity_entries(
        store,
        ActivityListInput {
            limit: Some(settings.activity_limit),
        },
    )?
    .records;

    Ok(AppSnapshot {
        health: health_report(DatabaseStatus::Ok, Some(schema_version)),
        settings,
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
        .list_activity_entries(limit)
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

fn validate_settings(input: SettingsInput) -> Result<SettingsValues, ApplicationError> {
    let startup_page = StartupPage::parse(input.startup_page.as_str()).ok_or_else(|| {
        ApplicationError::Validation("Startup page must be dashboard, activity, or settings".into())
    })?;

    Ok(SettingsValues {
        startup_page,
        compact_mode: input.compact_mode,
        activity_limit: normalize_activity_limit(input.activity_limit)?,
    })
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

#[cfg(test)]
mod tests {
    use super::*;
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

    struct FakeStore {
        settings: RefCell<AppSettings>,
        created_entries: RefCell<Vec<NewActivityEntry>>,
    }

    impl FakeStore {
        fn new(settings: AppSettings) -> Self {
            Self {
                settings: RefCell::new(settings),
                created_entries: RefCell::new(Vec::new()),
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

        fn list_activity_entries(&self, _limit: i64) -> Result<Vec<ActivityEntry>, String> {
            Ok(Vec::new())
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
    }

    fn default_settings() -> AppSettings {
        AppSettings {
            startup_page: StartupPage::Dashboard,
            compact_mode: false,
            activity_limit: 100,
            updated_at: "2026-04-18 00:00:00".to_string(),
        }
    }
}
