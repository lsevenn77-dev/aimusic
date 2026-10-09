import SwiftUI

struct MusicCollectionView: View {
    let title: String
    let path: String
    var key = "tracks"
    @EnvironmentObject var model: AppModel
    @State private var songs: [Song] = []
    @State private var error: String?
    var body: some View {
        List {
            if !songs.isEmpty { Button("전체 재생") { model.player.play(songs[0], queue: songs) } }
            ForEach(songs) { SongRow(song: $0, queue: songs) }
            if let error { RetryCard(message: error) { Task { await load() } } }
            else if songs.isEmpty { Text("공개된 음악이 없습니다.").foregroundStyle(.secondary) }
        }.navigationTitle(title).task { await load() }.refreshable { await load() }
    }
    private func load() async { do { songs = try await API.shared.call(path).songs(key); error = nil } catch { self.error = error.localizedDescription } }
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
    init(initialPeriod: String = "today", originalID: String? = nil) { _period = State(initialValue: initialPeriod); self.originalID = originalID }
    @State private var kind = "tracks"
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    var body: some View {
        List {
            Picker("기간", selection: $period) { Text("오늘").tag("today"); Text("이번 주").tag("week"); Text("이달").tag("month"); Text("전체").tag("all") }.pickerStyle(.segmented)
            Picker("랭킹", selection: $kind) { Text("커버곡").tag("tracks"); Text("싱어").tag("singers") }.pickerStyle(.segmented)
            ForEach(data.songs()) { SongRow(song: $0, queue: data.songs()) }
            ForEach(data.objects("singers"), id: \.selfID) { person in NavigationLink { ProfilePage(id: person.string("id")) } label: { HStack { Text("\(person.int("rank"))").foregroundStyle(Brand.pink); PersonRow(person: person) } } }
            if data.songs().isEmpty && data.objects("singers").isEmpty { Text("아직 해당 기간의 순위가 없습니다.") }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("커버곡 랭킹").task(id: period + kind) { await load() }.refreshable { await load() }
    }
    private func load() async { do { let value = try await API.shared.call("/api/cover-rankings?period=\(period)&kind=\(kind)" + (originalID.map { "&original_id=\(Endpoint.query($0))" } ?? "")); guard !Task.isCancelled else { return }; data = value; error = nil } catch { self.error = error.localizedDescription } }
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
        }.navigationTitle("가사").task { do { let track = try await API.shared.call("/api/tracks/\(Endpoint.pathID(song.id))").object("track"); access = track.string("lyrics_access"); lyrics = track.string("lyrics") } catch { self.error = error.localizedDescription } }
    }
}
