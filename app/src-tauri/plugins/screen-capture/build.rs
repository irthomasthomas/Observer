const COMMANDS: &[&str] = &["start_capture_cmd", "stop_capture_cmd", "get_frame_cmd"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .ios_path("ios")
        .android_path("android")
        .build();
}
