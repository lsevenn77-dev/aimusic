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
    private var pendingPayload: Data?
    private var requiresCover = false
    private struct Journal: Codable {
        var owner: String
        var id: String?
        var uncertain: Bool
        var extensionName: String
        var payload: Data?
        var requiresCover: Bool?
    }
    func restore(account: String) -> URL? {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OriginalUploads").appendingPathComponent(Endpoint.pathID(account))
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        journalURL = directory.appendingPathComponent("pending.json")
        guard let data = try? Data(contentsOf: journalURL!), let record = try? JSONDecoder().decode(Journal.self, from: data), record.owner == account else { return nil }
        owner = account; trackID = record.id; uncertain = record.uncertain
        pendingPayload = record.payload; requiresCover = record.requiresCover ?? false
        let url = directory.appendingPathComponent("audio." + record.extensionName)
        audioURL = url; frozen = try? Data(contentsOf: url)
        coverBytes = try? Data(contentsOf: directory.appendingPathComponent("cover.webp"))
        message = uncertain && pendingPayload == nil ? "이전 등록 응답을 확인하지 못했습니다. 스튜디오에서 확인해 주세요." : "저장된 음원 정보로 업로드를 이어서 제출할 수 있습니다."
        return url
    }
    private func saveJournal(extensionName: String) throws {
        guard let owner, let journalURL else { return }
        try JSONEncoder().encode(Journal(owner: owner, id: trackID, uncertain: uncertain, extensionName: extensionName, payload: pendingPayload, requiresCover: requiresCover)).write(to: journalURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    var hasPending: Bool { trackID != nil || uncertain }

    func submit(file: URL, metadata: [String: Any], account: String, cover: Data? = nil, api: API? = nil) async -> String? {
        let api = api ?? API.shared
        let session = api.sessionRevision
        guard !busy, !submitted else { return nil }
        guard owner == nil || owner == account else { message = "파일을 선택한 계정으로 다시 로그인해주세요."; return nil }
        guard !uncertain || pendingPayload != nil else { message = "이전 요청 결과를 확인하지 못했습니다. 스튜디오에서 업로드 상태를 확인해 주세요."; return nil }
        busy = true; owner = account; message = nil
        defer { busy = false }
        do {
            if frozen == nil {
                requiresCover = metadata["classification_mode"] as? String == "manual"
                if requiresCover && cover == nil { throw APIError(status: 0, message: "커버 이미지를 선택해 주세요.") }
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
                var payload = metadata
                if let pendingPayload {
                    guard let saved = try JSONSerialization.jsonObject(with: pendingPayload) as? [String: Any] else { throw URLError(.cannotDecodeContentData) }
                    payload = saved
                } else {
                    payload["extension"] = file.pathExtension.lowercased(); payload["bytes"] = bytes.count
                    payload["request_id"] = UUID().uuidString.lowercased()
                    pendingPayload = try JSONSerialization.data(withJSONObject: payload)
                }
                uncertain = true
                try saveJournal(extensionName: file.pathExtension.lowercased())
                do {
                    let result = try await api.call("/api/uploads", method: "POST", body: payload)
                    guard session == api.sessionRevision else { throw CancellationError() }
                    guard !result.string("id").isEmpty else { throw URLError(.badServerResponse) }
                    trackID = result.string("id"); uncertain = false
                    pendingPayload = nil
                    try saveJournal(extensionName: file.pathExtension.lowercased())
                } catch let error as APIError where (400..<500).contains(error.status) {
                    uncertain = false; frozen = nil; coverBytes = nil; pendingPayload = nil
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
                _ = try await api.call("/api/uploads/\(Endpoint.pathID(trackID))/complete", method: "POST", body: requiresCover ? ["require_cover": true] : [:])
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
    @State private var importingLyrics = false
    @State private var title = ""
    @State private var producer = ""
    @State private var initialProducer = ""
    @State private var producerBio = ""
    @State private var otherTool = ""
    @State private var usesOther = false
    @State private var noAI = false
    @State private var tools: [String] = []
    @State private var roles: [String] = []
    @State private var genres: [String] = []
    @State private var genreQuery = ""
    @State private var genreStatus = ""
    @State private var analyzing = false
    @State private var moods: [String] = []
    @State private var mode = "솔로"
    @State private var newArtist = ""
    @State private var photo: PhotosPickerItem?
    @State private var cover: Data?
    @State private var loadingCover = false
    @State private var artist = "none"
    @State private var artists: [[String: Any]] = []
    @State private var description = ""
    @State private var autoLyrics = ""
    @State private var syncedLyrics = ""
    @State private var autoFilename = ""
    @State private var syncedFilename = ""
    @State private var lyricsMode = "auto"
    @State private var language = "ko"
    @State private var tags = ""
    @State private var tagSuggestions: [String] = []
    @State private var tagStatus = ""
    @State private var refreshTags = 0
    @State private var options: [String: Any] = [:]
    @State private var uploadConsent = false
    @State private var confirm = false
    @State private var help = false
    @FocusState private var focus: String?

    static let lyricModes = [("auto", "가사 입력하고 자동 싱크 (추천)"), ("no_lyrics", "가사가 없는 노래"), ("later", "나중에 등록"), ("synced", "직접 싱크 등록 / LRC")]
    private var editable: Bool { !upload.busy && !upload.hasPending }
    private var terms: [String: Any] { options.object("terms") }
    private var termURL: URL? { URL(string: "/terms#original-upload", relativeTo: Endpoint.origin) }
    private var otherCredits: [String] {
        otherTool.components(separatedBy: CharacterSet(charactersIn: ",，;\n")).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
    private var credit: String {
        if noAI { return "AI 사용 안 함" }
        var seen = Set<String>()
        return (tools + (usesOther ? otherCredits : [])).filter { seen.insert($0.lowercased()).inserted }.joined(separator: ", ")
    }

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if upload.submitted {
                        Label(upload.message ?? "업로드 완료", systemImage: "checkmark.circle.fill").foregroundStyle(Brand.aqua)
                    } else {
                        if !upload.hasPending {
                            filesSection
                            Divider()
                            basicSection
                            Divider()
                            genreSection
                            StudioMultiChoice(title: "기분 · 활동", choices: StudioChoices.moods, maximum: 4, minimum: 0, selected: $moods)
                            StudioTextField(title: "곡 소개", text: $description, limit: 4000, multiline: true)
                            Divider()
                            lyricSection
                            Divider()
                            creditsSection
                            tagSection
                            Divider()
                            consentSection
                        } else {
                            Text(file?.lastPathComponent ?? "저장한 음원").font(.subheadline)
                        }
                        if upload.busy { ProgressView(value: upload.progress); Text("\(Int(upload.progress * 100))%").font(.caption.monospacedDigit()) }
                        if let message = upload.message { Text(message).foregroundStyle(Brand.pink).accessibilityIdentifier("studio-upload-status") }
                        Button(upload.busy ? "업로드 중…" : upload.hasPending ? "업로드 다시 시도" : "음원 등록") {
                            if let (field, message) = missingInput {
                                upload.message = message
                                withAnimation { scroll.scrollTo(field, anchor: .center) }
                                if ["title", "producer", "artist", "genres", "lyrics", "credit"].contains(field) { focus = field }
                            } else { confirm = true }
                        }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(upload.busy || loadingCover)
                    }
                }.padding(16)
            }
        }.modifier(FullScreenWorkspace()).navigationTitle("음원 업로드").navigationBarTitleDisplayMode(.inline)
            .disabled(upload.busy).scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Text("* 필수 입력").font(.caption2).foregroundStyle(Brand.pink)
                    Button { help = true } label: { Image(systemName: "questionmark.circle") }.accessibilityLabel("업로드 Q&A")
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { focus = nil; UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } }
            }
            .sheet(isPresented: $help) { uploadHelp }
            .fileImporter(isPresented: $picking, allowedContentTypes: importingLyrics ? [.plainText, UTType(filenameExtension: "lrc") ?? .data] : [.audio]) { result in
                do {
                    let url = try result.get()
                    if importingLyrics { try importLyrics(url) }
                    else { try chooseAudio(url) }
                } catch { upload.message = error.localizedDescription }
            }
            .task(id: photo) { await readCover(photo) }
            .task(id: model.userID) { await load() }
            .task(id: tagTaskKey) { await suggestTags() }
            .confirmationDialog("이 음원을 업로드하고 공개할까요?", isPresented: $confirm, titleVisibility: .visible) {
                Button("업로드 후 공개") { Task { await submit() } }
            }
            .interactiveDismissDisabled(upload.busy)
    }

    private var filesSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            required("원본 음원")
            Button(file?.lastPathComponent ?? "음원 선택") { importingLyrics = false; picking = true }
                .buttonStyle(CatalogButtonStyle(fullWidth: true)).id("audio")
            Text("WAV · FLAC · MP3 · 최대 80MB · 5초~20분").font(.caption).foregroundStyle(AifectDesign.muted)
            required("커버 이미지").padding(.top, 4).id("cover")
            if let cover, let image = ArtworkRepository.decode(cover) {
                Image(uiImage: image).resizable().scaledToFill().frame(width: 88, height: 88).clipped().accessibilityLabel("선택한 커버 이미지")
            }
            HStack {
                PhotosPicker(cover == nil ? "커버 이미지 선택" : "커버 이미지 교체", selection: $photo, matching: .images, preferredItemEncoding: .current)
                    .buttonStyle(CatalogButtonStyle())
                if cover != nil { Button("선택 취소") { photo = nil; cover = nil }.frame(minHeight: 44) }
            }
            Text("JPG · PNG · WebP · 최대 5MB · 정사각형 권장").font(.caption).foregroundStyle(AifectDesign.muted)
        }
    }

    private var basicSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            uploadText("곡 제목", $title, limit: 120, field: "title")
            Text("노래 구성").font(.caption).foregroundStyle(AifectDesign.muted)
            ParityChips(items: ["솔로", "듀엣"], selection: $mode)
            uploadText("작곡가 / 제작자 이름", $producer, limit: 60, field: "producer")
            StudioSingleChoice(title: "AI 아티스트", choices: [("none", "선택 안 함 (내 활동명)"), ("new", "새 아티스트 만들기")] + artists.map { ($0.selfID, $0.string("name")) }, selection: $artist)
            if artist == "new" { uploadText("새 아티스트 이름", $newArtist, limit: 60, field: "artist") }
        }
    }

    private var genreSection: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                required("등록 장르")
                Spacer()
                Button {
                    guard !analyzing else { return }
                    Task { await analyzeGenre() }
                } label: { Label("자동 장르 기입", systemImage: "sparkles") }
                    .buttonStyle(CatalogButtonStyle()).tint(AifectDesign.violet).disabled(analyzing)
            }
            if genres.isEmpty { Text("장르를 추가해 주세요.").font(.caption).foregroundStyle(AifectDesign.muted) }
            GenreFlowLayout() {
                ForEach(genres, id: \.self) { genre in
                    Button { genres.removeAll { $0 == genre } } label: { Text(genre + " ×").foregroundStyle(Brand.aqua) }
                        .buttonStyle(CatalogButtonStyle()).accessibilityLabel(genre + " 장르 삭제")
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(AifectDesign.muted)
                    TextField("장르 검색 또는 직접 입력", text: $genreQuery).submitLabel(.done).onSubmit { addGenre(genreQuery) }
                        .onChange(of: genreQuery) { _, value in if value.count > 80 { genreQuery = String(value.prefix(80)) } }
                        .focused($focus, equals: "genres")
                    Button("추가") { addGenre(genreQuery) }.frame(minHeight: 44)
                }
                if !genreKey(genreQuery).isEmpty {
                    GenreFlowLayout() {
                        ForEach(StudioChoices.genres.filter { item in !genres.contains(item) && genreNames(item).contains { genreKey($0).contains(genreKey(genreQuery)) } }, id: \.self) { genre in
                            Button(genre) { addGenre(genre) }.buttonStyle(CatalogButtonStyle())
                        }
                    }
                }
                Text("추천 장르").font(.caption).foregroundStyle(AifectDesign.muted)
                GenreFlowLayout() {
                    ForEach(options["recommended_genres"] as? [String] ?? Array(StudioChoices.genres.prefix(12)), id: \.self) { genre in
                        Button((genres.contains(genre) ? "✓ " : "+ ") + genre) { addGenre(genre) }.buttonStyle(CatalogButtonStyle())
                    }
                }
            }.padding(9).background(Brand.card, in: RoundedRectangle(cornerRadius: 10))
            if !genreStatus.isEmpty { Text(genreStatus).font(.caption).foregroundStyle(AifectDesign.muted) }
        }.id("genres")
    }

    private var lyricBinding: Binding<String> {
        Binding(get: { lyricsMode == "auto" ? autoLyrics : syncedLyrics }, set: {
            if lyricsMode == "auto" { autoLyrics = String($0.prefix(6000)) }
            else { syncedLyrics = String($0.prefix(12000)) }
        })
    }

    private var lyricSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("가사 등록").font(.headline)
            HStack {
                Text("가사 등록 방식").font(.caption).foregroundStyle(AifectDesign.muted)
                Spacer()
                Picker("가사 등록 방식", selection: $lyricsMode) {
                    ForEach(Self.lyricModes, id: \.0) { choice in Text(choice.1).tag(choice.0) }
                }.pickerStyle(.menu)
            }
            if lyricsMode == "auto" || lyricsMode == "synced" {
                if lyricsMode == "auto" {
                    let languages = options["lyrics_languages"] as? [String: String] ?? ["ko": "한국어"]
                    StudioSingleChoice(title: "가사 언어", choices: languages.sorted { $0.key < $1.key }.map { ($0.key, $0.value) }, selection: $language)
                }
                HStack {
                    required(lyricsMode == "auto" ? "가사 입력" : "LRC 입력")
                    Spacer()
                    Button(lyricsMode == "auto" ? "TXT 파일 불러오기" : "LRC 파일 불러오기") { importingLyrics = true; picking = true }
                        .buttonStyle(CatalogButtonStyle())
                }
                let name = lyricsMode == "auto" ? autoFilename : syncedFilename
                if !name.isEmpty { Text(name).font(.caption).foregroundStyle(AifectDesign.muted) }
                TextField(lyricsMode == "auto" ? "실제 부르는 가사를 한 줄씩 입력하세요.\n반복 가사도 노래 순서대로 모두 입력하세요." : "[00:12.500] 가사", text: lyricBinding, axis: .vertical)
                    .lineLimit(5...12).padding(10).focused($focus, equals: "lyrics")
                    .background(Brand.card, in: RoundedRectangle(cornerRadius: 10))
                Text(lyricsMode == "auto" ? "최대 6,000자 · 200줄 / [ ] 안의 구간 설명은 자동 제외됩니다.\n음원 변환 완료 후 가사 싱크가 자동 생성·적용됩니다.\n스튜디오에서 가사를 수정할 수 있습니다." : "LRC 또는 TXT · UTF-8 · 최대 64KB · 12,000자")
                    .font(.caption).foregroundStyle(AifectDesign.muted)
            }
            if lyricsMode == "no_lyrics" { Text("가사 변환 없이 등록됩니다.").font(.caption).foregroundStyle(AifectDesign.muted) }
            if lyricsMode == "later" { Text("스튜디오에서 가사를 추가할 수 있습니다.").font(.caption).foregroundStyle(AifectDesign.muted) }
        }.id("lyrics")
    }

    private var creditsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            required("사용한 AI 도구 (복수 선택)")
            GenreFlowLayout() {
                ForEach(options.objects("ai_tools").map { $0.string("name") }, id: \.self) { tool in
                    Button((tools.contains(tool) ? "✓ " : "") + tool) { toggle(tool, in: &tools); noAI = false }.buttonStyle(CatalogButtonStyle())
                }
                Button((usesOther ? "✓ " : "") + "기타") { usesOther.toggle(); if usesOther { noAI = false } }.buttonStyle(CatalogButtonStyle())
                Button((noAI ? "✓ " : "") + "AI 사용 안 함") { noAI.toggle(); if noAI { tools = []; usesOther = false } }.buttonStyle(CatalogButtonStyle())
            }
            if usesOther { uploadText("기타 AI 도구", $otherTool, limit: 100, field: "otherTool", focusKey: "credit") }
            Text("사람이 참여한 부분").font(.caption).foregroundStyle(AifectDesign.muted)
            GenreFlowLayout() {
                ForEach(["작사", "작곡", "편곡", "보컬", "믹싱"], id: \.self) { role in
                    Button((roles.contains(role) ? "✓ " : "") + role) { toggle(role, in: &roles) }.buttonStyle(CatalogButtonStyle())
                }
            }
        }.id("credit")
    }

    private var tagSection: some View {
        VStack(alignment: .leading, spacing: 5) {
            StudioTextField(title: "태그 (쉼표로 구분)", text: $tags, limit: 300)
            GenreFlowLayout() {
                ForEach(tagList, id: \.self) { tag in
                    Button(tag + " ×") { tags = tagList.filter { $0 != tag }.joined(separator: ", ") }.buttonStyle(CatalogButtonStyle())
                }
            }
            Button("추천 새로 받기") { refreshTags += 1 }.frame(minHeight: 44).disabled(title.isEmpty && activeLyrics.isEmpty)
            GenreFlowLayout() {
                ForEach(tagSuggestions.filter { suggestion in !tagList.contains { $0.caseInsensitiveCompare(suggestion) == .orderedSame } }, id: \.self) { tag in
                    Button("+ " + tag) {
                        let next = (tagList + [tag]).joined(separator: ", ")
                        if next.count <= 300 { tags = next } else { tagStatus = "태그는 300자까지 입력할 수 있습니다." }
                    }.buttonStyle(CatalogButtonStyle())
                }
            }
            if !tagStatus.isEmpty { Text(tagStatus).font(.caption).foregroundStyle(AifectDesign.muted) }
        }
    }

    private var consentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            required("등록 동의")
            if terms.isEmpty { Button("이용허락 불러오기") { Task { await load() } } }
            else {
                Text(terms.string("notice")).font(.footnote).foregroundStyle(AifectDesign.muted)
                Toggle(terms.string("text"), isOn: $uploadConsent).font(.subheadline)
            }
            if let termURL { Link("음원 이용허락 약관 보기", destination: termURL).frame(minHeight: 44) }
        }.id("consent")
    }

    private var uploadHelp: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("음원은 80MB 이하 WAV·FLAC·MP3, 커버는 5MB 이하 JPG·PNG·WebP를 선택해 주세요.")
                    Text("장르는 검색·직접 입력·추천·자동 기입을 섞어서 최대 3개까지 등록할 수 있습니다.")
                    Text("가사가 없는 노래는 가사 변환 없이 등록됩니다. ‘나중에 등록’을 선택하면 스튜디오에서 가사를 추가할 수 있습니다.")
                    if let termURL { Link("음원 이용허락 약관 보기", destination: termURL) }
                }.padding(16)
            }.navigationTitle("업로드 Q&A").toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { help = false } } }
        }
    }

    private func required(_ title: String) -> some View {
        (Text(title) + Text(" *").foregroundColor(Brand.pink)).font(.subheadline.weight(.semibold))
    }

    private func uploadText(_ title: String, _ value: Binding<String>, limit: Int, field: String, focusKey: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            required(title)
            TextField(title, text: Binding(get: { value.wrappedValue }, set: { value.wrappedValue = String($0.prefix(limit)) }))
                .padding(10).background(Brand.card, in: RoundedRectangle(cornerRadius: 10)).focused($focus, equals: focusKey ?? field)
        }.id(field)
    }

    private var missingInput: (String, String)? {
        if file == nil { return ("audio", "음원 파일을 선택해 주세요.") }
        if upload.hasPending { return nil }
        if cover == nil { return ("cover", "커버 이미지를 선택해 주세요.") }
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return ("title", "곡 제목을 입력해 주세요.") }
        if producer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return ("producer", "제작자 이름을 입력해 주세요.") }
        if artist == "new" && newArtist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return ("artist", "아티스트 이름을 입력해 주세요.") }
        if genres.isEmpty { return ("genres", "장르를 추가해 주세요.") }
        if lyricsMode == "auto" && !validAutoLyrics(autoLyrics) { return ("lyrics", "자동 싱크 가사를 확인해 주세요. 최대 6,000자·200줄, 한 줄 300자입니다.") }
        if lyricsMode == "synced" && syncedLyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return ("lyrics", "LRC 파일을 불러오거나 타임코드를 입력해 주세요.") }
        if credit.isEmpty || credit.utf16.count > 100 || (usesOther && otherCredits.isEmpty) { return ("credit", "도구 또는 AI 사용 안 함을 선택해 주세요. 도구 이름은 합계 100자 이내입니다.") }
        if terms.isEmpty || !uploadConsent { return ("consent", "음원 이용허락을 확인하고 동의해 주세요.") }
        return nil
    }

    private func chooseAudio(_ url: URL) throws {
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard (100...80 * 1024 * 1024).contains(size), ["wav", "flac", "mp3"].contains(url.pathExtension.lowercased()) else { throw APIError(status: 0, message: "80MB 이하 WAV·FLAC·MP3 음원을 선택해 주세요.") }
        file = url
        if title.isEmpty { title = url.deletingPathExtension().lastPathComponent }
        upload.message = nil
    }

    private func readCover(_ selection: PhotosPickerItem?) async {
        guard let selection else { return }
        loadingCover = true
        defer { if selection == photo { loadingCover = false } }
        do {
            guard let raw = try await selection.loadTransferable(type: Data.self), raw.count <= 5 * 1024 * 1024,
                  selection.supportedContentTypes.contains(where: { [.jpeg, .png, .webP].contains($0) }) else {
                throw APIError(status: 0, message: "5MB 이하 JPG·PNG·WebP 이미지를 선택해 주세요.")
            }
            let next = try await Task.detached { try ChatImageEncoder.encode(raw) }.value
            try Task.checkCancellation()
            if selection == photo { cover = next; upload.message = nil }
        } catch is CancellationError { }
        catch { if selection == photo { upload.message = error.localizedDescription } }
    }

    private func importLyrics(_ url: URL) throws {
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        let filename = url.lastPathComponent
        let allowed = lyricsMode == "auto" ? ["txt"] : ["txt", "lrc"]
        guard allowed.contains(url.pathExtension.lowercased()) else { throw APIError(status: 0, message: "지원하는 가사 파일을 선택해 주세요.") }
        let reader = try FileHandle(forReadingFrom: url); defer { try? reader.close() }
        let data = try reader.read(upToCount: 65_537) ?? Data()
        guard data.count <= 65_536, let text = String(data: data, encoding: .utf8) else { throw APIError(status: 0, message: "UTF-8 가사 파일을 64KB 이하로 선택해 주세요.") }
        if lyricsMode == "auto" {
            guard validAutoLyrics(text) else { throw APIError(status: 0, message: "자동 싱크 가사는 최대 6,000자·200줄, 한 줄 300자입니다.") }
            autoLyrics = stripAnnotations(text); autoFilename = filename
        } else {
            guard text.count <= 12000 else { throw APIError(status: 0, message: "가사는 최대 12,000자까지 입력해 주세요.") }
            syncedLyrics = text; syncedFilename = filename
        }
        upload.message = nil
    }

    private func stripAnnotations(_ value: String) -> String {
        value.replacingOccurrences(of: #"\[[^\]\r\n]*\]"#, with: "", options: .regularExpression)
    }

    private func validAutoLyrics(_ value: String) -> Bool {
        let lines = stripAnnotations(value).components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return value.utf16.count <= 6000 && (1...200).contains(lines.count) && lines.allSatisfy { $0.utf16.count <= 300 } && value.range(of: #"\[\d{1,3}:"#, options: .regularExpression) == nil
    }

    private func toggle(_ item: String, in values: inout [String]) {
        if values.contains(item) { values.removeAll { $0 == item } } else { values.append(item) }
    }

    private func genreNames(_ genre: String) -> [String] { [genre] + (options.object("genre_aliases")[genre] as? [String] ?? []) }
    private func genreKey(_ genre: String) -> String {
        genre.precomposedStringWithCompatibilityMapping.lowercased().filter { !$0.isWhitespace && $0 != "-" && $0 != "&" }
    }

    private func addGenre(_ value: String) {
        let name = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let genre = StudioChoices.genres.first { item in genreNames(item).contains { genreKey($0) == genreKey(name) } } ?? name
        guard !genre.isEmpty && genre != "분석 대기" && genre.utf16.count <= 80 else { genreStatus = "장르를 1~80자로 입력해 주세요."; return }
        guard !genres.contains(where: { genreKey($0) == genreKey(genre) }) else { genreStatus = "이미 추가한 장르입니다."; return }
        guard genres.count < 3 else { genreStatus = "장르는 최대 3개까지 등록할 수 있습니다."; return }
        genres.append(genre); genreQuery = ""; genreStatus = ""
    }

    private func analyzeGenre() async {
        guard !analyzing, editable else { return }
        guard let file else { genreStatus = "음원을 먼저 선택해 주세요."; return }
        guard genres.count < 3 else { genreStatus = "장르를 삭제하면 분석 결과를 추가할 수 있습니다."; return }
        analyzing = true; genreStatus = "음원에서 장르를 분석하고 있습니다…"
        defer { analyzing = false }
        do {
            let access = file.startAccessingSecurityScopedResource(); defer { if access { file.stopAccessingSecurityScopedResource() } }
            let audio = try Data(contentsOf: file, options: .mappedIfSafe)
            let response = try await API.shared.request("/api/studio/upload-genre-analysis?ext=" + file.pathExtension.lowercased(), method: "POST", bytes: audio, timeout: 130)
            guard self.file == file, editable else { genreStatus = "음원이 바뀌었습니다. 자동 장르 기입을 다시 눌러 주세요."; return }
            guard let result = try JSONSerialization.jsonObject(with: response) as? [String: Any], let suggested = result["genres"] as? [String] else { throw URLError(.badServerResponse) }
            let count = genres.count
            for genre in suggested where genres.count < 3 && StudioChoices.genres.contains(genre) && !genres.contains(genre) { genres.append(genre) }
            genreStatus = genres.count > count ? "분석한 장르를 추가했습니다." : "추가할 장르가 없습니다."
        } catch { genreStatus = error.localizedDescription }
    }

    private var tagList: [String] {
        var seen = Set<String>()
        return tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
    }
    private var activeLyrics: String { lyricsMode == "auto" ? stripAnnotations(autoLyrics) : lyricsMode == "synced" ? stripAnnotations(syncedLyrics) : "" }
    private var tagTaskKey: String { (model.userID ?? "") + "\n" + title + "\n" + activeLyrics + "\n" + String(refreshTags) }

    private func suggestTags() async {
        tagSuggestions = []; tagStatus = ""
        guard editable, model.userID != nil, !title.isEmpty || !activeLyrics.isEmpty else { return }
        do {
            try await Task.sleep(for: .milliseconds(1200))
            let data = try await API.shared.call("/api/studio/tag-suggestions", method: "POST", body: ["title": title, "lyrics": activeLyrics])
            try Task.checkCancellation()
            tagSuggestions = data["tags"] as? [String] ?? []
        } catch is CancellationError { }
        catch { tagStatus = "추천을 불러오지 못했습니다." }
    }

    private func load() async {
        guard let owner = model.userID else { return }
        if file == nil, let pending = upload.restore(account: owner) { file = pending }
        do {
            let studio = try await API.shared.call("/api/studio")
            guard owner == model.userID else { return }
            artists = studio.objects("artists")
            initialProducer = studio.object("producer").string("name", fallback: model.user?.string("name") ?? "")
            producerBio = studio.object("producer").string("bio")
            if producer.isEmpty { producer = initialProducer }
            let settings = try await API.shared.call("/api/studio/upload-options")
            if owner == model.userID { options = settings }
        } catch { if owner == model.userID { upload.message = error.localizedDescription } }
    }

    private func submit() async {
        guard missingInput == nil, let file, let owner = model.userID, !upload.busy else { return }
        var metadata: [String: Any] = [
            "title": title, "producer": producer, "ai_tool": credit, "genre": genres.first ?? "", "genres": genres,
            "moods": moods, "performance_mode": mode == "듀엣" ? "duet" : "solo", "description": description,
            "lyrics_mode": lyricsMode, "rights": uploadConsent, "is_ai": !noAI, "karaoke": uploadConsent,
            "upload_consent_version": terms.string("version"), "classification_mode": "manual",
            "participation": roles.joined(separator: ", "), "tags": tagList.joined(separator: ", ")
        ]
        if lyricsMode == "auto" { metadata["lyrics_source"] = autoLyrics; metadata["lyrics_language"] = language }
        if lyricsMode == "synced" { metadata["lyrics"] = syncedLyrics }
        if artist == "new" { metadata["artist"] = newArtist.trimmingCharacters(in: .whitespacesAndNewlines) } else { metadata["artist_id"] = artist }
        do {
            if !upload.hasPending && !initialProducer.isEmpty && producer != initialProducer {
                _ = try await API.shared.call("/api/studio/profile", method: "PUT", body: ["name": producer, "bio": producerBio])
                initialProducer = producer
            }
        } catch { upload.message = error.localizedDescription; return }
        if let id = await upload.submit(file: file, metadata: metadata, account: owner, cover: cover) {
            model.player.pause(); await ListeningAds.shared.uploadCompleted(id: id)
        }
    }
}
