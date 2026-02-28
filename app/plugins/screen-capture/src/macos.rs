//! Unified macOS ScreenCaptureKit capture for both video and audio.
//!
//! This module manages a SINGLE SCStream that captures both video and audio.
//! The frontend can independently start/stop video and audio channels,
//! but internally they share the same capture session.
//!
//! This fixes the "stream output NOT found" errors that occurred when
//! running separate video and audio SCStreams.

use crate::error::{Error, Result};
use crate::targets::{self, CaptureTarget, TargetKind};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ImageBuffer, RgbaImage};
use parking_lot::{Mutex, RwLock};
use screencapturekit::cv::CVPixelBufferLockFlags;
use screencapturekit::prelude::*;
use screencapturekit::stream::delegate_trait::StreamCallbacks;
use serde::Serialize;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

/// Frame data sent through the channel to the frontend
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameData {
    /// Base64-encoded JPEG frame
    pub frame: String,
    /// Unix timestamp in seconds
    pub timestamp: f64,
    /// Frame dimensions
    pub width: u32,
    pub height: u32,
    /// Frame sequence number
    pub frame_count: u64,
}

/// Audio data sent through the channel to the frontend
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioData {
    /// Base64-encoded PCM (f32 samples, little-endian, mono)
    pub samples: String,
    /// Unix timestamp in seconds
    pub timestamp: f64,
    /// Sample rate (e.g., 48000)
    pub sample_rate: u32,
    /// Chunk sequence number
    pub chunk_count: u64,
}

// Capture settings
const JPEG_QUALITY: u8 = 50;
const MAX_WIDTH: u32 = 1280;
const TARGET_FPS: i32 = 10;
const AUDIO_SAMPLE_RATE: u32 = 48000;

/// Unified capture state for both video and audio
struct UnifiedCaptureState {
    /// Whether the SCStream is currently running
    is_active: AtomicBool,
    /// Whether video output is requested
    wants_video: AtomicBool,
    /// Whether audio output is requested
    wants_audio: AtomicBool,
    /// Whether the watchdog is running
    watchdog_running: AtomicBool,
    /// Video frame count
    frame_count: AtomicU64,
    /// Audio chunk count
    audio_chunk_count: AtomicU64,
    /// Last time we received ANY callback (video or audio) - for watchdog
    last_callback_epoch_ms: AtomicU64,
    /// Currently selected capture target
    selected_target: Mutex<Option<String>>,
    /// Active SCStream instance
    active_stream: Mutex<Option<SCStream>>,
    /// Video channel (set when video is requested)
    video_channel: RwLock<Option<Channel<FrameData>>>,
    /// Audio channel (set when audio is requested)
    audio_channel: RwLock<Option<Channel<AudioData>>>,
}

static CAPTURE_STATE: std::sync::OnceLock<Arc<UnifiedCaptureState>> = std::sync::OnceLock::new();

fn get_capture_state() -> Arc<UnifiedCaptureState> {
    CAPTURE_STATE
        .get_or_init(|| {
            Arc::new(UnifiedCaptureState {
                is_active: AtomicBool::new(false),
                wants_video: AtomicBool::new(false),
                wants_audio: AtomicBool::new(false),
                watchdog_running: AtomicBool::new(false),
                frame_count: AtomicU64::new(0),
                audio_chunk_count: AtomicU64::new(0),
                last_callback_epoch_ms: AtomicU64::new(0),
                selected_target: Mutex::new(None),
                active_stream: Mutex::new(None),
                video_channel: RwLock::new(None),
                audio_channel: RwLock::new(None),
            })
        })
        .clone()
}

fn current_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Watchdog timeout - if no callbacks for this long, stream is dead
const WATCHDOG_TIMEOUT_MS: u64 = 2000; // 2 seconds

/// Start watchdog that monitors stream health and auto-restarts if dead
fn start_watchdog(state: Arc<UnifiedCaptureState>) {
    // Only start one watchdog
    if state.watchdog_running.swap(true, Ordering::SeqCst) {
        log::info!("[ScreenCapture] Watchdog already running, not starting another");
        return;
    }

    std::thread::spawn(move || {
        log::info!("[ScreenCapture] Watchdog started");

        loop {
            std::thread::sleep(std::time::Duration::from_millis(1000));

            // Check if we should still be running
            let wants_video = state.wants_video.load(Ordering::SeqCst);
            let wants_audio = state.wants_audio.load(Ordering::SeqCst);

            if !wants_video && !wants_audio {
                log::info!("[ScreenCapture] Watchdog exiting (no streams wanted)");
                break;
            }

            let is_active = state.is_active.load(Ordering::SeqCst);
            if !is_active {
                log::warn!("[ScreenCapture] Watchdog: stream not active, attempting restart...");

                // Try to restart
                let target_id = state.selected_target.lock().clone();
                if let Err(e) = restart_capture(&state, target_id) {
                    log::error!("[ScreenCapture] Watchdog: restart failed: {:?}", e);
                }
                continue;
            }

            // Check last callback time
            let last_callback = state.last_callback_epoch_ms.load(Ordering::SeqCst);
            let now = current_epoch_ms();

            if last_callback > 0 && now - last_callback > WATCHDOG_TIMEOUT_MS {
                log::warn!(
                    "[ScreenCapture] Watchdog: no callbacks for {}ms, stream appears dead. Restarting...",
                    now - last_callback
                );

                // Mark as inactive and restart
                state.is_active.store(false, Ordering::SeqCst);

                // Take and drop the old stream
                if let Some(old_stream) = state.active_stream.lock().take() {
                    let _ = old_stream.stop_capture(); // Ignore error, it's probably already dead
                }

                // Restart
                let target_id = state.selected_target.lock().clone();
                if let Err(e) = restart_capture(&state, target_id) {
                    log::error!("[ScreenCapture] Watchdog: restart failed: {:?}", e);
                } else {
                    log::info!("[ScreenCapture] Watchdog: stream restarted successfully");
                }
            }
        }

        // Mark watchdog as stopped
        state.watchdog_running.store(false, Ordering::SeqCst);
        log::info!("[ScreenCapture] Watchdog stopped");
    });
}

/// Internal restart function (called by watchdog)
fn restart_capture(state: &Arc<UnifiedCaptureState>, target_id: Option<String>) -> Result<()> {
    // Reset callback timestamp
    state.last_callback_epoch_ms.store(0, Ordering::SeqCst);

    // Start capture (ensure_capture_running will create new stream)
    ensure_capture_running(state, target_id)
}

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<()> {
    log::info!("[ScreenCapture] macOS unified capture initialized (ScreenCaptureKit)");
    Ok(())
}

/// Get all available capture targets
pub fn get_capture_targets(include_thumbnails: bool) -> Result<Vec<CaptureTarget>> {
    targets::get_all_targets(include_thumbnails)
}

/// Start video capture stream
/// If capture is already running (for audio), reuses the existing stream
pub fn start_capture_stream(
    target_id: Option<String>,
    on_frame: Channel<FrameData>,
) -> Result<()> {
    let state = get_capture_state();

    log::info!("[ScreenCapture] Starting video stream with target: {:?}", target_id);

    // Store the video channel
    {
        let mut channel = state.video_channel.write();
        *channel = Some(on_frame);
    }
    state.wants_video.store(true, Ordering::SeqCst);
    state.frame_count.store(0, Ordering::SeqCst);

    // Update target if provided
    if target_id.is_some() {
        let mut target = state.selected_target.lock();
        *target = target_id.clone();
    }

    // Start the unified capture if not already running
    ensure_capture_running(&state, target_id)?;

    log::info!("[ScreenCapture] Video stream started");
    Ok(())
}

/// Start audio capture stream
/// If capture is already running (for video), reuses the existing stream
pub fn start_audio_stream(on_audio: Channel<AudioData>) -> Result<()> {
    let state = get_capture_state();

    log::info!("[ScreenCapture] Starting audio stream");

    // Store the audio channel
    {
        let mut channel = state.audio_channel.write();
        *channel = Some(on_audio);
    }
    state.wants_audio.store(true, Ordering::SeqCst);
    state.audio_chunk_count.store(0, Ordering::SeqCst);

    // Start the unified capture if not already running
    let target_id = state.selected_target.lock().clone();
    ensure_capture_running(&state, target_id)?;

    log::info!("[ScreenCapture] Audio stream started");
    Ok(())
}

/// Stop video capture
/// Only tears down SCStream if audio is also stopped
pub async fn stop_capture() -> Result<()> {
    let state = get_capture_state();

    log::info!("[ScreenCapture] Stopping video stream...");

    // Clear video channel and mark as not wanted
    {
        let mut channel = state.video_channel.write();
        *channel = None;
    }
    state.wants_video.store(false, Ordering::SeqCst);

    // Check if we should tear down the stream
    maybe_stop_capture(&state);

    log::info!("[ScreenCapture] Video stream stopped");
    Ok(())
}

/// Stop audio capture
/// Only tears down SCStream if video is also stopped
pub fn stop_audio() -> Result<()> {
    let state = get_capture_state();

    log::info!("[ScreenCapture] Stopping audio stream...");

    // Clear audio channel and mark as not wanted
    {
        let mut channel = state.audio_channel.write();
        *channel = None;
    }
    state.wants_audio.store(false, Ordering::SeqCst);

    // Check if we should tear down the stream
    maybe_stop_capture(&state);

    log::info!("[ScreenCapture] Audio stream stopped");
    Ok(())
}

/// Check if audio capture is currently active
pub fn is_audio_active() -> bool {
    let state = get_capture_state();
    state.wants_audio.load(Ordering::SeqCst) && state.is_active.load(Ordering::SeqCst)
}

/// Get broadcast status
pub fn get_broadcast_status() -> Result<serde_json::Value> {
    let state = get_capture_state();

    Ok(serde_json::json!({
        "isActive": state.is_active.load(Ordering::SeqCst),
        "wantsVideo": state.wants_video.load(Ordering::SeqCst),
        "wantsAudio": state.wants_audio.load(Ordering::SeqCst),
        "frameCount": state.frame_count.load(Ordering::SeqCst),
        "audioChunkCount": state.audio_chunk_count.load(Ordering::SeqCst),
        "targetId": state.selected_target.lock().clone()
    }))
}

/// Ensure the unified capture is running
fn ensure_capture_running(
    state: &Arc<UnifiedCaptureState>,
    target_id: Option<String>,
) -> Result<()> {
    // If already running, nothing to do
    if state.is_active.load(Ordering::SeqCst) {
        log::info!("[ScreenCapture] Capture already running, reusing existing stream");
        return Ok(());
    }

    log::info!("[ScreenCapture] Starting unified ScreenCaptureKit capture...");

    // Get shareable content
    let content = SCShareableContent::get().map_err(|e| {
        log::error!("[ScreenCapture] Failed to get shareable content: {:?}", e);
        Error::Platform(format!("Failed to get shareable content: {:?}", e))
    })?;

    log::info!(
        "[ScreenCapture] Found {} displays, {} windows",
        content.displays().len(),
        content.windows().len()
    );

    let displays = content.displays();
    let windows = content.windows();

    // Build content filter
    let filter = if let Some(id) = &target_id {
        if let Ok((kind, numeric_id)) = targets::parse_target_id(id) {
            match kind {
                TargetKind::Monitor => {
                    let display = displays
                        .iter()
                        .find(|d| d.display_id() == numeric_id)
                        .ok_or_else(|| Error::Platform(format!("Display {} not found", numeric_id)))?;

                    log::info!(
                        "[ScreenCapture] Capturing display: {} ({}x{})",
                        display.display_id(),
                        display.width(),
                        display.height()
                    );

                    SCContentFilter::create().with_display(display).build()
                }
                TargetKind::Window => {
                    let window = windows
                        .iter()
                        .find(|w| w.window_id() == numeric_id)
                        .ok_or_else(|| Error::Platform(format!("Window {} not found", numeric_id)))?;

                    log::info!(
                        "[ScreenCapture] Capturing window: {:?}",
                        window.title()
                    );

                    SCContentFilter::create().with_window(window).build()
                }
            }
        } else {
            return Err(Error::Platform("Invalid target ID format".to_string()));
        }
    } else {
        let display = displays
            .first()
            .ok_or_else(|| Error::Platform("No displays found".to_string()))?;

        log::info!(
            "[ScreenCapture] Capturing primary display: {} ({}x{})",
            display.display_id(),
            display.width(),
            display.height()
        );

        SCContentFilter::create().with_display(display).build()
    };

    // Configure stream for BOTH video and audio
    let frame_interval = CMTime::new(1, TARGET_FPS);
    let config = SCStreamConfiguration::new()
        .with_width(1920)
        .with_height(1080)
        .with_minimum_frame_interval(&frame_interval)
        .with_pixel_format(PixelFormat::BGRA)
        .with_shows_cursor(true)
        .with_captures_audio(true)
        .with_excludes_current_process_audio(false)
        .with_sample_rate(AUDIO_SAMPLE_RATE as i32)
        .with_channel_count(1); // Mono

    // Create delegate to receive stream lifecycle events and errors
    let state_for_delegate = state.clone();
    let delegate = StreamCallbacks::new()
        .on_stop(move |error| {
            if let Some(e) = &error {
                log::error!("[ScreenCapture] SCStream stopped with error: {}", e);
            } else {
                log::info!("[ScreenCapture] SCStream stopped normally");
            }
            // Mark stream as inactive so we know it died
            state_for_delegate.is_active.store(false, Ordering::SeqCst);
        })
        .on_error(|error| {
            log::error!("[ScreenCapture] SCStream error: {}", error);
        });

    // Create the stream WITH delegate for error callbacks
    let mut stream = SCStream::new_with_delegate(&filter, &config, delegate);

    // Clone state for closures
    let state_for_video = state.clone();
    let state_for_audio = state.clone();
    let start_time = std::time::Instant::now();

    // Add VIDEO output handler
    stream.add_output_handler(
        Box::new(move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
            if of_type != SCStreamOutputType::Screen {
                return;
            }

            // Track that we received a callback (for watchdog)
            state_for_video.last_callback_epoch_ms.store(current_epoch_ms(), Ordering::SeqCst);

            // IMPORTANT: Always "consume" the frame by accessing the image buffer.
            // ScreenCaptureKit stops the stream if video frames aren't being consumed,
            // even when we only want audio. This keeps the stream alive.
            let image_buffer = match sample.image_buffer() {
                Some(buf) => buf,
                None => return,
            };

            let guard = match image_buffer.lock(CVPixelBufferLockFlags::READ_ONLY) {
                Ok(g) => g,
                Err(_) => return,
            };

            // If video isn't wanted, just touch the data to "consume" the frame and return
            if !state_for_video.wants_video.load(Ordering::SeqCst) {
                // Touch first byte to ensure frame is "consumed" by ScreenCaptureKit
                let _ = guard.as_slice().first();

                // Log periodically to confirm stream is still alive
                let dummy_count = state_for_video.frame_count.fetch_add(1, Ordering::SeqCst) + 1;
                if dummy_count % 100 == 0 {
                    log::info!(
                        "[ScreenCapture] Video frames consumed (audio-only mode): {} frames",
                        dummy_count
                    );
                }
                return;
            }

            // Get the channel (if available)
            let channel_guard = state_for_video.video_channel.read();
            let channel = match channel_guard.as_ref() {
                Some(c) => c,
                None => return,
            };

            let width = guard.width();
            let height = guard.height();
            let bytes_per_row = guard.bytes_per_row();
            let data = guard.as_slice();

            // Convert BGRA to RGBA
            let mut rgba_data = Vec::with_capacity(width * height * 4);
            for y in 0..height {
                let row_start = y * bytes_per_row;
                for x in 0..width {
                    let pixel_offset = row_start + x * 4;
                    if pixel_offset + 3 < data.len() {
                        let b = data[pixel_offset];
                        let g = data[pixel_offset + 1];
                        let r = data[pixel_offset + 2];
                        let a = data[pixel_offset + 3];
                        rgba_data.push(r);
                        rgba_data.push(g);
                        rgba_data.push(b);
                        rgba_data.push(a);
                    }
                }
            }

            let image: RgbaImage = match ImageBuffer::from_raw(width as u32, height as u32, rgba_data) {
                Some(img) => img,
                None => return,
            };

            // Process and encode
            if let Some(frame_data) = process_frame(&image, &state_for_video) {
                if let Err(e) = channel.send(frame_data) {
                    log::error!("[ScreenCapture] Failed to send video frame: {:?}", e);
                }
            }
        }),
        SCStreamOutputType::Screen,
    );

    // Add AUDIO output handler
    stream.add_output_handler(
        Box::new(move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
            if of_type != SCStreamOutputType::Audio {
                return;
            }

            // Track that we received a callback (for watchdog)
            state_for_audio.last_callback_epoch_ms.store(current_epoch_ms(), Ordering::SeqCst);

            // Only process if audio is wanted
            if !state_for_audio.wants_audio.load(Ordering::SeqCst) {
                return;
            }

            // Get the channel (if available)
            let channel_guard = state_for_audio.audio_channel.read();
            let channel = match channel_guard.as_ref() {
                Some(c) => c,
                None => return,
            };

            let count = state_for_audio.audio_chunk_count.fetch_add(1, Ordering::SeqCst) + 1;
            let elapsed_secs = start_time.elapsed().as_secs();

            if count == 1 {
                log::info!("[ScreenCapture] First audio sample received");
            }

            if count % 500 == 0 {
                log::info!(
                    "[ScreenCapture] Audio stream alive: {} chunks, {}s elapsed",
                    count,
                    elapsed_secs
                );
            }

            // Extract audio data
            let audio_buffer_list = match sample.audio_buffer_list() {
                Some(list) => list,
                None => return,
            };

            let audio_buffer = match audio_buffer_list.buffer(0) {
                Some(buf) => buf,
                None => return,
            };

            let data_bytes = audio_buffer.data();
            if data_bytes.is_empty() {
                return;
            }

            // Convert to f32 samples
            let mono_samples = unsafe {
                std::slice::from_raw_parts(
                    data_bytes.as_ptr() as *const f32,
                    data_bytes.len() / 4,
                )
            };

            let bytes: Vec<u8> = mono_samples
                .iter()
                .flat_map(|&sample| sample.to_le_bytes())
                .collect();

            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs_f64();

            let audio_payload = AudioData {
                samples: STANDARD.encode(&bytes),
                timestamp,
                sample_rate: AUDIO_SAMPLE_RATE,
                chunk_count: count,
            };

            if count == 1 {
                log::info!(
                    "[ScreenCapture] First audio chunk sent ({} samples, {} bytes)",
                    mono_samples.len(),
                    bytes.len()
                );
            }

            if let Err(e) = channel.send(audio_payload) {
                log::error!("[ScreenCapture] Failed to send audio data: {:?}", e);
            }
        }),
        SCStreamOutputType::Audio,
    );

    // Start capturing
    log::info!("[ScreenCapture] Starting unified stream capture...");
    if let Err(e) = stream.start_capture() {
        return Err(Error::Platform(format!("Failed to start stream: {}", e)));
    }

    // Store the stream
    {
        let mut active_stream = state.active_stream.lock();
        *active_stream = Some(stream);
    }

    state.is_active.store(true, Ordering::SeqCst);

    // Start watchdog to auto-restart if stream dies silently
    start_watchdog(state.clone());

    log::info!("[ScreenCapture] Unified ScreenCaptureKit stream started (video+audio)");
    Ok(())
}

/// Stop capture if neither video nor audio is needed
fn maybe_stop_capture(state: &Arc<UnifiedCaptureState>) {
    let wants_video = state.wants_video.load(Ordering::SeqCst);
    let wants_audio = state.wants_audio.load(Ordering::SeqCst);

    if wants_video || wants_audio {
        log::info!(
            "[ScreenCapture] Not stopping stream: wants_video={}, wants_audio={}",
            wants_video,
            wants_audio
        );
        return;
    }

    if !state.is_active.load(Ordering::SeqCst) {
        return;
    }

    log::info!("[ScreenCapture] Stopping unified capture (neither video nor audio needed)...");

    state.is_active.store(false, Ordering::SeqCst);

    if let Some(stream) = state.active_stream.lock().take() {
        if let Err(e) = stream.stop_capture() {
            log::warn!("[ScreenCapture] Error stopping stream: {}", e);
        }
    }

    // Clear target
    {
        let mut target = state.selected_target.lock();
        *target = None;
    }

    log::info!("[ScreenCapture] Unified capture stopped");
}

/// Process a frame and return FrameData
fn process_frame(image: &RgbaImage, state: &Arc<UnifiedCaptureState>) -> Option<FrameData> {
    let width = image.width();
    let height = image.height();

    // Downscale if too large
    let resized = if width > MAX_WIDTH {
        let scale = MAX_WIDTH as f32 / width as f32;
        let new_height = (height as f32 * scale) as u32;
        image::imageops::resize(image, MAX_WIDTH, new_height, FilterType::Nearest)
    } else {
        image.clone()
    };

    let final_width = resized.width();
    let final_height = resized.height();

    // Convert RGBA to RGB
    let rgba_bytes = resized.as_raw();
    let mut rgb_bytes = Vec::with_capacity((final_width * final_height * 3) as usize);
    for chunk in rgba_bytes.chunks_exact(4) {
        rgb_bytes.push(chunk[0]);
        rgb_bytes.push(chunk[1]);
        rgb_bytes.push(chunk[2]);
    }

    // Encode to JPEG
    let mut jpeg_buffer = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_buffer, JPEG_QUALITY);

    if let Err(e) = encoder.encode(&rgb_bytes, final_width, final_height, image::ExtendedColorType::Rgb8) {
        log::error!("[ScreenCapture] Failed to encode JPEG: {:?}", e);
        return None;
    }

    let current_frame = state.frame_count.fetch_add(1, Ordering::SeqCst);

    if current_frame == 0 {
        log::info!(
            "[ScreenCapture] First video frame processed ({}x{}, {} bytes)",
            final_width,
            final_height,
            jpeg_buffer.get_ref().len()
        );
    }

    if current_frame % 100 == 0 && current_frame > 0 {
        log::info!("[ScreenCapture] Video stream alive: {} frames", current_frame);
    }

    let jpeg_bytes = jpeg_buffer.into_inner();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();

    Some(FrameData {
        frame: STANDARD.encode(&jpeg_bytes),
        timestamp,
        width: final_width,
        height: final_height,
        frame_count: current_frame,
    })
}
