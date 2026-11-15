import SwiftUI
import CryptoKit

enum DiamondAction: String, Codable, CaseIterable {
    case exchange, payout
    var title: String { self == .exchange ? "골드로 전환" : "현금 정산" }
}

struct DiamondRequest: Codable, Equatable {
    let owner: String
    let action: DiamondAction
    let diamonds: Int
    let id: String
    init(owner: String, action: DiamondAction, diamonds: Int, id: String = UUID().uuidString) {
        self.owner = owner; self.action = action; self.diamonds = diamonds; self.id = id
    }
    var body: [String: Any] { ["diamonds": diamonds, "request_id": id] }
}

enum DiamondPolicy {
    static func amount(_ text: String) -> Int? {
        guard !text.isEmpty, text.allSatisfy({ $0.isASCII && $0.isNumber }), let value = Int(text), (1...1_000_000).contains(value) else { return nil }
        return value
    }
    static func valid(_ amount: Int, action: DiamondAction, wallet: [String: Any], hasAccount: Bool) -> Bool {
        (1...1_000_000).contains(amount) && Double(amount) <= wallet.number("available") &&
        (action == .exchange || (hasAccount && amount >= wallet.int("min_payout_diamonds")))
    }
    // Mirrors the server's preview only; the issued statement is authoritative.
    static func payoutPreview(gross: Int) -> (tax: Int, net: Int) {
        let income = gross * 3 / 100 >= 1000 ? gross * 3 / 100 : 0
        let tax = income + income / 10
        return (tax, gross - tax)
    }
    static func display(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...5)))
    }
}

/// A pending receipt contains only an account-scoped operation ID and amount.
/// Bank and tax details are never persisted here. Ambiguous requests keep their
/// exact ID across navigation/relaunch, so retries cannot spend a balance twice.
@MainActor final class DiamondWallet: ObservableObject {
    @Published private(set) var wallet: [String: Any]?
    @Published private(set) var account: [String: Any]?
    @Published private(set) var pending: DiamondRequest?
    @Published private(set) var busy = false
    @Published private(set) var loading = false
    @Published var error: String?
    @Published var accountError: String?
    @Published var message: String?
    private let api: API
    private let receipts: URL
    private var owner: String?
    private var revision = 0
    private var loadRevision = 0
    init(api: API? = nil, receipts: URL? = nil) {
        self.api = api ?? .shared
        self.receipts = receipts ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    }
    private var receiptURL: URL? {
        owner.map { value in receipts.appendingPathComponent("diamond-" + SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() + ".json") }
    }
    func bind(_ owner: String?) {
        guard self.owner != owner else { return }
        self.owner = owner; revision += 1; wallet = nil; account = nil; pending = nil; busy = false; loading = false
        error = nil; accountError = nil; message = nil
        if let url = receiptURL, let bytes = try? Data(contentsOf: url), let saved = try? JSONDecoder().decode(DiamondRequest.self, from: bytes), saved.owner == owner { pending = saved }
    }
    func load() async {
        guard owner != nil else { return }
        let version = revision
        loadRevision += 1; let load = loadRevision
        loading = true
        defer { if revision == version && loadRevision == load { loading = false } }
        do {
            let value = try await api.call("/api/diamonds")
            guard revision == version, loadRevision == load, !Task.isCancelled else { return }
            guard value["available"] is NSNumber, value.number("diamond_krw") > 0, value.number("gold_per_diamond") > 0, value.int("min_payout_diamonds") > 0 else { throw URLError(.badServerResponse) }
            wallet = value; error = nil
        } catch { if revision == version && loadRevision == load { wallet = nil; self.error = error.localizedDescription } }
        do {
            let value = try await api.call("/api/studio/payout-account")
            guard revision == version, loadRevision == load, !Task.isCancelled else { return }
            account = value; accountError = nil
        } catch { if revision == version && loadRevision == load { account = nil; accountError = error.localizedDescription } }
    }
    func perform(action: DiamondAction, amount: Int) async -> Bool {
        guard let owner, !busy, let url = receiptURL else { return false }
        if let pending {
            guard pending.owner == owner, pending.action == action, pending.diamonds == amount else { return false }
        } else {
            guard !loading, let wallet, error == nil, DiamondPolicy.valid(amount, action: action, wallet: wallet, hasAccount: !(account?.object("account").isEmpty ?? true)) else { return false }
            pending = DiamondRequest(owner: owner, action: action, diamonds: amount)
        }
        guard let request = pending else { return false }
        let version = revision
        busy = true; message = nil; error = nil
        defer { if version == revision { busy = false } }
        do {
            try FileManager.default.createDirectory(at: receipts, withIntermediateDirectories: true)
            try JSONEncoder().encode(request).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            let result = try await api.call("/api/diamonds/" + action.rawValue, method: "POST", body: request.body)
            guard revision == version, !Task.isCancelled else { return false }
            guard result.flag("ok") else { throw URLError(.badServerResponse) }
            pending = nil; try? FileManager.default.removeItem(at: url)
            wallet = result.object("wallet")
            message = action == .exchange ? "골드로 전환했어요." : "정산을 신청했어요. 지급 예정일은 정산 명세에서 확인하세요."
            await load()
            return true
        } catch {
            guard revision == version else { return false }
            let failure = error.localizedDescription
            if let status = (error as? APIError)?.status, (400..<500).contains(status), status != 408, status != 429 {
                pending = nil; try? FileManager.default.removeItem(at: url)
                await load()
            }
            self.error = failure
            return false
        }
    }
}

struct DiamondWalletView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store = DiamondWallet()
    @State private var action = DiamondAction.exchange
    @State private var amount = "50"
    @State private var confirmation: DiamondRequest?
    @State private var editAccount = false
    @State private var policyExpanded = false
    @State private var allStatements = false
    @State private var allHistory = false
    private var selection: DiamondRequest? {
        if let pending = store.pending { return pending }
        guard let owner = model.userID, let number = DiamondPolicy.amount(amount) else { return nil }
        return DiamondRequest(owner: owner, action: action, diamonds: number)
    }
    private var canSubmit: Bool {
        guard !store.busy, !store.loading, let selection else { return false }
        if store.pending != nil { return true }
        guard let wallet = store.wallet, store.error == nil else { return false }
        return DiamondPolicy.valid(selection.diamonds, action: selection.action, wallet: wallet, hasAccount: !(store.account?.object("account").isEmpty ?? true))
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if model.user == nil { LoginPrompt(title: "다이아 · 내 정산") }
                else {
                    balanceCard
                    if let wallet = store.wallet {
                        controls(wallet)

                    }
                    if store.wallet == nil && !store.loading { Button("다이아 다시 불러오기") { Task { await store.load() } } }
                    if let error = store.error { Text(error).font(.callout).foregroundStyle(AifectDesign.secondaryText); Button("잔액 다시 확인") { Task { await store.load() } }.disabled(store.busy) }
                    if let pending = store.pending {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("처리 결과를 확인해주세요").font(.headline)
                            Text("\(pending.diamonds.formatted())다이아 · \(pending.action.title) 요청이 남아 있어요. 같은 요청으로 확인하므로 중복 차감되지 않아요.").font(.callout)
                            Button("이전 요청 확인 · 재시도") { confirmation = pending }.disabled(store.busy).accessibilityIdentifier("diamond-retry")
                        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 18))
                    }
                    if let message = store.message { Label(message, systemImage: "checkmark.circle.fill").foregroundStyle(Brand.aqua).accessibilityIdentifier("diamond-success") }
                    accountSection
                    if let wallet = store.wallet { partnerCard(wallet.object("partner")); policy(wallet); statements; history(wallet) }
                    NavigationLink("선물 수익 상세 보기") { CreatorEarningsView() }
                }
            }.padding(20)
        }.background(AifectDesign.background).navigationTitle("다이아 · 내 정산").navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .task(id: model.userID) { store.bind(model.userID); confirmation = nil; editAccount = false; await store.load() }
            .onChange(of: scenePhase) { _, value in if value != .active { editAccount = false } }
            .refreshable { if !store.busy { await store.load() } }
            .navigationDestination(isPresented: $editAccount) {
                Group { PayoutAccountEditor(banks: store.account?["banks"] as? [String] ?? []) { await store.load() } }.environmentObject(model)
            }
            .confirmationDialog(confirmation?.action.title ?? "다이아 사용", isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
                if let request = confirmation {
                    Button("\(request.diamonds.formatted())다이아 \(request.action.title)") {
                        Task {
                            guard request.owner == model.userID else { return }
                            if await store.perform(action: request.action, amount: request.diamonds), request.owner == model.userID { model.walletRevision += 1; model.profileRevision += 1 }
                        }
                    }
                }
                Button("취소", role: .cancel) { confirmation = nil }
            } message: { Text(confirmation?.action == .exchange ? "전환한 골드로 다른 사람에게 선물할 수 있습니다. 전환은 되돌릴 수 없습니다." : "선택한 다이아로 현금 정산을 신청합니다. 원천징수와 최종 지급액은 발급되는 정산 명세를 확인해주세요.") }
    }
    private var balanceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("사용 가능한 다이아", systemImage: "diamond.fill").font(.system(size: 14)).foregroundStyle(AifectDesign.secondaryText)
            Text(store.wallet.map { "◇ " + DiamondPolicy.display($0.number("available")) } ?? "—").font(.system(size: 34, weight: .semibold)).foregroundStyle(Brand.aqua).monospacedDigit().accessibilityIdentifier("diamond-balance").accessibilityLabel(store.wallet.map { DiamondPolicy.display($0.number("available")) } ?? "—")
            if let wallet = store.wallet {
                Text("1다이아 = 세전 \(wallet.int("diamond_krw"))원 = \(wallet.int("gold_per_diamond"))골드").font(.system(size: 13)).padding(10).background(Brand.background.opacity(0.45), in: RoundedRectangle(cornerRadius: 10))
                Text(wallet.number("available") == 0 ? "월 마감 후 수익이 확정되면 사용할 수 있어요." : "월 마감 후 확정된 수익이에요. 소수점도 누적돼요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
            }
            if store.loading { ProgressView() }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
            .background(LinearGradient(colors: [Brand.pink.opacity(0.08), Brand.card, Brand.aqua.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(LinearGradient(colors: [Brand.pink, Brand.aqua], startPoint: .topLeading, endPoint: .bottomTrailing)))
    }
    private func controls(_ wallet: [String: Any]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ForEach(DiamondAction.allCases, id: \.self) { choice in
                    Button { action = choice } label: {
                        VStack(spacing: 6) {
                            Image(systemName: choice == .exchange ? "arrow.left.arrow.right" : "building.columns").font(.system(size: 22))
                            Text(choice == .exchange ? "골드 전환" : "현금 정산").font(.system(size: 14, weight: .semibold))
                        }.frame(maxWidth: .infinity).padding(.vertical, 12).foregroundStyle(action == choice ? Brand.pink : AifectDesign.muted)
                            .background(action == choice ? Brand.pink.opacity(0.12) : Brand.background.opacity(0.35), in: RoundedRectangle(cornerRadius: 11))
                            .overlay(RoundedRectangle(cornerRadius: 11).stroke(action == choice ? Brand.pink : AifectDesign.stroke))
                    }.buttonStyle(.plain).accessibilityIdentifier("diamond-mode-" + (choice == .exchange ? "gold" : "cash"))
                }
            }
            StudioTextField(title: "사용할 다이아", text: $amount, limit: 7).keyboardType(.numberPad).accessibilityIdentifier("diamond-amount")
                .onChange(of: amount) { _, value in amount = String(value.filter { $0.isASCII && $0.isNumber }.prefix(7)) }
            let number = DiamondPolicy.amount(amount) ?? 0
            if action == .exchange {
                VStack(alignment: .leading, spacing: 5) {
                    Text("받을 골드").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
                    Text("\((number * wallet.int("gold_per_diamond")).formatted()) G").font(.system(size: 26, weight: .semibold)).foregroundStyle(Brand.aqua).accessibilityIdentifier("diamond-preview")
                    Text("\(number.formatted())다이아 사용").font(.system(size: 13))
                }.frame(maxWidth: .infinity, alignment: .leading).padding(14).background(Brand.aqua.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            } else {
                let gross = number * wallet.int("diamond_krw"), preview = DiamondPolicy.payoutPreview(gross: gross)
                LabeledContent("세전 금액", value: "\(gross.formatted())원")
                LabeledContent("원천징수", value: "\(preview.tax.formatted())원")
                Divider()
                LabeledContent("예상 지급액", value: "\(preview.net.formatted())원").foregroundStyle(Brand.aqua).accessibilityIdentifier("diamond-preview")
            }
            if !canSubmit { Text(amountHint(wallet, number: number)).font(.system(size: 13)).foregroundStyle(AifectDesign.muted) }
            Button(action == .exchange ? "골드로 전환" : "현금 정산 신청") { confirmation = selection }.buttonStyle(CatalogButtonStyle(filled: true, fullWidth: true)).disabled(!canSubmit).accessibilityIdentifier("diamond-submit")
            Text(action == .exchange ? "추가 차감 없이 전환해요. 전환은 되돌릴 수 없어요." : "월 1회 신청 · \(wallet.string("next_payout_on").isEmpty ? "지급일은 신청 시 확인" : "지급 예정 " + wallet.string("next_payout_on"))\n별도 환전 수수료 없음").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke)).disabled(store.busy || store.pending != nil)
    }
    private func amountHint(_ wallet: [String: Any], number: Int) -> String {
        if number < (action == .exchange ? 1 : wallet.int("min_payout_diamonds")) { return action == .exchange ? "1다이아부터 골드로 전환할 수 있어요." : "\(wallet.int("min_payout_diamonds"))다이아부터 현금 정산할 수 있어요." }
        if number > 1_000_000 { return "한 번에 최대 1,000,000다이아를 사용할 수 있어요." }
        if Double(number) > wallet.number("available") { return "사용 가능한 다이아가 부족해요." }
        return action == .payout && (store.account?.object("account").isEmpty ?? true) ? "현금 정산에는 등록된 정산 계좌가 필요해요." : "잔액과 처리 상태를 확인하고 있어요."
    }
    private func partnerCard(_ partner: [String: Any]) -> some View {
        let threshold = max(1, partner.int("threshold_krw") == 0 ? 1_000_000 : partner.int("threshold_krw"))
        return VStack(alignment: .leading, spacing: 12) {
            Label(partner.string("tier") == "partner" ? "공식 파트너" : "일반 창작자", systemImage: "checkmark.seal").font(.system(size: 17, weight: .semibold))
            Text("인정 실적 \(partner.int("eligible_krw").formatted())원 / \(threshold.formatted())원").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
            ProgressView(value: min(1, max(0, partner.number("eligible_krw") / Double(threshold)))).tint(Brand.aqua)
            Text("일반 선물 수익 배분").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
            Text("일반 60% · 파트너 70%").font(.system(size: 17, weight: .semibold))
            Text("파트너는 확정 세전 수익 \(threshold.formatted())원 달성 후 운영자 검증 또는 특별 선정으로 승인돼요.").font(.system(size: 13)).foregroundStyle(AifectDesign.muted)
        }.padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke))
    }
    private func policy(_ wallet: [String: Any]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("정산 · 분배 기준").font(.system(size: 17, weight: .semibold)); Spacer(); Button(policyExpanded ? "접기" : "자세히") { policyExpanded.toggle() }.accessibilityIdentifier("diamond-policy-toggle") }
            LabeledContent("커버 선물", value: "가창자 70% · 플랫폼 30%")
            LabeledContent("스트리밍", value: "원곡자 50% · 플랫폼 50%")
            Text("세금 · 결제 수수료를 제외한 기준이에요.").font(.caption).foregroundStyle(AifectDesign.muted)
            if policyExpanded {
                Divider()
                Text("다이아와 전환").font(.headline)
                Text("월 마감 후 확정한 수익이에요. 소수점 수익도 누적돼요. 1다이아는 세전 \(wallet.int("diamond_krw"))원 또는 \(wallet.int("gold_per_diamond"))골드예요. 전환한 골드로 다른 사람에게 선물할 수 있어요. 전환은 되돌릴 수 없고, 골드는 현금 정산할 수 없어요.")
                Text("현금 정산").font(.headline)
                Text("\(wallet.int("min_payout_diamonds"))다이아부터 월 1회 신청할 수 있어요. 계좌 등록이 필요하며, 지급 예정일은 서버의 정산 명세에서 확인할 수 있어요. 별도 환전 수수료는 없어요. 지급액에는 해당 원천징수가 반영돼요.")
                Text("선물 · 스트리밍 배분").font(.headline)
                Text("일반 선물 수익은 일반 창작자 60%, 파트너 70%예요. 커버 선물은 등급과 관계없이 가창자 70% / 플랫폼 30%이며, 원곡자 선물 몫은 없어요. 스트리밍은 원곡자 50% / 플랫폼 50%이며 커버 재생도 원곡자에게 반영돼요.")
                Text("파트너 기준").font(.headline)
                Text("환불·취소·자가 후원·부정 수익은 제외하며, 승급 이후 선물부터 적용해요. 사용한 다이아는 누적 실적을 줄이지 않아요.")
            }
        }.font(.system(size: 14)).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke))
    }
    @ViewBuilder private var accountSection: some View {
        if let data = store.account {
            VStack(alignment: .leading, spacing: 12) {
                Text("정산 계좌").font(.headline)
                let account = data.object("account")
                if !account.isEmpty { Text("\(account.string("bank")) \(account.string("account")) · \(account.string("holder"))").font(.callout) }
                if data.flag("can_register") || !account.isEmpty { Button("계좌 등록 · 수정") { editAccount = true }.disabled(store.busy) }
                else { Text("확정 수익이 생기면 정산 계좌를 등록할 수 있어요.").font(.caption).foregroundStyle(AifectDesign.muted) }

            }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(AifectDesign.stroke))
        } else if store.accountError != nil { Button("정산 계좌 다시 불러오기") { Task { await store.load() } } }
    }
    @ViewBuilder private var statements: some View {
        let rows = store.account?.objects("statements") ?? []
        if !rows.isEmpty {
            HStack { Text("현금 정산 내역").font(.headline); Spacer(); if rows.count > 3 { Button(allStatements ? "접기" : "전체 보기") { allStatements.toggle() } } }
            ForEach(allStatements ? rows : Array(rows.prefix(3)), id: \.selfID) { value in
                VStack(alignment: .leading, spacing: 8) {
                    LabeledContent(value.string("period"), value: "\(value.int("net_krw").formatted())원")
                    Text(value.string("status") == "paid" ? "지급 완료" : "지급 예정 \(value.string("due_on"))").font(.caption).foregroundStyle(AifectDesign.muted)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }
    private func history(_ wallet: [String: Any]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("다이아 내역").font(.headline); Spacer(); if wallet.objects("history").count > 3 { Button(allHistory ? "접기" : "전체 보기") { allHistory.toggle() } } }
            if wallet.objects("history").isEmpty { Text("아직 확정된 다이아 내역이 없어요.").font(.callout).foregroundStyle(AifectDesign.muted) }
            ForEach(allHistory ? wallet.objects("history") : Array(wallet.objects("history").prefix(3)), id: \.selfID) { row in
                HStack { VStack(alignment: .leading, spacing: 4) { Text(row.string("detail")); Text(row.string("period")).font(.caption).foregroundStyle(AifectDesign.muted) }; Spacer(); Text("\(DiamondPolicy.display(row.number("diamonds"))) ◇").monospacedDigit().foregroundStyle(Brand.aqua) }.font(.callout).padding(16).background(Brand.card, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }
}

private struct PayoutAccountEditor: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    let banks: [String]
    let saved: () async -> Void
    @State private var holder = ""
    @State private var bank = ""
    @State private var account = ""
    @State private var resident = ""
    @State private var consent = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var editing: Bool
    private var valid: Bool { holder.trimmingCharacters(in: .whitespaces).count >= 2 && banks.contains(bank) && (10...16).contains(account.count) && resident.count == 13 && consent }
    var body: some View {
        Form {
            accountFields
            if let error { Text(error).foregroundStyle(.secondary) }
            Button { Task { await save() } } label: { if busy { ProgressView() } else { Text("정산 정보 저장") } }.disabled(!valid || busy)
        }.disabled(busy).navigationTitle("정산 계좌").scrollDismissesKeyboard(.interactively)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() }.disabled(busy) }; ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { editing = false } } }
            .interactiveDismissDisabled(busy)
            .onChange(of: holder) { _, value in holder = String(value.prefix(40)) }
            .onChange(of: account) { _, value in account = String(value.filter { $0.isASCII && $0.isNumber }.prefix(16)) }
            .onChange(of: resident) { _, value in resident = String(value.filter { $0.isASCII && $0.isNumber }.prefix(13)) }
            .onChange(of: scenePhase) { _, value in if value != .active { clear() } }
            .onDisappear { clear() }
    }
    private var accountFields: some View {
            Section("지급 정보") {
                TextField("예금주 실명", text: $holder).focused($editing)
                Picker("은행", selection: $bank) { Text("선택해주세요").tag(""); ForEach(banks, id: \.self) { Text($0).tag($0) } }
                TextField("계좌번호", text: $account).keyboardType(.numberPad).focused($editing)
                residentField
                Toggle("수익 지급과 원천징수를 위한 개인정보 처리에 동의합니다.", isOn: $consent)
                Text("계좌번호와 주민등록번호는 정산 서버에 암호화해 보관됩니다. 앱 기기에 저장하지 않습니다.").font(.caption).foregroundStyle(.secondary)
                Link("개인정보처리방침", destination: Endpoint.origin.appendingPathComponent("privacy"))
            }
    }
    private var residentField: some View {
        SecureField("주민등록번호 · 원천징수용", text: $resident)
            .keyboardType(.numberPad).focused($editing)
    }
    private func clear() { holder = ""; account = ""; resident = ""; consent = false }
    private func save() async {
        guard let owner = model.userID, valid, !busy else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await API.shared.call("/api/studio/payout-account", method: "PUT", body: ["holder": holder, "bank": bank, "account": account, "resident_number": resident, "consent": consent])
            clear()
            guard model.userID == owner, !Task.isCancelled else { return }
            await saved(); dismiss()
        } catch { resident = ""; self.error = "정산 정보를 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해주세요." }
    }
}
