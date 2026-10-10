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
    @MainActor func testFeedbackChatInputAndRecordingEditor() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["main-tab-3"].waitForExistence(timeout: 20))
        app.buttons["main-tab-3"].tap()
        let peer = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "채팅 테스트")).firstMatch
        XCTAssertTrue(peer.waitForExistence(timeout: 10)); peer.tap()
        let input = app.textFields["chat-input"]
        XCTAssertTrue(input.waitForExistence(timeout: 5)); XCTAssertTrue(input.isHittable)
        input.tap(); input.typeText("DM immediate")
        app.buttons["chat-send"].tap()
        XCTAssertTrue(app.staticTexts["DM immediate"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["나"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Feedback DM composer"; shot.lifetime = .keepAlways; add(shot)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let crew = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "검증 크루")).firstMatch
        XCTAssertTrue(crew.waitForExistence(timeout: 5)); crew.tap()
        XCTAssertTrue(input.waitForExistence(timeout: 5)); XCTAssertTrue(input.isHittable)
        input.tap(); input.typeText("Crew immediate"); app.buttons["chat-send"].tap()
        XCTAssertTrue(app.staticTexts["Crew immediate"].waitForExistence(timeout: 3))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["feedback-menu"].tap(); app.buttons["녹음 편집 검증"].tap()
        let preview = app.buttons["recording-preview"]
        XCTAssertTrue(preview.waitForExistence(timeout: 10)); preview.tap()
        XCTAssertTrue(app.sliders["녹음 재생 위치"].exists)
        app.sliders["녹음 재생 위치"].adjust(toNormalizedSliderPosition: 0.5)
        XCTAssertTrue(app.buttons["가사 구간 다시 부르기 · 다른 구간은 유지"].exists)
        let editor = XCTAttachment(screenshot: app.screenshot()); editor.name = "Feedback recording seek and effects"; editor.lifetime = .keepAlways; add(editor)
        app.buttons["가사 구간 다시 부르기 · 다른 구간은 유지"].tap()
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "두 번째 구간")).firstMatch.waitForExistence(timeout: 5))
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "두 번째 구간")).firstMatch.tap()
        XCTAssertTrue(app.buttons["녹음 시작"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["모니터링"].exists)
        XCTAssertTrue(app.sliders["녹음 중 반주 음량"].exists)
    }

    @MainActor func testGiftSheetAndEditorKeyboardDismissal() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["feedback-menu"].waitForExistence(timeout: 15))
        app.buttons["feedback-menu"].tap(); app.buttons["선물창 검증"].tap()
        XCTAssertTrue(app.buttons["보내기"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["무료 보상"].exists)
        let stepper = app.steppers.firstMatch
        XCTAssertTrue(stepper.exists)
        stepper.buttons.element(boundBy: 1).tap(); stepper.buttons.element(boundBy: 1).tap()
        app.buttons["보내기"].tap(); app.buttons["선물 보내기"].tap()
        XCTAssertTrue(app.staticTexts["3개 전송 완료"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["보내기"].isEnabled)
        let giftShot = XCTAttachment(screenshot: app.screenshot()); giftShot.name = "Feedback gift sheet depleted balance"; giftShot.lifetime = .keepAlways; add(giftShot)
        app.buttons["닫기"].tap()
        app.buttons["feedback-menu"].tap(); app.buttons["녹음 편집 검증"].tap()
        let description = app.textFields["이 녹음에 대한 소개"]
        for _ in 0..<10 { if description.exists && description.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(description.exists); description.tap(); description.typeText("Keyboard check")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        app.staticTexts["내 커버곡 게시"].tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 3), .completed)
    }

}
