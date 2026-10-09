import XCTest
import AVFoundation
import FirebaseCore
@testable import AIFECT


final class AIFECTTests: XCTestCase {
    func testDuetGuideRequiresEveryLineAndBothVoices() {
        XCTAssertNotNil(DuetGuide.validation(lines: ["A", ""], count: 2))
        XCTAssertNotNil(DuetGuide.validation(lines: ["A", "A"], count: 2))
        XCTAssertNotNil(DuetGuide.validation(lines: ["B"], count: 2))
        XCTAssertNil(DuetGuide.validation(lines: ["both"], count: 1))
        XCTAssertNil(DuetGuide.validation(lines: ["A", "B", "both"], count: 3))
        XCTAssertEqual(DuetGuide.nextOwnLine(times: [0, 4, 8], lines: ["A", "B", "both"], elapsed: 1, ownPart: "A"), 2)
        XCTAssertEqual(DuetGuide.nextOwnLine(times: [0, 4, 8], lines: ["A", "B", "both"], elapsed: 1, ownPart: "B"), 1)
        XCTAssertNil(DuetGuide.nextOwnLine(times: [0, 4], lines: [], elapsed: 1, ownPart: "A"))
    }
    @MainActor func testDuetEditorToggleFillAndInheritedGuideIsReadOnly() async {
        let studio = RecordingStudio(song: Song(["id": "song"]), owner: "test")
        studio.words = [(0, "first"), (4, "second")]; studio.duetLines = ["", ""]
        studio.setDuetPart("A", at: 0); XCTAssertEqual(studio.duetLines, ["A", ""])
        studio.setDuetPart("A", at: 0); XCTAssertEqual(studio.duetLines, ["", ""])
        studio.setDuetPart("A", at: 0); studio.fillUnassignedDuetLines()
        XCTAssertEqual(studio.duetLines, ["A", "B"])
        let partner = RecordingStudio(song: Song(["id": "song"]), owner: "test", duetParentID: "first-recording")
        partner.duetLines = ["A", "B"]; partner.setDuetPart("B", at: 0); partner.fillUnassignedDuetLines()
        XCTAssertEqual(partner.duetLines, ["A", "B"]); XCTAssertEqual(partner.ownPart, "B")
        studio.ready = true; studio.duetFirst = true; studio.duetMode = "lyrics"; studio.duetLines = ["A", ""]
        await studio.start()
        XCTAssertFalse(studio.recording); XCTAssertNotNil(studio.error)
    }
    func testChatCacheIsolatesAccountsAndRooms() {
        let owner = "qa-" + UUID().uuidString, other = "qa-" + UUID().uuidString
        defer { ChatCache.remove(owner: owner, path: "/dm/one") }
        ChatCache.write(owner: owner, path: "/dm/one", messages: [["id": "m1", "sequence": 4, "body": "test"]], boundary: 4)
        XCTAssertEqual(ChatCache.read(owner: owner, path: "/dm/one").objects("messages").count, 1)
        XCTAssertTrue(ChatCache.read(owner: other, path: "/dm/one").isEmpty)
        XCTAssertTrue(ChatCache.read(owner: owner, path: "/dm/two").isEmpty)
    }
    func testSocialIdentityDoesNotDisplaySyntheticEmail() {
        XCTAssertEqual(accountIdentity(["email": "kakao-123@identity.aifect.invalid", "provider": "kakao"]), "카카오 계정으로 로그인됨")
        XCTAssertEqual(accountIdentity(["email": "person@example.com", "provider": "email"]), "person@example.com")
    }

    @MainActor func testDevelopmentBrowserCallbackRejectsUnboundAndAmbiguousURLs() {
        let ticket = "expected-single-use-ticket"
        XCTAssertTrue(AppModel.matchesLoginCallback(URL(string: "kr.co.aifect.app://auth?ticket=\(ticket)")!, ticket: ticket))
        for text in [
            "https://auth?ticket=\(ticket)",
            "kr.co.aifect.app://other?ticket=\(ticket)",
            "kr.co.aifect.app://auth?ticket=wrong",
            "kr.co.aifect.app://auth?ticket=\(ticket)&ticket=wrong",
            "kr.co.aifect.app://user@auth?ticket=\(ticket)",
            "kr.co.aifect.app://auth/path?ticket=\(ticket)",
            "kr.co.aifect.app://auth?ticket=\(ticket)#fragment"
        ] { XCTAssertFalse(AppModel.matchesLoginCallback(URL(string: text)!, ticket: ticket), text) }
        XCTAssertFalse(AppModel.matchesLoginCallback(URL(string: "kr.co.aifect.app://auth?ticket=\(ticket)")!, ticket: nil))
    }

    @MainActor func testFirebaseInitializesForAIFECTWithMessagingOptIn() throws {
        let app = try XCTUnwrap(FirebaseApp.app())
        XCTAssertEqual(app.options.googleAppID, "1:974296051201:ios:c4c4b0581df46c44261a00")
        XCTAssertEqual(app.options.projectID, "aifect")
        XCTAssertEqual(app.options.bundleID, "kr.co.aifect.app")
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "FirebaseMessagingAutoInitEnabled") as? Bool, false)
    }
    func testAdCadenceCountsListeningAndExcludesPreview() {
        var cadence = SongAdCadence()
        cadence.finish(heard: 59, duration: 100, preview: false)
        cadence.finish(heard: 100, duration: 100, preview: true)
        XCTAssertEqual(cadence.completed, 0)
        for _ in 0..<5 { cadence.finish(heard: 60, duration: 100, preview: false) }
        XCTAssertTrue(cadence.due)
        cadence.shown(); XCTAssertFalse(cadence.due)
    }
    func testPushRouteRequiresKnownKindRecipientAndTarget() {
        XCTAssertNil(PushDestination(["kind": "unknown", "target": "1", "recipient": "owner"]))
        XCTAssertNil(PushDestination(["kind": "dm", "target": "1"]))
        XCTAssertEqual(PushDestination(["kind": "gift", "target": "track", "recipient": "owner"])?.recipient, "owner")
    }

    func testNoiseCleanerPreservesDrySignalAndSuppressesQuietRumble() throws {
        let dry = VocalNoiseCleaner(rate: 44100), clean = VocalNoiseCleaner(rate: 44100)
        var before = 0.0, after = 0.0
        for i in 0..<44100 {
            let sample = Float(0.003 * sin(2 * Double.pi * 40 * Double(i) / 44100))
            XCTAssertEqual(dry.process(sample, level: 0), sample)
            let output = clean.process(sample, level: 3)
            XCTAssertTrue(output.isFinite)
            if i > 22050 { before += Double(sample * sample); after += Double(output * output) }
        }
        XCTAssertLessThan(after, before * 0.1)
        XCTAssertTrue(clean.process(.nan, level: 4).isFinite)
        var settings = VocalSettings(); settings.select("hall"); settings.offset = -0.12; settings.noise = 3
        XCTAssertEqual(try JSONDecoder().decode(VocalSettings.self, from: JSONEncoder().encode(settings)), settings)
    }
    func testEndpointRejectsExternalMediaAndKeepsQueryEncoded() throws {
        for value in ["//evil.example/song", "https://evil.example/song", "http://aifect.co.kr/stream", "data:audio/wav,test"] {
            XCTAssertThrowsError(try Endpoint.url(value))
        }
        let url = try Endpoint.url("/api/search?q=\(Endpoint.query("노래 & #?"))")
        XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "노래 & #?")
        XCTAssertEqual(url.host, "aifect.co.kr")
        XCTAssertEqual(Endpoint.pathID("fef77394-8dd9-4638-9e82-a241b77b738c"), "fef77394-8dd9-4638-9e82-a241b77b738c")
        XCTAssertFalse(try Endpoint.url("/media/\(Endpoint.pathID("original-1"))/cover").absoluteString.contains("%2D"))
    }
    func testCoverUsesOriginalArtworkAndProducerCredit() {
        let song = Song(["id": "cover-1", "title": "곡", "kind": "cover", "original_id": "original-1", "original_has_cover": 1, "original_cover_version": "version", "artist": "AI 가수", "producer": "실제 보컬", "has_ai_artist": 1])
        XCTAssertEqual(song.credit, "실제 보컬")
        XCTAssertEqual(song.artURL?.path, "/media/original-1/cover")
        XCTAssertEqual(song.duration, 0)
    }
    @MainActor func testAPIPropagatesServerErrorAndScopesSession() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "aifect_session=test-session")
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://aifect.co.kr")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "aifect_session=test-session")
            return (401, Data("{\"error\":\"로그인해주세요.\"}".utf8))
        }
        do { _ = try await api.call("/api/library"); XCTFail("Expected rejection") }
        catch let error as APIError { XCTAssertEqual(error.status, 401); XCTAssertEqual(error.message, "로그인해주세요.") }
    }
    func testDraftIsolation() throws {
        let id = "test-" + UUID().uuidString
        let draft = RecordingDraft(id: id, owner: "test-owner", song: Song(["id": "song", "title": "테스트"]), date: Date(), length: 2)
        try FileManager.default.createDirectory(at: draft.directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: draft.directory) }
        try JSONEncoder().encode(draft).write(to: draft.directory.appendingPathComponent("draft.json"))
        XCTAssertTrue(RecordingDraft.list(owner: "test-owner").contains(where: { $0.id == id }))
        XCTAssertFalse(RecordingDraft.list(owner: "other-owner").contains(where: { $0.id == id }))
    }
    @MainActor func testCoverSubmissionRecoversAmbiguousCompletionWithoutDuplicates() async throws {
        let draft = RecordingDraft(id: "test-" + UUID().uuidString, owner: "owner", song: Song(["id": "original"]), date: Date(), length: 1)
        try FileManager.default.createDirectory(at: draft.directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: draft.directory) }
        let audio = draft.directory.appendingPathComponent("test.wav")
        try Data(repeating: 0, count: 128).write(to: audio)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "")
        var createCount = 0, uploadCount = 0, completeCount = 0
        MockURLProtocol.handler = { request in
            switch request.url!.path {
            case "/api/me": return (200, Data("{\"user\":{\"id\":\"owner\"}}".utf8))
            case "/api/covers": createCount += 1; return (201, Data("{\"id\":\"cover\"}".utf8))
            case "/api/uploads/cover/audio": uploadCount += 1; return (200, Data("{}".utf8))
            case "/api/uploads/cover/complete": completeCount += 1; return (500, Data("{\"error\":\"응답 실패\"}".utf8))
            case "/api/studio/tracks/cover": return (200, Data("{\"profile\":{\"status\":\"queued\"}}".utf8))
            default: XCTFail("Unexpected request"); return (404, Data("{}".utf8))
            }
        }
        do { _ = try await CoverPublisher.submit(draft: draft, audio: audio, description: "", ownVoice: false, rights: true, api: api); XCTFail("Consent must be required") } catch {}
        XCTAssertEqual(createCount, 0)
        do { _ = try await CoverPublisher.submit(draft: draft, audio: audio, description: "", ownVoice: true, rights: true, api: api); XCTFail("Expected simulated network failure") } catch {}
        let id = try await CoverPublisher.submit(draft: draft, audio: audio, description: "", ownVoice: true, rights: true, api: api)
        XCTAssertEqual(id, "cover"); XCTAssertEqual(createCount, 1); XCTAssertEqual(uploadCount, 1); XCTAssertEqual(completeCount, 1)
    }
    @MainActor func testOriginalUploadRestoresAfterLostCompletionWithoutDuplicate() async throws {
        let owner = "test-original-" + UUID().uuidString
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OriginalUploads").appendingPathComponent(owner)
        let audio = FileManager.default.temporaryDirectory.appendingPathComponent(owner + ".wav")
        defer { try? FileManager.default.removeItem(at: folder); try? FileManager.default.removeItem(at: audio); MockURLProtocol.handler = nil }
        try Data(repeating: 0, count: 128).write(to: audio)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let api = API(configuration: config, cookie: "")
        var creates = 0, uploads = 0, completions = 0
        MockURLProtocol.handler = { request in
            switch request.url!.path {
            case "/api/uploads": creates += 1; return (201, Data("{\"id\":\"original-test\"}".utf8))
            case "/api/studio/tracks/original-test": return (200, try JSONSerialization.data(withJSONObject: ["profile": ["status": completions == 0 ? "uploading" : "queued"]]))
            case "/api/uploads/original-test/audio": uploads += 1; return (200, Data("{}".utf8))
            case "/api/uploads/original-test/complete": completions += 1; throw URLError(.networkConnectionLost)
            default: XCTFail("Unexpected request"); return (404, Data("{}".utf8))
            }
        }
        let first = OriginalUpload(); XCTAssertNil(first.restore(account: owner))
        let failed = await first.submit(file: audio, metadata: [:], account: owner, api: api)
        XCTAssertNil(failed)
        let resumed = OriginalUpload(); let frozen = try XCTUnwrap(resumed.restore(account: owner))
        let result = await resumed.submit(file: frozen, metadata: [:], account: owner, api: api)
        XCTAssertEqual(result, "original-test")
        XCTAssertEqual(creates, 1); XCTAssertEqual(uploads, 1); XCTAssertEqual(completions, 1)
        XCTAssertTrue(resumed.submitted)
    }
    func testOfflineMixProducesFiniteStereoAudioAndCorrectLength() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        for name in ["voice.wav", "backing.m4a"] {
            let url = folder.appendingPathComponent(name == "backing.m4a" ? "backing.wav" : name)
            let file = try AVAudioFile(forWriting: url, settings: format.settings)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44100)!
            buffer.frameLength = 44100
            for i in 0..<44100 { buffer.floatChannelData![0][i] = Float(sin(Double(i) * 2 * .pi * 440 / 44100)) * 0.1 }
            try file.write(from: buffer)
        }
        let waveform = try AudioMixer.waveform(url: folder.appendingPathComponent("voice.wav"))
        XCTAssertEqual(waveform.count, 96)
        XCTAssertTrue(waveform.allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 1 })
        XCTAssertGreaterThan(waveform.max() ?? 0, 0)
        // AVAudioFile reads the file header, so a WAV fixture can stand in for decoded backing audio.
        try FileManager.default.copyItem(at: folder.appendingPathComponent("backing.wav"), to: folder.appendingPathComponent("backing.m4a"))
        for offset in [-0.05, 0.0, 0.1] {
            let result = try AudioMixer.render(folder: folder, duration: 1, voice: 0.8, backing: 0.5, reverb: 12, offset: offset)
            let file = try AVAudioFile(forReading: result)
            XCTAssertEqual(file.length, 44100)
            XCTAssertEqual(file.processingFormat.channelCount, 2)
            let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 44100)!
            try file.read(into: buffer)
            let samples = Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
            XCTAssertTrue(samples.allSatisfy(\.isFinite))
            XCTAssertGreaterThan(samples.map { abs($0) }.max() ?? 0, 0.01)
        }
    }
}
