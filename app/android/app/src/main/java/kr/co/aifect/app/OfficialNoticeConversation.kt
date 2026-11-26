package kr.co.aifect.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

internal const val OfficialNoticePeer = "aifect-official-notice"
internal fun isOfficialNoticePeer(value: String?) =
    value in setOf(OfficialNoticePeer, "notice", "aifect-guide", "premium-open-event-20261231-v1")

private const val officialEndpoint = "/api/notices/official"
private val campaignPattern = Regex("^campaign:([A-Za-z0-9_-]{1,100})$")
private val assetPattern = Regex("^(?:[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}|premium-open-event-banner)$")
private val songPath = Regex("^#song/([A-Za-z0-9_-]{1,100})(?:\\?comments=1)?$")
private val menuLinks = setOf("#home", "#play", "#karaoke", "#live?mode=karaoke", "#voice?mode=talk", "#community/crews",
    "#karaoke/duets", "#karaoke/dubbing?tab=join", "#artists", "#upload", "#membership", "#shop", "#dm", "#inventory")
private val giftThumbnail = Regex("^/(?:assets|api/product-assets)/[A-Za-z0-9_./-]+\\.(?:webp|png|jpe?g)$", RegexOption.IGNORE_CASE)
private val kst = ZoneId.of("Asia/Seoul")
private val dayLabel = DateTimeFormatter.ofPattern("yyyy년 M월 d일", Locale.KOREAN).withZone(kst)
private val hourLabel = DateTimeFormatter.ofPattern("HH:mm", Locale.KOREAN).withZone(kst)
private fun parameter(s: String) = URLEncoder.encode(s, "UTF-8")
private fun JSONObject.noticeCursor() = optString("before").takeUnless { it.isBlank() || it == "null" }
private val timelineOrder = compareBy<JSONObject> { it.optLong("created") }.thenBy { it.optString("id") }

private fun permittedLink(value: String): String? {
    if (value in menuLinks || songPath.matches(value)) return value
    val url = runCatching { URI(value) }.getOrNull() ?: return null
    return value.takeIf { url.scheme.equals("https", true) && url.host != null && url.userInfo == null }
}

@Composable
internal fun OfficialNoticeConversation(m: MusicModel, close: () -> Unit) {
    val owner = m.user?.optString("id") ?: return
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val gate = remember(owner) { Mutex() }
    var timeline by remember(owner) { mutableStateOf<List<JSONObject>>(emptyList()) }
    var before by remember(owner) { mutableStateOf<String?>(null) }
    var initialized by remember(owner) { mutableStateOf(false) }
    var failure by remember(owner) { mutableStateOf<String?>(null) }
    var readFailure by remember(owner) { mutableStateOf(false) }
    var reading by remember(owner) { mutableStateOf<Set<String>>(emptySet()) }
    var takingPage by remember(owner) { mutableStateOf(false) }
    var firstPaint by remember(owner) { mutableStateOf(false) }
    val imageLoader = remember(owner) { ImageLoader.Builder(context).okHttpClient(m.api.client).diskCache(null).memoryCache(null).build() }
    DisposableEffect(imageLoader) { onDispose { imageLoader.shutdown() } }
    val current = { m.user?.optString("id") == owner && isOfficialNoticePeer(m.messagePeer) }
    val open: (String) -> Unit = { href ->
        permittedLink(href)?.let {
            val song = songPath.matchEntire(it)?.groupValues?.get(1)
            when {
                song != null -> m.openCurrentSong(song)
                it == "#dm" -> close()
                it == "#home" -> { m.dismissMessages(); m.selectTab(0) }
                it == "#play" -> { m.dismissMessages(); m.selectTab(1) }
                it == "#karaoke" -> { m.dismissMessages(); m.selectTab(2) }
                it == "#community/crews" -> { m.dismissMessages(); m.selectTab(3); m.communityMode = "crews" }
                it == "#membership" -> { m.billingInitialTab = "premium"; m.showBilling = true }
                it == "#shop" -> m.showShop = true
                it == "#inventory" -> { m.dismissMessages(); m.showInventory = true }
                else -> runCatching { uriHandler.openUri(if (it.startsWith("#")) Endpoint.url("/" + it) else it) }
                    .onFailure { m.notice = "링크를 열 수 없습니다." }
            }
        }
    }
    suspend fun page(older: Boolean) {
        gate.withLock {
            if (!current() || older && (before == null || takingPage)) return@withLock
            takingPage = older
            try {
                val path = if (older) "$officialEndpoint?before=" + parameter(before!!) else officialEndpoint
                val data = m.api.call(path, fresh = true)
                if (!current()) return@withLock
                val rows = data.optJSONArray("items").objects()
                val keep = if (older) timeline else if (data.noticeCursor() != null && rows.isNotEmpty()) {
                    timeline.filter { timelineOrder.compare(it, rows.first()) < 0 }
                        .map { it.optString("id") }.chunked(100).flatMap { keys ->
                            val qs = keys.joinToString("&") { "known=" + parameter(it) }
                            m.api.call("$officialEndpoint?$qs", fresh = true).optJSONArray("items").objects()
                        }
                } else emptyList()
                if (!current()) return@withLock
                timeline = (keep + rows).associateBy { it.optString("id") }.values.sortedWith(timelineOrder)
                if (older || keep.isEmpty()) before = data.noticeCursor()
                initialized = true
                failure = null
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (current()) failure = error.message ?: "공지를 불러오지 못했습니다."
                if (error is ApiException && error.status in listOf(401, 403)) {
                    timeline = emptyList()
                    before = null
                }
            } finally { takingPage = false }
        }
    }

    suspend fun acknowledge(keys: List<String>) {
        val wanted = keys.filterNot { it in reading }.take(100)
        if (wanted.isEmpty() || !current()) return
        reading = reading + wanted
        try {
            m.api.call(officialEndpoint, "PATCH", payload("ids" to JSONArray(wanted)))
            if (current()) {
                timeline = timeline.map { row ->
                    if (row.optString("id") in wanted) JSONObject(row.toString()).put("read_at", System.currentTimeMillis() / 1000L)
                    else row
                }
                readFailure = false
                m.refreshMessageSummary()
            }
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) { if (current()) readFailure = true }
        finally { reading = reading - wanted.toSet() }
    }

    fun visibleUnread(): List<String> {
        if (!firstPaint) return emptyList()
        val layout = list.layoutInfo
        val visible = layout.visibleItemsInfo.filter {
            minOf(it.offset + it.size, layout.viewportEndOffset) - maxOf(it.offset, layout.viewportStartOffset) >= minOf(it.size, 48)
        }.map { it.key }.toSet()
        return timeline.filter { it.optString("id") in visible && !it.optBoolean("mine") && it.optLong("read_at") == 0L }
            .map { it.optString("id") }
    }

    LaunchedEffect(owner, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            launch {
                page(false)
                try { m.api.watchChat("?peer=$OfficialNoticePeer", {}, { page(false); m.refreshMessageSummary() }) }
                catch (error: CancellationException) { throw error }
                catch (error: Exception) { if (current()) failure = error.message }
            }
            launch { snapshotFlow { visibleUnread() }.collect { if (it.isNotEmpty()) acknowledge(it) } }
            launch {
                snapshotFlow { firstPaint && list.firstVisibleItemIndex <= 1 && list.isScrollInProgress && before != null }
                    .collect { if (it) page(true) }
            }
        }
    }

    LaunchedEffect(initialized, timeline.size) {
        if (initialized && !firstPaint) {
            if (timeline.isNotEmpty()) list.scrollToItem(timeline.size)
            firstPaint = true
        }
    }

    AppPage("아이팩트 안내", close) {
        Column(Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxWidth().weight(1f).testTag("official-notice-timeline"), state = list,
                contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item(key = "earlier") {
                    if (before != null) TextButton({ scope.launch { page(true) } }, enabled = !takingPage) {
                        Text(if (takingPage) "불러오는 중입니다." else "이전 공지 보기")
                    } else if (!initialized && failure == null) LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (failure != null) TextButton({ scope.launch { page(false) } }) {
                        Text(failure.orEmpty() + " 다시 시도", color = Pink)
                    }
                    if (initialized && timeline.isEmpty()) Text("아직 받은 공지가 없습니다.", color = Muted)
                }
                itemsIndexed(timeline, key = { _, row -> row.optString("id") }) { index, row ->
                    val at = row.optLong("created")
                    val day = dayLabel.format(Instant.ofEpochSecond(at))
                    if (index == 0 || day != dayLabel.format(Instant.ofEpochSecond(timeline[index - 1].optLong("created")))) {
                        Text(day, Modifier.fillMaxWidth().padding(6.dp), textAlign = TextAlign.Center, fontSize = 12.sp, color = Muted)
                    }
                    OfficialNoticeCard(m, row, imageLoader, open)
                }
            }
            if (readFailure) TextButton({ scope.launch { acknowledge(visibleUnread()) } }) { Text("읽음 상태 다시 반영하기") }
            HorizontalDivider(color = Stroke)
            Text("아이팩트 공식 안내 채널입니다.", Modifier.fillMaxWidth().padding(10.dp),
                textAlign = TextAlign.Center, color = Muted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun OfficialNoticeCard(m: MusicModel, row: JSONObject, loader: ImageLoader, open: (String) -> Unit) {
    val rich = row.optJSONObject("rich")
    val guide = row.optJSONObject("guide")
    val event = row.optJSONObject("notice")
    val title = rich?.optString("title") ?: guide?.optString("greeting") ?: event?.optString("title")
    Column(Modifier.fillMaxWidth()) {
        Text(hourLabel.format(Instant.ofEpochSecond(row.optLong("created"))), Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center, fontSize = 12.sp, color = Muted)
        Surface(Modifier.fillMaxWidth().testTag("official-notice-" + row.optString("id")), shape = RoundedCornerShape(16.dp), color = Panel) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                if (event != null) {
                    val banner = event.optString("banner")
                    if (Regex("^/assets/[A-Za-z0-9_-]+\\.webp$").matches(banner))
                        AsyncImage(Endpoint.url(banner), null, Modifier.fillMaxWidth(), contentScale = ContentScale.Fit)
                }
                if (!title.isNullOrBlank()) Text((if (row.optBoolean("test")) "[테스트] " else "") + title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                when {
                    rich != null && rich.optInt("format") == 1 -> {
                        var ordered = 0
                        for (block in rich.optJSONArray("blocks").objects()) {
                            ordered = if (block.optString("list") == "ol") ordered + 1 else 0
                            when (block.optString("type")) {
                                "hr" -> HorizontalDivider(color = Stroke)
                                "image" -> {
                                    val campaign = campaignPattern.matchEntire(row.optString("id"))?.groupValues?.get(1)
                                    val asset = block.optString("asset")
                                    if (campaign != null && assetPattern.matches(asset)) {
                                        val context = LocalContext.current
                                        val aligns = when (block.optString("align")) {
                                            "center" -> Alignment.Center
                                            "right" -> Alignment.CenterEnd
                                            else -> Alignment.CenterStart
                                        }
                                        val href = permittedLink(block.optString("href"))
                                        Box(Modifier.fillMaxWidth(), contentAlignment = aligns) {
                                            val preview = ImageRequest.Builder(context).data(Endpoint.url("$officialEndpoint/$campaign/images/$asset"))
                                                .diskCachePolicy(CachePolicy.DISABLED).memoryCachePolicy(CachePolicy.DISABLED).build()
                                            AsyncImage(model = preview, contentDescription = block.optString("alt"), imageLoader = loader,
                                                modifier = Modifier.fillMaxWidth(block.optInt("width", 100).coerceIn(10, 100) / 100f)
                                                    .then(if (href != null) Modifier.clickable { open(href) } else Modifier),
                                                contentScale = ContentScale.Fit)
                                        }
                                    }
                                }
                                else -> {
                                    val thumb = block.optString("thumbnail")
                                    if (row.optBoolean("gift") && giftThumbnail.matches(thumb) && !thumb.contains("..")) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                            GiftItemImage(thumb, Modifier.size(44.dp).testTag("official-gift-thumbnail"))
                                            Box(Modifier.weight(1f)) { NoticeParagraph(block, ordered, open) }
                                        }
                                    } else NoticeParagraph(block, ordered, open)
                                }
                            }
                        }
                    }
                    guide != null -> {
                        for (group in listOf("intro", "sections", "closing")) {
                            val values = guide.optJSONArray(group) ?: continue
                            for (i in 0 until values.length()) {
                                val section = values.optJSONObject(i)
                                if (section == null) Text(values.optString(i), fontSize = 15.sp)
                                else {
                                    HorizontalDivider(color = Stroke)
                                    Text(section.optString("title"), fontWeight = FontWeight.SemiBold)
                                    Text(section.optString("body"), fontSize = 15.sp)
                                    permittedLink(section.optString("href"))?.let { href ->
                                        TextButton({ open(href) }) { Text(section.optString("label")) }
                                    }
                                }
                            }
                        }
                    }
                    event != null -> Text(event.optString("body"), fontSize = 15.sp)
                    row.optString("kind") == "dm" -> {
                        if (!row.isNull("image_id") && row.optString("image_id").isNotBlank()) ChatImage(m, row)
                        else StickerText(row.optString("body"), 15.sp, 22.sp)
                    }
                }
                if (row.optLong("edited_at") > 0L) Text("수정됨", Modifier.align(Alignment.End), fontSize = 12.sp, color = Muted)
            }
        }
    }
}

@Composable
private fun NoticeParagraph(block: JSONObject, ordered: Int, open: (String) -> Unit) {
    val library = roomStickers().associateBy { it.key }
    val inline = mutableMapOf<String, InlineTextContent>()
    val styled = buildAnnotatedString {
        if (block.optString("type") == "li") append(if (ordered > 0) "$ordered. " else "• ")
        for (run in block.optJSONArray("runs").objects()) {
            val sticker = library[run.optString("sticker")]
            if (sticker != null) {
                inline[sticker.key] = InlineTextContent(Placeholder(24.sp, 24.sp, PlaceholderVerticalAlign.TextCenter)) {
                    AsyncImage(sticker.url, sticker.label, Modifier.fillMaxSize())
                }
                appendInlineContent(sticker.key, sticker.label)
            } else {
                val href = permittedLink(run.optString("href"))
                val style = SpanStyle(
                    color = when (run.optString("color")) { "mint" -> Aqua; "purple" -> StreamPurple; else -> SoftText },
                    fontWeight = if (run.optBoolean("bold")) FontWeight.Bold else null,
                    fontStyle = if (run.optBoolean("italic")) FontStyle.Italic else null,
                    textDecoration = TextDecoration.combine(listOfNotNull(
                        TextDecoration.Underline.takeIf { run.optBoolean("underline") || href != null },
                        TextDecoration.LineThrough.takeIf { run.optBoolean("strike") }))
                )
                withStyle(style) {
                    if (href == null) append(run.optString("text"))
                    else withLink(LinkAnnotation.Clickable(href, TextLinkStyles(style = SpanStyle(color = Aqua))) { open(href) }) {
                        append(run.optString("text"))
                    }
                }
            }
        }
    }
    val align = when (block.optString("align")) { "center" -> TextAlign.Center; "right" -> TextAlign.End; else -> TextAlign.Start }
    val size = when (block.optString("type")) { "h2" -> 19.sp; "h3" -> 17.sp; else -> 15.sp }
    Text(styled, Modifier.fillMaxWidth(), fontSize = size, lineHeight = 24.sp, textAlign = align,
        fontWeight = if (size.value > 15f) FontWeight.SemiBold else null, inlineContent = inline)
}
