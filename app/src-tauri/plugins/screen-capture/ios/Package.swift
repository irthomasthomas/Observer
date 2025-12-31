// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "screen-capture",
    platforms: [
        .iOS(.v13)
    ],
    products: [
        .library(
            name: "screen-capture",
            type: .static,
            targets: ["ScreenCapturePlugin"]
        )
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "ScreenCapturePlugin",
            dependencies: [
                .product(name: "Tauri", package: "Tauri")
            ],
            path: "Sources"
        )
    ]
)
