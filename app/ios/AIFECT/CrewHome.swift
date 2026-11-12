import CryptoKit
import SwiftUI

enum CrewGame: String, CaseIterable {
    case jump, fishing, rhythm, racing

    var title: String {
        switch self {
        case .jump: "점프러시"
        case .fishing: "월척헌터"
        case .rhythm: "비트콤보"
        case .racing: "터보레이스"
        }
    }

    static func active(at date: Date, catalog: [String: Any]) -> CrewGame? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let weekday = calendar.component(.weekday, from: date)
        guard (2...6).contains(weekday),
              let monday = calendar.date(byAdding: .day, value: 2 - weekday, to: date) else { return nil }
        let parts = calendar.dateComponents([.year, .month, .day], from: monday)
        let week = String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
        if catalog.string("week_start") == week, let game = CrewGame(rawValue: catalog.string("active_game_id")) {
            return game
        }
        let digest = SHA256.hash(data: Data(("aifect-crew-v1:" + week).utf8))
        return allCases[Int(Array(digest)[0]) % allCases.count]
    }
}

struct CrewHome: View {
    @EnvironmentObject private var model: AppModel
    @Binding var space: SiteWorkspace?
    @State private var mine: String?
    @State private var data: [String: Any] = [:]
    @State private var ready = false
    @State private var error: String?
    @State private var browsing = false
    @State private var section = "작품"

    var body: some View {
        Group {
            if model.userID == nil {
                CrewsView()
            } else if let error {
                RetryCard(message: error) { Task { await load() } }
            } else if !ready {
                ProgressView("크루를 불러오는 중")
            } else if let mine, !browsing {
                memberHome(id: mine)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    if mine != nil { Button("‹ 내 크루로 돌아가기") { browsing = false }.padding(.horizontal) }
                    CrewsView()
                }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: model.userID) { await load() }
    }

    private func memberHome(id: String) -> some View {
        let crew = data.object("crew")
        let songs = data.songs()
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 14) {
                    Color.clear.frame(width: 88, height: 88).overlay { CrewArtwork(crew: crew) }.clipShape(RoundedRectangle(cornerRadius: 19))
                    VStack(alignment: .leading, spacing: 7) {
                        Text(crew.string("name")).font(.system(size: 24, weight: .bold))
                        Text("멤버 \(crew.int("members")) / \(crew.int("capacity"))명").foregroundStyle(AifectDesign.muted)
                        Text("Lv.\(crew.int("level")) · \(crew.int("xp")) XP").font(.caption).foregroundStyle(Brand.pink)
                    }.font(.subheadline)
                }
                TimelineView(.everyMinute) { tick in
                    if CrewGame.active(at: tick.date, catalog: [:]) != nil {
                        WeeklyCrewBanner(id: id, date: tick.date, space: $space)
                    }
                }
                VStack(spacing: 8) {
                    HStack {
                        Text("Lv.\(crew.int("level"))  \(crew.int("xp")) XP").foregroundStyle(Brand.pink)
                        Spacer()
                        Text((crew["next_xp"] as? NSNumber).map { "다음 레벨까지 \(max(0, $0.intValue - crew.int("xp"))) XP" } ?? "최고 레벨")
                            .foregroundStyle(AifectDesign.muted)
                    }.font(.caption)
                    ProgressView(value: min(1, max(0, crew.number("progress")))).tint(Brand.aqua)
                }
                CatalogTabs(names: ["작품", "멤버", "소개"], selection: $section)
                HStack {
                    NavigationLink("공지 · 채팅 · 크루 관리") { CrewPage(id: id).streamingPage() }
                    Spacer()
                    Button("크루 찾기") { browsing = true }
                }.font(.subheadline)
                switch section {
                case "멤버":
                    ForEach(data.objects("members"), id: \.selfID) { person in
                        NavigationLink { ProfilePage(id: person.selfID).streamingPage() } label: {
                            HStack(spacing: 12) {
                                ProfilePhoto(person: person, size: 46)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(person.displayName()).font(.headline)
                                    let roles = ["owner":"크루장","deputy":"부크루장","operator":"운영자","manager":"매니저"]
                                    Text(data.object("roles").string(person.string("role"), fallback: roles[person.string("role")] ?? "크루원"))
                                        .font(.caption).foregroundStyle(AifectDesign.muted)
                                }
                                Spacer()
                            }.frame(minHeight: 68).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                case "소개":
                    Text(crew.string("description").isEmpty ? "아직 등록된 소개가 없어요." : crew.string("description"))
                    NavigationLink("크루 자세히 보기") { CrewPage(id: id).streamingPage() }
                default:
                    Text("크루 작품  \(songs.count)").font(.title2.bold())
                    if songs.isEmpty {
                        ContentUnavailableView("아직 공개된 크루 작품이 없어요", systemImage: "music.note",
                                               description: Text("크루원이 공개한 음악이 여기에 표시돼요."))
                    } else {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 16) {
                            ForEach(songs) { song in
                                VStack(alignment: .leading, spacing: 4) {
                                    ZStack(alignment: .bottomTrailing) {
                                        NavigationLink { TrackDetailView(song: song).streamingPage() } label: { AlbumArtwork(song: song) }
                                        ArtworkPlayButton(diameter: 32, label: song.title + " 재생") { model.player.play(song, queue: songs) }
                                    }
                                    Text(song.title).font(.subheadline.bold()).lineLimit(1)
                                    Text(song.credit).font(.caption).lineLimit(1).foregroundStyle(AifectDesign.muted)
                                }
                            }
                        }.buttonStyle(.plain)
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
        }.refreshable { await load() }
    }

    private func load() async {
        guard let owner = model.userID else { ready = false; mine = nil; data = [:]; return }
        do {
            let directory = try await API.shared.call("/api/crews?summary=1")
            let key = directory.string("mine")
            let id = SiteWorkspace.validKey(key) && key != "null" ? key : nil
            var result: [String: Any] = [:]
            if let id { result = try await API.shared.call("/api/crews/" + Endpoint.pathID(id)) }
            try Task.checkCancellation()
            guard owner == model.userID else { return }
            if mine != id { section = "작품"; browsing = false }
            mine = id; data = result; ready = true; error = nil
        } catch { if !Task.isCancelled, model.userID == owner { self.error = error.localizedDescription } }
    }
}

private struct WeeklyCrewBanner: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var phase
    let id: String
    let date: Date
    @Binding var space: SiteWorkspace?
    @State private var catalog: [String: Any]?
    @State private var error: String?

    var body: some View {
        Group {
            if let error {
                RetryCard(message: error) { Task { await load() } }
            } else if let catalog {
                if let game = CrewGame.active(at: date, catalog: catalog),
                   let item = catalog.objects("games").first(where: { $0.string("id") == game.rawValue && $0.string("route") == "game/\(game.rawValue)/\(id)" }),
                   let destination = SiteWorkspace(game: game, crew: id, route: item.string("route")) {
                    VStack(alignment: .trailing, spacing: 5) {
                        Button { model.player.pause(); space = destination } label: {
                            Image("crew-weekly-" + game.rawValue).resizable().aspectRatio(3, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                        }.buttonStyle(.plain).accessibilityLabel("이번 주 크루 경쟁 게임: \(game.title). 플레이")
                            .accessibilityIdentifier("crew-weekly-game-banner")
                        if catalog.string("mode") == "test" { Text("테스트 중").font(.caption2) }
                    }
                } else { Text("이번 주 크루 경쟁 게임을 준비 중이에요.").font(.subheadline).foregroundStyle(AifectDesign.muted) }
            } else { ProgressView() }
        }.task(id: "\(id)-\(phase)-\(model.selectedTab)") {
            guard phase == .active, model.selectedTab == 1 else { return }
            while !Task.isCancelled {
                await load()
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
            }
        }
    }

    private func load() async {
        do {
            let result = try await API.shared.call("/api/crews/" + Endpoint.pathID(id) + "/games")
            try Task.checkCancellation()
            catalog = result; error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
