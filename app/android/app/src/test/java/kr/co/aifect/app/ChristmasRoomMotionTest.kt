package kr.co.aifect.app

import androidx.compose.ui.unit.IntSize
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import kotlin.math.min

class ChristmasRoomMotionTest {
    private val assets = File("src/main/room-assets/christmas")
    private val config = JSONObject(File(assets, "theme.json").readText())
    private val motion = ChristmasRoomMotion(config)

    @Test
    fun usesV873SpritesAndProjectsTheBulbsOnTheNativeCenteredCrop() {
        assertEquals(CHRISTMAS_ROOM_ART, config.getJSONObject("source").getString("path"))
        assertEquals(873, config.getJSONObject("source").getInt("siteVersion"))
        assertEquals(motion.spriteNames, assets.list()!!.filter { it.endsWith(".webp") }.toSet())
        data class Draw(val asset: String, val x: Float, val y: Float, val size: Float, val opacity: Float)
        val draws = mutableListOf<Draw>()
        motion.draw(390f, 844f, 1f, 3.2) { asset, x, y, size, opacity -> draws.add(Draw(asset, x, y, size, opacity)) }
        assertEquals(12, draws.count { it.asset.startsWith("bokeh-") })
        assertEquals(17, draws.count { it.asset == "dust-v61.webp" })
        val bulb = config.getJSONArray("bulbs").getJSONObject(0)
        val scale = 844.0 / 941
        assertEquals(((390 - 1672 * scale) / 2 + bulb.getDouble("x") * 1672 * scale).toFloat(), draws[0].x, 0.001f)
        assertEquals((bulb.getDouble("y") * 941 * scale).toFloat(), draws[0].y, 0.001f)
        val snow = draws.filter { it.asset.startsWith("snowflake-") }
        assertEquals(11, snow.size)
        val settings = config.getJSONObject("effect").getJSONArray("snow")
        snow.forEachIndexed { index, draw ->
            val flake = settings.getJSONObject(index)
            val phase = (0.32 + flake.getDouble("phase")) % 1
            val fade = minOf(1.0, phase / 0.19, (1 - phase) / 0.20)
            assertEquals(flake.getString("asset"), draw.asset)
            assertEquals((flake.getDouble("size") * (390.0 / 940) * 1.5).toFloat(), draw.size, 0.001f)
            assertEquals((min(0.85, flake.getDouble("opacity") * 1.25) * fade).toFloat(), draw.opacity, 0.0001f)
        }
    }

    @Test
    fun animatesOnlyTheVerifiedChristmasArtwork() {
        fun theme(sku: String, until: Long) = JSONObject().put("sku", sku).put("expires_at", until).put("server_now", 100L)
        val art = Endpoint.url(CHRISTMAS_ROOM_ART)
        assertTrue(isChristmasRoomArt(theme("theme_christmas", 120), art))
        assertFalse(isChristmasRoomArt(theme("theme_christmas", 100), art))
        assertFalse(isChristmasRoomArt(theme("theme_other", 120), art))
        assertFalse(isChristmasRoomArt(theme("theme_christmas", 120), Endpoint.url("/assets/other.webp")))
        assertFalse(isChristmasRoomArt(theme("theme_christmas", 120), "https://example.test$CHRISTMAS_ROOM_ART"))
    }

    @Test
    fun keyboardKeepsTheArtworkAndCanvasAtTheirPreviousHeight() {
        val backdrop = ChristmasBackdropSize()
        assertEquals(IntSize(390, 844), backdrop.resolve(IntSize(390, 844), false))
        assertEquals(IntSize(390, 844), backdrop.resolve(IntSize(390, 440), true))
        assertEquals(IntSize(412, 520), backdrop.resolve(IntSize(412, 520), true))
        assertEquals(IntSize(412, 860), backdrop.resolve(IntSize(412, 860), false))
    }

    @Test
    fun clockRunsAt30FpsDegradesTo15AndSkipsBackgroundTime() {
        val clock = ChristmasFrameClock()
        var frames = 0
        for (index in 0..60) {
            if (clock.tick(index * 1_000_000_000L / 60)) frames++
        }
        assertEquals(30, frames)
        for (index in 61..410) {
            if (clock.tick(index * 1_000_000_000L / 60)) clock.recordDraw(12_000_000L)
        }
        assertEquals(15, clock.framesPerSecond)
        val beforePause = clock.seconds
        clock.resume()
        assertFalse(clock.tick(20_000_000_000L))
        assertEquals(beforePause, clock.seconds, 0.000001)
        frames = (1..60).count { clock.tick(20_000_000_000L + it * 1_000_000_000L / 60) }
        assertEquals(15, frames)
    }
}
