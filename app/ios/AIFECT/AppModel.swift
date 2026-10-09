import SwiftUI
import AuthenticationServices
import CryptoKit

@MainActor
final class AppModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var latest: [Song] = []
    @Published var chart: [Song] = []
    @Published var singable: [Song] = []
    @Published var feed: [Song] = []
    @Published var likes: [Song] = []
    @Published var history: [Song] = []
    @Published var playlists: [[String: Any]] = []
    @Published var user: [String: Any]?
    @Published private(set) var inboxUnread = 0
    @Published private(set) var inboxCrew: [String: Any]?
    private var inboxLoading = false
    @Published var loading = false
    @Published var error: String?
    @Published var notice: String?
    @Published var showLogin = false
    @Published var providers: [String] = []
    @Published var emailEnabled = false
    @Published var authBusy = false
    let player = MusicPlayer()
    private var authSession: ASWebAuthenticationSession?
    #if DEBUG
    @Published private(set) var macBrowserURL: URL?
    private var macBrowserContinuation: CheckedContinuation<URL, Error>?
    private var macBrowserTicket: String?
    private var macBrowserTimeout: Task<Void, Never>?

    func macBrowserCallback(_ url: URL) {
        guard ProcessInfo.processInfo.isiOSAppOnMac,
              Self.matchesLoginCallback(url, ticket: macBrowserTicket) else { return }
        finishMacBrowserLogin(.success(url))
    }
    static func matchesLoginCallback(_ url: URL, ticket: String?) -> Bool {
        guard let ticket, !ticket.isEmpty, url.scheme == "kr.co.aifect.app", url.host == "auth",
              url.user == nil, url.password == nil, url.port == nil,
              url.path.isEmpty, url.fragment == nil else { return false }
        let values = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.filter { $0.name == "ticket" }
        return values?.count == 1 && values?.first?.value == ticket
    }
    func cancelMacBrowserLogin() {
        finishMacBrowserLogin(.failure(CancellationError()))
    }
    private func finishMacBrowserLogin(_ result: Result<URL, Error>) {
        let continuation = macBrowserContinuation
        macBrowserContinuation = nil; macBrowserTicket = nil; macBrowserURL = nil
        macBrowserTimeout?.cancel(); macBrowserTimeout = nil
        continuation?.resume(with: result)
    }
    private func macBrowserLogin(url: URL, ticket: String) async throws -> URL {
        guard ProcessInfo.processInfo.isiOSAppOnMac, macBrowserContinuation == nil else { throw URLError(.cannotLoadFromNetwork) }
        return try await withCheckedThrowingContinuation { continuation in
            macBrowserContinuation = continuation; macBrowserTicket = ticket; macBrowserURL = url
            macBrowserTimeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(600)) } catch { return }
                self?.finishMacBrowserLogin(.failure(URLError(.timedOut)))
            }
            UIApplication.shared.open(url, options: [:]) { [weak self] opened in
                Task { @MainActor in
                    if !opened { self?.finishMacBrowserLogin(.failure(URLError(.cannotOpenFile))) }
                }
            }
        }
    }
    #endif
    private var accountRevision = 0
    var userID: String? { user?.string("id") }
    func requireLogin() -> Bool {
        if user == nil { showLogin = true; return false }; return true
    }
    func refresh() async {
        guard !loading else { return }
        loading = true; error = nil
        defer { loading = false }
        do { try await loadMe() } catch { handle(error) }
        // Each section can succeed independently when another endpoint is unavailable.
        for (path, apply) in [
            ("/api/catalog?section=tracks&limit=40", { self.latest = $0 }),
            ("/api/catalog?section=tracks&chart=top", { self.chart = $0 }),
            ("/api/karaoke", { self.singable = $0 }),
            ("/api/community", { self.feed = $0 })
        ] as [(String, ([Song]) -> Void)] {
            do { apply(try await API.shared.call(path).songs()) }
            catch is CancellationError { return }
            catch { self.error = error.localizedDescription }
        }
    }
    func loadMe() async throws {
        let version = accountRevision
        let data = try await API.shared.call("/api/me")
        guard version == accountRevision else { return }
        let next = data["user"] as? [String: Any]
        if next?.string("id") != userID { clearPrivate() }
        user = next
        ListeningAds.shared.setAccount(userID, premium: (user?.number("premium_until") ?? 0) > Date().timeIntervalSince1970)
        providers = data["providers"] as? [String] ?? []
        emailEnabled = data["emailEnabled"] as? Bool ?? false
    }
    func refreshInbox() async {
        guard userID != nil, !inboxLoading else { return }
        let version = accountRevision
        inboxLoading = true; defer { inboxLoading = false }
        do {
            let data = try await API.shared.call("/api/dm/summary")
            guard version == accountRevision, !Task.isCancelled else { return }
            inboxUnread = data.int("unread")
            inboxCrew = data["crew"] as? [String: Any]
        } catch { /* The inbox screen exposes errors; background badge refresh stays quiet. */ }
    }
    func loadLibrary() async {
        guard user != nil else { return }
        let version = accountRevision
        do {
            let library = try await API.shared.call("/api/library")
            guard version == accountRevision else { return }
            likes = library.songs("likes"); playlists = library.objects("collections")
            let result = try await API.shared.call("/api/history")
            guard version == accountRevision else { return }
            history = result.songs()
        } catch { handle(error) }
    }
    func toggleLike(_ song: Song) async {
        guard requireLogin() else { return }
        do {
            _ = try await API.shared.call("/api/tracks/\(Endpoint.pathID(song.id))/like", method: likes.contains(where: { $0.id == song.id }) ? "DELETE" : "PUT", body: [:])
            await loadLibrary()
        } catch { handle(error) }
    }
    func login(email: String, password: String, name: String, register: Bool) async throws {
        authBusy = true; defer { authBusy = false }
        _ = try await API.shared.call(register ? "/api/auth/register" : "/api/auth/login", method: "POST",
                                      body: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password, "name": name])
        try await loadMe(); await loadLibrary(); showLogin = false
    }
    func logout() async {
        authSession?.cancel(); accountRevision += 1
        await PushNotifications.shared.unregister()
        do { _ = try await API.shared.call("/api/auth/logout", method: "POST", body: [:]) }
        catch { notice = "기기에서 로그아웃했습니다. 서버 연결은 확인하지 못했습니다." }
        API.shared.clearSession(); clearPrivate(); user = nil
        ListeningAds.shared.setAccount(nil, premium: false)
    }
    func deleteAccount() async throws {
        _ = try await API.shared.call("/api/account/delete", method: "POST", body: ["confirmation": "DELETE"])
        if let userID { ChatCache.removeAll(owner: userID) }
        authSession?.cancel(); API.shared.clearSession(); clearPrivate(); user = nil
        ListeningAds.shared.setAccount(nil, premium: false)
        notice = "계정을 삭제했습니다. 업로드 파일도 삭제 처리됩니다."
    }
    private func clearPrivate() {
        accountRevision += 1; inboxUnread = 0; inboxCrew = nil; likes = []; playlists = []; history = []; player.close()
    }
    func handle(_ error: Error) {
        if error is CancellationError { return }
        if (error as? APIError)?.status == 401 { API.shared.clearSession(); clearPrivate(); user = nil; showLogin = true }
        notice = error.localizedDescription
    }
    func browserLogin(useExternalBrowser: Bool = false) async throws {
        guard !authBusy else { return }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw APIError(status: 0, message: "로그인을 시작하지 못했습니다.") }
        let verifier = Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let challenge = SHA256.hash(data: Data(verifier.utf8)).map { String(format: "%02x", $0) }.joined()
        authBusy = true; defer { authBusy = false }
        let start = try await API.shared.call("/api/auth/mobile/start", method: "POST", body: ["challenge": challenge])
        guard let url = URL(string: start.string("url")), url.scheme == "https", url.host == "aifect.co.kr" else { throw URLError(.badURL) }
        let callback: URL
        #if DEBUG
        if useExternalBrowser && ProcessInfo.processInfo.isiOSAppOnMac {
            callback = try await macBrowserLogin(url: url, ticket: start.string("ticket"))
        } else {
            callback = try await systemBrowserLogin(url: url)
        }
        #else
        callback = try await systemBrowserLogin(url: url)
        #endif
        let ticket = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "ticket" })?.value
        guard callback.scheme == "kr.co.aifect.app", callback.host == "auth", ticket == start.string("ticket") else { throw APIError(status: 0, message: "로그인 응답을 확인할 수 없습니다.") }
        _ = try await API.shared.call("/api/auth/mobile/exchange", method: "POST", body: ["ticket": ticket!, "verifier": verifier])
        try await loadMe(); await loadLibrary(); showLogin = false
    }
    private func systemBrowserLogin(url: URL) async throws -> URL {
        defer { authSession = nil }
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "kr.co.aifect.app") { url, error in
                if let url { continuation.resume(returning: url) }
                else { continuation.resume(throwing: error ?? URLError(.cancelled)) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            authSession = session
            if !session.start() { continuation.resume(throwing: APIError(status: 0, message: "인증 화면을 열지 못했습니다.")) }
        }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
