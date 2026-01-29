import SwiftRs
import Tauri
import UIKit
import AuthenticationServices

struct AuthenticateArgs: Decodable {
    let authUrl: String
    let callbackScheme: String
}

struct AuthResult: Encodable {
    let success: Bool
    let token: String?
    let error: String?
}

class AuthPlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
    @objc public func authenticate(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(AuthenticateArgs.self)
        
        print("Auth URL: \(args.authUrl)")
        print("Callback Scheme: \(args.callbackScheme)")
        
        guard let authUrl = URL(string: args.authUrl) else {
            invoke.reject("Invalid authentication URL")
            return
        }
        
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: authUrl, callbackURLScheme: args.callbackScheme) { callbackURL, error in
                if let error = error as? ASWebAuthenticationSessionError {
                    switch error.code {
                    case .canceledLogin:
                        print("User canceled login")
                        let result = AuthResult(success: false, token: nil, error: "User canceled login")
                        invoke.resolve(result)
                    case .presentationContextNotProvided:
                        print("Presentation context not provided")
                        let result = AuthResult(success: false, token: nil, error: "Presentation context not provided")
                        invoke.resolve(result)
                    case .presentationContextInvalid:
                        print("Presentation context invalid")
                        let result = AuthResult(success: false, token: nil, error: "Presentation context invalid")
                        invoke.resolve(result)
                    @unknown default:
                        print("Unknown error: \(error.localizedDescription)")
                        let result = AuthResult(success: false, token: nil, error: error.localizedDescription)
                        invoke.resolve(result)
                    }
                } else if let callbackURL = callbackURL {
                    // Return the full callback URL - the JS code will parse it
                    // This supports OAuth authorization code flow (Auth0, etc.) where the callback
                    // contains ?code=xxx&state=xxx rather than a direct token
                    let callbackURLString = callbackURL.absoluteString
                    print("Callback URL received: \(callbackURLString)")
                    let result = AuthResult(success: true, token: callbackURLString, error: nil)
                    invoke.resolve(result)
                } else {
                    print("Unknown error occurred")
                    let result = AuthResult(success: false, token: nil, error: "Unknown error occurred")
                    invoke.resolve(result)
                }
            }
            
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            
            if !session.start() {
                print("Failed to start ASWebAuthenticationSession")
                invoke.reject("Failed to start authentication session")
            }
        }
    }
    
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let window = UIApplication.shared.windows.first else {
            fatalError("No window found")
        }
        return window
    }
}

@_cdecl("init_plugin_auth")
func initPlugin() -> Plugin {
    return AuthPlugin()
}