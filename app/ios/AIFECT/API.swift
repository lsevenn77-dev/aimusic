import Foundation
import Security

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

enum Endpoint {
    static let origin = URL(string: "https://aifect.co.kr")!
    static func url(_ path: String) throws -> URL {
        guard path.hasPrefix("/"), !path.hasPrefix("//"),
              let url = URL(string: path, relativeTo: origin)?.absoluteURL,
              url.scheme == "https", url.host == origin.host, url.port == nil,
              url.user == nil, url.password == nil else {
            throw APIError(status: 0, message: "허용되지 않은 서버 주소입니다.")
        }
        return url
    }
    static func pathID(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_"))) ?? ""
    }
    static func query(_ text: String) -> String {
        text.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    }
}

enum SessionVault {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "kr.co.aifect.app.session", kSecAttrAccount as String: "cookie"]
    static func read() -> String {
        var q = query; q[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
    static func write(_ value: String) throws {
        if value.isEmpty { SecItemDelete(query as CFDictionary); return }
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw APIError(status: Int(status), message: "로그인 정보를 안전하게 저장하지 못했습니다.") }
    }
}

final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate {
    let progress: @MainActor (Double) -> Void
    init(_ progress: @escaping @MainActor (Double) -> Void) { self.progress = progress }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        let value = min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend))
        Task { @MainActor in progress(value) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor
final class API {
    static let shared = API()
    private(set) var cookie: String
    private let session: URLSession
    private var generation = 0
    var sessionRevision: Int { generation }
    init(configuration: URLSessionConfiguration = .ephemeral, cookie: String? = nil) {
        #if DEBUG
        if FeedbackUIFixture.enabled { configuration.protocolClasses = [FeedbackURLProtocol.self] }
        #endif
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 25
        #if DEBUG
        self.cookie = FeedbackUIFixture.enabled ? "" : (cookie ?? SessionVault.read())
        #else
        self.cookie = cookie ?? SessionVault.read()
        #endif
        session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
    }
    func clearSession() {
        generation += 1; cookie = ""
        try? SessionVault.write("")
    }
    func call(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> [String: Any] {
        let bytes = try body.map { try JSONSerialization.data(withJSONObject: $0) }
        let data = try await request(path, method: method, bytes: bytes, type: "application/json")
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw APIError(status: 0, message: "서버 응답을 읽지 못했습니다.")
        }
        return result
    }
    func request(_ path: String, method: String = "GET", bytes: Data? = nil, type: String = "application/octet-stream", progress: (@MainActor (Double) -> Void)? = nil) async throws -> Data {
        let scope = generation
        var request = URLRequest(url: try Endpoint.url(path))
        request.httpMethod = method; request.httpBody = bytes
        request.setValue(Endpoint.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue("AIFECT-iOS/1.0", forHTTPHeaderField: "User-Agent")
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
        if method != "GET" { request.setValue(type, forHTTPHeaderField: "Content-Type") }
        let delegate = progress.map { UploadProgressDelegate($0) }
        let (data, response) = try await session.data(for: request, delegate: delegate)
        try Task.checkCancellation()
        guard scope == generation else { throw CancellationError() }
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(status: response.statusCode, message: message ?? "서버에 연결하지 못했습니다. 다시 시도해주세요.")
        }
        if let value = response.value(forHTTPHeaderField: "Set-Cookie"),
           let sessionCookie = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": value], for: Endpoint.origin).first(where: { $0.name == "aifect_session" }) {
            let next = sessionCookie.value.isEmpty || (sessionCookie.expiresDate ?? .distantFuture) < Date() ? "" : "aifect_session=\(sessionCookie.value)"
            try SessionVault.write(next)
            if next != cookie { generation += 1 }
            cookie = next
        }
        return data
    }
    func chatEvents(query: String, onChange: @MainActor () async -> Void) async throws {
        let scope = generation
        var request = URLRequest(url: try Endpoint.url("/api/chat/events" + query))
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
        request.setValue(Endpoint.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard http.statusCode == 200 else { throw APIError(status: http.statusCode, message: "대화 접근 권한을 확인해주세요.") }
        guard http.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("text/event-stream") == true else { throw URLError(.badServerResponse) }
        for try await line in bytes.lines {
            try Task.checkCancellation(); guard scope == generation else { throw CancellationError() }
            if line == "event: change" { await onChange() }
            if line == "event: revoked" { throw APIError(status: 403, message: "대화 접근 권한을 확인해주세요.") }
            if line == "event: retry" { throw URLError(.networkConnectionLost) }
        }
    }
    func mediaCookies() -> [HTTPCookie] {
        guard let value = cookie.split(separator: "=", maxSplits: 1).last, !cookie.isEmpty else { return [] }
        return [HTTPCookie(properties: [.domain: "aifect.co.kr", .path: "/", .name: "aifect_session", .value: String(value), .secure: "TRUE"])].compactMap { $0 }
    }
}

struct Song: Identifiable, Codable, Hashable {
    let id: String
    var title: String
    var credit: String
    var genre: String
    var classifiedGenres: [String]?
    var classifiedMoods: [String]?
    var genres: [String] { if let classifiedGenres, !classifiedGenres.isEmpty { return classifiedGenres }; return genre.isEmpty ? [] : [genre] }
    var moods: [String] { classifiedMoods ?? [] }
    var genreLabel: String { genres.joined(separator: " · ") }
    var duration: Double
    var artworkPath: String?
    var isCover: Bool
    var originalID: String?
    var producerID: String?
    var artistID: String?
    var likes: Int
    var comments: Int
    var producerName: String?
    var producerImageVersion: String?
    var descriptionText: String?
    var coverMode: String?
    var plays: Int?
    var covers: Int?
    var creatorName: String { producerName.flatMap { $0.isEmpty ? nil : $0 } ?? credit }
    init(_ data: [String: Any]) {
        producerID = data["producer_id"] as? String; artistID = data["artist_id"] as? String
        id = data.string("id"); title = data.string("title", fallback: "제목 없음")
        isCover = data.string("kind") == "cover"; originalID = data["original_id"] as? String
        credit = (!isCover && data.number("has_ai_artist") == 1) ? data.string("artist") : data.string("producer")
        if credit.isEmpty { credit = "AIFECT" }
        classifiedGenres = data["genres"] as? [String]; classifiedMoods = data["moods"] as? [String]
        genre = data.string("genre"); duration = data.number("duration")
        likes = Int(data.number("likes")); comments = Int(data.number("comments"))
        producerName = data["producer"] as? String; producerImageVersion = data["producer_image_version"] as? String
        descriptionText = data["description"] as? String; coverMode = data["cover_mode"] as? String
        plays = data.int("plays"); covers = data.int("covers")
        if data.number("has_cover") > 0 {
            artworkPath = "/media/\(Endpoint.pathID(id))/cover?v=\(Endpoint.query(data.string("cover_version")))"
        } else if isCover, data.number("original_has_cover") > 0, let originalID {
            artworkPath = "/media/\(Endpoint.pathID(originalID))/cover?v=\(Endpoint.query(data.string("original_cover_version")))"
        }
    }
    var artURL: URL? { artworkPath.flatMap { try? Endpoint.url($0) } }
}

extension Dictionary where Key == String, Value == Any {
    func string(_ key: String, fallback: String = "") -> String { self[key] as? String ?? fallback }
    func number(_ key: String) -> Double { (self[key] as? NSNumber)?.doubleValue ?? 0 }
    func objects(_ key: String) -> [[String: Any]] { self[key] as? [[String: Any]] ?? [] }
    func songs(_ key: String = "tracks") -> [Song] { objects(key).map(Song.init).filter { !$0.id.isEmpty } }
}

func timeLabel(_ seconds: Double) -> String {
    let safe = seconds.isFinite ? Int(max(0, seconds)) : 0
    return String(format: "%d:%02d", safe / 60, safe % 60)
}

// Matches shared/genres.js; server taxonomy is authoritative.
let musicGenreOptions = ["K-POP","Pop","Dark Pop","Ballad","R&B","Soul","Hip-Hop","Rock","Alternative","Indie Pop","EDM","Electronic","Synth Pop","City Pop","Lo-fi","Jazz","Blues","Folk","Acoustic","Country","Classical","Ambient","Fusion","Korean Folklore Fusion","World Music","국악","트로트","J-POP","OST","Instrumental","Dance","Funk","Disco","Metal","Punk","Reggae","Latin","Reggaeton","Afrobeats","House","Techno","Trance","Drum & Bass","Trap","Gospel","New Age","Chillout","Cinematic","Orchestral","Children"]
