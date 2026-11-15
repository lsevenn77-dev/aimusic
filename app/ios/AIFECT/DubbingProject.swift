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
    @Environment(\.dismiss) private var dismiss
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
    @State private var performanceRequests: [String: String] = [:]
    @State private var destination: SiteWorkspace?
    @State private var versionsExpanded = false
    @StateObject private var audio = DubbingAudio()
    @State private var previewPath: String?
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
                    if project.flag("isOwner") && project.string("visibility") == "private" {
                        Button("배역 모집 시작") { requestAction("publish") }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(busy)
                    }
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
                        DubbingControlButton(title: "녹음하기", filled: true, icon: "mic", minHeight: 56) { audio.cancel(); openStudio = true }
                            .disabled(busy || !project.flag("recordingAvailable"))
                    }
                    let final = project.object("recording").object("final")
                    if !final.isEmpty {
                        if final.string("state") == "ready" {
                            Button(audio.previewing && previewPath == final.string("audioUrl") ? "재생 정지" : "완성된 더빙 듣기") { listen(final.string("audioUrl")) }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true))
                        } else { Text("더빙 합성 상태 · " + final.string("state")).font(.subheadline).foregroundStyle(AifectDesign.secondaryText) }
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
                            HStack { Label(expanded ? "대본 접기" : "전체 대본 펼쳐보기", systemImage: "list.bullet"); Image(systemName: expanded ? "chevron.up" : "chevron.down") }
                                .frame(maxWidth: .infinity, minHeight: 48).contentShape(Rectangle())
                        }.buttonStyle(CatalogButtonStyle(fullWidth: true)).accessibilityLabel(expanded ? "대본 접기" : "전체 대본 펼쳐보기")
                    }
                    versions
                    if project.string("visibility") == "public" { NativeDubbingComments(project: project) }
                }

            }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
        }.accessibilityIdentifier("dubbing-project-scroll").navigationTitle("더빙 스튜디오").modifier(FullScreenWorkspace())
        .toolbar {
            Menu {
                Button("새로고침") { Task { await load() } }
                if project.flag("isOwner") {
                    if project.flag("canEdit") { Button("대본 수정") { editing = true } }
                    Button(project.string("visibility") == "private" ? "배역 모집 시작" : "모집 중지") { requestAction(project.string("visibility") == "private" ? "publish" : "unpublish") }
                    Button("작품 삭제", role: .destructive) { requestAction("delete") }
                }
            } label: {
                Image(systemName: "ellipsis").accessibilityLabel("더빙 메뉴")
            }
        }
        .navigationDestination(isPresented: $openStudio) {
            if let owner = model.userID, let role = roles.first(where: { $0.flag("mine") }) { NativeDubbingRecorder(owner: owner, project: project, role: role) }
        }
        .navigationDestination(isPresented: $editing) { if let owner = model.userID { NativeDubbingEditor(owner: owner, existing: project) } }
        .navigationDestination(item: $destination) { DubbingProjectPage(space: $0) }
        .onChange(of: editing) { _, value in if !value { Task { await load() } } }
        .onChange(of: openStudio) { _, value in if !value { Task { await load() } } }
        .onDisappear { audio.cancel() }
        .alert(action == "delete" ? "내 더빙을 삭제할까요?" : action == "publish" ? "배역 모집을 시작할까요?" : action == "unpublish" ? "모집을 중지할까요?" : action == "basic" ? "기본 배경을 준비할까요?" : "효과음을 제작할까요?", isPresented: $confirmAction) {
            Button("취소", role: .cancel) { action = "" }
            Button(action == "publish" ? "동의하고 공개" : "확인", role: action == "delete" ? .destructive : nil) { let requested = action; action = ""; Task { await perform(requested) } }.disabled(busy)
        } message: { Text(action == "delete" ? "삭제하면 이 작품을 다시 열거나 참여할 수 없어요." : action == "publish" ? "대본을 공개하고 다른 사람과 함께 연기할 권한이 있음을 확인합니다." : action == "sound" ? "효과음 제작에 \(soundCharge) G를 사용합니다. 실패하면 서버에서 자동 환급됩니다." : "기존 녹음과 배역 상태는 서버에서 확인합니다.") }
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
            DubbingBadge(text: "더빙 작품", color: AifectDesign.secondaryText)
            Text(project.string("title")).font(.system(size: 22, weight: .bold)).lineLimit(2)
            Text("\(project.string("ownerName")) · \(timeLabel(project.number("duration")))").font(.system(size: 13)).foregroundStyle(AifectDesign.secondaryText)
            if !description.isEmpty { Text(description).font(.system(size: 13)).foregroundStyle(AifectDesign.secondaryText).lineLimit(3) }
            let sound = project.object("sound")
            HStack(spacing: 10) {
                Text("배경 음향").font(.system(size: 13, weight: .semibold))
                if sound.string("state") == "ready" {
                    let playing = audio.previewing && previewPath == path + "/background"
                    Button { listen(path + "/background") } label: { Image(systemName: playing ? "pause.fill" : "play.fill").font(.system(size: 16)).frame(width: 40, height: 40).overlay(Circle().stroke(AifectDesign.violet, lineWidth: 1.5)) }.buttonStyle(.plain).accessibilityLabel(playing ? "배경 음향 정지" : "배경 음향 듣기").accessibilityIdentifier("dubbing-background-toggle")
                    TimelineView(.animation(minimumInterval: 0.2, paused: !playing)) { _ in
                        let time = playing ? audio.preview?.currentTime ?? 0 : 0
                        VStack(alignment: .leading, spacing: 3) {
                            DubbingWave(progress: time / max(1, project.number("duration"))).frame(height: 22)
                            Text(timeLabel(time) + " / " + timeLabel(project.number("duration"))).font(.system(size: 11)).foregroundStyle(AifectDesign.muted).monospacedDigit()
                        }
                    }
                } else {
                    Text(sound.string("state") == "not_started" ? "기본 배경 또는 효과음을 선택해요" : ["failed", "unknown"].contains(sound.string("state")) ? sound.string("error", fallback: "제작 결과를 확인해주세요.") : "음향 제작 중 · \(sound.int("progress"))%")
                        .font(.system(size: 12)).foregroundStyle(AifectDesign.muted).frame(maxWidth: .infinity, alignment: .leading)
                }
            }.padding(.horizontal, 12).padding(.vertical, 10).background(Brand.background.opacity(0.72), in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke))
            if project.flag("isOwner") && sound.string("state") == "not_started" {
                HStack(spacing: 8) {
                    Button("기본 배경") { requestAction("basic") }.buttonStyle(CatalogButtonStyle(fullWidth: true))
                    Button("효과음 · \(soundCharge) G") { requestAction("sound") }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(!sound.flag("aiAvailable"))
                }.disabled(busy)
            }
            if sound.int("refundedGold") > 0 { Text("\(sound.int("refundedGold")) G 환급").font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }
            if let audioError = audio.error { Text(audioError).font(.caption) }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background {
                GeometryReader { bounds in
                    DubbingCover(row: project).frame(width: bounds.size.width, height: bounds.size.height).clipped()
                        .overlay(LinearGradient(colors: [Brand.background.opacity(0.94), Brand.background.opacity(0.67)], startPoint: .leading, endPoint: .trailing))
                }
            }.clipShape(RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke))
    }
    private var soundCharge: Int { (project.object("sound")["chargeGold"] as? NSNumber)?.intValue ?? (project.object("sound")["priceGold"] as? NSNumber)?.intValue ?? 50 }

    private func roleCard(_ role: [String: Any]) -> some View {
        let claimed = role.flag("claimed")
        let own = role.flag("mine")
        let available = !claimed && mine == nil && project.string("visibility") == "public"
            && ["recruiting", "recording"].contains(project.string("state")) && SiteWorkspace.validKey(role.selfID) && project["revision"] is NSNumber
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                DubbingRoleArtwork(name: role.string("name")).frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(role.string("name")).font(.system(size: 17, weight: .bold)).lineLimit(1)
                        if own { DubbingBadge(text: "내 배역", color: AifectDesign.violet) }
                        else { Text(claimed ? role.string("participant", fallback: "참여 중") : "참여 가능").font(.system(size: 11)).foregroundStyle(claimed ? AifectDesign.muted : Brand.aqua) }
                    }
                    if !role.string("personality").isEmpty { Text(role.string("personality")).font(.system(size: 13)).foregroundStyle(AifectDesign.muted).lineLimit(2) }
                }.frame(maxWidth: .infinity, alignment: .leading)
                let canCancel = own && !project.object("recording").objects("roles").contains { $0.string("roleId") == role.selfID }
                let canStart = project.string("visibility") == "public" && project.string("rootId") == space.key && project.object("sound").string("state") == "ready"
                if canCancel || canStart {
                    Menu {
                        if canCancel { Button("배역 취소") { Task { await roleAction(role.selfID, start: false) } } }
                        if canStart { Button("이 배역으로 새 더빙 시작") { Task { await roleAction(role.selfID, start: true) } } }
                    } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                        .disabled(busy).accessibilityLabel(role.string("name") + " 배역 메뉴").accessibilityIdentifier("dubbing-role-menu-" + role.selfID)
                }
            }
            if available {
                Button {
                    if model.requireLogin() { Task { await claim(role.selfID) } }
                } label: { Text("배역 선택하고 녹음").frame(maxWidth: .infinity, minHeight: 44) }
                    .buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(busy)
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
                Text(String(format: "%02d", row.int("order"))).font(.system(size: 12, weight: .bold)).padding(.horizontal, 7).padding(.vertical, 2).background(AifectDesign.raised, in: RoundedRectangle(cornerRadius: 8))
                Text([row.string("emotion"), row.string("direction")].filter { !$0.isEmpty && $0 != "null" }.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                Spacer()
                if roleID == mine { DubbingBadge(text: "내 대사", color: Brand.pink) }
                else { Text(timeLabel(line.start)).font(.system(size: 11).monospacedDigit()).foregroundStyle(AifectDesign.muted).padding(.horizontal, 7).padding(.vertical, 1).overlay(RoundedRectangle(cornerRadius: 10).stroke(AifectDesign.stroke)) }
            }.foregroundStyle(AifectDesign.secondaryText)
            HStack(alignment: .top, spacing: 10) {
                Text(index.map { roles[$0].string("name") } ?? roleID).font(.caption.bold()).foregroundStyle(color)
                    .padding(6).background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 8))
                Text(row.string("text")).font(.system(size: 15)).foregroundStyle(roleID == mine ? Color.white : AifectDesign.secondaryText).padding(.top, 3)
            }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(roleID == mine ? AifectDesign.violet : AifectDesign.stroke, lineWidth: roleID == mine ? 1.5 : 1))
    }

    private func requestAction(_ value: String) { action = value; confirmAction = true }

    private var versions: some View {
        let others = project.objects("versions").filter { $0.selfID != space.key }
        return Group {
            if !others.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("다른 더빙").font(.system(size: 18, weight: .bold)); Spacer()
                        if others.count > 3 { Button(versionsExpanded ? "접기" : "더보기") { versionsExpanded.toggle() }.font(.caption).frame(minHeight: 44) }
                    }
                    ForEach(versionsExpanded ? others : Array(others.prefix(3)), id: \.selfID) { version in
                        if let other = SiteWorkspace(area: "dubbing", key: version.selfID, title: project.string("title")) {
                            NavigationLink { DubbingProjectPage(space: other) } label: {
                                HStack(spacing: 12) {
                                    DubbingCover(row: project).frame(width: 52, height: 52).clipped().clipShape(RoundedRectangle(cornerRadius: 10))
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(version.string("ownerName")).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                                        Text("\(version.int("participants")) / \(version.int("roleCount"))명 참여").font(.caption).foregroundStyle(AifectDesign.muted)
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                    Text(["recruiting":"모집중", "recording":"녹음중", "mixing":"합성중", "complete":"완성", "script_ready":"준비중"][version.string("state")] ?? version.string("state"))
                                        .font(.caption).foregroundStyle(AifectDesign.violet).padding(.horizontal, 10).padding(.vertical, 5)
                                        .overlay(Capsule().stroke(AifectDesign.violet.opacity(0.6)))
                                }.padding(10).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke))
                            }.buttonStyle(.plain)
                        }
                    }
                }.padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }

    private func roleAction(_ role: String, start: Bool) async {
        guard !busy, let owner = model.userID else { return }; busy = true; error = nil; defer { busy = false }
        do {
            if start {
                let request = performanceRequests[role] ?? UUID().uuidString.lowercased(); performanceRequests[role] = request
                let result = try await API.shared.call(path + "/performances", method: "POST", body: ["id": request, "roleId": role])
                guard model.userID == owner, !Task.isCancelled else { return }
                destination = SiteWorkspace(area: "dubbing", key: result.string("id"), title: project.string("title"))
            } else {
                _ = try await API.shared.call(path + "/claims/" + Endpoint.pathID(role), method: "DELETE", body: ["revision": project.int("revision")])
                guard model.userID == owner else { return }; await load()
            }
        } catch { if model.userID == owner, !Task.isCancelled { self.error = error.localizedDescription } }
    }

    private func listen(_ path: String) {
        if audio.previewing && previewPath == path { audio.cancel(); previewPath = nil }
        else { previewPath = path; model.player.pause(); Task { do { try await audio.listen(path: path) } catch is CancellationError { } catch { audio.error = error.localizedDescription } } }
    }

    private func perform(_ action: String) async {
        guard !busy, let owner = model.userID else { return }; busy = true; defer { busy = false }
        do {
            if action == "delete" {
                _ = try await API.shared.call(path, method: "DELETE", body: ["revision": project.int("revision")]); guard owner == model.userID else { return }; dismiss(); return
            } else if action == "publish" || action == "unpublish" {
                _ = try await API.shared.call(path + "/" + action, method: "POST", body: ["revision": project.int("revision"), "rightsAccepted": true])
            } else {
                let sound = project.object("sound")
                _ = try await API.shared.call(path + "/sound", method: "POST", body: ["requestId": soundRequest, "mode": action == "basic" ? "basic" : "ai", "revision": project.int("revision"), "acceptedGold": ((sound["priceGold"] as? NSNumber)?.intValue ?? 50), "acceptedChargeGold": action == "basic" ? 0 : soundCharge])
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
                } label: { Label("좋아요 \(community.int("likes"))", systemImage: community.flag("liked") ? "heart.fill" : "heart").font(.subheadline).foregroundStyle(Brand.pink) }.disabled(busy)
            }
            ForEach(rows, id: \.selfID) { row in
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Text(row.string("name")).font(.subheadline.bold()); OfficialAIBadge(person: row); Spacer(); if row.flag("canDelete") { Button("삭제", role: .destructive) { deleting = row.selfID }.font(.caption) } }
                    Text(row.string("body")).font(.subheadline).foregroundStyle(AifectDesign.secondaryText)
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
            }
            if let next { Button("댓글 더 보기") { task { try await load(offset: next) } }.disabled(busy) }
            HStack {
                TextField("응원의 말을 남겨주세요", text: $text, axis: .vertical).lineLimit(1...4).font(.system(size: 14)).padding(14).frame(minHeight: 52).background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke)).disabled(busy)
                    .onChange(of: text) { _, value in text = String(value.prefix(2000)); requestID = UUID().uuidString.lowercased() }
                Button {
                    guard model.requireLogin() else { return }
                    task {
                        _ = try await API.shared.call(path + "/comments", method: "POST", body: ["id": requestID, "body": text])
                        text = ""; requestID = UUID().uuidString.lowercased(); try await load()
                    }
                } label: { Image(systemName: "paperplane.fill").foregroundStyle(Brand.background).frame(width: 52, height: 52).background(Brand.gradient, in: RoundedRectangle(cornerRadius: 14)) }.buttonStyle(.plain).disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("댓글 등록")
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

private struct DubbingWave: View {
    let progress: Double
    var body: some View {
        Canvas { context, size in
            let gap = size.width / 40
            for index in 0..<40 {
                let height = size.height * (0.25 + 0.75 * ((sin(Double(index) * 1.7) + sin(Double(index) * 0.45) + 2) / 4))
                var line = Path(); line.move(to: CGPoint(x: Double(index) * gap + gap / 2, y: (size.height - height) / 2)); line.addLine(to: CGPoint(x: Double(index) * gap + gap / 2, y: (size.height + height) / 2))
                context.stroke(line, with: .color(AifectDesign.violet.opacity(Double(index) / 40 < progress ? 1 : 0.35)), style: StrokeStyle(lineWidth: gap * 0.5, lineCap: .round))
            }
        }.accessibilityHidden(true)
    }
}

private struct DubbingRoleArtwork: View {
    let name: String
    var body: some View {
        Canvas { context, size in
            let w = size.width, h = size.height, radius = min(w, h) * 0.105
            let fill = GraphicsContext.Shading.linearGradient(Gradient(colors: [Brand.pink, AifectDesign.violet, Brand.aqua]), startPoint: CGPoint(x: w * 0.2, y: h * 0.2), endPoint: CGPoint(x: w * 0.8, y: h * 0.8))
            context.fill(Path(ellipseIn: CGRect(x: w * 0.5 - radius, y: h * 0.36 - radius, width: radius * 2, height: radius * 2)), with: fill)
            var shoulders = Path()
            shoulders.move(to: CGPoint(x: w * 0.27, y: h * 0.75))
            shoulders.addCurve(to: CGPoint(x: w * 0.5, y: h * 0.53), control1: CGPoint(x: w * 0.27, y: h * 0.58), control2: CGPoint(x: w * 0.38, y: h * 0.53))
            shoulders.addCurve(to: CGPoint(x: w * 0.73, y: h * 0.75), control1: CGPoint(x: w * 0.62, y: h * 0.53), control2: CGPoint(x: w * 0.73, y: h * 0.58))
            shoulders.addQuadCurve(to: CGPoint(x: w * 0.27, y: h * 0.75), control: CGPoint(x: w * 0.5, y: h * 0.82))
            shoulders.closeSubpath(); context.fill(shoulders, with: fill)
        }.background(LinearGradient(colors: [Color(aifectHex: 0x36344D), Color(aifectHex: 0x243D47)], startPoint: .topLeading, endPoint: .bottomTrailing)).accessibilityLabel(name + " 기본 프로필")
    }
}
