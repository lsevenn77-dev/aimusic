import SwiftUI

struct DubbingCover: View {
    let row: [String: Any]
    var body: some View {
        let genres = row["genres"] as? [String] ?? row.object("options")["genres"] as? [String] ?? []
        let slugs = ["SF":"sf", "이세계물":"isekai", "판타지":"fantasy", "사극":"historical", "로맨스":"romance",
                     "액션":"action", "코미디":"comedy", "첩보":"spy", "공포":"horror", "스릴러":"thriller",
                     "미스터리":"mystery", "일상":"daily", "감동":"moving"]
        let slug = slugs[genres.first ?? ""] ?? "daily"
        RemoteArtwork(url: try? Endpoint.url("/assets/dubbing-genres/" + slug + ".webp")) {
            $0.resizable().scaledToFill()
        } placeholder: { Image(systemName: "theatermasks").foregroundStyle(AifectDesign.violet) }
    }
}

struct DubbingScriptLine: Identifiable {
    let id: String
    let row: [String: Any]
    let start: Double

    static func timeline(_ lines: [[String: Any]]) -> [Self] {
        var start = 0.0
        return lines.sorted { $0.int("order") < $1.int("order") }.map { line in
            defer { start += max(0, line.number("durationSeconds")) + max(0, line.number("gapSeconds")) }
            return Self(id: line.string("id"), row: line, start: start)
        }
    }
}

struct DubbingProjectPage: View {
    @EnvironmentObject private var model: AppModel
    let space: SiteWorkspace
    @State private var project: [String: Any] = [:]
    @State private var expanded = false
    @State private var busy = false
    @State private var error: String?
    @State private var openStudio = false
    private var path: String { "/api/dubbing/projects/" + Endpoint.pathID(space.key) }
    private var roles: [[String: Any]] { project.objects("roles") }
    private var mine: String? { roles.first { $0.flag("mine") }?.string("id") }
    private var lines: [DubbingScriptLine] { DubbingScriptLine.timeline(project.object("script").objects("lines")) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let error { RetryCard(message: error) { Task { await load() } } }
                if project.isEmpty && error == nil { ProgressView("극본을 불러오는 중") }
                if !project.isEmpty {
                    Text("작품 정보").font(.headline)
                    summary
                    HStack {
                        Text("배역 선택").font(.headline)
                        Spacer()
                        Text("\(roles.filter { $0.flag("claimed") }.count) / \(roles.count)명 참여")
                            .font(.caption).foregroundStyle(AifectDesign.muted)
                    }
                    ForEach(roles.filter { $0.flag("mine") } + roles.filter { !$0.flag("mine") }, id: \.selfID) { role in
                        roleCard(role)
                    }
                    if mine != nil {
                        Button { openStudio = true } label: { Label("녹음 작업 열기", systemImage: "mic").frame(maxWidth: .infinity) }
                            .buttonStyle(ParityPill(filled: true))
                    }
                    let timeline = lines
                    HStack {
                        Text("대본 미리보기").font(.headline)
                        Spacer()
                        Text("총 \(timeline.count)개 대사").font(.caption).foregroundStyle(AifectDesign.muted)
                    }
                    ForEach(expanded ? timeline[...] : timeline.prefix(4)) { line in lineCard(line) }
                    if timeline.count > 4 {
                        Button { expanded.toggle() } label: {
                            Label(expanded ? "대본 접기" : "전체 대본 펼쳐보기", systemImage: "list.bullet")
                                .frame(maxWidth: .infinity, minHeight: 48).contentShape(Rectangle())
                        }.buttonStyle(.bordered)
                    }
                    ForEach(project.objects("versions").filter { $0.selfID != space.key }, id: \.selfID) { version in
                        if let other = SiteWorkspace(area: "dubbing", key: version.selfID, title: version.string("title", fallback: "다른 더빙")) {
                            NavigationLink { DubbingProjectPage(space: other) } label: { Label(other.title, systemImage: "waveform") }
                        }
                    }
                }
                Button("더빙 작업 화면 열기") { openStudio = true }.frame(minHeight: 44)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
        }.accessibilityIdentifier("dubbing-project-scroll").navigationTitle("더빙 스튜디오").modifier(FullScreenWorkspace())
        .toolbar {
            Menu { Button("새로고침") { Task { await load() } }; Button("더빙 작업 화면 열기") { openStudio = true } } label: {
                Image(systemName: "ellipsis").accessibilityLabel("더빙 메뉴")
            }
        }
        .navigationDestination(isPresented: $openStudio) { WebWorkspacePage(space: space) }
        .task(id: space.key + "|" + (model.userID ?? "")) { await load() }
        .refreshable { await load() }
    }

    private var summary: some View {
        let options = project.object("options")
        let idea = options.string("idea")
        let description = idea.isEmpty ? project.object("script").objects("scenes").first?.string("description") ?? "" : idea
        return VStack(alignment: .leading, spacing: 9) {
            Text("더빙 작품").font(.caption).foregroundStyle(Brand.aqua)
            Text(project.string("title")).font(.title2.bold())
            Text("\(project.string("ownerName")) · \(timeLabel(project.number("duration")))").font(.subheadline)
            if !description.isEmpty { Text(description).font(.subheadline).lineLimit(3) }
            if project.object("sound").string("state") == "ready" {
                Button("배경 음향 · 작업 화면에서 듣기") { openStudio = true }.font(.subheadline).frame(minHeight: 44)
            }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background {
                GeometryReader { bounds in
                    DubbingCover(row: project).frame(width: bounds.size.width, height: bounds.size.height).clipped()
                        .overlay(LinearGradient(colors: [Brand.background.opacity(0.94), Brand.background.opacity(0.67)], startPoint: .leading, endPoint: .trailing))
                }
            }.clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private func roleCard(_ role: [String: Any]) -> some View {
        let claimed = role.flag("claimed")
        let own = role.flag("mine")
        let available = !claimed && mine == nil && project.string("visibility") == "public"
            && ["recruiting", "recording"].contains(project.string("state")) && SiteWorkspace.validKey(role.selfID) && project["revision"] is NSNumber
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "person.crop.square").font(.title2).foregroundStyle(AifectDesign.violet)
                Text(role.string("name")).font(.headline)
                Spacer()
                Text(own ? "내 배역" : claimed ? role.string("participant", fallback: "참여 중") : "참여 가능")
                    .font(.caption).foregroundStyle(own ? AifectDesign.violet : AifectDesign.secondaryText)
            }
            if !role.string("personality").isEmpty { Text(role.string("personality")).font(.subheadline).foregroundStyle(AifectDesign.muted) }
            if available {
                Button {
                    if model.requireLogin() { Task { await claim(role.selfID) } }
                } label: { Text("배역 선택하고 녹음").frame(maxWidth: .infinity) }
                    .buttonStyle(ParityPill(filled: true)).disabled(busy)
                    .accessibilityIdentifier("claim-role-" + role.selfID)
            }
        }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(own ? AifectDesign.violet : AifectDesign.stroke))
    }

    private func lineCard(_ line: DubbingScriptLine) -> some View {
        let row = line.row
        let roleID = row.string("roleId")
        let index = roles.firstIndex { $0.selfID == roleID }
        let palette: [Color] = [0xA7C9FF, 0xF4B1D3, 0x9DE1C7, 0xF1D38F, 0xCFB5F5, 0xFFB6A1].map { Color(aifectHex: $0) }
        let color = palette[(index ?? 0) % palette.count]
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(String(format: "%02d", row.int("order"))).font(.caption.bold())
                Text([row.string("emotion"), row.string("direction")].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption)
                Spacer()
                Text(roleID == mine ? "내 대사" : timeLabel(line.start)).font(.caption.monospacedDigit())
            }.foregroundStyle(AifectDesign.secondaryText)
            HStack(alignment: .top, spacing: 10) {
                Text(index.map { roles[$0].string("name") } ?? roleID).font(.caption.bold()).foregroundStyle(color)
                    .padding(6).background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 8))
                Text(row.string("text")).font(.subheadline)
            }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(roleID == mine ? AifectDesign.violet : AifectDesign.stroke))
    }

    private func load() async {
        let account = model.userID
        do {
            let result = try await API.shared.call(path).object("project")
            try Task.checkCancellation()
            guard model.userID == account else { return }
            guard result.selfID == space.key else { throw URLError(.cannotParseResponse) }
            project = result; error = nil
        } catch { if !Task.isCancelled && model.userID == account { self.error = error.localizedDescription } }
    }

    private func claim(_ role: String) async {
        guard !busy, mine == nil, let account = model.userID, let revision = project["revision"] as? NSNumber else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await API.shared.call(path + "/claims/" + Endpoint.pathID(role), method: "POST", body: ["revision": revision])
            guard !Task.isCancelled, model.userID == account else { return }
            await load()
            if model.userID == account && mine == role { openStudio = true }
        } catch {
            guard !Task.isCancelled, model.userID == account else { return }
            let message = error.localizedDescription
            await load()
            if model.userID == account && mine != role { self.error = message }
        }
    }
}
