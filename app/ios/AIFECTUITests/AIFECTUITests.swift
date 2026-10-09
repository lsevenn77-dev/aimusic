import XCTest

final class AIFECTUITests: XCTestCase {
    @MainActor func testListeningDoesNotShowVideoAds() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ad-integration-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        let state = app.staticTexts["ad-state"]
        XCTAssertTrue(state.waitForExistence(timeout: 15))
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "ready"), object: state)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 60), .completed)
        let before = app.staticTexts["ad-impressions"].label
        app.buttons["감상 5곡 완료"].tap()
        let resumed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "listening-resumed"), object: app.staticTexts["ad-result"])
        XCTAssertEqual(XCTWaiter.wait(for: [resumed], timeout: 5), .completed)
        XCTAssertEqual(app.staticTexts["ad-impressions"].label, before)
        XCTAssertEqual(state.label, "ready")
    }
    @MainActor func testPaymentScreen() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["계정"].waitForExistence(timeout: 20))
        app.buttons["계정"].tap()
        XCTAssertTrue(app.buttons["Premium · 골드"].waitForExistence(timeout: 10))
        app.buttons["Premium · 골드"].tap()
        XCTAssertTrue(app.staticTexts["골드 충전"].waitForExistence(timeout: 15))
        // Product propagation and App Store availability are external to this UI test.
        // Verify the recovery/restore screen; production metadata was inspected separately.
        let list = app.collectionViews["payment-list"]
        XCTAssertTrue(list.waitForExistence(timeout: 10))
        let loading = app.descendants(matching: .any)["store-products-loading"].firstMatch
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: loading)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
        // Target the presented List, not the home ScrollView behind the account sheet.
        for _ in 0..<6 {
            if app.buttons["구매 복원"].exists { break }
            list.swipeUp()
        }
        XCTAssertTrue(app.buttons["구매 복원"].waitForExistence(timeout: 5))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "AIFECT payment review"
        capture.lifetime = .keepAlways
        add(capture)
    }
    @MainActor func testNativeTabsSearchAndLogin() throws {
        let app = XCUIApplication()
        continueAfterFailure = false
        app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        for index in 0..<5 { XCTAssertTrue(app.buttons["main-tab-\(index)"].waitForExistence(timeout: 20)) }
        app.buttons["검색"].firstMatch.tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap(); search.typeText("zz_no_such_song_9417\n")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "zz_no_such_song_9417")).firstMatch.waitForExistence(timeout: 15))
        let cancel = app.buttons["취소"]; if cancel.exists { cancel.tap() }
        app.buttons["main-tab-2"].tap()
        XCTAssertTrue(app.staticTexts["목소리를 발견하는 곳"].waitForExistence(timeout: 5))
        app.buttons["main-tab-1"].tap()
        XCTAssertTrue(app.buttons["추천"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["팔로잉"].exists)
        let messages = app.buttons["main-tab-3"]
        messages.tap()
        if !messages.isSelected { messages.tap() }
        XCTAssertTrue(app.staticTexts["메시지"].firstMatch.waitForExistence(timeout: 10))
        app.buttons["main-tab-4"].tap()
        if app.buttons["로그인"].waitForExistence(timeout: 3) {
            app.buttons["로그인"].tap()
            XCTAssertTrue(app.textFields["이메일"].waitForExistence(timeout: 10))
            app.buttons["닫기"].tap()
        } else { XCTAssertTrue(app.buttons["계정 설정"].waitForExistence(timeout: 10)) }
        app.buttons["main-tab-0"].tap()
        if app.navigationBars.buttons["홈"].exists { app.navigationBars.buttons["홈"].tap() }
        // App Store screenshot capture is intentionally separate from navigation tests.
    }
}
