import SwiftUI

struct CreatorEarningsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var data: [String: Any] = [:]
    @State private var loading = true
    @State private var error: String?
    private var activity: [String: Any] { data.object("activity") }
    private var breakdown: [String: Any] { data.object("breakdown") }
    private func won(_ value: [String: Any], _ key: String) -> String { "\(value.int(key).formatted())원" }
    var body: some View {
        List {
            if loading && data.isEmpty { ProgressView("정산 내역을 불러오는 중") }
            if !data.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("내 음악이 만든 수익", systemImage: "music.note")
                        Text(won(breakdown, "estimated_earnings_krw")).font(.largeTitle.bold()).foregroundStyle(Brand.aqua)
                        Text("누적 예상 선물 수익").font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 12)
                    LabeledContent("받은 골드", value: "\(activity.int("received_gold").formatted()) G")
                    LabeledContent("유효 감상", value: "\(activity.int("total_streams").formatted())회")
                }
                Section("수익 계산") {
                    LabeledContent("선물 구매 금액", value: won(breakdown, "purchase_value_krw"))
                    LabeledContent("부가세", value: won(breakdown, "tax_krw"))
                    LabeledContent("결제 수수료", value: won(breakdown, "payment_fee_krw"))
                    LabeledContent("다른 참여자 배분", value: won(breakdown, "other_shares_krw"))
                    LabeledContent("내 예상 수익", value: won(breakdown, "estimated_earnings_krw"))
                }
                Section("월별 정산") {
                    ForEach(data.objects("months"), id: \.monthID) { month in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack { Text(month.string("month")).font(.headline); Spacer(); Text(won(month, "total_krw")).foregroundStyle(Brand.aqua) }
                            Text(["settled": "정산 명세 반영", "payable": "지급 대상 · 정산 확정 전", "carried": "최소 정산 금액 미만 · 다음 달 이월", "accruing": "집계 중 · 확정 전 예상 금액"][month.string("status")] ?? "정산 확인 중").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                    if data.objects("months").isEmpty { Text("아직 정산할 선물 수익이 없습니다.").foregroundStyle(.secondary) }
                    Text("최소 정산 금액 \(won(data, "min_payout_krw")) · 지급일 매월 \(data.int("payout_day"))일").font(.caption)
                    Text("무료 응원별은 정산 대상에 포함되지 않습니다. 구독 수익 집계는 선물 수익과 별도로 준비 중입니다.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red); Button("다시 불러오기") { Task { await load() } } } }
        }.navigationTitle("수익 · 정산").task(id: model.userID) { data = [:]; await load() }.refreshable { await load() }
    }
    private func load() async {
        guard let owner = model.userID else { data = [:]; loading = false; return }
        loading = true; defer { loading = false }
        do {
            let loaded = try await API.shared.call("/api/studio/earnings")
            guard owner == model.userID, !Task.isCancelled else { return }
            data = loaded; error = nil
        } catch { if owner == model.userID { self.error = error.localizedDescription } }
    }
}
private extension Dictionary where Key == String, Value == Any { var monthID: String { string("month") } }
