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
    static let song = Song(["id": "feedback-song", "title": "편집 검증용 녹음", "duration": 20, "kind": "cover", "producer_id": "fixture-profile", "plays": 12])
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
        try JSONSerialization.data(withJSONObject: [["time": 0, "text": "첫 구간"], ["time": 10, "text": "두 번째 구간"]]).write(to: draft.directory.appendingPathComponent("lyrics.json"))
        return draft
    }
}
final class FeedbackURLProtocol: URLProtocol {
    static var messages: [[String: Any]] = []
    static var stars = 3
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path
        if path == "/api/chat/events" { client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return }
        var data: [String: Any] = [:]
        if path == "/api/me" { data = ["user": ["id": "fixture-user", "name": "검증 계정"], "providers": []] }
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
        else if path == "/api/gold" { data = ["balance": 0, "free": ["balance": Self.stars], "gifts": []] }
        else if path.hasSuffix("/gifts") { Self.stars = max(0, Self.stars - 1); data = ["free_balance": Self.stars] }
        else if path == "/api/me/profile" { data = ["profile": ["id": "fixture-profile", "name": "검증 계정"]] }
        else if path == "/api/producers/fixture-profile" { data = ["tracks": []] }
        else if path == "/api/library" { data = ["likes": [], "collections": []] }
        let bytes = (try? JSONSerialization.data(withJSONObject: data)) ?? Data("{}".utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: bytes); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
struct FeedbackUITestView: View {
    @StateObject private var model = AppModel()
    @State private var draft: RecordingDraft?
    @State private var studio = false
    @State private var gift = false
    var body: some View {
        RootView().environmentObject(model).preferredColorScheme(.dark).tint(Brand.aqua)
            .task { draft = try? FeedbackUIFixture.draft() }
            .overlay(alignment: .topTrailing) {
                Menu("검증") {
                    Button("녹음 편집 검증") { studio = true }
                    Button("선물창 검증") { gift = true }
                }.padding().accessibilityIdentifier("feedback-menu")
            }
            .sheet(isPresented: $gift) { NavigationStack { GiftWalletView(song: FeedbackUIFixture.song, compact: true).environmentObject(model) }.presentationDetents([.fraction(0.48)]) }
            .fullScreenCover(isPresented: $studio) { if let draft { StudioView(studio: RecordingStudio(song: draft.song, owner: draft.owner, draft: draft)).environmentObject(model).preferredColorScheme(.dark) } }
    }
}
#endif
