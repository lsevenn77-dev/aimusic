import SwiftUI

struct ListenView: View {
    @EnvironmentObject private var model: AppModel
    @State private var page = "추천"
    @State private var detail: Song?
    @State private var chartPage = 0
    @State private var coverURL: URL?
    @State private var publicLists: [[String: Any]] = []
    @State private var artists: [[String: Any]] = []
    @State private var people: [[String: Any]] = []
    @State private var covers: [Song] = []
    @State private var discoveryError: String?
    var body: some View {
        VStack(spacing: 0) {
            if page != "추천" { homeTabs.padding(.horizontal, 14) }
            if page == "발견" { SearchView(discovery: true, onPopularChart: { page = "차트" }) }
            else if page == "차트" { PopularChartView() }
            else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
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
                    }.padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 24)
                }.id(page).refreshable { await model.refresh(); await model.loadLibrary(); await loadShelves() }
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
    private var homeTabs: some View {
        HStack(spacing: 0) {
            ForEach(["추천", "차트", "최신곡", "발견"], id: \.self) { key in
                Button { page = key } label: {
                    VStack(spacing: 5) {
                        Image(systemName: ["추천":"star.fill", "차트":"chart.bar.fill", "최신곡":"clock", "발견":"safari"][key] ?? "circle").font(.system(size: 21))
                        Text(key == "차트" ? "인기 차트" : key).font(.system(size: 12, weight: page == key ? .semibold : .regular))
                        Capsule().fill(Brand.gradient).frame(width: 48, height: 3).opacity(page == key ? 1 : 0)
                    }.frame(maxWidth: .infinity, minHeight: 60).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(page == key ? Brand.pink : AifectDesign.secondaryText)
                    .accessibilityAddTraits(page == key ? .isSelected : [])
                if key != "발견" { Rectangle().fill(AifectDesign.stroke).frame(width: 0.5, height: 25) }
            }
        }.overlay(alignment: .bottom) { Divider() }
    }
    @ViewBuilder private var recommended: some View {
        let releases = model.latest.isEmpty ? model.chart : model.latest
        if releases.isEmpty {
            RoundedRectangle(cornerRadius: 18).fill(Brand.card).aspectRatio(2.45, contentMode: .fit)
                .overlay { if model.loading { ProgressView() } else { AifectWordmark() } }
        } else { FeaturedMusicCarousel(songs: Array(releases.prefix(5)), onDetail: { detail = $0 }, coverURL: $coverURL) }
        homeTabs
        StreamingHeading(title: "추천 음악") { MusicCollectionView(title: "추천 음악", path: "/api/catalog?section=tracks&chart=top") }
        ForEach(model.chart.prefix(3)) { song in HomeTrackRow(song: song, queue: model.chart, player: model.player) }
        HStack {
            Text("인기 차트").font(.headline)
            Spacer()
            Button("전체 보기") { page = "차트" }.font(.caption).frame(minHeight: 44)
        }
        TabView(selection: $chartPage) {
            ForEach(0..<max(1, (min(15, model.chart.count) + 2) / 3), id: \.self) { page in
                VStack(spacing: 0) { ForEach(Array(model.chart.dropFirst(page * 3).prefix(3).enumerated()), id: \.element.id) { offset, song in HomeTrackRow(song: song, queue: model.chart, player: model.player, rank: page * 3 + offset + 1) } }.tag(page).padding(.bottom, 18)
            }
        }.tabViewStyle(.page(indexDisplayMode: .automatic)).frame(height: 235).animation(.easeInOut(duration: 0.25), value: chartPage).accessibilityIdentifier("home-chart-pages")
        HStack {
            Text("최신곡").font(.headline); Spacer()
            Button("모두 보기") { page = "최신곡" }.font(.caption).frame(minHeight: 44)
        }
        StreamingArtworkShelf(songs: Array(releases.prefix(10)), onDetail: { detail = $0 })
        HStack { Text("발견").font(.headline); Spacer(); Button("기분 · 장르") { page = "발견" }.font(.caption).frame(minHeight: 44) }
        HomeDiscoveryTiles(songs: releases)
        StreamingHeading(title: "내 플레이리스트") { LibraryView().navigationTitle("플레이리스트") }
        if model.playlists.isEmpty {
            NavigationLink { LibraryView().streamingPage() } label: { StreamingEntry(title: "나만의 플레이리스트", caption: "좋아하는 음악을 모아보세요", icon: "music.note.list") }.buttonStyle(.plain)
        } else { HomePlaylistShelf(lists: model.playlists) }
        MusicLibraryShortcuts(compact: true)
        if !model.history.isEmpty {
            StreamingHeading(title: "최근 들은 음악") { LibraryView(initialSelection: 2).navigationTitle("최근 감상") }
            StreamingArtworkShelf(songs: Array(model.history.prefix(10)), compact: true, onDetail: { detail = $0 })
        }
        if !model.singable.isEmpty {
            StreamingHeading(title: "이번엔 내 목소리로") { SingCatalogView() }
            ForEach(model.singable.prefix(3)) { StreamingSongRow(song: $0, queue: model.singable, sing: true) }
        }
        if !covers.isEmpty {
            StreamingHeading(title: "같은 노래, 다른 목소리") { MusicCollectionView(title: "커버곡 둘러보기", path: "/api/community?kind=cover") }
            StreamingArtworkShelf(songs: covers, onDetail: { detail = $0 })
        }
        if !publicLists.isEmpty { MusicSectionHeading(title: "취향을 나누는 플레이리스트"); HomePlaylistShelf(lists: publicLists) }
        if !artists.isEmpty {
            StreamingHeading(title: "지금 뜨는 AI 아티스트") { CatalogDirectory(artists: true) }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) { ForEach(artists, id: \.selfID) { artist in
                    NavigationLink { ProfilePage(id: artist.selfID, kind: "artist").streamingPage() } label: {
                        VStack(spacing: 8) { ArtistArtwork(artist: artist).frame(width: 74, height: 74).clipShape(Circle()).overlay(Circle().stroke(AifectDesign.stroke)); Text(artist.displayName()).font(.system(size: 13, weight: .semibold)).lineLimit(1) }.frame(width: 84).padding(.vertical, 4)
                    }.buttonStyle(.plain).accessibilityIdentifier("home-artist-" + artist.selfID)
                } }
            }
        }
        if !people.isEmpty {
            MusicSectionHeading(title: "음악 뒤의 사람들")
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 12) { ForEach(people, id: \.selfID) { person in
                NavigationLink { ProfilePage(id: person.selfID).streamingPage() } label: { CreatorPreviewCard(person: person) }.buttonStyle(.plain)
            } } }
        }
        if let discoveryError { RetryCard(message: discoveryError) { Task { await loadShelves() } } }
    }
    private func loadShelves() async {
        let owner = model.userID
        await withTaskGroup(of: (String, [String: Any]?).self) { group in
            var paths = ["/api/community?kind=cover", "/api/playlists?sort=popular", "/api/discovery/profiles?kind=artist&sort=popular", "/api/catalog?section=producers&limit=30"].makeIterator()
            for _ in 0..<2 { if let path = paths.next() { group.addTask { (path, try? await API.shared.call(path)) } } }
            var failed = false
            for await (path, result) in group {
                if !Task.isCancelled, let next = paths.next() { group.addTask { (next, try? await API.shared.call(next)) } }
                guard !Task.isCancelled, owner == model.userID else { continue }
                guard let result else { failed = true; continue }
                if path.hasPrefix("/api/community") { covers = Array(result.songs().prefix(10)) }
                else if path.hasPrefix("/api/playlists") { publicLists = Array(result.objects("playlists").filter { $0.int("tracks") > 0 }.prefix(10)) }
                else if path.hasPrefix("/api/discovery") { artists = Array(result.objects("profiles").prefix(12)) }
                else { people = Array(result.objects("producers").prefix(12)) }
            }
            if !Task.isCancelled, owner == model.userID { discoveryError = failed ? "일부 추천 목록을 불러오지 못했어요." : nil }
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
                VStack(alignment: .leading, spacing: 4) {
                    Text(song.title).font(.system(size: 15, weight: .semibold))
                    Text(song.credit).font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                }.lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.accessibilityLabel("\(song.title) 상세")
            Button { if player.current?.id == song.id { player.toggle() } else { player.play(song, queue: queue) } } label: {
                Image(systemName: active ? "pause.fill" : "play.fill").font(.system(size: 14)).frame(width: 32, height: 32).background { Circle().fill(active ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Brand.background.opacity(0.7))) }.overlay(Circle().stroke(Brand.gradient, lineWidth: 1)).frame(minWidth: 48, minHeight: 48)
            }.foregroundStyle(active ? Brand.background : Brand.pink).accessibilityLabel("\(song.title) \(active ? "일시정지" : "재생")")
            Menu { Button("상세 보기") { model.navigationPath.append(song) }; Button("좋아요") { Task { await model.toggleLike(song) } }; Button("음악 메뉴") { model.navigationPath.append(song) } } label: { Image(systemName: "ellipsis").font(.system(size: 18)).frame(width: 44, height: 48) }.accessibilityLabel("\(song.title) 더보기")
        }.buttonStyle(.plain).padding(.horizontal, rank == nil ? 9 : 0).padding(.vertical, 7)
            .background(rank == nil ? Brand.card.opacity(0.72) : .clear, in: RoundedRectangle(cornerRadius: 15))
            .overlay { if rank == nil { RoundedRectangle(cornerRadius: 15).stroke(AifectDesign.stroke, lineWidth: 1) } }
            .accessibilityIdentifier("stream-song-\(song.id)")
    }
}

struct FeaturedMusicCarousel: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @Environment(\.dynamicTypeSize) private var typeSize
    let songs: [Song]
    let onDetail: (Song) -> Void
    @Binding var coverURL: URL?
    @State private var index = 0
    var body: some View {
        TabView(selection: $index) {
            ForEach(Array(songs.enumerated()), id: \.element.id) { offset, song in
                ZStack(alignment: .leading) {
                    GeometryReader { proxy in
                        RemoteArtwork(url: song.artURL) { $0.resizable().scaledToFill() } placeholder: { Brand.card }
                            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .trailing).clipped()
                    }
                    LinearGradient(colors: [.black.opacity(0.5), .clear], startPoint: .leading, endPoint: .trailing)
                    Button { onDetail(song) } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("새로 도착한 음악").font(.system(size: 12))
                            Text(song.title).font(.system(size: 23, weight: .bold)).lineLimit(2)
                            Text(song.credit).font(.system(size: 14)).lineLimit(1)
                        }.shadow(radius: 3).padding(.leading, 20).padding(.trailing, 64)
                    }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
                }.overlay(alignment: .bottomTrailing) {
                    ArtworkPlayButton(diameter: 38, label: "\(song.title) 지금 듣기") { model.player.play(song, queue: songs) }
                        .padding(.trailing, 12).padding(.bottom, 18)
                }.foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 18)).tag(offset)
            }
        }.tabViewStyle(.page(indexDisplayMode: .never))
            .onChange(of: songs.indices.contains(index) ? songs[index].artURL : songs.first?.artURL, initial: true) { _, value in coverURL = value }
            .aspectRatio(typeSize.isAccessibilitySize ? 1.7 : 2.45, contentMode: .fit)
            .overlay(alignment: .bottom) { if songs.count > 1 {
                HStack(spacing: 5) { ForEach(songs.indices, id: \.self) { n in Circle().fill(.white.opacity(index == n ? 1 : 0.4)).frame(width: 5, height: 5) } }.padding(.bottom, 10).allowsHitTesting(false)
            } }
            .task(id: "\(phase)-\(model.selectedTab)-\(index)-\(songs.count)-\(reduceMotion)") {
                guard phase == .active, model.selectedTab == 0, !reduceMotion, songs.count > 1 else { return }
                do { try await Task.sleep(for: .milliseconds(4500)) } catch { return }
                withAnimation { index = (index + 1) % songs.count }
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
