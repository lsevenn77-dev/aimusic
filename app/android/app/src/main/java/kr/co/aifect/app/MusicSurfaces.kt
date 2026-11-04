package kr.co.aifect.app

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

/** The current record's real artwork supplies the listening pages' ambience.
 * AppPage places this behind its header and content, over the shared aurora.
 */
@Composable internal fun AlbumListeningBackdrop(art:String?,tag:String){
 Box(Modifier.fillMaxSize().testTag(tag)){
  Crossfade(art,animationSpec=tween(500),label="listening album backdrop",modifier=Modifier.fillMaxSize()){image->
   image?.let{AsyncImage(it,null,Modifier.fillMaxSize().blur(28.dp).alpha(.72f),contentScale=ContentScale.Crop)}
  }
  Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Ink.copy(alpha=.18f),.48f to Ink.copy(alpha=.38f),.8f to Ink.copy(alpha=.9f),1f to Ink)))
 }
}

/** Approved navy surfaces: accent gradients are reserved for controls. */
internal fun Modifier.musicSurface(feature:Boolean=false):Modifier=drawWithCache {
 val surface=Brush.linearGradient(listOf(if(feature)Violet.copy(alpha=.08f) else Panel,Panel))
 onDrawBehind {drawRect(surface)}
}

/** Preserve existing callers while removing decorative microphone motifs. */
internal fun Modifier.musicIllustration():Modifier=this

/** Shared soft aurora: low-contrast violet and mint light over the navy canvas. */
internal fun Modifier.referenceBackdrop():Modifier=drawWithCache {
 val violet=Brush.radialGradient(listOf(Color(0xFF7460C2).copy(alpha=.17f),Color.Transparent),center=Offset(size.width*.16f,size.height*.09f),radius=size.width*.6f)
 val mint=Brush.radialGradient(listOf(Color(0xFF44CED8).copy(alpha=.14f),Color.Transparent),center=Offset(size.width*.68f,size.height*.13f),radius=size.width*.47f)
 val lower=Brush.radialGradient(listOf(Color(0xFF69529F).copy(alpha=.09f),Color.Transparent),center=Offset(size.width*.87f,size.height*.87f),radius=size.width*.75f)
 val center=Offset(size.width*.47f,size.height*.15f)
 val ribbon=Brush.radialGradient(0f to Color(0xFF62C9D8).copy(alpha=.12f),.45f to Color(0xFF8370C4).copy(alpha=.05f),1f to Color.Transparent,center=center,radius=size.width*.6f)
 onDrawBehind{
  drawRect(Ink);drawRect(violet);drawRect(mint);drawRect(lower)
  withTransform({rotate(-32f,center);scale(.34f,1.25f,center)}){drawCircle(ribbon,radius=size.width*.6f,center=center)}
 }
}
