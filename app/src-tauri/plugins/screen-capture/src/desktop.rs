use tauri::{plugin::PluginApi, AppHandle, Runtime};
use crate::{commands::CaptureConfig, error::Result};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<()> {
    // Desktop doesn't support this plugin
    Ok(())
}

pub async fn start_capture(_config: CaptureConfig) -> Result<bool> {
    Err(crate::Error::NotAvailable)
}

pub async fn stop_capture() -> Result<()> {
    Err(crate::Error::NotAvailable)
}

pub async fn get_frame() -> Result<String> {
    Err(crate::Error::NotAvailable)
}
