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
            Text(title).font(.system(size: 31, weight: .bold)).tracking(-1)
            if let subtitle { Text(subtitle).font(.system(size: 14)).foregroundStyle(AifectDesign.muted) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12).padding(.bottom, 20)
    }
}
struct MusicSectionHeading: View {
    let title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 21, weight: .bold))
            if let subtitle { Text(subtitle).font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 26).padding(.bottom, 14)
    }
}
struct ParityChips: View {
    let items: [String]
    @Binding var selection: String
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Button { selection = item } label: {
                        Text(item).font(.system(size: 13)).padding(.horizontal, 14).frame(minHeight: 36)
                            .background(selection == item ? AifectDesign.raised : .clear, in: Capsule())
                            .overlay(Capsule().stroke(selection == item ? Brand.aqua.opacity(0.55) : AifectDesign.stroke, lineWidth: 1))
                    }.buttonStyle(.plain).accessibilityAddTraits(selection == item ? .isSelected : [])
                }
            }.padding(.vertical, 4)
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
        }.buttonStyle(.plain).sheet(isPresented: $presented) { PlaylistPickerView(song: song) }
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
        NavigationStack {
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
    var title = "이 곡 부르기"
    var color: Color = Brand.pink
    @State private var target: FreshStudio?
    var body: some View {
        Button {
            guard model.requireLogin(), let owner = model.userID else { return }
            model.player.pause(); target = FreshStudio(studio: RecordingStudio(song: song, owner: owner))
        } label: { Label(title, systemImage: "mic.fill") }.buttonStyle(ParityPill(color: color, filled: true))
            .fullScreenCover(item: $target) { StudioView(studio: $0.studio) }
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
        }.sheet(item: $detail) { TrackDetailView(song: $0) }
    }
}
struct CommunityMusicCard: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    @State private var detail = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 11) {
                if let id = song.producerID {
                    NavigationLink { ProfilePage(id: id) } label: {
                        ProfilePhoto(person: ["id": id, "image_version": song.producerImageVersion ?? ""], size: 38).clipShape(Circle())
                        VStack(alignment: .leading, spacing: 3) {
                            Text(song.creatorName).font(.system(size: 14, weight: .bold))
                            Text(song.isCover ? "새로운 커버곡을 불렀어요" : "새로운 음악을 만들었어요").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                        }
                    }.buttonStyle(.plain)
                }
                Spacer(minLength: 0)
                Text(song.isCover ? (song.coverMode == "duet" ? "DUET" : "COVER") : "ORIGINAL")
                    .font(.system(size: 10, weight: .semibold)).tracking(1).padding(7)
                    .foregroundStyle(song.isCover ? Brand.aqua : Brand.pink)
                    .background(song.isCover ? Color(aifectHex: 0x20383C) : Color(aifectHex: 0x34252E), in: RoundedRectangle(cornerRadius: 7))
            }
            if let text = song.descriptionText, !text.isEmpty { Text(text).font(.system(size: 14)).lineLimit(3) }
            Button { detail = true } label: { AlbumArtwork(song: song, ratio: 1.5) }.buttonStyle(.plain)
            HStack {
                VStack(alignment: .leading, spacing: 5) { Text(song.title).font(.system(size: 19, weight: .semibold)).lineLimit(2); Text(song.credit).font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }.onTapGesture { detail = true }
                Spacer()
                Button { model.player.play(song, queue: queue) } label: { Image(systemName: "play.fill").foregroundStyle(Brand.background).frame(width: 44, height: 44).background(Brand.aqua, in: Circle()) }.accessibilityLabel("\(song.title) 재생")
            }
            HStack { Spacer(); SaveMusicButton(song: song) }
            HStack(spacing: 16) {
                Button { Task { await model.toggleLike(song) } } label: { Label("\(song.likes)", systemImage: model.likes.contains(where: { $0.id == song.id }) ? "heart.fill" : "heart") }.foregroundStyle(Brand.pink)
                Button { detail = true } label: { Label("\(song.comments)", systemImage: "bubble.left") }
                GiftSheetButton(song: song) { Text("선물") }.foregroundStyle(Brand.pink)
                Spacer(); Text("\(song.plays ?? 0)회")
            }.font(.system(size: 13)).foregroundStyle(AifectDesign.muted).frame(minHeight: 44)
            if song.isCover, let original = model.singable.first(where: { $0.id == song.originalID }) {
                HStack { Button { model.player.play(original, queue: [original]) } label: { Label("원곡 듣기", systemImage: "opticaldisc") }; Spacer(); SingSongButton(song: original, title: "나도 부르기") }.font(.system(size: 13))
            }
        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 22)).sheet(isPresented: $detail) { TrackDetailView(song: song) }
    }
}
struct MainBottomBar: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selection: Int
    private let icons = ["headphones", "person.2.fill", "mic.fill", "bubble.left.and.bubble.right.fill", "person"]
    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<5) { index in
                Button { selection = index } label: {
                    VStack(spacing: 4) {
                        Image(systemName: icons[index]).font(.system(size: 20)).frame(width: 58, height: 30)
                            .foregroundStyle(selection == index ? (index == 2 ? Brand.pink : Brand.aqua) : AifectDesign.muted)
                            .background(selection == index ? AifectDesign.raised : .clear, in: Capsule())
                            .overlay(alignment: .topTrailing) { if index == 3 && model.inboxUnread > 0 { Text(model.inboxUnread > 99 ? "99+" : "\(model.inboxUnread)").font(.system(size: 10, weight: .bold)).foregroundStyle(Brand.background).padding(3).background(Brand.pink, in: Capsule()).offset(x: 2, y: -3) } }
                        Text(AifectDesign.mainTabs[index]).font(.system(size: 12, weight: .semibold)).foregroundStyle(selection == index ? AifectDesign.text : AifectDesign.muted)
                    }.frame(maxWidth: .infinity).frame(height: 62).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityIdentifier("main-tab-\(index)").accessibilityLabel(AifectDesign.mainTabs[index]).accessibilityAddTraits(selection == index ? .isSelected : [])
            }
        }.padding(.horizontal, 10).background(Brand.background)
    }
}

struct BrandNavigationToolbar: ToolbarContent {
    @EnvironmentObject private var model: AppModel
    @Binding var account: Bool
    var body: some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: .topBarLeading) { AifectWordmark() }.sharedBackgroundVisibility(.hidden)
            ToolbarItem(placement: .topBarTrailing) { controls }.sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .topBarLeading) { AifectWordmark() }
            ToolbarItem(placement: .topBarTrailing) { controls }
        }
    }
    private var controls: some View {
        HStack(spacing: 0) {
            NavigationLink { SearchView().navigationTitle("검색") } label: { Image(systemName: "magnifyingglass").frame(width: 40, height: 44) }.accessibilityLabel("검색")
            Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise").frame(width: 40, height: 44) }.disabled(model.loading).accessibilityLabel("새로고침")
            Button { account = true } label: {
                Image(systemName: model.user == nil ? "person" : "person.fill").font(.system(size: 18)).frame(width: 36, height: 36).background(AifectDesign.stroke, in: Circle())
            }.frame(width: 44, height: 44).accessibilityLabel("계정")
        }.foregroundStyle(AifectDesign.muted).buttonStyle(.plain)
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
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(0..<4) { i in
                    NavigationLink { CoverRankingView(initialPeriod: periods[i]) } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack { Image(systemName: i == 3 ? "trophy.fill" : "waveform").font(.system(size: 22)); Spacer(); Image(systemName: "arrow.up.right").font(.system(size: 15)) }.foregroundStyle(colors[i])
                            Spacer(minLength: 4)
                            Text(captions[i]).font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                            Text(titles[i]).font(.system(size: 18, weight: .bold)).lineLimit(2)
                            if let song = songs[periods[i]] {
                                HStack(spacing: 8) { CoverArt(song: song, size: 32).clipShape(Circle()); VStack(alignment: .leading, spacing: 3) { Text(song.title).font(.system(size: 12)).lineLimit(1); Text(song.credit).font(.system(size: 11)).foregroundStyle(colors[i]).lineLimit(1) } }
                            } else { Text("새로운 목소리를 기다려요").font(.system(size: 12)).foregroundStyle(AifectDesign.muted).lineLimit(2) }
                        }.frame(maxWidth: .infinity, minHeight: 152, alignment: .leading).padding(16)
                            .background(LinearGradient(colors: [colors[i].opacity(0.16), .clear], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 20)).background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
                    }.buttonStyle(.plain)
                }
            }
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
