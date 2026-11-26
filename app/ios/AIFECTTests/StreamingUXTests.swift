import XCTest
import SwiftUI
import AVFoundation
@testable import AIFECT

final class StreamingUXTests: XCTestCase {
    func testOfficialNoticeRoutingAndChannelIdentity() throws {
        let channel: [String: Any] = ["id": OfficialNotice.channelID, "name": "아이팩트 안내",
                                      "is_notice": true, "read_only": true, "notice_type": "official"]
        let adoptedName: [String: Any] = ["id": "another-profile", "name": "아이팩트 안내"]
        let legacy: [String: Any] = ["id": "aifect-guide", "is_notice": true, "notice_type": "welcome"]
        XCTAssertEqual(OfficialNotice.inboxRows([channel, adoptedName, legacy]).map(\.selfID),
                       [OfficialNotice.channelID, "another-profile"])
        XCTAssertEqual(OfficialNoticeRoute(target: "notice"), OfficialNoticeRoute())
        XCTAssertEqual(OfficialNoticeRoute(target: OfficialNotice.channelID), OfficialNoticeRoute())
        XCTAssertEqual(OfficialNoticeRoute(target: "aifect-guide")?.anchor, "aifect-guide")
        XCTAssertEqual(OfficialNoticeRoute(target: "premium-open-event-20261231-v1")?.anchor, "premium-open-event-20261231-v1")
        let url = try XCTUnwrap(URL(string: "https://aifect.co.kr/#dm/notice?entry=campaign%3Awelcome"))
        XCTAssertEqual(OfficialNoticeRoute(url: url)?.anchor, "campaign:welcome")
        XCTAssertNil(OfficialNoticeRoute(fragment: "dm/another-profile?entry=campaign%3Awelcome"))
        XCTAssertFalse(ReadPolicy.invalidates(OfficialNotice.path, method: "PATCH"))
    }

    func testOfficialFeedPreservesDistinctBodiesAndReadStateAcrossPages() throws {
        let channel: [String: Any] = ["id": OfficialNotice.channelID, "is_notice": 1,
                                      "read_only": 1, "notice_type": "official"]
        let guide: [String: Any] = ["id": "campaign:welcome", "legacy_id": "aifect-guide", "created": 10,
                                    "guide": ["greeting": "검증 닉네임님, 환영합니다."]]
        let gift: [String: Any] = ["id": "campaign:gift", "created": 20,
                                   "notice": ["title": "오픈 선물", "body": "별도의 공지 본문"]]
        let dm: [String: Any] = ["id": "dm:sent", "kind": "dm", "mine": true, "created": 30, "body": "문의"]
        let head = try OfficialNoticeFeed(response: ["channel": channel, "items": [gift, dm], "before": "20|campaign:gift"])
        let tail = try OfficialNoticeFeed(response: ["channel": channel, "items": [guide, gift], "before": NSNull()])
        var feed = head
        feed.acknowledge(["campaign:gift"], at: 40)
        feed.prepend(tail)
        feed.refresh(head)
        XCTAssertEqual(feed.items.map(\.id), ["campaign:welcome", "campaign:gift", "dm:sent"])
        XCTAssertEqual(feed.items.filter(\.unread).map(\.id), ["campaign:welcome"])
        XCTAssertEqual(feed.items[1].payload.object("notice").string("body"), "별도의 공지 본문")
        XCTAssertTrue(feed.items[0].matches("aifect-guide"))
        XCTAssertNil(feed.before)
        let receipt = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-11-24T15:10:00Z"))
        XCTAssertEqual(OfficialNotice.date(receipt.timeIntervalSince1970), "2026.11.25 00:10")
    }

    func testActivityNotificationsDoNotMislabelCommentsOrUnknownKindsAsCovers() {
        let messages = [
            "comment": "내 음악에 댓글을 남겼어요.",
            "reply": "내 댓글에 답글을 남겼어요.",
            "comment_reply": "내 댓글에 답글을 남겼어요.",
            "like": "내 음악을 좋아해요.",
            "cover": "내 곡으로 커버를 공개했어요.",
            "duet": "내 듀엣에 참여했어요.",
            "future-event": "새로운 활동 알림이 도착했어요.",
            "": "새로운 활동 알림이 도착했어요."
        ]
        for (kind, expected) in messages {
            let item: [String: Any] = ["kind": kind, "target": "track"]
            XCTAssertEqual(ActivityNotificationText.message(item), expected, kind)
        }
        XCTAssertFalse(ActivityNotificationText.canOpen(["kind": "future-event", "target": "track"]))
        XCTAssertFalse(ActivityNotificationText.canOpen(["kind": "comment"]))
        XCTAssertTrue(ActivityNotificationText.canOpen(["kind": "comment", "target": "original-song"]))
        XCTAssertTrue(ActivityNotificationText.canOpen(["kind": "person_gift", "target": "profile"]))
        XCTAssertEqual(ActivityNotificationText.subject(["kind": "comment", "source_title": "노래 제목"]), "노래 제목")
        XCTAssertEqual(ActivityNotificationText.subject(["kind": "comment", "source_title": "  "]), "내 음악의 새 소식")
        XCTAssertEqual(ActivityNotificationText.subject(["kind": "future-event"]), "내 활동 알림")
        XCTAssertEqual(ActivityNotificationText.message(["kind": "gift", "gift_name": "장미", "quantity": 3, "amount": 60, "currency": "gold"]), "장미 3개 · 60 G")
        XCTAssertEqual(ActivityNotificationText.message(["kind": "person_gift", "gift_name": "응원별", "quantity": 2, "amount": 2, "currency": "silver"]), "응원별 2개 · 2 S")
    }

    func testCrewFiltersCombineCapacityInterestsAndStableRanking() {
        let rows: [[String: Any]] = [
            ["id": "full", "name": "보컬", "interests": "발라드, 듀엣", "recruiting": true, "members": 10, "capacity": 10, "level": 3, "xp": 900],
            ["id": "open", "name": "별빛", "description": "보컬 모임", "interests": "발라드 · 커버", "recruiting": true, "members": 5, "capacity": 10, "level": 3, "xp": 700],
            ["id": "closed", "name": "재즈", "recruiting": false, "members": 1, "capacity": 10, "level": 4, "xp": 1000]
        ]
        XCTAssertFalse(CrewDirectoryFilter.isOpen(rows[0]))
        XCTAssertEqual(CrewDirectoryFilter.rows(rows, query: "보컬", interest: "발라드", recruitment: "open", level: "3", onlyMine: false, mine: nil, sort: "level").map(\.selfID), ["open"])
        XCTAssertEqual(CrewDirectoryFilter.rows(rows, query: "", interest: "", recruitment: "", level: "", onlyMine: true, mine: "full", sort: "members").map(\.selfID), ["full"])
        XCTAssertEqual(CrewDirectoryFilter.rows(rows, query: "", interest: "", recruitment: "", level: "", onlyMine: false, mine: nil, sort: "level").map(\.selfID), ["closed", "full", "open"])
    }
    func testChatStickerTokensPreserveUnicodeAndUnknownTags() throws {
        let laugh = try XCTUnwrap(ChatSticker.all.first { $0.key == "cat_basic_laugh" })
        let text = "안녕 👨‍👩‍👧‍👦 " + laugh.token + " 끝 [aifect:unknown]"
        XCTAssertEqual(ChatSticker.parts(text).map(\.0).joined(), text)
        XCTAssertEqual(ChatSticker.preview(text), "안녕 👨‍👩‍👧‍👦 [웃음] 끝 [aifect:unknown]")
        XCTAssertEqual(ChatSticker.parts(text).compactMap(\.1).count, 1)
        XCTAssertEqual(Set(ChatSticker.all.map(\.key)).count, ChatSticker.all.count)
        XCTAssertEqual(laugh.path, "/assets/chat-stickers/v1/basic/cat_basic_laugh.webp")
    }
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

final class NativeDubbingTests: XCTestCase {
    @MainActor func testScriptStructureEditsKeepRolesScenesAndSoundReferencesValid() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let editor = DubbingScriptEditorModel(owner: "test", existing: nil, root: root)
        editor.script = try DubbingScriptEditorModel.manualScript(title: "연습", text: "A: 하나\nB: 둘\nA: 셋", options: ["roleCount": 2])
        let first = editor.script.objects("lines")[0].selfID, onlyB = editor.script.objects("lines")[1].selfID
        let binding = editor.rowField("lines", 2, "text")
        editor.script["soundCues"] = [["id":"remove-start", "lineId":first], ["id":"remove-end", "endLineId":first], ["id":"keep", "lineId":onlyB]]
        XCTAssertFalse(editor.canDeleteLine(onlyB))
        editor.deleteLine(onlyB); XCTAssertEqual(editor.script.objects("lines").count, 3)
        editor.deleteLine(first)
        XCTAssertEqual(editor.script.objects("lines").map { $0.int("order") }, [1, 2])
        XCTAssertEqual(editor.script.objects("soundCues").map(\.selfID), ["keep"])
        binding.wrappedValue = "인덱스가 바뀌어도 같은 대사"
        XCTAssertEqual(editor.script.objects("lines")[1].string("text"), "인덱스가 바뀌어도 같은 대사")
        editor.addLine(after: onlyB)
        XCTAssertEqual(editor.script.objects("lines").count, 3)
        XCTAssertTrue(editor.script.objects("lines")[1].string("text").isEmpty)
        XCTAssertEqual(editor.script.objects("lines")[1].string("roleId"), "role_2")
        for _ in 0..<20 { editor.addScene() }
        XCTAssertEqual(editor.script.objects("scenes").count, 12)
        XCTAssertEqual(Set(editor.script.objects("lines").map(\.selfID)).count, editor.script.objects("lines").count)
        try editor.persist()
        let restored = DubbingScriptEditorModel(owner: "test", existing: nil, root: root)
        XCTAssertEqual(restored.script.objects("scenes").count, 12)
    }
    @MainActor func testScriptDraftSaveDiscardAndPendingRequestProtection() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let editor = DubbingScriptEditorModel(owner: "test", existing: nil, root: root)
        XCTAssertFalse(editor.hasChanges)
        editor.title = "저장할 대본"
        XCTAssertTrue(editor.hasChanges)
        try editor.saveDraft()
        XCTAssertFalse(editor.hasChanges)
        let restored = DubbingScriptEditorModel(owner: "test", existing: nil, root: root)
        XCTAssertEqual(restored.title, "저장할 대본")
        restored.title = "저장하지 않을 대본"
        restored.generation = ["state": "running"]
        XCTAssertThrowsError(try restored.discardDraft())
        XCTAssertFalse(restored.closed)
        restored.generation = [:]
        try restored.discardDraft()
        restored.cache() // A disappearing view must not recreate a discarded draft.
        let empty = DubbingScriptEditorModel(owner: "test", existing: nil, root: root)
        XCTAssertEqual(empty.title, "")
    }
    override func tearDown() { MockURLProtocol.handler = nil; super.tearDown() }
    @MainActor func testContinuousRecordingKeepsBackgroundAcrossThreeLocalTakes() async throws {
        guard AVAudioApplication.shared.recordPermission == .granted else { throw XCTSkip("Simulator microphone permission is required for this audio integration test.") }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = try DubbingDrafts(owner: "test", project: "work", sound: "sound", role: "role", root: root)
        MockURLProtocol.handler = { _ in (200, try DubbingWAV.encode(pcm: Data(count: 6 * 96000))) }
        let audio = DubbingAudio(); defer { audio.cancel() }
        try await audio.prepare(path: "/api/dubbing/projects/work/background", api: api)
        XCTAssertEqual(try XCTUnwrap(audio.background).duration, 6, accuracy: 0.01)
        let lines: [[String: Any]] = (0..<3).map { ["id": "line-\($0)", "start": $0 * 2, "end": Double($0 * 2) + 0.5] }
        var selected: [String] = []
        audio.record(lines: lines, drafts: drafts, selected: { selected.append($0) }, completed: {})
        for _ in 0..<120 where audio.running { try await Task.sleep(for: .milliseconds(100)) }
        XCTAssertFalse(audio.running, audio.status)
        XCTAssertNil(audio.error)
        XCTAssertEqual(drafts.takes.count, 3)
        XCTAssertEqual(selected, ["line-0", "line-0", "line-1", "line-2"])
        for take in drafts.takes.values {
            XCTAssertEqual(take.duration, 0.5, accuracy: 0.025)
            // Real input starts on an audio buffer boundary. Verify the actual
            // PCM duration and the segment cap instead of requiring zero latency.
            let bytes = try Data(contentsOf: drafts.file(take))
            XCTAssertEqual(bytes.count, 44 + Int((take.duration * 48000).rounded()) * 2)
            XCTAssertLessThanOrEqual(bytes.count, 48044)
        }
    }
    @MainActor func testPlaybackVolumesStayIndependentAcrossPreparationAndReplay() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        let data = try DubbingWAV.encode(pcm: Data(count: 2 * 96000))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        try data.write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        MockURLProtocol.handler = { _ in (200, data) }
        let audio = DubbingAudio(); defer { audio.cancel() }
        audio.setBackgroundVolume(0.25); audio.setPreviewVolume(0.6)
        try await audio.prepare(path: "/api/dubbing/projects/work/background", api: api)
        XCTAssertEqual(try XCTUnwrap(audio.background).volume, 0.25, accuracy: 0.001)
        try await audio.listen(file: file)
        XCTAssertTrue(audio.previewing)
        XCTAssertEqual(try XCTUnwrap(audio.preview).volume, 0.6, accuracy: 0.001)
        audio.setPreviewVolume(0)
        XCTAssertEqual(try XCTUnwrap(audio.preview).volume, 0)
        XCTAssertEqual(try XCTUnwrap(audio.background).volume, 0.25, accuracy: 0.001)
        XCTAssertTrue(try XCTUnwrap(audio.preview).isPlaying)
        audio.setBackgroundVolume(0.8); audio.cancel()
        try await audio.prepare(path: "/api/dubbing/projects/work/background", api: api)
        try await audio.listen(file: file)
        XCTAssertEqual(try XCTUnwrap(audio.background).volume, 0.8, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(audio.preview).volume, 0)
        XCTAssertEqual(try Data(contentsOf: file), data)
    }
    func testRecordingWindowUsesSoundCueAndKeepsThreeSecondLeadIn() throws {
        let early = try DubbingWindow(["start": 1, "end": 4, "recordEnd": 4.8, "cueStart": 0.5])
        XCTAssertEqual(early.leadIn, 0); XCTAssertEqual(early.duration, 3.8, accuracy: 0.001)
        let cue = try DubbingWindow(["start": 20, "end": 23, "cueStart": 12])
        XCTAssertEqual(cue.leadIn, 12)
        XCTAssertEqual(try DubbingWindow(["start": 20, "end": 23]).leadIn, 17)
        XCTAssertThrowsError(try DubbingWindow(["start": 10, "end": 9]))
        XCTAssertThrowsError(try DubbingWindow(["start": 0, "end": 49]))
        XCTAssertThrowsError(try DubbingWindow(["start": Double.nan, "end": 3]))
    }
    func testRecorderWAVStripsMetadataAndTrimsExactlyAtLineBoundary() throws {
        let pcm = Data((0..<96000).map { UInt8($0 % 251) })
        let canonical = try DubbingWAV.encode(pcm: pcm)
        var raw = Data(canonical.prefix(36))
        raw.append(Data("JUNK".utf8)); raw.append(contentsOf: [4,0,0,0,9,9,9,9]); raw.append(canonical.suffix(from: 36))
        let output = try DubbingWAV.canonical(raw, maximum: 0.5)
        XCTAssertEqual(output.count, 48044)
        XCTAssertEqual(output.suffix(48000), pcm.prefix(48000))
        XCTAssertEqual(String(data: output.subdata(in: 36..<40), encoding: .ascii), "data")
        XCTAssertEqual(try DubbingWAV.canonical(canonical, maximum: 1), canonical)
        var stereo = canonical; stereo[22] = 2
        XCTAssertThrowsError(try DubbingWAV.canonical(stereo, maximum: 1))
        XCTAssertThrowsError(try DubbingWAV.canonical(Data(raw.prefix(50)), maximum: 1))
        XCTAssertThrowsError(try DubbingWAV.encode(pcm: Data(count: 9598)))
    }
    func testDraftRetakeDiscardAndOwnersStayIsolated() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = try DubbingDrafts(owner: "owner-a", project: "work", sound: "sound", role: "role", root: root)
        let first = DubbingTake(id: UUID().uuidString, duration: 0.1)
        try DubbingWAV.encode(pcm: Data(count: 9600)).write(to: drafts.file(first))
        try drafts.commit(line: "line", take: first); try drafts.save()
        let retry = DubbingTake(id: UUID().uuidString, duration: 0.1)
        try DubbingWAV.encode(pcm: Data(count: 9600)).write(to: drafts.file(retry))
        try drafts.commit(line: "line", take: retry); XCTAssertTrue(drafts.changed)
        drafts.discard(); XCTAssertEqual(drafts.takes["line"], first)
        XCTAssertTrue(FileManager.default.fileExists(atPath: try drafts.file(first).path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: try drafts.file(retry).path))
        XCTAssertEqual(try DubbingDrafts(owner: "owner-a", project: "work", sound: "sound", role: "role", root: root).takes["line"], first)
        XCTAssertTrue(try DubbingDrafts(owner: "owner-b", project: "work", sound: "sound", role: "role", root: root).takes.isEmpty)
        XCTAssertThrowsError(try DubbingDrafts(owner: "a", project: "../x", sound: "sound", role: "role", root: root))
    }
    @MainActor func testManualScriptValidatesCastAndKeepsLineTimingAndOrder() throws {
        let options: [String: Any] = ["roleCount": 2, "genres": ["SF"]]
        let script = try DubbingScriptEditorModel.manualScript(title: "도착", text: "A: 안녕\nB： 어디야?\na: 여기!", options: options)
        XCTAssertEqual(script.objects("lines").map { $0.int("order") }, [1,2,3])
        XCTAssertEqual(script.objects("lines").map { $0.string("roleId") }, ["role_1","role_2","role_1"])
        XCTAssertTrue(script.objects("lines").allSatisfy { $0.number("durationSeconds") >= 1 })
        XCTAssertThrowsError(try DubbingScriptEditorModel.manualScript(title: "도착", text: "A: 나만\nA: 있어", options: options))
        XCTAssertThrowsError(try DubbingScriptEditorModel.manualScript(title: "도착", text: "A: 안녕\nC: 다른 배역", options: options))
        XCTAssertThrowsError(try DubbingScriptEditorModel.manualScript(title: "도착", text: "안녕\nB: 안녕", options: options))
    }
    @MainActor func testUnknownUploadOutcomeRecoversWithoutUploadingOrSubmittingTwice() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let audio = DubbingAudio()
        let session = DubbingRecordingSession(owner: "test", project: "work", role: "role", api: api, draftRoot: root)
        var accepted: String?, uploads = 0, submits = 0
        func snapshot() -> [String: Any] {
            var line: [String: Any] = ["id": "line", "roleId": "role", "start": 0, "end": 1]
            if let accepted { line["takeId"] = accepted }
            return ["lines": [line], "recording": ["roles": [["roleId": "role", "revision": accepted == nil ? 1 : 2, "state": submits > 0 ? "submitted" : "draft"]]]]
        }
        MockURLProtocol.handler = { request in
            if request.url!.path.hasSuffix("background") { return (200, try DubbingWAV.encode(pcm: Data(count: 96000))) }
            if request.httpMethod == "PUT" {
                uploads += 1
                accepted = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "take" }?.value
                return (503, Data("{\"error\":\"응답 손실\"}".utf8))
            }
            if request.url!.path.hasSuffix("submit") { submits += 1 }
            return (200, try JSONSerialization.data(withJSONObject: snapshot()))
        }
        await session.prepare(sound: ["id":"sound", "state":"ready"], audio: audio)
        XCTAssertNil(session.error)
        let drafts = try XCTUnwrap(session.drafts)
        let take = DubbingTake(id: UUID().uuidString, duration: 1)
        try DubbingWAV.encode(pcm: Data(count: 96000)).write(to: drafts.file(take))
        try drafts.commit(line: "line", take: take)
        await session.save(submit: false)
        XCTAssertNotNil(session.error); XCTAssertEqual(uploads, 1)
        XCTAssertTrue(FileManager.default.fileExists(atPath: try drafts.file(take).path))
        await session.save(submit: true)
        XCTAssertNil(session.error); XCTAssertTrue(session.submitted)
        XCTAssertEqual(uploads, 1); XCTAssertEqual(submits, 1)
        await session.save(submit: true)
        XCTAssertEqual(uploads, 1); XCTAssertEqual(submits, 1)
    }
    @MainActor func testGenerationRecoveryRetainsRequestAndOriginalOptionsAcrossReopen() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var posts: [[String: Any]] = []
        MockURLProtocol.handler = { request in
            if request.httpMethod == "POST" {
                let bytes: Data
                if let data = request.httpBody { bytes = data }
                else if let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }; var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
                    while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(contentsOf: buffer.prefix(n)) }; bytes = data
                } else { bytes = Data() }
                let body = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any]); posts.append(body)
                if posts.count == 1 { return (503, Data("{\"error\":\"연결 끊김\"}".utf8)) }
                return (200, try JSONSerialization.data(withJSONObject: ["id": body.string("requestId"), "state":"ready", "options": body.object("options"), "script": ["title":"복구된 대본"]]))
            }
            return (404, Data("{\"error\":\"요청 없음\"}".utf8))
        }
        let first = DubbingScriptEditorModel(owner: "owner", existing: nil, api: api, root: root)
        first.options["idea"] = "처음 입력한 이야기"
        await first.generate()
        XCTAssertTrue(first.pending); XCTAssertEqual(posts.count, 1)
        let second = DubbingScriptEditorModel(owner: "owner", existing: nil, api: api, root: root)
        XCTAssertTrue(second.pending)
        second.options["idea"] = "바꾼 이야기"
        await second.generate(); XCTAssertEqual(posts.count, 1)
        await second.recover(); XCTAssertTrue(second.canRetryGeneration)
        await second.retryGeneration()
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts[0].string("requestId"), posts[1].string("requestId"))
        XCTAssertEqual(posts[1].object("options").string("idea"), "처음 입력한 이야기")
        XCTAssertEqual(second.script.string("title"), "복구된 대본")
        XCTAssertFalse(second.pending)
    }

}

final class Android143ParityTests: XCTestCase {
    func testMicrophoneGainClampsPCMAndLeavesHeaderIntact() throws {
        let pcm = Data([0x20, 0x4E, 0xE0, 0xB1, 0, 0]) // +20000, -20000, 0
        XCTAssertEqual(RecordingGain.pcm16(pcm, gain: 2), Data([0xFF, 0x7F, 0, 0x80, 0, 0]))
        XCTAssertEqual(RecordingGain.pcm16(pcm, gain: 0), Data(count: 6))
        XCTAssertEqual(RecordingGain.pcm16(pcm, gain: .nan), pcm)
        let wav = try DubbingWAV.encode(pcm: Data(repeating: 0x10, count: 9600))
        let result = try DubbingWAV.canonical(wav, maximum: 0.1, gain: 0)
        XCTAssertEqual(result.prefix(44), wav.prefix(44)); XCTAssertEqual(result.dropFirst(44), Data(count: 9600))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        defer { try? FileManager.default.removeItem(at: file) }
        try wav.write(to: file); try RecordingGain.apply(to: file, gain: 0)
        XCTAssertEqual(try Data(contentsOf: file), result)
    }
    @MainActor func testDurableLineSurvivesReopenWithoutExplicitSave() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = try DubbingDrafts(owner: "owner", project: "work", sound: "sound", role: "role", root: root)
        let first = DubbingTake(id: UUID().uuidString, duration: 0.1)
        try DubbingWAV.encode(pcm: Data(count: 9600)).write(to: drafts.file(first))
        try await drafts.commitDurably(line: "line-1", take: first)
        XCTAssertFalse(drafts.changed)
        let restored = try DubbingDrafts(owner: "owner", project: "work", sound: "sound", role: "role", root: root)
        XCTAssertEqual(restored.takes["line-1"], first)
        let second = DubbingTake(id: UUID().uuidString, duration: 0.1)
        try DubbingWAV.encode(pcm: Data(count: 9600)).write(to: drafts.file(second))
        try await restored.commitDurably(line: "line-2", take: second)
        XCTAssertEqual(try DubbingDrafts(owner: "owner", project: "work", sound: "sound", role: "role", root: root).takes.count, 2)
        XCTAssertTrue(try DubbingDrafts(owner: "other", project: "work", sound: "sound", role: "role", root: root).takes.isEmpty)
    }
    @MainActor func testContinuousOnlySelectsUnrecordedOwnLines() {
        let session = DubbingRecordingSession(owner: "owner", project: "work", role: "A")
        session.view = ["lines": [["id": "a1", "roleId": "A", "takeId": "saved"], ["id": "b1", "roleId": "B"], ["id": "a2", "roleId": "A"], ["id": "a3", "roleId": "A"]]]
        XCTAssertEqual(session.pendingLines(from: 0).map(\.selfID), ["a2", "a3"])
        XCTAssertEqual(session.pendingLines(from: 2).map(\.selfID), ["a3"])
        XCTAssertEqual(session.complete, 1)
    }
    func testSensitiveReadsNeverUseListCache() {
        for path in ["/api/me", "/api/gold", "/api/notifications", "/api/dubbing/projects/work/recording", "/api/dubbing/projects?tab=mine", "/api/dubbing/projects/work", "/api/voice/join", "/api/playback/song"] { XCTAssertNil(ReadPolicy.ttl(path), path) }
        XCTAssertEqual(ReadPolicy.ttl("/api/dubbing/projects?tab=open&discovery=1&offset=0"), 10)
        XCTAssertEqual(ReadPolicy.ttl("/api/play/songs?tab=recommended"), 20)
        XCTAssertTrue(ReadPolicy.invalidates("/api/crews/a/join", method: "POST"))
        XCTAssertFalse(ReadPolicy.invalidates("/api/dm/person", method: "POST"))
        XCTAssertTrue(ReadPolicy.invalidates("/api/dm/person", method: "DELETE"))
        XCTAssertNil(ReadPolicy.ttl("/api/notifications/summary"))
        XCTAssertFalse(ReadPolicy.invalidates("/api/notifications/read", method: "POST"), "Opening notifications must preserve music caches and in-flight catalog loads")
    }
    @MainActor func testListCacheIsFilterScopedAndClearedOnMutationAndAccountChange() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        var requests = 0, denied = false
        MockURLProtocol.handler = { request in
            requests += 1
            return denied ? (403, Data("{\"error\":\"접근 거부\"}".utf8)) : (200, Data("{\"tracks\":[]}".utf8))
        }
        _ = try await api.call("/api/catalog?section=tracks")
        _ = try await api.call("/api/catalog?section=tracks")
        XCTAssertEqual(requests, 1)
        XCTAssertNotNil(api.peek("/api/catalog?section=tracks"))
        XCTAssertNil(api.peek("/api/catalog?section=albums"))
        _ = try await api.call("/api/catalog?section=albums")
        XCTAssertEqual(requests, 2)
        _ = try await api.call("/api/notifications/read", method: "POST", body: ["through": 55])
        _ = try await api.call("/api/catalog?section=tracks")
        XCTAssertEqual(requests, 3, "Reading notifications does not force music to download again")
        _ = try await api.call("/api/tracks/song/like", method: "PUT")
        XCTAssertNil(api.peek("/api/catalog?section=tracks"))
        _ = try await api.call("/api/catalog?section=tracks")
        api.clearSession(); XCTAssertNil(api.peek("/api/catalog?section=tracks"))
        _ = try await api.call("/api/catalog?section=tracks")
        denied = true
        do { _ = try await api.call("/api/catalog?section=tracks", fresh: true); XCTFail("Denied list must not be shown") } catch { }
        XCTAssertNil(api.peek("/api/catalog?section=tracks"))
    }
    @MainActor func testRequestedUploadContinuesAfterCallerLeavesAndReopenDoesNotDuplicate() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var accepted = "", uploads = 0
        func snapshot() -> [String: Any] { ["lines": [["id":"line", "roleId":"role", "start":0, "end":1, "takeId":accepted]], "recording": ["roles": [["roleId":"role", "revision": accepted.isEmpty ? 1 : 2, "state":"draft"]]]] }
        MockURLProtocol.handler = { request in
            if request.url!.path.hasSuffix("background") { return (200, try DubbingWAV.encode(pcm: Data(count: 96000))) }
            if request.httpMethod == "PUT" {
                Thread.sleep(forTimeInterval: 0.15); uploads += 1
                accepted = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "take" }?.value ?? ""
            }
            return (200, try JSONSerialization.data(withJSONObject: snapshot()))
        }
        var session: DubbingRecordingSession? = DubbingRecordingSession(owner: "owner", project: "work", role: "role", api: api, draftRoot: root)
        let audio = DubbingAudio()
        await session!.prepare(sound: ["id":"sound", "state":"ready"], audio: audio)
        let drafts = try XCTUnwrap(session!.drafts)
        let take = DubbingTake(id: UUID().uuidString, duration: 1)
        try DubbingWAV.encode(pcm: Data(count: 96000)).write(to: drafts.file(take))
        try await drafts.commitDurably(line: "line", take: take)
        session!.startSave(submit: false)
        weak var retained = session; session = nil; audio.cancel()
        for _ in 0..<100 {
            if drafts.takes["line"]?.uploaded == true { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(uploads, 1); XCTAssertEqual(drafts.takes["line"]?.uploaded, true)
        let reopened = DubbingRecordingSession(owner: "owner", project: "work", role: "role", api: api, draftRoot: root)
        await reopened.prepare(sound: ["id":"sound", "state":"ready"], audio: DubbingAudio())
        await reopened.save(submit: false)
        XCTAssertEqual(uploads, 1); XCTAssertNil(reopened.error)
        _ = retained // The screen no longer owns the upload session.
    }
    @MainActor func testBulkDeletionKeepsFailuresAndChecksDubbingOwnership() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        var deletes: [String] = [], removed: [String] = []
        MockURLProtocol.handler = { request in
            let path = request.url!.path
            if request.httpMethod == "DELETE" { deletes.append(path) }
            if path == "/api/uploads/failed" { return (503, Data("{\"error\":\"retry\"}".utf8)) }
            if path == "/api/dubbing/projects/not-mine" { return (200, Data("{\"project\":{\"isOwner\":false}}".utf8)) }
            return (200, Data("{}".utf8))
        }
        let works = [OwnedWork(song: Song(["id":"ok"]), dubbing: nil), OwnedWork(song: Song(["id":"failed"]), dubbing: nil), OwnedWork(song: nil, dubbing: ["id":"not-mine"])]
        let failed = try await OwnedWorkDeletion.remove(works, api: api) { removed.append($0) }
        XCTAssertEqual(removed, ["song-ok"])
        XCTAssertEqual(failed, ["song-failed", "dubbing-not-mine"])
        XCTAssertFalse(deletes.contains("/api/dubbing/projects/not-mine"))
    }
    func testRegisteredDubbingPosterPathOnly() {
        XCTAssertNotNil(DubbingCover.posterURL(["posterUrl": "/api/dubbing/projects/work-1/poster?v=2"]))
        XCTAssertNil(DubbingCover.posterURL(["posterUrl": "https://other.invalid/poster"]))
        XCTAssertNil(DubbingCover.posterURL(["posterUrl": "/api/dubbing/projects/../poster"]))
    }
}

final class ScriptCardEditorTests: XCTestCase {
    let options: [String: Any] = ["genres": ["일상"], "roleCount": 2, "minutes": 1.0, "mood": "랜덤", "ending": "랜덤", "idea": ""]
    let source = "SCENE 01 — 카페 앞\n\n[상황]\n늦은 밤, 두 사람이 마주 서 있다.\n\n서준: 우리 계약, 이제 끝나는 거지?\n지연: 응. 그런데 넌 정말 아무렇지도 않아?\n[SFX: 자동차가 지나가는 소리]\n[BGM: 잔잔한 피아노]\n분류할 수 없는 원문 ★"
    func testPastePreservesOriginalAndUnknownTextWhileSeparatingActorsScenesAndSound() {
        let parsed = DubbingScriptEditing.parse(source, title: "계약", options: options)
        XCTAssertEqual(parsed.source, source)
        XCTAssertEqual(parsed.script.objects("roles").map { $0.string("name") }, ["서준", "지연"])
        XCTAssertEqual(parsed.script.objects("scenes")[0].string("title"), "카페 앞")
        XCTAssertEqual(parsed.script.objects("scenes")[0].string("description"), "늦은 밤, 두 사람이 마주 서 있다.")
        XCTAssertEqual(parsed.script.objects("lines").map { $0.string("text") }, ["우리 계약, 이제 끝나는 거지?", "응. 그런데 넌 정말 아무렇지도 않아?"])
        XCTAssertEqual(parsed.script.objects("soundCues").map { $0.string("kind") }, ["sfx", "bgm"])
        XCTAssertEqual(parsed.unresolved.map { $0.string("text") }, ["분류할 수 없는 원문 ★"])
    }
    func testParserDoesNotDropEmptyScenesOrRewriteUnclassifiedProse() {
        let raw = "SCENE 01 — 빈 장면\nSCENE 02 — 두 번째\nA: 안녕\n원래 줄을 보존해줘\nB: 반가워"
        let parsed = DubbingScriptEditing.parse(raw, title: "테스트", options: options)
        XCTAssertEqual(parsed.script.objects("scenes").count, 2)
        XCTAssertEqual(parsed.unresolved[0].string("text"), "원래 줄을 보존해줘")
        XCTAssertTrue(DubbingScriptEditing.issues(parsed.script).contains { $0.contains("빈 장면") })
    }
    @MainActor func testSceneDuplicateMoveDeleteUndoPreservesIDsAndSoundAnchors() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DubbingScriptEditorModel(owner: "cards", existing: nil, root: root)
        model.acceptImport(DubbingScriptEditing.parse(source, title: "계약", options: options))
        let first = model.script.objects("scenes")[0].selfID, oldLines = model.script.objects("lines")
        model.duplicateScene(first)
        XCTAssertEqual(model.script.objects("scenes").count, 2)
        let copy = model.script.objects("scenes")[1].selfID
        XCTAssertNotEqual(copy, first)
        let copyLines = model.script.objects("lines").filter { $0.string("sceneId") == copy }
        XCTAssertEqual(Set(model.script.objects("lines").map(\.selfID)).count, 4)
        XCTAssertEqual(copyLines.map { $0.string("text") }, oldLines.map { $0.string("text") })
        XCTAssertTrue(model.script.objects("soundCues").filter { $0.string("sceneId") == copy }.allSatisfy { cue in copyLines.contains { $0.selfID == cue.string("lineId") } })
        model.moveScene(copy, by: -1)
        XCTAssertEqual(model.script.objects("lines").first?.string("sceneId"), copy)
        model.removeScene(copy); XCTAssertEqual(model.script.objects("lines").map(\.selfID), oldLines.map(\.selfID))
        model.undo(); XCTAssertEqual(model.script.objects("scenes").count, 2)
    }
    @MainActor func testAutomaticDraftPreservesPasteAndPositionAcrossReentryAndOtherAccount() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DubbingScriptEditorModel(owner: "cards", existing: nil, root: root)
        model.acceptImport(DubbingScriptEditing.parse(source, title: "계약", options: options))
        model.selectedSceneID = "scene_1"; model.editingLineID = model.script.objects("lines")[1].selfID; model.collapsedScenes = ["scene_1"]
        model.field("title").wrappedValue = "자동 저장된 새 제목"
        try await Task.sleep(for: .milliseconds(1100))
        let restored = DubbingScriptEditorModel(owner: "cards", existing: nil, root: root)
        XCTAssertEqual(restored.script.string("title"), "자동 저장된 새 제목")
        XCTAssertEqual(restored.importSource, source); XCTAssertEqual(restored.unresolved.count, 1)
        XCTAssertEqual(restored.editingLineID, model.editingLineID); XCTAssertEqual(restored.collapsedScenes, ["scene_1"])
        XCTAssertTrue(DubbingScriptEditorModel(owner: "other", existing: nil, root: root).script.isEmpty)
    }
    @MainActor func testRemoteRevisionConflictKeepsLocalTextAndCanBecomeSeparatePrivateCopy() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let script = DubbingScriptEditing.parse(source, title: "원래 제목", options: options).script
        let existing: [String: Any] = ["id": "project", "revision": 1, "options": options, "script": script]
        let model = DubbingScriptEditorModel(owner: "cards", existing: existing, root: root)
        model.field("title").wrappedValue = "네트워크가 끊긴 동안 쓴 제목"; try model.persist()
        var remote = existing; remote["revision"] = 2
        let restored = DubbingScriptEditorModel(owner: "cards", existing: remote, root: root)
        XCTAssertTrue(restored.conflict); XCTAssertEqual(restored.script.string("title"), "네트워크가 끊긴 동안 쓴 제목")
        restored.saveConflictAsCopy(); XCTAssertFalse(restored.conflict); XCTAssertNotEqual(restored.projectID, "project")
    }
    @MainActor func testAIProposalNeverOverwritesNewerTypingAndAppliesOnlyAfterExplicitChoice() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DubbingScriptEditorModel(owner: "cards", existing: nil, root: root)
        model.beginBlank(); let before = model.script
        var after = before; after["title"] = "수정안"
        model.proposal = ["refinement": ["script": before], "script": after]
        model.field("title").wrappedValue = "새로 입력"
        model.applyProposal(); XCTAssertEqual(model.script.string("title"), "새로 입력"); XCTAssertFalse(model.proposal.isEmpty)
        model.script = before; model.applyProposal(); XCTAssertEqual(model.script.string("title"), "수정안"); XCTAssertTrue(model.proposal.isEmpty)
        model.undo(); XCTAssertEqual(model.script.string("title"), before.string("title"))
    }
    @MainActor func testFailedAIRefinementKeepsOriginalAndStillAllowsPrivateSave() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { MockURLProtocol.handler = nil; try? FileManager.default.removeItem(at: root) }
        let model = DubbingScriptEditorModel(owner: "cards", existing: nil, api: api, root: root)
        model.acceptImport(DubbingScriptEditing.parse("A: Hello.\nB: Welcome.", title: "Preserved", options: options))
        model.config = ["refinementAvailable": true]
        let original = model.script
        var saved = false
        MockURLProtocol.handler = { request in
            if request.url?.path == "/api/dubbing/generations" { return (429, Data("{\"error\":\"Daily quota used\"}".utf8)) }
            var bytes = request.httpBody ?? Data()
            if let stream = request.httpBodyStream { stream.open(); defer { stream.close() }; var buffer = [UInt8](repeating: 0, count: 4096); while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; bytes.append(buffer, count: n) } }
            let body = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            XCTAssertNil(body["generationId"])
            XCTAssertTrue(NSDictionary(dictionary: original).isEqual(to: body.object("script")))
            saved = true
            return (200, Data("{\"project\":{\"id\":\"saved-private\"}}".utf8))
        }
        await model.refine(action: "natural", target: model.script.objects("lines")[0].selfID)
        XCTAssertFalse(model.pending); XCTAssertTrue(NSDictionary(dictionary: original).isEqual(to: model.script))
        let id = await model.save()
        XCTAssertEqual(id, "saved-private"); XCTAssertTrue(saved)
    }
    func testSharedWebEditPayloadAndSuggestionsPreserveAllUnselectedData() throws {
        let original = DubbingScriptEditing.parse(source, title: "계약", options: options).script
        let target = original.objects("lines")[0].selfID
        let request: [String: Any] = ["script": original, "action": "shorten", "target": target]
        let payload = DubbingScriptEditing.editPayload(request)
        XCTAssertEqual(payload.string("mode"), "shorter")
        XCTAssertEqual(payload.objects("lines").count, 1)
        XCTAssertEqual(payload.objects("lines")[0].string("speaker"), "서준")
        let edited = try DubbingScriptEditing.applyingSuggestions([["id": target, "text": "계약은 끝났어?"]], request: request)
        XCTAssertEqual(edited.objects("lines")[0].string("text"), "계약은 끝났어?")
        XCTAssertTrue(NSDictionary(dictionary: original.objects("lines")[1]).isEqual(to: edited.objects("lines")[1]))
        XCTAssertEqual(NSArray(array: original.objects("soundCues")), NSArray(array: edited.objects("soundCues")))
        XCTAssertThrowsError(try DubbingScriptEditing.applyingSuggestions([["id": "other", "text": "교체"]], request: request))
        XCTAssertThrowsError(try DubbingScriptEditing.applyingSuggestions([], request: request))
    }
    @MainActor func testLegacyServerCannotReceiveAnEditAsAnAccidentalNewStory() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "fixture-only")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { MockURLProtocol.handler = nil; try? FileManager.default.removeItem(at: root) }
        var supportsDrafts = false
        MockURLProtocol.handler = { request in
            if request.url?.path == "/api/dubbing/config" { return (200, Data("{\"aiAvailable\":true}".utf8)) }
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/api/dubbing/editor-drafts")
            return supportsDrafts ? (200, Data("{\"items\":[]}".utf8)) : (404, Data("{\"error\":\"Not found\"}".utf8))
        }
        let model = DubbingScriptEditorModel(owner: "cards", existing: nil, api: api, root: root)
        await model.load(); XCTAssertFalse(model.config.flag("refinementAvailable"))
        supportsDrafts = true
        await model.load(); XCTAssertTrue(model.config.flag("refinementAvailable"))
    }
    func testServerCompatibleLimitsIncludeBGMInTwentyFourCuesAndMusicEndInDuration() {
        var script = DubbingScriptEditing.parse(source, title: "한도", options: options).script
        let row = script.objects("lines")[0]
        script["soundCues"] = (0..<25).map { _ in DubbingScriptEditing.cue(kind: "sfx", scene: row.string("sceneId"), line: row.selfID, prompt: "소리") }
        XCTAssertTrue(DubbingScriptEditing.issues(script).contains { $0.contains("24") })
        var long = row; long["durationSeconds"] = 40.0; long["gapSeconds"] = 8.0
        script["lines"] = (0..<7).map { i in var value = long; value["id"] = "line-\(i)"; return value }; script["soundCues"] = []
        XCTAssertGreaterThan(DubbingScriptEditing.duration(script), 300)
        XCTAssertTrue(DubbingScriptEditing.issues(script).contains { $0.contains("5분") })
    }
}
