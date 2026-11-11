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
    @MainActor func testComparePrimaryAndSecondaryScreens() {
        let app = launch()
        for tab in ["인기 차트","최신곡","발견","추천"] {
            let button = app.buttons[tab].firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 10)); button.tap(); capture(app, "home-" + tab)
        }
        for (index, names) in [(1,["라이브","크루","랭킹"]), (2,["노래","더빙","둘러보기"]), (3,["전체","안 읽음","크루","공지"]), (4,["내 작품","내 보관함","인벤토리"])] {
            app.buttons["main-tab-\(index)"].tap()
            for name in names {
                let button = app.buttons[name].firstMatch
                XCTAssertTrue(button.waitForExistence(timeout: 8), name)
                button.tap()
                capture(app, "\(index)-" + name)
            }
        }
        XCUIDevice.shared.press(.home)
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["인기 차트"].firstMatch.waitForExistence(timeout: 15))
        capture(app, "cold-launch")
    }
    @MainActor func testAndroidLatestDiscoveryDubbingAndLibrary() {
        let app = launch()
        app.buttons["최신곡"].firstMatch.tap()
        let play = app.buttons["전체 재생"].firstMatch
        let shuffle = app.buttons["셔플"].firstMatch
        XCTAssertTrue(shuffle.waitForExistence(timeout: 8))
        XCTAssertLessThan(abs(play.frame.midY - shuffle.frame.midY), 3)
        capture(app, "resume-latest")
        shuffle.tap()
        app.buttons["발견"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["기분과 순간"].waitForExistence(timeout: 8))
        capture(app, "resume-discover")
        app.buttons["discovery-chart"].tap()
        XCTAssertTrue(app.buttons["이번 주"].waitForExistence(timeout: 8))
        app.buttons["main-tab-2"].tap()
        app.buttons["더빙"].firstMatch.tap()
        let create = app.buttons["더빙 만들기"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 8))
        XCTAssertGreaterThan(create.frame.width, app.frame.width * 0.8)
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "극본 보기")).firstMatch.waitForExistence(timeout: 8))
        capture(app, "resume-dubbing")
        app.buttons["main-tab-4"].tap()
        app.buttons["내 보관함"].firstMatch.tap()
        let likes = app.buttons["music-shortcut-1"]
        let history = app.buttons["music-shortcut-2"]
        let lists = app.buttons["music-shortcut-0"]
        XCTAssertTrue(lists.waitForExistence(timeout: 8))
        XCTAssertLessThan(likes.frame.midY, history.frame.midY)
        XCTAssertLessThan(history.frame.midY, lists.frame.midY)
        capture(app, "resume-library")
        likes.tap()
        XCTAssertTrue(app.segmentedControls.buttons["좋아요"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.segmentedControls.buttons["좋아요"].isSelected)
        back(app)
        app.buttons["인벤토리"].firstMatch.tap()
        XCTAssertTrue(app.buttons["my-diamonds"].waitForExistence(timeout: 8))
        capture(app, "resume-inventory")
    }
    @MainActor func testOpenEveryMenuDestination() {
        let app = launch()
        let menu = ["홈","플레이","커뮤니티","선물함","메시지","알림 기록","마이","내 보관함","스튜디오","인기 차트","기분 · 장르별 발견","공개 플레이리스트","AI 아티스트","팔로우","인벤토리","오늘의 실버","다이아 · 내 정산"]
        for (i, name) in menu.enumerated() {
            app.buttons["main-tab-0"].tap()
            app.buttons["전체 메뉴"].firstMatch.tap()
            let list = app.descendants(matching: .any)["all-destinations"].firstMatch
            let item = list.buttons[name].firstMatch
            for _ in 0..<7 {
                let mini = app.buttons["재생 화면 열기"].firstMatch
                let lower = mini.exists ? mini.frame.minY - 8 : app.buttons["main-tab-0"].frame.minY - 8
                if item.isHittable && item.frame.midY < lower && item.frame.midY > 110 { break }
                list.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.65)).press(forDuration: 0.05, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.23)))
            }
            XCTAssertTrue(item.isHittable, name)
            item.tap()
            if ![0,1,2,4,6].contains(i) { XCTAssertTrue(app.navigationBars.buttons.firstMatch.waitForExistence(timeout: 6), name) }
            if i == menu.count - 1 { XCTAssertTrue(app.navigationBars["다이아 · 내 정산"].waitForExistence(timeout: 8)) }
            capture(app, "menu-\(i)-" + name)
            if ![0,1,2,4,6].contains(i) { back(app); app.buttons["main-tab-0"].tap() }
        }
    }
    @MainActor func testHomeLibrarySharedLikesAndPageNavigation() {
        let app = launch()
        let chartTab = app.buttons["인기 차트"]
        XCTAssertTrue(chartTab.waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons["main-tab-2"].label, "플레이")
        XCTAssertTrue(app.staticTexts["추천 음악"].firstMatch.exists)
        capture(app, "01-home")
        chartTab.tap()
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
        app.buttons["내 보관함"].tap()
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
        XCTAssertTrue(app.buttons["라이브"].waitForExistence(timeout: 10))
        capture(app, "05-community")
        app.buttons["main-tab-2"].tap()
        app.buttons["듀엣참여"].tap()
        XCTAssertTrue(app.buttons["듀엣 참여"].firstMatch.waitForExistence(timeout: 8))
        capture(app, "07-duets")
        app.buttons["내 초안"].tap()
        XCTAssertTrue(app.buttons["이어 편집"].firstMatch.waitForExistence(timeout: 8))
        app.buttons["main-tab-3"].tap()
        XCTAssertTrue(app.buttons["대화 검색"].waitForExistence(timeout: 5))
        app.buttons["안 읽음"].tap(); capture(app, "08-messages")
        app.buttons["대화 검색"].tap(); app.textFields["inbox-search"].tap(); app.textFields["inbox-search"].typeText("채팅")
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "다음에도 같이 불러요")).firstMatch.tap()
        XCTAssertTrue(app.textFields["chat-input"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["main-tab-3"].exists)
        back(app)
        XCTAssertEqual(app.textFields["inbox-search"].value as? String, "채팅")
        app.buttons["공지"].tap(); capture(app, "09-notices")
    }
    @MainActor func testNarrowLargeTextAndEmptyLibrary() {
        let app = launch(["-streaming-large", "-streaming-empty"])
        XCTAssertTrue(app.buttons["인기 차트"].waitForExistence(timeout: 12)); capture(app, "10-large-home")
        app.buttons["main-tab-1"].tap()
        XCTAssertTrue(app.buttons["라이브"].waitForExistence(timeout: 8)); capture(app, "11-large-community")
        app.buttons["main-tab-4"].tap(); app.buttons["내 보관함"].tap(); capture(app, "12-large-my")
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
        app.buttons["로그인"].tap()
        for provider in ["auth.kakao", "auth.apple", "auth.google"] {
            XCTAssertTrue(app.buttons[provider].waitForExistence(timeout: 8), provider)
        }
        capture(app, "13b-provider-choices")
        app.buttons["닫기"].tap()
        app.buttons["main-tab-2"].tap()
        app.buttons["듀엣참여"].tap()
        XCTAssertTrue(app.buttons["다시 시도"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["듀엣 참여"].exists); capture(app, "14-duet-error")
    }
}
