package kr.co.aifect.app

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

internal val SimpleShuffle:ImageVector by lazy {
 ImageVector.Builder("Shuffle",24.dp,24.dp,24f,24f).apply {
  path(stroke=SolidColor(Color.Black),strokeLineWidth=1.7f,strokeLineCap=StrokeCap.Round,strokeLineJoin=StrokeJoin.Round){
   moveTo(4f,7f);lineTo(7f,7f);lineTo(17f,17f);lineTo(20f,17f)
   moveTo(17f,14f);lineTo(20f,17f);lineTo(17f,20f)
   moveTo(4f,17f);lineTo(7f,17f);lineTo(10f,14f)
   moveTo(14f,10f);lineTo(17f,7f);lineTo(20f,7f)
   moveTo(17f,4f);lineTo(20f,7f);lineTo(17f,10f)
  }
 }.build()
}
