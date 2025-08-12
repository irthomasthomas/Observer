use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ShortcutConfig {
    pub toggle: Option<String>,
    pub move_up: Option<String>,
    pub move_down: Option<String>,
    pub move_left: Option<String>,
    pub move_right: Option<String>,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        // Platform-specific defaults
        #[cfg(target_os = "windows")]
        {
            Self {
                toggle: Some("Alt+B".to_string()),
                move_up: Some("Alt+ArrowUp".to_string()),
                move_down: Some("Alt+ArrowDown".to_string()),
                move_left: Some("Alt+ArrowLeft".to_string()),
                move_right: Some("Alt+ArrowRight".to_string()),
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            Self {
                toggle: Some("Cmd+B".to_string()),
                move_up: Some("Cmd+ArrowUp".to_string()),
                move_down: Some("Cmd+ArrowDown".to_string()),
                move_left: Some("Cmd+ArrowLeft".to_string()),
                move_right: Some("Cmd+ArrowRight".to_string()),
            }
        }
    }
}

pub struct AppShortcutState {
    pub config: Mutex<ShortcutConfig>,
    pub active_shortcuts: Mutex<Vec<String>>,
}

#[tauri::command]
pub async fn get_shortcut_config(shortcut_state: State<'_, AppShortcutState>) -> Result<ShortcutConfig, String> {
    log::info!("Getting shortcut config");
    let config = shortcut_state.config.lock().unwrap().clone();
    Ok(config)
}

#[tauri::command]
pub async fn get_active_shortcuts(shortcut_state: State<'_, AppShortcutState>) -> Result<Vec<String>, String> {
    log::info!("Getting active shortcuts");
    let active = shortcut_state.active_shortcuts.lock().unwrap().clone();
    Ok(active)
}

#[tauri::command]
pub async fn set_shortcut_config(
    config: ShortcutConfig,
    shortcut_state: State<'_, AppShortcutState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("Setting shortcut config: {:?}", config);
    
    // Save to disk first
    #[cfg(desktop)]
    {
        save_shortcut_config_to_disk(&app_handle, &config)?;
    }
    
    // Update the in-memory config
    *shortcut_state.config.lock().unwrap() = config;
    
    log::info!("Shortcut config saved and updated. Application restart required for changes to take effect.");
    
    Ok(())
}

#[cfg(desktop)]
fn get_shortcuts_config_path(app_handle: &AppHandle) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    Ok(app_data_dir.join("shortcuts.json"))
}

#[cfg(desktop)]
pub fn load_shortcut_config_from_disk(app_handle: &AppHandle) -> ShortcutConfig {
    match get_shortcuts_config_path(app_handle) {
        Ok(config_path) => {
            if config_path.exists() {
                match std::fs::read_to_string(&config_path) {
                    Ok(content) => {
                        match serde_json::from_str::<ShortcutConfig>(&content) {
                            Ok(config) => {
                                log::info!("Loaded shortcut config from {:?}", config_path);
                                return config;
                            }
                            Err(e) => {
                                log::warn!("Failed to parse shortcut config: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to read shortcut config file: {}", e);
                    }
                }
            } else {
                log::info!("No existing shortcut config found, using defaults");
            }
        }
        Err(e) => {
            log::error!("Failed to get config path: {}", e);
        }
    }
    
    ShortcutConfig::default()
}

#[cfg(desktop)]
fn save_shortcut_config_to_disk(app_handle: &AppHandle, config: &ShortcutConfig) -> Result<(), String> {
    match get_shortcuts_config_path(app_handle) {
        Ok(config_path) => {
            match serde_json::to_string_pretty(config) {
                Ok(json_content) => {
                    match std::fs::write(&config_path, json_content) {
                        Ok(_) => {
                            log::info!("Saved shortcut config to {:?}", config_path);
                            Ok(())
                        }
                        Err(e) => {
                            let error_msg = format!("Failed to write shortcut config: {}", e);
                            log::error!("{}", error_msg);
                            Err(error_msg)
                        }
                    }
                }
                Err(e) => {
                    let error_msg = format!("Failed to serialize shortcut config: {}", e);
                    log::error!("{}", error_msg);
                    Err(error_msg)
                }
            }
        }
        Err(e) => {
            let error_msg = format!("Failed to get config path: {}", e);
            log::error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

#[cfg(desktop)]
fn parse_shortcut_string(shortcut_str: &str) -> Option<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    
    let parts: Vec<&str> = shortcut_str.split('+').map(|s| s.trim()).collect();
    if parts.len() != 2 {
        return None;
    }
    
    let modifier = match parts[0] {
        "Cmd" | "Super" => Some(Modifiers::SUPER),
        "Alt" => Some(Modifiers::ALT),
        "Ctrl" => Some(Modifiers::CONTROL),
        "Shift" => Some(Modifiers::SHIFT),
        _ => return None,
    };
    
    let key = match parts[1] {
        "B" => Code::KeyB,
        "ArrowUp" => Code::ArrowUp,
        "ArrowDown" => Code::ArrowDown,
        "ArrowLeft" => Code::ArrowLeft,
        "ArrowRight" => Code::ArrowRight,
        _ => return None,
    };
    
    Some(Shortcut::new(modifier, key))
}

#[cfg(desktop)]
pub fn register_global_shortcuts(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    
    // Get or create shortcut state
    let shortcut_state = app.state::<AppShortcutState>();
    let config = shortcut_state.config.lock().unwrap().clone();
    
    // Collect shortcuts to register with their original indices preserved
    let mut shortcuts_to_register = Vec::new();
    let mut shortcut_actions = Vec::new(); // Maps array index to action type
    
    // Toggle (action_id = 0)
    if let Some(toggle) = &config.toggle {
        if let Some(shortcut) = parse_shortcut_string(toggle) {
            shortcuts_to_register.push((shortcut, toggle.clone(), "toggle"));
            shortcut_actions.push(0); // toggle action
        }
    }
    
    // Move up (action_id = 1)
    if let Some(move_up) = &config.move_up {
        if let Some(shortcut) = parse_shortcut_string(move_up) {
            shortcuts_to_register.push((shortcut, move_up.clone(), "move up"));
            shortcut_actions.push(1); // move up action
        }
    }
    
    // Move down (action_id = 2)
    if let Some(move_down) = &config.move_down {
        if let Some(shortcut) = parse_shortcut_string(move_down) {
            shortcuts_to_register.push((shortcut, move_down.clone(), "move down"));
            shortcut_actions.push(2); // move down action
        }
    }
    
    // Move left (action_id = 3)
    if let Some(move_left) = &config.move_left {
        if let Some(shortcut) = parse_shortcut_string(move_left) {
            shortcuts_to_register.push((shortcut, move_left.clone(), "move left"));
            shortcut_actions.push(3); // move left action
        }
    }
    
    // Move right (action_id = 4)
    if let Some(move_right) = &config.move_right {
        if let Some(shortcut) = parse_shortcut_string(move_right) {
            shortcuts_to_register.push((shortcut, move_right.clone(), "move right"));
            shortcut_actions.push(4); // move right action
        }
    }
    
    // Store shortcuts and their action mappings for the handler
    let registered_shortcuts = shortcuts_to_register.iter().map(|(s, _, _)| s.clone()).collect::<Vec<_>>();
    let shortcut_handle = app.handle().clone();
    
    // Register the global shortcut handler
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new().with_handler(move |_app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            
            match shortcut_handle.get_webview_window("overlay") {
                Some(window) => {
                    // Find which shortcut was pressed
                    let shortcut_idx = registered_shortcuts.iter().position(|s| s == shortcut);
                    if let Some(array_idx) = shortcut_idx {
                        // Get the original action_id for this shortcut
                        let action_id = shortcut_actions[array_idx];
                        
                        match action_id {
                            0 => {
                                // Toggle visibility
                                match window.is_visible() {
                                    Ok(visible) => {
                                        let result = if visible {
                                            window.hide()
                                        } else {
                                            window.show()
                                        };
                                        
                                        match result {
                                            Ok(_) => {
                                                log::info!("Overlay {} via toggle shortcut", if visible { "hidden" } else { "shown" });
                                            }
                                            Err(e) => {
                                                log::error!("Failed to {} overlay: {}", if visible { "hide" } else { "show" }, e);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log::error!("Failed to check overlay visibility: {}", e);
                                    }
                                }
                            }
                            1 | 2 | 3 | 4 => {
                                // Move window
                                match window.outer_position() {
                                    Ok(current_pos) => {
                                        let (dx, dy) = match action_id {
                                            1 => (0, -50),  // move up
                                            2 => (0, 50),   // move down
                                            3 => (-50, 0),  // move left
                                            4 => (50, 0),   // move right
                                            _ => (0, 0),
                                        };
                                        
                                        let new_x = current_pos.x + dx;
                                        let new_y = current_pos.y + dy;
                                        
                                        match window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: new_x, y: new_y })) {
                                            Ok(_) => {
                                                let direction = match action_id {
                                                    1 => "up",
                                                    2 => "down", 
                                                    3 => "left",
                                                    4 => "right",
                                                    _ => "unknown",
                                                };
                                                log::info!("Overlay moved {} to ({}, {})", direction, new_x, new_y);
                                            }
                                            Err(e) => {
                                                log::error!("Failed to move overlay: {}", e);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log::error!("Failed to get overlay position: {}", e);
                                    }
                                }
                            }
                            _ => {
                                log::warn!("Unknown action_id: {}", action_id);
                            }
                        }
                    }
                }
                None => {
                    log::warn!("Overlay window not found for shortcut - it may not be created yet");
                }
            }
        })
        .build(),
    )?;
    
    // Register shortcuts with graceful error handling
    let mut active_shortcuts = Vec::new();
    
    for (shortcut, description, action) in shortcuts_to_register {
        match app.global_shortcut().register(shortcut) {
            Ok(_) => {
                log::info!("✓ Registered shortcut '{}' for {}", description, action);
                active_shortcuts.push(description);
            }
            Err(e) => {
                log::warn!("✗ Failed to register shortcut '{}' for {}: {}", description, action, e);
            }
        }
    }
    
    // Update the active shortcuts state
    *shortcut_state.active_shortcuts.lock().unwrap() = active_shortcuts;
    
    Ok(())
}