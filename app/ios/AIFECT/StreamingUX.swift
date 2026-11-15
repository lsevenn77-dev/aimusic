import SwiftUI
import PhotosUI

enum StreamStyle {
    static let purple = Color(aifectHex: 0xB49AFF)
    static let cyan = Color(aifectHex: 0x79E5F2)
    static let blue = Color(aifectHex: 0x78ADFF)
    static let panel = Color(aifectHex: 0x111D30)
}

struct StreamingTabs: View {
    let items: [String]
    @Binding var selection: String
    var fullUnderline = false
    var underline = AifectDesign.violet
    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.self) { item in
                Button { selection = item } label: {
                    Text(item).font(.subheadline.weight(.semibold))
                        .foregroundStyle(selection == item ? AifectDesign.violet : AifectDesign.muted)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .overlay(alignment: .bottom) { Rectangle().fill(selection == item ? underline : .clear).frame(height: 2).frame(maxWidth: fullUnderline ? .infinity : 48).padding(.horizontal, 6) }
                }.buttonStyle(.plain).accessibilityAddTraits(selection == item ? .isSelected : [])
            }
        }
    }
}

struct StreamingHeading<Destination: View>: View {
    let title: String
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        HStack {
            Text(title).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
            NavigationLink { destination().streamingPage() } label: { HStack(spacing: 4) { Text("전체 보기"); Image(systemName: "chevron.right") }.font(.caption).foregroundStyle(AifectDesign.violet).frame(minHeight: 44) }
        }.padding(.top, 2)
    }
}

struct MusicLibraryShortcuts: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    var compact = false
    private let entries: [(String, String, Int, Color)] = [
        ("내 보관함", "square.on.square.fill", 3, StreamStyle.cyan),
        ("좋아요한 노래", "heart.fill", 1, Brand.pink),
        ("최근 감상", "clock", 2, StreamStyle.blue),
        ("플레이리스트", "music.note.list", 0, StreamStyle.purple)
    ]
    private func caption(_ index: Int) -> String {
        guard model.userID != nil else { return "로그인하고 모아보세요" }
        guard model.libraryLoaded else { return model.libraryError == nil ? "불러오는 중" : "다시 불러오기" }
        switch index {
        case 1: return "\(model.likes.count)곡"
        case 2: return "\(model.history.count)곡"
        case 0: return "\(model.playlists.count)개"
        default: return "저장한 음악"
        }
    }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            if compact && !typeSize.isAccessibilitySize {
                HStack(spacing: 8) { ForEach(entries, id: \.2) { item in tile(item, vertical: true).frame(minWidth: 72) } }
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach([entries[0], entries[1], entries[3], entries[2]], id: \.2) { item in tile(item, vertical: typeSize.isAccessibilitySize) }
            }
        }
        .task(id: model.userID) { await model.loadLibrary() }
    }
    private func tile(_ item: (String, String, Int, Color), vertical: Bool) -> some View {
        NavigationLink { LibraryView(initialSelection: item.2).navigationTitle(item.0).streamingPage() } label: {
            let layout = vertical ? AnyLayout(VStackLayout(spacing: 6)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                Image(systemName: item.1).font(.title2).foregroundStyle(item.3)
                    .overlay { if item.2 == 3 { Image(systemName: "music.note").font(.system(size: 12, weight: .bold)).foregroundStyle(Brand.background).offset(x: 2, y: -2) } }
                    .frame(width: compact ? 34 : 42, height: compact ? 34 : 42)
                    .background(compact ? .clear : item.3.opacity(0.23), in: RoundedRectangle(cornerRadius: 10)).shadow(color: compact ? item.3.opacity(0.35) : .clear, radius: 7)
                VStack(alignment: vertical ? .center : .leading, spacing: 4) {
                    Text(item.0).font(compact ? .caption : .subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                    if !compact { Text(caption(item.2)).font(.caption).foregroundStyle(AifectDesign.muted) }
                }
                if !vertical { Spacer(minLength: 0) }
            }.foregroundStyle(AifectDesign.text).frame(maxWidth: .infinity, minHeight: compact ? 62 : 48)
                .padding(10).background(LinearGradient(colors: [item.3.opacity(0.2), StreamStyle.panel], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(item.3.opacity(0.4), lineWidth: 1))
        }.buttonStyle(.plain).accessibilityIdentifier("music-shortcut-\(item.2)")
    }
}

struct StreamingSongRow: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    var rank: Int? = nil
    var movement = false
    var sing = false
    var body: some View {
        HStack(spacing: 8) {
            if let rank {
                VStack(spacing: 3) {
                    Text("\(rank)").font(.system(size: 13, weight: .semibold))
                    if movement { Text(song.rankMovementLabel).font(.system(size: 9)).foregroundStyle(song.chartMovement == "down" ? StreamStyle.blue : Brand.pink) }
                }.frame(width: 22)
                Button { model.player.play(song, queue: queue) } label: {
                    CoverArt(song: song, size: 44).overlay { Image(systemName: "play.fill").font(.system(size: 12)).frame(width: 29, height: 29).background(Brand.background.opacity(0.65), in: Circle()).overlay(Circle().stroke(Brand.gradient, lineWidth: 1)) }
                }.buttonStyle(.plain).accessibilityLabel("\(song.title) 앨범 표지 재생")
            }
            Button { model.navigationPath.append(song) } label: {
                HStack(spacing: 10) {
                    if rank == nil { CoverArt(song: song, size: 44) }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(song.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(AifectDesign.text).lineLimit(2)
                        Text(song.credit).font(.system(size: 11)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
            if rank != nil {
                Button { Task { await model.toggleLike(song) } } label: { Image(systemName: model.likes.contains(where: { $0.id == song.id }) ? "heart.fill" : "heart").font(.system(size: 17)).foregroundStyle(Brand.pink).frame(width: 44, height: 44) }.accessibilityLabel("\(song.title) 좋아요")
            } else { ArtworkPlayButton(diameter: 32, label: "\(song.title) 재생") { model.player.play(song, queue: queue) } }
            if sing { SingSongButton(song: song, title: "부르기", color: AifectDesign.violet, compact: true) }
            else { NavigationLink { SongMenuView(song: song).streamingPage() } label: { Image(systemName: "line.3.horizontal").font(.system(size: 17)).foregroundStyle(AifectDesign.muted).frame(width: 44, height: 44) }.accessibilityLabel("\(song.title) 더보기") }
        }.padding(.horizontal, rank == nil ? 0 : 8).padding(.vertical, 7)
            .background(rank == nil ? Color.clear : Brand.card.opacity(0.55), in: RoundedRectangle(cornerRadius: 9))
            .accessibilityIdentifier("stream-song-\(song.id)")
    }
}

struct StreamingPlaylistRow: View {
    @EnvironmentObject private var model: AppModel
    let list: [String: Any]
    @State private var playing = false
    var body: some View {
        HStack {
            NavigationLink { PlaylistView(id: list.string("id"), title: list.string("name")).streamingPage() } label: {
                HStack(spacing: 10) {
                    PlaylistArtwork(list: list).frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                    VStack(alignment: .leading, spacing: 5) { Text(list.string("name")).font(.subheadline); Text("\(list.int("tracks"))곡").font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }.buttonStyle(.plain)
            Button { Task { await play() } } label: { if playing { ProgressView() } else { Image(systemName: "play.circle.fill").font(.title2) } }.frame(width: 44, height: 44).disabled(playing).accessibilityLabel("\(list.string("name")) 전체 재생")
        }.padding(10).background(StreamStyle.panel, in: RoundedRectangle(cornerRadius: 12))
    }
    private func play() async {
        let owner = model.userID
        playing = true; defer { playing = false }
        do {
            let songs = try await API.shared.call("/api/playlists/\(Endpoint.pathID(list.string("id")))").songs()
            guard owner == model.userID, !Task.isCancelled else { return }
            if let first = songs.first { model.player.play(first, queue: songs) }
            else { model.notice = "아직 곡이 없는 플레이리스트입니다." }
        } catch { model.handle(error) }
    }
}

struct StreamingEntry: View {
    let title: String
    let caption: String
    let icon: String
    var color: Color = StreamStyle.purple
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 22)).foregroundStyle(color).frame(width: 24)
            VStack(alignment: .leading, spacing: 5) { Text(title).font(.system(size: 13, weight: .semibold)); Text(caption).font(.system(size: 11)).foregroundStyle(AifectDesign.muted) }.frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(color)
        }.foregroundStyle(AifectDesign.text).padding(13).frame(maxWidth: .infinity, minHeight: 64).background(Brand.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke, lineWidth: 1)).contentShape(Rectangle())
    }
}

struct SongMenuView: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    var body: some View {
        List {
            Section(song.title) {
                NavigationLink("곡 정보 · 댓글") { TrackDetailView(song: song) }
                Button { Task { await model.toggleLike(song) } } label: { Label(model.likes.contains { $0.id == song.id } ? "좋아요 취소" : "좋아요", systemImage: "heart") }
                SaveMusicButton(song: song)
                GiftSheetButton(song: song) { Label("선물하기", systemImage: "gift") }
                ShareLink(item: song.shareURL) { Label("공유", systemImage: "square.and.arrow.up") }
                SingSongButton(song: song)
            }
            if let original = song.originalID {
                NavigationLink("원곡 · 다른 목소리") { OriginalSongPage(id: original) }
            } else {
                NavigationLink("이 곡의 다른 목소리") { MusicCollectionView(title: "참여 커버", path: "/api/tracks/\(Endpoint.pathID(song.id))/covers", key: "covers") }
            }
            if let id = song.producerID { NavigationLink("창작자 프로필") { ProfilePage(id: id) } }
        }.navigationTitle("곡 더보기")
    }
}

struct OriginalSongPage: View {
    let id: String
    @State private var song: Song?
    @State private var error: String?
    var body: some View {
        Group {
            if let song { TrackDetailView(song: song) }
            else if let error { RetryCard(message: error) { Task { await load() } } }
            else { ProgressView() }
        }.task { await load() }
    }
    private func load() async { do { let value = try await API.shared.call("/api/tracks/\(Endpoint.pathID(id))"); try Task.checkCancellation(); song = Song(value.object("track")); error = nil } catch is CancellationError {} catch { self.error = error.localizedDescription } }
}

struct AppMenuView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Text("AIFECT").font(.system(size: 24, weight: .bold)).foregroundStyle(Brand.pink).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 16)
                Button { model.selectTab(0) } label: { entry("홈", icon: "house") }
                Button { model.selectTab(2) } label: { entry("플레이", icon: "play") }
                Button { model.selectTab(1) } label: { entry("커뮤니티", icon: "person.2") }
                NavigationLink { GiftWalletView().streamingPage() } label: { entry("선물함", icon: "gift") }
                Button { model.selectTab(3) } label: { entry("메시지", icon: "bubble.left") }
                NavigationLink { ActivityHistoryView().streamingPage() } label: { entry("알림 기록", icon: "bell") }
                Button { model.selectTab(4) } label: { entry("마이", icon: "person") }
                NavigationLink { LibraryView(initialSelection: 3).streamingPage() } label: { entry("내 보관함", icon: "music.note.list") }
                NavigationLink { CreatorWorkView().streamingPage() } label: { entry("스튜디오", icon: "slider.horizontal.3") }
                Divider().padding(.vertical, 12)
                NavigationLink { PopularChartView().streamingPage() } label: { entry("인기 차트", icon: "chart.bar") }
                NavigationLink { SearchView(discovery: true).streamingPage() } label: { entry("기분 · 장르별 발견", icon: "safari") }
                NavigationLink { CatalogDirectory(artists: false).streamingPage() } label: { entry("공개 플레이리스트", icon: "text.line.first.and.arrowtriangle.forward") }
                NavigationLink { CatalogDirectory(artists: true).streamingPage() } label: { entry("AI 아티스트", icon: "person.2") }
                NavigationLink { FollowingListView().streamingPage() } label: { entry("팔로우", icon: "person.badge.plus") }
                NavigationLink { PlayerInventoryView().streamingPage() } label: { entry("인벤토리", icon: "shippingbox") }
                NavigationLink { RewardsView().streamingPage() } label: { entry("오늘의 실버", icon: "star.circle") }
                NavigationLink { DiamondWalletView().streamingPage() } label: { entry("다이아 · 내 정산", icon: "creditcard") }
                Color.clear.frame(height: 120).accessibilityHidden(true)
            }.buttonStyle(.plain).padding(20)
        }.accessibilityIdentifier("all-destinations").navigationTitle("전체 메뉴")
    }
    private func entry(_ title: String, icon: String) -> some View {
        HStack(spacing: 16) {
            Image(systemName: icon).font(.system(size: 22)).foregroundStyle(AifectDesign.violet).frame(width: 24)
            Text(title).font(.system(size: 14)).foregroundStyle(AifectDesign.secondaryText).frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(AifectDesign.muted)
        }.padding(12).frame(minHeight: 48).contentShape(Rectangle()).accessibilityElement(children: .ignore).accessibilityLabel(title)
    }
}

struct CreatorWorkView: View {
    @EnvironmentObject private var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var loading = true
    @State private var error: String?
    @State private var filter = "전체"
    @State private var operation: String?
    @State private var target: Song?
    @State private var working = false
    private var tracks: [[String: Any]] { data.objects("tracks") }
    private var visible: [[String: Any]] { tracks.filter { filter == "전체" || ($0.string("kind") == "cover") == (filter == "커버") } }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if model.userID == nil { LoginPrompt(title: "내 작업을 이어가세요") }
                else {
                    Text("스튜디오").font(.system(size: 25, weight: .bold))
                    Text("음악, 이미지, 프로필을 한곳에서 관리하세요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                    NavigationLink { MobilePlayView(initialMode: "더빙", initialSection: "내 작업").streamingPage() } label: { StreamingEntry(title: "내 더빙 관리", caption: "대본 · 녹음 · 완성작", icon: "mic", color: Brand.aqua) }.buttonStyle(.plain)
                    let quota = data.object("upload_quota")
                    if !quota.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("이번 달 제작곡 \(quota.int("used")) / \(quota.int("limit"))곡 · \(quota.int("remaining"))곡 남음").font(.subheadline.bold()).foregroundStyle(Brand.pink)
                            Text("매월 1일 한국시간에 새로 시작해요. 커버곡은 제한 없이 올릴 수 있어요.").font(.caption).foregroundStyle(AifectDesign.muted)
                        }.padding(.vertical, 8)
                    }
                    HStack(spacing: 8) {
                        studioStat("공개 음악", count: tracks.filter { $0.string("status") == "published" }.count)
                        studioStat("처리 중", count: tracks.filter { ["uploading", "queued", "processing"].contains($0.string("status")) }.count)
                        studioStat("AI 아티스트", count: data.objects("artists").count)
                    }
                    HStack { Text("내 음원 · 앨범 커버").font(.headline); Spacer(); Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }.disabled(loading).accessibilityLabel("스튜디오 새로고침") }
                    NavigationLink { OriginalUploadView().streamingPage() } label: { Label("음원 업로드", systemImage: "square.and.arrow.up").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 48) }
                        .buttonStyle(CatalogButtonStyle(filled: true)).disabled(quota.isEmpty || quota.int("remaining") <= 0).accessibilityIdentifier("studio-upload")
                    ParityChips(items: ["전체", "제작곡", "커버"], selection: $filter)
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                    ForEach(visible, id: \.selfID) { row in studioTrack(row) }
                    if !loading && error == nil && visible.isEmpty { ContentUnavailableView("아직 올린 음악이 없어요", systemImage: "music.note", description: Text("음원 업로드 또는 부르기에서 첫 음악을 남겨보세요.")) }
                    NavigationLink { ProfileEditorView().streamingPage() } label: { StreamingEntry(title: "내 프로필", caption: "프로필 사진 · 소개 수정", icon: "person.crop.circle") }.buttonStyle(.plain)
                    if !data.objects("artists").isEmpty {
                        Text("AI 가수 · 아티스트 프로필").font(.headline)
                        ForEach(data.objects("artists"), id: \.selfID) { artist in
                            NavigationLink { ProfilePage(id: artist.selfID, kind: "artist").streamingPage() } label: {
                                HStack { ProfilePhoto(person: artist.merging(["profile_kind": "artist"]) { _, v in v }, size: 48); Text(artist.string("name")); Spacer(); Image(systemName: "chevron.right") }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                            }.buttonStyle(.plain)
                        }
                    }
                    NavigationLink("녹음 초안 이어 하기") { RecordingDraftsView().streamingPage() }.frame(minHeight: 44)
                    NavigationLink("다이아 · 정산 내역 보기") { DiamondWalletView().streamingPage() }.frame(maxWidth: .infinity, minHeight: 44)
                }
            }.padding(18).padding(.bottom, 28)
        }.navigationTitle("스튜디오").navigationBarTitleDisplayMode(.inline).accessibilityIdentifier("creator-studio")
            .task(id: model.userID) { data = [:]; await load() }.refreshable { await load() }
            .confirmationDialog(operation == "delete" ? "음원을 삭제할까요?" : operation == "unpublish" ? "비공개로 바꿀까요?" : "다시 처리할까요?", isPresented: Binding(get: { operation != nil }, set: { if !$0 && !working { operation = nil } }), titleVisibility: .visible) {
                Button("확인", role: operation == "delete" ? .destructive : nil) { let action = operation; Task { await perform(action) } }.disabled(working)
                Button("취소", role: .cancel) { operation = nil }
            } message: { Text((target?.title ?? "") + (operation == "delete" ? "\n삭제한 음원은 복구할 수 없어요." : "")) }
    }
    private func studioStat(_ title: String, count: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.system(size: 12)).foregroundStyle(AifectDesign.muted); Text(loading && data.isEmpty ? "—" : "\(count)").font(.system(size: 24, weight: .bold)) }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
    }
    private func studioTrack(_ row: [String: Any]) -> some View {
        var payload = row
        payload["producer"] = data.object("producer").string("name")
        payload["producer_id"] = data.object("producer").string("id")
        payload["user_id"] = model.userID
        let song = Song(payload)
        let status = row.string("status")
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                AlbumArtwork(song: song).frame(width: 68, height: 68).clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 5) { Text(song.title).font(.system(size: 16, weight: .bold)); Text(Self.statusLabel(status)).font(.caption).foregroundStyle(Brand.aqua); Text(song.isCover ? "커버 · " + song.credit : song.genreLabel).font(.caption).foregroundStyle(AifectDesign.muted) }
            }
            if !row.string("error").isEmpty { Text(row.string("error")).font(.caption).foregroundStyle(Brand.pink) }
            NavigationLink { StudioTrackMetadataView(id: song.id).streamingPage() } label: { Label(song.isCover ? "커버곡 정보 수정" : "커버 · 가사 · 정보 수정", systemImage: "pencil").font(.subheadline).frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(CatalogButtonStyle()).accessibilityIdentifier("studio-edit-" + song.id)
            ViewThatFits {
                HStack(spacing: 14) { trackActions(song, status: status) }
                VStack(alignment: .leading) { trackActions(song, status: status) }
            }.font(.caption)
        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18)).accessibilityElement(children: .contain).accessibilityIdentifier("studio-track-" + song.id)
    }
    @ViewBuilder private func trackActions(_ song: Song, status: String) -> some View {
        if status == "published" {
            NavigationLink("곡 보기") { TrackDetailView(song: song).streamingPage() }.frame(minHeight: 44)
            Button("비공개로 전환") { target = song; operation = "unpublish" }.frame(minHeight: 44)
        }
        if ["failed", "hidden"].contains(status) { Button(status == "hidden" ? "다시 공개" : "다시 처리") { target = song; operation = "retry" }.frame(minHeight: 44) }
        Button("삭제", role: .destructive) { target = song; operation = "delete" }.frame(minHeight: 44).disabled(working)
    }
    static func statusLabel(_ status: String) -> String { ["published":"공개됨", "hidden":"비공개", "uploading":"업로드 대기", "queued":"변환 대기", "processing":"변환 중", "failed":"변환 실패", "rejected":"검토 필요"][status] ?? status }
    private func load() async {
        guard let owner = model.userID else { data = [:]; loading = false; return }
        loading = true; defer { loading = false }
        do { let response = try await API.shared.call("/api/studio"); guard model.userID == owner, !Task.isCancelled else { return }; data = response; error = nil }
        catch { if model.userID == owner, !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func perform(_ action: String?) async {
        guard let owner = model.userID, let song = target, let action, ["delete", "retry", "unpublish"].contains(action), !working else { return }
        working = true; defer { working = false; operation = nil }
        do {
            _ = try await API.shared.call("/api/uploads/\(Endpoint.pathID(song.id))" + (action == "delete" ? "" : "/" + action), method: action == "delete" ? "DELETE" : "POST", body: [:])
            guard model.userID == owner else { return }
            await load(); await model.loadLibrary(); model.notice = "변경했어요."
        } catch { if model.userID == owner { self.error = error.localizedDescription } }
    }
}

private struct StudioTrackMetadataView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var original: [String: Any] = [:]
    @State private var title = ""
    @State private var description = ""
    @State private var tool = ""
    @State private var lyrics = ""
    @State private var lyricsMode = "unchanged"
    @State private var pickedImage: PhotosPickerItem?
    @State private var imageBytes: Data?
    @State private var loading = true
    @State private var busy = false
    @State private var error: String?
    @FocusState private var typing: Bool
    var body: some View {
        Form {
            if loading { ProgressView() }
            else if !original.isEmpty {
                Section("음원 정보") {
                    if original.string("kind") != "cover" { TextField("곡 제목", text: $title).focused($typing).submitLabel(.done).onSubmit { typing = false }.accessibilityIdentifier("studio-title"); TextField("사용한 AI 도구", text: $tool).focused($typing).submitLabel(.done).onSubmit { typing = false } }
                    TextField("곡 소개", text: $description, axis: .vertical).lineLimit(4...10)
                }
                if original.string("kind") != "cover" {
                    Section("앨범 커버") {
                        AlbumArtwork(song: Song(original)).frame(width: 140, height: 140)
                            .overlay { if let imageBytes, let preview = UIImage(data: imageBytes) { Image(uiImage: preview).resizable().scaledToFill().frame(width: 140, height: 140).clipped() } }
                        PhotosPicker("앨범 커버 변경", selection: $pickedImage, matching: .images)
                    }
                    Section("가사") {
                        Picker("가사 등록 방식", selection: $lyricsMode) { Text("기존 가사 유지").tag("unchanged"); Text("자동 싱크").tag("auto"); Text("LRC 직접 입력").tag("synced"); Text("가사 없음").tag("none") }
                        if lyricsMode == "auto" || lyricsMode == "synced" {
                            TextEditor(text: $lyrics).frame(minHeight: 240)
                            Text(lyricsMode == "auto" ? "가사를 줄마다 입력하면 자동 싱크를 요청해요." : "[00:12.500] 가사 형식으로 입력해주세요.").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if busy { ProgressView("저장 중…") }
            }
            if let error { Text(error).font(.caption).foregroundStyle(Brand.pink); if original.isEmpty { Button("다시 불러오기") { Task { await load() } } } }
        }.navigationTitle("음원 수정").task(id: model.userID) { await load() }.disabled(busy).scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장") { typing = false; Task { await save() } }.disabled(busy || original.isEmpty || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (original.string("kind") != "cover" && tool.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)).accessibilityIdentifier("studio-track-save")
                }
            }
            .task(id: pickedImage) {
                guard let pickedImage else { return }
                do { guard let bytes = try await pickedImage.loadTransferable(type: Data.self) else { return }; imageBytes = try await Task.detached { try ChatImageEncoder.encode(bytes) }.value }
                catch { self.error = error.localizedDescription }
            }
    }
    private func load() async {
        guard let owner = model.userID else { original = [:]; loading = false; return }
        loading = true; defer { loading = false }
        do {
            let data = try await API.shared.call("/api/studio/tracks/\(Endpoint.pathID(id))")
            guard owner == model.userID, !Task.isCancelled else { return }
            original = data.object("profile"); title = original.string("title"); description = original.string("description"); tool = original.string("ai_tool"); lyrics = original.string("lyrics"); error = nil
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
    private func save() async {
        guard let owner = model.userID, !busy else { return }
        busy = true; defer { busy = false }
        var payload = original
        if original.string("kind") == "cover" { payload = ["description": description] }
        else {
            payload["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines); payload["ai_tool"] = tool.trimmingCharacters(in: .whitespacesAndNewlines); payload["description"] = description
            if lyricsMode != "unchanged" {
                payload["lyrics_mode"] = lyricsMode
                if lyricsMode == "auto" { payload["lyrics_source"] = lyrics; payload["lyrics_language"] = "ko" }
                else { payload["lyrics"] = lyricsMode == "none" ? "" : lyrics }
            }
        }
        do {
            _ = try await API.shared.call("/api/studio/tracks/\(Endpoint.pathID(id))", method: "PUT", body: payload)
            guard owner == model.userID else { return }
            if let imageBytes, original.string("kind") != "cover" {
                _ = try await API.shared.request("/api/studio/tracks/\(Endpoint.pathID(id))/image", method: "PUT", bytes: imageBytes, type: "image/webp")
            }
            guard owner == model.userID else { return }
            model.notice = "음원 정보를 저장했어요."; dismiss()
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
}

struct PopularChartView: View {
    @EnvironmentObject private var model: AppModel
    @State private var category = "인기 차트"
    @State private var period = "이번 주"
    @State private var tracks: [Song] = []
    @State private var error: String?
    @State private var loading = true
    @State private var comparison = false
    static func path(category: String, period: String) -> String {
        let key = ["인기 차트": "top", "노래방 차트": "karaoke", "급상승": "rising", "신인": "newcomers"][category]
        let periodKey = ["오늘": "today", "이번 주": "week", "이달": "month", "명예의 전당": "all"][period] ?? "week"
        return "/api/catalog?section=tracks" + (key.map { "&chart=\($0)" } ?? "") + (key == "top" ? "&period=\(periodKey)" : "")
    }
    private var path: String { Self.path(category: category, period: period) }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Text("인기 차트").font(.title2.bold())
                ChartFilterTabs(names: ["인기 차트", "노래방 차트", "급상승", "신인", "최신 음악"], selection: $category)
                if category == "인기 차트" {
                    ChartFilterTabs(names: ["오늘", "이번 주", "이달", "명예의 전당"], selection: $period)
                    Text("\(period) · 한국 시간 기준 · 어제 집계 대비").font(.caption).foregroundStyle(.secondary)
                    if !loading && !comparison { Text("전날 순위 기록이 준비되면 변동을 표시해요.").font(.caption).foregroundStyle(.secondary) }
                }
                HStack {
                    Button("전체 듣기", systemImage: "play.fill") { if let first = tracks.first { model.player.play(first, queue: tracks) } }.buttonStyle(ParityPill(filled: true))
                    Button("섞어 듣기", systemImage: "shuffle") { let shuffled = tracks.shuffled(); if let first = shuffled.first { model.player.play(first, queue: shuffled) } }.buttonStyle(ParityPill())
                }.disabled(tracks.isEmpty)
                if loading { ProgressView().frame(maxWidth: .infinity) }
                if let error { RetryCard(message: error) { Task { await load() } } }
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, song in
                    StreamingSongRow(song: song, queue: tracks, rank: song.chartRank ?? index + 1, movement: category == "인기 차트")
                }
                if !loading && tracks.isEmpty && error == nil { ContentUnavailableView("아직 집계할 음악이 없어요", systemImage: "chart.bar") }
            }.padding(16)
        }.task(id: path + (model.userID ?? "guest")) { await load() }.refreshable { await load() }.navigationTitle("차트")
    }
    private func load() async {
        loading = true; tracks = []; error = nil
        do {
            let value = try await API.shared.call(path); try Task.checkCancellation()
            tracks = value.songs(); comparison = value.object("chart").object("comparison").flag("available"); loading = false
        } catch is CancellationError {} catch { if !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
    }
}

extension View {
    func streamingPage() -> some View {
        self.frame(maxWidth: .infinity, maxHeight: .infinity)
            .scrollContentBackground(.hidden).background(Brand.background)
            .toolbar(.visible, for: .navigationBar)
            .toolbarBackground(Brand.background, for: .navigationBar)
            .navigationBarTitleDisplayMode(.inline)
    }
}

struct StreamingActionTile: View {
    let title: String
    let caption: String
    let icon: String
    var color: Color = StreamStyle.purple
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.title2).foregroundStyle(color)
                .frame(width: 28).shadow(color: color.opacity(0.5), radius: 7)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.subheadline.bold()).fixedSize(horizontal: false, vertical: true)
                Text(caption).font(.caption).foregroundStyle(AifectDesign.muted).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.foregroundStyle(AifectDesign.text).padding(12).frame(maxWidth: .infinity, minHeight: 76)
            .background(LinearGradient(colors: [color.opacity(0.18), StreamStyle.panel], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(color.opacity(0.45), lineWidth: 1))
    }
}

struct StreamingSegment: View {
    let items: [String]
    @Binding var selection: String
    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.self) { item in
                Button { selection = item } label: {
                    Text(item).font(.subheadline.bold()).foregroundStyle(selection == item ? AifectDesign.violet : AifectDesign.muted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(selection == item ? LinearGradient(colors: [StreamStyle.purple.opacity(0.28), .clear], startPoint: .top, endPoint: .bottom) : LinearGradient(colors: [.clear], startPoint: .top, endPoint: .bottom), in: Capsule())
                        .overlay(Capsule().stroke(selection == item ? StreamStyle.purple.opacity(0.5) : .clear, lineWidth: 1))
                }.buttonStyle(.plain).accessibilityAddTraits(selection == item ? .isSelected : [])
            }
        }.background(StreamStyle.panel, in: Capsule()).overlay(Capsule().stroke(AifectDesign.stroke, lineWidth: 1))
    }
}

struct StreamingLevelStrip: View {
    let xp: Int
    private var level: Int { PlayerAvatarStyle.level(xp) }
    private var floor: Int { 50 * level * (level - 1) }
    private var ceiling: Int { 50 * level * (level + 1) }
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "trophy.fill").font(.title2).foregroundStyle(Color.white.opacity(0.75))
            VStack(spacing: 8) {
                HStack { Text("Lv.\(level)").font(.subheadline.bold()); Spacer(); Text("\(xp) XP").font(.caption) }
                ProgressView(value: level >= 100 ? 1 : Double(max(0, xp - floor)) / Double(max(1, ceiling - floor))).tint(AifectDesign.violet)
            }
        }.foregroundStyle(.white).padding(.horizontal, 16).padding(.vertical, 13)
            .background(LinearGradient(colors: [Color(aifectHex: 0x8D36D4), Color(aifectHex: 0x5731CA), Color(aifectHex: 0x24A9C0)], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityElement(children: .ignore).accessibilityLabel("레벨 \(level), \(xp) XP, 아이템 보관함")
    }
}

struct StreamingJoinStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.caption.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 8)
            .foregroundStyle(Brand.background)
            .background(LinearGradient(colors: [Brand.pink, StreamStyle.purple], startPoint: .leading, endPoint: .trailing), in: Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1).frame(minHeight: 44)
    }
}
