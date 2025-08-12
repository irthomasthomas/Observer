// In src-tauri/src/lib.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notifications;
mod overlay;

// ---- Final, Corrected Imports ----
use axum::{
    body::Body,
    extract::State as AxumState,
    http::{HeaderMap, Method, StatusCode, Uri},
    response::Response,
    routing::any,
    Router,
};
use futures::future::join_all;
use http_body_util::BodyExt;
use reqwest::Client;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
};

struct AppSettings {
    ollama_url: Mutex<Option<String>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct OverlayMessage {
    id: String,
    content: String,
    timestamp: u64,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct ShortcutConfig {
    toggle: Option<String>,
    move_up: Option<String>,
    move_down: Option<String>,
    move_left: Option<String>,
    move_right: Option<String>,
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

struct OverlayState {
    messages: Mutex<Vec<OverlayMessage>>,
}

struct AppShortcutState {
    config: Mutex<ShortcutConfig>,
    active_shortcuts: Mutex<Vec<String>>,
}

#[tauri::command]
async fn set_ollama_url(
    new_url: Option<String>, // Can be a string or null from frontend
    settings: State<'_, AppSettings>,
) -> Result<(), String> {
    log::info!("Setting Ollama URL to: {:?}", new_url);
    // Lock the mutex to get exclusive access and update the value.
    *settings.ollama_url.lock().unwrap() = new_url;
    Ok(()) // Return Ok to signal success to the frontend
}

#[tauri::command]
async fn get_ollama_url(settings: State<'_, AppSettings>) -> Result<Option<String>, String> {
    log::info!("Getting Ollama URL");
    // Lock the mutex, clone the value inside, and return it.
    // We clone so we don't hold the lock longer than necessary.
    let url = settings.ollama_url.lock().unwrap().clone();
    Ok(url)
}

#[tauri::command]
async fn check_ollama_servers(urls: Vec<String>) -> Result<Vec<String>, String> {
    // <-- No State parameter
    log::info!(
        "Rust backend received request to check servers (using dedicated client): {:?}",
        urls
    );

    // Create a new, temporary client just for this operation.
    let client = Client::new();

    // The rest of the logic is identical.
    let checks = urls.into_iter().map(|url| {
        let client = client.clone();
        let check_url = format!("{}/v1/models", url);

        tokio::spawn(async move {
            match client
                .get(&check_url)
                .timeout(std::time::Duration::from_millis(2500))
                .send()
                .await
            {
                Ok(response) if response.status().is_success() => {
                    log::info!("Success checking server at {}", url);
                    Some(url)
                }
                Ok(response) => {
                    log::warn!("Failed check for {}: Status {}", url, response.status());
                    None
                }
                Err(e) => {
                    log::warn!("Failed check for {}: Error: {}", url, e);
                    None
                }
            }
        })
    });

    let results = join_all(checks).await;

    let successful_urls: Vec<String> = results
        .into_iter()
        .filter_map(|res| res.ok().flatten())
        .collect();

    log::info!("Found running servers at: {:?}", successful_urls);

    Ok(successful_urls)
}

#[tauri::command]
async fn get_overlay_messages(overlay_state: State<'_, OverlayState>) -> Result<Vec<OverlayMessage>, String> {
    log::info!("Getting overlay messages");
    let messages = overlay_state.messages.lock().unwrap().clone();
    Ok(messages)
}

#[tauri::command]
async fn clear_overlay_messages(overlay_state: State<'_, OverlayState>) -> Result<(), String> {
    log::info!("Clearing overlay messages");
    overlay_state.messages.lock().unwrap().clear();
    Ok(())
}

#[tauri::command]
async fn get_shortcut_config(shortcut_state: State<'_, AppShortcutState>) -> Result<ShortcutConfig, String> {
    log::info!("Getting shortcut config");
    let config = shortcut_state.config.lock().unwrap().clone();
    Ok(config)
}

#[tauri::command]
async fn get_active_shortcuts(shortcut_state: State<'_, AppShortcutState>) -> Result<Vec<String>, String> {
    log::info!("Getting active shortcuts");
    let active = shortcut_state.active_shortcuts.lock().unwrap().clone();
    Ok(active)
}

#[tauri::command]
async fn set_shortcut_config(
    config: ShortcutConfig,
    shortcut_state: State<'_, AppShortcutState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("Setting shortcut config: {:?}", config);
    
    // Update the config
    *shortcut_state.config.lock().unwrap() = config;
    
    // Note: In a production app, you'd want to unregister old shortcuts
    // and re-register new ones here. For now, we'll require a restart.
    log::info!("Shortcut config updated. Application restart required for changes to take effect.");
    
    Ok(())
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

// Shared state for our application
#[derive(Clone)]
struct AppState {
    app_handle: AppHandle,
    http_client: Client,
}

async fn proxy_handler(
    AxumState(state): AxumState<AppState>,
    method: Method,
    headers: HeaderMap,
    uri: Uri,
    body: Body,
) -> Result<Response, StatusCode> {
    let path = uri.path();
    let query = uri.query().unwrap_or("");

    let target_url = {
        // This whole block will evaluate to a single String value.

        let settings = state.app_handle.state::<AppSettings>();
        let ollama_url_guard = settings.ollama_url.lock().unwrap();

        let base_url = ollama_url_guard
            .as_deref()
            .unwrap_or("http://127.0.0.1:11434");

        // 2. This is the last line. With no semicolon, its value is "returned"
        //    from the block and assigned to `target_url`.
        format!("{}{}?{}", base_url, path, query)
    };

    log::info!("Proxying {} request to: {}", method, target_url);

    let body_bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(e) => {
            log::error!("Failed to collect request body: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let reqwest_request = state
        .http_client
        .request(method, &target_url)
        .headers(headers)
        .body(body_bytes);

    match reqwest_request.send().await {
        Ok(upstream_response) => {
            let mut response_builder = Response::builder()
                .status(upstream_response.status())
                .version(upstream_response.version());

            if let Some(headers) = response_builder.headers_mut() {
                headers.extend(upstream_response.headers().clone());
            }

            let response_stream = upstream_response.bytes_stream();
            let response_body = Body::from_stream(response_stream);

            Ok(response_builder.body(response_body).unwrap())
        }
        Err(e) => {
            log::error!("Proxy request to Ollama failed: {}", e);
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

#[derive(Clone)]
struct ServerUrl(String);

#[tauri::command]
fn get_server_url(server_url: State<Mutex<ServerUrl>>) -> String {
    server_url.lock().unwrap().0.clone()
}

#[cfg(not(debug_assertions))]
fn start_static_server(app_handle: tauri::AppHandle) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        const SERVER_PORT: u16 = 3838;
        let url = format!("http://127.0.0.1:{}", SERVER_PORT);
        let addr_str = url.replace("http://", "");

        let server_url_state = app_handle.state::<Mutex<ServerUrl>>();
        *server_url_state.lock().unwrap() = ServerUrl(url.clone());

        let resource_path = app_handle
            .path()
            .resource_dir()
            .expect("failed to get resource directory")
            .join("_up_/dist");

        log::info!("Serving static files from: {:?}", resource_path);

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        let state = AppState {
            app_handle: app_handle.clone(),
            http_client: Client::new(),
        };

        let app = Router::new()
            .route("/v1/*path", any(proxy_handler))
            .route("/api/*path", any(proxy_handler))
            .route("/ask", axum::routing::post(notifications::ask_handler))
            .route(
                "/ping",
                axum::routing::get(|| async {
                    log::info!("==== PING-PONG ====");
                    "pong"
                }),
            )
            .route("/message", axum::routing::post(notifications::message_handler))
            .route("/notification", axum::routing::post(notifications::notification_handler))
            .route("/overlay", axum::routing::post(overlay::overlay_handler))
            .fallback_service(ServeDir::new(resource_path))
            .with_state(state)
            .layer(cors);

        let listener = tokio::net::TcpListener::bind(&addr_str).await;

        match listener {
            Ok(l) => {
                log::info!("Web server listening on {}", url);
                if let Err(e) = axum::serve(l, app.into_make_service()).await {
                    log::error!("Server error: {}", e);
                }
            }
            Err(e) => {
                log::error!(
                    "FATAL: Failed to bind to address {}. Is another instance running? Error: {}",
                    addr_str,
                    e
                );
            }
        }
    });
}

#[cfg(desktop)]
fn register_global_shortcuts(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
    
    // Get or create shortcut state
    let shortcut_state = app.state::<AppShortcutState>();
    let config = shortcut_state.config.lock().unwrap().clone();
    
    // Collect shortcuts to register
    let mut shortcuts_to_register = Vec::new();
    
    if let Some(toggle) = &config.toggle {
        if let Some(shortcut) = parse_shortcut_string(toggle) {
            shortcuts_to_register.push((shortcut, toggle.clone(), "toggle"));
        }
    }
    
    if let Some(move_up) = &config.move_up {
        if let Some(shortcut) = parse_shortcut_string(move_up) {
            shortcuts_to_register.push((shortcut, move_up.clone(), "move up"));
        }
    }
    
    if let Some(move_down) = &config.move_down {
        if let Some(shortcut) = parse_shortcut_string(move_down) {
            shortcuts_to_register.push((shortcut, move_down.clone(), "move down"));
        }
    }
    
    if let Some(move_left) = &config.move_left {
        if let Some(shortcut) = parse_shortcut_string(move_left) {
            shortcuts_to_register.push((shortcut, move_left.clone(), "move left"));
        }
    }
    
    if let Some(move_right) = &config.move_right {
        if let Some(shortcut) = parse_shortcut_string(move_right) {
            shortcuts_to_register.push((shortcut, move_right.clone(), "move right"));
        }
    }
    
    // Store references for the handler
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
                    if let Some(idx) = shortcut_idx {
                        if idx == 0 {
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
                                            log::info!("Overlay {} via shortcut", if visible { "hidden" } else { "shown" });
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
                        } else {
                            // Move window
                            match window.outer_position() {
                                Ok(current_pos) => {
                                    let (dx, dy) = match idx {
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
                                            log::info!("Overlay moved to ({}, {})", new_x, new_y);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(ServerUrl("".to_string())))
        .manage(AppSettings {
            ollama_url: Mutex::new(None),
        })
        .manage(OverlayState {
            messages: Mutex::new(Vec::new()),
        })
        .manage(AppShortcutState {
            config: Mutex::new(ShortcutConfig::default()),
            active_shortcuts: Mutex::new(Vec::new()),
        })
        .setup(|app| {
            // We use the handle to call updater and restart
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Notice we use the handle to get the updater
                match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    handle.updater()
                })) {
                    Ok(updater_result) => {
                        match updater_result {
                            Ok(updater) => {
                                match updater.check().await {
                                    Ok(Some(update)) => {
                        log::info!("Update {} is available!", update.version);

                        // ---- V2 UPDATER DIALOG LOGIC ----
                        let question = format!(
                            "A new version ({}) of Observer is available. Would you like to install it now and restart?",
                            update.version
                        );
                        
                        // Use the new non-blocking dialog with a callback
                        handle.dialog().message(question)
                            .title("Update Available")
                            .buttons(tauri_plugin_dialog::MessageDialogButtons::YesNo)
                            .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                            .show(move |answer_is_yes| {
                                if answer_is_yes {
                                    log::info!("User agreed to update. Downloading and installing...");
                                    
                                    // We need a new async runtime to run the update download within the callback
                                    let update_handle = handle.clone();
                                    tauri::async_runtime::spawn(async move {
                                        if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                                            log::error!("Failed to install update: {}", e);
                                        } else {
                                            // Relaunch after successful install
                                            update_handle.restart();
                                        }
                                    });
                                } else {
                                    log::info!("User deferred the update.");
                                }
                            });

                    }
                                    Ok(None) => {
                                        log::info!("You are running the latest version!");
                                    }
                                    Err(e) => {
                                        log::error!("Updater check failed: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to get updater: {}", e);
                            }
                        }
                    }
                    Err(_) => {
                        log::error!("Updater panicked - continuing without update check");
                    }
                }
            });

            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            #[cfg(not(debug_assertions))]
            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    start_static_server(app_handle);
                });
            }

            #[cfg(debug_assertions)]
            {
                let server_url_state = app.state::<Mutex<ServerUrl>>();
                let dev_url = app.config().build.dev_url.clone().unwrap();
                *server_url_state.lock().unwrap() = ServerUrl(dev_url.to_string());
            }

            let menu_handle = app.handle();

            let show = MenuItem::with_id(menu_handle, "show", "Show Launcher", true, None::<&str>)?;
            let quit = MenuItem::with_id(menu_handle, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(menu_handle, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("Observer AI is running")
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "quit" => {
                        log::info!("Exit called");
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Create the overlay window synchronously to avoid race conditions
            match WebviewWindowBuilder::new(
                app,
                "overlay",
                WebviewUrl::App("/overlay".into()),
            )
            .title("Observer Overlay")
            .inner_size(300.0, 200.0)
            .position(50.0, 50.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(true)
            .resizable(true)
            .build() {
                Ok(window) => {
                    log::info!("Overlay window created successfully");
                    // Make the window draggable by setting it as focusable
                    if let Err(e) = window.set_focus() {
                        log::warn!("Could not focus overlay window: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("Failed to create overlay window: {}", e);
                    // Don't panic, just log the error
                }
            }

            // Register global shortcuts with graceful error handling
            #[cfg(desktop)]
            {
                register_global_shortcuts(app)?;
            }
            
            #[cfg(not(desktop))]
            {
                log::info!("Global shortcuts not available on this platform");
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_server_url,
            set_ollama_url,
            get_ollama_url,
            check_ollama_servers,
            get_overlay_messages,
            clear_overlay_messages,
            get_shortcut_config,
            get_active_shortcuts,
            set_shortcut_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
