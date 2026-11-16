import Foundation

struct AppConfiguration {
    let environment: String
    let apiBaseURL: URL
    let version: String

    static var current: AppConfiguration {
        let bundle = Bundle.main
        guard let environment = bundle.object(forInfoDictionaryKey: "PatchworkEnvironment") as? String,
              let base = bundle.object(forInfoDictionaryKey: "PatchworkAPIBaseURL") as? String,
              let url = URL(string: base), let scheme = url.scheme,
              ["http", "https"].contains(scheme), url.host != nil,
              environment != "release" || scheme == "https" else {
            preconditionFailure("Missing or invalid Patchwork build configuration")
        }
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return AppConfiguration(environment: environment, apiBaseURL: url, version: "\(version) (\(build))")
    }
}
