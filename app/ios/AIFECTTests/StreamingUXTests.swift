import XCTest
import SwiftUI
import AVFoundation
@testable import AIFECT

final class StreamingUXTests: XCTestCase {
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
