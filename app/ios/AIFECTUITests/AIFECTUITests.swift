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
        XCTAssertTrue(app.buttons["start-recording"].waitForExistence(timeout: 5))
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
        app.buttons["main-tab-4"].tap()
        let balance = app.staticTexts["my-star-balance"]
        XCTAssertTrue(balance.waitForExistence(timeout: 5))
        let depleted = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "0개"), object: balance)
        XCTAssertEqual(XCTWaiter.wait(for: [depleted], timeout: 5), .completed)
        app.buttons["feedback-menu"].tap(); app.buttons["녹음 편집 검증"].tap()
        let description = app.textFields["이 녹음에 대한 소개"]
        for _ in 0..<10 { if description.exists && description.isHittable { break }; app.scrollViews["studio-content"].swipeUp() }
        XCTAssertTrue(description.exists); description.tap(); description.typeText("Keyboard check")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        app.staticTexts["내 커버곡 게시"].tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 3), .completed)
    }

    @MainActor func testCreatorProfileFromTrackDetailStaysOpenAndReturnsToTrack() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["feedback-menu"].waitForExistence(timeout: 15))
        app.buttons["feedback-menu"].tap(); app.buttons["음원 상세 검증"].tap()
        XCTAssertTrue(app.buttons["창작자 프로필"].waitForExistence(timeout: 5))
        app.buttons["창작자 프로필"].tap()
        XCTAssertTrue(app.staticTexts["프로필 검증 창작자"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertTrue(app.navigationBars["음악 프로필"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Creator profile from track detail"; shot.lifetime = .keepAlways; add(shot)
        app.navigationBars["음악 프로필"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["창작자 프로필"].waitForExistence(timeout: 5))
        app.buttons["창작자 프로필"].tap()
        XCTAssertTrue(app.staticTexts["프로필 검증 창작자"].firstMatch.waitForExistence(timeout: 5))
    }

    @MainActor func testChartSectionsKeepIndependentOrder() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["차트"].waitForExistence(timeout: 15)); app.buttons["차트"].tap()
        XCTAssertTrue(app.staticTexts["노래방에서 만나는 인기곡"].waitForExistence(timeout: 10))
        app.scrollViews.firstMatch.swipeUp()
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Overlapping chart songs after scroll"; shot.lifetime = .keepAlways; add(shot)
        // The karaoke endpoint returns the same IDs in the reverse ranking order.
        let heading = app.staticTexts["노래방에서 만나는 인기곡"]
        let buttons = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label ENDSWITH %@", "차트곡 ", " 상세")).allElementsBoundByIndex.filter { $0.frame.minY > heading.frame.maxY }.sorted { $0.frame.minY < $1.frame.minY }
        XCTAssertEqual(buttons.map(\.label), [5, 4, 3, 2, 1].map { "차트곡 \($0) 상세" })
        for index in 1..<buttons.count {
            let gap = buttons[index].frame.minY - buttons[index - 1].frame.maxY
            XCTAssertGreaterThanOrEqual(gap, 0)
            XCTAssertLessThan(gap, 35, "Ranked songs must not leave an empty row")
        }
    }

    @MainActor func testCreatorProfileFromChartRow() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-profile-refresh-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["차트"].waitForExistence(timeout: 15)); app.buttons["차트"].tap()
        XCTAssertTrue(app.buttons["차트곡 4 상세"].firstMatch.waitForExistence(timeout: 10)); app.buttons["차트곡 4 상세"].firstMatch.tap()
        XCTAssertTrue(app.buttons["창작자 프로필"].waitForExistence(timeout: 5)); app.buttons["창작자 프로필"].tap()
        XCTAssertTrue(app.navigationBars["음악 프로필"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["프로필 검증 창작자"].firstMatch.waitForExistence(timeout: 10))
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Creator profile survives chart refresh"; shot.lifetime = .keepAlways; add(shot)
        app.navigationBars["음악 프로필"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["차트곡 4"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["창작자 프로필"].exists)
        app.buttons["완료"].tap()
        XCTAssertFalse(app.buttons["차트곡 4 상세"].exists)
    }

    @MainActor func testCreatorProfileFromPlayerDetail() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["feedback-menu"].waitForExistence(timeout: 15))
        app.buttons["feedback-menu"].tap(); app.buttons["재생창 프로필 검증"].tap()
        app.buttons["재생 화면 열기"].tap()
        let comments = app.buttons["댓글"]
        for _ in 0..<3 { if comments.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(comments.isHittable); comments.tap()
        XCTAssertTrue(app.buttons["창작자 프로필"].waitForExistence(timeout: 5)); app.buttons["창작자 프로필"].tap()
        XCTAssertTrue(app.navigationBars["음악 프로필"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["프로필 검증 창작자"].firstMatch.waitForExistence(timeout: 10))
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Creator profile from player"; shot.lifetime = .keepAlways; add(shot)
    }

    @MainActor func testMyProfileShortcutWalletAndCrewGrowth() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["main-tab-4"].waitForExistence(timeout: 15)); app.buttons["main-tab-4"].tap()
        let edit = app.buttons["edit-my-profile"]
        XCTAssertTrue(edit.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["my-gold-balance"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["my-gold-balance"].label, "1,250개")
        XCTAssertEqual(app.staticTexts["my-star-balance"].label, "3개")
        XCTAssertLessThan(abs(edit.frame.midY - app.staticTexts["my-profile-name"].frame.midY), 24)
        edit.tap()
        let name = app.textFields["profile-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap()
        name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: name.value as? String == "검증 계정" ? 5 : 20) + "새 활동명")
        app.buttons["프로필 저장"].tap()
        XCTAssertTrue(app.alerts["AIFECT"].waitForExistence(timeout: 8)); app.alerts["AIFECT"].buttons["확인"].tap()
        app.navigationBars["내 프로필"].buttons.element(boundBy: 0).tap()
        let updated = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "새 활동명"), object: app.staticTexts["my-profile-name"])
        XCTAssertEqual(XCTWaiter.wait(for: [updated], timeout: 8), .completed)
        let myShot = XCTAttachment(screenshot: app.screenshot()); myShot.name = "My profile settings and balances"; myShot.lifetime = .keepAlways; add(myShot)
        app.buttons["main-tab-1"].tap(); app.buttons["크루"].tap()
        XCTAssertTrue(app.buttons["crew-card-fixture-crew"].waitForExistence(timeout: 10)); app.buttons["crew-card-fixture-crew"].tap()
        XCTAssertTrue(app.staticTexts["crew-detail-name"].waitForExistence(timeout: 10))
        let crewShot = XCTAttachment(screenshot: app.screenshot()); crewShot.name = "Crew hero and experience"; crewShot.lifetime = .keepAlways; add(crewShot)
        let about = app.buttons["소개"]
        for _ in 0..<4 { if about.isHittable { break }; app.scrollViews["crew-content"].swipeUp() }
        XCTAssertTrue(about.isHittable); about.tap()
        for _ in 0..<4 { if app.staticTexts["함께 성장하는 방법"].isHittable { break }; app.scrollViews["crew-content"].swipeUp() }
        XCTAssertTrue(app.staticTexts["함께 성장하는 방법"].exists)
        XCTAssertTrue(app.staticTexts["+10 XP"].exists)
        let aboutShot = XCTAttachment(screenshot: app.screenshot()); aboutShot.name = "Crew illustrated experience guide"; aboutShot.lifetime = .keepAlways; add(aboutShot)
    }

    @MainActor func testSongSingingEntryPreflightEffectsLyricScrollAndStoppedControls() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-feedback-ui-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["feedback-menu"].waitForExistence(timeout: 15))
        app.buttons["feedback-menu"].tap(); app.buttons["음원 상세 검증"].tap()
        XCTAssertTrue(app.buttons["이 노래 부르기"].waitForExistence(timeout: 5))
        app.buttons["이 노래 부르기"].tap()
        XCTAssertTrue(app.staticTexts["부르기 검증 원곡"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["start-recording"].isHittable)
        app.buttons["에코 · 잡음 제거 설정"].tap()
        let custom = app.buttons["vocal-preset-custom"]
        for _ in 0..<5 { if custom.isHittable { break }; app.scrollViews["studio-content"].swipeUp() }
        custom.tap()
        let echo = app.sliders["에코 미세 조절"]
        for _ in 0..<5 { if echo.isHittable { break }; app.scrollViews["studio-content"].swipeUp() }
        XCTAssertTrue(echo.waitForExistence(timeout: 5)); XCTAssertTrue(echo.isHittable)
        echo.adjust(toNormalizedSliderPosition: 0.1)
        if !app.buttons["4단계"].isHittable { app.scrollViews["studio-content"].swipeDown() }
        app.buttons["4단계"].tap()
        XCTAssertTrue(app.staticTexts["잡음 제거 · 4단계"].exists)
        XCTAssertTrue(app.buttons["start-recording"].isHittable)
        let wheel = app.scrollViews["studio-lyric-wheel"]
        for _ in 0..<10 { if wheel.isHittable { break }; app.scrollViews["studio-content"].swipeDown() }
        XCTAssertTrue(wheel.isHittable)
        wheel.swipeUp()
        let moved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", "선택한 가사 · 0:00"), object: app.staticTexts["selected-lyric-time"])
        XCTAssertEqual(XCTWaiter.wait(for: [moved], timeout: 5), .completed)
        XCTAssertTrue(app.buttons["선택한 위치부터 녹음"].waitForExistence(timeout: 5))
        let lyricShot = XCTAttachment(screenshot: app.screenshot()); lyricShot.name = "Scrollable lyrics and pinned recording controls"; lyricShot.lifetime = .keepAlways; add(lyricShot)
        app.buttons["닫기"].tap(); app.buttons["완료"].tap()
        app.buttons["feedback-menu"].tap(); app.buttons["녹음 멈춤 검증"].tap()
        XCTAssertTrue(app.buttons["restart-recording"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["restart-recording"].isHittable)
        XCTAssertTrue(app.buttons["review-recording"].isHittable)
        XCTAssertFalse(app.buttons["recording-preview"].exists)
        app.buttons["review-recording"].tap()
        XCTAssertTrue(app.buttons["recording-preview"].waitForExistence(timeout: 5))
        let overview = XCTAttachment(screenshot: app.screenshot()); overview.name = "Android reference recording editor overview"; overview.lifetime = .keepAlways; add(overview)
        let studioPreset = app.buttons["vocal-preset-studio"]
        for _ in 0..<5 { if studioPreset.isHittable { break }; app.scrollViews["studio-content"].swipeUp() }
        studioPreset.tap()
        let strength = app.sliders["효과 강도"]
        for _ in 0..<5 { if strength.isHittable { break }; app.scrollViews["studio-content"].swipeUp() }
        strength.adjust(toNormalizedSliderPosition: 0.25)
        XCTAssertTrue(studioPreset.isSelected)
        let effects = XCTAttachment(screenshot: app.screenshot()); effects.name = "Android reference effect cards"; effects.lifetime = .keepAlways; add(effects)
        app.buttons["녹음 화면"].tap()
        XCTAssertTrue(app.buttons["restart-recording"].isHittable)
    }

}
