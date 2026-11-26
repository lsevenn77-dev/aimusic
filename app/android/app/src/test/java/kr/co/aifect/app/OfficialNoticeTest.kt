package kr.co.aifect.app

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class OfficialNoticeTest {
    private val channel = payload(
        "id" to OfficialNotice.channelId, "name" to "아이팩트 안내",
        "is_notice" to true, "read_only" to true, "notice_type" to "official"
    )
    private val guide = payload("id" to "campaign:welcome", "legacy_id" to "aifect-guide", "created" to 20,
        "guide" to payload("greeting" to "환영합니다."))
    private val gift = payload("id" to "campaign:premium", "legacy_id" to "premium-open-event-20261231-v1", "created" to 30,
        "notice" to payload("title" to "선물", "body" to "공지 본문"))
    private val mine = payload("id" to "dm:sent", "created" to 40, "kind" to "dm", "mine" to true, "body" to "문의")

    @Test fun channelUsesServerIdentifierAndMetadata() {
        val impersonator = payload("id" to "someone", "name" to "아이팩트 안내")
        val legacy = payload("id" to "aifect-guide", "is_notice" to true, "notice_type" to "welcome")
        val invalid = payload("id" to OfficialNotice.channelId, "name" to "아이팩트 안내")
        assertFalse(invalid.isOfficialNotice())
        assertEquals(listOf(channel, impersonator), OfficialNotice.inboxRows(listOf(channel, impersonator, legacy, invalid)))
    }

    @Test fun officialAliasesAndExplicitEntriesResolveWithoutMatchingOrdinaryUsers() {
        assertNull(OfficialNoticeRoute.fromTarget("person-id"))
        assertNull(OfficialNoticeRoute.fromPath("dm/person-id", "campaign:premium"))
        assertEquals(OfficialNoticeRoute(), OfficialNoticeRoute.fromTarget("notice"))
        assertEquals(OfficialNoticeRoute(), OfficialNoticeRoute.fromTarget(OfficialNotice.channelId))
        assertEquals("aifect-guide", OfficialNoticeRoute.fromTarget("aifect-guide")?.anchor)
        assertEquals("premium-open-event-20261231-v1", OfficialNoticeRoute.fromTarget("premium-open-event-20261231-v1")?.anchor)
        assertEquals("dm:admin-id", OfficialNoticeRoute.fromPath("dm/notice", "dm:admin-id")?.anchor)
    }

    @Test fun paginationAndRefreshRetainDistinctItemsAndAcknowledgedIds() {
        val head = OfficialNoticeFeed.decode(payload("channel" to channel, "items" to JSONArray(listOf(gift, mine)),
            "before" to "30|campaign:premium"))
        val tail = OfficialNoticeFeed.decode(payload("channel" to channel, "items" to JSONArray(listOf(guide, gift)),
            "before" to null))
        val merged = head.acknowledge(setOf("campaign:premium"), 80).prepend(tail).refresh(head)
        assertEquals(listOf("campaign:welcome", "campaign:premium", "dm:sent"), merged.items.map { it.id })
        assertTrue(merged.items.first().matches("aifect-guide"))
        assertEquals(listOf("campaign:welcome"), merged.items.filter { it.unread }.map { it.id })
        assertEquals(80L, merged.items[1].readAt)
        assertNull(merged.before)
    }

    @Test fun receiptDateUsesKoreaTimeAndReadRequestPreservesOtherCaches() {
        assertEquals("2026.11.25 00:10", activityDate(Instant.parse("2026-11-24T15:10:00Z").epochSecond))
        assertFalse(NativeReadPolicy.invalidatesOnMutation(OfficialNotice.path, "PATCH"))
        assertNull(NativeReadPolicy.ttlMillis(OfficialNotice.inboxPath))
        assertNull(NativeReadPolicy.ttlMillis(OfficialNotice.path))
    }
}
