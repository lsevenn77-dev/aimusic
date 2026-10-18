import XCTest
import SwiftUI
@testable import AIFECT

final class StreamingUXTests: XCTestCase {
    func testArtworkUsesCoverUploaderAndPreservesOriginalColorsSource() {
        let cover = Song(["id": "cover", "kind": "cover", "producer_id": "singer", "producer_image_version": "v2", "has_cover": 1, "original_id": "original", "original_has_cover": 1])
        XCTAssertEqual(cover.artURL?.path, "/media/producer/singer")
        let original = Song(["id": "original", "kind": "original", "has_cover": 1, "cover_version": "v3", "producer_id": "singer", "producer_image_version": "v2"])
        XCTAssertEqual(original.artURL?.path, "/media/original/cover")
        XCTAssertNil(Song(["id": "cover", "kind": "cover", "original_id": "original", "original_has_cover": 1]).artURL)
    }
    func testChartMovementUsesServerSnapshotAndDoesNotInventMissingHistory() {
        XCTAssertEqual(Song(["id": "a", "chart_movement": "up", "rank_change": 3]).rankMovementLabel, "↑3")
        XCTAssertEqual(Song(["id": "a", "chart_movement": "down", "rank_change": -2]).rankMovementLabel, "↓2")
        XCTAssertEqual(Song(["id": "a", "chart_movement": "new"]).rankMovementLabel, "NEW")
        XCTAssertEqual(Song(["id": "a"]).rankMovementLabel, "—")
    }
    func testChartPeriodsPreserveServerAggregationContract() {
        XCTAssertEqual(PopularChartView.path(category: "인기 차트", period: "오늘"), "/api/catalog?section=tracks&chart=top&period=today")
        XCTAssertEqual(PopularChartView.path(category: "인기 차트", period: "명예의 전당"), "/api/catalog?section=tracks&chart=top&period=all")
        XCTAssertEqual(PopularChartView.path(category: "최신 음악", period: "이달"), "/api/catalog?section=tracks")
    }
    @MainActor func testTabNavigationKeepsAudioAndPrivateLibraryState() {
        let model = AppModel()
        let song = Song(["id": "queue", "title": "보존할 음악"])
        model.player.current = song; model.likes = [song]; model.history = [song]
        model.navigationPath.append(song)
        model.selectTab(4)
        XCTAssertTrue(model.navigationPath.isEmpty)
        XCTAssertEqual(model.selectedTab, 4)
        XCTAssertEqual(model.player.current, song)
        XCTAssertEqual(model.likes, [song]); XCTAssertEqual(model.history, [song])
    }
    func testDuetRoleIdentitySurvivesCodableDraftRoundTrip() throws {
        let song = Song(["id": "invitation", "kind": "cover", "cover_mode": "duet", "duet_open": 1, "original_id": "original", "user_id": "other"])
        let copy = try JSONDecoder().decode(Song.self, from: JSONEncoder().encode(song))
        XCTAssertEqual(copy.originalID, "original"); XCTAssertEqual(copy.id, "invitation")
        XCTAssertEqual(copy.duetOpen, true); XCTAssertEqual(copy.ownerID, "other")
    }
}
