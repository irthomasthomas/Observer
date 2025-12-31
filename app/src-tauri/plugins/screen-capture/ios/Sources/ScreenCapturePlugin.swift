import ReplayKit
import UIKit
import Tauri
import AVFoundation

@objc public class ScreenCapturePlugin: Plugin {
    private var recorder: RPScreenRecorder
    private var currentFrame: UIImage?
    private var isCapturing = false
    private let frameQueue = DispatchQueue(label: "com.observer.screencapture.frames")

    override init() {
        self.recorder = RPScreenRecorder.shared()
        super.init()
    }

    @objc public func startCapture(_ invoke: Invoke) throws {
        // Parse configuration
        guard let args = invoke.parseArgs(CaptureConfig.self) else {
            invoke.reject("Invalid configuration")
            return
        }

        // Check if recording is available
        guard recorder.isAvailable else {
            invoke.reject("Screen recording not available on this device")
            return
        }

        // Check if already capturing
        if isCapturing {
            invoke.resolve(true)
            return
        }

        // Start capture with handler for video frames
        recorder.startCapture(handler: { [weak self] (sampleBuffer, bufferType, error) in
            guard let self = self else { return }

            if let error = error {
                NSLog("Screen capture error: \(error.localizedDescription)")
                return
            }

            // Process only video frames
            if bufferType == .video {
                self.processVideoFrame(sampleBuffer: sampleBuffer)
            }
        }) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                NSLog("Failed to start capture: \(error.localizedDescription)")
                invoke.reject("Failed to start screen capture: \(error.localizedDescription)")
            } else {
                self.isCapturing = true
                NSLog("Screen capture started successfully")
                invoke.resolve(true)
            }
        }
    }

    @objc public func stopCapture(_ invoke: Invoke) throws {
        guard isCapturing else {
            invoke.resolve()
            return
        }

        recorder.stopCapture { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                NSLog("Failed to stop capture: \(error.localizedDescription)")
                invoke.reject("Failed to stop screen capture: \(error.localizedDescription)")
            } else {
                self.isCapturing = false
                self.currentFrame = nil
                NSLog("Screen capture stopped successfully")
                invoke.resolve()
            }
        }
    }

    @objc public func getFrame(_ invoke: Invoke) throws {
        frameQueue.sync {
            guard let frame = self.currentFrame else {
                invoke.reject("No frame available")
                return
            }

            // Convert UIImage to JPEG data
            guard let imageData = frame.jpegData(compressionQuality: 0.8) else {
                invoke.reject("Failed to encode frame as JPEG")
                return
            }

            // Convert to base64
            let base64String = imageData.base64EncodedString()

            // Return base64 string
            invoke.resolve(base64String)
        }
    }

    // MARK: - Frame Processing

    private func processVideoFrame(sampleBuffer: CMSampleBuffer) {
        // Get image buffer from sample buffer
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return
        }

        // Convert CVPixelBuffer to CIImage
        let ciImage = CIImage(cvPixelBuffer: imageBuffer)

        // Create context for rendering
        let context = CIContext(options: [.useSoftwareRenderer: false])

        // Render to CGImage
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
            return
        }

        // Convert to UIImage and store
        let uiImage = UIImage(cgImage: cgImage)

        frameQueue.async {
            self.currentFrame = uiImage
        }
    }
}

// MARK: - Configuration Model

struct CaptureConfig: Decodable {
    let width: Int
    let height: Int
    let frameRate: Int
}

// MARK: - Plugin Registration

@_cdecl("init_plugin_screen_capture")
public func initPlugin() -> Plugin {
    return ScreenCapturePlugin()
}
