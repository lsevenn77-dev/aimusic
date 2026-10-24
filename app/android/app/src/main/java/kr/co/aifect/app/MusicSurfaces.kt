package kr.co.aifect.app

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Brush

/** Approved navy surfaces: accent gradients are reserved for controls. */
internal fun Modifier.musicSurface(feature:Boolean=false):Modifier=drawWithCache {
 val surface=Brush.linearGradient(listOf(if(feature)Raised else Panel,Panel))
 onDrawBehind {drawRect(surface)}
}

/** Preserve existing callers while removing decorative microphone motifs. */
internal fun Modifier.musicIllustration():Modifier=this
