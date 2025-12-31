use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CaptureConfig {
    pub width: u32,
    pub height: u32,
    pub frame_rate: u32,
}

impl Default for CaptureConfig {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            frame_rate: 30,
        }
    }
}
