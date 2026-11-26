import SwiftUI
import UIKit

enum OfficialNotice {
    static let channelID = "aifect-official-notice"
    static let inboxPath = "/api/dm?notices=unified"
    static let path = "/api/notices/official"

    static func isChannel(_ value: [String: Any]) -> Bool {
        value.string("id") == channelID && value.flag("is_notice") &&
            value.flag("read_only") && value.string("notice_type") == "official"
    }

    static func inboxRows(_ items: [[String: Any]]) -> [[String: Any]] {
        items.filter { isChannel($0) || (!$0.flag("is_notice") && OfficialNoticeRoute(target: $0.string("id")) == nil) }
    }

    static func date(_ seconds: Double, includeTime: Bool = true) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.timeZone = TimeZone(identifier: "Asia/Seoul")
        formatter.dateFormat = includeTime ? "yyyy.MM.dd HH:mm" : "yyyy.MM.dd"
        return formatter.string(from: Date(timeIntervalSince1970: seconds))
    }

    static func guideURL(_ href: String) -> URL? {
        guard href.range(of: #"^#[a-z][a-z0-9/-]*(?:\?[a-z]+=[a-z]+)?$"#, options: .regularExpression) != nil else { return nil }
        return try? Endpoint.url("/" + href)
    }
}

struct OfficialNoticeRoute: Hashable {
    let anchor: String?

    init(anchor: String? = nil) { self.anchor = anchor }

    private static func isEntryID(_ value: String) -> Bool {
        value.range(of: #"^(?:campaign|dm):[A-Za-z0-9_-]{1,100}$"#, options: .regularExpression) != nil
    }

    init?(target: String) {
        switch target {
        case "notice", OfficialNotice.channelID: self.init()
        case "aifect-guide", "premium-open-event-20261231-v1": self.init(anchor: target)
        default:
            guard Self.isEntryID(target) else { return nil }
            self.init(anchor: target)
        }
    }

    init?(fragment: String) {
        guard let parts = URLComponents(string: "/" + fragment), parts.path.hasPrefix("/dm/"),
              let route = Self(target: String(parts.path.dropFirst(4))) else { return nil }
        let entry = parts.queryItems?.first(where: { $0.name == "entry" })?.value ??
            parts.queryItems?.first(where: { $0.name == "peer" })?.value
        let anchor = entry.flatMap { entry -> String? in
            if let target = Self(target: entry) { return target.anchor }
            return SiteWorkspace.validKey(entry) ? entry : nil
        }
        self.init(anchor: anchor ?? route.anchor)
    }

    init?(url: URL) {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.user == nil, parts.password == nil, parts.port == nil else { return nil }
        let suffix = parts.percentEncodedQuery.map { "?" + $0 } ?? ""
        if parts.scheme == "kr.co.aifect.app", parts.host == "dm" {
            self.init(fragment: "dm" + parts.percentEncodedPath + suffix)
        } else if parts.scheme == "https", parts.host == Endpoint.origin.host {
            self.init(fragment: parts.percentEncodedFragment ?? (String(parts.percentEncodedPath.dropFirst()) + suffix))
        } else { return nil }
    }
}

struct OfficialNoticeItem: Identifiable {
    let id: String
    let created: Double
    var readAt: Double
    let payload: [String: Any]
    var mine: Bool { payload.string("kind") == "dm" && payload.flag("mine") }
    var unread: Bool { !mine && readAt == 0 }
    func matches(_ anchor: String) -> Bool { id == anchor || payload.string("legacy_id") == anchor }
    static func earlier(_ lhs: Self, _ rhs: Self) -> Bool {
        (lhs.created, lhs.id) < (rhs.created, rhs.id)
    }
}

struct OfficialNoticeFeed {
    var items: [OfficialNoticeItem] = []
    var before: String?

    init() {}

    init(response: [String: Any]) throws {
        guard OfficialNotice.isChannel(response.object("channel")), let rows = response["items"] as? [[String: Any]] else {
            throw APIError(status: 0, message: "공지 내용을 불러오지 못했습니다.")
        }
        var byID: [String: OfficialNoticeItem] = [:]
        for row in rows {
            let id = row.string("id")
            guard !id.isEmpty, row["created"] is NSNumber,
                  row["guide"] is [String: Any] || row["notice"] is [String: Any] || row.string("kind") == "dm" else {
                throw APIError(status: 0, message: "공지 내용을 불러오지 못했습니다.")
            }
            byID[id] = OfficialNoticeItem(id: id, created: row.number("created"), readAt: row.number("read_at"), payload: row)
        }
        items = byID.values.sorted(by: OfficialNoticeItem.earlier)
        before = response["before"] as? String
    }

    mutating func refresh(_ page: Self) {
        let older: [OfficialNoticeItem]
        if page.before != nil, let first = page.items.first {
            older = Array(items.prefix { OfficialNoticeItem.earlier($0, first) })
        } else { older = [] }
        items = merge(older, page.items)
        if older.isEmpty { before = page.before }
    }

    mutating func prepend(_ page: Self) {
        items = merge(items, page.items)
        before = page.before
    }

    private func merge(_ existing: [OfficialNoticeItem], _ incoming: [OfficialNoticeItem]) -> [OfficialNoticeItem] {
        let known = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0.readAt) })
        var byID: [String: OfficialNoticeItem] = [:]
        for var item in existing + incoming {
            item.readAt = max(item.readAt, known[item.id] ?? 0)
            byID[item.id] = item
        }
        return byID.values.sorted(by: OfficialNoticeItem.earlier)
    }

    mutating func acknowledge(_ ids: Set<String>, at: Double) {
        for index in items.indices where ids.contains(items[index].id) && items[index].unread {
            items[index].readAt = at
        }
    }
}

struct OfficialNoticePosition: Equatable {
    let id: String
    let offset: CGFloat
    let latest: String?
}

@MainActor
final class OfficialNoticeSession {
    var feed: OfficialNoticeFeed?
    var position: OfficialNoticePosition?
}

struct MessageDestination: View {
    let route: MessageRoute
    var body: some View {
        if !route.crew, let notice = OfficialNoticeRoute(target: route.id) {
            OfficialNoticePage(route: route.noticeAnchor.map { OfficialNoticeRoute(anchor: $0) } ?? notice)
        } else {
            ChatPage(
                path: route.crew ? "/api/crews/\(Endpoint.pathID(route.id))/messages" : "/api/dm/\(Endpoint.pathID(route.id))",
                title: route.title, crew: route.crew
            )
        }
    }
}

struct OfficialNoticePage: View {
    @EnvironmentObject private var model: AppModel
    let route: OfficialNoticeRoute
    var body: some View {
        Group {
            if let owner = model.userID {
                OfficialNoticeHistory(owner: owner, route: route, session: model.officialNotices).id(owner)
            } else { LoginPrompt(title: "로그인하고 메시지 보기") }
        }.navigationTitle("아이팩트 안내")
    }
}

private struct OfficialNoticeFrames: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}

// ScrollViewReader selects the entry. The underlying scroll view restores an offset inside that entry.
@MainActor
private final class OfficialNoticeScrollHandle {
    weak var view: UIScrollView?

    func shift(_ dy: CGFloat) -> Bool {
        guard let view else { return false }
        let minY = -view.adjustedContentInset.top
        let maxY = max(minY, view.contentSize.height - view.bounds.height + view.adjustedContentInset.bottom)
        let y = min(maxY, max(minY, view.contentOffset.y + dy))
        guard abs(y - view.contentOffset.y) > 0.5 else { return false }
        view.setContentOffset(CGPoint(x: view.contentOffset.x, y: y), animated: false)
        return true
    }
}

private struct OfficialNoticeScrollProbe: UIViewRepresentable {
    let handle: OfficialNoticeScrollHandle
    func makeUIView(context: Context) -> Probe {
        let view = Probe()
        view.handle = handle
        view.isUserInteractionEnabled = false
        return view
    }
    func updateUIView(_ uiView: Probe, context: Context) {}

    final class Probe: UIView {
        weak var handle: OfficialNoticeScrollHandle?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil else { return }
            var ancestor = superview
            while let current = ancestor {
                if let scroll = current as? UIScrollView { handle?.view = scroll; return }
                ancestor = current.superview
            }
        }
    }
}

@MainActor
private struct OfficialNoticeHistory: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    let owner: String
    let route: OfficialNoticeRoute
    let session: OfficialNoticeSession
    @State private var feed = OfficialNoticeFeed()
    @State private var visible = false
    @State private var loading = false
    @State private var loadError: String?
    @State private var earlierError: String?
    @State private var readError: String?
    @State private var pending: Set<String> = []
    @State private var positioned = false
    @State private var baseline: String?
    @State private var jump: OfficialNoticePosition?
    @State private var frames: [String: CGRect] = [:]
    @State private var scroll = OfficialNoticeScrollHandle()
    private let viewportSpace = "official-notice-viewport"
    private var current: Bool { model.userID == owner && model.officialNotices === session && !Task.isCancelled }

    var body: some View {
        VStack(spacing: 0) {
            if let loadError { RetryCard(message: loadError) { Task { await refresh() } }.padding(.horizontal, 16) }
            if let earlierError { RetryCard(message: earlierError) { Task { await loadEarlier() } }.padding(.horizontal, 16) }
            if let readError { RetryCard(message: readError) { self.readError = nil }.padding(.horizontal, 16) }
            GeometryReader { viewport in
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            if feed.before != nil {
                                Button("이전 공지 보기") { Task { await loadEarlier() } }
                                    .disabled(loading).frame(maxWidth: .infinity, minHeight: 48)
                            }
                            ForEach(feed.items) { item in
                                OfficialNoticeCard(entry: item, owner: owner)
                                    .frame(minHeight: item.id == feed.items.last?.id ? viewport.size.height : 0, alignment: .topLeading)
                                    .background {
                                        GeometryReader { row in
                                            Color.clear.preference(key: OfficialNoticeFrames.self,
                                                value: [item.id: row.frame(in: .named(viewportSpace))])
                                        }
                                    }
                                    .id(item.id)
                            }
                            if positioned && feed.items.isEmpty {
                                ContentUnavailableView("아직 받은 공지가 없습니다.", systemImage: "megaphone")
                            }
                        }.padding(.horizontal, 16)
                            .background(OfficialNoticeScrollProbe(handle: scroll))
                    }.coordinateSpace(name: viewportSpace)
                        .accessibilityIdentifier("official-notice-history")
                        .opacity(positioned ? 1 : 0).accessibilityHidden(!positioned)
                        .overlay {
                            if !positioned && loadError == nil { ProgressView("공지를 불러오는 중").allowsHitTesting(false) }
                        }
                        .onPreferenceChange(OfficialNoticeFrames.self) { newFrames in
                            frames = newFrames
                            if let jump { finishJump(jump, height: viewport.size.height) }
                            else { recordVisible(height: viewport.size.height) }
                        }
                        .onChange(of: scenePhase) { _, _ in recordVisible(height: viewport.size.height) }
                        .onChange(of: viewport.size.height) { _, height in recordVisible(height: height) }
                        .task(id: jump) {
                            guard let jump else { return }
                            proxy.scrollTo(jump.id, anchor: .top)
                            // A distant lazy row may need another layout pass before its frame is measurable.
                            for _ in 0..<8 {
                                do { try await Task.sleep(for: .milliseconds(25)) } catch { return }
                                guard self.jump == jump else { return }
                                finishJump(jump, height: viewport.size.height)
                            }
                            if self.jump == jump {
                                finishJump(jump, height: viewport.size.height, settled: true)
                            }
                        }
                }
            }
        }.onAppear { visible = true }
            .onDisappear { visible = false }
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                while !Task.isCancelled {
                    await refresh()
                    do { try await Task.sleep(for: .seconds(5)) } catch { return }
                }
            }
            .task(id: positioned && !pending.isEmpty && readError == nil) {
                if positioned && readError == nil { await acknowledge() }
            }
    }

    private func fetch(before: String? = nil) async throws -> OfficialNoticeFeed {
        let path = OfficialNotice.path + (before.map { "?before=" + Endpoint.query($0) } ?? "")
        let page = try OfficialNoticeFeed(response: await API.shared.call(path, fresh: true))
        guard current else { throw CancellationError() }
        guard before == nil || page.before != before else {
            throw APIError(status: 0, message: "이전 공지 위치를 확인해 주세요.")
        }
        return page
    }

    private func refresh() async {
        guard current, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            var page = try await fetch()
            if let cachedLatest = session.feed?.items.last {
                while let cursor = page.before, let first = page.items.first, OfficialNoticeItem.earlier(cachedLatest, first) {
                    let older = try await fetch(before: cursor)
                    page.prepend(older)
                }
            }
            var updated = session.feed ?? OfficialNoticeFeed()
            updated.refresh(page)
            if !positioned, let anchor = route.anchor {
                while !updated.items.contains(where: { $0.matches(anchor) }), let cursor = updated.before {
                    let older = try await fetch(before: cursor)
                    updated.prepend(older)
                }
            }
            apply(updated)
            loadError = nil
            if !positioned && jump == nil { positionInitial() }
        } catch is CancellationError { }
        catch {
            guard current else { return }
            loadError = error.localizedDescription
            if !positioned, jump == nil, route.anchor == nil, let cached = session.feed {
                apply(cached)
                positionInitial()
            }
        }
    }

    private func apply(_ updated: OfficialNoticeFeed) {
        // A PATCH may have completed while a page of history was loading.
        var next = updated
        let receipts = Set(session.feed?.items.filter { !$0.unread && !$0.mine }.map(\.id) ?? [])
        next.acknowledge(receipts, at: Date().timeIntervalSince1970)
        feed = next
        session.feed = next
    }

    private func positionInitial() {
        guard let latest = feed.items.last?.id else { positioned = true; return }
        baseline = latest
        if let anchor = route.anchor, let item = feed.items.first(where: { $0.matches(anchor) }) {
            jump = OfficialNoticePosition(id: item.id, offset: 0, latest: latest)
        } else if route.anchor == nil, let saved = session.position,
                  saved.latest == latest, feed.items.contains(where: { $0.id == saved.id }) {
            jump = saved
        } else { jump = OfficialNoticePosition(id: latest, offset: 0, latest: latest) }
    }

    private func finishJump(_ request: OfficialNoticePosition, height: CGFloat, settled: Bool = false) {
        guard current, jump == request else { return }
        let frame = frames[request.id]
        guard settled || frame.map({ abs($0.minY) < 2 }) == true else { return }
        let moved = frame.map { scroll.shift($0.minY + request.offset) } ?? false
        jump = nil
        positioned = true
        if !moved { recordVisible(height: height) }
    }

    private func loadEarlier() async {
        guard current, !loading, let cursor = feed.before else { return }
        loading = true
        defer { loading = false }
        do {
            let page = try await fetch(before: cursor)
            // Capture the current anchor once the request finishes, even if the reader scrolled during the request.
            let saved = readingPosition()
            var updated = session.feed ?? feed
            updated.prepend(page)
            if let saved, updated.items.first?.id != feed.items.first?.id { jump = saved }
            apply(updated)
            earlierError = nil
        } catch is CancellationError { }
        catch { if current { earlierError = error.localizedDescription } }
    }

    private func readingPosition() -> OfficialNoticePosition? {
        frames.filter { $0.value.maxY > 0 }.min { $0.value.minY < $1.value.minY }.map {
            OfficialNoticePosition(id: $0.key, offset: -$0.value.minY, latest: baseline)
        }
    }

    private func recordVisible(height: CGFloat) {
        guard current, visible, positioned, jump == nil, scenePhase == .active, height > 0 else { return }
        if route.anchor == nil, let position = readingPosition() { session.position = position }
        let seen = feed.items.filter { entry in
            guard entry.unread, let frame = frames[entry.id], frame.height > 0 else { return false }
            return min(height, frame.maxY) - max(0, frame.minY) >= min(frame.height, 48)
        }.map(\.id)
        pending.formUnion(seen)
    }

    private func acknowledge() async {
        while current && visible && !pending.isEmpty {
            let ids = Set(pending.prefix(100))
            do {
                let response = try await API.shared.call(OfficialNotice.path, method: "PATCH", body: ["ids": Array(ids).sorted()])
                guard current else { return }
                try model.applyOfficialNoticeRead(response)
                var updated = session.feed ?? feed
                updated.acknowledge(ids, at: Date().timeIntervalSince1970)
                apply(updated)
                pending.subtract(ids)
            } catch is CancellationError { return }
            catch {
                if current { readError = "읽음 상태를 반영하지 못했습니다." }
                return
            }
        }
    }
}

private struct OfficialNoticeCard: View {
    let entry: OfficialNoticeItem
    let owner: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(OfficialNotice.date(entry.created)).font(.caption).foregroundStyle(AifectDesign.muted)
            VStack(alignment: .leading, spacing: 12) {
                if let guide = entry.payload["guide"] as? [String: Any] { guideContent(guide) }
                else if let notice = entry.payload["notice"] as? [String: Any] { noticeContent(notice) }
                else { directMessage }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
                .background(Brand.card, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(AifectDesign.stroke))
        }.padding(.top, 12).padding(.bottom, 16)
            .accessibilityIdentifier("official-entry-" + entry.id)
    }

    private func guideContent(_ guide: [String: Any]) -> some View {
        Group {
            Text(guide.string("greeting")).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            paragraphs(guide["intro"])
            ForEach(Array(guide.objects("sections").enumerated()), id: \.offset) { _, section in
                Divider()
                Text(section.string("title")).font(.headline).foregroundStyle(Brand.aqua)
                paragraphs(section["paragraphs"] ?? section["body"])
                if let link = OfficialNotice.guideURL(section.string("href")), !section.string("label").isEmpty {
                    Link(section.string("label"), destination: link)
                        .foregroundStyle(Brand.aqua).frame(minHeight: 44, alignment: .leading)
                }
            }
            paragraphs(guide["closing"])
        }
    }

    private func noticeContent(_ notice: [String: Any]) -> some View {
        Group {
            Text(notice.string("title")).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            let banner = notice.string("banner")
            if banner.range(of: #"^/assets/[A-Za-z0-9_-]+\.webp$"#, options: .regularExpression) != nil,
               let url = try? Endpoint.url(banner) {
                let ratio = notice.number("banner_width") / notice.number("banner_height")
                Brand.background.aspectRatio(ratio.isFinite && ratio > 0 ? CGFloat(ratio) : 3, contentMode: .fit)
                    .overlay {
                        RemoteArtwork(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                    }.clipShape(RoundedRectangle(cornerRadius: 12))
                    .accessibilityLabel(notice.string("banner_alt", fallback: notice.string("title")))
            }
            Text(notice.string("body")).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var directMessage: some View {
        let invite = entry.payload.string("crew_invite_id")
        let body = entry.payload.string("body")
        let suffix = "\n크루 둘러보기: https://aifect.co.kr/#crew/" + invite
        let message = SiteWorkspace.validKey(invite) && body.hasSuffix(suffix) ? String(body.dropLast(suffix.count)) : body
        return Group {
            if !message.isEmpty { ChatStickerText(bodyText: message) }
            if SiteWorkspace.validKey(entry.payload.string("image_id")) {
                PrivateChatPhoto(item: entry.payload, owner: owner).frame(height: 260)
            }
            if SiteWorkspace.validKey(invite) {
                NavigationLink { CrewPage(id: invite).streamingPage() } label: {
                    Label("초대받은 크루 보기", systemImage: "person.2")
                }.frame(minHeight: 44, alignment: .leading)
            }
        }
    }

    private func paragraphs(_ value: Any?) -> some View {
        let lines = value as? [String] ?? (value as? String).map { [$0] } ?? []
        return ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
            Text(line).fixedSize(horizontal: false, vertical: true)
        }
    }
}
