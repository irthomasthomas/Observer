
use std::process::{Command, Stdio};
use std::env;
use std::path::Path;

fn main() {
    let python_path = "python3"; 

    // Get the absolute path dynamically
    let current_dir = env::current_dir().expect("Failed to get current directory");
    let api_path = current_dir.join("..").join("python").join("api.py"); // Adjust based on your structure

    let child = Command::new(python_path)
        .arg(api_path.to_str().unwrap()) // Convert path to string
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn();

    match child {
        Ok(child) => println!("Successfully started api.py with PID: {}", child.id()),
        Err(e) => eprintln!("Failed to start api.py: {}", e),
    }

    observer_lib::run();
}
