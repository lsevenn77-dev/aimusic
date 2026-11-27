import SwiftUI
import WebKit
import CallKit

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
        if area == "product-review" { return "/api/product-review/" + key + "/room" }
        if area == "crew-notices" { return "/#crew/" + key + "?tab=notice" }
        if area == "game/jump" { return "/#crew-jump/" + key }
        if area.hasPrefix("game/") { return "/crew-" + area.dropFirst(5) + "/?crew=" + key + "&from=crew" }
        return "/#" + id
    }
    init?(crewNotices id: String) {
        guard Self.validKey(id) else { return nil }
        area = "crew-notices"; key = id; title = "공지 관리"
    }
    init?(productReview url: URL) {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "kr.co.aifect.app", parts.host == "product-review", parts.path.isEmpty,
              parts.user == nil, parts.password == nil, parts.port == nil, parts.fragment == nil,
              let query = parts.queryItems, query.count == 1, query[0].name == "ticket", let ticket = query[0].value else { return nil }
        let tokens = ticket.split(separator: ".", omittingEmptySubsequences: false)
        guard tokens.count == 2, (16...420).contains(tokens[0].utf8.count), tokens[1].utf8.count == 43,
              tokens.joined().utf8.allSatisfy({ byte in
                  (65...90).contains(byte) || (97...122).contains(byte) || (48...57).contains(byte) || byte == 45 || byte == 95
              }) else { return nil }
        area = "product-review"; key = ticket; title = "상품 적용 검수"
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

private struct RoomOverlay: Identifiable {
    let id: String
}

enum TalkRoomLocation: String {
    case outside, inside, left
}

struct WebWorkspacePage: View {
    @Environment(\.dismiss) private var dismiss
    let space: SiteWorkspace
    @EnvironmentObject private var model: AppModel
    @State private var error: String?
    @State private var progress = 0.0
    @State private var attempt = 0
    @State private var roomOverlay: RoomOverlay?
    @State private var talkLocation = TalkRoomLocation.outside
    var body: some View {
        ZStack(alignment: .top) {
            if let error { RetryCard(message: error) { self.error = nil; progress = 0; attempt += 1 }.padding() }
            else {
                WorkspaceBrowser(space: space, error: $error, progress: $progress, talkLocation: $talkLocation, openRoomOverlay: { roomOverlay = RoomOverlay(id: $0) }).id("\(model.userID ?? "guest")-\(space.id)-\(attempt)")
                if progress < 1 {
                    VStack(spacing: 8) {
                        ProgressView(value: progress).tint(Brand.pink)
                        Text("화면을 불러오는 중…").font(.caption).padding(.bottom, 8)
                    }.background(Brand.background).allowsHitTesting(false).accessibilityIdentifier("workspace-loading")
                }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity).navigationTitle(space.title).modifier(FullScreenWorkspace())
            .toolbar(talkLocation == .inside && error == nil ? .hidden : .automatic, for: .navigationBar)
            .onChange(of: talkLocation) { _, location in if location == .left { dismiss() } }
            .sheet(item: $roomOverlay) { overlay in
                NavigationStack {
                    Group {
                        if overlay.id == "notifications" { ActivityHistoryView() }
                        else if overlay.id.hasPrefix("dm/") {
                            ChatPage(path: "/api/dm/" + Endpoint.pathID(String(overlay.id.dropFirst(3))), title: "메시지", crew: false)
                        } else { MessagesView().navigationTitle("메시지") }
                    }.streamingPage()
                        .navigationDestination(for: MessageRoute.self) { route in
                            ChatPage(path: route.crew ? "/api/crews/\(Endpoint.pathID(route.id))/messages" : "/api/dm/\(Endpoint.pathID(route.id))", title: route.title, crew: route.crew)
                        }
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("노래방으로 돌아가기") { roomOverlay = nil } } }
                }.presentationDetents([.fraction(0.5)]).presentationDragIndicator(.visible).preferredColorScheme(.dark)
            }
    }
}

struct WorkspaceBrowser: UIViewRepresentable {
    let space: SiteWorkspace
    @Binding var error: String?
    @Binding var progress: Double
    @Binding var talkLocation: TalkRoomLocation
    var openRoomOverlay: (String) -> Void = { _ in }
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
    func makeCoordinator() -> Coordinator { Coordinator(error: $error, progress: $progress, origin: target, talkLocation: $talkLocation, openRoomOverlay: openRoomOverlay) }
    // Room controls own navigation here; the site's logo/search header is redundant.
    // Scope to room routes so the normal header returns after leaving the room.
    static let roomChromeScript = """
        (() => {
            const update = () => document.documentElement?.toggleAttribute('data-aifect-native-room', /^#(?:live|voice)[/][^/?]+/.test(location.hash));
            const install = () => {
                update();
                if (!document.head) return false;
                const style = document.createElement('style');
                style.id = 'aifect-native-room-chrome';
                style.textContent = `
                    html[data-aifect-native-room] :is(.topbar, #topbar) { display:none!important }
                    html[data-aifect-native-room] .page-wrap,
                    html[data-aifect-native-room] #main { padding-top:0!important }
                `;
                document.head.append(style);
                return true;
            };
            if (!install()) {
                const observer = new MutationObserver(() => { if (install()) observer.disconnect(); });
                observer.observe(document, {childList:true, subtree:true});
            }
            window.addEventListener('hashchange', update);
        })();
        """
    static let talkRoomScript = """
        window.AifectNativeTalkAudio = true;
        function observeTalkRoom() {
            const main = document.querySelector('#main');
            if (!main) return;
            let visited = false;
            const update = () => {
                const inside = /^#voice[/][^/?]+/.test(location.hash) && main.hasAttribute('data-room-entered');
                const left = visited && location.hash === '#voice';
                if (inside) visited = true;
                if (left) visited = false;
                window.webkit.messageHandlers.talkRoomState.postMessage(inside ? 'inside' : left ? 'left' : 'outside');
            };
            new MutationObserver(update).observe(main, {attributes:true, attributeFilter:['data-room-entered']});
            window.addEventListener('hashchange', update);
            update();
        }
        document.addEventListener('DOMContentLoaded', observeTalkRoom, {once:true});
        """
    // Runs before the site's leave-room guard. Opening the sheet keeps this WKWebView
    // mounted, so the active room's microphone and listening connection remain intact.
    static let roomOverlayScript = """
        document.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0 || !/^#(?:live|voice)[/][^/?]+/.test(location.hash)) return;
            const link = event.target.closest?.('a[href]');
            const roomInbox = event.target.closest?.('[data-voice="inbox"]');
            // Current rooms own an inline inbox; let it stay above the room composer.
            if (roomInbox) return;
            const target = link ? new URL(link.href, location.href) : null;
            if (target && target.origin !== location.origin) return;
            const path = roomInbox ? 'dm' : (target?.hash || '').slice(1).split('?')[0];
            if (path !== 'notifications' && path !== 'dm' && !/^dm[/][^/]+$/.test(path)) return;
            event.preventDefault(); event.stopImmediatePropagation();
            window.webkit.messageHandlers.roomOverlay.postMessage(path);
        }, true);
        """
    // Older site shells call ready before WKWebView completes same-fragment
    // navigation. Retry that exact ready request only after its URL target is
    // active. The site's epoch, asset-error and timeout checks still own reveal.
    static let gameRenderCompatibilityScript = """
        (() => {
            const gate = window.AifectRender;
            if (!gate || gate.nativeTargetRetry || typeof gate.ready !== 'function' || typeof gate.begin !== 'function') return;
            const originalReady = gate.ready, originalBegin = gate.begin, originalFail = gate.fail;
            let generation = 0, timer = null, activeEpoch = null;
            const cancel = () => { ++generation; clearTimeout(timer); timer = null; };
            const route = () => location.hash.slice(1) || 'home';
            const loading = raw => document.documentElement.dataset.renderState === 'loading'
                && route() === raw && document.getElementById('main')?.dataset.route === raw;
            gate.begin = function(...args) { cancel(); activeEpoch = originalBegin.apply(this, args); return activeEpoch; };
            if (typeof originalFail === 'function') gate.fail = function(...args) {
                if (activeEpoch !== null && args[0] !== undefined && args[0] !== activeEpoch) return originalFail.apply(this, args);
                cancel(); return originalFail.apply(this, args);
            };
            gate.ready = function(...args) {
                if (activeEpoch !== null && args[0] !== activeEpoch) return originalReady.apply(this, args);
                cancel();
                const result = originalReady.apply(this, args), raw = route(), current = generation, receiver = this;
                if (!loading(raw)) return result;
                const resume = () => {
                    timer = null;
                    if (current !== generation || window.AifectRender !== gate || !loading(raw)) return;
                    const targets = document.querySelectorAll('[data-render-target],[data-play-route-target],[data-community-route-target],[data-mypage-route-target],[data-chart-route-target],[data-dm-route-target]');
                    if ([...targets].some(target => target.matches(':target'))) {
                        originalReady.apply(receiver, args);
                        return;
                    }
                    timer = setTimeout(resume, 16);
                };
                timer = setTimeout(resume, 16);
                return result;
            };
            gate.nativeTargetRetry = true;
            window.addEventListener('pagehide', cancel, {once: true});
        })();
        """
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
        .jump-club .arc-game-choice { display:none!important }
        .jump-club .jump-lobby { grid-template-areas:"hero board" "brief board" "extras extras" "personal personal"!important }
        @container jump-page (max-width:820px) {
            .jump-club .jump-lobby { grid-template-areas:"hero" "brief" "board" "extras" "personal"!important }
        }
        .jump-club dialog.arc-store-dialog { width:min(640px,calc(100vw - 24px))!important; max-width:calc(100vw - 24px)!important; max-height:calc(100dvh - 24px)!important; padding:16px!important; overflow:auto; overscroll-behavior:contain }
        .jump-club .arc-store-dialog>header h2 { padding-inline-end:0!important }
        .jump-club .arc-store-dialog [data-shop-close] { min-height:44px!important; flex-shrink:0 }
        .jump-club .arc-look-shelves { grid-template-columns:minmax(0,1fr); gap:12px; margin-top:12px }
        .jump-club .arc-outfit-group h3 { margin-bottom:6px }
        .jump-club .arc-outfit-group>div { grid-auto-flow:row; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px }
        /* Compact-popup's generic button rule otherwise forces a 44px horizontal
           flex row, squeezing the outfit name and price beside the artwork. */
        .jump-club .arc-store-dialog button.arc-look { display:grid!important; grid-template-columns:minmax(0,1fr); grid-template-rows:auto auto auto; justify-items:center; align-content:start; gap:4px; width:100%!important; height:auto!important; min-height:44px!important; padding:6px 4px 8px!important; white-space:normal; overflow-wrap:normal!important; box-sizing:border-box }
        .jump-club .arc-store-dialog .arc-look img { display:block; width:100%; height:auto; aspect-ratio:1; object-fit:contain; object-position:center; min-width:0 }
        .jump-club .arc-store-dialog .arc-look :is(b,span) { display:block; width:100%; min-width:0; padding:0; font-size:13px; line-height:1.4; text-align:center; word-break:keep-all; overflow-wrap:normal }
        .jump-club .arc-store-dialog .arc-look span { white-space:nowrap; font-variant-numeric:tabular-nums }
        .jump-club .arc-store-dialog .arc-fitting { gap:12px; padding:8px }
        .jump-club .arc-store-dialog .arc-run-model { width:min(96px,27vw); flex-shrink:0 }
        .jump-club .arc-store-dialog .arc-look-actions { margin-top:12px }
        @media(max-width:600px) { .cgl-layout { grid-template-columns:minmax(0,1fr)!important } .cgl-start { min-height:48px } }
        """
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        if space.area == "voice" {
            // A native room-entry tap happens outside WebKit. Start room audio when the host plays.
            config.mediaTypesRequiringUserActionForPlayback = [.video]
            config.userContentController.add(context.coordinator, name: "talkRoomState")
            config.userContentController.addUserScript(WKUserScript(source: Self.talkRoomScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController.add(context.coordinator, name: "roomOverlay")
        config.userContentController.addUserScript(WKUserScript(source: Self.roomOverlayScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if space.area == "live" || space.area == "voice" {
            config.userContentController.addUserScript(WKUserScript(source: Self.roomChromeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.applicationNameForUserAgent = "AIFECT-Mobile/" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
        if space.area.hasPrefix("game/") {
            config.userContentController.addUserScript(WKUserScript(source: Self.gameRenderCompatibilityScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
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
        if space.area == "live" || space.area == "voice" {
            context.coordinator.observeRoomCalls(in: view)
        }
        if ["live", "voice", "product-review"].contains(space.area) {
            context.coordinator.observeRoomVisibility(in: view)
        }
        view.isOpaque = false
        view.backgroundColor = UIColor(Brand.background)
        view.scrollView.backgroundColor = UIColor(Brand.background)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.accessibilityIdentifier = "crew-game-browser"
        context.coordinator.observation = view.observe(\.estimatedProgress, options: [.new]) { [weak coordinator = context.coordinator] view, _ in
            Task { @MainActor in coordinator?.progress = view.estimatedProgress }
        }
        let target = target
        if space.area == "product-review" {
            view.load(URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData))
            return view
        }
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
        coordinator.stopObservingRoomCalls()
        view.configuration.userContentController.removeScriptMessageHandler(forName: "talkRoomState")
        view.configuration.userContentController.removeScriptMessageHandler(forName: "roomOverlay")
        view.navigationDelegate = nil; view.uiDelegate = nil
        view.stopLoading()
    }
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, CXCallObserverDelegate {
        @Binding var error: String?
        @Binding var progress: Double
        @Binding var talkLocation: TalkRoomLocation
        let origin: URL
        var start: Task<Void, Never>?
        var observation: NSKeyValueObservation?
        private var callObserver: CXCallObserver?
        private weak var roomWebView: WKWebView?
        private var callActive = false
        let openRoomOverlay: (String) -> Void
        init(error: Binding<String?>, progress: Binding<Double>, origin: URL, talkLocation: Binding<TalkRoomLocation>, openRoomOverlay: @escaping (String) -> Void) { _error = error; _progress = progress; _talkLocation = talkLocation; self.origin = origin; self.openRoomOverlay = openRoomOverlay }
        func observeRoomCalls(in view: WKWebView) {
            roomWebView = view
            let observer = CXCallObserver()
            callObserver = observer
            observer.setDelegate(self, queue: .main)
            callActive = observer.calls.contains { !$0.hasEnded }
            // Preserve a call already ringing while the room document loads.
            view.configuration.userContentController.addUserScript(WKUserScript(
                source: "window.AifectNativeCall = {active: \(callActive)};",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        func stopObservingRoomCalls() {
            NotificationCenter.default.removeObserver(self, name: UIApplication.willResignActiveNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: UIApplication.didBecomeActiveNotification, object: nil)
            callObserver?.setDelegate(nil, queue: nil)
            callObserver = nil
            roomWebView = nil
        }
        func observeRoomVisibility(in view: WKWebView) {
            roomWebView = view
            NotificationCenter.default.addObserver(self, selector: #selector(roomVisibilityChanged(_:)), name: UIApplication.willResignActiveNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(roomVisibilityChanged(_:)), name: UIApplication.didBecomeActiveNotification, object: nil)
        }
        @objc private func roomVisibilityChanged(_ notice: Notification) {
            updateRoomVisibility(inactive: notice.name == UIApplication.willResignActiveNotification)
        }
        private func updateRoomVisibility(inactive: Bool) {
            guard let view = roomWebView, let url = view.url, permits(url) else { return }
            view.evaluateJavaScript("""
                document.documentElement.toggleAttribute('data-aifect-room-inactive', \(inactive));
                window.dispatchEvent(new Event('aifect:room-visibility'));
                """, completionHandler: nil)
        }
        func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
            let active = callObserver.calls.contains { !$0.hasEnded }
            guard active != callActive else { return }
            callActive = active
            updateRoomCallState()
        }
        private func updateRoomCallState() {
            guard let view = roomWebView, let url = view.url, permits(url) else { return }
            // Only a boolean crosses the bridge; no phone number or call identity.
            view.evaluateJavaScript("""
                window.AifectNativeCall = {active: \(callActive)};
                window.dispatchEvent(new CustomEvent('aifect:native-call', {detail: window.AifectNativeCall}));
                """, completionHandler: nil)
            if callActive { view.setMicrophoneCaptureState(.none, completionHandler: nil) }
            // Releasing playback after the call never grants capture or restarts a turn.
            view.setAllMediaPlaybackSuspended(callActive, completionHandler: nil)
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let url = message.frameInfo.request.url, permits(url) else { return }
            if message.name == "talkRoomState", let value = message.body as? String, let location = TalkRoomLocation(rawValue: value) {
                talkLocation = location
                return
            }
            guard message.name == "roomOverlay", let path = message.body as? String,
                  path == "notifications" || path == "dm" || (path.hasPrefix("dm/") && SiteWorkspace.validKey(String(path.dropFirst(3)))) else { return }
            openRoomOverlay(path)
        }
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
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            progress = 1
            if callObserver != nil { updateRoomCallState() }
            updateRoomVisibility(inactive: UIApplication.shared.applicationState != .active)
        }
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

private struct WorkListeningActionsKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var workListeningActions: Bool {
        get { self[WorkListeningActionsKey.self] }
        set { self[WorkListeningActionsKey.self] = newValue }
    }
}

struct SongQuickActionLabel: View {
    @Environment(\.workListeningActions) private var workStyle
    let title: String
    let icon: String
    var accent: Color = AifectDesign.secondaryText
    var body: some View {
        if workStyle {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 3) { Image(systemName: icon); Text(title) }.fixedSize()
                VStack(spacing: 2) { Image(systemName: icon); Text(title) }
            }.font(.caption).foregroundStyle(accent)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Brand.card, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(AifectDesign.stroke))
                .contentShape(Rectangle())
        } else {
            VStack(spacing: 7) {
            Image(systemName: icon).font(.system(size: 23)).foregroundStyle(accent)
            Text(title).font(.system(size: 11)).foregroundStyle(AifectDesign.secondaryText)
            }.frame(maxWidth: .infinity, minHeight: 60).contentShape(Rectangle())
        }
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
        ["팔로잉": "person.2", "인기": "trophy", "장르": "square.grid.2x2", "신규": "sparkles", "최신": "sparkles", "듀엣 참여": "person.2", "내 초안": "pencil"][name]
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


/// End text entry without consuming the tapped control or changing navigation.
struct OutsideInputDismissal: UIViewRepresentable {
    func makeUIView(context: Context) -> Surface { Surface() }
    func updateUIView(_ view: Surface, context: Context) { }
    static func dismantleUIView(_ view: Surface, coordinator: ()) { view.detach() }

    final class Surface: UIView, UIGestureRecognizerDelegate {
        private weak var attachedWindow: UIWindow?
        private lazy var tap: UITapGestureRecognizer = {
            let gesture = UITapGestureRecognizer(target: self, action: #selector(finishInput))
            gesture.cancelsTouchesInView = false
            gesture.delegate = self
            return gesture
        }()
        override func didMoveToWindow() {
            super.didMoveToWindow()
            detach()
            attachedWindow = window
            window?.addGestureRecognizer(tap)
        }
        func detach() { attachedWindow?.removeGestureRecognizer(tap); attachedWindow = nil }
        @objc private func finishInput() { attachedWindow?.endEditing(true) }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var target = touch.view
            while let view = target {
                // Keep text selection intact. Navigation/keyboard controls handle their own
                // action before focus changes, so Back only ends an active edit.
                if view is UITextField || view is UITextView || view is WKWebView || view is UIControl || view is UINavigationBar || view is UIToolbar { return false }
                target = view.superview
            }
            return true
        }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { true }
    }
}
