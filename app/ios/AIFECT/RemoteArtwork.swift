import SwiftUI
import SDWebImage
import SDWebImageWebPCoder
import ImageIO
import CryptoKit

enum CatalogArtwork {
    static func url(_ raw: String?) -> URL? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty, value.utf8.count <= 2048, !value.contains("\\"),
              value.rangeOfCharacter(from: .controlCharacters) == nil,
              let parts = URLComponents(string: value),
              parts.fragment == nil, parts.user == nil, parts.password == nil else { return nil }
        let decoded = parts.path
        guard !decoded.contains("\\"), decoded.rangeOfCharacter(from: .controlCharacters) == nil,
              !decoded.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return nil }
        if value.hasPrefix("/") {
            guard !value.hasPrefix("//"), parts.host == nil else { return nil }
            return try? Endpoint.url(value)
        }
        guard parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.port.map({ (1...65535).contains($0) }) ?? true else { return nil }
        return parts.url
    }

    static func giftURL(_ gift: [String: Any]) -> URL? {
        for group in [gift.object("assetPaths"), gift.object("assets"), gift] {
            for key in ["image", "image_url", "thumbnail", "artwork", "url"] {
                if let url = url(group[key] as? String) { return url }
            }
        }
        return nil
    }

    static func decorationURL(_ product: [String: Any]) -> URL? {
        if let image = url(product["catalog_thumbnail"] as? String) { return image }
        let keys = product.string("kind") == "TALKING_ROOM_THEME"
            ? ["roomCard", "thumbnail", "roomMobile", "roomDesktop", "image", "cover"]
            : ["thumbnail", "overlay", "roomCard", "roomMobile", "image", "cover"]
        for group in [product.object("assetPaths"), product.object("assets"), product] {
            for key in keys { if let url = url(group[key] as? String) { return url } }
        }
        return nil
    }
}

struct CatalogFrame {
    let overlay: URL?
    let effect: URL?
    let scale: CGFloat

    init(person: [String: Any]) {
        let display: [String: Any]
        if let object = person["profile_frame_display"] as? [String: Any] {
            display = object
        } else if let text = person["profile_frame_display"] as? String,
                  let object = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] {
            display = object
        } else {
            display = [:]
        }
        overlay = CatalogArtwork.url(display["overlay"] as? String) ?? CatalogArtwork.url(person["profile_frame_artwork"] as? String)
        effect = CatalogArtwork.url(display["effect"] as? String)
        let value = (display["scale"] as? NSNumber)?.doubleValue ?? Double(display.string("scale")) ?? 1.26
        scale = CGFloat(value.isFinite ? min(1.6, max(1, value)) : 1.26)
    }
}

/// Persist only images explicitly marked public and fresh by the server. Private media
/// stays in account-scoped memory; cookies and authentication headers never reach this cache.
final class PublicArtworkCache: @unchecked Sendable {
    static let shared = PublicArtworkCache()
    private let directory: URL
    private let capacity: Int
    private let queue = DispatchQueue(label: "kr.co.aifect.artwork.disk", qos: .utility)
    private struct Entry: Codable {
        let bytes: Data
        let headers: [String: String]
        let expires: TimeInterval
    }
    init(directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("AIFECTPublicArtwork-v1", isDirectory: true), capacity: Int = 64 * 1024 * 1024) {
        self.directory = directory; self.capacity = capacity
    }
    private func file(_ url: URL) -> URL {
        let key = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(key + ".artwork")
    }

    static func lifetime(_ response: HTTPURLResponse) -> TimeInterval? {
        guard response.statusCode == 200,
              response.value(forHTTPHeaderField: "Content-Type")?.lowercased().hasPrefix("image/") == true else { return nil }
        if let value = response.value(forHTTPHeaderField: "Set-Cookie") {
            // Cloudflare adds bot-management cookies even to immutable public covers.
            // Allow that response, but never persist or replay the cookies themselves.
            guard let url = response.url, url.host == Endpoint.origin.host else { return nil }
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": value], for: url)
            guard !cookies.isEmpty, cookies.allSatisfy({ ["__cf_bm", "_cfuvid"].contains($0.name) }) else { return nil }
        }
        let directives = (response.value(forHTTPHeaderField: "Cache-Control") ?? "").lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard directives.contains("public"), !directives.contains(where: { $0.hasPrefix("private") || $0.hasPrefix("no-store") || $0.hasPrefix("no-cache") }) else { return nil }
        let vary = (response.value(forHTTPHeaderField: "Vary") ?? "").lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        // Native requests never set the image-mirror header; cache only the normal image.
        guard vary.allSatisfy({ $0 == "accept-encoding" || ($0 == "x-aifect-image-mirror" && response.url?.host == Endpoint.origin.host) }) else { return nil }
        guard let maxAge = directives.first(where: { $0.hasPrefix("max-age=") }).flatMap({ Double($0.dropFirst(8).trimmingCharacters(in: CharacterSet(charactersIn: "\""))) }), maxAge.isFinite else { return nil }
        let age = max(0, Double(response.value(forHTTPHeaderField: "Age") ?? "0") ?? 0)
        let remaining = min(30 * 24 * 3600, maxAge - age)
        return remaining > 0 ? remaining : nil
    }
    func load(_ url: URL, now: Date = Date()) async -> (Data, HTTPURLResponse)? {
        await withCheckedContinuation { continuation in
            queue.async {
                let file = self.file(url)
                guard let bytes = try? Data(contentsOf: file), bytes.count <= 8 * 1024 * 1024 + 16384,
                      let entry = try? PropertyListDecoder().decode(Entry.self, from: bytes), entry.expires > now.timeIntervalSince1970,
                      let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: entry.headers),
                      Self.lifetime(response) != nil else {
                    try? FileManager.default.removeItem(at: file)
                    continuation.resume(returning: nil); return
                }
                try? FileManager.default.setAttributes([.modificationDate: now], ofItemAtPath: file.path)
                continuation.resume(returning: (entry.bytes, response))
            }
        }
    }
    func store(_ data: Data, response: HTTPURLResponse, for url: URL, now: Date = Date()) async {
        guard data.count <= 8 * 1024 * 1024, let lifetime = Self.lifetime(response) else { return }
        let headers = ["Content-Type", "Cache-Control", "Vary", "Age"].reduce(into: [String: String]()) { values, key in values[key] = response.value(forHTTPHeaderField: key) }
        await withCheckedContinuation { continuation in
            queue.async {
                do {
                    try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
                    let encoder = PropertyListEncoder(); encoder.outputFormat = .binary
                    let entry = Entry(bytes: data, headers: headers, expires: now.timeIntervalSince1970 + lifetime)
                    try encoder.encode(entry).write(to: self.file(url), options: .atomic)
                    self.trim()
                } catch { /* A full or unavailable cache must never prevent displaying artwork. */ }
                continuation.resume()
            }
        }
    }
    func remove(_ url: URL) async {
        await withCheckedContinuation { continuation in
            queue.async { try? FileManager.default.removeItem(at: self.file(url)); continuation.resume() }
        }
    }
    private func trim() {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey])) ?? []
        let entries = files.filter { $0.pathExtension == "artwork" }.map { file in
            let values = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            return (file, values?.fileSize ?? 0, values?.contentModificationDate ?? .distantPast)
        }.sorted { $0.2 > $1.2 }
        var total = 0
        for (index, entry) in entries.enumerated() {
            total += entry.1
            if total > capacity || index >= 512 { try? FileManager.default.removeItem(at: entry.0) }
        }
    }
}

/// Downloads are shared across thumbnail sizes. Only successful decoded images and
/// their source bytes are kept in bounded, account-scoped memory.
@MainActor final class ArtworkRepository {
    static let shared = ArtworkRepository()
    private let cache = NSCache<NSString, UIImage>()
    private let motion = NSCache<NSString, SDAnimatedImage>()
    private let api: API
    private let publicCache: PublicArtworkCache
    private let sources = NSCache<NSString, Source>()
    private var pendingSources: [String: Task<Source, Error>] = [:]
    private var pending: [String: Task<UIImage, Error>] = [:]
    private final class Source: NSObject {
        let bytes: Data
        let response: HTTPURLResponse
        var persisted: Bool
        init(_ bytes: Data, _ response: HTTPURLResponse, persisted: Bool = false) { self.bytes = bytes; self.response = response; self.persisted = persisted }
    }
    private static let decodingQueue = DispatchQueue(label: "kr.co.aifect.artwork", qos: .userInitiated)
    private static let registerWebP: Void = SDImageCodersManager.shared.addCoder(SDImageWebPCoder.shared)
    private lazy var catalogSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.timeoutIntervalForRequest = 25
        return URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }()
    init(api: API? = nil, publicCache: PublicArtworkCache = .shared) {
        self.api = api ?? .shared
        self.publicCache = publicCache
        cache.totalCostLimit = 48 * 1024 * 1024
        cache.countLimit = 80
        motion.totalCostLimit = 8 * 1024 * 1024
        motion.countLimit = 12
        sources.totalCostLimit = 16 * 1024 * 1024
        sources.countLimit = 80
    }
    func animation(at url: URL) async throws -> SDAnimatedImage? {
        guard let parsed = CatalogArtwork.url(url.absoluteString) else { return nil }
        let sameOrigin = parsed.scheme == "https" && parsed.host == Endpoint.origin.host && parsed.port == nil
        let scope = api.sessionRevision
        let key = "\(scope):\(parsed.absoluteString)"
        if let cached = motion.object(forKey: key as NSString) { return cached }
        let source = try await source(at: parsed, sameOrigin: sameOrigin, scope: scope, key: key)
        guard scope == api.sessionRevision, source.bytes.count <= 5 * 1024 * 1024 else { return nil }
        _ = Self.registerWebP
        if let cached = motion.object(forKey: key as NSString) { return cached }
        guard let image = SDAnimatedImage(data: source.bytes, scale: 1, options: nil) else { return nil }
        motion.setObject(image, forKey: key as NSString, cost: source.bytes.count)
        return image
    }
    func image(at url: URL, catalog: Bool = false, maxPixelSize: Int = 1024) async throws -> UIImage {
        let sameOrigin = url.scheme == "https" && url.host == Endpoint.origin.host && url.port == nil && url.user == nil && url.password == nil
        guard sameOrigin || (catalog && CatalogArtwork.url(url.absoluteString) != nil) else {
            throw APIError(status: 0, message: "이미지 주소를 확인할 수 없습니다.")
        }
        let scope = api.sessionRevision
        let limit = max(64, min(1600, maxPixelSize))
        let sourceKey = "\(scope):\(url.absoluteString)"
        let key = "\(scope):\(limit):\(url.absoluteString)"
        if let image = cache.object(forKey: key as NSString) { return image }
        // Decode per size, but fetch the original only once across rows, shelves and detail views.
        if let task = pending[key] { return try await task.value }
        let task = Task { @MainActor in
            defer { pending[key] = nil }
            let source = try await source(at: url, sameOrigin: sameOrigin, scope: scope, key: sourceKey)
            let bytes = source.bytes
            guard scope == api.sessionRevision else { throw CancellationError() }
            guard bytes.count <= 8 * 1024 * 1024 else { throw APIError(status: 0, message: "이미지를 불러오지 못했습니다.") }
            let decoded: UIImage? = await withCheckedContinuation { continuation in
                Self.decodingQueue.async {
                    continuation.resume(returning: Self.decode(bytes, maxPixelSize: limit))
                }
            }
            guard scope == api.sessionRevision else { throw CancellationError() }
            guard let image = decoded else {
                sources.removeObject(forKey: sourceKey as NSString)
                await publicCache.remove(url)
                throw APIError(status: 0, message: "이미지를 불러오지 못했습니다.")
            }
            cache.setObject(image, forKey: key as NSString, cost: Int(image.size.width * image.scale * image.size.height * image.scale * 4))
            if !source.persisted {
                source.persisted = true
                await publicCache.store(bytes, response: source.response, for: url)
            }
            guard scope == api.sessionRevision else { throw CancellationError() }
            return image
        }
        pending[key] = task
        return try await task.value
    }
    private func source(at url: URL, sameOrigin: Bool, scope: Int, key: String) async throws -> Source {
        if let source = sources.object(forKey: key as NSString) { return source }
        if let task = pendingSources[key] { return try await task.value }
        let task = Task { @MainActor in
            defer { pendingSources[key] = nil }
            let source: Source
            if let (bytes, response) = await publicCache.load(url) {
                source = Source(bytes, response, persisted: true)
            } else if sameOrigin {
                let path = String(url.absoluteString.dropFirst(Endpoint.origin.absoluteString.count))
                let (bytes, response) = try await api.response(path)
                source = Source(bytes, response)
            } else {
                let (bytes, response) = try await catalogSession.data(from: url)
                guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw URLError(.badServerResponse) }
                source = Source(bytes, response)
            }
            guard scope == api.sessionRevision else { throw CancellationError() }
            guard source.bytes.count <= 8 * 1024 * 1024 else { throw APIError(status: 0, message: "이미지를 불러오지 못했습니다.") }
            sources.setObject(source, forKey: key as NSString, cost: source.bytes.count)
            return source
        }
        pendingSources[key] = task
        return try await task.value
    }
    nonisolated static func decode(_ bytes: Data, maxPixelSize: Int = 1024) -> UIImage? {
        if let image = SDImageWebPCoder.shared.decodedImage(with: bytes, options: [.decodeFirstFrameOnly: true, .decodeThumbnailPixelSize: CGSize(width: maxPixelSize, height: maxPixelSize)]) { return image }
        guard let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: thumbnail)
    }
}

struct CatalogMotionArtwork: View {
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let url: URL
    @State private var image: SDAnimatedImage?
    var body: some View {
        let enabled = phase == .active && !reduceMotion && !ProcessInfo.processInfo.isLowPowerModeEnabled
        Group {
            if enabled, let image { CatalogMotionView(image: image) } else { Color.clear }
        }.task(id: enabled ? url : nil) {
            image = nil
            guard enabled else { return }
            let loaded = try? await ArtworkRepository.shared.animation(at: url)
            guard !Task.isCancelled else { return }
            image = loaded
        }
    }
}

private struct CatalogMotionView: UIViewRepresentable {
    let image: SDAnimatedImage
    func makeUIView(context: Context) -> SDAnimatedImageView {
        let view = SDAnimatedImageView()
        view.contentMode = .scaleAspectFit
        view.isUserInteractionEnabled = false
        view.maxBufferSize = 1024 * 1024
        return view
    }
    func updateUIView(_ view: SDAnimatedImageView, context: Context) {
        if view.image !== image { view.image = image }
    }
    static func dismantleUIView(_ view: SDAnimatedImageView, coordinator: ()) {
        view.stopAnimating()
        view.image = nil
    }
}

struct RemoteArtwork<Content: View, Placeholder: View>: View {
    @EnvironmentObject private var model: AppModel
    let url: URL?
    var catalog = false
    var maxPixelSize = 1024
    @ViewBuilder var content: (Image) -> Content
    @ViewBuilder var placeholder: () -> Placeholder
    @State private var image: UIImage?
    private var scope: String { "\(model.userID ?? "guest"):\(maxPixelSize):\(url?.absoluteString ?? "")" }
    var body: some View {
        Group {
            if let image { content(Image(uiImage: image)) } else { placeholder() }
        }.task(id: scope) {
            image = nil
            guard let url else { return }
            for attempt in 0..<2 {
                do {
                    let loaded = try await ArtworkRepository.shared.image(at: url, catalog: catalog, maxPixelSize: maxPixelSize)
                    try Task.checkCancellation()
                    image = loaded; return
                } catch is CancellationError { return }
                catch {
                    guard attempt == 0, !Task.isCancelled else { return }
                    do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
                }
            }
        }
    }
}
