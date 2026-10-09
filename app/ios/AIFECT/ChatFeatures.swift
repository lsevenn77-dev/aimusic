import SwiftUI
import PhotosUI
import ImageIO
import SDWebImageWebPCoder

/// The server accepts only WebP for private chat. Downsample before decoding so a
/// full resolution camera image cannot consume unbounded memory; metadata is stripped.
enum ChatImageEncoder {
    static func encode(_ bytes: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1600
              ] as CFDictionary),
              let data = SDImageWebPCoder.shared.encodedData(with: UIImage(cgImage: cgImage), format: .webP,
                  options: [.encodeCompressionQuality: 0.82, .encodeMaxFileSize: 5 * 1024 * 1024]),
              data.count <= 5 * 1024 * 1024 else {
            throw APIError(status: 0, message: "사진을 변환하지 못했습니다. 다른 사진을 선택해주세요.")
        }
        return data
    }
}

struct PendingChatMessage {
    let requestID = UUID().uuidString
    let body: String
    var imageID: String?
    var payload: [String: Any] {
        var value: [String: Any] = ["request_id": requestID, "body": body]
        if let imageID { value["image_id"] = imageID }
        return value
    }
}

/// Apply the server's visibility boundary on every response, including incremental
/// and older-page requests, so cleared messages cannot reappear from local history.
enum ChatHistory {
    static func merge(_ current: [[String: Any]], incoming: [[String: Any]], minimum: Int) -> [[String: Any]] {
        var byID: [String: [String: Any]] = [:]
        for item in current + incoming where item.int("sequence") >= minimum && !item.string("id").isEmpty {
            byID[item.string("id")] = item
        }
        return byID.values.sorted { $0.int("sequence") < $1.int("sequence") }
    }
    static func imageAvailable(_ item: [String: Any], now: Date = Date()) -> Bool {
        !item.string("image_id").isEmpty && item.number("image_expires") > now.timeIntervalSince1970
    }
}

@MainActor final class ChatRoom: ObservableObject {
    let owner: String
    let path: String
    let crew: Bool
    let api: API
    @Published private(set) var messages: [[String: Any]] = []
    @Published private(set) var peer: [String: Any] = [:]
    @Published var text = ""
    @Published private(set) var pending: PendingChatMessage?
    @Published private(set) var busy = false
    @Published private(set) var more = false
    @Published private(set) var muted = false
    @Published var error: String?
    private var boundary: Int?
    private var revision = 0
    private var active = false
    private var loading = false
    var basePath: String { crew ? String(path.dropLast("/messages".count)) : path }
    init(owner: String, path: String, crew: Bool, api: API? = nil) {
        self.owner = owner; self.path = path; self.crew = crew; self.api = api ?? .shared
    }
    func start() { active = true }
    func stop(retainComposition: Bool = false) {
        active = false; revision += 1; messages = []
        // Navigating to gifts must not discard an ambiguous send's request ID.
        if !retainComposition { text = ""; pending = nil }
    }
    private func valid(_ version: Int) -> Bool { active && version == revision && !Task.isCancelled }
    func load(earlier: Bool = false) async {
        guard active, !loading, !busy else { return }
        loading = true; defer { loading = false }
        let version = revision
        let cursor = earlier ? messages.first?.int("sequence") : messages.last?.int("sequence")
        let suffix = cursor.map { "?\(earlier ? "before" : "after")=\($0)" } ?? ""
        do {
            let data = try await api.call(path + suffix)
            guard valid(version) else { return }
            let settings = data.object(crew ? "membership" : "settings")
            let nextBoundary = crew ? settings.int("joined_sequence") : settings.int("cleared_sequence") + 1
            if crew, let boundary, boundary != nextBoundary {
                messages = []; self.boundary = nextBoundary
                ChatCache.remove(owner: owner, path: path)
                return // next poll starts without the previous membership's cursor
            }
            boundary = nextBoundary; muted = settings.flag("muted")
            if !crew { peer = data.object("peer") }
            messages = ChatHistory.merge(messages, incoming: data.objects("messages"), minimum: nextBoundary)
            if earlier || cursor == nil { more = data.flag("has_more") }
            // Private history is restored only by authenticated server reads, never
            // optimistically from disk before block/delete/membership validation.
            ChatCache.write(owner: owner, path: path, messages: messages, boundary: boundary)
            if crew {
                if let last = messages.last { _ = try await api.call(basePath + "/read", method: "POST", body: ["sequence": last.int("sequence")]) }
            } else { _ = try await api.call(path, method: "PATCH", body: [:]) }
            if valid(version) { error = nil }
        } catch {
            guard valid(version) else { return }
            if let status = (error as? APIError)?.status, [401, 403, 404].contains(status) {
                messages = []; pending = nil; text = ""; ChatCache.remove(owner: owner, path: path)
            }
            self.error = error.localizedDescription
        }
    }
    func send() async {
        guard active, !busy else { return }
        if pending == nil {
            let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { return }
            pending = PendingChatMessage(body: body)
        }
        guard let pending else { return }
        let version = revision; busy = true
        do {
            _ = try await api.call(path, method: "POST", body: pending.payload)
            guard valid(version) else { busy = false; return }
            self.pending = nil; if pending.imageID == nil { text = "" }; error = nil
        } catch { if valid(version) { self.error = error.localizedDescription } }
        busy = false
        if valid(version), self.pending == nil { await load() }
    }
    func sendPhoto(_ bytes: Data) async {
        guard active, !crew, !busy, pending == nil else { return }
        let version = revision; busy = true
        do {
            let webp = try await Task.detached(priority: .userInitiated) { try ChatImageEncoder.encode(bytes) }.value
            guard valid(version) else { busy = false; return }
            let result = try await api.request(path + "/images", method: "PUT", bytes: webp, type: "image/webp")
            guard valid(version) else { busy = false; return }
            guard let data = try JSONSerialization.jsonObject(with: result) as? [String: Any], !data.string("id").isEmpty else { throw URLError(.badServerResponse) }
            pending = PendingChatMessage(body: "사진", imageID: data.string("id"))
            busy = false; await send()
        } catch { busy = false; if valid(version) { self.error = error.localizedDescription } }
    }
    func toggleMute() async {
        guard active, !busy else { return }
        revision += 1; let version = revision; busy = true; defer { busy = false }
        do {
            let data = try await api.call(basePath + "/settings", method: "PUT", body: ["muted": !muted])
            if valid(version) { muted = data.flag("muted"); error = nil }
        } catch { if valid(version) { self.error = error.localizedDescription } }
    }
    func clear() async {
        guard active, !crew, !busy else { return }
        revision += 1; let version = revision; busy = true; defer { busy = false }
        do {
            _ = try await api.call(path, method: "DELETE")
            guard valid(version) else { return }
            messages = []; pending = nil; text = ""; more = false; boundary = nil
            ChatCache.remove(owner: owner, path: path); error = nil
        } catch { if valid(version) { self.error = error.localizedDescription } }
    }
}

/// Uses the account-scoped ephemeral API session. Photos never enter URLCache or
/// an image library's disk cache. The expiry is also enforced while a room is open.
struct PrivateChatPhoto: View {
    let item: [String: Any]
    let owner: String
    @EnvironmentObject private var model: AppModel
    @State private var image: UIImage?
    @State private var unavailable = false
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Group {
                if !ChatHistory.imageAvailable(item, now: context.date) { Label("보관 기간이 지난 사진", systemImage: "photo.badge.exclamationmark") }
                else if let image, model.userID == owner { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 260) }
                else if unavailable { Label("사진을 불러올 수 없어요", systemImage: "photo") }
                else { ProgressView("사진 불러오는 중") }
            }.font(.caption).frame(maxWidth: 260).clipShape(RoundedRectangle(cornerRadius: 12))
        }.task(id: owner + ":" + item.string("image_id")) {
            image = nil; unavailable = false
            guard model.userID == owner, ChatHistory.imageAvailable(item) else { return }
            do {
                let bytes = try await API.shared.request("/media/dm/" + Endpoint.pathID(item.string("image_id")))
                guard model.userID == owner, !Task.isCancelled, ChatHistory.imageAvailable(item) else { return }
                image = UIImage(data: bytes); unavailable = image == nil
            } catch { if !Task.isCancelled { unavailable = true } }
        }.onDisappear { image = nil }
    }
}

struct ChatPage: View {
    @EnvironmentObject var model: AppModel
    let path: String
    let title: String
    let crew: Bool
    var body: some View {
        Group {
            if let owner = model.userID { ChatRoomView(owner: owner, path: path, title: title, crew: crew).id(owner + path) }
            else { LoginPrompt(title: "로그인하고 대화하기") }
        }
    }
}
private struct ChatRoomView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var room: ChatRoom
    let title: String
    @State private var photo: PhotosPickerItem?
    @State private var clearConfirmation = false
    @State private var blocking: String?
    @FocusState private var composing: Bool
    init(owner: String, path: String, title: String, crew: Bool) {
        self.title = title; _room = StateObject(wrappedValue: ChatRoom(owner: owner, path: path, crew: crew))
    }
    private var displayTitle: String { room.crew ? title : room.peer.displayName(fallback: title) }
    var body: some View {
        VStack(spacing: 0) {
            List {
                if room.more { Button("이전 대화 보기") { Task { await room.load(earlier: true) } } }
                ForEach(room.messages, id: \.selfID) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.displayName(fallback: item.string("sender_id") == model.userID ? "나" : displayTitle)).font(.caption).foregroundStyle(Brand.aqua)
                        Group {
                            if !item.string("image_id").isEmpty { PrivateChatPhoto(item: item, owner: room.owner).id(item.string("id")) }
                            else { Text(item.string("body")).textSelection(.enabled) }
                        }.padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
                    }.contextMenu {
                        let sender = item.string(room.crew ? "user_id" : "sender_id")
                        if !sender.isEmpty && sender != model.userID { Button("이용자 차단", role: .destructive) { blocking = sender } }
                    }.listRowSeparator(.hidden).frame(maxWidth: .infinity, alignment: item.string(room.crew ? "user_id" : "sender_id") == model.userID ? .trailing : .leading)
                }
            }
            if let error = room.error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
            if !room.crew { Text("사진은 전송 후 14일 동안 보관됩니다.").font(.caption2).foregroundStyle(.secondary) }
            HStack {
                if !room.crew {
                    PhotosPicker(selection: $photo, matching: .images) { Image(systemName: "photo").frame(width: 36, height: 44) }.disabled(room.busy || room.pending != nil).accessibilityLabel("사진 보내기")
                }
                TextField("메시지", text: $room.text, axis: .vertical).lineLimit(1...5).textFieldStyle(.roundedBorder).focused($composing).disabled(room.pending != nil || room.busy)
                Button(room.pending == nil ? "전송" : "재시도") {
                    composing = false
                    Task { await Task.yield(); await room.send(); await model.refreshInbox() }
                }.disabled(room.busy || (room.pending == nil && room.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }.padding()
        }.navigationTitle(displayTitle).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button(room.muted ? "대화 알림 켜기" : "대화 알림 끄기", systemImage: room.muted ? "bell" : "bell.slash") { Task { await room.toggleMute(); await model.refreshInbox() } }
                if !room.crew {
                    NavigationLink { GiftWalletView(person: GiftRecipient(id: String(room.path.split(separator: "/").last ?? ""), name: displayTitle)) } label: { Label("개인 선물 보내기", systemImage: "gift") }
                    Button("내 대화 삭제", role: .destructive) { clearConfirmation = true }
                }
            } label: { Image(systemName: room.muted ? "bell.slash" : "ellipsis.circle") }.disabled(room.busy).accessibilityLabel("대화 설정")
        } }
        .confirmationDialog("내 대화를 삭제할까요?", isPresented: $clearConfirmation, titleVisibility: .visible) {
            Button("내 대화 삭제", role: .destructive) { Task { await room.clear(); await model.refreshInbox() } }
        } message: { Text("내 목록과 기록에서 삭제합니다. 상대방의 대화는 유지되며 새 메시지는 다시 표시됩니다.") }
        .confirmationDialog("이 이용자를 차단할까요?", isPresented: Binding(get: { blocking != nil }, set: { if !$0 { blocking = nil } }), titleVisibility: .visible) {
            Button("차단", role: .destructive) { if let id = blocking { Task { do {
                room.stop()
                _ = try await API.shared.call("/api/blocks/\(Endpoint.pathID(id))", method: "PUT", body: [:])
                ChatCache.removeAll(owner: room.owner); model.player.close()
                room.start(); await room.load(); await model.refreshInbox()
            } catch { room.error = error.localizedDescription; room.start() } } }; blocking = nil }
        }
        .task(id: photo) {
            guard let photo else { return }
            do { if let bytes = try await photo.loadTransferable(type: Data.self) { await room.sendPhoto(bytes); await model.refreshInbox() } }
            catch { if !Task.isCancelled { room.error = error.localizedDescription } }
            self.photo = nil
        }
        .task(id: scenePhase) {
            guard scenePhase == .active, model.userID == room.owner else { room.stop(retainComposition: true); return }
            room.start(); defer { room.stop(retainComposition: true) }
            while !Task.isCancelled {
                await room.load(); await model.refreshInbox()
                do { try await Task.sleep(for: .seconds(4)) } catch { break }
            }
        }
    }
}
