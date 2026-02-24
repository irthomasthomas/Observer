use crate::error::Result;
use crate::targets::{self, CaptureTarget, TargetKind};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ImageBuffer, RgbaImage};
use parking_lot::Mutex;
use screencapturekit::prelude::*;
use screencapturekit::cv::CVPixelBufferLockFlags;
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

// Capture settings - optimized for performance
const JPEG_QUALITY: u8 = 50; // Lower quality for smaller files
const MAX_WIDTH: u32 = 1280; // Max width for captured frames
const TARGET_FPS: i32 = 10; // 10fps is plenty for screen capture

/// Shared capture state accessible across async contexts
struct CaptureState {
    /// Whether capture is currently active
    is_active: AtomicBool,
    /// Total frames captured
    frame_count: AtomicU64,
    /// Currently selected capture target (None = primary monitor)
    selected_target: Mutex<Option<String>>,
    /// Active SCStream instance
    active_stream: Mutex<Option<SCStream>>,
}

/// Global capture state - initialized on first use
static CAPTURE_STATE: std::sync::OnceLock<Arc<CaptureState>> = std::sync::OnceLock::new();

fn get_capture_state() -> Arc<CaptureState> {
    CAPTURE_STATE
        .get_or_init(|| {
            Arc::new(CaptureState {
                is_active: AtomicBool::new(false),
                frame_count: AtomicU64::new(0),
                selected_target: Mutex::new(None),
                active_stream: Mutex::new(None),
            })
        })
        .clone()
}

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<()> {
    log::info!("[ScreenCapture] macOS plugin initialized with ScreenCaptureKit");
    Ok(())
}

pub async fn stop_capture() -> Result<()> {
    let state = get_capture_state();

    if !state.is_active.load(Ordering::SeqCst) {
        log::info!("[ScreenCapture] Capture not active");
        return Ok(());
    }

    log::info!("[ScreenCapture] Stopping capture...");

    // Mark as inactive FIRST to prevent race condition on restart
    state.is_active.store(false, Ordering::SeqCst);

    // Stop and remove the stream
    if let Some(stream) = state.active_stream.lock().take() {
        if let Err(e) = stream.stop_capture() {
            log::warn!("[ScreenCapture] Error stopping stream: {}", e);
        }
    }

    // Clear the selected target
    {
        let mut target = state.selected_target.lock();
        *target = None;
    }

    log::info!("[ScreenCapture] Capture stopped");
    Ok(())
}

/// Get broadcast status
pub fn get_broadcast_status() -> Result<serde_json::Value> {
    let state = get_capture_state();

    let is_active = state.is_active.load(Ordering::SeqCst);
    let frame_count = state.frame_count.load(Ordering::SeqCst);
    let selected_target = state.selected_target.lock().clone();

    Ok(serde_json::json!({
        "isActive": is_active,
        "frameCount": frame_count,
        "targetId": selected_target
    }))
}

/// Get all available capture targets
pub fn get_capture_targets(include_thumbnails: bool) -> Result<Vec<CaptureTarget>> {
    // For now, use xcap for target enumeration
    // This could be refactored to use SCShareableContent in the future
    targets::get_all_targets(include_thumbnails)
}

/// Start capture with channel-based streaming (push instead of poll)
/// Frames are pushed to the frontend as they're captured via ScreenCaptureKit callbacks
pub fn start_capture_stream(
    target_id: Option<String>,
    on_frame: Channel<FrameData>,
) -> Result<()> {
    let state = get_capture_state();

    log::info!("[ScreenCapture] Starting ScreenCaptureKit capture with target: {:?}", target_id);

    // Stop any existing capture
    if state.is_active.load(Ordering::SeqCst) {
        log::info!("[ScreenCapture] Stopping existing capture...");
        state.is_active.store(false, Ordering::SeqCst);
        if let Some(stream) = state.active_stream.lock().take() {
            if let Err(e) = stream.stop_capture() {
                log::warn!("[ScreenCapture] Error stopping stream: {}", e);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // Update selected target
    {
        let mut target = state.selected_target.lock();
        *target = target_id.clone();
    }

    // Reset frame count
    state.frame_count.store(0, Ordering::SeqCst);

    // Get shareable content
    log::info!("[ScreenCapture] Getting shareable content...");
    let content = SCShareableContent::get().map_err(|e| {
        log::error!("[ScreenCapture] Failed to get shareable content: {:?}", e);
        crate::error::Error::Platform(format!("Failed to get shareable content: {:?}", e))
    })?;

    log::info!(
        "[ScreenCapture] Found {} displays, {} windows",
        content.displays().len(),
        content.windows().len()
    );

    // Store displays and windows to avoid lifetime issues
    let displays = content.displays();
    let windows = content.windows();

    // Determine what to capture based on target_id
    let filter = if let Some(id) = &target_id {
        if let Ok((kind, numeric_id)) = targets::parse_target_id(id) {
            match kind {
                TargetKind::Monitor => {
                    let display = displays.iter()
                        .find(|d| d.display_id() == numeric_id)
                        .ok_or_else(|| crate::error::Error::Platform(format!("Display {} not found", numeric_id)))?;

                    log::info!(
                        "[ScreenCapture] Capturing display: {} ({}x{})",
                        display.display_id(),
                        display.width(),
                        display.height()
                    );

                    SCContentFilter::create()
                        .with_display(display)
                        .build()
                }
                TargetKind::Window => {
                    let window = windows.iter()
                        .find(|w| w.window_id() == numeric_id)
                        .ok_or_else(|| crate::error::Error::Platform(format!("Window {} not found", numeric_id)))?;

                    log::info!(
                        "[ScreenCapture] Capturing window: {:?} ({}x{})",
                        window.title(),
                        window.frame().width,
                        window.frame().height
                    );

                    SCContentFilter::create()
                        .with_window(window)
                        .build()
                }
            }
        } else {
            return Err(crate::error::Error::Platform("Invalid target ID format".to_string()));
        }
    } else {
        // Default to first display (typically primary)
        let display = displays
            .first()
            .ok_or_else(|| crate::error::Error::Platform("No displays found".to_string()))?;

        log::info!(
            "[ScreenCapture] Capturing primary display: {} ({}x{}, {}fps)",
            display.display_id(),
            display.width(),
            display.height(),
            TARGET_FPS
        );

        SCContentFilter::create()
            .with_display(display)
            .build()
    };

    // Configure the stream for optimal performance
    let frame_interval = CMTime::new(1, TARGET_FPS);
    let config = SCStreamConfiguration::new()
        .with_width(1920)
        .with_height(1080)
        .with_minimum_frame_interval(&frame_interval)
        .with_pixel_format(PixelFormat::BGRA)
        .with_shows_cursor(true)
        .with_captures_audio(false); // Audio is handled separately

    // Create the stream
    let mut stream = SCStream::new(&filter, &config);

    // Create frame handler closure
    let capture_state = state.clone();

    stream.add_output_handler(
        Box::new(move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
        // Only process screen frames
        if of_type != SCStreamOutputType::Screen {
            return;
        }

        // Get the image buffer from the sample buffer
        let image_buffer = match sample.image_buffer() {
            Some(buf) => buf,
            None => {
                log::error!("[ScreenCapture] No image buffer in sample");
                return;
            }
        };

        // Lock the buffer for read-only access
        let guard = match image_buffer.lock(CVPixelBufferLockFlags::READ_ONLY) {
            Ok(g) => g,
            Err(e) => {
                log::error!("[ScreenCapture] Failed to lock pixel buffer: {}", e);
                return;
            }
        };

        let width = guard.width();
        let height = guard.height();
        let bytes_per_row = guard.bytes_per_row();
        let data = guard.as_slice();

        // ScreenCaptureKit provides BGRA format - convert to RGBA
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

        // Create RgbaImage from the converted data
        let image = match ImageBuffer::from_raw(width as u32, height as u32, rgba_data) {
            Some(img) => img,
            None => {
                log::error!("[ScreenCapture] Failed to create image buffer");
                return;
            }
        };

        // Process and encode the frame
        if let Some(frame_data) = process_frame(&image, &capture_state) {
            // Send through channel
            if let Err(e) = on_frame.send(frame_data) {
                log::error!("[ScreenCapture] Failed to send frame: {:?}", e);
                // Channel closed, capture will be stopped by frontend
            }
        }
    }),
    SCStreamOutputType::Screen,
    );

    // Start capturing
    log::info!("[ScreenCapture] Starting stream capture...");
    if let Err(e) = stream.start_capture() {
        return Err(crate::error::Error::Platform(format!("Failed to start stream: {}", e)));
    }

    // Store the stream
    {
        let mut active_stream = state.active_stream.lock();
        *active_stream = Some(stream);
    }

    // Mark as active
    state.is_active.store(true, Ordering::SeqCst);

    log::info!("[ScreenCapture] ScreenCaptureKit stream started");
    Ok(())
}

/// Process a frame and return FrameData ready for channel transmission
fn process_frame(image: &RgbaImage, capture_state: &Arc<CaptureState>) -> Option<FrameData> {
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

    let current_frame = capture_state.frame_count.fetch_add(1, Ordering::SeqCst);

    if current_frame == 0 {
        log::info!(
            "[ScreenCapture] First frame processed ({}x{}, {} bytes)",
            final_width,
            final_height,
            jpeg_buffer.get_ref().len()
        );
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
