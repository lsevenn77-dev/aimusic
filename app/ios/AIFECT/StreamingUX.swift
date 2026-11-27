import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

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
            NavigationLink { destination().streamingPage() } label: { HStack(spacing: 4) { Text("전체 보기"); Image(systemName: "chevron.right") }.font(.caption).foregroundStyle(AifectDesign.violet).frame(minHeight: 44) }.accessibilityIdentifier("section-more-" + title)
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
                        CoverPickTitle(song: song).font(.system(size: 13, weight: .semibold)).foregroundStyle(AifectDesign.text).lineLimit(2)
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
    @State private var pick: CoverPickState?
    @State private var pickSaving = false
    @State private var confirmReplacement = false
    @State private var pickError: String?

    var body: some View {
        List {
            Section(song.title) {
                if let pick, model.userID != nil {
                    let removing = pick.coverID == song.id
                    Button(removing ? "PICK 해제" : pick.hasPick ? "이 커버로 PICK 변경" : "PICK 지정") {
                        if pick.hasPick && !removing { confirmReplacement = true }
                        else { Task { await changePick(pick) } }
                    }.disabled(pickSaving)
                    if let pickError { Text(pickError).font(.caption).foregroundStyle(.red) }
                }
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
                NavigationLink("이 곡의 다른 목소리") { MusicCollectionView(title: "참여 커버", path: "/api/tracks/\(Endpoint.pathID(song.id))/covers?promote_pick=1", key: "covers", pickOriginalID: song.id) }
            }
            if let id = song.producerID { NavigationLink("창작자 프로필") { ProfilePage(id: id) } }
        }.navigationTitle("곡 더보기")
            .task(id: "\(model.userID ?? ""):\(song.id)") {
                pick = nil
                pickError = nil
                pick = try? await model.readCoverPick(song)
            }
            .confirmationDialog("이 커버로 PICK을 변경할까요?", isPresented: $confirmReplacement, titleVisibility: .visible) {
                Button("변경하기") {
                    if let pick { Task { await changePick(pick) } }
                }
                Button("취소", role: .cancel) {}
            } message: {
                Text("현재 PICK  \(pick?.performer ?? "")\n새 PICK  \(song.credit)")
            }
    }

    private func changePick(_ selection: CoverPickState) async {
        guard !pickSaving else { return }
        pickSaving = true
        pickError = nil
        defer { pickSaving = false }
        do {
            let updated = try await model.changeCoverPick(song, selection: selection)
            pick = updated ?? pick
        } catch is CancellationError {
            return
        } catch {
            pickError = error.localizedDescription
            if (error as? APIError)?.status == 409 {
                pick = try? await model.readCoverPick(song)
            }
        }
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
    @State private var editingArtist: CatalogItemSelection?
    private var tracks: [[String: Any]] { data.objects("tracks") }
    private var visible: [[String: Any]] { tracks.filter { filter == "전체" || ($0.string("kind") == "cover") == (filter == "커버") } }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if model.userID == nil { LoginPrompt(title: "내 작업을 이어가세요") }
                else {
                    Text("스튜디오").font(.system(size: 25, weight: .bold))
                    Text("제작곡 등록과 나의 음악 작품 관리를 할 수 있는 나만의 공간.")
                        .font(.system(size: 13))
                        .foregroundStyle(AifectDesign.muted)
                    let quota = data.object("upload_quota")
                    StudioUploadBanner(quota: quota)
                    if !quota.isEmpty, (model.user?.number("premium_until") ?? 0) > Date().timeIntervalSince1970 {
                        StudioPremiumBanner(limit: quota.int("limit"))
                    }
                    NavigationLink { MobilePlayView(initialMode: "더빙", initialSection: "내 작업").streamingPage() } label: { StreamingEntry(title: "내 더빙 관리", caption: "대본 · 녹음 · 완성작", icon: "mic", color: Brand.aqua) }.buttonStyle(.plain)
                    HStack(spacing: 8) {
                        studioStat("공개 음악", count: tracks.filter { $0.string("status") == "published" }.count)
                        studioStat("처리 중", count: tracks.filter { ["uploading", "queued", "processing"].contains($0.string("status")) }.count)
                        studioStat("AI 아티스트", count: data.objects("artists").count)
                    }
                    HStack { Text("내 음원 · 앨범 커버").font(.headline); Spacer(); Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }.disabled(loading).accessibilityLabel("스튜디오 새로고침") }
                    ParityChips(items: ["전체", "제작곡", "커버"], selection: $filter)
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                    ForEach(visible, id: \.selfID) { row in studioTrack(row) }
                    if !loading && error == nil && visible.isEmpty { ContentUnavailableView("아직 올린 음악이 없어요", systemImage: "music.note", description: Text("음원 업로드 또는 부르기에서 첫 음악을 남겨보세요.")) }
                    NavigationLink { ProfileEditorView().streamingPage() } label: { StreamingEntry(title: "내 프로필", caption: "프로필 사진 · 소개 수정", icon: "person.crop.circle") }.buttonStyle(.plain)
                    if !data.objects("artists").isEmpty {
                        Text("AI 가수 · 아티스트 프로필").font(.headline)
                        ForEach(data.objects("artists"), id: \.selfID) { artist in
                            Button { editingArtist = CatalogItemSelection(payload: artist) } label: {
                                HStack { ProfilePhoto(person: artist.merging(["profile_kind": "artist"]) { _, v in v }, size: 48); Text(artist.string("name")); Spacer(); Text("수정").font(.subheadline).foregroundStyle(AifectDesign.violet) }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                            }.buttonStyle(.plain)
                        }
                    }
                    NavigationLink("녹음 초안 이어 하기") { RecordingDraftsView().streamingPage() }.frame(minHeight: 44)
                    NavigationLink("다이아 · 정산 내역 보기") { DiamondWalletView().streamingPage() }.frame(maxWidth: .infinity, minHeight: 44)
                }
            }.padding(18).padding(.bottom, 28)
        }.navigationTitle("스튜디오").navigationBarTitleDisplayMode(.inline).accessibilityIdentifier("creator-studio")
            .task(id: model.userID) { data = [:]; await load() }.refreshable { await load() }
            .sheet(item: $editingArtist, onDismiss: { Task { await load() } }) { selection in NavigationStack { StudioArtistEditor(artist: selection.payload) } }
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
                VStack(alignment: .leading, spacing: 5) {
                    CoverPickTitle(song: song).font(.system(size: 16, weight: .bold))
                    Text(Self.statusLabel(status)).font(.caption).foregroundStyle(Brand.aqua)
                    Text(song.isCover ? "커버 · " + song.credit : song.genreLabel).font(.caption).foregroundStyle(AifectDesign.muted)
                    if !song.isCover, let lyrics = Self.lyricsLabel(mode: row.string("lyrics_mode"), job: row.string("alignment_state")) {
                        Text(lyrics).font(.caption).foregroundStyle(AifectDesign.muted)
                    }
                }
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
    static func statusLabel(_ status: String) -> String { ["published":"공개됨", "hidden":"비공개", "uploading":"업로드 대기", "queued":"음원 변환 대기", "processing":"음원 변환 중", "failed":"음원 변환 실패", "rejected":"검토 필요"][status] ?? status }
    static func lyricsLabel(mode: String, job: String) -> String? {
        ["queued":"가사 싱크 대기", "processing":"가사 싱크 작업 중", "ready":"자동 가사 확인 필요", "failed":"가사 싱크 재시도 필요"][job] ??
        ["no_lyrics":"가사 없음", "later":"가사 미등록", "none":"가사 미등록", "synced":"가사 등록"][mode]
    }
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

private struct StudioUploadBanner: View {
    let quota: [String: Any]

    var body: some View {
        let limit = quota.int("limit")
        let canUpload = !quota.isEmpty && quota.int("remaining") > 0
        let shape = RoundedRectangle(cornerRadius: 16)

        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                if limit > 0 {
                    StudioQuotaRing(used: quota.int("used"), limit: limit)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("MY STUDIO")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.4)
                        .foregroundStyle(AifectDesign.mint)
                    Text("완성한 음악을 들려 주세요.")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(AifectDesign.text)
                    Text("나만의 제작곡을 아이팩트에 공개해 보세요.")
                        .font(.system(size: 13))
                        .foregroundStyle(AifectDesign.muted)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("매월 1일 초기화(한국시간)")
                    Text("커버곡 무제한")
                }
                .font(.system(size: 12))
                .foregroundStyle(AifectDesign.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

                NavigationLink {
                    OriginalUploadView().streamingPage()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.up")
                        Text("음원 업로드")
                    }
                    .fixedSize()
                    .frame(minHeight: 48)
                }
                .buttonStyle(CatalogButtonStyle(filled: true))
                .disabled(!canUpload)
                .accessibilityIdentifier("studio-upload")
            }
            if limit > 0 && !canUpload {
                Text("이번 달 제작곡 한도를 모두 사용했습니다.")
                    .font(.system(size: 12))
                    .foregroundStyle(AifectDesign.muted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(aifectHex: 0x0C121B), in: shape)
        .overlay(shape.strokeBorder(Color(aifectHex: 0x30364B)).allowsHitTesting(false))
    }
}

private struct StudioQuotaRing: View {
    let used: Int
    let limit: Int

    var body: some View {
        let progress = min(1, max(0, CGFloat(used) / CGFloat(limit)))
        let stroke = StrokeStyle(lineWidth: 6, lineCap: .butt)

        ZStack {
            ZStack {
                Circle().stroke(Color(aifectHex: 0x3C4559), style: stroke)
                if progress > 0 {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(
                            AngularGradient(
                                colors: [Color(aifectHex: 0x8EDDD2), Color(aifectHex: 0xA7CEEF), AifectDesign.pink],
                                center: .center,
                                startAngle: .zero,
                                endAngle: .degrees(Double(progress) * 360)
                            ),
                            style: stroke
                        )
                        .rotationEffect(.degrees(-90))
                }
            }
            .padding(3)
            VStack(spacing: 2) {
                Text("이번 달 제작곡").font(.system(size: 10)).foregroundStyle(AifectDesign.muted)
                Text("\(used) / \(limit)곡")
                    .font(.system(size: 16, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(AifectDesign.text)
            }
        }
        .frame(width: 88, height: 88)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("이번 달 제작곡")
        .accessibilityValue("\(used) / \(limit)곡")
    }
}

private struct StudioPremiumBanner: View {
    let limit: Int

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 16)
        let gold = Color(aifectHex: 0xE4C78F)

        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Image(systemName: "crown").font(.system(size: 13)).accessibilityHidden(true)
                    Text("PREMIUM 이용 중").font(.system(size: 14, weight: .semibold)).tracking(0.3)
                }
                .foregroundStyle(gold)
                .padding(.bottom, 3)
                ForEach(["제작곡 월 \(limit)곡까지 업로드", "최대 AAC 256kbps 고음질 감상", "광고 없는 이용"], id: \.self) { benefit in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "checkmark").font(.system(size: 10)).foregroundStyle(gold).accessibilityHidden(true)
                        Text(benefit).font(.system(size: 12)).foregroundStyle(Color(aifectHex: 0xD8CAB4))
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "opticaldisc")
                .font(.system(size: 47, weight: .light))
                .foregroundStyle(gold.opacity(0.4))
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 16)
        .background(
            LinearGradient(colors: [Color(aifectHex: 0x2B251C), Color(aifectHex: 0x3D3224)], startPoint: .leading, endPoint: .trailing),
            in: shape
        )
        .overlay(shape.strokeBorder(Color(aifectHex: 0x655438)))
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
    @State private var genres: [String] = []
    @State private var moods: [String] = []
    @State private var mode = "solo"
    @State private var artistID = "none"
    @State private var artists: [[String: Any]] = []
    @State private var karaoke: [String: Any] = [:]
    @State private var alignment: [String: Any] = [:]
    @State private var pickedImage: PhotosPickerItem?
    @State private var imageBytes: Data?
    private static let releaseFormat: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Seoul")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    @State private var releaseDate = ""
    @State private var listeningTemplate = ""
    @State private var checkingArtwork = false
    @State private var loading = true
    @State private var busy = false
    @State private var error: String?
    @FocusState private var typing: Bool
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if loading { ProgressView() }
                else if !original.isEmpty {
                    if original.string("kind") != "cover" {
                        StudioTextField(title: "곡 제목", text: $title, limit: 120).accessibilityIdentifier("studio-title")
                        VStack(spacing: 12) {
                            AlbumArtwork(song: Song(original)).frame(width: 144, height: 144)
                                .overlay { if let imageBytes, let preview = ArtworkRepository.decode(imageBytes) { Image(uiImage: preview).resizable().scaledToFill().frame(width: 144, height: 144).clipped() } }
                            PhotosPicker("앨범 커버 변경", selection: $pickedImage, matching: .images).buttonStyle(CatalogButtonStyle(fullWidth: true))
                        }.frame(maxWidth: .infinity).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                        StudioSingleChoice(title: "AI 아티스트", choices: [("none", "선택 안 함 (내 활동명)")] + artists.map { ($0.selfID, $0.string("name")) }, selection: $artistID)
                        StudioTextField(title: "AI 제작 도구", text: $tool, limit: 100)
                        Text("노래 구성").font(.caption).foregroundStyle(AifectDesign.muted)
                        ParityChips(items: ["솔로", "듀엣"], selection: Binding(get: { mode == "duet" ? "듀엣" : "솔로" }, set: { mode = $0 == "듀엣" ? "duet" : "solo" }))
                        StudioMultiChoice(title: "장르", choices: StudioChoices.genres.map { ($0, $0) }, maximum: 3, minimum: 1, selected: $genres)
                        StudioMultiChoice(title: "기분", choices: StudioChoices.moods, maximum: 4, minimum: 0, selected: $moods)
                        Text("가사").font(.headline)
                        StudioSingleChoice(title: "가사 등록 방식", choices: [("unchanged", "기존 가사 유지")] + OriginalUploadView.lyricModes, selection: $lyricsMode)
                        if lyricsMode == "auto" || lyricsMode == "synced" {
                            StudioTextField(title: lyricsMode == "auto" ? "가사를 줄마다 입력하세요" : "[00:12.500] 가사", text: $lyrics, limit: lyricsMode == "auto" ? 6000 : 12000, multiline: true)
                        }
                        if lyricsMode == "no_lyrics" { Text("가사 변환 없이 등록됩니다.").font(.caption).foregroundStyle(AifectDesign.muted) }
                        if lyricsMode == "later" { Text("스튜디오에서 가사를 추가할 수 있습니다.").font(.caption).foregroundStyle(AifectDesign.muted) }
                        if lyricsMode == "unchanged", let label = CreatorWorkView.lyricsLabel(mode: original.string("lyrics_mode"), job: alignment.string("state")) {
                            Text(label).font(.caption).foregroundStyle(Brand.aqua)
                        }
                        StudioBackingControls(id: id, karaoke: karaoke)
                    } else {
                        let work = Song(original)
                        Text("미리보기").font(.headline)
                        CoverWorkPlayback(song: work, player: model.player, template: listeningTemplate,
                                          photo: imageBytes.flatMap { UIImage(data: $0) }, playable: original.string("status") == "published")
                        if let originalID = work.originalID { NavigationLink("원곡 보기") { OriginalSongPage(id: originalID) } }
                        WorkAppearanceFields(photo: imageBytes.flatMap { UIImage(data: $0) }, path: work.listeningArtworkPath,
                                             selection: $pickedImage, template: $listeningTemplate)
                        DatePicker("발매일", selection: Binding(get: {
                            Self.releaseFormat.date(from: releaseDate) ?? Date(timeIntervalSince1970: original.number("created"))
                        }, set: { releaseDate = Self.releaseFormat.string(from: $0) }),
                        in: Self.releaseFormat.date(from: "1900-01-01")! ... Self.releaseFormat.date(from: "2199-12-31")!, displayedComponents: .date)
                        .environment(\.timeZone, Self.releaseFormat.timeZone)
                        Text("기본값은 업로드 날짜입니다. 발매일을 바꿔도 업로드 기록은 유지됩니다.").font(.caption).foregroundStyle(.secondary)
                    }
                    StudioTextField(title: original.string("kind") == "cover" ? "한마디" : "곡 소개", text: $description, limit: original.string("kind") == "cover" ? 1000 : 4000, multiline: true)
                    if busy { ProgressView("저장 중…") }
                    Button("변경사항 저장") { Task { await save() } }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(!canSave)
                }
                if let error { Text(error).font(.caption).foregroundStyle(Brand.pink); if original.isEmpty { Button("다시 불러오기") { Task { await load() } } } }
            }.padding(18)
        }.modifier(FullScreenWorkspace()).navigationTitle(original.string("kind") == "cover" ? "커버곡 수정" : "음원 수정").task(id: model.userID) { await load() }.disabled(busy).scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장") { typing = false; Task { await save() } }.disabled(!canSave).accessibilityIdentifier("studio-track-save")
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } }
            }
            .task(id: pickedImage) {
                guard let selection = pickedImage else { return }
                checkingArtwork = true
                defer { if selection == pickedImage { checkingArtwork = false } }
                do {
                    guard let bytes = try await selection.loadTransferable(type: Data.self) else { return }
                    let next = original.string("kind") == "cover" ? try WorkListeningAssets.validJPEG(bytes) : try await Task.detached { try ChatImageEncoder.encode(bytes) }.value
                    try Task.checkCancellation()
                    if selection == pickedImage { imageBytes = next; error = nil }
                } catch is CancellationError { }
                catch { if selection == pickedImage { self.error = error.localizedDescription } }
            }
    }
    private var canSave: Bool {
        !busy && !checkingArtwork && !original.isEmpty && (original.string("kind") == "cover" || (!title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !tool.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !genres.isEmpty && (lyricsMode != "auto" || !lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)))
    }
    private func load() async {
        guard let owner = model.userID else { original = [:]; loading = false; return }
        loading = true; defer { loading = false }
        do {
            let data = try await API.shared.call("/api/studio/tracks/\(Endpoint.pathID(id))")
            guard owner == model.userID, !Task.isCancelled else { return }
            original = data.object("profile"); title = original.string("title"); description = original.string("description"); tool = original.string("ai_tool"); lyrics = original.string("lyrics"); error = nil
            releaseDate = original.string("release_date")
            listeningTemplate = original.string("listening_template")
            genres = original["genres"] as? [String] ?? [original.string("genre", fallback: "K-POP")]
            moods = original["moods"] as? [String] ?? []; mode = original.string("performance_mode", fallback: "solo"); artistID = original.string("artist_id", fallback: "none")
            karaoke = data.object("karaoke"); alignment = data.object("alignment")
            let studio = try await API.shared.call("/api/studio"); guard owner == model.userID else { return }; artists = studio.objects("artists")
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
    private func save() async {
        guard let owner = model.userID, !busy else { return }
        busy = true; defer { busy = false }
        var payload = original
        if original.string("kind") == "cover" {
            payload = ["description": description, "release_date": releaseDate]
            if WorkListeningAssets.labels[listeningTemplate] != nil { payload["listening_template"] = listeningTemplate }
        }
        else {
            payload["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines); payload["ai_tool"] = tool.trimmingCharacters(in: .whitespacesAndNewlines); payload["description"] = description
            payload["genres"] = genres; payload["genre"] = genres.first ?? "K-POP"; payload["moods"] = moods
            payload["artist_id"] = artistID; payload["performance_mode"] = mode
            payload["is_ai"] = tool.trimmingCharacters(in: .whitespacesAndNewlines) != "AI 사용 안 함"
            payload.removeValue(forKey: "lyrics_mode"); payload.removeValue(forKey: "lyrics")
            if lyricsMode != "unchanged" {
                payload["lyrics_mode"] = lyricsMode
                if lyricsMode == "auto" { payload["lyrics_source"] = lyrics; payload["lyrics_language"] = "ko" }
                if lyricsMode == "synced" { payload["lyrics"] = lyrics }
            }
        }
        do {
            _ = try await API.shared.call("/api/studio/tracks/\(Endpoint.pathID(id))", method: "PUT", body: payload)
            guard owner == model.userID else { return }
            if let imageBytes {
                do {
                    _ = try await API.shared.request("/api/studio/tracks/\(Endpoint.pathID(id))/image", method: "PUT", bytes: imageBytes, type: original.string("kind") == "cover" ? "image/jpeg" : "image/webp")
                } catch {
                    if original.string("kind") == "cover" { self.imageBytes = nil; pickedImage = nil }
                    throw error
                }
            }
            guard owner == model.userID else { return }
            model.notice = "음원 정보를 저장했어요."; dismiss()
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
}


enum StudioChoices {
    static let genres = ["K-POP", "Pop", "Dark Pop", "Ballad", "R&B", "Soul", "Hip-Hop", "Rock", "Alternative", "Indie Pop", "EDM", "Electronic", "Synth Pop", "City Pop", "Lo-fi", "Jazz", "Blues", "Folk", "Acoustic", "Country", "Classical", "Ambient", "Fusion", "Korean Folklore Fusion", "World Music", "국악", "트로트", "J-POP", "OST", "Instrumental", "Dance", "Funk", "Disco", "Metal", "Punk", "Reggae", "Latin", "Reggaeton", "Afrobeats", "House", "Techno", "Trance", "Drum & Bass", "Trap", "Gospel", "New Age", "Chillout", "Cinematic", "Orchestral", "Children"]
    static let moods = [("comfort", "위로가 필요할 때"), ("energy", "기분을 올려줘"), ("focus", "나만의 몰입"), ("drive", "어디든 떠나자"), ("sleep", "잠들기 전"), ("workout", "한 걸음 더"), ("romance", "설렘 · 사랑"), ("nostalgia", "추억"), ("rain", "비 오는 날"), ("night", "밤 · 새벽"), ("party", "파티"), ("meditation", "휴식 · 명상")]
}

struct StudioTextField: View {
    let title: String
    @Binding var text: String
    var limit: Int
    var multiline = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption).foregroundStyle(AifectDesign.muted)
            TextField(title, text: Binding(get: { text }, set: { text = String($0.prefix(limit)) }), axis: multiline ? .vertical : .horizontal)
                .lineLimit(multiline ? 3...12 : 1...1).font(.system(size: 15)).padding(12)
                .background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
        }
    }
}

struct StudioMultiChoice: View {
    let title: String
    let choices: [(String, String)]
    let maximum: Int
    let minimum: Int
    @Binding var selected: [String]
    @State private var open = false
    @State private var draft: [String] = []
    var body: some View {
        ParitySelectionField(title: title, value: selected.isEmpty ? "선택 안 함" : selected.map { id in choices.first { $0.0 == id }?.1 ?? id }.joined(separator: " · ")) { draft = selected; open = true }
            .accessibilityIdentifier("studio-choice-" + title)
            .sheet(isPresented: $open) {
                NavigationStack {
                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(choices + selected.filter { id in !choices.contains { $0.0 == id } }.map { ($0, $0) }, id: \.0) { item in
                                Button {
                                    if draft.contains(item.0) { draft.removeAll { $0 == item.0 } }
                                    else if draft.count < maximum { draft.append(item.0) }
                                } label: {
                                    HStack { Text(item.1); Spacer(); Image(systemName: draft.contains(item.0) ? "checkmark.square.fill" : "square") }.padding(14).frame(minHeight: 48).contentShape(Rectangle())
                                }.buttonStyle(.plain).disabled(!draft.contains(item.0) && draft.count >= maximum)
                            }
                        }.padding(16)
                    }.background(Brand.background).navigationTitle("\(title) · 최대 \(maximum)개").navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("취소") { open = false } }
                            ToolbarItem(placement: .confirmationAction) { Button("적용") { selected = draft; open = false }.disabled(draft.count < minimum) }
                        }
                }.presentationDetents([.medium, .large])
            }
    }
}

struct StudioArtistEditor: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let artist: [String: Any]
    @State private var name: String
    @State private var genre: String
    @State private var bio: String
    @State private var photo: PhotosPickerItem?
    @State private var bytes: Data?
    @State private var busy = false
    @State private var error: String?
    init(artist: [String: Any]) {
        self.artist = artist; _name = State(initialValue: artist.string("name")); _genre = State(initialValue: artist.string("genre", fallback: "K-POP")); _bio = State(initialValue: artist.string("bio"))
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("AI 아티스트 수정").font(.title2)
                StudioTextField(title: "이름", text: $name, limit: 60).accessibilityIdentifier("studio-artist-name")
                StudioTextField(title: "장르", text: $genre, limit: 80)
                StudioTextField(title: "소개", text: $bio, limit: 1000, multiline: true)
                if let bytes, let image = ArtworkRepository.decode(bytes) { Image(uiImage: image).resizable().scaledToFit().frame(height: 100) }
                PhotosPicker("프로필 사진 변경", selection: $photo, matching: .images).buttonStyle(CatalogButtonStyle())
                if let error { Text(error).font(.caption).foregroundStyle(Brand.pink) }
                if busy { ProgressView() }
                Button("저장") { Task { await save() } }.buttonStyle(CatalogButtonStyle(filled: true)).disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("studio-artist-save")
            }.padding(20).disabled(busy)
        }.accessibilityIdentifier("studio-artist-scroll").background(Brand.background).navigationTitle("아티스트 수정").navigationBarTitleDisplayMode(.inline).scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() }.disabled(busy) }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } }
            }
            .interactiveDismissDisabled(busy)
            .task(id: photo) {
                guard let photo else { return }
                do { if let data = try await photo.loadTransferable(type: Data.self) { bytes = try await Task.detached { try ChatImageEncoder.encode(data) }.value } }
                catch { self.error = error.localizedDescription }
            }
    }
    private func save() async {
        guard let owner = model.userID, !busy else { return }; busy = true; error = nil; defer { busy = false }
        let path = "/api/studio/artists/" + Endpoint.pathID(artist.selfID)
        do {
            _ = try await API.shared.call(path, method: "PUT", body: ["name": name, "bio": bio, "genre": genre])
            guard model.userID == owner else { return }
            if let bytes { _ = try await API.shared.request(path + "/image", method: "PUT", bytes: bytes, type: "image/webp") }
            guard model.userID == owner else { return }; model.notice = "아티스트를 저장했어요."; dismiss()
        } catch { if model.userID == owner { self.error = error.localizedDescription } }
    }
}

struct StudioBackingControls: View {
    @EnvironmentObject private var model: AppModel
    let id: String
    let karaoke: [String: Any]
    @State private var picking = false
    @State private var confirmation = false
    @State private var busy = false
    @State private var status: String?
    @State private var progress = 0.0
    private var path: String { "/api/studio/tracks/" + Endpoint.pathID(id) + "/karaoke" }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("노래방 MR").font(.headline)
            Text(status ?? (karaoke.flag("mr_ready") ? "반주 준비 완료" : karaoke.string("state", fallback: "반주 준비 중"))).font(.subheadline).foregroundStyle(AifectDesign.muted).accessibilityIdentifier("studio-mr-status")
            Button("내 반주 파일로 바꾸기") { picking = true }.buttonStyle(CatalogButtonStyle())
            Button("MR 자동으로 다시 만들기") { confirmation = true }.frame(minHeight: 44)
            Text("원곡과 길이가 같은 WAV · FLAC · MP3, 80MB 이하").font(.caption).foregroundStyle(AifectDesign.muted)
            if busy { ProgressView(value: progress); Text("\(Int(progress * 100))%").font(.caption.monospacedDigit()) }
        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18)).disabled(busy)
            .fileImporter(isPresented: $picking, allowedContentTypes: [.audio]) { result in
                switch result { case .success(let url): Task { await upload(url) }; case .failure(let error): status = error.localizedDescription }
            }
            .confirmationDialog("MR을 다시 만들까요?", isPresented: $confirmation, titleVisibility: .visible) {
                Button("다시 만들기") { Task { await regenerate() } }; Button("취소", role: .cancel) { }
            } message: { Text("현재 반주를 원곡에서 새로 분리한 반주로 바꿔요.") }
    }
    private func regenerate() async {
        guard let owner = model.userID, !busy else { return }; busy = true; defer { busy = false }
        do {
            _ = try await API.shared.call(path, method: "POST", body: [:])
            guard model.userID == owner else { return }; status = "반주를 다시 만들고 있어요."
        } catch { if model.userID == owner { status = error.localizedDescription } }
    }
    private func upload(_ url: URL) async {
        guard let owner = model.userID, !busy else { return }; busy = true; progress = 0; defer { busy = false }
        do {
            let data = try await Task.detached {
                let accessed = url.startAccessingSecurityScopedResource(); defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard (100...80 * 1024 * 1024).contains(size), ["wav", "flac", "mp3"].contains(url.pathExtension.lowercased()) else { throw APIError(status: 0, message: "80MB 이하 WAV · FLAC · MP3 음원을 선택해주세요.") }
                return try Data(contentsOf: url)
            }.value
            guard model.userID == owner else { return }
            _ = try await API.shared.request(path + "/mr?ext=" + url.pathExtension.lowercased(), method: "PUT", bytes: data, progress: { progress = $0 })
            guard model.userID == owner else { return }; status = "반주 파일을 올렸어요. 변환 중입니다."
        } catch { if model.userID == owner { status = error.localizedDescription } }
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
    @State private var karaokeChart = false
    private var categorySelection: Binding<String> {
        Binding(get: { category }, set: { if $0 == "노래방 차트" { karaokeChart = true } else { category = $0 } })
    }
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Text(category).font(.system(size: 18, weight: .bold)).id("chart-top")
                    ChartFilterTabs(names: ["인기 차트", "노래방 차트", "급상승", "신인", "최신 음악"], selection: categorySelection)
                    if category == "인기 차트" { ChartFilterTabs(names: ["오늘", "이번 주", "이달", "명예의 전당"], selection: $period) }
                    Text(category == "인기 차트" ? "\(period) · 한국 시간 기준 · 어제 집계 대비" : category == "급상승" ? "최근 7일 청취자 수 기준" : category == "신인" ? "새로운 창작자의 음악을 만나보세요" : category)
                        .font(.system(size: 12)).foregroundStyle(AifectDesign.muted).padding(.top, 18).padding(.bottom, 8)
                    if category == "인기 차트" && !loading && !comparison { Text("전날 순위 기록이 준비되면 변동을 표시해요.").font(.system(size: 11)).foregroundStyle(AifectDesign.muted) }
                    HStack(spacing: 8) {
                        Button("전체 듣기", systemImage: "play.fill") { if let first = tracks.first { model.player.play(first, queue: tracks) } }.buttonStyle(ParityPill(filled: true))
                        Button("섞어 듣기", systemImage: "shuffle") { let shuffled = tracks.shuffled(); if let first = shuffled.first { model.player.play(first, queue: shuffled) } }.buttonStyle(ParityPill())
                        Text("\(tracks.count)곡").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                    }.disabled(tracks.isEmpty).padding(.top, 12).padding(.bottom, 18)
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                    if category == "신인" {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 20) {
                            ForEach(tracks) { song in CatalogSongTile(song: song, queue: tracks, showLike: true).accessibilityIdentifier("newcomer-card-" + song.id) }
                        }
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(tracks.enumerated()), id: \.element.id) { index, song in
                                ChartSongRow(song: song, queue: tracks, rank: category == "인기 차트" ? song.chartRank ?? index + 1 : category == "급상승" ? index + 1 : nil, movement: category == "인기 차트")
                                if index < tracks.count - 1 { Divider() }
                            }
                        }.clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    if !loading && tracks.isEmpty && error == nil { ContentUnavailableView("아직 집계할 음악이 없어요", systemImage: "chart.bar") }
                }.padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 24)
            }.accessibilityIdentifier("popular-chart-scroll").onChange(of: path) { _, _ in proxy.scrollTo("chart-top", anchor: .top) }
                .task(id: path + (model.userID ?? "guest")) { await load() }.refreshable { await load() }.navigationTitle("차트")
                .navigationDestination(isPresented: $karaokeChart) { CoverRankingView(initialPeriod: "week", karaokeChart: true).streamingPage() }
        }
    }
    private func load() async {
        loading = true; tracks = []; error = nil
        do {
            let value = try await API.shared.call(path); try Task.checkCancellation()
            tracks = value.songs(); comparison = value.object("chart").object("comparison").flag("available"); loading = false
        } catch is CancellationError {} catch { if !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
    }
}

private struct ChartSongRow: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    let rank: Int?
    let movement: Bool
    var body: some View {
        HStack(spacing: 0) {
            if let rank {
                VStack(spacing: 2) {
                    Text("\(rank)").font(.system(size: 14, weight: .bold))
                    if movement { Text(song.rankMovementLabel).font(.system(size: 10)).foregroundStyle(song.chartMovement == "down" ? Brand.aqua : ["up", "new"].contains(song.chartMovement ?? "") ? Brand.pink : AifectDesign.muted) }
                }.frame(width: 26)
            }
            Button { model.player.play(song, queue: queue) } label: {
                CoverArt(song: song, size: 48).overlay { Image(systemName: "play.fill").font(.system(size: 13)).foregroundStyle(Brand.pink).frame(width: 25, height: 25).background(Brand.background.opacity(0.82), in: Circle()).overlay(Circle().stroke(AifectDesign.violet)) }
            }.buttonStyle(.plain).accessibilityLabel(song.title + " 재생")
            Button { model.navigationPath.append(song) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    CoverPickTitle(song: song).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text(song.credit).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.leading, 10).padding(.trailing, 4).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel(song.title + " 상세")
            Button { Task { await model.toggleLike(song) } } label: {
                Image(systemName: model.likes.contains { $0.id == song.id } ? "heart.fill" : "heart").font(.system(size: 19)).foregroundStyle(model.likes.contains { $0.id == song.id } ? Brand.pink : AifectDesign.muted).frame(width: 44, height: 44)
            }.accessibilityLabel(song.title + " 좋아요")
            NavigationLink { SongMenuView(song: song).streamingPage() } label: { Image(systemName: "line.3.horizontal").font(.system(size: 19)).foregroundStyle(AifectDesign.muted).frame(width: 44, height: 44) }.accessibilityLabel(song.title + " 더보기")
        }.padding(.leading, 5).padding(.vertical, 5).background(model.player.current?.id == song.id ? AifectDesign.violet.opacity(0.14) : Brand.card.opacity(0.55)).accessibilityIdentifier("chart-song-" + song.id)
    }
}

struct CatalogSongTile: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    var showLike = false
    var singTitle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { model.navigationPath.append(song) } label: { AlbumArtwork(song: song) }.buttonStyle(.plain).accessibilityLabel(song.title + " 표지 상세")
                .overlay(alignment: .bottomTrailing) { ArtworkPlayButton(diameter: 34, label: song.title + " 먼저 듣기") { model.player.play(song, queue: queue) }.padding(5) }
                .overlay(alignment: .topTrailing) {
                    if showLike {
                        Button { Task { await model.toggleLike(song) } } label: { Image(systemName: model.likes.contains { $0.id == song.id } ? "heart.fill" : "heart").font(.system(size: 18)).foregroundStyle(Brand.pink).frame(width: 30, height: 30).background(Brand.background.opacity(0.82), in: Circle()).frame(width: 44, height: 44) }.accessibilityLabel(song.title + " 좋아요")
                    }
                }
            HStack(spacing: 4) {
                Button { model.navigationPath.append(song) } label: {
                    HStack(spacing: 4) {
                        if song.isCover { Image(systemName: song.coverMode == "duet" ? "person.2" : "mic").font(.system(size: 15)).foregroundStyle(AifectDesign.muted) }
                        CoverPickTitle(song: song).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel(song.title + " 상세")
                NavigationLink { SongMenuView(song: song).streamingPage() } label: { Image(systemName: "line.3.horizontal").foregroundStyle(AifectDesign.muted).frame(width: 36, height: 44) }.accessibilityLabel(song.title + " 더보기")
            }.frame(minHeight: 44)
            Text(song.credit).font(.system(size: 13)).foregroundStyle(AifectDesign.muted).lineLimit(1)
            Text([song.genreLabel, timeLabel(song.duration)].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1).padding(.top, 3)
            if let singTitle { SingSongButton(song: song, title: singTitle, compact: true, wide: true).padding(.top, 10) }
        }
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

struct StudioSingleChoice: View {
    let title: String
    let choices: [(String, String)]
    @Binding var selection: String
    @State private var showing = false
    var body: some View {
        Button { showing = true } label: { Text(title + " · " + (choices.first { $0.0 == selection }?.1 ?? "선택 안 함")).frame(maxWidth: .infinity) }.buttonStyle(CatalogButtonStyle(fullWidth: true))
            .sheet(isPresented: $showing) { ParitySelectionSheet(title: title, choices: choices, selected: [selection]) { selection = $0 } }
    }
}
