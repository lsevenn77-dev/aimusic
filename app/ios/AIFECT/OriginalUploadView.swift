import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class OriginalUpload: ObservableObject {
    @Published var busy = false
    @Published var message: String?
    @Published var submitted = false
    private var trackID: String?
    private var uncertain = false
    private var frozen: Data?
    private var owner: String?
    private var journalURL: URL?
    private var audioURL: URL?
    private struct Journal: Codable { var owner: String; var id: String?; var uncertain: Bool; var extensionName: String }
    func restore(account: String) -> URL? {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OriginalUploads").appendingPathComponent(Endpoint.pathID(account))
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        journalURL = directory.appendingPathComponent("pending.json")
        guard let data = try? Data(contentsOf: journalURL!), let record = try? JSONDecoder().decode(Journal.self, from: data), record.owner == account else { return nil }
        owner = account; trackID = record.id; uncertain = record.uncertain
        let url = directory.appendingPathComponent("audio." + record.extensionName)
        audioURL = url; frozen = try? Data(contentsOf: url)
        message = uncertain ? "이전 등록 응답을 확인하지 못했습니다. 창작자 스튜디오에서 확인해주세요." : "이전 업로드를 이어서 제출할 수 있습니다. 처음 입력한 음원 정보로 재시도합니다."
        return url
    }
    private func saveJournal(extensionName: String) throws {
        guard let owner, let journalURL else { return }
        try JSONEncoder().encode(Journal(owner: owner, id: trackID, uncertain: uncertain, extensionName: extensionName)).write(to: journalURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    var hasPending: Bool { trackID != nil || uncertain }

    func submit(file: URL, metadata: [String: Any], account: String, api: API? = nil) async -> String? {
        let api = api ?? API.shared
        guard !busy, !submitted else { return nil }
        guard owner == nil || owner == account else { message = "파일을 선택한 계정으로 다시 로그인해주세요."; return nil }
        guard !uncertain else { message = "이전 요청 결과를 확인하지 못했습니다. 중복 등록을 막기 위해 창작자 스튜디오에서 업로드 상태를 확인해주세요."; return nil }
        busy = true; owner = account; message = nil
        defer { busy = false }
        do {
            if frozen == nil {
                let accessed = file.startAccessingSecurityScopedResource(); defer { if accessed { file.stopAccessingSecurityScopedResource() } }
                let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard (100...80 * 1024 * 1024).contains(size), ["wav", "mp3", "flac"].contains(file.pathExtension.lowercased()) else { throw APIError(status: 0, message: "80MB 이하 WAV · FLAC · MP3 음원을 선택해주세요.") }
                frozen = try Data(contentsOf: file)
                if let journalURL {
                    audioURL = journalURL.deletingLastPathComponent().appendingPathComponent("audio." + file.pathExtension.lowercased())
                    try frozen?.write(to: audioURL!, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                }
            }
            guard let bytes = frozen else { return nil }
            if trackID == nil {
                var payload = metadata; payload["extension"] = file.pathExtension.lowercased(); payload["bytes"] = bytes.count
                uncertain = true
                try saveJournal(extensionName: file.pathExtension.lowercased())
                do {
                    let result = try await api.call("/api/uploads", method: "POST", body: payload)
                    guard !result.string("id").isEmpty else { throw URLError(.badServerResponse) }
                    trackID = result.string("id"); uncertain = false
                    try saveJournal(extensionName: file.pathExtension.lowercased())
                } catch let error as APIError where (400..<500).contains(error.status) { uncertain = false; if let journalURL { try? FileManager.default.removeItem(at: journalURL) }; throw error }
            }
            guard let trackID else { return nil }
            let status = try await api.call("/api/studio/tracks/\(Endpoint.pathID(trackID))").object("profile").string("status")
            if !["queued", "processing", "published", "hidden"].contains(status) {
                guard status == "uploading" else { throw APIError(status: 0, message: "창작자 스튜디오에서 음원 처리 상태를 확인해주세요.") }
                _ = try await api.request("/api/uploads/\(Endpoint.pathID(trackID))/audio", method: "PUT", bytes: bytes)
                _ = try await api.call("/api/uploads/\(Endpoint.pathID(trackID))/complete", method: "POST", body: [:])
            }
            if let journalURL { try? FileManager.default.removeItem(at: journalURL) }; if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
            submitted = true; frozen = nil; message = "업로드 완료 · 음원 변환 후 공개됩니다."
            return trackID
        } catch { message = error.localizedDescription; return nil }
    }
}

struct OriginalUploadView: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var upload = OriginalUpload()
    @State private var file: URL?
    @State private var picking = false
    @State private var title = ""
    @State private var producer = ""
    @State private var tool = ""
    @State private var genre = "K-POP"
    @State private var artist = "none"
    @State private var artists: [[String: Any]] = []
    @State private var description = ""
    @State private var lyrics = ""
    @State private var isAI = false
    @State private var rights = false
    @State private var karaoke = false
    @State private var confirm = false
    var body: some View {
        Form {
            if upload.submitted { Label(upload.message ?? "업로드 완료", systemImage: "checkmark.circle.fill").foregroundStyle(Brand.aqua) }
            else {
                Section("음원 파일") {
                    Button(file?.lastPathComponent ?? "WAV · FLAC · MP3 선택") { picking = true }.disabled(upload.hasPending)
                    Text("80MB 이하 · 5초 이상 20분 이하").font(.caption)
                }
                Section("음원 정보") {
                    TextField("곡 제목", text: $title)
                    TextField("창작자 닉네임", text: $producer)
                    TextField("사용한 AI 도구", text: $tool)
                    TextField("장르", text: $genre)
                    Picker("AI 아티스트", selection: $artist) {
                        Text("창작자 이름으로 공개").tag("none")
                        ForEach(artists.indices, id: \.self) { index in Text(artists[index].string("name")).tag(artists[index].string("id")) }
                    }
                    TextField("소개 (선택)", text: $description, axis: .vertical)
                    TextField("가사 (선택 · 자동 싱크)", text: $lyrics, axis: .vertical).lineLimit(4...10)
                }
                Section("공개 동의") {
                    Toggle("AI를 사용해 제작한 음원입니다", isOn: $isAI)
                    Toggle("공개할 음원 권리를 보유하고 있습니다", isOn: $rights)
                    Toggle("노래방 MR 제공과 커버 제작을 허용합니다", isOn: $karaoke)
                    Link("노래방 이용약관", destination: Endpoint.origin.appendingPathComponent("terms"))
                }
                Button(upload.busy ? "업로드 중…" : "음원 업로드 후 공개") { confirm = true }
                    .disabled(upload.busy || file == nil || (!upload.hasPending && (title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || producer.isEmpty || tool.isEmpty || genre.isEmpty || !isAI || !rights || !karaoke)))
                if let message = upload.message { Text(message).foregroundStyle(.secondary) }
            }
            Link("창작자 스튜디오에서 처리 상태 확인", destination: Endpoint.origin.appendingPathComponent("studio"))
        }.navigationTitle("원곡 음원 업로드").disabled(upload.busy)
            .fileImporter(isPresented: $picking, allowedContentTypes: [.audio]) { result in
                switch result { case .success(let url): file = url; case .failure(let error): upload.message = error.localizedDescription }
            }
            .task {
                if let owner = model.userID { file = upload.restore(account: owner) }
                do { let data = try await API.shared.call("/api/studio"); artists = data.objects("artists"); producer = data.object("producer").string("name", fallback: model.user?.string("name") ?? "") }
                catch { upload.message = error.localizedDescription }
            }
            .confirmationDialog("이 음원을 업로드하고 공개할까요?", isPresented: $confirm, titleVisibility: .visible) {
                Button("업로드 후 공개") { Task {
                    guard let file, let owner = model.userID else { return }
                    let metadata: [String: Any] = ["title": title, "producer": producer, "ai_tool": tool, "genre": genre, "artist_id": artist, "description": description, "lyrics_mode": lyrics.isEmpty ? "none" : "auto", "lyrics_source": lyrics, "lyrics_language": "ko", "rights": rights, "is_ai": isAI, "karaoke": karaoke]
                    if let id = await upload.submit(file: file, metadata: metadata, account: owner) {
                        model.player.pause(); await ListeningAds.shared.uploadCompleted(id: id)
                    }
                } }
            }
            .interactiveDismissDisabled(upload.busy)
    }
}
