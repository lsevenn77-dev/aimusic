import SwiftUI

@main
struct AIFECTApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()
    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
                Color.clear
            } else if FeedbackUIFixture.enabled {
                FeedbackUITestView()
            } else if ProcessInfo.processInfo.arguments.contains("-ad-integration-test") {
                AdIntegrationTestView()
            } else {
                RootView().environmentObject(model).preferredColorScheme(.dark).tint(Brand.aqua)
                    .onOpenURL { model.macBrowserCallback($0) }
            }
            #else
            RootView().environmentObject(model).preferredColorScheme(.dark).tint(Brand.aqua)
            #endif
        }
    }
}

/// Android parity values from NativeScreens.kt. This is an importable UI foundation,
/// not a replacement for the iOS project's navigation, audio or account services.
enum AifectDesign {
    static let background = Color(aifectHex: 0x10131B)
    static let surface = Color(aifectHex: 0x191E29)
    static let raised = Color(aifectHex: 0x242C38)
    static let stroke = Color(aifectHex: 0x2B2E39)
    static let text = Color(aifectHex: 0xF3F6F8)
    static let secondaryText = Color(aifectHex: 0xCDD2DC)
    static let muted = Color(aifectHex: 0xA6ADBA)
    static let pink = Color(aifectHex: 0xEF86B6)
    static let mint = Color(aifectHex: 0x8EDDD2)
    static let violet = Color(aifectHex: 0xD6B5ED)
    static let iconBackground = Color(aifectHex: 0x0F1117)
    static let gutter: CGFloat = 20
    static let cardRadius: CGFloat = 22
    static let artworkRadius: CGFloat = 16
    static let touchTarget: CGFloat = 48
    static let mainTabs = ["홈", "커뮤니티", "부르기", "메시지", "마이"]
    static let communityTabs = ["추천", "커버", "듀엣", "크루", "팔로잉"]
}

extension Color {
    init(aifectHex value: UInt32) {
        self.init(.sRGB, red: Double((value >> 16) & 255) / 255,
                  green: Double((value >> 8) & 255) / 255,
                  blue: Double(value & 255) / 255, opacity: 1)
    }
}

/// Import AifectWordmark.imageset first; preserve its original gradient and white letters.
struct AifectWordmark: View {
    var body: some View {
        Image("AifectWordmark")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: 124, height: 30).padding(.vertical, 8)
            .accessibilityLabel("AIFECT")
    }
}

struct AifectAppMark: View {
    var size: CGFloat = 108
    var body: some View {
        Image("AifectMark")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityLabel("AIFECT")
    }
}

enum Brand {
    static let background = AifectDesign.background
    static let card = AifectDesign.surface
    static let pink = AifectDesign.pink
    static let aqua = AifectDesign.mint
    static let gradient = LinearGradient(colors: [pink, AifectDesign.violet, aqua], startPoint: .leading, endPoint: .trailing)
}

struct CoverArt: View {
    let song: Song
    var size: CGFloat = 58
    var body: some View { AlbumArtwork(song: song).frame(width: size, height: size).accessibilityHidden(true) }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = 0
    @State private var account = false
    @State private var keyboardVisible = false
    private var integrationEnabled: Bool {
        #if DEBUG
        return !FeedbackUIFixture.enabled
        #else
        return true
        #endif
    }
    @ObservedObject private var push = PushNotifications.shared
    var body: some View {
        TabView(selection: $tab) {
            page("홈") { ListenView() }.tabItem { Label("홈", systemImage: "headphones") }.tag(0)
            page("커뮤니티") { CommunityView() }.tabItem { Label("커뮤니티", systemImage: "person.2") }.tag(1)
            page("부르기") { SingView() }.tabItem { Label("부르기", systemImage: "mic.fill") }.tag(2).tint(Brand.pink)
            page("메시지") { MessagesView() }.tabItem { Label("메시지", systemImage: "bubble.left.and.bubble.right") }.badge(model.inboxUnread).tag(3)
            page("마이") { MyMusicView() }.tabItem { Label("마이", systemImage: "person.crop.circle") }.tag(4)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) { if !keyboardVisible && !model.chatOpen { VStack(spacing: 0) { MiniPlayer(player: model.player); MainBottomBar(selection: $tab) }.background(Brand.background) } }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardVisible = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardVisible = false }
        .sheet(isPresented: $model.showLogin) { LoginView() }
        .sheet(isPresented: $account) { AccountView() }
        .sheet(item: $push.destination) { route in PushDestinationView(route: route).id(model.userID ?? "guest") }
        .alert("AIFECT", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("확인", role: .cancel) { model.notice = nil }
        } message: { Text(model.notice ?? "") }
        .task(id: "\(model.userID ?? "guest"):\(scenePhase == .active)") {
            guard scenePhase == .active, model.userID != nil else { return }
            while !Task.isCancelled { await model.refreshInbox(); do { try await Task.sleep(for: .seconds(5)) } catch { break } }
        }
        .task { await model.refresh(); if integrationEnabled { _ = StorePayments.shared; await ListeningAds.shared.consent() } }
        .task(id: model.userID) {
            guard integrationEnabled else { return }
            StorePayments.shared.resetAccount()
            await push.bind(model.userID)
            guard model.userID != nil else { return }
            await StorePayments.shared.retryUnfinished()
            try? await model.loadMe()
        }
    }
    private func page<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        NavigationStack {
            content().id(model.userID ?? "guest")
                .scrollContentBackground(.hidden)
                .background(Brand.background)
                .navigationTitle("").navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(Brand.background, for: .navigationBar)
                .toolbar(.hidden, for: .tabBar)
                .toolbar { BrandNavigationToolbar(account: $account) }
        }
    }
}

struct SongRow: View {
    @EnvironmentObject var model: AppModel
    let song: Song
    let queue: [Song]
    @State private var detail = false
    var body: some View {
        HStack(spacing: 13) {
            Button { model.player.play(song, queue: queue) } label: { CoverArt(song: song) }.buttonStyle(.plain).accessibilityLabel("\(song.title), \(song.credit), 재생")
            Button { detail = true } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(song.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(AifectDesign.text).lineLimit(1)
                    Text(song.credit).font(.system(size: 13)).lineLimit(1)
                    Text(song.isCover ? "\(song.coverMode == "duet" ? "듀엣" : "솔로 커버") · \(song.plays ?? 0)회 재생" : "\(song.genre) · \(timeLabel(song.duration))").font(.system(size: 12)).lineLimit(1)
                }.foregroundStyle(AifectDesign.muted).frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
            Button { model.player.play(song, queue: queue) } label: { Image(systemName: "play.fill").frame(width: 32, height: 44) }.foregroundStyle(AifectDesign.secondaryText).accessibilityLabel("\(song.title) 재생")
            SaveMusicButton(song: song, compact: true)
        }.padding(.vertical, 9).sheet(isPresented: $detail) { TrackDetailView(song: song) }
    }
}

struct RetryCard: View {
    let message: String
    let action: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { Text(message).font(.subheadline); Button("다시 시도", action: action).buttonStyle(.bordered) }
            .frame(maxWidth: .infinity, alignment: .leading).padding().background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct SearchView: View {
    @EnvironmentObject var model: AppModel
    @State private var query = ""
    @State private var results: [Song] = []
    @State private var people: [[String: Any]] = []
    @State private var artists: [[String: Any]] = []
    @State private var lists: [[String: Any]] = []
    @State private var loading = false
    @State private var error: String?
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if query.isEmpty {
                    Text("어떤 음악을 찾고 있나요?").font(.title2.bold()).padding(.top)
                    Text("곡 제목이나 아티스트 이름으로 검색해보세요.").foregroundStyle(.secondary)
                    Text("추천 음악").font(.headline).padding(.top, 24)
                    ForEach(model.chart.prefix(10)) { SongRow(song: $0, queue: model.chart) }
                } else if loading { ProgressView().frame(maxWidth: .infinity).padding(40) }
                else if let error { Text(error).foregroundStyle(.secondary) }
                else if results.isEmpty && people.isEmpty && artists.isEmpty && lists.isEmpty { ContentUnavailableView("검색 결과가 없어요", systemImage: "magnifyingglass", description: Text("‘\(query)’과 일치하는 음악이 없습니다.")) }
                else {
                    ForEach(results) { SongRow(song: $0, queue: results) }
                    if !people.isEmpty { Text("창작자").font(.headline) }
                    ForEach(people, id: \.selfID) { person in NavigationLink { ProfilePage(id: person.string("id")) } label: { PersonRow(person: person) } }
                    if !artists.isEmpty { Text("아티스트").font(.headline) }
                    ForEach(artists, id: \.selfID) { person in NavigationLink { ProfilePage(id: person.string("id"), kind: "artist") } label: { PersonRow(person: person) } }
                    if !lists.isEmpty { Text("플레이리스트").font(.headline) }
                    ForEach(lists, id: \.selfID) { item in NavigationLink(item.string("name")) { PlaylistView(id: item.string("id"), title: item.string("name")) } }
                }
            }.padding(20)
        }.searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "곡, 아티스트 검색")
        .scrollDismissesKeyboard(.interactively)
        .onSubmit(of: .search) { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
        .task(id: query) {
            let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
            results = []; people = []; artists = []; lists = []; error = nil
            guard !value.isEmpty else { loading = false; return }
            loading = true
            do {
                try await Task.sleep(for: .milliseconds(300))
                let response = try await API.shared.call("/api/search?q=\(Endpoint.query(value))")
                try Task.checkCancellation(); results = response.songs(); people = response.objects("producers"); artists = response.objects("artists"); lists = response.objects("playlists"); loading = false
            } catch is CancellationError {} catch { if !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
        }
    }
}

struct CommunityView: View {
    @EnvironmentObject var model: AppModel
    @State private var filter = "추천"
    @State private var songs: [Song] = []
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                PageHeading(title: "커뮤니티", subtitle: "음악을 발견하고, 담고, 함께 만들어가요.")
                ParityChips(items: AifectDesign.communityTabs, selection: $filter)
            }.padding(.horizontal, 20)
            if filter == "크루" { CrewsView() }
            else if filter == "팔로잉" && model.user == nil { LoginPrompt(title: "팔로잉의 음악을 만나보세요") }
            else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        if filter == "추천" {
                            NavigationLink { CrewsView() } label: {
                                HStack(spacing: 12) { Image(systemName: "person.3.fill").foregroundStyle(Brand.aqua); VStack(alignment: .leading, spacing: 4) { Text("크루에서 함께 듣고 부르기").font(.system(size: 15, weight: .semibold)); Text("내 크루 · 멤버들의 음악 · 크루 채팅").font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(AifectDesign.muted) }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                            }.buttonStyle(.plain)
                        }
                        if let error { RetryCard(message: error) { Task { await load() } } }
                        if loading { ProgressView() }
                        else if songs.isEmpty && error == nil { ContentUnavailableView("아직 공개된 음악이 없어요", systemImage: "person.2.wave.2") }
                        if filter == "추천" {
                            if !songs.isEmpty { MusicSectionHeading(title: "지금 함께 듣는 음악") }
                            ForEach(songs.sorted { ($0.plays ?? 0) > ($1.plays ?? 0) }.prefix(2)) { CommunityMusicCard(song: $0, queue: songs) }
                            let covers = songs.filter(\.isCover)
                            if !covers.isEmpty { MusicSectionHeading(title: "새로 올라온 커버") }
                            ForEach(covers.prefix(2)) { CommunityMusicCard(song: $0, queue: covers) }
                            let originals = songs.filter { !$0.isCover }
                            if !originals.isEmpty { MusicSectionHeading(title: "새로 공개된 제작곡") }
                            ForEach(originals.prefix(2)) { CommunityMusicCard(song: $0, queue: originals) }
                        } else { ForEach(songs) { CommunityMusicCard(song: $0, queue: songs) } }
                    }.padding(20)
                }.refreshable { await load() }
            }
        }.task(id: filter + (model.userID ?? "guest")) { await load() }
    }
    private func load() async {
        guard filter != "크루", filter != "팔로잉" || model.user != nil else { return }
        songs = []; error = nil; loading = true
        let kind = filter == "듀엣" ? "kind=cover&cover_mode=duet" : filter == "커버" ? "kind=cover" : "kind="
        do { let value = try await API.shared.call("/api/community?" + kind + (filter == "팔로잉" ? "&following=1" : "")); try Task.checkCancellation(); songs = value.songs(); loading = false }
        catch is CancellationError {} catch { if !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
    }
}
struct SongActions: View {
    let song: Song
    @State private var detail = false
    var body: some View { Button { detail = true } label: { Label("좋아요 · 담기 · 댓글", systemImage: "ellipsis").font(.caption).frame(minHeight: 44) }.sheet(isPresented: $detail) { TrackDetailView(song: song) } }
}

struct MiniPlayer: View {
    @ObservedObject var player: MusicPlayer
    @State private var expanded = false
    var body: some View {
        if let song = player.current {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Button { expanded = true } label: {
                        HStack(spacing: 12) { CoverArt(song: song, size: 42); VStack(alignment: .leading, spacing: 4) { Text(song.title).font(.subheadline.bold()).lineLimit(1); Text(player.lyric.isEmpty ? song.credit : player.lyric).font(.caption).foregroundStyle(.secondary).lineLimit(1) }; Spacer(minLength: 0) }
                    }.buttonStyle(.plain).accessibilityLabel("재생 화면 열기")
                    if player.loading { ProgressView().frame(width: 44) } else {
                        Button { player.toggle() } label: { Image(systemName: player.playing ? "pause.fill" : "play.fill").frame(width: 44, height: 44) }.accessibilityLabel(player.playing ? "일시정지" : "재생")
                    }
                    Button { player.next() } label: { Image(systemName: "forward.end.fill").frame(width: 44, height: 44) }.accessibilityLabel("다음 곡")
                }.padding(.horizontal, 16).padding(.vertical, 10)
                ProgressView(value: player.position, total: max(1, player.duration)).tint(Brand.aqua)
            }.background(Brand.card)
            .sheet(isPresented: $expanded) { PlayerView(player: player) }
        }
    }
}

struct PlayerView: View {
    @ObservedObject var player: MusicPlayer
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var detail = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let song = player.current {
                        HStack { Text("NOW PLAYING").font(.system(size: 12)).tracking(2).foregroundStyle(AifectDesign.muted); Spacer(); Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("닫기") }
                        AlbumArtwork(song: song).frame(maxWidth: 380).frame(maxWidth: .infinity)
                        HStack {
                            VStack(alignment: .leading, spacing: 7) { Text(song.title).font(.system(size: 25, weight: .bold)).lineLimit(2); Text(song.credit).font(.system(size: 14)).foregroundStyle(AifectDesign.muted) }
                            Spacer()
                            Button { Task { await model.toggleLike(song) } } label: { Image(systemName: model.likes.contains(where: { $0.id == song.id }) ? "heart.fill" : "heart").foregroundStyle(Brand.pink).frame(width: 44, height: 44) }.accessibilityLabel("좋아요")
                        }.padding(.top, 4)
                        if player.preview { Text("60초 미리 듣기").font(.system(size: 12)).foregroundStyle(Brand.aqua) }
                        VStack(spacing: 4) {
                            Slider(value: Binding(get: { player.position }, set: { player.seek($0) }), in: 0...max(1, player.duration)).tint(Brand.aqua).accessibilityLabel("재생 위치")
                            HStack { Text(timeLabel(player.position)); Spacer(); Text(timeLabel(player.duration)) }.font(.system(size: 12).monospacedDigit()).foregroundStyle(AifectDesign.muted)
                        }
                        HStack {
                            Button { player.shuffled.toggle() } label: { Image(systemName: "shuffle").foregroundStyle(player.shuffled ? Brand.aqua : AifectDesign.muted).frame(maxWidth: .infinity, minHeight: 44) }.accessibilityLabel("셔플")
                            Button { player.previous() } label: { Image(systemName: "backward.end.fill").font(.system(size: 25)).frame(maxWidth: .infinity, minHeight: 44) }.accessibilityLabel("이전 곡")
                            Button { player.toggle() } label: { Image(systemName: player.playing ? "pause.fill" : "play.fill").font(.system(size: 30)).foregroundStyle(Brand.background).frame(width: 70, height: 70).background(Brand.aqua, in: Circle()) }.accessibilityLabel(player.playing ? "일시정지" : "재생")
                            Button { player.next() } label: { Image(systemName: "forward.end.fill").font(.system(size: 25)).frame(maxWidth: .infinity, minHeight: 44) }.accessibilityLabel("다음 곡")
                            Button { player.repeatOne.toggle() } label: { Image(systemName: player.repeatOne ? "repeat.1" : "repeat").foregroundStyle(player.repeatOne ? Brand.aqua : AifectDesign.muted).frame(maxWidth: .infinity, minHeight: 44) }.accessibilityLabel("한 곡 반복")
                        }.buttonStyle(.plain).padding(.vertical, 4)
                        if let error = player.error { RetryCard(message: error) { player.play(song, queue: [song]) } }
                        HStack {
                            SaveMusicButton(song: song, compact: true)
                            Spacer()
                            if let original = model.singable.first(where: { $0.id == (song.originalID ?? song.id) }) { SingSongButton(song: original, title: "부르기") }
                            Spacer()
                            Button { detail = true } label: { Label("댓글", systemImage: "bubble.left") }.font(.system(size: 14))
                        }
                        GiftSheetButton(song: song) { HStack { Label("마음에 드는 음악에 선물하기", systemImage: "gift"); Spacer(); Image(systemName: "chevron.right") }.font(.system(size: 14)).padding(18).background(Brand.card, in: RoundedRectangle(cornerRadius: 18)) }.buttonStyle(.plain)
                        VStack(alignment: .leading, spacing: 18) {
                            Text("LYRICS").font(.system(size: 12)).tracking(2).foregroundStyle(AifectDesign.muted)
                            Text(player.lyric.isEmpty ? "♪" : player.lyric).font(.system(size: 21, weight: .semibold)).foregroundStyle(Brand.aqua).lineLimit(1).frame(height: 30)
                            NavigationLink("전체 가사") { FullLyricsView(song: song).toolbar(.visible, for: .navigationBar) }.font(.system(size: 13))
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(22).background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
                        NavigationLink("재생 대기열") { QueueView(player: player).toolbar(.visible, for: .navigationBar) }
                        if player.preview { Button("로그인하고 전체 듣기") { dismiss(); model.showLogin = true }.buttonStyle(ParityPill()) }
                        Button("재생 종료") { player.close(); dismiss() }.foregroundStyle(AifectDesign.muted).font(.caption).frame(minHeight: 44)
                    }
                }.padding(.horizontal, 24).padding(.bottom, 30)
            }.background(Brand.background).toolbar(.hidden, for: .navigationBar)
                .sheet(isPresented: $detail) { if let song = player.current { TrackDetailView(song: song) } }
        }.presentationDragIndicator(.visible)
    }
}

struct MusicShelf: View {
    @EnvironmentObject var model: AppModel
    let title: String
    let songs: [Song]
    @State private var detail: Song?
    var body: some View {
        if !songs.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                MusicSectionHeading(title: title)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 14) { ForEach(songs) { song in
                        VStack(alignment: .leading, spacing: 5) {
                            CoverArt(song: song, size: 148).onTapGesture { detail = song }
                                .overlay(alignment: .bottomTrailing) { Button { model.player.play(song, queue: songs) } label: { Image(systemName: "play.fill").font(.system(size: 17)).frame(width: 34, height: 34).background(AifectDesign.raised, in: Circle()) }.padding(6).accessibilityLabel("\(song.title) 재생") }
                            Text(song.title).font(.system(size: 15, weight: .semibold)).lineLimit(1).padding(.top, 5).onTapGesture { detail = song }
                            Text(song.credit).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                            SaveMusicButton(song: song)
                        }.frame(width: 148, alignment: .leading)
                    } }
                }
            }.sheet(item: $detail) { TrackDetailView(song: $0) }
        }
    }
}
