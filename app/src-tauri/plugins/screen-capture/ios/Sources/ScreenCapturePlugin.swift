import ReplayKit
import UIKit
import Tauri
import AVFoundation

@objc public class ScreenCapturePlugin: Plugin {
    private var recorder: RPScreenRecorder
    private var currentFrame: UIImage?
    private var isCapturing = false

    override init() {
        self.recorder = RPScreenRecorder.shared()
        super.init()
        NSLog("[ScreenCapture] Plugin initialized")
    }

    @objc public func startCapture(_ invoke: Invoke) throws {
        NSLog("[ScreenCapture] startCapture called")
        
        // Check if already capturing
        if isCapturing {
            NSLog("[ScreenCapture] Already capturing, returning true")
            invoke.resolve(true)
            return
        }

        // Check if recording is available
        guard recorder.isAvailable else {
            NSLog("[ScreenCapture] Screen recording not available")
            invoke.reject("Screen recording not available on this device")
            return
        }

        // Start capture
        recorder.startCapture(handler: { [weak self] (sampleBuffer, bufferType, error) in
            guard let self = self else { return }

            if let error = error {
                NSLog("[ScreenCapture] Capture error: \(error.localizedDescription)")
                return
            }

            // Process only video frames
            if bufferType == .video {
                self.processVideoFrame(sampleBuffer: sampleBuffer)
            }
        }) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                NSLog("[ScreenCapture] Failed to start: \(error.localizedDescription)")
                invoke.reject("Failed to start screen capture: \(error.localizedDescription)")
            } else {
                self.isCapturing = true
                NSLog("[ScreenCapture] Started successfully")
                invoke.resolve(true)
            }
        }
    }

    @objc public func stopCapture(_ invoke: Invoke) throws {
        NSLog("[ScreenCapture] stopCapture called")
        
        guard isCapturing else {
            NSLog("[ScreenCapture] Not capturing, nothing to stop")
            invoke.resolve()
            return
        }

        recorder.stopCapture { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                NSLog("[ScreenCapture] Failed to stop: \(error.localizedDescription)")
                invoke.reject("Failed to stop screen capture: \(error.localizedDescription)")
            } else {
                self.isCapturing = false
                self.currentFrame = nil
                NSLog("[ScreenCapture] Stopped successfully")
                invoke.resolve()
            }
        }
    }

    @objc public func getFrame(_ invoke: Invoke) throws {
        guard let frame = self.currentFrame else {
            invoke.reject("No frame available")
            return
        }

        // Convert UIImage to JPEG data
        guard let imageData = frame.jpegData(compressionQuality: 0.8) else {
            NSLog("[ScreenCapture] Failed to encode frame as JPEG")
            invoke.reject("Failed to encode frame as JPEG")
            return
        }

        // Convert to base64
        let base64String = imageData.base64EncodedString()
        NSLog("[ScreenCapture] getFrame returning \(imageData.count) bytes as base64")
        invoke.resolve(base64String)
    }

    private var frameCount = 0
    
    private func processVideoFrame(sampleBuffer: CMSampleBuffer) {
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            NSLog("[ScreenCapture] Failed to get image buffer")
            return
        }

        let ciImage = CIImage(cvPixelBuffer: imageBuffer)
        let context = CIContext(options: [.useSoftwareRenderer: false])

        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
            NSLog("[ScreenCapture] Failed to create CGImage")
            return
        }

        let uiImage = UIImage(cgImage: cgImage)
        self.currentFrame = uiImage
        
        frameCount += 1
        if frameCount % 30 == 0 {
            NSLog("[ScreenCapture] Processed \(frameCount) frames, current size: \(cgImage.width)x\(cgImage.height)")
        }
    }
}

@_cdecl("init_plugin_screen_capture")
public func initPlugin() -> Plugin {
    return ScreenCapturePlugin()
}
