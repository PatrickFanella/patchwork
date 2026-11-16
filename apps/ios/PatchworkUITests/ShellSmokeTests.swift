import XCTest

final class ShellSmokeTests: XCTestCase {
    func testLaunchAndNavigation() {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["browse.about"].waitForExistence(timeout: 10))
        app.buttons["browse.about"].tap()
        XCTAssertTrue(app.staticTexts["development"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Settings"].tap()
        app.buttons["settings.about"].tap()
        XCTAssertTrue(app.staticTexts["development"].waitForExistence(timeout: 5))
    }
}
