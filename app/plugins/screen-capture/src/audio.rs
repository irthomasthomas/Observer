//! Cross-platform system audio capture using cpal.
//!
//! This module captures desktop/system audio (loopback) using cpal's platform-specific backends:
//! - macOS 14.6+: Core Audio loopback via AudioHardwareCreateProcessTap
//! - Windows: WASAPI loopback
//! - Linux: Not yet supported by cpal (show error)

use crate::error::{Error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::sync::Mutex;

/// Audio data sent through the channel to the frontend
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioData {
    /// Base64-encoded PCM (f32 samples, little-endian, interleaved)
    pub samples: String,
    /// Unix timestamp in seconds
    pub timestamp: f64,
    /// Sample rate (e.g., 48000)
    pub sample_rate: u32,
    /// Number of channels (e.g., 2 for stereo)
    pub channels: u16,
    /// Chunk sequence number
    pub chunk_count: u64,
}

/// Shared audio capture state
struct AudioCaptureState {
    /// Whether audio capture is currently active
    is_active: AtomicBool,
}

impl AudioCaptureState {
    fn new() -> Self {
        Self {
            is_active: AtomicBool::new(false),
        }
    }
}

/// Global audio capture state
static AUDIO_STATE: std::sync::OnceLock<Arc<AudioCaptureState>> = std::sync::OnceLock::new();

fn get_audio_state() -> Arc<AudioCaptureState> {
    AUDIO_STATE
        .get_or_init(|| Arc::new(AudioCaptureState::new()))
        .clone()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
static AUDIO_STREAM: std::sync::OnceLock<Mutex<Option<cpal::Stream>>> =
    std::sync::OnceLock::new();

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn get_audio_stream_holder() -> &'static Mutex<Option<cpal::Stream>> {
    AUDIO_STREAM.get_or_init(|| Mutex::new(None))
}

/// Find a loopback device for system audio capture
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn find_loopback_device() -> Result<cpal::Device> {
    let host = cpal::default_host();

    #[cfg(target_os = "macos")]
    {
        // On macOS 14.6+, cpal uses CoreAudio's AudioHardwareCreateProcessTap
        // The loopback works by recording FROM the output device (what would go to speakers)
        // See: https://github.com/RustAudio/cpal/pull/1003
        let output_device = host
            .default_output_device()
            .ok_or_else(|| Error::AudioDevice("No output device available for loopback".to_string()))?;

        let device_name = output_device.description()
            .map(|d| d.name().to_string())
            .unwrap_or_default();

        log::info!(
            "[AudioCapture] Using default output device for loopback: {}",
            device_name
        );

        return Ok(output_device);
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, look for explicit loopback devices like "Stereo Mix"
        let devices = host
            .input_devices()
            .map_err(|e| Error::AudioDevice(format!("Failed to enumerate audio devices: {}", e)))?;

        for device in devices {
            let device_name = device.description()
                .map(|d| d.name().to_string())
                .unwrap_or_default();
            let name_lower = device_name.to_lowercase();

            log::debug!("[AudioCapture] Found audio device: {}", device_name);

            // Look for loopback indicators in device name
            if name_lower.contains("stereo mix") || name_lower.contains("what you hear") || name_lower.contains("wave out") || name_lower.contains("loopback") {
                log::info!("[AudioCapture] Found loopback device: {}", device_name);
                return Ok(device);
            }
        }

        return Err(Error::AudioDevice(
            "No loopback device found on Windows. Please enable 'Stereo Mix' in audio settings.".to_string()
        ));
    }

    #[cfg(target_os = "linux")]
    {
        // Linux loopback not supported by cpal yet
        return Err(Error::AudioDevice(
            "System audio capture not supported on Linux".to_string()
        ));
    }
}

/// Start system audio capture and stream data through the channel (desktop only)
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn start_audio_stream(on_audio: Channel<AudioData>) -> Result<()> {
    let state = get_audio_state();

    // Check if already active
    if state.is_active.load(Ordering::SeqCst) {
        log::warn!("[AudioCapture] Audio capture already active, stopping first...");
        stop_audio()?;
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // Check platform support
    #[cfg(target_os = "linux")]
    {
        log::error!("[AudioCapture] System audio capture not supported on Linux");
        return Err(Error::AudioDevice(
            "System audio capture not supported on Linux. Please use PulseAudio/PipeWire monitoring.".to_string()
        ));
    }

    #[cfg(target_os = "macos")]
    {
        // Check macOS version - cpal loopback requires 14.6+
        // This is a simplified check - in production you'd want to actually check the OS version
        log::info!("[AudioCapture] Starting Core Audio loopback (requires macOS 14.6+)");
    }

    log::info!("[AudioCapture] Starting system audio capture via cpal");

    // Find loopback device
    let device = find_loopback_device()?;

    // Get the config - on macOS loopback, we use the OUTPUT config
    // because we're recording from the output device (what goes to speakers)
    #[cfg(target_os = "macos")]
    let config = device
        .default_output_config()
        .map_err(|e| Error::AudioDevice(format!("Failed to get audio config: {}", e)))?;

    #[cfg(not(target_os = "macos"))]
    let config = device
        .default_input_config()
        .map_err(|e| Error::AudioDevice(format!("Failed to get audio config: {}", e)))?;

    let sample_rate = config.sample_rate();
    let channels = config.channels();
    let sample_format = config.sample_format();

    log::info!(
        "[AudioCapture] Audio config - Sample rate: {}Hz, Channels: {}, Format: {:?}",
        sample_rate,
        channels,
        sample_format
    );

    // Counter for chunk sequence
    let chunk_count = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let chunk_count_clone = chunk_count.clone();

    // Build the input stream based on sample format
    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let stream_config = config.config();
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    handle_audio_data_f32(
                        data,
                        sample_rate,
                        channels,
                        &on_audio,
                        &chunk_count_clone,
                    );
                },
                |err| log::error!("[AudioCapture] Stream error: {}", err),
                None,
            )
            .map_err(|e| Error::AudioDevice(format!("Failed to build audio stream: {}", e)))?
        }
        cpal::SampleFormat::I16 => {
            let stream_config = config.config();
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    // Convert i16 to f32 and handle
                    let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                    handle_audio_data_f32(
                        &f32_data,
                        sample_rate,
                        channels,
                        &on_audio,
                        &chunk_count_clone,
                    );
                },
                |err| log::error!("[AudioCapture] Stream error: {}", err),
                None,
            )
            .map_err(|e| Error::AudioDevice(format!("Failed to build audio stream: {}", e)))?
        }
        cpal::SampleFormat::U16 => {
            let stream_config = config.config();
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    // Convert u16 to f32 and handle
                    let f32_data: Vec<f32> = data
                        .iter()
                        .map(|&s| (s as f32 - 32768.0) / 32768.0)
                        .collect();
                    handle_audio_data_f32(
                        &f32_data,
                        sample_rate,
                        channels,
                        &on_audio,
                        &chunk_count_clone,
                    );
                },
                |err| log::error!("[AudioCapture] Stream error: {}", err),
                None,
            )
            .map_err(|e| Error::AudioDevice(format!("Failed to build audio stream: {}", e)))?
        }
        _ => {
            return Err(Error::AudioDevice(format!(
                "Unsupported sample format: {:?}",
                sample_format
            )))
        }
    };

    // Start the stream
    stream
        .play()
        .map_err(|e| Error::AudioDevice(format!("Failed to start audio stream: {}", e)))?;

    // Mark as active
    state.is_active.store(true, Ordering::SeqCst);

    // Store the stream so we can stop it later
    {
        let mut stream_holder = get_audio_stream_holder().lock().unwrap();
        *stream_holder = Some(stream);
    }

    log::info!(
        "[AudioCapture] System audio capture started ({}Hz, {}ch)",
        sample_rate,
        channels
    );

    Ok(())
}

/// Handle audio data from the stream (f32 format)
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn handle_audio_data_f32(
    data: &[f32],
    sample_rate: u32,
    channels: u16,
    on_audio: &Channel<AudioData>,
    chunk_count: &Arc<std::sync::atomic::AtomicU64>,
) {
    if data.is_empty() {
        return;
    }

    let count = chunk_count.fetch_add(1, Ordering::SeqCst) + 1;

    // Convert f32 samples to bytes (little-endian)
    let bytes: Vec<u8> = data
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
        sample_rate,
        channels,
        chunk_count: count,
    };

    if count == 1 {
        log::info!(
            "[AudioCapture] First audio chunk sent ({} samples, {} bytes)",
            data.len(),
            bytes.len()
        );
    }

    if let Err(e) = on_audio.send(audio_payload) {
        log::error!("[AudioCapture] Failed to send audio data: {:?}", e);
    }
}

/// Start audio capture (mobile stub)
#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn start_audio_stream(_on_audio: Channel<AudioData>) -> Result<()> {
    log::warn!("[AudioCapture] System audio capture not supported on mobile platforms");
    Err(Error::AudioNotAvailable)
}

/// Stop audio capture
pub fn stop_audio() -> Result<()> {
    let state = get_audio_state();

    if !state.is_active.load(Ordering::SeqCst) {
        log::info!("[AudioCapture] Audio capture not active");
        return Ok(());
    }

    log::info!("[AudioCapture] Stopping audio capture...");

    // Mark as inactive first
    state.is_active.store(false, Ordering::SeqCst);

    // Stop the stream
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let mut stream_holder = get_audio_stream_holder().lock().unwrap();
        if let Some(stream) = stream_holder.take() {
            drop(stream); // Dropping the stream stops it
        }
    }

    log::info!("[AudioCapture] Audio capture stopped");

    Ok(())
}

/// Check if audio capture is currently active
pub fn is_audio_active() -> bool {
    get_audio_state().is_active.load(Ordering::SeqCst)
}
