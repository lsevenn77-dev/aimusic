package kr.co.aifect.app

import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OfficialNoticeColorTest {
    @Test
    fun rendersPaletteCustomAndLegacyColors() {
        assertEquals(0xFFD3BAFF.toInt(), noticeTextColor("#D3BAFF")?.toArgb())
        assertEquals(0xFF91DDFC.toInt(), noticeTextColor("#91ddfc")?.toArgb())
        assertEquals(Aqua, noticeTextColor("mint"))
        assertEquals(StreamPurple, noticeTextColor("purple"))
        assertNull(noticeTextColor("#FFFFFF; color:transparent"))
        assertNull(noticeTextColor(""))
    }
}
