import SwiftUI
import SDWebImageWebPCoder
import ImageIO

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

/// Private media uses the authenticated API. Public catalog hosts use a separate anonymous session.
/// Only decoded images are cached, in memory and within the current session.
@MainActor final class ArtworkRepository {
    static let shared = ArtworkRepository()
    private let cache = NSCache<NSString, UIImage>()
    private let api: API
    private lazy var catalogSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.timeoutIntervalForRequest = 25
        return URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }()
    init(api: API? = nil) {
        self.api = api ?? .shared
        cache.totalCostLimit = 32 * 1024 * 1024
        cache.countLimit = 80
    }
    func image(at url: URL, catalog: Bool = false) async throws -> UIImage {
        let sameOrigin = url.scheme == "https" && url.host == Endpoint.origin.host && url.port == nil && url.user == nil && url.password == nil
        guard sameOrigin || (catalog && CatalogArtwork.url(url.absoluteString) != nil) else {
            throw APIError(status: 0, message: "이미지 주소를 확인할 수 없습니다.")
        }
        let scope = api.sessionRevision
        let key = "\(scope):\(url.absoluteString)" as NSString
        if let image = cache.object(forKey: key) { return image }
        let bytes: Data
        if sameOrigin {
            let path = String(url.absoluteString.dropFirst(Endpoint.origin.absoluteString.count))
            bytes = try await api.request(path)
        } else {
            let (data, response) = try await catalogSession.data(from: url)
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw URLError(.badServerResponse) }
            bytes = data
        }
        guard scope == api.sessionRevision else { throw CancellationError() }
        guard bytes.count <= 8 * 1024 * 1024,
              let image = Self.decode(bytes) else {
            throw APIError(status: 0, message: "이미지를 불러오지 못했습니다.")
        }
        cache.setObject(image, forKey: key, cost: Int(image.size.width * image.scale * image.size.height * image.scale * 4))
        return image
    }
    static func decode(_ bytes: Data) -> UIImage? {
        if let image = SDImageWebPCoder.shared.decodedImage(with: bytes, options: [.decodeFirstFrameOnly: true, .decodeThumbnailPixelSize: CGSize(width: 1600, height: 1600)]) { return image }
        guard let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1600
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: thumbnail)
    }
}

struct RemoteArtwork<Content: View, Placeholder: View>: View {
    @EnvironmentObject private var model: AppModel
    let url: URL?
    var catalog = false
    @ViewBuilder var content: (Image) -> Content
    @ViewBuilder var placeholder: () -> Placeholder
    @State private var image: UIImage?
    private var scope: String { "\(model.userID ?? "guest"):\(url?.absoluteString ?? "")" }
    var body: some View {
        Group {
            if let image { content(Image(uiImage: image)) } else { placeholder() }
        }.task(id: scope) {
            image = nil
            guard let url else { return }
            for attempt in 0..<2 {
                do {
                    let loaded = try await ArtworkRepository.shared.image(at: url, catalog: catalog)
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
