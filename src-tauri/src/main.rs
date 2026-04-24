use tauri::State;

#[tauri::command]
fn healthcheck(state: State<'_, platform::AppState>) -> domain::HealthReport {
    platform::healthcheck(state.inner())
}

#[tauri::command]
fn get_app_state(
    state: State<'_, platform::AppState>,
) -> Result<domain::AppSnapshot, platform::CommandError> {
    platform::get_app_state(state.inner())
}

#[tauri::command]
fn get_settings(
    state: State<'_, platform::AppState>,
) -> Result<domain::AppSettings, platform::CommandError> {
    platform::get_settings(state.inner())
}

#[tauri::command]
fn get_settings_defaults() -> domain::SettingsValues {
    platform::get_settings_defaults()
}

#[tauri::command]
fn save_settings(
    state: State<'_, platform::AppState>,
    input: platform::SaveSettingsCommand,
) -> Result<domain::AppSettings, platform::CommandError> {
    platform::save_settings(state.inner(), input)
}

#[tauri::command]
fn list_activity_entries(
    state: State<'_, platform::AppState>,
    input: platform::ListActivityEntriesCommand,
) -> Result<platform::ActivityEntriesResponse, platform::CommandError> {
    platform::list_activity_entries(state.inner(), input)
}

#[tauri::command]
fn create_activity_note(
    state: State<'_, platform::AppState>,
    input: platform::CreateActivityNoteCommand,
) -> Result<domain::ActivityEntry, platform::CommandError> {
    platform::create_activity_note(state.inner(), input)
}

#[tauri::command]
fn export_local_data(
    state: State<'_, platform::AppState>,
) -> Result<domain::LocalDataExport, platform::CommandError> {
    platform::export_local_data(state.inner())
}

#[tauri::command]
fn import_local_data(
    state: State<'_, platform::AppState>,
    input: platform::ImportLocalDataCommand,
) -> Result<domain::ImportLocalDataResult, platform::CommandError> {
    platform::import_local_data(state.inner(), input)
}

#[tauri::command]
fn clear_activity_entries(
    state: State<'_, platform::AppState>,
    input: platform::ClearActivityEntriesCommand,
) -> Result<domain::ClearActivityResult, platform::CommandError> {
    platform::clear_activity_entries(state.inner(), input)
}

#[tauri::command]
fn get_league_client_status(
    state: State<'_, platform::AppState>,
) -> Result<domain::LeagueClientStatus, platform::CommandError> {
    platform::get_league_client_status(state.inner())
}

#[tauri::command]
fn get_league_self_snapshot(
    state: State<'_, platform::AppState>,
    input: platform::LeagueSelfSnapshotCommand,
) -> Result<domain::LeagueSelfSnapshot, platform::CommandError> {
    platform::get_league_self_snapshot(state.inner(), input)
}

#[tauri::command]
fn get_ranked_champion_stats(
    state: State<'_, platform::AppState>,
    input: platform::RankedChampionStatsCommand,
) -> Result<domain::RankedChampionStatsResponse, platform::CommandError> {
    platform::get_ranked_champion_stats(state.inner(), input)
}

#[tauri::command]
fn refresh_ranked_champion_stats(
    state: State<'_, platform::AppState>,
    input: platform::RefreshRankedChampionStatsCommand,
) -> Result<domain::RankedChampionStatsResponse, platform::CommandError> {
    platform::refresh_ranked_champion_stats(state.inner(), input)
}

#[tauri::command]
fn get_league_profile_icon(
    state: State<'_, platform::AppState>,
    input: platform::LeagueProfileIconCommand,
) -> Result<domain::LeagueImageAsset, platform::CommandError> {
    platform::get_league_profile_icon(state.inner(), input)
}

#[tauri::command]
fn get_league_champion_icon(
    state: State<'_, platform::AppState>,
    input: platform::LeagueChampionIconCommand,
) -> Result<domain::LeagueImageAsset, platform::CommandError> {
    platform::get_league_champion_icon(state.inner(), input)
}

#[tauri::command]
fn get_league_game_asset(
    state: State<'_, platform::AppState>,
    input: platform::LeagueGameAssetCommand,
) -> Result<domain::LeagueGameAsset, platform::CommandError> {
    platform::get_league_game_asset(state.inner(), input)
}

#[tauri::command]
fn get_post_match_detail(
    state: State<'_, platform::AppState>,
    input: platform::PostMatchDetailCommand,
) -> Result<domain::PostMatchDetail, platform::CommandError> {
    platform::get_post_match_detail(state.inner(), input)
}

#[tauri::command]
fn get_post_match_participant_profile(
    state: State<'_, platform::AppState>,
    input: platform::ParticipantPublicProfileCommand,
) -> Result<domain::ParticipantPublicProfile, platform::CommandError> {
    platform::get_post_match_participant_profile(state.inner(), input)
}

#[tauri::command]
fn save_player_note(
    state: State<'_, platform::AppState>,
    input: platform::SavePlayerNoteCommand,
) -> Result<domain::PlayerNoteView, platform::CommandError> {
    platform::save_player_note(state.inner(), input)
}

#[tauri::command]
fn clear_player_note(
    state: State<'_, platform::AppState>,
    input: platform::ClearPlayerNoteCommand,
) -> Result<domain::ClearPlayerNoteResult, platform::CommandError> {
    platform::clear_player_note(state.inner(), input)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| platform::setup_app(app))
        .invoke_handler(tauri::generate_handler![
            healthcheck,
            get_app_state,
            get_settings,
            get_settings_defaults,
            save_settings,
            list_activity_entries,
            create_activity_note,
            export_local_data,
            import_local_data,
            clear_activity_entries,
            get_league_client_status,
            get_league_self_snapshot,
            get_ranked_champion_stats,
            refresh_ranked_champion_stats,
            get_league_profile_icon,
            get_league_champion_icon,
            get_league_game_asset,
            get_post_match_detail,
            get_post_match_participant_profile,
            save_player_note,
            clear_player_note
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LoL Desktop Assistant");
}
