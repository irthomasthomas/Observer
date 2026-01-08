// frame_server.rs - Localhost HTTP server for receiving broadcast frames

use axum::{
    extract::State,
    routing::post,
    Router,
    body::Bytes,
};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

/// Shared state holding the latest frame received from broadcast extension
#[derive(Clone)]
pub struct ServerState {
    pub latest_frame: Arc<RwLock<Option<(Vec<u8>, f64)>>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            latest_frame: Arc::new(RwLock::new(None)),
        }
    }
}

/// Handle incoming frame data from broadcast extension
async fn handle_frame(
    State(state): State<ServerState>,
    body: Bytes,
) -> &'static str {
    // Swift sends raw JPEG bytes - Rust adds timestamp
    let frame_data = body.to_vec();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64();

    eprintln!("📸 Received frame: {} bytes", frame_data.len());

    // Store latest frame with timestamp (overwrite old one to save memory)
    let mut frame = state.latest_frame.write().await;
    *frame = Some((frame_data, timestamp));

    "OK"
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
        .route("/health", axum::routing::get(health_check))
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
