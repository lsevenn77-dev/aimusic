package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke as DrawStroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal val BrandGradient get()=Brush.horizontalGradient(0f to Pink,.48f to Violet,1f to Aqua)

/** Native counterpart of the web's primary-button; keep Material's focus, ripple and disabled semantics. */
@Composable internal fun BrandButton(
 onClick:()->Unit,modifier:Modifier=Modifier,enabled:Boolean=true,
 shape:Shape=RoundedCornerShape(12.dp),colors:ButtonColors=ButtonDefaults.buttonColors(),
 elevation:ButtonElevation?=ButtonDefaults.buttonElevation(defaultElevation=0.dp,pressedElevation=0.dp),border:BorderStroke?=null,
 contentPadding:PaddingValues=ButtonDefaults.ContentPadding,interactionSource:MutableInteractionSource?=null,
 content:@Composable RowScope.()->Unit
){
 val branded=colors.containerColor==Pink||colors.containerColor==Aqua||colors.containerColor==Violet
 val paint=if(branded&&enabled)modifier.background(BrandGradient,shape)else modifier
 androidx.compose.material3.Button(onClick,paint,enabled,shape,
  if(branded&&enabled)colors.copy(containerColor=Color.Transparent,contentColor=Ink)else colors,
  elevation,border,contentPadding,interactionSource,content)
}

/** The approved web/app play control; touch semantics remain Material's. */
@Composable internal fun BrandPlayButton(description:String,onClick:()->Unit,modifier:Modifier=Modifier,diameter:Dp=32.dp,enabled:Boolean=true){
 IconButton(onClick=onClick,enabled=enabled,modifier=modifier.sizeIn(minWidth=48.dp,minHeight=48.dp)){
  Box(Modifier.size(diameter).background(Ink,androidx.compose.foundation.shape.CircleShape),contentAlignment=Alignment.Center){
   Canvas(Modifier.fillMaxSize()){
    drawCircle(brush=BrandGradient,radius=size.minDimension/2-1.5.dp.toPx(),alpha=if(enabled)1f else .35f,style=DrawStroke(1.5.dp.toPx()))
    val triangle=Path().apply{moveTo(size.width*.42f,size.height*.31f);lineTo(size.width*.42f,size.height*.69f);lineTo(size.width*.70f,size.height*.50f);close()}
    drawPath(triangle,brush=BrandGradient,alpha=if(enabled)1f else .35f)
   }
   Icon(Icons.Rounded.PlayArrow,description,tint=Color.Transparent,modifier=Modifier.size(18.dp))
  }
 }
}

@Composable internal fun TrackActionsMenu(song:Song,m:MusicModel,modifier:Modifier=Modifier,includeRelated:Boolean=false){
 var open by remember(song.id){mutableStateOf(false)}
 Box{
  IconButton(onClick={open=true},modifier=modifier){Icon(Icons.Rounded.Menu,"${song.title} 더보기",modifier=Modifier.size(18.dp),tint=Muted)}
  AppMenuPage(title=song.title,expanded=open,onDismissRequest={open=false}){
   PageMenuItem(text={Text("플레이리스트 담기")},onClick={open=false;m.pickPlaylist(song)})
   PageMenuItem(text={Text("선물하기")},onClick={open=false;m.openGifts(song)})
   if(m.ownsTrack(song))PageMenuItem(text={Text("삭제")},onClick={open=false;m.requestTrackDelete(song)})
   PageMenuItem(text={Text("댓글 보기")},onClick={open=false;m.openSong(song)})
   if(includeRelated&&song.cover)PageMenuItem(text={Text("원곡 듣기")},onClick={open=false;m.openOriginal(song)})
   else if(includeRelated&&song.raw.optInt("accepts_covers")==1)PageMenuItem(text={Text("다른 목소리")},onClick={open=false;m.openCovers(song)})
  }
 }
}
