// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{Manager, State};

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
    // Use the Tokio runtime to run our async server.
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        use axum::Router;
        use tower_http::services::ServeDir;

        const SERVER_PORT: u16 = 3838; // Define a constant for the port.
        let url = format!("http://127.0.0.1:{}", SERVER_PORT);
        let addr_str = url.replace("http://", "");

        // Update the managed ServerUrl state so the frontend can access it.
        let server_url_state = app_handle.state::<Mutex<ServerUrl>>();
        *server_url_state.lock().unwrap() = ServerUrl(url.clone());

        // Define the path to your web assets.
        let resource_path = app_handle
            .path()
            .resource_dir()
            .expect("failed to get resource directory")
            .join("_up_/dist");

        log::info!("Serving static files from: {:?}", resource_path);

        // Build the Axum router that will serve the static files.
        let app = Router::new().nest_service("/", ServeDir::new(resource_path));

        // Attempt to bind to the port.
        let listener = tokio::net::TcpListener::bind(&addr_str).await;

        match listener {
            Ok(l) => {
                log::info!("Web server listening on {}", url);
                // Start the server.
                if let Err(e) = axum::serve(l, app.into_make_service()).await {
                    log::error!("Server error: {}", e);
                }
            }
            // If binding fails, log a helpful error message.
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
        // Make the ServerUrl available across the application.
        .manage(Mutex::new(ServerUrl(String::new())))
        .setup(|app| {
            // Initialize the logging plugin.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            // ---- Conditional Logic for Server ----

            // In PRODUCTION (release build), start the actual static file server in a new thread.
            #[cfg(not(debug_assertions))]
            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    start_static_server(app_handle);
                });
            }

            // In DEVELOPMENT, just grab the URL from the Vite dev server.
            #[cfg(debug_assertions)]
            {
                let server_url_state = app.state::<Mutex<ServerUrl>>();
                let dev_url = app.config().build.dev_url.clone().unwrap();
                log::info!("Development mode: pointing to Vite server at {}", dev_url);
                *server_url_state.lock().unwrap() = ServerUrl(dev_url.to_string());
            }

            Ok(())
        })
        // --- Plugins ---
        // We only need the shell plugin to open the URL in the browser.
        .plugin(tauri_plugin_shell::init())
        // The screenshot plugin has been removed.
        // .plugin(tauri_plugin_screenshots::init())
        .invoke_handler(tauri::generate_handler![get_server_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
