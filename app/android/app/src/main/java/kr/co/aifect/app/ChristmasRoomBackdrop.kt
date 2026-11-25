package kr.co.aifect.app

import android.animation.ValueAnimator
import android.content.res.AssetManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.graphics.RectF
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntSize
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.math.roundToInt
import kotlin.time.Duration.Companion.seconds

@Composable
internal fun christmasRoomEffectsEnabled(theme: JSONObject?, artwork: String?): Boolean {
    if (!isChristmasRoomArt(theme, artwork)) return false
    val portrait = LocalConfiguration.current.orientation == Configuration.ORIENTATION_PORTRAIT
    val expiry = theme!!.optLong("expires_at")
    val serverNow = theme.optLong("server_now")
    val remaining = remember(expiry, serverNow) {
        expiry - (serverNow.takeIf { it > 0L } ?: System.currentTimeMillis() / 1000L)
    }
    var active by remember(expiry, serverNow) { mutableStateOf(remaining > 0L) }
    LaunchedEffect(expiry, serverNow) {
        if (remaining > 0L) delay(remaining.seconds)
        active = false
    }
    return active && portrait
}

internal class ChristmasBackdropSize {
    private var previous = IntSize.Zero

    fun resolve(current: IntSize, keyboardVisible: Boolean): IntSize {
        if (!keyboardVisible || previous.width != current.width || previous.height == 0) previous = current
        return previous
    }
}

/** Clip the pre-keyboard artwork and its effects to the current room bounds. */
@Composable
internal fun Modifier.lockChristmasBackdrop(keyboardVisible: Boolean): Modifier {
    val backdrop = remember { ChristmasBackdropSize() }
    return clipToBounds().layout { measurable, constraints ->
        val viewport = IntSize(constraints.maxWidth, constraints.maxHeight)
        val photo = backdrop.resolve(viewport, keyboardVisible)
        val placeable = measurable.measure(Constraints.fixed(photo.width, photo.height))
        layout(viewport.width, viewport.height) { placeable.place(0, 0) }
    }
}

@Composable
internal fun ChristmasRoomParticles(modifier: Modifier = Modifier) {
    val assets = LocalContext.current.assets
    val artwork by produceState<ChristmasArtwork?>(null, assets) {
        value = withContext(Dispatchers.IO) { runCatching { ChristmasArtwork.load(assets) }.getOrNull() }
    }
    val ready = artwork ?: return
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val clock = remember(ready) { ChristmasFrameClock() }
    var time by remember(ready) { mutableDoubleStateOf(0.0) }
    LaunchedEffect(ready, lifecycle) {
        if (lifecycle != Lifecycle.State.RESUMED || !ValueAnimator.areAnimatorsEnabled()) return@LaunchedEffect
        clock.resume()
        while (isActive) withFrameNanos { if (clock.tick(it)) time = clock.seconds }
    }
    Canvas(modifier.testTag("voice-christmas-effects")) {
        val started = System.nanoTime()
        drawIntoCanvas { canvas -> ready.draw(canvas.nativeCanvas, size.width, size.height, density, time) }
        clock.recordDraw(System.nanoTime() - started)
    }
}

private class ChristmasArtwork(
    private val motion: ChristmasRoomMotion,
    private val sprites: Map<String, Bitmap>,
) {
    private val rectangle = RectF()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

    fun draw(canvas: android.graphics.Canvas, width: Float, height: Float, density: Float, time: Double) {
        motion.draw(width, height, density, time) sprite@{ asset, x, y, size, opacity ->
            val half = size / 2
            if (opacity <= 0.001f || x + half < 0 || y + half < 0 || x - half > width || y - half > height) return@sprite
            val sprite = sprites.getValue(asset)
            paint.alpha = (opacity.coerceIn(0f, 1f) * 255).roundToInt()
            rectangle.set(x - half, y - half, x + half, y + half)
            canvas.drawBitmap(sprite, null, rectangle, paint)
        }
    }

    companion object {
        fun load(assets: AssetManager): ChristmasArtwork {
            val config = assets.open("christmas/theme.json").bufferedReader().use { JSONObject(it.readText()) }
            val motion = ChristmasRoomMotion(config)
            val sprites = motion.spriteNames.associateWith { name ->
                assets.open("christmas/$name").use { checkNotNull(BitmapFactory.decodeStream(it)) }
            }
            return ChristmasArtwork(motion, sprites)
        }
    }
}
