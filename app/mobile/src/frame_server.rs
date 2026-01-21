// frame_server.rs - Localhost HTTP server for receiving broadcast frames

use axum::{
    extract::State,
    routing::{get, post},
    Router,
    body::Bytes,
    Json,
};
use serde::Serialize;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

/// Broadcast lifecycle state
#[derive(Clone, Default)]
pub struct BroadcastState {
    pub is_active: bool,
    pub started_at: Option<f64>,
    pub last_frame_at: Option<f64>,
    pub frame_count: u64,
}

/// Shared state holding the latest frame and broadcast status
#[derive(Clone)]
pub struct ServerState {
    pub latest_frame: Arc<RwLock<Option<(Vec<u8>, f64)>>>,
    pub broadcast: Arc<RwLock<BroadcastState>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            latest_frame: Arc::new(RwLock::new(None)),
            broadcast: Arc::new(RwLock::new(BroadcastState::default())),
        }
    }
}

/// Response for broadcast status endpoint
#[derive(Serialize)]
struct BroadcastStatusResponse {
    is_active: bool,
    is_stale: bool,
    started_at: Option<f64>,
    last_frame_at: Option<f64>,
    frame_count: u64,
}

fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
}

/// Handle incoming frame data from broadcast extension
async fn handle_frame(
    State(state): State<ServerState>,
    body: Bytes,
) -> &'static str {
    let frame_data = body.to_vec();
    let timestamp = now();

    // Update broadcast state
    {
        let mut broadcast = state.broadcast.write().await;
        broadcast.last_frame_at = Some(timestamp);
        broadcast.frame_count += 1;
    }

    // Store latest frame with timestamp (overwrite old one to save memory)
    let mut frame = state.latest_frame.write().await;
    *frame = Some((frame_data, timestamp));

    "OK"
}

/// Handle broadcast start event
async fn handle_broadcast_start(State(state): State<ServerState>) -> &'static str {
    let timestamp = now();

    let mut broadcast = state.broadcast.write().await;
    broadcast.is_active = true;
    broadcast.started_at = Some(timestamp);
    broadcast.last_frame_at = None;
    broadcast.frame_count = 0;

    // Clear any stale frame data
    let mut frame = state.latest_frame.write().await;
    *frame = None;

    eprintln!("🎥 Broadcast started");
    "OK"
}

/// Handle broadcast stop event
async fn handle_broadcast_stop(State(state): State<ServerState>) -> &'static str {
    let mut broadcast = state.broadcast.write().await;
    broadcast.is_active = false;

    eprintln!("🎥 Broadcast stopped (received {} frames)", broadcast.frame_count);
    "OK"
}

/// Get broadcast status
async fn handle_broadcast_status(State(state): State<ServerState>) -> Json<BroadcastStatusResponse> {
    let broadcast = state.broadcast.read().await;
    let current_time = now();

    // Consider stale if active but no frames for >3 seconds
    let is_stale = broadcast.is_active && broadcast.last_frame_at
        .map(|t| current_time - t > 3.0)
        .unwrap_or(true);

    Json(BroadcastStatusResponse {
        is_active: broadcast.is_active,
        is_stale,
        started_at: broadcast.started_at,
        last_frame_at: broadcast.last_frame_at,
        frame_count: broadcast.frame_count,
    })
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "Observer frame server running"
}

/// Start the HTTP server on localhost:8080
pub async fn start_server(state: ServerState) {
    eprintln!("Frame server called");
    let app = Router::new()
        .route("/frames", post(handle_frame))
        .route("/broadcast/start", post(handle_broadcast_start))
        .route("/broadcast/stop", post(handle_broadcast_stop))
        .route("/broadcast/status", get(handle_broadcast_status))
        .route("/health", get(health_check))
        .with_state(state);

    eprintln!("Frame server app instantiated");

    let listener = match tokio::net::TcpListener::bind("127.0.0.1:8080").await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind to localhost:8080: {}", e);
            return;
        }
    };

    eprintln!("🚀 Frame server listening on http://127.0.0.1:8080");

    eprintln!("📡 Ready to receive frames from broadcast extension...");

    if let Err(e) = axum::serve(listener, app).await {
        log::error!("Server error: {}", e);
    }
}
