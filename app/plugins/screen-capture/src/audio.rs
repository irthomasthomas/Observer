//! Cross-platform system audio capture using platform-specific native APIs.
//!
//! This module captures desktop/system audio (loopback) using platform-native implementations:
//! - macOS: ScreenCaptureKit API (requires screen recording permission)
//! - Windows: WASAPI loopback API
//! - Linux: Not yet supported
//! - iOS/Android: Not yet supported

#[allow(unused_imports)]
use crate::error::{Error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

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

// ==================== macOS ScreenCaptureKit Implementation ====================

#[cfg(target_os = "macos")]
mod macos_audio {
    use super::*;
    use screencapturekit::prelude::*;
    use std::sync::Mutex;

    static AUDIO_CAPTURE: std::sync::OnceLock<Mutex<Option<AudioCapture>>> =
        std::sync::OnceLock::new();

    fn get_audio_capture() -> &'static Mutex<Option<AudioCapture>> {
        AUDIO_CAPTURE.get_or_init(|| Mutex::new(None))
    }

    struct AudioCapture {
        stream: SCStream,
        _chunk_count: Arc<std::sync::atomic::AtomicU64>,
    }

    impl Drop for AudioCapture {
        fn drop(&mut self) {
            log::info!("[AudioCapture] Dropping macOS audio capture stream");
            // Stream is automatically stopped when dropped
        }
    }

    pub fn start_capture(on_audio: Channel<AudioData>) -> Result<()> {
        let state = get_audio_state();

        // Check if already active
        if state.is_active.load(Ordering::SeqCst) {
            log::warn!("[AudioCapture] Audio capture already active, stopping first...");
            stop_capture()?;
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        log::info!("[AudioCapture] Starting macOS ScreenCaptureKit audio capture");
        log::info!("[AudioCapture] ⚠️  IMPORTANT: Requires 'Screen Recording' permission");
        log::info!("[AudioCapture] ⚠️  Go to System Settings → Privacy & Security → Screen Recording");

        // Get shareable content to access display/audio
        log::info!("[AudioCapture] Getting shareable content...");
        let content = SCShareableContent::get().map_err(|e| {
            log::error!("[AudioCapture] Failed to get shareable content: {:?}", e);
            Error::AudioDevice(format!("Failed to get shareable content: {:?}", e))
        })?;
        log::info!(
            "[AudioCapture] Found {} displays, {} windows",
            content.displays().len(),
            content.windows().len()
        );

        // Create a content filter to capture system audio
        // We need to capture from a display to get the system audio
        let displays = content.displays();
        let display = displays
            .first()
            .ok_or_else(|| Error::AudioDevice("No displays found".to_string()))?;

        log::info!(
            "[AudioCapture] Using display: {:?}",
            display.display_id()
        );

        // Create content filter for display capture (which includes audio)
        let filter = SCContentFilter::create().with_display(display).build();

        // Configure stream for audio capture
        // Note: Even for audio-only, we need valid video dimensions
        // ScreenCaptureKit captures video+audio together, then we just ignore the video
        let config = SCStreamConfiguration::new()
            .with_captures_audio(true)
            .with_excludes_current_process_audio(false) // Capture all system audio including this process
            .with_sample_rate(48000) // 48kHz
            .with_channel_count(2) // Stereo
            // Use small but valid video dimensions (we'll ignore the video frames)
            .with_width(100)
            .with_height(100)
            .with_pixel_format(PixelFormat::YCbCr_420v);

        // Create stream output handler
        let chunk_count = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let chunk_count_clone = chunk_count.clone();
        let on_audio_clone = on_audio.clone();

        // Create the stream
        log::info!("[AudioCapture] Creating SCStream...");
        let mut stream = SCStream::new(&filter, &config);

        log::info!("[AudioCapture] Adding audio output handler...");
        // Add the audio output handler as a closure
        stream.add_output_handler(
            Box::new(move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
                match of_type {
                    SCStreamOutputType::Audio => {
                        let count = chunk_count_clone.fetch_add(1, Ordering::SeqCst) + 1;

                        if count == 1 {
                            log::info!("[AudioCapture] First audio sample received");
                        }

                        if count % 500 == 0 {
                            log::debug!("[AudioCapture] Received {} audio samples", count);
                        }

                        // Extract audio data from CMSampleBuffer
                        match sample.audio_buffer_list() {
                            Some(audio_buffer_list) => {
                                // Get the number of buffers
                                let num_buffers = audio_buffer_list.num_buffers();

                                if num_buffers == 0 {
                                    if count < 5 {
                                        log::warn!("[AudioCapture] Audio buffer list is empty");
                                    }
                                    return;
                                }

                                // Process each buffer (usually just one for stereo)
                                for i in 0..num_buffers {
                                    let Some(audio_buffer) = audio_buffer_list.buffer(i) else {
                                        if count < 5 {
                                            log::warn!("[AudioCapture] Failed to get buffer at index {}", i);
                                        }
                                        continue;
                                    };

                                    // Get audio data as a byte slice
                                    let data_bytes = audio_buffer.data();

                                    if data_bytes.is_empty() {
                                        if count < 5 {
                                            log::warn!("[AudioCapture] Empty audio buffer data");
                                        }
                                        continue;
                                    }

                                    // Convert bytes to f32 samples (audio is in f32 PCM format)
                                    // Safety: We know ScreenCaptureKit provides f32 audio data
                                    let audio_slice = unsafe {
                                        std::slice::from_raw_parts(
                                            data_bytes.as_ptr() as *const f32,
                                            data_bytes.len() / 4, // 4 bytes per f32
                                        )
                                    };

                                    // Convert f32 samples to bytes (little-endian)
                                    let bytes: Vec<u8> = audio_slice
                                        .iter()
                                        .flat_map(|&sample| sample.to_le_bytes())
                                        .collect();

                                    // Get timestamp
                                    let timestamp = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs_f64();

                                    // Create AudioData payload
                                    let audio_payload = AudioData {
                                        samples: STANDARD.encode(&bytes),
                                        timestamp,
                                        sample_rate: 48000, // We configured 48kHz
                                        channels: 2,        // We configured stereo
                                        chunk_count: count,
                                    };

                                    if count == 1 {
                                        log::info!(
                                            "[AudioCapture] First audio chunk sent ({} samples, {} bytes)",
                                            audio_slice.len(),
                                            bytes.len()
                                        );
                                    }

                                    // Send through channel
                                    if let Err(e) = on_audio_clone.send(audio_payload) {
                                        log::error!("[AudioCapture] Failed to send audio data: {:?}", e);
                                    }
                                }
                            }
                            None => {
                                if count < 5 {
                                    log::warn!("[AudioCapture] No audio buffer list available");
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }),
            SCStreamOutputType::Audio,
        );

        // Start capture
        log::info!("[AudioCapture] Starting capture...");
        stream.start_capture().map_err(|e| {
            log::error!("[AudioCapture] Failed to start capture: {:?}", e);
            log::error!("[AudioCapture] This may be due to:");
            log::error!("[AudioCapture]   - Screen Recording permission not fully granted");
            log::error!("[AudioCapture]   - Kitty terminal needs Screen Recording permission");
            log::error!("[AudioCapture]   - Invalid stream configuration");
            log::error!("[AudioCapture]   - Display not accessible");
            Error::AudioDevice(format!("Failed to start capture: {:?}", e))
        })?;

        log::info!("[AudioCapture] Capture started successfully");

        // Store the capture
        let capture = AudioCapture {
            stream,
            _chunk_count: chunk_count,
        };

        {
            let mut capture_holder = get_audio_capture().lock().unwrap();
            *capture_holder = Some(capture);
        }

        // Mark as active
        state.is_active.store(true, Ordering::SeqCst);

        log::info!("[AudioCapture] macOS ScreenCaptureKit audio capture started (48kHz, stereo)");
        Ok(())
    }

    pub fn stop_capture() -> Result<()> {
        let state = get_audio_state();

        if !state.is_active.load(Ordering::SeqCst) {
            log::info!("[AudioCapture] Audio capture not active");
            return Ok(());
        }

        log::info!("[AudioCapture] Stopping macOS audio capture...");

        // Mark as inactive first
        state.is_active.store(false, Ordering::SeqCst);

        // Stop the stream
        let mut capture_holder = get_audio_capture().lock().unwrap();
        if let Some(capture) = capture_holder.take() {
            if let Err(e) = capture.stream.stop_capture() {
                log::warn!("[AudioCapture] Error stopping stream: {:?}", e);
            }
            drop(capture);
        }

        log::info!("[AudioCapture] macOS audio capture stopped");
        Ok(())
    }
}

// ==================== Windows WASAPI Implementation ====================

#[cfg(target_os = "windows")]
mod windows_audio {
    use super::*;
    use std::sync::Mutex;
    use std::thread;
    use wasapi::*;

    static AUDIO_CAPTURE: std::sync::OnceLock<Mutex<Option<AudioCapture>>> =
        std::sync::OnceLock::new();

    fn get_audio_capture() -> &'static Mutex<Option<AudioCapture>> {
        AUDIO_CAPTURE.get_or_init(|| Mutex::new(None))
    }

    struct AudioCapture {
        stop_signal: Arc<AtomicBool>,
        thread_handle: Option<thread::JoinHandle<()>>,
    }

    impl Drop for AudioCapture {
        fn drop(&mut self) {
            log::info!("[AudioCapture] Dropping Windows audio capture");
            self.stop_signal.store(true, Ordering::SeqCst);
            if let Some(handle) = self.thread_handle.take() {
                let _ = handle.join();
            }
        }
    }

    pub fn start_capture(on_audio: Channel<AudioData>) -> Result<()> {
        let state = get_audio_state();

        // Check if already active
        if state.is_active.load(Ordering::SeqCst) {
            log::warn!("[AudioCapture] Audio capture already active, stopping first...");
            stop_capture()?;
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        log::info!("[AudioCapture] Starting Windows WASAPI loopback capture");

        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_signal_clone = stop_signal.clone();

        let thread_handle = thread::spawn(move || {
            log::info!("[AudioCapture] Windows capture thread started");

            // Initialize COM for this thread
            if let Err(e) = initialize_mta().ok() {
                log::error!("[AudioCapture] Failed to initialize COM: {:?}", e);
                return;
            }

            let chunk_count = Arc::new(std::sync::atomic::AtomicU64::new(0));

            // Run the capture loop
            if let Err(e) = run_capture_loop(on_audio, stop_signal_clone, chunk_count) {
                log::error!("[AudioCapture] Capture loop error: {:?}", e);
            }

            log::info!("[AudioCapture] Windows capture thread stopped");
        });

        let capture = AudioCapture {
            stop_signal,
            thread_handle: Some(thread_handle),
        };

        {
            let mut capture_holder = get_audio_capture().lock().unwrap();
            *capture_holder = Some(capture);
        }

        // Mark as active
        state.is_active.store(true, Ordering::SeqCst);

        log::info!("[AudioCapture] Windows WASAPI loopback capture started");

        Ok(())
    }

    fn run_capture_loop(
        on_audio: Channel<AudioData>,
        stop_signal: Arc<AtomicBool>,
        chunk_count: Arc<std::sync::atomic::AtomicU64>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        // Get default audio render device (speakers/headphones)
        log::info!("[AudioCapture] Getting default audio render device...");
        let enumerator = DeviceEnumerator::new()?;
        let device = enumerator.get_default_device(&Direction::Render)?;

        log::info!("[AudioCapture] Initializing audio client for loopback capture...");
        let mut audio_client = device.get_iaudioclient()?;

        // Get the default format
        let wave_format = audio_client.get_mixformat()?;
        log::info!(
            "[AudioCapture] Device format: {}Hz, {} channels, {} bits",
            wave_format.get_samplespersec(),
            wave_format.get_nchannels(),
            wave_format.get_bitspersample()
        );

        // Initialize in loopback mode (shared mode, capture direction)
        let blockalign = wave_format.get_blockalign();
        let (def_time, min_time) = audio_client.get_device_period()?;
        log::info!(
            "[AudioCapture] Default period: {} ns, Minimum period: {} ns",
            def_time,
            min_time
        );

        audio_client.initialize_client(
            &wave_format,
            &Direction::Capture, // Capture direction for loopback
            &StreamMode::PollingShared {
                autoconvert: false,
                buffer_duration_hns: def_time,
            },
        )?;

        log::info!("[AudioCapture] Getting audio capture client...");
        let capture_client = audio_client.get_audiocaptureclient()?;

        log::info!("[AudioCapture] Starting audio client...");
        audio_client.start_stream()?;

        log::info!("[AudioCapture] Loopback capture started, reading audio data...");

        let sample_rate = wave_format.get_samplespersec();
        let channels = wave_format.get_nchannels() as u16;
        let bits_per_sample = wave_format.get_bitspersample();

        // Capture loop
        while !stop_signal.load(Ordering::SeqCst) {
            // Sleep a bit to avoid busy waiting
            thread::sleep(std::time::Duration::from_millis(10));

            // Get number of frames available in next packet
            let frames_available = match capture_client.get_next_packet_size() {
                Ok(Some(frames)) => frames,
                Ok(None) => continue, // exclusive mode returns None
                Err(e) => {
                    log::debug!("[AudioCapture] Error getting frame count: {:?}", e);
                    continue;
                }
            };

            if frames_available == 0 {
                continue;
            }

            // Allocate buffer and read audio data
            let mut buf = vec![0u8; frames_available as usize * blockalign as usize];
            let data = match capture_client.read_from_device(&mut buf) {
                Ok(_) => buf,
                Err(e) => {
                    log::error!("[AudioCapture] Error reading audio buffer: {:?}", e);
                    continue;
                }
            };

            if data.is_empty() {
                continue;
            }

            let count = chunk_count.fetch_add(1, Ordering::SeqCst) + 1;

            // Convert audio data to f32 based on bit depth
            let f32_samples: Vec<f32> = match bits_per_sample {
                32 => {
                    // Already f32, just reinterpret bytes
                    data.chunks_exact(4)
                        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                        .collect()
                }
                16 => {
                    // Convert i16 to f32
                    data.chunks_exact(2)
                        .map(|chunk| {
                            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                            sample as f32 / 32768.0
                        })
                        .collect()
                }
                _ => {
                    log::warn!("[AudioCapture] Unsupported bit depth: {}", bits_per_sample);
                    continue;
                }
            };

            // Convert f32 samples to bytes
            let bytes: Vec<u8> = f32_samples
                .iter()
                .flat_map(|&sample| sample.to_le_bytes())
                .collect();

            // Get timestamp
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs_f64();

            // Create AudioData payload
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
                    f32_samples.len(),
                    bytes.len()
                );
            }

            if count % 500 == 0 {
                log::debug!("[AudioCapture] Sent {} audio chunks", count);
            }

            // Send through channel
            if let Err(e) = on_audio.send(audio_payload) {
                log::error!("[AudioCapture] Failed to send audio data: {:?}", e);
                break;
            }
        }

        log::info!("[AudioCapture] Stopping audio client...");
        audio_client.stop_stream()?;

        Ok(())
    }

    pub fn stop_capture() -> Result<()> {
        let state = get_audio_state();

        if !state.is_active.load(Ordering::SeqCst) {
            log::info!("[AudioCapture] Audio capture not active");
            return Ok(());
        }

        log::info!("[AudioCapture] Stopping Windows audio capture...");

        // Mark as inactive first
        state.is_active.store(false, Ordering::SeqCst);

        // Stop the capture thread
        let mut capture_holder = get_audio_capture().lock().unwrap();
        if let Some(capture) = capture_holder.take() {
            drop(capture); // Drop will stop the thread
        }

        log::info!("[AudioCapture] Windows audio capture stopped");
        Ok(())
    }
}

// ==================== Platform-Specific Public API ====================

/// Start system audio capture and stream data through the channel (desktop only)
#[cfg(target_os = "macos")]
pub fn start_audio_stream(on_audio: Channel<AudioData>) -> Result<()> {
    macos_audio::start_capture(on_audio)
}

#[cfg(target_os = "windows")]
pub fn start_audio_stream(on_audio: Channel<AudioData>) -> Result<()> {
    windows_audio::start_capture(on_audio)
}

#[cfg(all(
    not(any(target_os = "android", target_os = "ios")),
    not(target_os = "macos"),
    not(target_os = "windows")
))]
pub fn start_audio_stream(_on_audio: Channel<AudioData>) -> Result<()> {
    log::error!("[AudioCapture] System audio capture not supported on Linux");
    Err(Error::AudioDevice(
        "System audio capture not supported on Linux. Please use PulseAudio/PipeWire monitoring."
            .to_string(),
    ))
}

/// Start audio capture (mobile stub)
#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn start_audio_stream(_on_audio: Channel<AudioData>) -> Result<()> {
    log::warn!("[AudioCapture] System audio capture not supported on mobile platforms");
    Err(Error::AudioNotAvailable)
}

/// Stop audio capture
#[cfg(target_os = "macos")]
pub fn stop_audio() -> Result<()> {
    macos_audio::stop_capture()
}

#[cfg(target_os = "windows")]
pub fn stop_audio() -> Result<()> {
    windows_audio::stop_capture()
}

#[cfg(all(
    not(any(target_os = "android", target_os = "ios")),
    not(target_os = "macos"),
    not(target_os = "windows")
))]
pub fn stop_audio() -> Result<()> {
    let state = get_audio_state();
    state.is_active.store(false, Ordering::SeqCst);
    log::info!("[AudioCapture] Audio capture stopped (Linux - not implemented)");
    Ok(())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn stop_audio() -> Result<()> {
    let state = get_audio_state();
    state.is_active.store(false, Ordering::SeqCst);
    log::info!("[AudioCapture] Audio capture stopped (mobile - not implemented)");
    Ok(())
}

/// Check if audio capture is currently active
pub fn is_audio_active() -> bool {
    get_audio_state().is_active.load(Ordering::SeqCst)
}
