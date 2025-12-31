use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use crate::{commands::CaptureConfig, error::Result};

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<()> {
    // Mobile initialization
    log::info!("Screen capture plugin initialized for mobile");
    Ok(())
}

/// Start screen capture with given config
pub async fn start_capture<R: Runtime>(
    app: &AppHandle<R>,
    config: CaptureConfig,
) -> Result<bool> {
    log::info!("Calling native startCapture with config: {:?}", config);

    app.plugin_api()
        .run_mobile_plugin("startCapture", config)
        .map_err(|e| crate::Error::Platform(e.to_string()))
}

/// Stop screen capture
pub async fn stop_capture<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    log::info!("Calling native stopCapture");

    app.plugin_api()
        .run_mobile_plugin::<()>("stopCapture", ())
        .map_err(|e| crate::Error::Platform(e.to_string()))
}

/// Get the latest captured frame as base64
pub async fn get_frame<R: Runtime>(app: &AppHandle<R>) -> Result<String> {
    log::debug!("Calling native getFrame");

    app.plugin_api()
        .run_mobile_plugin("getFrame", ())
        .map_err(|e| crate::Error::Platform(e.to_string()))
}
