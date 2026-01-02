use std::sync::Mutex;
use tauri::{Manager, State};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_screen_capture::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            app.manage(AppSettings {
                ollama_url: Mutex::new(Some("http://localhost:11434".to_string())),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_ollama_url,
            get_ollama_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
