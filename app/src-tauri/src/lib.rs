use screenshots::Screen;
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose};
use image::ImageEncoder;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![capture_screen])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn capture_screen() -> Result<String, String> {
    // Get all screens
    let screens = Screen::all().map_err(|e| e.to_string())?;
    if screens.is_empty() {
        return Err("No screens found".into());
    }
    
    // Capture the first screen
    let screen = &screens[0];
    let image = screen.capture().map_err(|e| e.to_string())?;
    
    // Convert to bytes and then to base64
    let mut buffer = Vec::new();
    image.write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    
    let base64_img = general_purpose::STANDARD.encode(&buffer);
    Ok(base64_img)
}
