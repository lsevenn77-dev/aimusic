import SwiftUI
import PhotosUI

struct PersonRow: View {
    let person: [String: Any]
    var body: some View {
        HStack { ProfilePhoto(person: person, kind: person.string("kind", fallback: "producer"), size: 48)
            VStack(alignment: .leading) { Text(person.displayName()); if !person.string("bio").isEmpty { Text(person.string("bio")).font(.caption).foregroundStyle(.secondary).lineLimit(2) } }
        }
    }
}
struct ProfilePage: View {
    @EnvironmentObject var model: AppModel
    let id: String
    var kind = "producer"
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var busy = false
    @State private var following = false
    @State private var showChat = false
    @State private var confirmBlock = false
    @Environment(\.dismiss) private var dismiss
    private var person: [String: Any] { data.object("profile") }
    var body: some View {
        List {
            Section {
                ProfilePhoto(person: person, kind: kind, size: 240)
                if kind == "producer" { NavigationLink { ProfileGiftRankingView(profileID: id) } label: { Label("선물 랭킹 TOP 50", systemImage: "trophy") } }
                Text(person.displayName(fallback: "프로필")).font(.title.bold())
                Text(person.string("bio"))
                LabeledContent("팔로워", value: "\(data.int("followers"))명")
                Button(following ? "팔로잉 해제" : "팔로우") { Task { await follow() } }.disabled(busy)
                if kind == "producer", model.user != nil, person.string("user_id") != model.userID {
                    Button("메시지 보내기") { showChat = true }
                    NavigationLink { GiftWalletView(person: GiftRecipient(id: id, name: person.displayName())) } label: { Label("개인 선물 보내기", systemImage: "gift") }
                    Button("이 이용자 차단", role: .destructive) { confirmBlock = true }.disabled(busy)
                }
            }
            Section("음악") { ForEach(data.songs()) { SongRow(song: $0, queue: data.songs()) } }
            Section("커버곡") { ForEach(data.songs("covers")) { SongRow(song: $0, queue: data.songs("covers")) } }
            if let error { Text(error).foregroundStyle(.red) }
        }.sheet(isPresented: $showChat) { NavigationStack { ChatPage(path: "/api/dm/\(Endpoint.pathID(id))", title: person.displayName(), crew: false).toolbar { Button("닫기") { showChat = false } } } }
        .confirmationDialog("이 이용자를 차단할까요? 음악과 댓글이 숨겨지고 서로 메시지를 보낼 수 없게 됩니다.", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("차단", role: .destructive) { Task { await block() } }
        }
        .navigationTitle("음악 프로필").task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do {
            data = try await API.shared.call("/api/\(kind)s/\(Endpoint.pathID(id))")
            if model.user != nil {
                let library = try await API.shared.call("/api/follows")
                following = library.objects("follows").contains { $0.string("target_id") == id && $0.string("kind") == kind }
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func block() async {
        guard let uid = person["user_id"] as? String, !uid.isEmpty else { return }
        busy = true; defer { busy = false }
        do { _ = try await API.shared.call("/api/blocks/\(Endpoint.pathID(uid))", method: "PUT", body: [:]); model.player.close(); if let owner = model.userID { ChatCache.removeAll(owner: owner) }; await model.refresh(); await model.loadLibrary(); model.notice = "이용자를 차단했습니다. 계정 설정에서 해제할 수 있습니다."; dismiss() }
        catch { self.error = error.localizedDescription }
    }
    private func follow() async {
        guard model.requireLogin() else { return }; busy = true; defer { busy = false }
        do { _ = try await API.shared.call("/api/\(kind)s/\(Endpoint.pathID(id))/follow", method: following ? "DELETE" : "PUT", body: [:]); await load() } catch { self.error = error.localizedDescription }
    }
}
struct ProfileEditorView: View {
    @EnvironmentObject var model: AppModel
    @State private var name = ""
    @State private var bio = ""
    @State private var picked: PhotosPickerItem?
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        Form {
            Section("공개 프로필") {
                TextField("닉네임", text: $name)
                TextField("소개", text: $bio, axis: .vertical).lineLimit(3...8)
                PhotosPicker("프로필 사진 선택", selection: $picked, matching: .images)
                if picked != nil { Text("선택한 사진이 저장 시 업로드됩니다.").font(.caption) }
                Button("프로필 저장") { Task { await save() } }.disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("내 프로필").task {
            do { let value = try await API.shared.call("/api/me/profile").object("profile"); name = value.string("name"); bio = value.string("bio") } catch { self.error = error.localizedDescription }
        }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            _ = try await API.shared.call("/api/me/profile", method: "PUT", body: ["name": name, "bio": bio])
            if let picked, let bytes = try await picked.loadTransferable(type: Data.self), let image = UIImage(data: bytes), let jpeg = image.jpegData(compressionQuality: 0.8) {
                _ = try await API.shared.request("/api/me/profile/image", method: "PUT", bytes: jpeg, type: "image/jpeg")
                self.picked = nil
            }
            try await model.loadMe(); model.notice = "프로필을 저장했습니다."; error = nil
        } catch { self.error = error.localizedDescription }
    }
}
struct MessagesView: View {
    @EnvironmentObject var model: AppModel
    @State private var conversations: [[String: Any]] = []
    @State private var error: String?
    @State private var deleteAll = false
    @State private var busy = false
    @State private var revision = 0
    var body: some View {
        List {
            if model.user == nil { Button("로그인하고 메시지 보기") { model.showLogin = true } }
            if let crew = model.inboxCrew {
                Section {
                    NavigationLink { ChatPage(path: "/api/crews/\(Endpoint.pathID(crew.string("id")))/messages", title: crew.string("name"), crew: true) } label: {
                        HStack {
                            Image(systemName: "pin.fill").foregroundStyle(Brand.aqua)
                            VStack(alignment: .leading) { Text(crew.string("name")).font(.headline); Text("내 크루 채팅").font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            if crew.flag("muted") { Image(systemName: "bell.slash").font(.caption) }
                            if crew.int("unread") > 0 { Text("\(crew.int("unread"))").font(.caption.bold()).foregroundStyle(Brand.pink) }
                        }.padding(.vertical, 8)
                    }
                }
            }
            if conversations.isEmpty { Text("프로필에서 메시지를 보내 대화를 시작하세요.").foregroundStyle(.secondary) }
            ForEach(conversations, id: \.selfID) { person in
                NavigationLink { ChatPage(path: "/api/dm/\(Endpoint.pathID(person.string("id")))", title: person.displayName(), crew: false) } label: {
                    VStack(alignment: .leading) {
                        HStack { PersonRow(person: person); if person.flag("muted") { Image(systemName: "bell.slash").font(.caption) } }
                        Text(person.string("last_message")).font(.caption).lineLimit(2)
                        if person.int("unread") > 0 { Text("새 메시지 \(person.int("unread"))개").foregroundStyle(Brand.pink).font(.caption) }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("메시지").task(id: model.userID) {
            conversations = []; revision += 1
            while !Task.isCancelled {
                await load()
                do { try await Task.sleep(for: .seconds(5)) } catch { break }
            }
        }.refreshable { await load() }
        .toolbar { if model.user != nil { Button("내 대화 전체 삭제", systemImage: "trash") { deleteAll = true }.disabled(busy) } }
        .confirmationDialog("내 개인 대화를 모두 삭제할까요?", isPresented: $deleteAll, titleVisibility: .visible) {
            Button("전체 삭제", role: .destructive) { Task { await clear() } }
        } message: { Text("내 개인 대화 목록과 기록만 삭제합니다. 상대방의 기록과 크루 채팅은 유지됩니다.") }
    }
    private func load() async {
        guard let owner = model.userID, !busy else { return }
        let version = revision
        do {
            let data = try await API.shared.call("/api/dm")
            guard owner == model.userID, version == revision, !Task.isCancelled else { return }
            conversations = data.objects("conversations"); error = nil
            await model.refreshInbox()
        } catch { if owner == model.userID, version == revision, !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func clear() async {
        guard let owner = model.userID, !busy else { return }
        revision += 1; busy = true
        do {
            _ = try await API.shared.call("/api/dm", method: "DELETE")
            ChatCache.removeAll(owner: owner)
            if owner == model.userID { conversations = []; error = nil }
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
        busy = false; await load()
    }
}

struct CrewsView: View {
    @EnvironmentObject var model: AppModel
    @State private var crews: [[String: Any]] = []
    @State private var query = ""
    @State private var error: String?
    @State private var create = false
    var body: some View {
        List {
            Button("새 크루 만들기") { if model.requireLogin() { create = true } }
            ForEach(crews, id: \.selfID) { crew in
                NavigationLink { CrewPage(id: crew.string("id")) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(crew.string("name")).font(.headline)
                        Text(crew.string("description")).font(.caption).lineLimit(2)
                        Text("멤버 \(crew.int("members"))/\(crew.int("capacity")) · Lv.\(crew.int("level"))").font(.caption).foregroundStyle(Brand.aqua)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("크루").searchable(text: $query, prompt: "크루 이름 · 관심 장르")
            .task(id: query) { do { try await Task.sleep(for: .milliseconds(250)); await load() } catch {} }
            .refreshable { await load() }
            .sheet(isPresented: $create, onDismiss: { Task { await load() } }) { NavigationStack { CrewEditor() } }
    }
    private func load() async {
        do { let result = try await API.shared.call("/api/crews?q=" + Endpoint.query(query)); guard !Task.isCancelled else { return }; crews = result.objects("crews"); error = nil } catch { self.error = error.localizedDescription }
    }
}
struct CrewEditor: View {
    @Environment(\.dismiss) var dismiss
    var id: String?
    @State var name = ""
    @State var description = ""
    @State var interests = ""
    @State var recruiting = true
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        Form {
            TextField("크루 이름", text: $name)
            TextField("크루 소개", text: $description, axis: .vertical).lineLimit(3...6)
            TextField("관심 장르", text: $interests)
            Toggle("신규 멤버 모집", isOn: $recruiting)
            Button("저장") { Task { await save() } }.disabled(busy || name.isEmpty)
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle(id == nil ? "크루 만들기" : "크루 편집").toolbar { Button("닫기") { dismiss() } }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do { _ = try await API.shared.call(id.map { "/api/crews/\(Endpoint.pathID($0))" } ?? "/api/crews", method: id == nil ? "POST" : "PATCH", body: ["name": name, "description": description, "interests": interests, "recruiting": recruiting]); dismiss() } catch { self.error = error.localizedDescription }
    }
}
struct CrewPage: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    let id: String
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var edit = false
    @State private var leaving = false
    @State private var busy = false
    private var crew: [String: Any] { data.object("crew") }
    private var member: Bool { !data.object("membership").isEmpty }
    @State private var section = "홈"
    @State private var banner: PhotosPickerItem?
    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(crew.string("name", fallback: "크루")).font(.title3.bold())
                Text("Lv.\(crew.int("level")) · 멤버 \(crew.int("members"))/\(crew.int("capacity"))").font(.caption).foregroundStyle(Brand.aqua)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(Brand.card)
            if member {
                Picker("크루 메뉴", selection: $section) { ForEach(["홈", "멤버", "음악", "소개"], id: \.self) { Text($0).tag($0) } }.pickerStyle(.segmented).padding(12)
                if section == "홈" {
                    List {
                        Section {
                            CrewBanner(crew: crew)
                            if data.object("membership").string("role") == "owner" { PhotosPicker("크루 대표 이미지 변경", selection: $banner, matching: .images).disabled(busy) }
                            NavigationLink { ChatPage(path: "/api/crews/\(Endpoint.pathID(id))/messages", title: crew.string("name"), crew: true) } label: { Label("크루 채팅방", systemImage: "bubble.left.and.bubble.right.fill") }
                            Button(data.object("membership").flag("muted") ? "크루 알림 켜기" : "크루 알림 끄기") { Task { await toggleMute() } }.disabled(busy)
                        }
                        Section("크루의 최신 음악") { ForEach(data.songs()) { SongRow(song: $0, queue: data.songs()) }; if data.songs().isEmpty { Text("아직 공개된 음악이 없습니다.").foregroundStyle(.secondary) } }
                        if let error { Text(error).foregroundStyle(.red) }
                    }
                }
                else if section == "멤버" { List { ForEach(data.objects("members"), id: \.selfID) { person in NavigationLink { ProfilePage(id: person.string("id")) } label: { PersonRow(person: person) } } } }
                else if section == "음악" { List { ForEach(data.songs()) { SongRow(song: $0, queue: data.songs()) } } }
                else { List { Text(crew.string("description")); Text(crew.string("interests")); if data.object("membership").string("role") == "owner" { Button("크루 편집") { edit = true } }; Button("크루 탈퇴", role: .destructive) { leaving = true } } }
            } else {
                List { Text(crew.string("description")); Text(crew.string("interests")); Button("크루 가입하기") { Task { await join(); section = "홈" } }.disabled(busy || data.flag("banned") || !crew.flag("recruiting")); if let error { Text(error).foregroundStyle(.red) } }
            }
        }.navigationTitle(crew.string("name", fallback: "크루")).navigationBarTitleDisplayMode(.inline).task { await load() }
            .task(id: banner) { await uploadBanner() }
            .sheet(isPresented: $edit, onDismiss: { Task { await load() } }) { NavigationStack { CrewEditor(id: id, name: crew.string("name"), description: crew.string("description"), interests: crew.string("interests"), recruiting: crew.flag("recruiting")) } }
            .confirmationDialog("크루에서 탈퇴할까요?", isPresented: $leaving, titleVisibility: .visible) { Button("탈퇴", role: .destructive) { Task { await leave() } } } message: { Text("크루장은 다음 멤버에게 이전됩니다. 마지막 멤버가 나가면 크루와 채팅이 삭제됩니다.") }
    }
    private func toggleMute() async {
        busy = true; defer { busy = false }
        do { _ = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))/settings", method: "PUT", body: ["muted": !data.object("membership").flag("muted")]); await load(); await model.refreshInbox() }
        catch { self.error = error.localizedDescription }
    }
    private func uploadBanner() async {
        guard let banner, let owner = model.userID else { return }
        busy = true; defer { busy = false }
        do {
            guard let bytes = try await banner.loadTransferable(type: Data.self) else { return }
            let webp = try await Task.detached { try ChatImageEncoder.encode(bytes) }.value
            guard owner == model.userID, !Task.isCancelled else { return }
            _ = try await API.shared.request("/api/crews/\(Endpoint.pathID(id))/image", method: "PUT", bytes: webp, type: "image/webp")
            self.banner = nil; await load(); await model.refreshInbox()
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
    private func load() async { do { data = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))"); error = nil } catch { self.error = error.localizedDescription } }
    private func join() async { guard model.requireLogin() else { return }; busy = true; defer { busy = false }; do { data = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))/join", method: "POST", body: [:]); error = nil } catch { self.error = error.localizedDescription } }
    private func leave() async { do { _ = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))/leave", method: "POST", body: [:]); dismiss() } catch { self.error = error.localizedDescription } }
}

struct LoginPrompt: View {
    @EnvironmentObject var model: AppModel
    let title: String
    var body: some View {
        ContentUnavailableView { Label(title, systemImage: "person.crop.circle") } description: { Text("AIFECT 계정으로 이어서 이용하세요.") } actions: { Button("로그인") { model.showLogin = true }.buttonStyle(.borderedProminent) }
    }
}
struct ProfilePhoto: View {
    let person: [String: Any]
    var kind = "producer"
    var size: CGFloat = 56
    private var url: URL? {
        guard !person.string("image_version").isEmpty else { return nil }
        let id = person.string("id", fallback: person.string("profile_id"))
        return try? Endpoint.url("/media/\(kind)/\(Endpoint.pathID(id))?v=\(Endpoint.query(person.string("image_version")))")
    }
    var body: some View {
        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { ZStack { AifectDesign.raised; Image(systemName: "person.fill").font(.system(size: size * 0.32)).foregroundStyle(Brand.aqua) } }
            .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: min(22, size * 0.16))).accessibilityLabel("프로필 사진")
    }
}
struct MyMusicView: View {
    @EnvironmentObject var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var music: [String: Any] = [:]
    @State private var error: String?
    private var profile: [String: Any] { data.object("profile") }
    var body: some View {
        if model.user == nil { LoginPrompt(title: "내 음악과 기록을 한곳에") }
        else {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(profile.displayName(fallback: model.user?.displayName() ?? "내 프로필")).font(.title2.bold())
                        GeometryReader { g in ProfilePhoto(person: profile, size: g.size.width) }.aspectRatio(1, contentMode: .fit)
                        if !profile.string("id").isEmpty { NavigationLink { ProfileGiftRankingView(profileID: profile.string("id")) } label: { Label("선물 랭킹 TOP 50", systemImage: "trophy") } }
                        if !profile.string("bio").isEmpty { Text(profile.string("bio")).foregroundStyle(.secondary) }
                        HStack {
                            Text("공개 음악 \(music.songs().count + music.songs("covers").count)")
                            Spacer()
                            NavigationLink("팔로워 \(data.int("follower_count"))") { FollowingListView(followers: true) }
                            NavigationLink("팔로잉 \(data.int("following_count"))") { FollowingListView() }
                        }.font(.caption)
                        NavigationLink { ProfileEditorView() } label: { Label("프로필 수정", systemImage: "pencil").frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(.bordered)
                    }.padding(20).background(Brand.card, in: RoundedRectangle(cornerRadius: 22))
                    NavigationLink { LibraryView() } label: { Label("내 보관함", systemImage: "music.note.list").font(.headline).frame(minHeight: 48) }
                    NavigationLink { SingView(initialShowDrafts: true) } label: { Label("이 기기의 녹음 초안", systemImage: "folder").frame(minHeight: 48) }
                    Text("내 커버곡").font(.title3.bold())
                    ForEach(music.songs("covers")) { SongRow(song: $0, queue: music.songs("covers")) }
                    Text("내 제작곡").font(.title3.bold())
                    ForEach(music.songs()) { SongRow(song: $0, queue: music.songs()) }
                    NavigationLink("원곡 음원 업로드") { OriginalUploadView() }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                }.padding(20)
            }.task(id: model.userID) { await load() }.refreshable { await load() }
        }
    }
    private func load() async {
        guard let owner = model.userID else { data = [:]; music = [:]; return }
        do {
            let value = try await API.shared.call("/api/me/profile")
            let id = value.object("profile").string("id")
            let tracks = id.isEmpty ? [:] : try await API.shared.call("/api/producers/\(Endpoint.pathID(id))")
            guard model.userID == owner, !Task.isCancelled else { return }
            data = value; music = tracks; error = nil
        } catch { if model.userID == owner { self.error = error.localizedDescription } }
    }
}
struct FollowingListView: View {
    @EnvironmentObject var model: AppModel
    var followers = false
    @State private var people: [[String: Any]] = []
    @State private var error: String?
    var body: some View {
        List {
            ForEach(people.indices, id: \.self) { i in
                let person = people[i]
                let id = person.string("id", fallback: person.string("target_id"))
                if !id.isEmpty { NavigationLink { ProfilePage(id: id, kind: person.string("kind", fallback: "producer")) } label: { PersonRow(person: person.merging(["id": id]) { _, new in new }) } }
                else { NavigationLink { ListenerProfileView(userID: person.string("user_id")) } label: { PersonRow(person: person) } }
            }
            if people.isEmpty && error == nil { Text(followers ? "아직 팔로워가 없어요." : "좋아하는 창작자를 팔로우해보세요.").foregroundStyle(.secondary) }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle(followers ? "팔로워" : "팔로잉").task(id: model.userID) {
            do { let data = try await API.shared.call(followers ? "/api/me/profile" : "/api/follows"); people = data.objects(followers ? "followers" : "follows") } catch { self.error = error.localizedDescription }
        }
    }
}
struct ListenerProfileView: View {
    let userID: String
    @State private var person: [String: Any] = [:]
    @State private var error: String?
    var body: some View {
        List {
            Text(person.displayName(fallback: "프로필")).font(.title2.bold())
            Text(person.string("bio"))
            if !person.string("id").isEmpty { NavigationLink("음악 프로필") { ProfilePage(id: person.string("id")) } }
            if let error { Text(error).foregroundStyle(.red) }
        }.task { do { person = try await API.shared.call("/api/followers/\(Endpoint.pathID(userID))").object("profile") } catch { self.error = error.localizedDescription } }
    }
}

// Only the current signed-in account can address this cache. Crew history is
// restored after the server confirms the viewer's current join boundary.
enum ChatCache {
    private static func url(owner: String, path: String) -> URL {
        let key = Data((owner + "|" + path).utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_")
        return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("AIFECTChat", isDirectory: true).appendingPathComponent(key + ".json")
    }
    static func read(owner: String, path: String) -> [String: Any] {
        guard let data = try? Data(contentsOf: url(owner: owner, path: path)), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }; return value
    }
    static func write(owner: String, path: String, messages: [[String: Any]], boundary: Int?) {
        let destination = url(owner: owner, path: path)
        try? FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        let value: [String: Any] = ["messages": Array(messages.suffix(500)), "boundary": boundary ?? 0]
        if let bytes = try? JSONSerialization.data(withJSONObject: value) { try? bytes.write(to: destination, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
    }
    static func removeAll(owner: String) {
        let folder = url(owner: owner, path: "").deletingLastPathComponent()
        for file in (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? [] {
            let key = file.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "_", with: "/")
            if let data = Data(base64Encoded: key), let decoded = String(data: data, encoding: .utf8), decoded.hasPrefix(owner + "|") { try? FileManager.default.removeItem(at: file) }
        }
    }
    static func remove(owner: String, path: String) { try? FileManager.default.removeItem(at: url(owner: owner, path: path)) }
}

struct CrewBanner: View {
    let crew: [String: Any]
    var body: some View {
        AsyncImage(url: crew.string("image_version").isEmpty ? nil : try? Endpoint.url("/media/crew/\(Endpoint.pathID(crew.string("id")))?v=\(Endpoint.query(crew.string("image_version")))")) { image in image.resizable().scaledToFill() } placeholder: {
            ZStack { Brand.gradient.opacity(0.25); Image(systemName: "person.3.fill").font(.largeTitle).foregroundStyle(Brand.aqua) }
        }.frame(height: 200).frame(maxWidth: .infinity).clipped().clipShape(RoundedRectangle(cornerRadius: 18))
    }
}
