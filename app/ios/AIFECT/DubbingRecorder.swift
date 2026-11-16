import SwiftUI
import AVFoundation
import CryptoKit

struct DubbingWindow: Equatable {
    let cueStart: Double
    let start: Double
    let end: Double
    var duration: Double { end - start }
    var leadIn: Double { max(0, min(cueStart, start - 3)) }
    init(_ line: [String: Any]) throws {
        let start = line.number("start"), end = (line["recordEnd"] as? NSNumber)?.doubleValue ?? line.number("end")
        guard start.isFinite, end.isFinite, start >= 0, (0.1...48).contains(end - start) else {
            throw APIError(status: 0, message: "대사 녹음 시간을 확인해주세요.")
        }
        self.start = start; self.end = end
        let cue = (line["cueStart"] as? NSNumber)?.doubleValue ?? start
        cueStart = cue.isFinite ? max(0, min(cue, start)) : start
    }
}

/// The server accepts a canonical 44-byte, 48 kHz mono PCM16 WAV header.
/// AVAudioRecorder may include extra RIFF chunks; strip only metadata, never audio samples.
enum DubbingWAV {
    static func encode(pcm: Data) throws -> Data {
        guard pcm.count % 2 == 0, (9600...4_608_000).contains(pcm.count) else { throw failure }
        var result = Data()
        func word(_ n: UInt32, _ count: Int = 4) { for i in 0..<count { result.append(UInt8((n >> (i * 8)) & 255)) } }
        result.append(Data("RIFF".utf8)); word(UInt32(36 + pcm.count)); result.append(Data("WAVEfmt ".utf8))
        word(16); word(1, 2); word(1, 2); word(48000); word(96000); word(2, 2); word(16, 2)
        result.append(Data("data".utf8)); word(UInt32(pcm.count)); result.append(pcm)
        return result
    }
    static var failure: APIError { APIError(status: 0, message: "48kHz 모노 녹음 파일을 확인해주세요.") }
    static func canonical(_ raw: Data, maximum: Double, gain: Double = 1) throws -> Data {
        let bytes = [UInt8](raw)
        func value(_ at: Int, _ count: Int = 4) -> Int {
            (0..<count).reduce(0) { $0 | Int(bytes[at + $1]) << ($1 * 8) }
        }
        guard bytes.count >= 44, String(bytes: bytes[0..<4], encoding: .ascii) == "RIFF",
              String(bytes: bytes[8..<12], encoding: .ascii) == "WAVE", maximum.isFinite, (0.1...48).contains(maximum) else { throw failure }
        var at = 12, valid = false, pcm: Data?
        while at + 8 <= bytes.count {
            let size = value(at + 4), from = at + 8
            guard size <= bytes.count - from else { throw failure }
            let kind = String(bytes: bytes[at..<at + 4], encoding: .ascii)
            if kind == "fmt " {
                guard size >= 16 else { throw failure }
                valid = value(from, 2) == 1 && value(from + 2, 2) == 1 && value(from + 4) == 48000 && value(from + 14, 2) == 16
            }
            if kind == "data" { pcm = Data(bytes[from..<from + min(size, Int(floor(maximum * 48000)) * 2)]) }
            at = from + size + size % 2
        }
        guard valid, let pcm else { throw failure }
        return try encode(pcm: RecordingGain.pcm16(pcm, gain: gain))
    }
}

struct DubbingTake: Codable, Equatable {
    let id: String
    let duration: Double
    var uploaded: Bool = false
}

struct DubbingSavedLine: Codable { let line: String; let take: DubbingTake }

final class DubbingDrafts {
    let directory: URL
    private(set) var takes: [String: DubbingTake] = [:]
    private var saved: [String: DubbingTake] = [:]
    var changed: Bool { takes != saved }
    init(owner: String, project: String, sound: String, role: String, root: URL? = nil) throws {
        guard !owner.isEmpty, [project, sound, role].allSatisfy({ SiteWorkspace.validKey($0) }) else { throw DubbingWAV.failure }
        let hash = SHA256.hash(data: Data(owner.utf8)).map { String(format: "%02x", $0) }.joined()
        var base = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("DubbingDrafts")
        #if DEBUG
        if root == nil, FeedbackUIFixture.enabled { base = FeedbackUIFixture.dubbingScriptRoot.appendingPathComponent("Takes") }
        #endif
        directory = base.appendingPathComponent(hash).appendingPathComponent(project).appendingPathComponent(sound).appendingPathComponent(role)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var excluded = directory; var values = URLResourceValues(); values.isExcludedFromBackup = true; try excluded.setResourceValues(values)
        if let data = try? Data(contentsOf: directory.appendingPathComponent("takes.json")) {
            takes = try JSONDecoder().decode([String: DubbingTake].self, from: data).filter {
                SiteWorkspace.validKey($0.key) && SiteWorkspace.validKey($0.value.id) && FileManager.default.fileExists(atPath: directory.appendingPathComponent($0.value.id + ".wav").path)
            }
        }
        // Migrate the previous single manifest. Each subsequent line commits independently.
        for url in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? [] where url.lastPathComponent.hasPrefix("line-") && url.pathExtension == "json" {
            if let data = try? Data(contentsOf: url), let item = try? JSONDecoder().decode(DubbingSavedLine.self, from: data), SiteWorkspace.validKey(item.line), SiteWorkspace.validKey(item.take.id), FileManager.default.fileExists(atPath: directory.appendingPathComponent(item.take.id + ".wav").path) { takes[item.line] = item.take }
        }
        saved = takes
    }
    func file(_ take: DubbingTake) throws -> URL {
        guard SiteWorkspace.validKey(take.id) else { throw DubbingWAV.failure }
        return directory.appendingPathComponent(take.id + ".wav")
    }
    func commit(line: String, take: DubbingTake) throws {
        guard SiteWorkspace.validKey(line), FileManager.default.fileExists(atPath: try file(take).path) else { throw DubbingWAV.failure }
        takes[line] = take
    }
    func save() throws {
        for (line, take) in takes where saved[line] != take { try persist(line: line, take: take) }
        saved = takes; cleanup()
    }
    private func persist(line: String, take: DubbingTake) throws {
        try JSONEncoder().encode(DubbingSavedLine(line: line, take: take)).write(to: directory.appendingPathComponent("line-" + line + ".json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func commitDurably(line: String, take: DubbingTake) async throws {
        guard SiteWorkspace.validKey(line), FileManager.default.fileExists(atPath: try file(take).path) else { throw DubbingWAV.failure }
        let url = directory.appendingPathComponent("line-" + line + ".json")
        try await Task.detached(priority: .userInitiated) {
            try JSONEncoder().encode(DubbingSavedLine(line: line, take: take)).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }.value
        takes[line] = take; saved[line] = take
    }
    func uploaded(line: String, takeID: String) throws {
        guard takes[line]?.id == takeID else { return }; takes[line]?.uploaded = true; try save()
    }
    func discard() { takes = saved; cleanup() }
    private func cleanup() {
        let keep = Set((Array(takes.values) + Array(saved.values)).map { $0.id + ".wav" })
        for url in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? [] where url.pathExtension == "wav" && !keep.contains(url.lastPathComponent) { try? FileManager.default.removeItem(at: url) }
    }
}

@MainActor final class DubbingAudio: NSObject, ObservableObject {
    @Published var running = false
    @Published var capturing = false
    @Published var countdown = 0
    @Published var elapsed = 0.0
    @Published var timelinePosition = 0.0
    @Published var microphoneGain = 1.0
    @Published var level = 0.0
    @Published var status = ""
    @Published var error: String?
    @Published var previewing = false
    @Published private(set) var backgroundVolume = 1.0
    @Published private(set) var previewVolume = 1.0
    private(set) var background: AVAudioPlayer?
    private(set) var preview: AVAudioPlayer?
    private var recorder: AVAudioRecorder?
    private var job: Task<Void, Never>?
    private var finishRequested = false
    private var previewRevision = 0
    private var observers: [NSObjectProtocol] = []
    override init() {
        super.init()
        for name in [AVAudioSession.interruptionNotification, AVAudioSession.routeChangeNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: AVAudioSession.sharedInstance(), queue: .main) { [weak self] notification in
                let interruption = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue
                let disconnected = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue
                if interruption || disconnected { Task { @MainActor in self?.cancel(); self?.status = "오디오 연결이 바뀌어 중단됐어요. 완료한 대사는 보관됩니다." } }
            })
        }
    }
    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }
    // Playback gain only: keep the recorded PCM and the server mix unchanged.
    func setBackgroundVolume(_ value: Double) {
        backgroundVolume = value.isFinite ? min(1, max(0, value)) : 1
        background?.volume = Float(backgroundVolume)
    }
    func setPreviewVolume(_ value: Double) {
        previewVolume = value.isFinite ? min(1, max(0, value)) : 1
        preview?.volume = Float(previewVolume)
    }
    func prepare(path: String, api: API? = nil) async throws {
        let data = try await (api ?? .shared).request(path)
        try Task.checkCancellation()
        let player = try AVAudioPlayer(data: data); guard player.prepareToPlay() else { throw DubbingWAV.failure }
        player.volume = Float(backgroundVolume)
        background = player; status = "배경 음향 준비 완료"
    }
    func cancel() { previewRevision += 1; job?.cancel(); recorder?.stop(); background?.stop(); preview?.stop(); previewing = false }
    func finish() { if capturing { finishRequested = true } else { cancel() } }
    func listen(path: String? = nil, file: URL? = nil) async throws {
        guard !running else { return }; cancel(); error = nil; let revision = previewRevision
        let player: AVAudioPlayer
        if let file { player = try AVAudioPlayer(contentsOf: file) }
        else if let path { player = try AVAudioPlayer(data: try await API.shared.request(path)) }
        else { return }
        try Task.checkCancellation()
        guard revision == previewRevision else { throw CancellationError() }
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try AVAudioSession.sharedInstance().setActive(true)
        player.volume = Float(previewVolume)
        preview = player; player.delegate = self; previewing = player.play()
    }
    func record(line: [String: Any], drafts: DubbingDrafts, completed: @escaping () -> Void) {
        record(lines: [line], drafts: drafts, selected: { _ in }, completed: completed)
    }
    func record(lines: [[String: Any]], drafts: DubbingDrafts, selected: @escaping (String) -> Void, completed: @escaping () -> Void) {
        guard !running else { return }
        cancel(); running = true; finishRequested = false; elapsed = 0; error = nil
        job = Task { [weak self] in
            guard let self else { return }
            var raw: URL?
            defer {
                recorder?.stop(); recorder = nil; background?.stop(); running = false; capturing = false; countdown = 0; level = 0
                if let raw { try? FileManager.default.removeItem(at: raw) }
            }
            do {
                guard !lines.isEmpty else { throw DubbingWAV.failure }
                let windows = try lines.map { try DubbingWindow($0) }
                for index in windows.indices.dropFirst() {
                    guard windows[index].start >= windows[index - 1].end else { throw DubbingWAV.failure }
                }
                let window = windows[0]
                let allowed = await AVAudioApplication.requestRecordPermission()
                try Task.checkCancellation()
                guard allowed else { throw APIError(status: 0, message: "설정에서 AIFECT의 마이크 권한을 허용해주세요.") }
                guard let background else { throw APIError(status: 0, message: "배경 음향을 먼저 준비해주세요.") }
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
                try session.setActive(true)
                @MainActor func prepareInput(_ take: DubbingTake) throws -> AVAudioRecorder {
                    raw = drafts.directory.appendingPathComponent(take.id + ".raw.wav")
                    let input = try AVAudioRecorder(url: raw!, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
                    guard input.prepareToRecord() else { throw DubbingWAV.failure }
                    recorder = input; input.isMeteringEnabled = true
                    return input
                }
                let firstTake = DubbingTake(id: UUID().uuidString, duration: 0)
                let firstInput = try prepareInput(firstTake)
                background.currentTime = window.leadIn
                let lead = window.start - window.leadIn
                let silence = max(0, 3 - lead)
                let began = ProcessInfo.processInfo.systemUptime
                var playing = false
                selected(lines[0].string("id"))
                while true {
                    try Task.checkCancellation()
                    let passed = ProcessInfo.processInfo.systemUptime - began
                    if !playing && passed >= silence {
                        guard background.play() else { throw APIError(status: 0, message: "배경 음향을 재생하지 못했어요.") }; playing = true
                    }
                    let remaining = playing ? window.start - background.currentTime : 3 - passed
                    // A line at 0s must start its background before the countdown can finish.
                    if playing && remaining <= 0.015 { break }
                    guard passed < max(3, lead) + 10 else { throw APIError(status: 0, message: "배경 음향 재생이 지연됐어요. 다시 시작해주세요.") }
                    countdown = remaining <= 3 ? max(1, Int(ceil(remaining))) : 0
                    status = countdown > 0 ? "시작 준비" : "효과음 듣는 중"
                    try await Task.sleep(for: .milliseconds(10))
                }
                for (index, line) in lines.enumerated() {
                    let segment = windows[index]
                    let take = index == 0 ? firstTake : DubbingTake(id: UUID().uuidString, duration: 0)
                    let input = index == 0 ? firstInput : try prepareInput(take)
                    let target = try drafts.file(take)
                    selected(line.string("id")); elapsed = 0
                    let waiting = ProcessInfo.processInfo.systemUptime
                    let maximumWait = max(0, segment.start - background.currentTime) + 10
                    while background.currentTime < segment.start - 0.015 {
                        try Task.checkCancellation()
                        guard !finishRequested else { return }
                        guard ProcessInfo.processInfo.systemUptime - waiting < maximumWait else { throw APIError(status: 0, message: "배경 음향이 중단됐어요. 완료한 대사는 보관됩니다.") }
                        let remaining = segment.start - background.currentTime
                        countdown = 0; timelinePosition = background.currentTime
                        status = "다음 내 대사까지 \(Int(ceil(remaining)))초"
                        try await Task.sleep(for: .milliseconds(10))
                    }
                    try Task.checkCancellation()
                    countdown = 0; capturing = true; status = "녹음 중 · \(index + 1) / \(lines.count)"
                    guard input.record() else { throw APIError(status: 0, message: "마이크를 시작하지 못했어요.") }
                    let microphoneBegan = ProcessInfo.processInfo.systemUptime
                    while input.isRecording && input.currentTime < segment.duration && !finishRequested {
                        guard ProcessInfo.processInfo.systemUptime - microphoneBegan < segment.duration + 5 else { throw APIError(status: 0, message: "마이크 입력이 멈췄어요. 완료한 대사는 보관됩니다.") }
                        timelinePosition = background.currentTime
                        try Task.checkCancellation(); elapsed = input.currentTime; input.updateMeters()
                        level = min(1, pow(10, Double(input.averagePower(forChannel: 0)) / 20) * 5)
                        try await Task.sleep(for: .milliseconds(20))
                    }
                    try Task.checkCancellation()
                    input.stop(); capturing = false; recorder = nil
                    let source = raw!, gain = microphoneGain
                    let data = try await Task.detached(priority: .userInitiated) {
                        let bytes = try DubbingWAV.canonical(Data(contentsOf: source), maximum: segment.duration, gain: gain)
                        try bytes.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                        return bytes
                    }.value
                    let recorded = DubbingTake(id: take.id, duration: Double(data.count - 44) / 96000)
                    try await drafts.commitDurably(line: line.string("id"), take: recorded)
                    try? FileManager.default.removeItem(at: raw!); raw = nil
                    elapsed = recorded.duration; completed()
                    if finishRequested { break }
                }
                status = "이 기기에 저장했어요"
            } catch is CancellationError { status = "녹음을 중단했어요. 이전 녹음은 그대로 남아 있어요." }
            catch { self.error = error.localizedDescription }
        }
    }
}
extension DubbingAudio: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { Task { @MainActor in if preview === player { previewing = false } } }
}

@MainActor final class DubbingRecordingSession: ObservableObject {
    @Published var view: [String: Any] = [:]
    @Published var busy = false
    @Published var error: String?
    @Published var message = ""
    @Published var progress: Double?
    @Published var revision = 0
    private(set) var drafts: DubbingDrafts?
    let owner: String, projectID: String, roleID: String
    let api: API
    private let sessionRevision: Int
    private let draftRoot: URL?
    private var saveRequested = false
    var path: String { "/api/dubbing/projects/" + Endpoint.pathID(projectID) }
    var own: [String: Any] { view.object("recording").objects("roles").first { $0.string("roleId") == roleID } ?? [:] }
    var lines: [[String: Any]] { view.objects("lines").filter { $0.string("roleId") == roleID } }
    var submitted: Bool { own.string("state") == "submitted" }
    var complete: Int { lines.filter { !$0.string("takeId").isEmpty || drafts?.takes[$0.selfID] != nil }.count }
    init(owner: String, project: String, role: String, api: API? = nil, draftRoot: URL? = nil) {
        self.owner = owner; projectID = project; roleID = role; self.draftRoot = draftRoot; self.api = api ?? .shared; sessionRevision = self.api.sessionRevision
    }
    func check() throws { try Task.checkCancellation(); guard sessionRevision == api.sessionRevision else { throw CancellationError() } }
    func prepare(sound: [String: Any], audio: DubbingAudio) async {
        while busy || saveRequested { do { try await Task.sleep(for: .milliseconds(100)) } catch { return } }
        guard !Task.isCancelled else { return }
        busy = true; error = nil; defer { busy = false }
        do {
            var sound = sound
            if sound.string("state") == "not_started" || sound.isEmpty { sound = try await api.call(path + "/recording/prepare", method: "POST", body: [:]).object("sound") }
            for _ in 0..<36 where ["queued", "planning", "generating", "mixing"].contains(sound.string("state")) {
                message = "배경 음향을 준비하고 있어요"; try await Task.sleep(for: .seconds(5)); try check()
                sound = try await api.call(path + "/sound").object("sound")
            }
            guard sound.string("state") == "ready", !sound.string("id").isEmpty else { throw APIError(status: 0, message: sound.string("error", fallback: "배경 음향 준비 상태를 다시 확인해주세요.")) }
            try check()
            view = try await api.call(path + "/recording/" + Endpoint.pathID(roleID) + "/start", method: "POST", body: ["soundId": sound.string("id")])
            try check()
            // Keep completed local work even when the following background download fails.
            drafts = try DubbingDrafts(owner: owner, project: projectID, sound: sound.string("id"), role: roleID, root: draftRoot)
            try await audio.prepare(path: path + "/background", api: api); try check(); message = "대사를 선택해 녹음하세요"
            if let drafts, FileManager.default.fileExists(atPath: drafts.directory.appendingPathComponent("pending-upload").path) { try await saveAll(); try? FileManager.default.removeItem(at: drafts.directory.appendingPathComponent("pending-upload")) }
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private static var active: [String: DubbingRecordingSession] = [:]
    static func shared(owner: String, project: String, role: String) -> DubbingRecordingSession {
        let key = "\(API.shared.sessionRevision)|\(owner)|\(project)|\(role)"
        if let existing = active[key], existing.busy || existing.saveRequested { return existing }
        return DubbingRecordingSession(owner: owner, project: project, role: role)
    }
    func startSave(submit: Bool) {
        guard !busy && !saveRequested else { return }
        let key = "\(sessionRevision)|\(owner)|\(projectID)|\(roleID)"
        do { if let drafts { try Data().write(to: drafts.directory.appendingPathComponent("pending-upload"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) } }
        catch { self.error = error.localizedDescription; return }
        Self.active[key] = self
        saveRequested = true
        Task {
            defer { saveRequested = false }
            var lease = UIBackgroundTaskIdentifier.invalid
            lease = UIApplication.shared.beginBackgroundTask(withName: "더빙 저장") { if lease != .invalid { UIApplication.shared.endBackgroundTask(lease); lease = .invalid } }
            await save(submit: submit)
            if lease != .invalid { UIApplication.shared.endBackgroundTask(lease) }
            if error == nil, let drafts { try? FileManager.default.removeItem(at: drafts.directory.appendingPathComponent("pending-upload")) }
            if Self.active[key] === self { Self.active[key] = nil }
        }
    }
    func pendingLines(from index: Int) -> [[String: Any]] {
        Array(lines.dropFirst(max(0, index))).filter { $0.string("takeId").isEmpty && drafts?.takes[$0.selfID] == nil }
    }
    func saveAll() async throws {
        guard let drafts else { throw DubbingWAV.failure }; try check(); try drafts.save()
        view = try await api.call(path + "/recording")
        var uploadedCount = 0
        let total = lines.filter { drafts.takes[$0.selfID] != nil }.count
        message = "서버 저장 0/\(total)"
        for line in lines {
            try check()
            guard let take = drafts.takes[line.selfID] else { continue }
            if line.string("takeId") == take.id { try drafts.uploaded(line: line.selfID, takeID: take.id); uploadedCount += 1; message = "서버 저장 \(uploadedCount)/\(total)"; continue }
            if take.uploaded { throw APIError(status: 409, message: "다른 기기에서 녹음이 변경됐어요. 새로 녹음하거나 저장 상태를 확인해주세요.") }
            // The authoritative server snapshot decides whether an interrupted upload already succeeded.
            let endpoint = path + "/recording/" + Endpoint.pathID(roleID) + "/lines/" + Endpoint.pathID(line.selfID) + "?revision=\(own.int("revision"))&take=" + Endpoint.query(take.id)
            let data = try await api.request(endpoint, method: "PUT", bytes: Data(contentsOf: drafts.file(take)), type: "audio/wav", progress: { [weak self] in self?.progress = $0 })
            try check()
            guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw DubbingWAV.failure }
            view = result; try drafts.uploaded(line: line.selfID, takeID: take.id); revision += 1
            uploadedCount += 1; message = "서버 저장 \(uploadedCount)/\(total)"
        }
        message = "모든 녹음을 임시 저장했어요"
    }
    func save(submit: Bool) async {
        guard !busy else { return }; busy = true; error = nil; defer { busy = false; progress = nil }
        do {
            try await saveAll()
            if submit && !submitted {
                try check()
                view = try await api.call(path + "/recording/" + Endpoint.pathID(roleID) + "/submit", method: "POST", body: ["revision": own.int("revision"), "rightsAccepted": true])
                message = "제출했어요. 모든 배역이 완료되면 더빙이 합성돼요."
            }
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct NativeDubbingRecorder: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scene
    let project: [String: Any]
    let role: [String: Any]
    @StateObject private var session: DubbingRecordingSession
    @StateObject private var audio = DubbingAudio()
    @State private var selected = 0
    @State private var expanded = false
    @State private var confirmSubmit = false
    @State private var confirmLeave = false
    @State private var leaving = false
    @State private var continuous = false
    @State private var confirmOverwrite = false
    @State private var showVolume = false
    init(owner: String, project: [String: Any], role: [String: Any]) {
        self.project = project; self.role = role
        _session = StateObject(wrappedValue: DubbingRecordingSession.shared(owner: owner, project: project.selfID, role: role.selfID))
    }
    private var current: [String: Any]? { session.lines.indices.contains(selected) ? session.lines[selected] : nil }
    private var script: [[String: Any]] { project.object("script").objects("lines").sorted { $0.int("order") < $1.int("order") } }
    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                DubbingCover(row: project).frame(width: 56, height: 56).clipped().clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 6) {
                    Text(project.string("title")).font(.headline).lineLimit(1)
                    Text("내 대사 \(session.complete) / \(session.lines.count) · \(session.submitted ? "제출 완료" : "대사를 선택해 녹음하세요")").font(.caption).foregroundStyle(AifectDesign.muted)
                }; Spacer()
            }.padding(.horizontal, 16)
            Picker("녹음 방식", selection: $continuous) {
                Text("한 파트씩").tag(false); Text("이어서 녹음").tag(true)
            }.pickerStyle(.segmented).padding(.horizontal, 16).disabled(audio.running || session.busy)
            HStack(spacing: 8) {
                Text(continuous ? "녹음하지 않은 내 대사만 이어서 녹음해요" : "대사 하나씩 녹음하고 확인해요").font(.caption).foregroundStyle(AifectDesign.muted)
                Spacer(minLength: 0)
                Button { showVolume = true } label: { Label("마이크", systemImage: "mic").font(.subheadline).fixedSize().frame(minWidth: 60, minHeight: 44).contentShape(Rectangle()) }
                    .accessibilityLabel("더빙 볼륨 조절").accessibilityIdentifier("dubbing-volume-open")
            }.padding(.horizontal, 16)
            if session.busy { HStack { ProgressView().tint(Brand.pink); Text(session.message).font(.caption) } }
            if let error = session.error ?? audio.error { Text(error).font(.caption).foregroundStyle(AifectDesign.muted).padding(.horizontal) }
            if session.drafts == nil || session.error != nil {
                Button("준비 상태 확인") { Task { await session.prepare(sound: project.object("sound"), audio: audio) } }.disabled(session.busy)
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        let at = script.firstIndex { $0.selfID == current?.selfID } ?? 0
                        let from = max(0, min(at - 1, script.count - 4))
                        ForEach(expanded ? script : Array(script.dropFirst(from).prefix(4)), id: \.selfID) { line in
                            scriptCard(line).id(line.selfID)
                        }
                        if script.count > 4 { Button(expanded ? "대본 접기" : "전체 대본 펼쳐보기") { expanded.toggle() }.frame(minHeight: 44) }
                    }.padding(.horizontal, 16)
                }.accessibilityIdentifier("native-dubbing-script")
                .onChange(of: selected) { _, _ in if expanded, let current { withAnimation { proxy.scrollTo(current.selfID, anchor: .center) } } }
            }
            controls.padding(.horizontal, 16).padding(.bottom, 12)
        }.navigationTitle(role.string("name") + " · 녹음").navigationBarTitleDisplayMode(.inline)
            .modifier(FullScreenWorkspace()).navigationBarBackButtonHidden()
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button { leave() } label: { Image(systemName: "chevron.left").accessibilityLabel("뒤로") } } }
            .task { model.player.pause(); await session.prepare(sound: project.object("sound"), audio: audio); selected = session.lines.firstIndex { $0.string("takeId").isEmpty && session.drafts?.takes[$0.selfID] == nil } ?? 0 }
            .onChange(of: scene) { _, phase in if phase != .active { audio.cancel(); do { try session.drafts?.save() } catch { session.error = error.localizedDescription } } }
            .onChange(of: audio.running) { _, running in if leaving && !running { leaving = false; leave() } }
            .onDisappear { audio.cancel() }
            .sheet(isPresented: $showVolume) { DubbingVolumeControls(audio: audio) }
            .alert("진행사항을 저장할까요?", isPresented: $confirmLeave) {
                Button("저장하고 나가기") { do { try session.drafts?.save(); dismiss() } catch { session.error = error.localizedDescription } }
                Button("저장 안 함", role: .destructive) { session.drafts?.discard(); dismiss() }
                Button("계속 작업하기", role: .cancel) { }
            } message: { Text("저장하면 이 기기에서 이어서 작업할 수 있어요.") }
            .alert("녹음한 대사를 다시 녹음할까요?", isPresented: $confirmOverwrite) {
                Button("다시 녹음") { beginRecording() }; Button("취소", role: .cancel) { }
            } message: { Text("선택한 대사부터 새로 녹음합니다. 각 대사를 완료할 때 해당 대사만 바뀌고, 중단한 대사는 기존 녹음이 유지됩니다.") }
            .alert("모든 대사를 제출할까요?", isPresented: $confirmSubmit) {
                Button("동의하고 제출") { session.startSave(submit: true) }
                Button("취소", role: .cancel) { }
            } message: { Text("내 음성을 함께 만든 더빙 작품으로 공개하는 데 동의합니다. 제출한 녹음은 수정할 수 없어요.") }
    }
    private func beginRecording() {
        guard let current, let drafts = session.drafts else { return }
        let lines = continuous ? session.pendingLines(from: selected) : [current]
        guard !lines.isEmpty else { session.message = "내 대사를 모두 녹음했어요."; return }
        session.message = ""
        audio.record(lines: lines, drafts: drafts, selected: { id in
            selected = session.lines.firstIndex { $0.selfID == id } ?? selected
        }, completed: { session.revision += 1 })
    }
    private func leave() { guard !audio.running else { leaving = true; audio.finish(); return }; if session.drafts?.changed == true { confirmLeave = true } else { dismiss() } }
    private func scriptCard(_ line: [String: Any]) -> some View {
        let own = line.string("roleId") == role.selfID, active = line.selfID == current?.selfID
        let roles = project.objects("roles"), index = roles.firstIndex { $0.selfID == line.string("roleId") } ?? 0
        let color = DubbingPalette.color(index)
        let take = session.drafts?.takes[line.selfID]
        let remote = session.lines.first { $0.selfID == line.selfID }?.string("takeId") ?? ""
        return Button {
            audio.cancel(); selected = session.lines.firstIndex { $0.selfID == line.selfID } ?? selected
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Text(roles.indices.contains(index) ? roles[index].string("name") : line.string("roleId"))
                    .font(.caption.bold()).foregroundStyle(color).padding(7).background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 6) {
                    Text(line.string("text")).font(.system(size: 15, weight: active ? .semibold : .regular)).foregroundStyle(active ? Color.white : AifectDesign.secondaryText)
                    if take != nil || !remote.isEmpty { Label(take?.uploaded == true || !remote.isEmpty ? "임시 저장됨" : "이 기기에 저장됨", systemImage: "checkmark.circle").font(.caption2).foregroundStyle(Brand.aqua) }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(active ? AifectDesign.violet : AifectDesign.stroke, lineWidth: active ? 1.5 : 1))
        }.buttonStyle(.plain).disabled(!own || session.busy || audio.running).accessibilityIdentifier("dubbing-script-" + line.selfID)
    }
    @ViewBuilder private var controls: some View {
        if let current {
            let take = session.drafts?.takes[current.selfID]
            let canListen = take != nil || !current.string("audioUrl").isEmpty
            VStack(spacing: 10) {
                if audio.countdown > 0 {
                    Button { audio.finish() } label: { Text("\(audio.countdown)").font(.system(size: 46, weight: .bold)).frame(width: 108, height: 108).background(Brand.card, in: Circle()).overlay(Circle().stroke(AifectDesign.violet, lineWidth: 3)) }.accessibilityLabel("녹음 준비 취소")
                } else if audio.running {
                    DubbingRecordingProgress(title: audio.capturing ? "녹음 중..." : audio.status, elapsed: audio.capturing ? audio.elapsed : audio.timelinePosition, total: audio.capturing ? ((try? DubbingWindow(current).duration) ?? 0) : (audio.background?.duration ?? 0), live: audio.capturing, complete: false)
                    Button { audio.finish() } label: { RoundedRectangle(cornerRadius: 5).fill(AifectDesign.secondaryText).frame(width: 24, height: 24).frame(width: 72, height: 72).overlay(Circle().stroke(AifectDesign.violet, lineWidth: 2)) }
                        .buttonStyle(.plain).accessibilityLabel(audio.capturing ? "이 대사 마치기" : "녹음 준비 취소").accessibilityIdentifier("dubbing-record-line")
                } else {
                    if canListen {
                        DubbingRecordingProgress(title: "녹음 완료", elapsed: take?.duration ?? current.number("duration"), total: (try? DubbingWindow(current).duration) ?? 0, live: false, complete: true)
                    }
                    HStack {
                        if !session.submitted {
                            DubbingControlButton(title: continuous ? "연속 녹음 시작" : canListen ? "다시 녹음" : "녹음하기", filled: !canListen) {
                                if continuous && session.pendingLines(from: selected).isEmpty { session.message = "내 대사를 모두 녹음했어요. 한 파트씩에서 다시 녹음할 수 있어요." }
                                else { beginRecording() }
                            }.disabled(session.busy || session.drafts == nil || session.error != nil).accessibilityIdentifier("dubbing-record-line")
                        }
                        if canListen {
                            DubbingControlButton(title: audio.previewing ? "재생 정지" : "녹음 확인", filled: true) {
                                if audio.previewing { audio.cancel() }
                                else { Task { do { try await audio.listen(path: take == nil ? current.string("audioUrl") : nil, file: try take.flatMap { try session.drafts?.file($0) }) } catch is CancellationError { } catch { audio.error = error.localizedDescription } } }
                            }.disabled(session.busy)
                        }
                    }
                }
                Text(session.message.isEmpty ? audio.status : session.message).font(.caption).foregroundStyle(AifectDesign.muted).lineLimit(2)
                HStack {
                    Button("이전") { audio.cancel(); selected -= 1 }.disabled(selected == 0 || audio.running || session.busy)
                    Spacer(); Text("\(selected + 1) / \(session.lines.count)").font(.caption.monospacedDigit()); Spacer()
                    Button("다음") { audio.cancel(); selected += 1 }.disabled(selected + 1 >= session.lines.count || audio.running || session.busy)
                }.frame(minHeight: 40)
                if let progress = session.progress { ProgressView(value: progress); Text("업로드 \(Int(progress * 100))%").font(.caption) }
                if !session.submitted {
                    HStack {
                        DubbingControlButton(title: "임시 저장", filled: false) { audio.cancel(); session.startSave(submit: false) }.accessibilityIdentifier("dubbing-save-all")
                        DubbingControlButton(title: "전체 제출", filled: true) { audio.cancel(); confirmSubmit = true }.disabled(session.lines.isEmpty || session.complete != session.lines.count)
                    }.disabled(session.busy || audio.running || session.drafts == nil)
                }
            }
        }
    }
}

private struct DubbingVolumeControls: View {
    @ObservedObject var audio: DubbingAudio
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    volume("마이크 입력", icon: "mic", value: $audio.microphoneGain, id: "dubbing-microphone-gain", maximum: 2)
                    volume("배경 음향", icon: "music.note", value: Binding(get: { audio.backgroundVolume }, set: audio.setBackgroundVolume), id: "dubbing-background-volume")
                    volume("녹음한 목소리 듣기", icon: "waveform", value: Binding(get: { audio.previewVolume }, set: audio.setPreviewVolume), id: "dubbing-preview-volume")
                    Text("마이크 입력은 저장되는 목소리 크기예요. 배경과 녹음 듣기 음량은 재생에만 적용돼요.")
                        .font(.caption).foregroundStyle(AifectDesign.muted)
                }.padding(20)
            }.background(Brand.background).navigationTitle("더빙 볼륨").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { dismiss() } } }
        }.tint(AifectDesign.violet).preferredColorScheme(.dark)
            .presentationDetents([.height(440), .large]).presentationDragIndicator(.visible)
    }
    private func volume(_ title: String, icon: String, value: Binding<Double>, id: String, maximum: Double = 1) -> some View {
        VStack(spacing: 8) {
            HStack {
                Label(title, systemImage: icon).font(.subheadline)
                Spacer()
                Text("\(Int((value.wrappedValue * 100).rounded()))%").font(.subheadline.monospacedDigit()).accessibilityIdentifier(id + "-value")
            }
            Slider(value: value, in: 0...maximum, step: 0.01).disabled(id == "dubbing-microphone-gain" && audio.running).accessibilityLabel(title)
                .accessibilityValue("\(Int((value.wrappedValue * 100).rounded()))%")
                .accessibilityIdentifier(id)
        }
    }
}

enum DubbingPalette {
    static func color(_ index: Int) -> Color { Color(aifectHex: [0xA7C9FF, 0xF4B1D3, 0x9DE1C7, 0xF1D38F, 0xCFB5F5, 0xFFB6A1][max(0, index) % 6]) }
}

struct DubbingBadge: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text).font(.system(size: 11, weight: .semibold)).lineLimit(1).foregroundStyle(color).padding(.horizontal, 7).padding(.vertical, 2)
            .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(color.opacity(0.45)))
    }
}

struct DubbingControlButton: View {
    @Environment(\.isEnabled) private var enabled
    let title: String
    let filled: Bool
    var icon: String? = nil
    var minHeight: CGFloat = 52
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) { if let icon { Image(systemName: icon) }; Text(title) }.font(.system(size: 15, weight: .semibold)).frame(maxWidth: .infinity, minHeight: minHeight)
                .foregroundStyle(filled ? Brand.background : AifectDesign.secondaryText)
                .background(filled ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Brand.card.opacity(0.45)), in: RoundedRectangle(cornerRadius: 26))
                .overlay(RoundedRectangle(cornerRadius: 26).stroke(filled ? .clear : AifectDesign.stroke))
                .contentShape(RoundedRectangle(cornerRadius: 26))
        }.buttonStyle(.plain).opacity(enabled ? 1 : 0.45)
    }
}

private struct DubbingRecordingProgress: View {
    let title: String
    let elapsed: Double
    let total: Double
    let live: Bool
    let complete: Bool
    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                if live { Circle().fill(Color(red: 1, green: 0.35, blue: 0.43)).frame(width: 10, height: 10) }
                if complete { Image(systemName: "checkmark.circle").foregroundStyle(Brand.aqua) }
                Text(title).font(.system(size: 15, weight: .semibold)).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                Text(String(format: "%.1f / %.1f초", elapsed, total)).font(.system(size: 14)).foregroundStyle(AifectDesign.muted).monospacedDigit()
            }
            GeometryReader { geometry in
                Capsule().fill(AifectDesign.stroke).overlay(alignment: .leading) { Capsule().fill(AifectDesign.violet).frame(width: geometry.size.width * (complete ? 1 : live ? min(1, max(0, elapsed / max(0.1, total))) : 0)) }
            }.frame(height: 8).accessibilityLabel("녹음 진행률").accessibilityValue("\(Int((complete ? 1 : min(1, max(0, elapsed / max(0.1, total)))) * 100))%")
        }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke))
    }
}
