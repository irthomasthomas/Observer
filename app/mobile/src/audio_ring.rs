// audio_ring.rs - Reads audio from shared memory ring buffer (iOS App Groups)
//
// Memory layout (must match Swift AudioRingBuffer):
// - Header (64 bytes):
//   - write_pos: u64      (current write offset in ring buffer)
//   - sample_rate: u32    (e.g., 44100 on iOS)
//   - timestamp: f64      (last write time)
//   - sequence: u64       (chunk counter for detecting new data)
//   - reserved: 36 bytes
// - Ring buffer: 256KB of f32 samples (~65536 samples = ~1.5s at 44.1kHz)
//
// Audio is passed through at native sample rate - frontend handles resampling via AudioContext.

use base64::Engine;
use memmap2::MmapMut;
use std::fs::OpenOptions;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;
use tokio::sync::RwLock;
use tokio::time::interval;

use crate::server::AudioData;

use once_cell::sync::Lazy;

/// Static storage for App Group container path (set by Swift on iOS)
static APP_GROUP_PATH: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// Global reader state for stopping the background task
static READER_STATE: Lazy<Mutex<Option<Arc<AudioRingReaderState>>>> = Lazy::new(|| Mutex::new(None));

/// Set the App Group container path (called from Swift/iOS side)
pub fn set_app_group_path(path: PathBuf) {
    log::info!("[AudioRingReader] App Group path set to {:?}", path);
    if let Ok(mut guard) = APP_GROUP_PATH.lock() {
        *guard = Some(path);
    }
}

// Ring buffer constants (must match Swift)
const HEADER_SIZE: usize = 64;
const RING_BUFFER_SIZE: usize = 256 * 1024; // 256KB
#[allow(dead_code)]
const TOTAL_SIZE: usize = HEADER_SIZE + RING_BUFFER_SIZE;

// Header offsets
const WRITE_POS_OFFSET: usize = 0; // u64: 8 bytes
const SAMPLE_RATE_OFFSET: usize = 8; // u32: 4 bytes
const TIMESTAMP_OFFSET: usize = 12; // f64: 8 bytes
const SEQUENCE_OFFSET: usize = 20; // u64: 8 bytes

/// Audio ring buffer reader for iOS shared memory
pub struct AudioRingReader {
    mmap: Option<MmapMut>,
    read_pos: u64,
    last_sequence: u64,
    chunk_count: u64,
}

impl AudioRingReader {
    pub fn new() -> Self {
        Self {
            mmap: None,
            read_pos: 0,
            last_sequence: 0,
            chunk_count: 0,
        }
    }

    /// Get the App Group container path for iOS
    /// On iOS, we use the path set by Swift via set_app_group_path()
    /// Falls back to scanning standard iOS App Group locations
    fn get_app_group_path() -> Option<PathBuf> {
        // First check if path was set explicitly
        if let Some(path) = APP_GROUP_PATH.lock().ok()?.clone() {
            return Some(path);
        }

        #[cfg(target_os = "ios")]
        {
            // Try standard iOS App Group container locations
            // The path follows pattern: /private/var/mobile/Containers/Shared/AppGroup/<UUID>/
            // We look for our audio_ring.bin file
            let shared_containers = PathBuf::from("/private/var/mobile/Containers/Shared/AppGroup");
            if shared_containers.exists() {
                if let Ok(entries) = std::fs::read_dir(&shared_containers) {
                    for entry in entries.flatten() {
                        let candidate = entry.path().join("audio_ring.bin");
                        if candidate.exists() {
                            log::info!(
                                "[AudioRingReader] Found ring buffer at {:?}",
                                entry.path()
                            );
                            return Some(entry.path());
                        }
                    }
                }
            }
            log::info!("[AudioRingReader] App Group container not found");
            None
        }

        #[cfg(not(target_os = "ios"))]
        {
            // For testing on macOS, use a temp directory
            let path = PathBuf::from("/tmp/observer_audio_ring");
            // Create directory if it doesn't exist (for testing)
            let _ = std::fs::create_dir_all(&path);
            Some(path)
        }
    }

    /// Initialize the memory-mapped file
    pub fn initialize(&mut self) -> io::Result<()> {
        let container_path = Self::get_app_group_path().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "Failed to get App Group container path",
            )
        })?;

        let file_path = container_path.join("audio_ring.bin");
        log::info!("[AudioRingReader] Opening ring buffer at {:?}", file_path);

        // Open the file (it should already exist, created by Swift)
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&file_path)?;

        // Ensure file is the right size
        let metadata = file.metadata()?;
        if metadata.len() < TOTAL_SIZE as u64 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "Ring buffer file too small: {} < {}",
                    metadata.len(),
                    TOTAL_SIZE
                ),
            ));
        }

        // Memory-map the file
        let mmap = unsafe { MmapMut::map_mut(&file)? };
        self.mmap = Some(mmap);

        // Initialize read position to current write position
        if let Some(ref mmap) = self.mmap {
            let write_pos = u64::from_le_bytes(
                mmap[WRITE_POS_OFFSET..WRITE_POS_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            let sequence = u64::from_le_bytes(
                mmap[SEQUENCE_OFFSET..SEQUENCE_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            self.read_pos = write_pos;
            self.last_sequence = sequence;
            log::info!(
                "[AudioRingReader] Initialized at write_pos={}, sequence={}",
                write_pos, sequence
            );
        }

        Ok(())
    }

    /// Read new samples from the ring buffer
    /// Returns (samples, sample_rate, timestamp) if new data is available
    pub fn read(&mut self) -> Option<(Vec<f32>, u32, f64)> {
        let mmap = self.mmap.as_ref()?;

        // Read header
        let write_pos = u64::from_le_bytes(
            mmap[WRITE_POS_OFFSET..WRITE_POS_OFFSET + 8]
                .try_into()
                .unwrap(),
        );
        let sample_rate = u32::from_le_bytes(
            mmap[SAMPLE_RATE_OFFSET..SAMPLE_RATE_OFFSET + 4]
                .try_into()
                .unwrap(),
        );
        let timestamp = f64::from_le_bytes(
            mmap[TIMESTAMP_OFFSET..TIMESTAMP_OFFSET + 8]
                .try_into()
                .unwrap(),
        );
        let sequence = u64::from_le_bytes(
            mmap[SEQUENCE_OFFSET..SEQUENCE_OFFSET + 8]
                .try_into()
                .unwrap(),
        );

        // Check if there's new data
        if sequence == self.last_sequence {
            return None;
        }

        // Calculate bytes available
        let bytes_available = if write_pos >= self.read_pos {
            write_pos - self.read_pos
        } else {
            // Handle wrap-around (write_pos wrapped but read_pos hasn't caught up)
            // This shouldn't happen normally, but handle it safely
            write_pos
        };

        if bytes_available == 0 {
            self.last_sequence = sequence;
            return None;
        }

        // Limit to ring buffer size to avoid reading stale data
        let bytes_to_read = bytes_available.min(RING_BUFFER_SIZE as u64) as usize;
        let samples_to_read = bytes_to_read / std::mem::size_of::<f32>();

        if samples_to_read == 0 {
            self.last_sequence = sequence;
            return None;
        }

        // Read samples from ring buffer
        // IMPORTANT: Handle wrap-around correctly - a sample's 4 bytes might straddle the boundary
        let ring_start = HEADER_SIZE;

        let mut samples = Vec::with_capacity(samples_to_read);

        for i in 0..samples_to_read {
            let byte_pos = self.read_pos + (i * 4) as u64;
            let mut sample_bytes = [0u8; 4];

            // Read each byte individually with wrap-around
            for j in 0..4 {
                let ring_offset = ((byte_pos + j as u64) % RING_BUFFER_SIZE as u64) as usize;
                sample_bytes[j] = mmap[ring_start + ring_offset];
            }

            let sample = f32::from_le_bytes(sample_bytes);
            samples.push(sample);
        }

        // Update read position and sequence
        self.read_pos = write_pos;
        self.last_sequence = sequence;
        self.chunk_count += 1;

        if self.chunk_count == 1 {
            // Validate samples look like audio (should be in -1.0 to 1.0 range)
            let min = samples.iter().cloned().fold(f32::INFINITY, f32::min);
            let max = samples.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            let has_signal = samples.iter().any(|&s| s.abs() > 0.001);
            log::info!(
                "[AudioRingReader] First chunk: {} samples, {}Hz, range=[{:.4}, {:.4}], has_signal={}",
                samples.len(), sample_rate, min, max, has_signal
            );
            if min < -1.5 || max > 1.5 {
                log::warn!("[AudioRingReader] WARNING: Sample values outside normal range! Data may be corrupted.");
            }
        }
        if self.chunk_count % 500 == 0 {
            log::info!(
                "[AudioRingReader] Read {} audio chunks so far",
                self.chunk_count
            );
        }

        Some((samples, sample_rate, timestamp))
    }

    pub fn chunk_count(&self) -> u64 {
        self.chunk_count
    }
}

/// Shared state for the audio ring reader task
pub struct AudioRingReaderState {
    pub running: AtomicBool,
    pub audio_channel: Arc<RwLock<Option<Channel<AudioData>>>>,
}

impl AudioRingReaderState {
    pub fn new(audio_channel: Arc<RwLock<Option<Channel<AudioData>>>>) -> Self {
        Self {
            running: AtomicBool::new(false),
            audio_channel,
        }
    }
}

/// Start the audio ring reader background task
pub fn start_audio_ring_reader(state: Arc<AudioRingReaderState>) {
    // Store the state globally so we can stop it later
    if let Ok(mut guard) = READER_STATE.lock() {
        if let Some(existing) = guard.as_ref() {
            if existing.running.load(Ordering::SeqCst) {
                log::info!("[AudioRingReader] Already running");
                return;
            }
        }
        *guard = Some(state.clone());
    }

    if state.running.swap(true, Ordering::SeqCst) {
        log::info!("[AudioRingReader] Already running");
        return;
    }

    tokio::spawn(async move {
        log::info!("[AudioRingReader] Starting background task");

        let mut reader = AudioRingReader::new();

        // Try to initialize, retry if file doesn't exist yet
        let mut retry_count = 0;
        loop {
            match reader.initialize() {
                Ok(()) => {
                    log::info!("[AudioRingReader] Successfully initialized");
                    break;
                }
                Err(e) => {
                    if retry_count < 30 {
                        // Retry for up to 30 seconds
                        retry_count += 1;
                        if retry_count == 1 {
                            log::info!(
                                "[AudioRingReader] Waiting for ring buffer file to be created..."
                            );
                        }
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        continue;
                    }
                    log::info!("[AudioRingReader] Failed to initialize after 30s: {}", e);
                    state.running.store(false, Ordering::SeqCst);
                    return;
                }
            }
        }

        // Poll for new audio data at ~10ms interval
        let mut poll_interval = interval(Duration::from_millis(10));

        while state.running.load(Ordering::SeqCst) {
            poll_interval.tick().await;

            // Read any new samples
            if let Some((samples, sample_rate, timestamp)) = reader.read() {
                // Check if there's a channel to send to
                let channel_guard = state.audio_channel.read().await;
                if let Some(channel) = channel_guard.as_ref() {
                    // Convert f32 samples to bytes (little-endian)
                    // Frontend handles resampling via AudioContext
                    let bytes: Vec<u8> = samples
                        .iter()
                        .flat_map(|&sample| sample.to_le_bytes())
                        .collect();

                    let audio_data = AudioData {
                        samples: base64::prelude::BASE64_STANDARD.encode(&bytes),
                        timestamp,
                        sample_rate,
                        channels: 1,
                        chunk_count: reader.chunk_count(),
                    };

                    if let Err(e) = channel.send(audio_data) {
                        log::info!("[AudioRingReader] Failed to send audio: {:?}", e);
                    }
                }
            }
        }

        log::info!(
            "[AudioRingReader] Stopped after {} chunks",
            reader.chunk_count()
        );
    });
}

/// Stop the audio ring reader background task
pub fn stop_audio_ring_reader() {
    if let Ok(guard) = READER_STATE.lock() {
        if let Some(state) = guard.as_ref() {
            state.running.store(false, Ordering::SeqCst);
            log::info!("[AudioRingReader] Stop requested");
        }
    }
}
