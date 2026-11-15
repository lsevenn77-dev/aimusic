import KakaoSDKUser
import SwiftUI
import AuthenticationServices
import PhotosUI

struct LoginView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var register = false
    @State private var error: String?
    @State private var loadingMethods = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("나의 음악, 나의 목소리").font(.title2.bold())
                    Text("기존 AIFECT 계정으로 이어서 이용하세요.").foregroundStyle(.secondary)
                }
                if loadingMethods && !model.emailEnabled && model.providers.isEmpty {
                    Section { ProgressView("로그인 방법을 불러오는 중") }
                }
                if model.emailEnabled {
                    Section(register ? "새 계정 만들기" : "이메일로 로그인") {
                        if register { TextField("공개 아이디", text: $name).textContentType(.nickname).autocorrectionDisabled() }
                        TextField("이메일", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField("비밀번호", text: $password).textContentType(register ? .newPassword : .password)
                        Button(register ? "가입하기" : "로그인") {
                            error = nil
                            Task { do { try await model.login(email: email, password: password, name: name, register: register) } catch { self.error = error.localizedDescription } }
                        }.disabled(email.isEmpty || password.isEmpty || (register && name.isEmpty) || model.authBusy)
                        Button(register ? "기존 계정으로 로그인" : "이메일로 가입하기") { register.toggle(); error = nil }
                    }
                }
                if !model.providers.isEmpty {
                    Section {
                        if model.providers.contains("kakao") {
                            let hasTalk = UserApi.isKakaoTalkLoginAvailable()
                            Button(hasTalk ? "카카오톡으로 로그인" : "카카오계정으로 로그인 (웹 인증)") {
                                authenticate { try await model.kakaoLogin(usingTalk: hasTalk) }
                            }
                            .accessibilityIdentifier("auth.kakao")
                        }
                        if model.providers.contains("apple") {
                            Button("Apple로 로그인 (시스템 인증 창)") {
                                authenticate { try await model.browserLogin(provider: "apple") }
                            }
                            .accessibilityIdentifier("auth.apple")
                        }
                        if model.providers.contains("google") {
                            Button("Google 로그인 (브라우저)") {
                                authenticate { try await model.browserLogin() }
                            }
                            .accessibilityIdentifier("auth.google")
                        }
                        #if DEBUG
                        if ProcessInfo.processInfo.isiOSAppOnMac {
                            Button("Mac 개발 테스트: 브라우저로 로그인") {
                                error = nil
                                Task {
                                    do { try await model.browserLogin(useExternalBrowser: true) }
                                    catch is CancellationError {}
                                    catch { self.error = error.localizedDescription }
                                }
                            }.disabled(model.authBusy)
                            if let url = model.macBrowserURL {
                                Link("브라우저 로그인 페이지", destination: url)
                                Text(url.absoluteString).font(.caption2).textSelection(.enabled)
                                Button("브라우저 로그인 취소") { model.cancelMacBrowserLogin() }
                            }
                        }
                        #endif

                    }
                    .disabled(model.authBusy)
                }
                if model.authBusy { ProgressView("로그인 중") }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }.navigationTitle(register ? "회원가입" : "로그인").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
                #if DEBUG
                .onDisappear { model.cancelMacBrowserLogin() }
                #endif
                .task {
                    guard !model.emailEnabled && model.providers.isEmpty else { return }
                    loadingMethods = true; defer { loadingMethods = false }
                    do { try await model.loadMe() } catch { self.error = error.localizedDescription }
                }
        }
    }
    private func authenticate(_ action: @escaping @MainActor () async throws -> Void) {
        error = nil
        Task {
            do { try await action() }
            catch is CancellationError {}
            catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {}
            catch { self.error = error.localizedDescription }
        }
    }
}

struct AccountView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var logoutConfirm = false
    var body: some View {
        Group {
            Form {
                Section {
                    Label(model.user?.displayName() ?? "음악과 만나는 순간", systemImage: "person.crop.circle.fill").font(.title3.bold())
                    if let user = model.user { Text(accountIdentity(user)).foregroundStyle(.secondary) }
                    else { Button("로그인 / 회원가입") { dismiss(); model.showLogin = true } }
                }
                Section {
                    NavigationLink("Premium · 골드") { PaymentStoreView() }
                    if model.user != nil {
                        NavigationLink("골드 · 선물 내역") { GiftWalletView() }
                        NavigationLink("다이아 · 내 정산") { DiamondWalletView() }
                        NavigationLink("오늘의 보상") { RewardsView() }
                        NavigationLink("내 프로필 편집") { ProfileEditorView() }
                        NavigationLink("계정 설정") { AccountSettingsView() }
                        NavigationLink("메시지") { MessagesView() }
                        NavigationLink("크루") { CrewsView() }
                    }
                }
                Section("AIFECT") {
                    if model.user != nil { NavigationLink("원곡 음원 업로드") { OriginalUploadView() } }
                    Link("창작자 스튜디오 열기", destination: Endpoint.origin.appendingPathComponent("studio"))
                    Link("AIFECT 웹사이트", destination: Endpoint.origin)
                    Text("iPhone 네이티브 · \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")").foregroundStyle(.secondary)
                }
                if model.user != nil { Section { Button("로그아웃", role: .destructive) { logoutConfirm = true } } }
            }.navigationTitle("계정").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("완료") { dismiss() } }
                .confirmationDialog("이 기기에서 로그아웃할까요?", isPresented: $logoutConfirm, titleVisibility: .visible) {
                    Button("로그아웃", role: .destructive) { Task { await model.logout(); dismiss() } }
                } message: { Text("저장된 녹음은 기기에 남으며 같은 계정으로 다시 로그인하면 볼 수 있습니다.") }
        }
    }
}

struct LibraryView: View {
    @EnvironmentObject var model: AppModel
    @State private var selection: Int
    init(initialSelection: Int = 0) { _selection = State(initialValue: initialSelection) }
    @State private var newList = false
    @State private var name = ""
    @State private var isPublic = false
    @State private var creating = false
    @State private var query = ""
    @State private var createError: String?
    private var lists: [[String: Any]] {
        model.playlists.filter { query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || $0.string("name").localizedCaseInsensitiveContains(query.trimmingCharacters(in: .whitespacesAndNewlines)) }
    }
    var body: some View {
        Group {
            if model.user == nil {
                ContentUnavailableView {
                    Label("나만의 음악 보관함", systemImage: "square.stack")
                } description: { Text("로그인하고 좋아하는 음악과 플레이리스트를 모아보세요.") }
                actions: { Button("로그인") { model.showLogin = true }.buttonStyle(.borderedProminent) }
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        if selection != 0 {
                            Picker("보관함 분류", selection: $selection) { Text("전체").tag(3); Text("플레이리스트").tag(0); Text("좋아요").tag(1); Text("최근 감상").tag(2) }.pickerStyle(.segmented)
                        }
                        if let error = model.libraryError { RetryCard(message: error) { Task { await model.loadLibrary() } } }
                        if selection == 3 { MusicLibraryShortcuts() }
                        if selection == 0 || selection == 3 {
                            HStack {
                                Text("내 플레이리스트").font(.system(size: 17, weight: .semibold))
                                Spacer()
                                Button { name = ""; isPublic = false; createError = nil; newList = true } label: { Label("새로 만들기", systemImage: "plus").font(.system(size: 12)).frame(minHeight: 44) }
                                    .accessibilityIdentifier("my-playlist-create")
                            }
                            CatalogSearchField(prompt: "플레이리스트 검색", text: $query).accessibilityIdentifier("my-playlist-search")
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible())], spacing: 18) {
                                ForEach(lists, id: \.selfID) { LibraryPlaylistTile(list: $0) }
                            }.accessibilityElement(children: .contain).accessibilityIdentifier("my-playlist-grid")
                            if lists.isEmpty && model.libraryLoaded && model.libraryError == nil {
                                ContentUnavailableView(query.isEmpty ? "첫 플레이리스트를 만들어보세요" : "일치하는 목록이 없어요", systemImage: "music.note.list", description: Text(query.isEmpty ? "좋아하는 음악을 하나씩 모아보세요." : "다른 이름으로 검색해보세요."))
                            }
                        } else {
                            let songs = selection == 1 ? model.likes : model.history
                            if songs.isEmpty && model.libraryLoaded { ContentUnavailableView(selection == 1 ? "좋아하는 음악을 모아보세요" : "아직 감상 기록이 없어요", systemImage: selection == 1 ? "heart" : "clock") }
                            if !songs.isEmpty { Button("전체 재생", systemImage: "play.fill") { model.player.play(songs[0], queue: songs) }.buttonStyle(ParityPill(filled: true)) }
                            ForEach(songs) { StreamingSongRow(song: $0, queue: songs) }
                        }
                    }.padding(.horizontal, 20).padding(.vertical, 8).padding(.bottom, 28)
                }.refreshable { await model.loadLibrary() }
            }
        }.task(id: model.userID) { await model.loadLibrary() }
        .sheet(isPresented: $newList) {
            NavigationStack {
                Form {
                    TextField("플레이리스트 이름", text: $name).accessibilityIdentifier("my-playlist-create-name")
                    Toggle("다른 사람에게 공개하기", isOn: $isPublic)
                    if let createError { Text(createError).foregroundStyle(Brand.pink) }
                }.navigationTitle("새 플레이리스트").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("취소") { newList = false }.disabled(creating) }
                        ToolbarItem(placement: .confirmationAction) { Button("저장") { Task { await create() } }.disabled(creating || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("my-playlist-create-save") }
                    }
            }.presentationDetents([.medium, .large]).interactiveDismissDisabled(creating)
        }
    }
    private func create() async {
        guard let owner = model.userID, !creating else { return }
        let title = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
        guard !title.isEmpty else { return }
        creating = true; defer { creating = false }
        do {
            _ = try await API.shared.call("/api/playlists", method: "POST", body: ["name": title, "is_public": isPublic])
            guard model.userID == owner else { return }
            newList = false; await model.loadLibrary()
        } catch { if model.userID == owner { createError = error.localizedDescription } }
    }
}

private struct LibraryPlaylistTile: View {
    @EnvironmentObject private var model: AppModel
    let list: [String: Any]
    @State private var playing = false
    private var name: String { list.string("name") }
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Color.clear.aspectRatio(1, contentMode: .fit).overlay {
                NavigationLink { PlaylistView(id: list.selfID, title: name).streamingPage() } label: {
                    PlaylistArtwork(list: list)
                }.buttonStyle(.plain).accessibilityLabel(name)
            }.overlay(alignment: .bottomTrailing) {
                Button { Task { await play() } } label: {
                    ZStack {
                        Circle().fill(Brand.background).overlay(Circle().stroke(Brand.gradient, lineWidth: 1)).frame(width: 34, height: 34)
                        if playing { ProgressView().tint(Brand.pink) } else { Image(systemName: "play.fill").font(.system(size: 15)).foregroundStyle(Brand.pink) }
                    }.frame(width: 44, height: 44)
                }.disabled(playing).accessibilityLabel(name + " 전체 재생").accessibilityIdentifier("playlist-play-" + list.selfID).padding(5)
            }.clipShape(RoundedRectangle(cornerRadius: 12))
            NavigationLink { PlaylistView(id: list.selfID, title: name).streamingPage() } label: {
                Text(name).font(.system(size: 13, weight: .semibold)).foregroundStyle(AifectDesign.text).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.plain)
            HStack {
                Text("\(list.int("tracks"))곡").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
                Spacer()
                NavigationLink { PlaylistView(id: list.selfID, title: name).streamingPage() } label: { Image(systemName: "ellipsis").frame(width: 44, height: 36) }
                    .accessibilityLabel("플레이리스트 상세 및 관리").accessibilityIdentifier("my-playlist-manage-" + list.selfID)
            }
        }.accessibilityElement(children: .contain).accessibilityIdentifier("my-playlist-tile-" + list.selfID)
    }
    private func play() async {
        let owner = model.userID
        guard !playing else { return }
        playing = true; defer { playing = false }
        do {
            let songs = try await API.shared.call("/api/playlists/\(Endpoint.pathID(list.selfID))").songs()
            guard owner == model.userID, !Task.isCancelled else { return }
            if let first = songs.first { model.player.play(first, queue: songs) }
            else { model.notice = "아직 곡이 없는 플레이리스트입니다." }
        } catch { if owner == model.userID { model.handle(error) } }
    }
}

struct PlaylistArtwork: View {
    let list: [String: Any]
    var body: some View {
        GeometryReader { bounds in
            ZStack {
                LinearGradient(colors: [Color(aifectHex: 0x403449), Color(aifectHex: 0x20363A)], startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: "music.note.list").font(.system(size: 38, weight: .light)).foregroundStyle(AifectDesign.violet)
                if !list.string("image_version").isEmpty,
                   let url = try? Endpoint.url("/media/playlist/\(Endpoint.pathID(list.selfID))/image?v=\(Endpoint.query(list.string("image_version")))") {
                    RemoteArtwork(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                } else if let first = list.objects("covers").first {
                    let covers = list.objects("covers")
                    if covers.count >= 4 {
                        VStack(spacing: 0) {
                            ForEach(0..<2) { row in
                                HStack(spacing: 0) {
                                    ForEach(0..<2) { column in AlbumArtwork(song: Song(covers[row * 2 + column])).frame(width: bounds.size.width / 2, height: bounds.size.height / 2).clipped() }
                                }
                            }
                        }
                    } else { AlbumArtwork(song: Song(first)).frame(width: bounds.size.width, height: bounds.size.height).clipped() }
                }
            }.frame(width: bounds.size.width, height: bounds.size.height).clipped()
        }
    }
}

extension Dictionary where Key == String, Value == Any {
    var selfID: String { string("id") }
}

struct PlaylistView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let id: String
    let title: String
    @State private var songs: [Song] = []
    @State private var playlist: [String: Any] = [:]
    @State private var error: String?
    @State private var loading = true
    @State private var editing = false
    @State private var deleting = false
    @State private var name = ""
    @State private var isPublic = false
    @State private var busy = false
    private var owned: Bool { model.userID != nil && playlist.string("user_id") == model.userID }
    @State private var adding = false
    @State private var photo: PhotosPickerItem?
    private var candidates: [Song] {
        var seen = Set(songs.map(\.id))
        return (model.likes + model.latest + model.chart).filter { seen.insert($0.id).inserted }
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if loading && playlist.isEmpty { ProgressView() }
                if let error { RetryCard(message: error) { Task { await load() } } }
                if !playlist.isEmpty {
                    PlaylistArtwork(list: playlist).frame(width: 112, height: 112).clipShape(RoundedRectangle(cornerRadius: 12))
                    if owned {
                        PhotosPicker(selection: $photo, matching: .images) { Label("플레이리스트 사진 변경", systemImage: "photo.badge.plus").font(.system(size: 13)) }.disabled(busy || playlist.flag("locked")).accessibilityIdentifier("playlist-cover-edit")
                    }
                    Text(playlist.string("name", fallback: title)).font(.system(size: 29, weight: .bold)).padding(.top, 2)
                    Text([playlist.string("owner_name"), "\(songs.count)곡"].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                    if !playlist.string("description").isEmpty { Text(playlist.string("description")).font(.caption).foregroundStyle(AifectDesign.muted) }
                    HStack(spacing: 7) {
                        Button("전체 재생", systemImage: "play.fill") { if let song = songs.first { model.player.play(song, queue: songs) } }.buttonStyle(ParityPill(filled: true)).disabled(songs.isEmpty)
                        if owned {
                            Button("편집") { name = playlist.string("name"); isPublic = playlist.flag("is_public"); editing = true }.frame(minHeight: 44).accessibilityIdentifier("playlist-detail-edit")
                            Button("플레이리스트 삭제", systemImage: "trash", role: .destructive) { deleting = true }.labelStyle(.iconOnly).frame(width: 44, height: 44)
                        } else if model.user != nil { Button(playlist.flag("saved") ? "보관함에서 빼기" : "보관함 저장") { Task { await bookmark() } }.buttonStyle(ParityPill()) }
                    }.padding(.top, 4).disabled(busy)
                    if playlist.flag("locked") { Text("현재 요금제의 플레이리스트 한도를 넘었어요. 보관함을 정리해주세요.").font(.system(size: 13)).foregroundStyle(AifectDesign.violet) }
                    if owned { Button(adding ? "곡 선택 닫기" : "곡 추가", systemImage: "plus") { adding.toggle() }.frame(minHeight: 44).disabled(busy).accessibilityIdentifier("playlist-detail-add") }
                    if busy { ProgressView().frame(maxWidth: .infinity) }
                }
                if adding {
                    ForEach(candidates.enumerated().map { PlaylistDisplaySong(song: $0.element, index: $0.offset, candidate: true) }) { item in
                        let song = item.song
                        HStack {
                            SongRow(song: song, queue: candidates)
                            Button { Task { await add(song) } } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.disabled(busy).accessibilityLabel(song.title + " 목록에 추가").accessibilityIdentifier("playlist-add-" + song.id)
                        }
                    }
                    if candidates.isEmpty { Text("추가할 음악이 없어요. 듣기에서 곡을 찾아 담아보세요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }
                } else {
                    ForEach(songs.enumerated().map { PlaylistDisplaySong(song: $0.element, index: $0.offset, candidate: false) }) { item in
                        let song = item.song, index = item.index
                        VStack(spacing: 0) {
                            SongRow(song: song, queue: songs)
                            if owned {
                                HStack(spacing: 12) {
                                    Spacer()
                                    Button("위로", systemImage: "chevron.up") { Task { await move(IndexSet(integer: index), index - 1) } }.disabled(index == 0 || busy).accessibilityIdentifier("playlist-up-" + song.id)
                                    Button("아래로", systemImage: "chevron.down") { Task { await move(IndexSet(integer: index), index + 2) } }.disabled(index == songs.count - 1 || busy).accessibilityIdentifier("playlist-down-" + song.id)
                                    Button("빼기") { Task { await remove(IndexSet(integer: index)) } }.disabled(busy).foregroundStyle(AifectDesign.muted).accessibilityIdentifier("playlist-remove-" + song.id)
                                }.font(.system(size: 12)).frame(minHeight: 44)
                            }
                        }
                    }
                    if songs.isEmpty && !loading && error == nil { ContentUnavailableView("이 순간에 어울리는 음악을 담아요", systemImage: "music.note.list", description: Text("좋아하는 곡으로 순서까지 직접 구성해보세요.")) }
                }
            }.padding(.horizontal, 22).padding(.bottom, 28)
        }.accessibilityIdentifier("playlist-detail-scroll").navigationTitle("플레이리스트").task(id: id + (model.userID ?? "")) { await load() }.refreshable { await load() }
            .task(id: photo) { if let photo { await uploadPhoto(photo) } }
            .sheet(isPresented: $editing) {
                NavigationStack {
                    VStack(alignment: .leading, spacing: 18) {
                        StudioTextField(title: "플레이리스트 이름", text: $name, limit: 80)
                        Toggle("다른 사람에게 공개하기", isOn: $isPublic)
                        if let error { Text(error).font(.caption).foregroundStyle(Brand.pink) }
                        Button("저장") { Task { await save() } }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        Spacer(minLength: 0)
                    }.padding(20).background(Brand.background).navigationTitle("플레이리스트 편집").navigationBarTitleDisplayMode(.inline).toolbar { Button("취소") { editing = false } }
                }.presentationDetents([.medium, .large])
            }
            .confirmationDialog("플레이리스트를 삭제할까요?", isPresented: $deleting, titleVisibility: .visible) {
                Button("삭제", role: .destructive) { Task { await delete() } }
            } message: { Text("목록과 곡 순서가 삭제돼요. 원곡과 좋아요는 그대로 남아요.") }
    }
    private func add(_ song: Song) async {
        guard owned, !busy else { return }; busy = true; defer { busy = false }
        let owner = model.userID
        do { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))/tracks/\(Endpoint.pathID(song.id))", method: "PUT", body: [:]); guard owner == model.userID else { return }; await load(); await model.loadLibrary() } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
    private func uploadPhoto(_ item: PhotosPickerItem) async {
        guard owned, !busy else { return }; let owner = model.userID; busy = true; defer { busy = false; photo = nil }
        do {
            guard let source = try await item.loadTransferable(type: Data.self) else { return }
            let bytes = try await Task.detached { try ChatImageEncoder.encode(source) }.value
            guard model.userID == owner, !Task.isCancelled else { return }
            _ = try await API.shared.request("/api/playlists/\(Endpoint.pathID(id))/image", method: "PUT", bytes: bytes, type: "image/webp")
            guard model.userID == owner else { return }; await load(); await model.loadLibrary()
        } catch { if model.userID == owner { self.error = error.localizedDescription } }
    }
    private func delete() async {
        guard owned, !busy else { return }; busy = true; defer { busy = false }; let owner = model.userID
        do { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))", method: "DELETE", body: [:]); guard owner == model.userID else { return }; await model.loadLibrary(); dismiss() } catch { if model.userID == owner { self.error = error.localizedDescription } }
    }
    private func load() async {
        loading = true; defer { loading = false }
        let owner = model.userID
        do { let data = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))"); guard owner == model.userID, !Task.isCancelled else { return }; songs = data.songs(); playlist = data.object("playlist"); error = nil } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
    private func save() async { busy = true; defer { busy = false }; do { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))", method: "PATCH", body: ["name": name, "is_public": isPublic]); editing = false; await load(); await model.loadLibrary() } catch { self.error = error.localizedDescription } }
    private func bookmark() async { do { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))/save", method: playlist.flag("saved") ? "DELETE" : "PUT", body: [:]); await load(); await model.loadLibrary() } catch { self.error = error.localizedDescription } }
    private func remove(_ offsets: IndexSet) async {
        guard owned, !busy else { return }; let ids = offsets.compactMap { songs.indices.contains($0) ? songs[$0].id : nil }; busy = true; defer { busy = false }
        do { for track in ids { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))/tracks/\(Endpoint.pathID(track))", method: "DELETE", body: [:]) }; await load() } catch { self.error = error.localizedDescription }
    }
    private func move(_ offsets: IndexSet, _ target: Int) async {
        guard owned, !busy else { return }; var next = songs; next.move(fromOffsets: offsets, toOffset: target); busy = true; defer { busy = false }
        do { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))/order", method: "PUT", body: ["track_ids": next.map(\.id)]); songs = next } catch { self.error = error.localizedDescription; await load() }
    }
}

private struct PlaylistDisplaySong: Identifiable {
    let song: Song
    let index: Int
    let candidate: Bool
    var id: String { (candidate ? "candidate-" : "track-") + song.id }
}

struct AccountSettingsView: View {
    @ObservedObject private var ads = ListeningAds.shared
    @EnvironmentObject var model: AppModel
    @State private var currentPassword = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        Form {
            Section { NavigationLink("알림 설정") { PushSettingsView() }
                NavigationLink("차단한 이용자") { BlockedUsersView() }
                if ads.privacyRequired { Button("광고 개인정보 설정") { Task { await ads.privacyOptions() } } }
            }
            Section { Text(model.user.map(accountIdentity) ?? ""); NavigationLink("공개 닉네임 · 프로필 변경") { ProfileEditorView() } }
            if model.user?.string("provider") == "email" {
                Section("비밀번호 변경") {
                    SecureField("현재 비밀번호", text: $currentPassword).textContentType(.password)
                    SecureField("새 비밀번호", text: $password).textContentType(.newPassword)
                    SecureField("새 비밀번호 확인", text: $confirm).textContentType(.newPassword)
                    Button("비밀번호 변경") { Task { await changePassword() } }.disabled(busy || currentPassword.isEmpty || password.count < 12 || password != confirm)
                }
            }
            Section {
                Link("이용약관", destination: Endpoint.origin.appendingPathComponent("terms"))
                Link("개인정보 처리방침", destination: Endpoint.origin.appendingPathComponent("privacy"))
                Link("고객 지원", destination: Endpoint.origin.appendingPathComponent("contact"))
            }
            if let error { Text(error).foregroundStyle(.red) }
            Section { NavigationLink("계정 삭제") { DeleteAccountView() }.foregroundStyle(.red) }
        }.navigationTitle("계정 설정")
    }
    private func changePassword() async {
        busy = true; defer { busy = false }
        do { _ = try await API.shared.call("/api/account/password", method: "PUT", body: ["current_password": currentPassword, "new_password": password]); currentPassword = ""; password = ""; confirm = ""; error = nil; model.notice = "비밀번호를 변경했습니다. 다른 기기에서는 다시 로그인해주세요." } catch { self.error = error.localizedDescription }
    }
}

struct TrackDetailView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let song: Song
    @State private var comments: [[String: Any]] = []
    @State private var comment = ""
    @State private var busy = false
    @State private var error: String?
    @State private var loading = true
    var body: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(spacing: 10) {
                        AlbumArtwork(song: song).frame(maxWidth: 300)
                        Text(song.title).font(.title2.bold()).multilineTextAlignment(.center)
                        Text(song.credit).font(.subheadline).foregroundStyle(AifectDesign.secondaryText)
                        if !song.genreLabel.isEmpty { Text(song.genreLabel).font(.caption).foregroundStyle(Brand.aqua) }
                    }.frame(maxWidth: .infinity)
                    SongPlaybackControls(song: song, player: model.player)
                    HStack(spacing: 0) {
                        Button { Task { busy = true; await model.toggleLike(song); busy = false } } label: {
                            SongQuickActionLabel(title: "좋아요", icon: model.likes.contains(where: { $0.id == song.id }) ? "heart.fill" : "heart", accent: Brand.pink)
                        }.disabled(busy).accessibilityIdentifier("song-action-like")
                        SaveMusicButton(song: song, verticalAction: true)
                        SingSongButton(song: song, verticalAction: true)
                        GiftSheetButton(song: song) { SongQuickActionLabel(title: "선물", icon: "gift") }
                    }.buttonStyle(.plain).accessibilityElement(children: .contain).accessibilityIdentifier("song-quick-actions")
                    Divider()
                    Text("\(song.plays ?? 0)회 감상 · 댓글 \(song.comments)")
                        .font(.system(size: 11)).foregroundStyle(AifectDesign.secondaryText).frame(maxWidth: .infinity)
                    Text("곡 이야기").font(.headline).padding(.top, 8)
                    if let id = song.producerID { NavigationLink("창작자 프로필") { ProfilePage(id: id) } }
                    if let id = song.artistID { NavigationLink("아티스트 프로필") { ProfilePage(id: id, kind: "artist") } }
                    Divider()
                    TrackCommentsView(song: song)
                }.padding(20)
            }.background(Brand.background).navigationTitle("곡 상세").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("완료") { dismiss() } }
                .task { await loadComments(); await model.loadLibrary() }
        }
    }
    private func loadComments() async {
        error = nil; loading = true; defer { loading = false }
        do { comments = try await API.shared.call("/api/tracks/\(Endpoint.pathID(song.id))/comments").objects("comments") } catch { self.error = error.localizedDescription }
    }
}

func accountIdentity(_ user: [String: Any]) -> String {
    let email = user.string("email")
    if email.hasSuffix("@identity.aifect.invalid") { return user.string("provider") == "kakao" ? "카카오 계정으로 로그인됨" : "소셜 계정으로 로그인됨" }
    return email
}


struct DeleteAccountView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmation = ""
    @State private var confirming = false
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        Form {
            Section("계정을 영구적으로 삭제합니다") {
                Text("로그인 정보, 프로필, 업로드한 음악·이미지, 댓글과 메시지가 삭제됩니다. 복구할 수 없으며 사용 중인 모든 기기에서 로그아웃됩니다.")
                Text("결제·환불·정산 등 법정 보관 자료는 개인정보 처리방침의 기간 동안 제한적으로 보관합니다. 업로드 파일 삭제는 서버에서 순차 처리됩니다.").font(.footnote).foregroundStyle(.secondary)
            }
            Section("구독과 구매 확인") {
                Text("계정 삭제만으로 Apple·Google 구독이 취소되거나 환불되지 않습니다. 먼저 구매한 스토어에서 구독을 관리해주세요. 웹 정기결제의 자동 갱신은 계정 삭제 시 중단됩니다.")
                Link("Apple 구독 관리", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                Link("Google Play 구독 관리", destination: URL(string: "https://play.google.com/store/account/subscriptions")!)
                Link("구매·환불 문의", destination: Endpoint.origin.appendingPathComponent("contact"))
            }
            if model.user?.string("provider") == "apple" {
                Section { Text("이전 Apple 로그인 계정은 연결 해제를 위해 Apple 로그인을 한 번 더 진행해야 할 수 있습니다.").font(.footnote)
                    Button("Apple 로그인 다시 진행") { Task { busy = true; defer { busy = false }; do { try await model.browserLogin(); error = nil } catch { self.error = error.localizedDescription } } }.disabled(busy)
                }
            }
            Section("삭제 확인") {
                TextField("확인을 위해 ‘삭제’를 입력하세요", text: $confirmation)
                Button("계정 영구 삭제", role: .destructive) { confirming = true }.disabled(busy || confirmation != "삭제")
                if busy { ProgressView() }
                if let error { Text(error).foregroundStyle(.red) }
            }
        }.navigationTitle("계정 삭제")
            .confirmationDialog("계정과 콘텐츠를 영구 삭제할까요?", isPresented: $confirming, titleVisibility: .visible) {
                Button("영구 삭제", role: .destructive) { Task { busy = true; defer { busy = false }; do { try await model.deleteAccount(); dismiss() } catch { self.error = error.localizedDescription } } }
            }
    }
}

struct BlockedUsersView: View {
    @State private var blocks: [[String: Any]] = []
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        List {
            if blocks.isEmpty { Text("차단한 이용자가 없습니다.").foregroundStyle(.secondary) }
            ForEach(blocks, id: \.selfID) { person in
                HStack { Text(person.displayName()); Spacer(); Button("차단 해제") { Task { await unblock(person.string("id")) } }.disabled(busy) }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("차단한 이용자").task { await load() }.refreshable { await load() }
    }
    private func load() async { do { blocks = try await API.shared.call("/api/blocks").objects("blocks"); error = nil } catch { self.error = error.localizedDescription } }
    private func unblock(_ id: String) async { busy = true; defer { busy = false }; do { _ = try await API.shared.call("/api/blocks/\(Endpoint.pathID(id))", method: "DELETE", body: [:]); await load() } catch { self.error = error.localizedDescription } }
}
