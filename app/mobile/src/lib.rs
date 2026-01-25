use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};
use base64::Engine;

mod frame_server;
use frame_server::{ServerState, start_server};

pub struct AppSettings {
    pub ollama_url: Mutex<Option<String>>,
}

#[tauri::command]
async fn set_ollama_url(
    new_url: Option<String>,
    settings: State<'_, AppSettings>,
) -> Result<(), String> {
    *settings.ollama_url.lock().unwrap() = new_url;
    Ok(())
}

#[tauri::command]
async fn get_ollama_url(
    settings: State<'_, AppSettings>,
) -> Result<Option<String>, String> {
    Ok(settings.ollama_url.lock().unwrap().clone())
}

/// Unified command: returns broadcast state + latest frame in one call
#[tauri::command]
async fn get_broadcast_status(
    state: State<'_, ServerState>
) -> Result<serde_json::Value, String> {
    let broadcast = state.broadcast.read().await;
    let frame = state.latest_frame.read().await;

    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64();

    // Consider stale if active but no frames for >3 seconds
    let is_stale = broadcast.is_active && broadcast.last_frame_at
        .map(|t| current_time - t > 3.0)
        .unwrap_or(true);

    // Build frame data if available
    let (frame_base64, frame_timestamp) = match frame.as_ref() {
        Some((data, timestamp)) => {
            let base64 = base64::prelude::BASE64_STANDARD.encode(data);
            (Some(base64), Some(*timestamp))
        }
        None => (None, None)
    };

    Ok(serde_json::json!({
        "isActive": broadcast.is_active,
        "isStale": is_stale,
        "frame": frame_base64,
        "timestamp": frame_timestamp,
        "frameCount": broadcast.frame_count
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // EARLY LOG - Check if app is starting
    eprintln!("🚀🚀🚀 OBSERVER APP STARTING 🚀🚀🚀");

    // Initialize server state for broadcast frames
    let server_state = ServerState::new();
    let server_state_for_setup = server_state.clone();

    eprintln!("📦 ServerState created, spawning frame server...");

    tauri::Builder::default()
        .plugin(tauri_plugin_screen_capture::init())
        .plugin(tauri_plugin_pip::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_edge_to_edge::init())
        .setup(move |app| {
            app.manage(AppSettings {
                ollama_url: Mutex::new(Some("http://localhost:11434".to_string())),
            });

            // Start HTTP server in background using Tauri's async runtime
            eprintln!("🌐 About to spawn frame server task...");
            let server_state_clone = server_state_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                eprintln!("🔥 Frame server task starting...");
                start_server(server_state_clone).await;
                eprintln!("⚠️ Frame server task ended (this shouldn't happen)");
            });
            eprintln!("✅ Frame server task spawned");

            Ok(())
        })
        .manage(server_state) // Make state available to commands
        .invoke_handler(tauri::generate_handler![
            set_ollama_url,
            get_ollama_url,
            get_broadcast_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
