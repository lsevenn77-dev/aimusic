@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import java.net.URLEncoder

private val Coral=Color(0xFFFFB29C)
private data class Mood(val id:String,val name:String,val caption:String,val color:Color,val icon:ImageVector)
private val MoodTiles=listOf(
 Mood("comfort","위로가 필요할 때","마음을 다독이는 음악",Color(0xFF7165AD),Icons.Rounded.FavoriteBorder),
 Mood("energy","기분을 올려줘","리듬에 몸을 맡겨요",Color(0xFF86536C),Icons.Rounded.Bolt),
 Mood("focus","나만의 몰입","집중이 필요한 순간",Color(0xFF427E78),Icons.Rounded.Adjust),
 Mood("drive","어디든 떠나자","길 위의 사운드트랙",Color(0xFF496F9A),Icons.Rounded.DirectionsCar),
 Mood("sleep","잠들기 전","천천히 마무리하는 하루",Color(0xFF5B5985),Icons.Rounded.NightsStay),
 Mood("workout","한 걸음 더","가볍게, 더 힘차게",Color(0xFF53687C),Icons.Rounded.FitnessCenter)
)
internal val Genres=listOf("K-POP","Ballad","R&B","Hip-Hop","Rock","EDM","City Pop","OST","Instrumental")
private val PagePadding=PaddingValues(start=22.dp,end=22.dp,bottom=32.dp)

@Composable internal fun ListenScreen(m:MusicModel,sing:(Song)->Unit){
 val state=rememberLazyListState()
 var previous by rememberSaveable{mutableStateOf(m.listenPage)}
 LaunchedEffect(m.listenPage){if(previous!=m.listenPage){state.scrollToItem(0);previous=m.listenPage}}
 LazyColumn(Modifier.fillMaxSize().testTag("listen-scroll"),state=state,contentPadding=PagePadding){
  item{
   Row(Modifier.padding(top=8.dp,bottom=10.dp),horizontalArrangement=Arrangement.spacedBy(24.dp)){
    listOf("추천","차트","최신곡").forEach{page->Column(Modifier.clickable{m.listenPage=page}.padding(vertical=6.dp)){
     Text(page,fontSize=23.sp,fontWeight=FontWeight.Bold,color=if(m.listenPage==page)Color.White else Muted)
     Box(Modifier.padding(top=10.dp).width(24.dp).height(3.dp).clip(CircleShape).background(if(m.listenPage==page)Pink else Color.Transparent))
    }}
   }
  }
  when(m.listenPage){
   "추천"->{
    val releases=m.latest.ifEmpty{m.home}
    val featured=releases.firstOrNull()
    item{
     Section("오늘의 새로운 발견",action="최신곡",onAction={m.listenPage="최신곡"})
     if(featured!=null)FeaturedRelease(featured,releases,m) else WelcomeMusic(m)
     ListeningShortcuts(m)
    }
    if(m.history.isNotEmpty())item{
     Section("다시 듣고 싶은 순간",action="더보기",onAction={m.showCollection("최근 들은 음악",m.history)})
     CompactShelf(m.history.take(12),m)
    }
    if(releases.size>1)item{
     Section("한 곡 더 발견하기",action="더보기",onAction={m.listenPage="최신곡"})
     SongShelf(releases.drop(1).take(10),m)
    }
    m.singable.firstOrNull()?.let{song->item{
     Section("이번엔 내 목소리로","듣던 노래, 직접 불러볼까요?","모든 곡"){m.selectTab(2)}
     SingInvitation(song,m,sing)
    }}
    if(m.recentCovers.isNotEmpty())item{
     Section("같은 노래, 다른 목소리","커버를 듣고, 마음에 드는 목소리에 반응해요","더보기"){m.community("커버곡");m.selectTab(3)}
     CommunityCard(m.recentCovers.first(),m,m.recentCovers,sing)
     if(m.recentCovers.size>1){Spacer(Modifier.height(16.dp));SongShelf(m.recentCovers.drop(1).take(8),m)}
    }
    if(m.publicLists.any{it.optInt("tracks")>0})item{
     Section("취향을 나누는 플레이리스트","다른 사람이 고른 음악 속으로")
     PlaylistShelf(m.publicLists.filter{it.optInt("tracks")>0}.take(10),m)
    }
    item{Section("지금, 이런 기분");MoodShelf(m)}
    if(m.people.isNotEmpty())item{
     Section("음악 뒤의 사람들","마음에 드는 음악가를 팔로우해보세요")
     LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){
      items(m.people.take(12),key={it.getString("id")}){p->PersonCard(p,m)}
     }
    }
    item{
     Spacer(Modifier.height(28.dp))
     Surface(onClick={m.selectTab(3)},color=Panel,shape=RoundedCornerShape(20.dp)){
      Row(Modifier.fillMaxWidth().padding(20.dp),verticalAlignment=Alignment.CenterVertically){
       Icon(Icons.Rounded.Headphones,null,tint=Violet,modifier=Modifier.size(28.dp))
       Column(Modifier.weight(1f).padding(horizontal=14.dp)){Text("음악을 듣고, 이야기를 만나요",fontSize=15.sp,fontWeight=FontWeight.Bold);Text("커버곡 · 제작곡 · 사람들의 감상",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=6.dp))}
       Icon(Icons.Rounded.ChevronRight,null,tint=Muted)
      }
     }
    }
   }
   "차트"->{
    item{
     Section("AIFECT 인기곡","재생 · 좋아요 · 댓글을 반영한 제작곡 순위","더보기"){m.showCollection("AIFECT 인기곡",m.home,"재생·좋아요·댓글 기준")}
     ChartPreview(m.home.take(5),m)
     if(m.home.isEmpty())Empty("아직 집계할 음악이 없어요","공개된 음악의 반응이 쌓이면 차트에 보여요.")
    }
    if(m.singable.isNotEmpty())item{
     Section("노래방에서 만나는 인기곡","부를 수 있는 곡의 재생 · 좋아요 기준","더보기"){m.showCollection("노래방 인기곡",m.singable,"마음에 드는 노래를 직접 불러보세요")}
     ChartPreview(m.singable.take(5),m)
    }
    if(m.recentCovers.isNotEmpty())item{
     Section("새로운 커버곡","각자의 목소리로 다시 태어난 음악","더보기"){m.community("커버곡");m.selectTab(3)}
     SongShelf(m.recentCovers.take(10),m)
    }
    item{Section("장르별로 골라 듣기");GenreGrid(m)}
   }
   else->{
    item{Section("새롭게 도착한 음악","가장 최근에 공개된 제작곡부터 만나보세요");PlayButtons(m.latest,m)}
    items(m.latest,key={it.id}){SongRow(it,m,m.latest)}
    if(m.latest.isEmpty())item{Empty(if(m.loading)"음악을 불러오고 있어요" else "새로운 음악을 기다려요","등록된 곡이 여기에 차례로 보여요.")}
   }
  }
 }
}

@Composable private fun WelcomeMusic(m:MusicModel){
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(Color(0xFF302737),Color(0xFF1C2A30)))).padding(24.dp)){
  Text("AI + EFFECT",color=Pink,fontSize=11.sp,letterSpacing=2.sp)
  Text("오늘의 음악이\n내일의 취향이 돼요",fontSize=27.sp,lineHeight=36.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(vertical=20.dp))
  if(m.loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink,trackColor=Stroke)
  else TextButton(onClick={m.selectTab(1)}){Text("새로운 음악 찾아보기");Icon(Icons.AutoMirrored.Rounded.ArrowForward,null)}
 }
}
@Composable private fun FeaturedRelease(song:Song,queue:List<Song>,m:MusicModel){
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(Color(0xFF302531),Color(0xFF1C292F)))).padding(18.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(122.dp).clickable{m.openSong(song)})
   Column(Modifier.weight(1f).padding(start=18.dp)){
    Text("NEW RELEASE",color=Pink,fontSize=10.sp,letterSpacing=1.5.sp,fontWeight=FontWeight.SemiBold)
    Text(song.title,fontSize=21.sp,lineHeight=28.sp,fontWeight=FontWeight.Bold,maxLines=3,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=10.dp).clickable{m.openSong(song)})
    Text(song.credit,fontSize=13.sp,color=Color(0xFFCECBD4),maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=7.dp))
    Text(listOf(song.genre,timeLabel((song.duration*1000).toLong())).filter{it.isNotBlank()}.joinToString(" · "),fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=7.dp))
   }
  }
  Row(Modifier.fillMaxWidth().padding(top=16.dp),verticalAlignment=Alignment.CenterVertically){
   Text("재생 ${song.plays} · 좋아요 ${song.likes}",fontSize=11.sp,color=Muted,modifier=Modifier.weight(1f))
   Button(onClick={m.play(song,queue)},contentPadding=PaddingValues(horizontal=16.dp,vertical=8.dp)){
    Icon(Icons.Rounded.PlayArrow,null,Modifier.size(20.dp));Text("바로 듣기",fontSize=13.sp,modifier=Modifier.padding(start=4.dp))
   }
  }
 }
}
@Composable private fun ListeningShortcuts(m:MusicModel){
 Row(Modifier.fillMaxWidth().padding(top=14.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
  listOf(Triple("좋아요","좋아요",Icons.Rounded.FavoriteBorder),Triple("최근 감상","최근 감상",Icons.Rounded.History),Triple("내 플레이리스트","플레이리스트",Icons.AutoMirrored.Rounded.QueueMusic)).forEach{(label,page,icon)->
   Surface(onClick={m.library(page)},modifier=Modifier.weight(1f),color=Panel,shape=RoundedCornerShape(12.dp)){
    Column(Modifier.padding(vertical=14.dp,horizontal=4.dp),horizontalAlignment=Alignment.CenterHorizontally){
     Icon(icon,null,tint=Pink,modifier=Modifier.size(20.dp));Text(label,fontSize=11.sp,maxLines=1,modifier=Modifier.padding(top=8.dp))
    }
   }
  }
 }
}
@Composable private fun SingInvitation(song:Song,m:MusicModel,sing:(Song)->Unit){
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B292E)).padding(18.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(64.dp).clickable{m.openSong(song)})
   Column(Modifier.weight(1f).padding(start=14.dp)){
    Text("MR 준비 완료",fontSize=10.sp,color=Aqua,fontWeight=FontWeight.SemiBold)
    Text(song.title,fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=6.dp))
    Text(song.credit,color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=4.dp))
   }
  }
  Row(Modifier.fillMaxWidth().padding(top=14.dp),verticalAlignment=Alignment.CenterVertically){
   Text("에코 · 룸 · 내 목소리 듣기",color=Muted,fontSize=11.sp,modifier=Modifier.weight(1f))
   FilledTonalButton(onClick={sing(song)},colors=ButtonDefaults.filledTonalButtonColors(containerColor=Aqua,contentColor=Ink),contentPadding=PaddingValues(horizontal=12.dp,vertical=8.dp)){
    Icon(Icons.Rounded.Mic,null,Modifier.size(17.dp));Text("이 곡 부르기",fontSize=12.sp,modifier=Modifier.padding(start=4.dp))
   }
  }
 }
}
@Composable private fun MoodShelf(m:MusicModel){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){
  items(MoodTiles,key={it.id}){mood->MoodTile(mood,m)}
 }
}
@Composable private fun MoodTile(mood:Mood,m:MusicModel){
 Surface(onClick={m.browseCollection(mood.name,"/api/discovery?mood=${mood.id}",mood.caption)},shape=RoundedCornerShape(18.dp),color=mood.color){
  Box(Modifier.width(168.dp).height(120.dp).background(Brush.verticalGradient(listOf(Color.Transparent,Color.Black.copy(alpha=.25f))))){
   Icon(mood.icon,null,tint=Color.White.copy(alpha=.16f),modifier=Modifier.align(Alignment.CenterEnd).size(62.dp).rotate(-14f))
   Column(Modifier.fillMaxSize().padding(16.dp)){
    Icon(mood.icon,null,Modifier.size(20.dp),tint=Color.White.copy(alpha=.8f))
    Spacer(Modifier.weight(1f));Text(mood.name,fontSize=17.sp,fontWeight=FontWeight.Bold,color=Color.White)
    Text(mood.caption,fontSize=11.sp,color=Color.White.copy(alpha=.8f),modifier=Modifier.padding(top=5.dp))
   }
  }
 }
}
@Composable internal fun SongShelf(tracks:List<Song>,m:MusicModel){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(14.dp)){
  items(tracks,key={it.id}){s->Column(Modifier.width(148.dp)){
   Box(Modifier.size(148.dp).clickable{m.openSong(s)}){
    Artwork(s,Modifier.fillMaxSize())
    FilledIconButton(onClick={m.play(s,tracks)},modifier=Modifier.align(Alignment.BottomEnd).padding(6.dp).size(34.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=Pink,contentColor=Ink)){Icon(Icons.Rounded.PlayArrow,"${s.title} 재생",Modifier.size(21.dp))}
   }
   Text(s.title,fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=10.dp).clickable{m.openSong(s)})
   Text(s.credit,fontSize=11.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
  }}
 }
}
@Composable private fun CompactShelf(tracks:List<Song>,m:MusicModel){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(20.dp)){
  items(tracks.chunked(3)){chunk->Column(Modifier.width(305.dp)){chunk.forEach{SongRow(it,m,tracks)}}}
 }
}
@Composable private fun ChartPreview(tracks:List<Song>,m:MusicModel,showStats:Boolean=true){
 Column{tracks.forEachIndexed{i,s->Row(verticalAlignment=Alignment.CenterVertically){
  Text("${i+1}",fontSize=18.sp,fontWeight=FontWeight.Bold,color=if(i<3)Pink else Muted,modifier=Modifier.width(27.dp))
  Box(Modifier.weight(1f)){SongRow(s,m,tracks){
   if(showStats)Column(horizontalAlignment=Alignment.End){Text("${s.plays}회",color=Muted,fontSize=10.sp);IconButton(onClick={m.play(s,tracks)}){Icon(Icons.Rounded.PlayArrow,"${s.title} 재생",tint=Pink)}}
   else IconButton(onClick={m.play(s,tracks)}){Icon(Icons.Rounded.PlayArrow,"${s.title} 재생",tint=Pink)}
  }}
 }}}
}
@Composable internal fun PersonCard(p:JSONObject,m:MusicModel){
 Surface(onClick={m.openProfile(p.getString("id"))},shape=RoundedCornerShape(20.dp),color=Panel){
  Column(Modifier.width(168.dp).padding(18.dp)){
   Avatar(p.optString("name"),p,66)
   Text(p.optString("name"),fontWeight=FontWeight.Bold,fontSize=16.sp,maxLines=1,modifier=Modifier.padding(top=15.dp))
   if(p.optString("bio").isNotBlank())Text(p.optString("bio"),color=Muted,fontSize=12.sp,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=7.dp))
   Text("프로필 보기  ›",color=Pink,fontSize=11.sp,modifier=Modifier.padding(top=14.dp))
  }
 }
}
@Composable private fun PlaylistArt(p:JSONObject,modifier:Modifier=Modifier){
 val covers=p.optJSONArray("covers").objects().take(4)
 Box(modifier.clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(Color(0xFF403449),Color(0xFF20363A))))){
  if(covers.isEmpty())Icon(Icons.AutoMirrored.Rounded.QueueMusic,null,tint=Pink.copy(alpha=.7f),modifier=Modifier.align(Alignment.Center).fillMaxSize(.45f))
  else if(covers.size<4)Artwork(Song(covers.first()),Modifier.fillMaxSize())
  else Column{covers.chunked(2).forEach{row->Row(Modifier.weight(1f)){row.forEach{Artwork(Song(it),Modifier.weight(1f).fillMaxHeight())}}}}
 }
}
@Composable internal fun PlaylistShelf(lists:List<JSONObject>,m:MusicModel){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(14.dp)){
  items(lists,key={it.getString("id")}){p->Column(Modifier.width(160.dp).clickable{m.openList(p.getString("id"))}){
   PlaylistArt(p,Modifier.size(160.dp));Text(p.optString("name"),fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=10.dp))
   Text("${p.optInt("tracks")}곡 · ${p.optString("owner_name")}",fontSize=11.sp,color=Muted,maxLines=1,modifier=Modifier.padding(top=6.dp))
  }}
 }
}
@Composable private fun PlaylistRow(p:JSONObject,m:MusicModel){
 Row(Modifier.fillMaxWidth().clickable{m.openList(p.getString("id"))}.padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
  PlaylistArt(p,Modifier.size(60.dp));Column(Modifier.weight(1f).padding(horizontal=14.dp)){
   Text(p.optString("name"),fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis)
   Text("${p.optInt("tracks")}곡 · ${if(p.optString("user_id")==m.user?.optString("id"))"내 플레이리스트" else p.optString("owner_name")}",fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=5.dp))
  };Icon(Icons.Rounded.ChevronRight,null,tint=Muted)
 }
}
@Composable private fun GenreGrid(m:MusicModel){
 val colors=listOf(Color(0xFF68509D),Color(0xFF347D74),Color(0xFFAA5F38),Color(0xFF4F739E))
 Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
  Genres.chunked(2).forEachIndexed{row,items->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
   items.forEachIndexed{index,genre->Surface(onClick={m.browseCollection(genre,"/api/catalog?section=tracks&genre="+URLEncoder.encode(genre,"UTF-8"),"장르별 음악 탐색")},modifier=Modifier.weight(1f),shape=RoundedCornerShape(16.dp),color=colors[(row*2+index)%colors.size]){
    Box(Modifier.height(96.dp).padding(16.dp)){
     Icon(Icons.Rounded.Album,null,tint=Color.White.copy(alpha=.13f),modifier=Modifier.align(Alignment.BottomEnd).size(64.dp).rotate(20f))
     Text(genre,fontSize=17.sp,fontWeight=FontWeight.Bold,color=Color.White)
    }
   }}
   if(items.size==1)Spacer(Modifier.weight(1f))
  }}
 }
}

@Composable internal fun SearchScreen(m:MusicModel){
 var category by rememberSaveable{mutableStateOf("전체")}
 LazyColumn(Modifier.fillMaxSize().testTag("search-scroll"),contentPadding=PagePadding){
  item{
   Heading("발견하는 즐거움","어떤 음악을 찾고 있나요?")
   OutlinedTextField(m.search,m::searchFor,modifier=Modifier.fillMaxWidth().testTag("global-search"),placeholder={Text("곡 · 아티스트 · 제작자 · 플레이리스트",fontSize=12.sp)},leadingIcon={Icon(Icons.Rounded.Search,null)},trailingIcon={if(m.search.isNotEmpty())IconButton(onClick={m.searchFor("")}){Icon(Icons.Rounded.Close,"검색 지우기")}},singleLine=true,shape=RoundedCornerShape(16.dp))
  }
  if(m.search.isNotBlank()){
   item{Spacer(Modifier.height(16.dp));Chips(listOf("전체","곡","사람","플레이리스트"),category){category=it};if(m.searching)LinearProgressIndicator(Modifier.fillMaxWidth().padding(top=12.dp))}
   if(category in listOf("전체","곡")&&m.searchResults.isNotEmpty()){
    item{Section("곡 · ${m.searchResults.size}")};items(m.searchResults,key={"song-"+it.id}){SongRow(it,m,m.searchResults)}
   }
   if(category in listOf("전체","사람")&&m.searchPeople.isNotEmpty()){
    item{Section("음악을 만드는 사람들")}
    items(m.searchPeople,key={"person-"+it.optString("profile_kind")+it.optString("id")}){p->Row(Modifier.fillMaxWidth().clickable{m.openProfile(p.getString("id"),p.optString("profile_kind"))}.padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),p,48);Text(p.optString("name"),modifier=Modifier.weight(1f).padding(start=14.dp));Icon(Icons.Rounded.ChevronRight,null,tint=Muted)}}
   }
   if(category in listOf("전체","플레이리스트")&&m.searchLists.isNotEmpty()){
    item{Section("플레이리스트")};items(m.searchLists,key={"list-"+it.getString("id")}){PlaylistRow(it,m)}
   }
   val count=when(category){"곡"->m.searchResults.size;"사람"->m.searchPeople.size;"플레이리스트"->m.searchLists.size;else->m.searchResults.size+m.searchPeople.size+m.searchLists.size}
   if(m.searched&&count==0)item{Empty("검색 결과가 없어요","다른 제목이나 이름으로 찾아보세요.",Icons.Rounded.Search)}
  }else{
   item{
    Section("바로 발견하기")
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
     FilterChip(false,{m.listenPage="차트";m.selectTab(0)},label={Text("인기 차트")},leadingIcon={Icon(Icons.AutoMirrored.Rounded.TrendingUp,null,Modifier.size(17.dp))})
     FilterChip(false,{m.selectTab(2)},label={Text("노래방")},leadingIcon={Icon(Icons.Rounded.Mic,null,Modifier.size(17.dp))})
     FilterChip(false,{m.community("커버곡");m.selectTab(3)},label={Text("커버곡")},leadingIcon={Icon(Icons.Rounded.PeopleOutline,null,Modifier.size(17.dp))})
    }
    Section("기분과 순간");MoodShelf(m)
    Section("장르별로 둘러보기");GenreGrid(m)
   }
   if(m.publicLists.isNotEmpty())item{Section("함께 듣는 플레이리스트");PlaylistShelf(m.publicLists,m)}
  }
 }
}

@Composable internal fun SingScreen(m:MusicModel,sing:(Song)->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 var genre by rememberSaveable{mutableStateOf("전체")}
 val tracks=m.singable.filter{(genre=="전체"||it.genre==genre)&&(query.isBlank()||it.title.contains(query,true)||it.credit.contains(query,true))}
 LaunchedEffect(Unit){m.loadRankHighlights()}
 LazyColumn(Modifier.fillMaxSize().testTag("sing-scroll"),contentPadding=PagePadding){
  item{
   Heading("목소리를 발견하는 곳","듣다 보면, 나도 부르고 싶어지는 순간")
   CoverRankShowcase(m)
   Section("나의 다음 무대","장르를 고르고, 다른 목소리도 먼저 들어봐요")
   OutlinedTextField(query,{query=it},modifier=Modifier.fillMaxWidth(),singleLine=true,placeholder={Text("부르고 싶은 노래 찾기",fontSize=14.sp)},leadingIcon={Icon(Icons.Rounded.Search,null)},shape=RoundedCornerShape(16.dp))
   Spacer(Modifier.height(10.dp));Chips(listOf("전체")+Genres,genre){genre=it}
   Text("에코 · 룸 · 내 목소리 듣기",color=Aqua,fontSize=11.sp,modifier=Modifier.padding(top=12.dp))
   Text("유선·USB 이어폰으로 들으며 불러보세요.",color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=5.dp,bottom=16.dp))
  }
  items(tracks,key={it.id}){song->
   Surface(color=Panel,shape=RoundedCornerShape(18.dp),modifier=Modifier.padding(bottom=12.dp)){
    Column(Modifier.padding(14.dp)){
     Row(verticalAlignment=Alignment.CenterVertically){Artwork(song,Modifier.size(60.dp).clickable{m.openSong(song)});Column(Modifier.weight(1f).padding(start=14.dp)){Text(song.title,fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis);Text("${song.credit} · ${song.genre}",fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=5.dp))}}
     Row(Modifier.fillMaxWidth().padding(top=10.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
      OutlinedButton(onClick={m.openRanking("all",song)},modifier=Modifier.weight(1f),contentPadding=PaddingValues(horizontal=8.dp)){Icon(Icons.Rounded.EmojiEvents,null,Modifier.size(17.dp));Text("커버 랭킹 · ${song.raw.optInt("covers")}",fontSize=11.sp,modifier=Modifier.padding(start=5.dp))}
      Button(onClick={sing(song)},modifier=Modifier.weight(1f),contentPadding=PaddingValues(horizontal=8.dp)){Icon(Icons.Rounded.Mic,null,Modifier.size(17.dp));Text("이 곡 부르기",fontSize=12.sp,modifier=Modifier.padding(start=5.dp))}
     }
    }
   }
  }
  if(tracks.isEmpty())item{Empty(if(m.loading)"곡을 불러오고 있어요" else "조건에 맞는 곡이 없어요","다른 장르나 제목으로 찾아보세요.",Icons.Rounded.MicNone)}
  if(m.recentCovers.isNotEmpty())item{Section("새로 올라온 목소리","좋아요로 다음 주인공을 발견해요","더보기"){m.community("커버곡");m.selectTab(3)};SongShelf(m.recentCovers.take(10),m)}
  item{TextButton(onClick={m.library("내 커버곡")},modifier=Modifier.fillMaxWidth()){Icon(Icons.Rounded.LibraryMusic,null);Text("내가 공개한 커버곡",modifier=Modifier.padding(start=8.dp))}}
 }
}

@Composable private fun PlayButtons(tracks:List<Song>,m:MusicModel){
 Row(Modifier.fillMaxWidth().padding(vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
  FilledTonalButton(onClick={m.playAll(tracks)},enabled=tracks.isNotEmpty(),modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp)){Icon(Icons.Rounded.PlayArrow,null,Modifier.size(21.dp));Text("전체 재생",fontSize=12.sp,modifier=Modifier.padding(start=5.dp))}
  OutlinedButton(onClick={m.playAll(tracks,true)},enabled=tracks.isNotEmpty(),modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp)){Icon(Icons.Rounded.Shuffle,null,Modifier.size(18.dp));Text("셔플",fontSize=12.sp,modifier=Modifier.padding(start=6.dp))}
 }
}
@Composable internal fun CollectionSheet(m:MusicModel,c:MusicCollection,sing:(Song)->Unit){
 ModalBottomSheet(onDismissRequest=m::dismissCollection,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth().testTag("collection-scroll"),contentPadding=PagePadding){
   item{
    Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Heading(c.title,c.caption.takeIf{it.isNotBlank()})};IconButton(onClick=m::dismissCollection){Icon(Icons.Rounded.Close,"목록 닫기")}}
    if(m.collectionBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    m.collectionError?.let{Text(it,color=Coral,fontSize=13.sp);TextButton(onClick={c.path?.let{path->m.browseCollection(c.title,path,c.caption,c.resultKey)}}){Text("다시 불러오기")}}
    if(c.tracks.isNotEmpty())PlayButtons(c.tracks,m)
   }
   items(c.tracks,key={it.id}){song->SongRow(song,m,c.tracks){Row{
    IconButton(onClick={m.play(song,c.tracks)}){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",tint=Pink)}
    if(m.singable.any{it.id==song.id})IconButton(onClick={sing(song)}){Icon(Icons.Rounded.Mic,"${song.title} 부르기",tint=Violet)}
   }}}
   if(c.tracks.isEmpty()&&!m.collectionBusy&&m.collectionError==null)item{Empty("아직 이곳에 음악이 없어요","새로운 곡이 공개되면 여기에서 만나요.");TextButton(onClick={m.dismissCollection();m.listenPage="추천";m.selectTab(0)},modifier=Modifier.fillMaxWidth()){Text("다른 음악 둘러보기")}}
  }
 }
}

@Composable internal fun LibraryScreen(m:MusicModel,create:()->Unit,browser:(String)->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 var sort by rememberSaveable{mutableStateOf("기본 순서")}
 var sorting by remember{mutableStateOf(false)}
 val filter=m.libraryPage
 val state=rememberLazyListState()
 var previous by rememberSaveable{mutableStateOf(filter)}
 LaunchedEffect(filter){if(previous!=filter){state.scrollToItem(0);previous=filter}}
 LaunchedEffect(filter,m.user?.optString("id")){if(m.user!=null&&filter in listOf("내 커버곡","내 제작곡"))m.loadStudio()}
 LazyColumn(Modifier.fillMaxSize().testTag("library-scroll"),state=state,contentPadding=PagePadding){
  item{
   Heading("나의 음악 서랍","좋아하는 음악과 내가 만든 순간들")
   if(m.user==null){
    Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
     listOf("좋아요" to Icons.Rounded.FavoriteBorder,"플레이리스트" to Icons.AutoMirrored.Rounded.QueueMusic,"내 커버곡" to Icons.Rounded.Mic).forEach{(name,icon)->
      Surface(onClick={m.showLogin=true},color=Panel,shape=RoundedCornerShape(16.dp),modifier=Modifier.weight(1f)){Column(Modifier.padding(vertical=20.dp),horizontalAlignment=Alignment.CenterHorizontally){Icon(icon,null,tint=Pink);Text(name,fontSize=11.sp,modifier=Modifier.padding(top=12.dp))}}
     }
    }
    Column(Modifier.fillMaxWidth().padding(top=18.dp).clip(RoundedCornerShape(22.dp)).background(Brush.linearGradient(listOf(Color(0xFF34252E),Panel))).padding(24.dp)){
     Text("취향이 차곡차곡 쌓이는 곳",fontSize=22.sp,fontWeight=FontWeight.Bold)
     Text("좋아요한 곡부터 나만의 플레이리스트까지.\n로그인하고 어디서든 이어 들어요.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(vertical=16.dp))
     Button(onClick={m.showLogin=true}){Text("로그인하고 시작하기")}
    }
   }else{
    Row(Modifier.fillMaxWidth().padding(bottom=20.dp),verticalAlignment=Alignment.CenterVertically){Avatar(m.user?.optString("name")?:"",size=48);Column(Modifier.padding(start=14.dp).weight(1f)){Text(m.user?.optString("name")?:"",fontSize=18.sp,fontWeight=FontWeight.Bold);Text("좋아요 ${m.likes.size} · 플레이리스트 ${m.playlists.size}",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=5.dp))};IconButton(onClick={m.showAccount=true}){Icon(Icons.Rounded.Settings,"계정 설정",tint=Muted)}}
    Chips(listOf("좋아요","플레이리스트","최근 감상","내 커버곡","내 제작곡","팔로잉"),filter){m.libraryPage=it;query=""}
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(query,{query=it},placeholder={Text("보관함 안에서 검색",fontSize=12.sp)},leadingIcon={Icon(Icons.Rounded.Search,null,Modifier.size(20.dp))},singleLine=true,shape=RoundedCornerShape(14.dp),modifier=Modifier.fillMaxWidth().testTag("library-search"))
   }
  }
  if(m.user!=null)when(filter){
   "플레이리스트"->{
    item{Section("플레이리스트",action="새로 만들기",onAction=create)}
    val lists=m.playlists.filter{it.optString("name").contains(query,true)}
    items(lists,key={it.getString("id")}){PlaylistRow(it,m)}
    if(lists.isEmpty())item{Empty(if(query.isBlank())"첫 플레이리스트를 만들어보세요" else "일치하는 목록이 없어요","우울할 땐 위로를, 신날 땐 기분 좋은 음악을.",Icons.AutoMirrored.Rounded.QueueMusic)}
   }
   "팔로잉"->{
    val people=m.follows.filter{it.optString("name").contains(query,true)}
    items(people,key={it.optString("kind")+it.optString("target_id")}){p->Row(Modifier.fillMaxWidth().clickable{m.openProfile(p.getString("target_id"),p.optString("kind"))}.padding(vertical=14.dp),verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),JSONObject(p.toString()).put("id",p.optString("target_id")).put("profile_kind",p.optString("kind")),48);Text(p.optString("name"),modifier=Modifier.weight(1f).padding(start=14.dp));Icon(Icons.Rounded.ChevronRight,null,tint=Muted)}}
    if(people.isEmpty())item{Empty("아직 만날 음악가가 없어요","커뮤니티에서 마음에 드는 프로필을 팔로우해보세요.",Icons.Rounded.PeopleOutline)}
   }
   "내 커버곡","내 제작곡"->{
    val own=m.myTracks.filter{it.cover==(filter=="내 커버곡")&&it.title.contains(query,true)}
    item{Section(filter,"내가 업로드한 음악의 상태를 확인해요");if(m.studioBusy)LinearProgressIndicator(Modifier.fillMaxWidth());m.studioError?.let{Text(it,color=Coral);TextButton(onClick=m::loadStudio){Text("다시 불러오기")}}}
    items(own,key={it.id}){s->
     if(s.raw.optString("status")=="published")SongRow(s,m,own.filter{it.raw.optString("status")=="published"})
     else Row(Modifier.fillMaxWidth().padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){Artwork(s,Modifier.size(58.dp));Column(Modifier.padding(start=14.dp)){Text(s.title,fontSize=14.sp);Text(when(s.raw.optString("status")){"hidden"->"비공개";"failed","rejected"->"확인 필요";else->"처리 중"},color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=5.dp))}}
    }
    if(own.isEmpty()&&!m.studioBusy&&m.studioError==null)item{Empty("아직 올린 ${if(filter=="내 커버곡")"커버곡" else "제작곡"}이 없어요",if(filter=="내 커버곡")"부르기에서 첫 커버를 남겨보세요." else "제작한 음악을 스튜디오에서 공개해보세요.")}
    item{TextButton(onClick={if(filter=="내 커버곡")m.selectTab(2) else browser(Endpoint.url("/#studio"))},modifier=Modifier.fillMaxWidth()){Icon(if(filter=="내 커버곡")Icons.Rounded.Mic else Icons.AutoMirrored.Rounded.OpenInNew,null);Text(if(filter=="내 커버곡")"노래 부르러 가기" else "제작자 웹 스튜디오",modifier=Modifier.padding(start=8.dp))}}
   }
   else->{
    val base=if(filter=="최근 감상")m.history else m.likes
    val found=base.filter{it.title.contains(query,true)||it.artist.contains(query,true)}
    val tracks=when(sort){"제목순"->found.sortedBy{it.title};"아티스트순"->found.sortedBy{it.artist};else->found}
    item{
     PlayButtons(tracks,m)
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("${tracks.size}곡",fontSize=12.sp,color=Muted,modifier=Modifier.weight(1f));Box{
      TextButton(onClick={sorting=true}){Icon(Icons.AutoMirrored.Rounded.Sort,null,Modifier.size(17.dp));Text(sort,fontSize=12.sp,modifier=Modifier.padding(start=5.dp))}
      DropdownMenu(expanded=sorting,onDismissRequest={sorting=false}){listOf("기본 순서","제목순","아티스트순").forEach{label->DropdownMenuItem(text={Text(label)},onClick={sort=label;sorting=false})}}
     }}
    }
    items(tracks,key={it.id}){s->SongRow(s,m,tracks){IconButton(onClick={m.like(s)},enabled=!m.busy){Icon(if(m.likes.any{it.id==s.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"${s.title} 좋아요",tint=Pink)}}}
    if(tracks.isEmpty())item{Empty(if(query.isNotBlank())"일치하는 음악이 없어요" else if(filter=="최근 감상")"최근 들은 음악이 없어요" else "아직 좋아요한 음악이 없어요","듣기에서 마음에 드는 음악을 만나보세요.",Icons.Rounded.FavoriteBorder)}
   }
  }
 }
}
