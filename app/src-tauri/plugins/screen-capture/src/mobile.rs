use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use crate::error::Result;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_screen_capture);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<()> {
    log::info!("[ScreenCapture] iOS mobile plugin initialized");
    // The ios_plugin_binding! macro handles registration automatically
    Ok(())
}

pub async fn start_capture<R: Runtime>(
    _app: &AppHandle<R>,
) -> Result<bool> {
    log::info!("[ScreenCapture] start_capture - Swift will handle this");
    // Swift plugin handles this automatically
    Ok(true)
}

pub async fn stop_capture<R: Runtime>(_app: &AppHandle<R>) -> Result<()> {
    log::info!("[ScreenCapture] stop_capture - Swift will handle this");
    // Swift plugin handles this automatically
    Ok(())
}

pub async fn get_frame<R: Runtime>(_app: &AppHandle<R>) -> Result<String> {
    log::debug!("[ScreenCapture] get_frame - Swift will handle this");
    // Swift plugin handles this automatically
    Ok(String::new())
}
