import SwiftUI

struct LiveCommunity: View {
    @EnvironmentObject private var model: AppModel
    @State private var tab = "라이브"
    @State private var space: SiteWorkspace?
    var body: some View {
        VStack(spacing: 0) {
            CatalogHeader(title: "커뮤니티")
            CatalogTabs(names: ["라이브","크루","랭킹"], selection: $tab)
            switch tab {
            case "크루": CrewHome(space: $space).id(model.userID)
            case "랭킹": CommunityRankings(space: $space)
            default: LiveLobby(space: $space)
            }
        }.navigationDestination(item: $space) { WorkspacePage(space: $0) }
    }
}

private struct LiveLobby: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var phase
    @Binding var space: SiteWorkspace?
    @State private var query = ""
    @State private var enabled = false
    @State private var ready = false
    @State private var error: String?
    @State private var rooms: [[String: Any]] = []
    @State private var create = false
    private var filtered: [[String: Any]] {
        rooms.filter { row in
            ["talk","karaoke"].contains(row.string("mode")) && (query.isEmpty || (row.string("title") + row.string("host_name")).localizedCaseInsensitiveContains(query))
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("지금 열려 있는 노래방 · 토킹룸").font(.system(size: 18, weight: .semibold))
                    Text("공개된 방만 보여줘요").font(.caption).foregroundStyle(AifectDesign.muted)
                }
                HStack(spacing: 8) {
                    HStack { Image(systemName: "magnifyingglass"); TextField("방 제목·방장 검색", text: $query) }
                        .font(.subheadline).padding(.horizontal, 12).frame(minHeight: 48).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
                    Button { if model.requireLogin() { create = true } } label: {
                        Label("방 만들기", systemImage: "plus").font(.subheadline.bold()).foregroundStyle(Brand.background)
                            .frame(width: 108, height: 48).background(Brand.gradient, in: RoundedRectangle(cornerRadius: 12))
                    }.disabled(!enabled)
                }
                if let error { RetryCard(message: error) { Task { await refresh() } } }
                if !ready && error == nil { ProgressView().frame(maxWidth: .infinity) }
                else if ready && filtered.isEmpty && error == nil {
                    VStack(spacing: 22) {
                        Image(systemName: "bubble.left.and.bubble.right.fill").font(.system(size: 76)).foregroundStyle(Brand.gradient)
                        Text(!enabled ? "라이브 연결을 준비하고 있어요" : query.isEmpty ? "아직 열린 공개 노래방·토킹룸이 없어요." : "검색 결과가 없어요")
                            .font(.subheadline).foregroundStyle(AifectDesign.secondaryText)
                    }.frame(maxWidth: .infinity).padding(.vertical, 50)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 2), spacing: 16) {
                    ForEach(filtered, id: \.selfID) { room in
                        let karaoke = room.string("mode") == "karaoke"
                        Button {
                            if model.requireLogin() { space = SiteWorkspace(area: karaoke ? "live" : "voice", key: room.string("id"), title: room.string("title")) }
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                let assets = room.object("theme").object("assets")
                                GeometryReader { bounds in
                                    RemoteArtwork(url: CatalogArtwork.url(assets["roomMobile"] as? String ?? assets["roomDesktop"] as? String), catalog: true) { $0.resizable().scaledToFill() } placeholder: { LinearGradient(colors: [Brand.card, Brand.background], startPoint: .topLeading, endPoint: .bottomTrailing) }
                                        .frame(width: bounds.size.width, height: 112).clipped()
                                }.frame(height: 112)
                                    .overlay(alignment: .topLeading) { roomBadge(karaoke ? "♫ 노래방" : "● 토킹룸") }
                                    .overlay(alignment: .bottomTrailing) { roomBadge("\(room.int("member_count"))명") }.clipShape(RoundedRectangle(cornerRadius: 12))
                                Text(room.string("title")).font(.system(size: 14, weight: .semibold)).lineLimit(2)
                                Text(room.string("host_name")).font(.caption).foregroundStyle(AifectDesign.muted)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.buttonStyle(.plain)
                    }
                }
            }.padding(20)
        }.refreshable { await refresh() }
            .task(id: "\(phase)-\(model.selectedTab)-\(model.userID ?? "")") {
                guard phase == .active, model.selectedTab == 1 else { return }
                while !Task.isCancelled {
                    await refresh()
                    do { try await Task.sleep(for: .seconds(20)) } catch { return }
                }
            }
            .sheet(isPresented: $create) {
                NavigationStack { RoomCreation { newRoom in create = false; space = newRoom } }
            }
    }
    private func roomBadge(_ label: String) -> some View {
        Text(label).font(.caption2.bold()).padding(5).background(Brand.background.opacity(0.88), in: RoundedRectangle(cornerRadius: 6)).padding(6)
    }
    @MainActor private func refresh() async {
        do {
            let status = try await API.shared.call("/api/voice/status")
            let available = status.flag("enabled")
            let result = available ? try await API.shared.call("/api/voice/public-rooms").objects("rooms") : []
            try Task.checkCancellation()
            enabled = available; rooms = result; ready = true; error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private struct RoomCreation: View {
    var onCreated: (SiteWorkspace) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var mode = "karaoke"
    @State private var title = ""
    @State private var visibility = "public"
    @State private var seating = "approval"
    @State private var capacity = 30
    @State private var theme = ""
    @State private var themes: [[String: Any]] = []
    @State private var crews: [[String: Any]] = []
    @State private var crew = ""
    @State private var notice = ""
    @State private var busy = false
    @State private var error: String?
    @State private var requestID = UUID().uuidString
    private var hasSelectedTheme: Bool {
        !theme.isEmpty && themes.contains { $0.string("sku") == theme }
    }
    var body: some View {
        Form {
            Picker("방 유형", selection: $mode) { Text("노래방").tag("karaoke"); Text("토킹룸").tag("talk") }.pickerStyle(.segmented)
            TextField("방 제목", text: $title)
            Picker("공개 범위", selection: $visibility) {
                Text("공개").tag("public"); Text("초대 전용").tag("private"); Text("팔로워").tag("followers")
                if !crews.isEmpty { Text("크루").tag("crew") }
            }
            if visibility == "crew" { Picker("크루", selection: $crew) { ForEach(crews, id: \.selfID) { c in Text(c.string("name")).tag(c.string("id")) } } }
            Picker("좌석 참여", selection: $seating) { Text("허락 후 착석").tag("approval"); Text("자유 착석").tag("free") }
            Picker("방 배경", selection: $theme) { ForEach(themes.indices, id: \.self) { i in Text(themes[i].string("name", fallback: themes[i].string("sku"))).tag(themes[i].string("sku")) } }
            Stepper("최대 인원 \(capacity)명", value: $capacity, in: 2...30)
            TextField("공지", text: $notice, axis: .vertical)
            if let error { Text(error).foregroundStyle(Brand.pink); Button("설정 다시 읽기") { Task { await options() } } }
            Button("방 만들기") { Task { await submit() } }.disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.count > 60 || !hasSelectedTheme)
        }.disabled(busy).navigationTitle("방 만들기")
            .toolbar { Button("닫기") { dismiss() } }.task(id: mode) { await options() }
    }
    private func options() async {
        theme = ""
        themes = []
        do {
            let result = try await API.shared.call("/api/voice/options?mode=" + mode)
            try Task.checkCancellation()
            crews = result.objects("crews"); crew = crews.first?.string("id") ?? ""
            themes = result.objects("themes").filter {
                $0.flag("selectable") && !["navy","sunset","night"].contains($0.string("sku"))
            }
            let preferred = result.string("preferred_theme")
            theme = themes.contains { $0.string("sku") == preferred } ? preferred : themes.first?.string("sku") ?? ""
            if title.isEmpty { title = result.object("suggested_titles").string(mode) }
            error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func submit() async {
        guard !busy, hasSelectedTheme else { return }
        busy = true; defer { busy = false }
        var body: [String: Any] = ["mode":mode,"title":title.trimmingCharacters(in: .whitespacesAndNewlines),"visibility":visibility,"seating_mode":seating,"max_members":capacity,"announcement":notice,"theme_sku":theme,"background":theme,"request_id":requestID]
        if visibility == "crew" { body["crew_id"] = crew }
        do {
            let room = try await API.shared.call("/api/voice/rooms", method: "POST", body: body).object("room")
            guard let space = SiteWorkspace(area: mode == "karaoke" ? "live" : "voice", key: room.string("id"), title: title) else { throw URLError(.cannotParseResponse) }
            onCreated(space)
        } catch { self.error = error.localizedDescription }
    }
}

private struct CommunityRankings: View {
    @Binding var space: SiteWorkspace?
    @EnvironmentObject private var model: AppModel
    @State private var crews: [String: [String: Any]] = [:]
    @State private var mine = ""
    @State private var category = "작품"
    @State private var period = "week"
    @State private var kind = "solo"
    @State private var rows: [[String: Any]] = []
    @State private var error: String?
    @State private var loading = true
    private let names = ["작품","AI 아티스트","크루","더빙"]
    private var path: String {
        let key = ["작품":"work","AI 아티스트":"aiArtist","크루":"crew","더빙":"dubbing"][category] ?? "work"
        return "/api/community/rankings?category=\(key)&period=\(period)&workKind=\(kind)"
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                HStack {
                    ForEach(names, id: \.self) { name in
                        Button { category = name } label: {
                            VStack { Image(systemName: ["작품":"music.note","AI 아티스트":"person","크루":"person.3","더빙":"waveform"][name] ?? "music.note"); Text(name).font(.caption) }
                                .frame(maxWidth: .infinity, minHeight: 68).background(Brand.card, in: RoundedRectangle(cornerRadius: 13))
                                .overlay(RoundedRectangle(cornerRadius: 13).stroke(category == name ? AifectDesign.violet : AifectDesign.stroke))
                        }.buttonStyle(.plain)
                            .accessibilityIdentifier("ranking-category-" + name)
                    }
                }
                HStack {
                    if category == "작품" { Picker("작품 유형", selection: $kind) { Text("솔로").tag("solo"); Text("듀엣").tag("duet") }.pickerStyle(.segmented).fixedSize() }
                    else { Text(category + " 랭킹").font(.headline) }
                    Spacer()
                    Picker("기간", selection: $period) { Text("주간").tag("week"); Text("월간").tag("month") }
                }
                if let error { RetryCard(message: error) { Task { await load() } } }
                else if loading { ProgressView() }
                else if rows.isEmpty { Text("아직 집계된 순위가 없어요.").foregroundStyle(AifectDesign.muted) }
                if category == "크루", !rows.isEmpty {
                    CrewRankPodium(rows: rows, crews: crews)
                    if !mine.isEmpty, let index = rows.firstIndex(where: { $0.string("id") == mine }) {
                        let row = rows[index]
                        NavigationLink { CrewPage(id: row.selfID).streamingPage() } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("내 크루 순위").font(.caption).foregroundStyle(Brand.pink)
                                HStack {
                                    Text("\(rankPosition(row, at: index))위").font(.title3.bold())
                                    RankCrewPhoto(row: row, crew: crews[mine], size: 40)
                                    VStack(alignment: .leading) {
                                        Text(row.string("name")).font(.subheadline.bold())
                                        if let crew = crews[mine] {
                                            Text("LV.\(crew.int("level")) · \(crew.int("members"))명").font(.caption)
                                        }
                                    }
                                    Spacer()
                                    RankMovement(row: row, rank: rankPosition(row, at: index))
                                    Image(systemName: "chevron.right").font(.caption)
                                }
                            }.padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Brand.gradient))
                                .contentShape(Rectangle())
                        }.buttonStyle(.plain).accessibilityIdentifier("my-crew-ranking")
                    }
                }
                ForEach(rows.indices.dropFirst(category == "크루" ? 3 : 0), id: \.self) { index in
                    let row = rows[index]
                    let id = row.string("id")
                    let label = HStack(spacing: 10) {
                        Text("\(row.int("rank") > 0 ? row.int("rank") : index + 1)").bold().foregroundStyle(Brand.pink).frame(width: 26)
                        if category == "크루" {
                            RankCrewPhoto(row: row, crew: crews[id], size: 52)
                        } else if category == "AI 아티스트" {
                            ProfilePhoto(person: row, kind: "artist", size: 52)
                        } else {
                            RemoteArtwork(url: CatalogArtwork.url(row["image_url"] as? String), catalog: true) { $0.resizable().scaledToFill() } placeholder: { Image(systemName: category == "작품" ? "music.note" : "waveform").foregroundStyle(Brand.pink) }
                                .frame(width: 52, height: 52).background(Brand.card).clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        VStack(alignment: .leading, spacing: 4) { Text(row.string("name")).font(.subheadline.bold()); Text(row.string("detail")).font(.caption).foregroundStyle(AifectDesign.muted) }
                        Spacer()
                        RankMovement(row: row, rank: rankPosition(row, at: index))
                    }.contentShape(Rectangle())
                    Group {
                        switch category {
                        case "크루": NavigationLink { CrewPage(id: id).streamingPage() } label: { label }
                        case "AI 아티스트": NavigationLink { ProfilePage(id: id, kind: "artist").streamingPage() } label: { label }
                        case "더빙": Button { space = SiteWorkspace(area: "dubbing", key: id, title: row.string("name")) } label: { label }
                        default: NavigationLink { RankingSongDetail(id: id) } label: { label }
                        }
                    }.buttonStyle(.plain)
                    Divider()
                }
            }.padding(16)
        }.task(id: path + "|" + (model.userID ?? "")) { await load() }
    }
    private func load() async {
        let requested = path
        let account = model.userID
        loading = true; rows = []; error = nil; crews = [:]; mine = ""
        do {
            let result = try await API.shared.call(requested)
            try Task.checkCancellation()
            var summary: [String: Any] = [:]
            if category == "크루" { summary = (try? await API.shared.call("/api/crews?summary=1")) ?? [:] }
            try Task.checkCancellation()
            guard requested == path, account == model.userID else { return }
            for crew in summary.objects("crews") { crews[crew.string("id")] = crew }
            mine = account == nil ? "" : summary.string("mine")
            rows = result.objects("rows")
            loading = false
        }
        catch { if !Task.isCancelled && requested == path { self.error = error.localizedDescription; loading = false } }
    }
}

private struct RankingSongDetail: View {
    let id: String
    @State private var song: Song?
    @State private var error: String?
    var body: some View {
        Group { if let song { TrackDetailView(song: song) } else if let error { RetryCard(message: error) { Task { await load() } } } else { ProgressView() } }
            .streamingPage().task(id: id) { await load() }
    }
    private func load() async {
        do { let data = try await API.shared.call("/api/tracks/" + Endpoint.pathID(id)); try Task.checkCancellation(); song = Song(data.object("track")); error = nil }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private func rankPosition(_ row: [String: Any], at index: Int) -> Int {
    row.int("rank") > 0 ? row.int("rank") : index + 1
}

struct RankMovement: View {
    let row: [String: Any]
    let rank: Int
    var change: (text: String, label: String) {
        let movement = row.string("chart_movement")
        if (movement.isEmpty ? row.string("rank_movement") : movement) == "new" { return ("NEW", "새로 진입") }
        let previous = row.int("previous_rank")
        guard let delta = (row["rank_change"] as? NSNumber)?.intValue ?? (previous > 0 ? previous - rank : nil) else {
            return ("—", "이전 순위 기록 없음")
        }
        if delta > 0 { return ("▲\(delta)", "\(delta)계단 상승") }
        if delta < 0 { return ("▼\(delta.magnitude)", "\(delta.magnitude)계단 하락") }
        return ("—", "순위 변동 없음")
    }
    var body: some View {
        Text(change.text).font(.caption.bold())
            .foregroundStyle(change.text == "—" ? AifectDesign.muted : change.text.hasPrefix("▼") ? Brand.aqua : Brand.pink)
            .accessibilityLabel(change.label)
    }
}

private struct RankCrewPhoto: View {
    let row: [String: Any]
    let crew: [String: Any]?
    let size: CGFloat
    var body: some View {
        let version = crew?.string("image_version") ?? ""
        let data = row.merging(["image_version": version.isEmpty ? row.string("image_version") : version]) { _, value in value }
        Color.clear.frame(width: size, height: size).overlay { CrewArtwork(crew: data) }
            .clipShape(Circle()).overlay(Circle().stroke(Brand.gradient, lineWidth: 1))
    }
}

private struct CrewRankPodium: View {
    let rows: [[String: Any]]
    let crews: [String: [String: Any]]
    private var order: [Int] { rows.count == 1 ? [0] : rows.count == 2 ? [1, 0] : [1, 0, 2] }
    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(order, id: \.self) { index in
                let row = rows[index]
                let rank = rankPosition(row, at: index)
                let id = row.string("id")
                let winner = rank == 1
                let tint = winner ? Color(aifectHex: 0xE7C483) : rank == 2 ? AifectDesign.violet : Color(aifectHex: 0xC3A1AA)
                NavigationLink { CrewPage(id: id).streamingPage() } label: {
                    VStack(spacing: 7) {
                        Image(systemName: "crown.fill").foregroundStyle(tint)
                        Text("\(rank)").font(.headline).foregroundStyle(tint)
                        RankCrewPhoto(row: row, crew: crews[id], size: winner ? 66 : 54)
                        Text(row.string("name")).font(.system(size: winner ? 14 : 12, weight: .bold)).lineLimit(1)
                        if let crew = crews[id] {
                            Text("LV.\(crew.int("level"))").font(.caption2)
                                .padding(.horizontal, 8).padding(.vertical, 3).background(AifectDesign.violet.opacity(0.18), in: Capsule())
                        }
                        RankMovement(row: row, rank: rank)
                    }.padding(.horizontal, 5).padding(.vertical, 10)
                        .frame(maxWidth: order.count == 1 ? 148 : .infinity, alignment: .top)
                        .frame(height: winner ? 244 : 218, alignment: .top)
                        .background(LinearGradient(colors: [Color(aifectHex: winner ? 0x353453 : 0x21283D), Brand.card],
                                                   startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 15))
                        .overlay(RoundedRectangle(cornerRadius: 15).stroke(Brand.gradient.opacity(winner ? 1 : 0.45)))
                }.buttonStyle(.plain).accessibilityIdentifier("crew-podium-" + id)
            }
        }.frame(maxWidth: .infinity).padding(.vertical, 8)
    }
}
