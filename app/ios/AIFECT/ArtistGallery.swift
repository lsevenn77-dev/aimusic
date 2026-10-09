import SwiftUI
import PhotosUI

struct ArtistGalleryPhoto: Identifiable {
    let id: String
    let url: URL
    init?(_ value: [String: Any]) {
        let id = value.string("id")
        guard !id.isEmpty, let url = try? Endpoint.url(value.string("url")),
              url.path == "/media/artist-gallery/\(id)" else { return nil }
        self.id = id; self.url = url
    }
}

struct ArtistGallerySection: View {
    @EnvironmentObject private var model: AppModel
    let artistID: String
    let profile: [String: Any]
    let reload: () async -> Void
    @State private var picked: PhotosPickerItem?
    @State private var enlarged: ArtistGalleryPhoto?
    @State private var removal: ArtistGalleryPhoto?
    @State private var busy = false
    @State private var error: String?
    private var photos: [ArtistGalleryPhoto] { profile.objects("gallery").compactMap(ArtistGalleryPhoto.init) }
    private var canManage: Bool { model.userID != nil && profile.flag("can_manage") }
    private var limit: Int { min(30, max(1, profile.int("gallery_limit") == 0 ? 30 : profile.int("gallery_limit"))) }
    var body: some View {
        Section {
            HStack {
                Text("사진 \(photos.count) / \(limit)").foregroundStyle(.secondary)
                Spacer()
                if canManage { PhotosPicker(selection: $picked, matching: .images) { Label("사진 추가", systemImage: "plus") }.disabled(busy || photos.count >= limit) }
            }
            if photos.isEmpty { Text("아직 등록된 사진이 없습니다.").foregroundStyle(.secondary).padding(.vertical) }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(photos) { photo in
                    VStack(spacing: 6) {
                        Button { enlarged = photo } label: {
                            Color.clear.aspectRatio(1, contentMode: .fit).overlay {
                                RemoteArtwork(url: photo.url) { $0.resizable().scaledToFill() } placeholder: { ZStack { Brand.card; Image(systemName: "photo") } }
                            }.clipShape(RoundedRectangle(cornerRadius: 14))
                        }.buttonStyle(.plain).accessibilityLabel("갤러리 사진 크게 보기")
                        if canManage { Button("사진 삭제", role: .destructive) { removal = photo }.font(.caption).disabled(busy) }
                    }
                }
            }
            if busy { ProgressView("사진을 저장하는 중") }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .onChange(of: picked) { _, item in
            guard let item, let owner = model.userID else { return }
            Task {
                busy = true; defer { busy = false; picked = nil }
                do {
                    guard canManage, photos.count < limit,
                          let raw = try await item.loadTransferable(type: Data.self) else { return }
                    let bytes = try ChatImageEncoder.encode(raw)
                    guard owner == model.userID, !Task.isCancelled else { return }
                    _ = try await API.shared.request("/api/artists/\(Endpoint.pathID(artistID))/gallery", method: "PUT", bytes: bytes, type: "image/webp")
                    guard owner == model.userID else { return }
                    error = nil; await reload()
                } catch { self.error = error.localizedDescription }
            }
        }
        .confirmationDialog("이 사진을 갤러리에서 삭제할까요?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) {
            if let photo = removal {
                Button("사진 삭제", role: .destructive) { Task { await remove(photo) } }
            }
        }
        .sheet(item: $enlarged) { photo in
            NavigationStack {
                RemoteArtwork(url: photo.url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(Brand.background)
                    .navigationTitle("갤러리").navigationBarTitleDisplayMode(.inline)
                    .toolbar { Button("닫기") { enlarged = nil } }
            }
        }
    }
    private func remove(_ photo: ArtistGalleryPhoto) async {
        guard canManage, let owner = model.userID, !busy else { return }
        busy = true; defer { busy = false; removal = nil }
        do {
            _ = try await API.shared.call("/api/artists/\(Endpoint.pathID(artistID))/gallery/\(Endpoint.pathID(photo.id))", method: "DELETE")
            guard owner == model.userID else { return }
            error = nil; await reload()
        } catch { self.error = error.localizedDescription }
    }
}
