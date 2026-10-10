import SwiftUI

struct ListenView: View {
    @EnvironmentObject private var model: AppModel
    @State private var page = "추천"
    @State private var detail: Song?
    @State private var playlists: [[String: Any]] = []
    @State private var people: [[String: Any]] = []
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 24) {
                ForEach(["추천", "차트", "최신곡", "발견"], id: \.self) { item in
                    Button { page = item } label: { Text(item).font(.system(size: 20, weight: .bold)).foregroundStyle(page == item ? AifectDesign.text : AifectDesign.muted).frame(minHeight: 48) }.buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }.padding(.horizontal, 22)
            if page == "발견" { ExploreView() }
            else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if let error = model.error { RetryCard(message: error) { Task { await model.refresh() } } }
                        if page == "추천" { recommended }
                        else if page == "차트" {
                            MusicSectionHeading(title: "AIFECT 인기곡", subtitle: "재생 · 좋아요 · 댓글을 반영한 제작곡 순위")
                            chart(model.chart)
                            if !model.singable.isEmpty {
                                MusicSectionHeading(title: "노래방에서 만나는 인기곡", subtitle: "부를 수 있는 곡의 재생 · 좋아요 기준")
                                chart(model.singable)
                            }
                        } else {
                            PageHeading(title: "새롭게 도착한 음악", subtitle: "지금 막 공개된 새로운 음악을 만나보세요")
                            HStack { Button { if let song = model.latest.first { model.player.play(song, queue: model.latest) } } label: { Label("전체 재생", systemImage: "play.fill") }.buttonStyle(ParityPill(filled: true)); Spacer(); Text("\(model.latest.count)곡").font(.caption).foregroundStyle(AifectDesign.muted) }
                            ForEach(model.latest) { SongRow(song: $0, queue: model.latest, onDetail: { detail = $0 }) }
                        }
                        if model.loading && model.latest.isEmpty { ProgressView("음악을 불러오는 중").frame(maxWidth: .infinity).padding(44) }
                    }.padding(.horizontal, 22).padding(.bottom, 32)
                }.id(page).refreshable { await model.refresh() }
            }
        }.sheet(item: $detail) { TrackDetailView(song: $0) }
        .task {
            playlists = (try? await API.shared.call("/api/playlists?sort=popular").objects("playlists")) ?? []
            people = (try? await API.shared.call("/api/catalog?section=producers&limit=12").objects("producers")) ?? []
        }
    }
    @ViewBuilder private var recommended: some View {
        HStack { MusicSectionHeading(title: "오늘의 새로운 발견"); Button("최신곡") { page = "최신곡" }.font(.system(size: 13)).foregroundStyle(AifectDesign.secondaryText) }
        if let featured = model.latest.first { FeaturedMusic(song: featured, queue: model.latest, onDetail: { detail = $0 }) }
        else if !model.loading { PageHeading(title: "오늘의 음악이\n내일의 취향이 돼요", subtitle: "새로운 음악을 만나보세요") }
        HStack(spacing: 8) {
            shortcut("좋아요", "heart", 1, color: Brand.pink)
            shortcut("최근 감상", "clock.arrow.circlepath", 2)
            shortcut("내 플레이리스트", "music.note.list", 0)
        }.padding(.top, 14)
        if !model.history.isEmpty {
            MusicSectionHeading(title: "다시 듣고 싶은 순간")
            ForEach(model.history.prefix(3)) { SongRow(song: $0, queue: model.history, onDetail: { detail = $0 }) }
        }
        if model.latest.count > 1 { MusicShelf(title: "한 곡 더 발견하기", songs: Array(model.latest.dropFirst().prefix(10)), onDetail: { detail = $0 }) }
        if let song = model.singable.first {
            MusicSectionHeading(title: "이번엔 내 목소리로", subtitle: "듣던 노래, 직접 불러볼까요?")
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    CoverArt(song: song, size: 64)
                    VStack(alignment: .leading, spacing: 6) { Text("MR 준비 완료").font(.system(size: 12, weight: .semibold)).foregroundStyle(Brand.aqua); Text(song.title).font(.system(size: 17, weight: .semibold)); Text(song.credit).font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }
                }
                HStack { Text("에코 · 룸 · 내 목소리 듣기").font(.system(size: 12)).foregroundStyle(AifectDesign.muted); Spacer(minLength: 2); SingSongButton(song: song, color: Brand.aqua) }
            }.padding(18).background(Color(aifectHex: 0x1B292E), in: RoundedRectangle(cornerRadius: 18))
        }
        let covers = model.feed.filter(\.isCover)
        if let cover = covers.first {
            MusicSectionHeading(title: "같은 노래, 다른 목소리", subtitle: "커버를 듣고, 마음에 드는 목소리에 반응해요")
            CommunityMusicCard(song: cover, queue: covers, onDetail: { detail = $0 })
            if covers.count > 1 { MusicShelf(title: "새로운 목소리", songs: Array(covers.dropFirst().prefix(8)), onDetail: { detail = $0 }) }
        }
        if !playlists.isEmpty {
            MusicSectionHeading(title: "취향을 나누는 플레이리스트", subtitle: "다른 사람이 고른 음악 속으로")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) { ForEach(playlists.filter { $0.int("tracks") > 0 }, id: \.selfID) { list in
                    NavigationLink { PlaylistView(id: list.string("id"), title: list.string("name")) } label: {
                        VStack(alignment: .leading, spacing: 14) { Image(systemName: "music.note.list").font(.largeTitle).foregroundStyle(Brand.aqua); Text(list.string("name")).font(.headline).lineLimit(2); Text("\(list.int("tracks"))곡").font(.caption).foregroundStyle(AifectDesign.muted) }.frame(width: 144, height: 144, alignment: .leading).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                    }.buttonStyle(.plain)
                } }
            }
        }
        MusicSectionHeading(title: "지금, 이런 기분")
        MoodMusicShelf()
        if !people.isEmpty {
            MusicSectionHeading(title: "음악 뒤의 사람들", subtitle: "마음에 드는 음악가를 팔로우해보세요")
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 12) { ForEach(people, id: \.selfID) { person in
                NavigationLink { ProfilePage(id: person.string("id")) } label: { VStack(spacing: 10) { ProfilePhoto(person: person, size: 70).clipShape(Circle()); Text(person.displayName()).font(.system(size: 14)).lineLimit(1) }.frame(width: 112).padding(.vertical, 16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)) }.buttonStyle(.plain)
            } } }
        }
    }
    private func shortcut(_ label: String, _ icon: String, _ selection: Int, color: Color = AifectDesign.secondaryText) -> some View {
        NavigationLink { LibraryView(initialSelection: selection) } label: {
            VStack(spacing: 8) { Image(systemName: icon).font(.system(size: 20)).foregroundStyle(color); Text(label).font(.system(size: 12)).foregroundStyle(AifectDesign.text) }.frame(maxWidth: .infinity).frame(height: 80).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain)
    }
    private func chart(_ songs: [Song]) -> some View {
        // Each chart owns its row identities. Flattening two ForEach collections
        // into one LazyVStack reuses overlapping song IDs and leaves empty rows.
        VStack(spacing: 0) {
            ForEach(Array(songs.prefix(5).enumerated()), id: \.element.id) { index, song in
                HStack(spacing: 8) {
                    Text("\(index + 1)").font(.system(size: 21, weight: .bold)).foregroundStyle(Brand.aqua).frame(width: 24)
                    SongRow(song: song, queue: songs, onDetail: { detail = $0 })
                }
            }
        }
    }
}
struct FeaturedMusic: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    var onDetail: ((Song) -> Void)? = nil
    @State private var detail = false
    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 18) {
                CoverArt(song: song, size: 122).onTapGesture { if let onDetail { onDetail(song) } else { detail = true } }
                VStack(alignment: .leading, spacing: 7) {
                    Text("NEW RELEASE").font(.system(size: 12, weight: .semibold)).tracking(1.5).foregroundStyle(Brand.aqua)
                    Text(song.title).font(.system(size: 22, weight: .bold)).lineLimit(3).padding(.top, 3)
                    Text(song.credit).font(.system(size: 14)).foregroundStyle(AifectDesign.secondaryText).lineLimit(1)
                    Text("\(song.genreLabel) · \(timeLabel(song.duration))").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                }.frame(maxWidth: .infinity, alignment: .leading).onTapGesture { if let onDetail { onDetail(song) } else { detail = true } }
            }
            HStack { SaveMusicButton(song: song); Spacer(minLength: 0); Button { model.player.play(song, queue: queue) } label: { Label("바로 듣기", systemImage: "play.fill") }.buttonStyle(ParityPill(filled: true)) }
        }.padding(18).background(LinearGradient(colors: [Color(aifectHex: 0x26303D), Color(aifectHex: 0x1A252D)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 20))
            .sheet(isPresented: $detail) { TrackDetailView(song: song) }
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
                NavigationLink { MusicCollectionView(title: mood.1, path: "/api/discovery?mood=\(mood.0)") } label: {
                    VStack(alignment: .leading, spacing: 6) { Image(systemName: mood.3).font(.system(size: 20)); Spacer(); Text(mood.1).font(.system(size: 18, weight: .bold)); Text(mood.2).font(.system(size: 12)).opacity(0.8) }.foregroundStyle(.white).frame(width: 168, height: 120, alignment: .leading).padding(16).background(Color(aifectHex: mood.4), in: RoundedRectangle(cornerRadius: 18))
                }.buttonStyle(.plain)
            } }
        }
    }
}
