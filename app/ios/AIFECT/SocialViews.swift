import SwiftUI
import PhotosUI

struct OfficialAIBadge: View {
    let person: [String: Any]
    var body: some View {
        if person.string("account_type") == "ai_bot" {
            Text("AI").font(.system(size: 9)).foregroundStyle(AifectDesign.violet).padding(.horizontal, 4).padding(.vertical, 1).background(AifectDesign.violet.opacity(0.18), in: RoundedRectangle(cornerRadius: 4)).accessibilityLabel("공식 AI 응원 계정")
        }
    }
}

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
                    if kind == "producer" { PartnerBadge(person: person) }
                    ResponsiveProfilePhoto(person: person, kind: kind)
                    if kind == "producer" { NavigationLink { ProfileGiftRankingView(profileID: id).streamingPage() } label: { Label("선물 랭킹 TOP 50", systemImage: "trophy.fill").font(.system(size: 13)).frame(maxWidth: .infinity, minHeight: 44) } }
                    Text("팔로워 \(data.int("followers")) · 공개 음악 \(data.songs().count + data.songs("covers").count)").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    HStack(spacing: 6) {
                        stat("공개곡", data.songs().count + data.songs("covers").count)
                        stat("팔로워", data.int("followers"))
                        stat("커버", data.songs("covers").count)
                    }
                    if !person.string("bio").isEmpty { Text(person.string("bio")).font(.system(size: 14)).foregroundStyle(AifectDesign.muted) }
                    HStack(spacing: 8) {
                        if kind == "producer", let owner = model.userID, person.string("user_id") == owner {
                            NavigationLink { ProfileEditorView().streamingPage() } label: { Label("프로필 수정", systemImage: "pencil").frame(maxWidth: .infinity) }.buttonStyle(ParityPill())
                        } else {
                            Button(following ? "팔로잉" : "팔로우") { Task { await follow() } }.buttonStyle(ParityPill(color: Brand.pink, filled: true)).disabled(busy)
                            if kind == "producer" {
                                Button("메시지") { if model.requireLogin() { showChat = true } }.buttonStyle(ParityPill(color: AifectDesign.secondaryText))
                                GiftSheetButton(person: GiftRecipient(id: id, name: person.displayName())) { Label("선물", systemImage: "gift") }.buttonStyle(ParityPill(color: Brand.pink))
                            }
                        }
                    }
                }.padding(20).background(MusicSurface()).clipShape(RoundedRectangle(cornerRadius: 24))
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
        }.background(AifectDesign.background)
        .navigationDestination(isPresented: $showChat) { ChatPage(path: "/api/dm/\(Endpoint.pathID(id))", title: person.displayName(), crew: false) }
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
                TextField("아이디 · 활동명", text: $name).textContentType(.nickname).autocorrectionDisabled().accessibilityIdentifier("profile-name")
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
            try await model.loadMe(); model.profileRevision += 1; model.notice = "프로필을 저장했습니다."; error = nil
        } catch { self.error = error.localizedDescription }
    }
}
struct MessagesView: View {
    @EnvironmentObject var model: AppModel
    @State private var filter = "전체"
    @State private var query = ""
    @State private var searching = false
    @State private var working = false
    @State private var clearConfirmation = false
    @State private var error: String?
    @State private var deleteTarget: CatalogItemSelection?
    private var conversations: [[String: Any]] {
        model.inboxConversations.filter { person in
            !person.flag("is_notice") && (query.isEmpty || person.displayName().localizedCaseInsensitiveContains(query) || person.string("last_message").localizedCaseInsensitiveContains(query))
        }
    }
    private var crew: [String: Any]? {
        guard filter == "전체", let crew = model.inboxCrew,
              filter != "안 읽음" || crew.int("unread") > 0,
              query.isEmpty || crew.string("name").localizedCaseInsensitiveContains(query) else { return nil }
        return crew
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Text("메시지").font(.title2.bold()).foregroundStyle(AifectDesign.text).frame(maxWidth: .infinity, alignment: .leading)
                Button { searching.toggle(); if !searching { query = "" } } label: { Image(systemName: "magnifyingglass").frame(width: 44, height: 44) }.accessibilityLabel("대화 검색")
                Menu {
                    Button("모두 읽음") { Task { await manage(clear: false) } }.disabled(working)
                    NavigationLink("알림 기록") { ActivityHistoryView().streamingPage() }
                    Button("내 DM 전체 삭제", role: .destructive) { clearConfirmation = true }.disabled(working)
                } label: { Image(systemName: "line.3.horizontal").frame(width: 44, height: 44) }.accessibilityLabel("메시지 관리")
            }.font(.title3).foregroundStyle(AifectDesign.secondaryText).buttonStyle(.plain).padding(.leading, 16).padding(.trailing, 4).frame(minHeight: 56)
            if searching { TextField("이름 · 메시지 검색", text: $query).padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke)).padding(.horizontal, 14).accessibilityIdentifier("inbox-search") }
            HStack(spacing: 6) {
                StudioSectionTabs(names: ["전체", "공지", "알림"], selection: $filter)
                NavigationLink { NewConversationView().streamingPage() } label: { Image(systemName: "person.badge.plus").frame(width: 48, height: 48) }.accessibilityLabel("새 대화")
            }.padding(.horizontal, 12)
            if model.user == nil { LoginPrompt(title: "로그인하고 메시지 보기") }
            else if filter == "알림" { ActivityHistoryView() }
            else if filter == "공지" { InboxNoticeArchive(channels: model.inboxConversations.filter { $0.flag("is_notice") }) }
            else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(model.inboxConversations.filter { $0.flag("is_notice") }.sorted { $0.number("updated") > $1.number("updated") }, id: \.selfID) { notice in
                            Button { filter = "공지" } label: { InboxNoticeBanner(title: notice.displayName(), bodyText: notice.string("last_message"), date: notice.number("updated")) }.buttonStyle(.plain).padding(.vertical, 4)
                        }
                        if let crew {
                            NavigationLink(value: MessageRoute(id: crew.string("id"), title: crew.string("name"), crew: true)) {
                                HStack(spacing: 12) {
                                    CrewArtwork(crew: crew).frame(width: 56, height: 56).clipShape(Circle())
                                    VStack(alignment: .leading, spacing: 6) { Text(crew.string("name")).font(.headline); Text(ChatSticker.preview(crew.string("last_message", fallback: "크루와 함께하는 대화"))).font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }.frame(maxWidth: .infinity, alignment: .leading)
                                    VStack(spacing: 6) { Text("크루").font(.caption).foregroundStyle(AifectDesign.violet); unread(crew.int("unread")) }
                                }.padding(.horizontal, 14).padding(.vertical, 17).background(Brand.card.opacity(0.8), in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke)).padding(.vertical, 5).contentShape(Rectangle())
                            }.buttonStyle(.plain).accessibilityIdentifier("inbox-crew")
                        }
                        if filter != "크루" {
                            ForEach(conversations, id: \.selfID) { person in
                                HStack(spacing: 12) {
                                    NavigationLink { ProfilePage(id: person.string("id")).streamingPage() } label: { ProfilePhoto(person: person, size: 56, showsLevel: false) }.buttonStyle(.plain).accessibilityLabel("\(person.displayName()) 프로필")
                                    NavigationLink(value: MessageRoute(id: person.string("id"), title: person.displayName(), crew: false)) {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 7) { HStack(spacing: 5) { Text(person.displayName()).font(.system(size: 15, weight: .semibold)); OfficialAIBadge(person: person) }; Text(ChatSticker.preview(person.string("last_message"))).font(.system(size: 13)).foregroundStyle(AifectDesign.muted).lineLimit(1) }.frame(maxWidth: .infinity, alignment: .leading)
                                            VStack(alignment: .trailing, spacing: 6) {
                                                if person.flag("muted") { Image(systemName: "bell.slash").font(.caption) }
                                                if person.number("updated") > 0 { Text(Date(timeIntervalSince1970: person.number("updated")), style: .relative).font(.caption2).foregroundStyle(AifectDesign.muted) }
                                                unread(person.int("unread"))
                                            }
                                        }.contentShape(Rectangle())
                                    }.buttonStyle(.plain).accessibilityIdentifier("inbox-dm-" + person.selfID)
                                    .highPriorityGesture(LongPressGesture().onEnded { _ in deleteTarget = CatalogItemSelection(payload: person) })
                                }.padding(.horizontal, 14).padding(.vertical, 17).background(Brand.card.opacity(0.8), in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke)).padding(.vertical, 5)
                            }
                        }
                        if crew == nil && (filter == "크루" || conversations.isEmpty) { ContentUnavailableView(filter == "안 읽음" ? "읽지 않은 대화가 없어요" : "대화를 시작해보세요", systemImage: "bubble.left.and.bubble.right", description: Text("새 대화에서 팔로잉을 선택하거나 프로필에서 메시지를 보낼 수 있어요.")) }
                        if let error { RetryCard(message: error) { Task { await load() } } }
                    }.padding(.horizontal, 14)
                }.refreshable { await load() }
            }
        }.task(id: model.userID) { await load() }
        .confirmationDialog("대화 기록을 삭제할까요?", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }), titleVisibility: .visible, presenting: deleteTarget) { target in
            Button("삭제", role: .destructive) { Task { await deleteConversation(target.payload) } }
            Button("취소", role: .cancel) { }
        } message: { target in Text(target.payload.displayName() + " 님과의 내 대화 기록만 삭제해요. 상대방 기록은 유지돼요.") }
        .confirmationDialog("내 DM 전체 삭제", isPresented: $clearConfirmation, titleVisibility: .visible) {
            Button("삭제", role: .destructive) { Task { await manage(clear: true) } }.disabled(working)
        } message: { Text("내 기기와 내 목록에서 대화를 삭제해요. 상대방의 기록은 유지되며 새 메시지는 다시 표시돼요.") }
    }
    @ViewBuilder private func unread(_ value: Int) -> some View {
        if value > 0 { Text(value > 99 ? "99+" : "\(value)").font(.caption.bold()).foregroundStyle(Brand.background).padding(7).background(StreamStyle.purple, in: Circle()) }
    }
    private func manage(clear: Bool) async {
        guard let owner = model.userID, !working else { return }; working = true; defer { working = false }
        do {
            _ = try await API.shared.call(clear ? "/api/dm" : "/api/dm/read-all", method: clear ? "DELETE" : "POST", body: [:])
            guard model.userID == owner else { return }
            if clear { ChatCache.removeAll(owner: owner) }
            await load()
        } catch { if model.userID == owner { self.error = error.localizedDescription } }
    }
    private func deleteConversation(_ person: [String: Any]) async {
        guard let owner = model.userID, !working else { return }; working = true; defer { working = false; deleteTarget = nil }
        let path = "/api/dm/" + Endpoint.pathID(person.selfID)
        do {
            _ = try await API.shared.call(path, method: "DELETE")
            guard owner == model.userID else { return }
            ChatCache.remove(owner: owner, path: path)
            model.inboxConversations.removeAll { $0.selfID == person.selfID }; await load()
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
    private func load() async { guard model.userID != nil else { return }; await model.refreshInbox(); error = model.inboxError }
}

struct NewConversationView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = ""
    @State private var people: [[String: Any]] = []
    @State private var loading = false
    @State private var revision = 0
    @State private var error: String?
    var body: some View {
        VStack(spacing: 12) {
            TextField("닉네임 또는 고유 ID", text: $query).font(.system(size: 15)).padding(14)
                .background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke))
                .padding(.horizontal, 14).accessibilityIdentifier("new-conversation-search")
            if loading { ProgressView() }
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(people, id: \.selfID) { person in
                        NavigationLink { ChatPage(path: "/api/dm/\(Endpoint.pathID(person.selfID))", title: person.displayName(), crew: false).streamingPage() } label: {
                            HStack(spacing: 12) {
                                ProfilePhoto(person: person, size: 46, showsLevel: false)
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 5) { Text(person.displayName()).font(.system(size: 15)); OfficialAIBadge(person: person) }
                                    if !person.string("public_id").isEmpty { Text("ID " + person.string("public_id")).font(.system(size: 11)).foregroundStyle(AifectDesign.muted) }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                Image(systemName: "bubble.left").foregroundStyle(Brand.pink)
                            }.padding(14).frame(minHeight: 80).background(Brand.card, in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke))
                        }.buttonStyle(.plain).contentShape(Rectangle()).accessibilityIdentifier("new-conversation-" + person.selfID)
                    }
                    if !loading && people.isEmpty && error == nil { Text(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "닉네임이나 고유 ID를 입력해 친구를 찾아보세요." : "검색 결과가 없어요.").font(.subheadline).foregroundStyle(AifectDesign.muted) }
                    if let error { RetryCard(message: error) { revision += 1 } }
                }.padding(14)
            }.scrollDismissesKeyboard(.interactively)
        }.navigationTitle("새 대화").navigationBarTitleDisplayMode(.inline)
            .task(id: query + "|" + String(revision) + "|" + (model.userID ?? "")) { await search() }
    }
    private func search() async {
        people = []; error = nil; loading = false
        guard let owner = model.userID else { return }
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return }; loading = true
        do {
            try await Task.sleep(for: .milliseconds(250))
            let result = try await API.shared.call("/api/search?q=" + Endpoint.query(term))
            guard !Task.isCancelled, model.userID == owner else { return }
            var seen = Set<String>()
            people = result.objects("producers").filter { SiteWorkspace.validKey($0.selfID) && $0.string("user_id") != owner && $0.selfID != model.user?.string("profile_id") && seen.insert($0.selfID).inserted }
            loading = false
        } catch { if !Task.isCancelled, model.userID == owner { loading = false; self.error = error.localizedDescription } }
    }
}

enum CrewDirectoryFilter {
    static func isOpen(_ row: [String: Any]) -> Bool { row.flag("recruiting") && (row.int("capacity") == 0 || row.int("members") < row.int("capacity")) }
    static func interests(_ row: [String: Any]) -> [String] { row.string("interests").components(separatedBy: CharacterSet(charactersIn: ",·#")).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
    static func rows(_ crews: [[String: Any]], query: String, interest: String, recruitment: String, level: String, onlyMine: Bool, mine: String?, sort: String) -> [[String: Any]] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return crews.filter { row in
            (term.isEmpty || [row.string("name"), row.string("description"), row.string("interests")].joined(separator: " ").localizedCaseInsensitiveContains(term)) &&
            (interest.isEmpty || interests(row).contains(interest)) && (recruitment.isEmpty || isOpen(row) == (recruitment == "open")) &&
            (level.isEmpty || String(row.int("level")) == level) && (!onlyMine || row.selfID == mine)
        }.sorted { a, b in
            switch sort {
            case "recent": return a.number("created") > b.number("created")
            case "members": return a.int("members") > b.int("members")
            case "level": return a.int("level") == b.int("level") ? a.number("xp") > b.number("xp") : a.int("level") > b.int("level")
            default: return a.int("match") == b.int("match") ? a.number("xp") > b.number("xp") : a.int("match") > b.int("match")
            }
        }
    }
}

struct CrewsView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var featuredID: String?
    @State private var featuredVisible = false
    @State private var featuredWidth: CGFloat = 268
    @State private var crews: [[String: Any]] = []
    @State private var query = ""
    @State private var error: String?
    @State private var create = false
    @State private var loading = true
    @State private var mine: String?
    @State private var interest = ""
    @State private var recruitment = ""
    @State private var level = ""
    @State private var onlyMine = false
    @State private var sort = "recommended"
    @State private var grid = true
    @State private var filtering = false
    private var filtered: [[String: Any]] { CrewDirectoryFilter.rows(crews, query: query, interest: interest, recruitment: recruitment, level: level, onlyMine: onlyMine, mine: mine, sort: sort) }
    private var recommended: [[String: Any]] { Array(CrewDirectoryFilter.rows(crews, query: "", interest: "", recruitment: "", level: "", onlyMine: false, mine: mine, sort: "recommended").prefix(5)) }
    private var filterCount: Int { [!interest.isEmpty, !recruitment.isEmpty, !level.isEmpty, onlyMine].filter { $0 }.count }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("함께하는 음악 모임").font(.system(size: 19, weight: .bold))
                        Text("듣고, 부르고, 이야기해요").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    if let mine { NavigationLink("내 크루") { CrewPage(id: mine).streamingPage() }.buttonStyle(ParityPill(filled: true)) }
                    else { Button("크루 만들기") { if model.requireLogin() { create = true } }.buttonStyle(ParityPill(filled: true)).accessibilityLabel("새 크루 만들기") }
                }
                if loading { ProgressView("크루를 찾는 중").frame(maxWidth: .infinity) }
                if !recommended.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("지금 주목할 만한 크루").font(.system(size: 16, weight: .bold)).padding(.horizontal, 14)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) { ForEach(recommended, id: \.selfID) { row in crewLink(row, grid: false, featured: true).frame(width: featuredWidth).id(row.selfID) } }.scrollTargetLayout().padding(.horizontal, 14)
                        }.scrollTargetBehavior(.viewAligned).scrollPosition(id: $featuredID)
                            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { featuredWidth = min(268, max(180, $0 - 44)) }
                        if recommended.count > 1 { HStack(spacing: 6) { ForEach(recommended, id: \.selfID) { row in Circle().fill((featuredID ?? recommended.first?.selfID) == row.selfID ? Brand.pink : AifectDesign.muted.opacity(0.35)).frame(width: 5, height: 5) } }.frame(maxWidth: .infinity).accessibilityHidden(true) }
                    }.padding(.vertical, 16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke))
                        .onAppear { featuredVisible = true }.onDisappear { featuredVisible = false }
                        .task(id: "\(featuredID ?? "")-\(scenePhase)-\(featuredVisible)-\(reduceMotion)") {
                            guard featuredVisible, scenePhase == .active, !reduceMotion, recommended.count > 1 else { return }
                            do { try await Task.sleep(for: .milliseconds(4500)); try Task.checkCancellation() } catch { return }
                            let index = recommended.firstIndex { $0.selfID == featuredID } ?? 0
                            withAnimation { featuredID = recommended[(index + 1) % recommended.count].selfID }
                        }
                }
                HStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(AifectDesign.muted)
                        TextField("크루명 · 관심사 검색", text: $query).submitLabel(.search).accessibilityIdentifier("crew-search")
                    }.font(.system(size: 14)).padding(12).frame(minHeight: 48).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
                    Button { filtering = true } label: { Label(filterCount > 0 ? "\(filterCount)" : "필터", systemImage: "slider.horizontal.3").font(.caption).padding(10).frame(minHeight: 48).overlay(RoundedRectangle(cornerRadius: 12).stroke(filterCount > 0 ? Brand.pink : AifectDesign.stroke)) }.buttonStyle(.plain).accessibilityIdentifier("crew-filters")
                }
                HStack {
                    Text("발견할 크루").font(.system(size: 16, weight: .bold)); Text("\(filtered.count)").foregroundStyle(Brand.pink); Spacer()
                    Button { grid = true } label: { Image(systemName: "square.grid.2x2").frame(width: 44, height: 44).foregroundStyle(grid ? Brand.pink : AifectDesign.muted) }.accessibilityLabel("크루 카드로 보기")
                    Button { grid = false } label: { Image(systemName: "list.bullet").frame(width: 44, height: 44).foregroundStyle(!grid ? Brand.pink : AifectDesign.muted) }.accessibilityLabel("크루 목록으로 보기")
                }
                Picker("정렬", selection: $sort) { Text("추천순").tag("recommended"); Text("최신순").tag("recent"); Text("레벨순").tag("level"); Text("인원순").tag("members") }
                if grid {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) { ForEach(filtered, id: \.selfID) { crewLink($0, grid: true) } }
                } else { ForEach(filtered, id: \.selfID) { crewLink($0, grid: false) } }
                if let error { RetryCard(message: error) { Task { await load() } } }
                else if filtered.isEmpty && !loading { ContentUnavailableView("조건에 맞는 크루가 없어요", systemImage: "person.3", description: Text("검색어나 필터를 바꿔보세요.")) }
                if !crews.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("크루 랭킹").font(.system(size: 16, weight: .bold))
                        Text("레벨순 · 같은 레벨은 누적 경험치순").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
                        ForEach(Array(NativeRedesignLayout.rankedCrews(crews).prefix(5).enumerated()), id: \.element.selfID) { index, row in
                            NavigationLink { CrewPage(id: row.selfID).streamingPage() } label: {
                                HStack(spacing: 10) { Text("\(index + 1)").foregroundStyle(Brand.pink); CrewArtwork(crew: row).frame(width: 44, height: 44).clipShape(Circle()); VStack(alignment: .leading) { Text(row.string("name")); Text("\(row.int("members"))명").font(.caption).foregroundStyle(AifectDesign.muted) }.frame(maxWidth: .infinity, alignment: .leading); Text("LV.\(max(1, row.int("level")))").font(.caption) }.padding(.vertical, 10)
                            }.buttonStyle(.plain)
                        }
                    }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
                }
            }.padding(16).padding(.bottom, 16)
        }.background(AifectDesign.background).scrollDismissesKeyboard(.interactively)
            .navigationTitle("크루").navigationBarTitleDisplayMode(.inline)
            .task(id: model.userID) { await load() }.refreshable { await load() }
            .navigationDestination(isPresented: $create) { CrewEditor() }.onChange(of: create) { _, value in if !value { Task { await load() } } }
            .sheet(isPresented: $filtering) { filters }
    }
    private func crewLink(_ crew: [String: Any], grid: Bool, featured: Bool = false) -> some View {
        NavigationLink { CrewPage(id: crew.selfID).streamingPage() } label: {
            VStack(alignment: .leading, spacing: 10) {
                if grid {
                    Color.clear.aspectRatio(1, contentMode: .fit).overlay { CrewArtwork(crew: crew) }.clipped().clipShape(RoundedRectangle(cornerRadius: 12))
                    crewDescription(crew, grid: true)
                } else {
                    HStack(alignment: .top, spacing: 12) { CrewArtwork(crew: crew).frame(width: 84, height: 84).clipShape(RoundedRectangle(cornerRadius: 12)); crewDescription(crew, grid: false) }
                }
                HStack {
                    let open = CrewDirectoryFilter.isOpen(crew)
                    Text(crew.selfID == mine ? "내 크루" : open ? "모집 중" : "모집 마감").font(.system(size: 10)).foregroundStyle(open ? Brand.aqua : AifectDesign.muted).padding(.horizontal, 7).padding(.vertical, 3).overlay(Capsule().stroke(AifectDesign.stroke))
                    Spacer(); if !grid { Text("자세히 보기").font(.system(size: 11)).foregroundStyle(Brand.pink) }; Image(systemName: "chevron.right").font(.caption).foregroundStyle(Brand.pink)
                }
            }.padding(grid ? 10 : 12).background(Brand.card, in: RoundedRectangle(cornerRadius: grid ? 16 : 14)).overlay(RoundedRectangle(cornerRadius: grid ? 16 : 14).stroke(AifectDesign.stroke))
        }.buttonStyle(.plain).accessibilityIdentifier((featured ? "crew-featured-" : "crew-card-") + crew.selfID)
    }
    private func crewDescription(_ crew: [String: Any], grid: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(crew.string("name")).font(.system(size: grid ? 15 : 16, weight: .bold)).lineLimit(1)
            Text(crew.string("description", fallback: "함께 음악을 나눠요")).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(2, reservesSpace: true)
            Text("\(crew.int("members"))명 · LV.\(max(1, crew.int("level")))").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var filters: some View {
        NavigationStack {
            Form {
                Picker("관심사", selection: $interest) { Text("모든 관심사").tag(""); ForEach(Array(Set(crews.flatMap(CrewDirectoryFilter.interests))).sorted(), id: \.self) { Text($0).tag($0) } }
                Picker("모집 상태", selection: $recruitment) { Text("모든 모집 상태").tag(""); Text("모집 중").tag("open"); Text("모집 마감").tag("closed") }
                Picker("레벨", selection: $level) { Text("모든 레벨").tag(""); ForEach(Array(Set(crews.map { $0.int("level") })).sorted(), id: \.self) { Text("LV.\($0)").tag(String($0)) } }
                Toggle("내 크루만 보기", isOn: $onlyMine).disabled(mine == nil)
                Button("\(filtered.count)개 크루 보기") { filtering = false }.accessibilityIdentifier("crew-filter-apply")
            }.navigationTitle("크루 필터").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("초기화") { interest = ""; recruitment = ""; level = ""; onlyMine = false } } }
        }.presentationDetents([.medium, .large])
    }
    private func load() async {
        let owner = model.userID; loading = true; defer { if !Task.isCancelled { loading = false } }
        do {
            let result = try await API.shared.call("/api/crews?summary=1")
            guard !Task.isCancelled, owner == model.userID else { return }
            crews = result.objects("crews"); mine = result["mine"] as? String; error = nil
        } catch { if !Task.isCancelled, owner == model.userID { self.error = error.localizedDescription } }
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
            VStack(alignment: .leading, spacing: 18) {
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
        }.background(AifectDesign.background).accessibilityIdentifier("crew-content")
            .navigationTitle(crew.string("name", fallback: "크루")).navigationBarTitleDisplayMode(.inline)
            .task(id: id + "|" + (model.userID ?? "guest")) { data = [:]; section = "홈"; await load() }
            .refreshable { await load() }
            .task(id: banner) { await uploadBanner() }
            .navigationDestination(isPresented: $edit) { CrewEditor(id: id, name: crew.string("name"), description: crew.string("description"), interests: crew.string("interests"), recruiting: crew.flag("recruiting")) }.onChange(of: edit) { _, value in if !value { Task { await load() } } }
            .confirmationDialog("크루에서 탈퇴할까요?", isPresented: $leaving, titleVisibility: .visible) { Button("탈퇴", role: .destructive) { Task { await leave() } } } message: { Text("크루장은 다음 멤버에게 이전됩니다. 마지막 멤버가 나가면 크루와 채팅이 삭제됩니다.") }
    }
    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            CrewBanner(crew: crew).overlay(alignment: .bottomTrailing) {
                if owner { PhotosPicker(selection: $banner, matching: .images) { Label("이미지 변경", systemImage: "camera").font(.system(size: 12, weight: .semibold)).padding(12).background(AifectDesign.background.opacity(0.9), in: Capsule()) }.padding(12).disabled(busy) }
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
                    CrewStatistic(title: "총 인원 · 정원 \(crew.int("capacity"))명", value: "\(crew.int("members"))명", icon: "person.2")
                    CrewStatistic(title: "공개 음악", value: "\(data.songs().count)곡", icon: "music.note")
                }
                if !crew.string("interests").isEmpty { Label(crew.string("interests"), systemImage: "music.note.list").font(.system(size: 13)).foregroundStyle(Brand.aqua).lineLimit(2) }
                CrewLevelProgress(crew: crew, rules: data.object("rules"))
            }.padding(18)
        }.background(Brand.card, in: RoundedRectangle(cornerRadius: 22)).clipShape(RoundedRectangle(cornerRadius: 22))
    }
    private var chatEntry: some View {
        Button { model.openCrewMessages(id: id, title: crew.string("name")) } label: {
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
                    NavigationLink { ProfilePage(id: person.string("id")).streamingPage() } label: {
                        VStack(spacing: 8) { ProfilePhoto(person: person, size: 56); Text(person.displayName()).font(.system(size: 13, weight: .semibold)).lineLimit(1); Text(roleTitle(person)).font(.system(size: 11)).foregroundStyle(Brand.aqua) }.frame(width: 94).padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
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
            NavigationLink { ProfilePage(id: person.string("id")).streamingPage() } label: {
                HStack(spacing: 12) { PersonRow(person: person); Spacer(); Text(roleTitle(person)).font(.system(size: 12)).foregroundStyle(Brand.aqua); Image(systemName: "chevron.right").font(.caption).foregroundStyle(AifectDesign.muted) }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 17))
            }.buttonStyle(.plain)
        }
    }
    private var aboutContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("크루 소개").font(.system(size: 21, weight: .bold))
            CrewMembershipGraphic(crew: crew, trackCount: data.songs().count)
            Text(crew.string("description").isEmpty ? "크루 소개가 아직 등록되지 않았어요." : crew.string("description")).font(.system(size: 15)).foregroundStyle(AifectDesign.secondaryText)
            if !crew.string("interests").isEmpty { Label(crew.string("interests"), systemImage: "music.note.list").font(.system(size: 14)).foregroundStyle(Brand.aqua) }
            CrewGrowthGuide(crew: crew, rules: data.object("rules"))
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
        do { _ = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))/settings", method: "PUT", body: ["muted": !data.object("membership").flag("muted")]); await load(); await model.refreshInbox(); error = model.inboxError }
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
    var size: CGFloat = 64
    var showsLevel = true
    private var url: URL? {
        let id = person.string("id", fallback: person.string("profile_id"))
        guard !id.isEmpty, !person.string("image_version").isEmpty else { return nil }
        return try? Endpoint.url("/media/\(kind)/\(Endpoint.pathID(id))?v=\(Endpoint.query(person.string("image_version")))")
    }
    var body: some View {

        RemoteArtwork(url: url) { $0.resizable().aspectRatio(contentMode: .fill) } placeholder: {
            ZStack { AifectDesign.raised; Image(systemName: "person").font(.system(size: size * 0.46, weight: .regular)).foregroundStyle(AifectDesign.secondaryText) }
        }
        .frame(width: size, height: size).background(AifectDesign.raised).clipShape(Circle())
        .overlay {
            if kind == "producer" {
                let frame = CatalogFrame(person: person)
                ZStack {
                    if let url = frame.overlay {
                        RemoteArtwork(url: url, catalog: true) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                        if let effect = frame.effect {
                            RemoteArtwork(url: effect, catalog: true) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                        }
                    } else if person.string("profile_frame") == "crew-outline" {
                        Image("ClanAetherFrame").resizable().scaledToFit()
                    }
                }
                .frame(width: size * frame.scale, height: size * frame.scale)
                .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if PlayerAvatarStyle.showsLevel(kind: kind, size: size, enabled: showsLevel), person["player_xp"] != nil || person["player_level"] != nil {
                let level = min(100, max(1, person.int("player_level") > 0 ? person.int("player_level") : playerLevel(person.int("player_xp"))))
                Text("\(level)").font(.system(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                    .frame(width: level >= 100 ? 29 : 24, height: 20).foregroundStyle(Brand.aqua)
                    .background(AifectDesign.raised, in: Capsule()).overlay(Capsule().stroke(Brand.card, lineWidth: 1))
                    .accessibilityLabel("레벨 \(level)").accessibilityIdentifier("avatar-level")
            }
        }.accessibilityLabel("프로필 사진")

    }
}
struct MyMusicView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var data: [String: Any] = [:]
    @State private var music: [String: Any] = [:]
    @State private var error: String?
    @State private var confirmLogout = false
    @State private var loggingOut = false
    private var profile: [String: Any] { data.object("profile") }
    @State private var section: String
    init(initialActivity: Bool = false) { _section = State(initialValue: initialActivity ? "인벤토리" : "내 작품") }
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
            LazyVStack(alignment: .leading, spacing: 12) {
                if model.user == nil { LoginPrompt(title: "로그인하고 내 작업을 이어가세요.") }
                else {
                    HStack { Text("마이").font(.title2.bold()); Spacer(); NavigationLink { AccountSettingsView().streamingPage() } label: { Image(systemName: "gearshape").frame(width: 44, height: 44) }.accessibilityLabel("계정 설정") }
                    profileCard
                    GeometryReader { bounds in
                        HStack(spacing: 8) {
                            NavigationLink { ProfileEditorView().streamingPage() } label: {
                                Text("프로필 수정").font(.subheadline.bold()).foregroundStyle(Brand.background)
                                    .frame(width: (bounds.size.width - 8) * 0.42, height: 48)
                                    .background(Brand.gradient, in: RoundedRectangle(cornerRadius: 12))
                            }
                            NavigationLink { CreatorWorkView().streamingPage() } label: {
                                HStack(spacing: 6) { Image(systemName: "point.3.connected.trianglepath.dotted"); Text("스튜디오 바로가기"); Image(systemName: "chevron.right") }
                                    .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 48)
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Brand.pink.opacity(0.7)))
                            }
                        }.buttonStyle(.plain)
                    }.frame(height: 48)
                    CatalogTabs(names: ["내 작품", "내 보관함", "인벤토리"], selection: $section)
                    if section == "내 작품" {
                        let pid = profile.string("id")
                        if !pid.isEmpty {
                            NavigationLink { ProfilePage(id: pid).streamingPage() } label: { HStack { Text("갤러리").font(.headline); Spacer(); Text("전체보기").font(.caption) } }
                            HStack {
                                ForEach(0..<4) { i in
                                    NavigationLink { ProfilePage(id: pid).streamingPage() } label: {
                                        Color.clear.aspectRatio(1, contentMode: .fit).overlay {
                                            let gallery = music.objects("gallery")
                                            if gallery.indices.contains(i), let url = URL(string: gallery[i].string("url"), relativeTo: Endpoint.origin)?.absoluteURL {
                                                RemoteArtwork(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                                            } else { Image(systemName: "plus") }
                                        }.clipShape(RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
                                    }
                                }
                            }
                        }
                        Text("제작곡").font(.headline)
                        MusicGrid(songs: allSongs.filter { !$0.isCover })
                        if !allSongs.contains(where: { !$0.isCover }) { Text("등록된 제작곡이 없어요.").font(.caption) }
                        Text("커버 · 듀엣 · 더빙").font(.headline)
                        OwnedWorksGrid(songs: allSongs.filter { $0.isCover }, dubbings: music.objects("dubbings"), reload: load)
                        Text("소속 아티스트").font(.headline)
                        ForEach(music.objects("artists"), id: \.selfID) { item in NavigationLink(item.string("name")) { ProfilePage(id: item.selfID, kind: "artist").streamingPage() } }
                    } else if section == "내 보관함" {
                        VStack(spacing: 12) {
                            libraryEntry("좋아요", icon: "heart", selection: 1, count: "\(model.likes.count)곡")
                            libraryEntry("최근 감상", icon: "clock", selection: 2, count: "\(model.history.count)곡")
                            libraryEntry("플레이리스트", icon: "music.note.list", selection: 0, count: "\(model.playlists.count)개")
                        }.task(id: model.userID) { await model.loadLibrary() }
                        Button("레벨 · 계정 관리") { account = true }.font(.caption).frame(maxWidth: .infinity, minHeight: 44)
                        if let error = model.libraryError { RetryCard(message: error) { Task { await model.loadLibrary() } } }
                    } else {
                        MyInventoryContent(profileID: profile.string("id")).id(model.userID)
                    }
                }
                if let error { RetryCard(message: error) { Task { await load() } } }
            }.padding(14).padding(.bottom, 16)
        }.task(id: "\(model.userID ?? "guest"):\(model.profileRevision):\(model.selectedTab)") { if model.selectedTab == 4 { await load() } }.refreshable { await load(); await model.loadLibrary(); model.walletRevision += 1 }
            .navigationDestination(isPresented: $account) { AccountView() }
    }
    private func libraryEntry(_ title: String, icon: String, selection: Int, count: String) -> some View {
        NavigationLink { LibraryView(initialSelection: selection).navigationTitle(title).streamingPage() } label: {
            HStack(spacing: 18) {
                Image(systemName: icon).font(.system(size: 25)).foregroundStyle(Brand.pink).frame(width: 26)
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.system(size: 14, weight: .semibold))
                    Text(model.libraryLoaded ? count : model.libraryError == nil ? "불러오는 중" : "다시 불러오기").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 14)).foregroundStyle(AifectDesign.secondaryText)
            }.padding(.horizontal, 16).padding(.vertical, 15).frame(maxWidth: .infinity, minHeight: 74)
                .background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke))
        }.buttonStyle(.plain).accessibilityIdentifier("music-shortcut-\(selection)")
    }
    private var profileCard: some View {
        let pid = profile.string("id")
        let crew = music.object("crew")
        let crewID = crew.string("id")
        let codes = [music.string("public_id"), profile.string("public_id"), model.user?.string("public_id") ?? ""]
        let publicID = codes.first { $0.count == 7 && $0.range(of: "^[A-Z]{3}[0-9]{4}$", options: .regularExpression) != nil }
        return VStack(alignment: .leading, spacing: 12) {
            (typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(spacing: 12))) {
                NavigationLink { ProfilePage(id: pid).streamingPage() } label: { ProfilePhoto(person: profile, size: 96) }
                    .buttonStyle(.plain).disabled(pid.isEmpty).accessibilityLabel("프로필 보기")
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 0) {
                        Text(profile.displayName(fallback: model.user?.displayName() ?? "내 프로필"))
                            .font(.system(size: 23, weight: .bold)).lineLimit(2).accessibilityIdentifier("my-profile-name")
                        NavigationLink { ProfileEditorView().streamingPage() } label: {
                            Image(systemName: "pencil").font(.caption).foregroundStyle(AifectDesign.violet).frame(width: 32, height: 44)
                        }.buttonStyle(.plain).accessibilityLabel("아이디 · 프로필 변경").accessibilityIdentifier("edit-my-profile")
                    }
                    if let publicID {
                        Button("ID " + publicID + "  ⧉") {
                            UIPasteboard.general.string = publicID; model.notice = "ID를 복사했어요."
                        }.font(.caption2).frame(minHeight: 26)
                    } else { Text("ID 발급 확인 중").font(.caption2).foregroundStyle(AifectDesign.muted) }
                    if SiteWorkspace.validKey(crewID) {
                        NavigationLink(crew.string("name")) { CrewPage(id: crewID).streamingPage() }.font(.caption)
                    } else { NavigationLink("소속 크루 없음") { CrewsView().streamingPage() }.font(.caption) }
                    PartnerBadge(person: profile)
                }.frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 2) {
                    Button { account = true } label: { Image(systemName: "gearshape").font(.title3).frame(width: 44, height: 44) }
                        .accessibilityLabel("계정 관리")
                    NavigationLink { ProfileGiftRankingView(profileID: pid).streamingPage() } label: {
                        Label("선물 랭킹", systemImage: "star").font(.caption2).frame(minHeight: 44)
                    }.disabled(pid.isEmpty).accessibilityIdentifier("my-gift-ranking")
                }.buttonStyle(.plain)
            }
            HStack(spacing: 0) {
                NavigationLink { FollowingListView(followers: true).streamingPage() } label: {
                    streamingStat("팔로워", (music["followers"] as? NSNumber)?.intValue ?? data.int("follower_count"))
                }
                Divider().frame(height: 28)
                NavigationLink { FollowingListView().streamingPage() } label: {
                    streamingStat("팔로잉", (music["following_count"] as? NSNumber)?.intValue ?? data.int("following_count"))
                }
                Divider().frame(height: 28)
                Button { section = "내 작품" } label: {
                    streamingStat("공개곡", (music["public_track_count"] as? NSNumber)?.intValue ?? allSongs.count)
                }
            }.buttonStyle(.plain)
        }.padding(.top, 4).padding(.bottom, 2)
    }
    private func streamingStat(_ title: String, _ count: Int) -> some View {
        VStack(spacing: 3) { Text("\(count)").font(.system(size: 21, weight: .semibold)); Text(title).font(.caption).foregroundStyle(AifectDesign.muted) }
            .frame(maxWidth: .infinity, minHeight: 50).foregroundStyle(AifectDesign.text)
    }
    private func profileStat(_ label: String, _ count: Int, active: Bool = false) -> some View {
        Text("\(label) \(count)").font(.system(size: 13, weight: .semibold)).foregroundStyle(active ? Brand.aqua : AifectDesign.text).frame(maxWidth: .infinity, minHeight: 50).background(Color(aifectHex: 0x222331), in: RoundedRectangle(cornerRadius: 13))
    }
    private func load() async {
        guard let owner = model.userID else { data = [:]; music = [:]; return }
        do {
            let value = try await API.shared.call("/api/me/profile")
            let id = value.object("profile").string("id")
            let tracks = id.isEmpty ? [:] : try await API.shared.call("/api/producers/\(Endpoint.pathID(id))?dashboard=1")
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
                if !id.isEmpty { NavigationLink { ProfilePage(id: id, kind: person.string("kind", fallback: "producer")).streamingPage() } label: { PersonRow(person: person.merging(["id": id]) { _, new in new }) } }
                else { NavigationLink { ListenerProfileView(userID: person.string("user_id")).streamingPage() } label: { PersonRow(person: person) } }
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
                Text("\(crew.int("xp")) XP · \(crew.int("members"))명").foregroundStyle(AifectDesign.secondaryText)
                Spacer(minLength: 2)
                Image(systemName: "chevron.right").foregroundStyle(AifectDesign.muted)
            }.font(.system(size: 12, weight: .semibold))
            if !crew.string("interests").isEmpty { Text(crew.string("interests")).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1) }
        }.padding(16).background(MusicSurface()).clipShape(RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(isMine ? Brand.aqua.opacity(0.35) : AifectDesign.stroke.opacity(0.5), lineWidth: 1))
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
struct CrewLevelBadge: View {
    let level: Int
    var size: CGFloat = 68
    private var icon: String { ["leaf.fill", "waveform", "star.fill", "crown.fill", "trophy.fill"][max(0, min(4, level - 1))] }
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28).fill(LinearGradient(colors: [Brand.aqua.opacity(0.24), AifectDesign.violet.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing))
            RoundedRectangle(cornerRadius: size * 0.28).stroke(Brand.aqua.opacity(0.3), lineWidth: 1)
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: size * 0.29, weight: .semibold)).foregroundStyle(Brand.gradient)
                Text("LV.\(level)").font(.system(size: size * 0.19, weight: .heavy)).foregroundStyle(AifectDesign.text)
            }
        }.frame(width: size, height: size).accessibilityElement(children: .ignore).accessibilityLabel("크루 레벨 \(level)")
    }
}
struct CrewLevelProgress: View {
    let crew: [String: Any]
    let rules: [String: Any]
    private var start: Double { rules.objects("levels").first { $0.int("level") == crew.int("level") }?.number("xp") ?? 0 }
    private var next: Double? { (crew["next_xp"] as? NSNumber)?.doubleValue }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                CrewLevelBadge(level: crew.int("level"))
                VStack(alignment: .leading, spacing: 5) {
                    Text("함께 키우는 우리 크루").font(.system(size: 15, weight: .bold))
                    Text("\(crew.int("xp").formatted()) XP").font(.system(size: 24, weight: .bold)).monospacedDigit().foregroundStyle(Brand.aqua)
                    Text("음악과 이야기가 쌓일수록 성장해요").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
                }
            }
            if let next, next > start {
                ProgressView(value: min(max(0, crew.number("xp") - start), next - start), total: next - start).tint(Brand.aqua).scaleEffect(x: 1, y: 2)
                    .accessibilityLabel("다음 크루 레벨 진행률").accessibilityIdentifier("crew-xp-progress")
                HStack {
                    Text("LV.\(crew.int("level"))")
                    Spacer()
                    Text("LV.\(crew.int("level") + 1)까지 \(max(0, Int(next) - crew.int("xp")).formatted()) XP")
                }.font(.system(size: 11, weight: .medium)).foregroundStyle(AifectDesign.secondaryText)
            } else if rules.objects("levels").last?.int("level") == crew.int("level") {
                Label("최고 레벨에 도달했어요", systemImage: "checkmark.seal.fill").font(.system(size: 13)).foregroundStyle(Brand.aqua)
            }
        }.padding(16).background(LinearGradient(colors: [Color(aifectHex: 0x20343A), Color(aifectHex: 0x242437)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 18))
    }
}
struct CrewGrowthGuide: View {
    let crew: [String: Any]
    let rules: [String: Any]
    private let activities = [("publishedTrack", "music.note", "음악 공개", "공개한 곡마다"), ("receivedGold", "gift.fill", "골드 선물 받기", "받은 골드 1개마다"), ("dailyChat", "bubble.left.and.bubble.right.fill", "첫 대화 나누기", "하루 첫 크루 채팅")]
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Divider().overlay(AifectDesign.stroke)
            Text("함께 성장하는 방법").font(.system(size: 20, weight: .bold))
            Text("좋아하는 음악을 나누고 이야기를 이어가면 크루 경험치가 쌓여요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
            ForEach(activities, id: \.0) { item in
                if rules[item.0] != nil {
                    HStack(spacing: 14) {
                        Image(systemName: item.1).font(.system(size: 23)).foregroundStyle(Brand.pink).frame(width: 54, height: 54).background(Brand.pink.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                        VStack(alignment: .leading, spacing: 4) { Text(item.2).font(.system(size: 14, weight: .semibold)); Text(item.3).font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }
                        Spacer(minLength: 4)
                        Text("+\(rules.int(item.0)) XP").font(.system(size: 15, weight: .bold)).foregroundStyle(Brand.aqua)
                    }
                }
            }
            Text("레벨이 오르면 더 많은 친구와").font(.system(size: 18, weight: .bold)).padding(.top, 10)
            ForEach(rules.objects("levels").indices, id: \.self) { index in
                let level = rules.objects("levels")[index]
                HStack(spacing: 14) {
                    CrewLevelBadge(level: level.int("level"), size: 52)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("최대 \(level.int("capacity"))명이 함께해요").font(.system(size: 14, weight: .semibold))
                        Text("누적 \(level.int("xp").formatted()) XP").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    }
                    Spacer(minLength: 0)
                    if level.int("level") == crew.int("level") { Text("현재").font(.system(size: 11, weight: .bold)).foregroundStyle(Brand.aqua) }
                    else if level.int("level") < crew.int("level") { Image(systemName: "checkmark.circle.fill").foregroundStyle(Brand.aqua) }
                }.padding(12).background(level.int("level") == crew.int("level") ? Brand.aqua.opacity(0.08) : AifectDesign.raised.opacity(0.5), in: RoundedRectangle(cornerRadius: 18))
            }
        }
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

// Shared server ledger; the app never submits an XP balance or grants an item.
private func playerLevel(_ xp: Int) -> Int { PlayerAvatarStyle.level(xp) }
private struct PlayerLevelCard: View {
    let xp: Int
    var showsInventory = false
    private var level: Int { playerLevel(xp) }
    private var next: Int { 50 * level * (level + 1) }
    private var floor: Int { 50 * level * (level - 1) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("레벨 \(level)").font(.system(size: 18, weight: .bold)); Spacer(); Text("\(xp) XP").font(.system(size: 14)).foregroundStyle(Brand.aqua) }
            ProgressView(value: level >= 100 ? 1 : Double(xp - floor) / Double(next - floor)).tint(Brand.aqua)
            Text(level >= 100 ? "최고 레벨에 도달했어요." : "다음 레벨까지 \(next - xp) XP").font(.caption).foregroundStyle(AifectDesign.muted)
            if showsInventory { HStack { Text("아이템 보관함"); Spacer(); Image(systemName: "chevron.right") }.font(.subheadline).foregroundStyle(Brand.aqua).frame(minHeight: 32) }
        }.padding(16).background(MusicSurface()).clipShape(RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke, lineWidth: 1))
    }
}
struct PlayerInventoryView: View {
    @EnvironmentObject var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var profile: [String: Any] = [:]
    @State private var error: String?
    @State private var busy = false
    @State private var decoration: CatalogItemSelection?
    private var items: [[String: Any]] { data.objects("inventory") }
    private var rewards: [[String: Any]] { data.objects("rewards") }
    private var decorations: [[String: Any]] {
        var seen = Set<String>()
        return (data.objects("stored_decorations") + data.objects("decorations")).filter { seen.insert($0.selfID).inserted }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if model.user == nil { LoginPrompt(title: "내 아이템 보관함") }
                else if data.isEmpty && error == nil { ProgressView() }
                else if !data.isEmpty {
                    NavigationLink { ItemShopView().streamingPage() } label: { StreamingEntry(title: "상점", caption: "선물 · 액자 · 토크룸 배경", icon: "bag") }.buttonStyle(.plain)
                    Text("프레임").font(.system(size: 16, weight: .semibold))
                    if items.isEmpty { ContentUnavailableView("첫 액자를 만나보세요", systemImage: "person.2", description: Text("크루에 가입하면 전용 장식 액자를 무료로 드려요.")); NavigationLink("크루 둘러보기") { CrewsView() } }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                        ForEach(items.indices, id: \.self) { index in itemCard(items[index]) }
                    }
                    if !decorations.isEmpty {
                        Text("액자 · 토크룸 배경").font(.system(size: 16, weight: .semibold))
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                            ForEach(decorations, id: \.selfID) { item in
                                let product = item.object("product").isEmpty ? item : item.object("product")
                                Button { decoration = CatalogItemSelection(payload: item) } label: {
                                    VStack(spacing: 6) {
                                        DecorationArtwork(product: product).frame(height: 80)
                                        Text(product.string("name")).font(.system(size: 12)).lineLimit(2).frame(height: 36)
                                        Text(Self.decorationStatus(item)).font(.system(size: 11)).foregroundStyle(Brand.aqua)
                                    }.frame(maxWidth: .infinity).padding(8).background(Brand.card, in: RoundedRectangle(cornerRadius: 12)).contentShape(Rectangle())
                                }.buttonStyle(.plain).disabled(busy || !item.flag("available") || !(item.flag("stored") || item.string("source") == "decoration_stock")).accessibilityIdentifier("inventory-decoration-" + item.selfID)
                            }
                        }
                    }
                    NavigationLink { OwnedGiftInventoryView().streamingPage() } label: { StreamingEntry(title: "보유 선물", caption: "다른 회원에게 선물 보내기", icon: "gift") }.buttonStyle(.plain)
                    DisclosureGroup("레벨 · 활동 보상") {
                        PlayerLevelCard(xp: data.object("player").int("xp"))
                        if !rewards.isEmpty {
                            Text("달성할 수 있는 보상").font(.headline)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) { ForEach(rewards.indices, id: \.self) { index in itemCard(rewards[index]) } }
                        }
                        Text("이렇게 레벨이 올라요").font(.headline)
                        ForEach(data.objects("rules").indices, id: \.self) { index in
                            let rule = data.objects("rules")[index]
                            HStack { VStack(alignment: .leading, spacing: 5) { Text(rule.string("label")); Text(rule.string("limit")).font(.caption).foregroundStyle(AifectDesign.muted) }; Spacer(); Text("+\(rule.int("xp")) XP").foregroundStyle(Brand.aqua) }.font(.subheadline)
                        }
                        Text("매일 활동은 한국 시간 자정에 새로 시작해요. 기존 공개곡도 반영되며 같은 곡의 경험치는 한 번만 지급돼요.").font(.caption).foregroundStyle(AifectDesign.muted)
                    }
                }
                if let error { RetryCard(message: error) { Task { await load() } } }
            }.padding(20)
        }.background(AifectDesign.background).navigationTitle("아이템 보관함").navigationBarTitleDisplayMode(.inline).task(id: model.userID) { data = [:]; profile = [:]; error = nil; decoration = nil; await load() }.refreshable { await load() }
            .sheet(item: $decoration) { selection in
                DecorationUseView(item: selection.payload) { Task { await load() } }.environmentObject(model)
            }
    }
    private func itemCard(_ item: [String: Any]) -> some View {
        var preview = profile
        preview["profile_frame"] = item.string("item_key")
        preview["profile_frame_artwork"] = item.string("artwork")
        preview["profile_frame_display"] = item["display"]
        let owned = item["owned"] as? Bool ?? true
        preview["player_xp"] = data.object("player").int("xp")
        return Button { Task { await equip(item) } } label: {
            VStack(spacing: 6) {
                ProfilePhoto(person: preview, size: 56).frame(height: 76)
                Text(item.string("name")).font(.system(size: 12)).lineLimit(2).frame(height: 40)
                Text(item.flag("equipped") ? "장착 중" : owned ? "장착" : "달성 보상").font(.system(size: 11)).foregroundStyle(item.flag("equipped") ? Brand.pink : AifectDesign.muted)
            }.frame(maxWidth: .infinity).padding(8).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(item.flag("equipped") ? Brand.pink : AifectDesign.stroke)).contentShape(Rectangle())
        }.buttonStyle(.plain).disabled(!owned || busy || !item.flag("available")).accessibilityIdentifier("inventory-item-" + item.string("item_key"))
            .accessibilityValue(item.flag("equipped") ? "장착 중" : owned ? "장착 가능" : "미보유")
    }
    static func decorationStatus(_ item: [String: Any]) -> String {
        if item.flag("stored") || item.string("source") == "decoration_stock" { return item.flag("available") ? "보관 중" : "사용 보류" }
        if !item.flag("available") { return item.number("expires_at") > 0 && item.number("expires_at") <= Date().timeIntervalSince1970 ? "기간 만료" : "사용 불가" }
        if item.object("product").string("kind", fallback: item.string("kind")) == "PROFILE_FRAME" { return item.flag("equipped") ? "장착 중" : "사용 가능" }
        return item.string("source") == "decoration" || item.flag("active") || item.flag("applied") || item.flag("equipped") ? "적용 중" : "사용 가능"
    }
    private func load() async {
        guard let owner = model.userID else { data = [:]; profile = [:]; return }
        do {
            async let state = API.shared.call("/api/me/player")
            async let person = API.shared.call("/api/me/profile")
            let (value, user) = try await (state, person)
            guard model.userID == owner, !Task.isCancelled else { return }
            data = value; profile = user.object("profile"); error = nil
        } catch { if !Task.isCancelled && model.userID == owner { self.error = error.localizedDescription } }
    }
    private func equip(_ item: [String: Any]) async {
        guard let owner = model.userID, !busy else { return }
        busy = true; defer { busy = false }
        do {
            let target: Any = item.flag("equipped") ? NSNull() : item.string("id")
            let value = try await API.shared.call("/api/me/player/equipment", method: "PUT", body: ["frame_inventory_id": target])
            guard model.userID == owner, !Task.isCancelled else { return }
            data = value; error = nil; model.profileRevision += 1
        } catch { if model.userID == owner { self.error = error.localizedDescription } }
    }
}

struct InboxNoticeBanner: View {
    let title: String, bodyText: String
    let date: Double
    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: "megaphone").font(.title3).foregroundStyle(Brand.aqua)
            VStack(alignment: .leading, spacing: 4) {
                HStack { Text(title).font(.system(size: 15, weight: .bold)).lineLimit(1); Spacer(); if date > 0 { Text(Date(timeIntervalSince1970: date), format: .dateTime.month().day()).font(.system(size: 10)).foregroundStyle(AifectDesign.muted) } }
                Text(bodyText).font(.system(size: 12)).foregroundStyle(AifectDesign.secondaryText).lineLimit(1)
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(AifectDesign.muted)
        }.padding(12).frame(minHeight: 60).background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke))
    }
}

struct InboxNoticeArchive: View {
    @EnvironmentObject private var model: AppModel
    let channels: [[String: Any]]
    @State private var entries: [[String: Any]] = []
    @State private var selected: CatalogItemSelection?
    @State private var error: String?
    @State private var loading = false
    @State private var depth = 1
    @State private var hasMore = false
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 7) {
                ForEach(entries, id: \.selfID) { row in
                    Button { selected = CatalogItemSelection(payload: row) } label: { InboxNoticeBanner(title: row.string("title"), bodyText: row.string("body"), date: row.number("created")) }.buttonStyle(.plain)
                }
                if loading { ProgressView() }
                if let error { RetryCard(message: error) { Task { await load() } } }
                if entries.isEmpty && !loading && error == nil { Text("등록된 공지가 없어요").foregroundStyle(AifectDesign.muted).padding() }
                if hasMore { Button("이전 공지 더 보기") { depth += 1 } }
            }.padding(12)
        }.task(id: "\(model.userID ?? "guest")|\(depth)|" + channels.map { $0.selfID + $0.string("last_message") }.joined()) { await load() }
            .navigationDestination(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } })) {
                if let item = selected { ScrollView { VStack(alignment: .leading, spacing: 16) { Text(item.payload.string("title")).font(.title2.bold()); Text(item.payload.string("body")).font(.body).textSelection(.enabled) }.frame(maxWidth: .infinity, alignment: .leading).padding(20) }.navigationTitle("공지").streamingPage()
                    .task {
                        if !item.payload.string("campaign").isEmpty { _ = try? await API.shared.call("/api/notices/welcome", method: "PATCH", body: ["campaign_id": item.payload.string("campaign")]) }
                        else { _ = try? await API.shared.call("/api/dm/" + Endpoint.pathID(item.payload.string("channel")), method: "PATCH") }
                        await model.refreshInbox()
                    } }
            }
    }
    private func load() async {
        let owner = model.userID; guard let owner else { entries = []; return }
        loading = true; error = nil; hasMore = false
        do {
            var result: [[String: Any]] = []
            for channel in channels {
                let id = channel.selfID
                if channel.string("notice_type") == "welcome" {
                    let data = try await API.shared.call("/api/notices/welcome")
                    let guide = data.object("guide")
                    let paragraphs = ([guide.string("greeting")] + (guide["intro"] as? [String] ?? []) + guide.objects("sections").map { $0.string("title") + "\n" + (($0["paragraphs"] as? [String]) ?? ($0["body"] as? [String]) ?? [$0.string("body")]).joined(separator: "\n") } + (guide["closing"] as? [String] ?? [])).filter { !$0.isEmpty }.joined(separator: "\n\n")
                    result.append(["id": id, "channel": id, "title": "아이팩트 안내", "body": paragraphs, "created": data.number("created"), "campaign": data.string("campaign_id")]); continue
                }
                var cursor: Int?
                for pageIndex in 0..<depth {
                    let data = try await API.shared.call("/api/dm/" + Endpoint.pathID(id) + (cursor.map { "?before=\($0)" } ?? ""))
                    try Task.checkCancellation(); guard owner == model.userID else { return }
                    let messages = data.objects("messages").filter { $0.string("recipient_id").isEmpty || $0.string("recipient_id") == owner }
                    for message in messages {
                        result.append(["id": id + "/" + message.selfID, "channel": id, "title": message.string("title", fallback: channel.displayName()), "body": message.string("body"), "created": message.number("created")])
                    }
                    if pageIndex == 0 && messages.isEmpty { result.append(["id": id, "channel": id, "title": channel.displayName(), "body": channel.string("last_message"), "created": channel.number("updated")]) }
                    guard data.flag("has_more"), let before = messages.map({ $0.int("sequence") }).filter({ $0 > 0 }).min(), cursor == nil || before < cursor! else { break }
                    cursor = before; if pageIndex == depth - 1 { hasMore = true }
                }
            }
            guard owner == model.userID else { return }
            var ids = Set<String>(); entries = result.filter { ids.insert($0.selfID).inserted }.sorted { $0.number("created") > $1.number("created") }; loading = false
        } catch is CancellationError { } catch { if owner == model.userID { self.error = error.localizedDescription; loading = false } }
    }
}

struct OwnedWork: Identifiable {
    let song: Song?
    let dubbing: [String: Any]?
    var id: String { song.map { "song-" + $0.id } ?? "dubbing-" + (dubbing?.selfID ?? "") }
    var title: String { song?.title ?? dubbing?.string("title") ?? "" }
    var label: String { song.map { $0.coverMode == "duet" ? "듀엣" : "커버" } ?? "더빙" }
}

@MainActor enum OwnedWorkDeletion {
    static func remove(_ works: [OwnedWork], api: API, deleted: (String) -> Void) async throws -> Set<String> {
        let revision = api.sessionRevision
        var failed = Set<String>()
        for work in works {
            try Task.checkCancellation(); guard revision == api.sessionRevision else { throw CancellationError() }
            do {
                if let song = work.song { _ = try await api.call("/api/uploads/" + Endpoint.pathID(song.id), method: "DELETE") }
                else if let project = work.dubbing {
                    let path = "/api/dubbing/projects/" + Endpoint.pathID(project.selfID)
                    let fresh = try await api.call(path).object("project")
                    guard fresh.flag("isOwner") else { throw APIError(status: 403, message: "내 작품만 삭제할 수 있어요.") }
                    _ = try await api.call(path, method: "DELETE", body: ["revision": fresh.int("revision")])
                }
                deleted(work.id)
            } catch is CancellationError { throw CancellationError() }
            catch { failed.insert(work.id) }
        }
        return failed
    }
}

struct OwnedWorksGrid: View {
    @EnvironmentObject private var model: AppModel
    let songs: [Song]
    let dubbings: [[String: Any]]
    let reload: () async -> Void
    @State private var selected = Set<String>()
    @State private var removed = Set<String>()
    @State private var confirming = false
    @State private var deleting = false
    @State private var error: String?
    @State private var songDestination: Song?
    @State private var dubbingDestination: SiteWorkspace?
    private var works: [OwnedWork] { (songs.map { OwnedWork(song: $0, dubbing: nil) } + dubbings.map { OwnedWork(song: nil, dubbing: $0) }).filter { !removed.contains($0.id) } }
    var body: some View {
        VStack(spacing: 10) {
            if !selected.isEmpty {
                HStack { Text("\(selected.count)개 선택"); Spacer(); Button("취소") { selected = [] }; Button("삭제", role: .destructive) { confirming = true } }.disabled(deleting)
            }
            if deleting { ProgressView() }
            if let error { Text(error).font(.caption).foregroundStyle(AifectDesign.muted) }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                ForEach(works) { work in
                    VStack(alignment: .leading, spacing: 6) {
                        Color.clear.aspectRatio(1, contentMode: .fit).overlay { GeometryReader { geo in
                            if let song = work.song { CoverArt(song: song, size: geo.size.width) }
                            else if let row = work.dubbing { DubbingCover(row: row).frame(width: geo.size.width, height: geo.size.height).clipped() }
                        } }.clipShape(RoundedRectangle(cornerRadius: 12)).overlay(alignment: .topTrailing) { if !selected.isEmpty { Image(systemName: selected.contains(work.id) ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(Brand.aqua).padding(8) } }
                        Text(work.title).font(.subheadline.bold()).lineLimit(1)
                        Text(work.label).font(.caption).foregroundStyle(AifectDesign.muted)
                    }.contentShape(Rectangle()).onTapGesture { if !selected.isEmpty { toggle(work.id) } else if let song = work.song { songDestination = song } else if let row = work.dubbing { dubbingDestination = SiteWorkspace(area: "dubbing", key: row.selfID, title: work.title) } }
                        .onLongPressGesture { if !deleting { toggle(work.id) } }.accessibilityElement(children: .combine).accessibilityAddTraits(.isButton).accessibilityIdentifier("owned-work-" + work.id)
                        .accessibilityAction(named: "선택") { toggle(work.id) }.disabled(deleting)
                }
            }
        }.confirmationDialog("선택한 \(selected.count)개 작품을 삭제할까요?", isPresented: $confirming, titleVisibility: .visible) {
            Button("삭제", role: .destructive) { Task { await remove() } }
        } message: { Text("삭제한 작품은 복구할 수 없어요.") }
            .navigationDestination(item: $songDestination) { TrackDetailView(song: $0).streamingPage() }
            .navigationDestination(item: $dubbingDestination) { WorkspacePage(space: $0) }
            .onChange(of: model.userID) { _, _ in selected = []; removed = []; error = nil }
    }
    private func toggle(_ id: String) { if selected.contains(id) { selected.remove(id) } else { selected.insert(id) } }
    private func remove() async {
        let owner = model.userID; guard owner != nil, !deleting else { return }
        deleting = true; error = nil; defer { deleting = false }
        do {
            let failed = try await OwnedWorkDeletion.remove(works.filter { selected.contains($0.id) }, api: .shared) { id in removed.insert(id); selected.remove(id) }
            guard owner == model.userID else { return }
            selected = failed
            if !failed.isEmpty { error = "\(failed.count)개 작품을 삭제하지 못했어요. 다시 시도해주세요." }
            await reload()
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
}
