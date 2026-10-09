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

private extension Color {
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
    var size: CGFloat = 54
    var body: some View {
        AsyncImage(url: song.artURL) { image in image.resizable().scaledToFill() } placeholder: {
            ZStack { Brand.gradient.opacity(0.25); Image(systemName: "waveform").font(.system(size: size * 0.3)).foregroundStyle(Brand.gradient) }
        }
        .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: 16)).accessibilityHidden(true)
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = 0
    @State private var account = false
    @ObservedObject private var push = PushNotifications.shared
    var body: some View {
        TabView(selection: $tab) {
            page("홈") { ListenView() }.tabItem { Label("홈", systemImage: "headphones") }.tag(0)
            page("커뮤니티") { CommunityView() }.tabItem { Label("커뮤니티", systemImage: "person.2") }.tag(1)
            page("부르기") { SingView() }.tabItem { Label("부르기", systemImage: "mic.fill") }.tag(2).tint(Brand.pink)
            page("메시지") { MessagesView() }.tabItem { Label("메시지", systemImage: "bubble.left.and.bubble.right") }.badge(model.inboxUnread).tag(3)
            page("마이") { MyMusicView() }.tabItem { Label("마이", systemImage: "person.crop.circle") }.tag(4)
        }
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
        .task { _ = StorePayments.shared; await model.refresh(); await ListeningAds.shared.consent() }
        .task(id: model.userID) {
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
                .navigationTitle(title)
                .toolbarBackground(Brand.background, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { AifectWordmark() }
                    ToolbarItem(placement: .topBarTrailing) { NavigationLink { SearchView().navigationTitle("검색") } label: { Image(systemName: "magnifyingglass").frame(width: 44, height: 44) }.accessibilityLabel("검색") }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { account = true } label: { Image(systemName: model.user == nil ? "person.crop.circle" : "person.crop.circle.fill").foregroundStyle(Brand.aqua) }.accessibilityLabel("계정")
                    }
                }
                .safeAreaInset(edge: .bottom, spacing: 0) { MiniPlayer(player: model.player) }
        }
    }
}

struct SongRow: View {
    @EnvironmentObject var model: AppModel
    let song: Song
    let queue: [Song]
    @State private var detail = false
    var body: some View {
        HStack(spacing: 12) {
            Button { model.player.play(song, queue: queue) } label: {
                HStack(spacing: 12) {
                    CoverArt(song: song)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(song.title).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(2)
                        Text(song.credit).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("\(song.title), \(song.credit), 재생")
            Button { detail = true } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.tint(.secondary).accessibilityLabel("\(song.title) 상세")
        }.padding(.vertical, 5)
            .sheet(isPresented: $detail) { TrackDetailView(song: song) }
    }
}

struct ListenView: View {
    @EnvironmentObject var model: AppModel
    @State private var selection = 0
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                if let error = model.error { RetryCard(message: error) { Task { await model.refresh() } } }
                if model.loading && model.latest.isEmpty { ProgressView("음악을 불러오는 중").frame(maxWidth: .infinity).padding(50) }
                if let hero = model.latest.first {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack { Label("오늘의 발견", systemImage: "sparkles").font(.caption.weight(.bold)).foregroundStyle(Brand.aqua); Spacer(); Text("AI와 음악의 만남").font(.caption2).foregroundStyle(.secondary) }
                        HStack(alignment: .center, spacing: 20) {
                            CoverArt(song: hero, size: 130)
                            VStack(alignment: .leading, spacing: 10) {
                                Text(hero.title).font(.title2.bold()).lineLimit(3)
                                Text(hero.credit).font(.subheadline).foregroundStyle(.secondary)
                                Button { model.player.play(hero, queue: model.latest) } label: { Label("지금 듣기", systemImage: "play.fill").font(.subheadline.bold()) }.buttonStyle(.borderedProminent).tint(Brand.aqua).foregroundStyle(.black)
                            }
                        }
                    }.padding(20).background(Brand.card, in: RoundedRectangle(cornerRadius: 26))
                }
                NavigationLink("장르 · 아티스트 · 플레이리스트 둘러보기") { ExploreView() }
                NavigationLink("커버곡 랭킹") { CoverRankingView() }
                HStack {
                    NavigationLink { LibraryView(initialSelection: 1) } label: { Label("좋아요", systemImage: "heart") }
                    Spacer()
                    NavigationLink { LibraryView(initialSelection: 2) } label: { Label("최근 감상", systemImage: "clock") }
                    Spacer()
                    NavigationLink { LibraryView() } label: { Label("보관함", systemImage: "music.note.list") }
                }.font(.caption).frame(minHeight: 48)
                if !model.singable.isEmpty { MusicShelf(title: "이번엔 내 목소리로", songs: Array(model.singable.prefix(8))) }
                Picker("음악 목록", selection: $selection) { Text("최신곡").tag(0); Text("인기 차트").tag(1) }.pickerStyle(.segmented)
                let songs = selection == 0 ? model.latest : model.chart
                VStack(alignment: .leading, spacing: 12) {
                    HStack { Text(selection == 0 ? "새롭게 도착한 음악" : "지금 사랑받는 음악").font(.title3.bold()); Spacer(); Text("\(songs.count)곡").font(.caption).foregroundStyle(.secondary) }
                    if songs.isEmpty && !model.loading { ContentUnavailableView("아직 음악이 없어요", systemImage: "music.note") }
                    ForEach(songs) { SongRow(song: $0, queue: songs) }
                }
                if !model.feed.isEmpty { MusicShelf(title: "새로운 목소리", songs: Array(model.feed.filter(\.isCover).prefix(8))) }
            }.padding(20)
        }.refreshable { await model.refresh() }
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
    @State private var grid = false
    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack { ForEach(AifectDesign.communityTabs, id: \.self) { item in
                    Button(item) { filter = item }.buttonStyle(.bordered).tint(filter == item ? Brand.aqua : AifectDesign.muted)
                } }.padding(.horizontal, 20).padding(.vertical, 8)
            }
            if filter == "크루" { CrewsView() }
            else if filter == "팔로잉" && model.user == nil { LoginPrompt(title: "팔로잉의 음악을 만나보세요") }
            else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        Text("음악으로 이어지는 우리").font(.title2.bold())
                        NavigationLink { CrewsView() } label: {
                            HStack { Image(systemName: "person.3.fill"); VStack(alignment: .leading) { Text("크루에서 함께 듣고 부르기").font(.headline); Text("내 크루 · 함께 듣는 음악 · 크루 채팅").font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "chevron.right") }.padding(18).background(Brand.card, in: RoundedRectangle(cornerRadius: 22))
                        }.buttonStyle(.plain)
                        HStack { Text("지금 함께 듣는 음악").font(.title3.bold()); Spacer(); Button { grid.toggle() } label: { Image(systemName: grid ? "list.bullet" : "square.grid.2x2").frame(width: 44, height: 44) }.accessibilityLabel(grid ? "목록으로 보기" : "그리드로 보기") }
                        if let error { RetryCard(message: error) { Task { await load() } } }
                        if loading { ProgressView() }
                        else if songs.isEmpty && error == nil { ContentUnavailableView("아직 공개된 음악이 없어요", systemImage: "person.2.wave.2") }
                        if grid {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 135))], spacing: 16) { ForEach(songs) { song in
                                VStack(alignment: .leading, spacing: 8) {
                                    Button { model.player.play(song, queue: songs) } label: { CoverArt(song: song, size: 135) }.accessibilityLabel("\(song.title) 재생")
                                    Text(song.title).font(.subheadline.bold()).lineLimit(2)
                                    Text(song.credit).font(.caption).foregroundStyle(.secondary)
                                    SongActions(song: song)
                                }
                            } }
                        } else { ForEach(songs) { song in
                            VStack(alignment: .leading, spacing: 10) {
                                SongRow(song: song, queue: songs)
                                HStack { Label(song.isCover ? "커버곡" : "제작곡", systemImage: song.isCover ? "mic" : "waveform"); Spacer(); Label("\(song.likes)", systemImage: "heart"); Label("\(song.comments)", systemImage: "bubble") }.font(.caption).foregroundStyle(.secondary)
                            }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 22))
                        } }
                    }.padding(20)
                }.refreshable { await load() }
            }
        }.task(id: filter) { await load() }
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
            }.background(.ultraThinMaterial)
            .sheet(isPresented: $expanded) { PlayerView(player: player) }
        }
    }
}

struct PlayerView: View {
    @ObservedObject var player: MusicPlayer
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 26) {
                    if let song = player.current {
                        Text(player.preview ? "60초 미리 듣기 · 로그인하면 전체 감상" : "AIFECT · 지금 재생 중").font(.caption).foregroundStyle(Brand.aqua)
                        CoverArt(song: song, size: 280).padding(.top, 10)
                        VStack(spacing: 8) { Text(song.title).font(.title.bold()).multilineTextAlignment(.center); Text(song.credit).foregroundStyle(.secondary) }
                        Text(player.lyric.isEmpty ? "음악에 집중하는 순간" : player.lyric).font(.body).foregroundStyle(Brand.aqua).lineLimit(1).frame(height: 28)
                        VStack {
                            Slider(value: Binding(get: { player.position }, set: { player.seek($0) }), in: 0...max(1, player.duration)).accessibilityLabel("재생 위치")
                            HStack { Text(timeLabel(player.position)); Spacer(); Text(timeLabel(player.duration)) }.font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        }
                        HStack(spacing: 30) {
                            Button { player.shuffled.toggle() } label: { Image(systemName: "shuffle").foregroundStyle(player.shuffled ? Brand.pink : .secondary) }.accessibilityLabel("셔플")
                            Button { player.previous() } label: { Image(systemName: "backward.end.fill").font(.title2) }.accessibilityLabel("이전 곡")
                            Button { player.toggle() } label: { Image(systemName: player.playing ? "pause.circle.fill" : "play.circle.fill").font(.system(size: 68)).foregroundStyle(Brand.pink) }.accessibilityLabel(player.playing ? "일시정지" : "재생")
                            Button { player.next() } label: { Image(systemName: "forward.end.fill").font(.title2) }.accessibilityLabel("다음 곡")
                            Button { player.repeatOne.toggle() } label: { Image(systemName: "repeat.1").foregroundStyle(player.repeatOne ? Brand.pink : .secondary) }.accessibilityLabel("한 곡 반복")
                        }.buttonStyle(.plain)
                        if let error = player.error { RetryCard(message: error) { player.play(song, queue: [song]) } }
                        NavigationLink("재생 대기열") { QueueView(player: player) }
                        NavigationLink("전체 가사") { FullLyricsView(song: song) }
                        if player.preview { Button("로그인하고 전체 듣기") { dismiss(); model.showLogin = true }.buttonStyle(.bordered) }
                    }
                }.padding(24)
            }.background(Brand.background)
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("닫기") { dismiss() } }; ToolbarItem(placement: .topBarTrailing) { Button("재생 종료") { player.close(); dismiss() } } }
        }
    }
}

struct MusicShelf: View {
    @EnvironmentObject var model: AppModel
    let title: String
    let songs: [Song]
    var body: some View {
        if !songs.isEmpty { VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.title3.bold())
            ScrollView(.horizontal, showsIndicators: false) { HStack(alignment: .top, spacing: 16) { ForEach(songs) { song in
                VStack(alignment: .leading, spacing: 8) {
                    Button { model.player.play(song, queue: songs) } label: { CoverArt(song: song, size: 144) }.accessibilityLabel("\(song.title) 재생")
                    Text(song.title).font(.subheadline.bold()).lineLimit(2)
                    Text(song.credit).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    SongActions(song: song)
                }.frame(width: 144, alignment: .leading)
            } } }
        } }
    }
}
