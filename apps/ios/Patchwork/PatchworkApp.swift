import SwiftUI

@main
struct PatchworkApp: App {
    var body: some Scene {
        WindowGroup { ShellView() }
    }
}

struct ShellView: View {
    var body: some View {
        TabView {
            NavigationStack {
                List {
                    Text("shell.welcome")
                    NavigationLink("shell.about") { AboutView() }
                        .accessibilityIdentifier("browse.about")
                }
                .navigationTitle(Text("app.title"))
            }
            .tabItem { Label("shell.browse", systemImage: "map") }
            NavigationStack {
                List {
                    NavigationLink("shell.about") { AboutView() }
                        .accessibilityIdentifier("settings.about")
                }
                .navigationTitle(Text("shell.settings"))
            }
            .tabItem { Label("shell.settings", systemImage: "gearshape") }
        }
        .tint(Color("PatchworkAccent"))
    }
}

struct AboutView: View {
    private let configuration = AppConfiguration.current
    var body: some View {
        List {
            Text("shell.purpose")
            LabeledContent("shell.environment", value: configuration.environment)
            LabeledContent("shell.version", value: configuration.version)
        }
        .navigationTitle(Text("shell.about"))
        .accessibilityIdentifier("about.content")
    }
}
