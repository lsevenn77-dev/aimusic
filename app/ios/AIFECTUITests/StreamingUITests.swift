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
    @MainActor private func reveal(_ element: XCUIElement, in scroll: XCUIElement, app: XCUIApplication, towardTop: Bool = false, hasBottomBar: Bool = true) {
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
        app.buttons["공지 · 채팅 · 크루 관리"].tap()
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
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "극본 보기")).firstMatch.tap()
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
        let edit = app.buttons["프로필 수정"]
        let studio = app.buttons["스튜디오 바로가기"]
        XCTAssertGreaterThan(studio.frame.width, edit.frame.width)
        XCTAssertEqual(studio.frame.midY, edit.frame.midY, accuracy: 2)
        capture(app, "my-profile-actions")
        gifts.tap()
        XCTAssertTrue(app.navigationBars["선물 랭킹 TOP 50"].waitForExistence(timeout: 8))
        back(app)
        app.buttons["계정 관리"].tap()
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
        app.buttons["듀엣참여"].tap()
        XCTAssertTrue(app.buttons["다시 시도"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["듀엣 참여"].exists); capture(app, "14-duet-error")
    }
    @MainActor func testNativeDubbingModesScriptNavigationAndSubmission() {
        let app = launch(["-dubbing-recorder"])
        app.buttons["main-tab-2"].tap(); app.buttons["더빙"].firstMatch.tap()
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "극본 보기")).firstMatch.tap()
        let claim = app.buttons["claim-role-guide"]
        XCTAssertTrue(claim.waitForExistence(timeout: 8)); claim.tap()
        XCTAssertTrue(app.navigationBars["안내자 · 녹음"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["파트별 녹음"].waitForExistence(timeout: 8))
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
        app.buttons["연속 녹음"].tap()
        XCTAssertTrue(app.buttons["연속 녹음 시작"].exists)
        app.buttons["다음"].tap()
        XCTAssertTrue(app.staticTexts["2 / 3"].exists)
        capture(app, "native-dubbing-continuous")
        app.buttons["파트별 녹음"].tap()
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
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "극본 보기")).firstMatch.tap()
        let claim = app.buttons["claim-role-guide"]
        XCTAssertTrue(claim.waitForExistence(timeout: 8)); claim.tap()
        XCTAssertTrue(app.buttons["녹음하기"].waitForExistence(timeout: 8))
        app.buttons["연속 녹음"].tap(); app.buttons["연속 녹음 시작"].tap()
        XCTAssertTrue(app.buttons["녹음 준비 취소"].waitForExistence(timeout: 8))
        capture(app, "native-dubbing-countdown")
        XCTAssertTrue(app.staticTexts["내 대사 3 / 3 · 대사를 선택해 녹음하세요"].waitForExistence(timeout: 35))
        XCTAssertTrue(app.buttons["전체 제출"].isEnabled)
        XCTAssertTrue(app.staticTexts["3 / 3"].exists)
        XCTAssertTrue(app.buttons["녹음 확인"].exists)
        capture(app, "native-dubbing-continuous-recorded")
        // Keep the test local; uploading and submitting use separate fixture scenarios.
        back(app)
        XCTAssertTrue(app.buttons["저장 안 함"].waitForExistence(timeout: 8)); app.buttons["저장 안 함"].tap()
    }

    @MainActor func testNativeDubbingVolumeAndControlsOnNarrowLayout() {
        let app = launch(["-dubbing-recorder", "-streaming-large"])
        app.buttons["main-tab-2"].tap(); app.buttons["더빙"].firstMatch.tap()
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "극본 보기")).firstMatch.tap()
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
        app.buttons["main-tab-2"].tap(); app.buttons["더빙"].firstMatch.tap()
        app.buttons["더빙 만들기"].tap()
        XCTAssertTrue(app.navigationBars["더빙 만들기"].waitForExistence(timeout: 8))
        let manual = app.buttons["직접 대사 쓰기"]
        reveal(manual, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); manual.tap()
        let title = app.textFields["dubbing-manual-title"]
        reveal(title, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); title.tap(); if let value = title.value as? String, value != "작품 제목" { title.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count)) }; title.typeText("검증용 새 극본"); app.toolbars.buttons["완료"].tap()
        let lines = app.descendants(matching: .any).matching(identifier: "dubbing-manual-lines").firstMatch
        reveal(lines, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); lines.tap(); lines.typeText("A: 첫 대사\nB: 다음 대사")
        app.toolbars.buttons["완료"].tap()
        let arrange = app.buttons["대본으로 정리하기"]
        reveal(arrange, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); arrange.tap()
        XCTAssertTrue(app.navigationBars["대본 편집"].waitForExistence(timeout: 8))
        capture(app, "native-dubbing-editor")
        let save = app.buttons["대본 저장"]
        reveal(save, in: app.scrollViews["native-dubbing-editor"], app: app, hasBottomBar: false); save.tap()
        XCTAssertTrue(app.navigationBars["더빙 스튜디오"].waitForExistence(timeout: 8))
    }

}
