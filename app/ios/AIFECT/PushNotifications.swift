import SwiftUI
import FirebaseCore
import FirebaseMessaging
import UserNotifications

struct PushDestination: Identifiable {
    let kind: String
    let target: String
    let recipient: String
    var id: String { "\(recipient):\(kind):\(target)" }
    init?(_ data: [AnyHashable: Any]) {
        guard let kind = data["kind"] as? String, ["dm", "comment", "gift", "crew", "person_gift"].contains(kind),
              let target = data["target"] as? String, !target.isEmpty,
              let recipient = data["recipient"] as? String, !recipient.isEmpty else { return nil }
        self.kind = kind; self.target = target; self.recipient = recipient
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
    @State private var preferences = ["dm": true, "comment": true, "gift": true]
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
                ForEach(["dm", "comment", "gift"], id: \.self) { key in
                    Toggle(["dm": "메시지", "comment": "댓글", "gift": "선물"][key]!, isOn: Binding(get: { preferences[key] ?? true }, set: { value in Task { await update(key, value) } })).disabled(busy)
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
    @State private var song: Song?
    @State private var error: String?
    var body: some View {
        Group {
            if route.kind == "dm" { NavigationStack { ChatPage(path: "/api/dm/\(Endpoint.pathID(route.target))", title: "메시지", crew: false) } }
            else if route.kind == "crew" { NavigationStack { ChatPage(path: "/api/crews/\(Endpoint.pathID(route.target))/messages", title: "크루 채팅", crew: true) } }
            else if route.kind == "person_gift" { NavigationStack { ProfilePage(id: route.target) } }
            else if let song { TrackDetailView(song: song) }
            else if let error { ContentUnavailableView(error, systemImage: "bell.slash") }
            else { ProgressView("음악 불러오는 중") }
        }.task {
            guard ["comment", "gift"].contains(route.kind) else { return }
            do { song = Song(try await API.shared.call("/api/tracks/\(Endpoint.pathID(route.target))").object("track")) }
            catch { self.error = error.localizedDescription }
        }
    }
}
