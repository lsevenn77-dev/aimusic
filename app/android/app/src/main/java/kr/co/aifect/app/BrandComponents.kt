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
import kotlinx.coroutines.CancellationException

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
 val account=m.user?.optString("id")
 var open by remember(song.id,account){mutableStateOf(false)}
 var pick by remember(song.id,account){mutableStateOf<CoverPickState?>(null)}
 var replacement by remember(song.id,account){mutableStateOf<CoverPickState?>(null)}
 LaunchedEffect(open,song.id,account){
  pick=null
  if(open&&account!=null&&song.canBePicked){
   try{pick=m.readCoverPick(song)}catch(e:Exception){if(e is CancellationException)throw e}
  }
 }
 Box{
  IconButton(onClick={open=true},modifier=modifier){Icon(Icons.Rounded.Menu,"${song.title} 더보기",modifier=Modifier.size(18.dp),tint=Muted)}
  DropdownMenu(
   expanded=open,
   onDismissRequest={open=false},
   modifier=Modifier.widthIn(min=154.dp,max=224.dp),
   shape=RoundedCornerShape(12.dp),
   containerColor=Panel,
   border=BorderStroke(1.dp,Stroke)
  ){
   pick?.let{selection->
    val remove=selection.coverId==song.id
    DropdownMenuItem(text={Text(if(remove)"PICK 해제" else if(selection.hasPick)"이 커버로 PICK 변경" else "PICK 지정")},onClick={
     open=false
     if(selection.hasPick&&!remove)replacement=selection else m.changeCoverPick(song,selection)
    })
   }
   DropdownMenuItem(text={Text("플레이리스트 담기")},onClick={open=false;m.pickPlaylist(song)})
   DropdownMenuItem(text={Text("선물하기")},onClick={open=false;m.openGifts(song)})
   if(m.ownsTrack(song))DropdownMenuItem(text={Text("삭제")},onClick={open=false;m.requestTrackDelete(song)})
   DropdownMenuItem(text={Text("댓글 보기")},onClick={open=false;m.openSong(song)})
   if(includeRelated&&song.cover)DropdownMenuItem(text={Text("원곡 듣기")},onClick={open=false;m.openOriginal(song)})
   else if(includeRelated&&song.raw.optInt("accepts_covers")==1)DropdownMenuItem(text={Text("다른 목소리")},onClick={open=false;m.openCovers(song)})
  }
 }
 replacement?.let{selection->
  AlertDialog(
   onDismissRequest={replacement=null},title={Text("이 커버로 PICK을 변경할까요?")},
   text={Text("현재 PICK  ${selection.performer}\n새 PICK  ${song.credit}")},
   dismissButton={TextButton({replacement=null}){Text("취소")}},
   confirmButton={TextButton({replacement=null;m.changeCoverPick(song,selection)}){Text("변경하기")}}
  )
 }
}
