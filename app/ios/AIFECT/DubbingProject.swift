import SwiftUI
import PhotosUI
import UIKit

struct DubbingCover: View {
    let row: [String: Any]
    static func posterURL(_ row: [String: Any]) -> URL? {
        let path = row.string("posterUrl")
        guard path.range(of: #"^/api/dubbing/projects/[A-Za-z0-9_-]+/poster(?:\?v=[A-Za-z0-9_-]+)?$"#, options: .regularExpression) != nil else { return nil }
        return try? Endpoint.url(path)
    }
    static func artworkPath(_ row: [String: Any]) -> String {
        if posterURL(row) != nil { return row.string("posterUrl") }
        let genres = row["genres"] as? [String] ?? row.object("options")["genres"] as? [String] ?? []
        let slugs = ["SF":"sf", "이세계물":"isekai", "판타지":"fantasy", "사극":"historical", "로맨스":"romance",
                     "액션":"action", "코미디":"comedy", "첩보":"spy", "공포":"horror", "스릴러":"thriller",
                     "미스터리":"mystery", "일상":"daily", "감동":"moving"]
        let slug = slugs[genres.first ?? ""] ?? "daily"
        return "/assets/dubbing-genres/" + slug + ".webp"
    }
    var body: some View {
        RemoteArtwork(url: try? Endpoint.url(Self.artworkPath(row))) {
            $0.resizable().scaledToFill()
        } placeholder: { Image(systemName: "theatermasks").foregroundStyle(AifectDesign.violet) }
    }
}

struct DubbingWorkStage: View {
    let project: [String: Any]
    @ObservedObject var player: MusicPlayer
    @ObservedObject var audio: DubbingAudio
    @Binding var previewPath: String?
    private var publication: [String: Any] { project.object("recording").object("final") }
    private var ready: Bool { publication.string("state") == "ready" && !publication.string("audioUrl").isEmpty }
    private var background: String {
        let sound = project.object("sound")
        return sound.string("state") == "ready" ? sound.string("audioUrl") : ""
    }
    var body: some View {
        let active = ready && player.dubbingProject?.selfID == project.selfID
        let previewActive = !ready && !background.isEmpty && previewPath == background
        TimelineView(.animation(minimumInterval: 0.15, paused: !(previewActive && audio.previewing))) { _ in
            let at = active ? player.position : previewActive ? audio.preview?.currentTime ?? 0 : 0
            let end = active ? player.duration : previewActive ? audio.preview?.duration ?? project.number("duration") : project.number("duration")
            let cue = active ? publication.objects("captions").first { at >= $0.number("start") && at < $0.number("end") }?.string("text") ?? "" : ""
            WorkListeningStage(template: project["listening_template"] as? String,
                               path: DubbingCover.artworkPath(project), position: at, duration: end,
                               playing: active && player.playing || previewActive && audio.previewing,
                               caption: cue, play: ready || !background.isEmpty ? toggle : nil,
                               seek: ready || !background.isEmpty ? seek : nil)
        }
    }
    private func toggle() {
        if ready { audio.cancel(); player.playDubbing(project); return }
        if previewPath == background, audio.togglePreview() { return }
        loadPreview(at: 0)
    }
    private func seek(_ at: Double) {
        if ready {
            if player.dubbingProject?.selfID != project.selfID { audio.cancel(); player.playDubbing(project) }
            player.seek(at)
        } else if previewPath == background, let preview = audio.preview {
            preview.currentTime = at
        } else { loadPreview(at: at) }
    }
    private func loadPreview(at: Double) {
        guard !background.isEmpty else { return }
        player.pause()
        previewPath = background
        Task {
            do { try await audio.listen(path: background, position: at) }
            catch is CancellationError { }
            catch { audio.error = error.localizedDescription }
        }
    }
}

@MainActor final class DubbingAppearance: ObservableObject {
    @Published var template: String
    @Published var note: String
    @Published var photo: Data?
    @Published var validating = false
    @Published var error: String?
    private let originalTemplate: String
    private let originalNote: String
    init(_ project: [String: Any]) {
        originalTemplate = project.string("listening_template"); originalNote = project.string("listening_description")
        template = originalTemplate; note = originalNote
    }
    private struct Draft: Codable { let template: String; let note: String; let photo: Data? }
    func restore(from folder: URL) {
        guard let bytes = try? Data(contentsOf: folder.appendingPathComponent("listening.json")),
              let draft = try? JSONDecoder().decode(Draft.self, from: bytes) else { return }
        template = draft.template; note = draft.note; photo = draft.photo
    }
    func saveDraft(in folder: URL) throws {
        let data = try JSONEncoder().encode(Draft(template: template, note: note, photo: photo))
        try data.write(to: folder.appendingPathComponent("listening.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func publish(_ path: String, using connection: API? = nil) async throws {
        let api = connection ?? .shared
        guard !validating else { throw APIError(status: 400, message: "사진 확인이 끝난 뒤 다시 시도해 주세요.") }
        var body: [String: Any] = [:]
        if template != originalTemplate && WorkListeningAssets.labels[template] != nil { body["listening_template"] = template }
        if note != originalNote { body["listening_description"] = note }
        if !body.isEmpty {
            let current = try await api.call(path, fresh: true).object("project")
            body["revision"] = current.int("revision")
            _ = try await api.call(path + "/listening", method: "PUT", body: body)
        }
        if let photo {
            _ = try await api.request(path + "/poster", method: "PUT", bytes: photo, type: "image/webp")
        }
    }
}

struct DubbingAppearanceFields: View {
    @ObservedObject var appearance: DubbingAppearance
    let project: [String: Any]
    @State private var choice: PhotosPickerItem?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            WorkListeningStage(template: appearance.template, photo: appearance.photo.flatMap { UIImage(data: $0) },
                               path: DubbingCover.artworkPath(project))
            PhotosPicker(selection: $choice, matching: .images) { Label("커버사진 선택", systemImage: "photo") }
                .buttonStyle(CatalogButtonStyle()).disabled(appearance.validating)
            Text("JPG·PNG·WebP · 5MB 이하").font(.caption).foregroundStyle(AifectDesign.muted)
            WorkListeningChoices(selected: $appearance.template)
            TextField("작품에 남기는 한마디", text: $appearance.note, axis: .vertical)
                .lineLimit(2...5).padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 10))
                .onChange(of: appearance.note) { _, value in
                    if value.count > 500 { appearance.note = String(value.prefix(500)) }
                }
            if appearance.validating { ProgressView("커버사진 확인 중") }
            if let error = appearance.error { Text(error).font(.caption).foregroundStyle(Brand.pink) }
        }.task(id: choice) {
            guard let choice else { return }
            appearance.validating = true; appearance.error = nil
            defer { appearance.validating = false }
            do {
                guard let data = try await choice.loadTransferable(type: Data.self) else {
                    throw APIError(status: 0, message: "사진을 열 수 없습니다.")
                }
                let validated = try WorkListeningAssets.validJPEG(data)
                let webp = try await Task.detached { try ChatImageEncoder.encode(validated) }.value
                try Task.checkCancellation()
                appearance.photo = webp
            } catch is CancellationError { }
            catch { appearance.error = error.localizedDescription }
        }
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
    @State private var pickingRole = false
    @State private var publishMix = false
    @State private var composing = false
    @State private var share = false
    @State private var pickList = false
    @State private var giftRecipient: GiftRecipient?
    @State private var ranking: [[String: Any]] = []
    @State private var giftAllowed: Bool?
    @State private var appearance: DubbingAppearance?
    @State private var enteredDraft = false
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
                    summary
                    if project.string("visibility") == "public" {
                        workActions
                        NativeDubbingComments(project: project, composing: composing).id("dubbing-comments")
                        supportRanking
                    }
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
                    if !final.isEmpty && final.string("state") != "ready" {
                        Text("더빙 합성 상태 · " + final.string("state")).font(.subheadline).foregroundStyle(AifectDesign.secondaryText)
                    }
                    if project.flag("isOwner"), project.string("state") == "complete",
                       !project.object("casting").object("combination").isEmpty, final.isEmpty || final.string("state") == "failed" {
                        Button("완성 오디오 저장·게시") { publishMix = true }
                            .buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(busy)
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
                }

            }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
        }.accessibilityIdentifier("dubbing-project-scroll").navigationTitle("더빙 스튜디오").modifier(FullScreenWorkspace())
        .toolbar {
            Menu {
                Button("새로고침") { Task { await load() } }
                if project.flag("isOwner") {
                    Button("감상 화면 수정") { appearance = DubbingAppearance(project) }
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
        .confirmationDialog("배역 선택", isPresented: $pickingRole, titleVisibility: .visible) {
            ForEach(roles.filter { !$0.flag("claimed") }, id: \.selfID) { role in
                Button(role.string("name")) { Task { await claim(role.selfID) } }
            }
            Button("취소", role: .cancel) { }
        }
        .confirmationDialog("완성 오디오 저장·게시", isPresented: $publishMix, titleVisibility: .visible) {
            Button("동의하고 게시") { Task { await renderMix() } }
            Button("취소", role: .cancel) { }
        } message: { Text("참여자가 허용한 음성을 해당 대본의 공동 작품으로 합성해 공개합니다.") }
        .sheet(isPresented: $share) { WorkMessageShareView(id: space.key, title: project.string("title"), kind: "dubbing") }
        .sheet(isPresented: $pickList) { NavigationStack { PlaylistPickerView(song: workItem, workKind: "dubbing") } }
        .sheet(isPresented: Binding(get: { giftRecipient != nil }, set: { if !$0 { giftRecipient = nil } })) {
            if let giftRecipient { NavigationStack { GiftWalletView(person: giftRecipient, compact: true) } }
        }
        .sheet(isPresented: Binding(get: { appearance != nil }, set: { if !$0 && !busy { appearance = nil } })) {
            if let appearance {
                NavigationStack {
                    ScrollView { DubbingAppearanceFields(appearance: appearance, project: project).padding(16) }
                        .navigationTitle("감상 화면 수정").navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("취소") { self.appearance = nil }.disabled(busy) }
                            ToolbarItem(placement: .confirmationAction) {
                                Button("저장") { Task { await saveAppearance(appearance) } }
                                    .disabled(appearance.validating || busy)
                            }
                        }.interactiveDismissDisabled(busy)
                }
            }
        }
        .task(id: model.walletRevision) { if project.string("visibility") == "public" { await refreshRanking() } }
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
        return VStack(alignment: .leading, spacing: 9) {
            DubbingWorkStage(project: project, player: model.player, audio: audio, previewPath: $previewPath)
            HStack(spacing: 8) {
                Text(project.string("title")).font(.system(size: 22, weight: .bold)).lineLimit(3)
                DubbingBadge(text: "더빙", color: Brand.pink).fixedSize()
            }
            Text("\(project.string("ownerName")) · \(timeLabel(project.number("duration")))").font(.system(size: 13)).foregroundStyle(AifectDesign.secondaryText)
            if !project.string("listening_description").isEmpty { Text(project.string("listening_description")).font(.subheadline) }
            if project.flag("canParticipate") {
                Text("참여 \(roles.filter { $0.flag("claimed") }.count)/\(roles.count)개 배역").font(.caption).foregroundStyle(AifectDesign.muted)
                Button {
                    guard model.requireLogin() else { return }
                    Task {
                        await load()
                        if project.flag("canParticipate") { pickingRole = true }
                        else if error == nil { error = "참여할 수 있는 배역이 없거나 모집이 마감되었습니다." }
                    }
                } label: {
                    Text("참여하기").font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(.white).background(Color(aifectHex: 0x5B438D), in: RoundedRectangle(cornerRadius: 10))
                }.buttonStyle(.plain).disabled(busy)
            }
            let sound = project.object("sound")
            if project.flag("isOwner") && sound.string("state") == "not_started" {
                HStack(spacing: 8) {
                    Button("기본 배경") { requestAction("basic") }.buttonStyle(CatalogButtonStyle(fullWidth: true))
                    Button("효과음 · \(soundCharge) G") { requestAction("sound") }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(!sound.flag("aiAvailable"))
                }.disabled(busy)
            }
            if sound.int("refundedGold") > 0 { Text("\(sound.int("refundedGold")) G 환급").font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }
            if let audioError = audio.error { Text(audioError).font(.caption) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var workItem: Song { Song(["id": space.key, "title": project.string("title")]) }
    private var workActions: some View {
        let liked = project.object("community").flag("liked")
        return HStack(spacing: 3) {
            Button { if model.requireLogin() { Task { await toggleLike(liked) } } } label: {
                SongQuickActionLabel(title: "좋아요", icon: liked ? "heart.fill" : "heart", accent: liked ? Brand.pink : AifectDesign.secondaryText)
            }
            Button { composing.toggle() } label: { SongQuickActionLabel(title: "댓글", icon: "bubble.left") }
            Button { if model.requireLogin() { pickList = true } } label: { SongQuickActionLabel(title: "담기", icon: "plus") }
                .disabled(project.object("recording").object("final").string("state") != "ready")
            if giftAllowed ?? !project.flag("isOwner") {
                Button { if model.requireLogin() { Task { await openGift() } } } label: { SongQuickActionLabel(title: "선물", icon: "gift") }
            }
            Button { if model.requireLogin() { share = true } } label: { SongQuickActionLabel(title: "공유", icon: "square.and.arrow.up") }
        }.buttonStyle(.plain).environment(\.workListeningActions, true).disabled(busy)
    }
    private var supportRanking: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("응원 순위").font(.headline)
            if ranking.isEmpty { Text("아직 작품을 응원한 사람이 없어요.").font(.caption).foregroundStyle(AifectDesign.muted) }
            ForEach(Array(ranking.enumerated()), id: \.offset) { entry in
                Text("\(entry.offset + 1). \(entry.element.string("name")) · \(entry.element.int("score"))점").font(.caption)
            }
            if !project.flag("isOwner") { Button("선물로 마음 전하기") { if model.requireLogin() { Task { await openGift() } } } }
            NavigationLink("무료 실버 받기") { RewardsView() }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
    }
    private var soundCharge: Int { (project.object("sound")["chargeGold"] as? NSNumber)?.intValue ?? (project.object("sound")["priceGold"] as? NSNumber)?.intValue ?? 50 }

    private func roleCard(_ role: [String: Any]) -> some View {
        let claimed = role.flag("claimed")
        let own = role.flag("mine")
        let available = !claimed && mine == nil && project.flag("isOwner") && project.string("visibility") == "public"
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
                    if !role.string("personality").isEmpty { ExpandableDubbingText(text: role.string("personality"), lines: 2) }
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
            let result = try await API.shared.call(path, fresh: true).object("project")
            try Task.checkCancellation()
            guard model.userID == account else { return }
            guard result.selfID == space.key else { throw URLError(.cannotParseResponse) }
            project = result; error = nil
            if project.string("visibility") == "public" { await refreshRanking() }
            let draft = project.object("casting").object("draft")
            if !enteredDraft && !draft.isEmpty && draft.string("committedId").isEmpty && mine != nil {
                enteredDraft = true; openStudio = true
            }
        } catch { if !Task.isCancelled && model.userID == account { self.error = error.localizedDescription } }
    }

    private func claim(_ role: String) async {
        guard !busy, let account = model.userID else { return }
        busy = true; defer { busy = false }
        do {
            let live = try await API.shared.call(path, fresh: true).object("project")
            guard model.userID == account, !Task.isCancelled else { return }
            guard (live.flag("canParticipate") || live.flag("isOwner")),
                  live.objects("roles").contains(where: { $0.selfID == role && !$0.flag("claimed") }) else {
                project = live
                error = "참여할 수 있는 배역이 없거나 모집이 마감되었습니다."
                return
            }
            let casting = live.object("casting")
            if !live.flag("isOwner") && (casting.flag("isRoot") || !casting.object("combination").isEmpty) {
                let root = live.string("rootId")
                let request = performanceRequests[role] ?? UUID().uuidString.lowercased(); performanceRequests[role] = request
                var body: [String: Any] = ["id": request, "roleId": role]
                if root != space.key { body["targetId"] = space.key }
                let started = try await API.shared.call("/api/dubbing/casting/" + Endpoint.pathID(root) + "/start", method: "POST", body: body)
                guard model.userID == account, !Task.isCancelled else { return }
                audio.cancel(); model.player.pause()
                destination = SiteWorkspace(area: "dubbing", key: started.string("projectId"), title: live.string("title"))
                return
            }
            _ = try await API.shared.call(path + "/claims/" + Endpoint.pathID(role), method: "POST", body: ["revision": live.int("revision")])
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
    private func saveAppearance(_ appearance: DubbingAppearance) async {
        guard !busy, model.userID == project.string("ownerId") else { return }
        busy = true; appearance.error = nil; defer { busy = false }
        do { try await appearance.publish(path); await load(); self.appearance = nil }
        catch { if !Task.isCancelled { appearance.error = error.localizedDescription } }
    }
    private func refreshRanking() async {
        do {
            let gifts = try await API.shared.call(path + "/gifts", fresh: true)
            ranking = gifts.objects("support_ranking")
            giftAllowed = gifts.string("gift_block_reason").isEmpty && SiteWorkspace.validKey(gifts.string("recipient_profile_id"))
        }
        catch { }
    }
    private func renderMix() async {
        guard !busy, model.userID == project.string("ownerId") else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await API.shared.call("/api/dubbing/casting/" + Endpoint.pathID(space.key) + "/render", method: "POST", body: ["rightsAccepted": true])
            await load()
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func toggleLike(_ liked: Bool) async {
        guard !busy else { return }
        busy = true; defer { busy = false }
        do {
            let community = try await API.shared.call(path + "/like", method: liked ? "DELETE" : "PUT")
            if !Task.isCancelled { project["community"] = community }
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func openGift() async {
        guard !busy, let account = model.userID else { return }
        busy = true; defer { busy = false }
        do {
            let data = try await API.shared.call(path + "/gifts", fresh: true)
            guard model.userID == account, !Task.isCancelled else { return }
            let recipient = data.string("recipient_profile_id")
            guard data.string("gift_block_reason").isEmpty, SiteWorkspace.validKey(recipient) else {
                error = data.string("gift_block_reason", fallback: "선물을 받을 수 있는 제작자 프로필이 없습니다.")
                return
            }
            giftRecipient = GiftRecipient(id: recipient, name: project.string("ownerName"), dubbingID: space.key)
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct NativeDubbingComments: View {
    @EnvironmentObject private var model: AppModel
    let project: [String: Any]
    var composing = true
    @State private var rows: [[String: Any]] = []
    @FocusState private var focused: Bool
    @State private var text = ""
    @State private var requestID = UUID().uuidString.lowercased()
    @State private var busy = false
    @State private var error: String?
    @State private var next: Int?
    @State private var deleting: String?
    private var path: String { "/api/dubbing/projects/" + Endpoint.pathID(project.selfID) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("댓글").font(.headline)
            if composing { HStack {
                TextField("응원의 말을 남겨주세요", text: $text, axis: .vertical).lineLimit(1...4).font(.system(size: 14)).padding(14).frame(minHeight: 52).background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke)).disabled(busy)
                    .onChange(of: text) { _, value in text = String(value.prefix(2000)); requestID = UUID().uuidString.lowercased() }
                    .focused($focused).task { focused = true }
                Button {
                    guard model.requireLogin() else { return }
                    task {
                        _ = try await API.shared.call(path + "/comments", method: "POST", body: ["id": requestID, "body": text])
                        text = ""; requestID = UUID().uuidString.lowercased(); try await load()
                    }
                } label: { Image(systemName: "paperplane.fill").foregroundStyle(Brand.background).frame(width: 52, height: 52).background(Brand.gradient, in: RoundedRectangle(cornerRadius: 14)) }.buttonStyle(.plain).disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("댓글 등록")
            } }
            if rows.isEmpty && error == nil { Text("아직 댓글이 없어요.").font(.caption).foregroundStyle(AifectDesign.muted) }
            ForEach(rows, id: \.selfID) { row in
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Text(row.string("name")).font(.subheadline.bold()); OfficialAIBadge(person: row); Spacer(); if row.flag("canDelete") { Button("삭제", role: .destructive) { deleting = row.selfID }.font(.caption) } }
                    Text(row.string("body")).font(.subheadline).foregroundStyle(AifectDesign.secondaryText)
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
            }
            if let next { Button("댓글 더 보기") { task { try await load(offset: next) } }.disabled(busy) }
            if let error { Text(error).font(.caption).foregroundStyle(AifectDesign.muted) }
        }.task(id: project.selfID + (model.userID ?? "")) {
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

struct ExpandableDubbingText: View {
    let text: String
    let lines: Int
    @State private var expanded = false
    @State private var availableWidth: CGFloat = 0
    private var overflows: Bool {
        guard availableWidth > 0 else { return false }
        let font = UIFont.systemFont(ofSize: 13)
        let height = (text as NSString).boundingRect(with: CGSize(width: availableWidth, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font], context: nil).height
        return height > font.lineHeight * CGFloat(lines) + 1
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(text).lineLimit(expanded ? nil : lines).frame(maxWidth: .infinity, alignment: .leading)
            if overflows { Button(expanded ? "접기" : "더보기") { expanded.toggle() }.frame(minHeight: 32) }
        }.font(.system(size: 13)).foregroundStyle(AifectDesign.secondaryText)
            // Measuring the changing height here creates a layout feedback loop on navigation.
            .onGeometryChange(for: CGFloat.self) { floor($0.size.width) } action: { width in
                if width > 0 { availableWidth = width }
            }
    }
}

struct DubbingDiscoveryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var section: String
    @State private var rows: [[String: Any]] = []
    @State private var loading = true
    @State private var error: String?
    @State private var genre = "전체"
    @State private var query = ""
    @State private var weekly = true
    @State private var periodChosen = false
    @State private var order = "최신순"
    @State private var limit = 12
    @State private var destination: SiteWorkspace?
    @StateObject private var audio = DubbingAudio()
    @State private var previewID: String?
    @State private var previewTask: Task<Void, Never>?
    init(initialSection: String = "추천") { _section = State(initialValue: initialSection == "내 작업" ? "내 작업" : "추천") }
    private let genres = ["전체", "로맨스", "판타지", "스릴러", "공포", "코미디", "액션", "일상", "사극", "SF"]
    private var filtered: [[String: Any]] { rows.filter { (genre == "전체" || ($0["genres"] as? [String] ?? []).contains(genre)) && (query.isEmpty || $0.string("title").localizedCaseInsensitiveContains(query) || $0.string("ownerName").localizedCaseInsensitiveContains(query)) } }
    private var ranked: [[String: Any]] {
        filtered.filter { weekly ? $0.int("weeklyActiveCount") > 0 : $0["activeCount"] is NSNumber }.sorted {
            let key = weekly ? "weeklyActiveCount" : "activeCount"
            if $0.int(key) != $1.int(key) { return $0.int(key) > $1.int(key) }
            if $0.number("created") != $1.number("created") { return $0.number("created") > $1.number("created") }
            return $0.selfID < $1.selfID
        }
    }
    private var newest: [[String: Any]] {
        if order == "제목순" { return filtered.sorted { $0.string("title") < $1.string("title") } }
        if order == "인기순" { return filtered.sorted { $0.int("activeCount") > $1.int("activeCount") } }
        return filtered.sorted { $0.number("created") > $1.number("created") }
    }
    private var beginners: [[String: Any]] { filtered.filter { $0.flag("beginnerRecommended") || $0.object("options").flag("beginnerRecommended") }.sorted { preferred($0) && !preferred($1) || preferred($0) == preferred($1) && $0.number("created") > $1.number("created") } }
    private func preferred(_ row: [String: Any]) -> Bool { row.int("roleCount") == 2 && (240...300).contains(row.int("duration")) }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 9) {
                if section == "내 작업" {
                    Button { section = "추천" } label: { Label("더빙 홈", systemImage: "chevron.left") }.frame(minHeight: 44)
                } else { StudioSectionTabs(names: ["추천", "인기", "장르", "신규"], selection: $section) }
                if section == "추천" {
                    Button { if model.requireLogin() { destination = SiteWorkspace(area: "dubbing", key: "new", title: "더빙 만들기") } } label: {
                        HStack { Image(systemName: "square.and.pencil"); Text("더빙 만들기").font(.headline); Spacer(); Image(systemName: "chevron.right") }.padding(.horizontal, 16).frame(minHeight: 52).foregroundStyle(Brand.background).background(Brand.gradient, in: RoundedRectangle(cornerRadius: 14))
                    }.buttonStyle(.plain).accessibilityIdentifier("dubbing-create")
                    let originals = rows.filter { $0.flag("isOfficialOriginal") }.sorted { $0.number("created") > $1.number("created") }
                    if !originals.isEmpty { originalShelf(originals) }
                }
                if section == "장르" || section == "인기" { CatalogSearchField(prompt: "작품 제목 또는 창작자 검색", text: $query); genreStrip }
                if loading && rows.isEmpty { ProgressView().frame(maxWidth: .infinity) }
                if let error { RetryCard(message: error) { Task { await load() } } }
                if section == "추천" || section == "인기" {
                    HStack { Label("인기 작품", systemImage: "trophy").font(.headline); Spacer(); Picker("집계 기간", selection: $weekly) { Text("주간").tag(true); Text("전체").tag(false) }.pickerStyle(.segmented).frame(width: 130) }
                    if section == "추천" { posterGrid(Array(ranked.prefix(6)), ranks: true) }
                    else { ForEach(Array(ranked.prefix(limit).enumerated()), id: \.element.selfID) { index, row in workRow(row, rank: index + 1) } }
                    if ranked.isEmpty && !loading { Text(weekly ? "이번 주 집계된 작품이 없어요." : "조건에 맞는 인기 작품이 없어요.").font(.subheadline).foregroundStyle(AifectDesign.muted) }
                }
                if section == "추천" {
                    heading("장르별 작품 찾기", icon: "magnifyingglass", target: "장르"); genreStrip
                    heading("처음이라면 여기부터", icon: "sparkles", target: "장르")
                    posterGrid(Array(beginners.prefix(3)), ranks: false)
                    if beginners.isEmpty && !loading { Text("아직 등록된 초보자 추천 작품이 없어요.").font(.caption).foregroundStyle(AifectDesign.muted) }
                }
                if section != "인기" {
                    HStack {
                        Text(section == "내 작업" ? "내 더빙 작업" : section == "장르" ? "작품 \(newest.count)개" : "신규 참여 작품").font(.headline); Spacer()
                        if section == "추천" { Button("전체보기 ›") { section = "신규" }.font(.caption) }
                        else { Picker("정렬", selection: $order) { ForEach(["최신순", "인기순", "제목순"], id: \.self) { Text($0) } }.font(.caption) }
                    }
                    ForEach(Array(newest.prefix(section == "추천" ? 3 : limit)), id: \.selfID) { workRow($0, rank: nil) }
                }
                if section != "추천", (section == "인기" ? ranked.count : newest.count) > limit { Button("더 많은 작품 보기") { limit += 12 }.frame(maxWidth: .infinity, minHeight: 44) }
                if section == "추천" { Button("내 더빙 작업") { if model.requireLogin() { section = "내 작업" } }.frame(maxWidth: .infinity, minHeight: 44) }
                if section == "내 작업" && model.user == nil { LoginPrompt(title: "로그인하고 내 작업 보기") }
            }.padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 24)
        }.accessibilityIdentifier("dubbing-discovery").refreshable { await load() }
            .task(id: (model.userID ?? "guest") + "|" + (section == "내 작업" ? "mine" : "open")) { rows = []; await load() }
            .onChange(of: section) { _, _ in stopPreview(); query = ""; genre = "전체"; limit = 12 }
            .onChange(of: weekly) { _, _ in periodChosen = true }
            .onDisappear { stopPreview() }
            .navigationDestination(item: $destination) { WorkspacePage(space: $0) }
    }
    private func heading(_ title: String, icon: String, target: String) -> some View { HStack { Label(title, systemImage: icon).font(.headline); Spacer(); Button("전체보기 ›") { section = target }.font(.caption) } }
    private var genreStrip: some View { ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 6) { ForEach(genres, id: \.self) { item in Button(item == "사극" ? "시대극" : item) { genre = item }.buttonStyle(ParityPill(color: AifectDesign.violet, filled: genre == item)) } } } }
    private func metadata(_ row: [String: Any]) -> String { [row.int("roleCount") > 0 ? "\(row.int("roleCount"))인극" : "", row.number("duration") > 0 ? timeLabel(row.number("duration")) : ""].filter { !$0.isEmpty }.joined(separator: " · ") }
    private func open(_ row: [String: Any]) { stopPreview(); destination = SiteWorkspace(area: "dubbing", key: row.selfID, title: row.string("title")) }
    private func originalShelf(_ originals: [[String: Any]]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("AIFECT 오리지널").font(.system(size: 19, weight: .bold))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 9) {
                    ForEach(originals, id: \.selfID) { row in
                        Button { open(row) } label: {
                            Rectangle().fill(Brand.card).aspectRatio(1.55, contentMode: .fit)
                                .overlay { GeometryReader { geo in DubbingCover(row: row).frame(width: geo.size.width, height: geo.size.height).clipped() } }
                                .overlay(LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .center, endPoint: .bottom))
                                .overlay(alignment: .bottomLeading) {
                                    HStack(alignment: .bottom) {
                                        VStack(alignment: .leading, spacing: 4) { Text(((row["genres"] as? [String]) ?? []).joined(separator: " · ") + " · " + metadata(row)).font(.caption); Text(row.string("title")).font(.system(size: 21, weight: .bold)).lineLimit(2) }
                                        Spacer(minLength: 2); Text("더빙하기").font(.system(size: 13, weight: .bold)).foregroundStyle(Brand.background).padding(9).background(Brand.aqua, in: Capsule())
                                    }.padding(12)
                                }.clipShape(RoundedRectangle(cornerRadius: 15)).containerRelativeFrame(.horizontal) { width, _ in min(420, width * 0.86) }
                        }.buttonStyle(.plain).accessibilityIdentifier("dub-feature-" + row.selfID)
                    }
                }.scrollTargetLayout()
            }.scrollTargetBehavior(.viewAligned)
        }
    }
    private func posterGrid(_ entries: [[String: Any]], ranks: Bool) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 10) {
            ForEach(Array(entries.enumerated()), id: \.element.selfID) { index, row in
                Button { open(row) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Rectangle().fill(Brand.card).aspectRatio(0.75, contentMode: .fit).overlay { GeometryReader { geo in DubbingCover(row: row).frame(width: geo.size.width, height: geo.size.height).clipped() } }.clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(alignment: .topLeading) { if ranks { Text("\(index + 1)").font(.caption.bold()).padding(5).background(.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 5)).padding(5) } }
                        Text(row.string("title")).font(.system(size: 14, weight: .semibold)).lineLimit(2)
                        Text(metadata(row)).font(.system(size: 11)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                    }
                }.buttonStyle(.plain)
            }
        }
    }
    private func workRow(_ row: [String: Any], rank: Int?) -> some View {
        HStack(spacing: 7) {
            Button { open(row) } label: {
                HStack(spacing: 7) {
                    if let rank { Text("\(rank)").font(.headline).frame(minWidth: 24).foregroundStyle(rank == 1 ? .yellow : .white) }
                    DubbingCover(row: row).frame(width: rank == nil ? 83 : 73, height: 65).clipped().clipShape(RoundedRectangle(cornerRadius: 9))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(row.string("title")).font(.system(size: 15, weight: .bold)).lineLimit(2)
                        if rank == nil { Text("창작자  " + row.string("ownerName")).font(.system(size: 11)).foregroundStyle(AifectDesign.muted).lineLimit(1) }
                        Text(metadata(row)).font(.system(size: 11)).foregroundStyle(AifectDesign.secondaryText)
                        if row["activeCount"] is NSNumber { Text(row.int("activeCount") > 0 ? "더빙 \(row.int("activeCount"))개 진행 중" : "진행 중인 더빙 없음").font(.system(size: 10)).foregroundStyle(AifectDesign.violet) }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain)
            if rank == nil { Button { preview(row) } label: { Image(systemName: previewID == row.selfID && audio.previewing ? "stop.circle" : "play.circle").font(.title2).frame(width: 44, height: 44) }.accessibilityLabel("배경 미리 듣기") }
            else { Image(systemName: "chevron.right").foregroundStyle(AifectDesign.muted) }
        }.padding(7).background(Brand.card, in: RoundedRectangle(cornerRadius: 15)).overlay(RoundedRectangle(cornerRadius: 15).stroke(AifectDesign.stroke)).accessibilityIdentifier("dubbing-project-" + row.selfID)
    }
    private func stopPreview() { previewTask?.cancel(); audio.cancel(); previewID = nil }
    private func preview(_ row: [String: Any]) {
        let wasPlaying = previewID == row.selfID; stopPreview(); if wasPlaying { return }
        previewID = row.selfID; model.player.pause()
        previewTask = Task { do { try await audio.listen(path: "/api/dubbing/projects/" + Endpoint.pathID(row.selfID) + "/background", file: nil) } catch is CancellationError { } catch { self.error = error.localizedDescription } }
    }
    private func load() async {
        let mine = section == "내 작업", owner = model.userID
        guard !mine || owner != nil else { loading = false; return }
        let endpoint = "/api/dubbing/projects?tab=" + (mine ? "mine" : "open&discovery=1")
        loading = true; error = nil
        if let cached = API.shared.peek(endpoint + "&offset=0") { rows = cached.objects("projects") }
        do {
            var collected: [[String: Any]] = [], offset = 0, seen = Set<String>()
            while true {
                let page = try await API.shared.call(endpoint + "&offset=\(offset)", fresh: true)
                try Task.checkCancellation(); guard owner == model.userID, mine == (section == "내 작업") else { return }
                collected += page.objects("projects").filter { !$0.selfID.isEmpty && seen.insert($0.selfID).inserted }; rows = collected
                guard let next = page["nextOffset"] as? Int, next > offset else { break }; offset = next
            }
            if !periodChosen { weekly = rows.contains { $0.int("weeklyActiveCount") > 0 }; periodChosen = true }
            loading = false
        } catch is CancellationError { } catch {
            guard owner == model.userID else { return }
            if let failure = error as? APIError, [401, 403, 404].contains(failure.status) { rows = [] }
            self.error = error.localizedDescription; loading = false
        }
    }
}

struct CompletedDubbingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var project: [String: Any] = [:]
    @State private var error: String?
    @StateObject private var audio = DubbingAudio()
    @State private var previewPath: String?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if project.isEmpty && error == nil { ProgressView() }
                    if !project.isEmpty {
                        DubbingWorkStage(project: project, player: model.player, audio: audio, previewPath: $previewPath)
                        HStack {
                            Text(project.string("title")).font(.title2.bold())
                            DubbingBadge(text: "더빙", color: Brand.pink)
                        }
                        Text(project.string("ownerName")).font(.subheadline).foregroundStyle(AifectDesign.secondaryText)
                        if !project.string("listening_description").isEmpty { Text(project.string("listening_description")).font(.subheadline) }
                        Text("참여자").font(.headline)
                        ForEach(project.objects("roles").filter { $0.flag("claimed") }, id: \.selfID) { role in CompletedDubbingParticipant(role: role) }
                        if let work = SiteWorkspace(area: "dubbing", key: id, title: project.string("title")) {
                            NavigationLink { DubbingProjectPage(space: work) } label: { Text("작품 열기") }
                                .buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true))
                        }
                    }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                }.padding(20)
            }.navigationTitle("완성된 더빙").navigationBarTitleDisplayMode(.inline).background(Brand.background).toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { dismiss() } } }
                .task(id: model.userID) { await load() }
        }.preferredColorScheme(.dark).presentationDetents([.medium, .large])
    }
    private func load() async { do { let data = try await API.shared.call("/api/dubbing/projects/" + Endpoint.pathID(id)); try Task.checkCancellation(); project = data.object("project"); error = nil } catch is CancellationError { } catch { self.error = error.localizedDescription } }
}
private struct CompletedDubbingParticipant: View {
    let role: [String: Any]
    @State private var publicID = ""
    var body: some View {
        Text(role.string("participant", fallback: "참여자") + (publicID.isEmpty ? "" : " · ID " + publicID)).font(.subheadline)
            .task {
                let id = role.string("participantUserId"); guard SiteWorkspace.validKey(id) else { return }
                if let result = try? await API.shared.call("/api/member-preview/" + Endpoint.pathID(id)) { publicID = result.object("profile").string("public_id") }
            }
    }
}
