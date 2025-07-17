// In src-tauri/src/lib.rs

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ---- Simplified Imports ----
use axum::{
    extract::Query,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};
use tokio::process::Command as TokioCommand; // Use Tokio's Command for async execution

// Struct for query parameters: /exec?cmd=...
#[derive(Debug, Deserialize)]
struct ExecParams {
    cmd: String,
}

// The new, simplified handler for the /exec endpoint
async fn exec_handler(Query(params): Query<ExecParams>) -> impl IntoResponse {
    log::info!("Received command to execute");


    // DANGER: This approach bypasses Tauri's shell capabilities for this endpoint.
    // It directly executes whatever command is passed.
    // Ensure your frontend provides sanitized and expected commands.

    let parts: Vec<&str> = params.cmd.split_whitespace().collect();
    let (program, args) = match parts.split_first() {
        Some((p, a)) => (*p, a),
        None => {
            let error_msg = "Error: Empty command received.".to_string();
            log::error!("{}", error_msg);
            return (StatusCode::BAD_REQUEST, error_msg);
        }
    };

    // Execute the command using tokio::process::Command
    match TokioCommand::new(program).args(args).output().await {
        Ok(output) => {
            // Combine stdout and stderr into a single response string
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let response_body = format!("{}\n{}", stdout, stderr).trim().to_string();

            if output.status.success() {
                log::info!("Command successful. Output:\n{}", response_body);
                (StatusCode::OK, response_body)
            } else {
                log::error!("Command failed. Output:\n{}", response_body);
                (StatusCode::INTERNAL_SERVER_ERROR, response_body)
            }
        }
        Err(e) => {
            let error_msg = format!("Failed to execute command '{}': {}", program, e);
            log::error!("{}", error_msg);
            (StatusCode::INTERNAL_SERVER_ERROR, error_msg)
        }
    }
}


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
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
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

        // --- MODIFICATION: Router is now simpler, no CORS ---
        let app = Router::new()
            .route("/exec", get(exec_handler)) // Add our new simple route
            .nest_service("/", ServeDir::new(resource_path));

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
    // This part remains unchanged
    tauri::Builder::default()
        .manage(Mutex::new(ServerUrl(String::new())))
        .setup(|app| {
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
                log::info!("Development mode: pointing to Vite server at {}", dev_url);
                *server_url_state.lock().unwrap() = ServerUrl(dev_url.to_string());
            }

            let handle = app.handle();
            let show = MenuItem::new(handle, "Show Launcher", true, None::<&str>)?;
            let quit = MenuItem::new(handle, "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(handle, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("Observer AI is running")
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

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
        .invoke_handler(tauri::generate_handler![get_server_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
