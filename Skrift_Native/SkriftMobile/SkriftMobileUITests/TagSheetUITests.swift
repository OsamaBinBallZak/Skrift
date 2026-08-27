import XCTest

/// The reworked tag sheet (signed mock `mocks/note-destination-tags.html`). The thing that
/// made it annoying was invisible from source: the field auto-focused, so the sheet opened
/// as mostly keyboard and the suggestions you would rather tap were under it. This opens it
/// and looks.
final class TagSheetUITests: XCTestCase {

    private func capture(_ app: XCUIApplication, _ name: String) {
        Thread.sleep(forTimeInterval: 1.0)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testSheetOpensWithoutTheKeyboardAndRefusesADestinationWord() {
        let app = XCUIApplication()
        app.launchArguments = ["-inMemoryStore", "-seedPolished", "-selectFirstMemo"]
        app.launch()

        let addTag = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'add-tag-button'")).firstMatch
        XCTAssertTrue(addTag.waitForExistence(timeout: 20), "the ＋ Tag chip is missing")
        addTag.tap()

        let field = app.textFields["tag-input"]
        XCTAssertTrue(field.waitForExistence(timeout: 5), "the tag sheet did not open")
        // The keyboard must NOT be up: nothing is focused until you tap the field.
        XCTAssertFalse(app.keyboards.element.exists,
                       "the sheet opened straight into the keyboard again")
        capture(app, "tagsheet-open")

        // A destination word typed into the free field is refused, not tagged.
        field.tap()
        field.typeText("inspiration\n")
        let helper = app.staticTexts["tag-helper"]
        XCTAssertTrue(helper.waitForExistence(timeout: 5))
        XCTAssertTrue(helper.label.contains("destination"), helper.label)
        XCTAssertFalse(app.buttons["tag-chip-inspiration"].exists,
                       "it must not have become a tag")
        capture(app, "tagsheet-reserved-word")
    }
}
