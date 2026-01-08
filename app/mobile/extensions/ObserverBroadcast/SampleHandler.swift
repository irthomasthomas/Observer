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
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext()

        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
            return nil
        }

        // Simplest JPEG encoding - Rust will handle everything else
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, "public.jpeg" as CFString, 1, nil) else {
            return nil
        }

        CGImageDestinationAddImage(destination, cgImage, nil) // No options, just raw JPEG
        guard CGImageDestinationFinalize(destination) else {
            return nil
        }

        return data as Data
    }

    override func broadcastFinished() {
        NSLog("🎥 Broadcast finished")
    }
}
