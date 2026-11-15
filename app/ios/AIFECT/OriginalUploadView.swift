import SwiftUI
import UniformTypeIdentifiers
import PhotosUI

@MainActor
final class OriginalUpload: ObservableObject {
    @Published var busy = false
    @Published var message: String?
    @Published var submitted = false
    @Published var progress = 0.0
    private var trackID: String?
    private var uncertain = false
    private var frozen: Data?
    private var owner: String?
    private var journalURL: URL?
    private var audioURL: URL?
    private var coverBytes: Data?
    private struct Journal: Codable { var owner: String; var id: String?; var uncertain: Bool; var extensionName: String }
    func restore(account: String) -> URL? {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OriginalUploads").appendingPathComponent(Endpoint.pathID(account))
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        journalURL = directory.appendingPathComponent("pending.json")
        guard let data = try? Data(contentsOf: journalURL!), let record = try? JSONDecoder().decode(Journal.self, from: data), record.owner == account else { return nil }
        owner = account; trackID = record.id; uncertain = record.uncertain
        let url = directory.appendingPathComponent("audio." + record.extensionName)
        audioURL = url; frozen = try? Data(contentsOf: url)
        coverBytes = try? Data(contentsOf: directory.appendingPathComponent("cover.webp"))
        message = uncertain ? "이전 등록 응답을 확인하지 못했습니다. 창작자 스튜디오에서 확인해주세요." : "이전 업로드를 이어서 제출할 수 있습니다. 처음 입력한 음원 정보로 재시도합니다."
        return url
    }
    private func saveJournal(extensionName: String) throws {
        guard let owner, let journalURL else { return }
        try JSONEncoder().encode(Journal(owner: owner, id: trackID, uncertain: uncertain, extensionName: extensionName)).write(to: journalURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    var hasPending: Bool { trackID != nil || uncertain }

    func submit(file: URL, metadata: [String: Any], account: String, cover: Data? = nil, api: API? = nil) async -> String? {
        let api = api ?? API.shared
        let session = api.sessionRevision
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
                coverBytes = cover
                if let cover, let journalURL { try cover.write(to: journalURL.deletingLastPathComponent().appendingPathComponent("cover.webp"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
            }
            guard let bytes = frozen else { return nil }
            if trackID == nil {
                var payload = metadata; payload["extension"] = file.pathExtension.lowercased(); payload["bytes"] = bytes.count
                uncertain = true
                try saveJournal(extensionName: file.pathExtension.lowercased())
                do {
                    let result = try await api.call("/api/uploads", method: "POST", body: payload)
                    guard session == api.sessionRevision else { throw CancellationError() }
                    guard !result.string("id").isEmpty else { throw URLError(.badServerResponse) }
                    trackID = result.string("id"); uncertain = false
                    try saveJournal(extensionName: file.pathExtension.lowercased())
                } catch let error as APIError where (400..<500).contains(error.status) {
                    uncertain = false; frozen = nil; coverBytes = nil
                    if let journalURL { try? FileManager.default.removeItem(at: journalURL); try? FileManager.default.removeItem(at: journalURL.deletingLastPathComponent().appendingPathComponent("cover.webp")) }
                    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }; audioURL = nil
                    throw error
                }
            }
            guard let trackID else { return nil }
            let status = try await api.call("/api/studio/tracks/\(Endpoint.pathID(trackID))").object("profile").string("status")
            guard session == api.sessionRevision else { throw CancellationError() }
            if !["queued", "processing", "published", "hidden"].contains(status) {
                guard status == "uploading" else { throw APIError(status: 0, message: "창작자 스튜디오에서 음원 처리 상태를 확인해주세요.") }
                message = "음원 업로드 중…"
                _ = try await api.request("/api/uploads/\(Endpoint.pathID(trackID))/audio", method: "PUT", bytes: bytes, progress: { self.progress = $0 })
                guard session == api.sessionRevision else { throw CancellationError() }
                if let coverBytes {
                    message = "앨범 커버 저장 중…"
                    _ = try await api.request("/api/uploads/\(Endpoint.pathID(trackID))/cover", method: "PUT", bytes: coverBytes, type: "image/webp")
                    guard session == api.sessionRevision else { throw CancellationError() }
                }
                message = "음원 제출 중…"
                _ = try await api.call("/api/uploads/\(Endpoint.pathID(trackID))/complete", method: "POST", body: [:])
            }
            guard session == api.sessionRevision else { throw CancellationError() }
            if let journalURL { try? FileManager.default.removeItem(at: journalURL) }; if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
            if let journalURL { try? FileManager.default.removeItem(at: journalURL.deletingLastPathComponent().appendingPathComponent("cover.webp")) }
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
    @State private var genres = ["K-POP"]
    @State private var moods: [String] = []
    @State private var mode = "솔로"
    @State private var newArtist = ""
    @State private var photo: PhotosPickerItem?
    @State private var cover: Data?
    @State private var artist = "none"
    @State private var artists: [[String: Any]] = []
    @State private var description = ""
    @State private var lyrics = ""
    @State private var lyricsMode = "auto"
    @State private var uploadConsent = false
    @State private var confirm = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if upload.submitted { Label(upload.message ?? "업로드 완료", systemImage: "checkmark.circle.fill").foregroundStyle(Brand.aqua) }
                else {
                    Button(file?.lastPathComponent ?? "WAV · FLAC · MP3 선택 (80MB 이하)") { picking = true }.buttonStyle(CatalogButtonStyle()).disabled(upload.hasPending)
                    StudioTextField(title: "곡 제목", text: $title, limit: 120).disabled(upload.hasPending)
                    VStack(spacing: 12) {
                        if let cover, let image = ArtworkRepository.decode(cover) { Image(uiImage: image).resizable().scaledToFit().frame(height: 144) }
                        PhotosPicker("앨범 커버 변경", selection: $photo, matching: .images).buttonStyle(CatalogButtonStyle(fullWidth: true)).disabled(upload.hasPending)
                    }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                    StudioSingleChoice(title: "AI 아티스트", choices: [("none", "선택 안 함 (내 활동명)"), ("new", "새 아티스트 만들기")] + artists.map { ($0.selfID, $0.string("name")) }, selection: $artist).disabled(upload.hasPending)
                    if artist == "new" { StudioTextField(title: "새 아티스트 이름", text: $newArtist, limit: 60).disabled(upload.hasPending) }
                    StudioTextField(title: "AI 제작 도구", text: $tool, limit: 100).disabled(upload.hasPending)
                    Text("노래 구성").font(.caption).foregroundStyle(AifectDesign.muted)
                    ParityChips(items: ["솔로", "듀엣"], selection: $mode).disabled(upload.hasPending)
                    StudioMultiChoice(title: "장르", choices: StudioChoices.genres.map { ($0, $0) }, maximum: 3, minimum: 1, selected: $genres).disabled(upload.hasPending)
                    StudioMultiChoice(title: "기분", choices: StudioChoices.moods, maximum: 4, minimum: 0, selected: $moods).disabled(upload.hasPending)
                    Text("새 제작곡은 업로드 후 AI가 음원을 분석해 장르와 기분을 분류해요.").font(.caption).foregroundStyle(AifectDesign.muted)
                    Text("가사").font(.headline)
                    StudioSingleChoice(title: "가사 등록 방식", choices: [("auto", "자동 싱크"), ("none", "가사 없음"), ("synced", "LRC 직접 입력")], selection: $lyricsMode).disabled(upload.hasPending)
                    if lyricsMode != "none" { StudioTextField(title: lyricsMode == "auto" ? "가사를 줄마다 입력하세요" : "[00:12.500] 가사", text: $lyrics, limit: lyricsMode == "auto" ? 6000 : 12000, multiline: true).disabled(upload.hasPending) }
                    StudioTextField(title: "곡 소개", text: $description, limit: 4000, multiline: true).disabled(upload.hasPending)
                    if !upload.hasPending {
                        Text("Suno 무료 플랜으로 만든 곡은 기본적으로 비상업적 용도로만 이용할 수 있어요. 다른 AI로 만든 곡도 제작 당시 요금제와 약관에서 상업적 이용과 위 이용허락이 가능한지 확인해주세요.").font(.footnote).foregroundStyle(AifectDesign.muted)
                        Toggle("AI로 제작한 이 음원과 가사·이미지를 업로드하고 공개할 권리가 있으며, 무단 복제물이나 허락 없이 복제한 타인의 음성을 사용하지 않았습니다. AIFECT에서 반주(MR)를 만들고 다른 이용자가 커버를 제작·공개하는 데 동의합니다. 또한 아이팩트가 직접 운영하는 게임과 웹사이트에서 이 음원을 사용할 수 있도록 비독점적으로 허락합니다.", isOn: $uploadConsent).font(.subheadline)
                        if let termsURL = URL(string: "/terms#original-upload", relativeTo: Endpoint.origin) { Link("음원 이용허락 약관 보기", destination: termsURL) }
                    }
                    if upload.busy { ProgressView(value: upload.progress); Text("\(Int(upload.progress * 100))%").font(.caption.monospacedDigit()) }
                    if let message = upload.message { Text(message).foregroundStyle(AifectDesign.muted) }
                    Button(upload.busy ? "업로드 중…" : upload.hasPending ? "업로드 다시 시도" : "음원 올리기") { confirm = true }
                        .buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(!canSubmit)
                }
            }.padding(18)
        }.modifier(FullScreenWorkspace()).navigationTitle("음원 업로드").disabled(upload.busy).scrollDismissesKeyboard(.interactively)
            .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } } }
            .task(id: photo) {
                guard let photo else { return }
                do { if let bytes = try await photo.loadTransferable(type: Data.self) { cover = try await Task.detached { try ChatImageEncoder.encode(bytes) }.value } }
                catch { upload.message = error.localizedDescription }
            }
            .fileImporter(isPresented: $picking, allowedContentTypes: [.audio]) { result in
                switch result { case .success(let url): file = url; if title.isEmpty { title = url.deletingPathExtension().lastPathComponent }; case .failure(let error): upload.message = error.localizedDescription }
            }
            .task {
                if let owner = model.userID { file = upload.restore(account: owner) }
                do { let data = try await API.shared.call("/api/studio"); artists = data.objects("artists"); producer = data.object("producer").string("name", fallback: model.user?.string("name") ?? "") }
                catch { upload.message = error.localizedDescription }
            }
            .confirmationDialog("이 음원을 업로드하고 공개할까요?", isPresented: $confirm, titleVisibility: .visible) {
                Button("업로드 후 공개") { Task {
                    guard let file, let owner = model.userID else { return }
                    var metadata: [String: Any] = ["title": title, "producer": producer, "ai_tool": tool, "genre": genres.first ?? "K-POP", "genres": genres, "moods": moods, "performance_mode": mode == "듀엣" ? "duet" : "solo", "description": description, "lyrics_mode": lyricsMode, "lyrics_source": lyricsMode == "auto" ? lyrics : "", "lyrics": lyricsMode == "synced" ? lyrics : "", "lyrics_language": "ko", "rights": uploadConsent, "is_ai": uploadConsent, "karaoke": uploadConsent, "upload_consent_version": "2026-11-02.1"]
                    if artist == "new" { metadata["artist"] = newArtist.trimmingCharacters(in: .whitespacesAndNewlines) } else { metadata["artist_id"] = artist }
                    if let id = await upload.submit(file: file, metadata: metadata, account: owner, cover: cover) {
                        model.player.pause(); await ListeningAds.shared.uploadCompleted(id: id)
                    }
                } }
            }
            .interactiveDismissDisabled(upload.busy)
    }
    private var canSubmit: Bool {
        !upload.busy && file != nil && (upload.hasPending || (!title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !producer.isEmpty && !tool.isEmpty && !genres.isEmpty && uploadConsent && (artist != "new" || !newArtist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) && (lyricsMode != "auto" || !lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)))
    }

}
