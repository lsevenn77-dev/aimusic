import XCTest
import UIKit
@testable import AIFECT

final class OctoberParityTests: XCTestCase {
    override func tearDown() { MockURLProtocol.handler = nil; super.tearDown() }
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
    func testArtistGalleryAcceptsOnlyReturnedSameOriginPhotoPath() throws {
        let photo = try XCTUnwrap(ArtistGalleryPhoto(["id": "one", "url": "/media/artist-gallery/one?v=current"]))
        XCTAssertEqual(photo.url.query, "v=current")
        XCTAssertNil(ArtistGalleryPhoto(["id": "one", "url": "https://example.com/one"]))
        XCTAssertNil(ArtistGalleryPhoto(["id": "one", "url": "/media/artist-gallery/two?v=current"]))
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
