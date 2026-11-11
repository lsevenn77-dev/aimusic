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
                }.buttonStyle(.plain).accessibilityAddTraits(selection == name ? .isSelected : [])
            }
        }.padding(.horizontal, 20).overlay(alignment: .bottom) { Divider() }
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
    init?(area: String, key: String, title: String) {
        guard ["voice", "live", "dubbing"].contains(area),
              key.range(of: "^[A-Za-z0-9_-]{1,120}$", options: .regularExpression) != nil else { return nil }
        self.area = area; self.key = key; self.title = title
    }
}

struct WorkspacePage: View {
    let space: SiteWorkspace
    @EnvironmentObject private var model: AppModel
    @State private var error: String?
    @State private var attempt = 0
    var body: some View {
        Group {
            if let error { RetryCard(message: error) { self.error = nil; attempt += 1 } }
            else { WorkspaceBrowser(space: space, error: $error).id("\(model.userID ?? "guest")-\(space.id)-\(attempt)") }
        }.navigationTitle(space.title).navigationBarTitleDisplayMode(.inline)
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
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = UIColor(Brand.background)
        let cookies = API.shared.mediaCookies()
        let url = Endpoint.origin.absoluteString + "/#" + space.id
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
