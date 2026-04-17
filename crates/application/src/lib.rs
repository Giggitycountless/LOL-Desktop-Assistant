use domain::{DatabaseStatus, HealthReport, ServiceStatus};

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
