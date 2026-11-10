@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
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
 Column(Modifier.padding(vertical=10.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
  LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){
   items(CoverPeriods.size){i->
    val period=CoverPeriods[i].first;val song=m.rankHighlights[period];val color=RankColors[i]
    Surface(onClick={m.openRanking(period)},modifier=Modifier.width(224.dp).testTag("rank-$period"),shape=RoundedCornerShape(16.dp),color=Panel,border=androidx.compose.foundation.BorderStroke(1.dp,Stroke)){
     Column(Modifier.background(Brush.linearGradient(listOf(color.copy(alpha=.11f),Color.Transparent))).padding(14.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
      Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
       Icon(if(i==3)Icons.Rounded.EmojiEvents else Icons.Rounded.GraphicEq,null,tint=color,modifier=Modifier.size(18.dp))
       Text(RankTitles[i],fontSize=14.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f).padding(horizontal=7.dp))
       Icon(Icons.Rounded.ChevronRight,null,tint=Muted,modifier=Modifier.size(16.dp))
      }
      Row(verticalAlignment=Alignment.CenterVertically){
       if(song!=null){Artwork(song,Modifier.size(40.dp));Column(Modifier.weight(1f).padding(start=10.dp)){Text(song.title,fontSize=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis);Text(song.credit,fontSize=11.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))}}
       else Text(if(m.highlightsBusy)"목소리를 찾고 있어요" else if(m.highlightsError!=null)"랭킹 열어보기" else "첫 좋아요를 기다려요",fontSize=12.sp,color=Muted,modifier=Modifier.heightIn(min=40.dp))
      }
     }
    }
   }
  }
  m.highlightsError?.let{Row(verticalAlignment=Alignment.CenterVertically){Text(it,color=Muted,fontSize=12.sp,modifier=Modifier.weight(1f));TextButton(onClick=m::loadRankHighlights){Text("재시도",fontSize=13.sp)}}}
 }
}

@Composable internal fun CoverRankingSheet(m:MusicModel){
 val selected=CoverPeriods.first{it.first==m.rankPeriod}.second
 val state=rememberLazyListState()
 LaunchedEffect(m.rankPeriod,m.rankKind,m.rankGenre,m.rankOriginal?.id){state.scrollToItem(0)}
 AppPage(title=if(m.karaokeChart)"노래방 차트" else "커버 랭킹",onDismissRequest=m::dismissRanking,containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth().imePadding().testTag("ranking-scroll"),state=state,contentPadding=PaddingValues(start=if(m.karaokeChart)14.dp else 22.dp,end=if(m.karaokeChart)14.dp else 22.dp,bottom=32.dp)){
   item{
    Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(if(m.karaokeChart)"노래방 차트" else if(m.rankOriginal==null)"커버 랭킹" else "이 곡의 커버 랭킹",fontSize=26.sp,fontWeight=FontWeight.Bold);m.rankOriginal?.let{Text(it.title,fontSize=14.sp,color=Aqua,modifier=Modifier.padding(top=7.dp))}};IconButton(onClick=m::dismissRanking){Icon(Icons.Rounded.Close,"랭킹 닫기")}}
    Spacer(Modifier.height(18.dp));Chips(CoverPeriods.map{it.second},selected){label->m.rankPeriod=CoverPeriods.first{it.second==label}.first;m.loadRankings()}
    Text(if(m.rankPeriod=="all")"공개 커버의 누적 좋아요 순" else "$selected 받은 좋아요 순 · 한국 시간 기준",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=8.dp,bottom=12.dp))
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
     FilterChip(m.rankKind=="tracks",{m.rankKind="tracks";m.loadRankings()},label={Text("커버곡")},leadingIcon={Icon(Icons.Rounded.MusicNote,null,Modifier.size(16.dp))})
     FilterChip(m.rankKind=="singers",{m.rankKind="singers";m.loadRankings()},label={Text("가수")},leadingIcon={Icon(Icons.Rounded.PersonOutline,null,Modifier.size(16.dp))})
    }
    if(m.rankOriginal==null)Chips(listOf("전체")+Genres,m.rankGenre){m.rankGenre=it;m.loadRankings()}
    OutlinedTextField(m.rankQuery,{m.rankQuery=it.take(100);m.loadRankings(true)},modifier=Modifier.fillMaxWidth().padding(top=10.dp).testTag("ranking-search"),singleLine=true,placeholder={Text("곡 또는 가수 찾기",fontSize=14.sp)},leadingIcon={Icon(Icons.Rounded.Search,null)},shape=RoundedCornerShape(14.dp))
    Text(if(m.karaokeChart)"공개된 커버곡만 표시해요. 가수는 커버곡의 좋아요 합계로 집계해요." else "좋아요가 없으면 순위에 포함되지 않아요. 가수는 커버곡의 좋아요 합계로 집계해요.",color=Muted,fontSize=12.sp,lineHeight=16.sp,modifier=Modifier.padding(vertical=12.dp))
    if(m.rankBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    m.rankError?.let{Text(it,fontSize=14.sp,color=Pink);TextButton(onClick={m.loadRankings()}){Text("다시 불러오기")}}
   }
   if(m.rankKind=="tracks")items(m.rankTracks,key={it.id}){song->
    if(m.karaokeChart)KaraokeChartRow(song,m,selected)
    else Column(Modifier.fillMaxWidth().padding(vertical=12.dp)){
     Row(verticalAlignment=Alignment.CenterVertically){
      Text("${song.raw.optInt("rank")}",fontSize=25.sp,color=if(song.raw.optInt("rank")<=3)Pink else Muted,fontWeight=FontWeight.Bold,modifier=Modifier.width(34.dp))
      Artwork(song,Modifier.size(56.dp).clickable{m.openSong(song)})
      Column(Modifier.weight(1f).padding(start=12.dp).clickable{m.openSong(song)}){Text(song.title,fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis);Text(song.credit,fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=5.dp));Text("$selected 좋아요 ${song.raw.optInt("rank_likes")}",fontSize=12.sp,color=Aqua,modifier=Modifier.padding(top=5.dp))}
      IconButton(onClick={m.play(song,m.rankTracks)}){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",tint=Pink)}
     }
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
      TextButton(onClick={m.openProfile(song.producerId,showCovers=true)}){Text("가수 보기",fontSize=12.sp)}
      TextButton(onClick={m.openSong(song)}){Icon(Icons.Rounded.ChatBubbleOutline,null,Modifier.size(14.dp));Text(" ${verifiedSongCommentCount(song,m)}",fontSize=12.sp)}
      TextButton(onClick={m.like(song)},enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"커버 좋아요",Modifier.size(15.dp));Text(" ${song.likes}",fontSize=12.sp)}
     }
     HorizontalDivider(color=Stroke.copy(alpha=.55f))
    }
   }else items(m.rankSingers,key={it.getString("id")}){p->
    Row(Modifier.fillMaxWidth().padding(vertical=16.dp),verticalAlignment=Alignment.CenterVertically){
     Text("${p.optInt("rank")}",fontSize=24.sp,color=Pink,fontWeight=FontWeight.Bold,modifier=Modifier.width(34.dp))
     Box(Modifier.clickable{m.openProfile(p.getString("id"),showCovers=true)}){Avatar(p.optString("name"),p,48)}
     Column(Modifier.weight(1f).padding(horizontal=12.dp).clickable{m.openProfile(p.getString("id"),showCovers=true)}){Text(p.optString("name"),fontWeight=FontWeight.SemiBold,fontSize=16.sp,maxLines=1,overflow=TextOverflow.Ellipsis);Text("좋아요 ${p.optInt("rank_likes")} · 커버 ${p.optInt("ranked_covers")}곡",fontSize=12.sp,color=Aqua,modifier=Modifier.padding(top=6.dp));Text("노래 들으러 가기 ›",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=5.dp))}
     OutlinedButton(onClick={m.followPerson(p.getString("id"))},enabled=!m.busy,contentPadding=PaddingValues(horizontal=10.dp)){Text(if(m.follows.any{it.optString("target_id")==p.optString("id")&&it.optString("kind")=="producer"})"팔로잉" else "팔로우",fontSize=12.sp)}
    }
   }
   if(!m.rankBusy&&m.rankError==null&&m.rankTracks.isEmpty()&&m.rankSingers.isEmpty())item{Empty(if(m.karaokeChart&&m.rankKind=="tracks"&&m.rankQuery.isBlank()&&m.rankGenre=="전체")"아직 등록된 커버곡이 없어요" else "아직 순위에 오른 목소리가 없어요","새로운 커버를 듣고, 마음에 드는 목소리에 좋아요를 남겨주세요.",Icons.Rounded.EmojiEvents)}
   item{TextButton(onClick={val original=m.rankOriginal;m.dismissRanking();if(original!=null)m.openCovers(original) else {m.community("커버곡");m.selectTab(3)}},modifier=Modifier.fillMaxWidth()){Text(if(m.rankOriginal!=null)"이 곡의 모든 커버 듣기" else "새로운 커버곡 둘러보기")}}
  }
 }
}


/** A ranked cover is three lines; profile and reactions stay inline. */
@Composable private fun KaraokeChartRow(song:Song,m:MusicModel,selected:String){
 val verifiedComments=verifiedSongCommentCount(song,m)
 val measure=rememberTextMeasurer()
 val titleHeight=measure.measure("가",style=LocalTextStyle.current.copy(fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold),maxLines=1).size.height
 val creditHeight=measure.measure("가",style=LocalTextStyle.current.copy(fontSize=13.sp,lineHeight=18.sp),maxLines=1).size.height
 val artSize=with(LocalDensity.current){titleHeight.toDp()+creditHeight.toDp()+32.dp}
 val rank=song.raw.optInt("rank")
 val period=when(m.rankPeriod){"today"->"오늘";"week"->"주간";"month"->"월간";else->"누적"}
 val periodLikes=song.raw.optInt("rank_likes")
 val liked=m.likes.any{it.id==song.id}
 Column(Modifier.fillMaxWidth().testTag("karaoke-row-${song.id}")){
  Row(Modifier.fillMaxWidth().padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
   Text(if(rank>0)rank.toString()else "—",fontSize=16.sp,fontWeight=FontWeight.Bold,color=if(rank in 1..3)Pink else Muted,modifier=Modifier.width(26.dp),maxLines=1)
   Box(Modifier.size(artSize).clip(RoundedCornerShape(10.dp)).clickable(role=Role.Button){m.play(song,m.rankTracks)}.semantics{contentDescription="${song.title} 재생"}.testTag("karaoke-play-${song.id}")){
    Artwork(song,Modifier.fillMaxSize(),corner=10.dp)
    Box(Modifier.align(Alignment.BottomEnd).padding(4.dp).size(26.dp).background(Ink.copy(alpha=.88f),CircleShape).border(1.dp,BrandGradient,CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Rounded.PlayArrow,null,tint=Pink,modifier=Modifier.size(18.dp))}
   }
   Column(Modifier.weight(1f).padding(start=12.dp).testTag("karaoke-copy-${song.id}"),verticalArrangement=Arrangement.spacedBy(4.dp)){
    Text(song.title,fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.fillMaxWidth().clickable{m.openSong(song)}.testTag("karaoke-title-${song.id}"))
    Row(Modifier.fillMaxWidth().clickable(role=Role.Button){m.openProfile(song.producerId,showCovers=true)}.semantics{contentDescription="${song.credit} 가수 보기"}.testTag("karaoke-artist-${song.id}"),verticalAlignment=Alignment.CenterVertically){
     Text(song.credit,fontSize=13.sp,lineHeight=18.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f,false))
     Icon(Icons.Rounded.ChevronRight,null,tint=Muted,modifier=Modifier.padding(start=2.dp).size(13.dp))
    }
    Row(Modifier.fillMaxWidth().testTag("karaoke-stats-${song.id}"),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)){
     Text("$period ${rankingCount(periodLikes)}",fontSize=11.sp,lineHeight=16.sp,color=SoftText,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f).semantics{contentDescription="$selected 좋아요 $periodLikes"})
     Box(Modifier.widthIn(min=44.dp).height(24.dp).clickable(enabled=!m.busy,role=Role.Button){m.like(song)}.semantics{contentDescription="${song.title} 전체 좋아요 ${song.likes}, ${if(liked)"좋아요 취소" else "좋아요"}"}.testTag("karaoke-like-${song.id}"),contentAlignment=Alignment.Center){
      Row(Modifier.padding(horizontal=3.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(3.dp)){
       Icon(if(liked)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,null,tint=if(liked)Pink else Muted,modifier=Modifier.size(13.dp));Text(rankingCount(song.likes),fontSize=11.sp,lineHeight=16.sp,color=Muted,maxLines=1)
      }
     }
     Box(Modifier.widthIn(min=44.dp).height(24.dp).clickable(role=Role.Button){m.openSong(song)}.semantics{contentDescription="${song.title} 댓글 ${verifiedComments}개 보기"}.testTag("karaoke-comments-${song.id}"),contentAlignment=Alignment.Center){
      Row(Modifier.padding(horizontal=3.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(3.dp)){
       Icon(Icons.Rounded.ChatBubbleOutline,null,tint=Muted,modifier=Modifier.size(13.dp));Text(rankingCount(verifiedComments),fontSize=11.sp,lineHeight=16.sp,color=Muted,maxLines=1)
      }
     }
    }
   }
  }
  HorizontalDivider(color=Stroke)
 }
}
private fun rankingCount(value:Int):String{
 val scale=when{value>=100000000->100000000 to "억";value>=10000->10000 to "만";value>=1000->1000 to "천";else->return value.toString()}
 return String.format(java.util.Locale.ROOT,"%.1f",value.toDouble()/scale.first).removeSuffix(".0")+scale.second
}
