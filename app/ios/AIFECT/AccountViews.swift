import SwiftUI
import AuthenticationServices

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
                        Button {
                            error = nil
                            Task {
                                do { try await model.browserLogin() }
                                catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {}
                                catch { self.error = error.localizedDescription }
                            }
                        } label: { Label("Apple · Google · 카카오로 로그인", systemImage: "person.crop.circle.badge.checkmark") }.disabled(model.authBusy)
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
                        Text("안전한 시스템 인증 창에서 계정을 선택합니다.").font(.caption).foregroundStyle(.secondary)
                    }
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
}

struct AccountView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var logoutConfirm = false
    var body: some View {
        NavigationStack {
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
                        NavigationLink("수익 · 정산") { CreatorEarningsView() }
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
    @State private var creating = false
    var body: some View {
        Group {
            if model.user == nil {
                ContentUnavailableView {
                    Label("나만의 음악 보관함", systemImage: "square.stack")
                } description: { Text("로그인하고 좋아하는 음악과 플레이리스트를 모아보세요.") }
                actions: { Button("로그인") { model.showLogin = true }.buttonStyle(.borderedProminent) }
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        Picker("보관함 분류", selection: $selection) { Text("플레이리스트").tag(0); Text("좋아요").tag(1); Text("최근 감상").tag(2) }.pickerStyle(.segmented)
                        HStack { NavigationLink("내 커버 · 제작곡") { MyMusicView() }; Spacer(); NavigationLink("팔로잉") { FollowingListView() }; NavigationLink("팔로워") { FollowingListView(followers: true) } }.font(.caption).frame(minHeight: 44)
                        if selection == 0 {
                            Button { newList = true } label: { Label("플레이리스트 만들기", systemImage: "plus.circle.fill") }.disabled(creating).padding(.vertical, 10)
                            ForEach(model.playlists, id: \.selfID) { item in
                                NavigationLink { PlaylistView(id: item.string("id"), title: item.string("name")) } label: {
                                    HStack(spacing: 14) { Image(systemName: "music.note.list").font(.title2).frame(width: 56, height: 56).background(Brand.card, in: RoundedRectangle(cornerRadius: 14)); Text(item.string("name")).font(.headline); Spacer(); Image(systemName: "chevron.right").font(.caption) }.foregroundStyle(.white)
                                }.padding(.vertical, 4)
                            }
                        } else {
                            let songs = selection == 1 ? model.likes : model.history
                            if songs.isEmpty { ContentUnavailableView(selection == 1 ? "좋아하는 음악을 모아보세요" : "아직 감상 기록이 없어요", systemImage: selection == 1 ? "heart" : "clock") }
                            ForEach(songs) { SongRow(song: $0, queue: songs) }
                        }
                    }.padding(20)
                }.refreshable { await model.loadLibrary() }
            }
        }.task(id: model.userID) { await model.loadLibrary() }
        .alert("플레이리스트 만들기", isPresented: $newList) {
            TextField("이름", text: $name)
            Button("취소", role: .cancel) { name = "" }
            Button("만들기") {
                let title = name.trimmingCharacters(in: .whitespacesAndNewlines); name = ""
                guard !title.isEmpty else { return }
                creating = true
                Task {
                    defer { creating = false }
                    do { _ = try await API.shared.call("/api/playlists", method: "POST", body: ["name": title, "is_public": false]); await model.loadLibrary() }
                    catch { model.handle(error) }
                }
            }
        } message: { Text("처음에는 나만 볼 수 있는 목록으로 만들어집니다.") }
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
    var body: some View {
        List {
            if loading { ProgressView() }
            if let error { RetryCard(message: error) { Task { await load() } } }
            if !songs.isEmpty { Button("전체 재생") { model.player.play(songs[0], queue: songs) } }
            if !playlist.isEmpty {
                Text(playlist.string("description")).font(.caption)
                if owned { Button("이름 · 공개 설정") { name = playlist.string("name"); isPublic = playlist.flag("is_public"); editing = true }; Button("플레이리스트 삭제", role: .destructive) { deleting = true } }
                else if model.user != nil { Button(playlist.flag("saved") ? "보관함에서 제거" : "내 보관함에 저장") { Task { await bookmark() } } }
            }
            if songs.isEmpty && !loading && error == nil { Text(playlist.flag("active") ? "아직 곡이 없습니다." : "보관 중인 목록입니다. 활성 플레이리스트를 선택해주세요.") }
            ForEach(songs) { SongRow(song: $0, queue: songs) }
                .onDelete { indices in Task { await remove(indices) } }
                .onMove { indices, target in Task { await move(indices, target) } }
                .deleteDisabled(!owned || busy).moveDisabled(!owned || busy)
        }.navigationTitle(playlist.string("name", fallback: title)).task { await load() }.refreshable { await load() }
            .toolbar { if owned { EditButton() } }
            .sheet(isPresented: $editing) {
                NavigationStack { Form { TextField("이름", text: $name); Toggle("공개 목록", isOn: $isPublic); Button("저장") { Task { await save() } }.disabled(busy || name.isEmpty); if let error { Text(error).foregroundStyle(.red) } }.navigationTitle("목록 편집").toolbar { Button("닫기") { editing = false } } }
            }
            .confirmationDialog("플레이리스트를 삭제할까요?", isPresented: $deleting, titleVisibility: .visible) {
                Button("삭제", role: .destructive) { Task { do { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))", method: "DELETE", body: [:]); await model.loadLibrary(); dismiss() } catch { self.error = error.localizedDescription } } }
            } message: { Text("목록은 삭제되며 음원은 그대로 유지됩니다.") }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do { let data = try await API.shared.call("/api/playlists/\(Endpoint.pathID(id))"); songs = data.songs(); playlist = data.object("playlist"); error = nil } catch { self.error = error.localizedDescription }
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
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 20) { CoverArt(song: song, size: 110); VStack(alignment: .leading, spacing: 8) { Text(song.title).font(.title2.bold()); Text(song.credit).foregroundStyle(.secondary); Text(song.genre).font(.caption).foregroundStyle(Brand.aqua) } }
                    HStack {
                        Button { model.player.play(song, queue: [song]) } label: { Label("재생", systemImage: "play.fill") }.buttonStyle(.borderedProminent)
                        Button { Task { busy = true; await model.toggleLike(song); busy = false } } label: { Label("좋아요", systemImage: model.likes.contains(where: { $0.id == song.id }) ? "heart.fill" : "heart") }.buttonStyle(.bordered).disabled(busy)
                        if model.user != nil {
                            SaveMusicButton(song: song, compact: true)
                        }
                    }
                    if model.user != nil { GiftSheetButton(song: song) { Label("선물 보내기", systemImage: "gift") } }
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
