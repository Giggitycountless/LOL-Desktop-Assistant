use tauri::State;

#[tauri::command]
fn healthcheck(state: State<'_, platform::AppState>) -> domain::HealthReport {
    platform::healthcheck(state.inner())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| platform::setup_app(app))
        .invoke_handler(tauri::generate_handler![healthcheck])
        .run(tauri::generate_context!())
        .expect("failed to run LoL Desktop Assistant");
}
