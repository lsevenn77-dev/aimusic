import XCTest

final class StreamingUITests: XCTestCase {
    @MainActor private func launch(_ extra: [String] = []) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-streaming-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"] + extra
        app.launch()
        XCTAssertTrue(app.buttons["main-tab-0"].waitForExistence(timeout: 20))
        return app
    }
    @MainActor private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    @MainActor private func back(_ app: XCUIApplication) { app.navigationBars.buttons.element(boundBy: 0).tap() }
    @MainActor func testHomeLibrarySharedLikesAndPageNavigation() {
        let app = launch()
        let shortcut = app.buttons["music-shortcut-1"]
        XCTAssertTrue(shortcut.waitForExistence(timeout: 15))
        capture(app, "01-home")
        app.buttons["차트"].tap()
        XCTAssertTrue(app.buttons["이번 주"].waitForExistence(timeout: 5))
        app.buttons["오늘"].tap()
        XCTAssertTrue(app.staticTexts["오늘 · 한국 시간 기준 · 어제 집계 대비"].waitForExistence(timeout: 5))
        capture(app, "02-chart")
        app.buttons["검증용 밤의 산책 상세"].firstMatch.tap()
        XCTAssertTrue(app.buttons["좋아요"].waitForExistence(timeout: 5)); app.buttons["좋아요"].tap()
        XCTAssertTrue(app.buttons["창작자 프로필"].exists); app.buttons["창작자 프로필"].tap()
        XCTAssertTrue(app.staticTexts["프로필 검증 창작자"].waitForExistence(timeout: 5)); back(app)
        XCTAssertTrue(app.buttons["좋아요"].exists); back(app)
        XCTAssertTrue(app.staticTexts["오늘 · 한국 시간 기준 · 어제 집계 대비"].exists)
        app.buttons["main-tab-4"].tap()
        XCTAssertTrue(app.buttons["music-shortcut-1"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["전체 메뉴"].exists)
        capture(app, "03-my-music")
        app.buttons["music-shortcut-1"].tap()
        XCTAssertTrue(app.buttons["검증용 밤의 산책 상세"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["main-tab-4"].exists)
        back(app)
        app.buttons["계정 설정"].tap()
        XCTAssertTrue(app.buttons["알림 기록"].exists || app.buttons["계정 설정"].waitForExistence(timeout: 5))
        capture(app, "04-account-page")
    }
    @MainActor func testFiveTabsInboxFiltersPlayerAndDuetPages() {
        let app = launch()
        XCTAssertTrue(app.buttons["mini-player-collapse"].waitForExistence(timeout: 15))
        app.buttons["mini-player-collapse"].tap()
        XCTAssertTrue(app.staticTexts["mini-player-lyric"].exists)
        app.buttons["mini-player-collapse"].tap()
        app.buttons["재생 화면 열기"].tap()
        XCTAssertTrue(app.buttons["다음 곡"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["mini-player-collapse"].exists)
        app.buttons["닫기"].firstMatch.tap()
        app.buttons["main-tab-1"].tap()
        XCTAssertTrue(app.buttons["함께 부르는 검증용 멜로디 상세"].waitForExistence(timeout: 10))
        capture(app, "05-community")
        app.buttons["community-author-fixture-duet"].tap()
        XCTAssertTrue(app.staticTexts["프로필 검증 창작자"].waitForExistence(timeout: 5)); back(app)
        app.buttons["함께 부르는 검증용 멜로디 더보기"].tap()
        XCTAssertTrue(app.buttons["곡 정보 · 댓글"].waitForExistence(timeout: 5)); back(app)
        app.buttons["main-tab-2"].tap()
        XCTAssertTrue(app.buttons["sing-drafts"].waitForExistence(timeout: 5))
        capture(app, "06-sing")
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "듀엣 참여하기")).firstMatch.tap()
        XCTAssertTrue(app.buttons["듀엣 참여"].waitForExistence(timeout: 8)); capture(app, "07-duets")
        back(app)
        app.buttons["sing-drafts"].tap()
        XCTAssertTrue(app.buttons["이어 편집"].waitForExistence(timeout: 5)); back(app)
        app.buttons["main-tab-3"].tap()
        XCTAssertTrue(app.buttons["대화 검색"].waitForExistence(timeout: 5))
        app.buttons["안 읽음"].tap(); capture(app, "08-messages")
        app.buttons["대화 검색"].tap(); app.textFields["inbox-search"].tap(); app.textFields["inbox-search"].typeText("채팅")
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "다음에도 같이 불러요")).firstMatch.tap()
        XCTAssertTrue(app.textFields["chat-input"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["main-tab-3"].exists)
        back(app)
        XCTAssertEqual(app.textFields["inbox-search"].value as? String, "채팅")
        app.buttons["알림"].tap()
        XCTAssertTrue(app.staticTexts["내 듀엣에 참여했어요."].waitForExistence(timeout: 8)); capture(app, "09-activity")
    }
    @MainActor func testNarrowLargeTextAndEmptyLibrary() {
        let app = launch(["-streaming-large", "-streaming-empty"])
        XCTAssertTrue(app.buttons["music-shortcut-1"].waitForExistence(timeout: 12)); capture(app, "10-large-home")
        app.buttons["main-tab-1"].tap()
        XCTAssertTrue(app.buttons["함께 부르는 검증용 멜로디 상세"].waitForExistence(timeout: 8)); capture(app, "11-large-community")
        app.buttons["main-tab-4"].tap(); capture(app, "12-large-my")
        let shortcut = app.buttons["music-shortcut-0"]
        for _ in 0..<8 {
            let bottom = app.buttons["재생 화면 열기"].frame.minY - 12
            if shortcut.isHittable && shortcut.frame.maxY < bottom && shortcut.frame.minY > 130 { break }
            let scroll = app.scrollViews.firstMatch
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6)).press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
        }
        XCTAssertTrue(shortcut.isHittable); shortcut.tap()
        XCTAssertTrue(app.buttons["플레이리스트 만들기"].waitForExistence(timeout: 8)); capture(app, "12b-large-playlist")
    }
    @MainActor func testSignedOutAndDuetFailureAreNotFakeContent() {
        let app = launch(["-streaming-guest", "-streaming-error"])
        app.buttons["main-tab-4"].tap()
        XCTAssertTrue(app.buttons["로그인"].waitForExistence(timeout: 5)); capture(app, "13-signed-out")
        app.buttons["main-tab-2"].tap()
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "듀엣 참여하기")).firstMatch.tap()
        XCTAssertTrue(app.buttons["다시 시도"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["듀엣 참여"].exists); capture(app, "14-duet-error")
    }
}
