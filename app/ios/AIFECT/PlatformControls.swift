import SwiftUI
import WebKit

struct CatalogHeader: View {
    let title: String
    var body: some View {
        HStack {
            Text(title).font(.system(size: 24, weight: .bold))
            Spacer()
            if !["플레이", "커뮤니티"].contains(title) { NavigationLink(value: AppRoute.menu) {
                Image(systemName: "line.3.horizontal").frame(width: 48, height: 48)
            }.accessibilityLabel("전체 메뉴") }
        }.padding(.leading, 20).padding(.trailing, 8).frame(minHeight: 56)
    }
}

struct CatalogTabs: View {
    let names: [String]
    @Binding var selection: String
    var inset: CGFloat = 20
    var body: some View {
        HStack(spacing: 0) {
            ForEach(names, id: \.self) { name in
                Button { selection = name } label: {
                    Text(name).font(.system(size: 13, weight: selection == name ? .semibold : .medium))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(selection == name ? Brand.pink : AifectDesign.muted)
                        .overlay(alignment: .bottom) {
                            if selection == name { Capsule().fill(Brand.gradient).frame(height: 3) }
                        }
                        .contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityAddTraits(selection == name ? .isSelected : [])
            }
        }.padding(.horizontal, inset).overlay(alignment: .bottom) { Divider() }
    }
}

/// Android BrandPlayButton: the banner and cover use a 1.5-point ring and the same triangle coordinates.
struct ArtworkPlayButton: View {
    let diameter: CGFloat
    let label: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Canvas { context, size in
                let rect = CGRect(origin: .zero, size: size)
                let gradient = GraphicsContext.Shading.linearGradient(Gradient(colors: [Brand.pink, AifectDesign.violet, Brand.aqua]), startPoint: .zero, endPoint: CGPoint(x: size.width, y: 0))
                context.fill(Path(ellipseIn: rect), with: .color(Brand.background))
                context.stroke(Path(ellipseIn: rect.insetBy(dx: 1.5, dy: 1.5)), with: gradient, lineWidth: 1.5)
                var triangle = Path()
                triangle.move(to: CGPoint(x: size.width * 0.42, y: size.height * 0.31))
                triangle.addLine(to: CGPoint(x: size.width * 0.42, y: size.height * 0.69))
                triangle.addLine(to: CGPoint(x: size.width * 0.70, y: size.height * 0.50))
                triangle.closeSubpath()
                context.fill(triangle, with: gradient)
            }.frame(width: diameter, height: diameter).frame(minWidth: 48, minHeight: 48).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityLabel(label)
    }
}

struct SiteWorkspace: Identifiable, Hashable {
    let area: String
    let key: String
    let title: String
    var id: String { area + "/" + key }
    var path: String {
        if area == "crew-notices" { return "/#crew/" + key + "?tab=notice" }
        if area == "game/jump" { return "/#crew-jump/" + key }
        if area.hasPrefix("game/") { return "/crew-" + area.dropFirst(5) + "/?crew=" + key + "&from=crew" }
        return "/#" + id
    }
    init?(crewNotices id: String) {
        guard Self.validKey(id) else { return nil }
        area = "crew-notices"; key = id; title = "공지 관리"
    }
    init?(game: CrewGame, crew: String, route: String) {
        guard route == "game/" + game.rawValue + "/" + crew, Self.validKey(crew) else { return nil }
        self.area = "game/" + game.rawValue
        self.key = crew
        self.title = game.title
    }
    static func validKey(_ key: String) -> Bool {
        !key.isEmpty && key.count <= 120 && key.utf8.allSatisfy {
            (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 95
        }
    }
    init?(area: String, key: String, title: String) {
        guard ["voice", "live", "dubbing"].contains(area),
              Self.validKey(key) else { return nil }
        self.area = area; self.key = key; self.title = title
    }
}

struct FullScreenWorkspace: ViewModifier {
    @EnvironmentObject private var model: AppModel
    @State private var token = UUID()

    func body(content: Content) -> some View {
        content.streamingPage()
            .onAppear { model.visibleWorkspaces.insert(token) }
            .onDisappear { model.visibleWorkspaces.remove(token) }
    }
}

struct WorkspacePage: View {
    @EnvironmentObject private var model: AppModel
    let space: SiteWorkspace
    var body: some View {
        if space.area == "dubbing" {
            if space.key == "new", let owner = model.userID { NativeDubbingEditor(owner: owner).id(owner) }
            else { DubbingProjectPage(space: space).id(model.userID) }
        } else {
            WebWorkspacePage(space: space)
        }
    }
}

struct WebWorkspacePage: View {
    let space: SiteWorkspace
    @EnvironmentObject private var model: AppModel
    @State private var error: String?
    @State private var progress = 0.0
    @State private var attempt = 0
    var body: some View {
        ZStack(alignment: .top) {
            if let error { RetryCard(message: error) { self.error = nil; progress = 0; attempt += 1 }.padding() }
            else {
                WorkspaceBrowser(space: space, error: $error, progress: $progress).id("\(model.userID ?? "guest")-\(space.id)-\(attempt)")
                if progress < 1 {
                    VStack(spacing: 8) {
                        ProgressView(value: progress).tint(Brand.pink)
                        Text("화면을 불러오는 중…").font(.caption).padding(.bottom, 8)
                    }.background(Brand.background).allowsHitTesting(false).accessibilityIdentifier("workspace-loading")
                }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity).navigationTitle(space.title).modifier(FullScreenWorkspace())
    }
}

struct WorkspaceBrowser: UIViewRepresentable {
    let space: SiteWorkspace
    @Binding var error: String?
    @Binding var progress: Double
    private var target: URL {
        #if DEBUG
        // Real game source runs on a local fixture server in UI tests. Never enabled in Release.
        let args = ProcessInfo.processInfo.arguments
        if FeedbackUIFixture.enabled, let index = args.firstIndex(of: "-workspace-test-url"), index + 1 < args.count,
           let url = URL(string: args[index + 1]), url.scheme == "http", url.host == "127.0.0.1", url.port == 4188 {
            return url
        }
        #endif
        return URL(string: Endpoint.origin.absoluteString + space.path)!
    }
    func makeCoordinator() -> Coordinator { Coordinator(error: $error, progress: $progress, origin: target) }
    static let gameCSS = """
        :root { color-scheme:dark; --sidebar:0px }
        html,body { margin:0; padding:0; max-width:100%; overscroll-behavior:none }
        .sidebar,.topbar,.page-footer,.mobile-navigation,#menu-backdrop,#player,body>.player { display:none!important }
        .page-wrap { margin:0!important; padding:0!important; width:100%!important; min-height:0!important }
        #main { margin:0!important; padding:12px!important; width:100%!important; max-width:none!important; min-height:0!important; box-sizing:border-box }
        .wrap { width:100%!important; max-width:100%!important; box-sizing:border-box }
        .cgl-nav { flex-wrap:wrap }
        .arcade-lobby { padding:12px }
        button,a,input,select { touch-action:manipulation }
        button,input,select { min-height:44px }
        canvas,[data-jump],.lane,.touch-controls,.race-controls { touch-action:none!important; -webkit-user-select:none }
        dialog:not(.jump-wide-dialog) { max-width:calc(100vw - 24px); max-height:calc(100dvh - 24px); overflow:auto; box-sizing:border-box }
        @media(max-width:600px) { .cgl-layout { grid-template-columns:minmax(0,1fr)!important } .cgl-start { min-height:48px } }
        """
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "AIFECT-Mobile/" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
        if space.area.hasPrefix("game/") {
            let style = """
                (() => {
                    const css = document.createElement('style'); css.id = 'aifect-native-game';
                    css.textContent = `\(Self.gameCSS)`;
                    document.head.append(css);
                    let viewport = document.querySelector('meta[name=viewport]');
                    if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.append(viewport); }
                    viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
                    window.dispatchEvent(new Event('resize'));
                })();
                """
            config.userContentController.addUserScript(WKUserScript(source: style, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = UIColor(Brand.background)
        view.scrollView.backgroundColor = UIColor(Brand.background)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.accessibilityIdentifier = "crew-game-browser"
        context.coordinator.observation = view.observe(\.estimatedProgress, options: [.new]) { [weak coordinator = context.coordinator] view, _ in
            Task { @MainActor in coordinator?.progress = view.estimatedProgress }
        }
        let target = target
        #if DEBUG
        if FeedbackUIFixture.enabled {
            if target.host == "127.0.0.1" { view.load(URLRequest(url: target)) }
            else { context.coordinator.error = "게임 실행 검증에는 실제 게임 소스를 제공하는 로컬 서버가 필요합니다." }
            return view
        }
        #endif
        let cookies = API.shared.mediaCookies()
        context.coordinator.start = Task { @MainActor in
            for cookie in cookies {
                var properties = cookie.properties ?? [:]
                properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE"
                if let value = HTTPCookie(properties: properties) { await config.websiteDataStore.httpCookieStore.setCookie(value) }
            }
            guard !Task.isCancelled else { return }
            view.load(URLRequest(url: target))
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.start?.cancel()
        coordinator.observation?.invalidate()
        view.navigationDelegate = nil; view.uiDelegate = nil
        view.stopLoading()
    }
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        @Binding var error: String?
        @Binding var progress: Double
        let origin: URL
        var start: Task<Void, Never>?
        var observation: NSKeyValueObservation?
        init(error: Binding<String?>, progress: Binding<Double>, origin: URL) { _error = error; _progress = progress; self.origin = origin }
        func permits(_ url: URL) -> Bool {
            url.scheme == origin.scheme && url.host == origin.host && (url.port ?? (url.scheme == "https" ? 443 : 80)) == (origin.port ?? (origin.scheme == "https" ? 443 : 80)) && url.user == nil && url.password == nil
        }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Embedded game frames may use blob/about URLs; restrict top-level navigation, as Android does.
            if action.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
            guard let url = action.request.url, permits(url) else { decisionHandler(.cancel); return }
            decisionHandler(.allow)
        }
        func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            if response.isForMainFrame, let http = response.response as? HTTPURLResponse, !(200..<400).contains(http.statusCode) {
                error = [401, 403].contains(http.statusCode) ? "로그인 상태를 확인한 뒤 다시 열어주세요." : "화면을 불러오지 못했어요. 다시 시도해주세요. (\(http.statusCode))"
                decisionHandler(.cancel); return
            }
            decisionHandler(.allow)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { progress = 1 }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError failure: Error) { failed(failure) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError failure: Error) { failed(failure) }
        private func failed(_ failure: Error) { if (failure as NSError).code != NSURLErrorCancelled { error = failure.localizedDescription } }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { error = "작업 화면이 종료됐어요. 다시 열어주세요." }
        private func presenter(_ view: WKWebView) -> UIViewController? {
            var controller = view.window?.rootViewController
            while let presented = controller?.presentedViewController { controller = presented }
            return controller
        }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            guard let presenter = presenter(webView) else { completionHandler(); return }
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
            presenter.present(alert, animated: true)
        }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            guard let presenter = presenter(webView) else { completionHandler(false); return }
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }
    }
}


/// Shared Android reference: 48pt dark field with an outlined, 12pt corner.
struct CatalogSearchField: View {
    let prompt: String
    @Binding var text: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(AifectDesign.muted)
            TextField(prompt, text: $text).textFieldStyle(.plain).font(.system(size: 13))
                .submitLabel(.search).autocorrectionDisabled().textInputAutocapitalization(.never)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").frame(width: 32, height: 44) }
                    .buttonStyle(.plain).accessibilityLabel("검색 지우기")
            }
        }.padding(.horizontal, 14).frame(minHeight: 48)
            .background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
    }
}

struct SongQuickActionLabel: View {
    let title: String
    let icon: String
    var accent: Color = AifectDesign.secondaryText
    var body: some View {
        VStack(spacing: 7) {
            Image(systemName: icon).font(.system(size: 23)).foregroundStyle(accent)
            Text(title).font(.system(size: 11)).foregroundStyle(AifectDesign.secondaryText)
        }.frame(maxWidth: .infinity, minHeight: 60).contentShape(Rectangle())
    }
}

/// Explicit shape keeps iOS system button-style changes from altering Android's cards.
struct CatalogButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    var filled = false
    var fullWidth = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(minHeight: 40)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .foregroundStyle(filled ? Brand.background : AifectDesign.secondaryText)
            .background(filled ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Brand.card.opacity(0.45)), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(filled ? .clear : AifectDesign.stroke))
            .opacity(!enabled ? 0.45 : configuration.isPressed ? 0.7 : 1)
    }
}

struct ChartFilterTabs: View {
    let names: [String]
    @Binding var selection: String
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 22) {
                ForEach(names, id: \.self) { name in
                    Button { selection = name } label: {
                        VStack(spacing: 14) {
                            Text(name).font(.system(size: 14, weight: .semibold)).foregroundStyle(selection == name ? Brand.pink : AifectDesign.muted)
                            Rectangle().fill(selection == name ? Brand.pink : .clear).frame(width: 30, height: 2)
                        }.padding(.top, 12).frame(minHeight: 48).contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityAddTraits(selection == name ? .isSelected : [])
                }
            }
        }.overlay(alignment: .bottom) { Divider() }
    }
}


struct StudioSectionTabs: View {
    let names: [String]
    @Binding var selection: String
    static func icon(_ name: String) -> String? {
        ["인기": "trophy", "장르": "square.grid.2x2", "신규": "sparkles", "최신": "sparkles", "듀엣 참여": "person.2", "내 초안": "pencil"][name]
    }
    var body: some View {
        HStack(spacing: 0) {
            ForEach(names, id: \.self) { name in
                Button { selection = name } label: {
                    HStack(spacing: 3) {
                        if let icon = Self.icon(name) { Image(systemName: icon).font(.system(size: 16)).accessibilityIdentifier("studio-icon-" + name) }
                        Text(name).font(.system(size: 13, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.85)
                    }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(selection == name ? Color(aifectHex: 0x20172B) : AifectDesign.secondaryText)
                        .background(selection == name ? Color(aifectHex: 0xD7B8EF) : .clear, in: Capsule())
                }.buttonStyle(.plain).accessibilityLabel(name).accessibilityIdentifier("studio-section-" + name).accessibilityAddTraits(selection == name ? .isSelected : [])
            }
        }.padding(2).background(Brand.card, in: Capsule()).overlay(Capsule().stroke(AifectDesign.stroke))
    }
}

struct PlayDiscoveryTabs: View {
    let names: [String]
    @Binding var selection: String
    var body: some View {
        HStack(spacing: 4) {
            ForEach(names, id: \.self) { name in
                Button { selection = name } label: {
                    VStack(spacing: 2) {
                        Image("Orbit-" + (["추천":"recommended", "팔로잉":"following", "인기":"popular", "최신":"latest"][name] ?? "recommended")).resizable().frame(width: 30, height: 30)
                        Text(name).font(.system(size: 12, weight: selection == name ? .bold : .medium))
                        Circle().fill(selection == name ? AifectDesign.violet : .clear).frame(width: 4, height: 4)
                    }.frame(maxWidth: .infinity, minHeight: 62).foregroundStyle(selection == name ? Brand.pink : AifectDesign.secondaryText)
                }.buttonStyle(.plain).accessibilityLabel(name).accessibilityIdentifier("browse-section-" + name).accessibilityAddTraits(selection == name ? .isSelected : [])
            }
        }
    }
}
