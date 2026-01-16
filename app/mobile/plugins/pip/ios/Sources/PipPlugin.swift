import AVKit
import AVFoundation
import UIKit
import WebKit
import Tauri

@objc public class PipPlugin: Plugin {
    private var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    private var pipController: AVPictureInPictureController?
    private var videoURL: URL?
    private var containerView: UIView?

    override init() {
        super.init()
    }

    public override func load(webview: WKWebView) {
        super.load(webview: webview)

        // Enable Picture-in-Picture for HTML5 video elements
        if #available(iOS 14.2, *) {
            webview.configuration.allowsPictureInPictureMediaPlayback = true
            webview.configuration.allowsInlineMediaPlayback = true
        }
    }

    @objc public func startPip(_ invoke: Invoke) throws {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Check if PiP is supported
            guard AVPictureInPictureController.isPictureInPictureSupported() else {
                invoke.reject("PiP not supported on this device")
                return
            }

            // Configure audio session for background playback
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
                try AVAudioSession.sharedInstance().setActive(true)
            } catch {
                invoke.reject("Failed to configure audio session: \(error.localizedDescription)")
                return
            }

            // Generate black video if not already created
            if self.videoURL == nil {
                print("[PiP] Generating black video...")
                self.generateBlackVideo { [weak self] url in
                    guard let self = self, let url = url else {
                        invoke.reject("Failed to generate black video")
                        return
                    }

                    self.videoURL = url
                    self.setupPlayerAndPiP(with: url, invoke: invoke)
                }
            } else {
                self.setupPlayerAndPiP(with: self.videoURL!, invoke: invoke)
            }
        }
    }

    private func setupPlayerAndPiP(with url: URL, invoke: Invoke) {
        // Get the active window scene
        guard let windowScene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let window = windowScene.windows.first else {
            invoke.reject("No active window found")
            return
        }

        // Create player with black video
        self.player = AVPlayer(url: url)
        self.player?.actionAtItemEnd = .none // Don't stop at end

        // Loop the video
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: self.player?.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.player?.seek(to: .zero)
            self?.player?.play()
        }

        // Create a hidden container view for the player layer
        self.containerView = UIView(frame: CGRect(x: 0, y: 0, width: 480, height: 270))
        self.containerView?.isHidden = false // Must be visible for PiP to work
        self.containerView?.alpha = 0.01 // Nearly invisible but still rendered

        // Add to window
        window.addSubview(self.containerView!)

        // Create player layer and add to container
        self.playerLayer = AVPlayerLayer(player: self.player)
        self.playerLayer?.frame = self.containerView!.bounds
        self.containerView?.layer.addSublayer(self.playerLayer!)

        // Create PiP controller
        guard let playerLayer = self.playerLayer else {
            invoke.reject("Failed to create player layer")
            return
        }

        self.pipController = AVPictureInPictureController(playerLayer: playerLayer)
        self.pipController?.delegate = self

        // Enable automatic PiP when app goes to background
        if #available(iOS 14.2, *) {
            self.pipController?.canStartPictureInPictureAutomaticallyFromInline = true
        }

        // Start playing
        self.player?.play()

        // Small delay to ensure player is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            // Start PiP
            self?.pipController?.startPictureInPicture()
            print("[PiP] Started successfully")
            invoke.resolve()
        }
    }

    @objc public func stopPip(_ invoke: Invoke) throws {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: nil)

            self.pipController?.stopPictureInPicture()
            self.player?.pause()
            self.player = nil
            self.playerLayer?.removeFromSuperlayer()
            self.playerLayer = nil
            self.pipController = nil
            self.containerView?.removeFromSuperview()
            self.containerView = nil

            print("[PiP] Stopped successfully")
            invoke.resolve()
        }
    }

    // Generate a 480x270 black video (16:9 aspect ratio, 5 seconds long)
    private func generateBlackVideo(completion: @escaping (URL?) -> Void) {
        let tempDir = FileManager.default.temporaryDirectory
        let videoURL = tempDir.appendingPathComponent("black_video.mp4")

        // Remove old video if exists
        try? FileManager.default.removeItem(at: videoURL)

        let width = 480
        let height = 270
        let fps: Int32 = 30
        let duration: Double = 5.0

        guard let videoWriter = try? AVAssetWriter(outputURL: videoURL, fileType: .mp4) else {
            completion(nil)
            return
        }

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height
        ]

        let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: writerInput,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height
            ]
        )

        videoWriter.add(writerInput)
        videoWriter.startWriting()
        videoWriter.startSession(atSourceTime: .zero)

        let totalFrames = Int(duration * Double(fps))
        var frameCount = 0

        writerInput.requestMediaDataWhenReady(on: DispatchQueue(label: "videoQueue")) {
            while writerInput.isReadyForMoreMediaData && frameCount < totalFrames {
                let presentationTime = CMTime(value: Int64(frameCount), timescale: fps)

                if let buffer = self.createBlackPixelBuffer(width: width, height: height) {
                    adaptor.append(buffer, withPresentationTime: presentationTime)
                }

                frameCount += 1
            }

            if frameCount >= totalFrames {
                writerInput.markAsFinished()
                videoWriter.finishWriting {
                    if videoWriter.status == .completed {
                        print("[PiP] Black video generated at \(videoURL)")
                        completion(videoURL)
                    } else {
                        print("[PiP] Failed to generate video: \(String(describing: videoWriter.error))")
                        completion(nil)
                    }
                }
            }
        }
    }

    private func createBlackPixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        let options: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]

        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32ARGB,
            options as CFDictionary,
            &pixelBuffer
        )

        guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
            return nil
        }

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        let pixelData = CVPixelBufferGetBaseAddress(buffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)

        // Fill with black (all zeros)
        memset(pixelData, 0, bytesPerRow * height)

        return buffer
    }
}

// MARK: - AVPictureInPictureControllerDelegate
extension PipPlugin: AVPictureInPictureControllerDelegate {
    public func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        print("[PiP] Will start PiP")
    }

    public func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        print("[PiP] Did start PiP")
    }

    public func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        print("[PiP] Did stop PiP")
    }

    public func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        print("[PiP] Failed to start: \(error.localizedDescription)")
    }
}

@_cdecl("init_plugin_pip")
public func initPlugin() -> Plugin {
    return PipPlugin()
}
