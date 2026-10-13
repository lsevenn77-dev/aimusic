package kr.co.aifect.app

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/** Same mint light and plum depth as web design-surfaces.css; clip at the caller. */
internal fun Modifier.musicSurface(feature: Boolean = false): Modifier = drawWithCache {
 val base = Brush.linearGradient(
  0f to Color(if(feature)0xFF25313F else 0xFF1B2432),
  .58f to Color(if(feature)0xFF252535 else 0xFF151C28),
  1f to Color(if(feature)0xFF382B40 else 0xFF19212E),
  start=Offset.Zero, end=Offset(size.width,size.height*.55f)
 )
 val glow = Brush.radialGradient(
  listOf(Color(0xFF8EDDD2).copy(alpha=if(feature).15f else .05f),Color.Transparent),
  center=Offset.Zero,radius=size.width.coerceAtLeast(1f)*.85f
 )
 onDrawBehind { drawRect(base);drawRect(glow) }
}

/** Static, low-contrast line art: no bitmap download or perpetual animation. */
internal fun Modifier.musicIllustration(): Modifier = drawWithCache {
 val unit = 1.dp.toPx()
 val x = size.width - 52 * unit
 val y = size.height * .48f
 val ink = Color(0xFFAEBCD5).copy(alpha=.10f)
 val mic = Path().apply {
  moveTo(x-10*unit,y-25*unit);cubicTo(x-10*unit,y-42*unit,x+10*unit,y-42*unit,x+10*unit,y-25*unit)
  lineTo(x+10*unit,y);cubicTo(x+10*unit,y+16*unit,x-10*unit,y+16*unit,x-10*unit,y)
  close()
  moveTo(x-18*unit,y-2*unit);cubicTo(x-18*unit,y+24*unit,x+18*unit,y+24*unit,x+18*unit,y-2*unit)
  moveTo(x,y+18*unit);lineTo(x,y+32*unit)
  moveTo(x-12*unit,y+32*unit);lineTo(x+12*unit,y+32*unit)
 }
 onDrawBehind {
  drawPath(mic,ink,style=Stroke(unit))
  for(i in 0..7){val h=(4+(i%4)*5)*unit;val bx=x-42*unit-i*6*unit;drawLine(ink,Offset(bx,y-h),Offset(bx,y+h),unit)}
 }
}
