import ReplayKit
import CoreImage
import CoreGraphics
import ImageIO

@objc(SampleHandler)
class SampleHandler: RPBroadcastSampleHandler {

    private let serverURL = URL(string: "http://127.0.0.1:8080/frames")!
    private let session: URLSession

    override init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 2.0
        self.session = URLSession(configuration: config)
        super.init()
    }

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        NSLog("🎥 Broadcast started")
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }

        // Get pixel buffer
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        // Convert to raw bytes - let Rust handle the rest
        guard let imageData = pixelBufferToData(pixelBuffer) else { return }

        // POST to Rust (fire and forget)
        Task {
            var request = URLRequest(url: serverURL)
            request.httpMethod = "POST"
            request.httpBody = imageData
            request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")

            _ = try? await session.data(for: request)
        }
    }

    private func pixelBufferToData(_ pixelBuffer: CVPixelBuffer) -> Data? {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext(options: nil)

        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
            return nil
        }

        // JPEG encoding with explicit options to preserve aspect ratio
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, "public.jpeg" as CFString, 1, nil) else {
            return nil
        }

        // Preserve original dimensions and aspect ratio
        let options: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: 0.8,
            kCGImagePropertyPixelWidth: cgImage.width,
            kCGImagePropertyPixelHeight: cgImage.height,
            kCGImagePropertyOrientation: 1  // No rotation/transformation
        ]

        CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            return nil
        }

        return data as Data
    }

    override func broadcastFinished() {
        NSLog("🎥 Broadcast finished")
    }
}
