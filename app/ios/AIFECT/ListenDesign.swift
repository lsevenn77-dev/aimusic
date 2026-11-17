import SwiftUI

struct ListenView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var page: String
    @State private var detail: Song?
    @Binding var chartPage: Int
    @State private var weeklyChart: [Song] = []
    @Binding var homeSection: String?
    @State private var homeWidth: CGFloat = 362
    @State private var promotion: HomePromotion?
    @State private var coverURL: URL?
    @State private var publicLists: [[String: Any]] = []
    @State private var artists: [[String: Any]] = []
    @State private var people: [[String: Any]] = []
    @State private var covers: [Song] = []
    @State private var discoveryError: String?
    @State private var shelvesLoaded: Date?
    init(page: Binding<String>, chartPage: Binding<Int>, homeSection: Binding<String?>) {
        _page = page; _chartPage = chartPage; _homeSection = homeSection
        _weeklyChart = State(initialValue: API.shared.peek("/api/catalog?section=tracks&chart=top&period=week")?.songs() ?? [])
        _covers = State(initialValue: Array((API.shared.peek("/api/community?kind=cover")?.songs() ?? []).prefix(10)))
        _publicLists = State(initialValue: Array((API.shared.peek("/api/playlists?sort=popular")?.objects("playlists") ?? []).filter { $0.int("tracks") > 0 }.prefix(10)))
        _people = State(initialValue: Array((API.shared.peek("/api/catalog?section=producers&limit=30")?.objects("producers") ?? []).prefix(12)))
    }
    var body: some View {
        VStack(spacing: 0) {
            if page == "추천" {
                HomePromotionCarousel(coverURL: $coverURL) { item in
                    switch item.id {
                    case "play", "participate": model.homePlayRequest = item.id == "play" ? "추천" : "듀엣 참여"; model.selectTab(2)
                    case "karaoke", "talking", "crew": model.homeCommunityRequest = item.id == "crew" ? "크루" : "라이브"; model.selectTab(1)
                    case "studio": if model.requireLogin() { promotion = item }
                    default: promotion = item
                    }
                }.padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 6)
                homeTabs.padding(.horizontal, 14)
            } else {
                HStack { Button { page = "추천" } label: { Label("홈", systemImage: "chevron.left") }; Spacer(); Text(page == "차트" ? "인기 차트" : page).font(.headline); Spacer() }.padding(.horizontal, 14).frame(height: 48)
            }
            if page == "발견" { SearchView(discovery: true, onPopularChart: { page = "차트" }) }
            else if page == "차트" { PopularChartView() }
            else {
                ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if let error = model.error { RetryCard(message: error) { Task { await model.refresh() } } }
                        if page == "추천" { recommended }
                        else {
                            Text("새롭게 도착한 음악").font(.title2.bold()).padding(.top, 12)
                            Text("최근 공개된 제작곡을 차례로 들어보세요").font(.subheadline).foregroundStyle(AifectDesign.muted)
                            HStack(spacing: 10) {
                                latestPlaybackButton(shuffle: false)
                                latestPlaybackButton(shuffle: true)
                            }.disabled(model.latest.isEmpty)
                            ForEach(model.latest) { StreamingSongRow(song: $0, queue: model.latest) }
                        }
                        if model.loading && model.latest.isEmpty { ProgressView("음악을 불러오는 중").frame(maxWidth: .infinity).padding(44) }
                        else if model.latest.isEmpty && model.error == nil { ContentUnavailableView("새로운 음악을 기다려요", systemImage: "music.note") }
                    }.padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 24)
                }.accessibilityIdentifier("listen-scroll").id(page).refreshable { await model.refresh(); await model.loadLibrary(); await loadShelves(force: true) }
                    .onChange(of: homeSection) { _, section in
                        withAnimation(.easeInOut(duration: 0.22)) { proxy.scrollTo(section ?? "추천", anchor: .top) }
                    }
                    .task(id: weeklyChart.count) {
                        if page == "추천" { proxy.scrollTo(homeSection ?? "추천", anchor: .top) }
                    }
                }
            }
        }.background {
            if page == "추천" {
                GeometryReader { geo in
                    RemoteArtwork(url: coverURL) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                        .frame(width: geo.size.width, height: geo.size.height).blur(radius: 36).opacity(0.5)
                        .overlay(LinearGradient(stops: [.init(color: Brand.background.opacity(0.35), location: 0), .init(color: Brand.background.opacity(0.6), location: 0.5), .init(color: Brand.background, location: 1)], startPoint: .top, endPoint: .bottom))
                        .clipped().accessibilityHidden(true)
                }.allowsHitTesting(false)
            }
        }.navigationDestination(item: $promotion) { item in
            if item.id == "studio" { CreatorWorkView().streamingPage() }
            else { CatalogDirectory(artists: true).streamingPage() }
        }.navigationDestination(item: $detail) { TrackDetailView(song: $0) }.task(id: "\(model.userID ?? "guest")|\(model.selectedTab)") { if model.selectedTab == 0 { await loadShelves() } }
    }
    private func latestPlaybackButton(shuffle: Bool) -> some View {
        Button {
            let songs = model.latest
            guard let first = shuffle ? songs.randomElement() : songs.first else { return }
            model.player.shuffled = shuffle
            model.player.play(first, queue: songs)
        } label: {
            Label(shuffle ? "셔플" : "전체 재생", systemImage: shuffle ? "shuffle" : "play.fill")
                .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                .background(shuffle ? Color.clear : Brand.aqua.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
        }.buttonStyle(.plain)
    }
    private var sections: [String] {
        var names = ["추천", "인기 차트", "최신곡", "발견", "내 플레이리스트"]
        if !model.history.isEmpty { names.append("최근 감상") }
        if !model.singable.isEmpty { names.append("부르기") }
        if !covers.isEmpty { names.append("커버곡") }
        if !publicLists.isEmpty { names.append("공개 플레이리스트") }
        if !artists.isEmpty { names.append("AI 아티스트") }
        if !people.isEmpty { names.append("창작자") }
        return names
    }
    private var homeTabs: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(sections.filter { $0 != "부르기" }, id: \.self) { key in
                        Button { withAnimation(.easeInOut(duration: 0.22)) { homeSection = key } } label: {
                            VStack(spacing: 4) {
                                Image(systemName: ["추천":"star.fill", "인기 차트":"chart.bar.fill", "최신곡":"clock", "발견":"safari", "내 플레이리스트":"music.note.list", "최근 감상":"clock.arrow.circlepath", "커버곡":"headphones", "공개 플레이리스트":"music.note.house", "AI 아티스트":"star", "창작자":"person.2"][key] ?? "music.note").font(.system(size: 22))
                                Text(key).font(.system(size: 12)).lineLimit(1)
                                Capsule().fill(Brand.gradient).frame(width: max(76, homeWidth / 4) * 0.72, height: 3).opacity(homeSection == key ? 1 : 0)
                            }.frame(width: max(76, homeWidth / 4), height: 64).contentShape(Rectangle())
                        }.buttonStyle(.plain).foregroundStyle(homeSection == key ? Brand.pink : AifectDesign.secondaryText)
                            .accessibilityAddTraits(homeSection == key ? .isSelected : []).accessibilityIdentifier("home-section-" + key).id(key)
                    }
                }
            }.onChange(of: homeSection) { _, key in if let key, key != "부르기" { withAnimation { proxy.scrollTo(key, anchor: .leading) } } }
        }.overlay(alignment: .bottom) { Divider() }.onGeometryChange(for: CGFloat.self) { $0.size.width } action: { homeWidth = $0 }
    }
    @ViewBuilder private var recommended: some View {
        ForEach(sections, id: \.self) { section in
            VStack(alignment: .leading, spacing: section == "추천" ? 0 : 10) { homeContent(section) }.id(section)
        }
        if let discoveryError { RetryCard(message: discoveryError) { Task { await loadShelves(force: true) } } }
    }
    @ViewBuilder private func homeContent(_ section: String) -> some View {
        let releases = model.latest.isEmpty ? model.chart : model.latest
        switch section {
        case "추천":
            HStack { Text("추천 음악").font(.system(size: 20, weight: .bold)); Spacer(); NavigationLink { MusicCollectionView(title: "추천 음악", path: "/api/catalog?section=tracks&chart=top").streamingPage() } label: { HStack(spacing: 4) { Text("모두 보기"); Image(systemName: "chevron.right") }.font(.system(size: 12)).foregroundStyle(AifectDesign.muted) } }.frame(minHeight: 48)
            VStack(spacing: 0) { ForEach(model.chart.prefix(5)) { song in HomeTrackRow(song: song, queue: model.chart, player: model.player) } }
        case "인기 차트":
            HStack { Text("인기 차트").font(.headline); Spacer(); Button("전체 보기") { page = "차트" }.font(.caption).frame(minHeight: 44) }
            if !weeklyChart.isEmpty {
                let start = chartPage * 10
                HStack {
                    Text("이번 주 · \(start + 1)–\(min(start + 10, weeklyChart.count))위").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                    Spacer()
                    Button { chartPage = max(0, chartPage - 1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.disabled(chartPage == 0).accessibilityLabel("이전 10곡")
                    Button { chartPage += 1 } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.disabled(start + 10 >= weeklyChart.count).accessibilityLabel("다음 10곡")
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 0) {
                    ForEach(0..<max(1, (weeklyChart.count + 9) / 10), id: \.self) { page in
                        VStack(spacing: 0) {
                            ForEach(Array(weeklyChart.dropFirst(page * 10).prefix(10).enumerated()), id: \.element.id) { offset, song in
                                HomeTrackRow(song: song, queue: weeklyChart, player: model.player, rank: song.chartRank ?? page * 10 + offset + 1)
                            }
                            Spacer(minLength: 0)
                        }.containerRelativeFrame(.horizontal).id(page).accessibilityIdentifier("home-chart-page-\(page)")
                    }
                    }.scrollTargetLayout()
                }.scrollTargetBehavior(.paging)
                    .scrollPosition(id: Binding<Int?>(get: { chartPage }, set: { if let page = $0 { chartPage = page } }))
                    .frame(height: CGFloat(min(10, weeklyChart.count)) * 66).clipped().contentShape(Rectangle())
                    .accessibilityIdentifier("home-chart-pages")
            } else { Text("아직 집계된 곡이 없어요.").font(.subheadline).foregroundStyle(AifectDesign.muted) }
        case "최신곡":
            HStack { Text("최신곡").font(.headline); Spacer(); Button("모두 보기") { page = "최신곡" }.font(.caption).frame(minHeight: 44) }
            StreamingArtworkShelf(songs: Array(releases.prefix(10)), onDetail: { detail = $0 })
        case "발견":
            HStack { Text("발견").font(.headline); Spacer(); Button("기분 · 장르") { page = "발견" }.font(.caption).frame(minHeight: 44) }
            HomeDiscoveryTiles(songs: releases)
        case "내 플레이리스트":
            StreamingHeading(title: "내 플레이리스트") { LibraryView().navigationTitle("플레이리스트") }
            if model.playlists.isEmpty {
                NavigationLink { LibraryView().streamingPage() } label: { StreamingEntry(title: "나만의 플레이리스트", caption: "좋아하는 음악을 모아보세요", icon: "music.note.list") }.buttonStyle(.plain)
            } else { HomePlaylistShelf(lists: model.playlists) }
            MusicLibraryShortcuts(compact: true)
        case "최근 감상":
            StreamingHeading(title: "최근 들은 음악") { LibraryView(initialSelection: 2).navigationTitle("최근 감상") }
            StreamingArtworkShelf(songs: Array(model.history.prefix(10)), compact: true, onDetail: { detail = $0 })
        case "부르기":
            StreamingHeading(title: "이번엔 내 목소리로") { SingCatalogView() }
            ForEach(model.singable.prefix(3)) { StreamingSongRow(song: $0, queue: model.singable, sing: true) }
        case "커버곡":
            StreamingHeading(title: "같은 노래, 다른 목소리") { MusicCollectionView(title: "커버곡 둘러보기", path: "/api/community?kind=cover") }
            StreamingArtworkShelf(songs: covers, onDetail: { detail = $0 })
        case "공개 플레이리스트": MusicSectionHeading(title: "취향을 나누는 플레이리스트"); HomePlaylistShelf(lists: publicLists)
        case "AI 아티스트":
            StreamingHeading(title: "지금 뜨는 AI 아티스트") { CatalogDirectory(artists: true) }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) { ForEach(artists, id: \.selfID) { artist in
                    NavigationLink { ProfilePage(id: artist.selfID, kind: "artist").streamingPage() } label: {
                        VStack(spacing: 8) { ArtistArtwork(artist: artist).frame(width: 74, height: 74).clipShape(Circle()).overlay(Circle().stroke(AifectDesign.stroke)); Text(artist.displayName()).font(.system(size: 13, weight: .semibold)).lineLimit(1) }.frame(width: 84).padding(.vertical, 4)
                    }.buttonStyle(.plain).accessibilityIdentifier("home-artist-" + artist.selfID)
                } }
            }
        default:
            MusicSectionHeading(title: "음악 뒤의 사람들")
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 12) { ForEach(people, id: \.selfID) { person in NavigationLink { ProfilePage(id: person.selfID).streamingPage() } label: { CreatorPreviewCard(person: person) }.buttonStyle(.plain) } } }
        }
    }
    private func loadShelves(force: Bool = false) async {
        if !force, let shelvesLoaded, Date().timeIntervalSince(shelvesLoaded) < 30 { return }
        let owner = model.userID
        await withTaskGroup(of: (String, [String: Any]?).self) { group in
            var paths = ["/api/catalog?section=tracks&chart=top&period=week", "/api/community?kind=cover", "/api/playlists?sort=popular", "/api/discovery/profiles?kind=artist&sort=popular", "/api/catalog?section=producers&limit=30"].makeIterator()
            for _ in 0..<2 { if let path = paths.next() { group.addTask { (path, try? await API.shared.call(path, fresh: force)) } } }
            var failed = false
            for await (path, result) in group {
                if !Task.isCancelled, let next = paths.next() { group.addTask { (next, try? await API.shared.call(next, fresh: force)) } }
                guard !Task.isCancelled, owner == model.userID else { continue }
                guard let result else { failed = true; continue }
                if path.contains("period=week") { weeklyChart = result.songs(); chartPage = min(chartPage, max(0, (weeklyChart.count - 1) / 10)) }
                else if path.hasPrefix("/api/community") { covers = Array(result.songs().prefix(10)) }
                else if path.hasPrefix("/api/playlists") { publicLists = Array(result.objects("playlists").filter { $0.int("tracks") > 0 }.prefix(10)) }
                else if path.hasPrefix("/api/discovery") { artists = Array(result.objects("profiles").prefix(12)) }
                else { people = Array(result.objects("producers").prefix(12)) }
            }
            if !Task.isCancelled, owner == model.userID {
                discoveryError = failed ? "일부 추천 목록을 불러오지 못했어요." : nil
                if !failed { shelvesLoaded = Date() }
            }
        }
    }
}

private struct HomeTrackRow: View {
    @EnvironmentObject var model: AppModel
    let song: Song
    let queue: [Song]
    @ObservedObject var player: MusicPlayer
    var rank: Int?
    private var active: Bool { player.current?.id == song.id && player.playing }
    var body: some View {
        HStack(spacing: 8) {
            if let rank { Text("\(rank)").font(.subheadline.bold()).frame(width: 20) }
            Button { model.player.play(song, queue: queue) } label: { CoverArt(song: song, size: rank == nil ? 62 : 50) }.accessibilityLabel("\(song.title) 앨범 표지 재생")
            Button { model.navigationPath.append(song) } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(song.title).font(.system(size: 15, weight: .semibold))
                    Text(song.credit).font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    HStack(spacing: 9) {
                        Label("\(song.plays ?? 0)", systemImage: "play")
                        Label("\(song.likes)", systemImage: "heart")
                        Label("\(song.comments)", systemImage: "bubble")
                    }.font(.system(size: 10)).foregroundStyle(AifectDesign.secondaryText)
                }.lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.accessibilityLabel("\(song.title) 상세")
            Button { if player.current?.id == song.id { player.toggle() } else { player.play(song, queue: queue) } } label: {
                Image(systemName: active ? "pause.fill" : "play.fill").font(.system(size: 14)).frame(width: 32, height: 32).background { Circle().fill(active ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Brand.background.opacity(0.7))) }.overlay(Circle().stroke(Brand.gradient, lineWidth: 1)).frame(minWidth: 48, minHeight: 48)
            }.foregroundStyle(active ? Brand.background : Brand.pink).accessibilityLabel("\(song.title) \(active ? "일시정지" : "재생")")
            Menu { Button("상세 보기") { model.navigationPath.append(song) }; Button("좋아요") { Task { await model.toggleLike(song) } }; Button("음악 메뉴") { model.navigationPath.append(song) } } label: { Image(systemName: "line.3.horizontal").font(.system(size: 18)).frame(width: 44, height: 48) }.accessibilityLabel("\(song.title) 더보기")
        }.buttonStyle(.plain).padding(.vertical, 7)
            .overlay(alignment: .bottom) { Divider() }
            .accessibilityIdentifier("stream-song-\(song.id)")
    }
}

struct HomePromotion: Identifiable, Hashable {
    let id: String
    let title: String
    let headline: String
    var url: URL? { CatalogArtwork.url("/assets/home-banners/\(id == "crew" ? "seamless-20261109" : "mobile-20261109")/\(id)-768.webp") }
    static let all = [
        HomePromotion(id: "studio", title: "스튜디오", headline: "내 제작곡을 올려보세요"),
        HomePromotion(id: "play", title: "플레이", headline: "마음에 드는 노래를 불러보세요"),
        HomePromotion(id: "participate", title: "듀엣·더빙", headline: "함께 작품을 완성해보세요"),
        HomePromotion(id: "artists", title: "AI 아티스트", headline: "아티스트를 팔로우하고 응원해보세요"),
        HomePromotion(id: "karaoke", title: "노래방", headline: "사람들과 함께 노래해보세요"),
        HomePromotion(id: "talking", title: "토킹룸", headline: "편하게 이야기해보세요"),
        HomePromotion(id: "crew", title: "크루", headline: "크루에 가입하고 함께 즐겨보세요")
    ]
}
struct HomePromotionCarousel: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @Binding var coverURL: URL?
    var open: (HomePromotion) -> Void
    @State private var index = 0
    @State private var width: CGFloat = 362
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
            ForEach(Array(HomePromotion.all.enumerated()), id: \.element.id) { offset, item in
                Button { open(item) } label: {
                    ZStack(alignment: .leading) {
                        GeometryReader { proxy in
                            RemoteArtwork(url: item.url) { $0.resizable().scaledToFill() } placeholder: { Image("HomePromotion-" + item.id).resizable().scaledToFill() }
                                .frame(width: proxy.size.width, height: proxy.size.height).clipped()
                        }
                        LinearGradient(colors: [.black.opacity(0.57), .clear], startPoint: .leading, endPoint: .trailing)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.title).font(.system(size: 13, weight: .semibold))
                            Text(item.headline).font(.system(size: 18, weight: .bold)).lineSpacing(2).lineLimit(3)
                        }.padding(.leading, 16).padding(.trailing, 4).padding(.bottom, 6).frame(width: width * 0.63, alignment: .leading)
                    }.foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 6)).contentShape(Rectangle())
                }.buttonStyle(.plain).frame(width: width, height: max(142, width / 2.45))
                    .accessibilityIdentifier("home-promotion-" + item.id).id(offset)
            }
            }.scrollTargetLayout()
        }.scrollTargetBehavior(.paging)
            .scrollPosition(id: Binding<Int?>(get: { index }, set: { if let value = $0 { index = value } }))
            .frame(height: max(142, width / 2.45)).clipped().contentShape(Rectangle())
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .onChange(of: index, initial: true) { _, value in coverURL = HomePromotion.all[value].url }
            .overlay(alignment: .bottom) { HStack(spacing: 5) { ForEach(HomePromotion.all.indices, id: \.self) { n in Circle().fill(.white.opacity(index == n ? 1 : 0.45)).frame(width: 5, height: 5) } }.padding(.bottom, 9).allowsHitTesting(false) }
            .accessibilityIdentifier("home-carousel")
            .task(id: "\(phase)-\(model.selectedTab)-\(index)-\(reduceMotion)") {
                guard phase == .active, model.selectedTab == 0, !reduceMotion else { return }
                #if DEBUG
                if FeedbackUIFixture.enabled { return }
                #endif
                do { try await Task.sleep(for: .milliseconds(4500)) } catch { return }
                withAnimation { index = (index + 1) % HomePromotion.all.count }
            }
    }
}
struct StreamingArtworkShelf: View {
    @EnvironmentObject private var model: AppModel
    let songs: [Song]
    var compact = false
    var onDetail: (Song) -> Void
    @State private var availableWidth: CGFloat = 360
    private var width: CGFloat { compact ? min(102, max(76, (availableWidth - 24) / 4)) : min(170, (availableWidth - 16) / 2.15) }
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: compact ? 8 : 10) {
                ForEach(songs) { song in
                    VStack(alignment: .leading, spacing: compact ? 5 : 7) {
                        Button { if compact { model.player.play(song, queue: songs) } else { onDetail(song) } } label: {
                            AlbumArtwork(song: song).frame(width: width, height: width).clipShape(RoundedRectangle(cornerRadius: compact ? 9 : 11))
                        }.buttonStyle(.plain).accessibilityLabel(song.title + (compact ? " 재생" : " 상세"))
                            .overlay(alignment: .bottomTrailing) {
                                if !compact { Button { model.player.play(song, queue: songs) } label: { Image(systemName: "play.fill").font(.system(size: 10)).foregroundStyle(.white).frame(width: 30, height: 30).background(.black.opacity(0.55), in: Circle()).overlay(Circle().stroke(Brand.gradient)) }.buttonStyle(.plain).padding(4).accessibilityLabel(song.title + " 재생") }
                            }
                        Button { onDetail(song) } label: { Text(song.title).font(.system(size: compact ? 12 : 14, weight: compact ? .regular : .semibold)).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.plain)
                        Text(song.credit).font(.system(size: compact ? 10 : 11)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                    }.frame(width: width, alignment: .leading).padding(.bottom, compact ? 0 : 12)
                }
            }
        }.onGeometryChange(for: CGFloat.self) { $0.size.width } action: { availableWidth = $0 }
    }
}
struct HomePlaylistShelf: View {
    let lists: [[String: Any]]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 14) { ForEach(lists, id: \.selfID) { list in
                NavigationLink { PlaylistView(id: list.selfID, title: list.string("name")).streamingPage() } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        PlaylistArtwork(list: list).frame(width: 160, height: 160).clipShape(RoundedRectangle(cornerRadius: 16))
                        Text(list.string("name")).font(.system(size: 15, weight: .semibold)).lineLimit(2)
                        Text("\(list.int("tracks"))곡" + (list.string("owner_name").isEmpty ? "" : " · " + list.string("owner_name"))).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                    }.frame(width: 160, alignment: .leading)
                }.buttonStyle(.plain)
            } }
        }
    }
}
struct HomeDiscoveryTiles: View {
    let songs: [Song]
    var body: some View {
        HStack(spacing: 10) {
            ForEach(Array([("장르별", "headphones"), ("기분별", "sun.max")].enumerated()), id: \.offset) { index, entry in
                NavigationLink {
                    ScrollView { if index == 0 { GenreMusicGrid().padding(16) } else { MoodMusicShelf().padding(16) } }.navigationTitle(entry.0 + "로 발견").streamingPage()
                } label: {
                    HStack(spacing: 9) { Image(systemName: entry.1).font(.system(size: 24)).foregroundStyle(Brand.pink); Text(entry.0).font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity, alignment: .leading); Image(systemName: "chevron.right").font(.system(size: 13)) }
                        .padding(.horizontal, 12).frame(minHeight: 58)
                        .background {
                            GeometryReader { geometry in
                                if songs.indices.contains(index) { RemoteArtwork(url: songs[index].artURL) { $0.resizable().scaledToFill() } placeholder: { Color.clear }.frame(width: geometry.size.width, height: geometry.size.height).opacity(0.25).clipped() }
                            }
                        }
                        .background(Brand.card).clipShape(RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Brand.gradient, lineWidth: 0.7))
                }.buttonStyle(.plain).accessibilityIdentifier(index == 0 ? "home-discover-genre" : "home-discover-mood")
            }
        }
    }
}
struct MoodMusicShelf: View {
    private let moods: [(String, String, String, String, UInt32)] = [
        ("comfort", "위로가 필요할 때", "마음을 다독이는 음악", "heart", 0x7165AD),
        ("energy", "기분을 올려줘", "리듬에 몸을 맡겨요", "bolt", 0x86536C),
        ("focus", "나만의 몰입", "집중이 필요한 순간", "scope", 0x427E78),
        ("drive", "어디든 떠나자", "길 위의 사운드트랙", "car", 0x496F9A),
        ("sleep", "잠들기 전", "천천히 마무리하는 하루", "moon.stars", 0x5B5985),
        ("workout", "운동", "리듬에 맞춰 한 걸음 더", "figure.run", 0x53687C),
        ("romance", "설렘 · 사랑", "마음이 가까워지는 순간", "heart", 0x86536C),
        ("nostalgia", "추억", "다시 떠오르는 그때", "clock", 0x7165AD),
        ("rain", "비 오는 날", "차분하게 스며드는 음악", "cloud.rain", 0x496F9A),
        ("night", "밤 · 새벽", "깊어진 밤의 음악", "moon", 0x5B5985),
        ("party", "파티", "함께 즐기는 리듬", "music.note", 0x86536C),
        ("meditation", "휴식 · 명상", "잠시 숨을 고르는 시간", "leaf", 0x427E78)]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) { ForEach(moods, id: \.0) { mood in
                NavigationLink { MusicCollectionView(title: mood.1, path: "/api/discovery?mood=\(mood.0)").streamingPage() } label: {
                    VStack(alignment: .leading, spacing: 7) { Image(systemName: mood.3).font(.system(size: 20)).foregroundStyle(Brand.pink); Spacer(minLength: 12); Text(mood.1).font(.system(size: 14, weight: .semibold)); Text(mood.2).font(.system(size: 11)).foregroundStyle(AifectDesign.muted) }.frame(width: 148, height: 100, alignment: .leading).padding(14).background(Brand.card.opacity(0.75), in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke))
                }.buttonStyle(.plain)
            } }
        }
    }
}
