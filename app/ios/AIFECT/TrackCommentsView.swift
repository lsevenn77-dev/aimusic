import SwiftUI

struct TrackCommentsView: View {
    @EnvironmentObject var model: AppModel
    let song: Song
    @State private var comments: [[String: Any]] = []
    @State private var sort = "latest"
    @State private var text = ""
    @State private var reply: [String: Any]?
    @State private var editing: String?
    @State private var removing: String?
    @State private var reporting: String?
    @State private var blocking: String?
    @State private var atCurrentTime = false
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("이 음악에 남긴 이야기").font(.headline)
            Picker("댓글 정렬", selection: $sort) { Text("최신순").tag("latest"); Text("인기순").tag("popular"); Text("시간순").tag("timeline") }.pickerStyle(.segmented)
            if let error { Text(error).foregroundStyle(.red) }
            if comments.isEmpty { Text("첫 번째 감상을 남겨보세요.").foregroundStyle(.secondary) }
            ForEach(orderedComments, id: \.selfID) { item in
                VStack(alignment: .leading, spacing: 8) {
                    Text(item.displayName()).font(.caption.bold()).foregroundStyle(Brand.aqua)
                    if item["timestamp"] is NSNumber {
                        Button(timeLabel(item.number("timestamp"))) {
                            if model.player.current?.id != song.id { model.player.play(song, queue: [song]) }
                            model.player.seek(item.number("timestamp"))
                        }.font(.caption)
                    }
                    Text(item.string("body")).font(.subheadline)
                    if model.user != nil {
                        HStack {
                            Button { Task { await mutate("/api/comments/\(Endpoint.pathID(item.string("id")))/like", method: item.int("liked") > 0 ? "DELETE" : "PUT") } } label: { Label("\(item.int("likes"))", systemImage: item.int("liked") > 0 ? "heart.fill" : "heart") }
                            Button("답글") { editing = nil; reply = item; text = "" }
                            Spacer()
                            Menu {
                                if item.string("user_id") == model.userID { Button("수정") { editing = item.string("id"); reply = nil; text = item.string("body") } }
                                if item.flag("can_delete") { Button("삭제", role: .destructive) { removing = item.string("id") } }
                                if item.string("user_id") != model.userID { Button("이용자 차단", role: .destructive) { blocking = item.string("user_id") } }
                                if item.flag("can_report") { Button("신고", role: .destructive) { reporting = item.string("id") } }
                            } label: { Image(systemName: "ellipsis").frame(width: 36, height: 30) }
                        }.font(.caption).disabled(busy)
                    }
                }.padding(14).background(Brand.card, in: RoundedRectangle(cornerRadius: 14)).padding(.leading, item.string("parent_id").isEmpty ? 0 : 24)
            }
            if model.user != nil {
                if editing != nil || reply != nil { HStack { Text(editing != nil ? "댓글 수정" : "\(reply?.displayName() ?? "")님에게 답글").font(.caption); Spacer(); Button("취소") { editing = nil; reply = nil; text = "" } } }
                TextField("감상을 남겨주세요", text: $text, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(2...5)
                if editing == nil && model.player.current?.id == song.id { Toggle("현재 재생 시간 함께 남기기", isOn: $atCurrentTime).font(.caption) }
                Button(editing == nil ? "댓글 등록" : "수정 저장") { Task { await submit() } }.buttonStyle(.borderedProminent).disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } else { Text("로그인하면 댓글과 답글을 남길 수 있습니다.").foregroundStyle(.secondary) }
        }.task(id: sort) { await load() }
            .confirmationDialog("댓글을 삭제할까요?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
                Button("삭제", role: .destructive) { if let id = removing { Task { await mutate("/api/comments/\(Endpoint.pathID(id))", method: "DELETE") } }; removing = nil }
            }
            .confirmationDialog("이 이용자의 게시물을 숨기고 메시지를 차단할까요?", isPresented: Binding(get: { blocking != nil }, set: { if !$0 { blocking = nil } }), titleVisibility: .visible) {
                Button("차단", role: .destructive) { if let id = blocking { Task { await mutate("/api/blocks/\(Endpoint.pathID(id))", method: "PUT") } }; blocking = nil }
            }
            .confirmationDialog("신고 사유", isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }), titleVisibility: .visible) {
                ForEach([("abuse", "욕설·괴롭힘"), ("spam", "스팸"), ("privacy", "개인정보 침해"), ("sexual", "부적절한 내용"), ("other", "기타")], id: \.0) { reason in
                    Button(reason.1) { if let id = reporting { Task { await mutate("/api/comments/\(Endpoint.pathID(id))/report", method: "POST", body: ["reason": reason.0]) } }; reporting = nil }
                }
            }
    }
    private var orderedComments: [[String: Any]] {
        let roots = comments.filter { $0.string("parent_id").isEmpty }
        let ids = Set(roots.map { $0.string("id") })
        return roots.flatMap { root in [root] + comments.filter { $0.string("parent_id") == root.string("id") }.sorted { $0.int("created") < $1.int("created") } } + comments.filter { !$0.string("parent_id").isEmpty && !ids.contains($0.string("parent_id")) }
    }
    private func load() async {
        do { let result = try await API.shared.call("/api/tracks/\(Endpoint.pathID(song.id))/comments?sort=\(sort)"); try Task.checkCancellation(); comments = result.objects("comments"); error = nil } catch is CancellationError {} catch { self.error = error.localizedDescription }
    }
    private func mutate(_ path: String, method: String, body: [String: Any] = [:]) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { _ = try await API.shared.call(path, method: method, body: body); await load() } catch { self.error = error.localizedDescription }
    }
    private func submit() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            var body: [String: Any] = ["body": text.trimmingCharacters(in: .whitespacesAndNewlines)]
            if let reply { body["parent_id"] = reply.string("parent_id").isEmpty ? reply.string("id") : reply.string("parent_id") }
            if atCurrentTime && model.player.current?.id == song.id { body["timestamp"] = model.player.position }
            let path = editing.map { "/api/comments/\(Endpoint.pathID($0))" } ?? "/api/tracks/\(Endpoint.pathID(song.id))/comments"
            _ = try await API.shared.call(path, method: editing == nil ? "POST" : "PATCH", body: body)
            text = ""; reply = nil; editing = nil; atCurrentTime = false; await load()
        } catch { self.error = error.localizedDescription }
    }
}
