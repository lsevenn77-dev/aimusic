import SwiftUI

struct ListenView: View {
    @EnvironmentObject private var model: AppModel
    @State private var page = "추천"
    @State private var detail: Song?
    var body: some View {
        VStack(spacing: 0) {
            StreamingTabs(items: ["추천", "차트", "최신곡", "발견"], selection: $page).padding(.horizontal, 12)
            if page == "발견" { SearchView() }
            else if page == "차트" { PopularChartView() }
            else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        if let error = model.error { RetryCard(message: error) { Task { await model.refresh() } } }
                        if page == "추천" { recommended }
                        else {
                            Text("새롭게 도착한 음악").font(.title2.bold()).padding(.top, 12)
                            Button("전체 재생", systemImage: "play.fill") { if let song = model.latest.first { model.player.play(song, queue: model.latest) } }.buttonStyle(ParityPill(filled: true)).disabled(model.latest.isEmpty)
                            ForEach(model.latest) { StreamingSongRow(song: $0, queue: model.latest) }
                        }
                        if model.loading && model.latest.isEmpty { ProgressView("음악을 불러오는 중").frame(maxWidth: .infinity).padding(44) }
                        else if model.latest.isEmpty && model.error == nil { ContentUnavailableView("새로운 음악을 기다려요", systemImage: "music.note") }
                    }.padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 24)
                }.id(page).refreshable { await model.refresh(); await model.loadLibrary() }
            }
        }.navigationDestination(item: $detail) { TrackDetailView(song: $0) }
    }
    @ViewBuilder private var recommended: some View {
        if !model.latest.isEmpty { FeaturedMusicCarousel(songs: Array(model.latest.prefix(4)), onDetail: { detail = $0 }) }
        MusicLibraryShortcuts(compact: true)
        if !model.history.isEmpty {
            StreamingHeading(title: "최근 들은 음악") { LibraryView(initialSelection: 2).navigationTitle("최근 감상") }
            StreamingArtworkShelf(songs: Array(model.history.prefix(10)), onDetail: { detail = $0 })
        }
        StreamingHeading(title: "지금 추천하는 음악") { MusicCollectionView(title: "추천 음악", path: "/api/catalog?section=tracks&chart=top") }
        ForEach(model.chart.prefix(5)) { StreamingSongRow(song: $0, queue: model.chart) }
        StreamingHeading(title: "새로 올라온 음악") { MusicCollectionView(title: "최신곡", path: "/api/catalog?section=tracks&limit=40") }
        StreamingArtworkShelf(songs: Array(model.latest.prefix(10)), onDetail: { detail = $0 })
        if !model.singable.isEmpty {
            StreamingHeading(title: "이번엔 내 목소리로") { SingCatalogView() }
            ForEach(model.singable.prefix(3)) { StreamingSongRow(song: $0, queue: model.singable, sing: true) }
        }
        MusicSectionHeading(title: "지금, 이런 기분")
        MoodMusicShelf()
        NavigationLink { ExploreView().streamingPage() } label: { StreamingEntry(title: "음악 뒤의 사람들", caption: "아티스트와 공개 플레이리스트 둘러보기", icon: "person.2") }.buttonStyle(.plain)
    }
}

struct FeaturedMusicCarousel: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let songs: [Song]
    let onDetail: (Song) -> Void
    @State private var index = 0
    var body: some View {
        VStack(spacing: 8) {
            TabView(selection: $index) {
                ForEach(Array(songs.enumerated()), id: \.element.id) { offset, song in FeaturedMusic(song: song, queue: songs, onDetail: onDetail).tag(offset) }
            }.tabViewStyle(.page(indexDisplayMode: .never)).frame(height: typeSize.isAccessibilitySize ? 280 : 158)
            if songs.count > 1 { HStack(spacing: 6) { ForEach(songs.indices, id: \.self) { n in Circle().fill(index == n ? AifectDesign.violet : AifectDesign.stroke).frame(width: 5, height: 5) } }.accessibilityLabel("추천 음악 \(index + 1)/\(songs.count)") }
        }
    }
}
struct FeaturedMusic: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    var onDetail: ((Song) -> Void)? = nil
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            GeometryReader { proxy in
                RemoteArtwork(url: song.artURL) { $0.resizable().scaledToFill() } placeholder: { AifectDesign.raised }
                    .frame(width: proxy.size.width, height: proxy.size.height).clipped()
            }
            LinearGradient(colors: [.clear, .black.opacity(0.72)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 10) {
                Text("오늘,\n이 노래 어때요?").font(.title2.bold()).fixedSize(horizontal: false, vertical: true).layoutPriority(1).shadow(radius: 5)
                Spacer(minLength: 4)
                HStack(alignment: .bottom) {
                    Button { onDetail?(song) } label: { VStack(alignment: .leading, spacing: 5) { Text(song.title).font(.headline).lineLimit(2); Text(song.credit).font(.subheadline) }.frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
                    Button { model.player.play(song, queue: queue) } label: { Image(systemName: "play.fill").font(.title2).foregroundStyle(Brand.background).frame(width: 48, height: 48).background(AifectDesign.violet, in: Circle()) }.accessibilityLabel("\(song.title) 재생")
                }
            }.padding(16).foregroundStyle(.white)
        }.clipShape(RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.violet.opacity(0.45), lineWidth: 1))
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
