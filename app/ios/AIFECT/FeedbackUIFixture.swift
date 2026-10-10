#if DEBUG
import SwiftUI
import AVFoundation

/// Explicitly opted-in, simulator-only UI fixtures. No service traffic, user
/// messages, microphone recording, gifts or uploads occur in these UI checks.
enum FeedbackUIFixture {
    static var enabled: Bool {
        #if targetEnvironment(simulator)
        return ProcessInfo.processInfo.arguments.contains("-feedback-ui-test")
        #else
        return false
        #endif
    }
    static let song = Song(["id": "feedback-song", "title": "편집 검증용 녹음", "duration": 20, "kind": "cover", "original_id": "fixture-original", "producer_id": "fixture-profile", "plays": 12])
    static let chartTracks: [[String: Any]] = (1...5).map { ["id": "chart-\($0)", "title": "차트곡 \($0)", "producer_id": "fixture-profile", "producer": "프로필 검증 창작자", "duration": 20] }
    static let lyrics: [[String: Any]] = [["time": 0, "text": "첫 구간"], ["time": 10, "text": "두 번째 구간"], ["time": 12, "text": "세 번째 구간"], ["time": 14, "text": "네 번째 구간"], ["time": 16, "text": "다섯 번째 구간"], ["time": 18, "text": "마지막 구간"]]
    @MainActor static func draft() throws -> RecordingDraft {
        let draft = RecordingDraft(id: "feedback-ui-fixture", owner: "fixture-user", song: song, date: Date(), length: 20)
        try FileManager.default.createDirectory(at: draft.directory, withIntermediateDirectories: true)
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        for name in ["voice.wav", "backing.m4a"] {
            let file = try AVAudioFile(forWriting: draft.directory.appendingPathComponent(name == "backing.m4a" ? "backing.wav" : name), settings: format.settings, commonFormat: .pcmFormatFloat32, interleaved: false)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44100 * 20)!
            buffer.frameLength = buffer.frameCapacity
            for i in 0..<Int(buffer.frameLength) { buffer.floatChannelData![0][i] = Float(sin(Double(i) * 2 * .pi * 220 / 44100)) * 0.01 }
            try file.write(from: buffer)
        }
        let backing = draft.directory.appendingPathComponent("backing.m4a")
        try? FileManager.default.removeItem(at: backing)
        try FileManager.default.copyItem(at: draft.directory.appendingPathComponent("backing.wav"), to: backing)
        try JSONEncoder().encode(draft).write(to: draft.directory.appendingPathComponent("draft.json"))
        try JSONSerialization.data(withJSONObject: lyrics).write(to: draft.directory.appendingPathComponent("lyrics.json"))
        return draft
    }
}
final class FeedbackURLProtocol: URLProtocol {
    static var messages: [[String: Any]] = []
    static var stars = 3
    private static let profileLock = NSLock()
    private static var storedName = "검증 계정"
    static var profileName: String {
        get { profileLock.withLock { storedName } }
        set { profileLock.withLock { storedName = newValue } }
    }
    static let crew: [String: Any] = ["id": "fixture-crew", "name": "검증 크루", "description": "음악을 사랑하는 목소리가 모여, 오늘도 함께 성장하는 크루입니다.", "interests": "발라드 · R&B", "level": 2, "xp": 240, "next_xp": 500, "members": 12, "capacity": 20, "recruiting": true]
    static let crewRules: [String: Any] = ["levels": [["level": 1, "xp": 0, "capacity": 10], ["level": 2, "xp": 100, "capacity": 20], ["level": 3, "xp": 500, "capacity": 50], ["level": 4, "xp": 1500, "capacity": 100], ["level": 5, "xp": 3000, "capacity": 150]], "publishedTrack": 1, "receivedGold": 1, "dailyChat": 10]
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path
        if path == "/media/fixture-original/mr" {
            let url = RecordingDraft.root.appendingPathComponent("feedback-ui-fixture/backing.m4a")
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "audio/wav"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: (try? Data(contentsOf: url)) ?? Data()); client?.urlProtocolDidFinishLoading(self); return
        }
        if path == "/api/chat/events" { client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return }
        var data: [String: Any] = [:]
        if path == "/api/me" { data = ["user": ["id": "fixture-user", "name": Self.profileName], "providers": []] }
        else if path == "/api/karaoke/fixture-original" {
            data = ["track": ["id": "fixture-original", "title": "부르기 검증 원곡", "duration": 20], "mr": "/media/fixture-original/mr", "words": FeedbackUIFixture.lyrics.map { ["s": $0.number("time"), "w": [["t": $0.string("text")]]] }]
        }
        else if path == "/api/dm" { data = ["conversations": [["id": "fixture-peer", "name": "채팅 테스트", "last_message": "입력란 확인"]], "crew": ["id": "fixture-crew", "name": "검증 크루"], "unread": 0] }
        else if path.hasPrefix("/api/dm/") || path.hasSuffix("/messages") {
            if request.httpMethod == "POST" {
                var bytes = request.httpBody ?? Data()
                if let stream = request.httpBodyStream { stream.open(); defer { stream.close() }; var buffer = [UInt8](repeating: 0, count: 4096); while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; bytes.append(buffer, count: n) } }
                let body = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] ?? [:]
                let message: [String: Any] = ["id": UUID().uuidString, "sequence": Self.messages.count + 1, "sender_id": "fixture-user", "user_id": "fixture-user", "body": body.string("body"), "request_id": body.string("request_id"), "created": Date().timeIntervalSince1970]
                Self.messages.append(message); data = ["message": message]
            } else { data = ["messages": Self.messages, "settings": [:], "membership": ["joined_sequence": 0], "peer": ["name": "채팅 테스트"]] }
        }
        else if path == "/api/gold" { data = ["balance": 1250, "free": ["balance": Self.stars], "gifts": []] }
        else if path.hasSuffix("/gifts") { Self.stars = max(0, Self.stars - 1); data = ["free_balance": Self.stars] }
        else if path == "/api/me/profile" {
            if request.httpMethod == "PUT" { Self.profileName = requestBody().string("name") }
            data = ["profile": ["id": "fixture-own-profile", "name": Self.profileName]]
        }
        else if path == "/api/crews" { data = ["crews": [Self.crew], "mine": "fixture-crew", "rules": Self.crewRules] }
        else if path == "/api/crews/fixture-crew" { data = ["crew": Self.crew, "membership": ["role": "member"], "members": [], "tracks": [], "rules": Self.crewRules] }
        else if path == "/api/gifts/free" { data = ["balance": Self.stars] }
        else if path == "/api/producers/fixture-profile" {
            if ProcessInfo.processInfo.arguments.contains("-profile-refresh-test") {
                DispatchQueue.main.async { NotificationCenter.default.post(name: Notification.Name("feedback-profile-loaded"), object: nil) }
            }
            data = ["profile": ["id": "fixture-profile", "user_id": "fixture-creator", "name": "프로필 검증 창작자", "bio": "음악으로 만나요"], "followers": 3,
                    "tracks": [["id": "fixture-original", "title": "창작자 공개 음원", "producer_id": "fixture-profile", "producer": "프로필 검증 창작자", "kind": "original", "duration": 20]],
                    "covers": [["id": "fixture-cover", "title": "창작자 커버곡", "producer_id": "fixture-profile", "producer": "프로필 검증 창작자", "kind": "cover", "original_id": "fixture-original", "duration": 20]]]
        }
        else if path == "/api/catalog", URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.contains(URLQueryItem(name: "chart", value: "top")) == true { data = ["tracks": FeedbackUIFixture.chartTracks] }
        else if path == "/api/karaoke" { data = ["tracks": Array(FeedbackUIFixture.chartTracks.reversed())] }
        else if path == "/api/library" { data = ["likes": [], "collections": []] }
        let bytes = (try? JSONSerialization.data(withJSONObject: data)) ?? Data("{}".utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: bytes); client?.urlProtocolDidFinishLoading(self)
    }
    private func requestBody() -> [String: Any] {
        var bytes = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; bytes.append(buffer, count: n) }
        }
        return (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] ?? [:]
    }
    override func stopLoading() {}
}
private struct FeedbackStudioSelection: Identifiable { let id = UUID(); let studio: RecordingStudio }
struct FeedbackUITestView: View {
    @StateObject private var model = AppModel()
    @State private var draft: RecordingDraft?
    @State private var studio: FeedbackStudioSelection?
    @State private var gift = false
    @State private var track = false
    var body: some View {
        RootView().environmentObject(model).preferredColorScheme(.dark).tint(Brand.aqua)
            .task { draft = try? FeedbackUIFixture.draft() }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("feedback-profile-loaded"))) { _ in model.chart = []; model.singable = [] }
            .overlay(alignment: .topTrailing) {
                Menu("검증") {
                    Button("녹음 편집 검증") { if let draft { studio = FeedbackStudioSelection(studio: makeStudio(draft, stopped: false)) } }
                    Button("녹음 멈춤 검증") { if let draft { studio = FeedbackStudioSelection(studio: makeStudio(draft, stopped: true)) } }
                    Button("재생창 프로필 검증") { model.player.current = FeedbackUIFixture.song; model.player.duration = 20 }
                    Button("음원 상세 검증") { track = true }
                    Button("선물창 검증") { gift = true }
                }.padding().accessibilityIdentifier("feedback-menu")
            }
            .sheet(isPresented: $gift) { NavigationStack { GiftWalletView(song: FeedbackUIFixture.song, compact: true).environmentObject(model) }.presentationDetents([.fraction(0.48)]) }
            .sheet(isPresented: $track) { TrackDetailView(song: FeedbackUIFixture.song).environmentObject(model) }
            .fullScreenCover(item: $studio) { selection in StudioView(studio: selection.studio).environmentObject(model).preferredColorScheme(.dark) }
    }
    private func makeStudio(_ draft: RecordingDraft, stopped: Bool) -> RecordingStudio {
        let studio = RecordingStudio(song: draft.song, owner: draft.owner, draft: draft)
        if stopped { studio.returnToRecording() }
        return studio
    }
}
#endif
