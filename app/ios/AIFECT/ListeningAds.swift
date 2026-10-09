import SwiftUI
import GoogleMobileAds
import UserMessagingPlatform

struct SongAdCadence {
    private(set) var completed = 0
    var due: Bool { completed >= 5 }
    mutating func finish(heard: Double, duration: Double, preview: Bool) {
        if !preview && duration > 0 && heard >= duration * 0.6 { completed = min(5, completed + 1) }
    }
    mutating func shown() { completed = 0 }
}

@MainActor
final class ListeningAds: NSObject, ObservableObject, FullScreenContentDelegate {
    static let shared = ListeningAds()
    @Published var privacyRequired = false
    @Published var privacyError: String?
    var premium = false
    var studioOpen = false
    private var cadence = SongAdCadence()
    private var ad: InterstitialAd?
    private var loadedAt = Date.distantPast
    private var loading = false
    private var started = false
    private var consentStarted = false
    private var continuation: CheckedContinuation<Void, Never>?
    private var account: String?
    #if DEBUG
    @Published private(set) var diagnostic = "idle"
    @Published private(set) var impressions = 0
    @Published private(set) var dismissals = 0
    #endif
    func setAccount(_ id: String?, premium: Bool) {
        if id != account { cadence = SongAdCadence(); account = id }
        self.premium = premium
        if premium { ad = nil }
        else if started { Task { await load() } }
    }
    func consent() async {
        guard !consentStarted else { return }; consentStarted = true
        #if DEBUG
        diagnostic = "consent"
        #endif
        do {
            try await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
            try await ConsentForm.loadAndPresentIfRequired(from: nil)
        } catch {
            privacyError = "광고 동의 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
            #if DEBUG
            diagnostic = "consent-error: \(error.localizedDescription)"
            #endif
        }
        privacyRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
        guard ConsentInformation.shared.canRequestAds, !started else { return }
        started = true
        await MobileAds.shared.start()
        await load()
    }
    func privacyOptions() async {
        do { try await ConsentForm.presentPrivacyOptionsForm(from: nil); privacyError = nil }
        catch { privacyError = error.localizedDescription }
        ad = nil
        await load()
    }
    private func load() async {
        guard started, ConsentInformation.shared.canRequestAds, !premium, !loading, ad == nil else { return }
        loading = true; defer { loading = false }
        #if DEBUG
        diagnostic = "loading"
        #endif
        #if DEBUG || targetEnvironment(simulator)
        let unit = "ca-app-pub-3940256099942544/4411468910"
        #else
        let unit = "ca-app-pub-5910265378731607/5388337200"
        #endif
        do {
            let loaded = try await InterstitialAd.load(with: unit, request: Request())
            guard !premium else { return }
            ad = loaded; ad?.fullScreenContentDelegate = self; loadedAt = Date()
            #if DEBUG
            diagnostic = "ready"
            #endif
        } catch {
            ad = nil
            #if DEBUG
            diagnostic = "load-error: \(error.localizedDescription)"
            #endif
        }
    }
    func trackFinished(heard: Double, duration: Double, preview: Bool) {
        guard !premium else { return }
        cadence.finish(heard: heard, duration: duration, preview: preview)
    }
    func uploadCompleted(id: String) async {
        guard let account, !premium, !id.isEmpty else { return }
        let key = "aifect.upload-ad-attempts." + account
        var ids = UserDefaults.standard.stringArray(forKey: key) ?? []
        guard !ids.contains(id) else { return }
        ids.append(id); UserDefaults.standard.set(Array(ids.suffix(100)), forKey: key)
        await breakIfNeeded(coverCompleted: true)
    }
    func breakIfNeeded(coverCompleted: Bool = false) async {
        // Listening is reserved for an audio provider. Never substitute the
        // upload video placement at a song boundary while that provider is absent.
        guard coverCompleted, !premium, !studioOpen,
              UIApplication.shared.applicationState == .active, continuation == nil else { return }
        guard let ad, Date().timeIntervalSince(loadedAt) < 3500 else { self.ad = nil; Task { await load() }; return }
        guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else { return }
        var presenter = root
        while let presented = presenter.presentedViewController { presenter = presented }
        guard !presenter.isBeingDismissed else { return }
        do { try ad.canPresent(from: presenter) } catch { self.ad = nil; Task { await load() }; return }
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            ad.present(from: presenter)
        }
    }
    func adDidRecordImpression(_ ad: FullScreenPresentingAd) {
        #if DEBUG
        impressions += 1; diagnostic = "presented"
        #endif
    }
    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        #if DEBUG
        dismissals += 1; diagnostic = "dismissed"
        #endif
        complete()
    }
    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        #if DEBUG
        diagnostic = "present-error: \(error.localizedDescription)"
        #endif
        complete()
    }
    private func complete() {
        ad = nil; continuation?.resume(); continuation = nil
        Task { await load() }
    }
}
