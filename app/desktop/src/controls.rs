// In src-tauri/src/controls.rs

use axum::{extract::State as AxumState, http::StatusCode};
use crate::AppState;

// Desktop-only implementation using Enigo
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use enigo::{Enigo, Mouse, Button, Settings};

/// Handler for /click endpoint
/// Triggers a mouse click at the current cursor position (desktop only)
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub async fn click_handler(
    AxumState(_state): AxumState<AppState>,
) -> StatusCode {
    log::info!("Received click request");

    match Enigo::new(&Settings::default()) {
        Ok(mut enigo) => {
            match enigo.button(Button::Left, enigo::Direction::Click) {
                Ok(_) => {
                    log::info!("Mouse click executed successfully");
                    StatusCode::OK
                }
                Err(e) => {
                    log::error!("Failed to execute mouse click: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                }
            }
        }
        Err(e) => {
            log::error!("Failed to initialize Enigo: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

/// Mobile stub for click handler - not supported on mobile
#[cfg(any(target_os = "android", target_os = "ios"))]
pub async fn click_handler(
    AxumState(_state): AxumState<AppState>,
) -> StatusCode {
    log::warn!("Mouse control not available on mobile");
    StatusCode::NOT_IMPLEMENTED
}
