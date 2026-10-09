import XCTest
import StoreKit
import StoreKitTest
@testable import AIFECT

// Actual StoreKit transactions in Apple's local Xcode test environment.
// HTTP fulfillment is an isolated fake; these do not verify Apple's server sandbox.
@MainActor
final class StorePaymentIntegrationTests: XCTestCase {
    private var session: SKTestSession!
    private var store: StorePayments!
    private var api: API!
    private let accountToken = UUID(uuidString: "8549162c-ae7e-4c6d-9e7a-5e167159bfa1")!
    private var delivered = Set<String>()
    private var refunded = Set<String>()
    private var ledger = 0
    private var deliveries = 0
    private var reject = false
    private var lastPayload: [String: Any] = [:]

    override func setUp() async throws {
        continueAfterFailure = false
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "AIFECTTesting", withExtension: "storekit"))
        session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState(); session.clearTransactions()
        session.disableDialogs = true
        session.storefront = "KOR"; session.locale = Locale(identifier: "ko_KR")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        api = API(configuration: config, cookie: "")
        store = StorePayments(api: api, observeUpdates: false)
        MockURLProtocol.handler = { [unowned self] request in
            switch request.url!.path {
            case "/api/apple/account": return (200, try JSONSerialization.data(withJSONObject: ["app_account_token": self.accountToken.uuidString]))
            case "/api/gold": return (200, try JSONSerialization.data(withJSONObject: ["balance": self.ledger]))
            case "/api/apple/transactions":
                self.deliveries += 1
                if self.reject { return (503, Data("{\"error\":\"TEST server unavailable\"}".utf8)) }
                let body = try self.body(request)
                let jws = try XCTUnwrap(body["signed_transaction"] as? String)
                let segments = jws.split(separator: ".")
                XCTAssertEqual(segments.count, 3)
                var payload = String(segments[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
                payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
                self.lastPayload = try JSONSerialization.jsonObject(with: XCTUnwrap(Data(base64Encoded: payload))) as! [String: Any]
                XCTAssertEqual(self.lastPayload["environment"] as? String, "Xcode")
                XCTAssertEqual((self.lastPayload["appAccountToken"] as? String)?.lowercased(), self.accountToken.uuidString.lowercased())
                let id = String(describing: self.lastPayload["transactionId"]!)
                let isRefund = self.lastPayload["revocationDate"] != nil
                let first = self.delivered.insert(id).inserted
                let firstRefund = isRefund && self.refunded.insert(id).inserted
                if let product = self.lastPayload["productId"] as? String, StorePayments.goldIDs.contains(product) {
                    let amount = Int(product.split(separator: ".").last!)!
                    if first && !isRefund { self.ledger += amount }
                    if !first && firstRefund { self.ledger -= amount }
                }
                return (200, Data("{\"ok\":true,\"sandbox\":true}".utf8))
            default: XCTFail("Unexpected route \(request.url!.path)"); return (404, Data("{}".utf8))
            }
        }
        await store.load()
        XCTAssertEqual(store.products.count, 5)
        guard store.products.count == 5, store.products.allSatisfy({ $0.description.contains("LOCAL_STOREKIT_ONLY") }) else {
            throw NSError(domain: "StoreKitTestEnvironment", code: 1, userInfo: [NSLocalizedDescriptionKey: "Local StoreKit configuration is not active; refusing to initiate purchases"])
        }
    }
    override func tearDown() async throws {
        session?.clearTransactions(); session?.resetToDefaultState()
        store = nil; api = nil; session = nil; MockURLProtocol.handler = nil
    }
    private func body(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }; data.append(buffer, count: n)
            }
        }
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }
    private func product(_ id: String) throws -> Product { try XCTUnwrap(store.products.first { $0.id == id }) }
    private func unfinishedIDs() async -> [UInt64] {
        var ids: [UInt64] = []
        for await result in StoreKit.Transaction.unfinished {
            if case .verified(let transaction) = result { ids.append(transaction.id) }
        }
        return ids
    }
    func testAllGoldPurchasesFinishAfterDeliveryAndRestoreDoesNotDuplicate() async throws {
        for amount in [500, 1000, 5000, 10000] {
            let p = try product("kr.co.aifect.app.gold.\(amount)")
            XCTAssertEqual(p.price, Decimal(amount * 10))
            await store.purchase(p)
            XCTAssertFalse(store.busy)
            XCTAssertTrue(store.sandbox)
        }
        XCTAssertEqual(store.balance, 16500)
        XCTAssertEqual(delivered.count, 4)
        let unfinished = await unfinishedIDs(); XCTAssertTrue(unfinished.isEmpty)
        await store.restore()
        XCTAssertEqual(store.balance, 16500)
        XCTAssertEqual(delivered.count, 4)
    }
    func testFailedFulfillmentRemainsUnfinishedAndRetryDeliversOnce() async throws {
        reject = true
        await store.purchase(try product(StorePayments.goldIDs[0]))
        XCTAssertEqual(store.balance, 0)
        XCTAssertTrue(store.message?.contains("TEST server unavailable") == true)
        let pending = await unfinishedIDs(); XCTAssertEqual(pending.count, 1)
        reject = false
        await store.retryUnfinished()
        XCTAssertEqual(store.balance, 500)
        await store.retryUnfinished(); await store.restore()
        XCTAssertEqual(store.balance, 500); XCTAssertEqual(delivered.count, 1)
        let after = await unfinishedIDs(); XCTAssertTrue(after.isEmpty)
    }
    func testCancelledPurchaseDoesNotDeliverOrLeaveBusy() async throws {
        try await session.setSimulatedError(.generic(.userCancelled), forAPI: .purchase)
        await store.purchase(try product(StorePayments.goldIDs[0]))
        XCTAssertEqual(deliveries, 0); XCTAssertEqual(store.balance, 0); XCTAssertFalse(store.busy)
        let unfinished = await unfinishedIDs(); XCTAssertTrue(unfinished.isEmpty)
    }
    func testPendingPurchaseWaitsForApprovalThenRetryDelivers() async throws {
        session.askToBuyEnabled = true
        await store.purchase(try product(StorePayments.goldIDs[0]))
        XCTAssertEqual(deliveries, 0); XCTAssertEqual(store.balance, 0)
        XCTAssertTrue(store.message?.contains("승인을 기다리고") == true)
        let pending = try XCTUnwrap(session.allTransactions().first)
        try session.approveAskToBuyTransaction(identifier: pending.identifier)
        // Approval is asynchronous even though the test-session method returns synchronously.
        // Wait for StoreKit to publish the approved transaction before testing retry delivery.
        for _ in 0..<200 {
            if !(await unfinishedIDs()).isEmpty { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        let approved = await unfinishedIDs()
        XCTAssertEqual(approved.count, 1, "StoreKit did not publish the approved transaction")
        await store.retryUnfinished()
        XCTAssertEqual(store.balance, 500)
    }
    func testPremiumRestoreAndRefundEntitlementTransition() async throws {
        let p = try product(StorePayments.premiumID)
        XCTAssertEqual(p.price, 5900)
        await store.purchase(p)
        XCTAssertEqual(delivered.count, 1)
        let firstDeliveries = deliveries
        await store.restore()
        XCTAssertGreaterThan(deliveries, firstDeliveries)
        XCTAssertEqual(delivered.count, 1)
        let tx = try XCTUnwrap(session.allTransactions().first)
        try session.refundTransaction(identifier: tx.identifier)
        // The test-session command records the refund before StoreKit publishes it.
        var latest = await StoreKit.Transaction.latest(for: StorePayments.premiumID)
        for _ in 0..<200 {
            if case .verified(let t) = latest, t.revocationDate != nil { break }
            try await Task.sleep(for: .milliseconds(50))
            latest = await StoreKit.Transaction.latest(for: StorePayments.premiumID)
        }
        guard case .verified(let refunded) = latest else { return XCTFail("Expected verified revoked transaction") }
        XCTAssertNotNil(refunded.revocationDate)
        var active = false
        for await result in StoreKit.Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productID == StorePayments.premiumID { active = true }
        }
        XCTAssertFalse(active)
    }
    func testTransactionListenerProcessesExternalGoldPurchaseOnce() async throws {
        store = StorePayments(api: api, observeUpdates: true)
        _ = try await session.buyProduct(identifier: StorePayments.goldIDs[0], options: [.appAccountToken(accountToken)])
        for _ in 0..<200 {
            if store.balance == 500 { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(store.balance, 500)
        XCTAssertEqual(delivered.count, 1)
        await store.retryUnfinished()
        XCTAssertEqual(store.balance, 500)
        let unfinished = await unfinishedIDs(); XCTAssertTrue(unfinished.isEmpty)
    }
    func testTransactionListenerDeliversPremiumRefund() async throws {
        store = StorePayments(api: api, observeUpdates: true)
        let transaction = try await session.buyProduct(identifier: StorePayments.premiumID, options: [.appAccountToken(accountToken)])
        for _ in 0..<200 {
            if delivered.count == 1 { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(delivered.count, 1)
        try session.refundTransaction(identifier: UInt(transaction.id))
        for _ in 0..<200 {
            if refunded.count == 1 { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(refunded.count, 1)
        XCTAssertNotNil(lastPayload["revocationDate"])
        XCTAssertEqual(delivered.count, 1)
        let unfinished = await unfinishedIDs(); XCTAssertTrue(unfinished.isEmpty)
    }
    func testConsumableRefundDeliveryWhenStoreKitPublishesRevocation() async throws {
        var observed: [String] = []
        var observedRevocation = false
        let observer = Task {
            for await result in StoreKit.Transaction.updates {
                if case .verified(let t) = result {
                    observed.append("id=\(t.id), revoked=\(t.revocationDate != nil)")
                    if t.revocationDate != nil { observedRevocation = true }
                }
            }
        }
        defer { observer.cancel() }
        store = StorePayments(api: api, observeUpdates: true)
        let transaction = try await session.buyProduct(identifier: StorePayments.goldIDs[0], options: [.appAccountToken(accountToken)])
        for _ in 0..<100 {
            if store.balance == 500 { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(store.balance, 500)
        try session.refundTransaction(identifier: UInt(transaction.id))
        for _ in 0..<300 {
            if !refunded.isEmpty && store.balance == 0 { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        let latest = await StoreKit.Transaction.latest(for: StorePayments.goldIDs[0])
        let revoked: Bool
        if case .verified(let t) = latest { revoked = t.revocationDate != nil } else { revoked = false }
        let testStates = session.allTransactions().map { "\($0.identifier):\($0.cancelDate != nil)" }
        let statusMessage = store.message ?? "nil"
        print("REFUND_DIAGNOSTIC updates=\(observed), latestRevoked=\(revoked), testTransactions=\(testStates), deliveries=\(deliveries), message=\(statusMessage)")
        XCTAssertNotNil(session.allTransactions().first?.cancelDate)
        if !observedRevocation && !revoked {
            // A raw StoreKit observer also received no revocation. This is an unverified
            // platform capability, not a passing app test. Production gold refunds use
            // App Store Server Notifications; actual Sandbox delivery remains to be tested.
            throw XCTSkip("Local StoreKit recorded the consumable refund but published no revocation in 15 seconds; verify using Apple's server sandbox")
        }
        XCTAssertEqual(refunded.count, 1)
        XCTAssertEqual(store.balance, 0)
        let unfinished = await unfinishedIDs(); XCTAssertTrue(unfinished.isEmpty)
    }
}
