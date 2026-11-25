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
    @State private var refreshRevision = 0

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
                CrewsView(onBack: mine == nil ? nil : { browsing = false })
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
                VStack(spacing: 0) {
                    HStack(spacing: 4) {
                        ForEach([("작품", "music.note.list"), ("멤버", "person.2"), ("소개", "info.circle")], id: \.0) { name, icon in
                            Button { section = name } label: {
                                crewMenuLabel(name, icon: icon, selected: section == name)
                            }
                            .accessibilityIdentifier("crew-section-" + name)
                            .accessibilityAddTraits(section == name ? .isSelected : [])
                        }
                    }
                    Rectangle().fill(AifectDesign.muted.opacity(0.2)).frame(height: 1).padding(.horizontal, 8).padding(.vertical, 6)
                    HStack(spacing: 4) {
                        Button { section = "공지" } label: {
                            crewMenuLabel("공지", icon: "megaphone", selected: section == "공지")
                        }.accessibilityIdentifier("crew-notices-open").accessibilityAddTraits(section == "공지" ? .isSelected : [])
                        Button { section = "크루 관리" } label: {
                            crewMenuLabel("크루 관리", icon: "slider.horizontal.3", selected: section == "크루 관리")
                        }.accessibilityIdentifier("crew-membership-open").accessibilityAddTraits(section == "크루 관리" ? .isSelected : [])
                        Button { browsing = true } label: {
                            crewMenuLabel("크루 찾기", icon: "magnifyingglass")
                        }.accessibilityIdentifier("crew-directory-open")
                    }
                }.buttonStyle(.plain)
                switch section {
                case "공지":
                    CrewNoticesView(id: id, refreshRevision: refreshRevision)
                case "크루 관리":
                    CrewMembershipView(id: id, detail: data) { Task { await load() } }
                case "멤버":
                    ForEach(data.objects("members"), id: \.selfID) { person in
                        NavigationLink { ProfilePage(id: person.selfID).streamingPage() } label: {
                            HStack(spacing: 12) {
                                ProfilePhoto(person: person, size: 46)
                                VStack(alignment: .leading, spacing: 4) {
                                    MemberName(person).font(.headline)
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
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 24)
        }.refreshable { await load() }
    }

    private func crewMenuLabel(_ title: String, icon: String, selected: Bool = false) -> some View {
        VStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 17, weight: .medium)).frame(height: 20)
            Text(title).font(.system(size: 12, weight: selected ? .bold : .medium))
        }
        .frame(maxWidth: .infinity, minHeight: 56)
        .foregroundStyle(selected ? Brand.pink : AifectDesign.secondaryText)
        .background(selected ? Brand.pink.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 10))
        .contentShape(RoundedRectangle(cornerRadius: 10))
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
            mine = id; data = result; ready = true; error = nil; refreshRevision += 1
        } catch { if !Task.isCancelled, model.userID == owner { self.error = error.localizedDescription } }
    }
}

struct CrewNoticesView: View {
    let id: String
    let refreshRevision: Int
    @EnvironmentObject private var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var loading = true
    @State private var editing = false
    var body: some View {
        LazyVStack(alignment: .leading, spacing: 14) {
            Text("크루 공지").font(.title2.bold())
            if loading && data.isEmpty { ProgressView() }
            if let error { RetryCard(message: error) { Task { await load() } } }
            if data.flag("can_manage") { Button("공지 관리") { editing = true }.frame(minHeight: 44) }
            ForEach(data.objects("items"), id: \.selfID) { item in
                VStack(alignment: .leading, spacing: 8) {
                    if item.flag("is_pinned") { Text("고정 공지").font(.system(size: 12)).foregroundStyle(Brand.pink) }
                    Text(item.string("title")).font(.system(size: 18, weight: .bold))
                    HStack { Text(item.string("author_name")); if item.number("created") > 0 { Text(Date(timeIntervalSince1970: item.number("created")), style: .date) } }.font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    Text(item.string("body")).font(.system(size: 15)).lineSpacing(6)
                    ForEach(item.objects("images"), id: \.selfID) { photo in
                        RemoteArtwork(url: try? Endpoint.url(photo.string("url"))) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
            }
            if !loading && error == nil && data.objects("items").isEmpty { ContentUnavailableView("등록된 공지가 없어요", systemImage: "megaphone", description: Text("새 공지가 올라오면 여기에 표시돼요.")) }
        }.accessibilityElement(children: .contain).accessibilityIdentifier("crew-notices-page")
            .task(id: "\(id)-\(model.userID ?? "")-\(refreshRevision)") { await load() }
            .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) {
                NavigationStack {
                    if let workspace = SiteWorkspace(crewNotices: id) {
                        WebWorkspacePage(space: workspace)
                            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { editing = false } } }
                    }
                }.preferredColorScheme(.dark)
            }
    }
    private func load() async {
        let owner = model.userID
        do {
            let result = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))/notices")
            guard !Task.isCancelled, owner == model.userID else { return }
            data = result; error = nil; loading = false
        } catch { if !Task.isCancelled, owner == model.userID { self.error = error.localizedDescription; loading = false } }
    }
}

struct CrewMembershipView: View {
    let id: String
    let detail: [String: Any]
    let onLeft: () -> Void
    @EnvironmentObject private var model: AppModel
    @State private var leaving = false
    @State private var busy = false
    @State private var error: String?
    private var role: String { detail.object("membership").string("role") }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("크루 관리").font(.title2.bold())
            VStack(spacing: 14) {
                HStack { Text("내 역할").foregroundStyle(AifectDesign.muted); Spacer(); Text(["owner":"크루장", "deputy":"부크루장", "operator":"운영자", "manager":"매니저", "member":"크루원"][role] ?? "확인할 수 없음") }
                HStack { Text("가입일").foregroundStyle(AifectDesign.muted); Spacer(); if detail.object("membership").number("joined") > 0 { Text(Date(timeIntervalSince1970: detail.object("membership").number("joined")), style: .date) } else { Text("확인할 수 없음") } }
            }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
            if role == "owner" { Text("크루장을 위임한 후 탈퇴할 수 있어요.").foregroundStyle(AifectDesign.muted) }
            Button("크루 탈퇴") { leaving = true }.buttonStyle(ParityPill()).disabled(busy || role.isEmpty || role == "owner").accessibilityIdentifier("crew-membership-leave")
            if let error { Text(error).foregroundStyle(AifectDesign.muted) }
        }.accessibilityElement(children: .contain).accessibilityIdentifier("crew-membership-page")
            .confirmationDialog("크루를 탈퇴할까요?", isPresented: $leaving, titleVisibility: .visible) { Button("탈퇴", role: .destructive) { Task { await leave() } } } message: { Text(detail.object("crew").string("name") + "에서 탈퇴합니다.") }
    }
    private func leave() async {
        guard let account = model.userID, !busy, !role.isEmpty, role != "owner" else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await API.shared.call("/api/crews/\(Endpoint.pathID(id))/leave", method: "POST")
            guard account == model.userID else { return }
            await model.refreshInbox(); model.profileRevision += 1; onLeft()
        } catch { if account == model.userID { self.error = error.localizedDescription } }
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
