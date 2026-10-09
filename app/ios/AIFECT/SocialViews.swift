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
    @State private var artistTab = 0
    @Environment(\.dismiss) private var dismiss
    private var person: [String: Any] { data.object("profile") }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(person.displayName(fallback: "프로필")).font(.system(size: 25, weight: .bold))
                    ResponsiveProfilePhoto(person: person, kind: kind)
                    if kind == "producer" { NavigationLink { ProfileGiftRankingView(profileID: id) } label: { Label("선물 랭킹 TOP 50", systemImage: "trophy.fill").font(.system(size: 13)).frame(maxWidth: .infinity, minHeight: 44) } }
                    Text("팔로워 \(data.int("followers")) · 공개 음악 \(data.songs().count + data.songs("covers").count)").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    HStack(spacing: 6) {
                        stat("공개곡", data.songs().count + data.songs("covers").count)
                        stat("팔로워", data.int("followers"))
                        stat("커버", data.songs("covers").count)
                    }
                    if !person.string("bio").isEmpty { Text(person.string("bio")).font(.system(size: 14)).foregroundStyle(AifectDesign.muted) }
                    HStack(spacing: 8) {
                        if kind == "producer", let owner = model.userID, person.string("user_id") == owner {
                            NavigationLink { ProfileEditorView() } label: { Label("프로필 수정", systemImage: "pencil").frame(maxWidth: .infinity) }.buttonStyle(ParityPill())
                        } else {
                            Button(following ? "팔로잉" : "팔로우") { Task { await follow() } }.buttonStyle(ParityPill(color: Brand.pink, filled: true)).disabled(busy)
                            if kind == "producer" {
                                Button("메시지") { if model.requireLogin() { showChat = true } }.buttonStyle(ParityPill(color: AifectDesign.secondaryText))
                                NavigationLink { GiftWalletView(person: GiftRecipient(id: id, name: person.displayName())) } label: { Label("선물", systemImage: "gift") }.buttonStyle(ParityPill(color: Brand.pink))
                            }
                        }
                    }
                }.padding(20).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
                if kind == "artist" {
                    HStack { Button("음악") { artistTab = 0 }.buttonStyle(ParityPill(color: artistTab == 0 ? Brand.aqua : AifectDesign.muted)); Button("갤러리") { artistTab = 1 }.buttonStyle(ParityPill(color: artistTab == 1 ? Brand.aqua : AifectDesign.muted)) }
                }
                if kind == "artist" && artistTab == 1 { ArtistGallerySection(artistID: id, profile: data, reload: load) }
                else {
                    if !data.songs().isEmpty { MusicSectionHeading(title: "음악"); MusicGrid(songs: data.songs()) }
                    if !data.songs("covers").isEmpty { MusicSectionHeading(title: "커버곡"); MusicGrid(songs: data.songs("covers")) }
                }
                if let error { Text(error).foregroundStyle(.red) }
                if kind == "producer", model.user != nil, person.string("user_id") != model.userID {
                    Button("이 이용자 차단", role: .destructive) { confirmBlock = true }.font(.caption).frame(minHeight: 44).disabled(busy)
                }
            }.padding(20)
        }.background(Brand.background)
        .sheet(isPresented: $showChat) { NavigationStack { ChatPage(path: "/api/dm/\(Endpoint.pathID(id))", title: person.displayName(), crew: false).toolbar { Button("닫기") { showChat = false } } } }
        .confirmationDialog("이 이용자를 차단할까요? 음악과 댓글이 숨겨지고 서로 메시지를 보낼 수 없게 됩니다.", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("차단", role: .destructive) { Task { await block() } }
        }
        .navigationTitle("음악 프로필").navigationBarTitleDisplayMode(.inline).task(id: model.userID) { await load() }.refreshable { await load() }
    }
    private func stat(_ label: String, _ count: Int) -> some View {
        Text("\(label) \(count)").font(.system(size: 13, weight: .semibold)).foregroundStyle(label == "팔로워" ? Brand.aqua : AifectDesign.text).frame(maxWidth: .infinity, minHeight: 50).background(Color(aifectHex: 0x222331), in: RoundedRectangle(cornerRadius: 13))
    }
    private func load() async {
        do {
            let owner = model.userID
            let loaded = try await API.shared.call("/api/\(kind)s/\(Endpoint.pathID(id))")
            guard owner == model.userID, !Task.isCancelled else { return }
            data = loaded
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
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    PageHeading(title: "메시지", subtitle: "음악으로 만난 사람들과 이야기를 나눠요")
                    if model.user != nil { Button { deleteAll = true } label: { Image(systemName: "trash").frame(width: 44, height: 44) }.accessibilityLabel("내 대화 전체 삭제").disabled(busy) }
                }
                if model.user == nil { Button("로그인하고 메시지 보기") { model.showLogin = true }.buttonStyle(ParityPill(filled: true)) }
                if let crew = model.inboxCrew {
                    Text("내 크루 · 고정").font(.system(size: 13, weight: .semibold)).foregroundStyle(Brand.aqua)
                    NavigationLink { ChatPage(path: "/api/crews/\(Endpoint.pathID(crew.string("id")))/messages", title: crew.string("name"), crew: true) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "pin.fill").font(.title2).foregroundStyle(Brand.aqua)
                            VStack(alignment: .leading, spacing: 6) { Text(crew.string("name")).font(.headline); Text("내 크루 채팅").font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }
                            Spacer()
                            if crew.flag("muted") { Image(systemName: "bell.slash").font(.caption) }
                            if crew.int("unread") > 0 { Text("\(crew.int("unread"))").font(.caption.bold()).foregroundStyle(Brand.pink) }
                            Image(systemName: "chevron.right").font(.caption)
                        }.padding(18).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                    }.buttonStyle(.plain)
                }
                if conversations.isEmpty { Text("프로필에서 메시지를 보내 대화를 시작하세요.").font(.system(size: 14)).foregroundStyle(AifectDesign.muted).padding(.vertical, 22) }
                ForEach(conversations, id: \.selfID) { person in
                    NavigationLink { ChatPage(path: "/api/dm/\(Endpoint.pathID(person.string("id")))", title: person.displayName(), crew: false) } label: {
                        HStack(spacing: 12) {
                            ProfilePhoto(person: person, size: 48).clipShape(Circle())
                            VStack(alignment: .leading, spacing: 6) {
                                HStack { Text(person.displayName()).font(.system(size: 16, weight: .semibold)); if person.flag("muted") { Image(systemName: "bell.slash").font(.caption) } }
                                Text(person.string("last_message")).font(.system(size: 13)).foregroundStyle(AifectDesign.muted).lineLimit(2)
                            }
                            Spacer(minLength: 0)
                            if person.int("unread") > 0 { Text("\(person.int("unread"))").foregroundStyle(Brand.pink).font(.caption.bold()) }
                        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                    }.buttonStyle(.plain)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }.padding(20)
        }.task(id: model.userID) {
            conversations = []; revision += 1
            while !Task.isCancelled {
                await load()
                do { try await Task.sleep(for: .seconds(5)) } catch { break }
            }
        }.refreshable { await load() }
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
    @State private var loading = true
    @State private var mine: String?
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("함께할 크루").font(.system(size: 25, weight: .bold))
                        Text("취향이 맞는 사람들과 함께 듣고 불러요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                    }
                    Spacer(minLength: 4)
                    Button { if model.requireLogin() { create = true } } label: { Image(systemName: "plus").frame(width: 44, height: 44).background(Brand.card, in: Circle()) }.accessibilityLabel("새 크루 만들기")
                }
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(AifectDesign.muted)
                    TextField("크루 이름 · 관심 장르", text: $query).submitLabel(.search).accessibilityIdentifier("crew-search")
                    if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(AifectDesign.muted) }.accessibilityLabel("검색어 지우기") }
                }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 15))
                if loading { ProgressView("크루를 찾는 중").frame(maxWidth: .infinity).padding(.vertical, 12) }
                ForEach(crews, id: \.selfID) { crew in
                    NavigationLink { CrewPage(id: crew.string("id")) } label: { CrewDirectoryCard(crew: crew, isMine: crew.string("id") == mine) }
                        .buttonStyle(.plain).accessibilityIdentifier("crew-card-" + crew.string("id"))
                }
                if let error { RetryCard(message: error) { Task { await load() } } }
                else if crews.isEmpty && !loading { ContentUnavailableView(query.isEmpty ? "첫 크루를 만들어보세요" : "검색된 크루가 없어요", systemImage: "person.3", description: Text(query.isEmpty ? "좋아하는 음악으로 함께할 모임을 시작해보세요." : "다른 크루 이름이나 관심 장르로 찾아보세요.")) }
            }.padding(20).padding(.bottom, 16)
        }.background(Brand.background).scrollDismissesKeyboard(.interactively)
            .navigationTitle("크루").navigationBarTitleDisplayMode(.inline)
            .task(id: query + "|" + (model.userID ?? "guest")) {
                do { try await Task.sleep(for: .milliseconds(250)); await load() } catch {}
            }.refreshable { await load() }
            .sheet(isPresented: $create, onDismiss: { Task { await load() } }) { NavigationStack { CrewEditor() } }
    }
    private func load() async {
        let owner = model.userID, search = query
        loading = true
        defer { if !Task.isCancelled { loading = false } }
        do {
            let result = try await API.shared.call("/api/crews?q=" + Endpoint.query(search))
            guard !Task.isCancelled, owner == model.userID, search == query else { return }
            crews = result.objects("crews"); mine = result["mine"] as? String; error = nil
        } catch { if !Task.isCancelled, owner == model.userID, search == query { self.error = error.localizedDescription } }
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
    @State private var loading = true
    private var owner: Bool { data.object("membership").string("role") == "owner" }
    private var full: Bool { crew.int("capacity") > 0 && crew.int("members") >= crew.int("capacity") }
    private var joinLabel: String { data.flag("banned") ? "가입할 수 없는 크루" : full ? "정원이 가득 찼어요" : !crew.flag("recruiting") ? "현재 모집을 쉬고 있어요" : "이 크루와 함께하기" }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                if loading && crew.isEmpty { ProgressView("크루를 불러오는 중").frame(maxWidth: .infinity).padding(40) }
                if !crew.isEmpty {
                    hero
                    if member { chatEntry }
                    else {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("함께 듣고, 함께 부르는 우리 크루").font(.system(size: 16, weight: .semibold))
                            Text("마음에 드는 음악을 나누고 크루 채팅에서 이야기를 이어가세요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                            Button { Task { await join(); section = "홈" } } label: { Label(joinLabel, systemImage: "person.badge.plus").frame(maxWidth: .infinity) }
                                .buttonStyle(ParityPill(filled: true)).disabled(busy || data.flag("banned") || !crew.flag("recruiting") || full)
                        }.padding(18).background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
                    }
                    ParityChips(items: ["홈", "음악", "멤버", "소개"], selection: $section)
                    if section == "홈" { homeContent }
                    else if section == "음악" { musicContent }
                    else if section == "멤버" { membersContent }
                    else { aboutContent }
                }
                if let error { RetryCard(message: error) { Task { await load() } } }
            }.padding(20).padding(.bottom, 18)
        }.background(Brand.background)
            .navigationTitle(crew.string("name", fallback: "크루")).navigationBarTitleDisplayMode(.inline)
            .task(id: id + "|" + (model.userID ?? "guest")) { data = [:]; section = "홈"; await load() }
            .refreshable { await load() }
            .task(id: banner) { await uploadBanner() }
            .sheet(isPresented: $edit, onDismiss: { Task { await load() } }) { NavigationStack { CrewEditor(id: id, name: crew.string("name"), description: crew.string("description"), interests: crew.string("interests"), recruiting: crew.flag("recruiting")) } }
            .confirmationDialog("크루에서 탈퇴할까요?", isPresented: $leaving, titleVisibility: .visible) { Button("탈퇴", role: .destructive) { Task { await leave() } } } message: { Text("크루장은 다음 멤버에게 이전됩니다. 마지막 멤버가 나가면 크루와 채팅이 삭제됩니다.") }
    }
    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            CrewBanner(crew: crew).overlay(alignment: .bottomTrailing) {
                if owner { PhotosPicker(selection: $banner, matching: .images) { Label("이미지 변경", systemImage: "camera").font(.system(size: 12, weight: .semibold)).padding(12).background(Brand.background.opacity(0.9), in: Capsule()) }.padding(12).disabled(busy) }
            }
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    Text(member ? "MY CREW" : "MUSIC CREW").font(.system(size: 11, weight: .bold)).tracking(2).foregroundStyle(Brand.aqua)
                    Spacer()
                    CrewRecruitingBadge(crew: crew)
                }
                Text(crew.string("name")).font(.system(size: 27, weight: .bold)).accessibilityIdentifier("crew-detail-name")
                Text(crew.string("description").isEmpty ? "음악으로 만나 함께 듣고 부르는 크루예요." : crew.string("description")).font(.system(size: 14)).foregroundStyle(AifectDesign.secondaryText).lineLimit(section == "소개" ? nil : 4)
                HStack(spacing: 8) {
                    CrewStatistic(title: "크루 레벨", value: "LV.\(crew.int("level"))", icon: "sparkles")
                    CrewStatistic(title: "총 인원 · 정원 \(crew.int("capacity"))명", value: "\(crew.int("members"))명", icon: "person.2")
                    CrewStatistic(title: "공개 음악", value: "\(data.songs().count)곡", icon: "music.note")
                }
                if !crew.string("interests").isEmpty { Label(crew.string("interests"), systemImage: "music.note.list").font(.system(size: 13)).foregroundStyle(Brand.aqua).lineLimit(2) }
                CrewLevelProgress(crew: crew, rules: data.object("rules"))
            }.padding(18)
        }.background(Brand.card, in: RoundedRectangle(cornerRadius: 22)).clipShape(RoundedRectangle(cornerRadius: 22))
    }
    private var chatEntry: some View {
        NavigationLink { ChatPage(path: "/api/crews/\(Endpoint.pathID(id))/messages", title: crew.string("name"), crew: true) } label: {
            HStack(spacing: 14) {
                Image(systemName: "bubble.left.and.bubble.right.fill").font(.system(size: 23)).foregroundStyle(Brand.aqua)
                VStack(alignment: .leading, spacing: 5) { Text("크루 채팅방").font(.system(size: 17, weight: .semibold)); Text("우리의 음악 이야기, 여기서 이어가요").font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }
                Spacer(minLength: 0); Image(systemName: "chevron.right").foregroundStyle(Brand.aqua)
            }.padding(18).background(Color(aifectHex: 0x1B3035), in: RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain)
    }
    @ViewBuilder private var homeContent: some View {
        HStack { MusicSectionHeading(title: "크루의 최신 음악", subtitle: "멤버들이 공개한 목소리와 취향"); Button("전체 보기") { section = "음악" }.font(.system(size: 12)).fixedSize() }
        if data.songs().isEmpty { CrewEmptyCard(title: "우리 크루의 첫 음악을 기다려요", message: "멤버가 공개한 제작곡과 커버가 이곳에 모입니다.", icon: "music.note") }
        else { MusicGrid(songs: Array(data.songs().prefix(4))) }
        HStack { MusicSectionHeading(title: "함께하는 사람들", subtitle: "\(crew.int("members"))명의 크루 멤버"); Button("모두 보기") { section = "멤버" }.font(.system(size: 12)).fixedSize() }
        if data.objects("members").isEmpty { CrewEmptyCard(title: "멤버를 불러오지 못했어요", message: "잠시 후 다시 확인해주세요.", icon: "person.2") }
        else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) { ForEach(Array(data.objects("members").prefix(8)), id: \.selfID) { person in
                    NavigationLink { ProfilePage(id: person.string("id")) } label: {
                        VStack(spacing: 8) { ProfilePhoto(person: person, size: 56).clipShape(Circle()); Text(person.displayName()).font(.system(size: 13, weight: .semibold)).lineLimit(1); Text(roleTitle(person)).font(.system(size: 11)).foregroundStyle(Brand.aqua) }.frame(width: 94).padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain)
                } }
            }
        }
    }
    @ViewBuilder private var musicContent: some View {
        MusicSectionHeading(title: "우리 크루의 음악", subtitle: "제작곡과 커버를 함께 감상해보세요")
        if data.songs().isEmpty { CrewEmptyCard(title: "아직 공개된 음악이 없어요", message: "멤버가 공개한 음악이 이곳에 모입니다.", icon: "music.note") }
        else { MusicGrid(songs: data.songs()) }
    }
    @ViewBuilder private var membersContent: some View {
        MusicSectionHeading(title: "크루 멤버", subtitle: "총 \(crew.int("members"))명 · 정원 \(crew.int("capacity"))명")
        ForEach(data.objects("members"), id: \.selfID) { person in
            NavigationLink { ProfilePage(id: person.string("id")) } label: {
                HStack(spacing: 12) { PersonRow(person: person); Spacer(); Text(roleTitle(person)).font(.system(size: 12)).foregroundStyle(Brand.aqua); Image(systemName: "chevron.right").font(.caption).foregroundStyle(AifectDesign.muted) }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 17))
            }.buttonStyle(.plain)
        }
    }
    private var aboutContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("크루 소개").font(.system(size: 21, weight: .bold))
            Text(crew.string("description").isEmpty ? "크루 소개가 아직 등록되지 않았어요." : crew.string("description")).font(.system(size: 15)).foregroundStyle(AifectDesign.secondaryText)
            if !crew.string("interests").isEmpty { Label(crew.string("interests"), systemImage: "music.note.list").font(.system(size: 14)).foregroundStyle(Brand.aqua) }
            if member {
                Button(data.object("membership").flag("muted") ? "크루 알림 켜기" : "크루 알림 끄기") { Task { await toggleMute() } }.disabled(busy)
                if owner { Button("소개 · 모집 정보 수정") { edit = true }.disabled(busy) }
                Button("크루 탈퇴", role: .destructive) { leaving = true }.disabled(busy)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20).background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
    }
    private func roleTitle(_ person: [String: Any]) -> String { data.object("roles").string(person.string("role"), fallback: "크루원") }
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
    private func load() async {
        let account = model.userID
        loading = true; defer { if !Task.isCancelled { loading = false } }
        do {
            let result = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))")
            guard account == model.userID, !Task.isCancelled else { return }
            data = result; error = nil
        } catch { if account == model.userID, !Task.isCancelled { self.error = error.localizedDescription } }
    }
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
        RemoteArtwork(url: url) { $0.resizable().aspectRatio(contentMode: size > 100 ? .fit : .fill) } placeholder: { ZStack { AifectDesign.raised; Image(systemName: "person.fill").font(.system(size: size * 0.32)).foregroundStyle(Brand.aqua) } }
            .frame(width: size, height: size).background(AifectDesign.raised).clipShape(RoundedRectangle(cornerRadius: min(22, size * 0.16))).accessibilityLabel("프로필 사진")
    }
}
struct MyMusicView: View {
    @EnvironmentObject var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var music: [String: Any] = [:]
    @State private var error: String?
    @State private var confirmLogout = false
    @State private var loggingOut = false
    private var profile: [String: Any] { data.object("profile") }
    @State private var filter = "전체"
    @State private var grid = true
    @State private var account = false
    private var allSongs: [Song] {
        var seen = Set<String>()
        return (music.songs() + music.songs("covers")).filter { seen.insert($0.id).inserted }
    }
    private var visibleSongs: [Song] {
        allSongs.filter { song in
            switch filter {
            case "제작곡": return !song.isCover
            case "커버": return song.isCover
            case "듀엣": return song.isCover && song.coverMode == "duet"
            default: return true
            }
        }
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    PageHeading(title: "마이", subtitle: "내 플레이리스트와 공개한 음악을 한곳에")
                    if model.user != nil { Button("로그아웃") { confirmLogout = true }.font(.system(size: 14)).foregroundStyle(AifectDesign.secondaryText).frame(minHeight: 44).disabled(loggingOut) }
                }
                if model.user == nil { LoginPrompt(title: "내 음악과 기록을 한곳에") }
                else {
                    profileCard
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            NavigationLink("내 플레이리스트") { LibraryView() }.buttonStyle(ParityPill(filled: true))
                            NavigationLink("좋아요") { LibraryView(initialSelection: 1) }.buttonStyle(ParityPill())
                            NavigationLink("최근 감상") { LibraryView(initialSelection: 2) }.buttonStyle(ParityPill(color: AifectDesign.secondaryText))
                        }
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 20) {
                            NavigationLink("녹음 초안") { SingView(initialShowDrafts: true) }
                            NavigationLink("수익 · 정산") { CreatorEarningsView() }
                            NavigationLink("제작곡 올리기") { OriginalUploadView() }
                        }.font(.system(size: 13)).frame(minHeight: 44)
                    }
                    Text("저장한 음악은 내 보관함에서, 공개한 음악은 아래에서 확인해요.").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    ParityChips(items: ["전체", "제작곡", "커버", "듀엣"], selection: $filter)
                    HStack {
                        Text("공개 음악 \(visibleSongs.count)곡").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                        Spacer()
                        Button { grid = true } label: { Image(systemName: "square.grid.2x2").frame(width: 44, height: 44).foregroundStyle(grid ? Brand.aqua : AifectDesign.muted) }.accessibilityLabel("그리드 보기")
                        Button { grid = false } label: { Image(systemName: "list.bullet").frame(width: 44, height: 44).foregroundStyle(grid ? AifectDesign.muted : Brand.aqua) }.accessibilityLabel("목록 보기")
                    }
                    if grid { MusicGrid(songs: visibleSongs) }
                    else { ForEach(visibleSongs) { SongRow(song: $0, queue: visibleSongs) } }
                    if visibleSongs.isEmpty && error == nil { ContentUnavailableView("이 탭에 공개한 음악이 없어요", systemImage: "music.note", description: Text("제작곡과 커버를 공개하면 여기에 모여요.")) }
                }
                if let error { RetryCard(message: error) { Task { await load() } } }
            }.padding(20).padding(.bottom, 16)
        }.task(id: model.userID) { await load() }.refreshable { await load() }
            .sheet(isPresented: $account) { AccountView() }
            .confirmationDialog("이 기기에서 로그아웃할까요?", isPresented: $confirmLogout, titleVisibility: .visible) {
                Button("로그아웃", role: .destructive) { Task { loggingOut = true; await model.logout(); data = [:]; music = [:]; loggingOut = false } }
            }
    }
    private var profileCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(profile.displayName(fallback: model.user?.displayName() ?? "내 프로필")).font(.system(size: 25, weight: .bold))
                Spacer()
                Button { account = true } label: { Image(systemName: "gearshape").frame(width: 44, height: 44) }.foregroundStyle(AifectDesign.secondaryText).accessibilityLabel("계정 설정")
            }
            ResponsiveProfilePhoto(person: profile)
            if !profile.string("id").isEmpty { NavigationLink { ProfileGiftRankingView(profileID: profile.string("id")) } label: { Label("선물 랭킹 TOP 50", systemImage: "trophy.fill").font(.system(size: 13)).frame(maxWidth: .infinity, minHeight: 44) } }
            Text("팔로워 \(data.int("follower_count")) · 공개 음악 \(allSongs.count)").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
            HStack(spacing: 6) {
                profileStat("공개곡", allSongs.count)
                NavigationLink { FollowingListView(followers: true) } label: { profileStat("팔로워", data.int("follower_count"), active: true) }
                NavigationLink { FollowingListView() } label: { profileStat("팔로잉", data.int("following_count"), active: true) }
            }.buttonStyle(.plain)
            if !profile.string("bio").isEmpty { Text(profile.string("bio")).font(.system(size: 14)).foregroundStyle(AifectDesign.muted) }
            NavigationLink { ProfileEditorView() } label: { Label("프로필 수정", systemImage: "pencil").frame(maxWidth: .infinity) }.buttonStyle(ParityPill(color: AifectDesign.secondaryText))
        }.padding(20).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
    }
    private func profileStat(_ label: String, _ count: Int, active: Bool = false) -> some View {
        Text("\(label) \(count)").font(.system(size: 13, weight: .semibold)).foregroundStyle(active ? Brand.aqua : AifectDesign.text).frame(maxWidth: .infinity, minHeight: 50).background(Color(aifectHex: 0x222331), in: RoundedRectangle(cornerRadius: 13))
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

struct CrewArtwork: View {
    let crew: [String: Any]
    var body: some View {
        RemoteArtwork(url: crew.string("image_version").isEmpty ? nil : try? Endpoint.url("/media/crew/\(Endpoint.pathID(crew.string("id")))?v=\(Endpoint.query(crew.string("image_version")))")) { $0.resizable().scaledToFill() } placeholder: {
            ZStack {
                LinearGradient(colors: [Color(aifectHex: 0x304653), Color(aifectHex: 0x292741)], startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: "waveform").font(.system(size: 90, weight: .ultraLight)).foregroundStyle(Brand.aqua.opacity(0.08)).rotationEffect(.degrees(-15))
                Image(systemName: "person.3.fill").font(.system(size: 32)).foregroundStyle(Brand.aqua.opacity(0.8))
            }
        }.accessibilityLabel("크루 대표 이미지")
    }
}
struct CrewBanner: View {
    let crew: [String: Any]
    var body: some View { Color.clear.aspectRatio(1.7, contentMode: .fit).overlay { CrewArtwork(crew: crew) }.clipped() }
}
struct CrewDirectoryCard: View {
    let crew: [String: Any]
    var isMine = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                Color.clear.frame(width: 86, height: 96).overlay { CrewArtwork(crew: crew) }.clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 7) {
                    HStack { if isMine { Text("내 크루").font(.system(size: 11, weight: .bold)).foregroundStyle(Brand.pink) }; CrewRecruitingBadge(crew: crew); Spacer(minLength: 0) }
                    Text(crew.string("name")).font(.system(size: 18, weight: .bold)).foregroundStyle(AifectDesign.text).lineLimit(2)
                    Text(crew.string("description").isEmpty ? "음악으로 만나 함께 듣고 불러요." : crew.string("description")).font(.system(size: 13)).foregroundStyle(AifectDesign.muted).lineLimit(2)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 8) {
                Label("LV.\(crew.int("level"))", systemImage: "sparkles").foregroundStyle(Brand.aqua)
                Text("·").foregroundStyle(AifectDesign.muted)
                Text("총 \(crew.int("members"))명 / \(crew.int("capacity"))명").foregroundStyle(AifectDesign.secondaryText)
                Spacer(minLength: 2)
                Image(systemName: "chevron.right").foregroundStyle(AifectDesign.muted)
            }.font(.system(size: 12, weight: .semibold))
            if !crew.string("interests").isEmpty { Text(crew.string("interests")).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1) }
        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(isMine ? Brand.aqua.opacity(0.35) : AifectDesign.stroke.opacity(0.5), lineWidth: 1))
    }
}
struct CrewRecruitingBadge: View {
    let crew: [String: Any]
    private var recruiting: Bool { crew.flag("recruiting") && crew.int("members") < crew.int("capacity") }
    var body: some View { Text(recruiting ? "멤버 모집 중" : "모집 마감").font(.system(size: 10, weight: .semibold)).foregroundStyle(recruiting ? Brand.aqua : AifectDesign.muted).padding(.horizontal, 8).padding(.vertical, 5).background(recruiting ? Brand.aqua.opacity(0.1) : AifectDesign.raised, in: Capsule()) }
}
struct CrewStatistic: View {
    let title: String
    let value: String
    let icon: String
    var body: some View {
        VStack(spacing: 7) {
            Image(systemName: icon).font(.system(size: 14)).foregroundStyle(Brand.aqua)
            Text(value).font(.system(size: 20, weight: .bold)).minimumScaleFactor(0.75).lineLimit(1)
            Text(title).font(.system(size: 10)).foregroundStyle(AifectDesign.muted).multilineTextAlignment(.center).lineLimit(2)
        }.frame(maxWidth: .infinity, minHeight: 96).padding(.horizontal, 3).background(AifectDesign.raised.opacity(0.6), in: RoundedRectangle(cornerRadius: 14))
    }
}
struct CrewLevelProgress: View {
    let crew: [String: Any]
    let rules: [String: Any]
    private var start: Double { rules.objects("levels").first { $0.int("level") == crew.int("level") }?.number("xp") ?? 0 }
    private var next: Double? { (crew["next_xp"] as? NSNumber)?.doubleValue }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text("함께 쌓은 활동"); Spacer(); Text("\(crew.int("xp").formatted()) XP").foregroundStyle(Brand.aqua) }.font(.system(size: 12, weight: .semibold))
            if let next, next > start {
                ProgressView(value: min(max(0, crew.number("xp") - start), next - start), total: next - start).tint(Brand.aqua)
                Text("다음 레벨까지 \(max(0, Int(next) - crew.int("xp")).formatted()) XP").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
            } else { Text("최고 레벨의 크루예요").font(.system(size: 11)).foregroundStyle(AifectDesign.muted) }
        }.padding(.top, 4)
    }
}
struct CrewEmptyCard: View {
    let title: String
    let message: String
    let icon: String
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 25)).foregroundStyle(Brand.aqua).frame(width: 50, height: 58).background(AifectDesign.raised, in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 6) { Text(title).font(.system(size: 15, weight: .semibold)); Text(message).font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }
            Spacer(minLength: 0)
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
    }
}
