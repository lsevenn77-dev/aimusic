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
    private var readSequence = -1
    @Published private(set) var loaded = false
    @Published private(set) var unavailable = false
    var basePath: String { crew ? String(path.dropLast("/messages".count)) : path }
    init(owner: String, path: String, crew: Bool, api: API? = nil) {
        self.owner = owner; self.path = path; self.crew = crew; self.api = api ?? .shared
    }
    func start() { active = true; unavailable = false }
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
            boundary = nextBoundary; loaded = true; muted = settings.flag("muted")
            if !crew { peer = data.object("peer") }
            messages = ChatHistory.merge(messages, incoming: data.objects("messages"), minimum: nextBoundary)
            if earlier || cursor == nil { more = data.flag("has_more") }
            // Private history is restored only by authenticated server reads, never
            // optimistically from disk before block/delete/membership validation.
            ChatCache.write(owner: owner, path: path, messages: messages, boundary: boundary)
            let latest = messages.last?.int("sequence") ?? 0
            if latest > readSequence {
                if crew { _ = try await api.call(basePath + "/read", method: "POST", body: ["sequence": latest]) }
                else { _ = try await api.call(path, method: "PATCH", body: [:]) }
                if valid(version) { readSequence = latest }
            }
            if valid(version) { error = nil }
        } catch {
            guard valid(version) else { return }
            if let status = (error as? APIError)?.status, [401, 403, 404].contains(status) {
                unavailable = true; messages = []; pending = nil; text = ""; ChatCache.remove(owner: owner, path: path)
            }
            self.error = error.localizedDescription
        }
    }
    func watch() async {
        var failures = 0
        let target = crew ? String(basePath.split(separator: "/").last ?? "") : String(path.split(separator: "/").last ?? "")
        let query = "?\(crew ? "crew" : "peer")=\(Endpoint.query(target))"
        while active && !Task.isCancelled {
            do {
                try await api.chatEvents(query: query) { [weak self] in await self?.load() }
                failures = 0
                try await Task.sleep(for: .milliseconds(250))
            } catch is CancellationError { return }
            catch {
                if Task.isCancelled { return }
                if let status = (error as? APIError)?.status, [401, 403, 404].contains(status) {
                    stop(); unavailable = true; self.error = error.localizedDescription; return
                }
                // The authenticated history endpoint remains the fallback when an
                // intermediary cannot stream. No raw connection notices in chat.
                await load(); failures += 1
                do { try await Task.sleep(for: .seconds(min(15, max(1, failures * 2)))) } catch { return }
            }
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
            let result = try await api.call(path, method: "POST", body: pending.payload)
            guard valid(version) else { busy = false; return }
            let sent = result.object("message")
            if !sent.string("id").isEmpty { messages = ChatHistory.merge(messages, incoming: [sent], minimum: boundary ?? 0) }
            self.pending = nil; if pending.imageID == nil && text.trimmingCharacters(in: .whitespacesAndNewlines) == pending.body { text = "" }; error = nil
        } catch { if valid(version) { self.error = error.localizedDescription } }
        busy = false
        if valid(version), self.pending == nil { await load() }
    }
    func sendPhoto(_ bytes: Data) async {
        guard active, !busy, pending == nil else { return }
        let version = revision; busy = true
        do {
            let webp = try await Task.detached(priority: .userInitiated) { try ChatImageEncoder.encode(bytes) }.value
            guard valid(version) else { busy = false; return }
            let result = try await api.request(basePath + "/images", method: "PUT", bytes: webp, type: "image/webp")
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
    var crew = false
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
                let bytes = try await API.shared.request((crew ? "/media/crew-chat/" : "/media/dm/") + Endpoint.pathID(item.string("image_id")))
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
struct ChatScrollPolicy {
    private(set) var followsLatest = true
    mutating func userScrolled(distanceFromBottom: CGFloat) { followsLatest = distanceFromBottom < 100 }
    mutating func sentMessage() { followsLatest = true }
}
private struct ChatLayout: Equatable {
    var height: CGFloat
    var bottom: CGFloat
}
private struct ChatLayoutKey: PreferenceKey {
    static var defaultValue: ChatLayout? = nil
    static func reduce(value: inout ChatLayout?, nextValue: () -> ChatLayout?) { value = nextValue() ?? value }
}

private struct ChatRoomView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var room: ChatRoom
    let title: String
    @State private var photo: PhotosPickerItem?
    @State private var stickerPicker = false
    @State private var stickerInsertion: String?
    @State private var clearConfirmation = false
    @State private var blocking: String?
    @FocusState private var composing: Bool
    @State private var stickerFocused = false
    @State private var chatToken = UUID()
    @State private var scrollPolicy = ChatScrollPolicy()
    @State private var userScrolling = false
    @State private var layout: ChatLayout?
    init(owner: String, path: String, title: String, crew: Bool) {
        self.title = title; _room = StateObject(wrappedValue: ChatRoom(owner: owner, path: path, crew: crew))
    }
    private var displayTitle: String { room.crew ? title : room.peer.displayName(fallback: title) }
    private var peerID: String { String(room.path.split(separator: "/").last ?? "") }
    var body: some View {
        ScrollViewReader { proxy in
          GeometryReader { viewport in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 6) {
                    if room.more { Button("이전 대화 보기") { Task {
                        let anchor = room.messages.first?.string("id")
                        scrollPolicy.userScrolled(distanceFromBottom: .greatestFiniteMagnitude)
                        await room.load(earlier: true)
                        if let anchor { proxy.scrollTo(anchor, anchor: .top) }
                    } }.frame(maxWidth: .infinity) }
                    if !room.loaded && room.messages.isEmpty { ProgressView().padding().frame(maxWidth: .infinity) }
                    ForEach(Array(room.messages.enumerated()), id: \.element.selfID) { index, item in
                        messageRow(item, showName: index == 0 || sender(room.messages[index - 1]) != sender(item))
                            .id(item.string("id"))
                    }
                    if let pending = room.pending, !room.messages.contains(where: { $0.string("request_id") == pending.requestID }) {
                        VStack(alignment: .trailing, spacing: 3) {
                            ChatStickerText(bodyText: pending.body).padding(12).background(Brand.aqua.opacity(0.22), in: RoundedRectangle(cornerRadius: 18))
                            HStack(spacing: 6) {
                                if room.busy { ProgressView().controlSize(.mini); Text("전송 중") }
                                else { Button("전송되지 않음 · 다시 보내기") { Task { await room.send() } } }
                            }.font(.caption2).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity, alignment: .trailing).id("pending")
                    }
                    if room.error != nil && room.messages.isEmpty && room.pending == nil {
                        if room.unavailable { Text("대화 권한이 변경됐어요. 목록으로 돌아가 다시 확인해주세요.").font(.caption).foregroundStyle(.secondary) }
                        else { Button("대화 다시 불러오기") { Task { await room.load() } }.font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity) }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }.padding(.horizontal, 16).padding(.vertical, 12)
                    .frame(minHeight: viewport.size.height, alignment: .bottom)
                    .background(GeometryReader { content in
                        Color.clear.preference(key: ChatLayoutKey.self, value: ChatLayout(height: content.size.height, bottom: content.frame(in: .named("chat-viewport")).maxY))
                    })
            }.coordinateSpace(name: "chat-viewport").scrollDismissesKeyboard(.interactively).accessibilityIdentifier("chat-history")
                .simultaneousGesture(DragGesture(minimumDistance: 3).onChanged { _ in userScrolling = true }.onEnded { _ in
                    if let layout { scrollPolicy.userScrolled(distanceFromBottom: layout.bottom - viewport.size.height) }
                })
                .onPreferenceChange(ChatLayoutKey.self) { value in
                    guard let value else { return }
                    let resized = layout?.height != value.height
                    if !resized && userScrolling { scrollPolicy.userScrolled(distanceFromBottom: value.bottom - viewport.size.height) }
                    layout = value
                    if resized && scrollPolicy.followsLatest { proxy.scrollTo("bottom", anchor: .bottom) }
                }
                .onChange(of: viewport.size.height) { _, _ in if scrollPolicy.followsLatest { userScrolling = false; proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: room.messages.last?.string("id")) { _, _ in if scrollPolicy.followsLatest { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: room.pending?.requestID) { _, value in if value != nil { scrollPolicy.sentMessage(); userScrolling = false; proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: composing) { _, focused in if focused && scrollPolicy.followsLatest { userScrolling = false; proxy.scrollTo("bottom", anchor: .bottom) } }
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidChangeFrameNotification)) { _ in
                    if (composing || stickerFocused) && scrollPolicy.followsLatest { proxy.scrollTo("bottom", anchor: .bottom) }
                }
                .onChange(of: stickerFocused) { _, focused in if focused && scrollPolicy.followsLatest { userScrolling = false; proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: room.text) { _, _ in if (composing || stickerFocused) && scrollPolicy.followsLatest { proxy.scrollTo("bottom", anchor: .bottom) } }
          }
        }.background(Brand.background)
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .onAppear { model.visibleChats.insert(chatToken) }
        .onDisappear { model.visibleChats.remove(chatToken) }
        .navigationTitle(displayTitle).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !room.crew {
                ToolbarItem(placement: .principal) {
                    NavigationLink { ProfilePage(id: peerID).streamingPage() } label: {
                        HStack(spacing: 8) {
                            ProfilePhoto(person: room.peer.merging(["id": peerID, "name": displayTitle]) { _, value in value }, size: 32, showsLevel: false)
                            Text(displayTitle).font(.system(size: 17, weight: .semibold)).lineLimit(1)
                        }
                    }.buttonStyle(.plain).accessibilityLabel(displayTitle + " 프로필")
                }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if !room.crew {
                    Button(model.followedProducers.contains(peerID) ? "팔로잉" : "팔로우") { Task { await model.toggleFollow(peerID) } }.font(.system(size: 12)).accessibilityIdentifier("dm-peer-follow")
                }
                Menu {
                    Button(room.muted ? "대화 알림 켜기" : "대화 알림 끄기", systemImage: room.muted ? "bell" : "bell.slash") { Task { await room.toggleMute(); await model.refreshInbox() } }
                    if !room.crew {
                        NavigationLink { GiftWalletView(person: GiftRecipient(id: peerID, name: displayTitle)) } label: { Label("개인 선물 보내기", systemImage: "gift") }
                        Button("이 대화방 내용 전체 삭제", systemImage: "trash", role: .destructive) { clearConfirmation = true }
                        if !room.peer.string("user_id").isEmpty { Button("이 이용자 차단", role: .destructive) { blocking = room.peer.string("user_id") } }
                    }
                } label: { Image(systemName: room.muted ? "bell.slash" : "ellipsis.circle") }.disabled(room.busy).accessibilityLabel("대화 설정")
            }
        }.task { if !room.crew { await model.loadFollows() } }
        .confirmationDialog("이 대화방의 내용을 전부 삭제할까요?", isPresented: $clearConfirmation, titleVisibility: .visible) {
            Button("내용 전체 삭제", role: .destructive) { Task { await room.clear(); await model.refreshInbox() } }
        } message: { Text("내 화면의 이전 메시지와 사진이 모두 사라집니다. 상대방의 기록과 다른 대화방은 유지되며, 새 메시지는 계속 받을 수 있어요.") }
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
            await room.load()
            await room.watch()
        }
    }
    private var composer: some View {
        VStack(spacing: 6) {
            if stickerPicker && !room.crew { ChatStickerPicker { token in stickerInsertion = token; stickerPicker = false } }
            HStack(spacing: 10) {
                PhotosPicker(selection: $photo, matching: .images) { Image(systemName: "photo").frame(width: 44, height: 40) }.disabled(room.busy || room.pending != nil).accessibilityLabel("사진 보내기")
                if !room.crew {
                    NavigationLink { GiftWalletView(person: GiftRecipient(id: String(room.path.split(separator: "/").last ?? ""), name: displayTitle)) } label: { Image(systemName: "gift").foregroundStyle(Brand.pink).frame(width: 44, height: 40) }.accessibilityLabel("선물 보내기")
                }
                Text("사진은 서버에 14일 동안 보관돼요.").font(.system(size: 11)).foregroundStyle(AifectDesign.muted).frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(alignment: .bottom, spacing: 8) {
                if !room.crew {
                    Button { stickerPicker.toggle(); if stickerPicker { stickerFocused = false } } label: { Image(systemName: "face.smiling").frame(width: 44, height: 44) }.accessibilityLabel(stickerPicker ? "이모티콘 닫기" : "이모티콘").accessibilityIdentifier("chat-sticker-toggle")
                    ChatStickerInput(text: $room.text, insertion: $stickerInsertion, focused: $stickerFocused) { sendMessage() }
                        .overlay(alignment: .leading) { if room.text.isEmpty { Text("메시지 입력").font(.system(size: 15)).foregroundStyle(AifectDesign.muted).padding(.leading, 14).allowsHitTesting(false) } }
                        .background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                } else {
                    TextField("메시지 입력", text: $room.text, axis: .vertical).lineLimit(1...4)
                        .padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 18)).focused($composing).accessibilityIdentifier("chat-input")
                }
                Button { sendMessage() } label: {
                    Text(room.pending != nil && !room.busy ? "재시도" : "보내기").font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(minHeight: 48)
                        .foregroundStyle(Brand.background).background(LinearGradient(colors: [Brand.pink, Brand.aqua], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 16))
                }.disabled(room.busy || (room.pending == nil && (room.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || room.text.count > 2000)))
                    .accessibilityLabel(room.pending != nil ? "메시지 다시 보내기" : "메시지 보내기").accessibilityIdentifier("chat-send")
            }
        }.padding(.horizontal, 14).padding(.vertical, 8).background(Brand.background).disabled(room.unavailable)
    }
    private func sendMessage() {
        guard !room.busy, room.text.count <= 2000 else { return }
        stickerPicker = false; Task { await room.send(); await model.refreshInbox() }
    }
    private func sender(_ item: [String: Any]) -> String { item.string(room.crew ? "user_id" : "sender_id") }
    @ViewBuilder private func messageRow(_ item: [String: Any], showName: Bool) -> some View {
        let mine = sender(item) == room.owner
        if item.string("kind") == "system" {
            Text(item.string("body")).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 8)
        } else {
            HStack(alignment: .bottom, spacing: 6) {
                if mine { Spacer(minLength: 12); messageTime(item) }
                if !mine {
                    if showName {
                        let person = chatPerson(item)
                        if !person.string("id").isEmpty {
                            NavigationLink { ProfilePage(id: person.string("id")) } label: { ProfilePhoto(person: person, size: 32, showsLevel: false).padding(4) }.buttonStyle(.plain)
                        } else { ProfilePhoto(person: person, size: 32, showsLevel: false).padding(4) }
                    } else { Color.clear.frame(width: 40, height: 1) }
                }
                VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
                    if !mine && room.crew && showName { Text(item.displayName(fallback: displayTitle)).font(.caption2).foregroundStyle(.secondary).padding(.top, 8) }
                    Group {
                        if !item.string("image_id").isEmpty { PrivateChatPhoto(item: item, owner: room.owner, crew: room.crew) }
                        else if !room.crew && SiteWorkspace.validKey(item.object("shared_track").selfID) {
                            let work = item.object("shared_track")
                            if work.string("kind") == "dubbing",
                               let destination = SiteWorkspace(area: "dubbing", key: work.selfID, title: work.string("title")) {
                                NavigationLink { DubbingProjectPage(space: destination) } label: {
                                    Label(work.string("title"), systemImage: "theatermasks")
                                }.buttonStyle(.plain)
                            } else {
                                NavigationLink { OriginalSongPage(id: work.selfID) } label: {
                                    Label(work.string("title"), systemImage: "music.note")
                                }.buttonStyle(.plain)
                            }
                        }
                        else { ChatStickerText(bodyText: item.string("body")) }
                    }.padding(.horizontal, 13).padding(.vertical, 9)
                        .background(mine ? Brand.aqua.opacity(0.22) : Brand.card, in: RoundedRectangle(cornerRadius: 17))
                }
                if !mine { messageTime(item); Spacer(minLength: 12) }
            }.contextMenu {
                if !mine && !sender(item).isEmpty { Button("이용자 차단", role: .destructive) { blocking = sender(item) } }
            }
        }
    }
    @ViewBuilder private func messageTime(_ item: [String: Any]) -> some View {
        if item.number("created") > 0 {
            Text(Date(timeIntervalSince1970: item.number("created")), style: .time)
                .font(.system(size: 10)).foregroundStyle(.secondary).fixedSize().padding(.bottom, 3)
        }
    }
    private func chatPerson(_ item: [String: Any]) -> [String: Any] {
        if !room.crew { return room.peer }
        var person = item; person["id"] = item.string("profile_id"); return person
    }
}


struct ChatSticker: Identifiable {
    let key: String
    let label: String
    let group: String
    let version: String
    var id: String { key }
    var token: String { "[aifect:" + key + "]" }
    var path: String { "/assets/chat-stickers/\(version)/\(group)/\(key).webp" }
    // Shared catalogue from Android's room_stickers.json; unknown tags stay literal.
    static let all: [ChatSticker] = [
        .init(key: "cat_basic_laugh", label: "웃음", group: "basic", version: "v1"),
        .init(key: "cat_basic_excited", label: "신남", group: "basic", version: "v1"),
        .init(key: "cat_basic_love", label: "사랑", group: "basic", version: "v1"),
        .init(key: "cat_basic_lol", label: "폭소", group: "basic", version: "v1"),
        .init(key: "cat_basic_heart", label: "하트", group: "basic", version: "v1"),
        .init(key: "cat_basic_smile", label: "방긋", group: "basic", version: "v1"),
        .init(key: "cat_basic_surprised", label: "놀람", group: "basic", version: "v1"),
        .init(key: "cat_basic_cool", label: "멋짐", group: "basic", version: "v1"),
        .init(key: "cat_basic_sleep", label: "잠자기", group: "basic", version: "v1"),
        .init(key: "cat_basic_teary", label: "울먹", group: "basic", version: "v1"),
        .init(key: "cat_basic_curious", label: "궁금", group: "basic", version: "v1"),
        .init(key: "cat_basic_touched", label: "감동", group: "basic", version: "v1"),
        .init(key: "cat_basic_cry", label: "눈물", group: "basic", version: "v1"),
        .init(key: "cat_basic_angry", label: "화남", group: "basic", version: "v1"),
        .init(key: "cat_basic_furious", label: "분노", group: "basic", version: "v1"),
        .init(key: "cat_basic_amazed", label: "감탄", group: "basic", version: "v1"),
        .init(key: "cat_basic_dizzy", label: "어지러움", group: "basic", version: "v1"),
        .init(key: "cat_basic_gloomy", label: "시무룩", group: "basic", version: "v1"),
        .init(key: "cat_basic_playful", label: "장난", group: "basic", version: "v1"),
        .init(key: "cat_basic_grin", label: "활짝", group: "basic", version: "v1"),
        .init(key: "cat_basic_wink", label: "윙크", group: "basic", version: "v1"),
        .init(key: "cat_basic_joy", label: "기쁨", group: "basic", version: "v1"),
        .init(key: "cat_basic_cheer", label: "응원", group: "basic", version: "v1"),
        .init(key: "cat_basic_party", label: "축하", group: "basic", version: "v1"),
        .init(key: "cat_basic_happy", label: "행복", group: "basic", version: "v1"),
        .init(key: "cat_basic_hehe", label: "헤헷", group: "basic", version: "v1"),
        .init(key: "cat_basic_shy", label: "부끄", group: "basic", version: "v1"),
        .init(key: "cat_basic_clap", label: "박수", group: "basic", version: "v1"),
        .init(key: "cat_basic_sing", label: "노래", group: "basic", version: "v1"),
        .init(key: "cat_basic_hello", label: "안녕", group: "basic", version: "v1"),
        .init(key: "cat_basic_thumbsup", label: "따봉", group: "basic", version: "v1"),
        .init(key: "cat_basic_like", label: "좋아", group: "basic", version: "v1"),
        .init(key: "cat_basic_thanks", label: "고마워", group: "basic", version: "v1"),
        .init(key: "cat_hand_thumbsup", label: "따봉", group: "hand", version: "v1"),
        .init(key: "cat_hand_ok", label: "오케이", group: "hand", version: "v1"),
        .init(key: "cat_hand_clap", label: "박수", group: "hand", version: "v1"),
        .init(key: "cat_hand_wave", label: "손인사", group: "hand", version: "v1"),
        .init(key: "cat_hand_finger_heart", label: "하트", group: "hand", version: "v1"),
        .init(key: "cat_hand_heart", label: "하트손", group: "hand", version: "v1"),
        .init(key: "cat_hand_peace", label: "브이", group: "hand", version: "v1"),
        .init(key: "cat_hand_fighting", label: "파이팅", group: "hand", version: "v1"),
        .init(key: "cat_hand_thanks", label: "감사", group: "hand", version: "v1"),
        .init(key: "cat_text_gamdong", label: "감동", group: "text", version: "v2"),
        .init(key: "cat_text_meotjyeo", label: "멋져~", group: "text", version: "v2"),
        .init(key: "cat_text_onepick", label: "원픽", group: "text", version: "v2"),
        .init(key: "cat_text_best", label: "최고", group: "text", version: "v3"),
        .init(key: "cat_text_gutsong", label: "굿송!", group: "text", version: "v2"),
        .init(key: "cat_text_nice", label: "Nice", group: "text", version: "v2"),
        .init(key: "cat_text_wow", label: "Wow!", group: "text", version: "v2"),
        .init(key: "cat_text_wa", label: "와~!", group: "text", version: "v2"),
        .init(key: "cat_prop_heart", label: "하트", group: "prop", version: "v1"),
        .init(key: "cat_prop_blue_heart", label: "하트(블루)", group: "prop", version: "v1"),
        .init(key: "cat_prop_star", label: "별", group: "prop", version: "v1"),
        .init(key: "cat_prop_shooting_star", label: "유성", group: "prop", version: "v1"),
        .init(key: "cat_prop_moon", label: "달", group: "prop", version: "v1"),
        .init(key: "cat_prop_sun", label: "해", group: "prop", version: "v1"),
        .init(key: "cat_prop_cloud", label: "구름", group: "prop", version: "v1"),
        .init(key: "cat_prop_snowflake", label: "눈꽃", group: "prop", version: "v1"),
        .init(key: "cat_prop_note", label: "음표", group: "prop", version: "v1"),
        .init(key: "cat_prop_sparkle", label: "반짝", group: "prop", version: "v1"),
        .init(key: "cat_prop_exclaim", label: "느낌표", group: "prop", version: "v1"),
        .init(key: "cat_prop_confetti", label: "폭죽", group: "prop", version: "v1"),
        .init(key: "cat_prop_cake", label: "케이크", group: "prop", version: "v1"),
        .init(key: "cat_prop_gift", label: "선물", group: "prop", version: "v1"),
        .init(key: "cat_prop_crown", label: "왕관", group: "prop", version: "v1"),
    ]
    static let pattern = try! NSRegularExpression(pattern: "\\[aifect:([a-z0-9_]+)\\]")
    static func parts(_ body: String) -> [(String, ChatSticker?)] {
        let source = body as NSString; var cursor = 0; var result: [(String, ChatSticker?)] = []
        for match in pattern.matches(in: body, range: NSRange(location: 0, length: source.length)) {
            if match.range.location > cursor { result.append((source.substring(with: NSRange(location: cursor, length: match.range.location - cursor)), nil)) }
            let sticker = all.first { $0.key == source.substring(with: match.range(at: 1)) }
            result.append((source.substring(with: match.range), sticker)); cursor = NSMaxRange(match.range)
        }
        if cursor < source.length { result.append((source.substring(from: cursor), nil)) }
        return result
    }
    static func preview(_ body: String) -> String { parts(body).map { text, sticker in sticker.map { "[" + $0.label + "]" } ?? text }.joined() }
}

private struct ChatStickerPicker: View {
    let insert: (String) -> Void
    @State private var group = "basic"
    var body: some View {
        VStack(spacing: 6) {
            HStack {
                ForEach([("basic", "표정"), ("hand", "손짓"), ("text", "텍스트"), ("prop", "효과")], id: \.0) { item in
                    Button(item.1) { group = item.0 }.foregroundStyle(group == item.0 ? Brand.aqua : AifectDesign.muted).frame(maxWidth: .infinity, minHeight: 44)
                }
            }
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 46), spacing: 0)], spacing: 0) {
                    ForEach(ChatSticker.all.filter { $0.group == group }) { sticker in
                        Button { insert(sticker.token) } label: {
                            RemoteArtwork(url: try? Endpoint.url(sticker.path)) { $0.resizable().scaledToFit() } placeholder: { Text(sticker.label).font(.system(size: 10)) }.frame(width: 28, height: 28).frame(maxWidth: .infinity, minHeight: 46)
                        }.buttonStyle(.plain).accessibilityLabel(sticker.label)
                    }
                }
            }.frame(maxHeight: 190)
        }.padding(6).background(Brand.card, in: RoundedRectangle(cornerRadius: 18)).accessibilityIdentifier("chat-sticker-picker")
    }
}

struct ChatStickerText: View {
    let bodyText: String
    @State private var images: [String: UIImage] = [:]
    var body: some View {
        ChatSticker.parts(bodyText).reduce(Text("")) { output, part in
            if let sticker = part.1 {
                if let image = images[sticker.key] { return output + Text(Image(uiImage: image)).baselineOffset(-6) }
                return output + Text("[" + sticker.label + "]")
            }
            return output + Text(part.0)
        }.font(.system(size: 15)).textSelection(.enabled).accessibilityLabel(ChatSticker.preview(bodyText))
            .task(id: bodyText) {
                for (_, sticker) in ChatSticker.parts(bodyText) {
                    guard let sticker, images[sticker.key] == nil else { continue }
                    if let bytes = try? await API.shared.request(sticker.path), let source = ArtworkRepository.decode(bytes), !Task.isCancelled {
                        images[sticker.key] = UIGraphicsImageRenderer(size: CGSize(width: 30, height: 30)).image { _ in source.draw(in: CGRect(x: 0, y: 0, width: 30, height: 30)) }
                    }
                }
            }
    }
}

private final class ChatStickerAttachment: NSTextAttachment {
    var token = ""
}

private final class ChatStickerTextView: UITextView {
    override func deleteBackward() {
        let selection = selectedRange
        let range = selection.length > 0 ? selection : NSRange(location: max(0, selection.location - 1), length: selection.location > 0 ? 1 : 0)
        if range.length > 0, NSMaxRange(range) <= textStorage.length,
           textStorage.attribute(.attachment, at: range.location, effectiveRange: nil) is ChatStickerAttachment {
            textStorage.deleteCharacters(in: range)
            selectedRange = NSRange(location: range.location, length: 0)
            delegate?.textViewDidChange?(self)
            return
        }
        super.deleteBackward()
    }
}

private struct ChatStickerInput: UIViewRepresentable {
    @Binding var text: String
    @Binding var insertion: String?
    @Binding var focused: Bool
    let send: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UITextView {
        let view = ChatStickerTextView(); view.delegate = context.coordinator; view.backgroundColor = .clear
        view.textColor = .white; view.font = .systemFont(ofSize: 15); view.returnKeyType = .send
        view.textContainerInset = UIEdgeInsets(top: 12, left: 10, bottom: 12, right: 10)
        view.isScrollEnabled = false; view.accessibilityIdentifier = "chat-input"; view.accessibilityLabel = "메시지 입력"
        return view
    }
    func updateUIView(_ view: UITextView, context: Context) {
        let coordinator = context.coordinator; coordinator.parent = self
        if let token = insertion, !coordinator.inserting {
            coordinator.inserting = true
            let attachment = coordinator.attributed(token)
            let next = NSMutableAttributedString(attributedString: view.attributedText)
            let range = view.selectedRange; next.replaceCharacters(in: range, with: attachment)
            if coordinator.raw(next).count <= 2000 {
                view.attributedText = next; view.selectedRange = NSRange(location: range.location + attachment.length, length: 0)
                let updated = coordinator.raw(next)
                DispatchQueue.main.async { text = updated; insertion = nil; focused = true; coordinator.inserting = false }
            } else { DispatchQueue.main.async { insertion = nil; coordinator.inserting = false } }
        } else if !coordinator.inserting && coordinator.raw(view.attributedText) != text && view.markedTextRange == nil {
            view.attributedText = coordinator.attributed(text)
            view.selectedRange = NSRange(location: view.attributedText.length, length: 0)
        }
        view.typingAttributes = [.font: UIFont.systemFont(ofSize: 15), .foregroundColor: UIColor.white]
        // A UIKit tap can begin editing before SwiftUI has propagated the
        // delegate's binding update. Only apply explicit focus transitions.
        if coordinator.requestedFocus != focused {
            coordinator.requestedFocus = focused
            if focused && !view.isFirstResponder { view.becomeFirstResponder() }
            if !focused && view.isFirstResponder { view.resignFirstResponder() }
        }
        coordinator.loadImages(in: view)
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 200
        let height = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
        uiView.isScrollEnabled = height > 110
        return CGSize(width: width, height: min(110, max(44, height)))
    }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ChatStickerInput
        var inserting = false
        var requestedFocus = false
        var images: [String: UIImage] = [:]
        var loading = Set<String>()
        init(_ parent: ChatStickerInput) { self.parent = parent }
        func raw(_ value: NSAttributedString) -> String {
            var output = ""
            value.enumerateAttributes(in: NSRange(location: 0, length: value.length)) { attributes, range, _ in
                if let attachment = attributes[.attachment] as? ChatStickerAttachment { output += attachment.token }
                else { output += (value.string as NSString).substring(with: range) }
            }
            return output
        }
        func attributed(_ text: String) -> NSAttributedString {
            let output = NSMutableAttributedString(string: "")
            for (value, sticker) in ChatSticker.parts(text) {
                if let sticker {
                    let attachment = ChatStickerAttachment(); attachment.token = sticker.token
                    attachment.image = images[sticker.key] ?? UIImage(systemName: "face.smiling")?.withTintColor(.systemPink, renderingMode: .alwaysOriginal)
                    attachment.bounds = CGRect(x: 0, y: -6, width: 26, height: 26)
                    output.append(NSAttributedString(attachment: attachment))
                } else { output.append(NSAttributedString(string: value, attributes: [.font: UIFont.systemFont(ofSize: 15), .foregroundColor: UIColor.white])) }
            }
            return output
        }
        func textViewDidChange(_ view: UITextView) { parent.text = raw(view.attributedText) }
        func textViewDidBeginEditing(_ view: UITextView) { parent.focused = true }
        func textViewDidEndEditing(_ view: UITextView) { parent.focused = false }
        func textView(_ view: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            if text == "\n" { parent.send(); return false }
            if view.markedTextRange != nil { return true }
            let candidate = NSMutableAttributedString(attributedString: view.attributedText)
            candidate.replaceCharacters(in: range, with: text)
            return raw(candidate).count <= 2000
        }
        func loadImages(in view: UITextView) {
            for (_, sticker) in ChatSticker.parts(parent.text) {
                guard let sticker, images[sticker.key] == nil, loading.insert(sticker.key).inserted else { continue }
                Task { @MainActor [weak self, weak view] in
                    guard let self else { return }; defer { self.loading.remove(sticker.key) }
                    guard let data = try? await API.shared.request(sticker.path), let image = ArtworkRepository.decode(data), let view else { return }
                    self.images[sticker.key] = image
                    if view.markedTextRange == nil {
                        let selection = view.selectedRange; view.attributedText = self.attributed(self.raw(view.attributedText)); view.selectedRange = selection
                    }
                }
            }
        }
    }
}
