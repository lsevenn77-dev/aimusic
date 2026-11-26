package kr.co.aifect.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

internal object OfficialNotice {
    const val channelId = "aifect-official-notice"
    const val inboxPath = "/api/dm?notices=unified"
    const val path = "/api/notices/official"
    private val guideLink = Regex("#[a-z][a-z0-9/-]*(?:\\?[a-z]+=[a-z]+)?")

    fun guideURL(href: String): String? = href.takeIf(guideLink::matches)?.let { Endpoint.url("/$it") }

    fun inboxRows(rows: List<JSONObject>): List<JSONObject> =
        rows.filter { it.isOfficialNotice() || (!it.isInboxNotice() && OfficialNoticeRoute.fromTarget(it.optString("id")) == null) }
}

private fun JSONObject.flag(key: String) = optBoolean(key) || optInt(key) == 1
internal fun JSONObject.isInboxNotice() = flag("is_notice")
internal fun JSONObject.isOfficialNotice() = optString("id") == OfficialNotice.channelId &&
    isInboxNotice() && flag("read_only") && optString("notice_type") == "official"

internal data class OfficialNoticeRoute(val anchor: String? = null) {
    companion object {
        private val itemId = Regex("(?:campaign|dm):[A-Za-z0-9_-]{1,100}")

        fun fromTarget(target: String): OfficialNoticeRoute? = when (target) {
            "notice", OfficialNotice.channelId -> OfficialNoticeRoute()
            "aifect-guide", "premium-open-event-20261231-v1" -> OfficialNoticeRoute(target)
            else -> target.takeIf(itemId::matches)?.let(::OfficialNoticeRoute)
        }

        fun fromPath(path: String, entry: String?): OfficialNoticeRoute? {
            if (!path.startsWith("dm/")) return null
            val route = fromTarget(path.removePrefix("dm/")) ?: return null
            if (entry == null) return route
            val target = fromTarget(entry)
            return if (target != null) target.takeIf { it.anchor != null } ?: route
            else if (CurrentNavigation.safeID(entry)) OfficialNoticeRoute(entry) else route
        }
    }
}

internal data class OfficialNoticeItem(val id: String, val created: Long, val readAt: Long, val payload: JSONObject) {
    val mine: Boolean get() = payload.flag("mine") && payload.optString("kind") == "dm"
    val unread: Boolean get() = !mine && readAt == 0L
    fun matches(anchor: String) = id == anchor || payload.optString("legacy_id") == anchor
}

internal data class OfficialNoticeFeed(
    val items: List<OfficialNoticeItem> = emptyList(),
    val before: String? = null
) {
    fun refresh(page: OfficialNoticeFeed): OfficialNoticeFeed {
        val first = page.items.firstOrNull()
        val older = if (page.before != null && first != null) items.takeWhile { itemOrder.compare(it, first) < 0 } else emptyList()
        return OfficialNoticeFeed(merge(older, page.items), if (older.isEmpty()) page.before else before)
    }

    fun prepend(page: OfficialNoticeFeed) = OfficialNoticeFeed(merge(items, page.items), page.before)

    private fun merge(existing: List<OfficialNoticeItem>, incoming: List<OfficialNoticeItem>): List<OfficialNoticeItem> {
        val known = items.associateBy { it.id }
        return (existing + incoming).associateBy { it.id }.values.map { item ->
            item.copy(readAt = maxOf(item.readAt, known[item.id]?.readAt ?: 0L))
        }.sortedWith(itemOrder)
    }

    fun acknowledge(ids: Set<String>, at: Long) =
        copy(items = items.map { if (it.id in ids && it.unread) it.copy(readAt = at) else it })

    companion object {
        val itemOrder = compareBy<OfficialNoticeItem> { it.created }.thenBy { it.id }

        fun decode(response: JSONObject): OfficialNoticeFeed {
            require(response.optJSONObject("channel")?.isOfficialNotice() == true) { "공지 내용을 불러오지 못했습니다." }
            val items = response.getJSONArray("items").objects().map { item ->
                require(item.optJSONObject("guide") != null || item.optJSONObject("notice") != null || item.optString("kind") == "dm") {
                    "공지 내용을 불러오지 못했습니다."
                }
                OfficialNoticeItem(item.getString("id"), item.getLong("created"), item.optLong("read_at"), item)
            }.distinctBy { it.id }.sortedWith(itemOrder)
            val before = response.opt("before") as? String
            return OfficialNoticeFeed(items, before)
        }
    }
}

internal data class OfficialNoticePosition(val id: String, val offset: Int, val latest: String?)

internal class OfficialNoticeSession {
    var feed by mutableStateOf<OfficialNoticeFeed?>(null)
    var position: OfficialNoticePosition? = null
}

@Composable
internal fun OfficialNoticeConversation(
    model: MusicModel,
    route: OfficialNoticeRoute,
    onRead: suspend (JSONObject) -> Unit
) {
    val account = model.user?.optString("id") ?: return
    val session = model.officialNotices
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val fetchLock = remember { Mutex() }
    var ready by remember { mutableStateOf(false) }
    var initial by remember { mutableStateOf<OfficialNoticePosition?>(null) }
    var baseline by remember { mutableStateOf<String?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var loadAttempt by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val publishRead by rememberUpdatedState(onRead)
    fun current() = model.user?.optString("id") == account && model.officialNotices === session

    suspend fun fetch(cursor: String? = null): OfficialNoticeFeed {
        val path = OfficialNotice.path + (cursor?.let { "?before=" + CurrentNavigation.query(it) } ?: "")
        val page = OfficialNoticeFeed.decode(model.api.call(path, fresh = true))
        if (!current()) throw CancellationException()
        require(cursor == null || page.before != cursor) { "이전 공지 위치를 확인해 주세요." }
        return page
    }

    fun position() {
        val items = session.feed?.items.orEmpty()
        val latest = items.lastOrNull()?.id
        val saved = session.position
        val linked = route.anchor?.let { anchor -> items.find { it.matches(anchor) } }
        baseline = latest
        initial = when {
            linked != null -> OfficialNoticePosition(linked.id, 0, latest)
            route.anchor == null && saved?.latest == latest && items.any { it.id == saved?.id } -> saved
            latest != null -> OfficialNoticePosition(latest, 0, latest)
            else -> null
        }
        ready = true
    }

    LaunchedEffect(session, lifecycle, loadAttempt) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                fetchLock.withLock {
                    try {
                        var page = fetch()
                        // Keep pagination contiguous after a long period away from the inbox.
                        val cachedLatest = session.feed?.items?.lastOrNull()
                        while (cachedLatest != null && page.before != null && page.items.firstOrNull()
                                ?.let { OfficialNoticeFeed.itemOrder.compare(cachedLatest, it) < 0 } == true) {
                            page = page.prepend(fetch(page.before))
                        }
                        session.feed = session.feed?.refresh(page) ?: page
                        val target = route.anchor
                        if (!ready && target != null) {
                            while (session.feed?.items?.none { it.matches(target) } == true) {
                                val cursor = session.feed?.before ?: break
                                val earlier = fetch(cursor)
                                session.feed = session.feed?.prepend(earlier)
                            }
                        }
                        loadError = null
                        if (!ready) position()
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        loadError = error.message ?: "공지 내용을 불러오지 못했습니다."
                        // A linked message is positioned only once its lookup has finished.
                        if (!ready && route.anchor == null && session.feed != null) position()
                    }
                }
                delay(8_000)
            }
        }
    }

    Column(Modifier.fillMaxSize().testTag("official-notice-conversation")) {
        loadError?.let { OfficialNoticeRetry(it) { loadAttempt++ } }
        if (!ready) {
            if (loadError == null) LoadingRows()
            return@Column
        }
        val items = session.feed?.items.orEmpty()
        val firstIndex = items.indexOfFirst { it.id == initial?.id }
        val list = rememberLazyListState(
            initialFirstVisibleItemIndex = if (firstIndex < 0) 0 else firstIndex + 1,
            initialFirstVisibleItemScrollOffset = initial?.offset ?: 0
        )
        var pending by remember { mutableStateOf<Set<String>>(emptySet()) }
        var readError by remember { mutableStateOf<String?>(null) }
        var earlierError by remember { mutableStateOf<String?>(null) }
        var loadingEarlier by remember { mutableStateOf(false) }
        val minVisible = with(LocalDensity.current) { 48.dp.roundToPx() }
        fun loadEarlier() {
            if (loadingEarlier) return
            loadingEarlier = true
            scope.launch {
                try {
                    fetchLock.withLock {
                        val cursor = session.feed?.before ?: return@withLock
                        val page = fetch(cursor)
                        val anchor = list.layoutInfo.visibleItemsInfo.firstOrNull { it.index > 0 }
                        val updated = session.feed?.prepend(page) ?: page
                        session.feed = updated
                        if (list.firstVisibleItemIndex == 0 && anchor != null) {
                            val index = updated.items.indexOfFirst { it.id == anchor.key }
                            if (index >= 0) list.requestScrollToItem(index + 1, -anchor.offset)
                        }
                        earlierError = null
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    earlierError = error.message ?: "이전 공지를 불러오지 못했습니다."
                } finally {
                    loadingEarlier = false
                }
            }
        }
        earlierError?.let { OfficialNoticeRetry(it, ::loadEarlier) }
        readError?.let { OfficialNoticeRetry(it) { readError = null } }

        LaunchedEffect(session, list, lifecycle, minVisible) {
            lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                snapshotFlow {
                    val unread = session.feed?.items.orEmpty().filter { it.unread }.map { it.id }.toSet()
                    val layout = list.layoutInfo
                    val visible = layout.visibleItemsInfo.filter { it.index > 0 && it.key != "empty" }
                    val ids = if (list.isScrollInProgress) emptySet() else visible.filter { item ->
                        val overlap = minOf(item.offset + item.size, layout.viewportEndOffset) -
                            maxOf(item.offset, layout.viewportStartOffset)
                        item.size > 0 && overlap >= minOf(item.size, minVisible) && item.key in unread
                    }.map { it.key as String }.toSet()
                    val anchor = visible.firstOrNull()?.let {
                        OfficialNoticePosition(it.key as String, -it.offset, baseline)
                    }
                    anchor to ids
                }.collect { (anchor, ids) ->
                    if (anchor != null && route.anchor == null) session.position = anchor
                    pending = pending + ids
                }
            }
        }
        LaunchedEffect(session, pending.isNotEmpty(), readError) {
            if (readError != null) return@LaunchedEffect
            while (pending.isNotEmpty() && current()) {
                val ids = pending.take(100).toSet()
                try {
                    val result = model.api.call(OfficialNotice.path, "PATCH", payload("ids" to JSONArray(ids.toList())))
                    if (!current()) return@LaunchedEffect
                    publishRead(result)
                    session.feed = session.feed?.acknowledge(ids, System.currentTimeMillis() / 1000)
                    pending = pending - ids
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    readError = "읽음 상태를 반영하지 못했습니다."
                    break
                }
            }
        }

        LazyColumn(state = list, modifier = Modifier.weight(1f).fillMaxWidth().testTag("official-notice-history"),
            contentPadding = PaddingValues(horizontal = 16.dp)) {
            item(key = "earlier") {
                if (session.feed?.before != null) {
                    TextButton(enabled = !loadingEarlier, onClick = ::loadEarlier, modifier = Modifier.fillMaxWidth()) {
                        Text("이전 공지 보기")
                    }
                }
            }
            if (items.isEmpty()) item(key = "empty") { CurrentEmpty("아직 받은 공지가 없습니다.") }
            items(items, key = { it.id }) { entry ->
                // Reserve a viewport for a short latest notice so its heading can still align to the top.
                Box(if (entry.id == items.last().id) Modifier.fillParentMaxHeight() else Modifier) {
                    OfficialNoticeCard(model, entry)
                }
            }
        }
    }
}

@Composable
private fun OfficialNoticeRetry(message: String, retry: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Text(message, Modifier.weight(1f), color = Muted, fontSize = 14.sp)
        TextButton(onClick = retry) { Text("다시 시도") }
    }
}

@Composable
private fun OfficialNoticeCard(model: MusicModel, entry: OfficialNoticeItem) {
    val guide = entry.payload.optJSONObject("guide")
    val notice = entry.payload.optJSONObject("notice")
    val uriHandler = LocalUriHandler.current
    val shape = RoundedCornerShape(20.dp)
    Column(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 16.dp).testTag("official-entry-" + entry.id),
        verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Text(activityDate(entry.created), color = Muted, fontSize = 12.sp)
        Column(Modifier.fillMaxWidth().background(Panel, shape).border(1.dp, Stroke, shape).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when {
                guide != null -> {
                    Text(guide.optString("greeting"), fontSize = 21.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold)
                    GuideParagraphs(guide.optJSONArray("intro"))
                    guide.optJSONArray("sections").objects().forEach { section ->
                        HorizontalDivider(color = Stroke)
                        Text(section.optString("title"), fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Aqua)
                        GuideParagraphs(section.optJSONArray("paragraphs") ?: section.optJSONArray("body"))
                        if (section.opt("body") is String && section.optString("body").isNotEmpty()) {
                            Text(section.optString("body"), fontSize = 15.sp, lineHeight = 23.sp)
                        }
                        OfficialNotice.guideURL(section.optString("href"))?.let { url ->
                            val label = section.optString("label")
                            if (label.isNotBlank()) TextButton(onClick = { uriHandler.openUri(url) }) { Text(label) }
                        }
                    }
                    GuideParagraphs(guide.optJSONArray("closing"))
                }
                notice != null -> {
                    Text(notice.optString("title"), fontSize = 21.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold)
                    val banner = notice.opt("banner") as? String
                    if (banner != null && Regex("/assets/[A-Za-z0-9_-]+\\.webp").matches(banner)) {
                        val width = notice.optDouble("banner_width", 2172.0)
                        val height = notice.optDouble("banner_height", 724.0)
                        val ratio = (width / height).toFloat().takeIf { it.isFinite() && it > 0f } ?: 3f
                        Box(Modifier.fillMaxWidth().aspectRatio(ratio).clip(RoundedCornerShape(12.dp)).background(Raised)) {
                            AsyncImage(Endpoint.url(banner), notice.optString("banner_alt").ifBlank { notice.optString("title") },
                                Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                        }
                    }
                    Text(notice.optString("body"), fontSize = 15.sp, lineHeight = 23.sp)
                }
                else -> {
                    val invite = entry.payload.optString("crew_invite_id").takeIf(CurrentNavigation::safeID)
                        ?.takeUnless { it == "null" }
                    val body = entry.payload.optString("body")
                    val text = if (invite == null) body else body.removeSuffix("\n크루 둘러보기: https://aifect.co.kr/#crew/$invite")
                    if (text.isNotBlank()) StickerText(text, fontSize = 15.sp, lineHeight = 23.sp)
                    if ((entry.payload.opt("image_id") as? String)?.let(CurrentNavigation::safeID) == true) {
                        Box(Modifier.fillMaxWidth().height(280.dp)) { ChatImage(model, entry.payload) }
                    }
                    if (invite != null) TextButton(onClick = { model.openCrew(invite) }) { Text("초대받은 크루 보기") }
                }
            }
        }
    }
}

@Composable
private fun GuideParagraphs(paragraphs: JSONArray?) {
    if (paragraphs == null) return
    for (index in 0 until paragraphs.length()) {
        val text = paragraphs.opt(index) as? String ?: continue
        Text(text, fontSize = 15.sp, lineHeight = 23.sp)
    }
}
