import StoreKit
import SwiftUI

@MainActor
final class StorePayments: ObservableObject {
    static let shared = StorePayments()
    static let premiumID = "kr.co.aifect.app.premium.monthly"
    static let goldIDs = [500, 1000, 5000, 10000].map { "kr.co.aifect.app.gold.\($0)" }
    @Published private(set) var products: [Product] = []
    @Published private(set) var busy = false
    @Published private(set) var loadingProducts = false
    @Published var message: String?
    @Published private(set) var balance = 0
    @Published private(set) var sandbox = false
    private let api: API
    private var updates: Task<Void, Never>?
    init(api: API? = nil, observeUpdates: Bool = true) {
        self.api = api ?? .shared
        guard observeUpdates else { return }
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self else { return }
                do { try await self.deliver(result) }
                catch { self.message = error.localizedDescription }
            }
        }
    }
    deinit { updates?.cancel() }
    func load() async {
        guard !loadingProducts else { return }
        loadingProducts = true
        defer { loadingProducts = false }
        do {
            products = try await Product.products(for: [Self.premiumID] + Self.goldIDs).sorted { $0.price < $1.price }
            await refreshWallet()
            if products.isEmpty { message = "결제 상품을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." }
        } catch { message = error.localizedDescription }
    }
    func refreshWallet() async {
        if let value = try? await api.call("/api/gold") { balance = (value["balance"] as? NSNumber)?.intValue ?? 0 }
        else { balance = 0 }
    }
    func resetAccount() { balance = 0; message = nil; sandbox = false }
    func purchase(_ product: Product) async {
        guard !busy else { return }
        busy = true; message = nil; defer { busy = false }
        do {
            let account = try await api.call("/api/apple/account", method: "POST", body: [:])
            guard let token = UUID(uuidString: account.string("app_account_token")) else { throw PaymentError.account }
            switch try await product.purchase(options: [.appAccountToken(token)]) {
            case .success(let result): try await deliver(result)
            case .pending: message = "구매 승인을 기다리고 있습니다. 승인되면 자동으로 반영됩니다."
            case .userCancelled: break
            @unknown default: message = "구매 상태를 확인할 수 없습니다. 구매 복원을 이용해주세요."
            }
        } catch { message = error.localizedDescription }
    }
    func restore() async {
        guard !busy else { return }
        busy = true; message = nil; defer { busy = false }
        do {
            try await AppStore.sync()
            var found = false
            for await result in StoreKit.Transaction.currentEntitlements { try await deliver(result); found = true }
            for await result in StoreKit.Transaction.unfinished { try await deliver(result); found = true }
            await refreshWallet()
            if !found { message = "복원할 구독이 없습니다. 사용한 골드와 지급 완료된 골드는 AIFECT 계정에 저장됩니다." }
        } catch { message = error.localizedDescription }
    }
    func retryUnfinished() async {
        for await result in StoreKit.Transaction.unfinished {
            do { try await deliver(result) } catch { message = error.localizedDescription }
        }
    }
    private func deliver(_ result: VerificationResult<StoreKit.Transaction>) async throws {
        guard case .verified(let transaction) = result else { throw PaymentError.unverified }
        guard ([Self.premiumID] + Self.goldIDs).contains(transaction.productID) else { return }
        // The server validates Apple's signature and account binding before fulfillment.
        // Leave the StoreKit transaction unfinished if the network/server rejects it.
        let response = try await api.call("/api/apple/transactions", method: "POST", body: ["signed_transaction": result.jwsRepresentation])
        guard response["ok"] as? Bool == true else { throw PaymentError.delivery }
        sandbox = response["sandbox"] as? Bool ?? false
        await transaction.finish()
        await refreshWallet()
        message = sandbox ? "테스트 구매가 검증되었습니다. 실제 골드·정산에는 반영되지 않습니다." : "구매가 계정에 반영되었습니다."
    }
}

private enum PaymentError: LocalizedError {
    case account, unverified, delivery
    var errorDescription: String? {
        switch self {
        case .account: return "결제 계정을 확인하지 못했습니다. 다시 로그인해주세요."
        case .unverified: return "Apple 구매 내역을 검증하지 못했습니다."
        case .delivery: return "구매 반영을 확인하지 못했습니다. 구매 복원을 눌러 다시 확인해주세요."
        }
    }
}

struct PaymentStoreView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject private var store = StorePayments.shared
    @State private var manage = false
    var body: some View {
        List {
            Section("내 계정") {
                Text(model.user?.string("name") ?? "로그인이 필요합니다")
                LabeledContent("보유 골드", value: "\(store.balance)개")
            }
            Section("AIFECT Premium") {
                Text("전체 가사 · 플레이리스트 10개 · 월 원곡 업로드 20곡")
                if let product = store.products.first(where: { $0.id == StorePayments.premiumID }) {
                    purchaseButton(product, title: "Premium 월간 구독", suffix: " / 월")
                }
                Text("구독은 매월 자동 갱신됩니다. Apple 계정의 구독 관리에서 언제든 해지할 수 있습니다.").font(.caption).foregroundStyle(.secondary)
            }
            Section("골드 충전") {
                ForEach(store.products.filter { StorePayments.goldIDs.contains($0.id) }) { product in
                    purchaseButton(product, title: product.displayName, suffix: "")
                }
                Text("골드는 음악에 선물을 보낼 때 사용합니다. 구독과 별도로 구매하며 AIFECT 계정에 귀속됩니다.").font(.caption).foregroundStyle(.secondary)
            }
            if store.loadingProducts { ProgressView("Apple 결제 상품을 불러오는 중").accessibilityIdentifier("store-products-loading") }
            if store.products.isEmpty { Button("상품 다시 불러오기") { Task { await store.load() } }.disabled(store.loadingProducts) }
            if let message = store.message { Section { Text(message).font(.subheadline) } }
            Section {
                Button("구매 복원") { Task { await store.restore(); try? await model.loadMe() } }.disabled(store.busy || model.user == nil)
                Button("Apple 구독 관리") { manage = true }
                Link("이용약관", destination: Endpoint.origin.appendingPathComponent("terms"))
                Link("개인정보 처리방침", destination: Endpoint.origin.appendingPathComponent("privacy"))
            }
        }.accessibilityIdentifier("payment-list").navigationTitle("Premium · 골드")
            .manageSubscriptionsSheet(isPresented: $manage)
            .task { await store.load(); if model.user != nil { await store.retryUnfinished(); try? await model.loadMe() } }
            .overlay { if store.busy { ProgressView("Apple 구매 확인 중").padding(22).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18)) } }
    }
    private func purchaseButton(_ product: Product, title: String, suffix: String) -> some View {
        Button {
            guard model.requireLogin() else { return }
            Task { await store.purchase(product); try? await model.loadMe() }
        } label: {
            HStack { Text(title); Spacer(); Text(product.displayPrice + suffix).bold() }
        }.disabled(store.busy)
    }
}
