import SwiftUI
import WebKit

struct CatalogHeader: View {
    let title: String
    var body: some View {
        HStack {
            Text(title).font(.system(size: 24, weight: .bold))
            Spacer()
            NavigationLink(value: AppRoute.menu) {
                Image(systemName: "line.3.horizontal").frame(width: 48, height: 48)
            }.accessibilityLabel("전체 메뉴")
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
        if area == "game/jump" { return "/#crew-jump/" + key }
        if area.hasPrefix("game/") { return "/crew-" + area.dropFirst(5) + "/?crew=" + key + "&from=crew" }
        return "/#" + id
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
    @State private var attempt = 0
    var body: some View {
        Group {
            if let error { RetryCard(message: error) { self.error = nil; attempt += 1 } }
            else { WorkspaceBrowser(space: space, error: $error).id("\(model.userID ?? "guest")-\(space.id)-\(attempt)") }
        }.navigationTitle(space.title).modifier(FullScreenWorkspace())
    }
}

private struct WorkspaceBrowser: UIViewRepresentable {
    let space: SiteWorkspace
    @Binding var error: String?
    func makeCoordinator() -> Coordinator { Coordinator(error: $error) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        if space.area.hasPrefix("game/") {
            let style = """
                if (location.origin === '\(Endpoint.origin.absoluteString)' &&
                    (location.pathname + location.search + location.hash) === '\(space.path)') {
                    const css = document.createElement('style');
                    css.textContent = `
                        :root { color-scheme:dark; --sidebar:0px }
                        html,body { margin:0; max-width:100%; overscroll-behavior:none }
                        .sidebar,.topbar,.page-footer,.mobile-navigation,#menu-backdrop,body>.player { display:none!important }
                        .page-wrap,#main { margin:0!important; width:100%!important; max-width:none!important; min-height:0!important }
                        #main { padding:12px!important; box-sizing:border-box }
                        .cgl-nav { flex-wrap:wrap }
                        button,a,input,select { touch-action:manipulation }
                        canvas,[data-jump],.lane,.touch-controls,.race-controls { touch-action:none!important; -webkit-user-select:none }
                        @media(max-width:600px) { .cgl-layout { grid-template-columns:minmax(0,1fr)!important } .cgl-start { min-height:48px } }
                    `;
                    document.head.append(css);
                    const viewport = document.querySelector('meta[name=viewport]');
                    if (viewport) viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
                    window.dispatchEvent(new Event('resize'));
                }
                """
            config.userContentController.addUserScript(WKUserScript(source: style, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = UIColor(Brand.background)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-feedback-ui-test") {
            view.navigationDelegate = nil
            view.loadHTMLString("<meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#0b1024;color:white;font-family:system-ui;padding:24px'>검증용 작업 화면</body>", baseURL: nil)
            return view
        }
        #endif
        let cookies = API.shared.mediaCookies()
        let url = Endpoint.origin.absoluteString + space.path
        context.coordinator.start = Task { @MainActor in
            for cookie in cookies {
                var properties = cookie.properties ?? [:]
                properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE"
                if let value = HTTPCookie(properties: properties) {
                    await config.websiteDataStore.httpCookieStore.setCookie(value)
                }
            }
            guard !Task.isCancelled, let target = URL(string: url) else { return }
            view.load(URLRequest(url: target))
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.start?.cancel()
        view.navigationDelegate = nil
        view.stopLoading()
    }
    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var error: String?
        var start: Task<Void, Never>?
        init(error: Binding<String?>) { _error = error }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url, url.scheme == "https", url.host == Endpoint.origin.host,
                  url.port == nil || url.port == 443, url.user == nil, url.password == nil else { decisionHandler(.cancel); return }
            decisionHandler(.allow)
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError failure: Error) {
            if (failure as NSError).code != NSURLErrorCancelled { error = failure.localizedDescription }
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError failure: Error) {
            if (failure as NSError).code != NSURLErrorCancelled { error = failure.localizedDescription }
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
    var filled = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(minHeight: 40)
            .foregroundStyle(filled ? Brand.background : AifectDesign.secondaryText)
            .background(filled ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Brand.card.opacity(0.45)), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(filled ? .clear : AifectDesign.stroke))
            .opacity(configuration.isPressed ? 0.7 : 1)
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
