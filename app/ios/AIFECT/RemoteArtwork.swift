import SwiftUI
import SDWebImageWebPCoder
import ImageIO

/// Artwork uses the same authenticated, redirect-restricted transport as the API.
/// Only decoded images are cached, in memory and within the current session.
@MainActor final class ArtworkRepository {
    static let shared = ArtworkRepository()
    private let cache = NSCache<NSString, UIImage>()
    private let api: API
    init(api: API? = nil) {
        self.api = api ?? .shared
        cache.totalCostLimit = 32 * 1024 * 1024
        cache.countLimit = 80
    }
    func image(at url: URL) async throws -> UIImage {
        guard url.scheme == "https", url.host == Endpoint.origin.host,
              url.port == nil, url.user == nil, url.password == nil else {
            throw APIError(status: 0, message: "이미지 주소를 확인할 수 없습니다.")
        }
        let scope = api.sessionRevision
        let key = "\(scope):\(url.absoluteString)" as NSString
        if let image = cache.object(forKey: key) { return image }
        let path = String(url.absoluteString.dropFirst(Endpoint.origin.absoluteString.count))
        let bytes = try await api.request(path)
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
                    let loaded = try await ArtworkRepository.shared.image(at: url)
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
