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
    @State private var editing = false
    @State private var action = ""
    @State private var confirmAction = false
    @State private var soundRequest = UUID().uuidString.lowercased()
    @StateObject private var audio = DubbingAudio()
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
                        Button { audio.cancel(); openStudio = true } label: { Label("녹음하기", systemImage: "mic").frame(maxWidth: .infinity) }
                            .buttonStyle(ParityPill(filled: true)).disabled(busy || !project.flag("recordingAvailable"))
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
                    if project.string("visibility") == "public" { NativeDubbingComments(project: project) }
                    ForEach(project.objects("versions").filter { $0.selfID != space.key }, id: \.selfID) { version in
                        if let other = SiteWorkspace(area: "dubbing", key: version.selfID, title: version.string("title", fallback: "다른 더빙")) {
                            NavigationLink { DubbingProjectPage(space: other) } label: { Label(other.title, systemImage: "waveform") }
                        }
                    }
                }

            }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
        }.accessibilityIdentifier("dubbing-project-scroll").navigationTitle("더빙 스튜디오").modifier(FullScreenWorkspace())
        .toolbar {
            Menu {
                Button("새로고침") { Task { await load() } }
                if project.flag("isOwner") {
                    if project.flag("canEdit") { Button("대본 수정") { editing = true } }
                    Button(project.string("visibility") == "private" ? "배역 모집 시작" : "모집 중지") { requestAction(project.string("visibility") == "private" ? "publish" : "unpublish") }
                }
            } label: {
                Image(systemName: "ellipsis").accessibilityLabel("더빙 메뉴")
            }
        }
        .navigationDestination(isPresented: $openStudio) {
            if let owner = model.userID, let role = roles.first(where: { $0.flag("mine") }) { NativeDubbingRecorder(owner: owner, project: project, role: role) }
        }
        .navigationDestination(isPresented: $editing) { if let owner = model.userID { NativeDubbingEditor(owner: owner, existing: project) } }
        .onChange(of: editing) { _, value in if !value { Task { await load() } } }
        .onChange(of: openStudio) { _, value in if !value { Task { await load() } } }
        .onDisappear { audio.cancel() }
        .alert(action == "publish" ? "배역 모집을 시작할까요?" : action == "unpublish" ? "모집을 중지할까요?" : action == "basic" ? "기본 배경을 준비할까요?" : "효과음을 제작할까요?", isPresented: $confirmAction) {
            Button("취소", role: .cancel) { action = "" }
            Button(action == "publish" ? "동의하고 공개" : "확인") { let requested = action; action = ""; Task { await perform(requested) } }
        } message: { Text(action == "publish" ? "대본을 공개하고 다른 사람과 함께 연기할 권한이 있음을 확인합니다." : action == "sound" ? "효과음 제작에 \(((project.object("sound")["chargeGold"] as? NSNumber)?.intValue ?? 50)) G를 사용합니다. 실패하면 서버에서 자동 환급됩니다." : "기존 녹음과 배역 상태는 서버에서 확인합니다.") }
        .task(id: space.key + "|" + (model.userID ?? "")) { await load() }
        .task(id: project.object("sound").string("state")) {
            while ["queued", "planning", "generating", "mixing"].contains(project.object("sound").string("state")) {
                do { try await Task.sleep(for: .seconds(5)); try Task.checkCancellation() } catch { return }
                await load(); if error != nil { return }
            }
        }
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
            let soundState = project.object("sound").string("state")
            if ["queued", "planning", "generating", "mixing"].contains(soundState) { Label("배경 음향을 준비하고 있어요", systemImage: "waveform").font(.caption) }
            if soundState == "failed" { Text(project.object("sound").string("error", fallback: "음향 준비에 실패했어요.")).font(.caption) }
            if soundState == "ready" {
                Button(audio.previewing ? "재생 정지" : "배경 음향 듣기") { listen(path + "/background") }.font(.subheadline).frame(minHeight: 44)
            }
            let sound = project.object("sound")
            if project.flag("isOwner") && sound.string("state") == "not_started" {
                HStack {
                    Button("기본 배경") { requestAction("basic") }.buttonStyle(CatalogButtonStyle())
                    Button("효과음 · \(((sound["chargeGold"] as? NSNumber)?.intValue ?? 50)) G") { requestAction("sound") }.buttonStyle(CatalogButtonStyle(filled: true)).disabled(!sound.flag("aiAvailable"))
                }.disabled(busy)
            }
            let final = project.object("recording").object("final")
            if final.string("state") == "ready" { Button("완성된 더빙 듣기") { listen(final.string("audioUrl")) } }
            if let audioError = audio.error { Text(audioError).font(.caption) }
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

    private func requestAction(_ value: String) { action = value; confirmAction = true }

    private func listen(_ path: String) {
        if audio.previewing { audio.cancel() }
        else { model.player.pause(); Task { do { try await audio.listen(path: path) } catch is CancellationError { } catch { audio.error = error.localizedDescription } } }
    }

    private func perform(_ action: String) async {
        guard !busy, model.userID != nil else { return }; busy = true; defer { busy = false }
        do {
            if action == "publish" || action == "unpublish" {
                _ = try await API.shared.call(path + "/" + action, method: "POST", body: ["revision": project.int("revision"), "rightsAccepted": true])
            } else {
                let sound = project.object("sound")
                _ = try await API.shared.call(path + "/sound", method: "POST", body: ["requestId": soundRequest, "mode": action == "basic" ? "basic" : "ai", "revision": project.int("revision"), "acceptedGold": ((sound["priceGold"] as? NSNumber)?.intValue ?? 50), "acceptedChargeGold": action == "basic" ? 0 : ((sound["chargeGold"] as? NSNumber)?.intValue ?? 50)])
            }
            await load()
        } catch { self.error = error.localizedDescription }
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

struct NativeDubbingComments: View {
    @EnvironmentObject private var model: AppModel
    let project: [String: Any]
    @State private var rows: [[String: Any]] = []
    @State private var community: [String: Any] = [:]
    @State private var text = ""
    @State private var requestID = UUID().uuidString.lowercased()
    @State private var busy = false
    @State private var error: String?
    @State private var next: Int?
    @State private var deleting: String?
    private var path: String { "/api/dubbing/projects/" + Endpoint.pathID(project.selfID) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("함께 나누는 이야기").font(.headline); Spacer()
                Button {
                    guard model.requireLogin() else { return }
                    task { community = try await API.shared.call(path + "/like", method: community.flag("liked") ? "DELETE" : "PUT") }
                } label: { Label("\(community.int("likes"))", systemImage: community.flag("liked") ? "heart.fill" : "heart").foregroundStyle(Brand.pink) }.disabled(busy)
            }
            ForEach(rows, id: \.selfID) { row in
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Text(row.string("name")).font(.subheadline.bold()); Spacer(); if row.flag("canDelete") { Button("삭제", role: .destructive) { deleting = row.selfID }.font(.caption) } }
                    Text(row.string("body")).font(.subheadline).foregroundStyle(AifectDesign.secondaryText)
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
            }
            if let next { Button("댓글 더 보기") { task { try await load(offset: next) } }.disabled(busy) }
            HStack {
                TextField("응원의 말을 남겨주세요", text: $text, axis: .vertical).lineLimit(1...4).textFieldStyle(.roundedBorder).disabled(busy)
                    .onChange(of: text) { _, value in text = String(value.prefix(2000)); requestID = UUID().uuidString.lowercased() }
                Button {
                    guard model.requireLogin() else { return }
                    task {
                        _ = try await API.shared.call(path + "/comments", method: "POST", body: ["id": requestID, "body": text])
                        text = ""; requestID = UUID().uuidString.lowercased(); try await load()
                    }
                } label: { Image(systemName: "paperplane.fill").frame(width: 44, height: 44) }.disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("댓글 등록")
            }
            if let error { Text(error).font(.caption).foregroundStyle(AifectDesign.muted) }
        }.task(id: project.selfID + (model.userID ?? "")) {
            community = project.object("community")
            do { try await load() } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }.alert("댓글을 삭제할까요?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            let id = deleting
            Button("삭제", role: .destructive) { if let id { task { _ = try await API.shared.call(path + "/comments/" + Endpoint.pathID(id), method: "DELETE"); try await load() } } }
            Button("취소", role: .cancel) { }
        }
    }
    private func load(offset: Int = 0) async throws {
        let result = try await API.shared.call(path + "/comments?offset=\(offset)")
        try Task.checkCancellation()
        rows = offset == 0 ? result.objects("comments") : rows + result.objects("comments").filter { new in !rows.contains { $0.selfID == new.selfID } }
        next = (result["nextOffset"] as? NSNumber)?.intValue
    }
    private func task(_ work: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }; busy = true; error = nil
        Task { defer { busy = false }; do { try await work() } catch { if !Task.isCancelled { self.error = error.localizedDescription } } }
    }
}
