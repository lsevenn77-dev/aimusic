import SwiftUI

struct MusicCollectionView: View {
    let title: String
    let path: String
    var key = "tracks"
    @EnvironmentObject var model: AppModel
    @State private var songs: [Song] = []
    @State private var error: String?
    @State private var loading = true
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                MusicBannerPanel(title: title, subtitle: "각자의 목소리로 다시 만나는 음악", icon: "headphones") {
                    if !songs.isEmpty { Button("전체 재생") { model.player.play(songs[0], queue: songs) }.buttonStyle(ParityPill(filled: true)) }
                }
                ForEach(songs) { song in CompactMusicRow(song: song, queue: songs).padding(.horizontal, 12).background(MusicSurface()).clipShape(RoundedRectangle(cornerRadius: 16)) }
                if loading { ProgressView().frame(maxWidth: .infinity).padding(24) }
                if let error { RetryCard(message: error) { Task { await load() } } }
                else if songs.isEmpty && !loading { Text("공개된 음악이 없습니다.").foregroundStyle(.secondary) }
            }.padding(18)
        }.background(Brand.background).navigationTitle(title).navigationBarTitleDisplayMode(.inline).task { await load() }.refreshable { await load() }
    }
    private func load() async { loading = true; defer { loading = false }; do { let result = try await API.shared.call(path).songs(key); try Task.checkCancellation(); songs = result; error = nil } catch is CancellationError {} catch { self.error = error.localizedDescription } }
}
struct ExploreView: View {
    @State private var people: [[String: Any]] = []
    @State private var playlists: [[String: Any]] = []
    @State private var genres: [String] = []
    @State private var error: String?
    var body: some View {
        List {
            Section("음악 발견") {
                NavigationLink("커버곡 인기 랭킹") { CoverRankingView() }
                NavigationLink("새로운 커버곡") { MusicCollectionView(title: "커버곡", path: "/api/community?kind=cover") }
                NavigationLink("듀엣 커버") { MusicCollectionView(title: "듀엣 커버", path: "/api/community?kind=cover&cover_mode=duet") }
                NavigationLink("크루 둘러보기") { CrewsView() }
            }
            Section("장르") {
                ForEach(genres, id: \.self) { genre in NavigationLink(genre) { MusicCollectionView(title: genre, path: "/api/catalog?section=tracks&genre=\(Endpoint.query(genre))") } }
            }
            Section("음악을 만드는 사람들") { ForEach(people, id: \.selfID) { person in NavigationLink { ProfilePage(id: person.string("id")) } label: { PersonRow(person: person) } } }
            Section("공개 플레이리스트") { ForEach(playlists, id: \.selfID) { item in NavigationLink(item.string("name")) { PlaylistView(id: item.string("id"), title: item.string("name")) } } }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("음악 둘러보기").task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do {
            let catalog = try await API.shared.call("/api/catalog?section=producers&limit=30")
            people = catalog.objects("producers"); genres = catalog["genres"] as? [String] ?? ["K-POP", "Pop", "Dark Pop", "Ballad", "R&B", "Soul", "Hip-Hop", "Rock", "Alternative", "Indie Pop", "EDM", "Electronic", "Synth Pop", "City Pop", "Lo-fi", "Jazz", "Blues", "Folk", "Acoustic", "Country", "Classical", "Ambient", "Fusion", "Korean Folklore Fusion", "World Music", "국악", "트로트", "J-POP", "OST", "Instrumental"]
            playlists = try await API.shared.call("/api/playlists?sort=popular").objects("playlists"); error = nil
        } catch { self.error = error.localizedDescription }
    }
}
struct CoverRankingView: View {
    @EnvironmentObject var model: AppModel
    @State private var period: String
    var originalID: String?
    var karaokeChart: Bool
    init(initialPeriod: String = "today", originalID: String? = nil, karaokeChart: Bool = false) { _period = State(initialValue: initialPeriod); self.originalID = originalID; self.karaokeChart = karaokeChart }
    @State private var kind = "tracks"
    @State private var genre = "전체"
    @State private var query = ""
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var loading = true
    private let periods = [("today", "오늘"), ("week", "이번 주"), ("month", "이달"), ("all", "전체")]
    private var periodName: String { periods.first { $0.0 == period }?.1 ?? "오늘" }
    private var path: String {
        "/api/cover-rankings?period=\(period)&kind=\(kind)" + (karaokeChart ? "&include_unranked=1" : "") + (originalID.map { "&original_id=" + Endpoint.query($0) } ?? "") + (genre == "전체" ? "" : "&genre=" + Endpoint.query(genre)) + (query.trimmingCharacters(in: .whitespaces).isEmpty ? "" : "&q=" + Endpoint.query(query.trimmingCharacters(in: .whitespaces)))
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text(karaokeChart ? "노래방 차트" : originalID == nil ? "커버 랭킹" : "이 곡의 커버 랭킹").font(.system(size: 26, weight: .bold))
                ParityChips(items: periods.map(\.1), selection: Binding(get: { periodName }, set: { value in period = periods.first { $0.1 == value }?.0 ?? "today" }))
                Text(period == "all" ? "공개 커버의 누적 좋아요 순" : "\(periodName) 받은 좋아요 순 · 한국 시간 기준").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                ParityChips(items: ["커버곡", "가수"], selection: Binding(get: { kind == "tracks" ? "커버곡" : "가수" }, set: { kind = $0 == "커버곡" ? "tracks" : "singers" }))
                if originalID == nil { ParityChips(items: ["전체"] + StudioChoices.genres, selection: $genre) }
                CatalogSearchField(prompt: "곡 또는 가수 찾기", text: $query).accessibilityIdentifier("cover-ranking-search")
                Text(karaokeChart ? "공개된 커버곡만 표시해요. 가수는 커버곡의 좋아요 합계로 집계해요." : "좋아요가 없으면 순위에 포함되지 않아요. 가수는 커버곡의 좋아요 합계로 집계해요.").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                if loading { ProgressView().frame(maxWidth: .infinity) }
                if let error { RetryCard(message: error) { Task { await load() } } }
                if kind == "tracks" {
                    ForEach(data.objects("tracks"), id: \.selfID) { row in rankedTrack(row) }
                } else {
                    ForEach(data.objects("singers"), id: \.selfID) { person in
                        HStack(spacing: 12) {
                            Text("\(person.int("rank"))").font(.system(size: 24, weight: .bold)).foregroundStyle(Brand.pink).frame(width: 34)
                            NavigationLink { ProfilePage(id: person.selfID).streamingPage() } label: {
                                HStack(spacing: 12) {
                                    ProfilePhoto(person: person, size: 48)
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(person.displayName()).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                                        Text("좋아요 \(person.int("rank_likes")) · 커버 \(person.int("ranked_covers"))곡").font(.system(size: 12)).foregroundStyle(Brand.aqua)
                                        Text("노래 들으러 가기 ›").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }.buttonStyle(.plain)
                            Button(model.followedProducers.contains(person.selfID) ? "팔로잉" : "팔로우") { Task { await model.toggleFollow(person.selfID) } }.buttonStyle(ParityPill())
                        }.padding(.vertical, 16)
                    }
                }
                if !loading && error == nil && data.songs().isEmpty && data.objects("singers").isEmpty { ContentUnavailableView("아직 순위에 오른 목소리가 없어요", systemImage: "trophy", description: Text("새로운 커버를 듣고 마음에 드는 목소리에 좋아요를 남겨주세요.")) }
                NavigationLink("새로운 커버곡 둘러보기") { MusicCollectionView(title: "커버곡", path: "/api/community?kind=cover" + (originalID.map { "&original_id=" + Endpoint.query($0) } ?? "")).streamingPage() }.frame(maxWidth: .infinity, minHeight: 44)
            }.padding(16)
        }.accessibilityIdentifier("cover-ranking-scroll").scrollDismissesKeyboard(.interactively).navigationTitle(karaokeChart ? "노래방 차트" : "커버 랭킹")
            .task(id: path + (model.userID ?? "")) { do { try await Task.sleep(for: .milliseconds(250)); await load() } catch {} }
            .task(id: model.userID) { await model.loadFollows() }.refreshable { await load() }
    }
    private func rankedTrack(_ row: [String: Any]) -> some View {
        let song = Song(row), rank = row.int("rank")
        return VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(rank > 0 ? "\(rank)" : "—").font(.system(size: karaokeChart ? 16 : 25, weight: .bold)).foregroundStyle((1...3).contains(rank) ? Brand.pink : AifectDesign.muted).frame(width: karaokeChart ? 26 : 34)
                Button { model.player.play(song, queue: data.songs()) } label: {
                    CoverArt(song: song, size: karaokeChart ? 72 : 56).overlay(alignment: .bottomTrailing) { Image(systemName: "play.fill").font(.system(size: 13)).foregroundStyle(Brand.pink).frame(width: 26, height: 26).background(Brand.background.opacity(0.88), in: Circle()).padding(4) }
                }.buttonStyle(.plain).accessibilityLabel(song.title + " 재생")
                VStack(alignment: .leading, spacing: 5) {
                    Button { model.navigationPath.append(song) } label: { Text(song.title).font(.system(size: 16, weight: .semibold)).lineLimit(karaokeChart ? 1 : 2).frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.plain).accessibilityLabel(song.title + " 상세")
                    if let id = song.producerID { NavigationLink { ProfilePage(id: id).streamingPage() } label: { Text(song.credit).font(.system(size: 13)).foregroundStyle(AifectDesign.muted).lineLimit(1) }.accessibilityLabel(song.credit + " 가수 보기") }
                    HStack(spacing: 12) {
                        Text("\(periodName) 좋아요 \(row.int("rank_likes"))").font(.system(size: 12)).foregroundStyle(Brand.aqua)
                        Spacer(minLength: 0)
                        Button { Task { await model.toggleLike(song) } } label: { Image(systemName: model.likes.contains { $0.id == song.id } ? "heart.fill" : "heart").font(.system(size: 15)).foregroundStyle(Brand.pink) }.accessibilityLabel(song.title + " 좋아요")
                        Button { model.navigationPath.append(song) } label: { Label("\(song.comments)", systemImage: "bubble.right").font(.system(size: 12)) }.accessibilityLabel(song.title + " 댓글")
                    }.frame(minHeight: 32)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.padding(.vertical, 12)
            Divider()
        }.accessibilityIdentifier("cover-ranking-" + song.id)
    }
    private func load() async {
        let target = path, owner = model.userID; loading = true
        do {
            let value = try await API.shared.call(target); try Task.checkCancellation()
            guard target == path, owner == model.userID else { return }; data = value; error = nil; loading = false
        } catch is CancellationError {} catch { if target == path, owner == model.userID { self.error = error.localizedDescription; loading = false } }
    }
}
struct QueueView: View {
    @ObservedObject var player: MusicPlayer
    var body: some View {
        List {
            ForEach(player.queue) { song in
                Button { player.play(song, queue: player.queue) } label: {
                    HStack { if song.id == player.current?.id { Image(systemName: "waveform").foregroundStyle(Brand.pink) }; Text(song.title); Spacer(); Text(song.credit).font(.caption).foregroundStyle(.secondary) }
                }
            }.onDelete { player.removeQueue(at: $0) }.onMove { player.moveQueue(from: $0, to: $1) }
        }.navigationTitle("재생 대기열").toolbar { EditButton() }
    }
}
enum LyricsDisplay {
    /// Strip timing/metadata only; retain ordinary lyric annotations such as [Chorus].
    static func plainText(_ source: String) -> String {
        source.components(separatedBy: .newlines).compactMap { line -> String? in
            if line.trimmingCharacters(in: .whitespaces).range(of: #"^\[(?:ar|al|ti|au|by|offset|length|re|ve):[^\]]*\]$"#, options: [.regularExpression, .caseInsensitive]) != nil { return nil }
            return line.replacingOccurrences(of: #"(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]|<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>)"#, with: "", options: .regularExpression)
        }.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct FullLyricsView: View {
    @EnvironmentObject var model: AppModel
    let song: Song
    @State private var lyrics = ""
    @State private var access = "line"
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text(song.title).font(.title2.bold())
                if access == "full" { Text(lyrics.isEmpty ? "등록된 가사가 없습니다." : lyrics).lineSpacing(10).textSelection(.enabled) }
                else { Text("Premium에서 전체 가사를 볼 수 있습니다."); NavigationLink("Premium 살펴보기") { PaymentStoreView() } }
                if let error { Text(error).foregroundStyle(.red) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
        }.navigationTitle("가사").task { do { let track = try await API.shared.call("/api/tracks/\(Endpoint.pathID(song.id))").object("track"); access = track.string("lyrics_access"); lyrics = LyricsDisplay.plainText(track.string("lyrics")) } catch { self.error = error.localizedDescription } }
    }
}

struct CatalogDirectory: View {
    let artists: Bool
    @EnvironmentObject private var model: AppModel
    @State private var follows = Set<String>()
    @State private var pending = Set<String>()
    @State private var rows: [[String: Any]] = []
    @State private var error: String?
    @State private var reload = 0
    @State private var loading = true
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if loading { ProgressView().frame(maxWidth: .infinity) }
                else if let error { RetryCard(message: error) { reload += 1 } }
                else if rows.isEmpty { Text(artists ? "아직 공개된 AI 아티스트가 없어요." : "아직 공개된 플레이리스트가 없어요.").foregroundStyle(AifectDesign.muted) }
                if artists {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(rows, id: \.selfID) { row in
                            ArtistDirectoryCard(artist: row, following: follows.contains(row.selfID), busy: pending.contains(row.selfID)) { Task { await follow(row.selfID) } }
                        }
                    }
                } else {
                    ForEach(rows, id: \.selfID) { row in StreamingPlaylistRow(list: row) }
                }
            }.padding(16)
        }.background(Brand.background).navigationTitle(artists ? "AI 아티스트" : "공개 플레이리스트")
            .task(id: "\(reload)-\(model.userID ?? "")") {
                loading = true
                follows = []
                let owner = model.userID
                do {
                    let data = try await API.shared.call(artists ? "/api/discovery/profiles?kind=artist&sort=popular" : "/api/playlists?sort=popular")
                    try Task.checkCancellation()
                    rows = data.objects(artists ? "profiles" : "playlists")
                    if artists, owner != nil {
                        let library = try await API.shared.call("/api/library")
                        guard owner == model.userID, !Task.isCancelled else { return }
                        follows = Set(library.objects("follows").filter { $0.string("kind") == "artist" }.map { $0.string("target_id") })
                    }
                    error = nil
                } catch {
                    guard !Task.isCancelled else { return }
                    self.error = error.localizedDescription
                }
                loading = false
            }
    }
    private func follow(_ id: String) async {
        guard model.requireLogin(), let owner = model.userID, pending.insert(id).inserted else { return }
        let wasFollowing = follows.contains(id)
        if wasFollowing { follows.remove(id) } else { follows.insert(id) }
        changeCount(id, by: wasFollowing ? -1 : 1)
        defer { pending.remove(id) }
        do {
            _ = try await API.shared.call("/api/artists/\(Endpoint.pathID(id))/follow", method: wasFollowing ? "DELETE" : "PUT", body: [:])
        } catch {
            guard owner == model.userID else { return }
            if wasFollowing { follows.insert(id) } else { follows.remove(id) }
            changeCount(id, by: wasFollowing ? 1 : -1)
            model.notice = error.localizedDescription
        }
    }
    private func changeCount(_ id: String, by delta: Int) {
        guard let index = rows.firstIndex(where: { $0.selfID == id }) else { return }
        rows[index]["followers"] = max(0, rows[index].int("followers") + delta)
    }

}

struct ArtistArtwork: View {
    let artist: [String: Any]
    var maxPixelSize = 1024
    var body: some View {
        let version = artist.string("image_version")
        let url = version.isEmpty || version == "0" ? nil : try? Endpoint.url("/media/artist/\(Endpoint.pathID(artist.selfID))?v=\(Endpoint.query(version))")
        RemoteArtwork(url: url, maxPixelSize: maxPixelSize) { $0.resizable().scaledToFill() } placeholder: { ZStack { Brand.card; Image(systemName: "person.fill").foregroundStyle(Brand.pink) } }
    }
}
private struct ArtistDirectoryCard: View {
    let artist: [String: Any]
    let following: Bool
    let busy: Bool
    let follow: () -> Void
    var body: some View {
        Color.clear.aspectRatio(1, contentMode: .fit)
            .overlay {
                NavigationLink { ProfilePage(id: artist.selfID, kind: "artist").streamingPage() } label: {
                    ArtistArtwork(artist: artist).overlay(LinearGradient(colors: [.clear, Color(red: 0.04, green: 0.06, blue: 0.13).opacity(0.97)], startPoint: .center, endPoint: .bottom))
                }.buttonStyle(.plain).accessibilityLabel(artist.displayName() + " 아티스트 프로필")
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(artist.displayName()).font(.system(size: 15, weight: .semibold)).lineLimit(1).allowsHitTesting(false)
                    HStack(spacing: 4) {
                        Image(systemName: "person.2").font(.system(size: 14))
                        Text(artist.int("followers").formatted()).font(.system(size: 11)).frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("artist-followers-" + artist.selfID)
                        Button(action: follow) { Text("팔로우").font(.system(size: 11, weight: .medium)).padding(.horizontal, 9).frame(minWidth: 64, minHeight: 33).background(Brand.card.opacity(0.95), in: Capsule()).overlay(Capsule().stroke(following ? AifectDesign.muted : Brand.aqua.opacity(0.85))) }.buttonStyle(.plain).disabled(busy).accessibilityIdentifier("artist-follow-" + artist.selfID).accessibilityValue(following ? "팔로우 중" : "팔로우 안 함")
                    }
                }.padding(.horizontal, 10).padding(.bottom, 9)
            }.clipShape(RoundedRectangle(cornerRadius: 17)).overlay(RoundedRectangle(cornerRadius: 17).stroke(AifectDesign.stroke))
    }
}
struct GenreMusicGrid: View {
    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(Array(StudioChoices.genres.enumerated()), id: \.element) { index, genre in
                NavigationLink { MusicCollectionView(title: genre, path: "/api/catalog?section=tracks&genre=\(Endpoint.query(genre))").streamingPage() } label: {
                    Text(genre).font(.system(size: 16, weight: .semibold)).lineLimit(3).frame(maxWidth: .infinity, minHeight: 68, alignment: .leading).padding(.leading, 14).padding(.trailing, 28).padding(.vertical, 14)
                        .background {
                            RemoteArtwork(url: try? Endpoint.url(String(format: "/assets/genres/%02d.webp", index + 1))) { $0.resizable().scaledToFill() } placeholder: { Brand.card }
                                .overlay(LinearGradient(colors: [Brand.background.opacity(0.88), Brand.background.opacity(0.2)], startPoint: .leading, endPoint: .trailing))
                        }.overlay(alignment: .bottomTrailing) { Image(systemName: "chevron.right").font(.system(size: 13)).padding(12) }
                        .clipShape(RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke))
                }.buttonStyle(.plain).accessibilityIdentifier("discover-genre-" + genre)
            }
        }
    }
}
