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

    match app_handle.path().resolve("python", tauri::path::BaseDirectory::Resource) {
        Ok(python_dir) => {
            let api_path = python_dir.join("api.py");
            let python_exe = python_dir.join("python-bundle/bin/python3");
            
            // Start process with the known working path
            let child = Command::new(python_exe.to_str().unwrap())
                .arg(api_path.to_str().unwrap())
                .current_dir(&python_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn();
                
            if let Ok(mut process) = child {
                if let Some(stderr) = process.stderr.take() {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stderr);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                log_to_file(&format!("API stderr: {}", line));
                            }
                        }
                    });
                }
                log_to_file(&format!("Started API with PID: {}", process.id()));
                *PYTHON_PROCESS.lock().unwrap() = Some(process);
            } else if let Err(e) = &child {
                log_to_file(&format!("Failed to start API: {}", e));
            }
        },
        Err(e) => log_to_file(&format!("Failed to resolve python dir: {}", e)),
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
