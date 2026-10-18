import SwiftUI

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
    @State private var detail = false
    var body: some View {
        HStack(spacing: 8) {
            if let rank {
                VStack(spacing: 3) {
                    Text("\(rank)").font(.subheadline.bold())
                    if movement { Text(song.rankMovementLabel).font(.caption2).foregroundStyle(song.chartMovement == "down" ? StreamStyle.blue : Brand.pink) }
                }.frame(minWidth: 26)
            }
            Button { model.navigationPath.append(song) } label: {
                HStack(spacing: 10) {
                    CoverArt(song: song, size: 44)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(song.title).font(.subheadline.weight(.semibold)).foregroundStyle(AifectDesign.text).fixedSize(horizontal: false, vertical: true)
                        Text(song.credit).font(.caption).foregroundStyle(AifectDesign.muted).fixedSize(horizontal: false, vertical: true)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
            Button { model.player.play(song, queue: queue) } label: { Image(systemName: "play.circle.fill").font(.title2).frame(width: 44, height: 44) }.buttonStyle(.plain).foregroundStyle(Color(aifectHex: 0xC3C5F1)).accessibilityLabel("\(song.title) 재생")
            if sing { SingSongButton(song: song, title: "부르기", color: AifectDesign.violet, compact: true) }
            else { NavigationLink { SongMenuView(song: song).streamingPage() } label: { Image(systemName: "ellipsis").foregroundStyle(AifectDesign.muted).frame(width: 44, height: 44) }.accessibilityLabel("\(song.title) 더보기") }
        }.padding(.leading, 8).padding(.vertical, 6).background(StreamStyle.panel, in: RoundedRectangle(cornerRadius: 12))
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
                    Image(systemName: "music.note.list").font(.title2).frame(width: 44, height: 44).background(AifectDesign.raised, in: RoundedRectangle(cornerRadius: 12))
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
            Image(systemName: icon).font(.title2).foregroundStyle(color).frame(width: 42, height: 42).background(color.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 5) { Text(title).font(.subheadline.bold()); Text(caption).font(.caption).foregroundStyle(AifectDesign.muted) }.frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(color)
        }.foregroundStyle(AifectDesign.text).padding(10).frame(maxWidth: .infinity, minHeight: 64).background(StreamStyle.panel, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(color.opacity(0.35), lineWidth: 1))
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
    var body: some View {
        List {
            Section("음악") {
                NavigationLink("음악 검색") { SearchView() }
                NavigationLink("인기 차트") { PopularChartView() }
                NavigationLink("장르 · 아티스트 · 공개 플레이리스트") { ExploreView() }
                NavigationLink("내 보관함") { LibraryView(initialSelection: 3) }
            }
            Section("함께 부르기") {
                NavigationLink("부를 곡 찾기") { SingCatalogView() }
                NavigationLink("듀엣 참여하기") { DuetInvitationsView() }
                NavigationLink("내 초안") { RecordingDraftsView() }
                NavigationLink("크루") { CrewsView() }
            }
            Section("내 활동") {
                NavigationLink("내 작업 · 스튜디오") { CreatorWorkView() }
                NavigationLink("알림 기록") { ActivityHistoryView() }
                NavigationLink("골드 · 실버") { GiftWalletView() }
                NavigationLink("다이아 · 정산") { DiamondWalletView() }
                NavigationLink("계정 · 설정") { AccountView() }
            }
        }.navigationTitle("전체 메뉴")
    }
}

struct CreatorWorkView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        List {
            if model.userID == nil { LoginPrompt(title: "내 작업을 이어가세요") }
            else {
                NavigationLink("원곡 음원 업로드") { OriginalUploadView() }
                NavigationLink("녹음 초안 이어 하기") { RecordingDraftsView() }
                NavigationLink("내 공개 음악 · 활동") { MyMusicView(initialActivity: true) }
                NavigationLink("창작자 수익") { CreatorEarningsView() }
            }
        }.navigationTitle("내 작업")
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
                ParityChips(items: ["인기 차트", "노래방 차트", "급상승", "신인", "최신 음악"], selection: $category)
                if category == "인기 차트" {
                    ParityChips(items: ["오늘", "이번 주", "이달", "명예의 전당"], selection: $period)
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
