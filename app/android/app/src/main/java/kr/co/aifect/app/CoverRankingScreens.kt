@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val CoverPeriods=listOf("today" to "오늘", "week" to "이번 주", "month" to "이달", "all" to "명예의 전당")
private val RankTitles=listOf("오늘의 인기 커버", "주간 인기 커버", "이달의 목소리", "명예의 전당")
private val RankCaptions=listOf("오늘 마음을 움직인", "이번 주 사랑받은", "한 달의 발견", "오래도록 빛나는")
private val RankColors=listOf(Pink,Aqua,Violet,Color(0xFFE8CFA0))

@Composable internal fun CoverRankShowcase(m:MusicModel){
 Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
  CoverPeriods.indices.chunked(2).forEach{pair->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
   pair.forEach{i->val period=CoverPeriods[i].first;val song=m.rankHighlights[period];val color=RankColors[i]
    Surface(onClick={m.openRanking(period)},modifier=Modifier.weight(1f).testTag("rank-$period"),shape=RoundedCornerShape(20.dp),color=Panel){
     Column(Modifier.heightIn(min=184.dp).background(Brush.linearGradient(listOf(color.copy(alpha=.16f),Color.Transparent))).padding(16.dp)){
      Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
       Icon(if(i==3)Icons.Rounded.EmojiEvents else Icons.Rounded.GraphicEq,null,tint=color,modifier=Modifier.size(25.dp))
       Spacer(Modifier.weight(1f));Icon(Icons.Rounded.ArrowOutward,null,tint=color,modifier=Modifier.size(17.dp))
      }
      Text(RankCaptions[i],fontSize=10.sp,color=Muted,modifier=Modifier.padding(top=18.dp))
      Text(RankTitles[i],fontSize=17.sp,lineHeight=23.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=5.dp))
      Row(Modifier.padding(top=16.dp),verticalAlignment=Alignment.CenterVertically){
       if(song!=null){Artwork(song,Modifier.size(32.dp));Column(Modifier.weight(1f).padding(start=7.dp)){Text(song.title,fontSize=11.sp,maxLines=1,overflow=TextOverflow.Ellipsis);Text(song.credit,fontSize=10.sp,color=color,maxLines=1,overflow=TextOverflow.Ellipsis)}}
       else Text(if(m.highlightsBusy)"목소리를 찾고 있어요" else if(m.highlightsError!=null)"랭킹 열어보기" else "첫 좋아요를 기다려요",fontSize=10.sp,color=color)
      }
     }
    }
   }
  }}
  m.highlightsError?.let{Row(verticalAlignment=Alignment.CenterVertically){Text(it,color=Muted,fontSize=11.sp,modifier=Modifier.weight(1f));TextButton(onClick=m::loadRankHighlights){Text("재시도",fontSize=12.sp)}}}
 }
}

@Composable internal fun CoverRankingSheet(m:MusicModel){
 val selected=CoverPeriods.first{it.first==m.rankPeriod}.second
 val state=rememberLazyListState()
 LaunchedEffect(m.rankPeriod,m.rankKind,m.rankGenre,m.rankOriginal?.id){state.scrollToItem(0)}
 ModalBottomSheet(onDismissRequest=m::dismissRanking,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth().imePadding().testTag("ranking-scroll"),state=state,contentPadding=PaddingValues(22.dp,0.dp,22.dp,32.dp)){
   item{
    Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(if(m.rankOriginal==null)"커버 랭킹" else "이 곡의 커버 랭킹",fontSize=25.sp,fontWeight=FontWeight.Bold);m.rankOriginal?.let{Text(it.title,fontSize=13.sp,color=Aqua,modifier=Modifier.padding(top=7.dp))}};IconButton(onClick=m::dismissRanking){Icon(Icons.Rounded.Close,"랭킹 닫기")}}
    Spacer(Modifier.height(18.dp));Chips(CoverPeriods.map{it.second},selected){label->m.rankPeriod=CoverPeriods.first{it.second==label}.first;m.loadRankings()}
    Text(if(m.rankPeriod=="all")"공개 커버의 누적 좋아요 순" else "$selected 받은 좋아요 순 · 한국 시간 기준",color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=8.dp,bottom=12.dp))
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
     FilterChip(m.rankKind=="tracks",{m.rankKind="tracks";m.loadRankings()},label={Text("커버곡")},leadingIcon={Icon(Icons.Rounded.MusicNote,null,Modifier.size(16.dp))})
     FilterChip(m.rankKind=="singers",{m.rankKind="singers";m.loadRankings()},label={Text("가수")},leadingIcon={Icon(Icons.Rounded.PersonOutline,null,Modifier.size(16.dp))})
    }
    if(m.rankOriginal==null)Chips(listOf("전체")+Genres,m.rankGenre){m.rankGenre=it;m.loadRankings()}
    OutlinedTextField(m.rankQuery,{m.rankQuery=it.take(100);m.loadRankings(true)},modifier=Modifier.fillMaxWidth().padding(top=10.dp).testTag("ranking-search"),singleLine=true,placeholder={Text("곡 또는 가수 찾기",fontSize=13.sp)},leadingIcon={Icon(Icons.Rounded.Search,null)},shape=RoundedCornerShape(14.dp))
    Text("좋아요가 없으면 순위에 포함되지 않아요. 가수는 커버곡의 좋아요 합계로 집계해요.",color=Muted,fontSize=10.sp,lineHeight=16.sp,modifier=Modifier.padding(vertical=12.dp))
    if(m.rankBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    m.rankError?.let{Text(it,fontSize=13.sp,color=Pink);TextButton(onClick={m.loadRankings()}){Text("다시 불러오기")}}
   }
   if(m.rankKind=="tracks")items(m.rankTracks,key={it.id}){song->
    Column(Modifier.fillMaxWidth().padding(vertical=12.dp)){
     Row(verticalAlignment=Alignment.CenterVertically){
      Text("${song.raw.optInt("rank")}",fontSize=24.sp,color=if(song.raw.optInt("rank")<=3)Pink else Muted,fontWeight=FontWeight.Bold,modifier=Modifier.width(34.dp))
      Artwork(song,Modifier.size(56.dp).clickable{m.openSong(song)})
      Column(Modifier.weight(1f).padding(start=12.dp).clickable{m.openSong(song)}){Text(song.title,fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis);Text(song.credit,fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=5.dp));Text("$selected 좋아요 ${song.raw.optInt("rank_likes")}",fontSize=10.sp,color=Aqua,modifier=Modifier.padding(top=5.dp))}
      IconButton(onClick={m.play(song,m.rankTracks)}){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",tint=Pink)}
     }
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
      TextButton(onClick={m.openProfile(song.producerId,showCovers=true)}){Text("가수 보기",fontSize=11.sp)}
      TextButton(onClick={m.openSong(song)}){Icon(Icons.Rounded.ChatBubbleOutline,null,Modifier.size(14.dp));Text(" ${song.comments}",fontSize=11.sp)}
      TextButton(onClick={m.like(song)},enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"커버 좋아요",Modifier.size(15.dp));Text(" ${song.likes}",fontSize=11.sp)}
     }
     HorizontalDivider(color=Stroke.copy(alpha=.55f))
    }
   }else items(m.rankSingers,key={it.getString("id")}){p->
    Row(Modifier.fillMaxWidth().padding(vertical=16.dp),verticalAlignment=Alignment.CenterVertically){
     Text("${p.optInt("rank")}",fontSize=23.sp,color=Pink,fontWeight=FontWeight.Bold,modifier=Modifier.width(34.dp))
     Box(Modifier.clickable{m.openProfile(p.getString("id"),showCovers=true)}){Avatar(p.optString("name"),p,48)}
     Column(Modifier.weight(1f).padding(horizontal=12.dp).clickable{m.openProfile(p.getString("id"),showCovers=true)}){Text(p.optString("name"),fontWeight=FontWeight.SemiBold,fontSize=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis);Text("좋아요 ${p.optInt("rank_likes")} · 커버 ${p.optInt("ranked_covers")}곡",fontSize=10.sp,color=Aqua,modifier=Modifier.padding(top=6.dp));Text("노래 들으러 가기 ›",fontSize=10.sp,color=Muted,modifier=Modifier.padding(top=5.dp))}
     OutlinedButton(onClick={m.followPerson(p.getString("id"))},enabled=!m.busy,contentPadding=PaddingValues(horizontal=10.dp)){Text(if(m.follows.any{it.optString("target_id")==p.optString("id")&&it.optString("kind")=="producer"})"팔로잉" else "팔로우",fontSize=11.sp)}
    }
   }
   if(!m.rankBusy&&m.rankError==null&&m.rankTracks.isEmpty()&&m.rankSingers.isEmpty())item{Empty("아직 순위에 오른 목소리가 없어요","새로운 커버를 듣고, 마음에 드는 목소리에 좋아요를 남겨주세요.",Icons.Rounded.EmojiEvents)}
   item{TextButton(onClick={val original=m.rankOriginal;m.dismissRanking();if(original!=null)m.openCovers(original) else {m.community("커버곡");m.selectTab(3)}},modifier=Modifier.fillMaxWidth()){Text(if(m.rankOriginal!=null)"이 곡의 모든 커버 듣기" else "새로운 커버곡 둘러보기")}}
  }
 }
}
