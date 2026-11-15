import SwiftUI
import CryptoKit

@MainActor final class DubbingScriptEditorModel: ObservableObject {
    @Published var options: [String: Any] = ["genres": ["일상"], "roleCount": 2, "minutes": 1.0, "mood": "랜덤", "ending": "랜덤", "idea": ""]
    @Published var script: [String: Any] = [:]
    @Published var generation: [String: Any] = [:]
    @Published var config: [String: Any] = [:]
    @Published var title = ""
    @Published var manualText = ""
    @Published var busy = false
    @Published var canRetryGeneration = false
    @Published var error: String?
    private(set) var generationID = ""
    private(set) var projectID = UUID().uuidString
    private let existing: [String: Any]?
    private let file: URL
    private let sessionRevision: Int
    private let api: API
    var pending: Bool { generation.string("state") == "running" }
    init(owner: String, existing: [String: Any]?, api: API? = nil, root: URL? = nil) {
        self.existing = existing; self.api = api ?? .shared; sessionRevision = self.api.sessionRevision
        let hash = SHA256.hash(data: Data((owner + "|" + (existing?.selfID ?? "new")).utf8)).map { String(format: "%02x", $0) }.joined()
        file = (root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("DubbingScripts")).appendingPathComponent(hash + ".json")
        if let existing { options = existing.object("options"); script = existing.object("script"); projectID = existing.selfID }
        if let bytes = try? Data(contentsOf: file), let cached = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
           existing == nil || cached.int("baseRevision") == existing?.int("revision") {
            options = cached.object("options"); script = cached.object("script"); generation = cached.object("generation")
            generationID = cached.string("generationID"); projectID = cached.string("projectID", fallback: projectID)
            title = cached.string("title"); manualText = cached.string("manualText")
        }
    }
    func check() throws { try Task.checkCancellation(); guard api.sessionRevision == sessionRevision else { throw CancellationError() } }
    func persist() throws {
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        let data: [String: Any] = ["options": options, "script": script, "generation": generation, "generationID": generationID, "projectID": projectID, "title": title, "manualText": manualText, "baseRevision": existing?.int("revision") ?? 0]
        try JSONSerialization.data(withJSONObject: data).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func cache() { do { try persist() } catch { self.error = error.localizedDescription } }
    func load() async {
        do { config = try await api.call("/api/dubbing/config"); try check() } catch { self.error = error.localizedDescription }
        if pending { await recover() }
    }
    private func accept(_ value: [String: Any]) throws {
        try check(); let originalOptions = generation.object("requestOptions"); generation = value
        if !originalOptions.isEmpty { generation["requestOptions"] = originalOptions }; canRetryGeneration = false
        if !value.string("id").isEmpty { generationID = value.string("id") }
        if !value.object("script").isEmpty { script = value.object("script"); options = value.object("options") }
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
            try accept(await api.call("/api/dubbing/generations", method: "POST", body: ["requestId": generationID, "options": generation.object("requestOptions")]))
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
        guard !busy else { return nil }; busy = true; error = nil; defer { busy = false }
        do {
            try check(); try persist()
            var body: [String: Any] = ["id": projectID, "options": options, "script": script]
            if !generationID.isEmpty { body["generationId"] = generationID }
            if let existing { body["revision"] = existing.int("revision") }
            let path = "/api/dubbing/projects" + (existing.map { "/" + Endpoint.pathID($0.selfID) } ?? "")
            let result = try await api.call(path, method: existing == nil ? "POST" : "PUT", body: body).object("project")
            try check(); guard !result.selfID.isEmpty else { throw DubbingWAV.failure }
            try? FileManager.default.removeItem(at: file); return result.selfID
        } catch { if !Task.isCancelled { self.error = error.localizedDescription }; return nil }
    }
    func field(_ key: String) -> Binding<String> { Binding(get: { self.script.string(key) }, set: { self.script[key] = String($0.prefix(100)) }) }
    func rowField(_ collection: String, _ index: Int, _ key: String, limit: Int = 700) -> Binding<String> {
        Binding(get: { self.script.objects(collection)[index].string(key) }, set: { value in
            var rows = self.script.objects(collection); rows[index][key] = String(value.prefix(limit)); self.script[collection] = rows
        })
    }
    func rowNumber(_ index: Int, _ key: String) -> Binding<Double> {
        Binding(get: { self.script.objects("lines")[index].number(key) }, set: { value in
            var rows = self.script.objects("lines"); rows[index][key] = (value * 10).rounded() / 10; self.script["lines"] = rows
        })
    }
}

struct NativeDubbingEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scene
    @StateObject private var editor: DubbingScriptEditorModel
    @State private var manual = false
    @State private var advanced = false
    @State private var destination: SiteWorkspace?
    private let existing: [String: Any]?
    init(owner: String, existing: [String: Any]? = nil) {
        self.existing = existing
        _editor = StateObject(wrappedValue: DubbingScriptEditorModel(owner: owner, existing: existing))
    }
    private let genres = ["SF", "이세계물", "판타지", "사극", "로맨스", "액션", "코미디", "첩보", "공포", "스릴러", "미스터리", "일상", "감동"]
    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Color.clear.frame(height: 1).id("dubbing-editor-top")
                if editor.script.isEmpty { optionsForm } else { scriptForm }
                if !editor.generation.string("message").isEmpty { Text(editor.generation.string("message")).font(.subheadline).foregroundStyle(AifectDesign.muted) }
                if let error = editor.error { Text(error).font(.subheadline).foregroundStyle(Brand.pink) }
                if editor.busy { ProgressView().frame(maxWidth: .infinity) }
            }.padding(16)
        }.accessibilityIdentifier("native-dubbing-editor").scrollDismissesKeyboard(.interactively)
            .navigationTitle(editor.script.isEmpty ? "더빙 만들기" : "대본 편집").navigationBarTitleDisplayMode(.inline).modifier(FullScreenWorkspace())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("기기에 저장") { editor.cache() } }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } }
            }
            .task { await editor.load() }
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
    private func option<T>(_ key: String, fallback: T) -> Binding<T> { Binding(get: { editor.options[key] as? T ?? fallback }, set: { editor.options[key] = $0 }) }
    private var optionsForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("장르 · 최대 2개").font(.headline)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 8) {
                ForEach(genres, id: \.self) { genre in
                    let selected = editor.options["genres"] as? [String] ?? []
                    Button(genre) {
                        if selected.contains(genre), selected.count > 1 { editor.options["genres"] = selected.filter { $0 != genre } }
                        else if !selected.contains(genre), selected.count < 2 { editor.options["genres"] = selected + [genre] }
                    }.font(.caption).buttonStyle(CatalogButtonStyle(filled: selected.contains(genre)))
                }
            }
            HStack {
                Picker("참여 인원", selection: option("roleCount", fallback: 2)) { ForEach(1...6, id: \.self) { Text("\($0)명").tag($0) } }
                Picker("대본 길이", selection: option("minutes", fallback: 1.0)) { ForEach(1...10, id: \.self) { Text(timeLabel(Double($0 * 30))).tag(Double($0) / 2) } }
            }.frame(maxWidth: .infinity)
            HStack {
                Picker("분위기", selection: option("mood", fallback: "랜덤")) { ForEach(["유쾌하게", "설레게", "진지하게", "긴장감 있게", "슬프게", "랜덤"], id: \.self) { Text($0) } }
                Picker("결말", selection: option("ending", fallback: "랜덤")) { ForEach(["해피엔딩", "새드엔딩", "반전", "열린 결말", "랜덤"], id: \.self) { Text($0) } }
            }
            Text("이야기의 세부사항").font(.headline)
            TextField("예: 막차에서 만난 두 사람의 비밀", text: option("idea", fallback: ""), axis: .vertical).lineLimit(3...8).textFieldStyle(DubbingFieldStyle())
            Button("이야기 랜덤 생성") { editor.options["idea"] = "(랜덤)" }
            Text("오늘 남은 작성 \(editor.config.object("quota").int("remaining"))회 · 한국 시간 자정 초기화").font(.caption).foregroundStyle(AifectDesign.muted)
            Button("AI 대본 작성하기") { Task { await editor.generate() } }.buttonStyle(CatalogButtonStyle(filled: true)).disabled(editor.busy || editor.pending || !editor.config.flag("aiAvailable"))
            if editor.canRetryGeneration { Button("같은 요청 다시 시도") { Task { await editor.retryGeneration() } }.disabled(editor.busy) }
            Button("이전 AI 생성 결과 확인") { Task { await editor.recover() } }.disabled(editor.busy)
            Button("직접 대사 쓰기") { manual.toggle() }.buttonStyle(CatalogButtonStyle()).disabled(editor.pending)
            if manual {
                TextField("작품 제목", text: $editor.title).textFieldStyle(DubbingFieldStyle()).accessibilityIdentifier("dubbing-manual-title")
                TextField("A: 대사\nB: 대사", text: $editor.manualText, axis: .vertical).lineLimit(8...20).textFieldStyle(DubbingFieldStyle()).accessibilityIdentifier("dubbing-manual-lines")
                Button("대본으로 정리하기") { editor.manual() }.buttonStyle(CatalogButtonStyle(filled: true)).disabled(editor.busy || editor.pending || editor.title.isEmpty || editor.manualText.isEmpty)
            }
        }.disabled(editor.busy)
    }
    private var scriptForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("작품 제목", text: editor.field("title")).textFieldStyle(DubbingFieldStyle())
            Text("등장인물").font(.headline)
            ForEach(Array(editor.script.objects("roles").enumerated()), id: \.element.selfID) { index, role in
                VStack(alignment: .leading) {
                    TextField("배역 이름", text: editor.rowField("roles", index, "name", limit: 40)).textFieldStyle(DubbingFieldStyle())
                    Picker("성별", selection: editor.rowField("roles", index, "gender")) { Text("미정").tag("unspecified"); Text("남").tag("male"); Text("여").tag("female") }.pickerStyle(.segmented)
                    TextField("캐릭터 소개", text: editor.rowField("roles", index, "personality", limit: 240), axis: .vertical).textFieldStyle(DubbingFieldStyle())
                }.padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
            }
            Toggle("연기 지시 · 시간 조절", isOn: $advanced)
            ForEach(Array(editor.script.objects("scenes").enumerated()), id: \.element.selfID) { index, _ in
                TextField("장면 제목", text: editor.rowField("scenes", index, "title", limit: 80)).textFieldStyle(DubbingFieldStyle())
                TextField("장면 설명", text: editor.rowField("scenes", index, "description", limit: 500), axis: .vertical).textFieldStyle(DubbingFieldStyle())
            }
            ForEach(Array(editor.script.objects("lines").enumerated()), id: \.element.selfID) { index, line in
                let roles = editor.script.objects("roles")
                let roleIndex = roles.firstIndex { $0.selfID == line.string("roleId") } ?? 0
                VStack(alignment: .leading, spacing: 10) {
                    Text("\(index + 1) · \(roles.indices.contains(roleIndex) ? roles[roleIndex].string("name") : "")").font(.caption.bold()).foregroundStyle(DubbingPalette.color(roleIndex))
                    TextField("대사", text: editor.rowField("lines", index, "text"), axis: .vertical).lineLimit(2...8).textFieldStyle(DubbingFieldStyle())
                    if advanced {
                        Picker("배역", selection: editor.rowField("lines", index, "roleId")) { ForEach(roles, id: \.selfID) { Text($0.string("name")).tag($0.selfID) } }
                        TextField("감정", text: editor.rowField("lines", index, "emotion", limit: 80)).textFieldStyle(DubbingFieldStyle())
                        TextField("연기 지시", text: editor.rowField("lines", index, "direction", limit: 240), axis: .vertical).textFieldStyle(DubbingFieldStyle())
                        Text(String(format: "대사 %.1f초", line.number("durationSeconds"))).font(.caption)
                        Slider(value: editor.rowNumber(index, "durationSeconds"), in: 1...40, step: 0.1)
                        Text(String(format: "대사 뒤 여유 %.1f초", line.number("gapSeconds"))).font(.caption)
                        Slider(value: editor.rowNumber(index, "gapSeconds"), in: 0.3...8, step: 0.1)
                    }
                }.padding(12).background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
            }
            Text("비공개 저장 · 골드 차감 없음").font(.caption).foregroundStyle(AifectDesign.muted)
            Button {
                Task { if let id = await editor.save() { if existing != nil { dismiss() } else { destination = SiteWorkspace(area: "dubbing", key: id, title: editor.script.string("title")) } } }
            } label: { Text("대본 저장").frame(maxWidth: .infinity, minHeight: 28) }
            .buttonStyle(CatalogButtonStyle(filled: true)).disabled(editor.busy)
        }
    }
}

private struct DubbingFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration.font(.system(size: 15)).padding(12).frame(minHeight: 48)
            .background(Brand.background.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
    }
}
