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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException

/** The same catalogue and period boundaries as the mobile web chart. */
@Composable internal fun ChartScreen(m:MusicModel){
 var category by rememberSaveable{mutableStateOf("top")}
 var period by rememberSaveable{mutableStateOf("week")}
 var tracks by remember{mutableStateOf<List<Song>>(emptyList())}
 var busy by remember{mutableStateOf(true)}
 var error by remember{mutableStateOf<String?>(null)}
 var comparison by remember{mutableStateOf(false)}
 var retry by remember{mutableIntStateOf(0)}
 val periods=listOf("today" to "오늘","week" to "이번 주","month" to "이달","all" to "명예의 전당")
 val categories=listOf("top" to "인기 차트","karaoke" to "노래방 차트","rising" to "급상승","newcomers" to "신인","latest" to "최신 음악")
 val path="/api/catalog?section=tracks"+(if(category=="latest")"" else "&chart=$category")+(if(category=="top")"&period=$period" else "")
 val account=m.user?.optString("id")
 LaunchedEffect(path,account,retry){
  tracks=m.api.peek(path)?.tracks().orEmpty();busy=true;error=null;comparison=false
  try{
   val data=m.api.call(path,fresh=true)
   tracks=data.tracks();comparison=data.optJSONObject("chart")?.optJSONObject("comparison")?.optBoolean("available")==true
  }catch(e:Exception){if(e is CancellationException)throw e;error=e.message?:"차트를 불러오지 못했어요."}
  finally{busy=false}
 }
 val state=rememberLazyListState()
 LaunchedEffect(path){state.scrollToItem(0)}
 Box(Modifier.fillMaxSize().testTag("chart-popular")){
 LazyColumn(Modifier.fillMaxSize().testTag("listen-scroll"),state=state,contentPadding=PaddingValues(18.dp,16.dp,18.dp,28.dp)){
  item{
   Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).musicSurface(feature=true).border(1.dp,Stroke,RoundedCornerShape(18.dp)).padding(20.dp)){
    Text("AIFECT 인기차트",fontSize=25.sp,fontWeight=FontWeight.Bold)
    Text("함께 듣고, 좋아하고, 응원한 음악의 순위.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=10.dp))
   }
   ChartTabs(categories,category,"chart-category"){key->if(key=="karaoke")m.openRanking("week",chart=true)else category=key}
   if(category=="top")ChartTabs(periods,period,"chart-period"){period=it}
   Text(if(category=="top")"${periods.first{it.first==period}.second} · 한국 시간 기준 · 어제 집계 대비" else categories.first{it.first==category}.second,fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=18.dp,bottom=8.dp))
   if(category=="top"&&!busy&&!comparison)Text("전날 순위 기록이 준비되면 변동을 표시해요.",fontSize=11.sp,color=Muted)
   Row(Modifier.fillMaxWidth().padding(top=12.dp,bottom=18.dp),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
    BrandButton(onClick={tracks.firstOrNull()?.let{m.play(it,tracks)}},enabled=tracks.isNotEmpty(),contentPadding=PaddingValues(horizontal=14.dp)){
     Icon(Icons.Rounded.PlayArrow,null,Modifier.size(18.dp));Text("전체 듣기",fontSize=13.sp)
    }
    OutlinedButton(onClick={val queue=tracks.shuffled();queue.firstOrNull()?.let{m.play(it,queue)}},enabled=tracks.isNotEmpty(),contentPadding=PaddingValues(horizontal=12.dp)){
     Icon(Icons.Rounded.Shuffle,null,Modifier.size(18.dp));Text("섞어 듣기",fontSize=13.sp)
    }
    Text("${tracks.size}곡",color=Muted,fontSize=12.sp)
   }
   if(busy)LinearProgressIndicator(Modifier.fillMaxWidth().testTag("chart-loading"),color=Aqua,trackColor=Stroke)
   error?.let{Text(it,color=Pink);TextButton(onClick={retry++}){Text("다시 시도")}}
  }
  itemsIndexed(tracks,key={_,s->s.id}){index,song->
   ChartSongRow(song,m,tracks,if(category=="top")song.raw.optInt("chart_rank",index+1)else null,category=="top",index==0,index==tracks.lastIndex)
  }
  if(!busy&&error==null&&tracks.isEmpty())item{Empty("아직 집계할 음악이 없어요","다른 기간의 차트도 둘러보세요.")}
 }
}
}

@Composable private fun ChartTabs(options:List<Pair<String,String>>,selected:String,tag:String,onSelect:(String)->Unit){
 Column{
  LazyRow(horizontalArrangement=Arrangement.spacedBy(22.dp)){
   items(options){(key,label)->Column(Modifier.testTag("$tag-$key").clickable{onSelect(key)}.padding(top=20.dp),horizontalAlignment=Alignment.CenterHorizontally){
    Text(label,fontSize=14.sp,fontWeight=FontWeight.SemiBold,color=if(key==selected)Pink else Muted,modifier=Modifier.padding(bottom=14.dp))
    Box(Modifier.width(30.dp).height(2.dp).background(if(key==selected)Pink else Color.Transparent))
   }}
  }
  HorizontalDivider(color=Stroke)
 }
}

@Composable private fun ChartSongRow(song:Song,m:MusicModel,queue:List<Song>,rank:Int?,movement:Boolean,first:Boolean,last:Boolean){
 val shape=RoundedCornerShape(topStart=if(first)12.dp else 0.dp,topEnd=if(first)12.dp else 0.dp,bottomStart=if(last)12.dp else 0.dp,bottomEnd=if(last)12.dp else 0.dp)
 val active=m.current?.id==song.id
 Column(Modifier.fillMaxWidth().clip(shape).background(if(active)Violet.copy(alpha=.14f)else Panel.copy(alpha=.55f))){
  Row(Modifier.fillMaxWidth().testTag("chart-song-${song.id}").clickable{m.openSong(song)}.padding(start=8.dp,end=2.dp,top=12.dp,bottom=12.dp),verticalAlignment=Alignment.CenterVertically){
   if(rank!=null)Column(Modifier.width(26.dp),horizontalAlignment=Alignment.CenterHorizontally){
    Text("$rank",fontWeight=FontWeight.Bold,fontSize=14.sp)
    if(movement){
     val direction=song.raw.optString("chart_movement")
     val delta=song.raw.optInt("rank_change")
     val label=when(direction){"up"->"▲$delta";"down"->"▼${-delta}";"new"->"NEW";else->"—"}
     Text(label,color=when(direction){"up","new"->Pink;"down"->Aqua;else->Muted},fontSize=10.sp,modifier=Modifier.testTag("chart-movement-${song.id}"))
    }
   }
   Artwork(song,Modifier.size(44.dp),corner=6.dp)
   Column(Modifier.weight(1f).padding(start=10.dp,end=4.dp)){
    Text(song.title,fontSize=14.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold,style=MaterialTheme.typography.bodyMedium.copy(lineBreak=LineBreak.Paragraph),modifier=Modifier.testTag("music-title-${song.id}"))
    Text(song.credit,fontSize=12.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.padding(top=4.dp))
   }
   IconButton(onClick={m.like(song)},modifier=Modifier.size(36.dp)){
    Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"${song.title} 좋아요",Modifier.size(19.dp),tint=if(m.likes.any{it.id==song.id})Pink else Muted)
   }
   IconButton(onClick={m.play(song,queue)},modifier=Modifier.size(40.dp)){
    Box(Modifier.size(30.dp).background(BrandGradient,CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",Modifier.size(20.dp),tint=Ink)}
   }
   TrackActionsMenu(song,m,Modifier.size(34.dp))
  }
  if(!last)HorizontalDivider(color=Stroke)
 }
}
