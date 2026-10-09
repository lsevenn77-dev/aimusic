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
    @Published var elapsed = 0.0
    @Published var level: Float = 0
    @Published private(set) var waveform: [Float] = []
    @Published var error: String?
    @Published var words: [(Double, String)] = []
    @Published var draft: RecordingDraft?
    @Published var exportURL: URL?
    @Published var previewing = false
    @Published var voiceVolume: Float = 1
    @Published var backingVolume: Float = 0.8
    @Published var reverb: Float = 12
    @Published var sync = 0.0
    @Published var effects = VocalSettings()
    @Published var countdown = 0
    private var starting = false
    private var countdownGeneration = 0
    private func saveSettings() {
        effects.voice = voiceVolume; effects.backing = backingVolume; effects.offset = sync; effects.room = reverb
        if let bytes = try? JSONEncoder().encode(effects) { try? bytes.write(to: folder.appendingPathComponent("settings.json"), options: .atomic) }
    }
    func selectPreset(_ id: String) { effects.select(id); reverb = effects.room; saveSettings() }
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
        liveMonitor.stop(); monitorMessage = nil
        guard monitorEnabled, recording, !paused else { return }
        do { try liveMonitor.start(volume: monitorVolume) }
        catch { monitorMessage = error.localizedDescription }
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
        self.duetParentID = draft?.duetParentID ?? duetParentID
        self.duetFirst = draft?.duetFirst ?? false; self.duetLines = draft?.duetLines ?? []; self.duetMode = draft?.duetMode ?? ((draft?.duetLines?.isEmpty == false) ? "lyrics" : "free")
        if self.duetParentID != nil { self.backingVolume = 1 }
        folder = draft?.directory ?? RecordingDraft.root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        elapsed = draft?.length ?? 0
        super.init()
        if let data = try? Data(contentsOf: folder.appendingPathComponent("settings.json")), let value = try? JSONDecoder().decode(VocalSettings.self, from: data) {
            effects = value; voiceVolume = value.voice; backingVolume = value.backing; sync = value.offset; reverb = value.room
        } else { effects.select("studio"); reverb = effects.room }
        interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.finish(); self?.stopPreview() }
        }
        routeObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                Task { @MainActor in self?.finish(); self?.stopPreview() }
            }
        }
    }
    func prepare() async {
        if draft != nil { ready = true; await loadWaveform(); return }
        processing = true; defer { processing = false }
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
            ready = true
        } catch is CancellationError {} catch { self.error = error.localizedDescription }
    }
    func start() async {
        guard ready, !recording, !starting, draft == nil else { return }
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
            let recorder = try AVAudioRecorder(url: folder.appendingPathComponent("voice.wav"), settings: [AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
            let backing = try AVAudioPlayer(contentsOf: folder.appendingPathComponent("backing.m4a"))
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
        let duration = recorder?.currentTime ?? elapsed
        liveMonitor.stop(); recorder?.stop(); backing?.stop(); timer?.invalidate(); timer = nil
        recording = false; paused = false; elapsed = duration
        guard duration > 0.1 else { return }
        let saved = RecordingDraft(id: folder.lastPathComponent, owner: owner, song: song, date: Date(), length: duration, duetParentID: duetParentID, duetFirst: duetFirst, duetLines: duetMode == "lyrics" ? duetLines : [], duetMode: duetMode)
        do {
            try JSONEncoder().encode(saved).write(to: folder.appendingPathComponent("draft.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            draft = saved
            Task { await loadWaveform() }
        } catch { self.error = "녹음은 남아 있지만 초안 정보를 저장하지 못했습니다: \(error.localizedDescription)" }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private func loadWaveform() async {
        let url = folder.appendingPathComponent("voice.wav")
        waveform = (try? await Task.detached(priority: .utility) { try AudioMixer.waveform(url: url) }.value) ?? []
    }
    func stopPreview() { previewPlayer?.stop(); previewing = false }
    func newTake() async {
        guard !recording, !processing else { return }
        stopPreview(); saveSettings()
        folder = RecordingDraft.root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        draft = nil; exportURL = nil; waveform = []; elapsed = 0; ready = false; error = nil
        await prepare()
    }
    func shutdown() { cancelCountdown(); finish(); stopPreview(); saveSettings(); timer?.invalidate() }
    private func tick() {
        guard recording, !paused else { return }
        elapsed = recorder?.currentTime ?? 0
        recorder?.updateMeters(); level = pow(10, (recorder?.averagePower(forChannel: 0) ?? -80) / 20)
        if elapsed >= (song.duration > 0 ? min(song.duration, 600) : 600) { finish() }
    }
    func mix(preview: Bool) async {
        guard let draft, !processing else { return }
        stopPreview(); processing = true; error = nil
        defer { processing = false }
        saveSettings()
        let folder = folder, voice = voiceVolume, music = backingVolume, room = reverb, offset = sync, effects = effects
        do {
            let output = try await Task.detached(priority: .userInitiated) {
                try AudioMixer.render(folder: folder, duration: draft.length, voice: voice, backing: music, reverb: room, offset: offset, effects: effects)
            }.value
            exportURL = output
            if preview {
                try AVAudioSession.sharedInstance().setCategory(.playback)
                try AVAudioSession.sharedInstance().setActive(true)
                previewPlayer = try AVAudioPlayer(contentsOf: output); previewPlayer?.delegate = self
                previewPlayer?.play(); previewing = true
            }
        } catch { self.error = error.localizedDescription }
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
    static func render(folder: URL, duration: Double, voice: Float, backing: Float, reverb: Float, offset: Double, effects: VocalSettings? = nil) throws -> URL {
        let engine = AVAudioEngine(), mic = AVAudioPlayerNode(), music = AVAudioPlayerNode(), room = AVAudioUnitReverb()
        let source = try VocalNoiseCleaner.clean(folder.appendingPathComponent("voice.wav"), destination: folder.appendingPathComponent("cleaned.caf"), level: effects?.noise ?? 0)
        let vocal = try AVAudioFile(forReading: source)
        let mr = try AVAudioFile(forReading: folder.appendingPathComponent("backing.m4a"))
        let echo = AVAudioUnitDelay(), tone = AVAudioUnitEQ(numberOfBands: 2)
        engine.attach(mic); engine.attach(music); engine.attach(room); engine.attach(echo); engine.attach(tone)
        room.loadFactoryPreset((effects?.size ?? 0.5) > 0.8 ? .largeHall : ((effects?.size ?? 0.5) < 0.3 ? .smallRoom : .mediumHall)); room.wetDryMix = min(50, max(0, reverb * 0.5))
        echo.delayTime = 0.235; echo.feedback = 32; echo.wetDryMix = min(65, max(0, effects?.echo ?? 0))
        tone.bands[0].filterType = .lowShelf; tone.bands[0].frequency = 250; tone.bands[0].gain = -3 * (effects?.tone ?? 0); tone.bands[0].bypass = false
        tone.bands[1].filterType = .highShelf; tone.bands[1].frequency = 3500; tone.bands[1].gain = 2 * (effects?.tone ?? 0); tone.bands[1].bypass = false
        engine.connect(mic, to: tone, format: vocal.processingFormat)
        engine.connect(tone, to: echo, format: vocal.processingFormat)
        engine.connect(echo, to: room, format: vocal.processingFormat)
        engine.connect(room, to: engine.mainMixerNode, format: vocal.processingFormat)
        engine.connect(music, to: engine.mainMixerNode, format: mr.processingFormat)
        mic.volume = voice; music.volume = backing
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
        let trim = AVAudioFramePosition(max(0, -offset) * vocal.processingFormat.sampleRate)
        guard trim < vocal.length else { throw APIError(status: 0, message: "녹음 길이가 너무 짧습니다.") }
        let when = AVAudioTime(sampleTime: AVAudioFramePosition(max(0, offset) * vocal.processingFormat.sampleRate), atRate: vocal.processingFormat.sampleRate)
        mic.scheduleSegment(vocal, startingFrame: trim, frameCount: AVAudioFrameCount(vocal.length - trim), at: when)
        music.scheduleFile(mr, at: nil)
        let output = folder.appendingPathComponent("AIFECT-cover.wav")
        let writer = try AVAudioFile(forWriting: output, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
        try engine.start(); mic.play(); music.play()
        defer { engine.stop() }
        let buffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: engine.manualRenderingMaximumFrameCount)!
        let length = AVAudioFramePosition(duration * 44100)
        var stalls = 0
        while engine.manualRenderingSampleTime < length {
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
            case .insufficientDataFromInputNode, .cannotDoInCurrentContext:
                stalls += 1
                if stalls > 100 { throw APIError(status: 0, message: "녹음 합성을 완료하지 못했습니다.") }
            case .error: throw APIError(status: 0, message: "녹음 합성에 실패했습니다.")
            @unknown default: throw APIError(status: 0, message: "지원하지 않는 오디오 상태입니다.")
            }
        }
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
    var volume: Float = 1 { didSet { engine?.mainMixerNode.outputVolume = min(1, max(0, volume)) } }
    func start(volume: Float) throws {
        stop()
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        guard outputs.contains(where: { [.headphones, .bluetoothHFP, .bluetoothA2DP, .usbAudio].contains($0.portType) }) else { throw APIError(status: 0, message: "청음은 이어폰을 연결하면 사용할 수 있어요.") }
        let engine = AVAudioEngine(), input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else { throw APIError(status: 0, message: "현재 오디오 연결에서는 청음을 사용할 수 없어요.") }
        engine.connect(input, to: engine.mainMixerNode, format: format)
        self.volume = min(1, max(0, volume)); engine.mainMixerNode.outputVolume = self.volume
        engine.prepare(); try engine.start(); self.engine = engine
    }
    func stop() { engine?.stop(); engine = nil }
}
