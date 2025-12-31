use tauri::{
    plugin::{Builder as PluginBuilder, TauriPlugin},
    Manager, Runtime,
};

mod commands;
mod error;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop;
#[cfg(any(target_os = "android", target_os = "ios"))]
mod mobile;

pub use commands::*;
pub use error::{Error, Result};

/// Initializes the screen capture plugin
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("screen-capture")
        .invoke_handler(tauri::generate_handler![
            start_capture_cmd,
            stop_capture_cmd,
            get_frame_cmd
        ])
        .setup(|app, api| {
            #[cfg(any(target_os = "android", target_os = "ios"))]
            mobile::init(app, api)?;

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop::init(app, api)?;

            Ok(())
        })
        .build()
}

// Command handlers that dispatch to platform-specific implementations

#[tauri::command]
async fn start_capture_cmd<R: Runtime>(
    app: tauri::AppHandle<R>,
    config: Option<CaptureConfig>,
) -> Result<bool> {
    let config = config.unwrap_or_default();

    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile::start_capture(&app, config).await;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    return desktop::start_capture(config).await;
}

#[tauri::command]
async fn stop_capture_cmd<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile::stop_capture(&app).await;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    return desktop::stop_capture().await;
}

#[tauri::command]
async fn get_frame_cmd<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile::get_frame(&app).await;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    return desktop::get_frame().await;
}
