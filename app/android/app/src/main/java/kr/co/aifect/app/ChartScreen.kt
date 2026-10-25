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
import androidx.compose.ui.text.style.TextOverflow
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
 var previousPath by rememberSaveable{mutableStateOf(path)}
 LaunchedEffect(path){if(previousPath!=path){state.scrollToItem(0);previousPath=path}}
 Box(Modifier.fillMaxSize().testTag("chart-popular")){
 LazyColumn(Modifier.fillMaxSize().testTag("listen-scroll"),state=state,contentPadding=PaddingValues(14.dp,12.dp,14.dp,24.dp)){
  item{
   Text(categories.first{it.first==category}.second,fontSize=18.sp,fontWeight=FontWeight.Bold)
   ChartTabs(categories,category,"chart-category"){key->if(key=="karaoke")m.openRanking("week",chart=true)else category=key}
   if(category=="top")ChartTabs(periods,period,"chart-period"){period=it}
   Text(if(category=="top")"${periods.first{it.first==period}.second} · 한국 시간 기준 · 어제 집계 대비" else if(category=="rising")"최근 7일 청취자 수 기준" else if(category=="newcomers")"새로운 창작자의 음악을 만나보세요" else categories.first{it.first==category}.second,fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=18.dp,bottom=8.dp))
   if(category=="top"&&!busy&&!comparison)Text("전날 순위 기록이 준비되면 변동을 표시해요.",fontSize=11.sp,color=Muted)
   Row(Modifier.fillMaxWidth().padding(top=12.dp,bottom=18.dp),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
    BrandButton(onClick={m.playAll(tracks)},enabled=tracks.isNotEmpty(),contentPadding=PaddingValues(horizontal=14.dp)){
     Icon(Icons.Rounded.PlayArrow,null,Modifier.size(18.dp));Text("전체 듣기",fontSize=13.sp)
    }
    OutlinedButton(onClick={m.playAll(tracks,true)},enabled=tracks.isNotEmpty(),contentPadding=PaddingValues(horizontal=12.dp)){
     Icon(Icons.Rounded.Shuffle,null,Modifier.size(18.dp));Text("섞어 듣기",fontSize=13.sp)
    }
    Text("${tracks.size}곡",color=Muted,fontSize=12.sp)
   }
   if(busy)LinearProgressIndicator(Modifier.fillMaxWidth().testTag("chart-loading"),color=Aqua,trackColor=Stroke)
   error?.let{Text(it,color=Pink);TextButton(onClick={retry++}){Text("다시 시도")}}
  }
  if(category=="newcomers")items(tracks.chunked(2),key={"newcomer-"+it.first().id}){row->
   Row(Modifier.fillMaxWidth().padding(bottom=20.dp),horizontalArrangement=Arrangement.spacedBy(14.dp)){
    row.forEach{song->Box(Modifier.weight(1f)){NewcomerCard(song,m,tracks)}}
    if(row.size==1)Spacer(Modifier.weight(1f))
   }
  }else itemsIndexed(tracks,key={_,s->s.id}){index,song->
   val rank=when(category){"top"->song.raw.optInt("chart_rank",index+1);"rising"->index+1;else->null}
   ChartSongRow(song,m,tracks,rank,category=="top",index==0,index==tracks.lastIndex)
  }
  if(!busy&&error==null&&tracks.isEmpty())item{Empty("아직 집계할 음악이 없어요","다른 기간의 차트도 둘러보세요.")}
 }
}
}

@Composable private fun ChartTabs(options:List<Pair<String,String>>,selected:String,tag:String,onSelect:(String)->Unit){
 Column{
  LazyRow(horizontalArrangement=Arrangement.spacedBy(22.dp)){
   items(options){(key,label)->Column(Modifier.testTag("$tag-$key").clickable{onSelect(key)}.heightIn(min=48.dp).padding(top=12.dp),horizontalAlignment=Alignment.CenterHorizontally){
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
  Row(Modifier.fillMaxWidth().testTag("chart-song-${song.id}").clickable{m.openSong(song)}.padding(start=5.dp,end=0.dp,top=5.dp,bottom=5.dp),verticalAlignment=Alignment.CenterVertically){
   if(rank!=null)Column(Modifier.width(26.dp),horizontalAlignment=Alignment.CenterHorizontally){
    Text("$rank",fontWeight=FontWeight.Bold,fontSize=14.sp,modifier=Modifier.testTag("chart-rank-${song.id}"))
    if(movement){
     val direction=song.raw.optString("chart_movement")
     val delta=song.raw.optInt("rank_change")
     val label=when(direction){"up"->"▲$delta";"down"->"▼${-delta}";"new"->"NEW";else->"—"}
     Text(label,color=when(direction){"up","new"->Pink;"down"->Aqua;else->Muted},fontSize=10.sp,modifier=Modifier.testTag("chart-movement-${song.id}"))
    }
   }
   Box(Modifier.size(48.dp)){
    Artwork(song,Modifier.fillMaxSize(),corner=6.dp)
    IconButton(onClick={m.play(song,queue)},modifier=Modifier.fillMaxSize()){
     Box(Modifier.size(25.dp).background(Ink.copy(alpha=.82f),CircleShape).border(1.dp,Violet,CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",Modifier.size(17.dp),tint=Pink)}
    }
   }
   Column(Modifier.weight(1f).padding(start=10.dp,end=4.dp)){
    Text(song.title,fontSize=14.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("music-title-${song.id}"))
    Text(song.credit,fontSize=12.sp,lineHeight=16.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
   }
   IconButton(onClick={m.like(song)},modifier=Modifier.size(44.dp)){
    Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"${song.title} 좋아요",Modifier.size(19.dp),tint=if(m.likes.any{it.id==song.id})Pink else Muted)
   }
   TrackActionsMenu(song,m,Modifier.size(44.dp))
  }
  if(!last)HorizontalDivider(color=Stroke)
 }
}


@Composable private fun NewcomerCard(song:Song,m:MusicModel,queue:List<Song>){
 Box(Modifier.fillMaxWidth().testTag("newcomer-card-${song.id}")){
  CurrentSongCard(song,m,queue)
  IconButton(onClick={m.like(song)},enabled=!m.busy,modifier=Modifier.align(Alignment.TopEnd).padding(4.dp).size(44.dp).testTag("newcomer-like-${song.id}")){
   Box(Modifier.size(30.dp).background(Ink.copy(alpha=.82f),CircleShape),contentAlignment=Alignment.Center){
    Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"${song.title} 좋아요",Modifier.size(18.dp),tint=if(m.likes.any{it.id==song.id})Pink else SoftText)
   }
  }
 }
}
