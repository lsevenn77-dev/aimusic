#if DEBUG
import UIKit

/// Simulator-only responses, reached only through FeedbackUIFixture's transport.
/// No production account, chat, payment or microphone is used by these checks.
enum StreamingUIFixture {
    static var liked = false
    static var claimedDubbingRole = false
    static let original: [String: Any] = ["id": "fixture-original", "title": "검증용 밤의 산책", "producer": "테스트 음악가", "producer_id": "fixture-profile", "producer_image_version": "fixture", "has_cover": 1, "cover_version": "fixture", "duration": 20, "genre": "Ballad", "karaoke_ready": true, "chart_rank": 1, "chart_movement": "up", "rank_change": 2]
    static let cover: [String: Any] = ["id": "fixture-duet", "title": "함께 부르는 검증용 멜로디", "producer": "듀엣 검증 가수", "producer_id": "fixture-profile", "producer_image_version": "fixture", "user_id": "other", "kind": "cover", "cover_mode": "duet", "duet_open": 1, "original_id": "fixture-original", "duration": 20, "plays": 128, "likes": 24, "comments": 3, "description": "새로운 목소리를 기다려요"]
    static let playlist: [String: Any] = ["id": "fixture-playlist", "name": "검증용 플레이리스트", "user_id": "fixture-user", "tracks": 1, "active": true]
    static var crewRows: [[String: Any]] {
        [["id": "crew-tide", "name": "파도", "rank": 1, "level": 5, "members": 15, "rank_change": 1],
         ["id": "crew-summer", "name": "여름밤", "rank": 2, "level": 4, "members": 11, "previous_rank": 1],
         ["id": "crew-star", "name": "별빛", "rank": 3, "level": 3, "members": 8, "chart_movement": "new"],
         FeedbackURLProtocol.crew.merging(["rank": 4]) { _, value in value }]
    }
    static func response(_ request: URLRequest, body: [String: Any]) -> (Int, String, Data)? {
        let path = request.url!.path
        let args = ProcessInfo.processInfo.arguments
        if path.hasPrefix("/media/"), !path.hasSuffix("/mr") && !path.hasSuffix("/stream") {
            return (200, "image/png", UIImage(named: "CommunityStudio")?.pngData() ?? Data())
        }
        var result: [String: Any]
        var status = 200
        switch path {
        case "/api/me": result = ["user": args.contains("-streaming-guest") ? NSNull() : ["id": "fixture-user", "name": "검증 계정"], "providers": ["google", "apple", "kakao"]]
        case "/api/catalog": result = ["tracks": [original], "chart": ["comparison": ["available": true]]]
        case "/api/community": result = ["tracks": [cover, original]]
        case "/api/voice/status": result = ["enabled": true]
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
        case "/api/dubbing/projects/fixture-project":
            let lines: [[String: Any]] = (1...6).map { index in
                ["id": "line-\(index)", "order": index, "roleId": index % 2 == 1 ? "guide" : "guest",
                 "durationSeconds": 3, "gapSeconds": 1, "emotion": "자연스럽게", "text": "예시 대사 \(index)"]
            }
            result = ["project": ["id": "fixture-project", "title": "더빙 연습", "duration": 24, "ownerName": "검증 계정",
                                  "state": "recruiting", "visibility": "public", "revision": claimedDubbingRole ? 2 : 1,
                                  "roles": [["id":"guide", "name":"안내자", "claimed":claimedDubbingRole, "mine":claimedDubbingRole],
                                            ["id":"guest", "name":"여행자", "claimed":true, "participant":"봄밤"]],
                                  "script": ["lines": lines], "options": ["genres": ["일상"], "idea": "막차에서 만난 두 사람의 이야기"]]]
        case "/api/dubbing/projects/fixture-project/claims/guide" where request.httpMethod == "POST":
            guard body.int("revision") == 1 && !claimedDubbingRole else { return (409, "application/json", Data()) }
            claimedDubbingRole = true; result = ["ok": true]
        case "/api/dubbing/projects", "/api/play/participate": result = ["projects": [["id":"fixture-project","title":"더빙 연습","roleCount":2,"participants":1,"state":"recruiting"]]]
        case "/api/playlists": result = ["playlists": [playlist]]
        case "/api/discovery/profiles": result = ["profiles": [["id":"fixture-artist","name":"검증 아티스트","image_version":"fixture","followers":3]]]
        case "/api/play/works": result = ["works": [original, cover]]
        case "/api/karaoke": result = ["tracks": [original]]
        case "/api/duets":
            if args.contains("-streaming-error") { status = 503; result = ["error": "듀엣 목록을 불러오지 못했어요."] }
            else { result = ["tracks": [cover]] }
        case "/api/duets/fixture-duet": result = ["track": original, "mr": "/media/fixture-original/mr", "words": FeedbackUIFixture.lyrics.map { ["s": $0.number("time"), "w": [["t": $0.string("text")]]] }, "duet": ["parent_id": "fixture-duet", "slot": "second", "part": "B", "guide": ["v": 1, "lines": ["A", "B", "both", "A", "B", "both"]]]]
        case "/api/library": result = ["likes": liked ? [original] : [], "collections": args.contains("-streaming-empty") ? [] : [playlist]]
        case "/api/history": result = ["tracks": args.contains("-streaming-empty") ? [] : [original]]
        case "/api/playlists/fixture-playlist": result = ["playlist": playlist, "tracks": [original]]
        case "/api/tracks/fixture-original/like": liked = request.httpMethod != "DELETE"; result = ["ok": true]
        case "/api/tracks/fixture-original": result = ["track": original]
        case "/api/tracks/fixture-duet": result = ["track": cover]
        case "/api/dm": result = ["conversations": [["id": "fixture-peer", "name": "채팅 테스트", "image_version": "fixture", "last_message": "다음에도 같이 불러요", "updated": Date().timeIntervalSince1970 - 60, "unread": 1]], "crew": ["id": "fixture-crew", "name": "검증 크루", "unread": 2], "unread": 3]
        case "/api/notifications": result = ["items": [["id": "fixture-notification", "actor_name": "듀엣 검증 가수", "actor_profile_id": "fixture-profile", "actor_image_version": "fixture", "kind": "duet", "source_title": "검증용 밤의 산책", "target": "fixture-duet", "available": 1, "created": Date().timeIntervalSince1970 - 60, "read_at": 0]], "unread": 1]
        case "/api/notifications/read": result = ["ok": true]
        case "/api/producers/fixture-own-profile": result = ["profile": ["id": "fixture-own-profile", "name": "검증 계정"], "tracks": [original], "covers": [cover]]
        default: return nil
        }
        return (status, "application/json", (try? JSONSerialization.data(withJSONObject: result)) ?? Data())
    }
}
#endif
