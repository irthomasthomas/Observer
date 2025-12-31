fn main() {
    tauri_build::build();

    // Platform-specific build steps
    #[cfg(target_os = "android")]
    {
        println!("cargo:rustc-link-lib=dylib=c++");
    }

    #[cfg(target_os = "ios")]
    {
        // Link ReplayKit framework for screen recording (when plugin is ready)
        // println!("cargo:rustc-link-lib=framework=ReplayKit");
    }
}
