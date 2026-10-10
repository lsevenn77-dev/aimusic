import SwiftUI
import CryptoKit

extension Dictionary where Key == String, Value == Any {
    func displayName(fallback: String = "프로필") -> String {
        string("display_name", fallback: string("name", fallback: fallback))
    }
    func int(_ key: String) -> Int { (self[key] as? NSNumber)?.intValue ?? 0 }
    func flag(_ key: String) -> Bool { (self[key] as? NSNumber)?.boolValue ?? false }
    func object(_ key: String) -> [String: Any] { self[key] as? [String: Any] ?? [:] }
}

struct GiftRecipient: Equatable {
    let id: String
    let name: String
    var path: String { "/api/producers/\(Endpoint.pathID(id))/gifts" }
}
struct GiftRequest: Codable {
    let owner: String
    let path: String
    let giftType: String
    let id: String
    init(owner: String, path: String, giftType: String, id: String = UUID().uuidString) { self.owner = owner; self.path = path; self.giftType = giftType; self.id = id }
    var body: [String: Any] { ["gift_type": giftType, "request_id": id] }
}

@MainActor final class GiftWallet: ObservableObject {
    @Published private(set) var data: [String: Any] = [:]
    @Published private(set) var busy = false
    @Published private(set) var remaining: [GiftRequest] = []
    @Published private(set) var sentCount = 0
    @Published var error: String?
    @Published var feedback: String?
    private let api: API
    private var scope = ""
    private var revision = 0
    private var loadGeneration = 0
    private var attempted = false
    private var receiptURL: URL {
        let key = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("gift-\(key).json")
    }
    private func persist() throws {
        if remaining.isEmpty { try? FileManager.default.removeItem(at: receiptURL); return }
        try FileManager.default.createDirectory(at: receiptURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(remaining).write(to: receiptURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    init(api: API? = nil) { self.api = api ?? .shared }
    var stars: Int { data.object("free").int("balance") }
    func bind(owner: String?, path: String?) {
        let next = (owner ?? "guest") + (path ?? "")
        guard next != scope else { return }
        scope = next; revision += 1; data = [:]; remaining = []; sentCount = 0; attempted = false; error = nil; feedback = nil
        if let owner, let path, let bytes = try? Data(contentsOf: receiptURL), let saved = try? JSONDecoder().decode([GiftRequest].self, from: bytes), saved.allSatisfy({ $0.owner == owner && $0.path == path }) { remaining = saved; attempted = true }
    }
    func load() async {
        let version = revision
        loadGeneration += 1; let loadID = loadGeneration
        do { let result = try await api.call("/api/gold"); if version == revision && loadID == loadGeneration && !busy { data = result; if remaining.isEmpty { error = nil } } }
        catch { if version == revision { self.error = error.localizedDescription } }
    }
    func prepare(owner: String, path: String, gift: String, quantity: Int) {
        guard !busy, remaining.isEmpty else { return }
        let count = gift == "star" ? min(20, min(stars, max(1, quantity))) : 1
        guard count > 0 else { return }
        remaining = (0..<count).map { _ in GiftRequest(owner: owner, path: path, giftType: gift) }
        sentCount = 0; attempted = false; feedback = nil; error = nil
    }
    func cancelSelection() { guard !busy, !attempted else { return }; remaining = [] }
    func send(owner: String?, path: String?) async {
        guard !busy, let first = remaining.first, first.owner == owner, first.path == path else { return }
        busy = true; attempted = true; revision += 1; let version = revision
        defer { busy = false }
        do {
            try persist()
            while let request = remaining.first {
                let result = try await api.call(request.path, method: "POST", body: request.body)
                guard version == revision else { return }
                // Each acknowledged request is removed. Ambiguous failures retain its ID;
                // retry never repeats already acknowledged gifts, including a partial batch.
                if let balance = result["free_balance"] { var free = data.object("free"); free["balance"] = balance; data["free"] = free }
                if let balance = result["balance"] { data["balance"] = balance }
                remaining.removeFirst(); sentCount += 1; try persist()
                feedback = "\(sentCount)개 전송 완료"; error = nil
            }
        } catch {
            if version == revision {
                self.error = error.localizedDescription
                if let status = (error as? APIError)?.status, (400..<500).contains(status), status != 408, status != 429 {
                    remaining = []; try? persist(); feedback = "\(sentCount)개 전송 완료 · 추가 전송은 중단됐어요"
                } else { feedback = "\(sentCount)개 완료 · 남은 \(remaining.count)개 재시도 가능" }
            }
        }
    }
}

/// Compact balance overview. Unknown or failed balances are never shown as zero.
struct MyWalletSummary: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var wallet = GiftWallet()
    private var loaded: Bool { !wallet.data.isEmpty && wallet.error == nil }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                NavigationLink { PaymentStoreView() } label: {
                    balance("보유 골드", value: loaded ? "\(wallet.data.int("balance").formatted())개" : "—", icon: "g.circle.fill", color: .yellow, id: "my-gold-balance")
                }.buttonStyle(.plain)
                Divider().frame(height: 44)
                NavigationLink { RewardsView() } label: {
                    balance("응원별", value: loaded ? "\(wallet.stars.formatted())개" : "—", icon: "star.fill", color: Brand.pink, id: "my-star-balance")
                }.buttonStyle(.plain)
            }
            if wallet.error != nil {
                Button("잔액 다시 불러오기") { Task { await reload() } }.font(.caption).foregroundStyle(AifectDesign.muted)
            }
        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
            .task(id: "\(model.userID ?? "guest"):\(model.walletRevision):\(scenePhase == .active)") { if scenePhase == .active { await reload() } }
    }
    private func balance(_ title: String, value: String, icon: String, color: Color, id: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon).font(.system(size: 13)).foregroundStyle(color)
            Text(value).font(.system(size: 20, weight: .bold)).monospacedDigit().foregroundStyle(AifectDesign.text).accessibilityIdentifier(id)
        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
    private func reload() async {
        wallet.bind(owner: model.userID, path: nil)
        guard model.userID != nil else { return }
        await wallet.load()
    }
}

struct GiftSheetButton<LabelView: View>: View {
    @EnvironmentObject private var model: AppModel
    var song: Song? = nil
    var person: GiftRecipient? = nil
    @ViewBuilder let label: () -> LabelView
    @State private var presented = false
    var body: some View {
        Button { if model.requireLogin() { presented = true } } label: { label() }
            .sheet(isPresented: $presented) {
                NavigationStack { GiftWalletView(song: song, person: person, compact: true) }
                    .presentationDetents([.fraction(0.48)]).presentationDragIndicator(.visible)
            }
    }
}
struct GiftWalletView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var song: Song?
    var person: GiftRecipient?
    var compact = false
    private var recipientName: String? { person?.name ?? song?.title }
    private var giftPath: String? { person?.path ?? song.map { "/api/tracks/\(Endpoint.pathID($0.id))/gifts" } }
    @StateObject private var wallet = GiftWallet()
    @State private var quantity = 1
    @State private var selected: [String: Any]?
    @State private var confirm = false
    @State private var rewards = false
    @State private var store = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("\(wallet.stars)개", systemImage: "star.fill").foregroundStyle(Brand.pink)
                    Spacer()
                    Text("골드 \(wallet.data.int("balance"))")
                    Button("충전") { store = true }.font(.caption)
                }.font(.headline)
                HStack { Text("활동하고 무료 응원별 받기").font(.caption).foregroundStyle(.secondary); Spacer(); Button("무료 보상") { rewards = true }.font(.caption.bold()) }
                if recipientName != nil {
                    HStack {
                        Label("응원별", systemImage: "star.fill").foregroundStyle(Brand.pink)
                        Spacer()
                        Stepper("\(quantity)개", value: $quantity, in: 1...max(1, min(20, wallet.stars))).fixedSize().disabled(wallet.busy || !wallet.remaining.isEmpty || wallet.stars == 0)
                        Button(wallet.remaining.isEmpty ? "보내기" : "재시도") {
                            choose(["id": "star", "name": "응원별", "gold": 0])
                        }.buttonStyle(.borderedProminent).tint(Brand.pink).disabled(wallet.busy || (wallet.remaining.isEmpty && wallet.stars < 1))
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(wallet.data.objects("gifts"), id: \.selfID) { gift in
                                Button { choose(gift) } label: {
                                    VStack(spacing: 5) { Image(systemName: "gift.fill").font(.title2); Text(gift.string("name")).font(.caption); Text("\(gift.int("gold")) 골드").font(.caption2).foregroundStyle(.secondary) }
                                        .frame(width: 86, height: 82).background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
                                }.disabled(wallet.busy || !wallet.remaining.isEmpty || wallet.data.int("balance") < gift.int("gold"))
                            }
                        }
                    }
                }
                if wallet.busy { ProgressView("전송 중 · \(wallet.sentCount)개 완료") }
                if let feedback = wallet.feedback { Label(feedback, systemImage: wallet.error == nil ? "checkmark.circle" : "arrow.clockwise").font(.caption).foregroundStyle(Brand.aqua) }
                if let error = wallet.error { Text(error).font(.caption).foregroundStyle(.secondary) }
                if !compact {
                    Text("최근 보낸 선물").font(.headline)
                    ForEach(wallet.data.objects("sent"), id: \.selfID) { item in
                        Text("\(item.string("title")) · \(item.string("gift_name")) · \(item.int("gold")) 골드").font(.caption)
                    }
                    ForEach(wallet.data.objects("free_sent"), id: \.selfID) { item in Text("\(item.string("title")) · 응원별 1개").font(.caption) }
                }
            }.padding(18)
        }.background(Brand.background).navigationTitle(recipientName.map { "\($0)에게 선물" } ?? "골드 · 선물").navigationBarTitleDisplayMode(.inline)
        .task(id: (model.userID ?? "guest") + (giftPath ?? "")) { wallet.bind(owner: model.userID, path: giftPath); if model.userID != nil { await wallet.load() } }
        .task(id: model.walletRevision) { if model.userID != nil { await wallet.load() } }
        .onChange(of: wallet.stars) { _, stars in quantity = max(1, min(quantity, stars)) }
        .sheet(isPresented: $rewards, onDismiss: { Task { await wallet.load() } }) { NavigationStack { RewardsView().toolbar { Button("완료") { rewards = false } } } }
        .sheet(isPresented: $store, onDismiss: { Task { await wallet.load() } }) { NavigationStack { PaymentStoreView().toolbar { Button("완료") { store = false } } } }
        .interactiveDismissDisabled(wallet.busy)
        .toolbar { if compact { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() }.disabled(wallet.busy) } } }
        .confirmationDialog("\(selected?.string("name") ?? "선물") \(wallet.remaining.count)개를 보낼까요?", isPresented: $confirm, titleVisibility: .visible) {
            Button("선물 보내기") { Task { await wallet.send(owner: model.userID, path: giftPath); if wallet.remaining.isEmpty { model.walletRevision += 1 } } }
            Button("취소", role: .cancel) { wallet.cancelSelection() }
        } message: { Text("\(recipientName ?? "")에게 보냅니다. 전송한 선물은 취소할 수 없습니다.") }
    }
    private func choose(_ gift: [String: Any]) {
        guard let owner = model.userID, let path = giftPath else { _ = model.requireLogin(); return }
        selected = wallet.remaining.first.map { pending in wallet.data.objects("gifts").first(where: { $0.string("id") == pending.giftType }) ?? ["name": "응원별"] } ?? gift; wallet.prepare(owner: owner, path: path, gift: gift.string("id"), quantity: quantity); confirm = true
    }
}

struct RewardsView: View {
    @EnvironmentObject var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var busy = false
    private let labels = ["checkin": "오늘 출석", "cover": "커버곡 공개", "listen": "서로 다른 5곡 감상", "comment1": "첫 번째 감상 댓글", "comment2": "두 번째 감상 댓글", "comment3": "세 번째 감상 댓글"]
    var body: some View {
        List {
            Section { VStack(alignment: .leading, spacing: 8) { Label("오늘의 무료 보상", systemImage: "sparkles").font(.headline); LabeledContent("응원별", value: "\(data.int("balance"))개"); Text("매일 활동하고 응원별을 받아 좋아하는 음악에 선물하세요.").font(.caption) }.foregroundStyle(Brand.background).padding(12) }.listRowBackground(Brand.aqua)
            ForEach(data.objects("rewards"), id: \.rewardID) { reward in
                HStack {
                    VStack(alignment: .leading) { Text(labels[reward.string("kind")] ?? reward.string("kind")); Text("\(reward.int("progress"))/\(reward.int("target")) · 응원별 \(reward.int("amount"))개").font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    Button(reward.flag("claimed") ? "받음" : "받기") { Task { await claim(reward.string("kind")) } }.disabled(busy || reward.flag("claimed") || !reward.flag("eligible"))
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("오늘의 보상").task(id: model.userID) { await load() }.refreshable { await load() }
    }
    private func load() async { do { data = try await API.shared.call("/api/gifts/free"); error = nil } catch { self.error = error.localizedDescription } }
    private func claim(_ kind: String) async {
        busy = true; defer { busy = false }
        do { data = try await API.shared.call("/api/gifts/free/claim", method: "POST", body: ["kind": kind]); model.walletRevision += 1; error = nil } catch { self.error = error.localizedDescription }
    }
}
private extension Dictionary where Key == String, Value == Any { var rewardID: String { string("kind") } }

struct ProfileGiftRankingView: View {
    let profileID: String
    @State private var ranking: [[String: Any]] = []
    @State private var error: String?
    var body: some View {
        List {
            Section { Text("누적 선물 순위 · 1골드 또는 응원별 1개당 1점").font(.caption).foregroundStyle(.secondary) }
            ForEach(ranking.indices, id: \.self) { index in
                let entry = ranking[index]
                HStack {
                    Text("\(entry.int("rank"))").font(.title3.bold()).foregroundStyle(Brand.pink).frame(width: 34)
                    if !entry.string("profile_id").isEmpty {
                        NavigationLink { ProfilePage(id: entry.string("profile_id")) } label: { rankingRow(entry) }
                    } else { rankingRow(entry) }
                }
            }
            if ranking.isEmpty && error == nil { Text("아직 받은 선물이 없습니다.").foregroundStyle(.secondary) }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("선물 랭킹 TOP 50").task { await load() }.refreshable { await load() }
    }
    private func rankingRow(_ entry: [String: Any]) -> some View {
        HStack { ProfilePhoto(person: entry, size: 44); VStack(alignment: .leading) { Text(entry.displayName()); Text("\(entry.int("gold")) 골드 · 응원별 \(entry.int("stars"))개").font(.caption).foregroundStyle(.secondary) }; Spacer(); Text("\(entry.int("score"))점").font(.caption.bold()).foregroundStyle(Brand.aqua) }
    }
    private func load() async { do { let value = try await API.shared.call("/api/producers/\(Endpoint.pathID(profileID))/gifts"); guard !Task.isCancelled else { return }; ranking = Array(value.objects("ranking").prefix(50)); error = nil } catch { self.error = error.localizedDescription } }
}

struct TrackGiftRankingView: View {
    let song: Song
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    var body: some View {
        List {
            Section(song.title) {
                LabeledContent("조회수", value: "\(song.plays ?? 0)회")
                LabeledContent("받은 골드", value: "\(data.int("total_gold"))")
                LabeledContent("받은 응원별", value: "\(data.int("free_count"))개")
            }
            Section("응원한 사람 TOP 10") {
                ForEach(data.objects("ranking"), id: \.rankingID) { entry in
                    VStack(alignment: .leading, spacing: 5) { Text(entry.displayName()); Text("\(entry.int("gold")) 골드 · 응원별 \(entry.int("stars"))개").font(.caption).foregroundStyle(.secondary) }
                }
                if data.objects("ranking").isEmpty { Text("아직 받은 선물이 없어요").foregroundStyle(.secondary) }
            }
            if let error { Text(error).foregroundStyle(.secondary) }
        }.navigationTitle("받은 선물").task { do { data = try await API.shared.call("/api/tracks/\(Endpoint.pathID(song.id))/gifts") } catch { self.error = error.localizedDescription } }
    }
}
private extension Dictionary where Key == String, Value == Any { var rankingID: String { "\(int("rank")):\(string("profile_id"))" } }
