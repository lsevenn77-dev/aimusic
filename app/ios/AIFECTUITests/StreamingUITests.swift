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
    @MainActor func testBottomTabsReceiveDirectTouchAfterLaunch() {
        let app = launch(["-home-density"])
        for index in [2, 3, 4, 1, 0, 2] {
            let tab = app.buttons["main-tab-\(index)"]
            XCTAssertTrue(tab.isHittable)
            tab.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: tab)
            XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 8), .completed)
        }
        XCTAssertTrue(app.buttons["더빙"].firstMatch.exists)
        capture(app, "bottom-tabs-direct-touch")
    }
    @MainActor func testBottomTabsReceiveDirectTouchWithMiniPlayer() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["mini-player-lyric"].waitForExistence(timeout: 10))
        for index in [1, 0, 1, 0, 3, 0, 4, 0, 2] {
            let tab = app.buttons["main-tab-\(index)"]
            tab.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: tab)
            XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed)
        }
    }
    @MainActor func testIPhoneHomeKeepsAndroidBannerAndSectionProportions() {
        let app = launch(["-home-density"])
        let banner = app.buttons["home-promotion-studio"]
        XCTAssertTrue(banner.waitForExistence(timeout: 10))
        let before = banner.frame
        XCTAssertEqual(before.width, app.frame.width - 28, accuracy: 2)
        XCTAssertEqual(before.height, max(142, before.width / 2.45), accuracy: 2)
        let chart = app.buttons["home-section-인기 차트"]
        XCTAssertTrue(chart.isHittable)
        XCTAssertTrue(app.descendants(matching: .any)["stream-song-density-4"].firstMatch.isHittable, "Five recommendation rows fit the iPhone 12 viewport")
        capture(app, "iphone12-home-fixed-promotion")
        chart.tap()
        XCTAssertTrue(app.buttons["전체 보기"].waitForExistence(timeout: 5))
        XCTAssertEqual(banner.frame.minY, before.minY, accuracy: 1, "Banner stays fixed when selecting a section")
        XCTAssertTrue(app.staticTexts["이번 주 · 1–5위"].waitForExistence(timeout: 8), app.debugDescription)
        capture(app, "iphone12-home-weekly-chart")
        app.buttons["home-section-추천"].tap()
        for index in [2, 1, 3, 4, 0] {
            let tab = app.buttons["main-tab-\(index)"]
            let start = Date()
            tab.tap()
            XCTAssertTrue(tab.isSelected)
            print("TAB_RESPONSE \(index) \(Date().timeIntervalSince(start))s (includes XCTest input delivery)")
        }
    }
    @MainActor func testPrimaryScreensUseAndroidContentDensity() {
        let app = launch(["-home-density", "-dubbing-recorder"])
        app.buttons["main-tab-2"].tap()
        XCTAssertLessThan(app.buttons["노래"].firstMatch.frame.minY, 60, "No extra Play title block")
        capture(app, "iphone12-play-density")
        app.buttons["더빙"].firstMatch.tap()
        XCTAssertTrue(app.buttons["dub-feature-fixture-project"].waitForExistence(timeout: 10))
        capture(app, "iphone12-dubbing-density")
        app.buttons["main-tab-1"].tap()
        XCTAssertLessThan(app.buttons["라이브"].firstMatch.frame.minY, 60, "No extra Community title block")
        capture(app, "iphone12-community-density")
        app.buttons["main-tab-4"].tap()
        XCTAssertTrue(app.buttons["edit-my-profile"].waitForExistence(timeout: 10), app.debugDescription)
        let profile = app.descendants(matching: .any)["my-compact-profile"].firstMatch
        XCTAssertLessThan(profile.frame.height, 150)
        XCTAssertTrue(app.buttons["edit-my-profile"].isHittable)
        capture(app, "iphone12-my-density")
    }
    @MainActor func testRoomNotificationsAndMessagesKeepUnderlyingRoomMounted() {
        let app = launch(["-crew-parity", "-notification-kinds", "-workspace-test-url", "http://127.0.0.1:4188/room-overlay-test.html#live/fixture-room"])
        app.buttons["main-tab-1"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["크루"].firstMatch.waitForExistence(timeout: 8))
        app.buttons["크루"].firstMatch.tap()
        let game = app.buttons["crew-weekly-game-banner"]
        XCTAssertTrue(game.waitForExistence(timeout: 10)); game.tap()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.buttons["Keep room draft"].waitForExistence(timeout: 15)); web.buttons["Keep room draft"].tap()
        web.links["Notifications"].tap()
        XCTAssertTrue(app.staticTexts["내 음악에 댓글을 남겼어요."].waitForExistence(timeout: 10))
        capture(app, "build20-room-notifications-overlay")
        app.buttons["노래방으로 돌아가기"].tap()
        XCTAssertTrue(web.staticTexts["Room draft retained"].waitForExistence(timeout: 5))
        XCTAssertFalse(web.staticTexts["LEAVE CONFIRMATION"].exists)
        web.links["Messages"].tap()
        XCTAssertTrue(app.buttons["노래방으로 돌아가기"].waitForExistence(timeout: 5))
        capture(app, "build20-room-messages-overlay")
        app.buttons["노래방으로 돌아가기"].tap()
        XCTAssertTrue(web.staticTexts["Room draft retained"].waitForExistence(timeout: 5))
        web.buttons["Room inbox"].tap()
        XCTAssertTrue(app.buttons["노래방으로 돌아가기"].waitForExistence(timeout: 5))
        app.buttons["노래방으로 돌아가기"].tap()
        XCTAssertTrue(web.staticTexts["Room draft retained"].waitForExistence(timeout: 5))
        XCTAssertFalse(web.staticTexts["LEAVE CONFIRMATION"].exists)
    }

    @MainActor func testRealJumpGamePracticeOnIPhoneViewport() {
        let app = launch(["-crew-parity", "-workspace-test-url", "http://127.0.0.1:4188/jump-test.html"])
        app.buttons["main-tab-1"].tap()
        app.buttons["크루"].firstMatch.tap()
        let game = app.buttons["crew-weekly-game-banner"]
        XCTAssertTrue(game.waitForExistence(timeout: 10)); game.tap()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 15))
        let practice = web.buttons["연습하기 · 랭킹 미반영"]
        XCTAssertTrue(practice.waitForExistence(timeout: 20), app.debugDescription)
        for _ in 0..<7 { if practice.isHittable { break }; web.swipeUp() }
        capture(app, "iphone12-real-jump-lobby")
        practice.tap()
        let pause = web.buttons["일시정지"].firstMatch
        XCTAssertTrue(pause.waitForExistence(timeout: 12), app.debugDescription)
        pause.tap()
        capture(app, "iphone12-real-jump-running")
        XCTAssertTrue(web.buttons["계속하기"].firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        capture(app, "iphone12-real-jump-paused")
    }
    @MainActor func testChartSwipesAndRetainsPositionAcrossTabs() {
        let app = launch(["-home-density", "-chart-swipe"])
        let chartTab = app.buttons["home-section-인기 차트"]
        capture(app, "build19-chart-before-selection")
        chartTab.tap()
        XCTAssertTrue(chartTab.isSelected, app.debugDescription)
        XCTAssertTrue(app.staticTexts["이번 주 · 1–10위"].waitForExistence(timeout: 10))
        let pager = app.descendants(matching: .any)["home-chart-pages"].firstMatch
        pager.swipeLeft()
        XCTAssertTrue(app.staticTexts["이번 주 · 11–20위"].waitForExistence(timeout: 5))
        pager.swipeLeft()
        XCTAssertTrue(app.staticTexts["이번 주 · 21–23위"].waitForExistence(timeout: 5))
        capture(app, "build19-chart-swiped-last-page")
        app.buttons["main-tab-3"].tap()
        XCTAssertFalse(app.buttons["home-section-인기 차트"].isHittable, "Previous tab cannot capture touches")
        XCTAssertFalse(app.staticTexts["순위 검증 21"].exists, "Previous tab is removed from accessibility")
        app.buttons["main-tab-0"].tap()
        XCTAssertTrue(app.staticTexts["이번 주 · 21–23위"].waitForExistence(timeout: 8), "Returning to the tab does not reset the chart")
        pager.swipeRight()
        XCTAssertTrue(app.staticTexts["이번 주 · 11–20위"].waitForExistence(timeout: 5))
        capture(app, "build19-chart-returned-with-position")
    }
    @MainActor func testCrewActionsOpenSeparateDestinations() {
        let app = launch(["-crew-parity"])
        app.buttons["main-tab-1"].tap()
        XCTAssertTrue(app.buttons["크루"].firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["크루"].firstMatch.tap()
        let notices = app.buttons["crew-notices-open"]
        XCTAssertTrue(notices.waitForExistence(timeout: 10))
        let firstRow = ["작품", "멤버", "소개"].map { app.buttons["crew-section-" + $0] }
        let secondRow = [notices, app.buttons["crew-membership-open"], app.buttons["crew-directory-open"]]
        for button in firstRow + secondRow { XCTAssertTrue(button.isHittable); XCTAssertGreaterThanOrEqual(button.frame.height, 44) }
        for button in firstRow { XCTAssertEqual(button.frame.minY, firstRow[0].frame.minY, accuracy: 1) }
        for button in secondRow { XCTAssertEqual(button.frame.minY, secondRow[0].frame.minY, accuracy: 1) }
        XCTAssertGreaterThan(secondRow[0].frame.minY, firstRow[0].frame.maxY)
        XCTAssertFalse(app.buttons["crew-chat-open"].exists)
        XCTAssertTrue(firstRow[0].isSelected)
        firstRow[1].tap(); XCTAssertTrue(app.staticTexts["봄밤"].waitForExistence(timeout: 5)); XCTAssertTrue(firstRow[1].isSelected)
        firstRow[2].tap(); XCTAssertTrue(app.buttons["크루 자세히 보기"].waitForExistence(timeout: 5))
        firstRow[0].tap(); XCTAssertTrue(app.staticTexts["크루 작품  2"].waitForExistence(timeout: 5))
        capture(app, "build20-crew-six-menus")
        notices.tap()
        XCTAssertTrue(app.staticTexts["이번 주 크루 공지"].waitForExistence(timeout: 8)); back(app)
        app.buttons["crew-membership-open"].tap()
        XCTAssertTrue(app.staticTexts["내 역할"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["crew-membership-leave"].exists); back(app)
        app.buttons["crew-directory-open"].tap()
        XCTAssertTrue(app.buttons["‹ 내 크루로 돌아가기"].waitForExistence(timeout: 5))
        app.buttons["‹ 내 크루로 돌아가기"].tap()
        XCTAssertTrue(app.buttons["crew-section-작품"].waitForExistence(timeout: 5))
    }
    @MainActor private func expectActivityUnread(_ app: XCUIApplication, _ count: Int) {
        let value = count > 0 ? "읽지 않음 \(count)개" : "읽지 않음 없음"
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: app.buttons["inbox-filter-알림"])
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 8), .completed)
    }
    @MainActor func testEnteringNotificationsReadsAllPagesAndUpdatesBadge() {
        let app = launch(["-notification-auto-read"])
        app.buttons["main-tab-3"].tap()
        expectActivityUnread(app, 55)
        app.buttons["inbox-filter-알림"].tap()
        expectActivityUnread(app, 0)
        XCTAssertFalse(app.buttons["읽음"].exists)
        XCTAssertFalse(app.staticTexts["NEW"].exists)
        let more = app.buttons["이전 알림 더 보기"]
        XCTAssertTrue(more.waitForExistence(timeout: 5)); more.tap()
        XCTAssertTrue(app.staticTexts["이전 알림 가수"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["NEW"].exists, "Read-through covers records outside the first page")
        capture(app, "build21-notifications-auto-read")
        app.buttons["inbox-filter-전체"].tap()
        XCTAssertTrue(app.staticTexts["채팅 테스트"].waitForExistence(timeout: 5))
        app.buttons["inbox-filter-알림"].tap()
        expectActivityUnread(app, 0)
        XCTAssertFalse(app.staticTexts["NEW"].exists)
    }
    @MainActor func testNotificationReadFailurePreservesUnreadAndCanRetry() {
        let app = launch(["-notification-auto-read", "-notification-read-failure"])
        app.buttons["main-tab-3"].tap()
        expectActivityUnread(app, 55)
        app.buttons["inbox-filter-알림"].tap()
        let retry = app.buttons["다시 시도"]
        XCTAssertTrue(retry.waitForExistence(timeout: 8))
        expectActivityUnread(app, 55)
        XCTAssertTrue(app.staticTexts["NEW"].firstMatch.exists)
        retry.tap()
        expectActivityUnread(app, 0)
        XCTAssertFalse(app.staticTexts["NEW"].exists)
        XCTAssertFalse(retry.exists)
    }
    @MainActor func testNotificationReadKeepsLaterArrivalUnreadUntilReentry() {
        let app = launch(["-notification-auto-read", "-notification-new-arrival"])
        app.buttons["main-tab-3"].tap()
        expectActivityUnread(app, 55)
        app.buttons["inbox-filter-알림"].tap()
        expectActivityUnread(app, 1)
        XCTAssertFalse(app.staticTexts["NEW"].exists)
        app.buttons["inbox-filter-전체"].tap()
        app.buttons["inbox-filter-알림"].tap()
        expectActivityUnread(app, 0)
    }
    @MainActor func testCommentNotificationsShowCorrectMessageAndOpenOriginalSong() {
        let app = launch(["-notification-kinds"])
        XCTAssertTrue(app.staticTexts["mini-player-lyric"].waitForExistence(timeout: 10))
        app.buttons["main-tab-3"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["inbox-filter-알림"].waitForExistence(timeout: 8))
        app.buttons["inbox-filter-알림"].tap()
        XCTAssertTrue(app.staticTexts["내 음악에 댓글을 남겼어요."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["내 듀엣에 참여했어요."].exists)
        capture(app, "build20-comment-notification")
        app.buttons["notification-open-fixture-comment"].tap()
        XCTAssertTrue(app.navigationBars["곡 상세"].waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(app.staticTexts["검증용 밤의 산책"].exists)
        back(app)
        let unknown = app.staticTexts["새로운 활동 알림이 도착했어요."]
        reveal(unknown, in: app.scrollViews.firstMatch, app: app)
        XCTAssertTrue(unknown.isHittable)
        XCTAssertFalse(app.buttons["notification-open-fixture-future-event"].exists)
        XCTAssertTrue(app.staticTexts["내 곡으로 커버를 공개했어요."].exists)
        capture(app, "build20-cover-and-unknown-notification")
    }
    @MainActor func testPlayInboxAndMyFollowAndroidNavigation() {
        let app = launch()
        app.buttons["main-tab-2"].tap()
        XCTAssertTrue(app.buttons["studio-section-인기"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["studio-section-듀엣 참여"].exists)
        capture(app, "build19-play-icons")
        app.buttons["둘러보기"].firstMatch.tap()
        XCTAssertTrue(app.buttons["browse-section-추천"].exists)
        capture(app, "build19-browse-icons")
        app.buttons["main-tab-3"].tap()
        XCTAssertTrue(app.buttons["inbox-filter-전체"].waitForExistence(timeout: 8))
        XCTAssertLessThan(app.buttons["inbox-filter-전체"].frame.minY, 65)
        XCTAssertFalse(app.buttons["메시지 관리"].exists)
        XCTAssertTrue(app.buttons["새 대화"].exists)
        capture(app, "build19-message-header")
        app.buttons["main-tab-4"].tap()
        XCTAssertTrue(app.buttons["edit-my-profile"].waitForExistence(timeout: 10))
        let gallery = app.buttons["my-gallery-open"]
        reveal(gallery, in: app.scrollViews.firstMatch, app: app)
        capture(app, "build19-my-shelves")
        gallery.tap()
        XCTAssertTrue(app.buttons["사진 추가"].waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertFalse(app.staticTexts["음악 프로필"].exists)
        capture(app, "build19-my-gallery")
    }
    @MainActor private func back(_ app: XCUIApplication) { app.navigationBars.buttons.element(boundBy: 0).tap() }
    @MainActor private func reveal(_ element: XCUIElement, in scroll: XCUIElement, app: XCUIApplication, towardTop: Bool = false, hasBottomBar: Bool = true) {
        let scroll = scroll.isHittable ? scroll : app.scrollViews.allElementsBoundByIndex.first { $0.isHittable && $0.frame.height > 100 } ?? scroll
        let mini = app.buttons["mini-player-collapse"]
        let bottomTab = app.buttons["main-tab-0"]
        for _ in 0..<10 {
            let bottom = hasBottomBar ? (mini.exists ? mini.frame.minY : bottomTab.exists ? bottomTab.frame.minY : app.frame.maxY - 25) : app.frame.maxY - 25
            if element.exists && element.isHittable && element.frame.midY > 130 && element.frame.midY < bottom - 12 { return }
            let a = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.57, dy: towardTop ? 0.32 : 0.67))
            let b = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.57, dy: towardTop ? 0.67 : 0.32))
            a.press(forDuration: 0.05, thenDragTo: b)
        }
        XCTFail("화면에서 누를 수 없는 항목: " + element.description)
    }
    @MainActor func testAndroid143DiscoveryInboxAndInputGain() {
        let app = launch(["-dubbing-recorder"])
        app.buttons["main-tab-2"].tap()
        XCTAssertTrue(app.buttons["인기"].exists)
        app.buttons["더빙"].firstMatch.tap()
        let feature = app.buttons["dub-feature-fixture-project"]
        XCTAssertTrue(feature.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["dubbing-create"].isHittable)
        XCTAssertTrue(app.staticTexts["AIFECT 오리지널"].exists)
        capture(app, "android143-dubbing-home")
        app.buttons["장르"].tap()
        XCTAssertTrue(app.textFields["작품 제목 또는 창작자 검색"].waitForExistence(timeout: 5))
        app.buttons["SF"].tap()
        XCTAssertFalse(app.buttons["dubbing-project-fixture-project"].exists)
        capture(app, "android143-dubbing-genres")
        app.buttons["추천"].firstMatch.tap()
        XCTAssertTrue(feature.waitForExistence(timeout: 5)); feature.tap()
        app.buttons["claim-role-guide"].tap()
        XCTAssertTrue(app.buttons["이어서 녹음"].waitForExistence(timeout: 8))
        app.buttons["dubbing-volume-open"].tap()
        let gain = app.sliders["dubbing-microphone-gain"]
        XCTAssertTrue(gain.waitForExistence(timeout: 5)); gain.adjust(toNormalizedSliderPosition: 1)
        XCTAssertEqual(app.staticTexts["dubbing-microphone-gain-value"].label, "200%")
        XCTAssertEqual(app.staticTexts["dubbing-background-volume-value"].label, "100%")
        capture(app, "android143-microphone")
        app.navigationBars["더빙 볼륨"].buttons["완료"].tap(); back(app); back(app)
        app.buttons["main-tab-3"].tap()
        XCTAssertTrue(app.buttons["새 대화"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["공지"].exists); XCTAssertTrue(app.buttons["알림"].exists)
        capture(app, "android143-inbox")
        app.buttons["inbox-dm-fixture-peer"].press(forDuration: 1)
        XCTAssertTrue(app.buttons["삭제"].waitForExistence(timeout: 5)); capture(app, "android143-dm-delete-confirm"); app.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.1)).tap()
        app.buttons["알림"].tap()
        XCTAssertTrue(app.staticTexts["내 듀엣에 참여했어요."].waitForExistence(timeout: 5))
        capture(app, "android143-activity")
    }

    @MainActor func testAndroidRoomThemesAndCreationValidation() {
        let app = launch()
        app.buttons["main-tab-1"].tap()
        let create = app.buttons["방 만들기"]
        XCTAssertTrue(create.waitForExistence(timeout: 10)); create.tap()
        let title = app.textFields["room-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        let headphones = app.buttons["room-theme-basic_light"]
        reveal(headphones, in: app.scrollViews.firstMatch, app: app, hasBottomBar: false)
        XCTAssertTrue(app.buttons["room-theme-basic_dark"].exists)
        XCTAssertFalse(app.buttons["room-theme-navy"].exists)
        XCTAssertFalse(app.buttons["room-theme-theme_expired"].exists)
        headphones.tap()
        capture(app, "android-parity-room-themes")
        let decrement = app.buttons["최대 인원 줄이기"]
        reveal(decrement, in: app.scrollViews.firstMatch, app: app, hasBottomBar: false); decrement.tap()
        let submit = app.buttons["room-create-submit"]
        reveal(submit, in: app.scrollViews.firstMatch, app: app, hasBottomBar: false)
        XCTAssertTrue(submit.isEnabled); submit.tap()
        XCTAssertTrue(app.navigationBars["검증용 노래방"].waitForExistence(timeout: 10))
    }
    @MainActor func testAndroidShopQuantityRetryAndDecorationActivation() {
        let app = launch(["-shop-parity"])
        app.buttons["main-tab-4"].tap(); app.buttons["인벤토리"].tap()
        let shop = app.buttons["my-item-shop"]
        XCTAssertTrue(shop.waitForExistence(timeout: 8)); reveal(shop, in: app.scrollViews.firstMatch, app: app); shop.tap()
        let rose = app.buttons["shop-product-rose"]
        XCTAssertTrue(rose.waitForExistence(timeout: 8)); rose.tap()
        app.buttons["shop-quantity-more"].tap()
        XCTAssertTrue(app.staticTexts["총 40 G"].exists)
        app.buttons["shop-buy-confirm"].tap()
        let retry = app.buttons["shop-order-retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 8))
        back(app); app.buttons["my-item-shop"].tap()
        XCTAssertTrue(retry.waitForExistence(timeout: 8)); retry.tap()
        XCTAssertTrue(app.staticTexts["shop-success"].waitForExistence(timeout: 8))
        XCTAssertEqual(app.staticTexts["shop-gold"].label, "1,210 G")
        app.buttons["토크룸 배경"].tap()
        XCTAssertTrue(app.buttons["shop-product-fixture-theme-shop"].waitForExistence(timeout: 5))
        app.buttons["액자"].tap()
        let frame = app.buttons["shop-product-fixture-frame-shop"]
        XCTAssertTrue(frame.waitForExistence(timeout: 5)); frame.tap()
        app.buttons["1개월"].tap()
        XCTAssertTrue(app.staticTexts["총 90 G"].exists)
        capture(app, "android-parity-decoration-checkout")
        app.buttons["shop-buy-confirm"].tap()
        XCTAssertTrue(app.staticTexts["검증 달빛 액자 1개를 인벤토리에 보관했어요."].waitForExistence(timeout: 8))
        XCTAssertEqual(app.staticTexts["shop-gold"].label, "1,120 G")
        app.buttons["인벤토리"].tap()
        let stored = app.buttons["inventory-decoration-fixture-stock"]
        XCTAssertTrue(stored.waitForExistence(timeout: 8)); reveal(stored, in: app.scrollViews.firstMatch, app: app)
        XCTAssertTrue(app.staticTexts["보관 중"].exists); stored.tap()
        XCTAssertTrue(app.buttons["inventory-use-confirm"].waitForExistence(timeout: 5))
        app.buttons["inventory-use-confirm"].tap()
        XCTAssertTrue(app.navigationBars["아이템 보관함"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["보관 중"].exists)
        XCTAssertFalse(app.buttons["inventory-decoration-fixture-stock"].isEnabled)
        capture(app, "android-parity-decorations-inventory")
    }
    @MainActor func testAndroidPlayCardsChartAndSongActions() {
        let app = launch()
        app.buttons["main-tab-2"].tap()
        XCTAssertTrue(app.textFields["곡 · 아티스트 · 제작자 검색"].waitForExistence(timeout: 8))
        capture(app, "android-parity-play-songs")
        app.buttons["main-tab-0"].tap(); app.buttons["인기 차트"].firstMatch.tap()
        let song = app.buttons["검증용 밤의 산책 상세"]
        XCTAssertTrue(song.waitForExistence(timeout: 10))
        capture(app, "android-parity-chart")
        song.tap()
        let actions = app.otherElements["song-quick-actions"]
        let like = app.buttons["song-action-like"]
        reveal(like, in: app.scrollViews.firstMatch, app: app)
        XCTAssertTrue(like.exists)
        XCTAssertEqual(actions.buttons.count, 4)
        capture(app, "android-parity-song-actions")
    }
    @MainActor func testAndroidChartCategoriesAndKaraokeRanking() {
        let app = launch()
        app.buttons["인기 차트"].firstMatch.tap()
        XCTAssertTrue(app.buttons["검증용 밤의 산책 상세"].waitForExistence(timeout: 10))
        capture(app, "parity-chart-compact-rows")
        app.buttons["신인"].tap()
        let first = app.buttons["검증용 밤의 산책 먼저 듣기"], second = app.buttons["함께 부르는 검증용 멜로디 먼저 듣기"]
        XCTAssertTrue(first.waitForExistence(timeout: 8)); XCTAssertTrue(second.waitForExistence(timeout: 8))
        XCTAssertEqual(first.frame.midY, second.frame.midY, accuracy: 2)
        XCTAssertLessThan(first.frame.midX, second.frame.midX)
        capture(app, "parity-chart-newcomers")
        app.buttons["노래방 차트"].tap()
        XCTAssertTrue(app.navigationBars["노래방 차트"].waitForExistence(timeout: 8))
        let title = app.buttons["함께 부르는 검증용 멜로디 상세"]
        reveal(title, in: app.scrollViews["cover-ranking-scroll"], app: app)
        capture(app, "parity-karaoke-chart")
        let singers = app.buttons["가수"]
        reveal(singers, in: app.scrollViews["cover-ranking-scroll"], app: app, towardTop: true); singers.tap()
        XCTAssertTrue(app.staticTexts["좋아요 24 · 커버 1곡"].waitForExistence(timeout: 8))
        capture(app, "parity-karaoke-singers")
    }
    @MainActor func testAndroidPlaylistDetailManagement() {
        let app = launch(["-playlist-management"])
        app.buttons["main-tab-4"].tap(); app.buttons["내 보관함"].tap()
        let lists = app.buttons["music-shortcut-0"]
        reveal(lists, in: app.scrollViews.firstMatch, app: app); lists.tap()
        let detail = app.buttons["my-playlist-manage-fixture-playlist"]
        XCTAssertTrue(detail.waitForExistence(timeout: 8)); detail.tap()
        XCTAssertTrue(app.buttons["playlist-cover-edit"].waitForExistence(timeout: 8))
        capture(app, "parity-playlist-detail")
        app.buttons["playlist-detail-edit"].tap()
        let name = app.textFields["플레이리스트 이름"]
        XCTAssertTrue(name.waitForExistence(timeout: 8)); name.tap(); name.typeText(" 수정")
        app.buttons["저장"].tap()
        XCTAssertTrue(app.staticTexts["검증용 플레이리스트 수정"].waitForExistence(timeout: 8))
        app.buttons["playlist-detail-add"].tap()
        let add = app.buttons["playlist-add-fixture-duet"]
        reveal(add, in: app.scrollViews["playlist-detail-scroll"], app: app); add.tap()
        let close = app.buttons["playlist-detail-add"]
        reveal(close, in: app.scrollViews["playlist-detail-scroll"], app: app, towardTop: true); close.tap()
        let up = app.buttons["playlist-up-fixture-duet"]
        reveal(up, in: app.scrollViews["playlist-detail-scroll"], app: app); up.tap()
        let moved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == false"), object: up)
        XCTAssertEqual(XCTWaiter.wait(for: [moved], timeout: 8), .completed)
        let remove = app.buttons["playlist-remove-fixture-original"]
        reveal(remove, in: app.scrollViews["playlist-detail-scroll"], app: app); remove.tap()
        let removed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: remove)
        XCTAssertEqual(XCTWaiter.wait(for: [removed], timeout: 8), .completed)
        capture(app, "parity-playlist-managed")
    }
    @MainActor func testAndroidPlaylistGridSearchCreateAndPlayback() {
        let app = launch()
        app.buttons["main-tab-4"].tap()
        app.buttons["내 보관함"].tap()
        let lists = app.buttons["music-shortcut-0"]
        reveal(lists, in: app.scrollViews.firstMatch, app: app)
        lists.tap()
        let search = app.textFields["my-playlist-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["playlist-play-fixture-playlist"].exists)
        capture(app, "android-parity-playlist-grid")
        search.tap(); search.typeText("없는목록")
        XCTAssertTrue(app.staticTexts["일치하는 목록이 없어요"].waitForExistence(timeout: 5))
        app.buttons["검색 지우기"].tap()
        search.typeText("\n")
        app.buttons["playlist-play-fixture-playlist"].tap()
        XCTAssertTrue(app.buttons["mini-player-collapse"].waitForExistence(timeout: 8))
        app.buttons["my-playlist-create"].tap()
        let name = app.textFields["my-playlist-create-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("새 검증 목록")
        app.buttons["my-playlist-create-save"].tap()
        XCTAssertTrue(app.buttons["playlist-play-fixture-created"].waitForExistence(timeout: 10))
        capture(app, "android-parity-playlist-created")
    }
    @MainActor func testAndroidStudioMetadataAndReturnRefresh() {
        let app = launch()
        app.buttons["main-tab-4"].tap()
        app.buttons["스튜디오 바로가기"].tap()
        XCTAssertTrue(app.staticTexts["이번 달 제작곡 1 / 3곡 · 2곡 남음"].waitForExistence(timeout: 10))
        capture(app, "android-parity-studio")
        let edit = app.buttons["studio-edit-fixture-original"]
        reveal(edit, in: app.scrollViews.firstMatch, app: app); edit.tap()
        let title = app.textFields["studio-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap()
        title.typeText(" 수정")
        let save = app.buttons["studio-track-save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.navigationBars["스튜디오"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["검증용 밤의 산책 수정"].waitForExistence(timeout: 10))
    }
    @MainActor func testAndroidOwnedGiftInventoryRetryUsesSameRequest() {
        let app = launch(["-owned-gift-retry"])
        app.buttons["main-tab-4"].tap()
        app.buttons["인벤토리"].tap()
        let gift = app.buttons["my-owned-gift-rose:true"]
        XCTAssertTrue(gift.waitForExistence(timeout: 10))
        reveal(gift, in: app.scrollViews.firstMatch, app: app)
        capture(app, "android-parity-owned-gifts")
        gift.tap()
        app.buttons["owned-gift-fixture-gift"].tap()
        let recipient = app.buttons["owned-gift-recipient-fixture-peer"]
        XCTAssertTrue(recipient.waitForExistence(timeout: 10)); recipient.tap()
        app.buttons["1개 보내기"].tap()
        let retry = app.buttons["전송 결과 확인 · 재시도"]
        XCTAssertTrue(retry.waitForExistence(timeout: 8)); retry.tap()
        app.buttons["1개 보내기"].tap()
        XCTAssertTrue(app.navigationBars["선물 관리"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["보유한 선물이 없어요"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["owned-gift-fixture-gift"].exists)
    }
    @MainActor func testCrewMemberHomeDirectoryAndRankings() {
        let app = launch(["-crew-parity"])
        app.buttons["main-tab-1"].tap()
        app.buttons["크루"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["크루 작품  2"].waitForExistence(timeout: 10))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let weekday = calendar.component(.weekday, from: Date())
        let game = app.buttons["crew-weekly-game-banner"]
        if (2...6).contains(weekday) {
            XCTAssertTrue(game.waitForExistence(timeout: 8))
            capture(app, "crew-home")
            game.tap()
            let gameTitle = ["점프러시", "월척헌터", "비트콤보", "터보레이스"].first { app.navigationBars[$0].exists }
            XCTAssertNotNil(gameTitle)
            back(app)
        } else { XCTAssertFalse(game.exists); capture(app, "crew-home") }
        app.buttons["멤버"].tap()
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "크루장")).firstMatch.exists)
        app.buttons["소개"].tap()
        XCTAssertTrue(app.buttons["크루 자세히 보기"].waitForExistence(timeout: 5))
        app.buttons["크루 찾기"].tap()
        XCTAssertTrue(app.textFields["crew-search"].waitForExistence(timeout: 8))
        app.buttons["‹ 내 크루로 돌아가기"].tap()
        app.buttons["크루 자세히 보기"].tap()
        XCTAssertTrue(app.staticTexts["crew-detail-name"].waitForExistence(timeout: 8))
        back(app)
        app.buttons["랭킹"].tap()
        app.buttons["ranking-category-크루"].tap()
        let first = app.buttons["crew-podium-crew-tide"]
        let second = app.buttons["crew-podium-crew-summer"]
        let third = app.buttons["crew-podium-crew-star"]
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        XCTAssertLessThan(second.frame.midX, first.frame.midX)
        XCTAssertLessThan(first.frame.midX, third.frame.midX)
        XCTAssertLessThan(first.frame.minY, second.frame.minY)
        let mine = app.buttons["my-crew-ranking"]
        XCTAssertTrue(mine.label.contains("4위"))
        capture(app, "crew-rankings")
        reveal(mine, in: app.scrollViews.firstMatch, app: app)
        mine.tap()
        XCTAssertTrue(app.staticTexts["crew-detail-name"].waitForExistence(timeout: 8))
    }
    @MainActor func testDubbingScriptReaderAndRoleSelection() {
        let app = launch()
        app.buttons["main-tab-2"].tap()
        app.buttons["더빙"].firstMatch.tap()
        XCTAssertTrue(app.buttons["dub-feature-fixture-project"].waitForExistence(timeout: 10)); app.buttons["dub-feature-fixture-project"].tap()
        XCTAssertTrue(app.navigationBars["더빙 스튜디오"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["mini-player-collapse"].exists)
        XCTAssertFalse(app.buttons["main-tab-2"].exists)
        let claim = app.buttons["claim-role-guide"]
        XCTAssertTrue(claim.waitForExistence(timeout: 8))
        capture(app, "dubbing-project-info")
        let more = app.buttons["전체 대본 펼쳐보기"]
        let scroll = app.scrollViews["dubbing-project-scroll"]
        reveal(more, in: scroll, app: app)
        more.tap()
        let last = app.staticTexts["예시 대사 6"]
        reveal(last, in: scroll, app: app)
        XCTAssertTrue(last.exists)
        XCTAssertTrue(app.staticTexts["0:20"].exists)
        capture(app, "dubbing-script-lines")
        reveal(claim, in: scroll, app: app, towardTop: true)
        claim.tap()
        XCTAssertTrue(app.navigationBars["안내자 · 녹음"].waitForExistence(timeout: 8))
        back(app)
        XCTAssertTrue(app.staticTexts["내 배역"].waitForExistence(timeout: 8))
        XCTAssertFalse(claim.exists)
        back(app)
        XCTAssertTrue(app.buttons["main-tab-2"].waitForExistence(timeout: 8))
    }
    @MainActor func testAndroidMyProfileActions() {
        let app = launch()
        app.buttons["main-tab-4"].tap()
        let gifts = app.buttons["my-gift-ranking"]
        XCTAssertTrue(gifts.waitForExistence(timeout: 10))
        let edit = app.buttons["edit-my-profile"]
        XCTAssertTrue(edit.isHittable)
        edit.tap()
        XCTAssertTrue(app.textFields["profile-name"].waitForExistence(timeout: 5)); back(app)
        capture(app, "my-profile-actions")
        gifts.tap()
        XCTAssertTrue(app.navigationBars["선물 랭킹 TOP 50"].waitForExistence(timeout: 8))
        back(app)
        app.buttons["계정 설정"].tap()
        XCTAssertTrue(app.navigationBars["계정"].waitForExistence(timeout: 8))
    }
    @MainActor func testCrewDirectoryForNonmember() {
        let app = launch(["-crew-parity", "-crew-nonmember"])
        app.buttons["main-tab-1"].tap()
        app.buttons["크루"].tap()
        XCTAssertTrue(app.textFields["crew-search"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["‹ 내 크루로 돌아가기"].exists)
    }
    @MainActor func testComparePrimaryAndSecondaryScreens() {
        let app = launch()
        for tab in ["인기 차트","최신곡","발견","추천"] {
            let button = app.buttons[tab].firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 10)); button.tap(); capture(app, "home-" + tab)
        }
        for (index, names) in [(1,["라이브","크루","랭킹"]), (2,["노래","더빙","둘러보기"]), (3,["전체","공지","알림"]), (4,["내 작품","내 보관함","인벤토리"])] {
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
        XCTAssertTrue(app.buttons["재생 종료"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["mini-player-lyric"].exists)
        app.buttons["재생 방식"].tap()
        XCTAssertEqual(app.buttons["재생 방식"].value as? String, "전체 반복")
        app.buttons["재생 화면 열기"].tap()
        XCTAssertTrue(app.buttons["다음 곡"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["mini-player-collapse"].exists)
        app.buttons["닫기"].firstMatch.tap()
        app.buttons["main-tab-1"].tap()
        XCTAssertTrue(app.buttons["라이브"].waitForExistence(timeout: 10))
        capture(app, "05-community")
        app.buttons["main-tab-2"].tap()
        app.buttons["듀엣 참여"].tap()
        XCTAssertTrue(app.buttons["듀엣 참여"].firstMatch.waitForExistence(timeout: 8))
        capture(app, "07-duets")
        app.buttons["내 초안"].tap()
        XCTAssertTrue(app.buttons["이어 편집"].firstMatch.waitForExistence(timeout: 8))
        app.buttons["main-tab-3"].tap()
        XCTAssertTrue(app.buttons["inbox-filter-전체"].waitForExistence(timeout: 5))
        capture(app, "08-messages")
        app.buttons["inbox-dm-fixture-peer"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "chat-input").firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["main-tab-3"].exists)
        back(app)
        XCTAssertTrue(app.buttons["inbox-filter-전체"].isSelected)
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
        XCTAssertTrue(app.buttons["my-playlist-create"].waitForExistence(timeout: 8)); capture(app, "12b-large-playlist")
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
        app.buttons["듀엣 참여"].tap()
        XCTAssertTrue(app.buttons["다시 시도"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["듀엣 참여"].exists); capture(app, "14-duet-error")
    }
    @MainActor func testNativeDubbingModesScriptNavigationAndSubmission() {
        let app = launch(["-dubbing-recorder"])
        app.buttons["main-tab-2"].tap(); app.buttons["더빙"].firstMatch.tap()
        XCTAssertTrue(app.buttons["dub-feature-fixture-project"].waitForExistence(timeout: 10)); app.buttons["dub-feature-fixture-project"].tap()
        let claim = app.buttons["claim-role-guide"]
        XCTAssertTrue(claim.waitForExistence(timeout: 8)); claim.tap()
        XCTAssertTrue(app.navigationBars["안내자 · 녹음"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["한 파트씩"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["전체 제출"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["전체 제출"].isEnabled)
        app.buttons["녹음 확인"].tap()
        XCTAssertTrue(app.buttons["재생 정지"].waitForExistence(timeout: 8))
        app.buttons["dubbing-volume-open"].tap()
        let background = app.sliders["dubbing-background-volume"], preview = app.sliders["dubbing-preview-volume"]
        XCTAssertTrue(background.waitForExistence(timeout: 8))
        background.adjust(toNormalizedSliderPosition: 0)
        XCTAssertEqual(app.staticTexts["dubbing-background-volume-value"].label, "0%")
        XCTAssertEqual(app.staticTexts["dubbing-preview-volume-value"].label, "100%")
        preview.adjust(toNormalizedSliderPosition: 0.5)
        let previewLevel = app.staticTexts["dubbing-preview-volume-value"].label
        XCTAssertTrue((45...55).contains(Int(previewLevel.replacingOccurrences(of: "%", with: "")) ?? -1))
        capture(app, "native-dubbing-volume")
        app.navigationBars["더빙 볼륨"].buttons["완료"].tap()
        app.buttons["이어서 녹음"].tap()
        XCTAssertTrue(app.buttons["연속 녹음 시작"].exists)
        app.buttons["다음"].tap()
        XCTAssertTrue(app.staticTexts["2 / 3"].exists)
        capture(app, "native-dubbing-continuous")
        app.buttons["한 파트씩"].tap()
        XCTAssertTrue(app.buttons["다시 녹음"].exists)
        app.buttons["dubbing-volume-open"].tap()
        XCTAssertEqual(app.staticTexts["dubbing-background-volume-value"].label, "0%")
        XCTAssertEqual(app.staticTexts["dubbing-preview-volume-value"].label, previewLevel)
        app.navigationBars["더빙 볼륨"].buttons["완료"].tap()
        app.buttons["전체 제출"].tap()
        XCTAssertTrue(app.alerts["모든 대사를 제출할까요?"].waitForExistence(timeout: 5))
        app.alerts.buttons["동의하고 제출"].tap()
        XCTAssertTrue(app.staticTexts["내 대사 3 / 3 · 제출 완료"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["전체 제출"].exists)
        capture(app, "native-dubbing-submitted")
        back(app)
        XCTAssertTrue(app.navigationBars["더빙 스튜디오"].waitForExistence(timeout: 8))
    }

    @MainActor func testNativeDubbingContinuousRecordingCompletesSeparateTakes() {
        let app = launch()
        app.buttons["main-tab-2"].tap(); app.buttons["더빙"].firstMatch.tap()
        XCTAssertTrue(app.buttons["dub-feature-fixture-project"].waitForExistence(timeout: 10)); app.buttons["dub-feature-fixture-project"].tap()
        let claim = app.buttons["claim-role-guide"]
        XCTAssertTrue(claim.waitForExistence(timeout: 8)); claim.tap()
        XCTAssertTrue(app.buttons["녹음하기"].waitForExistence(timeout: 8))
        app.buttons["이어서 녹음"].tap(); app.buttons["연속 녹음 시작"].tap()
        XCTAssertTrue(app.buttons["녹음 준비 취소"].waitForExistence(timeout: 8))
        capture(app, "native-dubbing-countdown")
        XCTAssertTrue(app.staticTexts["내 대사 3 / 3 · 대사를 선택해 녹음하세요"].waitForExistence(timeout: 35))
        XCTAssertTrue(app.buttons["전체 제출"].isEnabled)
        XCTAssertTrue(app.staticTexts["3 / 3"].exists)
        XCTAssertTrue(app.buttons["녹음 확인"].exists)
        capture(app, "native-dubbing-continuous-recorded")
        // Keep the test local; uploading and submitting use separate fixture scenarios.
        back(app)
        XCTAssertTrue(app.navigationBars["더빙 스튜디오"].waitForExistence(timeout: 8))
    }

    @MainActor func testNativeDubbingVolumeAndControlsOnNarrowLayout() {
        let app = launch(["-dubbing-recorder", "-streaming-large"])
        app.buttons["main-tab-2"].tap(); app.buttons["더빙"].firstMatch.tap()
        XCTAssertTrue(app.buttons["dub-feature-fixture-project"].waitForExistence(timeout: 10)); app.buttons["dub-feature-fixture-project"].tap()
        let claim = app.buttons["claim-role-guide"]
        reveal(claim, in: app.scrollViews["dubbing-project-scroll"], app: app, hasBottomBar: false); claim.tap()
        XCTAssertTrue(app.buttons["전체 제출"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["전체 제출"].isHittable)
        XCTAssertTrue(app.buttons["다시 녹음"].isHittable)
        XCTAssertGreaterThanOrEqual(app.buttons["다시 녹음"].frame.height, 44)
        XCTAssertTrue(app.buttons["dubbing-script-line-1"].isHittable)
        capture(app, "native-dubbing-narrow")
        app.buttons["dubbing-volume-open"].tap()
        XCTAssertTrue(app.sliders["dubbing-background-volume"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.sliders["dubbing-preview-volume"].isHittable)
        capture(app, "native-dubbing-volume-narrow")
    }

    @MainActor func testNativeDubbingManualScriptCreation() {
        let app = launch()
        app.buttons["main-tab-2"].tap()
        let dubbingTab = app.buttons["더빙"].firstMatch
        XCTAssertTrue(dubbingTab.waitForExistence(timeout: 10))
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: dubbingTab)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed)
        dubbingTab.tap()
        let create = app.buttons["dubbing-create"]
        XCTAssertTrue(create.waitForExistence(timeout: 15)); create.tap()
        XCTAssertTrue(app.buttons["직접 대본 작성"].waitForExistence(timeout: 8)); app.buttons["직접 대본 작성"].tap()
        let title = app.textFields["script-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5)); title.tap(); title.typeText("검증용 새 극본"); app.toolbars.buttons["완료"].tap()
        let lines = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "dubbing-line-text-"))
        for i in 0..<2 {
            let field = lines.element(boundBy: i)
            reveal(field, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); field.tap(); field.typeText(i == 0 ? "첫 대사" : "다음 대사"); app.toolbars.buttons["완료"].tap()
        }
        XCTAssertTrue(app.buttons["script-add-sfx"].isHittable)
        capture(app, "script-cards-direct")
        let save = app.buttons["대본 저장"]
        reveal(save, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); save.tap()
        XCTAssertTrue(app.navigationBars["더빙 스튜디오"].waitForExistence(timeout: 8))
        back(app); XCTAssertTrue(app.buttons["dubbing-create"].waitForExistence(timeout: 8))
    }
    @MainActor func testScriptPasteSceneControlsSoundAndRestore() {
        let app = launch(["-script-cards"])
        app.buttons["main-tab-2"].tap()
        let dubbingTab = app.buttons["더빙"].firstMatch
        XCTAssertTrue(dubbingTab.waitForExistence(timeout: 10))
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: dubbingTab)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed)
        dubbingTab.tap()
        let create = app.buttons["dubbing-create"]
        XCTAssertTrue(create.waitForExistence(timeout: 15)); create.tap()
        app.buttons["기존 대본 붙여넣기"].tap()
        let field = app.descendants(matching: .any).matching(identifier: "script-import-source").firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap()
        field.typeText("SCENE 01 - Cafe\nA: Hello.\nB: Welcome.\n[SFX: a car passing]\n[BGM: soft piano]\nunknown original text")
        app.toolbars.buttons["완료"].tap()
        app.buttons["분석 결과 미리보기"].tap()
        let apply = app.buttons["확인 후 편집기에 반영"]
        reveal(apply, in: app.scrollViews.firstMatch, app: app, hasBottomBar: false); capture(app, "script-paste-preview"); apply.tap()
        XCTAssertTrue(app.navigationBars["대본 편집"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["원문 확인 필요 · 1개"].exists)
        let acknowledged = app.buttons["편집기에 반영했어요"]
        reveal(acknowledged, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false)
        // Keep the original visibly retained; do not silently mark an unclassified line resolved.
        app.buttons["dubbing-scene-add"].tap()
        let menu = app.buttons["장면 2 메뉴"]
        XCTAssertTrue(menu.waitForExistence(timeout: 5)); menu.tap(); app.buttons["장면 위로"].tap()
        XCTAssertTrue(app.buttons["실행 취소"].exists)
        app.buttons["script-add-bgm"].tap()
        capture(app, "script-scene-sound")
        back(app); app.alerts.buttons["저장하고 나가기"].tap()
        app.buttons["dubbing-create"].tap()
        XCTAssertTrue(app.navigationBars["대본 편집"].waitForExistence(timeout: 5))
        let scene = app.buttons["장면 1 메뉴"]
        reveal(scene, in: app.scrollViews["native-dubbing-editor"], app: app, towardTop: true, hasBottomBar: false)
        XCTAssertTrue(scene.isHittable); capture(app, "script-restored-position")
    }
    @MainActor func testScriptAIComparisonPreservesOriginalUntilApplied() {
        let app = launch(["-script-cards"])
        app.buttons["main-tab-2"].tap()
        let dubbingTab = app.buttons["더빙"].firstMatch
        XCTAssertTrue(dubbingTab.waitForExistence(timeout: 10))
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: dubbingTab)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed)
        dubbingTab.tap()
        let create = app.buttons["dubbing-create"]
        XCTAssertTrue(create.waitForExistence(timeout: 15)); create.tap()
        app.buttons["기존 대본 붙여넣기"].tap()
        let field = app.descendants(matching: .any).matching(identifier: "script-import-source").firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap(); field.typeText("A: Hello.\nB: Welcome."); app.toolbars.buttons["완료"].tap()
        app.buttons["분석 결과 미리보기"].tap(); app.buttons["확인 후 편집기에 반영"].tap()
        let menu = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "script-line-menu-")).firstMatch
        reveal(menu, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); menu.tap(); app.buttons["AI · 자연스럽게"].tap()
        app.alerts.buttons["작성 1회 사용"].tap()
        XCTAssertTrue(app.navigationBars["AI 수정 비교"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Hello."].exists); XCTAssertTrue(app.staticTexts["Hello, it is good to see you."].exists)
        capture(app, "script-ai-compare"); app.buttons["확인하고 적용"].tap()
        XCTAssertTrue(app.navigationBars["대본 편집"].waitForExistence(timeout: 5))
        let updated = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND value == %@", "dubbing-line-text-", "Hello, it is good to see you.")).firstMatch
        XCTAssertTrue(updated.exists)
    }

    @MainActor func testAndroidStudioChoicesArtistAndMR() {
        let app = launch(["-studio-parity"])
        app.buttons["main-tab-4"].tap(); app.buttons["스튜디오 바로가기"].tap()
        let edit = app.buttons["studio-edit-fixture-original"]
        XCTAssertTrue(edit.waitForExistence(timeout: 10)); reveal(edit, in: app.scrollViews.firstMatch, app: app); edit.tap()
        XCTAssertTrue(app.textFields["studio-title"].waitForExistence(timeout: 10))
        capture(app, "parity-studio-editor-top")
        let genres = app.buttons["studio-choice-장르"]
        reveal(genres, in: app.scrollViews.firstMatch, app: app, hasBottomBar: false); genres.tap()
        app.buttons["K-POP"].tap(); app.buttons["Pop"].tap()
        XCTAssertFalse(app.buttons["Dark Pop"].isEnabled)
        app.buttons["적용"].tap()
        let moods = app.buttons["studio-choice-기분"]
        moods.tap(); app.buttons["위로가 필요할 때"].tap(); app.buttons["적용"].tap()
        capture(app, "parity-studio-genres-moods")
        let mr = app.buttons["MR 자동으로 다시 만들기"]
        reveal(mr, in: app.scrollViews.firstMatch, app: app, hasBottomBar: false); mr.tap(); app.buttons["다시 만들기"].tap()
        XCTAssertTrue(app.staticTexts["반주를 다시 만들고 있어요."].waitForExistence(timeout: 8))
        capture(app, "parity-studio-mr")
        app.buttons["studio-track-save"].tap()
        XCTAssertTrue(app.navigationBars["스튜디오"].waitForExistence(timeout: 8))
        let artist = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "검증 아티스트")).firstMatch
        reveal(artist, in: app.scrollViews["creator-studio"], app: app); artist.tap()
        let name = app.textFields["studio-artist-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 8)); name.tap(); name.typeText(" 수정")
        app.buttons["완료"].tap(); capture(app, "parity-studio-artist")
        let save = app.buttons["studio-artist-save"]
        reveal(save, in: app.scrollViews["studio-artist-scroll"], app: app, hasBottomBar: false); save.tap()
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "검증 아티스트 수정")).firstMatch.waitForExistence(timeout: 8))
    }
    @MainActor func testAndroidDubbingManagementAndChoices() {
        let app = launch(["-dubbing-management"])
        app.buttons["main-tab-2"].tap(); app.buttons["더빙"].firstMatch.tap()
        XCTAssertTrue(app.buttons["dub-feature-fixture-project"].waitForExistence(timeout: 10)); app.buttons["dub-feature-fixture-project"].tap()
        let roleMenu = app.buttons["dubbing-role-menu-guide"]
        XCTAssertTrue(roleMenu.waitForExistence(timeout: 10)); roleMenu.tap(); app.buttons["배역 취소"].tap()
        XCTAssertTrue(app.buttons["claim-role-guide"].waitForExistence(timeout: 8))
        roleMenu.tap(); app.buttons["이 배역으로 새 더빙 시작"].tap()
        XCTAssertTrue(app.staticTexts["새 공연 검증"].waitForExistence(timeout: 8)); back(app)
        app.buttons["더빙 메뉴"].tap(); app.buttons["대본 수정"].tap()
        XCTAssertTrue(app.navigationBars["대본 편집"].waitForExistence(timeout: 8))
        let advanced = app.switches["연기 지시 · 시간 조절"]
        reveal(advanced, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); advanced.tap()
        let add = app.buttons["dubbing-line-add-line-1"]
        reveal(add, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); add.tap()
        let remove = app.buttons["dubbing-line-delete-line-1"]
        remove.tap()
        XCTAssertFalse(app.textFields["dubbing-line-text-line-1"].exists)
        capture(app, "parity-dubbing-line-editor")
        back(app)
        XCTAssertTrue(app.buttons["저장하고 나가기"].waitForExistence(timeout: 5))
        capture(app, "parity-dubbing-save-leave")
        app.buttons["계속 작업하기"].tap()
        XCTAssertTrue(app.navigationBars["대본 편집"].exists)
        back(app); app.buttons["저장 안 함"].tap(); back(app)
        app.buttons["더빙 만들기"].tap()
        let genre = app.buttons["dubbing-choice-genres"]
        XCTAssertTrue(genre.waitForExistence(timeout: 8)); genre.tap()
        app.buttons["SF"].tap(); app.buttons["완료"].tap()
        XCTAssertTrue(genre.label.contains("SF"))
        app.buttons["dubbing-choice-minutes"].tap()
        let duration = app.buttons["5:00"]
        reveal(duration, in: app.scrollViews.firstMatch, app: app, hasBottomBar: false); duration.tap()
        XCTAssertTrue(app.buttons["dubbing-choice-minutes"].label.contains("5:00"))
        capture(app, "parity-dubbing-create-options")
        back(app); app.buttons["저장하고 나가기"].tap()
        app.buttons["더빙 만들기"].tap()
        XCTAssertTrue(app.buttons["dubbing-choice-minutes"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["dubbing-choice-minutes"].label.contains("5:00"))
        XCTAssertTrue(app.buttons["dubbing-choice-genres"].label.contains("SF"))
    }

    @MainActor func testAndroidChatStickersSearchAndInboxManagement() {
        let app = launch()
        app.buttons["main-tab-3"].tap()
        app.buttons["inbox-dm-fixture-peer"].tap()
        let input = app.textViews["chat-input"]
        XCTAssertTrue(input.waitForExistence(timeout: 8))
        input.tap(); input.typeText("Hello ")
        app.buttons["chat-sticker-toggle"].tap(); app.buttons["웃음"].tap()
        capture(app, "parity-chat-sticker-input")
        input.typeText(XCUIKeyboardKey.delete.rawValue)
        XCTAssertEqual(input.value as? String, "Hello ")
        app.buttons["chat-sticker-toggle"].tap(); app.buttons["웃음"].tap()
        app.buttons["chat-send"].tap()
        XCTAssertTrue(app.staticTexts["Hello [웃음]"].waitForExistence(timeout: 8))
        capture(app, "parity-chat-sticker-message")
        back(app)
        app.buttons["inbox-read-all"].tap()
        XCTAssertTrue(app.buttons["inbox-dm-fixture-peer"].exists)
        XCTAssertTrue(app.buttons["inbox-crew"].exists)
        app.buttons["새 대화"].tap()
        let search = app.textFields["new-conversation-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 8)); search.tap(); search.typeText("friend")
        let friend = app.buttons["new-conversation-fixture-peer"]
        XCTAssertTrue(friend.waitForExistence(timeout: 8)); capture(app, "parity-new-conversation"); friend.tap()
        XCTAssertTrue(input.waitForExistence(timeout: 8)); back(app); back(app)
        app.buttons["inbox-dm-fixture-peer"].press(forDuration: 0.8); app.buttons["삭제"].tap()
        XCTAssertTrue(app.buttons["inbox-crew"].waitForExistence(timeout: 8))
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["inbox-dm-fixture-peer"])
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 8), .completed)
    }
    @MainActor func testAndroidHomeShelvesAndArtistFollow() {
        let app = launch()
        let home = app.scrollViews["listen-scroll"]
        let genre = app.buttons["home-discover-genre"]
        reveal(genre, in: home, app: app)
        capture(app, "parity-home-latest-discovery")
        genre.tap()
        XCTAssertTrue(app.buttons["discover-genre-K-POP"].waitForExistence(timeout: 8))
        capture(app, "parity-home-genres"); back(app)
        let artist = app.buttons["home-artist-fixture-artist"]
        reveal(artist, in: home, app: app)
        capture(app, "parity-home-community-shelves")
        let more = app.buttons["section-more-지금 뜨는 AI 아티스트"]
        reveal(more, in: home, app: app); more.tap()
        let follow = app.buttons["artist-follow-fixture-artist"]
        XCTAssertTrue(follow.waitForExistence(timeout: 8)); follow.tap()
        XCTAssertEqual(app.staticTexts["artist-followers-fixture-artist"].label, "4")
        XCTAssertEqual(follow.value as? String, "팔로우 중")
        capture(app, "parity-artist-follow")
        follow.tap(); XCTAssertEqual(app.staticTexts["artist-followers-fixture-artist"].label, "3")
    }

    @MainActor func testAndroidCrewDirectoryLayoutsAndFilters() {
        let app = launch(["-crew-parity", "-crew-nonmember"])
        app.buttons["main-tab-1"].tap(); app.buttons["크루"].tap()
        let search = app.textFields["crew-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 8)); capture(app, "parity-crew-featured")
        let filters = app.buttons["crew-filters"]
        reveal(filters, in: app.scrollViews.firstMatch, app: app); filters.tap()
        XCTAssertTrue(app.navigationBars["크루 필터"].waitForExistence(timeout: 8))
        capture(app, "parity-crew-filters")
        app.buttons["crew-filter-apply"].tap()
        let crew = app.buttons["crew-card-fixture-crew"]
        XCTAssertTrue(crew.exists)
        capture(app, "parity-crew-compact-list")
        let ranking = app.buttons["crew-directory-ranking"]
        reveal(ranking, in: app.scrollViews.firstMatch, app: app); ranking.tap()
        XCTAssertTrue(app.buttons["ranking-category-크루"].waitForExistence(timeout: 8))
        capture(app, "parity-crew-ranking-destination")
    }

}
