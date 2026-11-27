import SwiftUI

/// Completion belongs to the installation, not the account or Keychain. Signing
/// out does not show the introduction again; deleting the app resets this flag.
struct OnboardingGate<Content: View>: View {
    static var completionKey: String { "aifect.onboarding.completed.v1" }
    private let defaults: UserDefaults
    private let content: () -> Content
    @State private var completed: Bool

    init(defaults: UserDefaults = .standard, @ViewBuilder content: @escaping () -> Content) {
        self.defaults = defaults
        self.content = content
        _completed = State(initialValue: defaults.bool(forKey: Self.completionKey))
    }

    var body: some View {
        if completed {
            content()
        } else {
            OnboardingView {
                defaults.set(true, forKey: Self.completionKey)
                completed = true
            }
        }
    }
}

private struct OnboardingPage {
    let category: String
    let title: String
    let detail: String
    let artwork: CGRect

    static let all: [Self] = [
        .init(category: "AI 음악 스트리밍", title: "AI 음악만 모은\n새로운 스트리밍", detail: "다양한 AI 음악을 만나고,\n마음에 드는 곡을 들어보세요.", artwork: CGRect(x: 20, y: 280, width: 336, height: 394)),
        .init(category: "곡 업로드 · 수익", title: "누구나 곡을 올리고,\n수익을 만드는 곳", detail: "직접 만든 AI 곡을 업로드하고,\n수익을 만들어보세요.", artwork: CGRect(x: 396, y: 280, width: 333, height: 394)),
        .init(category: "AI 곡 부르기", title: "마음에 드는 AI 곡을\n내 목소리로", detail: "좋아하는 AI 곡을 골라,\n혼자 또는 듀엣으로 불러보세요.", artwork: CGRect(x: 770, y: 280, width: 333, height: 394)),
        .init(category: "더빙", title: "노래를 넘어,\n더빙까지", detail: "작품과 배역을 고르고,\n내 목소리로 연기해 보세요.", artwork: CGRect(x: 1143, y: 280, width: 335, height: 394)),
        .init(category: "함께 즐기기", title: "취향이 맞는 사람들과\n같이 놀자", detail: "노래방과 토킹룸, 크루에서\n함께 노래하고 이야기해 보세요.", artwork: CGRect(x: 1517, y: 280, width: 335, height: 394))
    ]
}

struct OnboardingView: View {
    let finish: () -> Void
    @State private var page = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    private let pages = OnboardingPage.all

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                AifectWordmark()
                Spacer()
                Button("건너뛰기", action: finish)
                    .font(.system(.subheadline, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(minWidth: 66, minHeight: 44)
                    .accessibilityIdentifier("onboarding-skip")
            }.padding(.horizontal, 24).padding(.top, 4).padding(.bottom, 8)

            TabView(selection: $page) {
                ForEach(pages.indices, id: \.self) { index in
                    pageContent(index).tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .accessibilityIdentifier("onboarding-pages")

            HStack(spacing: 0) {
                ForEach(pages.indices, id: \.self) { index in
                    Button { select(index) } label: {
                        Capsule()
                            .fill(index == page ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Color.white.opacity(0.36)))
                            .frame(width: index == page ? 29 : 7, height: 7)
                            .frame(width: 34, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(index + 1)번째 안내")
                    .accessibilityAddTraits(index == page ? .isSelected : [])
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("앱 소개")
            .accessibilityValue("\(page + 1) / \(pages.count)")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: select(min(page + 1, pages.count - 1))
                case .decrement: select(max(page - 1, 0))
                @unknown default: break
                }
            }

            Button {
                if page == pages.count - 1 { finish() } else { select(page + 1) }
            } label: {
                Text(page == pages.count - 1 ? "아이팩트 시작하기" : "다음")
                    .font(.system(.title3, weight: .bold))
                    .foregroundStyle(AifectDesign.background)
                    .frame(maxWidth: .infinity, minHeight: 62)
                    .background(Brand.gradient, in: RoundedRectangle(cornerRadius: 22))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("onboarding-next")
            .padding(.horizontal, 24).padding(.top, 6).padding(.bottom, 12)
        }
        .background {
            LinearGradient(colors: [Color(aifectHex: 0x222544), Color(aifectHex: 0x11162D)], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
    }

    private func select(_ index: Int) {
        if reduceMotion { page = index }
        else { withAnimation(.easeInOut(duration: 0.22)) { page = index } }
    }

    private func pageContent(_ index: Int) -> some View {
        let item = pages[index]
        return GeometryReader { proxy in
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.category)
                        .font(.system(.headline, weight: .semibold)).foregroundStyle(Brand.pink)
                        .padding(.bottom, 12)
                    Text(item.title)
                        .font(.system(.title, weight: .bold))
                        .tracking(-0.6).foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("onboarding-title-\(index)")
                        .padding(.bottom, 12)
                    Text(item.detail)
                        .font(.system(.body)).foregroundStyle(.white.opacity(0.92))
                        .lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 24)
                    // Render only the approved photo region of the supplied
                    // storyboard. Copy and controls above remain real native UI.
                    OnboardingArtwork(region: item.artwork)
                        .frame(height: typeSize.isAccessibilitySize ? 270 : max(210, proxy.size.height - 210))
                        .clipShape(RoundedRectangle(cornerRadius: 24))
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 4)
                .frame(minHeight: proxy.size.height, alignment: .top)
            }
            .scrollIndicators(.hidden)
        }
    }
}

private struct OnboardingArtwork: View {
    let region: CGRect
    var body: some View {
        GeometryReader { proxy in
            let scale = max(proxy.size.width / region.width, proxy.size.height / region.height)
            Image("OnboardingStoryboard")
                .resizable()
                .frame(width: 1870 * scale, height: 841 * scale)
                .offset(x: -region.minX * scale - (region.width * scale - proxy.size.width) / 2,
                        y: -region.minY * scale - (region.height * scale - proxy.size.height) / 2)
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
                .clipped()
        }
    }
}
