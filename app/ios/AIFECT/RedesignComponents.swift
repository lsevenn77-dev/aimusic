import SwiftUI

struct MusicBannerPanel<Content: View>: View {
    let title: String
    let subtitle: String
    let icon: String
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon).font(.system(size: 17, weight: .bold)).foregroundStyle(Brand.pink)
            Text(subtitle).font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(14).background(MusicSurface(feature: true))
            .clipShape(RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(AifectDesign.stroke, lineWidth: 1)).padding(.top, 16)
    }
}

struct CompactMusicRow: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    var onDetail: ((Song) -> Void)? = nil
    @State private var detail = false
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            CoverArt(song: song, size: 46).onTapGesture { showDetail() }
            VStack(alignment: .leading, spacing: 4) {
                Button { showDetail() } label: {
                    Text(song.title).font(.system(size: 14, weight: .semibold)).lineSpacing(3).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
                }.buttonStyle(.plain)
                HStack(spacing: 6) {
                    Text(song.credit).font(.system(size: 12)).foregroundStyle(AifectDesign.muted).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                    Button { model.player.play(song, queue: queue) } label: { Image(systemName: "play.circle.fill").font(.system(size: 24)).foregroundStyle(Brand.pink).frame(width: 44, height: 44) }.accessibilityLabel("\(song.title) 재생")
                }
            }
        }.padding(.vertical, 12).navigationDestination(isPresented: $detail) { TrackDetailView(song: song) }
    }
    private func showDetail() { if let onDetail { onDetail(song) } else { detail = true } }
}

struct CrewMembershipGraphic: View {
    let crew: [String: Any]
    let trackCount: Int
    private var fraction: Double { NativeRedesignLayout.crewFraction(crew.int("members"), target: crew.int("capacity")) }
    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle().stroke(AifectDesign.stroke, lineWidth: 6)
                Circle().trim(from: 0, to: fraction).stroke(Brand.pink, style: StrokeStyle(lineWidth: 6, lineCap: .round)).rotationEffect(.degrees(-90))
                Image(systemName: "person.2.fill").font(.system(size: 26)).foregroundStyle(Brand.pink)
            }.frame(width: 76, height: 76).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text("함께하는 멤버").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                Text(crew.int("capacity") > 0 ? "\(crew.int("members"))명 / \(crew.int("capacity"))명" : "\(crew.int("members"))명").font(.system(size: 18, weight: .bold))
                Text("표시된 공개 음악 \(trackCount)곡").font(.system(size: 12)).foregroundStyle(Brand.aqua)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(16).background(MusicSurface(feature: true)).clipShape(RoundedRectangle(cornerRadius: 18))
            .accessibilityElement(children: .combine).accessibilityIdentifier("crew-members-progress")
    }
}

/// Uses the web's existing studio asset, not the mobile reference mockup.
struct WebMusicBanner: View {
    let title: String
    let subtitle: String
    var eyebrow = "AIFECT COMMUNITY"
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow).font(.system(size: 10, weight: .semibold)).tracking(1.3).foregroundStyle(Brand.pink)
            Text(title).font(.system(size: 23, weight: .bold)).foregroundStyle(.white)
            Text(subtitle).font(.system(size: 12)).foregroundStyle(AifectDesign.secondaryText).padding(.trailing, 40)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
            .background {
                GeometryReader { proxy in
                    Image("CommunityStudio").resizable().scaledToFill().frame(width: proxy.size.width, height: proxy.size.height).clipped()
                        .overlay(LinearGradient(colors: [Brand.background.opacity(0.85), Brand.background.opacity(0.68), Brand.background.opacity(0.15)], startPoint: .leading, endPoint: .trailing))
                }.accessibilityHidden(true)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke, lineWidth: 1))
    }
}

struct StudioAtmosphere: View {
    var body: some View { Brand.background.ignoresSafeArea() }
}

/// Decorative only: a static, quiet motif that doesn't compete with labels.
struct MusicIllustration: View {
    var body: some View {
        HStack(spacing: 14) {
            Spacer(minLength: 0)
            Image(systemName: "waveform").font(.system(size: 42, weight: .ultraLight))
            Image(systemName: "mic").font(.system(size: 76, weight: .ultraLight))
        }.foregroundStyle(AifectDesign.secondaryText.opacity(0.10)).padding(.trailing, 16)
            .allowsHitTesting(false).accessibilityHidden(true)
    }
}

enum NativeRedesignLayout {
    static func crewFraction(_ value: Int, target: Int, start: Int = 0) -> Double {
        guard target > start else { return 0 }
        return min(1, max(0, (Double(value) - Double(start)) / (Double(target) - Double(start))))
    }
    static func singingColumns(width: CGFloat, accessibilityText: Bool) -> Int {
        width >= 600 && !accessibilityText ? 2 : 1
    }
    static func rankedCrews(_ crews: [[String: Any]]) -> [[String: Any]] {
        crews.sorted {
            if $0.int("level") != $1.int("level") { return $0.int("level") > $1.int("level") }
            if $0.int("xp") != $1.int("xp") { return $0.int("xp") > $1.int("xp") }
            return $0.string("id") < $1.string("id")
        }
    }
}

struct SingReadyCard: View {
    @EnvironmentObject private var model: AppModel
    let song: Song
    let queue: [Song]
    @State private var detail = false
    private var recordingDescription: String {
        let text = (song.descriptionText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "원곡을 들어보고, 준비된 반주에 나만의 목소리를 담아보세요." : text
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { detail = true } label: {
                HStack(alignment: .top, spacing: 12) {
                    CoverArt(song: song, size: 64)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(song.title).font(.system(size: 17, weight: .semibold)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                        Text(song.credit).font(.system(size: 13)).foregroundStyle(AifectDesign.muted).fixedSize(horizontal: false, vertical: true)
                        Text("MR 준비 완료 · \(timeLabel(song.duration))").font(.system(size: 11)).foregroundStyle(Brand.aqua)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }.buttonStyle(.plain)
            GenreTags(genres: song.genres)
            Text(recordingDescription)
                .font(.system(size: 12)).lineSpacing(4).foregroundStyle(AifectDesign.secondaryText).fixedSize(horizontal: false, vertical: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { play; SingSongButton(song: song, title: "부르기") }
                VStack(alignment: .leading, spacing: 8) { play; SingSongButton(song: song, title: "부르기") }
            }
            NavigationLink {
                MusicCollectionView(title: "\(song.title) · 참여 커버", path: "/api/tracks/\(Endpoint.pathID(song.id))/covers", key: "covers")
            } label: {
                Label("커버 \(max(0, song.covers ?? 0)) · 참여 커버 보기", systemImage: "person.2")
                    .font(.system(size: 12)).foregroundStyle(Brand.aqua).frame(minHeight: 44)
            }.buttonStyle(.plain)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(MusicIllustration()).background(MusicSurface(feature: true))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(AifectDesign.stroke, lineWidth: 1))
            .navigationDestination(isPresented: $detail) { TrackDetailView(song: song) }
            .accessibilityIdentifier("sing-ready-\(song.id)")
    }
    private var play: some View {
        Button { model.player.play(song, queue: queue) } label: { Label("재생", systemImage: "play.fill") }
            .buttonStyle(ParityPill(color: Brand.pink))
    }
}

struct GenreTags: View {
    let genres: [String]
    var body: some View {
        GenreFlowLayout {
            ForEach(Array(Set(genres.filter { !$0.isEmpty })).sorted(), id: \.self) { genre in
                Text(genre).font(.system(size: 11)).foregroundStyle(AifectDesign.violet)
                    .fixedSize(horizontal: false, vertical: true).padding(.horizontal, 10).padding(.vertical, 5)
                    .background(AifectDesign.violet.opacity(0.08), in: Capsule()).overlay(Capsule().stroke(AifectDesign.violet.opacity(0.25), lineWidth: 1))
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct GenreFlowLayout: Layout {
    private func arrangement(_ subviews: Subviews, width: CGFloat) -> (CGSize, [CGRect]) {
        var frames: [CGRect] = []; var x: CGFloat = 0; var y: CGFloat = 0; var rowHeight: CGFloat = 0
        for view in subviews {
            let ideal = view.sizeThatFits(.unspecified)
            let size = view.sizeThatFits(ProposedViewSize(width: min(width, ideal.width), height: nil))
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + 6; rowHeight = 0 }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            x += size.width + 6; rowHeight = max(rowHeight, size.height)
        }
        return (CGSize(width: width, height: y + rowHeight), frames)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrangement(subviews, width: max(1, proposal.width ?? 320)).0
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let frames = arrangement(subviews, width: max(1, bounds.width)).1
        for (index, frame) in frames.enumerated() { subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: ProposedViewSize(frame.size)) }
    }
}

struct CreatorPreviewCard: View {
    let person: [String: Any]
    @ScaledMetric(relativeTo: .subheadline) private var nameHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .caption) private var bioHeight: CGFloat = 56
    @ScaledMetric(relativeTo: .subheadline) private var nameSize: CGFloat = 14
    @ScaledMetric(relativeTo: .caption) private var bioSize: CGFloat = 11
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProfilePhoto(person: person, size: 44)
            Text(person.displayName()).font(.system(size: nameSize, weight: .bold)).lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading).frame(height: nameHeight, alignment: .topLeading)
            Text(person.string("bio").isEmpty ? "프로필에서 이 음악가의 곡을 만나보세요." : person.string("bio"))
                .font(.system(size: bioSize)).lineSpacing(3).foregroundStyle(AifectDesign.muted).lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading).frame(height: bioHeight, alignment: .topLeading)
            Text("프로필 보기  ›").font(.system(size: 11)).foregroundStyle(Brand.aqua)
        }.frame(width: 120, alignment: .leading).padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(AifectDesign.stroke, lineWidth: 1)).multilineTextAlignment(.leading)
    }
}

struct SingReadyGrid: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize
    let songs: [Song]
    var body: some View {
        let count = NativeRedesignLayout.singingColumns(width: sizeClass == .regular ? 600 : 390, accessibilityText: typeSize.isAccessibilitySize)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: count), spacing: 12) {
            ForEach(songs) { SingReadyCard(song: $0, queue: songs) }
        }
    }
}

struct CommunityCrewRanking: View {
    @EnvironmentObject private var model: AppModel
    @State private var crews: [[String: Any]] = []
    var body: some View {
        if !crews.isEmpty {
            MusicSectionHeading(title: "크루 랭킹", subtitle: "레벨 · 경험치순")
            ForEach(Array(crews.enumerated()), id: \.element.selfID) { index, crew in
                NavigationLink { CrewPage(id: crew.string("id")) } label: {
                    HStack(spacing: 12) {
                        Text("\(index + 1)").font(.system(size: 20, weight: .bold)).foregroundStyle(Brand.pink).frame(width: 24)
                        CrewArtwork(crew: crew).frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 6) {
                            Text(crew.string("name")).font(.system(size: 15, weight: .semibold)).lineLimit(2)
                            Text("LV \(crew.int("level")) · \(crew.int("xp")) XP").font(.system(size: 12)).foregroundStyle(Brand.aqua)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.right").font(.caption)
                    }.padding(16).background(MusicSurface()).clipShape(RoundedRectangle(cornerRadius: 16))
                }.buttonStyle(.plain)
            }
        }
        // Keep the task attached to a persistent view, even before the first response.
        Color.clear.frame(height: 0).task(id: model.userID) {
            let owner = model.userID
            if let data = try? await API.shared.call("/api/crews"), !Task.isCancelled, owner == model.userID {
                crews = Array(NativeRedesignLayout.rankedCrews(data.objects("crews")).prefix(3))
            }
        }
    }
}
