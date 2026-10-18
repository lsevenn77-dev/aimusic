package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

internal val BrandGradient get()=Brush.horizontalGradient(0f to Pink,.48f to Violet,1f to Aqua)

/** Native counterpart of the web's primary-button; keep Material's focus, ripple and disabled semantics. */
@Composable internal fun BrandButton(
 onClick:()->Unit,modifier:Modifier=Modifier,enabled:Boolean=true,
 shape:Shape=RoundedCornerShape(12.dp),colors:ButtonColors=ButtonDefaults.buttonColors(),
 elevation:ButtonElevation?=ButtonDefaults.buttonElevation(),border:BorderStroke?=null,
 contentPadding:PaddingValues=ButtonDefaults.ContentPadding,interactionSource:MutableInteractionSource?=null,
 content:@Composable RowScope.()->Unit
){
 val branded=colors.containerColor==Pink||colors.containerColor==Aqua||colors.containerColor==Violet
 val paint=if(branded&&enabled)modifier.background(BrandGradient,shape)else modifier
 androidx.compose.material3.Button(onClick,paint,enabled,shape,
  if(branded&&enabled)colors.copy(containerColor=Color.Transparent,contentColor=Ink)else colors,
  elevation,border,contentPadding,interactionSource,content)
}

@Composable internal fun TrackActionsMenu(song:Song,m:MusicModel,modifier:Modifier=Modifier,includeRelated:Boolean=false){
 var open by remember(song.id){mutableStateOf(false)}
 Box{
  IconButton(onClick={open=true},modifier=modifier){Icon(Icons.Outlined.MoreHoriz,"${song.title} 더보기",tint=Muted)}
  AppMenuPage(title=song.title,expanded=open,onDismissRequest={open=false}){
   PageMenuItem(text={Text("플레이리스트 담기")},onClick={open=false;m.pickPlaylist(song)})
   PageMenuItem(text={Text("선물하기")},onClick={open=false;m.openGifts(song)})
   PageMenuItem(text={Text("댓글 보기")},onClick={open=false;m.openSong(song)})
   if(includeRelated&&song.cover)PageMenuItem(text={Text("원곡 듣기")},onClick={open=false;m.openOriginal(song)})
   else if(includeRelated&&song.raw.optInt("accepts_covers")==1)PageMenuItem(text={Text("다른 목소리")},onClick={open=false;m.openCovers(song)})
  }
 }
}
