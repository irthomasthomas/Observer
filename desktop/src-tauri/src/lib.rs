use std::process::{Command, Stdio, Child};
use std::env;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

// Store the Python process globally so we can terminate it on shutdown
static PYTHON_PROCESS: Lazy<Arc<Mutex<Option<Child>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(None)));

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // First, attempt to start the Python API server
    start_python_api();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // When the window is closed, terminate the Python process
                terminate_python_process();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    
    // Additional fallback termination when the app fully exits
    terminate_python_process();
}

fn start_python_api() {
    // Check if port 8000 is already in use and terminate processes if necessary
    check_and_clear_port();

    let python_path = if cfg!(target_os = "windows") { "python" } else { "python3" }; 
    
    // Get the absolute path dynamically
    let current_dir = env::current_dir().expect("Failed to get current directory");
    let api_path = current_dir.join("..").join("python").join("api.py"); // Adjust based on your structure
    
    let child = Command::new(python_path)
        .arg(api_path.to_str().unwrap()) // Convert path to string
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn();
    
    match child {
        Ok(child_process) => {
            println!("Successfully started api.py with PID: {}", child_process.id());
            // Store the child process so we can terminate it later
            *PYTHON_PROCESS.lock().unwrap() = Some(child_process);
        },
        Err(e) => eprintln!("Failed to start api.py: {}", e),
    }
}

fn check_and_clear_port() {
    if cfg!(target_os = "windows") {
        check_and_clear_port_windows();
    } else {
        check_and_clear_port_unix();
    }
}

fn check_and_clear_port_unix() {
    // Check if port 8000 is in use on Unix systems
    let port_check = Command::new("lsof")
        .args(["-i", ":8000"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    
    if let Ok(status) = port_check {
        if status.success() {
            println!("WARNING: Port 8000 is already in use. Attempting to kill existing process...");
            // Try to kill the existing process using shell command
            let kill_cmd = "kill -9 $(lsof -t -i:8000)";
            let _ = Command::new("sh")
                .args(["-c", kill_cmd])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
}

fn check_and_clear_port_windows() {
    // Check if port 8000 is in use on Windows
    let netstat_output = Command::new("netstat")
        .args(["-ano"])
        .output();
    
    if let Ok(output) = netstat_output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        for line in output_str.lines() {
            if line.contains(":8000") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    if let Ok(pid) = parts[4].parse::<u32>() {
                        println!("Found process using port 8000, PID: {}", pid);
                        // Kill the process
                        let _ = Command::new("taskkill")
                            .args(["/F", "/PID", &pid.to_string()])
                            .output();
                    }
                }
            }
        }
    }
}

fn terminate_python_process() {
    let mut guard = PYTHON_PROCESS.lock().unwrap();
    if let Some(mut child) = guard.take() {
        println!("Terminating Python API process...");
        match child.kill() {
            Ok(_) => println!("Successfully terminated Python API process"),
            Err(e) => eprintln!("Failed to terminate Python API process: {}", e),
        }
    }
}
