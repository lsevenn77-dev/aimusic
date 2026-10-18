import SwiftUI

struct ParityPill: ButtonStyle {
    var color: Color = Brand.aqua
    var filled = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 15).frame(minHeight: 44)
            .foregroundStyle(filled ? Brand.background : color)
            .background(filled ? color : .clear, in: Capsule())
            .overlay(Capsule().stroke(filled ? Color.clear : AifectDesign.stroke, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}
struct PageHeading: View {
    let title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 26, weight: .bold)).tracking(-0.6)
            if let subtitle { Text(subtitle).font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12).padding(.bottom, 20).background(MusicIllustration())
    }
}
struct MusicSectionHeading: View {
    let title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 18, weight: .bold))
            if let subtitle { Text(subtitle).font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 22).padding(.bottom, 12)
    }
}
struct ParityChips: View {
    let items: [String]
    @Binding var selection: String
    var accent: Color = Brand.aqua
    var filled = false
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Button { selection = item } label: {
                        Text(item).font(.subheadline).padding(.horizontal, 14).frame(minHeight: 32)
                            .foregroundStyle(selection == item ? (filled ? Brand.background : accent) : AifectDesign.muted)
                            .background(selection == item ? accent.opacity(filled ? 1 : 0.22) : .clear, in: Capsule())
                            .overlay(Capsule().stroke(selection == item ? accent : AifectDesign.stroke, lineWidth: 1)).frame(minHeight: 44)
                    }.buttonStyle(.plain).accessibilityAddTraits(selection == item ? .isSelected : [])
                }
            }
        }
    }
}
struct AlbumArtwork: View {
    let song: Song
    var ratio: CGFloat = 1
    var body: some View {
        Color.clear.aspectRatio(ratio, contentMode: .fit).overlay {
            RemoteArtwork(url: song.artURL) { $0.resizable().scaledToFill() } placeholder: {
                ZStack { AifectDesign.raised; Image(systemName: song.isCover ? "mic" : "music.note").font(.largeTitle).foregroundStyle(AifectDesign.secondaryText.opacity(0.45)) }
            }
        }.clipShape(RoundedRectangle(cornerRadius: 16)).accessibilityLabel("\(song.title) 앨범 표지")
    }
}
struct SaveMusicButton: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    var compact = false
    @State private var presented = false
    var body: some View {
        Button { if model.requireLogin() { presented = true } } label: {
            Label(compact ? "담기" : "플레이리스트 담기", systemImage: "text.badge.plus")
                .font(.system(size: compact ? 12 : 14)).foregroundStyle(AifectDesign.secondaryText).frame(minHeight: 44)
        }.buttonStyle(.plain).navigationDestination(isPresented: $presented) { PlaylistPickerView(song: song) }
    }
}
struct PlaylistPickerView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let song: Song
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        Group {
            List {
                Section(song.title) {
                    ForEach(model.playlists.filter { $0.string("user_id") == model.userID }, id: \.selfID) { list in
                        Button(list.string("name")) { Task { await save(list.string("id")) } }.disabled(busy)
                    }
                }
                Section("새 플레이리스트") {
                    TextField("플레이리스트 이름", text: $name)
                    Button("만들고 담기") { Task { await save(nil) } }.disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }.navigationTitle("플레이리스트에 담기").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("닫기") { dismiss() } }.task { await model.loadLibrary() }
        }
    }
    private func save(_ id: String?) async {
        guard let owner = model.userID, !busy else { return }
        busy = true; defer { busy = false }
        do {
            let target: String
            if let id { target = id }
            else { target = try await API.shared.call("/api/playlists", method: "POST", body: ["name": name.trimmingCharacters(in: .whitespacesAndNewlines), "is_public": false, "track_ids": [song.id]]).string("id") }
            guard model.userID == owner, !target.isEmpty else { return }
            if id != nil { _ = try await API.shared.call("/api/playlists/\(Endpoint.pathID(target))/tracks/\(Endpoint.pathID(song.id))", method: "PUT", body: [:]) }
            guard model.userID == owner else { return }
            await model.loadLibrary(); model.notice = "플레이리스트에 담았습니다."; dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
private struct FreshStudio: Identifiable { let id = UUID(); let studio: RecordingStudio }
struct SingSongButton: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    var title = "이 노래 부르기"
    var color: Color = Brand.pink
    var compact = false
    var gradient = false
    @State private var target: FreshStudio?
    @State private var resolving = false
    @State private var login = false
    @State private var error: String?
    var body: some View {
        Button {
            guard model.userID != nil else { login = true; return }
            openStudio()
        } label: {
            Group {
                if compact { Text(resolving ? "확인 중" : title) }
                else { Label(resolving ? "반주 확인 중…" : title, systemImage: "mic.fill") }
            }.font(.caption.weight(.semibold)).padding(.horizontal, compact ? 11 : 14).padding(.vertical, 8)
                .foregroundStyle(compact ? color : Brand.background)
                .background { if gradient { LinearGradient(colors: [Brand.pink, StreamStyle.purple], startPoint: .leading, endPoint: .trailing) } else { compact ? color.opacity(0.15) : color } }.clipShape(Capsule())
                .overlay(Capsule().stroke(compact ? color.opacity(0.5) : .clear, lineWidth: 1)).frame(minHeight: 44)
        }.buttonStyle(.plain).disabled(resolving)
            .fullScreenCover(item: $target) { StudioView(studio: $0.studio) }
            .sheet(isPresented: $login, onDismiss: { if model.userID != nil { openStudio() } }) { LoginView() }
            .onChange(of: model.userID) { _, owner in if owner != nil && login { login = false } }
            .alert("부르기 안내", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("확인") { error = nil } } message: { Text(error ?? "") }
    }
    private func openStudio() {
        guard let owner = model.userID, !resolving else { return }
        resolving = true
        Task {
            defer { resolving = false }
            do {
                let id = song.originalID ?? song.id
                let data = try await API.shared.call("/api/karaoke/\(Endpoint.pathID(id))")
                guard model.userID == owner else { return }
                let original = Song(data.object("track"))
                guard original.id == id else { throw APIError(status: 0, message: "이 곡의 반주를 아직 준비하지 못했어요.") }
                model.player.pause(); target = FreshStudio(studio: RecordingStudio(song: original, owner: owner))
            } catch { self.error = error.localizedDescription }
        }
    }
}
struct MusicGrid: View {
    @EnvironmentObject private var model: AppModel
    let songs: [Song]
    @State private var detail: Song?
    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 20) {
            ForEach(songs) { song in
                VStack(alignment: .leading, spacing: 7) {
                    AlbumArtwork(song: song).overlay(alignment: .topLeading) { Text(song.isCover ? "커버" : "제작곡").font(.system(size: 11, weight: .bold)).foregroundStyle(song.isCover ? Brand.aqua : Brand.pink).padding(8) }
                        .overlay(alignment: .topTrailing) { Button { model.player.play(song, queue: songs) } label: { Image(systemName: "play.fill").font(.caption).foregroundStyle(Brand.background).padding(9).background(Brand.pink, in: Circle()) }.padding(7).accessibilityLabel("\(song.title) 재생") }
                        .onTapGesture { detail = song }
                    Text(song.title).font(.system(size: 15, weight: .semibold)).lineLimit(1).onTapGesture { detail = song }
                    Text(song.credit).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(1)
                    SaveMusicButton(song: song, compact: true)
                }
            }
        }.navigationDestination(item: $detail) { TrackDetailView(song: $0) }
    }
}
struct CommunityMusicCard: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    let song: Song
    let queue: [Song]
    var onDetail: ((Song) -> Void)? = nil
    var duetInvitation = false
    @State private var detail = false
    private var openDuet: Bool { (duetInvitation || song.duetOpen == true) && song.ownerID != model.userID }
    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                if let id = song.producerID {
                    NavigationLink { ProfilePage(id: id).streamingPage() } label: {
                        HStack(spacing: 8) {
                            ProfilePhoto(person: ["id": id, "image_version": song.producerImageVersion ?? ""], size: 32, showsLevel: false)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(song.creatorName).font(.subheadline.bold()).lineLimit(2)
                                Text("\(song.plays ?? 0)회 재생").font(.caption2).foregroundStyle(AifectDesign.muted)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }.buttonStyle(.plain).accessibilityIdentifier("community-author-\(song.id)")
                    if song.ownerID != model.userID {
                        Button(model.followedProducers.contains(id) ? "팔로잉" : "팔로우") { Task { await model.toggleFollow(id) } }.font(.caption).foregroundStyle(AifectDesign.violet).frame(minHeight: 44)
                    }
                } else { Text(song.creatorName).font(.subheadline.bold()).frame(maxWidth: .infinity, alignment: .leading) }
                NavigationLink { SongMenuView(song: song).streamingPage() } label: { Image(systemName: "ellipsis").foregroundStyle(AifectDesign.muted).frame(width: 44, height: 44) }.accessibilityLabel("\(song.title) 더보기")
            }
            Color.clear.aspectRatio(typeSize.isAccessibilitySize ? 1.9 : 2.15, contentMode: .fit)
                .overlay {
                    GeometryReader { geo in
                        RemoteArtwork(url: song.artURL) { image in image.resizable().scaledToFill() } placeholder: {
                            ZStack { AifectDesign.raised; Image(systemName: song.isCover ? "person" : "music.note").font(.largeTitle).foregroundStyle(AifectDesign.muted) }
                        }.frame(width: geo.size.width, height: geo.size.height, alignment: song.isCover ? .top : .center).clipped()
                    }
                }
                .overlay(LinearGradient(stops: [.init(color: .clear, location: 0.3), .init(color: .black.opacity(0.85), location: 1)], startPoint: .top, endPoint: .bottom))
                .overlay(alignment: .topLeading) { Text(song.coverMode == "duet" ? "DUET" : song.isCover ? "COVER" : "ORIGINAL").font(.caption2.bold()).padding(7).background(.black.opacity(0.5), in: Capsule()).padding(8) }
                .overlay(alignment: .bottomLeading) {
                    Button { showDetail() } label: {
                        if !typeSize.isAccessibilitySize {
                            VStack(alignment: .leading, spacing: 4) { Text(song.title).font(.headline).lineLimit(2); if let text = song.descriptionText, !text.isEmpty { Text(text).font(.caption).lineLimit(1) } }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.trailing, 56).padding(10)
                        }
                    }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
                }
                .overlay(alignment: .bottomTrailing) { CommunityPlayControl(player: model.player, song: song, queue: queue).padding(8) }
                .foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 12))
            if typeSize.isAccessibilitySize {
                Button { showDetail() } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(song.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                        if let text = song.descriptionText, !text.isEmpty { Text(text).font(.caption).foregroundStyle(AifectDesign.muted).fixedSize(horizontal: false, vertical: true) }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                }.buttonStyle(.plain).accessibilityLabel("\(song.title) 상세")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 4) { reactions; singButton }
                VStack(alignment: .leading, spacing: 0) { reactions; singButton }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(.horizontal, 9).padding(.vertical, 4).background(LinearGradient(colors: [Color(aifectHex: 0x182031), Color(aifectHex: 0x111925)], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke, lineWidth: 1))
            .navigationDestination(isPresented: $detail) { TrackDetailView(song: song) }
    }
    private var reactions: some View {
        HStack(spacing: 0) {
            Button { Task { await model.toggleLike(song) } } label: { Label("\(song.likes)", systemImage: model.likes.contains { $0.id == song.id } ? "heart.fill" : "heart").font(.subheadline).frame(minWidth: 52, minHeight: 44) }.foregroundStyle(model.likes.contains { $0.id == song.id } ? Brand.pink : AifectDesign.secondaryText).accessibilityLabel("\(song.title) 좋아요")
            Button { showDetail() } label: { Label("\(song.comments)", systemImage: "text.bubble").font(.subheadline).frame(minWidth: 52, minHeight: 44) }.accessibilityLabel("\(song.title) 댓글")
            ShareLink(item: song.shareURL) { Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44) }.accessibilityLabel("음악 공유")
        }.buttonStyle(.plain)
    }
    @ViewBuilder private var singButton: some View {
        if openDuet { DuetJoinButton(partner: song) }
        else if !(song.coverMode == "duet" && song.duetOpen == true && song.ownerID == model.userID), song.isCover || song.karaokeReady == true || model.singable.contains(where: { $0.id == song.id }) { SingSongButton(song: song, title: "함께 부르기", color: AifectDesign.violet, gradient: true) }
    }
    private func showDetail() { if let onDetail { onDetail(song) } else { model.navigationPath.append(song) } }
}
private struct CommunityPlayControl: View {
    @ObservedObject var player: MusicPlayer
    let song: Song
    let queue: [Song]
    private var active: Bool { player.current?.id == song.id && player.playing }
    var body: some View {
        VStack(spacing: 2) {
            Button { if active { player.pause() } else { player.play(song, queue: queue) } } label: { Image(systemName: active ? "pause.circle.fill" : "play.circle.fill").font(.system(size: 34)).frame(width: 44, height: 44) }.accessibilityLabel("\(song.title) \(active ? "일시정지" : "재생")")
            Text(timeLabel(song.duration)).font(.caption2)
        }
    }
}
struct MainBottomBar: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selection: Int
    private let icons = ["house", "person.2", "mic", "bubble.left", "person"]
    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<5) { index in
                Button { model.selectTab(index) } label: {
                    VStack(spacing: 4) {
                        Image(systemName: icons[index]).font(.system(size: 20)).frame(width: 58, height: 30)
                            .foregroundStyle(selection == index ? StreamStyle.purple : AifectDesign.muted)
                            .shadow(color: selection == index ? StreamStyle.purple.opacity(0.7) : .clear, radius: 7)
                            .overlay(alignment: .topTrailing) { if index == 3 && model.inboxUnread > 0 { Text(model.inboxUnread > 99 ? "99+" : "\(model.inboxUnread)").font(.system(size: 10, weight: .bold)).foregroundStyle(Brand.background).padding(3).background(StreamStyle.purple, in: Capsule()).offset(x: 2, y: -3) } }
                        Text(AifectDesign.mainTabs[index]).font(.system(size: 12, weight: .semibold)).foregroundStyle(selection == index ? AifectDesign.violet : AifectDesign.muted)
                    }.frame(maxWidth: .infinity).frame(height: 62).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityIdentifier("main-tab-\(index)").accessibilityLabel(AifectDesign.mainTabs[index]).accessibilityAddTraits(selection == index ? .isSelected : [])
            }
        }.padding(.horizontal, 10).background(Brand.background)
    }
}

struct StreamingRootHeader: View {
    @EnvironmentObject private var model: AppModel
    @Binding var account: Bool
    var body: some View {
        HStack(spacing: 0) {
            if model.selectedTab == 0 { AifectWordmark() }
            else { Text("마이").font(.title2.bold()).foregroundStyle(AifectDesign.text) }
            Spacer(minLength: 8)
            if model.selectedTab == 0 {
                NavigationLink { ActivityHistoryView().streamingPage() } label: { Image(systemName: "bell").frame(width: 44, height: 44) }.accessibilityLabel("알림 기록")
                NavigationLink { SearchView().navigationTitle("검색").streamingPage() } label: { Image(systemName: "magnifyingglass").frame(width: 44, height: 44) }.accessibilityLabel("검색")
                NavigationLink(value: AppRoute.menu) { Image(systemName: "line.3.horizontal").frame(width: 44, height: 44) }.accessibilityLabel("전체 메뉴")
            } else {
                Button { account = true } label: { Image(systemName: "gearshape").frame(width: 44, height: 44) }.accessibilityLabel("계정 설정")
            }
        }.font(.system(size: 21)).foregroundStyle(AifectDesign.secondaryText).buttonStyle(.plain)
            .padding(.leading, 14).padding(.trailing, 4).frame(minHeight: 52).background(Brand.background)
    }
}

struct CoverRankHighlights: View {
    @State private var songs: [String: Song] = [:]
    @State private var error: String?
    private let periods = ["today", "week", "month", "all"]
    private let titles = ["오늘의 인기 커버", "주간 인기 커버", "이달의 목소리", "명예의 전당"]
    private let captions = ["오늘 마음을 움직인", "이번 주 사랑받은", "한 달의 발견", "오래도록 빛나는"]
    private let colors = [Brand.pink, Brand.aqua, AifectDesign.violet, Color(aifectHex: 0xE8CFA0)]
    var body: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 10) {
                ForEach(0..<4) { i in
                    NavigationLink { CoverRankingView(initialPeriod: periods[i]).streamingPage() } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 7) { Image(systemName: i == 3 ? "trophy.fill" : "waveform").font(.system(size: 18)).foregroundStyle(colors[i]); Text(titles[i]).font(.system(size: 14, weight: .semibold)); Spacer(minLength: 0); Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(AifectDesign.muted) }
                            if let song = songs[periods[i]] {
                                HStack(spacing: 10) { CoverArt(song: song, size: 40); VStack(alignment: .leading, spacing: 4) { Text(song.title).font(.system(size: 13)).lineLimit(1); Text(song.credit).font(.system(size: 11)).foregroundStyle(AifectDesign.muted).lineLimit(1) } }
                            } else { Text("새로운 목소리를 기다려요").font(.system(size: 12)).foregroundStyle(AifectDesign.muted).frame(minHeight: 40) }
                        }.frame(width: 196, alignment: .leading).padding(14)
                            .background(LinearGradient(colors: [colors[i].opacity(0.11), .clear], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 16)).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke, lineWidth: 1))
                    }.buttonStyle(.plain)
                }
            } }
            if let error { Text(error).font(.caption).foregroundStyle(AifectDesign.muted) }
        }.task { for period in periods { do { if let song = try await API.shared.call("/api/cover-rankings?period=\(period)&kind=tracks").songs().first { songs[period] = song } } catch { if !Task.isCancelled { self.error = error.localizedDescription } } } }
    }
}

struct ResponsiveProfilePhoto: View {
    let person: [String: Any]
    var kind = "producer"
    var body: some View {
        GeometryReader { geo in ProfilePhoto(person: person, kind: kind, size: geo.size.width) }
            .aspectRatio(1, contentMode: .fit).frame(maxWidth: 256).frame(maxWidth: .infinity)
    }
}
