import AVFoundation
import SwiftUI

struct RecordingDraft: Codable, Identifiable {
    let id: String
    let owner: String
    let song: Song
    let date: Date
    let length: Double
    var duetParentID: String? = nil
    var duetFirst: Bool? = nil
    var duetLines: [String]? = nil
    var duetMode: String? = nil
    var directory: URL { Self.root.appendingPathComponent(id, isDirectory: true) }
    static var root: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Recordings", isDirectory: true) }
    static func list(owner: String) -> [RecordingDraft] {
        let folders = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return folders.compactMap { url -> RecordingDraft? in
            guard let data = try? Data(contentsOf: url.appendingPathComponent("draft.json")),
                  let draft = try? JSONDecoder().decode(RecordingDraft.self, from: data), draft.owner == owner else { return nil }
            return draft
        }.sorted { $0.date > $1.date }
    }
}

@MainActor
final class RecordingStudio: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var ready = false
    @Published var recording = false
    @Published var paused = false
    @Published var processing = false
    @Published var progress: Double? = nil
    @Published var processingTitle = "오디오 준비 중"
    @Published var previewPosition = 0.0
    private var audition: RecordingPreview?
    private var workControl: AudioWorkControl?
    private var takeStart = 0.0
    private var priorLength = 0.0
    private var takeURL: URL?
    private var closed = false
    private var monitorTask: Task<Void, Never>?
    @Published var elapsed = 0.0
    @Published var level: Float = 0
    @Published private(set) var waveform: [Float] = []
    @Published var error: String?
    @Published var words: [(Double, String)] = []
    @Published var draft: RecordingDraft?
    @Published private(set) var reviewing = false
    private var finishTask: Task<Void, Never>?
    @Published var exportURL: URL?
    @Published var previewing = false
    @Published var voiceVolume: Float = 1 { didSet { settingsChanged() } }
    @Published var backingVolume: Float = 0.8 { didSet { backing?.volume = backingVolume; settingsChanged() } }
    @Published var reverb: Float = 12 { didSet { settingsChanged() } }
    @Published var sync = 0.0 { didSet { settingsChanged() } }
    @Published var effects = VocalSettings() { didSet { settingsChanged() } }
    @Published var countdown = 0
    private var starting = false
    private var countdownGeneration = 0
    private func saveSettings() {
        if let bytes = try? JSONEncoder().encode(currentSettings) { try? bytes.write(to: folder.appendingPathComponent("settings.json"), options: .atomic) }
    }
    var currentSettings: VocalSettings { var value = effects; value.voice = voiceVolume; value.backing = backingVolume; value.offset = sync; value.room = reverb; return value }
    private func settingsChanged() {
        exportURL = nil
        liveMonitor.update(currentSettings)
        do { try audition?.update(currentSettings) } catch { self.error = error.localizedDescription }
    }
    func selectPreset(_ id: String) { effects.select(id); reverb = effects.room; saveSettings() }
    func setPresetStrength(_ value: Float) {
        guard effects.preset != "original", effects.preset != "custom" else { return }
        var next = effects; next.select(effects.preset)
        let strength = min(1, max(0, value)); next.strength = strength
        next.echo *= strength * 2; next.room *= strength * 2; next.tone = min(1, next.tone * strength * 2)
        effects = next; reverb = next.room; saveSettings()
    }
    func preserveDraftSettings() throws {
        guard let draft else { return }
        try JSONEncoder().encode(currentSettings).write(to: folder.appendingPathComponent("settings.json"), options: .atomic)
        try JSONEncoder().encode(draft).write(to: folder.appendingPathComponent("draft.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func cancelCountdown() { countdownGeneration += 1; countdown = 0; starting = false }

    @Published var duetFirst = false
    @Published var duetLines: [String] = []
    @Published var duetMode = "free"
    @Published var monitorEnabled = false { didSet { updateMonitor() } }
    @Published var monitorVolume: Float = 1 { didSet { liveMonitor.volume = min(1, max(0, monitorVolume)) } }
    @Published private(set) var monitorMessage: String?
    private let liveMonitor = LiveVocalMonitor()
    var ownPart: String { duetParentID == nil ? "A" : "B" }
    var guideIssue: String? { duetFirst && duetMode == "lyrics" ? DuetGuide.validation(lines: duetLines, count: words.count) : nil }
    var nextOwnLine: Int? { DuetGuide.nextOwnLine(times: words.map(\.0), lines: duetLines, elapsed: elapsed, ownPart: ownPart) }
    func setDuetPart(_ part: String, at index: Int) {
        guard duetParentID == nil, !recording, duetLines.indices.contains(index) else { return }
        duetLines[index] = duetLines[index] == part ? "" : part
    }
    func fillUnassignedDuetLines() { guard duetParentID == nil, !recording else { return }; duetLines = duetLines.map { $0.isEmpty ? "B" : $0 } }
    func updateMonitor() {
        monitorTask?.cancel(); liveMonitor.stop(); monitorMessage = nil
        #if DEBUG
        if FeedbackUIFixture.enabled { return }
        #endif
        guard monitorEnabled, !reviewing, !processing, !closed else { return }
        monitorTask = Task { [weak self] in
            guard let self else { return }
            let allowed = await AVAudioApplication.requestRecordPermission()
            guard !Task.isCancelled, self.monitorEnabled, !self.closed else { return }
            guard allowed else { self.monitorMessage = "설정에서 마이크 접근을 허용해주세요."; return }
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
                try session.setPreferredIOBufferDuration(0.005); try session.setActive(true)
                try self.liveMonitor.start(volume: self.monitorVolume, settings: self.currentSettings)
                self.monitorMessage = "모니터링 중 · 내 목소리를 듣고 있어요."
            } catch { self.monitorMessage = error.localizedDescription }
        }
    }
    let duetParentID: String?
    let song: Song
    let owner: String
    private var folder: URL
    private var recorder: AVAudioRecorder?
    private var backing: AVAudioPlayer?
    private var previewPlayer: AVAudioPlayer?
    private var timer: Timer?
    private var interruption: NSObjectProtocol?
    private var routeObserver: NSObjectProtocol?
    init(song: Song, owner: String, draft: RecordingDraft? = nil, duetParentID: String? = nil) {
        self.song = song; self.owner = owner; self.draft = draft
        self.reviewing = draft != nil
        self.duetParentID = draft?.duetParentID ?? duetParentID
        self.duetFirst = draft?.duetFirst ?? false; self.duetLines = draft?.duetLines ?? []; self.duetMode = draft?.duetMode ?? ((draft?.duetLines?.isEmpty == false) ? "lyrics" : "free")
        if self.duetParentID != nil { self.backingVolume = 1 }
        folder = draft?.directory ?? RecordingDraft.root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        elapsed = draft?.length ?? 0; priorLength = draft?.length ?? 0
        super.init()
        if let data = try? Data(contentsOf: folder.appendingPathComponent("settings.json")), let value = try? JSONDecoder().decode(VocalSettings.self, from: data) {
            effects = value; effects.echo = min(20, max(0, value.echo)); voiceVolume = value.voice; backingVolume = value.backing; sync = value.offset; reverb = value.room
        } else { effects.select("studio"); reverb = effects.room }
        interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.cancelCountdown(); self?.monitorEnabled = false; self?.finish(); self?.stopPreview() }
        }
        routeObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                Task { @MainActor in self?.cancelCountdown(); self?.monitorEnabled = false; self?.finish(); self?.stopPreview() }
            }
        }
    }
    func prepare() async {
        closed = false
        if draft != nil {
            if let data = try? Data(contentsOf: folder.appendingPathComponent("lyrics.json")), let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] { words = rows.map { ($0.number("time"), $0.string("text")) } }
            ready = true; await loadWaveform()
            if words.isEmpty, let data = try? await API.shared.call(duetParentID.map { "/api/duets/\(Endpoint.pathID($0))" } ?? "/api/karaoke/\(Endpoint.pathID(song.id))") {
                words = data.objects("words").map { ($0.number("s"), $0.objects("w").map { $0.string("t") }.joined(separator: " ")) }
            }
            return
        }
        processing = true; processingTitle = "반주 준비 중"; progress = nil; defer { processing = false }
        do {
            let data = try await API.shared.call(duetParentID.map { "/api/duets/\(Endpoint.pathID($0))" } ?? "/api/karaoke/\(Endpoint.pathID(song.id))")
            words = data.objects("words").map { ($0.number("s"), $0.objects("w").map { $0.string("t") }.joined(separator: " ")) }
            let guide = data.object("duet").object("guide")
            if duetParentID != nil { duetMode = guide.string("mode", fallback: "free"); duetLines = guide["lines"] as? [String] ?? [] }
            else if duetLines.count != words.count { duetLines = Array(repeating: "", count: words.count) }
            let audio = try await API.shared.request(data.string("mr"))
            try Task.checkCancellation()
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try audio.write(to: folder.appendingPathComponent("backing.m4a"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try JSONSerialization.data(withJSONObject: words.map { ["time": $0.0, "text": $0.1] }).write(to: folder.appendingPathComponent("lyrics.json"), options: .atomic)
            ready = true
        } catch is CancellationError {} catch { self.error = error.localizedDescription }
    }
    func start() async {
        #if DEBUG
        if FeedbackUIFixture.enabled { return }
        #endif
        guard ready, !recording, !starting, !processing, draft == nil, !closed else { return }
        if let guideIssue { error = guideIssue; return }
        starting = true
        countdownGeneration += 1
        let generation = countdownGeneration
        defer { if generation == countdownGeneration { starting = false; countdown = 0 } }
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else { error = "설정 → AIFECT에서 마이크 접근을 허용해주세요."; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true)
            for value in (1...3).reversed() {
                guard generation == countdownGeneration else { return }
                countdown = value; try await Task.sleep(for: .seconds(1))
            }
            guard generation == countdownGeneration else { return }
            countdown = 0
            let take = folder.appendingPathComponent("take-\(UUID().uuidString).wav")
            let recorder = try AVAudioRecorder(url: take, settings: [AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
            let backing = try AVAudioPlayer(contentsOf: folder.appendingPathComponent("backing.m4a"))
            backing.currentTime = elapsed; takeStart = elapsed; takeURL = take
            recorder.isMeteringEnabled = true; recorder.prepareToRecord(); backing.prepareToPlay(); backing.volume = backingVolume
            let startTime = max(recorder.deviceCurrentTime, backing.deviceCurrentTime) + 0.25
            guard recorder.record(atTime: startTime), backing.play(atTime: startTime) else { recorder.stop(); backing.stop(); throw APIError(status: 0, message: "녹음을 시작하지 못했습니다.") }
            saveSettings()
            self.recorder = recorder; self.backing = backing; recording = true; paused = false; updateMonitor()
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
        } catch { self.error = error.localizedDescription }
    }
    func togglePause() {
        guard recording else { return }
        if paused { recorder?.record(); backing?.play() } else { recorder?.pause(); backing?.pause() }
        paused.toggle(); updateMonitor()
    }
    func finish() {
        guard recording else { return }
        let duration = recorder?.currentTime ?? 0
        monitorTask?.cancel(); liveMonitor.stop(); recorder?.stop(); backing?.stop(); timer?.invalidate(); timer = nil
        recording = false; paused = false
        guard duration > 0.1, let takeURL else { return }
        elapsed = max(priorLength, takeStart + duration)
        processing = true; processingTitle = "초안 저장 중"; progress = 0
        let folder = folder, start = takeStart, prior = priorLength
        finishTask = Task {
            do {
                let length = try await Task.detached(priority: .userInitiated) {
                    try RecordingSplice.merge(folder: folder, take: takeURL, start: start, priorLength: prior) { value in Task { @MainActor [weak self] in self?.progress = value } }
                }.value
                elapsed = length; priorLength = length
                let saved = RecordingDraft(id: folder.lastPathComponent, owner: owner, song: song, date: Date(), length: length, duetParentID: duetParentID, duetFirst: duetFirst, duetLines: duetMode == "lyrics" ? duetLines : [], duetMode: duetMode)
                try JSONEncoder().encode(saved).write(to: folder.appendingPathComponent("draft.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                draft = saved; previewPosition = min(takeStart, length); audition = nil; saveSettings()
                await loadWaveform()
                try? FileManager.default.removeItem(at: takeURL)
            } catch { self.error = "원본 녹음은 보관되어 있습니다. 초안 저장 실패: \(error.localizedDescription)" }
            processing = false; progress = nil
            updateMonitor()
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    func selectRecordingPosition(_ seconds: Double) {
        guard !recording, !processing, countdown == 0 else { return }
        stopPreview(); audition = nil
        if FileManager.default.fileExists(atPath: folder.appendingPathComponent("submission.json").path) {
            let next = RecordingDraft.root.appendingPathComponent(UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: next, withIntermediateDirectories: true)
                for name in ["voice.wav", "backing.m4a", "lyrics.json", "settings.json"] {
                    let source = folder.appendingPathComponent(name)
                    if FileManager.default.fileExists(atPath: source.path) { try FileManager.default.copyItem(at: source, to: next.appendingPathComponent(name)) }
                }
                folder = next
            } catch { self.error = error.localizedDescription; return }
        }
        priorLength = max(priorLength, draft?.length ?? 0)
        draft = nil; reviewing = false; elapsed = max(0, min(seconds, min(song.duration > 0 ? song.duration : 600, 600) - 0.1))
        updateMonitor()
    }
    func reviewRecording() {
        guard draft != nil, !recording, !processing else { return }
        reviewing = true; updateMonitor()
    }
    func cueLyric(at index: Int) async {
        guard words.indices.contains(index), countdown == 0, !closed else { return }
        if recording { finish() }
        await finishTask?.value
        guard !closed, !Task.isCancelled, !processing, error == nil else { return }
        selectRecordingPosition(max(0, words[index].0 - 2))
    }
    func returnToRecording() {
        guard !processing else { return }
        stopPreview(); reviewing = false; updateMonitor()
    }
    func restartRecording() async {
        guard !processing, !starting, !closed else { return }
        error = nil
        if recording { finish(); await finishTask?.value }
        guard !closed, !Task.isCancelled, error == nil else { return }
        await newTake()
        guard !closed, !Task.isCancelled else { return }
        await start()
    }
    private func loadWaveform() async {
        let url = folder.appendingPathComponent("voice.wav")
        waveform = (try? await Task.detached(priority: .utility) { try AudioMixer.waveform(url: url) }.value) ?? []
    }
    func stopPreview() { if previewing { previewPosition = audition?.position ?? previewPosition }; audition?.stop(); previewPlayer?.stop(); previewing = false }
    func togglePreview() {
        guard let draft, !processing else { return }
        if previewing { stopPreview(); return }
        do {
            if audition == nil { audition = try RecordingPreview(folder: folder, duration: draft.length) }
            try audition?.update(currentSettings)
            if previewPosition >= draft.length - 0.05 { previewPosition = 0 }
            try audition?.play(from: previewPosition); previewing = true
            timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in guard let self, self.previewing else { return }; self.previewPosition = self.audition?.position ?? 0; if self.previewPosition >= (self.draft?.length ?? 0) { self.stopPreview() } }
            }
        } catch { self.error = error.localizedDescription }
    }
    func seekPreview(_ seconds: Double) {
        let target = max(0, min(seconds, draft?.length ?? 0)); previewPosition = target
        if previewing { do { try audition?.play(from: target) } catch { self.error = error.localizedDescription } }
    }
    func newTake() async {
        guard !recording, !processing else { return }
        stopPreview(); saveSettings(); cancelCountdown()
        let next = RecordingDraft.root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: next, withIntermediateDirectories: true)
            for name in ["backing.m4a", "lyrics.json", "settings.json"] {
                let source = folder.appendingPathComponent(name)
                if FileManager.default.fileExists(atPath: source.path) { try FileManager.default.copyItem(at: source, to: next.appendingPathComponent(name)) }
            }
            folder = next
            draft = nil; reviewing = false; exportURL = nil; waveform = []; elapsed = 0; priorLength = 0; audition = nil; previewPosition = 0; error = nil
            ready = FileManager.default.fileExists(atPath: folder.appendingPathComponent("backing.m4a").path)
            if !ready { await prepare() }
            updateMonitor()
        } catch { self.error = error.localizedDescription }
    }
    func resume() { closed = false }
    func shutdown() { closed = true; monitorEnabled = false; cancelCountdown(); monitorTask?.cancel(); liveMonitor.stop(); workControl?.cancel(); finish(); stopPreview(); saveSettings(); timer?.invalidate() }
    private func tick() {
        guard recording, !paused else { return }
        elapsed = takeStart + (recorder?.currentTime ?? 0)
        recorder?.updateMeters(); level = pow(10, (recorder?.averagePower(forChannel: 0) ?? -80) / 20)
        if elapsed >= (song.duration > 0 ? min(song.duration, 600) : 600) { finish() }
    }
    func mix(preview: Bool) async {
        guard let draft, !processing else { return }
        if preview { togglePreview(); return }
        stopPreview(); processing = true; processingTitle = "WAV 저장 중"; progress = 0; error = nil
        let control = AudioWorkControl(); workControl = control
        defer { processing = false; progress = nil; workControl = nil }
        saveSettings()
        let folder = folder, voice = voiceVolume, music = backingVolume, room = reverb, offset = sync, effects = currentSettings
        do {
            let output = try await Task.detached(priority: .userInitiated) {
                try AudioMixer.render(folder: folder, duration: draft.length, voice: voice, backing: music, reverb: room, offset: offset, effects: effects, control: control) { value in Task { @MainActor [weak self] in self?.progress = value } }
            }.value
            exportURL = output
            if preview {
                try AVAudioSession.sharedInstance().setCategory(.playback)
                try AVAudioSession.sharedInstance().setActive(true)
                previewPlayer = try AVAudioPlayer(contentsOf: output); previewPlayer?.delegate = self
                previewPlayer?.play(); previewing = true
            }
        } catch is CancellationError { exportURL = nil } catch { self.error = error.localizedDescription }
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.previewing = false }
    }
    deinit {
        timer?.invalidate()
        if let interruption { NotificationCenter.default.removeObserver(interruption) }
        if let routeObserver { NotificationCenter.default.removeObserver(routeObserver) }
    }
}

enum AudioMixer {
    static func waveform(url: URL) throws -> [Float] {
        let file = try AVAudioFile(forReading: url)
        let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096)!
        var peaks = Array(repeating: Float(0), count: 96)
        while file.framePosition < file.length {
            let position = file.framePosition
            try file.read(into: buffer)
            guard buffer.frameLength > 0, let samples = buffer.floatChannelData else { break }
            for frame in 0..<Int(buffer.frameLength) {
                let index = min(95, Int((position + Int64(frame)) * 96 / max(1, file.length)))
                peaks[index] = max(peaks[index], min(1, abs(samples[0][frame])))
            }
        }
        return peaks
    }
    static func render(folder: URL, duration: Double, voice: Float, backing: Float, reverb: Float, offset: Double, effects: VocalSettings? = nil, control: AudioWorkControl? = nil, progress: @Sendable (Double) -> Void = { _ in }) throws -> URL {
        let engine = AVAudioEngine(), mic = AVAudioPlayerNode(), music = AVAudioPlayerNode()
        let vocal = try AVAudioFile(forReading: folder.appendingPathComponent("voice.wav"))
        let mr = try AVAudioFile(forReading: folder.appendingPathComponent("backing.m4a"))
        let chain = VocalEffectChain()
        engine.attach(mic); engine.attach(music)
        chain.connect(mic, engine: engine, format: vocal.processingFormat)
        var settings = effects ?? VocalSettings(); settings.room = reverb; chain.apply(settings)
        engine.connect(music, to: engine.mainMixerNode, format: mr.processingFormat)
        mic.volume = voice; music.volume = backing
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
        let trim = AVAudioFramePosition(max(0, -offset) * vocal.processingFormat.sampleRate)
        guard trim < vocal.length else { throw APIError(status: 0, message: "녹음 길이가 너무 짧습니다.") }
        let when = AVAudioTime(sampleTime: AVAudioFramePosition(max(0, offset) * vocal.processingFormat.sampleRate), atRate: vocal.processingFormat.sampleRate)
        mic.scheduleSegment(vocal, startingFrame: trim, frameCount: AVAudioFrameCount(vocal.length - trim), at: when)
        music.scheduleFile(mr, at: nil)
        let output = folder.appendingPathComponent("AIFECT-cover-\(UUID().uuidString).wav")
        var completed = false
        defer { if !completed { try? FileManager.default.removeItem(at: output) } }
        let writer = try AVAudioFile(forWriting: output, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
        try engine.start(); mic.play(); music.play()
        defer { engine.stop() }
        let buffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: engine.manualRenderingMaximumFrameCount)!
        let length = AVAudioFramePosition(duration * 44100)
        var stalls = 0, lastPercent = -1
        while engine.manualRenderingSampleTime < length {
            try control?.check()
            let count = AVAudioFrameCount(min(Int64(buffer.frameCapacity), length - engine.manualRenderingSampleTime))
            let status = try engine.renderOffline(count, to: buffer)
            switch status {
            case .success:
                if let channels = buffer.floatChannelData {
                    for c in 0..<Int(buffer.format.channelCount) { for f in 0..<Int(buffer.frameLength) {
                        let value = channels[c][f], a = abs(value)
                        channels[c][f] = !value.isFinite ? 0 : (a <= 0.8 ? value : (value < 0 ? -1 : 1) * (0.8 + 0.19 * (1 - exp(-(a - 0.8) / 0.19))))
                    } }
                }
                try writer.write(from: buffer); stalls = 0
                let percent = Int(engine.manualRenderingSampleTime * 100 / max(1, length))
                if percent != lastPercent { lastPercent = percent; progress(Double(engine.manualRenderingSampleTime) / Double(max(1, length))) }
            case .insufficientDataFromInputNode, .cannotDoInCurrentContext:
                stalls += 1
                if stalls > 100 { throw APIError(status: 0, message: "녹음 합성을 완료하지 못했습니다.") }
            case .error: throw APIError(status: 0, message: "녹음 합성에 실패했습니다.")
            @unknown default: throw APIError(status: 0, message: "지원하지 않는 오디오 상태입니다.")
            }
        }
        completed = true; progress(1)
        return output
    }
}

/// Parts are always relative to the first recording; joiners read the guide.
enum DuetGuide {
    static func validation(lines: [String], count: Int) -> String? {
        guard count > 0, lines.count == count, lines.allSatisfy({ ["A", "B", "both"].contains($0) }) else { return "모든 가사의 파트를 지정해주세요." }
        guard lines.contains(where: { $0 == "A" || $0 == "both" }), lines.contains(where: { $0 == "B" || $0 == "both" }) else { return "내 파트와 파트너가 부를 부분을 모두 지정해주세요." }
        return nil
    }
    static func nextOwnLine(times: [Double], lines: [String], elapsed: Double, ownPart: String) -> Int? {
        times.indices.first { times[$0] > elapsed && lines.indices.contains($0) && (lines[$0] == ownPart || lines[$0] == "both") }
    }
    static func title(part: String, ownPart: String) -> String { part == "both" ? "함께" : part.isEmpty ? "미지정" : part == ownPart ? "내 파트" : "파트너" }
}
@MainActor
final class LiveVocalMonitor {
    private var engine: AVAudioEngine?
    private var effects: VocalEffectChain?
    private var settings = VocalSettings()
    var volume: Float = 1 { didSet { applyVolume() } }
    private func applyVolume() { engine?.mainMixerNode.outputVolume = min(1, max(0, volume * settings.voice)) }
    func update(_ settings: VocalSettings) { self.settings = settings; effects?.apply(settings); applyVolume() }
    func start(volume: Float, settings: VocalSettings) throws {
        stop()
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        guard outputs.contains(where: { [.headphones, .bluetoothHFP, .bluetoothA2DP, .usbAudio].contains($0.portType) }) else { throw APIError(status: 0, message: "청음은 이어폰을 연결하면 사용할 수 있어요.") }
        let engine = AVAudioEngine(), input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else { throw APIError(status: 0, message: "현재 오디오 연결에서는 청음을 사용할 수 없어요.") }
        let effects = VocalEffectChain()
        effects.connect(input, engine: engine, format: format); effects.apply(settings)
        self.settings = settings; self.volume = min(1, max(0, volume))
        engine.mainMixerNode.outputVolume = min(1, max(0, self.volume * settings.voice))
        engine.prepare(); try engine.start(); self.engine = engine; self.effects = effects
    }
    func stop() { engine?.stop(); engine = nil; effects = nil }
}
