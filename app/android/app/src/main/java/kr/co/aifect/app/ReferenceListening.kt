@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.media3.common.Player
import coil.compose.AsyncImage

@Composable internal fun ReferenceSongHero(m:MusicModel,song:Song,viewport:Dp,save:()->Unit,sing:()->Unit,controlsEnd:(Float)->Unit,details:()->Unit){
 val active=m.current?.id==song.id
 var seek by remember(song.id){mutableStateOf<Float?>(null)}
 val duration=if(active)m.duration else (song.duration*1000).toLong()
 val density=LocalDensity.current
 val fontScale=density.fontScale
 var controlsHeight by remember(song.id,fontScale){mutableIntStateOf(0)}
 BoxWithConstraints(Modifier.fillMaxWidth().testTag("song-listening-hero")){
  // Reserve space for all controls first; larger system fonts remain scrollable, never clipped.
  val controls=if(controlsHeight>0)with(density){controlsHeight.toDp()}else (450+130*(fontScale-1f)).dp
  val art=(viewport-controls-20.dp).coerceIn(100.dp,(maxWidth*.86f).coerceAtLeast(100.dp)).coerceAtMost(340.dp)
  Column(Modifier.fillMaxWidth().heightIn(min=viewport),horizontalAlignment=Alignment.CenterHorizontally){
   Artwork(song,Modifier.padding(top=16.dp).size(art).shadow(16.dp,RoundedCornerShape(14.dp),ambientColor=Color.Black.copy(alpha=.45f),spotColor=Color.Black.copy(alpha=.4f)),14.dp)
   Column(Modifier.fillMaxWidth().onSizeChanged{controlsHeight=it.height},horizontalAlignment=Alignment.CenterHorizontally){
   Text(song.title,fontSize=22.sp,lineHeight=28.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=14.dp),textAlign=androidx.compose.ui.text.style.TextAlign.Center)
   Row(Modifier.padding(top=5.dp),verticalAlignment=Alignment.CenterVertically){
    Text(song.credit,fontSize=13.sp,lineHeight=18.sp,color=SoftText,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f,false).clickable{if(song.hasAiArtist)m.openProfile(song.raw.optString("artist_id"),"artist")else m.openProfile(song.producerId)})
    if(song.hasAiArtist)Text(" · 제작 ${song.producer}",fontSize=12.sp,lineHeight=18.sp,color=Aqua,modifier=Modifier.clickable{m.openProfile(song.producerId)})
   }
   Slider(value=seek?:if(active)m.position.toFloat()else 0f,onValueChange={seek=it},onValueChangeFinished={seek?.let{m.controller?.seekTo(it.toLong())};seek=null},enabled=active,valueRange=0f..duration.coerceAtLeast(1).toFloat(),modifier=Modifier.padding(top=8.dp).height(30.dp),thumb={Box(Modifier.size(11.dp).shadow(7.dp,CircleShape,ambientColor=Violet,spotColor=Violet).background(Color.White,CircleShape))},track={slider->
    Box(Modifier.fillMaxWidth().height(2.dp).clip(CircleShape).background(SoftText.copy(alpha=.32f))){Box(Modifier.fillMaxWidth((slider.value/slider.valueRange.endInclusive).coerceIn(0f,1f)).fillMaxHeight().background(BrandGradient))}
   })
   Row(Modifier.fillMaxWidth()){Text(timeLabel(if(active)(seek?:m.position.toFloat()).toLong()else 0),fontSize=11.sp,lineHeight=16.sp,color=Muted);Spacer(Modifier.weight(1f));Text(timeLabel(duration),fontSize=11.sp,lineHeight=16.sp,color=Muted)}
   Row(Modifier.fillMaxWidth().padding(top=8.dp,bottom=4.dp).onGloballyPositioned{controlsEnd(it.positionInParent().y+it.size.height+with(density){(art+16.dp).toPx()})},horizontalArrangement=Arrangement.SpaceEvenly,verticalAlignment=Alignment.CenterVertically){
    IconButton({m.controller?.shuffleModeEnabled=!m.shuffle},enabled=active){Icon(SimpleShuffle,"셔플",tint=if(active&&m.shuffle)Aqua else Muted)}
    IconButton({m.controller?.seekToPreviousMediaItem()},enabled=active&&m.controller?.hasPreviousMediaItem()==true){Icon(Icons.Rounded.SkipPrevious,"이전 곡")}
    Box(Modifier.size(78.dp),contentAlignment=Alignment.Center){
     Box(Modifier.size(78.dp).background(Brush.radialGradient(listOf(Violet.copy(alpha=.3f),Violet.copy(alpha=.1f),Color.Transparent)),CircleShape))
     BrandButton(onClick={if(active)m.toggle()else m.play(song)},shape=CircleShape,border=BorderStroke(1.dp,Color.White.copy(alpha=.5f)),modifier=Modifier.size(64.dp).testTag("song-detail-listen"),contentPadding=PaddingValues(0.dp)){Icon(if(active&&m.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(active&&m.playing)"일시정지"else "노래 듣기",Modifier.size(32.dp))}
    }
    IconButton({m.controller?.seekToNextMediaItem()},enabled=active&&m.controller?.hasNextMediaItem()==true){Icon(Icons.Rounded.SkipNext,"다음 곡")}
    IconButton({m.controller?.repeatMode=if(m.repeat==Player.REPEAT_MODE_OFF)Player.REPEAT_MODE_ALL else Player.REPEAT_MODE_OFF},enabled=active){Icon(Icons.Rounded.Repeat,"반복",tint=if(active&&m.repeat!=Player.REPEAT_MODE_OFF)Aqua else Muted)}
   }
   Row(Modifier.fillMaxWidth().testTag("song-quick-actions"),horizontalArrangement=Arrangement.SpaceEvenly){
    val actions=listOf(Triple("좋아요",if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,{m.like(song)}),Triple("저장",Icons.Rounded.Add,save),Triple("부르기",Icons.Rounded.GraphicEq,sing),Triple("선물",Icons.Rounded.CardGiftcard,{m.openGifts(song)}))
    actions.forEach{(name,icon,action)->
     val enabled=!m.busy&&(name!="선물"||!m.ownsTrack(song))
     TextButton(action,enabled=enabled,modifier=Modifier.weight(1f).testTag("song-action-$name"),contentPadding=PaddingValues(vertical=6.dp)){
      Column(horizontalAlignment=Alignment.CenterHorizontally){Icon(icon,null,Modifier.size(23.dp),tint=if(!enabled)Muted.copy(alpha=.45f)else if(name=="좋아요")Pink else SoftText);Text(name,fontSize=11.sp,lineHeight=16.sp,color=if(enabled)SoftText else Muted.copy(alpha=.45f),modifier=Modifier.padding(top=5.dp))}
     }
    }
   }
   HorizontalDivider(Modifier.padding(top=8.dp),color=Stroke)
   Text("${song.plays}회 감상 · 댓글 ${verifiedSongCommentCount(song,m)}",fontSize=10.sp,lineHeight=15.sp,color=SoftText,modifier=Modifier.padding(top=10.dp))
   TextButton(details,modifier=Modifier.fillMaxWidth().heightIn(min=56.dp).padding(bottom=4.dp).testTag("song-details-jump"),contentPadding=PaddingValues(vertical=4.dp)){
    Column(Modifier.fillMaxWidth(),horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Rounded.KeyboardArrowDown,null,Modifier.size(18.dp),tint=SoftText);Text("곡 이야기 더 보기",fontSize=10.sp,lineHeight=15.sp,color=SoftText,maxLines=1,textAlign=androidx.compose.ui.text.style.TextAlign.Center,modifier=Modifier.fillMaxWidth().testTag("song-details-jump-label"))}
   }
   }
  }
 }
}

@Composable internal fun ReferenceSongDescription(song:Song){
 var expanded by rememberSaveable(song.id){mutableStateOf(false)}
 var overflowing by remember(song.id){mutableStateOf(false)}
 var info by rememberSaveable(song.id){mutableStateOf(false)}
 Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(4.dp)){
 Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("곡 소개",Modifier.weight(1f),fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.Bold);TextButton({info=true},modifier=Modifier.height(32.dp),contentPadding=PaddingValues(horizontal=0.dp)){Text("곡 정보",fontSize=11.sp,lineHeight=16.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(16.dp))}}
 Text(song.description.ifBlank{"등록된 곡 소개가 없어요."},maxLines=if(expanded)Int.MAX_VALUE else 2,overflow=TextOverflow.Ellipsis,onTextLayout={if(!expanded)overflowing=it.hasVisualOverflow},fontSize=14.sp,lineHeight=20.sp,color=SoftText,modifier=Modifier.testTag("song-description"))
 if(overflowing||expanded)TextButton({expanded=!expanded},modifier=Modifier.height(30.dp).testTag("song-description-toggle"),contentPadding=PaddingValues(0.dp)){Text(if(expanded)"접기"else "더보기",fontSize=11.sp,lineHeight=16.sp);Icon(if(expanded)Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,null,Modifier.size(16.dp))}
 HorizontalDivider(Modifier.padding(top=4.dp),color=Stroke)
 }
 if(info)AppPage("곡 정보",{info=false}){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){Text(song.title,fontSize=22.sp,fontWeight=FontWeight.Bold);Text(song.credit);Text("장르 · ${song.genreLabel}",color=Muted);Text("길이 · ${timeLabel((song.duration*1000).toLong())}",color=Muted);song.raw.optLong("created").takeIf{it>0}?.let{Text("공개일 · "+java.text.SimpleDateFormat("yyyy.MM.dd",java.util.Locale.KOREA).format(java.util.Date(it*1000)),color=Muted)}}}
}

@Composable internal fun ReferenceLyrics(m:MusicModel,song:Song){
 var follow by rememberSaveable(song.id){mutableStateOf(true)}
 var full by rememberSaveable(song.id){mutableStateOf(false)}
 var frozen by remember(song.id){mutableIntStateOf(0)}
 val active=m.current?.id==song.id
 val rows=if(active)m.lyricRows else emptyList()
 val index=if(follow)rows.indexOfLast{it.first<=m.position/1000.0}.coerceAtLeast(0)else frozen.coerceAtMost(rows.lastIndex.coerceAtLeast(0))
 Column(Modifier.fillMaxWidth()){
  BoxWithConstraints(Modifier.fillMaxWidth()){
   val stacked=maxWidth<300.dp||LocalDensity.current.fontScale>1.2f
   val heading:@Composable ()->Unit={
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)){
     Text("가사",fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.Bold)
     Text("PREMIUM",fontSize=8.sp,lineHeight=12.sp,fontWeight=FontWeight.SemiBold,color=Pink,modifier=Modifier.clip(RoundedCornerShape(4.dp)).background(Pink.copy(alpha=.13f)).padding(horizontal=5.dp,vertical=3.dp))
    }
   }
   val access:@Composable RowScope.()->Unit={
    OutlinedButton({frozen=index;follow=!follow},shape=RoundedCornerShape(10.dp),border=BorderStroke(.7.dp,SoftText.copy(alpha=.4f)),contentPadding=PaddingValues(horizontal=7.dp,vertical=0.dp),modifier=Modifier.heightIn(min=30.dp)){
     Icon(Icons.Rounded.GraphicEq,null,Modifier.size(12.dp),tint=if(follow)Aqua else Muted);Text("자동 따라가기",fontSize=9.sp,lineHeight=13.sp,color=if(follow)SoftText else Muted,modifier=Modifier.padding(start=3.dp))
    }
    TextButton({if(!active){m.play(song)}else if(m.lyricsAccess=="full")full=true else m.showBilling=true},contentPadding=PaddingValues(start=9.dp,end=0.dp)){Text("전체 가사",fontSize=10.sp,lineHeight=14.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(14.dp))}
   }
   if(stacked)Column{heading();Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End,verticalAlignment=Alignment.CenterVertically,content=access)}
   else Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Box(Modifier.weight(1f)){heading()};access()}
  }
  if(rows.isNotEmpty())rows.drop((index-1).coerceAtLeast(0)).take(3).forEachIndexed{i,line->Text(line.second.ifBlank{"♪"},fontSize=14.sp,lineHeight=23.sp,color=if(i+(index-1).coerceAtLeast(0)==index)SoftText else Muted)}
  else Text(if(active)m.lyric.ifBlank{"가사를 불러오고 있어요."}else "노래를 재생하면 현재 가사가 표시돼요.",fontSize=13.sp,lineHeight=20.sp,color=Muted,modifier=Modifier.padding(top=6.dp))
 }
 HorizontalDivider(color=Stroke)
 if(full&&active&&m.lyricsAccess=="full")AppPage("전체 가사",{full=false}){LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){items(rows){Text(it.second,fontSize=17.sp,lineHeight=27.sp)}}}
}

@Composable internal fun ReferenceSupporters(m:MusicModel,song:Song){
 val read=currentRead(m,"/api/tracks/${song.id}/gifts")
 val ranking=read.data?.optJSONArray("ranking").objects()
 Column(Modifier.padding(vertical=14.dp)){
  HorizontalDivider(color=Stroke);Text("응원 순위",fontSize=18.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=16.dp,bottom=12.dp))
  ReadStatus(read)
  ranking.take(3).forEachIndexed{i,p->Row(Modifier.fillMaxWidth().padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically){Text("${i+1}",color=Pink,modifier=Modifier.width(28.dp));Text(p.optString("name"),Modifier.weight(1f),fontSize=14.sp);Text("${p.optInt("score")}점",fontSize=12.sp,color=Muted)}}
  if(read.data!=null&&ranking.isEmpty())Text("아직 받은 응원이 없어요.",fontSize=13.sp,color=Muted)
  if(ranking.size>3)TextButton({m.openGifts(song)}){Text("전체보기",fontSize=12.sp)}
 }
}
