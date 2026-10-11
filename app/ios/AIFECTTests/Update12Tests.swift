import XCTest
@testable import AIFECT

final class Update12Tests: XCTestCase {
    override func tearDown() { MockURLProtocol.handler = nil; super.tearDown() }
    @MainActor private func api() -> API {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        return API(configuration: config, cookie: "isolated-update12")
    }
    private static func wallet(_ available: Double) -> [String: Any] {
        ["available": available, "balance": available, "diamond_krw": 100, "gold_per_diamond": 10, "min_payout_diamonds": 100, "history": []]
    }
    private static func body(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var bytes = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let count = stream.read(&bytes, maxLength: bytes.count); if count <= 0 { break }; data.append(bytes, count: count) }
        }
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }
    private func folder() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    func testDiamondAmountAndPayoutLimitsPreserveFractionalBalance() {
        for invalid in ["0", "-1", "1.5", "abc", "1000001", "９９"] { XCTAssertNil(DiamondPolicy.amount(invalid)) }
        let wallet = Self.wallet(500.125)
        XCTAssertTrue(DiamondPolicy.valid(500, action: .exchange, wallet: wallet, hasAccount: false))
        XCTAssertFalse(DiamondPolicy.valid(501, action: .exchange, wallet: wallet, hasAccount: true))
        XCTAssertFalse(DiamondPolicy.valid(99, action: .payout, wallet: wallet, hasAccount: true))
        XCTAssertFalse(DiamondPolicy.valid(100, action: .payout, wallet: wallet, hasAccount: false))
        XCTAssertTrue(DiamondPolicy.valid(100, action: .payout, wallet: wallet, hasAccount: true))
        XCTAssertEqual(500 * wallet.int("gold_per_diamond"), 5000)
        XCTAssertEqual(DiamondPolicy.payoutPreview(gross: 50_000).tax, 1650)
        XCTAssertEqual(DiamondPolicy.payoutPreview(gross: 10_000).net, 10_000)
    }
    @MainActor func testDiamondLostAcknowledgementRetriesSameIDAfterReopening() async throws {
        let root = try folder(); defer { try? FileManager.default.removeItem(at: root) }
        let owner = UUID().uuidString
        var balance = 550.125, applied = Set<String>(), requests: [String] = []
        MockURLProtocol.handler = { request in
            if request.httpMethod == "POST" {
                let body = try Self.body(request), key = body.string("request_id")
                XCTAssertEqual(body.int("diamonds"), 500)
                requests.append(key)
                if applied.insert(key).inserted { balance -= 500 }
                if requests.count == 1 { throw URLError(.networkConnectionLost) }
                return (201, try JSONSerialization.data(withJSONObject: ["ok": true, "gold": 5000, "wallet": Self.wallet(balance)]))
            }
            return (200, try JSONSerialization.data(withJSONObject: request.url!.path == "/api/diamonds" ? Self.wallet(balance) : ["account": NSNull(), "banks": []]))
        }
        let first = DiamondWallet(api: api(), receipts: root); first.bind(owner); await first.load()
        let failed = await first.perform(action: .exchange, amount: 500)
        XCTAssertFalse(failed); XCTAssertNotNil(first.pending)
        let reopened = DiamondWallet(api: api(), receipts: root); reopened.bind(owner)
        XCTAssertEqual(reopened.pending?.id, first.pending?.id)
        let changed = await reopened.perform(action: .exchange, amount: 501)
        XCTAssertFalse(changed); XCTAssertEqual(requests.count, 1)
        let retried = await reopened.perform(action: .exchange, amount: 500)
        XCTAssertTrue(retried); XCTAssertEqual(requests[0], requests[1]); XCTAssertEqual(applied.count, 1)
        XCTAssertEqual(reopened.wallet?.number("available"), 50.125); XCTAssertNil(reopened.pending)
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty)
    }
    @MainActor func testDiamondConflictRefreshesBalanceAndReadFailureRemainsUnknown() async throws {
        let root = try folder(); defer { try? FileManager.default.removeItem(at: root) }
        var balance = 500.0, failLoad = false
        MockURLProtocol.handler = { request in
            if request.httpMethod == "POST" { balance = 20; return (409, Data("{\"error\":\"잔액이 바뀌었어요\"}".utf8)) }
            if request.url!.path == "/api/diamonds" {
                if failLoad { throw URLError(.notConnectedToInternet) }
                return (200, try JSONSerialization.data(withJSONObject: Self.wallet(balance)))
            }
            return (200, Data("{\"account\":null}".utf8))
        }
        let store = DiamondWallet(api: api(), receipts: root); store.bind("conflict-owner"); await store.load()
        let result = await store.perform(action: .exchange, amount: 500)
        XCTAssertFalse(result); XCTAssertNil(store.pending); XCTAssertEqual(store.wallet?.number("available"), 20)
        failLoad = true; await store.load(); XCTAssertNil(store.wallet); XCTAssertNotNil(store.error)
    }
    @MainActor func testDiamondAccountChangeClearsPrivateStateAndCannotReplayOtherOwner() async throws {
        let root = try folder(); defer { try? FileManager.default.removeItem(at: root) }
        var posts = 0
        MockURLProtocol.handler = { request in
            if request.httpMethod == "POST" { posts += 1; throw URLError(.timedOut) }
            let response: [String: Any]
            if request.url!.path == "/api/diamonds" { response = Self.wallet(500) }
            else { response = ["account": ["holder": "테스트", "bank": "테스트 은행", "account": "****0000"]] }
            return (200, try JSONSerialization.data(withJSONObject: response))
        }
        let store = DiamondWallet(api: api(), receipts: root); store.bind("owner-a"); await store.load()
        _ = await store.perform(action: .payout, amount: 100)
        let first = store.pending?.id
        store.bind("owner-b"); XCTAssertNil(store.wallet); XCTAssertNil(store.account); XCTAssertNil(store.pending)
        let result = await store.perform(action: .payout, amount: 100)
        XCTAssertFalse(result); XCTAssertEqual(posts, 1)
        store.bind("owner-a"); XCTAssertEqual(store.pending?.id, first)
    }
    func testChatKeepsOlderReadingPositionUntilUserReturnsOrSends() {
        var policy = ChatScrollPolicy()
        XCTAssertTrue(policy.followsLatest)
        policy.userScrolled(distanceFromBottom: 450)
        XCTAssertFalse(policy.followsLatest)
        // Arrival/layout changes read followsLatest and do not reset this state.
        policy.userScrolled(distanceFromBottom: 90)
        XCTAssertTrue(policy.followsLatest)
        policy.userScrolled(distanceFromBottom: 900); policy.sentMessage()
        XCTAssertTrue(policy.followsLatest)
    }
    func testSmallAndAIAvatarsNeverDisplayPlayerLevels() {
        XCTAssertFalse(PlayerAvatarStyle.showsLevel(kind: "producer", size: 64, enabled: true))
        XCTAssertFalse(PlayerAvatarStyle.showsLevel(kind: "producer", size: 120, enabled: false))
        XCTAssertFalse(PlayerAvatarStyle.showsLevel(kind: "artist", size: 256, enabled: true))
        XCTAssertTrue(PlayerAvatarStyle.showsLevel(kind: "producer", size: 80, enabled: true))
        XCTAssertEqual(PlayerAvatarStyle.level(0), 1); XCTAssertEqual(PlayerAvatarStyle.level(100), 2)
    }
}
