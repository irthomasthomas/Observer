use serde::de::DeserializeOwned;
use tauri::{plugin::{PluginApi, PluginHandle}, AppHandle, Runtime};
use crate::error::Result;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_screen_capture);

// Initialize the mobile plugin and return a handle
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<ScreenCapture<R>> {
    log::info!("[ScreenCapture] iOS mobile plugin initialized");
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_screen_capture)?;
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.plugin.screencapture", "ScreenCapturePlugin")?;
    Ok(ScreenCapture(handle))
}

/// Access to the screen capture APIs
pub struct ScreenCapture<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ScreenCapture<R> {
    pub fn start_capture(&self) -> Result<bool> {
        log::info!("[ScreenCapture] Calling Swift startCapture");
        self.0
            .run_mobile_plugin("startCapture", ())
            .map_err(Into::into)
    }

    pub fn stop_capture(&self) -> Result<()> {
        log::info!("[ScreenCapture] Calling Swift stopCapture");
        self.0
            .run_mobile_plugin("stopCapture", ())
            .map_err(Into::into)
    }

    pub fn get_frame(&self) -> Result<String> {
        log::debug!("[ScreenCapture] Calling Swift getFrame");
        self.0
            .run_mobile_plugin("getFrame", ())
            .map_err(Into::into)
    }
}
