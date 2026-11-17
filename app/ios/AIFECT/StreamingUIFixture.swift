#if DEBUG
import UIKit

/// Simulator-only responses, reached only through FeedbackUIFixture's transport.
/// No production account, chat, payment or microphone is used by these checks.
enum StreamingUIFixture {
    static var liked = false
    static var artistFollowed = false
    static var dmRead = false
    static var dmCleared = false
    static var claimedDubbingRole = ProcessInfo.processInfo.arguments.contains("-dubbing-management")
    static var dubbingSubmitted = false
    static var removedDubbingProject = false
    static var performanceID: String?
    static var studioArtist: [String: Any] = ["id": "fixture-artist", "name": "검증 아티스트", "genre": "Ballad", "bio": "밤의 음악"]
    static var createdPlaylist: [String: Any]?
    static var ownedGiftRequest: String?
    static var shopOrders = Set<String>()
    static var shopStoredFrame = false
    static var shopFrameUsed = false
    static var studioTrack: [String: Any] = original.merging(["status": "published", "kind": "original", "ai_tool": "검증 도구", "lyrics_mode": "synced", "lyrics": "[00:00.000] 검증 가사", "artist_id": "none", "performance_mode": "solo"]) { _, value in value }
    static var libraryPlaylists: [[String: Any]] { [playlist] + (createdPlaylist.map { [$0] } ?? []) }
    static let original: [String: Any] = ["id": "fixture-original", "title": "검증용 밤의 산책", "producer": "테스트 음악가", "producer_id": "fixture-profile", "producer_image_version": "fixture", "has_cover": 1, "cover_version": "fixture", "duration": 20, "genre": "Ballad", "karaoke_ready": true, "chart_rank": 1, "chart_movement": "up", "rank_change": 2]
    static let cover: [String: Any] = ["id": "fixture-duet", "title": "함께 부르는 검증용 멜로디", "producer": "듀엣 검증 가수", "producer_id": "fixture-profile", "producer_image_version": "fixture", "user_id": "other", "kind": "cover", "cover_mode": "duet", "duet_open": 1, "original_id": "fixture-original", "duration": 20, "plays": 128, "likes": 24, "comments": 3, "description": "새로운 목소리를 기다려요"]
    static var playlist: [String: Any] = ["id": "fixture-playlist", "name": "검증용 플레이리스트", "user_id": "fixture-user", "tracks": 1, "active": true]
    static var playlistTracks: [[String: Any]] = [original]
    static var crewRows: [[String: Any]] {
        [["id": "crew-tide", "name": "파도", "rank": 1, "level": 5, "members": 15, "rank_change": 1],
         ["id": "crew-summer", "name": "여름밤", "rank": 2, "level": 4, "members": 11, "previous_rank": 1],
         ["id": "crew-star", "name": "별빛", "rank": 3, "level": 3, "members": 8, "chart_movement": "new"],
         FeedbackURLProtocol.crew.merging(["rank": 4]) { _, value in value }]
    }
    static func response(_ request: URLRequest, body: [String: Any]) -> (Int, String, Data)? {
        let path = request.url!.path
        let args = ProcessInfo.processInfo.arguments
        if path.hasPrefix("/assets/home-banners/"), let name = path.split(separator: "/").last?.replacingOccurrences(of: "-768.webp", with: ""), let bytes = UIImage(named: "HomePromotion-" + name)?.pngData() {
            return (200, "image/png", bytes)
        }
        if path.hasSuffix("/poster") || path.hasPrefix("/assets/dubbing-genres/") || path.hasPrefix("/assets/genres/") || path.hasPrefix("/assets/chat-stickers/") {
            return (200, "image/png", UIImage(named: "CommunityStudio")?.pngData() ?? Data())
        }
        if path.hasPrefix("/media/"), !path.hasSuffix("/mr") && !path.hasSuffix("/stream") {
            return (200, "image/png", UIImage(named: "CommunityStudio")?.pngData() ?? Data())
        }
        var result: [String: Any]
        var status = 200
        switch path {
        case "/api/gold" where args.contains("-shop-parity"):
            result = ["balance": FeedbackURLProtocol.gold, "free": ["balance": FeedbackURLProtocol.stars], "gifts": [["id": "rose", "name": "장미", "gold": 20, "image": "/media/gift/rose"]], "silver_gifts": [["id": "star", "name": "응원별", "silver": 1, "free": true, "image": "/media/gift/star"]]]
        case "/api/decorations":
            result = ["products": [["sku": "fixture-frame-shop", "kind": "PROFILE_FRAME", "name": "검증 달빛 액자", "assetPaths": ["thumbnail": "/media/decoration/moon"], "periodPrices": ["P7D": 50, "P1M": 90, "P3M": 200]], ["sku": "fixture-theme-shop", "kind": "TALKING_ROOM_THEME", "name": "검증 밤바다", "assetPaths": ["roomCard": "/media/decoration/ocean"], "periodPrices": ["P7D": 70]]], "periods": ["P7D": "7일", "P1M": "1개월", "P3M": "3개월"]]
        case "/api/me/gift-inventory/buy" where args.contains("-shop-parity"):
            guard body.string("gift_type") == "rose", body.int("quantity") == 2, !body.string("request_id").isEmpty else { return (400, "application/json", Data()) }
            let first = shopOrders.insert(body.string("request_id")).inserted
            if first { FeedbackURLProtocol.gold -= 40; status = 503; result = ["error": "구매 응답을 확인하지 못했어요."] }
            else { result = ["ok": true] }
        case "/api/decorations/buy" where args.contains("-shop-parity"):
            guard body.string("sku") == "fixture-frame-shop", body.string("period") == "P1M", !body.string("request_id").isEmpty else { return (400, "application/json", Data()) }
            if shopOrders.insert(body.string("request_id")).inserted { FeedbackURLProtocol.gold -= 90; shopStoredFrame = true }
            result = ["ok": true]
        case "/api/me/player" where args.contains("-shop-parity"):
            let item: [String: Any] = ["id": "fixture-stock", "source": shopFrameUsed ? "decoration" : "decoration_stock", "stored": !shopFrameUsed, "available": true, "equipped": shopFrameUsed, "period_code": "P1M", "product": ["sku": "fixture-frame-shop", "kind": "PROFILE_FRAME", "name": "검증 달빛 액자", "assetPaths": ["thumbnail": "/media/decoration/moon"]]]
            result = FeedbackURLProtocol.playerData.merging(["stored_decorations": shopStoredFrame && !shopFrameUsed ? [item] : [], "decorations": shopFrameUsed ? [item] : []]) { _, value in value }
        case "/api/decorations/inventory/fixture-stock/use" where args.contains("-shop-parity"):
            guard !body.string("request_id").isEmpty, shopStoredFrame else { return (400, "application/json", Data()) }
            shopFrameUsed = true; result = ["ok": true]
        case "/api/me": result = ["user": args.contains("-streaming-guest") ? NSNull() : ["id": "fixture-user", "name": "검증 계정"], "providers": ["google", "apple", "kakao"]]
        case "/api/catalog", "/api/search":
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
            if query.contains(where: { $0.name == "section" && $0.value == "producers" }) || path == "/api/search" {
                result = ["producers": [["id": "fixture-peer", "user_id": "peer-user", "name": "선물 받을 친구"]]]
            } else if args.contains("-home-density") { result = ["tracks": (0..<5).map { n in original.merging(["id": "density-\(n)", "title": ["한 입만", "DDALGAK", "별일 아닌 것처럼", "어서 오세요", "휴먼 에러"][n], "producer": ["유이현", "Sasha Lindqvist", "Vibe", "MC.AI", "MC.AI"][n], "plays": 10 + n, "likes": n, "comments": n]) { _, value in value } }]
            } else { result = ["tracks": args.contains("-playlist-management") || query.contains(where: { $0.name == "chart" && $0.value == "newcomers" }) ? [original, cover] : [original], "chart": ["comparison": ["available": true]]] }
        case "/api/studio":
            result = ["producer": ["id": "fixture-own-profile", "name": "검증 계정"], "tracks": [studioTrack], "artists": args.contains("-studio-parity") ? [studioArtist] : [], "upload_quota": ["used": 1, "limit": 3, "remaining": 2]]
        case "/api/studio/tracks/fixture-original":
            if request.httpMethod == "PUT" {
                guard body.string("lyrics_mode") == "synced", body.string("ai_tool") == "검증 도구", body.string("lyrics") == "[00:00.000] 검증 가사" else { return (400, "application/json", Data("{\"error\":\"수정하지 않은 메타데이터가 변경됐습니다.\"}".utf8)) }
                studioTrack = studioTrack.merging(body) { _, value in value }
            }
            result = ["profile": studioTrack, "karaoke": ["mr_ready": true], "alignment": ["state": "ready"]]
        case "/api/studio/artists/fixture-artist" where request.httpMethod == "PUT":
            guard body.string("name") == "검증 아티스트 수정" else { return (400, "application/json", Data()) }
            studioArtist = studioArtist.merging(body) { _, value in value }; result = ["ok": true]
        case "/api/studio/tracks/fixture-original/karaoke" where request.httpMethod == "POST": result = ["ok": true]
        case "/api/me/gift-inventory": result = ["items": ownedGiftRequest == nil ? [["id": "fixture-gift", "gift_type": "rose", "gift_name": "장미", "available": true, "image": "/media/gift/rose"]] : []]
        case "/api/me/gift-inventory/fixture-gift/send":
            guard request.httpMethod == "POST", body.string("profile_id") == "fixture-peer", !body.string("request_id").isEmpty else { return (400, "application/json", Data()) }
            if let previous = ownedGiftRequest, previous != body.string("request_id") { return (409, "application/json", Data()) }
            let first = ownedGiftRequest == nil; ownedGiftRequest = body.string("request_id")
            if first && args.contains("-owned-gift-retry") { status = 503; result = ["error": "응답 확인이 지연됐어요. 같은 요청으로 다시 확인해주세요."] }
            else { result = ["ok": true] }
        case "/api/producers/fixture-own-profile/gifts" where request.httpMethod == "GET": result = ["total_gold": 30, "free_count": 7, "support_ranking": []]
        case "/api/community": result = ["tracks": [cover, original]]
        case "/api/voice/status": result = ["enabled": true]
        case "/api/voice/options":
            result = ["themes": [["sku": "basic_dark", "name": "턴테이블", "selectable": true], ["sku": "basic_light", "name": "헤드폰", "selectable": true], ["sku": "navy", "name": "이전 기본 테마", "selectable": true], ["sku": "theme_expired", "name": "만료된 테마", "selectable": false]], "preferred_theme": "missing", "crews": [], "suggested_titles": ["karaoke": "검증용 노래방", "talk": "검증용 토킹룸"]]
        case "/api/voice/rooms" where request.httpMethod == "POST":
            guard body.string("theme_sku") == "basic_light", body.string("background") == "basic_light", body.int("max_members") == 29, body.string("visibility") == "public" else { return (400, "application/json", Data("{\"error\":\"방 설정이 일치하지 않습니다.\"}".utf8)) }
            result = ["room": ["id": "fixture-created-room"]]
        case "/api/voice/public-rooms": result = ["rooms": [["id":"fixture-talk","mode":"talk","title":"테스트 토킹룸"]]]
        case "/api/community/rankings":
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let isCrew = query.contains { $0.name == "category" && $0.value == "crew" }
            result = ["rows": isCrew && args.contains("-crew-parity") ? crewRows : []]
        case "/api/crews" where args.contains("-crew-parity"):
            result = ["crews": crewRows, "mine": args.contains("-crew-nonmember") ? NSNull() : "fixture-crew" as Any]
        case "/api/crews/fixture-crew" where args.contains("-crew-parity"):
            result = ["crew": FeedbackURLProtocol.crew.merging(["progress": 0.35]) { _, value in value },
                      "tracks": [original, cover], "members": [["id": "fixture-peer", "name": "봄밤", "role": "owner"]],
                      "membership": ["role": "member"]]
        case "/api/crews/fixture-crew/games" where args.contains("-crew-parity"):
            result = ["games": CrewGame.allCases.map { ["id": $0.rawValue, "route": "game/\($0.rawValue)/fixture-crew"] }]
        case "/api/dubbing/projects/fixture-project/claims/guide" where request.httpMethod == "DELETE":
            guard claimedDubbingRole, body.int("revision") == 2 else { return (409, "application/json", Data()) }
            claimedDubbingRole = false; result = ["released": true]
        case "/api/dubbing/projects/fixture-project/performances":
            guard body.string("roleId") == "guide", UUID(uuidString: body.string("id")) != nil else { return (400, "application/json", Data()) }
            performanceID = body.string("id"); result = ["id": "fixture-performance"]
        case "/api/dubbing/projects/fixture-project" where request.httpMethod == "DELETE":
            guard body.int("revision") == (claimedDubbingRole ? 2 : 1) else { return (409, "application/json", Data()) }
            removedDubbingProject = true; result = ["deleted": true]
        case "/api/dubbing/projects/fixture-project", "/api/dubbing/projects/fixture-performance":
            let lines: [[String: Any]] = (1...6).map { index in
                ["id": "line-\(index)", "order": index, "roleId": index % 2 == 1 ? "guide" : "guest",
                 "sceneId": "scene_1", "durationSeconds": 3, "gapSeconds": 1, "emotion": "자연스럽게", "text": "예시 대사 \(index)"]
            }
            result = ["project": ["id": path.hasSuffix("fixture-performance") ? "fixture-performance" : "fixture-project", "rootId": "fixture-project", "isOwner": args.contains("-dubbing-management"), "canEdit": args.contains("-dubbing-management"), "title": path.hasSuffix("fixture-performance") ? "새 공연 검증" : "더빙 연습", "duration": 24, "ownerName": "검증 계정",
                                  "state": "recruiting", "visibility": "public", "revision": claimedDubbingRole ? 2 : 1, "recordingAvailable": true, "sound": ["id": "fixture-sound", "state": "ready"],
                                  "roles": [["id":"guide", "name":"안내자", "claimed":claimedDubbingRole, "mine":claimedDubbingRole],
                                            ["id":"guest", "name":"여행자", "claimed":true, "participant":"봄밤"]],
                                  "script": ["title": "더빙 연습", "lines": lines, "roles": [["id":"guide", "name":"안내자"], ["id":"guest", "name":"여행자"]], "scenes": [["id":"scene_1", "title":"첫 장면", "description":"막차에서"]]],
                                  "versions": args.contains("-dubbing-management") ? (1...4).map { ["id":"version-\($0)", "ownerName":"참여자 \($0)", "participants":1, "roleCount":2, "state":"recruiting"] } : [], "options": ["genres": ["일상"], "idea": "막차에서 만난 두 사람의 이야기"]]]
        case "/api/dubbing/projects/fixture-project/claims/guide" where request.httpMethod == "POST":
            guard body.int("revision") == 1 && !claimedDubbingRole else { return (409, "application/json", Data()) }
            claimedDubbingRole = true; result = ["ok": true]
        case "/api/dubbing/projects/fixture-project/background":
            return (200, "audio/wav", (try? DubbingWAV.encode(pcm: Data(count: 24 * 96000))) ?? Data())
        case "/api/dubbing/projects/fixture-project/recording", "/api/dubbing/projects/fixture-project/recording/guide/start", "/api/dubbing/projects/fixture-project/recording/guide/submit":
            if path.hasSuffix("submit") {
                guard body.flag("rightsAccepted"), body.int("revision") == 1 else { return (400, "application/json", Data()) }
                dubbingSubmitted = true
            }
            let lines: [[String: Any]] = (1...6).map { index in
                var row: [String: Any] = ["id":"line-\(index)", "roleId": index % 2 == 1 ? "guide" : "guest", "start": (index - 1) * 4, "end": (index - 1) * 4 + 3, "recordEnd": Double((index - 1) * 4) + 3.8]
                if args.contains("-dubbing-recorder") && index % 2 == 1 { row["takeId"] = "saved-\(index)"; row["duration"] = 3; row["audioUrl"] = "/api/dubbing/projects/fixture-project/background" }
                return row
            }
            result = ["lines": lines, "recording": ["roles": [["roleId":"guide", "revision":1, "state": dubbingSubmitted ? "submitted" : "draft"]]]]
        case "/api/dubbing/projects/fixture-project/comments": result = ["comments": []]
        case "/api/dubbing/generations" where args.contains("-script-cards"):
            let edit = body.object("edit"), rows = edit.objects("lines")
            guard rows.count == 1, edit.string("mode") == "natural", rows[0].string("speaker") == "A" else { return (400, "application/json", Data()) }
            result = ["id": body.string("requestId"), "state": "ready", "suggestions": [["id": rows[0].selfID, "text": "Hello, it is good to see you."]], "edit": edit, "options": body.object("options")]
        case "/api/dubbing/config": result = ["refinementAvailable": args.contains("-script-cards"), "aiAvailable": true, "quota": ["remaining": 1]]
        case "/api/dubbing/projects" where request.httpMethod == "POST":
            guard body.object("script").string("title") == "검증용 새 극본", body.object("script").objects("lines").count == 2, body.object("options").int("roleCount") == 2 else { return (400, "application/json", Data()) }
            result = ["project": ["id": "fixture-project"]]
        case "/api/dubbing/projects", "/api/play/participate": result = ["projects": [["id":"fixture-project","title":"더빙 연습","ownerName":"검증 창작자","roleCount":2,"participants":1,"state":"recruiting","duration":195,"activeCount":3,"weeklyActiveCount":2,"isOfficialOriginal":true,"beginnerRecommended":true,"genres":["판타지"],"posterUrl":"/api/dubbing/projects/fixture-project/poster?v=1"]]]
        case "/api/playlists":
            if request.httpMethod == "POST" { createdPlaylist = ["id": "fixture-created", "name": body.string("name"), "user_id": "fixture-user", "tracks": 0, "is_public": body.flag("is_public"), "active": true] }
            result = ["playlists": libraryPlaylists]
        case "/api/playlists/fixture-created": result = ["playlist": createdPlaylist ?? [:], "tracks": []]
        case "/api/discovery/profiles": result = ["profiles": [["id":"fixture-artist","name":"검증 아티스트","image_version":"fixture","followers":artistFollowed ? 4 : 3]]]
        case "/api/artists/fixture-artist/follow": artistFollowed = request.httpMethod == "PUT"; result = ["ok": true]
        case "/api/play/works": result = ["works": [original, cover]]
        case "/api/karaoke": result = ["tracks": [original]]
        case "/api/duets":
            if args.contains("-streaming-error") { status = 503; result = ["error": "듀엣 목록을 불러오지 못했어요."] }
            else { result = ["tracks": [cover]] }
        case "/api/duets/fixture-duet": result = ["track": original, "mr": "/media/fixture-original/mr", "words": FeedbackUIFixture.lyrics.map { ["s": $0.number("time"), "w": [["t": $0.string("text")]]] }, "duet": ["parent_id": "fixture-duet", "slot": "second", "part": "B", "guide": ["v": 1, "lines": ["A", "B", "both", "A", "B", "both"]]]]
        case "/api/library": result = ["follows": artistFollowed ? [["kind":"artist", "target_id":"fixture-artist"]] : [], "likes": liked ? [original] : [], "collections": args.contains("-streaming-empty") ? [] : libraryPlaylists]
        case "/api/history": result = ["tracks": args.contains("-streaming-empty") ? [] : [original]]
        case "/api/playlists/fixture-playlist":
            if request.httpMethod == "PATCH" { playlist = playlist.merging(body) { _, value in value } }
            result = ["playlist": playlist, "tracks": playlistTracks]
        case let target where target.hasPrefix("/api/playlists/fixture-playlist/tracks/"):
            let id = String(target.split(separator: "/").last ?? "")
            playlistTracks.removeAll { $0.selfID == id }
            if request.httpMethod == "PUT", let song = [original, cover].first(where: { $0.selfID == id }) { playlistTracks.append(song) }
            result = ["ok": true]
        case "/api/playlists/fixture-playlist/order":
            let ids = body["track_ids"] as? [String] ?? []
            guard Set(ids) == Set(playlistTracks.map(\.selfID)) else { return (400, "application/json", Data()) }
            playlistTracks = ids.compactMap { id in playlistTracks.first { $0.selfID == id } }; result = ["ok": true]
        case "/api/cover-rankings":
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
            if query.contains(where: { $0.name == "kind" && $0.value == "singers" }) { result = ["singers": [["id": "fixture-profile", "name": "듀엣 검증 가수", "rank": 1, "rank_likes": 24, "ranked_covers": 1]]] }
            else { result = ["tracks": [cover.merging(["rank": 1, "rank_likes": 24]) { _, value in value }]] }
        case "/api/tracks/fixture-original/like": liked = request.httpMethod != "DELETE"; result = ["ok": true]
        case "/api/tracks/fixture-original": result = ["track": original]
        case "/api/tracks/fixture-duet": result = ["track": cover]
        case "/api/dm/read-all": dmRead = true; result = ["ok": true]
        case "/api/dm":
            if request.httpMethod == "DELETE" { dmCleared = true; result = ["ok": true] }
            else { result = ["conversations": dmCleared ? [] : [["id": "fixture-peer", "name": "채팅 테스트", "image_version": "fixture", "last_message": "다음에도 같이 불러요", "updated": Date().timeIntervalSince1970 - 60, "unread": dmRead ? 0 : 1]], "crew": ["id": "fixture-crew", "name": "검증 크루", "unread": 2], "unread": dmRead || dmCleared ? 2 : 3] }
        case "/api/notifications/summary": result = ["unread": 1]
        case "/api/notifications": result = ["items": [["id": "fixture-notification", "actor_name": "듀엣 검증 가수", "actor_profile_id": "fixture-profile", "actor_image_version": "fixture", "kind": "duet", "source_title": "검증용 밤의 산책", "target": "fixture-duet", "available": 1, "created": Date().timeIntervalSince1970 - 60, "read_at": 0]], "unread": 1]
        case "/api/notifications/read": result = ["ok": true]
        case "/api/producers/fixture-own-profile": result = ["profile": ["id": "fixture-own-profile", "name": "검증 계정"], "tracks": [original], "covers": [cover]]
        default: return nil
        }
        return (status, "application/json", (try? JSONSerialization.data(withJSONObject: result)) ?? Data())
    }
}
#endif
