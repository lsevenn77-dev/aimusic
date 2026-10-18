#if DEBUG
import UIKit

/// Simulator-only responses, reached only through FeedbackUIFixture's transport.
/// No production account, chat, payment or microphone is used by these checks.
enum StreamingUIFixture {
    static var liked = false
    static let original: [String: Any] = ["id": "fixture-original", "title": "검증용 밤의 산책", "producer": "테스트 음악가", "producer_id": "fixture-profile", "producer_image_version": "fixture", "has_cover": 1, "cover_version": "fixture", "duration": 20, "genre": "Ballad", "karaoke_ready": true, "chart_rank": 1, "chart_movement": "up", "rank_change": 2]
    static let cover: [String: Any] = ["id": "fixture-duet", "title": "함께 부르는 검증용 멜로디", "producer": "듀엣 검증 가수", "producer_id": "fixture-profile", "producer_image_version": "fixture", "user_id": "other", "kind": "cover", "cover_mode": "duet", "duet_open": 1, "original_id": "fixture-original", "duration": 20, "plays": 128, "likes": 24, "comments": 3, "description": "새로운 목소리를 기다려요"]
    static let playlist: [String: Any] = ["id": "fixture-playlist", "name": "검증용 플레이리스트", "user_id": "fixture-user", "tracks": 1, "active": true]
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
