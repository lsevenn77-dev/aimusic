import SwiftUI

extension Dictionary where Key == String, Value == Any {
    func displayName(fallback: String = "프로필") -> String {
        string("display_name", fallback: string("name", fallback: fallback))
    }
    func int(_ key: String) -> Int { (self[key] as? NSNumber)?.intValue ?? 0 }
    func flag(_ key: String) -> Bool { (self[key] as? NSNumber)?.boolValue ?? false }
    func object(_ key: String) -> [String: Any] { self[key] as? [String: Any] ?? [:] }
}

struct GiftRecipient: Equatable {
    let id: String
    let name: String
    var path: String { "/api/producers/\(Endpoint.pathID(id))/gifts" }
}
struct GiftRequest {
    let owner: String
    let path: String
    let giftType: String
    let id = UUID().uuidString
    var body: [String: Any] { ["gift_type": giftType, "request_id": id] }
}

struct GiftWalletView: View {
    @EnvironmentObject var model: AppModel
    var song: Song?
    var person: GiftRecipient?
    private var recipientName: String? { person?.name ?? song?.title }
    private var giftPath: String? { person?.path ?? song.map { "/api/tracks/\(Endpoint.pathID($0.id))/gifts" } }
    @State private var wallet: [String: Any] = [:]
    @State private var error: String?
    @State private var selected: [String: Any]?
    @State private var confirm = false
    @State private var busy = false
    @State private var request: GiftRequest?
    @State private var boundScope = ""
    @State private var pendingGift: [String: Any]?
    var body: some View {
        List {
            Section {
                LabeledContent("보유 골드", value: "\(wallet.int("balance"))개")
                LabeledContent("응원별", value: "\(wallet.object("free").int("balance"))개")
                NavigationLink { PaymentStoreView() } label: { Text("골드 충전 · Premium").font(.headline).frame(maxWidth: .infinity, minHeight: 44).foregroundStyle(Brand.aqua) }
                NavigationLink("오늘의 무료 보상") { RewardsView() }
            }
            if let recipientName {
                Section("\(recipientName)에게 선물하기") {
                    Button("응원별 보내기 · 1개") { choose(["id": "star", "name": "응원별", "gold": 0]) }.disabled(busy || wallet.object("free").int("balance") < 1)
                    ForEach(wallet.objects("gifts"), id: \.selfID) { gift in
                        Button { choose(gift) } label: {
                            HStack { Text(gift.string("name")); Spacer(); Text("\(gift.int("gold")) 골드").foregroundStyle(Brand.aqua) }
                        }.disabled(busy || wallet.int("balance") < gift.int("gold"))
                    }
                }
            }
            Section("최근 보낸 선물") {
                ForEach(wallet.objects("sent"), id: \.selfID) { item in
                    VStack(alignment: .leading) { Text(item.string("title")); Text("\(item.string("gift_name")) · \(item.int("gold")) 골드").font(.caption).foregroundStyle(.secondary) }
                }
                if wallet.objects("sent").isEmpty { Text("아직 보낸 선물이 없습니다.").foregroundStyle(.secondary) }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle(recipientName == nil ? "골드 · 선물" : "선물 보내기")
            .task(id: (model.userID ?? "guest") + (giftPath ?? "")) { let scope = (model.userID ?? "guest") + (giftPath ?? ""); if scope != boundScope { boundScope = scope; request = nil; pendingGift = nil; selected = nil; wallet = [:] }; await load() }.refreshable { await load() }
            .confirmationDialog("\(selected?.string("name") ?? "선물")을 보낼까요?", isPresented: $confirm, titleVisibility: .visible) {
                Button("선물 보내기") { Task { await send() } }
            } message: { Text("\(recipientName ?? "")에게 선물을 보냅니다. 선물 전송 후에는 취소할 수 없습니다.") }
    }
    private func choose(_ gift: [String: Any]) {
        if let pendingGift { selected = pendingGift; confirm = true; return }
        guard let owner = model.userID, let giftPath else { _ = model.requireLogin(); return }
        selected = gift; request = GiftRequest(owner: owner, path: giftPath, giftType: gift.string("id")); confirm = true
    }
    private func load() async {
        let owner = model.userID
        guard owner != nil else { wallet = [:]; return }
        do { let data = try await API.shared.call("/api/gold"); if owner == model.userID { wallet = data; error = nil } }
        catch { self.error = error.localizedDescription }
    }
    private func send() async {
        guard let request, let selected, request.owner == model.userID, request.path == giftPath, model.requireLogin(), !busy else { return }
        busy = true; pendingGift = selected; defer { busy = false }
        do {
            _ = try await API.shared.call(request.path, method: "POST", body: request.body)
            guard request.owner == model.userID, request.path == giftPath else { return }
            self.request = nil
            self.selected = nil; pendingGift = nil; model.notice = "선물을 보냈습니다."; await load()
        } catch { self.error = error.localizedDescription }
    }
}

struct RewardsView: View {
    @EnvironmentObject var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var busy = false
    private let labels = ["checkin": "오늘 출석", "cover": "커버곡 공개", "listen": "서로 다른 5곡 감상", "comment1": "첫 번째 감상 댓글", "comment2": "두 번째 감상 댓글", "comment3": "세 번째 감상 댓글"]
    var body: some View {
        List {
            Section { VStack(alignment: .leading, spacing: 8) { Label("오늘의 무료 보상", systemImage: "sparkles").font(.headline); LabeledContent("응원별", value: "\(data.int("balance"))개"); Text("매일 활동하고 응원별을 받아 좋아하는 음악에 선물하세요.").font(.caption) }.foregroundStyle(Brand.background).padding(12) }.listRowBackground(Brand.aqua)
            ForEach(data.objects("rewards"), id: \.rewardID) { reward in
                HStack {
                    VStack(alignment: .leading) { Text(labels[reward.string("kind")] ?? reward.string("kind")); Text("\(reward.int("progress"))/\(reward.int("target")) · 응원별 \(reward.int("amount"))개").font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    Button(reward.flag("claimed") ? "받음" : "받기") { Task { await claim(reward.string("kind")) } }.disabled(busy || reward.flag("claimed") || !reward.flag("eligible"))
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("오늘의 보상").task(id: model.userID) { await load() }.refreshable { await load() }
    }
    private func load() async { do { data = try await API.shared.call("/api/gifts/free"); error = nil } catch { self.error = error.localizedDescription } }
    private func claim(_ kind: String) async {
        busy = true; defer { busy = false }
        do { data = try await API.shared.call("/api/gifts/free/claim", method: "POST", body: ["kind": kind]); error = nil } catch { self.error = error.localizedDescription }
    }
}
private extension Dictionary where Key == String, Value == Any { var rewardID: String { string("kind") } }

struct ProfileGiftRankingView: View {
    let profileID: String
    @State private var ranking: [[String: Any]] = []
    @State private var error: String?
    var body: some View {
        List {
            Section { Text("누적 선물 순위 · 1골드 또는 응원별 1개당 1점").font(.caption).foregroundStyle(.secondary) }
            ForEach(ranking.indices, id: \.self) { index in
                let entry = ranking[index]
                HStack {
                    Text("\(entry.int("rank"))").font(.title3.bold()).foregroundStyle(Brand.pink).frame(width: 34)
                    if !entry.string("profile_id").isEmpty {
                        NavigationLink { ProfilePage(id: entry.string("profile_id")) } label: { rankingRow(entry) }
                    } else { rankingRow(entry) }
                }
            }
            if ranking.isEmpty && error == nil { Text("아직 받은 선물이 없습니다.").foregroundStyle(.secondary) }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("선물 랭킹 TOP 50").task { await load() }.refreshable { await load() }
    }
    private func rankingRow(_ entry: [String: Any]) -> some View {
        HStack { ProfilePhoto(person: entry, size: 44); VStack(alignment: .leading) { Text(entry.displayName()); Text("\(entry.int("gold")) 골드 · 응원별 \(entry.int("stars"))개").font(.caption).foregroundStyle(.secondary) }; Spacer(); Text("\(entry.int("score"))점").font(.caption.bold()).foregroundStyle(Brand.aqua) }
    }
    private func load() async { do { let value = try await API.shared.call("/api/producers/\(Endpoint.pathID(profileID))/gifts"); guard !Task.isCancelled else { return }; ranking = Array(value.objects("ranking").prefix(50)); error = nil } catch { self.error = error.localizedDescription } }
}
