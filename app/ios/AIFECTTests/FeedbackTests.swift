import XCTest
import AVFoundation
@testable import AIFECT

final class FeedbackTests: XCTestCase {
    override func tearDown() { MockURLProtocol.handler = nil; super.tearDown() }
    @MainActor private func api() -> API {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        return API(configuration: config, cookie: "isolated")
    }
    private func folder() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true); return url
    }
    private func write(_ url: URL, samples: [Float]) throws {
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count))!
        buffer.frameLength = buffer.frameCapacity
        for (i, value) in samples.enumerated() { buffer.floatChannelData![0][i] = value }
        try file.write(from: buffer)
    }
    private func read(_ url: URL) throws -> [Float] {
        let file = try AVAudioFile(forReading: url), buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
        try file.read(into: buffer); return Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
    }
    func testRetakeReplacesOnlySelectedIntervalAndPreservesIntroAndTail() throws {
        let root = try folder(); defer { try? FileManager.default.removeItem(at: root) }
        try write(root.appendingPathComponent("voice.wav"), samples: Array(repeating: 0.1, count: 44100 * 3))
        let take = root.appendingPathComponent("take.wav"); try write(take, samples: Array(repeating: 0.4, count: 44100))
        let duration = try RecordingSplice.merge(folder: root, take: take, start: 1, priorLength: 3)
        let data = try read(root.appendingPathComponent("voice.wav"))
        XCTAssertEqual(duration, 3, accuracy: 0.001); XCTAssertEqual(data.count, 132300)
        XCTAssertEqual(data[22050], 0.1, accuracy: 0.001); XCTAssertEqual(data[66150], 0.4, accuracy: 0.001); XCTAssertEqual(data[110250], 0.1, accuracy: 0.001)
    }
    func testStartingAtLyricInsertsSilenceAndPreservesTake() throws {
        let root = try folder(); defer { try? FileManager.default.removeItem(at: root) }
        let take = root.appendingPathComponent("take.wav"); try write(take, samples: Array(repeating: 0.2, count: 44100))
        XCTAssertEqual(try RecordingSplice.merge(folder: root, take: take, start: 2, priorLength: 0), 3, accuracy: 0.001)
        let data = try read(root.appendingPathComponent("voice.wav"))
        XCTAssertEqual(data[22050], 0, accuracy: 0.0001); XCTAssertEqual(data[110250], 0.2, accuracy: 0.001)
    }
    func testSeekUsesSongTimeAndSyncOffsetWithoutReturningToIntro() throws {
        let forward = try XCTUnwrap(VocalTimeline.segment(position: 30, offset: 0.2, rate: 44100, length: 44100 * 60))
        XCTAssertEqual(forward.start, Int64(29.8 * 44100)); XCTAssertEqual(forward.delay, 0)
        let intro = try XCTUnwrap(VocalTimeline.segment(position: 0, offset: 0.2, rate: 44100, length: 44100))
        XCTAssertEqual(intro.start, 0); XCTAssertEqual(intro.delay, 0.2)
    }
    func testEchoFineControlAndDistinctPresets() {
        XCTAssertEqual(VocalSettings.echoWetMix(2), 0.04, accuracy: 0.0001)
        XCTAssertEqual(VocalSettings.echoWetMix(2.1) - VocalSettings.echoWetMix(2), 0.0041, accuracy: 0.0001)
        var studio = VocalSettings(); studio.select("studio")
        var hall = VocalSettings(); hall.select("hall")
        var rap = VocalSettings(); rap.select("rap")
        XCTAssertEqual(rap.echo, 0); XCTAssertLessThan(rap.room, studio.room); XCTAssertLessThan(studio.room, hall.room)
    }
    @MainActor func testRestartKeepsSavedTakeAndSettingsWithoutDownloadingBackingAgain() async throws {
        let draft = RecordingDraft(id: UUID().uuidString, owner: "restart-test", song: Song(["id": "test", "duration": 30]), date: Date(), length: 3)
        try FileManager.default.createDirectory(at: draft.directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: draft.directory) }
        try write(draft.directory.appendingPathComponent("voice.wav"), samples: Array(repeating: 0.1, count: 44100 * 3))
        try write(draft.directory.appendingPathComponent("backing.wav"), samples: Array(repeating: 0, count: 44100 * 3))
        try FileManager.default.copyItem(at: draft.directory.appendingPathComponent("backing.wav"), to: draft.directory.appendingPathComponent("backing.m4a"))
        try JSONEncoder().encode(draft).write(to: draft.directory.appendingPathComponent("draft.json"))
        let original = try Data(contentsOf: draft.directory.appendingPathComponent("voice.wav"))
        let studio = RecordingStudio(song: draft.song, owner: draft.owner, draft: draft)
        studio.effects.echo = 1.2; studio.effects.noise = 4; studio.backingVolume = 0.7
        studio.returnToRecording()
        XCTAssertFalse(studio.reviewing); XCTAssertNotNil(studio.draft)
        await studio.newTake()
        XCTAssertTrue(studio.ready); XCTAssertNil(studio.draft); XCTAssertFalse(studio.reviewing)
        XCTAssertEqual(studio.elapsed, 0); XCTAssertEqual(studio.currentSettings.echo, 1.2)
        XCTAssertEqual(studio.currentSettings.noise, 4); XCTAssertEqual(studio.currentSettings.backing, 0.7)
        XCTAssertEqual(try Data(contentsOf: draft.directory.appendingPathComponent("voice.wav")), original)
        XCTAssertTrue(FileManager.default.fileExists(atPath: draft.directory.appendingPathComponent("draft.json").path))
        studio.shutdown()
    }
    @MainActor func testLyricCueFromStoppedTakeReturnsToRecordingAndPreservesOriginal() async throws {
        let draft = RecordingDraft(id: UUID().uuidString, owner: "cue-test", song: Song(["id": "test", "duration": 30]), date: Date(), length: 20)
        try FileManager.default.createDirectory(at: draft.directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: draft.directory) }
        let voice = Data([1, 2, 3, 4]); try voice.write(to: draft.directory.appendingPathComponent("voice.wav"))
        let studio = RecordingStudio(song: draft.song, owner: draft.owner, draft: draft)
        studio.words = [(0, "첫 줄"), (10, "다음 줄")]
        await studio.cueLyric(at: 1)
        XCTAssertFalse(studio.reviewing); XCTAssertNil(studio.draft); XCTAssertEqual(studio.elapsed, 8)
        XCTAssertEqual(try Data(contentsOf: draft.directory.appendingPathComponent("voice.wav")), voice)
        await studio.cueLyric(at: 0); XCTAssertEqual(studio.elapsed, 0)
        studio.shutdown()
    }
    @MainActor func testLegacySettingsAndPresetStrengthRetainNoiseAndBalanceAfterReopening() throws {
        let draft = RecordingDraft(id: UUID().uuidString, owner: "settings-test", song: Song(["id": "test"]), date: Date(), length: 1)
        try FileManager.default.createDirectory(at: draft.directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: draft.directory) }
        var settings = VocalSettings(); settings.select("karaoke"); settings.strength = nil; settings.voice = 0.9; settings.backing = 0.7; settings.noise = 4
        try JSONEncoder().encode(settings).write(to: draft.directory.appendingPathComponent("settings.json"))
        let studio = RecordingStudio(song: draft.song, owner: draft.owner, draft: draft)
        XCTAssertEqual(studio.currentSettings.echo, settings.echo)
        studio.setPresetStrength(0)
        try studio.preserveDraftSettings()
        let reopened = RecordingStudio(song: draft.song, owner: draft.owner, draft: draft)
        XCTAssertEqual(reopened.currentSettings.echo, 0); XCTAssertEqual(reopened.currentSettings.room, 0)
        XCTAssertEqual(reopened.currentSettings.strength, 0); XCTAssertEqual(reopened.currentSettings.noise, 4)
        XCTAssertEqual(reopened.currentSettings.voice, 0.9); XCTAssertEqual(reopened.currentSettings.backing, 0.7)
        reopened.shutdown(); studio.shutdown()
    }
    func testExportCancellationPreservesOriginalAndRemovesPartialOutput() throws {
        let root = try folder(); defer { try? FileManager.default.removeItem(at: root) }
        try write(root.appendingPathComponent("voice.wav"), samples: Array(repeating: 0.2, count: 44100))
        try write(root.appendingPathComponent("backing.wav"), samples: Array(repeating: 0, count: 44100))
        try FileManager.default.copyItem(at: root.appendingPathComponent("backing.wav"), to: root.appendingPathComponent("backing.m4a"))
        let original = try Data(contentsOf: root.appendingPathComponent("voice.wav"))
        let control = AudioWorkControl(); control.cancel()
        XCTAssertThrowsError(try AudioMixer.render(folder: root, duration: 1, voice: 1, backing: 0.8, reverb: 0, offset: 0, control: control)) { XCTAssertTrue($0 is CancellationError) }
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("voice.wav")), original)
        XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: root.path).contains { $0.hasPrefix("AIFECT-cover-") })
    }
    func testTwoPercentEchoHasQuietTailInRenderedAudio() throws {
        let root = try folder(); defer { try? FileManager.default.removeItem(at: root) }
        var impulse = Array(repeating: Float(0), count: 44100)
        impulse[4410] = 0.4
        try write(root.appendingPathComponent("voice.wav"), samples: impulse)
        try write(root.appendingPathComponent("backing.wav"), samples: Array(repeating: 0, count: 44100))
        try FileManager.default.copyItem(at: root.appendingPathComponent("backing.wav"), to: root.appendingPathComponent("backing.m4a"))
        var settings = VocalSettings(); settings.echo = 2
        let url = try AudioMixer.render(folder: root, duration: 1, voice: 1, backing: 0, reverb: 0, offset: 0, effects: settings)
        let samples = try read(url)
        let tail = samples[8820..<min(samples.count, 22050)].map { abs($0) }.max() ?? 0
        XCTAssertGreaterThan(tail, 0.00001)
        XCTAssertLessThan(tail, 0.01, "2% control must add a subtle echo rather than a loud repeated vocal")
    }
    @MainActor func testGiftBatchRetriesOnlyAmbiguousRequestAndUpdatesBalanceImmediately() async throws {
        let wallet = GiftWallet(api: api()), owner = UUID().uuidString
        let path = "/api/tracks/test/gifts"
        wallet.bind(owner: owner, path: path)
        var requests: [String] = [], applied = Set<String>(), balance = 3, lost = false
        MockURLProtocol.handler = { request in
            if request.httpMethod == "POST" {
                var body = request.httpBody ?? Data()
                if let stream = request.httpBodyStream { stream.open(); defer { stream.close() }; var bytes = [UInt8](repeating: 0, count: 4096); while stream.hasBytesAvailable { let n = stream.read(&bytes, maxLength: bytes.count); if n <= 0 { break }; body.append(bytes, count: n) } }
                let json = try JSONSerialization.jsonObject(with: body) as! [String: Any], id = json.string("request_id")
                requests.append(id)
                if applied.insert(id).inserted { balance -= 1 }
                if requests.count == 2 && !lost { lost = true; throw URLError(.networkConnectionLost) }
                return (201, try JSONSerialization.data(withJSONObject: ["free_balance": balance]))
            }
            return (200, try JSONSerialization.data(withJSONObject: ["free": ["balance": balance]]))
        }
        await wallet.load(); wallet.prepare(owner: owner, path: path, gift: "star", quantity: 3)
        await wallet.send(owner: owner, path: path)
        XCTAssertEqual(wallet.stars, 2); XCTAssertEqual(wallet.sentCount, 1); XCTAssertEqual(wallet.remaining.count, 2)
        await wallet.send(owner: owner, path: path)
        XCTAssertEqual(balance, 0); XCTAssertEqual(wallet.stars, 0); XCTAssertEqual(applied.count, 3); XCTAssertEqual(requests[1], requests[2]); XCTAssertTrue(wallet.remaining.isEmpty)
        wallet.prepare(owner: owner, path: path, gift: "star", quantity: 1); XCTAssertTrue(wallet.remaining.isEmpty)
    }
    @MainActor func testDMSendShowsServerAcknowledgementWithoutWaitingForNextGet() async throws {
        let room = ChatRoom(owner: "test", path: "/api/dm/peer", crew: false, api: api())
        room.start(); defer { room.stop(); ChatCache.removeAll(owner: "test") }
        MockURLProtocol.handler = { request in
            if request.httpMethod == "POST" { return (201, Data("{\"message\":{\"id\":\"sent\",\"sequence\":1,\"sender_id\":\"test\",\"body\":\"즉시\"}}".utf8)) }
            // Even a delayed/stale poll must not remove the acknowledgement.
            return (200, Data("{\"settings\":{},\"messages\":[]}".utf8))
        }
        room.text = "즉시"; await room.send()
        XCTAssertEqual(room.messages.first?.string("body"), "즉시"); XCTAssertNil(room.pending)
    }
}
