import XCTest
import UIKit
@testable import AIFECT

final class OctoberParityTests: XCTestCase {
    override func tearDown() { MockURLProtocol.handler = nil; MockURLProtocol.responseHeaders = nil; super.tearDown() }
    @MainActor private func api() -> API {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return API(configuration: configuration, cookie: "aifect_session=isolated-test")
    }
    private func json(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
    private static func body(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if let stream = request.httpBodyStream { stream.open(); defer { stream.close() }; var buffer = [UInt8](repeating: 0, count: 4096); while stream.hasBytesAvailable { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; data.append(buffer, count: count) } }
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }
    func testAndroidPlayerRepeatTransitionsAndQueueBoundary() {
        XCTAssertEqual(PlaybackRepeat.off.nextMode(inFullPlayer: false), .all)
        XCTAssertEqual(PlaybackRepeat.all.nextMode(inFullPlayer: false), .off)
        XCTAssertEqual(PlaybackRepeat.all.nextMode(inFullPlayer: true), .one)
        XCTAssertEqual(PlaybackRepeat.one.nextMode(inFullPlayer: true), .off)
        XCTAssertEqual(PlaybackRepeat.all.nextIndex(current: 2, count: 3, automatic: true), 0)
        XCTAssertNil(PlaybackRepeat.off.nextIndex(current: 2, count: 3, automatic: true))
        XCTAssertEqual(PlaybackRepeat.one.nextIndex(current: 0, count: 3, automatic: true), 0)
        XCTAssertEqual(PlaybackRepeat.one.nextIndex(current: 0, count: 3, automatic: false), 1)
    }
    func testCrewGameMatchesKoreanWeekAndAndroidHash() throws {
        let format = ISO8601DateFormatter()
        func active(_ time: String, _ catalog: [String: Any] = [:]) throws -> CrewGame? {
            CrewGame.active(at: try XCTUnwrap(format.date(from: time)), catalog: catalog)
        }
        let server = ["week_start": "2026-11-09", "active_game_id": "fishing"]
        XCTAssertNil(try active("2026-11-08T14:59:59Z", server))
        XCTAssertEqual(try active("2026-11-08T15:00:00Z", server), .fishing)
        XCTAssertEqual(try active("2026-11-13T14:59:59Z"), .racing)
        XCTAssertNil(try active("2026-11-13T15:00:00Z", server))
        XCTAssertEqual(try active("2026-11-15T15:00:00Z", server), .jump)
    }
    func testDubbingLineStartsRespectOrderAndPauses() {
        let rows: [[String: Any]] = [["id":"two", "order":2, "durationSeconds":4, "gapSeconds":-1],
                                     ["id":"one", "order":1, "durationSeconds":2.5, "gapSeconds":1],
                                     ["id":"three", "order":3]]
        let lines = DubbingScriptLine.timeline(rows)
        XCTAssertEqual(lines.map(\.id), ["one","two","three"])
        XCTAssertEqual(lines.map(\.start), [0,3.5,7.5])
    }
    func testGameRoutesMatchAndroidAndRequireCurrentCrew() {
        for game in CrewGame.allCases {
            let route = "game/\(game.rawValue)/crew_4"
            let space = SiteWorkspace(game: game, crew: "crew_4", route: route)
            XCTAssertEqual(space?.path, game == .jump ? "/#crew-jump/crew_4" : "/crew-\(game.rawValue)/?crew=crew_4&from=crew")
            XCTAssertNil(SiteWorkspace(game: game, crew: "other", route: route))
            XCTAssertNil(SiteWorkspace(game: game, crew: "a?b", route: "game/\(game.rawValue)/a?b"))
            XCTAssertNotNil(UIImage(named: "crew-weekly-" + game.rawValue))
        }
    }
    func testRankMovementUsesOnlyReportedHistory() {
        XCTAssertEqual(RankMovement(row: ["rank_change": NSNull()], rank: 8).change.label, "이전 순위 기록 없음")
        XCTAssertEqual(RankMovement(row: ["previous_rank": 6], rank: 8).change.text, "▼2")
        XCTAssertEqual(RankMovement(row: ["rank_change": 0, "previous_rank": 6], rank: 8).change.label, "순위 변동 없음")
        XCTAssertEqual(RankMovement(row: ["chart_movement": "new"], rank: 8).change.text, "NEW")
    }
    func testCatalogUsesServerGiftArtworkAndRejectsInvalidLocations() {
        let gift: [String: Any] = ["assetPaths": ["image": "http://example.org/old.png"], "assets": ["thumbnail": "/media/gifts/new.webp?v=2"]]
        XCTAssertEqual(CatalogArtwork.giftURL(gift)?.absoluteString, "https://aifect.co.kr/media/gifts/new.webp?v=2")
        XCTAssertEqual(CatalogArtwork.url("https://cdn.example.org/new.webp")?.host, "cdn.example.org")
        let room: [String: Any] = ["kind": "TALKING_ROOM_THEME", "assetPaths": ["roomCard": "/media/theme/new.webp"], "assets": ["roomMobile": "/media/theme/old.webp"]]
        XCTAssertEqual(CatalogArtwork.decorationURL(room)?.path, "/media/theme/new.webp")
        let decoration: [String: Any] = ["kind": "PROFILE_FRAME", "assetPaths": ["thumbnail": "http://cdn.example.org/frame.webp"], "assets": ["overlay": "/media/frame/new.webp"]]
        XCTAssertEqual(CatalogArtwork.decorationURL(decoration)?.path, "/media/frame/new.webp")
        for raw in ["//example.org/a", "relative.gif", "data:image/png,test", "/assets/%2e%2e/private", "https://user@cdn.example.org/file", "/art#section"] {
            XCTAssertNil(CatalogArtwork.url(raw), raw)
        }
    }
    func testFrameAcceptsNewAndLegacyProfileFormats() {
        let display: [String: Any] = ["overlay": "/media/frame.webp", "effect": "/media/spark.webp", "scale": 1.9]
        let frame = CatalogFrame(person: ["profile_frame_display": display, "profile_frame_artwork": "/assets/old.png"])
        XCTAssertEqual(frame.overlay?.path, "/media/frame.webp")
        XCTAssertEqual(frame.effect?.path, "/media/spark.webp")
        XCTAssertEqual(frame.scale, 1.6, accuracy: 0.001)
        let stored = CatalogFrame(person: ["profile_frame_display": #"{"overlay":"/media/frame.webp","scale":1.1}"#])
        XCTAssertEqual(stored.overlay, frame.overlay)
        XCTAssertEqual(stored.scale, 1.1, accuracy: 0.001)
        let legacy = CatalogFrame(person: ["profile_frame_artwork": "/assets/old.png"])
        XCTAssertEqual(legacy.overlay?.path, "/assets/old.png")
        XCTAssertEqual(legacy.scale, 1.26, accuracy: 0.001)
    }
    func testHistoryCannotResurrectClearedOrPreMembershipMessages() {
        let old: [[String: Any]] = [["id": "cleared", "sequence": 4], ["id": "keep", "sequence": 9, "body": "old"]]
        let incoming: [[String: Any]] = [["id": "cleared", "sequence": 4], ["id": "keep", "sequence": 9, "body": "updated"], ["id": "new", "sequence": 11]]
        let merged = ChatHistory.merge(old, incoming: incoming, minimum: 9)
        XCTAssertEqual(merged.map { $0.string("id") }, ["keep", "new"])
        XCTAssertEqual(merged[0].string("body"), "updated")
        XCTAssertEqual(ChatHistory.merge(merged, incoming: [], minimum: 12).count, 0)
    }
    func testPrivatePhotoExpiresAtBoundary() {
        let photo: [String: Any] = ["image_id": "private", "image_expires": 2000]
        XCTAssertTrue(ChatHistory.imageAvailable(photo, now: Date(timeIntervalSince1970: 1999)))
        XCTAssertFalse(ChatHistory.imageAvailable(photo, now: Date(timeIntervalSince1970: 2000)))
        XCTAssertFalse(ChatHistory.imageAvailable(["image_id": "missing-expiry"]))
    }
    func testWebPEncoderWritesValidBoundedFileAndRejectsNonImage() throws {
        let source = UIGraphicsImageRenderer(size: CGSize(width: 1800, height: 900)).image { context in
            UIColor.systemPink.setFill(); context.fill(CGRect(x: 0, y: 0, width: 1800, height: 900))
        }
        let webp = try ChatImageEncoder.encode(XCTUnwrap(source.pngData()))
        XCTAssertEqual(String(data: webp.prefix(4), encoding: .ascii), "RIFF")
        XCTAssertEqual(String(data: webp[8..<12], encoding: .ascii), "WEBP")
        XCTAssertLessThanOrEqual(webp.count, 5 * 1024 * 1024)
        let decoded = try XCTUnwrap(UIImage(data: webp))
        XCTAssertLessThanOrEqual(max(decoded.size.width, decoded.size.height), 1600)
        XCTAssertThrowsError(try ChatImageEncoder.encode(Data("not an image".utf8)))
    }
    @MainActor func testFailedMessageRetryKeepsRequestAndComposedKorean() async throws {
        let room = ChatRoom(owner: "test", path: "/api/dm/peer", crew: false, api: api())
        var posts: [[String: Any]] = []
        MockURLProtocol.handler = { request in
            if request.httpMethod == "POST" { posts.append(try Self.body(request)); if posts.count == 1 { throw URLError(.networkConnectionLost) } }
            return (200, Data("{\"settings\":{\"cleared_sequence\":0},\"messages\":[]}".utf8))
        }
        room.start(); defer { room.stop(); ChatCache.removeAll(owner: "test") }
        room.text = "  한글 조합 완성  "
        await room.send()
        XCTAssertNotNil(room.pending); XCTAssertNotNil(room.error)
        XCTAssertEqual(room.text, "  한글 조합 완성  ")
        await room.send()
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts[0].string("request_id"), posts[1].string("request_id"))
        XCTAssertEqual(posts[1].string("body"), "한글 조합 완성")
        XCTAssertNil(room.pending); XCTAssertEqual(room.text, "")
    }
    @MainActor func testPhotoUploadUsesAuthenticatedWebPAndRetryDoesNotUploadAgain() async throws {
        let room = ChatRoom(owner: "photo-test", path: "/api/dm/peer", crew: false, api: api())
        var uploads = 0, posts: [[String: Any]] = []
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "aifect_session=isolated-test")
            if request.url?.path == "/api/dm/peer/images" {
                uploads += 1; XCTAssertEqual(request.httpMethod, "PUT"); XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "image/webp")
                return (201, Data("{\"id\":\"private-photo\",\"expires\":2000000000}".utf8))
            }
            if request.httpMethod == "POST" { posts.append(try Self.body(request)); if posts.count == 1 { throw URLError(.networkConnectionLost) } }
            return (200, Data("{\"settings\":{},\"messages\":[]}".utf8))
        }
        room.start(); defer { room.stop(); ChatCache.removeAll(owner: "photo-test") }
        room.text = "아직 보내지 않은 글"
        let image = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { $0.fill(CGRect(x: 0, y: 0, width: 10, height: 10)) }
        await room.sendPhoto(try XCTUnwrap(image.pngData()))
        XCTAssertEqual(room.pending?.imageID, "private-photo")
        await room.send()
        XCTAssertEqual(uploads, 1); XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts[0].string("request_id"), posts[1].string("request_id"))
        XCTAssertEqual(posts[1].string("image_id"), "private-photo")
        XCTAssertEqual(room.text, "아직 보내지 않은 글")
    }
    @MainActor func testDMDeletionMuteAndReadUseCorrectMethods() async throws {
        let owner = UUID().uuidString
        let room = ChatRoom(owner: owner, path: "/api/dm/peer", crew: false, api: api())
        var cleared = false, methods: [String] = []
        MockURLProtocol.handler = { request in
            methods.append("\(request.httpMethod!) \(request.url!.path)")
            if request.httpMethod == "DELETE" { cleared = true; return (200, Data("{}".utf8)) }
            if request.httpMethod == "PUT" { XCTAssertTrue(try Self.body(request).flag("muted")); return (200, Data("{\"muted\":true}".utf8)) }
            if request.httpMethod == "PATCH" { return (200, Data("{}".utf8)) }
            return (200, try self.json(["settings": ["cleared_sequence": cleared ? 10 : 0], "messages": [["id": "old", "sequence": 10, "body": "old"]]]))
        }
        room.start(); defer { room.stop(); ChatCache.removeAll(owner: owner) }
        await room.load(); XCTAssertEqual(room.messages.count, 1)
        await room.toggleMute(); XCTAssertTrue(room.muted)
        await room.clear(); XCTAssertTrue(room.messages.isEmpty)
        XCTAssertTrue(ChatCache.read(owner: owner, path: room.path).isEmpty)
        await room.load(); XCTAssertTrue(room.messages.isEmpty)
        XCTAssertTrue(methods.contains("PATCH /api/dm/peer")); XCTAssertTrue(methods.contains("DELETE /api/dm/peer"))
        XCTAssertTrue(methods.contains("PUT /api/dm/peer/settings"))
    }
    @MainActor func testCrewReadBoundaryAndSettings() async throws {
        let room = ChatRoom(owner: "crew-test", path: "/api/crews/c/messages", crew: true, api: api())
        var boundary = 10, reads: [Int] = []
        MockURLProtocol.handler = { request in
            if request.url!.path == "/api/crews/c/read" { reads.append(try Self.body(request).int("sequence")); return (200, Data("{}".utf8)) }
            if request.url!.path == "/api/crews/c/settings" { return (200, Data("{\"muted\":true}".utf8)) }
            return (200, try self.json(["membership": ["joined_sequence": boundary], "messages": [["id": "before", "sequence": 9], ["id": "valid", "sequence": 12]]]))
        }
        room.start(); defer { room.stop(); ChatCache.removeAll(owner: "crew-test") }
        await room.load(); XCTAssertEqual(room.messages.map { $0.string("id") }, ["valid"]); XCTAssertEqual(reads, [12])
        await room.toggleMute(); XCTAssertTrue(room.muted)
        boundary = 20; await room.load(); XCTAssertTrue(room.messages.isEmpty)
        await room.load(); XCTAssertTrue(room.messages.isEmpty); XCTAssertEqual(reads, [12])
    }
    @MainActor func testStoppedAccountDoesNotSendAndClearsPrivateViewState() async {
        let room = ChatRoom(owner: "old", path: "/api/dm/peer", crew: false, api: api())
        MockURLProtocol.handler = { _ in XCTFail("Stopped account must not send"); return (200, Data("{}".utf8)) }
        room.start(); room.text = "private"; room.stop(); await room.send()
        XCTAssertEqual(room.text, ""); XCTAssertNil(room.pending); XCTAssertTrue(room.messages.isEmpty)
    }
    @MainActor func testFreshRecordingOnlyResumesExplicitDraft() {
        let song = Song(["id": "same-song"])
        let draft = RecordingDraft(id: UUID().uuidString, owner: "one", song: song, date: Date(), length: 42)
        let fresh = RecordingStudio(song: song, owner: "one")
        XCTAssertNil(fresh.draft); XCTAssertEqual(fresh.elapsed, 0)
        let resumed = RecordingStudio(song: song, owner: "one", draft: draft)
        XCTAssertEqual(resumed.draft?.id, draft.id); XCTAssertEqual(resumed.elapsed, 42)
    }
    @MainActor func testDisplayNameRoutesGiftRecipientAndInAppPacksStaySeparate() {
        let profile: [String: Any] = ["name": "코코", "display_name": "코코(양꼬치)"]
        XCTAssertEqual(profile.displayName(), "코코(양꼬치)"); XCTAssertEqual(profile.string("name"), "코코")
        for kind in ["crew", "person_gift"] { XCTAssertEqual(PushDestination(["kind": kind, "target": "id", "recipient": "owner"])?.target, "id") }
        let one = GiftRequest(owner: "owner", path: GiftRecipient(id: "one", name: "A").path, giftType: "star")
        let two = GiftRequest(owner: "owner", path: GiftRecipient(id: "two", name: "B").path, giftType: "star")
        XCTAssertEqual(one.path, "/api/producers/one/gifts"); XCTAssertNotEqual(one.path, two.path); XCTAssertNotEqual(one.id, two.id)
        XCTAssertEqual(StorePayments.goldIDs, [500, 1000, 5000, 10000].map { "kr.co.aifect.app.gold.\($0)" })
    }
    @MainActor func testArtworkUsesSessionAndVersionedURLAndCachesSuccessOnly() async throws {
        let repository = ArtworkRepository(api: api())
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 10)).image { $0.fill(CGRect(x: 0, y: 0, width: 20, height: 10)) }
        let webp = try ChatImageEncoder.encode(XCTUnwrap(image.pngData()))
        var attempts = 0
        MockURLProtocol.handler = { request in
            attempts += 1
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "aifect_session=isolated-test")
            XCTAssertEqual(request.url?.query, "v=version-one")
            if attempts == 1 { return (503, Data("{}".utf8)) }
            return (200, webp)
        }
        let url = try Endpoint.url("/media/song/cover?v=version-one")
        do { _ = try await repository.image(at: url); XCTFail("503 must not become an image") } catch {}
        let decoded = try await repository.image(at: url)
        XCTAssertGreaterThan(decoded.size.width, 0)
        _ = try await repository.image(at: url)
        XCTAssertEqual(attempts, 2)
        do { _ = try await repository.image(at: XCTUnwrap(URL(string: "https://example.com/secret"))); XCTFail("Foreign origin must be rejected") } catch {}
        XCTAssertEqual(attempts, 2)
    }
    @MainActor func testArtworkDoesNotReusePreviousAccountCache() async throws {
        let client = api()
        let isolated = ArtworkRepository(api: client)
        let png = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { $0.fill(CGRect(x: 0, y: 0, width: 10, height: 10)) }.pngData()!
        var cookies: [String] = []
        MockURLProtocol.handler = { request in cookies.append(request.value(forHTTPHeaderField: "Cookie") ?? ""); return (200, png) }
        let url = try Endpoint.url("/media/song/cover?v=one")
        _ = try await isolated.image(at: url)
        client.clearSession()
        _ = try await isolated.image(at: url)
        XCTAssertEqual(cookies, ["aifect_session=isolated-test", ""])
    }
    @MainActor func testArtworkCoalescesConcurrentRequestsAndDownsamplesThumbnails() async throws {
        let repository = ArtworkRepository(api: api())
        let png = UIGraphicsImageRenderer(size: CGSize(width: 2048, height: 1024)).image { $0.fill(CGRect(x: 0, y: 0, width: 2048, height: 1024)) }.pngData()!
        let requests = NSLock()
        var count = 0
        MockURLProtocol.handler = { _ in requests.lock(); count += 1; requests.unlock(); return (200, png) }
        let url = try Endpoint.url("/media/song/shared-cover?v=one")
        let images = try await withThrowingTaskGroup(of: UIImage.self, returning: [UIImage].self) { group in
            for _ in 0..<12 { group.addTask { try await repository.image(at: url, maxPixelSize: 192) } }
            var images: [UIImage] = []
            for try await image in group { images.append(image) }
            return images
        }
        XCTAssertEqual(images.count, 12)
        XCTAssertEqual(count, 1, "Visible rows must share one image request and decode")
        for image in images { XCTAssertLessThanOrEqual(image.size.width * image.scale, 192) }
        let large = try await repository.image(at: url, maxPixelSize: 1024)
        XCTAssertGreaterThan(large.size.width * large.scale, 192)
        XCTAssertLessThanOrEqual(large.size.width * large.scale, 1024)
        XCTAssertEqual(count, 1, "Opening a larger cover must reuse the original bytes")
    }

    @MainActor func testArtworkSharesDownloadsAcrossConcurrentSizesAndRetriesInvalidBytes() async throws {
        let repository = ArtworkRepository(api: api())
        let png = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 1200)).image { $0.fill(CGRect(x: 0, y: 0, width: 1200, height: 1200)) }.pngData()!
        let lock = NSLock()
        var count = 0
        MockURLProtocol.handler = { _ in lock.lock(); count += 1; let attempt = count; lock.unlock(); return (200, attempt == 1 ? Data("invalid image".utf8) : png) }
        let url = try Endpoint.url("/media/mixed-size/cover?v=one")
        do { _ = try await repository.image(at: url); XCTFail("Invalid bytes must not be cached") } catch {}
        try await withThrowingTaskGroup(of: Void.self) { group in
            for size in [160, 192, 256, 384, 512, 1024, 160, 512] {
                group.addTask {
                    let image = try await repository.image(at: url, maxPixelSize: size)
                    XCTAssertLessThanOrEqual(image.size.width * image.scale, CGFloat(size))
                    XCTAssertGreaterThan(image.size.width * image.scale, CGFloat(size) / 2)
                }
            }
            try await group.waitForAll()
        }
        XCTAssertEqual(count, 2, "One failed response followed by one shared download for all sizes")
    }

    @MainActor func testPublicArtworkSurvivesNewRepositoryButVersionChangeDownloadsAgain() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("artwork-test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let publicCache = PublicArtworkCache(directory: directory)
        let client = api()
        let png = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32)).image { $0.fill(CGRect(x: 0, y: 0, width: 32, height: 32)) }.pngData()!
        var count = 0
        MockURLProtocol.responseHeaders = ["Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable", "Vary": "X-Aifect-Image-Mirror", "Set-Cookie": "__cf_bm=test-cdn-cookie; Path=/; Secure; HttpOnly"]
        MockURLProtocol.handler = { _ in count += 1; return (200, png) }
        let url = try Endpoint.url("/media/persisted-cover/cover?v=one")
        _ = try await ArtworkRepository(api: client, publicCache: publicCache).image(at: url)
        let stored = await publicCache.load(url)
        XCTAssertEqual(stored?.0, png)
        XCTAssertNil(stored?.1.value(forHTTPHeaderField: "Set-Cookie"), "CDN cookies must not be stored with public artwork")
        _ = try await ArtworkRepository(api: client, publicCache: PublicArtworkCache(directory: directory)).image(at: url, maxPixelSize: 192)
        XCTAssertEqual(count, 1, "A new repository must reuse the public disk cache")
        _ = try await ArtworkRepository(api: client, publicCache: publicCache).image(at: Endpoint.url("/media/persisted-cover/cover?v=two"))
        XCTAssertEqual(count, 2, "A replacement cover must not reuse the old version")
    }

    func testPublicArtworkCacheExpiresAndRejectsPrivateOrPersonalizedResponses() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("artwork-policy-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = PublicArtworkCache(directory: directory)
        let url = try Endpoint.url("/media/cache-policy/cover?v=one")
        let now = Date()
        let data = Data([1, 2, 3])
        let publicResponse = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": "image/webp", "Cache-Control": "public, max-age=60", "Age": "50"]))
        await cache.store(data, response: publicResponse, for: url, now: now)
        let fresh = await cache.load(url, now: now.addingTimeInterval(9))
        XCTAssertEqual(fresh?.0, data)
        let expired = await cache.load(url, now: now.addingTimeInterval(11))
        XCTAssertNil(expired)
        for extra in [["Cache-Control": "private, max-age=60"], ["Cache-Control": "public, no-store, max-age=60"],
                      ["Cache-Control": "public, no-cache, max-age=60"], ["Cache-Control": "max-age=60"],
                      ["Vary": "Cookie"], ["Vary": "*"], ["Set-Cookie": "session=private"], ["Content-Type": "application/json"], ["Age": "60"]] {
            let headers = ["Content-Type": "image/webp", "Cache-Control": "public, max-age=60"].merging(extra) { _, new in new }
            let response = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers))
            XCTAssertNil(PublicArtworkCache.lifetime(response), "\(extra)")
            await cache.store(data, response: response, for: url)
            let cached = await cache.load(url)
            XCTAssertNil(cached, "Private or personalized responses must never be persisted")
        }
    }

    func testArtistGalleryAcceptsOnlyReturnedSameOriginPhotoPath() throws {
        let photo = try XCTUnwrap(ArtistGalleryPhoto(["id": "one", "url": "/media/artist-gallery/one?v=current"]))
        XCTAssertEqual(photo.url.query, "v=current")
        XCTAssertNil(ArtistGalleryPhoto(["id": "one", "url": "https://example.com/one"]))
        XCTAssertNil(ArtistGalleryPhoto(["id": "one", "url": "/media/artist-gallery/two?v=current"]))
        XCTAssertNotNil(ArtistGalleryPhoto(["id": "one", "url": "/media/profile-gallery/one?v=2"], kind: "producer"))
        XCTAssertNil(ArtistGalleryPhoto(["id": "one", "url": "/media/artist-gallery/one?v=2"], kind: "producer"))
    }

    @MainActor func testConcurrentListReadsShareRequestButMutationsAndAccountsInvalidateIt() async throws {
        let client = api()
        let lock = NSLock()
        var calls = 0
        MockURLProtocol.handler = { _ in
            lock.lock(); calls += 1; lock.unlock()
            Thread.sleep(forTimeInterval: 0.05)
            return (200, Data("{\"tracks\":[]}".utf8))
        }
        try await withThrowingTaskGroup(of: Void.self) { group in
            for _ in 0..<12 { group.addTask { _ = try await client.call("/api/catalog?section=tracks", fresh: true) } }
            try await group.waitForAll()
        }
        XCTAssertEqual(calls, 1)
        _ = try await client.call("/api/catalog?section=tracks")
        XCTAssertEqual(calls, 1)
        _ = try await client.call("/api/tracks/fixture/like", method: "PUT")
        _ = try await client.call("/api/catalog?section=tracks")
        XCTAssertEqual(calls, 3)
        client.clearSession()
        XCTAssertNil(client.peek("/api/catalog?section=tracks"))
        _ = try await client.call("/api/catalog?section=tracks")
        XCTAssertEqual(calls, 4)
    }

    func testCrewNoticeManagementUsesOnlyValidatedCrewDestination() {
        XCTAssertEqual(SiteWorkspace(crewNotices: "crew_1")?.path, "/#crew/crew_1?tab=notice")
        for id in ["", "../other", "crew?tab=other", "https://other.test"] { XCTAssertNil(SiteWorkspace(crewNotices: id)) }
    }

    func testExistingRecordingSongDecodesWithoutNewDesignMetadata() throws {
        let song = Song(["id": "saved-draft", "title": "기존 초안", "has_cover": 1])
        let data = try JSONEncoder().encode(song)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        for key in ["producerName", "producerImageVersion", "descriptionText", "coverMode", "plays", "covers"] { object.removeValue(forKey: key) }
        let decoded = try JSONDecoder().decode(Song.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(decoded.id, "saved-draft"); XCTAssertEqual(decoded.title, "기존 초안")
        XCTAssertNil(decoded.plays); XCTAssertEqual(decoded.creatorName, song.credit)
    }

}
