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
    @State private var query = ""
    @State private var genre = "전체"
    private var tracks: [Song] { model.singable.filter { (genre == "전체" || $0.genre == genre) && (query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.credit.localizedCaseInsensitiveContains(query)) } }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                PageHeading(title: "목소리를 발견하는 곳", subtitle: "듣다 보면, 나도 부르고 싶어지는 순간")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        NavigationLink { CoverRankingView(initialPeriod: "week") } label: { Label("커버 랭킹", systemImage: "trophy") }.buttonStyle(ParityPill(color: Brand.pink))
                        NavigationLink { RecordingDraftsView() } label: { Label("초안", systemImage: "pencil") }.buttonStyle(ParityPill(color: Brand.pink))
                        NavigationLink("내 커버곡") { MyMusicView() }.buttonStyle(ParityPill(color: Brand.pink))
                    }
                }
                if showDrafts {
                    MusicSectionHeading(title: "이 기기에 저장한 녹음")
                    if model.user == nil { Button("로그인하고 초안 보기") { model.showLogin = true } }
                    else if drafts.isEmpty { Text("저장된 녹음이 없어요.").foregroundStyle(AifectDesign.muted) }
                    ForEach(drafts) { draft in
                        Button { model.player.pause(); selection = StudioSelection(song: draft.song, owner: draft.owner, draft: draft) } label: {
                            HStack { CoverArt(song: draft.song); VStack(alignment: .leading, spacing: 6) { Text(draft.song.title).font(.headline); Text("\(draft.date.formatted(date: .abbreviated, time: .shortened)) · \(timeLabel(draft.length))").font(.caption).foregroundStyle(AifectDesign.muted) }; Spacer(); Image(systemName: "slider.horizontal.3") }
                        }.buttonStyle(.plain)
                    }
                }
                CoverRankHighlights()
                HStack {
                    NavigationLink("솔로") { MusicCollectionView(title: "솔로 커버", path: "/api/community?kind=cover&cover_mode=solo") }.buttonStyle(ParityPill(color: Brand.pink))
                    NavigationLink("듀엣") { MusicCollectionView(title: "듀엣 커버", path: "/api/community?kind=cover&cover_mode=duet") }.buttonStyle(ParityPill(color: Brand.pink))
                }
                MusicSectionHeading(title: "참여를 기다리는 듀엣", subtitle: "먼저 녹음한 목소리를 불러와 빈 파트를 불러요")
                if invitations.isEmpty { Text("아직 대기 중인 듀엣이 없어요. 아래 곡에서 첫 파트를 남겨보세요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }
                ForEach(invitations) { partner in
                    VStack(alignment: .leading, spacing: 12) { Text(partner.title).font(.headline); Text("\(partner.creatorName) · 먼저 녹음한 목소리").font(.system(size: 13)).foregroundStyle(AifectDesign.muted); Button("듀엣 참여") { Task { await joinDuet(partner) } }.buttonStyle(ParityPill(color: Brand.pink, filled: true)) }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                }
                MusicSectionHeading(title: "나의 다음 무대", subtitle: "장르를 고르고, 다른 목소리도 먼저 들어봐요")
                HStack { Image(systemName: "magnifyingglass"); TextField("부르고 싶은 노래 찾기", text: $query) }.padding(16).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke)).font(.system(size: 15))
                ParityChips(items: ["전체", "K-POP", "Ballad", "R&B", "Hip-Hop", "Rock", "EDM", "City Pop", "OST", "Instrumental"], selection: $genre)
                Text("에코 · 룸 · 내 목소리 듣기").font(.system(size: 12)).foregroundStyle(Brand.aqua)
                Text("유선·USB 이어폰으로 들으며 불러보세요.").font(.system(size: 12)).foregroundStyle(AifectDesign.muted).padding(.bottom, 4)
                ForEach(tracks) { song in
                    VStack(spacing: 10) {
                        HStack(spacing: 14) { CoverArt(song: song, size: 48); VStack(alignment: .leading, spacing: 5) { Text(song.title).font(.system(size: 17, weight: .semibold)).lineLimit(2); Text("\(song.credit) · \(song.genre)").font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }.frame(maxWidth: .infinity, alignment: .leading) }
                        HStack(spacing: 8) {
                            NavigationLink { CoverRankingView(originalID: song.id) } label: { Label("커버 랭킹 · \(song.covers ?? 0)", systemImage: "trophy").frame(maxWidth: .infinity) }.buttonStyle(ParityPill(color: Brand.pink))
                            SingSongButton(song: song).frame(maxWidth: .infinity)
                        }
                    }.padding(10).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                }
                if tracks.isEmpty { ContentUnavailableView("조건에 맞는 곡이 없어요", systemImage: "mic", description: Text("다른 장르나 제목으로 찾아보세요.")) }
                if !model.feed.isEmpty { MusicShelf(title: "새로 올라온 목소리", songs: Array(model.feed.filter(\.isCover).prefix(10))) }
            }.padding(.horizontal, 22).padding(.bottom, 32)
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
    @State private var draftSaved = false
    @State private var publishing = false
    @State private var published = false
    @State private var confirmPublish = false
    @State private var showDuetEditor = false
    @State private var showLyrics = false
    @State private var uploadProgress: Double? = nil
    @State private var publishTask: Task<Void, Never>?
    @FocusState private var editingDescription: Bool
    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 24) {
                        HStack(spacing: 16) { CoverArt(song: studio.song, size: 72); VStack(alignment: .leading, spacing: 6) { Text(studio.song.title).font(.title3.bold()); Text(studio.song.credit).foregroundStyle(.secondary) }; Spacer() }
                        Text(studio.draft == nil ? "이어폰을 연결하면 반주가 마이크에 섞이는 것을 줄일 수 있어요." : "초안이 이 기기에 저장되어 있습니다.").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                        if studio.processing {
                            VStack(spacing: 8) {
                                if let progress = studio.progress { ProgressView(value: progress); Text("\(studio.processingTitle) · \(Int(progress * 100))%").monospacedDigit() }
                                else { ProgressView(studio.processingTitle) }
                                Text("초안과 원본 녹음은 기기에 보관됩니다.").font(.caption).foregroundStyle(.secondary)
                            }.padding().accessibilityIdentifier("audio-progress")
                        }
                        if let error = studio.error {
                            RetryCard(message: error) { Task { if !studio.ready { await studio.prepare() } else { studio.error = nil } } }
                        }
                        if !studio.reviewing {
                            Button { withAnimation { proxy.scrollTo("vocal-settings", anchor: .top) } } label: { Label("에코 · 잡음 제거 설정", systemImage: "slider.horizontal.3") }.buttonStyle(.bordered)
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
                                Text("내 목소리 · \(Int(studio.voiceVolume * 100))%").font(.caption)
                                Slider(value: $studio.voiceVolume, in: 0...1.5).tint(Brand.pink).accessibilityLabel("목소리 음량")
                                Text("반주 음량 · \(Int(studio.backingVolume * 100))%").font(.caption)
                                Slider(value: $studio.backingVolume, in: 0...1).tint(Brand.aqua).accessibilityLabel("녹음 중 반주 음량")
                                Text(studio.monitorMessage ?? "이어폰 연결 시 내 목소리를 들을 수 있어요. 연결 방식에 따라 지연이 생길 수 있습니다.").font(.caption).foregroundStyle(.secondary)
                            }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 22))
                            VStack(spacing: 16) {
                                Text(timeLabel(studio.elapsed)).font(.system(size: 48, weight: .light, design: .monospaced)).foregroundStyle(Brand.aqua)
                                ProgressView(value: Double(studio.level), total: 1).tint(Brand.aqua).accessibilityLabel("마이크 입력 레벨")
                                if studio.words.isEmpty { Text("음악에 맞춰 자유롭게 불러보세요").foregroundStyle(.secondary).padding(24) }
                                else { StudioLyricWheel(studio: studio) }
                                Button("가사 / 구간 선택해서 부르기") { if studio.recording { studio.finish() }; showLyrics = true }.font(.subheadline).disabled(studio.processing || studio.countdown > 0)
                                if studio.draft != nil {
                                    Text("녹음을 보관했어요. 아래에서 바로 다시 시작하거나 확인할 수 있어요.").font(.caption).foregroundStyle(Brand.aqua)
                                }
                            }.padding(22).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
                            StudioVocalControls(studio: studio, recording: true)
                                .padding(20).background(Brand.card, in: RoundedRectangle(cornerRadius: 22))
                                .disabled(studio.processing).id("vocal-settings")
                        } else {
                            VStack(alignment: .leading, spacing: 20) {
                                Text("녹음이 완료되었습니다!").font(.title2.bold())
                                Text("후작업을 진행해 주세요.").foregroundStyle(.secondary)
                                RecordingWaveform(samples: studio.waveform)
                                Slider(value: Binding(get: { studio.previewPosition }, set: { studio.seekPreview($0) }), in: 0...max(0.1, studio.draft?.length ?? 0)).accessibilityLabel("녹음 재생 위치")
                                HStack {
                                    Text("\(timeLabel(studio.previewPosition)) / \(timeLabel(studio.draft?.length ?? 0))").monospacedDigit().font(.caption)
                                    Spacer()
                                    Button { studio.seekPreview(studio.previewPosition - 5) } label: { Image(systemName: "gobackward.5") }.accessibilityLabel("5초 뒤로")
                                    Button { studio.togglePreview() } label: { Label(studio.previewing ? "일시정지" : "바로 듣기", systemImage: studio.previewing ? "pause.fill" : "play.fill") }.accessibilityIdentifier("recording-preview")
                                    Button { studio.seekPreview(studio.previewPosition + 5) } label: { Image(systemName: "goforward.5") }.accessibilityLabel("5초 앞으로")
                                }.disabled(studio.processing)
                                Text("재생 중 설정을 바꾸면 지금 듣는 구간에 바로 적용됩니다.").font(.caption).foregroundStyle(Brand.aqua)
                                Button("가사 구간 다시 부르기 · 다른 구간은 유지") { showLyrics = true }.disabled(studio.processing || publishing)
                                Text("1. 싱크 조절").font(.title3.bold())
                                Text("내 목소리와 반주의 싱크를 맞춰주세요.").font(.subheadline).foregroundStyle(.secondary)
                                HStack { Text("-300ms"); Spacer(); Text("\(Int(studio.sync * 1000))ms").foregroundStyle(.primary); Spacer(); Text("+800ms") }.font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                Slider(value: $studio.sync, in: -0.3...0.8, step: 0.005).tint(Brand.pink).accessibilityLabel("목소리 싱크")
                                StudioVolumeBalance(studio: studio)
                                StudioVocalControls(studio: studio, recording: false)
                                HStack {
                                    Button(studio.previewing ? "일시정지" : "이 위치부터 듣기") { studio.togglePreview() }.buttonStyle(.bordered)
                                    Button("WAV 만들기") { Task { await studio.mix(preview: false) } }.buttonStyle(.borderedProminent)
                                }.disabled(studio.processing)
                                if let url = studio.exportURL {
                                    ShareLink(item: url) { Label("완성한 WAV 저장 / 공유", systemImage: "square.and.arrow.up") }
                                    Text("마지막으로 합성한 설정의 파일입니다. 설정을 바꿨다면 WAV를 다시 만들어주세요.").font(.caption).foregroundStyle(.secondary)
                                }
                            }.padding(22).background(Brand.card, in: RoundedRectangle(cornerRadius: 24)).disabled(studio.processing || publishing)
                            VStack(alignment: .leading, spacing: 16) {
                                Text("4. 저장 및 게시").font(.title3.bold())
                                Text("초안은 이 기기에 보관됩니다.").font(.subheadline).foregroundStyle(.secondary)
                                HStack(spacing: 12) {
                                    Button("다시 부르기") { Task { published = false; ownVoice = false; rights = false; duetConsent = false; await studio.newTake() } }.buttonStyle(.bordered)
                                    Button("임시 저장") { do { try studio.preserveDraftSettings(); draftSaved = true } catch { studio.error = error.localizedDescription } }.buttonStyle(.bordered)
                                }.disabled(studio.processing || publishing)
                                if draftSaved { Label("초안과 설정을 저장했어요", systemImage: "checkmark.circle").font(.caption).foregroundStyle(Brand.aqua) }
                                Text("내 커버곡 게시").font(.headline)
                                if published {
                                    Label("서버에 제출했습니다", systemImage: "checkmark.circle.fill").foregroundStyle(Brand.aqua)
                                    Text("음원 처리가 완료되면 공개됩니다. 초안과 원본 녹음은 기기에 남아 있습니다.").font(.subheadline).foregroundStyle(.secondary)
                                } else {
                                    TextField("이 녹음에 대한 소개", text: $description, axis: .vertical).textFieldStyle(.roundedBorder).focused($editingDescription)
                                    Toggle("내가 직접 부른 녹음입니다", isOn: $ownVoice)
                                    Toggle("공개할 권리가 있으며 게시에 동의합니다", isOn: $rights)
                                    if studio.draft?.duetFirst == true { Toggle("다른 사람이 이 녹음에 목소리를 더하는 데 동의합니다", isOn: $duetConsent) }
                                    Text("현재 음량·리버브·싱크 설정으로 합성해 공개합니다. 재시도할 때는 처음 제출한 파일을 사용합니다.").font(.caption).foregroundStyle(.secondary)
                                    if publishing {
                                        if let uploadProgress { ProgressView(value: uploadProgress); Text("업로드 \(Int(uploadProgress * 100))%").font(.caption).monospacedDigit() }
                                        else if !studio.processing { ProgressView("서버에서 업로드 확인 중…") }
                                    }
                                    Button(publishing ? "제출 중…" : "커버곡 공개하기") { confirmPublish = true }
                                        .buttonStyle(.borderedProminent).disabled(!ownVoice || !rights || (studio.draft?.duetFirst == true && !duetConsent) || publishing || studio.processing)
                                }
                            }.padding(22).background(Brand.card, in: RoundedRectangle(cornerRadius: 24))
                        }
                    }.padding(20)
                }.accessibilityIdentifier("studio-content").scrollDismissesKeyboard(.interactively).onTapGesture { editingDescription = false }
            }.background(Brand.background).navigationTitle(studio.reviewing ? "녹음 편집" : "녹음 스튜디오").navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .bottom) {
                    if !studio.reviewing && !studio.processing && !publishing {
                        recordingControls.padding(14).frame(maxWidth: .infinity).background(Brand.card)
                    } else if studio.processing || publishing {
                        VStack(spacing: 6) {
                            if let progress = studio.progress ?? uploadProgress {
                                ProgressView(value: progress)
                                Text("\(studio.processing ? studio.processingTitle : "업로드") · \(Int(progress * 100))%").font(.caption.bold()).monospacedDigit()
                            } else { ProgressView(studio.processing ? studio.processingTitle : "서버 확인 중…") }
                            Text("원본 녹음은 기기에 보관됩니다").font(.caption2).foregroundStyle(.secondary)
                        }.padding(14).frame(maxWidth: .infinity).background(Brand.card).accessibilityIdentifier("pinned-audio-progress")
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .primaryAction) { if studio.reviewing { Button("녹음 화면") { studio.returnToRecording() } } }
                    ToolbarItem(placement: .cancellationAction) { Button("닫기") { if studio.recording || studio.processing || publishing { confirmClose = true } else { studio.shutdown(); dismiss() } } }
                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { editingDescription = false } }
                }
                .confirmationDialog("녹음을 마치고 초안으로 저장할까요?", isPresented: $confirmClose, titleVisibility: .visible) {
                    Button("원본 보관 후 닫기") { publishTask?.cancel(); studio.shutdown(); dismiss() }
                } message: {
                    Text("원본과 초안은 보관됩니다. WAV 내보내기나 업로드 중이면 중단합니다. 이미 서버에 도착한 업로드는 초안에서 다시 열어 상태를 확인할 수 있어요.")
                }
                .sheet(isPresented: $showLyrics) { RecordingPositionPicker(studio: studio) }
                .sheet(isPresented: $showDuetEditor) { DuetPartEditor(studio: studio) }
                .task { ListeningAds.shared.studioOpen = true; await studio.prepare() }
                .onChange(of: scenePhase) { _, phase in if phase == .background { studio.shutdown() } else if phase == .active { studio.resume() } }
                .onDisappear { studio.shutdown(); ListeningAds.shared.studioOpen = false }
                .interactiveDismissDisabled(studio.recording || studio.processing || publishing)
                .confirmationDialog("이 녹음을 AIFECT에 공개할까요?", isPresented: $confirmPublish, titleVisibility: .visible) {
                    Button("합성 후 공개하기") { editingDescription = false; publishTask = Task { await publish() } }
                }
        }
    }
    @ViewBuilder private var recordingControls: some View {
        if studio.countdown > 0 {
            HStack { Text("\(studio.countdown)").font(.largeTitle.bold()).monospacedDigit(); Text("곧 녹음을 시작합니다"); Spacer(); Button("시작 취소") { studio.cancelCountdown() } }
        } else if studio.recording {
            VStack(spacing: 10) {
                HStack {
                    Button(studio.paused ? "이어 부르기" : "일시정지") { studio.togglePause() }.buttonStyle(.bordered)
                    Button("녹음 멈추기") { studio.finish() }.buttonStyle(.borderedProminent).tint(Brand.pink)
                }
                if studio.paused { restartButton }
            }
        } else if studio.draft != nil {
            HStack {
                restartButton
                Button("녹음 확인·편집") { studio.reviewRecording() }.buttonStyle(.bordered).accessibilityIdentifier("review-recording")
            }
        } else {
            Button { Task { await studio.start() } } label: { Label(studio.elapsed > 0 ? "선택한 위치부터 녹음" : "녹음 시작", systemImage: "record.circle").font(.headline).padding(10).frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Brand.pink).foregroundStyle(.black)
                .disabled(!studio.ready || studio.guideIssue != nil).accessibilityIdentifier("start-recording")
        }
    }
    private var restartButton: some View {
        Button { Task { published = false; ownVoice = false; rights = false; duetConsent = false; await studio.restartRecording() } } label: { Label("다시 시작", systemImage: "arrow.counterclockwise") }
            .buttonStyle(.borderedProminent).tint(Brand.pink).accessibilityIdentifier("restart-recording")
            .disabled(studio.guideIssue != nil)
    }
    private func publish() async {
        publishing = true; uploadProgress = nil; defer { publishing = false; uploadProgress = nil }
        await studio.mix(preview: false)
        guard !Task.isCancelled, let draft = studio.draft, let audio = studio.exportURL, studio.error == nil else { return }
        do {
            let id = try await CoverPublisher.submit(draft: draft, audio: audio, description: description, ownVoice: ownVoice, rights: rights, duetConsent: duetConsent, progress: { value in uploadProgress = value })
            published = true; studio.shutdown(); model.player.pause()
            ListeningAds.shared.studioOpen = false
            await ListeningAds.shared.uploadCompleted(id: id)
            ListeningAds.shared.studioOpen = true
        } catch is CancellationError {} catch { studio.error = error.localizedDescription }
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

struct RecordingPositionPicker: View {
    @ObservedObject var studio: RecordingStudio
    @Environment(\.dismiss) private var dismiss
    @State private var position = 0.0
    var body: some View {
        NavigationStack {
            List {
                Section("시작 위치") {
                    Slider(value: $position, in: 0...max(1, min(600, studio.song.duration > 0 ? studio.song.duration : 600) - 1))
                    Text(timeLabel(position)).monospacedDigit()
                    Button("이 위치부터 부르기") { select(position) }.disabled(studio.processing)
                    Text("새로 부른 구간만 교체하고 나머지 녹음은 유지합니다. 교체할 마지막 부분에서 녹음 마치기를 눌러주세요.").font(.caption).foregroundStyle(.secondary)
                }
                if studio.processing { ProgressView("현재 구간 저장 중…") }
                Section("가사를 눌러 시작 위치 선택") {
                    ForEach(studio.words.indices, id: \.self) { index in
                        Button { select(max(0, studio.words[index].0 - 2)) } label: {
                            HStack(alignment: .top) { Text(timeLabel(studio.words[index].0)).font(.caption).monospacedDigit(); Text(studio.words[index].1) }
                        }.disabled(studio.processing)
                    }
                }
            }.navigationTitle("구간 선택").toolbar { Button("닫기") { dismiss() } }
                .onAppear { position = min(studio.previewPosition, studio.song.duration) }
        }
    }
    private func select(_ seconds: Double) { studio.selectRecordingPosition(seconds); dismiss() }
}

struct RecordingDraftsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var drafts: [RecordingDraft] = []
    @State private var selection: RecordingDraft?
    var body: some View {
        List {
            ForEach(drafts) { draft in
                Button { model.player.pause(); selection = draft } label: {
                    HStack { CoverArt(song: draft.song, size: 48); VStack(alignment: .leading, spacing: 6) { Text(draft.song.title); Text("\(timeLabel(draft.length)) · \(draft.date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "slider.horizontal.3") }
                }.buttonStyle(.plain)
            }
            if drafts.isEmpty { ContentUnavailableView("저장한 초안이 없어요", systemImage: "mic") }
        }.navigationTitle("내 녹음 초안").task(id: model.userID) { reload() }
            .fullScreenCover(item: $selection, onDismiss: reload) { draft in StudioView(studio: RecordingStudio(song: draft.song, owner: draft.owner, draft: draft)) }
    }
    private func reload() { drafts = model.userID.map { RecordingDraft.list(owner: $0) } ?? [] }
}
