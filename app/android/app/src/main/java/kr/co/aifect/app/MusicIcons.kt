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
   moveTo(3f,7f);lineTo(6f,7f);curveTo(10f,7f,14f,17f,18f,17f);lineTo(21f,17f)
   moveTo(18f,14f);lineTo(21f,17f);lineTo(18f,20f)
   moveTo(3f,17f);lineTo(6f,17f);curveTo(8f,17f,9f,15f,10f,14f)
   moveTo(14f,10f);curveTo(16f,7f,17f,7f,18f,7f);lineTo(21f,7f)
   moveTo(18f,4f);lineTo(21f,7f);lineTo(18f,10f)
  }
 }.build()
}
