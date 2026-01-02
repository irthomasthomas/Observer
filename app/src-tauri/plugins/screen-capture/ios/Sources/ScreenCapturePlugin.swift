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
    }

    @objc public func startCapture(_ invoke: Invoke) throws {
        guard !isCapturing else {
            invoke.resolve(true)
            return
        }

        guard recorder.isAvailable else {
            invoke.reject("Screen recording not available on this device")
            return
        }

        recorder.startCapture(handler: { [weak self] (sampleBuffer, bufferType, error) in
            guard let self = self, error == nil, bufferType == .video else { return }
            self.processVideoFrame(sampleBuffer: sampleBuffer)
        }) { [weak self] error in
            guard let self = self else { return }
            
            if let error = error {
                invoke.reject("Failed to start screen capture: \(error.localizedDescription)")
            } else {
                self.isCapturing = true
                NSLog("[ScreenCapture] Started")
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
                invoke.reject("Failed to stop screen capture: \(error.localizedDescription)")
            } else {
                self.isCapturing = false
                self.currentFrame = nil
                NSLog("[ScreenCapture] Stopped")
                invoke.resolve()
            }
        }
    }

    @objc public func getFrame(_ invoke: Invoke) throws {
        guard let frame = self.currentFrame,
              let imageData = frame.jpegData(compressionQuality: 0.8) else {
            invoke.reject("No frame available")
            return
        }

        invoke.resolve(imageData.base64EncodedString())
    }

    private var frameCount = 0
    
    private func processVideoFrame(sampleBuffer: CMSampleBuffer) {
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
              let cgImage = CIContext(options: nil).createCGImage(
                  CIImage(cvPixelBuffer: imageBuffer),
                  from: CIImage(cvPixelBuffer: imageBuffer).extent
              ) else {
            return
        }

        self.currentFrame = UIImage(cgImage: cgImage)
        frameCount += 1
    }
}

@_cdecl("init_plugin_screen_capture")
public func initPlugin() -> Plugin {
    return ScreenCapturePlugin()
}
