import SwiftUI

struct ActivityHistoryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var filter = "전체"
    @State private var entries: [[String: Any]] = []
    @State private var next: String?
    @State private var loading = false
    @State private var error: String?
    @State private var destination: Song?
    @State private var profile: String?
    @State private var notificationWeb: NotificationWebDestination?
    private var filterKey: String { ["전체": "all", "댓글·응원": "comments", "작품·참여": "works", "아티스트": "artists", "크루·선물": "crew"][filter] ?? "all" }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if model.userID == nil { LoginPrompt(title: "내 활동 알림을 확인하세요") }
                else {
                    ParityChips(items: ["전체", "댓글·응원", "작품·참여", "아티스트", "크루·선물"], selection: $filter)
                    HStack { Text("푸시를 꺼도 알림 기록은 유지돼요.").font(.caption).foregroundStyle(.secondary); Spacer(); NavigationLink { PushSettingsView() } label: { Image(systemName: "bell.badge").frame(width: 44, height: 44) }.accessibilityLabel("알림 설정") }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                    ForEach(entries, id: \.selfID) { item in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                ProfilePhoto(person: ["id": item.string("actor_profile_id"), "image_version": item.string("actor_image_version")], size: 36, showsLevel: false)
                                VStack(alignment: .leading, spacing: 3) { Text(item.string("actor_name")).font(.subheadline.bold()); if item.number("created") > 0 { Text(activityDate(item.number("created"))).font(.caption).foregroundStyle(.secondary) } }
                                Spacer(); if item.number("read_at") == 0 { Text("NEW").font(.caption2).foregroundStyle(Brand.pink) }
                            }
                            Text(message(item)).font(.subheadline)
                            Text(item.string("source_title", fallback: "나에게 보낸 선물")).font(.caption).foregroundStyle(.secondary)
                            HStack {
                                Button(item.int("available") == 1 ? "자세히 보기" : "콘텐츠 안내") { Task { await open(item) } }.disabled(loading)
                                if item.number("read_at") == 0 { Button("읽음") { Task { await mark(item) } }.disabled(loading) }
                            }.font(.caption).frame(minHeight: 44)
                        }.padding(14).background(StreamStyle.panel, in: RoundedRectangle(cornerRadius: 16))
                    }
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    if !loading && entries.isEmpty && error == nil { ContentUnavailableView("아직 도착한 알림이 없어요", systemImage: "bell", description: Text("내 곡에 참여하거나 선물을 보내면 이곳에 표시돼요.")) }
                    if next != nil { Button("이전 알림 더 보기") { Task { await load(older: true) } }.disabled(loading) }
                }
            }.padding(14)
        }.navigationTitle("알림 기록").task(id: filter + (model.userID ?? "guest")) { await load() }.refreshable { await load() }
            .navigationDestination(item: $destination) { TrackDetailView(song: $0) }
            .navigationDestination(item: $profile) { ProfilePage(id: $0) }
            .navigationDestination(item: $notificationWeb) { NotificationWebPage(destination: $0) }
    }
    private func activityDate(_ seconds: TimeInterval) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "ko_KR"); formatter.timeZone = TimeZone(identifier: "Asia/Seoul"); formatter.dateFormat = "yyyy.MM.dd HH:mm"; return formatter.string(from: Date(timeIntervalSince1970: seconds))
    }
    private func message(_ item: [String: Any]) -> String {
        let kind = item.string("kind")
        if ["gift", "person_gift"].contains(kind) { return "\(item.string("gift_name").replacingOccurrences(of: "은화", with: "실버")) × \(max(1, item.int("quantity")))개 · \(item.int("amount")) \(item.string("currency") == "gold" ? "G" : "S")" }
        return ["cover": "내 곡으로 커버를 공개했어요.", "duet": "내 듀엣에 참여했어요.", "comment": "내 음악에 댓글이 달렸어요.", "fan_comment": "팬라운지 댓글·답글이 도착했어요.", "fan_post": "팬라운지 새 응원글이 도착했어요.", "artist_follower": "AI 아티스트의 새 팔로워가 생겼어요.", "artist_release": "팔로우한 AI 아티스트가 신곡을 공개했어요.", "crew_invite": "크루 초대를 받았어요.", "crew_approved": "크루 가입이 승인됐어요.", "crew_request": "작품 참여 요청이 도착했어요.", "dubbing_complete": "참여한 더빙이 완성됐어요.", "dubbing_participation": "더빙 참여 작품이 공개됐어요.", "work_status": "작품 공개 상태를 확인해주세요."][kind] ?? "새 알림이 도착했어요."
    }
    private func load(older: Bool = false) async {
        guard let owner = model.userID else { entries = []; return }
        let requestedFilter = filterKey
        loading = true; error = nil
        do {
            let result = try await API.shared.call("/api/notifications?filter=\(requestedFilter)" + (older ? next.map { "&before=\(Endpoint.query($0))" } ?? "" : ""))
            guard owner == model.userID, requestedFilter == filterKey, !Task.isCancelled else { return }
            var seen = Set<String>(); entries = ((older ? entries : []) + result.objects("items")).filter { seen.insert($0.selfID).inserted }
            next = (result["next"] as? String).flatMap { $0.isEmpty ? nil : $0 }; loading = false
        } catch { if owner == model.userID, requestedFilter == filterKey, !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
    }
    private func mark(_ item: [String: Any]) async {
        let owner = model.userID
        do {
            _ = try await API.shared.call("/api/notifications/read", method: "POST", body: ["ids": [item.selfID]])
            guard owner == model.userID else { return }
            if let index = entries.firstIndex(where: { $0.selfID == item.selfID }) { entries[index]["read_at"] = Date().timeIntervalSince1970 }
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
    private func open(_ item: [String: Any]) async {
        guard let owner = model.userID, NotificationContract.validID(item.selfID) else { return }
        loading = true; defer { loading = false }
        do {
            let result = try await API.shared.call("/api/notifications/\(Endpoint.pathID(item.selfID))/open", method: "POST", body: [:])
            guard owner == model.userID, !Task.isCancelled else { return }
            let href = result.int("available") == 1 ? result.string("href") : "#notifications?unavailable=1"
            guard let safe = NotificationContract.safeRoute(href) else { self.error = "알림 대상을 열 수 없어요.";return }
            if let index = entries.firstIndex(where: { $0.selfID == item.selfID }) { entries[index]["read_at"] = Date().timeIntervalSince1970 }
            notificationWeb = NotificationWebDestination(recipient: owner, href: safe)
        } catch { if owner == model.userID { self.error = "알림 대상을 열 수 없어요. 다시 확인해주세요." } }
    }
}
