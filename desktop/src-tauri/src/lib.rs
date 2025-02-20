use once_cell::sync::Lazy;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Manager;
use std::fs::OpenOptions;
use std::io::Write;
// Store the Python process globally
static PYTHON_PROCESS: Lazy<Arc<Mutex<Option<Child>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Start Python API using resources path
            start_python_api(&app.handle());
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                terminate_python_process();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    terminate_python_process();
}

fn log_to_file(message: &str) {
    let log_path = if cfg!(target_os = "windows") {
        "C:\\Temp\\observerlogs.txt"
    } else {
        "/tmp/observerlogs.txt"
    };
    
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path) 
    {
        if let Err(e) = writeln!(file, "{}", message) {
            eprintln!("Failed to write to log file: {}", e);
        }
    }
}


fn start_python_api(app_handle: &tauri::AppHandle) {
    log_to_file("Attempting to start Python API...");
    check_and_clear_port();

    // Get resource path and directory
    match app_handle.path().resolve("python/api.py", tauri::path::BaseDirectory::Resource) {
        Ok(path) => {
            let resource_dir = path.parent().unwrap();
            
            // Create error log path
            let error_log = if cfg!(target_os = "windows") {
                "C:\\Temp\\observer_error.txt"
            } else {
                "/tmp/observer_error.txt"
            };
            
            // Open error log file
            let err_file = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(error_log)
                .expect("Failed to open error log");
                
            // Redirect stderr to file
            let child = Command::new("python3")
                .arg(path.to_str().unwrap())
                .current_dir(resource_dir)
                .stdout(Stdio::null())
                .stderr(Stdio::from(err_file))
                .spawn();
                
            // Log process info
            match &child {
                Ok(process) => log_to_file(&format!("Started API with PID: {}", process.id())),
                Err(e) => log_to_file(&format!("Failed to start API: {}", e)),
            }
            
            *PYTHON_PROCESS.lock().unwrap() = child.ok();
        },
        Err(e) => log_to_file(&format!("Failed to resolve path: {}", e)),
    }
}

// Rest of the functions remain the same
fn check_and_clear_port() {
    if cfg!(target_os = "windows") {
        check_and_clear_port_windows();
    } else {
        check_and_clear_port_unix();
    }
}

fn check_and_clear_port_unix() {
    log_to_file("Checking port 8000 usage...");
    
    // Get detailed port usage info
    let port_info = Command::new("lsof")
        .args(["-i", ":8000", "-F", "pcn"])  // Format output with process ID, command, name
        .output();
        
    if let Ok(output) = port_info {
        let output_str = String::from_utf8_lossy(&output.stdout);
        log_to_file(&format!("Port 8000 usage info:\n{}", output_str));
    }
    
    // Try to get process listening on port 8000
    let netstat_info = Command::new("netstat")
        .args(["-anp", "tcp"])
        .output();
        
    if let Ok(output) = netstat_info {
        let output_str = String::from_utf8_lossy(&output.stdout);
        let filtered: Vec<&str> = output_str.lines()
            .filter(|line| line.contains(":8000"))
            .collect();
        log_to_file(&format!("Netstat tcp :8000 info:\n{}", filtered.join("\n")));
    }
    
    // Original port check and clearing logic
    let port_check = Command::new("lsof")
        .args(["-i", ":8000"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    if let Ok(status) = port_check {
        if status.success() {
            log_to_file("Port 8000 is in use. Attempting to kill processes...");
            let kill_cmd = "kill -9 $(lsof -t -i:8000)";
            let kill_result = Command::new("sh")
                .args(["-c", kill_cmd])
                .output();
                
            match kill_result {
                Ok(output) => log_to_file(&format!(
                    "Kill result: stdout={}, stderr={}", 
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                )),
                Err(e) => log_to_file(&format!("Failed to kill process: {}", e))
            }
        } else {
            log_to_file("Port 8000 appears to be free");
        }
    }
}


fn check_and_clear_port_windows() {
    let netstat_output = Command::new("netstat").args(["-ano"]).output();

    if let Ok(output) = netstat_output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        for line in output_str.lines() {
            if line.contains(":8000") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    if let Ok(pid) = parts[4].parse::<u32>() {
                        println!("Found process using port 8000, PID: {}", pid);
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
