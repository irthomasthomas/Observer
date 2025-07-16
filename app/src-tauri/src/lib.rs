// In src-tauri/src/lib.rs

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem}, // Correct imports for v2
    tray::TrayIconBuilder,    // Correct imports for v2
    Manager, State,
};

// A struct to hold the server URL, which will be managed by Tauri.
struct ServerUrl(String);

// A Tauri command that can be called from the frontend to get the server's URL.
#[tauri::command]
fn get_server_url(server_url: State<Mutex<ServerUrl>>) -> String {
    server_url.lock().unwrap().0.clone()
}

// This function starts the static file server only in release builds.
#[cfg(not(debug_assertions))]
fn start_static_server(app_handle: tauri::AppHandle) {
    // This function remains unchanged.
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        use axum::Router;
        use tower_http::services::ServeDir;

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

        let app = Router::new().nest_service("/", ServeDir::new(resource_path));
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(ServerUrl(String::new())))
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            // ---- Conditional Logic for Server ----
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
                log::info!("Development mode: pointing to Vite server at {}", dev_url);
                *server_url_state.lock().unwrap() = ServerUrl(dev_url.to_string());
            }

            // --- Create the Tray Icon ---
            let handle = app.handle();

            // In Tauri v2, you create menu items with a handle, text, enabled status, and an optional accelerator.
            let show = MenuItem::new(handle, "Show Launcher", true, None::<&str>)?;
            let quit = MenuItem::new(handle, "Quit", true, None::<&str>)?;

            // In Tauri v2, you create the menu with a list of items.
            let menu = Menu::with_items(handle, &[&show, &quit])?;

            // In Tauri v2, the builder methods are renamed (e.g., `with_tooltip` -> `tooltip`).
            let _tray = TrayIconBuilder::new()
                .tooltip("Observer AI is running")
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() { // Use event.id() to get the menu item ID
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                window.show().unwrap();
                                window.set_focus().unwrap();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // This is the crucial part for minimizing to tray
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                api.prevent_close(); // This prevents the app from closing
            }
            _ => {}
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_server_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
