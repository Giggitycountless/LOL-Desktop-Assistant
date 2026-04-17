use domain::{DatabaseStatus, HealthReport, ServiceStatus};

pub fn health_report(schema_version: Option<i64>) -> HealthReport {
    HealthReport {
        status: ServiceStatus::Ok,
        database_status: DatabaseStatus::Ok,
        schema_version,
    }
}
