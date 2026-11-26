import SwiftUI
import WebKit
import FirebaseCore
import FirebaseMessaging
import UserNotifications

struct PushDestination: Identifiable, Hashable {
    let kind: String
    let target: String
    let recipient: String
    let activity: String
    let notificationID: String
    var id: String { "\(recipient):\(kind):\(activity):\(target):\(notificationID)" }
    init?(_ data: [AnyHashable: Any]) {
        guard let kind = data["kind"] as? String, ["dm", "comment", "gift", "crew", "person_gift", "notifications"].contains(kind),
              let target = data["target"] as? String, !target.isEmpty,
              let recipient = data["recipient"] as? String, !recipient.isEmpty else { return nil }
        let activity = data["activity"] as? String ?? ""
        let notificationID = data["notification_id"] as? String ?? ""
        guard target.range(of: "^[A-Za-z0-9-]{1,80}$", options: .regularExpression) != nil,
              kind != "notifications" || NotificationContract.activities.contains(activity),
              notificationID.isEmpty || NotificationContract.validID(notificationID) else { return nil }
        self.kind = kind; self.target = target; self.recipient = recipient
        self.activity = activity; self.notificationID = notificationID
    }
}

@MainActor
final class PushNotifications: NSObject, ObservableObject, MessagingDelegate, UNUserNotificationCenterDelegate {
    static let shared = PushNotifications()
    @Published var destination: PushDestination?
    @Published var message: String?
    @Published var authorized = false
    private(set) var accountID: String?
    private var token: String?
    private var pending: PushDestination?
    var configured: Bool { FirebaseApp.app() != nil }
    func configure() {
        UNUserNotificationCenter.current().delegate = self
        guard Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil else { return }
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
    }
    func bind(_ id: String?) async {
        if id != accountID { destination = nil; UNUserNotificationCenter.current().removeAllDeliveredNotifications() }
        accountID = id
        if let pending, id == pending.recipient { destination = pending; self.pending = nil }
        else if id != nil { pending = nil }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        guard id != nil, configured, authorized else { return }
        Messaging.messaging().isAutoInitEnabled = true
        UIApplication.shared.registerForRemoteNotifications()
        if let token { await register(token) }
    }
    func enable() async {
        guard configured else { message = "알림 서비스 설정을 확인해주세요."; return }
        do {
            authorized = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
            await bind(accountID)
            if !authorized { message = "iPhone 설정에서 AIFECT 알림을 허용해주세요." }
        } catch { message = error.localizedDescription }
    }
    func unregister() async {
        if let token, accountID != nil { _ = try? await API.shared.call("/api/push/device", method: "DELETE", body: ["token": token]) }
        accountID = nil; destination = nil; pending = nil
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        if configured { Messaging.messaging().isAutoInitEnabled = false }
    }
    func register(_ token: String) async {
        self.token = token
        guard let owner = accountID, authorized else { return }
        do {
            _ = try await API.shared.call("/api/push/device", method: "PUT", body: ["token": token, "platform": "ios", "account_id": owner])
            guard accountID == owner else { return }; message = nil
        } catch { if accountID == owner { message = error.localizedDescription } }
    }
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { @MainActor in await register(fcmToken) }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let route = PushDestination(notification.request.content.userInfo)
        Task { @MainActor in completionHandler(route?.recipient == accountID && accountID != nil ? [.banner, .sound] : []) }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let route = PushDestination(response.notification.request.content.userInfo)
        Task { @MainActor in
            if let route { if route.recipient == accountID { destination = route } else if accountID == nil { pending = route } }
            completionHandler()
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        PushNotifications.shared.configure(); return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else { return }
        Messaging.messaging().apnsToken = deviceToken
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushNotifications.shared.message = "알림 기기 등록에 실패했습니다. 다시 시도해주세요."
    }
}

struct PushSettingsView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject private var push = PushNotifications.shared
    @State private var preferences = Dictionary(uniqueKeysWithValues: NotificationContract.preferences.map { ($0.0, true) })
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        Form {
            Section {
                Text(push.authorized ? "iPhone 알림이 허용되어 있습니다." : "새 메시지 · 댓글 · 선물 알림을 받을 수 있습니다.")
                Button("알림 허용 · 다시 연결") { Task { await push.enable() } }
                Link("iPhone 알림 설정", destination: URL(string: UIApplication.openSettingsURLString)!)
            }
            Section("받을 알림") {
                ForEach(NotificationContract.preferences.map { $0.0 }, id: \.self) { key in
                    Toggle(NotificationContract.preferences.first { $0.0 == key }!.1, isOn: Binding(get: { preferences[key] ?? true }, set: { value in Task { await update(key, value) } })).disabled(busy)
                }
            }
            if let message = error ?? push.message { Text(message).foregroundStyle(.secondary) }
        }.navigationTitle("알림 설정").task {
            do {
                let data = try await API.shared.call("/api/push/preferences")
                for key in preferences.keys { preferences[key] = (data[key] as? NSNumber)?.boolValue ?? true }
            } catch { self.error = error.localizedDescription }
        }
    }
    private func update(_ key: String, _ value: Bool) async {
        guard let owner = model.userID else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await API.shared.call("/api/push/preferences", method: "PUT", body: [key: value, "account_id": owner])
            if owner == model.userID { preferences[key] = value; error = nil }
        } catch { self.error = error.localizedDescription }
    }
}

struct PushDestinationView: View {
    let route: PushDestination
    @EnvironmentObject private var model: AppModel
    @State private var song: Song?
    @State private var web: NotificationWebDestination?
    @State private var error: String?
    var body: some View {
        Group {
            if model.userID != route.recipient { ContentUnavailableView("현재 계정으로 열 수 없는 알림이에요.", systemImage: "bell.slash") }
            else if let web { NotificationWebPage(destination: web) }
            else if route.kind == "notifications" { if let error { ContentUnavailableView(error, systemImage: "bell.slash") } else { ProgressView("알림 확인 중") } }
            else if route.kind == "dm" { ChatPage(path: "/api/dm/\(Endpoint.pathID(route.target))", title: "메시지", crew: false) }
            else if route.kind == "crew" { ChatPage(path: "/api/crews/\(Endpoint.pathID(route.target))/messages", title: "크루 채팅", crew: true) }
            else if route.kind == "person_gift" { ProfilePage(id: route.target) }
            else if let song { TrackDetailView(song: song) }
            else if let error { ContentUnavailableView(error, systemImage: "bell.slash") }
            else { ProgressView("음악 불러오는 중") }
        }.task(id: route.id + (model.userID ?? "guest")) {
            guard model.userID == route.recipient else { return }
            do {
                if route.kind == "notifications" {
                    var href = route.activity == "artist_digest" ? "#notifications?filter=artists" : "#notifications"
                    if !route.notificationID.isEmpty {
                        let result = try await API.shared.call("/api/notifications/\(Endpoint.pathID(route.notificationID))/open", method: "POST", body: [:])
                        href = result.int("available") == 1 ? result.string("href") : "#notifications?unavailable=1"
                    }
                    guard model.userID == route.recipient, !Task.isCancelled else { return }
                    guard let safe = NotificationContract.safeRoute(href) else { self.error = "알림 대상을 열 수 없어요."; return }
                    web = NotificationWebDestination(recipient: route.recipient, href: safe)
                } else if ["comment", "gift"].contains(route.kind) {
                    let value = try await API.shared.call("/api/tracks/\(Endpoint.pathID(route.target))")
                    guard model.userID == route.recipient, !Task.isCancelled else { return };song = Song(value.object("track"))
                }
            } catch { if model.userID == route.recipient { self.error = "알림 대상을 열 수 없어요. 알림함에서 다시 확인해주세요." } }
        }
    }
}

enum NotificationContract {
    static let activities: Set<String> = ["fan_comment", "crew_invite", "crew_approved", "crew_request", "dubbing_complete", "dubbing_participation", "work_status", "artist_digest"]
    static let preferences = [("dm", "메시지 · 기존 크루 메시지"), ("comment", "내 작품 댓글"), ("fan_comment", "팬라운지 댓글·답글"), ("participation", "작품 참여 공개·완성"), ("artist_follower", "새 팔로워 · 하루 1회"), ("artist_release", "아티스트 신곡 · 하루 1회"), ("crew_important", "크루 초대·승인·참여 요청"), ("gift", "선물"), ("work_status", "작품 상태·중요 안내")]
    static func validID(_ value: String) -> Bool { value.range(of: "^[A-Za-z0-9:_-]{1,200}$", options: .regularExpression) != nil }
    static func safeRoute(_ value: String) -> String? {
        guard value.count <= 1000, !value.unicodeScalars.contains(where: { $0.value < 32 }), !value.contains("\\"),
              value.range(of: "^#(?:notifications|studio|(?:song|artist|crew|dubbing|producer)/[A-Za-z0-9%_-]+)(?:\\?[^#]*)?$", options: .regularExpression) != nil else { return nil }; return value
    }
    static func safeWebURL(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == "aifect.co.kr" && url.port == nil && url.user == nil && url.password == nil && (url.path == "/" || url.path.isEmpty) && (url.fragment == nil || safeRoute("#" + (url.fragment ?? "")) != nil)
    }
}
struct NotificationWebDestination: Identifiable, Hashable {
    let recipient: String
    let href: String
    var id: String { recipient + ":" + href }
}
struct NotificationWebPage: View {
    let destination: NotificationWebDestination
    @EnvironmentObject private var model: AppModel
    var body: some View {
        Group {
            if model.userID == destination.recipient, !API.shared.cookie.isEmpty, NotificationContract.safeRoute(destination.href) != nil {
                NotificationWebContent(destination: destination, cookie: API.shared.cookie, currentAccount: { model.userID })
            } else { ContentUnavailableView("현재 계정으로 열 수 없는 알림이에요.", systemImage: "bell.slash") }
        }.navigationTitle("알림 상세").id(destination.id + (model.userID ?? "guest"))
    }
}
private struct NotificationWebContent: UIViewRepresentable {
    let destination: NotificationWebDestination
    let cookie: String
    let currentAccount: () -> String?
    func makeCoordinator() -> Coordinator { Coordinator(owner: destination.recipient, currentAccount: currentAccount) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration();config.websiteDataStore = .nonPersistent()
        let web = WKWebView(frame: .zero, configuration: config);web.navigationDelegate = context.coordinator
        web.isOpaque = false;web.backgroundColor = UIColor(red: 12/255, green: 18/255, blue: 27/255, alpha: 1)
        guard currentAccount() == destination.recipient, !cookie.isEmpty,
              let session = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": cookie + "; Path=/; Secure; HttpOnly; SameSite=Strict"], for: Endpoint.origin).first,
              let url = URL(string: "https://aifect.co.kr/" + destination.href), NotificationContract.safeWebURL(url) else { return web }
        config.websiteDataStore.httpCookieStore.setCookie(session) {
            Task { @MainActor in if currentAccount() == destination.recipient { web.load(URLRequest(url: url)) } }
        }
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) { if currentAccount() != destination.recipient { web.stopLoading();web.loadHTMLString("", baseURL: nil) } }
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) { web.stopLoading();web.navigationDelegate = nil }
    final class Coordinator: NSObject, WKNavigationDelegate {
        let owner: String
        let currentAccount: () -> String?
        init(owner: String, currentAccount: @escaping () -> String?) { self.owner = owner;self.currentAccount = currentAccount }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard currentAccount() == owner, let url = navigationAction.request.url, NotificationContract.safeWebURL(url) else { decisionHandler(.cancel);return };decisionHandler(.allow)
        }
    }
}
