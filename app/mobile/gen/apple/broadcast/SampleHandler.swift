import ReplayKit
import CoreImage
import CoreGraphics
import ImageIO
import AudioToolbox

@objc(SampleHandler)
class SampleHandler: RPBroadcastSampleHandler {

    private let videoServerURL = URL(string: "http://127.0.0.1:3838/frames")!
    private let audioServerURL = URL(string: "http://127.0.0.1:3838/audio")!
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
        switch sampleBufferType {
        case .video:
            handleVideoBuffer(sampleBuffer)
        case .audioApp, .audioMic:
            handleAudioBuffer(sampleBuffer)
        @unknown default:
            break
        }
    }

    private func handleVideoBuffer(_ sampleBuffer: CMSampleBuffer) {
        // Get pixel buffer
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        // Convert to raw bytes - let Rust handle the rest
        guard let imageData = pixelBufferToData(pixelBuffer) else { return }

        // POST to Rust (fire and forget)
        Task {
            var request = URLRequest(url: videoServerURL)
            request.httpMethod = "POST"
            request.httpBody = imageData
            request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")

            _ = try? await session.data(for: request)
        }
    }

    private func handleAudioBuffer(_ sampleBuffer: CMSampleBuffer) {
        // Extract audio data and format
        guard let audioData = audioBufferToData(sampleBuffer) else { return }

        // Get audio format description
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else { return }
        guard let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else { return }

        let sampleRate = UInt32(streamDescription.pointee.mSampleRate)
        let channels = UInt16(streamDescription.pointee.mChannelsPerFrame)
        let timestamp = Date().timeIntervalSince1970

        // POST to Rust (fire and forget)
        Task {
            var request = URLRequest(url: audioServerURL)
            request.httpMethod = "POST"
            request.httpBody = audioData
            request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
            request.setValue(String(sampleRate), forHTTPHeaderField: "X-Sample-Rate")
            request.setValue(String(channels), forHTTPHeaderField: "X-Channels")
            request.setValue(String(timestamp), forHTTPHeaderField: "X-Timestamp")

            _ = try? await session.data(for: request)
        }
    }

    private func audioBufferToData(_ sampleBuffer: CMSampleBuffer) -> Data? {
        var audioBufferList = AudioBufferList()
        var blockBuffer: CMBlockBuffer?

        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: &audioBufferList,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer
        )

        guard status == noErr else { return nil }
        defer { blockBuffer = nil }

        // Get the audio buffer
        guard let mData = audioBufferList.mBuffers.mData else { return nil }
        let dataSize = Int(audioBufferList.mBuffers.mDataByteSize)

        // Get format description to determine source format
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else { return nil }
        guard let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else { return nil }

        let sourceFormat = streamDescription.pointee.mFormatFlags
        let bytesPerSample = Int(streamDescription.pointee.mBitsPerChannel / 8)
        let numSamples = dataSize / bytesPerSample

        // Convert to f32 PCM
        var floatData = [Float](repeating: 0, count: numSamples)

        // Check if source is already float
        if (sourceFormat & kAudioFormatFlagIsFloat) != 0 {
            // Already float, just copy
            if bytesPerSample == 4 {
                mData.withMemoryRebound(to: Float.self, capacity: numSamples) { ptr in
                    floatData = Array(UnsafeBufferPointer(start: ptr, count: numSamples))
                }
            }
        } else {
            // Convert from integer to float
            if bytesPerSample == 2 {
                // Int16 to Float
                mData.withMemoryRebound(to: Int16.self, capacity: numSamples) { ptr in
                    for i in 0..<numSamples {
                        floatData[i] = Float(ptr[i]) / Float(Int16.max)
                    }
                }
            } else if bytesPerSample == 4 {
                // Int32 to Float
                mData.withMemoryRebound(to: Int32.self, capacity: numSamples) { ptr in
                    for i in 0..<numSamples {
                        floatData[i] = Float(ptr[i]) / Float(Int32.max)
                    }
                }
            }
        }

        // Convert float array to Data (little-endian)
        return floatData.withUnsafeBytes { Data($0) }
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
