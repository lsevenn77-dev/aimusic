package kr.co.aifect.app

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

internal const val CHRISTMAS_ROOM_ART = "/assets/themes/christmas-v61/assets/christmas-wide-1672.webp"

internal fun isChristmasRoomArt(theme: JSONObject?, imageUrl: String?): Boolean {
    if (theme?.optString("sku") != "theme_christmas" || !RoomThemeSync.validTheme(theme)) return false
    return imageUrl?.substringBefore('?') == Endpoint.url(CHRISTMAS_ROOM_ART)
}

internal fun interface ChristmasSpriteSink {
    fun draw(asset: String, x: Float, y: Float, size: Float, opacity: Float)
}

/** The v873 data uses normalized anchors and CSS pixels. Convert them to native canvas pixels. */
internal class ChristmasRoomMotion(config: JSONObject) {
    private val source = config.getJSONObject("source")
    private val artworkWidth = source.getDouble("width")
    private val artworkHeight = source.getDouble("height")
    private val effect = config.getJSONObject("effect")
    private val period = effect.getDouble("period")
    private val curveFps = effect.getDouble("curveFPS")
    private val curves = effect.getJSONArray("curves").mapEntries { row ->
        getJSONArray(row).let { values -> DoubleArray(values.length()) { values.getDouble(it) } }
    }
    private val bulbs = config.getJSONArray("bulbs").mapEntries { Bulb(getJSONObject(it)) }
    private val bokeh = effect.getJSONArray("bokeh").mapEntries { Bokeh(getJSONObject(it)) }
    private val snow = effect.getJSONArray("snow").mapEntries { Snow(getJSONObject(it)) }
    private val dust = effect.getJSONArray("dust").mapEntries { Dust(getJSONObject(it)) }

    val spriteNames = buildSet {
        add("bulb-dim.webp")
        add("bulb-glow-v61.webp")
        add("dust-v61.webp")
        bokeh.forEach { add(it.asset) }
        snow.forEach { add(it.asset) }
    }

    fun draw(width: Float, height: Float, density: Float, time: Double, sink: ChristmasSpriteSink) {
        if (width <= 0 || height <= 0 || density <= 0) return
        val angle = 2 * PI * (time % period) / period
        // VoiceRoomBackdrop uses centered ContentScale.Crop. Place light anchors on that same crop.
        val fill = max(width / artworkWidth, height / artworkHeight)
        val xOffset = (width - artworkWidth * fill) / 2
        val yOffset = (height - artworkHeight * fill) / 2
        val widthDp = width / density.toDouble()
        val heightDp = height / density.toDouble()
        val base = min(widthDp / 940, heightDp / 1672)
        val readable = minOf(widthDp / 940, heightDp / 940, 1.15)
        val scale = max(base, min(readable, base * 1.8)) * density

        for (bulb in bulbs) {
            val value = curve(bulb.curve, time)
            val x = xOffset + bulb.x * artworkWidth * fill
            val y = yOffset + bulb.y * artworkHeight * fill
            val size = bulb.radius * fill * 3
            sink.draw("bulb-dim.webp", x.toFloat(), y.toFloat(), size.toFloat(), (0.82 * (1 - value)).toFloat())
            sink.draw("bulb-glow-v61.webp", x.toFloat(), y.toFloat(), size.toFloat(), (0.12 + 0.72 * value * value).toFloat())
        }
        for (light in bokeh) {
            val phase = 2 * PI * light.phase
            val x = light.x * width + light.dx * scale * sin(angle + phase)
            val y = light.y * height + light.dy * scale * cos(angle + phase)
            val size = (light.extent * 2 + 1) * scale
            val opacity = light.opacity * (0.90 + 0.10 * sin(angle * light.harmonic + phase))
            sink.draw(light.asset, x.toFloat(), y.toFloat(), size.toFloat(), opacity.toFloat())
        }
        for ((index, flake) in snow.withIndex()) {
            val phase = (time / period + flake.phase) % 1
            val fade = minOf(1.0, phase / 0.19, (1 - phase) / 0.20)
            val x = flake.x * width + (flake.dx * (phase - 0.5) + 6 * sin(2 * PI * phase + index * 1.73)) * scale
            val y = flake.y * height + flake.dy * (phase - 0.5) * scale
            val opacity = min(0.85, flake.opacity * 1.25) * fade
            sink.draw(flake.asset, x.toFloat(), y.toFloat(), (flake.size * scale * 1.5).toFloat(), opacity.toFloat())
        }
        for ((index, particle) in dust.withIndex()) {
            val phase = (time / period + particle.phase) % 1
            val fade = minOf(1.0, phase / 0.22, (1 - phase) / 0.22)
            val x = particle.x * width + 10 * scale * sin(2 * PI * phase + index * 0.57)
            val y = particle.y * height - 50 * scale * (phase - 0.5)
            sink.draw("dust-v61.webp", x.toFloat(), y.toFloat(), (particle.radius * 6 * scale).toFloat(), (particle.opacity * fade).toFloat())
        }
    }

    private fun curve(index: Int, time: Double): Double {
        val samples = curves[index % curves.size]
        val frame = (time % period) * curveFps
        val integer = floor(frame)
        val offset = integer.toInt() % samples.size
        return samples[offset] + (samples[(offset + 1) % samples.size] - samples[offset]) * (frame - integer)
    }

    private data class Bulb(val x: Double, val y: Double, val radius: Double, val curve: Int) {
        constructor(row: JSONObject) : this(row.getDouble("x"), row.getDouble("y"), row.getDouble("radius"), row.getInt("curve"))
    }

    private class Bokeh(row: JSONObject) {
        val x = row.getDouble("x")
        val y = row.getDouble("y")
        val dx = row.getDouble("dx")
        val dy = row.getDouble("dy")
        val phase = row.getDouble("phase")
        val extent = row.getDouble("extent")
        val opacity = row.getDouble("opacity")
        val harmonic = row.getDouble("harmonic")
        val asset = row.getString("asset")
    }

    private class Snow(row: JSONObject) {
        val x = row.getDouble("x")
        val y = row.getDouble("y")
        val dx = row.getDouble("dx")
        val dy = row.getDouble("dy")
        val phase = row.getDouble("phase")
        val size = row.getDouble("size")
        val opacity = row.getDouble("opacity")
        val asset = row.getString("asset")
    }

    private class Dust(row: JSONObject) {
        val x = row.getDouble("x")
        val y = row.getDouble("y")
        val phase = row.getDouble("phase")
        val radius = row.getDouble("radius")
        val opacity = row.getDouble("opacity")
    }

    private inline fun <T> JSONArray.mapEntries(read: JSONArray.(Int) -> T): List<T> =
        List(length()) { read(it) }
}

/** Frame time stays frozen while the room is inactive. Slow devices draw at 15 fps. */
internal class ChristmasFrameClock {
    var seconds = 0.0
        private set
    var framesPerSecond = 30
        private set
    private var lastFrame: Long? = null
    private var windowStart: Long? = null
    private var drawElapsed = 0.0
    private var frames = 0
    private var slowFrames = 0
    private var draws = 0
    private var slowDraws = 0

    fun resume() {
        lastFrame = null
        windowStart = null
        drawElapsed = 0.0
        frames = 0
        slowFrames = 0
        draws = 0
        slowDraws = 0
    }

    fun tick(now: Long): Boolean {
        val previous = lastFrame
        lastFrame = now
        if (previous == null) {
            windowStart = now
            return false
        }
        val gap = now - previous
        if (gap !in 1L..250_000_000L) return false
        val elapsed = min(gap, 100_000_000L)
        seconds += elapsed / 1_000_000_000.0
        drawElapsed += elapsed
        if (framesPerSecond == 30) {
            frames++
            if (gap > 48_000_000L) slowFrames++
            if (now - (windowStart ?: now) >= 6_000_000_000L && draws >= 90) {
                if (slowFrames * 4 > frames || slowDraws * 20 > draws) framesPerSecond = 15
                windowStart = now
                frames = 0
                slowFrames = 0
                draws = 0
                slowDraws = 0
            }
        }
        val step = 1_000_000_000.0 / framesPerSecond
        if (drawElapsed + 100_000 < step) return false
        drawElapsed = (drawElapsed - step).coerceAtLeast(0.0) % step
        return true
    }

    fun recordDraw(nanos: Long) {
        if (framesPerSecond == 30) {
            draws++
            if (nanos > 10_000_000L) slowDraws++
        }
    }
}
