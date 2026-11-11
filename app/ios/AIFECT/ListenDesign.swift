import SwiftUI

struct ListenView: View {
    @EnvironmentObject private var model: AppModel
    @State private var page = "추천"
    @State private var detail: Song?
    @State private var coverURL: URL?
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
                }.id(page).refreshable { await model.refresh(); await model.loadLibrary() }
            }
        }.background {
            if page == "추천" {
                GeometryReader { geo in
                    RemoteArtwork(url: coverURL) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                        .frame(width: geo.size.width, height: min(450, geo.size.height)).blur(radius: 36).opacity(0.5)
                        .overlay(LinearGradient(stops: [.init(color: Brand.background.opacity(0.35), location: 0), .init(color: Brand.background.opacity(0.6), location: 0.5), .init(color: Brand.background, location: 1)], startPoint: .top, endPoint: .bottom))
                        .clipped().accessibilityHidden(true)
                }.allowsHitTesting(false)
            }
        }.navigationDestination(item: $detail) { TrackDetailView(song: $0) }
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
        ForEach(Array(model.chart.prefix(3).enumerated()), id: \.element.id) { offset, song in
            HomeTrackRow(song: song, queue: model.chart, player: model.player, rank: offset + 1)
        }
        HStack {
            Text("최신곡").font(.headline); Spacer()
            Button("모두 보기") { page = "최신곡" }.font(.caption).frame(minHeight: 44)
        }
        StreamingArtworkShelf(songs: Array(releases.prefix(10)), onDetail: { detail = $0 })
        MusicSectionHeading(title: "발견")
        MoodMusicShelf()
        StreamingHeading(title: "내 플레이리스트") { LibraryView().navigationTitle("플레이리스트") }
        ForEach(model.playlists.prefix(3), id: \.selfID) { StreamingPlaylistRow(list: $0) }
        MusicLibraryShortcuts(compact: true)
        if !model.history.isEmpty {
            StreamingHeading(title: "최근 들은 음악") { LibraryView(initialSelection: 2).navigationTitle("최근 감상") }
            StreamingArtworkShelf(songs: Array(model.history.prefix(10)), onDetail: { detail = $0 })
        }
        if !model.singable.isEmpty {
            StreamingHeading(title: "이번엔 내 목소리로") { SingCatalogView() }
            ForEach(model.singable.prefix(3)) { StreamingSongRow(song: $0, queue: model.singable, sing: true) }
        }
        NavigationLink { ExploreView().streamingPage() } label: { StreamingEntry(title: "음악 뒤의 사람들", caption: "아티스트와 공개 플레이리스트 둘러보기", icon: "person.2") }.buttonStyle(.plain)
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
                    if rank == nil {
                        HStack(spacing: 8) {
                            Label("\(song.plays ?? 0)", systemImage: "play")
                            Label("\(song.likes)", systemImage: "heart")
                            Label("\(song.comments)", systemImage: "bubble.left")
                        }.font(.system(size: 10)).foregroundStyle(AifectDesign.secondaryText)
                    }
                }.lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.accessibilityLabel("\(song.title) 상세")
            Button { if player.current?.id == song.id { player.toggle() } else { player.play(song, queue: queue) } } label: {
                Image(systemName: active ? "pause.fill" : "play.fill").font(.system(size: 14)).frame(width: 32, height: 32).background { Circle().fill(active ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Brand.background.opacity(0.7))) }.overlay(Circle().stroke(Brand.gradient, lineWidth: 1)).frame(minWidth: 48, minHeight: 48)
            }.foregroundStyle(active ? Brand.background : Brand.pink).accessibilityLabel("\(song.title) \(active ? "일시정지" : "재생")")
            NavigationLink { SongMenuView(song: song).streamingPage() } label: { Image(systemName: "line.3.horizontal").font(.system(size: 18)).frame(width: 44, height: 48) }.accessibilityLabel("\(song.title) 더보기")
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
    let songs: [Song]
    var onDetail: (Song) -> Void
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(songs) { song in
                    Button { onDetail(song) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            CoverArt(song: song, size: 86)
                            Text(song.title).font(.caption).lineLimit(2)
                            Text(song.credit).font(.caption).foregroundStyle(AifectDesign.muted).lineLimit(1)
                        }.frame(width: 86, alignment: .leading)
                    }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
                }
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
                    VStack(alignment: .leading, spacing: 6) { Image(systemName: mood.3).font(.system(size: 20)); Spacer(); Text(mood.1).font(.system(size: 18, weight: .bold)); Text(mood.2).font(.system(size: 12)).opacity(0.8) }.foregroundStyle(.white).frame(width: 168, height: 120, alignment: .leading).padding(16).background(Color(aifectHex: mood.4), in: RoundedRectangle(cornerRadius: 18))
                }.buttonStyle(.plain)
            } }
        }
    }
}
