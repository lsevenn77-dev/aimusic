import SwiftUI
import CryptoKit
import Combine

@MainActor final class DubbingScriptEditorModel: ObservableObject {
    @Published var options: [String: Any] = ["genres": ["일상"], "roleCount": 2, "minutes": 1.0, "mood": "랜덤", "ending": "랜덤", "idea": ""]
    @Published var script: [String: Any] = [:]
    @Published var generation: [String: Any] = [:]
    @Published var config: [String: Any] = [:]
    @Published var proposal: [String: Any] = [:]
    @Published var title = ""
    @Published var manualText = ""
    @Published var busy = false
    @Published var canRetryGeneration = false
    @Published var error: String?
    private(set) var generationID = ""
    private(set) var projectID = UUID().uuidString
    @Published var selectedSceneID = ""
    @Published var editingLineID = ""
    @Published var collapsedScenes: Set<String> = []
    @Published var importSource = ""
    @Published var unresolved: [[String: Any]] = []
    @Published var saveState = "기기에 자동 저장"
    @Published var conflict = false
    @Published var undoAvailable = false
    private var undoScripts: [[String: Any]] = []
    private var autosave: AnyCancellable?
    private var existing: [String: Any]?
    private var baseRevision = 0
    private static let disk = DispatchQueue(label: "kr.co.aifect.script-drafts", qos: .utility)
    private let file: URL
    private let sessionRevision: Int
    private let api: API
    private var savedSnapshot = Data()
    private(set) var closed = false
    private var snapshot: Data { (try? JSONSerialization.data(withJSONObject: ["options": options, "script": script, "title": title, "manualText": manualText, "generationID": generationID], options: [.sortedKeys])) ?? Data() }
    var hasChanges: Bool { snapshot != savedSnapshot }
    var pending: Bool { generation.string("state") == "running" }
    init(owner: String, existing: [String: Any]?, api: API? = nil, root: URL? = nil) {
        self.existing = existing; self.api = api ?? .shared; sessionRevision = self.api.sessionRevision
        let hash = SHA256.hash(data: Data((owner + "|" + (existing?.selfID ?? "new")).utf8)).map { String(format: "%02x", $0) }.joined()
        var storage = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("DubbingScripts")
        #if DEBUG
        if root == nil, FeedbackUIFixture.enabled { storage = FeedbackUIFixture.dubbingScriptRoot }
        #endif
        file = storage.appendingPathComponent(hash + ".json")
        if let existing { options = existing.object("options"); script = existing.object("script"); projectID = existing.selfID; baseRevision = existing.int("revision") }
        if let bytes = try? Data(contentsOf: file), let cached = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
            conflict = existing != nil && cached.int("baseRevision") != existing?.int("revision")
            baseRevision = cached.int("baseRevision")
            options = cached.object("options"); script = cached.object("script"); generation = cached.object("generation")
            generationID = cached.string("generationID"); projectID = cached.string("projectID", fallback: projectID)
            title = cached.string("title"); manualText = cached.string("manualText")
            editingLineID = cached.string("editingLineID"); selectedSceneID = cached.string("selectedSceneID"); collapsedScenes = Set(cached["collapsedScenes"] as? [String] ?? [])
            importSource = cached.string("importSource"); unresolved = cached.objects("unresolved")
        }
        savedSnapshot = snapshot
        let updates = [$script.map { _ in () }.dropFirst().eraseToAnyPublisher(), $options.map { _ in () }.dropFirst().eraseToAnyPublisher(),
            $title.map { _ in () }.dropFirst().eraseToAnyPublisher(), $manualText.map { _ in () }.dropFirst().eraseToAnyPublisher(),
            $editingLineID.map { _ in () }.dropFirst().eraseToAnyPublisher(), $selectedSceneID.map { _ in () }.dropFirst().eraseToAnyPublisher(), $collapsedScenes.map { _ in () }.dropFirst().eraseToAnyPublisher(),
            $unresolved.map { _ in () }.dropFirst().eraseToAnyPublisher()]
        autosave = Publishers.MergeMany(updates).debounce(for: .milliseconds(700), scheduler: RunLoop.main).sink { [weak self] in self?.automaticSave() }
    }
    func check() throws { try Task.checkCancellation(); guard api.sessionRevision == sessionRevision else { throw CancellationError() } }
    private func draftData() throws -> Data {
        try JSONSerialization.data(withJSONObject: ["options": options, "script": script, "generation": generation, "generationID": generationID,
            "projectID": projectID, "title": title, "manualText": manualText, "baseRevision": baseRevision, "selectedSceneID": selectedSceneID,
            "editingLineID": editingLineID, "collapsedScenes": Array(collapsedScenes), "importSource": importSource, "unresolved": unresolved])
    }
    nonisolated private static func write(_ data: Data, to file: URL) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func automaticSave() {
        guard !closed else { return }
        do {
            let data = try draftData(), target = file
            saveState = "기기에 저장 중…"
            Self.disk.async { [weak self] in
                let result = Result { try Self.write(data, to: target) }
                Task { @MainActor in
                    guard let self, !self.closed else { return }
                    switch result { case .success: self.saveState = "기기 자동 저장 완료"; case .failure: self.saveState = "저장 실패 · 다시 시도" }
                }
            }
        } catch { saveState = "저장 실패 · 다시 시도"; self.error = error.localizedDescription }
    }
    func persist() throws {
        guard !closed else { return }
        let data = try draftData(), target = file
        try Self.disk.sync { try Self.write(data, to: target) }
        saveState = "기기 자동 저장 완료"
    }
    func saveDraft() throws { try persist(); savedSnapshot = snapshot }
    func discardDraft() throws {
        guard !busy, !pending else { throw APIError(status: 0, message: "진행 중인 요청은 저장하고 나간 뒤 결과를 확인해주세요.") }
        try Self.disk.sync { if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) } }
        closed = true
    }
    func cache() { do { try persist() } catch { self.error = error.localizedDescription } }
    func load() async {
        do {
            config = try await api.call("/api/dubbing/config"); try check()
            if config.flag("aiAvailable"), !config.flag("refinementAvailable") {
                // The shared web editor API has no capability flag yet. A read-only,
                // authenticated draft listing confirms it exists before sending edits.
                if let drafts = try? await api.call("/api/dubbing/editor-drafts"), drafts["items"] is [[String: Any]] { config["refinementAvailable"] = true }
                try check()
            }
        } catch { self.error = error.localizedDescription }
        if generation.string("state") == "ready", !generation.object("refinement").isEmpty, !generation.flag("proposalDismissed") { proposal = generation }
        if pending { await recover() }
    }
    private func accept(_ value: [String: Any]) throws {
        try check(); let originalOptions = generation.object("requestOptions"), requestedRefinement = generation.object("requestRefinement"); generation = value
        if !originalOptions.isEmpty { generation["requestOptions"] = originalOptions }
        if !requestedRefinement.isEmpty { generation["requestRefinement"] = requestedRefinement }; canRetryGeneration = false
        if !value.string("id").isEmpty { generationID = value.string("id") }
        if value["suggestions"] is [[String: Any]], !requestedRefinement.isEmpty {
            generation["script"] = try DubbingScriptEditing.applyingSuggestions(value.objects("suggestions"), request: requestedRefinement)
            generation["refinement"] = requestedRefinement
            proposal = generation
        } else if !value.object("script").isEmpty {
            if !value.object("refinement").isEmpty { proposal = generation }
            else { script = value.object("script"); options = value.object("options") }
        }
        try persist()
    }
    func recover() async {
        guard !busy else { return }; busy = true; error = nil; defer { busy = false }
        do {
            try accept(await api.call("/api/dubbing/generations/" + (generationID.isEmpty ? "latest" : Endpoint.pathID(generationID))))
            if generation.string("id").isEmpty { error = "이전 생성 요청이 없어요." }
        } catch {
            if (error as? APIError)?.status == 404 && pending && !generation.object("requestOptions").isEmpty { canRetryGeneration = true }
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }
    func retryGeneration() async {
        guard !busy, canRetryGeneration, !generationID.isEmpty else { return }
        busy = true; error = nil; defer { busy = false }
        do {
            try check()
            var body: [String: Any] = ["requestId": generationID, "options": generation.object("requestOptions")]
            if !generation.object("requestRefinement").isEmpty { body["edit"] = DubbingScriptEditing.editPayload(generation.object("requestRefinement")) }
            try accept(await api.call("/api/dubbing/generations", method: "POST", body: body))
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    func generate() async {
        guard !busy, !pending else { return }; busy = true; error = nil; defer { busy = false }
        do {
            try check()
            generationID = UUID().uuidString
            generation = ["id": generationID, "state": "running", "requestOptions": options, "message": "이야기를 구성하고 있어요. 결과를 확인할 때까지 기다려주세요."]
            // Persist the request before sending: an interrupted response must not spend another quota.
            try persist()
            try accept(await api.call("/api/dubbing/generations", method: "POST", body: ["requestId": generationID, "options": options]))
        } catch {
            if let failure = error as? APIError, [400, 401, 403, 404, 429].contains(failure.status) { generation = ["state": "failed"]; generationID = ""; cache() }
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }
    func refine(action: String, target: String) async {
        guard !busy, !pending, config.flag("refinementAvailable") else { return }
        let request: [String: Any] = ["action": action, "target": target, "script": script]
        let selected = DubbingScriptEditing.editPayload(request).objects("lines")
        guard !selected.isEmpty, selected.allSatisfy({ !$0.string("text").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.string("text").count <= 700 && $0.string("speaker").count <= 40 }) else { error = "수정할 대사와 배역을 먼저 입력해주세요."; return }
        guard unresolved.isEmpty else { error = "분류하지 못한 원문을 먼저 확인해주세요."; return }
        busy = true; error = nil; defer { busy = false }
        do {
            try check(); generationID = UUID().uuidString
            generation = ["id": generationID, "state": "running", "requestOptions": options, "requestRefinement": request, "message": "선택한 부분을 다듬고 있어요. 원문은 그대로 유지돼요."]
            try persist()
            try accept(await api.call("/api/dubbing/generations", method: "POST", body: ["requestId": generationID, "options": options, "edit": DubbingScriptEditing.editPayload(request)]))
            config = try await api.call("/api/dubbing/config")
        } catch {
            if let failure = error as? APIError, [400, 401, 403, 404, 429].contains(failure.status) { generation["state"] = "failed"; cache() }
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }
    func applyProposal() {
        let before = proposal.object("requestRefinement").object("script").isEmpty ? proposal.object("refinement").object("script") : proposal.object("requestRefinement").object("script")
        guard NSDictionary(dictionary: before).isEqual(to: script) else { error = "수정 요청 뒤 대본이 바뀌었어요. 현재 내용을 보존했으니 수정안을 복사해 반영해주세요."; return }
        rememberUndo(); script = proposal.object("script"); rejectProposal(); cache()
    }
    func rejectProposal() { proposal = [:]; generation["proposalDismissed"] = true; cache() }
    func manual() {
        do { script = try Self.manualScript(title: title, text: manualText, options: options); generationID = ""; generation = [:]; try persist() }
        catch { self.error = error.localizedDescription }
    }
    static func manualScript(title: String, text: String, options: [String: Any]) throws -> [String: Any] {
        func fail(_ message: String) -> APIError { APIError(status: 0, message: message) }
        let count = options.int("roleCount"), name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...6).contains(count), !name.isEmpty, name.count <= 100 else { throw fail("제목과 참여 인원을 확인해주세요.") }
        let roles: [[String: Any]] = (1...count).map { ["id": "role_\($0)", "name": "배역 \($0)", "gender": "unspecified", "personality": ""] }
        let rows = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard (count...120).contains(rows.count) else { throw fail("각 배역의 대사를 적어주세요. 최대 120줄이에요.") }
        let regex = try NSRegularExpression(pattern: "^([A-Fa-f])\\s*[:：]\\s*(.+)$")
        var lines: [[String: Any]] = []
        for (index, raw) in rows.enumerated() {
            let ns = raw as NSString
            guard let match = regex.firstMatch(in: raw, range: NSRange(location: 0, length: ns.length)) else { throw fail("\(index + 1)번째 줄을 A: 대사 형식으로 적어주세요.") }
            let role = Int(ns.substring(with: match.range(at: 1)).uppercased().utf8.first! - 65)
            guard role < count else { throw fail("입력한 배역이 참여 인원보다 많아요.") }
            let words = ns.substring(with: match.range(at: 2)).trimmingCharacters(in: .whitespaces)
            guard !words.isEmpty, words.count <= 700 else { throw fail("대사는 1~700자로 적어주세요.") }
            lines.append(["id": UUID().uuidString, "order": index + 1, "sceneId": "scene_1", "roleId": roles[role].string("id"), "text": words, "emotion": "자연스럽게", "direction": "", "durationSeconds": max(1, min(40, Double(words.count) / 5 + 1)), "gapSeconds": 1.0])
        }
        guard roles.allSatisfy({ role in lines.contains { $0.string("roleId") == role.selfID } }) else { throw fail("모든 배역에 대사가 필요해요.") }
        return ["version": 1, "title": name, "genres": options["genres"] ?? ["일상"], "roles": roles, "scenes": [["id": "scene_1", "title": "첫 장면", "description": ""]], "lines": lines, "soundCues": []]
    }
    func save() async -> String? {
        guard !busy, !pending else { return nil }; busy = true; error = nil; defer { busy = false }
        do {
            try check(); try persist()
            guard !conflict else { throw APIError(status: 409, message: "다른 기기에서 변경됐어요. 기기 초안을 별도 작품으로 저장할 수 있어요.") }
            guard unresolved.isEmpty else { throw APIError(status: 0, message: "붙여넣기에서 분류하지 못한 원문을 먼저 확인해주세요.") }
            if let issue = DubbingScriptEditing.issues(script).first { throw APIError(status: 0, message: issue) }
            var body: [String: Any] = ["id": projectID, "options": options, "script": script]
            if !generationID.isEmpty, generation.string("state") == "ready" { body["generationId"] = generationID }
            if existing != nil { body["revision"] = baseRevision }
            let path = "/api/dubbing/projects" + (existing.map { "/" + Endpoint.pathID($0.selfID) } ?? "")
            let result = try await api.call(path, method: existing == nil ? "POST" : "PUT", body: body).object("project")
            try check(); guard !result.selfID.isEmpty else { throw DubbingWAV.failure }
            Self.disk.sync { try? FileManager.default.removeItem(at: file) }; closed = true; return result.selfID
        } catch { if (error as? APIError)?.status == 409 { conflict = true }; if !Task.isCancelled { self.error = error.localizedDescription }; return nil }
    }
    func beginBlank() { script = DubbingScriptEditing.blank(options: options); generationID = ""; generation = [:]; selectedSceneID = "scene_1"; cache() }
    func acceptImport(_ parsed: DubbingScriptEditing.Imported) {
        rememberUndo(); script = parsed.script; importSource = parsed.source; unresolved = parsed.unresolved
        options["roleCount"] = script.objects("roles").count; selectedSceneID = script.objects("scenes").first?.selfID ?? ""
        generationID = ""; generation = [:]; cache()
    }
    func saveConflictAsCopy() { existing = nil; projectID = UUID().uuidString; baseRevision = 0; conflict = false; cache() }
    func rememberUndo() { undoScripts.append(script); if undoScripts.count > 20 { undoScripts.removeFirst() }; undoAvailable = true }
    func undo() { if let previous = undoScripts.popLast() { script = previous }; undoAvailable = !undoScripts.isEmpty }
    func moveScene(_ id: String, by offset: Int) {
        var scenes = script.objects("scenes"); guard let from = scenes.firstIndex(where: { $0.selfID == id }), scenes.indices.contains(from + offset) else { return }
        rememberUndo(); scenes.swapAt(from, from + offset); script["scenes"] = scenes; script = DubbingScriptEditing.ordered(script)
    }
    func duplicateScene(_ id: String) {
        let scenes = script.objects("scenes"), originals = script.objects("lines").filter { $0.string("sceneId") == id }
        let sounds = script.objects("soundCues").filter { $0.string("sceneId") == id }
        guard scenes.count < 12, script.objects("lines").count + originals.count <= 120,
            script.objects("soundCues").count + sounds.count <= 24,
            script.objects("soundCues").filter({ $0.string("kind") == "bgm" }).count + sounds.filter({ $0.string("kind") == "bgm" }).count <= 3,
            let index = scenes.firstIndex(where: { $0.selfID == id }) else { error = "장면·대사·음향 개수 제한을 확인해주세요."; return }
        let mapping = Dictionary(uniqueKeysWithValues: originals.map { ($0.selfID, UUID().uuidString.lowercased()) })
        if sounds.contains(where: { !$0.string("endLineId").isEmpty && mapping[$0.string("endLineId")] == nil }) { error = "다른 장면까지 이어지는 BGM의 종료 위치를 이 장면 안으로 조절한 뒤 복제해주세요."; return }
        rememberUndo(); let newID = UUID().uuidString.lowercased(); var copy = scenes[index]; copy["id"] = newID
        var all = scenes; all.insert(copy, at: index + 1); script["scenes"] = all
        script["lines"] = script.objects("lines") + originals.map { old in var line = old; line["id"] = mapping[old.selfID]; line["sceneId"] = newID; return line }
        script["soundCues"] = script.objects("soundCues") + sounds.map { old in var cue = old; cue["id"] = UUID().uuidString.lowercased(); cue["sceneId"] = newID; cue["lineId"] = mapping[old.string("lineId")]; if let end = mapping[old.string("endLineId")] { cue["endLineId"] = end }; return cue }
        script = DubbingScriptEditing.ordered(script); selectedSceneID = newID
    }
    func removeScene(_ id: String) {
        guard script.objects("scenes").count > 1 else { return }
        rememberUndo(); let removed = Set(script.objects("lines").filter { $0.string("sceneId") == id }.map(\.selfID))
        script["scenes"] = script.objects("scenes").filter { $0.selfID != id }
        script["lines"] = script.objects("lines").filter { !removed.contains($0.selfID) }
        script["soundCues"] = script.objects("soundCues").filter { !removed.contains($0.string("lineId")) && !removed.contains($0.string("endLineId")) }
        script = DubbingScriptEditing.ordered(script); selectedSceneID = script.objects("scenes").first?.selfID ?? ""
    }
    func duplicateLine(_ id: String) {
        var lines = script.objects("lines"); guard lines.count < 120, let at = lines.firstIndex(where: { $0.selfID == id }) else { return }
        rememberUndo(); var line = lines[at]; line["id"] = UUID().uuidString.lowercased(); lines.insert(line, at: at + 1); script["lines"] = Self.ordered(lines)
    }
    func moveLine(_ id: String, by offset: Int) {
        var lines = script.objects("lines"); guard let at = lines.firstIndex(where: { $0.selfID == id }), lines.indices.contains(at + offset), lines[at].string("sceneId") == lines[at + offset].string("sceneId") else { return }
        rememberUndo(); lines.swapAt(at, at + offset); script["lines"] = Self.ordered(lines)
    }
    func addCue(kind: String, scene: String, after line: String? = nil) {
        let cues = script.objects("soundCues")
        guard cues.count < 24, kind != "bgm" || cues.filter({ $0.string("kind") == "bgm" }).count < 3,
            let target = line ?? script.objects("lines").last(where: { $0.string("sceneId") == scene })?.selfID else { error = "음향 제한과 연결할 대사를 확인해주세요."; return }
        rememberUndo(); script["soundCues"] = cues + [DubbingScriptEditing.cue(kind: kind, scene: scene, line: target)]
    }
    func removeCue(_ id: String) { rememberUndo(); script["soundCues"] = script.objects("soundCues").filter { $0.selfID != id } }
    func cueField(_ id: String, _ key: String) -> Binding<String> {
        Binding(get: { self.script.objects("soundCues").first { $0.selfID == id }?.string(key) ?? "" }, set: { value in
            var cues = self.script.objects("soundCues"); guard let index = cues.firstIndex(where: { $0.selfID == id }) else { return }; cues[index][key] = value
            if key == "endLineId", !value.isEmpty { cues[index]["anchor"] = "start" }
            if key == "lineId", let line = self.script.objects("lines").first(where: { $0.selfID == value }) { cues[index]["sceneId"] = line.string("sceneId") }
            self.script["soundCues"] = cues
        })
    }
    func cueNumber(_ id: String, _ key: String) -> Binding<Double> {
        Binding(get: { self.script.objects("soundCues").first { $0.selfID == id }?.number(key) ?? 0 }, set: { value in
            var cues = self.script.objects("soundCues"); guard let index = cues.firstIndex(where: { $0.selfID == id }) else { return }; cues[index][key] = value
            if key == "durationSeconds" { cues[index]["generationSeconds"] = max(cues[index].string("kind") == "bgm" ? 10 : 1, value); cues[index]["fadeInSeconds"] = min(cues[index].number("fadeInSeconds"), value / 2); cues[index]["fadeOutSeconds"] = min(cues[index].number("fadeOutSeconds"), value / 2) }
            self.script["soundCues"] = cues
        })
    }
    func field(_ key: String) -> Binding<String> { Binding(get: { self.script.string(key) }, set: { self.script[key] = $0 }) }
    func addScene() {
        var scenes = script.objects("scenes"), lines = script.objects("lines")
        guard scenes.count < 12, lines.count < 120, let role = script.objects("roles").first else { return }
        let id = UUID().uuidString.lowercased()
        scenes.append(["id": id, "title": "새 장면", "description": ""])
        lines.append(["id": UUID().uuidString.lowercased(), "order": lines.count + 1, "sceneId": id, "roleId": role.selfID, "text": "", "emotion": "자연스럽게", "direction": "", "durationSeconds": 5.0, "gapSeconds": 1.0])
        rememberUndo(); script["scenes"] = scenes; script["lines"] = lines; selectedSceneID = id
    }
    func addLine(after id: String) {
        var lines = script.objects("lines")
        guard lines.count < 120, let index = lines.firstIndex(where: { $0.selfID == id }) else { return }
        var line = lines[index]; line["id"] = UUID().uuidString.lowercased(); line["text"] = ""
        lines.insert(line, at: index + 1); script["lines"] = Self.ordered(lines)
    }
    func canDeleteLine(_ id: String) -> Bool {
        let lines = script.objects("lines")
        guard let line = lines.first(where: { $0.selfID == id }) else { return false }
        return lines.filter { $0.string("roleId") == line.string("roleId") }.count > 1
            && lines.filter { $0.string("sceneId") == line.string("sceneId") }.count > 1
    }
    func deleteLine(_ id: String) {
        guard canDeleteLine(id) else { return }
        rememberUndo(); script["lines"] = Self.ordered(script.objects("lines").filter { $0.selfID != id })
        script["soundCues"] = script.objects("soundCues").filter { $0.string("lineId") != id && $0.string("endLineId") != id }
    }
    private static func ordered(_ lines: [[String: Any]]) -> [[String: Any]] {
        lines.enumerated().map { index, row in var row = row; row["order"] = index + 1; return row }
    }
    func rowField(_ collection: String, _ index: Int, _ key: String, limit: Int = 700) -> Binding<String> {
        let id = script.objects(collection)[index].selfID
        return Binding(get: { self.script.objects(collection).first { $0.selfID == id }?.string(key) ?? "" }, set: { value in
            var rows = self.script.objects(collection); guard let current = rows.firstIndex(where: { $0.selfID == id }) else { return }
            rows[current][key] = value; self.script[collection] = rows
        })
    }
    func rowNumber(_ index: Int, _ key: String) -> Binding<Double> {
        let id = script.objects("lines")[index].selfID
        return Binding(get: { self.script.objects("lines").first { $0.selfID == id }?.number(key) ?? 1 }, set: { value in
            var rows = self.script.objects("lines"); guard let current = rows.firstIndex(where: { $0.selfID == id }) else { return }
            rows[current][key] = (value * 10).rounded() / 10; self.script["lines"] = rows
        })
    }
}

struct NativeDubbingEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scene
    @StateObject private var editor: DubbingScriptEditorModel
    @State private var creationMethod = ""
    @State private var importing = false
    @State private var importPreview: DubbingScriptEditing.Imported?
    @State private var confirmDelete: String?
    @State private var refineRequest: String?
    @FocusState private var focusedLine: String?
    @State private var choosing = ""
    @State private var confirmLeave = false
    @State private var destination: SiteWorkspace?
    private let existing: [String: Any]?
    init(owner: String, existing: [String: Any]? = nil) {
        self.existing = existing
        _editor = StateObject(wrappedValue: DubbingScriptEditorModel(owner: owner, existing: existing))
    }
    private let genres = ["SF", "이세계물", "판타지", "사극", "로맨스", "액션", "코미디", "첩보", "공포", "스릴러", "미스터리", "일상", "감동"]
    var body: some View {
        ScrollViewReader { proxy in
            modalContent(proxy)
            .onAppear { if editor.closed { dismiss() } }
            .task { if !editor.closed { await editor.load(); let position = editor.editingLineID.isEmpty ? editor.selectedSceneID : editor.editingLineID; if !position.isEmpty { proxy.scrollTo(position, anchor: .center) } } }
            .task(id: editor.generationID + "|" + editor.generation.string("state")) {
                guard editor.pending else { return }
                while !Task.isCancelled && editor.pending {
                    do { try await Task.sleep(for: .seconds(5)) } catch { return }
                    await editor.recover()
                    if editor.error != nil { return }
                }
            }
            .onChange(of: scene) { _, phase in if phase != .active { editor.cache() } }
            .onDisappear { if destination == nil { editor.cache() } }
            .navigationDestination(item: $destination) { DubbingProjectPage(space: $0) }
            .onChange(of: editor.script.isEmpty) { _, empty in if !empty { withAnimation { proxy.scrollTo("dubbing-editor-top", anchor: .top) } } }
        }
    }
    private var baseContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Color.clear.frame(height: 1).id("dubbing-editor-top")
                if editor.script.isEmpty { optionsForm } else { scriptForm }
                if editor.conflict {
                    Text("다른 기기의 변경과 충돌했어요. 이 기기의 작성 내용은 보관되어 있어요.").foregroundStyle(Brand.pink)
                    Button("기기 내용을 별도 작품으로 저장") { editor.saveConflictAsCopy() }
                }
                if !editor.generation.string("message").isEmpty { Text(editor.generation.string("message")).font(.subheadline).foregroundStyle(AifectDesign.muted) }
                if editor.canRetryGeneration && !editor.script.isEmpty { Button("같은 요청 다시 시도") { Task { await editor.retryGeneration() } }.disabled(editor.busy) }
                if let error = editor.error { Text(error).font(.subheadline).foregroundStyle(Brand.pink) }
                if editor.busy { ProgressView().frame(maxWidth: .infinity) }
            }.padding(16)
        }.accessibilityIdentifier("native-dubbing-editor").scrollDismissesKeyboard(.interactively)
            .navigationTitle(editor.script.isEmpty ? "더빙 만들기" : "대본 편집").navigationBarTitleDisplayMode(.inline).modifier(FullScreenWorkspace()).navigationBarBackButtonHidden()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button { if editor.hasChanges || editor.pending { confirmLeave = true } else { dismiss() } } label: { Image(systemName: "chevron.left").accessibilityLabel("뒤로") }.disabled(editor.busy) }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if editor.undoAvailable { Button { editor.undo() } label: { Image(systemName: "arrow.uturn.backward") }.accessibilityLabel("실행 취소").disabled(editor.busy || editor.pending) }
                    Button("기기에 저장") { do { try editor.saveDraft() } catch { editor.error = error.localizedDescription } }.disabled(editor.busy)
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } }
            }
    }
    private func modalContent(_ proxy: ScrollViewProxy) -> some View {
        baseContent
            .alert("진행사항을 저장할까요?", isPresented: $confirmLeave) {
                Button("저장하고 나가기") { do { try editor.saveDraft(); dismiss() } catch { editor.error = error.localizedDescription } }
                if !editor.pending { Button("저장 안 함", role: .destructive) { do { try editor.discardDraft(); dismiss() } catch { editor.error = error.localizedDescription } } }
                Button("계속 작업하기", role: .cancel) { }
            } message: { Text(editor.pending ? "진행 중인 AI 요청을 저장하고 나가면 같은 요청의 결과를 이어서 확인할 수 있어요." : "저장하면 이 기기에서 이어서 작업할 수 있어요. 저장하지 않으면 이번 대본 초안을 삭제해요.") }
            .sheet(isPresented: $importing) { importSheet }
            .sheet(isPresented: Binding(get: { !editor.proposal.isEmpty }, set: { if !$0 { editor.rejectProposal() } })) { proposalSheet }
            .alert("AI로 다듬을까요?", isPresented: Binding(get: { refineRequest != nil }, set: { if !$0 { refineRequest = nil } }), presenting: refineRequest) { value in
                Button("작성 1회 사용") { let parts = value.split(separator: ":", maxSplits: 1).map(String.init); if parts.count == 2 { Task { await editor.refine(action: parts[0], target: parts[1]) } } }
                Button("취소", role: .cancel) { }
            } message: { _ in Text("기존 AI 작성 횟수에서 1회를 사용해요. 변경 전후를 비교한 뒤 적용할 수 있어요.") }
            .alert("삭제할까요?", isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }), presenting: confirmDelete) { target in
                Button("삭제", role: .destructive) {
                    let parts = target.split(separator: ":", maxSplits: 1).map(String.init)
                    if parts.count == 2 { if parts[0] == "scene" { editor.removeScene(parts[1]) } else if parts[0] == "line" { editor.deleteLine(parts[1]) } else { editor.removeCue(parts[1]) } }
                }
                Button("취소", role: .cancel) { }
            } message: { _ in Text("연결된 음향도 함께 제거되며, 실행 취소로 복원할 수 있어요.") }
            .safeAreaInset(edge: .bottom) { if !editor.script.isEmpty { addBar } }
            .onChange(of: focusedLine) { _, id in
                if let id { editor.editingLineID = id; withAnimation { proxy.scrollTo(id, anchor: .center) } }
            }
            .onChange(of: editor.selectedSceneID) { _, id in if !id.isEmpty && focusedLine == nil { withAnimation { proxy.scrollTo(id, anchor: .top) } } }
            .sheet(isPresented: Binding(get: { !choosing.isEmpty }, set: { if !$0 { choosing = "" } })) { optionSheet }
    }
    private func option<T>(_ key: String, fallback: T) -> Binding<T> { Binding(get: { editor.options[key] as? T ?? fallback }, set: { editor.options[key] = $0 }) }
    @ViewBuilder private var optionsForm: some View {
        if creationMethod.isEmpty && !editor.pending {
            VStack(alignment: .leading, spacing: 12) {
                Text("어떤 이야기로 시작할까요?").font(.title2.bold())
                Text("AI로 시작해도 직접 써도 같은 장면 편집기로 이어져요.").font(.subheadline).foregroundStyle(AifectDesign.muted)
                startChoice("AI 대본 작성", detail: "소재·장르·인원·길이를 정해 이야기 만들기", icon: "sparkles") { creationMethod = "ai" }
                startChoice("직접 대본 작성", detail: "빈 장면에 대사와 음향을 하나씩 추가", icon: "square.and.pencil") { editor.beginBlank() }
                startChoice("기존 대본 붙여넣기", detail: "장면·화자·효과음을 분리하고 원문 확인", icon: "doc.on.clipboard") { importing = true }
            }
        } else {
        VStack(alignment: .leading, spacing: 16) {
            optionField("장르 · 최대 2개", key: "genres", value: (editor.options["genres"] as? [String] ?? []).joined(separator: " · "))
            HStack(spacing: 10) {
                optionField("참여 인원", key: "roleCount", value: "\(editor.options.int("roleCount"))명")
                optionField("대본 길이", key: "minutes", value: timeLabel(editor.options.number("minutes") * 60))
            }
            HStack(spacing: 10) {
                optionField("분위기", key: "mood", value: editor.options.string("mood"))
                optionField("결말", key: "ending", value: editor.options.string("ending"))
            }
            Text("이야기의 세부사항").font(.headline)
            Text("‘랜덤’ 또는 ‘무작위’라고 적으면 AI가 이야기를 만들어요.").font(.caption).foregroundStyle(AifectDesign.muted)
            TextField("예: 막차에서 만난 두 사람의 비밀", text: option("idea", fallback: ""), axis: .vertical).lineLimit(3...8).textFieldStyle(DubbingFieldStyle())
            Button("이야기 랜덤 생성") { editor.options["idea"] = "(랜덤)" }
            Text("일반 하루 1회 · 프리미엄 하루 3회 무료").font(.subheadline)
            Text("오늘 남은 작성 \(editor.config.object("quota").int("remaining"))회 · 한국 시간 자정 초기화").font(.caption).foregroundStyle(AifectDesign.muted)
            Text("생성 예상 30초~2분 · 요청이 많으면 더 걸릴 수 있어요.").font(.caption).foregroundStyle(AifectDesign.muted)
            Button("AI 대본 작성하기") { Task { await editor.generate() } }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(editor.busy || editor.pending || !editor.config.flag("aiAvailable"))
            if editor.canRetryGeneration { Button("같은 요청 다시 시도") { Task { await editor.retryGeneration() } }.disabled(editor.busy) }
            Button("작성 방식 다시 선택") { creationMethod = "" }.disabled(editor.busy || editor.pending)
            Button("이전 AI 생성 결과 확인") { Task { await editor.recover() } }.disabled(editor.busy)
        }.disabled(editor.busy)
        }
    }
    private func startChoice(_ title: String, detail: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { HStack(spacing: 14) { Image(systemName: icon).font(.title2).foregroundStyle(Brand.aqua).frame(width: 40); VStack(alignment: .leading, spacing: 6) { Text(title).font(.headline); Text(detail).font(.caption).foregroundStyle(AifectDesign.muted) }; Spacer(); Image(systemName: "chevron.right") }.padding(18).frame(maxWidth: .infinity, minHeight: 84).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)) }.buttonStyle(.plain).accessibilityLabel(title)
    }
    private var scriptForm: some View {
        LazyVStack(alignment: .leading, spacing: 18) {
            TextField("작품 제목", text: editor.field("title")).textFieldStyle(DubbingFieldStyle()).accessibilityIdentifier("script-title")
            HStack {
                Button((editor.options["genres"] as? [String] ?? []).joined(separator: " · ")) { choosing = "genres" }
                Text("\(editor.script.objects("roles").count)인극 · " + timeLabel(DubbingScriptEditing.duration(editor.script))).foregroundStyle(AifectDesign.muted)
                Spacer()
            }.font(.caption)
            Button(editor.saveState) { editor.automaticSave() }.font(.caption).foregroundStyle(Brand.aqua).accessibilityIdentifier("script-save-state")
            DisclosureGroup("등장인물 · 이름 변경은 모든 대사에 반영") {
                ForEach(Array(editor.script.objects("roles").enumerated()), id: \.element.selfID) { index, role in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("배역 이름", text: editor.rowField("roles", index, "name", limit: 40)).textFieldStyle(DubbingFieldStyle())
                        Picker("성별", selection: editor.rowField("roles", index, "gender")) { Text("미정").tag("unspecified"); Text("남").tag("male"); Text("여").tag("female") }.pickerStyle(.segmented)
                        TextField("캐릭터 소개", text: editor.rowField("roles", index, "personality", limit: 240), axis: .vertical).textFieldStyle(DubbingFieldStyle())
                    }.padding(.vertical, 6)
                }
                HStack {
                    Button("배역 추가") { var roles = editor.script.objects("roles"); guard roles.count < 6 else { return }; let id = UUID().uuidString; roles.append(["id": id, "name": "배역 \(roles.count + 1)", "gender": "unspecified", "personality": ""]); editor.script["roles"] = roles; editor.options["roleCount"] = roles.count; editor.script["lines"] = editor.script.objects("lines") + [DubbingScriptEditing.line(scene: activeScene, role: id, order: editor.script.objects("lines").count + 1)] }.disabled(editor.script.objects("roles").count >= 6 || editor.script.objects("lines").count >= 120)
                    Menu("빈 배역 제거") { ForEach(editor.script.objects("roles").filter { role in !editor.script.objects("lines").contains { $0.string("roleId") == role.selfID } }, id: \.selfID) { role in Button(role.string("name")) { editor.script["roles"] = editor.script.objects("roles").filter { $0.selfID != role.selfID }; editor.options["roleCount"] = editor.script.objects("roles").count } } }.disabled(editor.script.objects("roles").count <= 1)
                }.font(.caption)
            }
            if !editor.unresolved.isEmpty { unresolvedReview }
            ForEach(Array(editor.script.objects("scenes").enumerated()), id: \.element.selfID) { index, scene in sceneCard(index, scene: scene).id(scene.selfID) }
            Text("비공개 저장 · 골드 차감 없음").font(.caption).foregroundStyle(AifectDesign.muted)
            Button {
                Task { if let id = await editor.save() { if existing != nil { dismiss() } else { destination = SiteWorkspace(area: "dubbing", key: id, title: editor.script.string("title")) } } }
            } label: { Text("대본 저장").frame(maxWidth: .infinity, minHeight: 28) }
            .buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(editor.busy || editor.pending || editor.conflict || !editor.unresolved.isEmpty)
        }
    }
    private var activeScene: String { editor.script.objects("scenes").contains { $0.selfID == editor.selectedSceneID } ? editor.selectedSceneID : editor.script.objects("scenes").first?.selfID ?? "" }
    private var addBar: some View {
        HStack(spacing: 4) {
            Button("+ 대사") {
                let lines = editor.script.objects("lines").filter { $0.string("sceneId") == activeScene }
                if let last = lines.last { editor.addLine(after: last.selfID) }
                else if let role = editor.script.objects("roles").first { editor.script["lines"] = editor.script.objects("lines") + [DubbingScriptEditing.line(scene: activeScene, role: role.selfID, order: editor.script.objects("lines").count + 1)]; editor.script = DubbingScriptEditing.ordered(editor.script) }
                editor.collapsedScenes.remove(activeScene); focusedLine = editor.script.objects("lines").last(where: { $0.string("sceneId") == activeScene })?.selfID
            }.disabled(editor.script.objects("lines").count >= 120).accessibilityIdentifier("script-add-line")
            Button("+ 장면") { focusedLine = nil; editor.addScene() }.disabled(editor.script.objects("scenes").count >= 12 || editor.script.objects("lines").count >= 120).accessibilityIdentifier("dubbing-scene-add")
            Button("+ 효과음") { editor.collapsedScenes.remove(activeScene); editor.addCue(kind: "sfx", scene: activeScene) }.accessibilityIdentifier("script-add-sfx")
            Button("+ BGM") { editor.collapsedScenes.remove(activeScene); editor.addCue(kind: "bgm", scene: activeScene) }.accessibilityIdentifier("script-add-bgm")
        }.font(.system(size: 13, weight: .semibold)).buttonStyle(DubbingEditorAddButtonStyle()).padding(.horizontal, 8).frame(maxWidth: .infinity, minHeight: 52).background(Brand.card).tint(Brand.aqua)
    }
    private func sceneCard(_ index: Int, scene: [String: Any]) -> some View {
        let lines = editor.script.objects("lines").filter { $0.string("sceneId") == scene.selfID }
        let folded = editor.collapsedScenes.contains(scene.selfID)
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button { if folded { editor.collapsedScenes.remove(scene.selfID) } else { editor.collapsedScenes.insert(scene.selfID) }; editor.selectedSceneID = scene.selfID } label: {
                    VStack(alignment: .leading, spacing: 5) { Text(String(format: "SCENE %02d", index + 1) + " · " + scene.string("title")).font(.headline); Text("\(lines.count)개 대사 · " + timeLabel(lines.reduce(0) { $0 + $1.number("durationSeconds") + $1.number("gapSeconds") })).font(.caption).foregroundStyle(AifectDesign.muted) }
                    Spacer(); Image(systemName: folded ? "chevron.down" : "chevron.up")
                }.buttonStyle(.plain).accessibilityIdentifier("script-scene-toggle-" + scene.selfID)
                Menu {
                    Button("장면 위로") { editor.moveScene(scene.selfID, by: -1) }.disabled(index == 0)
                    Button("장면 아래로") { editor.moveScene(scene.selfID, by: 1) }.disabled(index == editor.script.objects("scenes").count - 1)
                    Button("장면 복제") { editor.duplicateScene(scene.selfID) }
                    if editor.config.flag("refinementAvailable") {
                        Button("AI 장면 수정") { refineRequest = "scene:" + scene.selfID }.disabled(editor.busy || editor.pending)
                        Button("AI 대화 흐름 개선") { refineRequest = "flow:" + scene.selfID }.disabled(editor.busy || editor.pending)
                    }
                    Button("장면 삭제", role: .destructive) { confirmDelete = "scene:" + scene.selfID }.disabled(editor.script.objects("scenes").count <= 1)
                } label: { Image(systemName: "ellipsis").frame(width: 40, height: 44) }.accessibilityLabel("장면 \(index + 1) 메뉴")
            }
            if !folded {
                TextField("장면 제목", text: editor.rowField("scenes", index, "title", limit: 80)).textFieldStyle(DubbingFieldStyle())
                TextField("장면 설명", text: editor.rowField("scenes", index, "description", limit: 500), axis: .vertical).textFieldStyle(DubbingFieldStyle())
                ForEach(Array(editor.script.objects("lines").enumerated()).filter { $0.element.string("sceneId") == scene.selfID }, id: \.element.selfID) { lineIndex, line in
                    ForEach(editor.script.objects("soundCues").filter { $0.string("lineId") == line.selfID && $0.string("anchor") != "after" }, id: \.selfID) { cue in cueCard(cue) }
                    lineEditor(lineIndex, line: line).id(line.selfID)
                    ForEach(editor.script.objects("soundCues").filter { $0.string("lineId") == line.selfID && $0.string("anchor") == "after" }, id: \.selfID) { cue in cueCard(cue) }
                }
                Button("이 장면에 추가") { focusedLine = nil; editor.selectedSceneID = scene.selfID }.font(.caption).frame(minHeight: 40)
            }
        }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
    }
    private func cueCard(_ cue: [String: Any]) -> some View {
        let music = cue.string("kind") == "bgm"
        return VStack(alignment: .leading, spacing: 8) {
            HStack { Label(music ? "BGM" : cue.string("kind") == "ambient" ? "환경음" : "SFX", systemImage: music ? "music.note" : "waveform").font(.caption.bold()).foregroundStyle(Brand.aqua); Spacer(); Button { confirmDelete = "cue:" + cue.selfID } label: { Image(systemName: "trash").frame(width: 44, height: 44) }.accessibilityLabel("음향 삭제") }
            TextField(music ? "음악 설명 · 분위기와 악기" : "효과음 설명 · 재질과 거리", text: editor.cueField(cue.selfID, "prompt"), axis: .vertical).textFieldStyle(DubbingFieldStyle())
            Picker("시작 대사", selection: editor.cueField(cue.selfID, "lineId")) { ForEach(editor.script.objects("lines"), id: \.selfID) { line in Text("\(line.int("order")) · " + String(line.string("text").prefix(22))).tag(line.selfID) } }.font(.caption)
            Picker("삽입 위치", selection: editor.cueField(cue.selfID, "anchor")) { Text("대사 시작").tag("start"); Text("대사 이전").tag("before"); Text("대사 이후").tag("after"); Text("장면 시작").tag("scene") }.font(.caption)
            if music {
                Picker("종료 위치", selection: editor.cueField(cue.selfID, "endLineId")) { Text("지정한 초만 재생").tag(""); ForEach(editor.script.objects("lines").filter { $0.int("order") >= (editor.script.objects("lines").first { $0.selfID == cue.string("lineId") }?.int("order") ?? 0) }, id: \.selfID) { line in Text("\(line.int("order")) · " + String(line.string("text").prefix(22))).tag(line.selfID) } }.font(.caption)
                Picker("분위기 · 용도", selection: editor.cueField(cue.selfID, "musicUse")) { Text("도입").tag("intro"); Text("반전 전환").tag("transition"); Text("마무리").tag("outro"); Text("절정").tag("climax") }.font(.caption)
                Text("BGM은 짧은 분위기 연출로 합성돼요.").font(.caption2).foregroundStyle(AifectDesign.muted)
            }
            DisclosureGroup("세부 연출") {
                Stepper(String(format: "길이 %.1f초", cue.number("durationSeconds")), value: editor.cueNumber(cue.selfID, "durationSeconds"), in: 0.5...(music ? 300 : cue.string("kind") == "ambient" ? 20 : 5), step: 0.5)
                Stepper(String(format: "삽입 지연 %.1f초", cue.number("offsetSeconds")), value: editor.cueNumber(cue.selfID, "offsetSeconds"), in: 0...10, step: 0.5)
                HStack { Text("음량"); Slider(value: editor.cueNumber(cue.selfID, "volume"), in: 0...0.5, step: 0.01); Text("\(Int(cue.number("volume") * 100))%") }
            }.font(.caption)
        }.padding(12).background(Brand.aqua.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
    }
    private var unresolvedReview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("원문 확인 필요 · \(editor.unresolved.count)개").font(.headline).foregroundStyle(Brand.pink)
            Text("아래 원문을 장면 설명이나 대사에 옮긴 뒤 확인해주세요. 확인 전에는 서버 저장하지 않아요.").font(.caption)
            ForEach(editor.unresolved, id: \.selfID) { item in
                Text(item.string("text")).textSelection(.enabled)
                Button("편집기에 반영했어요") { editor.unresolved.removeAll { $0.selfID == item.selfID } }.font(.caption)
            }
            DisclosureGroup("전체 원문 보관본") { Text(editor.importSource).textSelection(.enabled).font(.caption) }
        }.padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
    }
    private var proposalSheet: some View {
        let before = editor.proposal.object("refinement").object("script"), after = editor.proposal.object("script")
        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("수정안을 확인해주세요").font(.title2.bold())
                    ForEach(after.objects("scenes").filter { scene in
                        let old = before.objects("scenes").first { $0.selfID == scene.selfID } ?? [:]
                        return old.string("title") != scene.string("title") || old.string("description") != scene.string("description")
                    }, id: \.selfID) { scene in
                        let old = before.objects("scenes").first { $0.selfID == scene.selfID } ?? [:]
                        Text("장면 · 수정 전").font(.caption.bold())
                        Text(old.string("title")).font(.headline).foregroundStyle(AifectDesign.muted)
                        Text(old.string("description")).foregroundStyle(AifectDesign.muted)
                        Text("수정 후").font(.caption.bold())
                        Text(scene.string("title")).font(.headline).foregroundStyle(Brand.aqua)
                        Text(scene.string("description")).foregroundStyle(Brand.aqua).textSelection(.enabled)
                    }
                    ForEach(after.objects("lines").filter { line in
                        guard let old = before.objects("lines").first(where: { $0.selfID == line.selfID }) else { return true }
                        return old.string("text") != line.string("text") || old.string("emotion") != line.string("emotion") || old.string("direction") != line.string("direction")
                    }, id: \.selfID) { line in
                        let old = before.objects("lines").first { $0.selfID == line.selfID } ?? [:]
                        Text("대사 \(line.int("order")) · 수정 전").font(.caption.bold())
                        Text(old.string("text")).foregroundStyle(AifectDesign.muted).textSelection(.enabled)
                        Text(old.string("emotion") + " · " + old.string("direction")).font(.caption).foregroundStyle(AifectDesign.muted)
                        Text("수정 후").font(.caption.bold())
                        Text(line.string("text")).foregroundStyle(Brand.aqua).textSelection(.enabled)
                        Text(line.string("emotion") + " · " + line.string("direction")).font(.caption).foregroundStyle(Brand.aqua)
                    }
                    if let error = editor.error { Text(error).font(.caption).foregroundStyle(Brand.pink) }
                    Button("확인하고 적용") { editor.applyProposal() }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true))
                    Button("원문 유지") { editor.rejectProposal() }.frame(maxWidth: .infinity, minHeight: 48)
                }.padding(16)
            }.background(Brand.background).navigationTitle("AI 수정 비교").navigationBarTitleDisplayMode(.inline)
        }.presentationDetents([.large]).presentationDragIndicator(.visible)
    }
    private var importSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("작품 제목", text: $editor.title).textFieldStyle(DubbingFieldStyle())
                    TextField("SCENE 01 — 카페 앞\n서준: 우리 계약, 이제 끝나는 거지?\n[SFX: 자동차 소리]", text: $editor.manualText, axis: .vertical).lineLimit(8...20).textFieldStyle(DubbingFieldStyle()).accessibilityIdentifier("script-import-source")
                    Button("분석 결과 미리보기") { importPreview = DubbingScriptEditing.parse(editor.manualText, title: editor.title.isEmpty ? "가져온 대본" : editor.title, options: editor.options) }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(editor.manualText.isEmpty)
                    if let preview = importPreview {
                        Text("장면 \(preview.script.objects("scenes").count)개 · 대사 \(preview.script.objects("lines").count)개 · 음향 \(preview.script.objects("soundCues").count)개").font(.headline)
                        Text("확인할 원문 \(preview.unresolved.count)개 · 원문은 그대로 보관해요.").font(.caption).foregroundStyle(Brand.aqua)
                        ForEach(preview.script.objects("lines"), id: \.selfID) { line in Text((preview.script.objects("roles").first { $0.selfID == line.string("roleId") }?.string("name") ?? "") + ": " + line.string("text")).font(.caption) }
                        ForEach(preview.unresolved, id: \.selfID) { Text($0.string("text")).font(.caption).foregroundStyle(Brand.pink) }
                        Button("확인 후 편집기에 반영") { editor.acceptImport(preview); importing = false }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true))
                    }
                }.padding(16)
            }.scrollDismissesKeyboard(.interactively).background(Brand.background).navigationTitle("기존 대본 붙여넣기").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } } }
        }.presentationDetents([.large]).presentationDragIndicator(.visible)
    }
    private func optionField(_ label: String, key: String, value: String) -> some View {
        ParitySelectionField(title: label, value: value) { choosing = key }.accessibilityIdentifier("dubbing-choice-" + key)
    }
    private var optionSheet: some View {
        let names = ["genres":"장르 선택 · 최대 2개", "roleCount":"참여 인원", "minutes":"대본 길이", "mood":"분위기", "ending":"결말"]
        let choices: [(String, String)] = {
            switch choosing {
            case "genres": return genres.map { ($0, $0) }
            case "roleCount": return (1...6).map { (String($0), "\($0)명") }
            case "minutes": return (1...10).map { (String(Double($0) / 2), timeLabel(Double($0 * 30))) }
            case "mood": return ["유쾌하게", "설레게", "진지하게", "긴장감 있게", "슬프게", "랜덤"].map { ($0, $0) }
            default: return ["해피엔딩", "새드엔딩", "반전", "열린 결말", "랜덤"].map { ($0, $0) }
            }
        }()
        let selected = choosing == "genres" ? editor.options["genres"] as? [String] ?? [] : [String(describing: editor.options[choosing] ?? "")]
        return ParitySelectionSheet(title: names[choosing] ?? "선택", choices: choices, selected: selected, multiple: choosing == "genres") { value in
            switch choosing {
            case "genres":
                if selected.contains(value), selected.count > 1 { editor.options[choosing] = selected.filter { $0 != value } }
                else if !selected.contains(value), selected.count < 2 { editor.options[choosing] = selected + [value] }
            case "roleCount": editor.options[choosing] = Int(value)
            case "minutes": editor.options[choosing] = Double(value)
            default: editor.options[choosing] = value
            }
        }
    }
    private func lineEditor(_ index: Int, line: [String: Any]) -> some View {
        let roles = editor.script.objects("roles")
        let roleIndex = roles.firstIndex { $0.selfID == line.string("roleId") } ?? 0
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Picker("화자", selection: editor.rowField("lines", index, "roleId")) { ForEach(roles, id: \.selfID) { Text($0.string("name")).tag($0.selfID) } }.tint(DubbingPalette.color(roleIndex))
                Spacer()
                Menu {
                    Button("대사 위로") { editor.moveLine(line.selfID, by: -1) }
                    Button("대사 아래로") { editor.moveLine(line.selfID, by: 1) }
                    Button("대사 복제") { editor.duplicateLine(line.selfID) }
                    if editor.config.flag("refinementAvailable") {
                        ForEach([("natural", "자연스럽게"), ("shorten", "짧게"), ("lengthen", "길게"), ("emotion", "감정 표현 강화")], id: \.0) { action in
                            Button("AI · " + action.1) { refineRequest = action.0 + ":" + line.selfID }.disabled(editor.busy || editor.pending)
                        }
                    }
                    Button("아래 대사 추가") { editor.addLine(after: line.selfID) }.disabled(editor.script.objects("lines").count >= 120)
                    Button("효과음 추가") { editor.addCue(kind: "sfx", scene: line.string("sceneId"), after: line.selfID) }
                    Button("BGM 추가") { editor.addCue(kind: "bgm", scene: line.string("sceneId"), after: line.selfID) }
                    Button("대사 삭제", role: .destructive) { confirmDelete = "line:" + line.selfID }.disabled(!editor.canDeleteLine(line.selfID))
                } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityIdentifier("script-line-menu-" + line.selfID)
            }
            TextField("대사", text: editor.rowField("lines", index, "text"), axis: .vertical).lineLimit(2...8).textFieldStyle(DubbingFieldStyle())
                .focused($focusedLine, equals: line.selfID).accessibilityIdentifier("dubbing-line-text-" + line.selfID)
            DisclosureGroup("감정 · 연기 지시 · 시간") {
                TextField("감정", text: editor.rowField("lines", index, "emotion", limit: 80)).textFieldStyle(DubbingFieldStyle())
                TextField("연기 지시", text: editor.rowField("lines", index, "direction", limit: 240), axis: .vertical).textFieldStyle(DubbingFieldStyle())
                Stepper(String(format: "대사 %.1f초", line.number("durationSeconds")), value: editor.rowNumber(index, "durationSeconds"), in: 1...40, step: 0.5)
                Stepper(String(format: "대사 뒤 여유 %.1f초", line.number("gapSeconds")), value: editor.rowNumber(index, "gapSeconds"), in: 0.3...8, step: 0.1)
            }.font(.caption)
        }.padding(10).background(Brand.background.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }

}

private struct DubbingFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration.font(.system(size: 15)).padding(12).frame(minHeight: 48)
            .background(Brand.background.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
    }
}


struct ParitySelectionField: View {
    let title: String
    let value: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                HStack { Text(value).font(.system(size: 15, weight: .semibold)).lineLimit(2); Spacer(minLength: 4); Image(systemName: "chevron.down").font(.caption) }
            }.padding(14).frame(maxWidth: .infinity, minHeight: 74, alignment: .leading)
                .background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(AifectDesign.stroke))
        }.buttonStyle(.plain)
    }
}

struct ParitySelectionSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let choices: [(String, String)]
    let selected: [String]
    var multiple = false
    let choose: (String) -> Void
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(choices, id: \.0) { choice in
                        Button {
                            choose(choice.0); if !multiple { dismiss() }
                        } label: {
                            HStack { Text(choice.1); Spacer(); Image(systemName: selected.contains(choice.0) ? "checkmark.circle.fill" : "circle").foregroundStyle(selected.contains(choice.0) ? AifectDesign.violet : AifectDesign.muted) }
                                .padding(14).frame(minHeight: 48).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
                        }.buttonStyle(.plain)
                    }
                }.padding(16)
            }.background(Brand.background).navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { dismiss() } } }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
}

// Version 1 keeps the same scene/line IDs and sound anchors used by the recorder.
private struct DubbingEditorAddButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle()).opacity(configuration.isPressed ? 0.6 : 1)
    }
}

enum DubbingScriptEditing {
    static func editPayload(_ request: [String: Any]) -> [String: Any] {
        let script = request.object("script"), action = request.string("action"), target = request.string("target")
        let sceneMode = ["scene", "flow"].contains(action)
        let lines = script.objects("lines").filter { sceneMode ? $0.string("sceneId") == target : $0.selfID == target }
        let sceneID = sceneMode ? target : lines.first?.string("sceneId") ?? ""
        let scene = script.objects("scenes").first { $0.selfID == sceneID } ?? [:]
        return ["mode": action == "shorten" ? "shorter" : action == "lengthen" ? "longer" : action,
            "scene": scene.string("title"), "description": scene.string("description"),
            "lines": lines.map { line in ["id": line.selfID, "speaker": script.objects("roles").first { $0.selfID == line.string("roleId") }?.string("name") ?? "", "text": line.string("text")] }]
    }
    static func applyingSuggestions(_ suggestions: [[String: Any]], request: [String: Any]) throws -> [String: Any] {
        var script = request.object("script")
        let selected = editPayload(request).objects("lines")
        guard !selected.isEmpty, suggestions.map(\.selfID) == selected.map(\.selfID), suggestions.allSatisfy({ !$0.string("text").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.string("text").count <= 700 }) else {
            throw APIError(status: 0, message: "AI 수정안이 선택 범위와 달라요. 원문은 그대로 보관되어 있어요.")
        }
        let edits = Dictionary(uniqueKeysWithValues: suggestions.map { ($0.selfID, $0.string("text")) })
        script["lines"] = script.objects("lines").map { line in var result = line; if let text = edits[line.selfID] { result["text"] = text }; return result }
        return script
    }
    static func blank(options: [String: Any]) -> [String: Any] {
        let roles: [[String: Any]] = (1...max(1, min(6, options.int("roleCount")))).map { ["id": "role_\($0)", "name": "배역 \($0)", "gender": "unspecified", "personality": ""] }
        return ["version": 1, "title": "", "genres": options["genres"] ?? ["일상"], "roles": roles,
                "scenes": [["id": "scene_1", "title": "첫 장면", "description": ""]],
                "lines": roles.enumerated().map { line(scene: "scene_1", role: $0.element.selfID, order: $0.offset + 1) }, "soundCues": []]
    }
    static func line(scene: String, role: String, order: Int, text: String = "") -> [String: Any] {
        ["id": UUID().uuidString.lowercased(), "sceneId": scene, "roleId": role, "order": order, "text": text, "emotion": "자연스럽게", "direction": "", "durationSeconds": min(40, max(1, Double(text.count) / 5 + 1)), "gapSeconds": 1.0]
    }
    static func cue(kind: String, scene: String, line: String, prompt: String = "", anchor: String = "start") -> [String: Any] {
        var cue: [String: Any] = ["id": UUID().uuidString.lowercased(), "kind": kind, "sceneId": scene, "lineId": line, "prompt": prompt, "anchor": anchor, "offsetSeconds": 0.0,
            "generationSeconds": kind == "bgm" ? 10.0 : 3.0, "durationSeconds": 3.0, "volume": kind == "bgm" ? 0.1 : 0.3, "fadeInSeconds": 0.2, "fadeOutSeconds": 0.5]
        if kind == "bgm" { cue["musicUse"] = "intro" }
        return cue
    }
    static func ordered(_ script: [String: Any]) -> [String: Any] {
        var result = script
        let lines = script.objects("lines")
        result["lines"] = script.objects("scenes").flatMap { scene in lines.filter { $0.string("sceneId") == scene.selfID } }.enumerated().map { index, line in var row = line; row["order"] = index + 1; return row }
        return result
    }
    static func duration(_ script: [String: Any]) -> Double {
        var cursor = 2.0, ranges: [String: (Double, Double, Double)] = [:]
        for line in script.objects("lines") {
            let end = cursor + line.number("durationSeconds"), slot = end + line.number("gapSeconds")
            ranges[line.selfID] = (cursor, end, slot); cursor = slot
        }
        var total = cursor + 2
        for cue in script.objects("soundCues") {
            guard let line = ranges[cue.string("lineId")] else { continue }
            let at: Double
            switch cue.string("anchor") {
            case "before": at = line.0 - cue.number("durationSeconds")
            case "after": at = line.1
            case "scene": at = cue.string("lineId") == script.objects("lines").first?.selfID ? 0 : line.0
            default: at = line.0
            }
            total = max(total, ranges[cue.string("endLineId")]?.2 ?? (max(0, at + cue.number("offsetSeconds")) + cue.number("durationSeconds")))
        }
        return total
    }
    static func issues(_ script: [String: Any]) -> [String] {
        var issues: [String] = []
        let scenes = script.objects("scenes"), lines = script.objects("lines"), roles = script.objects("roles"), cues = script.objects("soundCues")
        if script.string("title").count > 100 || script.string("title").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append("작품 제목을 입력해주세요.") }
        if !(1...12).contains(scenes.count) { issues.append("장면은 1~12개까지 작성할 수 있어요.") }
        if !(1...6).contains(roles.count) { issues.append("배역은 1~6명까지 작성할 수 있어요.") }
        if roles.contains(where: { $0.string("name").isEmpty || $0.string("name").count > 40 || $0.string("personality").count > 240 }) { issues.append("배역 이름 1~40자·소개 240자 제한을 확인해주세요.") }
        if Set(roles.map { $0.string("name") }).count != roles.count { issues.append("배역 이름은 서로 다르게 입력해주세요.") }
        if lines.contains(where: { $0.string("emotion").count > 80 || $0.string("direction").count > 240 }) { issues.append("감정 80자·연기 지시 240자 제한을 확인해주세요.") }
        if lines.count > 120 { issues.append("대사는 최대 120개예요.") }
        if cues.count > 24 || cues.filter({ $0.string("kind") == "bgm" }).count > 3 { issues.append("음향은 BGM 포함 24개, BGM은 최대 3개예요.") }
        if scenes.contains(where: { $0.string("title").count > 80 || $0.string("description").count > 500 }) { issues.append("장면 제목 80자·설명 500자 제한을 확인해주세요.") }
        for scene in scenes where !lines.contains(where: { $0.string("sceneId") == scene.selfID }) { issues.append(scene.string("title") + "에 대사를 추가해주세요.") }
        for role in roles where !lines.contains(where: { $0.string("roleId") == role.selfID }) { issues.append(role.string("name") + "의 대사를 추가해주세요.") }
        if lines.contains(where: { $0.string("text").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || $0.string("text").count > 700 }) { issues.append("대사는 1~700자로 작성해주세요.") }
        for cue in cues {
            guard let start = lines.firstIndex(where: { $0.selfID == cue.string("lineId") }), lines[start].string("sceneId") == cue.string("sceneId") else { issues.append("음향의 시작 대사를 확인해주세요."); continue }
            if cue.string("prompt").isEmpty || cue.string("prompt").count > 500 { issues.append("음향 설명은 1~500자로 입력해주세요.") }
            if !cue.string("endLineId").isEmpty, (lines.firstIndex { $0.selfID == cue.string("endLineId") } ?? -1) < start { issues.append("BGM 종료는 시작 대사 뒤로 지정해주세요.") }
            if cue.string("anchor") == "scene", lines.first(where: { $0.string("sceneId") == cue.string("sceneId") })?.selfID != cue.string("lineId") { issues.append("장면 시작 음향은 첫 대사에 연결해주세요.") }
        }
        if duration(script) > 300 { issues.append("여유 구간과 음향을 포함해 5분 이내로 조절해주세요.") }
        return Array(Set(issues)).sorted()
    }
    struct Imported {
        let source: String
        var script: [String: Any]
        var unresolved: [[String: Any]]
    }
    static func parse(_ source: String, title: String, options: [String: Any]) -> Imported {
        var script = blank(options: options), scenes: [[String: Any]] = [], lines: [[String: Any]] = [], roles: [[String: Any]] = [], cues: [[String: Any]] = [], unresolved: [[String: Any]] = []
        var scene: [String: Any] = ["id": "scene_1", "title": "첫 장면", "description": ""]
        var description = false, sawHeader = false, pendingCues: [[String: Any]] = []
        func groups(_ pattern: String, _ value: String) -> [String]? {
            guard let expression = try? NSRegularExpression(pattern: pattern), let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) else { return nil }
            return (1..<match.numberOfRanges).map { Range(match.range(at: $0), in: value).map { String(value[$0]) } ?? "" }
        }
        func review(_ raw: String) { unresolved.append(["id": UUID().uuidString, "sceneId": scene.selfID, "text": raw]) }
        func finishScene() {
            for var cue in pendingCues {
                if let last = lines.last(where: { $0.string("sceneId") == scene.selfID }) { cue["lineId"] = last.selfID; cue["anchor"] = "after"; if cue.string("kind") == "bgm" { cue["musicUse"] = "outro" }; cues.append(cue) }
                else { review(cue.string("prompt")) }
            }
            pendingCues = []; scenes.append(scene)
        }
        for raw in source.components(separatedBy: .newlines) {
            let value = raw.trimmingCharacters(in: .whitespaces)
            if value.isEmpty { description = false; continue }
            if let match = groups("(?i)^\\s*(?:SCENE|장면|씬)\\s*([0-9]+)\\s*[—–:：.-]?\\s*(.*)$", value) {
                if sawHeader || !lines.isEmpty || !scene.string("description").isEmpty || !pendingCues.isEmpty || !scenes.isEmpty { finishScene(); scene = ["id": UUID().uuidString, "title": "", "description": ""] }
                scene["title"] = match[1].isEmpty ? "장면 \(scenes.count + 1)" : match[1]; description = false; sawHeader = true
            } else if ["[상황]", "[장면 설명]", "[설명]"].contains(value) { description = true
            } else if let sound = groups("(?i)^\\[(SFX|BGM|효과음|배경음악)\\s*[:：]\\s*(.*)\\]$", value) {
                let kind = ["BGM", "배경음악"].contains(sound[0].uppercased()) ? "bgm" : "sfx"
                pendingCues.append(cue(kind: kind, scene: scene.selfID, line: "", prompt: sound[1], anchor: "before")); description = false
            } else if let speaker = groups("^([^:：\\[\\]]{1,40})\\s*[:：]\\s*(.+)$", value) {
                let name = speaker[0].trimmingCharacters(in: .whitespaces)
                var role = roles.first { $0.string("name") == name }
                if role == nil { role = ["id": UUID().uuidString, "name": name, "gender": "unspecified", "personality": ""]; roles.append(role!) }
                let row = line(scene: scene.selfID, role: role!.selfID, order: lines.count + 1, text: speaker[1])
                for var cue in pendingCues { cue["lineId"] = row.selfID; if cue.string("kind") == "bgm" { cue["musicUse"] = lines.isEmpty ? "intro" : "transition" }; cues.append(cue) }; pendingCues = []
                lines.append(row); description = false
            } else if description {
                scene["description"] = scene.string("description") + (scene.string("description").isEmpty ? "" : "\n") + raw
            } else { review(raw) }
        }
        finishScene()
        script["title"] = title; script["roles"] = roles.isEmpty ? script["roles"] : roles
        script["scenes"] = scenes; script["lines"] = lines; script["soundCues"] = cues
        return Imported(source: source, script: script, unresolved: unresolved)
    }
}
