use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// Helper function to ensure overlay always ignores cursor events
fn ensure_overlay_click_through(window: &tauri::WebviewWindow) {
    if let Err(e) = window.set_ignore_cursor_events(true) {
        log::warn!("Failed to re-enable click-through on overlay: {}", e);
    } else {
        log::debug!("Click-through re-enabled on overlay window");
    }
}
use crate::{AgentDiscoveryState, CommandState};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ShortcutConfig {
    pub toggle: Option<String>,
    pub move_up: Option<String>,
    pub move_down: Option<String>,
    pub move_left: Option<String>,
    pub move_right: Option<String>,
    pub resize_up: Option<String>,
    pub resize_down: Option<String>,
    pub resize_left: Option<String>,
    pub resize_right: Option<String>,
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
                resize_up: Some("Alt+Shift+ArrowUp".to_string()),
                resize_down: Some("Alt+Shift+ArrowDown".to_string()),
                resize_left: Some("Alt+Shift+ArrowLeft".to_string()),
                resize_right: Some("Alt+Shift+ArrowRight".to_string()),
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
                resize_up: Some("Cmd+Shift+ArrowUp".to_string()),
                resize_down: Some("Cmd+Shift+ArrowDown".to_string()),
                resize_left: Some("Cmd+Shift+ArrowLeft".to_string()),
                resize_right: Some("Cmd+Shift+ArrowRight".to_string()),
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
fn get_agent_shortcuts_config_path(app_handle: &AppHandle) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    Ok(app_data_dir.join("agent_shortcuts.json"))
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
pub fn load_agent_shortcuts_from_disk(app_handle: &AppHandle) -> std::collections::HashMap<String, String> {
    match get_agent_shortcuts_config_path(app_handle) {
        Ok(config_path) => {
            if config_path.exists() {
                match std::fs::read_to_string(&config_path) {
                    Ok(content) => {
                        match serde_json::from_str::<std::collections::HashMap<String, String>>(&content) {
                            Ok(shortcuts) => {
                                log::info!("Loaded agent shortcuts from {:?}", config_path);
                                return shortcuts;
                            }
                            Err(e) => {
                                log::warn!("Failed to parse agent shortcuts config: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to read agent shortcuts config file: {}", e);
                    }
                }
            } else {
                log::info!("No existing agent shortcuts config found, using empty map");
            }
        }
        Err(e) => {
            log::error!("Failed to get agent shortcuts config path: {}", e);
        }
    }
    
    std::collections::HashMap::new()
}

#[cfg(desktop)]
pub fn save_agent_shortcuts_to_disk(app_handle: &AppHandle, shortcuts: &std::collections::HashMap<String, String>) -> Result<(), String> {
    match get_agent_shortcuts_config_path(app_handle) {
        Ok(config_path) => {
            match serde_json::to_string_pretty(shortcuts) {
                Ok(json_content) => {
                    match std::fs::write(&config_path, json_content) {
                        Ok(_) => {
                            log::info!("Saved agent shortcuts to {:?}", config_path);
                            Ok(())
                        }
                        Err(e) => {
                            let error_msg = format!("Failed to write agent shortcuts config: {}", e);
                            log::error!("{}", error_msg);
                            Err(error_msg)
                        }
                    }
                }
                Err(e) => {
                    let error_msg = format!("Failed to serialize agent shortcuts config: {}", e);
                    log::error!("{}", error_msg);
                    Err(error_msg)
                }
            }
        }
        Err(e) => {
            let error_msg = format!("Failed to get agent shortcuts config path: {}", e);
            log::error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

#[cfg(desktop)]
fn parse_shortcut_string(shortcut_str: &str) -> Option<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    
    let parts: Vec<&str> = shortcut_str.split('+').map(|s| s.trim()).collect();
    if parts.len() < 1 {
        return None;
    }
    
    // Handle multiple modifiers or no modifiers
    let mut modifiers = Modifiers::empty();
    let key_part = if parts.len() == 1 {
        // No modifiers, just a key
        parts[0]
    } else {
        // Parse modifiers
        for i in 0..parts.len() - 1 {
            match parts[i] {
                "Cmd" | "Super" => modifiers |= Modifiers::SUPER,
                "Alt" => modifiers |= Modifiers::ALT,
                "Ctrl" => modifiers |= Modifiers::CONTROL,
                "Shift" => modifiers |= Modifiers::SHIFT,
                _ => return None,
            }
        }
        parts[parts.len() - 1] // Last part is the key
    };
    
    let key = match key_part {
        // Letters
        "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC, "D" => Code::KeyD,
        "E" => Code::KeyE, "F" => Code::KeyF, "G" => Code::KeyG, "H" => Code::KeyH,
        "I" => Code::KeyI, "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
        "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO, "P" => Code::KeyP,
        "Q" => Code::KeyQ, "R" => Code::KeyR, "S" => Code::KeyS, "T" => Code::KeyT,
        "U" => Code::KeyU, "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
        "Y" => Code::KeyY, "Z" => Code::KeyZ,
        
        // Numbers
        "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2, "3" => Code::Digit3,
        "4" => Code::Digit4, "5" => Code::Digit5, "6" => Code::Digit6, "7" => Code::Digit7,
        "8" => Code::Digit8, "9" => Code::Digit9,
        
        // Function keys
        "F1" => Code::F1, "F2" => Code::F2, "F3" => Code::F3, "F4" => Code::F4,
        "F5" => Code::F5, "F6" => Code::F6, "F7" => Code::F7, "F8" => Code::F8,
        "F9" => Code::F9, "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
        
        // Arrow keys
        "ArrowUp" => Code::ArrowUp,
        "ArrowDown" => Code::ArrowDown,
        "ArrowLeft" => Code::ArrowLeft,
        "ArrowRight" => Code::ArrowRight,
        
        // Special keys
        "Space" => Code::Space,
        "Enter" => Code::Enter,
        "Tab" => Code::Tab,
        "Escape" => Code::Escape,
        "Backspace" => Code::Backspace,
        "Delete" => Code::Delete,
        "Home" => Code::Home,
        "End" => Code::End,
        "PageUp" => Code::PageUp,
        "PageDown" => Code::PageDown,
        
        _ => return None,
    };
    
    Some(Shortcut::new(Some(modifiers), key))
}

#[cfg(desktop)]
pub fn register_global_shortcuts(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    
    // Get or create shortcut state
    let shortcut_state = app.state::<AppShortcutState>();
    let config = shortcut_state.config.lock().unwrap().clone();
    
    // Get agent shortcuts
    let agent_state = app.state::<AgentDiscoveryState>();
    let agent_shortcuts = agent_state.agent_shortcuts.lock().unwrap().clone();
    
    // Collect shortcuts to register with their original indices preserved
    let mut shortcuts_to_register: Vec<(tauri_plugin_global_shortcut::Shortcut, String, String)> = Vec::new();
    let mut shortcut_actions = Vec::new(); // Maps array index to action type
    let mut agent_ids = Vec::new(); // Maps array index to agent_id for agent shortcuts
    
    // Toggle (action_id = 0)
    if let Some(toggle) = &config.toggle {
        if let Some(shortcut) = parse_shortcut_string(toggle) {
            shortcuts_to_register.push((shortcut, toggle.clone(), "toggle".to_string()));
            shortcut_actions.push(0); // toggle action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Move up (action_id = 1)
    if let Some(move_up) = &config.move_up {
        if let Some(shortcut) = parse_shortcut_string(move_up) {
            shortcuts_to_register.push((shortcut, move_up.clone(), "move up".to_string()));
            shortcut_actions.push(1); // move up action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Move down (action_id = 2)
    if let Some(move_down) = &config.move_down {
        if let Some(shortcut) = parse_shortcut_string(move_down) {
            shortcuts_to_register.push((shortcut, move_down.clone(), "move down".to_string()));
            shortcut_actions.push(2); // move down action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Move left (action_id = 3)
    if let Some(move_left) = &config.move_left {
        if let Some(shortcut) = parse_shortcut_string(move_left) {
            shortcuts_to_register.push((shortcut, move_left.clone(), "move left".to_string()));
            shortcut_actions.push(3); // move left action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Move right (action_id = 4)
    if let Some(move_right) = &config.move_right {
        if let Some(shortcut) = parse_shortcut_string(move_right) {
            shortcuts_to_register.push((shortcut, move_right.clone(), "move right".to_string()));
            shortcut_actions.push(4); // move right action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Resize up (action_id = 5)
    if let Some(resize_up) = &config.resize_up {
        if let Some(shortcut) = parse_shortcut_string(resize_up) {
            shortcuts_to_register.push((shortcut, resize_up.clone(), "resize up".to_string()));
            shortcut_actions.push(5); // resize up action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Resize down (action_id = 6)
    if let Some(resize_down) = &config.resize_down {
        if let Some(shortcut) = parse_shortcut_string(resize_down) {
            shortcuts_to_register.push((shortcut, resize_down.clone(), "resize down".to_string()));
            shortcut_actions.push(6); // resize down action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Resize left (action_id = 7)
    if let Some(resize_left) = &config.resize_left {
        if let Some(shortcut) = parse_shortcut_string(resize_left) {
            shortcuts_to_register.push((shortcut, resize_left.clone(), "resize left".to_string()));
            shortcut_actions.push(7); // resize left action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Resize right (action_id = 8)
    if let Some(resize_right) = &config.resize_right {
        if let Some(shortcut) = parse_shortcut_string(resize_right) {
            shortcuts_to_register.push((shortcut, resize_right.clone(), "resize right".to_string()));
            shortcut_actions.push(8); // resize right action
            agent_ids.push(String::new()); // No agent for overlay shortcuts
        }
    }
    
    // Agent shortcuts (action_id = 9+)
    for (agent_id, shortcut_str) in &agent_shortcuts {
        if !shortcut_str.is_empty() {
            if let Some(shortcut) = parse_shortcut_string(shortcut_str) {
                let description = format!("toggle agent {}", agent_id);
                shortcuts_to_register.push((shortcut, shortcut_str.clone(), description));
                shortcut_actions.push(9); // agent toggle action
                agent_ids.push(agent_id.clone());
            }
        }
    }
    
    // Store shortcuts and their action mappings for the handler
    let registered_shortcuts = shortcuts_to_register.iter().map(|(s, _, _)| s.clone()).collect::<Vec<_>>();
    let shortcut_handle = app.handle().clone();
    
    // Register the global shortcut handler
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new().with_handler(move |app_handle, shortcut, event| {
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
                                                // Re-enforce click-through after position change
                                                ensure_overlay_click_through(&window);
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
                            5 | 6 | 7 | 8 => {
                                // Resize window directionally
                                match window.inner_size() {
                                    Ok(current_size) => {
                                        let size_delta = 50.0; // Resize increment in pixels
                                        let (new_width, new_height) = match action_id {
                                            5 => {
                                                // Resize up (increase height)
                                                let new_h = (current_size.height as f64 + size_delta).max(200.0);
                                                (current_size.width as f64, new_h)
                                            }
                                            6 => {
                                                // Resize down (decrease height)
                                                let new_h = (current_size.height as f64 - size_delta).max(200.0);
                                                (current_size.width as f64, new_h)
                                            }
                                            7 => {
                                                // Resize left (decrease width)
                                                let new_w = (current_size.width as f64 - size_delta).max(200.0);
                                                (new_w, current_size.height as f64)
                                            }
                                            8 => {
                                                // Resize right (increase width)
                                                let new_w = (current_size.width as f64 + size_delta).max(200.0);
                                                (new_w, current_size.height as f64)
                                            }
                                            _ => (current_size.width as f64, current_size.height as f64),
                                        };
                                        
                                        match window.set_size(tauri::Size::Physical(tauri::PhysicalSize { 
                                            width: new_width as u32, 
                                            height: new_height as u32 
                                        })) {
                                            Ok(_) => {
                                                let direction = match action_id {
                                                    5 => "up",
                                                    6 => "down",
                                                    7 => "left", 
                                                    8 => "right",
                                                    _ => "unknown",
                                                };
                                                log::info!("Overlay resized {} to {}x{}", direction, new_width, new_height);
                                                // Re-enforce click-through after size change
                                                ensure_overlay_click_through(&window);
                                            }
                                            Err(e) => {
                                                log::error!("Failed to resize overlay: {}", e);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log::error!("Failed to get overlay size: {}", e);
                                    }
                                }
                            }
                            9 => {
                                // Agent toggle
                                let agent_id = &agent_ids[array_idx];
                                if !agent_id.is_empty() {
                                    log::info!("Agent hotkey pressed for agent: {}", agent_id);
                                    let command_state = app_handle.state::<CommandState>();
                                    crate::commands::broadcast_command(&command_state, agent_id.clone(), "toggle".to_string());
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
                let formatted_shortcut = format!("{} {}", description, action);
                active_shortcuts.push(formatted_shortcut);
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

#[cfg(desktop)]
pub fn update_agent_shortcuts(app_handle: &AppHandle, new_shortcuts: std::collections::HashMap<String, String>) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    
    log::info!("Updating agent shortcuts dynamically");
    
    // Update the stored shortcuts
    let agent_state = app_handle.state::<AgentDiscoveryState>();
    *agent_state.agent_shortcuts.lock().unwrap() = new_shortcuts.clone();
    
    // Unregister all existing shortcuts
    match app_handle.global_shortcut().unregister_all() {
        Ok(_) => log::info!("Unregistered all existing shortcuts"),
        Err(e) => log::warn!("Failed to unregister shortcuts: {}", e),
    }
    
    // Re-register all shortcuts (overlay + agent)
    register_shortcuts_internal(app_handle)?;
    
    Ok(())
}

#[cfg(desktop)]
fn register_shortcuts_internal(app_handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    
    // Get shortcut configurations
    let shortcut_state = app_handle.state::<AppShortcutState>();
    let config = shortcut_state.config.lock().unwrap().clone();
    
    let agent_state = app_handle.state::<AgentDiscoveryState>();
    let agent_shortcuts = agent_state.agent_shortcuts.lock().unwrap().clone();
    
    // Collect shortcuts to register
    let mut shortcuts_to_register: Vec<(tauri_plugin_global_shortcut::Shortcut, String, String)> = Vec::new();
    let mut shortcut_actions = Vec::new();
    let mut agent_ids = Vec::new();
    
    // Add overlay shortcuts
    if let Some(toggle) = &config.toggle {
        if let Some(shortcut) = parse_shortcut_string(toggle) {
            shortcuts_to_register.push((shortcut, toggle.clone(), "toggle".to_string()));
            shortcut_actions.push(0);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(move_up) = &config.move_up {
        if let Some(shortcut) = parse_shortcut_string(move_up) {
            shortcuts_to_register.push((shortcut, move_up.clone(), "move up".to_string()));
            shortcut_actions.push(1);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(move_down) = &config.move_down {
        if let Some(shortcut) = parse_shortcut_string(move_down) {
            shortcuts_to_register.push((shortcut, move_down.clone(), "move down".to_string()));
            shortcut_actions.push(2);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(move_left) = &config.move_left {
        if let Some(shortcut) = parse_shortcut_string(move_left) {
            shortcuts_to_register.push((shortcut, move_left.clone(), "move left".to_string()));
            shortcut_actions.push(3);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(move_right) = &config.move_right {
        if let Some(shortcut) = parse_shortcut_string(move_right) {
            shortcuts_to_register.push((shortcut, move_right.clone(), "move right".to_string()));
            shortcut_actions.push(4);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(resize_up) = &config.resize_up {
        if let Some(shortcut) = parse_shortcut_string(resize_up) {
            shortcuts_to_register.push((shortcut, resize_up.clone(), "resize up".to_string()));
            shortcut_actions.push(5);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(resize_down) = &config.resize_down {
        if let Some(shortcut) = parse_shortcut_string(resize_down) {
            shortcuts_to_register.push((shortcut, resize_down.clone(), "resize down".to_string()));
            shortcut_actions.push(6);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(resize_left) = &config.resize_left {
        if let Some(shortcut) = parse_shortcut_string(resize_left) {
            shortcuts_to_register.push((shortcut, resize_left.clone(), "resize left".to_string()));
            shortcut_actions.push(7);
            agent_ids.push(String::new());
        }
    }
    
    if let Some(resize_right) = &config.resize_right {
        if let Some(shortcut) = parse_shortcut_string(resize_right) {
            shortcuts_to_register.push((shortcut, resize_right.clone(), "resize right".to_string()));
            shortcut_actions.push(8);
            agent_ids.push(String::new());
        }
    }
    
    // Add agent shortcuts
    for (agent_id, shortcut_str) in &agent_shortcuts {
        if !shortcut_str.is_empty() {
            if let Some(shortcut) = parse_shortcut_string(shortcut_str) {
                let description = format!("toggle agent {}", agent_id);
                shortcuts_to_register.push((shortcut, shortcut_str.clone(), description));
                shortcut_actions.push(9);
                agent_ids.push(agent_id.clone());
            }
        }
    }
    
    // Store shortcuts for the handler
    let registered_shortcuts = shortcuts_to_register.iter().map(|(s, _, _)| s.clone()).collect::<Vec<_>>();
    let shortcut_handle = app_handle.clone();
    
    // Register the global shortcut handler
    app_handle.plugin(
        tauri_plugin_global_shortcut::Builder::new().with_handler(move |app_handle, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            
            match shortcut_handle.get_webview_window("overlay") {
                Some(window) => {
                    let shortcut_idx = registered_shortcuts.iter().position(|s| s == shortcut);
                    if let Some(array_idx) = shortcut_idx {
                        let action_id = shortcut_actions[array_idx];
                        
                        match action_id {
                            0 => {
                                // Toggle overlay visibility
                                match window.is_visible() {
                                    Ok(visible) => {
                                        let result = if visible { window.hide() } else { window.show() };
                                        match result {
                                            Ok(_) => log::info!("Overlay {} via toggle shortcut", if visible { "hidden" } else { "shown" }),
                                            Err(e) => log::error!("Failed to {} overlay: {}", if visible { "hide" } else { "show" }, e),
                                        }
                                    }
                                    Err(e) => log::error!("Failed to check overlay visibility: {}", e),
                                }
                            }
                            1 | 2 | 3 | 4 => {
                                // Move overlay window
                                match window.outer_position() {
                                    Ok(current_pos) => {
                                        let (dx, dy) = match action_id {
                                            1 => (0, -50), 2 => (0, 50), 3 => (-50, 0), 4 => (50, 0), _ => (0, 0),
                                        };
                                        let new_x = current_pos.x + dx;
                                        let new_y = current_pos.y + dy;
                                        match window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: new_x, y: new_y })) {
                                            Ok(_) => {
                                                let direction = match action_id { 1 => "up", 2 => "down", 3 => "left", 4 => "right", _ => "unknown" };
                                                log::info!("Overlay moved {} to ({}, {})", direction, new_x, new_y);
                                                // Re-enforce click-through after position change
                                                ensure_overlay_click_through(&window);
                                            }
                                            Err(e) => log::error!("Failed to move overlay: {}", e),
                                        }
                                    }
                                    Err(e) => log::error!("Failed to get overlay position: {}", e),
                                }
                            }
                            5 | 6 | 7 | 8 => {
                                // Resize overlay window directionally
                                match window.inner_size() {
                                    Ok(current_size) => {
                                        let size_delta = 50.0;
                                        let (new_width, new_height) = match action_id {
                                            5 => {
                                                // Resize up (increase height)
                                                let new_h = (current_size.height as f64 + size_delta).max(200.0);
                                                (current_size.width as f64, new_h)
                                            }
                                            6 => {
                                                // Resize down (decrease height)
                                                let new_h = (current_size.height as f64 - size_delta).max(200.0);
                                                (current_size.width as f64, new_h)
                                            }
                                            7 => {
                                                // Resize left (decrease width)
                                                let new_w = (current_size.width as f64 - size_delta).max(200.0);
                                                (new_w, current_size.height as f64)
                                            }
                                            8 => {
                                                // Resize right (increase width)
                                                let new_w = (current_size.width as f64 + size_delta).max(200.0);
                                                (new_w, current_size.height as f64)
                                            }
                                            _ => (current_size.width as f64, current_size.height as f64),
                                        };
                                        match window.set_size(tauri::Size::Physical(tauri::PhysicalSize { 
                                            width: new_width as u32, 
                                            height: new_height as u32 
                                        })) {
                                            Ok(_) => {
                                                let direction = match action_id { 5 => "up", 6 => "down", 7 => "left", 8 => "right", _ => "unknown" };
                                                log::info!("Overlay resized {} to {}x{}", direction, new_width, new_height);
                                                ensure_overlay_click_through(&window);
                                            }
                                            Err(e) => log::error!("Failed to resize overlay: {}", e),
                                        }
                                    }
                                    Err(e) => log::error!("Failed to get overlay size: {}", e),
                                }
                            }
                            9 => {
                                // Agent toggle
                                let agent_id = &agent_ids[array_idx];
                                if !agent_id.is_empty() {
                                    log::info!("Agent hotkey pressed for agent: {}", agent_id);
                                    let command_state = app_handle.state::<CommandState>();
                                    crate::commands::broadcast_command(&command_state, agent_id.clone(), "toggle".to_string());
                                }
                            }
                            _ => log::warn!("Unknown action_id: {}", action_id),
                        }
                    }
                }
                None => log::warn!("Overlay window not found for shortcut"),
            }
        })
        .build(),
    )?;
    
    // Register shortcuts
    let mut active_shortcuts = Vec::new();
    for (shortcut, description, action) in shortcuts_to_register {
        match app_handle.global_shortcut().register(shortcut) {
            Ok(_) => {
                log::info!("✓ Registered shortcut '{}' for {}", description, action);
                let formatted_shortcut = format!("{} {}", description, action);
                active_shortcuts.push(formatted_shortcut);
            }
            Err(e) => log::warn!("✗ Failed to register shortcut '{}' for {}: {}", description, action, e),
        }
    }
    
    // Update active shortcuts state
    *shortcut_state.active_shortcuts.lock().unwrap() = active_shortcuts;
    
    Ok(())
}