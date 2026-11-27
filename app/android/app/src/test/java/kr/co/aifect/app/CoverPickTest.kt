package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class CoverPickTest {
    @Test
    fun readsPickFromNewResponsesAndAcceptsOlderCoverPayloads() {
        val base = payload("id" to "cover", "kind" to "cover", "original_id" to "original", "cover_mode" to "solo")
        assertFalse(Song(base).isCoverPicked)
        assertTrue(Song(base).canBePicked)
        base.put("is_composer_pick", 1).put("cover_pick_revision", 2)
        assertTrue(Song(base).isCoverPicked)
        assertEquals(2L, Song(base).coverPickRevision)
        assertTrue(Song(base.put("is_composer_pick", true)).isCoverPicked)
    }

    @Test
    fun onlyCompletedDuetsOfferPickActionsAndClearingUsesNull() {
        val duet = payload("id" to "cover", "kind" to "cover", "original_id" to "original", "cover_mode" to "duet", "duet_open" to 1)
        assertFalse(Song(duet).canBePicked)
        duet.put("duet_parent_id", "parent").put("duet_open", 0)
        assertTrue(Song(duet).canBePicked)
        val cleared = CoverPickState(payload("cover_id" to null, "revision" to 3, "can_manage" to true))
        assertNull(cleared.coverId)
        assertFalse(cleared.hasPick)
        assertTrue(cleared.canManage)
    }
}
