import SwiftUI

struct CurrencyAmount: View {
    let value: Int?
    let code: String
    var size: CGFloat = 17

    var body: some View {
        let name = code == "S" ? "실버" : "골드"
        let amount = value.map { $0.formatted(.number.locale(Locale(identifier: "ko_KR"))) } ?? "—"
        HStack(spacing: 5) {
            Image(code == "S" ? "silver-coin" : "gold-coin")
                .renderingMode(.original).resizable().scaledToFit().frame(width: size, height: size)
            Text(verbatim: amount).monospacedDigit()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: name + " " + amount))
    }
}

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
    @Environment(\.dynamicTypeSize) private var typeSize
    private func amount(_ source: [String: Any], unit: String) -> String {
        guard wallet.error == nil, let number = source["balance"] as? NSNumber else { return "—" }
        return number.doubleValue.formatted(.number.precision(.fractionLength(0...3))) + " " + unit
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("내 재화").font(.headline)
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
            layout {
                NavigationLink { PaymentStoreView() } label: {
                    walletBalance("골드", code: "G", value: wallet.data["balance"], id: "my-gold-balance")
                }
                NavigationLink { RewardsView() } label: {
                    walletBalance("실버", code: "S", value: wallet.data.object("free")["balance"], id: "my-star-balance")
                }
                NavigationLink { DiamondWalletView().streamingPage() } label: {
                    balance("다이아", value: amount(wallet.data.object("diamonds"), unit: "◇"), icon: "diamond", color: Brand.aqua, id: "my-diamond-balance")
                }.accessibilityIdentifier("my-diamonds")
            }.buttonStyle(.plain)
            if wallet.error != nil {
                Button("잔액 다시 불러오기") { Task { await reload() } }.font(.caption).foregroundStyle(AifectDesign.muted)
            }
        }
            .task(id: "\(model.userID ?? "guest"):\(model.walletRevision):\(scenePhase == .active)") { if scenePhase == .active { await reload() } }
    }
    private func walletBalance(_ title: String, code: String, value: Any?, id: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
            CurrencyAmount(value: wallet.error == nil ? (value as? NSNumber)?.intValue : nil, code: code, size: 20)
                .font(.system(size: 16, weight: .semibold)).accessibilityIdentifier(id)
            Text(code == "G" ? "충전" : "실버 받기").font(.system(size: 10)).foregroundStyle(AifectDesign.muted)
        }.frame(maxWidth: .infinity, minHeight: 64, alignment: .leading).padding(10)
            .background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
            .contentShape(Rectangle())
    }
    private func balance(_ title: String, value: String, icon: String, color: Color, id: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(title, systemImage: icon).font(.system(size: 12)).foregroundStyle(color)
            Text(value).font(.system(size: 16, weight: .semibold)).monospacedDigit().foregroundStyle(AifectDesign.text).accessibilityIdentifier(id)
            Text(title == "골드" ? "충전" : title == "실버" ? "실버 받기" : "정산 내역").font(.system(size: 10)).foregroundStyle(AifectDesign.muted)
        }.frame(maxWidth: .infinity, minHeight: 64, alignment: .leading).padding(10)
            .background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
            .contentShape(Rectangle())
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
            .navigationDestination(isPresented: $presented) { GiftWalletView(song: song, person: person, compact: true) }
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
                    CurrencyAmount(value: wallet.stars, code: "S", size: 20).foregroundStyle(Brand.pink)
                    Spacer()
                    CurrencyAmount(value: wallet.data.int("balance"), code: "G", size: 20)
                    Button("충전") { store = true }.font(.caption)
                }.font(.headline)
                HStack { Text("활동하고 무료 실버 받기").font(.caption).foregroundStyle(.secondary); Spacer(); Button("무료 보상") { rewards = true }.font(.caption.bold()) }
                if recipientName == nil { NavigationLink("다이아 · 내 정산") { DiamondWalletView() } }
                if recipientName != nil {
                    HStack {
                        Label("실버", systemImage: "star.fill").foregroundStyle(Brand.pink)
                        Spacer()
                        Stepper("\(quantity)개", value: $quantity, in: 1...max(1, min(20, wallet.stars))).fixedSize().disabled(wallet.busy || !wallet.remaining.isEmpty || wallet.stars == 0)
                        Button(wallet.remaining.isEmpty ? "보내기" : "재시도") {
                            choose(["id": "star", "name": "실버", "gold": 0])
                        }.buttonStyle(.borderedProminent).tint(Brand.pink).disabled(wallet.busy || (wallet.remaining.isEmpty && wallet.stars < 1))
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(wallet.data.objects("gifts"), id: \.selfID) { gift in
                                Button { choose(gift) } label: {
                                    VStack(spacing: 5) {
                                        RemoteArtwork(url: CatalogArtwork.giftURL(gift), catalog: true) { $0.resizable().scaledToFit() } placeholder: { Image(systemName: "gift.fill").font(.title2) }
                                            .frame(width: 32, height: 32).accessibilityHidden(true)
                                        Text(gift.string("name")).font(.caption)
                                        CurrencyAmount(value: gift.int("gold"), code: "G").font(.caption2).foregroundStyle(.secondary)
                                    }
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
                        Text("\(item.string("title")) · \(item.string("gift_name")) · \(item.int("gold").formatted()) g").font(.caption)
                    }
                    ForEach(wallet.data.objects("free_sent"), id: \.selfID) { item in Text("\(item.string("title")) · 1 s").font(.caption) }
                }
            }.padding(18)
        }.background(Brand.background).navigationTitle(recipientName.map { "\($0)에게 선물" } ?? "골드 · 선물").navigationBarTitleDisplayMode(.inline)
        .task(id: (model.userID ?? "guest") + (giftPath ?? "")) { wallet.bind(owner: model.userID, path: giftPath); if model.userID != nil { await wallet.load() } }
        .task(id: model.walletRevision) { if model.userID != nil { await wallet.load() } }
        .onChange(of: wallet.stars) { _, stars in quantity = max(1, min(quantity, stars)) }
        .navigationDestination(isPresented: $rewards) { RewardsView() }.onChange(of: rewards) { _, value in if !value { Task { await wallet.load() } } }
        .navigationDestination(isPresented: $store) { PaymentStoreView() }.onChange(of: store) { _, value in if !value { Task { await wallet.load() } } }
        .interactiveDismissDisabled(wallet.busy)
        .toolbar { if compact { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() }.disabled(wallet.busy) } } }
        .confirmationDialog("\(selected?.string("name") ?? "선물") \(wallet.remaining.count)개를 보낼까요?", isPresented: $confirm, titleVisibility: .visible) {
            Button("선물 보내기") { Task { await wallet.send(owner: model.userID, path: giftPath); if wallet.remaining.isEmpty { model.walletRevision += 1 } } }
            Button("취소", role: .cancel) { wallet.cancelSelection() }
        } message: { Text("\(recipientName ?? "")에게 보냅니다. 전송한 선물은 취소할 수 없습니다.") }
    }
    private func choose(_ gift: [String: Any]) {
        guard let owner = model.userID, let path = giftPath else { _ = model.requireLogin(); return }
        selected = wallet.remaining.first.map { pending in wallet.data.objects("gifts").first(where: { $0.string("id") == pending.giftType }) ?? ["name": "실버"] } ?? gift; wallet.prepare(owner: owner, path: path, gift: gift.string("id"), quantity: quantity); confirm = true
    }
}

struct RewardsView: View {
    @EnvironmentObject var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var busy = false
    private let labels = ["checkin": "오늘 출석", "cover": "커버곡 공개", "listen": "서로 다른 5곡 감상", "comment1": "첫 번째 감상 댓글", "comment2": "두 번째 감상 댓글", "comment3": "세 번째 감상 댓글"]
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Text("오늘의 실버").font(.system(size: 23, weight: .bold))
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("보유 실버").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                        CurrencyAmount(value: data.isEmpty ? nil : data.int("balance"), code: "S", size: 24).font(.system(size: 23, weight: .bold)).foregroundStyle(Brand.aqua)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Text("하루 최대\n10 s").font(.system(size: 12)).foregroundStyle(Brand.aqua)
                }.padding(16).background(Brand.aqua.opacity(0.08), in: RoundedRectangle(cornerRadius: 16)).padding(.top, 14).padding(.bottom, 4)
                if data.isEmpty && error == nil { ProgressView().frame(maxWidth: .infinity) }
                if let error { RetryCard(message: error) { Task { await load() } } }
                ForEach(data.objects("rewards"), id: \.rewardID) { reward in rewardCard(reward) }
                Text("매일 0시 갱신 · 받은 실버는 누적돼요.\n실버는 수익 정산 대상이 아니에요.").font(.system(size: 12)).foregroundStyle(AifectDesign.muted).padding(.top, 4)
            }.padding(.horizontal, 20).padding(.bottom, 24)
        }.navigationTitle("실버").task(id: model.userID) { data = [:]; await load() }.refreshable { await load() }
    }
    private func rewardCard(_ reward: [String: Any]) -> some View {
        let kind = reward.string("kind"), claimed = reward.flag("claimed"), eligible = reward.flag("eligible")
        let target = max(1, reward.int("target")), progress = claimed || eligible ? max(1, reward.int("target")) : min(max(0, reward.int("progress")), max(1, reward.int("target")))
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(spacing: 14))
        return layout {
            VStack(alignment: .leading, spacing: 5) {
                Text(labels[kind] ?? kind).font(.system(size: 15, weight: .semibold))
                Text(claimed ? "오늘 보상 완료" : kind == "listen" ? "\(progress) / \(target)곡 · 곡마다 60% 이상" : kind.hasPrefix("comment") ? "3자 이상 감상 남기기" : "하루 1회").font(.system(size: 12)).foregroundStyle(AifectDesign.muted)
                if kind == "listen" { ProgressView(value: Double(progress) / Double(target)).tint(Brand.aqua).padding(.top, 3) }
            }.frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 4) {
                CurrencyAmount(value: reward.int("amount"), code: "S", size: 24).font(.system(size: 13, weight: .bold)).foregroundStyle(claimed ? AifectDesign.muted : Brand.aqua)
                Button(claimed ? "받음" : eligible ? "실버 받기" : "활동하기") {
                    if eligible { Task { await claim(kind) } }
                    else {
                        dismiss(); model.navigationPath = NavigationPath(); model.selectedTab = kind == "cover" ? 2 : 0
                        model.notice = kind.hasPrefix("comment") ? "좋아하는 곡에서 3자 이상 감상을 남겨보세요." : kind == "listen" ? "서로 다른 5곡을 각각 60% 이상 감상해주세요." : "커버곡을 공개하면 보상을 받을 수 있어요."
                    }
                }.buttonStyle(CatalogButtonStyle(filled: true)).disabled(busy || claimed)
            }
        }.padding(14).background(AifectDesign.stroke.opacity(0.45), in: RoundedRectangle(cornerRadius: 16)).accessibilityIdentifier("reward-" + kind)
    }
    private func load() async { let owner = model.userID; do { let value = try await API.shared.call("/api/gifts/free"); guard owner == model.userID, !Task.isCancelled else { return }; data = value; error = nil } catch { if owner == model.userID { self.error = error.localizedDescription } } }
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
            Section { Text("누적 선물 순위 · 1 G와 1 s는 각각 1점").font(.caption).foregroundStyle(.secondary) }
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
        HStack { ProfilePhoto(person: entry, size: 44); VStack(alignment: .leading) { MemberName(entry); Text("\(entry.int("gold").formatted()) g · \(entry.int("stars").formatted()) s").font(.caption).foregroundStyle(.secondary) }; Spacer(); Text("\(entry.int("score"))점").font(.caption.bold()).foregroundStyle(Brand.aqua) }
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
                LabeledContent("받은 골드", value: "\(data.int("total_gold").formatted()) g")
                LabeledContent("받은 실버", value: "\(data.int("free_count").formatted()) s")
            }
            Section("응원한 사람 TOP 10") {
                ForEach(data.objects("ranking"), id: \.rankingID) { entry in
                    VStack(alignment: .leading, spacing: 5) { MemberName(entry); Text("\(entry.int("gold").formatted()) g · \(entry.int("stars").formatted()) s").font(.caption).foregroundStyle(.secondary) }
                }
                if data.objects("ranking").isEmpty { Text("아직 받은 선물이 없어요").foregroundStyle(.secondary) }
            }
            if let error { Text(error).foregroundStyle(.secondary) }
        }.navigationTitle("받은 선물").task { do { data = try await API.shared.call("/api/tracks/\(Endpoint.pathID(song.id))/gifts") } catch { self.error = error.localizedDescription } }
    }
}
private extension Dictionary where Key == String, Value == Any { var rankingID: String { "\(int("rank")):\(string("profile_id"))" } }

/// The journal survives closing a sheet or losing a response after a debit.
/// An unresolved order is retried with its original payload and request ID.
struct InventoryOrder: Codable, Identifiable {
    let id: String
    let owner: String
    let path: String
    let product: String
    let period: String
    let quantity: Int
    let name: String
    let total: Int
    let unit: String
    var body: [String: Any] {
        var value: [String: Any] = ["request_id": id]
        if path == "/api/decorations/buy" { value["sku"] = product; value["period"] = period }
        if path == "/api/me/gift-inventory/buy" { value["gift_type"] = product; value["quantity"] = quantity }
        return value
    }
    private static func url(owner: String, scope: String) -> URL {
        let hash = SHA256.hash(data: Data((owner + ":" + scope).utf8)).map { String(format: "%02x", $0) }.joined()
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("inventory-order-\(hash).json")
    }
    static func pending(owner: String, scope: String) -> Self? {
        guard let bytes = try? Data(contentsOf: url(owner: owner, scope: scope)), let order = try? JSONDecoder().decode(Self.self, from: bytes), order.owner == owner else { return nil }
        return order
    }
    func persist(scope: String) throws {
        let file = Self.url(owner: owner, scope: scope)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(self).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func clear(scope: String) { try? FileManager.default.removeItem(at: Self.url(owner: owner, scope: scope)) }
    static func definitive(_ error: Error) -> Bool { (error as? APIError).map { [400, 403, 404, 409, 422].contains($0.status) } ?? false }
}

struct DecorationArtwork: View {
    let product: [String: Any]
    var body: some View {
        RemoteArtwork(url: CatalogArtwork.decorationURL(product), catalog: true) { image in
            image.resizable().scaledToFit()
        } placeholder: { Image(systemName: product.string("kind") == "TALKING_ROOM_THEME" ? "photo" : "person.crop.square").font(.largeTitle).foregroundStyle(AifectDesign.muted) }
    }
}

struct ItemShopView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var wallet: [String: Any] = [:]
    @State private var decorations: [String: Any] = [:]
    @State private var category = "선물"
    @State private var currency = "골드"
    @State private var selected: CatalogItemSelection?
    @State private var loading = true
    @State private var busy = false
    @State private var error: String?
    @State private var orderError: String?
    @State private var success: String?
    @State private var pending: InventoryOrder?
    @State private var owner: String?
    private var products: [[String: Any]] {
        if category == "선물" { return wallet.objects(currency == "골드" ? "gifts" : "silver_gifts") }
        return decorations.objects("products").filter { $0.string("kind") == (category == "액자" ? "PROFILE_FRAME" : "TALKING_ROOM_THEME") }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if model.userID == nil { LoginPrompt(title: "로그인하고 상점을 이용하세요") }
                else {
                    HStack {
                        VStack(alignment: .leading, spacing: 5) { Text("내 골드").font(.caption).foregroundStyle(AifectDesign.muted); CurrencyAmount(value: wallet.isEmpty ? nil : wallet.int("balance"), code: "G", size: 20).font(.title2.bold()).accessibilityIdentifier("shop-gold") }
                        Spacer(); NavigationLink("골드 충전") { PaymentStoreView().streamingPage() }.buttonStyle(CatalogButtonStyle())
                    }
                    HStack { CurrencyAmount(value: wallet.isEmpty ? nil : wallet.object("free").int("balance"), code: "S", size: 20).font(.caption).foregroundStyle(AifectDesign.muted); Spacer(); NavigationLink("인벤토리") { PlayerInventoryView().streamingPage() }.font(.caption) }
                    Text("구매한 아이템은 인벤토리에 보관돼요.").font(.caption).foregroundStyle(AifectDesign.muted)
                    if let pending {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("\(pending.name) 구매 결과를 확인해주세요.").font(.subheadline)
                            Text("총 \(pending.total.formatted()) \(pending.unit.lowercased()) · \(pending.quantity)개").font(.caption)
                            Button("구매 결과 확인 · 재시도") { Task { await buy(pending) } }.buttonStyle(CatalogButtonStyle(filled: true)).disabled(busy).accessibilityIdentifier("shop-order-retry")
                            if let orderError { Text(orderError).font(.caption).foregroundStyle(Brand.pink) }
                        }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
                    }
                    if let success { Text(success).font(.subheadline).foregroundStyle(Brand.aqua).accessibilityIdentifier("shop-success") }
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                    ChartFilterTabs(names: ["선물", "액자", "토크룸 배경"], selection: $category)
                    if category == "선물" { ParityChips(items: ["골드", "실버"], selection: $currency) }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: category == "선물" ? 3 : 2), spacing: 12) {
                        ForEach(products, id: \.shopID) { product in
                            Button { orderError = nil; selected = CatalogItemSelection(payload: product) } label: {
                                VStack(spacing: 8) {
                                    if category == "선물" { InventoryGiftArtwork(gift: product).frame(height: 84) }
                                    else { DecorationArtwork(product: product).frame(height: 130) }
                                    Text(product.string("name")).font(.system(size: category == "선물" ? 12 : 14, weight: .medium)).lineLimit(2).frame(minHeight: 38)
                                    HStack(spacing: 3) { CurrencyAmount(value: category == "선물" ? product.int(currency == "골드" ? "gold" : "silver") : product.object("periodPrices").int("P7D"), code: category == "선물" && currency == "실버" ? "S" : "G"); if category != "선물" { Text("· 7일") } }.font(.caption).foregroundStyle(Brand.aqua)
                                }.frame(maxWidth: .infinity).padding(10).background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).contentShape(Rectangle())
                            }.buttonStyle(.plain).disabled(busy || pending != nil || loading).accessibilityIdentifier("shop-product-" + product.shopID)
                        }
                    }
                    if !loading && error == nil && products.isEmpty { Text("등록된 상품이 없어요.").font(.subheadline).foregroundStyle(AifectDesign.muted) }
                }
            }.padding(18).padding(.bottom, 24)
        }.navigationTitle("상점").task(id: model.userID) {
            owner = model.userID; wallet = [:]; decorations = [:]; selected = nil; success = nil; error = nil; orderError = nil
            pending = owner.flatMap { InventoryOrder.pending(owner: $0, scope: "shop") }; await load()
        }.task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled { do { try await Task.sleep(for: .seconds(60)) } catch { return }; if !busy && selected == nil { await load(silent: true) } }
        }.refreshable { await load() }
            .sheet(item: $selected) { item in ShopCheckoutView(product: item.payload, currency: currency, periods: decorations.object("periods"), wallet: wallet, owner: model.userID, busy: busy, error: orderError, close: { selected = nil }, buy: { order in Task { await buy(order) } }) }
    }
    private func load(silent: Bool = false) async {
        guard let account = model.userID else { loading = false; return }
        if !silent { loading = true }; defer { if !silent { loading = false } }
        async let gold = API.shared.call("/api/gold")
        async let catalog = API.shared.call("/api/decorations")
        var errors: [String] = []
        do { let result = try await gold; if model.userID == account, !Task.isCancelled { wallet = result } }
        catch { errors.append(error.localizedDescription) }
        do { let result = try await catalog; if model.userID == account, !Task.isCancelled { decorations = result } }
        catch { errors.append(error.localizedDescription) }
        if model.userID == account, !Task.isCancelled { error = errors.isEmpty ? nil : errors.joined(separator: "\n") }
    }
    private func buy(_ order: InventoryOrder) async {
        guard !busy, model.userID == order.owner else { return }
        busy = true; defer { busy = false }
        do {
            try order.persist(scope: "shop"); pending = order
            _ = try await API.shared.call(order.path, method: "POST", body: order.body)
            order.clear(scope: "shop")
            guard model.userID == order.owner else { return }
            pending = nil; selected = nil; orderError = nil
            success = "\(order.name) \(order.quantity)개를 인벤토리에 보관했어요."; model.walletRevision += 1
            await load()
        } catch {
            guard model.userID == order.owner else { return }
            orderError = error.localizedDescription
            if InventoryOrder.definitive(error) { order.clear(scope: "shop"); pending = nil }
            else if pending != nil { selected = nil }
        }
    }
}

private extension Dictionary where Key == String, Value == Any { var shopID: String { string("sku", fallback: string("id")) } }

struct CatalogItemSelection: Identifiable {
    let payload: [String: Any]
    var id: String { payload.string("id", fallback: payload.string("sku")) }
}

private struct ShopCheckoutView: View {
    let product: [String: Any]
    let currency: String
    let periods: [String: Any]
    let wallet: [String: Any]
    let owner: String?
    let busy: Bool
    let error: String?
    let close: () -> Void
    let buy: (InventoryOrder) -> Void
    @State private var period = "P7D"
    @State private var quantity = 1
    private var isDecoration: Bool { !product.string("sku").isEmpty }
    private var isSilver: Bool { !isDecoration && currency == "실버" }
    private var unit: String { isSilver ? "S" : "G" }
    private var price: Int { isDecoration ? product.object("periodPrices").int(period) : product.int(isSilver ? "silver" : "gold") }
    private var total: Int { price * (isDecoration ? 1 : quantity) }
    private var balance: Int { isSilver ? wallet.object("free").int("balance") : wallet.int("balance") }
    private var availablePeriods: [String] { ["P7D", "P1M", "P3M"].filter { product.object("periodPrices")[$0] != nil } }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if isDecoration { DecorationArtwork(product: product).frame(height: 160) }
                    else { InventoryGiftArtwork(gift: product).frame(height: 110) }
                    Text(product.string("name")).font(.title3.bold())
                    if isDecoration {
                        Picker("사용 기간", selection: $period) { ForEach(availablePeriods, id: \.self) { key in Text(periods.string(key, fallback: ["P7D": "7일", "P1M": "1개월", "P3M": "3개월"][key] ?? key)).tag(key) } }.pickerStyle(.segmented).accessibilityIdentifier("shop-period")
                    } else {
                        HStack { Button { quantity -= 1 } label: { Image(systemName: "minus").frame(width: 44, height: 44) }.disabled(quantity <= 1).accessibilityIdentifier("shop-quantity-less"); Text("\(quantity)개").monospacedDigit(); Button { quantity += 1 } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.disabled(quantity >= 100).accessibilityIdentifier("shop-quantity-more") }
                    }
                    CurrencyAmount(value: total, code: unit).font(.title2.bold())
                    Text(balance >= total ? "구매 후 \((balance - total).formatted()) \(unit.lowercased())" : "\(isSilver ? "실버" : "골드")가 부족해요.").font(.subheadline).foregroundStyle(AifectDesign.muted)
                    Text(isDecoration ? "구매 후 인벤토리에 보관돼요. 사용할 때부터 기간이 시작돼요." : "구매하면 인벤토리에 보관돼요.").font(.caption).foregroundStyle(AifectDesign.muted)
                    if let error { Text(error).font(.caption).foregroundStyle(Brand.pink) }
                    Button("\(total.formatted()) \(unit.lowercased()) 구매") {
                        guard let owner else { return }
                        buy(InventoryOrder(id: UUID().uuidString, owner: owner, path: isDecoration ? "/api/decorations/buy" : "/api/me/gift-inventory/buy", product: product.shopID, period: isDecoration ? period : "", quantity: isDecoration ? 1 : quantity, name: product.string("name"), total: total, unit: unit))
                    }.buttonStyle(CatalogButtonStyle(filled: true)).disabled(busy || owner == nil || total <= 0 || balance < total).accessibilityIdentifier("shop-buy-confirm")
                }.frame(maxWidth: .infinity).padding(22).disabled(busy)
            }.background(AifectDesign.background).navigationTitle("아이템 구매").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기", action: close).disabled(busy) } }
        }.presentationDetents([.height(560), .large]).interactiveDismissDisabled(busy).preferredColorScheme(.dark)
            .onAppear { if isDecoration && !availablePeriods.contains(period) { period = availablePeriods.first ?? "P7D" } }
    }
}

struct DecorationUseView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let item: [String: Any]
    let completed: () -> Void
    @State private var busy = false
    @State private var error: String?
    @State private var owner: String?
    @State private var request: InventoryOrder?
    private var product: [String: Any] { item.object("product").isEmpty ? item : item.object("product") }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DecorationArtwork(product: product).frame(maxWidth: .infinity).frame(height: 160)
                    Text(product.string("name")).font(.title3.bold())
                    Text((["P7D": "7일", "P1M": "1개월", "P3M": "3개월"][item.string("period_code")] ?? "") + " · 사용 시작부터 적용").font(.caption).foregroundStyle(Brand.aqua)
                    Text(product.string("kind") == "PROFILE_FRAME" ? "프로필에 액자를 장착합니다." : "사용 기간을 시작한 뒤 토킹룸 설정에서 배경을 선택할 수 있어요.").font(.subheadline)
                    Text("보관 아이템 1개를 사용해요. 같은 아이템의 남은 기간은 연장돼요.").font(.caption).foregroundStyle(AifectDesign.muted)
                    if let error { Text(error).font(.caption).foregroundStyle(Brand.pink) }
                    Button(busy ? "적용 중…" : request == nil ? "사용 시작" : "사용 결과 확인 · 재시도") { Task { await use() } }
                        .buttonStyle(CatalogButtonStyle(filled: true)).disabled(busy || !item.flag("available") || owner == nil).accessibilityIdentifier("inventory-use-confirm")
                }.padding(22)
            }.background(AifectDesign.background).navigationTitle("아이템 사용").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() }.disabled(busy) } }
        }.preferredColorScheme(.dark).presentationDetents([.medium, .large]).interactiveDismissDisabled(busy)
            .task(id: model.userID) { owner = model.userID; error = nil; request = owner.flatMap { InventoryOrder.pending(owner: $0, scope: "use:" + item.selfID) } }
    }
    private func use() async {
        guard let owner, model.userID == owner, !busy, item.flag("available"), SiteWorkspace.validKey(item.selfID) else { return }
        let scope = "use:" + item.selfID
        let order = request ?? InventoryOrder(id: UUID().uuidString, owner: owner, path: "/api/decorations/inventory/\(Endpoint.pathID(item.selfID))/use", product: item.selfID, period: item.string("period_code"), quantity: 1, name: product.string("name"), total: 0, unit: "")
        busy = true; defer { busy = false }
        do {
            try order.persist(scope: scope); request = order
            _ = try await API.shared.call(order.path, method: "POST", body: order.body)
            order.clear(scope: scope)
            guard model.userID == owner else { return }
            model.profileRevision += 1; model.walletRevision += 1; completed(); dismiss()
        } catch {
            guard model.userID == owner else { return }
            self.error = error.localizedDescription
            if InventoryOrder.definitive(error) { order.clear(scope: scope); request = nil }
        }
    }
}

/// Uses the same owned-unit and receipt endpoints as Android. A received gift
/// total is not spendable inventory and is deliberately rendered separately.
struct MyInventoryContent: View {
    @EnvironmentObject private var model: AppModel
    let profileID: String
    @State private var items: [[String: Any]] = []
    @State private var received: [String: Any] = [:]
    @State private var loaded = false
    @State private var error: String?
    private var groups: [[String: Any]] {
        let grouped = Dictionary(grouping: items) { $0.string("gift_type") + ":" + String(($0["available"] as? Bool) ?? true) }
        return grouped.keys.sorted().compactMap { key in
            guard var first = grouped[key]?.first else { return nil }
            first["count"] = grouped[key]?.count ?? 0; first["group_id"] = key; return first
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            MyWalletSummary()
            NavigationLink { ItemShopView().streamingPage() } label: {
                StreamingEntry(title: "상점", caption: "선물 · 액자 · 토크룸 배경", icon: "bag")
            }.buttonStyle(.plain).accessibilityIdentifier("my-item-shop")
            NavigationLink { PlayerInventoryView().streamingPage() } label: {
                StreamingEntry(title: "프레임 · 배경", caption: "보유 아이템과 장착 상태 보기", icon: "square.stack.3d.up")
            }.buttonStyle(.plain).accessibilityIdentifier("my-inventory")
            HStack {
                Text("보유 선물").font(.system(size: 16, weight: .semibold))
                Spacer()
                NavigationLink { OwnedGiftInventoryView().streamingPage() } label: { Label("선물 관리", systemImage: "chevron.right").font(.caption).frame(minHeight: 44) }
            }
            if !loaded && error == nil { ProgressView().frame(maxWidth: .infinity) }
            if let error { RetryCard(message: error) { Task { await load() } } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(groups, id: \.groupID) { gift in
                    NavigationLink { OwnedGiftInventoryView().streamingPage() } label: {
                        VStack(spacing: 5) {
                            InventoryGiftArtwork(gift: gift).frame(height: 64)
                            Text(gift.string("gift_name")).font(.system(size: 12)).lineLimit(2).frame(minHeight: 34)
                            Text("\(gift.int("count"))개 보유").font(.system(size: 11)).foregroundStyle(Brand.aqua)
                            Text((gift["available"] as? Bool) == false ? "사용 보류" : "선물 관리").font(.system(size: 10)).foregroundStyle(AifectDesign.muted)
                        }.frame(maxWidth: .infinity).padding(9).background(Brand.card, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AifectDesign.stroke))
                    }.buttonStyle(.plain).accessibilityIdentifier("my-owned-gift-" + gift.string("group_id"))
                }
            }
            if loaded && items.isEmpty { Text("보유한 선물 아이템이 없어요.").font(.caption).foregroundStyle(AifectDesign.muted) }
            Text("보유 선물은 선물 관리에서 다른 회원에게 보낼 수 있어요.").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
            Divider()
            Text("받은 선물 · 응원").font(.system(size: 16, weight: .semibold))
            HStack {
                receivedAmount("골드 선물", key: "total_gold", unit: "G")
                receivedAmount("실버 선물", key: "free_count", unit: "S")
            }
            if SiteWorkspace.validKey(profileID) {
                NavigationLink { ProfileGiftRankingView(profileID: profileID).streamingPage() } label: { StreamingEntry(title: "선물 랭킹", caption: "나를 응원한 회원 보기", icon: "trophy") }.buttonStyle(.plain)
            }
            Text("받은 선물은 응원 내역이며, 사용 가능한 보유 선물과 달라요.").font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
            NavigationLink { SentGiftHistoryView().streamingPage() } label: { StreamingEntry(title: "보낸 선물 내역", caption: "최근 골드 · 실버 선물", icon: "clock") }.buttonStyle(.plain).accessibilityIdentifier("inventory-sent-gifts")
        }.task(id: "\(model.userID ?? ""):\(profileID):\(model.walletRevision)") { await load() }
    }
    private func receivedAmount(_ title: String, key: String, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 11)).foregroundStyle(AifectDesign.muted)
            CurrencyAmount(value: (received[key] as? NSNumber)?.intValue, code: unit).font(.system(size: 16, weight: .semibold))
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func load() async {
        guard let owner = model.userID else { items = []; received = [:]; loaded = false; return }
        let pid = profileID
        do {
            let inventory = try await API.shared.call("/api/me/gift-inventory")
            guard model.userID == owner, !Task.isCancelled else { return }
            items = inventory.objects("items"); loaded = true; error = nil
            if SiteWorkspace.validKey(pid) {
                let gifts = try await API.shared.call("/api/producers/\(Endpoint.pathID(pid))/gifts")
                guard model.userID == owner, profileID == pid, !Task.isCancelled else { return }
                received = gifts
            }
        } catch { if model.userID == owner, !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private extension Dictionary where Key == String, Value == Any {
    var groupID: String { string("group_id") }
}

struct InventoryGiftArtwork: View {
    let gift: [String: Any]
    var body: some View {
        if let url = CatalogArtwork.giftURL(gift) {
            RemoteArtwork(url: url, catalog: true) { $0.resizable().scaledToFit() } placeholder: { Image(systemName: "gift").font(.title).foregroundStyle(Brand.pink) }
        } else { Image(systemName: "gift").font(.title).foregroundStyle(Brand.pink).frame(maxWidth: .infinity) }
    }
}

struct OwnedGiftInventoryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var items: [[String: Any]] = []
    @State private var loading = true
    @State private var error: String?
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if model.userID == nil { LoginPrompt(title: "로그인하고 보유 선물을 확인하세요.") }
                else {
                    if loading { ProgressView() }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                    ForEach(items, id: \.selfID) { gift in
                        NavigationLink { OwnedGiftSendView(item: gift).streamingPage() } label: {
                            HStack(spacing: 12) {
                                InventoryGiftArtwork(gift: gift).frame(width: 64, height: 64)
                                VStack(alignment: .leading, spacing: 6) { Text(gift.string("gift_name")).font(.subheadline.bold()); Text((gift["available"] as? Bool) == false ? "사용 보류" : "1개 보유 · 추가 차감 없이 보내기").font(.caption).foregroundStyle(AifectDesign.muted) }
                                Spacer(); Image(systemName: "chevron.right").font(.caption)
                            }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
                        }.buttonStyle(.plain).disabled((gift["available"] as? Bool) == false).accessibilityIdentifier("owned-gift-" + gift.selfID)
                    }
                    if !loading && error == nil && items.isEmpty { ContentUnavailableView("보유한 선물이 없어요", systemImage: "gift") }
                }
            }.padding(20)
        }.navigationTitle("선물 관리").task(id: "\(model.userID ?? ""):\(model.walletRevision)") { await load() }.refreshable { await load() }
    }
    private func load() async {
        guard let owner = model.userID else { items = []; loading = false; return }
        loading = true; defer { loading = false }
        do { let result = try await API.shared.call("/api/me/gift-inventory"); guard model.userID == owner, !Task.isCancelled else { return }; items = result.objects("items"); error = nil }
        catch { if owner == model.userID, !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private struct OwnedGiftSendView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let item: [String: Any]
    @State private var query = ""
    @State private var people: [[String: Any]] = []
    @State private var loading = true
    @State private var busy = false
    @State private var error: String?
    @State private var person: [String: Any]?
    @State private var requestID = UUID().uuidString
    @State private var confirm = false
    @State private var pending = false
    @State private var boundOwner: String?
    private func journal(owner: String) -> URL {
        let key = SHA256.hash(data: Data((owner + ":" + item.selfID).utf8)).map { String(format: "%02x", $0) }.joined()
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("owned-gift-\(key).json")
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    InventoryGiftArtwork(gift: item).frame(width: 72, height: 72)
                    VStack(alignment: .leading, spacing: 6) { Text(item.string("gift_name")).font(.headline); Text("인벤토리에서 1개 사용").font(.subheadline); Text("추가 차감 없이 보낼 수 있어요.").font(.caption).foregroundStyle(AifectDesign.muted) }
                }
                if pending, let person {
                    Text("\(person.displayName())님에게 보내던 선물의 결과를 확인해주세요.").font(.subheadline)
                    Button("전송 결과 확인 · 재시도") { confirm = true }.disabled(busy).buttonStyle(.borderedProminent)
                } else {
                    CatalogSearchField(prompt: "받는 사람 검색", text: $query).accessibilityIdentifier("owned-gift-search")
                    if loading { ProgressView() }
                    ForEach(people, id: \.selfID) { recipient in
                        Button { person = recipient; requestID = UUID().uuidString; confirm = true } label: {
                            HStack { ProfilePhoto(person: recipient, size: 48); Text(recipient.displayName()).font(.subheadline); Spacer(); Text("선택").font(.caption).foregroundStyle(Brand.aqua) }.frame(minHeight: 60).contentShape(Rectangle())
                        }.buttonStyle(.plain).disabled(busy).accessibilityIdentifier("owned-gift-recipient-" + recipient.selfID)
                    }
                    if !loading && people.isEmpty && error == nil { Text("검색된 회원이 없어요.").foregroundStyle(AifectDesign.muted) }
                }
                if let error { Text(error).font(.caption).foregroundStyle(Brand.pink) }
            }.padding(20)
        }.navigationTitle("선물 보내기").task(id: "\(model.userID ?? ""):\(query)") { await search() }
            .confirmationDialog("선물을 보낼까요?", isPresented: $confirm, titleVisibility: .visible) {
                Button("1개 보내기") { Task { await send() } }.disabled(busy)
                Button("취소", role: .cancel) {}
            } message: { Text("\(person?.displayName() ?? "")님에게 \(item.string("gift_name")) 1개를 보냅니다. 보낸 선물은 취소할 수 없습니다.") }
    }
    private func search() async {
        guard let owner = model.userID else { people = []; person = nil; pending = false; boundOwner = nil; return }
        if boundOwner != owner { people = []; person = nil; pending = false; error = nil; boundOwner = owner }
        if let bytes = try? Data(contentsOf: journal(owner: owner)), let record = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], record.string("owner") == owner {
            person = record.object("person"); requestID = record.string("request_id"); pending = true; loading = false; return
        }
        loading = true; people = []; error = nil
        do {
            try await Task.sleep(for: .milliseconds(query.isEmpty ? 0 : 300))
            let result = try await API.shared.call(query.isEmpty ? "/api/catalog?section=producers" : "/api/search?q=" + Endpoint.query(query.trimmingCharacters(in: .whitespacesAndNewlines)))
            guard model.userID == owner, !Task.isCancelled else { return }
            people = result.objects("producers").filter { $0.string("user_id") != owner && $0.selfID != model.user?.string("profile_id") }
            loading = false
        } catch { if model.userID == owner, !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
    }
    private func send() async {
        guard let owner = model.userID, let person, SiteWorkspace.validKey(person.selfID), !busy else { return }
        busy = true; defer { busy = false }
        let path = journal(owner: owner)
        do {
            let record: [String: Any] = ["owner": owner, "person": person, "request_id": requestID]
            try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONSerialization.data(withJSONObject: record).write(to: path, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            pending = true
            _ = try await API.shared.call("/api/me/gift-inventory/\(Endpoint.pathID(item.selfID))/send", method: "POST", body: ["profile_id": person.selfID, "request_id": requestID])
            try? FileManager.default.removeItem(at: path)
            guard model.userID == owner else { return }
            model.walletRevision += 1; model.notice = "선물을 보냈어요."; dismiss()
        } catch {
            if model.userID == owner {
                self.error = error.localizedDescription
                if let failure = error as? APIError, [400, 403, 404, 409, 422].contains(failure.status) {
                    try? FileManager.default.removeItem(at: path); pending = false
                }
            }
        }
    }
}

struct SentGiftHistoryView: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var wallet = GiftWallet()
    @State private var filter = "전체"
    private var receipts: [[String: Any]] {
        (wallet.data.objects("sent").map { $0.merging(["unit": "G"]) { _, value in value } } + wallet.data.objects("free_sent").map { $0.merging(["unit": "S"]) { _, value in value } })
            .sorted { $0.number("created") > $1.number("created") }
            .filter { filter == "전체" || $0.string("unit") == (filter == "골드" ? "G" : "S") }
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Label("최근 골드 · 실버 선물", systemImage: "gift").font(.subheadline)
                CatalogTabs(names: ["전체", "골드", "실버"], selection: $filter)
                if let error = wallet.error { RetryCard(message: error) { Task { await wallet.load() } } }
                ForEach(Array(receipts.enumerated()), id: \.offset) { _, receipt in
                    let unit = receipt.string("unit")
                    VStack(alignment: .leading, spacing: 10) {
                        HStack { Text(receipt.string("gift_name", fallback: unit == "G" ? "골드 선물" : "실버 선물")).font(.subheadline.bold()); Spacer(); Text("×\(max(1, receipt.int("quantity")))").foregroundStyle(Brand.pink) }
                        Text(receipt.string("title", fallback: "개인에게 보낸 선물")).font(.caption).foregroundStyle(AifectDesign.muted)
                        HStack {
                            Text(Date(timeIntervalSince1970: receipt.number("created")), style: .date)
                            Spacer()
                            CurrencyAmount(value: (receipt[unit == "G" ? "gold" : "silver"] as? NSNumber)?.intValue, code: unit)
                        }.font(.caption)
                        if SiteWorkspace.validKey(receipt.string("recipient_profile_id")) {
                            NavigationLink("선물 받은 회원 보기") { ProfilePage(id: receipt.string("recipient_profile_id")).streamingPage() }.font(.caption).frame(minHeight: 44)
                        }
                    }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Brand.card, in: RoundedRectangle(cornerRadius: 14))
                }
                if receipts.isEmpty && !wallet.data.isEmpty { ContentUnavailableView("보낸 선물이 없어요", systemImage: "gift") }
            }.padding(20)
        }.navigationTitle("보낸 선물").task(id: model.userID) { wallet.bind(owner: model.userID, path: nil); if model.userID != nil { await wallet.load() } }.refreshable { if model.userID != nil { await wallet.load() } }
    }
}
