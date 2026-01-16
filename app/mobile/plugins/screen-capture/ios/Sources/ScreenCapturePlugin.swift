import ReplayKit
import UIKit
import Tauri

@objc public class ScreenCapturePlugin: Plugin {
    private var broadcastPicker: RPSystemBroadcastPickerView?
    private var pickerWindow: UIWindow?
    private let sharedDefaults = UserDefaults(suiteName: "group.com.observer.ai")

    override init() {
        super.init()
    }

    @objc public func startCapture(_ invoke: Invoke) throws {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 60, height: 60))
            picker.preferredExtension = "com.observer.ai.broadcast"
            picker.showsMicrophoneButton = false

            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                let window = UIWindow(windowScene: windowScene)
                window.rootViewController = UIViewController()
                window.windowLevel = .alert + 1
                window.isHidden = false
                window.rootViewController?.view.addSubview(picker)

                self.pickerWindow = window
                self.broadcastPicker = picker

                // Trigger picker button
                for view in picker.subviews {
                    if let button = view as? UIButton {
                        button.sendActions(for: .touchUpInside)
                        break
                    }
                }

                // Auto-hide window after user makes selection (2 seconds delay)
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                    self?.pickerWindow?.isHidden = true
                }
            }

            invoke.resolve(true)
        }
    }

    @objc public func stopCapture(_ invoke: Invoke) throws {
        DispatchQueue.main.async { [weak self] in
            self?.pickerWindow?.isHidden = true
            self?.pickerWindow = nil
            self?.broadcastPicker = nil
            invoke.resolve()
        }
    }

    @objc public func getFrame(_ invoke: Invoke) throws {
        // Deprecated - use get_broadcast_frame instead
        invoke.reject("Use get_broadcast_frame command instead")
    }

    @objc public func getBroadcastStatus(_ invoke: Invoke) throws {
        let isActive = sharedDefaults?.bool(forKey: "broadcast_active") ?? false
        let lastUpdate = sharedDefaults?.double(forKey: "last_frame_timestamp") ?? 0

        let status: [String: Any] = [
            "isActive": isActive,
            "lastFrameTimestamp": lastUpdate
        ]

        invoke.resolve(status)
    }
}

@_cdecl("init_plugin_screen_capture")
public func initPlugin() -> Plugin {
    return ScreenCapturePlugin()
}
