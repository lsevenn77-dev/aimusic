package kr.co.aifect.app

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Same mint light and plum depth as web design-surfaces.css; clip at the caller. */
internal fun Modifier.musicSurface(feature: Boolean = false): Modifier = drawWithCache {
 val base = Brush.linearGradient(
  0f to Color(if(feature)0xFF27313B else 0xFF212733),
  .58f to Color(if(feature)0xFF272735 else 0xFF1A1E29),
  1f to Color(if(feature)0xFF35283B else 0xFF251F2D),
  start=Offset.Zero, end=Offset(size.width,size.height*.55f)
 )
 val glow = Brush.radialGradient(
  listOf(Color(0xFF8EDDD2).copy(alpha=if(feature).15f else .05f),Color.Transparent),
  center=Offset.Zero,radius=size.width.coerceAtLeast(1f)*.85f
 )
 onDrawBehind { drawRect(base);drawRect(glow) }
}
