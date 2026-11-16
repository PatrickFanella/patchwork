# Native iOS shell

SwiftUI phone shell for #249, iOS deployment target 17.0. Browse and Settings
use native tabs, lists and navigation, system text sizes and light/dark colors.
All member copy is in `Localizable.xcstrings`; localization tooling and expanded
locale journeys follow in #255. No login, discovery request or member mutation
is simulated by this shell.

From a clean checkout on Soyuz:

```sh
xcodebuild -project apps/ios/Patchwork.xcodeproj -scheme Patchwork \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath apps/ios/.build/simulator CODE_SIGNING_ALLOWED=NO build-for-testing
```

`Debug` uses loopback development API port 4000 and the reserved test identity
`org.example.patchwork.shell.development`. `Staging` uses a reserved `.invalid`
API endpoint and `org.example.patchwork.shell.staging`; override
`PATCHWORK_API_BASE_URL` for a real staging environment. `Release` has no
identity/API defaults and fails validation unless an explicit owned
`PATCHWORK_BUNDLE_ID` and HTTPS `PATCHWORK_API_BASE_URL` are supplied. These
are Xcode build settings, not secrets. No Apple team or signing credentials
are checked in. Do not use the reserved test identities for store distribution.
App/build version is 0.1.0 (1), visible with environment in About.

## Verification on 2026-11-15

Soyuz Xcode 27.2 (27B52), Swift 6.4.2, simulator SDK 27.2: unsigned Debug app
and UI-test target compiled successfully from a task-owned copy at
`/Users/onnwee/Work/Builds/patchwork-wave2-9c67d399`. This is compilation only.
The same checks run from checkout in `.github/workflows/native-ios.yml`.

T3 enumerated no iOS device host. Installation, test execution and interactive
launch/navigation are therefore **unverified**. The UI test is compiled, not
passed. To finish #249, register Soyuz with the shared device service, acquire
an iOS simulator using `device_open`, install the task's compiled app, and use
the returned command for launch/navigation. Then run Xcode's test runner with
that acquired destination. Do not guess a simulator UDID or bypass the device
service with SSH UI commands. No runtime download was attempted on the
capacity-constrained Mac.

Native list/navigation accessibility follows [SwiftUI's built-in accessibility
behavior](https://developer.apple.com/documentation/SwiftUI/View-Accessibility);
physical-device, larger-text and screen-reader qualification remain future
acceptance work.
