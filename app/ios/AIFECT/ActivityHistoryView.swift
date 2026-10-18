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
    private var filterKey: String { filter == "받은 선물" ? "gifts" : filter == "커버 · 듀엣" ? "participation" : "all" }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if model.userID == nil { LoginPrompt(title: "내 활동 알림을 확인하세요") }
                else {
                    ParityChips(items: ["전체", "커버 · 듀엣", "받은 선물"], selection: $filter)
                    HStack { Text("커버·듀엣 참여와 받은 선물").font(.caption).foregroundStyle(.secondary); Spacer(); NavigationLink { PushSettingsView() } label: { Image(systemName: "bell.badge").frame(width: 44, height: 44) }.accessibilityLabel("알림 설정") }
                    if let error { RetryCard(message: error) { Task { await load() } } }
                    ForEach(entries, id: \.selfID) { item in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                ProfilePhoto(person: ["id": item.string("actor_profile_id"), "image_version": item.string("actor_image_version")], size: 36, showsLevel: false)
                                VStack(alignment: .leading, spacing: 3) { Text(item.string("actor_name")).font(.subheadline.bold()); if item.number("created") > 0 { Text(Date(timeIntervalSince1970: item.number("created")).formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary) } }
                                Spacer(); if item.number("read_at") == 0 { Text("NEW").font(.caption2).foregroundStyle(Brand.pink) }
                            }
                            Text(message(item)).font(.subheadline)
                            Text(item.string("source_title", fallback: "나에게 보낸 선물")).font(.caption).foregroundStyle(.secondary)
                            HStack {
                                if item.int("available") == 1 { Button("자세히 보기") { Task { await open(item) } }.disabled(loading) }
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
    }
    private func message(_ item: [String: Any]) -> String {
        if ["gift", "person_gift"].contains(item.string("kind")) { return "\(item.string("gift_name")) \(max(1, item.int("quantity")))개 · \(item.int("amount")) \(item.string("currency") == "gold" ? "G" : "S")" }
        return item.string("kind") == "duet" ? "내 듀엣에 참여했어요." : "내 곡으로 커버를 공개했어요."
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
        let owner = model.userID
        loading = true; defer { loading = false }
        await mark(item)
        guard owner == model.userID else { return }
        if item.string("kind") == "person_gift" { profile = item.string("target") }
        else { do { let value = try await API.shared.call("/api/tracks/\(Endpoint.pathID(item.string("target")))"); guard owner == model.userID, !Task.isCancelled else { return }; let song = Song(value.object("track")); if !song.id.isEmpty { destination = song } } catch { self.error = error.localizedDescription } }
    }
}
