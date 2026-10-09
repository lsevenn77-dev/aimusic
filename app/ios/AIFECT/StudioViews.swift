import SwiftUI

private struct StudioSelection: Identifiable {
    let id = UUID()
    let song: Song
    let owner: String
    var draft: RecordingDraft?
    var duetParentID: String?
}

struct SingView: View {
    @EnvironmentObject var model: AppModel
    @State private var selection: StudioSelection?
    @State private var drafts: [RecordingDraft] = []
    @State private var showDrafts: Bool
    init(initialShowDrafts: Bool = false) { _showDrafts = State(initialValue: initialShowDrafts) }
    @State private var invitations: [Song] = []
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 12) {
                    Label("YOUR VOICE, YOUR STAGE", systemImage: "waveform").font(.caption.bold()).foregroundStyle(Brand.aqua)
                    Text("이번엔, 당신의 목소리로").font(.title2.bold())
                    Text("반주에 맞춰 부르고, 나만의 녹음을 완성하세요.").font(.subheadline).foregroundStyle(.secondary)
                    Button { showDrafts.toggle(); reloadDrafts() } label: { Label("내 녹음 초안", systemImage: "folder") }.buttonStyle(.bordered).tint(Brand.aqua)
                }.padding(22).frame(maxWidth: .infinity, alignment: .leading).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
                if showDrafts {
                    Text("이 기기에 저장한 녹음").font(.headline)
                    if model.user == nil { Button("로그인하고 초안 보기") { model.showLogin = true } }
                    else if drafts.isEmpty { Text("저장된 녹음이 없어요.").foregroundStyle(.secondary) }
                    ForEach(drafts) { draft in
                        Button {
                            model.player.pause(); selection = StudioSelection(song: draft.song, owner: draft.owner, draft: draft)
                        } label: {
                            HStack { CoverArt(song: draft.song); VStack(alignment: .leading, spacing: 6) { Text(draft.song.title).font(.headline); Text("\(draft.date.formatted(date: .abbreviated, time: .shortened)) · \(timeLabel(draft.length))").font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "slider.horizontal.3") }
                        }.buttonStyle(.plain)
                    }
                }
                if !invitations.isEmpty {
                    Text("함께 부를 듀엣").font(.title3.bold())
                    ForEach(invitations) { partner in
                        HStack { CoverArt(song: partner); Text(partner.title); Spacer(); Button("참여") { Task { await joinDuet(partner) } }.buttonStyle(.bordered) }
                    }
                }
                NavigationLink { CoverRankingView() } label: { Label("커버곡 랭킹", systemImage: "chart.bar.fill").frame(maxWidth: .infinity, alignment: .leading) }
                Text("지금 부를 수 있는 곡").font(.title3.bold())
                if model.singable.isEmpty { ContentUnavailableView("반주를 준비하고 있어요", systemImage: "mic", description: Text("MR이 준비된 곡이 여기에 표시됩니다.")) }
                ForEach(model.singable) { song in
                    HStack(spacing: 12) {
                        CoverArt(song: song)
                        VStack(alignment: .leading, spacing: 5) { Text(song.title).font(.subheadline.bold()).lineLimit(1); Text(song.credit).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                        Spacer()
                        Button("부르기") {
                            guard model.requireLogin(), let owner = model.userID else { return }
                            model.player.pause(); selection = StudioSelection(song: song, owner: owner)
                        }.buttonStyle(.bordered).tint(Brand.aqua)
                    }
                }
            }.padding(20)
        }.fullScreenCover(item: $selection, onDismiss: reloadDrafts) { target in
            StudioView(studio: RecordingStudio(song: target.song, owner: target.owner, draft: target.draft, duetParentID: target.duetParentID))
        }.onChange(of: model.userID) { _, _ in reloadDrafts() }
        .task { reloadDrafts(); invitations = (try? await API.shared.call("/api/duets").songs()) ?? [] }
        .refreshable { await model.refresh(); reloadDrafts(); invitations = (try? await API.shared.call("/api/duets").songs()) ?? [] }
    }
    private func joinDuet(_ partner: Song) async {
        guard model.requireLogin(), let owner = model.userID else { return }
        do {
            let data = try await API.shared.call("/api/duets/\(Endpoint.pathID(partner.id))")
            guard model.userID == owner else { return }
            let song = Song(data.object("track"))
            model.player.pause(); selection = StudioSelection(song: song, owner: owner, duetParentID: partner.id)
        } catch { model.handle(error) }
    }
    private func reloadDrafts() { drafts = model.userID.map { RecordingDraft.list(owner: $0) } ?? [] }
}

struct StudioView: View {
    @EnvironmentObject var model: AppModel
    @StateObject var studio: RecordingStudio
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var confirmClose = false
    @State private var ownVoice = false
    @State private var rights = false
    @State private var duetConsent = false
    @State private var description = ""
    @State private var publishing = false
    @State private var published = false
    @State private var confirmPublish = false
    @State private var showDuetEditor = false
    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 24) {
                        HStack(spacing: 16) { CoverArt(song: studio.song, size: 72); VStack(alignment: .leading, spacing: 6) { Text(studio.song.title).font(.title3.bold()); Text(studio.song.credit).foregroundStyle(.secondary) }; Spacer() }
                        Text(studio.draft == nil ? "이어폰을 연결하면 반주가 마이크에 섞이는 것을 줄일 수 있어요." : "초안이 이 기기에 저장되어 있습니다.").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                        if studio.processing { ProgressView("오디오 준비 중…").padding() }
                        if let error = studio.error {
                            RetryCard(message: error) { Task { if !studio.ready { await studio.prepare() } else { studio.error = nil } } }
                        }
                        if studio.draft == nil {
                            if !studio.recording && studio.duetParentID == nil {
                                Toggle("듀엣 첫 파트로 녹음", isOn: $studio.duetFirst)
                                if studio.duetFirst {
                                    Button("듀엣 파트 나누기") { showDuetEditor = true }.buttonStyle(.bordered)
                                    if let issue = studio.guideIssue { Text(issue).font(.caption).foregroundStyle(Brand.pink) }
                                }
                            }
                            if studio.duetParentID != nil { Text("듀엣 참여 · 파트너의 안내에 맞춰 내 파트를 불러주세요.").foregroundStyle(Brand.aqua) }
                            VStack(alignment: .leading, spacing: 10) {
                                Toggle("모니터링", isOn: $studio.monitorEnabled).tint(Brand.pink)
                                Text("청음 음량 · \(Int(studio.monitorVolume * 100))%").font(.caption)
                                Slider(value: $studio.monitorVolume, in: 0...1).tint(Brand.pink).accessibilityLabel("청음 음량")
                                Text(studio.monitorMessage ?? "이어폰 연결 시 내 목소리를 들을 수 있어요. 연결 방식에 따라 지연이 생길 수 있습니다.").font(.caption).foregroundStyle(.secondary)
                            }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 22))
                            VStack(spacing: 16) {
                                Text(timeLabel(studio.elapsed)).font(.system(size: 48, weight: .light, design: .monospaced)).foregroundStyle(Brand.aqua)
                                ProgressView(value: Double(studio.level), total: 1).tint(Brand.aqua).accessibilityLabel("마이크 입력 레벨")
                                if studio.words.isEmpty { Text("음악에 맞춰 자유롭게 불러보세요").foregroundStyle(.secondary).padding(24) }
                                else {
                                    let index = studio.words.lastIndex(where: { $0.0 <= studio.elapsed }) ?? 0
                                    ForEach(max(0, index - 1)...min(studio.words.count - 1, index + 2), id: \.self) { i in
                                        Text(lyricText(i)).font(i == index ? .title3.bold() : .body).foregroundStyle(i == index ? lyricColor(i) : AifectDesign.muted).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                                    }
                                    if studio.duetMode == "lyrics", let next = studio.nextOwnLine {
                                        Label("다음 내 차례 · \(timeLabel(studio.words[next].0)) · \(studio.words[next].1)", systemImage: "mic.fill").font(.caption).foregroundStyle(Brand.pink)

                                    }
                                }
                                if studio.countdown > 0 {
                                    Text("\(studio.countdown)").font(.system(size: 64, weight: .bold)).foregroundStyle(Brand.pink)
                                    Button("시작 취소") { studio.cancelCountdown() }
                                } else if studio.recording {
                                    HStack {
                                        Button(studio.paused ? "이어 부르기" : "일시정지") { studio.togglePause() }.buttonStyle(.bordered)
                                        Button("녹음 마치기") { studio.finish() }.buttonStyle(.borderedProminent).tint(Brand.pink)
                                    }
                                } else {
                                    Button { Task { await studio.start() } } label: { Label("녹음 시작", systemImage: "record.circle").font(.headline).padding(10) }.buttonStyle(.borderedProminent).tint(Brand.pink).foregroundStyle(.black).disabled(!studio.ready || studio.processing || studio.guideIssue != nil)
                                }
                            }.padding(22).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
                        } else {
                            VStack(alignment: .leading, spacing: 20) {
                                Label("녹음 완료 · \(timeLabel(studio.elapsed))", systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(Brand.aqua)
                                RecordingWaveform(samples: studio.waveform)
                                Button("다시 부르기 · 현재 녹음은 초안에 보관") { Task { published = false; ownVoice = false; rights = false; duetConsent = false; await studio.newTake() } }.disabled(studio.processing || publishing)
                                Picker("목소리 프리셋", selection: Binding(get: { studio.effects.preset }, set: { studio.selectPreset($0) })) { ForEach(VocalSettings.presets, id: \.0) { item in Text(item.1).tag(item.0) } }.pickerStyle(.segmented)
                                Picker("잡음 감소", selection: $studio.effects.noise) { Text("끔").tag(0); Text("약하게").tag(1); Text("보통").tag(2); Text("강하게").tag(3); Text("최대").tag(4) }
                                Text("에코 · \(Int(studio.effects.echo))%").font(.subheadline)
                                Slider(value: $studio.effects.echo, in: 0...65)
                                Text("음색 보정").font(.subheadline)
                                Slider(value: $studio.effects.tone, in: 0...1)
                                Text("내 목소리").font(.subheadline)
                                Slider(value: $studio.voiceVolume, in: 0...1.5).accessibilityLabel("목소리 음량")
                                Text("반주").font(.subheadline)
                                Slider(value: $studio.backingVolume, in: 0...1).accessibilityLabel("반주 음량")
                                Text("룸 리버브 · \(Int(studio.reverb))%").font(.subheadline)
                                Slider(value: $studio.reverb, in: 0...100).accessibilityLabel("리버브")
                                Text("룸 크기 · \(Int(studio.effects.size * 100))%").font(.subheadline)
                                Slider(value: $studio.effects.size, in: 0...1).accessibilityLabel("룸 크기")
                                Text("목소리 싱크 · \(Int(studio.sync * 1000)) ms").font(.subheadline)
                                Slider(value: $studio.sync, in: -0.3...0.8, step: 0.005).accessibilityLabel("목소리 싱크")
                                Text("양수는 목소리를 늦추고, 음수는 앞당깁니다. 이어폰과 기기에 따라 직접 조절해주세요.").font(.caption).foregroundStyle(.secondary)
                                HStack {
                                    Button(studio.previewing ? "재생 중지" : "설정 적용해 듣기") { if studio.previewing { studio.stopPreview() } else { Task { await studio.mix(preview: true) } } }.buttonStyle(.bordered)
                                    Button("WAV 만들기") { Task { await studio.mix(preview: false) } }.buttonStyle(.borderedProminent)
                                }.disabled(studio.processing)
                                if let url = studio.exportURL {
                                    ShareLink(item: url) { Label("완성한 WAV 저장 / 공유", systemImage: "square.and.arrow.up") }
                                    Text("마지막으로 합성한 설정의 파일입니다. 설정을 바꿨다면 WAV를 다시 만들어주세요.").font(.caption).foregroundStyle(.secondary)
                                }
                            }.padding(22).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
                            VStack(alignment: .leading, spacing: 16) {
                                Text("내 커버곡 게시").font(.headline)
                                if published {
                                    Label("서버에 제출했습니다", systemImage: "checkmark.circle.fill").foregroundStyle(Brand.aqua)
                                    Text("음원 처리가 완료되면 공개됩니다. 초안과 원본 녹음은 기기에 남아 있습니다.").font(.subheadline).foregroundStyle(.secondary)
                                } else {
                                    TextField("이 녹음에 대한 소개", text: $description, axis: .vertical).textFieldStyle(.roundedBorder)
                                    Toggle("내가 직접 부른 녹음입니다", isOn: $ownVoice)
                                    Toggle("공개할 권리가 있으며 게시에 동의합니다", isOn: $rights)
                                    if studio.draft?.duetFirst == true { Toggle("다른 사람이 이 녹음에 목소리를 더하는 데 동의합니다", isOn: $duetConsent) }
                                    Text("현재 음량·리버브·싱크 설정으로 합성해 공개합니다. 재시도할 때는 처음 제출한 파일을 사용합니다.").font(.caption).foregroundStyle(.secondary)
                                    Button(publishing ? "제출 중…" : "커버곡 공개하기") { confirmPublish = true }
                                        .buttonStyle(.borderedProminent).disabled(!ownVoice || !rights || (studio.draft?.duetFirst == true && !duetConsent) || publishing || studio.processing)
                                }
                            }.padding(22).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
                        }
                    }.padding(20)
                }
            }.background(Brand.background).navigationTitle(studio.draft == nil ? "녹음 스튜디오" : "녹음 편집").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { if studio.recording { confirmClose = true } else { studio.shutdown(); dismiss() } }.disabled(studio.processing || publishing) } }
                .confirmationDialog("녹음을 마치고 초안으로 저장할까요?", isPresented: $confirmClose, titleVisibility: .visible) {
                    Button("초안 저장 후 닫기") { studio.shutdown(); dismiss() }
                }
                .sheet(isPresented: $showDuetEditor) { DuetPartEditor(studio: studio) }
                .task { ListeningAds.shared.studioOpen = true; await studio.prepare() }
                .onChange(of: scenePhase) { _, phase in if phase != .active { studio.shutdown() } }
                .onDisappear { studio.shutdown(); ListeningAds.shared.studioOpen = false }
                .interactiveDismissDisabled(studio.recording || studio.processing || publishing)
                .confirmationDialog("이 녹음을 AIFECT에 공개할까요?", isPresented: $confirmPublish, titleVisibility: .visible) {
                    Button("합성 후 공개하기") { Task { await publish() } }
                }
        }
    }
    private func lyricText(_ index: Int) -> String {
        let line = studio.words[index].1
        guard studio.duetFirst || studio.duetParentID != nil, studio.duetLines.indices.contains(index) else { return line }
        guard studio.duetMode == "lyrics" else { return line }
        return "[\(DuetGuide.title(part: studio.duetLines[index], ownPart: studio.ownPart))] " + line
    }
    private func lyricColor(_ index: Int) -> Color {
        guard studio.duetMode == "lyrics", studio.duetLines.indices.contains(index) else { return Brand.pink }
        return studio.duetLines[index] == studio.ownPart || studio.duetLines[index] == "both" ? Brand.pink : Brand.aqua
    }
    private func publish() async {
        publishing = true; defer { publishing = false }
        await studio.mix(preview: false)
        guard let draft = studio.draft, let audio = studio.exportURL, studio.error == nil else { return }
        do {
            let id = try await CoverPublisher.submit(draft: draft, audio: audio, description: description, ownVoice: ownVoice, rights: rights, duetConsent: duetConsent)
            published = true; studio.shutdown(); model.player.pause()
            ListeningAds.shared.studioOpen = false
            await ListeningAds.shared.uploadCompleted(id: id)
            ListeningAds.shared.studioOpen = true
        } catch { studio.error = error.localizedDescription }
    }

}

struct DuetPartEditor: View {
    @ObservedObject var studio: RecordingStudio
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Picker("파트 지정 방식", selection: $studio.duetMode) { Text("자유롭게 부르기").tag("free"); Text("가사별 지정").tag("lyrics") }.pickerStyle(.segmented)
                if studio.duetMode == "lyrics" {
                    Text("각 줄에서 부를 사람을 선택하세요. 같은 버튼을 다시 누르면 선택을 해제합니다.").font(.caption).foregroundStyle(.secondary)
                    Button("남은 줄을 파트너로 지정") { studio.fillUnassignedDuetLines() }
                    ForEach(studio.words.indices, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 10) {
                            Text("\(timeLabel(studio.words[index].0))  \(studio.words[index].1)")
                            HStack { ForEach(["A", "B", "both"], id: \.self) { part in
                                let selected = studio.duetLines.indices.contains(index) && studio.duetLines[index] == part
                                Button { studio.setDuetPart(part, at: index) } label: {
                                    Text(DuetGuide.title(part: part, ownPart: "A")).font(.caption.bold()).frame(maxWidth: .infinity, minHeight: 44).background(selected ? (part == "B" ? Brand.aqua : Brand.pink) : AifectDesign.raised, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(selected ? Color.black : AifectDesign.text)
                                }.buttonStyle(.plain).accessibilityLabel("\(index + 1)번째 줄 \(DuetGuide.title(part: part, ownPart: "A"))").accessibilityAddTraits(selected ? .isSelected : [])
                            } }
                        }.padding(.vertical, 6)
                    }
                    Text("\(studio.duetLines.filter { !$0.isEmpty }.count) / \(studio.words.count)줄 지정").font(.caption)
                    if let issue = studio.guideIssue { Text(issue).foregroundStyle(Brand.pink) }
                } else { Text("자유롭게 파트를 나눠 불러주세요. 참여자는 먼저 녹음한 목소리를 들으며 이어 부를 수 있습니다.").foregroundStyle(.secondary) }
            }.navigationTitle("듀엣 파트 나누기").navigationBarTitleDisplayMode(.inline).toolbar { Button("완료") { dismiss() } }.tint(Brand.pink)
        }.interactiveDismissDisabled(false)
    }
}
struct RecordingWaveform: View {
    let samples: [Float]
    var body: some View {
        GeometryReader { geo in
            Path { path in
                for (index, sample) in samples.enumerated() {
                    let x = geo.size.width * CGFloat(index) / CGFloat(max(1, samples.count - 1))
                    let height = max(2, CGFloat(sample) * geo.size.height * 0.45)
                    path.move(to: CGPoint(x: x, y: geo.size.height / 2 - height)); path.addLine(to: CGPoint(x: x, y: geo.size.height / 2 + height))
                }
            }.stroke(Brand.pink, style: StrokeStyle(lineWidth: 2, lineCap: .round))
        }.frame(height: 54).accessibilityLabel("녹음한 목소리 파형")
    }
}
