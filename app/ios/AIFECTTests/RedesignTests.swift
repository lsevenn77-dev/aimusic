import XCTest
import CoreGraphics
@testable import AIFECT

final class RedesignTests: XCTestCase {
    @MainActor func testCrewChatRoutesToMessagesAndReplacesOldConversation() {
        let model = AppModel()
        model.user = ["id": "route-test-user"]
        model.selectedTab = 1
        model.messagePath = [MessageRoute(id: "old-peer", title: "이전 대화", crew: false)]
        model.openCrewMessages(id: "my-crew", title: "우리 크루")
        XCTAssertEqual(model.selectedTab, 3)
        XCTAssertEqual(model.messagePath, [MessageRoute(id: "my-crew", title: "우리 크루", crew: true)])
        XCTAssertFalse(model.showLogin)
    }
    @MainActor func testCrewChatRequiresLoginBeforeNavigation() {
        let model = AppModel()
        model.selectedTab = 1
        model.openCrewMessages(id: "my-crew", title: "우리 크루")
        XCTAssertTrue(model.showLogin)
        XCTAssertEqual(model.selectedTab, 1)
        XCTAssertTrue(model.messagePath.isEmpty)
    }
    func testCrewGraphUsesRealTotalsAndClampsInvalidCounts() {
        XCTAssertEqual(NativeRedesignLayout.crewFraction(12, target: 50), 0.24, accuracy: 0.001)
        XCTAssertEqual(NativeRedesignLayout.crewFraction(1280, target: 2000, start: 1000), 0.28, accuracy: 0.001)
        XCTAssertEqual(NativeRedesignLayout.crewFraction(12, target: 0), 0)
        XCTAssertEqual(NativeRedesignLayout.crewFraction(-1, target: 50), 0)
        XCTAssertEqual(NativeRedesignLayout.crewFraction(60, target: 50), 1)
    }
    func testSingingCardsAdaptToWidthAndAccessibilityText() {
        for width in [CGFloat(320), 360, 390, 430, 599] { XCTAssertEqual(NativeRedesignLayout.singingColumns(width: width, accessibilityText: false), 1) }
        XCTAssertEqual(NativeRedesignLayout.singingColumns(width: 600, accessibilityText: false), 2)
        XCTAssertEqual(NativeRedesignLayout.singingColumns(width: 800, accessibilityText: true), 1)
    }
    func testCrewRankUsesLevelThenExperienceWithStableTies() {
        let crews: [[String: Any]] = [["id": "c", "level": 2, "xp": 50], ["id": "a", "level": 1, "xp": 500], ["id": "b", "level": 2, "xp": 100]]
        XCTAssertEqual(NativeRedesignLayout.rankedCrews(crews).map { $0.string("id") }, ["b", "c", "a"])
    }
    func testDraftRejectsForeignOwnerAndPathTraversal() {
        let song = Song(["id": "fixture", "title": "테스트"])
        let invalid = RecordingDraft(id: "../unsafe", owner: "owner", song: song, date: Date(), length: 1)
        XCTAssertThrowsError(try invalid.delete(currentOwner: "owner"))
        let foreign = RecordingDraft(id: UUID().uuidString, owner: "other", song: song, date: Date(), length: 1)
        XCTAssertThrowsError(try foreign.delete(currentOwner: "owner"))
    }
    func testDeletingOwnedDraftLeavesAnotherDraftUntouched() throws {
        let owner = "redesign-test-\(UUID().uuidString)"
        let song = Song(["id": "fixture", "title": "테스트"])
        let draft = RecordingDraft(id: UUID().uuidString, owner: owner, song: song, date: Date(), length: 1)
        let neighbor = RecordingDraft(id: UUID().uuidString, owner: owner, song: song, date: Date(), length: 1)
        defer {
            try? FileManager.default.removeItem(at: draft.directory)
            try? FileManager.default.removeItem(at: neighbor.directory)
        }
        for item in [draft, neighbor] {
            try FileManager.default.createDirectory(at: item.directory, withIntermediateDirectories: true)
            try JSONEncoder().encode(item).write(to: item.directory.appendingPathComponent("draft.json"))
            try Data([1, 2, 3]).write(to: item.directory.appendingPathComponent("voice.wav"))
        }
        try draft.delete(currentOwner: owner)
        XCTAssertFalse(FileManager.default.fileExists(atPath: draft.directory.path))
        XCTAssertEqual(try Data(contentsOf: neighbor.directory.appendingPathComponent("voice.wav")), Data([1, 2, 3]))
    }
}
