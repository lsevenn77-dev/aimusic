@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.pager.*
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.activity.compose.BackHandler
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import java.net.URLEncoder

private val Coral=Color(0xFFFFB29C)
internal data class Mood(val id:String,val name:String,val caption:String,val color:Color,val icon:ImageVector)
internal val MoodTiles=listOf(
 Mood("comfort","위로가 필요할 때","마음을 다독이는 음악",Color(0xFF7165AD),Icons.Rounded.FavoriteBorder),
 Mood("energy","기분을 올려줘","리듬에 몸을 맡겨요",Color(0xFF86536C),Icons.Rounded.Bolt),
 Mood("focus","나만의 몰입","집중이 필요한 순간",Color(0xFF427E78),Icons.Rounded.Adjust),
 Mood("drive","어디든 떠나자","길 위의 사운드트랙",Color(0xFF496F9A),Icons.Rounded.DirectionsCar),
 Mood("sleep","잠들기 전","천천히 마무리하는 하루",Color(0xFF5B5985),Icons.Rounded.NightsStay),
 Mood("workout","한 걸음 더","가볍게, 더 힘차게",Color(0xFF53687C),Icons.Rounded.FitnessCenter),
 Mood("romance","설렘 · 사랑","마음이 가까워지는 순간",Color(0xFF86536C),Icons.Rounded.FavoriteBorder),
 Mood("nostalgia","추억","다시 떠오르는 그때의 마음",Color(0xFF7165AD),Icons.Rounded.History),
 Mood("rain","비 오는 날","차분하게 스며드는 음악",Color(0xFF496F9A),Icons.Rounded.Cloud),
 Mood("night","밤 · 새벽","깊어진 밤에 어울리는 음악",Color(0xFF5B5985),Icons.Rounded.NightsStay),
 Mood("party","파티","함께 즐기는 신나는 리듬",Color(0xFF86536C),Icons.Rounded.MusicNote),
 Mood("meditation","휴식 · 명상","잠시 숨을 고르는 시간",Color(0xFF427E78),Icons.Rounded.Spa)
)
// Keep in sync with shared/genres.js; primary genre remains compatible with older apps.
internal val Genres=listOf("K-POP","Pop","Dark Pop","Ballad","R&B","Soul","Hip-Hop","Rock","Alternative","Indie Pop","EDM","Electronic","Synth Pop","City Pop","Lo-fi","Jazz","Blues","Folk","Acoustic","Country","Classical","Ambient","Fusion","Korean Folklore Fusion","World Music","국악","트로트","J-POP","OST","Instrumental","Dance","Funk","Disco","Metal","Punk","Reggae","Latin","Reggaeton","Afrobeats","House","Techno","Trance","Drum & Bass","Trap","Gospel","New Age","Chillout","Cinematic","Orchestral","Children")
private val PagePadding=PaddingValues(start=14.dp,end=14.dp,bottom=24.dp)

@Composable internal fun ListenScreen(m:MusicModel,sing:(Song)->Unit,onBackdrop:(String?)->Unit={}){
 val tabs=rememberSaveableStateHolder()
 val list=rememberLazyListState()
 var discoveryPanel by rememberSaveable{mutableStateOf<String?>(null)}
 Column(Modifier.fillMaxSize()){
  if(m.listenPage!="추천")ListenTabs(m,Modifier.padding(horizontal=14.dp,vertical=8.dp))
  tabs.SaveableStateProvider(m.listenPage){
   when(m.listenPage){
    "발견"->SearchScreen(m)
    "차트"->ChartScreen(m)
    else->LazyColumn(Modifier.fillMaxSize().testTag("listen-scroll"),state=list,contentPadding=PagePadding){
     if(m.listenPage=="추천"){
      val releases=m.latest.ifEmpty{m.home}
      item(key="home-featured"){if(releases.isNotEmpty())FeaturedCarousel(releases,m,list.layoutInfo.visibleItemsInfo.any{it.key=="home-featured"},onBackdrop)else WelcomeMusic(m)}
      item{Spacer(Modifier.height(6.dp));ListenTabs(m)}
      item(key="home-recommended"){Box(Modifier.testTag("home-section-recommended")){StreamingSection("추천 음악",action="모두 보기",onAction={m.showCollection("추천 음악",m.home,twoLineRows=true)})}}
      items(m.home.take(3),key={"approved-home-"+it.id}){song->TwoLineSongRow(song,m,m.home,referenceHome=true)}
      if(m.home.isEmpty())item{Empty(if(m.loading)"음악을 불러오고 있어요" else "새로운 음악을 기다려요","발견에서 장르와 아티스트를 둘러보세요.")}
      item(key="home-charts"){Box(Modifier.testTag("home-section-charts")){StreamingSection("인기 차트",action="전체 보기",onAction={m.listenPage="차트"})}}
      itemsIndexed(m.home.take(3),key={_,song->"rank-"+song.id}){index,song->HomeChartRow(song,m,m.home,index+1)}
      if(m.home.isEmpty()&&!m.loading)item{Text("아직 집계된 곡이 없어요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(vertical=12.dp))}
      item(key="home-latest"){Box(Modifier.testTag("home-section-latest")){Section("최신곡",action="모두 보기",onAction={m.listenPage="최신곡"})}}
      if(releases.isNotEmpty())item{HomeReleaseShelf(releases.take(10),m)}
      else if(!m.loading)item{Text("아직 공개된 곡이 없어요.",fontSize=13.sp,color=Muted)}
      item(key="home-discover"){Box(Modifier.testTag("home-section-discover")){StreamingSection("발견",action="기분 · 장르",onAction={m.listenPage="발견"})};HomeDiscoveryTiles(m,{discoveryPanel="genre"},{discoveryPanel="mood"})}
      item(key="home-playlists"){Box(Modifier.testTag("home-section-playlists")){Section("내 플레이리스트",action="보관함",onAction={m.library("플레이리스트")})}}
      if(m.playlists.isNotEmpty())item{PlaylistShelf(m.playlists,m)}
      else item{MusicEntry("나만의 플레이리스트","좋아하는 음악을 모아보세요",Icons.AutoMirrored.Rounded.QueueMusic){m.library("플레이리스트")}}
      item{Spacer(Modifier.height(10.dp));MusicLibraryShortcuts(m,compact=true)}
      if(m.history.isNotEmpty())item{StreamingSection("최근 들은 음악",action="전체 보기",onAction={m.library("최근 감상")});StreamingRecentShelf(m.history.take(10),m)}
      if(m.singable.isNotEmpty())item{Section("이번엔 내 목소리로",action="부르기",onAction={m.selectTab(2)});m.singable.take(3).forEach{StreamingSongRow(it,m,m.singable,sing);Spacer(Modifier.height(6.dp))}}
      if(m.recentCovers.isNotEmpty())item{Section("같은 노래, 다른 목소리",action="더보기",onAction={m.browseCollection("커버곡 둘러보기","/api/community?kind=cover")});SongShelf(m.recentCovers.take(10),m)}
      if(m.publicLists.any{it.optInt("tracks")>0})item{Section("취향을 나누는 플레이리스트");PlaylistShelf(m.publicLists.filter{it.optInt("tracks")>0}.take(10),m)}
      if(m.people.isNotEmpty())item{Section("음악 뒤의 사람들");LazyRow(Modifier.testTag("home-people-shelf"),horizontalArrangement=Arrangement.spacedBy(12.dp)){items(m.people.take(12),key={it.getString("id")}){PersonCard(it,m)}}}
     }else{
      item{Section("새롭게 도착한 음악","최근 공개된 제작곡을 차례로 들어보세요");PlayButtons(m.latest,m)}
      items(m.latest,key={it.id}){song->StreamingSongRow(song,m,m.latest);Spacer(Modifier.height(6.dp))}
      if(m.latest.isEmpty())item{Empty(if(m.loading)"음악을 불러오고 있어요" else "새로운 음악을 기다려요","등록된 곡이 여기에 차례로 보여요.")}
     }
    }
   }
  }
 }
 discoveryPanel?.let{panel->AppPage(if(panel=="genre")"장르별로 발견"else "기분별로 발견",{discoveryPanel=null}){LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(16.dp)){item{if(panel=="genre")GenreGrid(m)else MoodShelf(m)}}}}
}
@Composable private fun ListenTabs(m:MusicModel,modifier:Modifier=Modifier){
 val entries=listOf(Triple("추천","추천",Icons.Rounded.Star),Triple("차트","인기 차트",Icons.Rounded.BarChart),Triple("최신곡","최신곡",Icons.Rounded.Schedule),Triple("발견","발견",Icons.Rounded.Explore))
 val compactLabels=androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp<360&&LocalDensity.current.fontScale>1.15f
 Column(modifier.fillMaxWidth().testTag("listen-tabs")){
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
   entries.forEachIndexed{index,(page,label,icon)->
    val selected=m.listenPage==page
    Column(Modifier.weight(1f).selectable(selected,role=androidx.compose.ui.semantics.Role.Tab){m.listenPage=page}.testTag("listen-tab-$page").heightIn(min=64.dp),horizontalAlignment=Alignment.CenterHorizontally){
     Column(Modifier.padding(top=5.dp,bottom=7.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(5.dp,Alignment.CenterVertically)){
      Icon(icon,null,tint=if(selected)Pink else SoftText,modifier=Modifier.size(22.dp))
      Text(label,fontSize=if(compactLabels)10.sp else 12.sp,lineHeight=16.sp,color=if(selected)Pink else SoftText,fontWeight=if(selected)FontWeight.SemiBold else FontWeight.Medium,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
     }
     Box(Modifier.fillMaxWidth(.72f).height(3.dp).clip(CircleShape).then(if(selected)Modifier.background(BrandGradient)else Modifier))
    }
    if(index<entries.lastIndex)Box(Modifier.width(.5.dp).height(25.dp).background(Stroke))
   }
  }
  HorizontalDivider(color=Stroke)
 }
}

/** Two aligned text lines; artwork plays, the row opens details and the menu stays separate. */
@Composable private fun TwoLineSongRow(song:Song,m:MusicModel,queue:List<Song>,sing:(()->Unit)?=null,referenceHome:Boolean=false){
 if(referenceHome){HomeRecommendedRow(song,m,queue);return}
 val textMeasurer=rememberTextMeasurer()
 val titleHeight=textMeasurer.measure("가",style=LocalTextStyle.current.copy(fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold),maxLines=1).size.height
 val artistHeight=textMeasurer.measure("가",style=LocalTextStyle.current.copy(fontSize=13.sp,lineHeight=18.sp),maxLines=1).size.height
 val artSize=with(LocalDensity.current){(titleHeight.toDp().coerceAtLeast(24.dp)+artistHeight.toDp()+6.dp).coerceAtLeast(52.dp)}
 Column(Modifier.fillMaxWidth().testTag("stream-song-${song.id}")){
  Row(Modifier.fillMaxWidth().clickable{m.openSong(song)}.padding(vertical=10.dp),verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(artSize).clickable{m.play(song,queue)}.testTag("stream-play-${song.id}").semantics{contentDescription="${song.title} 재생"},corner=10.dp)
   Column(Modifier.weight(1f).padding(start=12.dp).testTag("home-song-copy-${song.id}"),verticalArrangement=Arrangement.spacedBy(6.dp)){
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     Text(song.title,fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f).testTag("music-title-${song.id}"))
     if(sing!=null)IconButton(onClick=sing,modifier=Modifier.width(44.dp).height(24.dp)){Icon(Icons.Rounded.Mic,"${song.title} 부르기",tint=Violet,modifier=Modifier.size(18.dp))}
     TrackActionsMenu(song,m,Modifier.width(if(sing!=null)44.dp else 24.dp).height(24.dp))
    }
    Row(Modifier.fillMaxWidth().testTag("home-song-meta-${song.id}"),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
     Text(song.credit,fontSize=13.sp,lineHeight=18.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f).testTag("home-song-artist-${song.id}"))
     Row(Modifier.testTag("home-song-stats-${song.id}"),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
      listOf(Triple(Icons.Rounded.PlayArrow,"재생",song.plays),Triple(Icons.Rounded.FavoriteBorder,"좋아요",song.likes),Triple(Icons.Rounded.ChatBubbleOutline,"댓글",song.comments)).forEach{(icon,label,count)->
       Row(Modifier.clearAndSetSemantics{contentDescription="$label $count"},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(3.dp)){
        Icon(icon,null,tint=Muted,modifier=Modifier.size(12.dp));Text(homeCount(count),fontSize=11.sp,lineHeight=16.sp,color=Muted,maxLines=1)
       }
      }
     }
    }
   }
  }
  HorizontalDivider(color=Stroke)
 }
}
/** Reference home: readable metadata under the credit, with independent playback controls. */
@Composable private fun HomeRecommendedRow(song:Song,m:MusicModel,queue:List<Song>){
 val measurer=rememberTextMeasurer()
 val textStyle=LocalTextStyle.current
 val copyPixels=listOf(15 to 20,12 to 17,10 to 14).sumOf{(font,line)->measurer.measure("가",style=textStyle.copy(fontSize=font.sp,lineHeight=line.sp),maxLines=1).size.height}
 val artSize=with(LocalDensity.current){copyPixels.toDp()+6.dp}.coerceAtLeast(62.dp)
 Column(Modifier.fillMaxWidth().testTag("stream-song-${song.id}")){
  Row(Modifier.fillMaxWidth().padding(vertical=7.dp),verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(artSize).testTag("home-song-art-${song.id}").clickable{m.play(song,queue)}.semantics{contentDescription="${song.title} 앨범 표지 재생"},corner=10.dp)
   Column(Modifier.weight(1f).padding(start=12.dp,end=2.dp).clickable{m.openSong(song)}.testTag("home-song-copy-${song.id}")){
    Text(song.title,fontSize=15.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("music-title-${song.id}"))
    Column(Modifier.padding(top=3.dp).testTag("home-song-meta-${song.id}")){
     Text(song.credit,fontSize=12.sp,lineHeight=17.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("home-song-artist-${song.id}"))
     Row(Modifier.padding(top=3.dp).testTag("home-song-stats-${song.id}"),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(9.dp)){
      listOf(Triple(Icons.Rounded.PlayArrow,"재생",song.plays),Triple(Icons.Rounded.FavoriteBorder,"좋아요",song.likes),Triple(Icons.Rounded.ChatBubbleOutline,"댓글",song.comments)).forEach{(icon,label,count)->
       Row(Modifier.clearAndSetSemantics{contentDescription="$label $count"},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(3.dp)){
        Icon(icon,null,tint=SoftText,modifier=Modifier.size(11.dp));Text(homeCount(count),fontSize=10.sp,lineHeight=14.sp,color=SoftText,maxLines=1)
       }
      }
     }
    }
   }
   HomePlaybackButton(song,m,queue)
   TrackActionsMenu(song,m,Modifier.width(26.dp).height(48.dp))
  }
  HorizontalDivider(color=Stroke)
 }
}
@Composable private fun HomePlaybackButton(song:Song,m:MusicModel,queue:List<Song>){
 val active=m.current?.id==song.id&&m.playing
 IconButton({if(m.current?.id==song.id)m.toggle()else m.play(song,queue)},modifier=Modifier.size(48.dp).testTag("stream-play-${song.id}")){
  Box(Modifier.size(32.dp).clip(CircleShape).then(if(active)Modifier.background(BrandGradient)else Modifier.background(Ink.copy(alpha=.7f))).border(1.dp,BrandGradient,CircleShape),contentAlignment=Alignment.Center){
   Icon(if(active)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(active)"${song.title} 일시정지"else "${song.title} 재생",Modifier.size(22.dp),tint=if(active)Ink else Pink)
  }
 }
}
@Composable private fun HomeChartRow(song:Song,m:MusicModel,queue:List<Song>,rank:Int){
 Column(Modifier.fillMaxWidth().testTag("home-rank-${song.id}")){
  Row(Modifier.fillMaxWidth().heightIn(min=70.dp).padding(vertical=7.dp),verticalAlignment=Alignment.CenterVertically){
   Text("$rank",fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,color=Color.White,modifier=Modifier.width(25.dp))
   Row(Modifier.weight(1f).clickable{m.openSong(song)}.semantics{contentDescription="${song.title} 곡 정보"},verticalAlignment=Alignment.CenterVertically){
    Artwork(song,Modifier.size(50.dp),corner=9.dp)
    Column(Modifier.weight(1f).padding(start=10.dp,end=4.dp)){
     Text(song.title,fontSize=15.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("music-title-${song.id}"))
     Text(song.credit,fontSize=12.sp,lineHeight=17.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
    }
   }
   HomePlaybackButton(song,m,queue)
   TrackActionsMenu(song,m,Modifier.width(26.dp).height(48.dp))
  }
  HorizontalDivider(color=Stroke)
 }
}
@Composable private fun HomeReleaseShelf(tracks:List<Song>,m:MusicModel){
 BoxWithConstraints(Modifier.fillMaxWidth()){
  val width=((maxWidth-16.dp)/2.15f).coerceAtMost(170.dp)
  LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){
   items(tracks,key={it.id}){song->Column(Modifier.width(width)){
    Box(Modifier.size(width).clip(RoundedCornerShape(11.dp)).clickable{m.openSong(song)}){
     Artwork(song,Modifier.fillMaxSize(),corner=11.dp)
     BrandPlayButton("${song.title} 재생",{m.play(song,tracks)},Modifier.align(Alignment.BottomEnd).padding(4.dp),diameter=30.dp)
    }
    Text(song.title,fontSize=14.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=7.dp).clickable{m.openSong(song)})
    Text(song.credit,fontSize=11.sp,lineHeight=16.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=3.dp,bottom=12.dp))
   }}
  }
 }
}
@Composable private fun HomeDiscoveryTiles(m:MusicModel,genre:()->Unit,mood:()->Unit){
 Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
  listOf(Triple("장르별",Icons.Rounded.Headphones,genre),Triple("기분별",Icons.Rounded.WbSunny,mood)).forEachIndexed{index,(label,icon,open)->
   Box(Modifier.weight(1f).heightIn(min=58.dp).clip(RoundedCornerShape(10.dp)).background(Panel).border(.7.dp,BrandGradient,RoundedCornerShape(10.dp)).clickable(onClick=open).testTag("home-discover-${if(index==0)"genre"else "mood"}")){
    m.latest.getOrNull(index)?.art?.let{AsyncImage(it,null,Modifier.matchParentSize().alpha(.25f),contentScale=ContentScale.Crop)}
    Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Panel.copy(alpha=.75f),Panel.copy(alpha=.25f)))))
    Row(Modifier.fillMaxWidth().padding(horizontal=12.dp,vertical=16.dp),verticalAlignment=Alignment.CenterVertically){Icon(icon,null,Modifier.size(24.dp),tint=Pink);Text(label,fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f).padding(start=9.dp));Icon(Icons.Rounded.ChevronRight,null,Modifier.size(17.dp),tint=SoftText)}
   }
  }
 }
}
private fun homeCount(value:Int):String {
 val scale=when{value>=100000000->100000000 to "억";value>=10000->10000 to "만";value>=1000->1000 to "천";else->return value.toString()}
 return String.format(java.util.Locale.ROOT,"%.1f",value.toDouble()/scale.first).removeSuffix(".0")+scale.second
}
@Composable private fun WelcomeMusic(m:MusicModel){
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).musicSurface(feature=true).padding(24.dp)){
  Text("AI + EFFECT",color=SoftText,fontSize=12.sp,letterSpacing=2.sp)
  Text("오늘의 음악이\n내일의 취향이 돼요",fontSize=28.sp,lineHeight=36.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(vertical=20.dp))
  if(m.loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua,trackColor=Stroke)
  else TextButton(onClick={m.selectTab(1)},colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text("새로운 음악 찾아보기");Icon(Icons.Rounded.ChevronRight,null)}
 }
}
@Composable private fun FeaturedCarousel(tracks:List<Song>,m:MusicModel,visible:Boolean,onBackdrop:(String?)->Unit={}){
 val featured=tracks.take(5)
 val pager=rememberAutoCarousel(featured.size,visible,intervalMillis=4500)
 val current=pager.currentPage%featured.size
 LaunchedEffect(featured[current].art){onBackdrop(featured[current].art)}
 Box(Modifier.fillMaxWidth()){
 HorizontalPager(state=pager,pageSpacing=12.dp,modifier=Modifier.fillMaxWidth().padding(bottom=5.dp).testTag("home-carousel").semantics{stateDescription="${current+1} / ${featured.size}"}) { pageIndex->
  val index=pageIndex%featured.size
  val song=featured[index]
  val coverText=LocalTextStyle.current.copy(shadow=Shadow(Color.Black.copy(alpha=.7f),Offset(0f,1f),4f))
  Box(Modifier.fillMaxWidth().heightIn(min=200.dp).aspectRatio(1.66f).clip(RoundedCornerShape(18.dp)).background(Panel)){
   song.art?.let{AsyncImage(it,null,Modifier.matchParentSize(),contentScale=ContentScale.Crop,alignment=Alignment.CenterEnd)}
   Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha=.5f),Color.Transparent))))
   Column(Modifier.fillMaxWidth().align(Alignment.CenterStart).padding(start=20.dp,end=64.dp,top=24.dp,bottom=28.dp)){
    Text("새로 도착한 음악",style=coverText,color=SoftText,fontSize=12.sp,lineHeight=17.sp)
    Text(song.title,style=coverText,color=Color.White,fontSize=23.sp,lineHeight=30.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=15.dp).clickable{m.openSong(song)})
    Text(song.credit,style=coverText,color=SoftText,fontSize=14.sp,lineHeight=19.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=8.dp))
   }
   BrandPlayButton("${song.title} 지금 듣기",{m.play(song,tracks)},Modifier.align(Alignment.BottomEnd).padding(end=12.dp,bottom=18.dp).then(if(pageIndex==pager.currentPage)Modifier.testTag("home-featured-play")else Modifier),diameter=38.dp)
   if(featured.size>1)Row(Modifier.align(Alignment.BottomCenter).padding(bottom=10.dp),horizontalArrangement=Arrangement.spacedBy(5.dp)){repeat(featured.size){page->Box(Modifier.size(5.dp).clip(CircleShape).background(if(page==current)Color.White else Color.White.copy(alpha=.4f)))}}
  }
 }
}
}

@Composable private fun StreamingRecentShelf(tracks:List<Song>,m:MusicModel){
 BoxWithConstraints(Modifier.fillMaxWidth()){
  val width=((maxWidth-24.dp)/4).coerceIn(76.dp,102.dp)
  LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){
   items(tracks,key={it.id}){song->Column(Modifier.width(width)){
    Box(Modifier.size(width).clip(RoundedCornerShape(9.dp)).clickable{m.play(song,tracks)}.semantics{contentDescription="${song.title} 재생"}){Artwork(song,Modifier.fillMaxSize(),corner=9.dp)}
    Text(song.title,fontSize=12.sp,lineHeight=16.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp).clickable{m.openSong(song)})
    Text(song.credit,fontSize=10.sp,lineHeight=14.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
   }}
  }
 }
}
@Composable private fun SingInvitation(song:Song,m:MusicModel,sing:(Song)->Unit){
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B292E)).padding(18.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(64.dp).clickable{m.openSong(song)})
   Column(Modifier.weight(1f).padding(start=14.dp)){
    Text("MR 준비 완료",fontSize=12.sp,color=Aqua,fontWeight=FontWeight.SemiBold)
    Text(song.title,fontSize=17.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=6.dp))
    Text(song.credit,color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=4.dp))
   }
  }
  Row(Modifier.fillMaxWidth().padding(top=14.dp),verticalAlignment=Alignment.CenterVertically){
   Text("에코 · 룸 · 내 목소리 듣기",color=Muted,fontSize=12.sp,modifier=Modifier.weight(1f))
   FilledTonalButton(onClick={sing(song)},colors=ButtonDefaults.filledTonalButtonColors(containerColor=Aqua,contentColor=Ink),contentPadding=PaddingValues(horizontal=12.dp,vertical=8.dp)){
    Icon(Icons.Rounded.Mic,null,Modifier.size(17.dp));Text("이 곡 부르기",fontSize=13.sp,modifier=Modifier.padding(start=4.dp))
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
 Surface(onClick={m.browseCollection(mood.name,"/api/discovery?mood=${mood.id}",mood.caption)},shape=RoundedCornerShape(16.dp),color=Panel,border=BorderStroke(1.dp,Stroke),modifier=Modifier.testTag("discover-mood-${mood.id}")){
  Column(Modifier.width(168.dp).heightIn(min=120.dp).background(Brush.linearGradient(listOf(Pink.copy(alpha=.09f),Aqua.copy(alpha=.04f)))).padding(16.dp)){
   Icon(mood.icon,null,Modifier.size(22.dp),tint=Pink)
   Spacer(Modifier.height(14.dp));Text(mood.name,fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,color=SoftText,maxLines=2,overflow=TextOverflow.Ellipsis)
   Text(mood.caption,fontSize=12.sp,lineHeight=17.sp,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
  }
 }
}
@Composable internal fun SongShelf(tracks:List<Song>,m:MusicModel){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){
  items(tracks,key={it.id}){s->Column(Modifier.width(136.dp).clip(RoundedCornerShape(16.dp)).musicSurface().border(1.dp,Stroke.copy(alpha=.65f),RoundedCornerShape(16.dp)).padding(8.dp)){
   Box(Modifier.size(120.dp).clickable{m.openSong(s)}){
    Artwork(s,Modifier.fillMaxSize())
    FilledIconButton(onClick={m.play(s,tracks)},modifier=Modifier.align(Alignment.BottomEnd).size(44.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=Ink.copy(alpha=.82f),contentColor=Color.White)){Icon(Icons.Rounded.PlayArrow,"${s.title} 재생",Modifier.size(20.dp))}
   }
   Text(s.title,fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=9.dp).clickable{m.openSong(s)})
   Text(s.credit,fontSize=11.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp,bottom=5.dp))
  }}
 }
}
@Composable private fun CompactShelf(tracks:List<Song>,m:MusicModel){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(20.dp)){
  items(tracks.chunked(3)){chunk->Column(Modifier.width(305.dp)){chunk.forEach{SongRow(it,m,tracks)}}}
 }
}
@Composable private fun CompactMusicRow(song:Song,m:MusicModel,queue:List<Song>){
 Row(Modifier.fillMaxWidth().clickable{m.openSong(song)}.padding(vertical=12.dp),verticalAlignment=Alignment.Top){
  Artwork(song,Modifier.size(46.dp))
  Column(Modifier.weight(1f).padding(start=10.dp)){
   Text(song.title,fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,style=MaterialTheme.typography.bodyMedium.copy(lineBreak=LineBreak.Paragraph),modifier=Modifier.fillMaxWidth().testTag("music-title-${song.id}"))
   Row(Modifier.fillMaxWidth().padding(top=4.dp),verticalAlignment=Alignment.CenterVertically){
    Text(song.credit,fontSize=12.sp,lineHeight=17.sp,color=Muted,modifier=Modifier.weight(1f))
    IconButton(onClick={m.play(song,queue)}){Icon(Icons.Rounded.PlayCircle,"${song.title} 재생",tint=Pink,modifier=Modifier.size(24.dp))}
   }
  }
 }
}
@Composable internal fun PersonCard(p:JSONObject,m:MusicModel){
 // Measure Korean font metrics too: they can exceed the requested line height.
 val textMeasurer=rememberTextMeasurer()
 val nameStyle=LocalTextStyle.current.copy(fontSize=14.sp,lineHeight=19.sp,fontWeight=FontWeight.Bold)
 val bioStyle=LocalTextStyle.current.copy(fontSize=11.sp,lineHeight=16.sp)
 val namePixels=textMeasurer.measure("가\n가",style=nameStyle).size.height
 val bioPixels=textMeasurer.measure("가\n가\n가",style=bioStyle).size.height
 val nameHeight=with(LocalDensity.current){namePixels.toDp()}+4.dp
 val bioHeight=with(LocalDensity.current){bioPixels.toDp()}+4.dp
 Surface(onClick={m.openProfile(p.getString("id"))},shape=RoundedCornerShape(20.dp),color=Panel,modifier=Modifier.testTag("person-card-${p.optString("id")}")){
  Column(Modifier.width(148.dp).border(1.dp,Stroke,RoundedCornerShape(20.dp)).padding(14.dp)){
   Avatar(p.optString("name"),p,44)
   Box(Modifier.fillMaxWidth().padding(top=12.dp).height(nameHeight)){
    Text(p.optString("name"),fontWeight=FontWeight.Bold,fontSize=14.sp,lineHeight=19.sp,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("person-name-${p.optString("id")}"))
   }
   Box(Modifier.fillMaxWidth().padding(top=6.dp).height(bioHeight)){
    Text(p.optString("bio").ifBlank{"프로필에서 이 음악가의 곡을 만나보세요."},color=Muted,fontSize=11.sp,lineHeight=16.sp,maxLines=3,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("person-bio-${p.optString("id")}"))
   }
   Text("프로필 보기  ›",color=Aqua,fontSize=11.sp,modifier=Modifier.padding(top=12.dp))
  }
 }
}
@Composable internal fun PlaylistArt(p:JSONObject,modifier:Modifier=Modifier){
 val covers=p.optJSONArray("covers").objects().take(4)
 Box(modifier.clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(Color(0xFF403449),Color(0xFF20363A))))){
  if(p.optString("image_version").isNotBlank())PlaylistCoverImage(p,Modifier.fillMaxSize())
  else if(covers.isEmpty())Icon(Icons.AutoMirrored.Rounded.QueueMusic,null,tint=Pink.copy(alpha=.7f),modifier=Modifier.align(Alignment.Center).fillMaxSize(.45f))
  else if(covers.size<4)Artwork(Song(covers.first()),Modifier.fillMaxSize())
  else Column{covers.chunked(2).forEach{row->Row(Modifier.weight(1f)){row.forEach{Artwork(Song(it),Modifier.weight(1f).fillMaxHeight())}}}}
 }
}
@Composable internal fun PlaylistShelf(lists:List<JSONObject>,m:MusicModel){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(14.dp)){
  items(lists,key={it.getString("id")}){p->Column(Modifier.width(160.dp).clickable{m.openList(p.getString("id"))}){
   PlaylistArt(p,Modifier.size(160.dp));Text(p.optString("name"),fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=10.dp))
   Text("${p.optInt("tracks")}곡 · ${p.optString("owner_name")}",fontSize=12.sp,color=Muted,maxLines=1,modifier=Modifier.padding(top=6.dp))
  }}
 }
}
@Composable internal fun PlaylistRow(p:JSONObject,m:MusicModel){
 Row(Modifier.fillMaxWidth().clickable{m.openList(p.getString("id"))}.padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
  PlaylistArt(p,Modifier.size(60.dp));Column(Modifier.weight(1f).padding(horizontal=14.dp)){
   Text(p.optString("name"),fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis)
   Text("${p.optInt("tracks")}곡 · ${if(p.optString("user_id")==m.user?.optString("id"))"내 플레이리스트" else p.optString("owner_name")}",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=5.dp))
  };Icon(Icons.Rounded.ChevronRight,null,tint=Muted)
 }
}
@Composable private fun GenreGrid(m:MusicModel){
 Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
  Genres.chunked(2).forEach{items->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
   items.forEach{genre->Surface(onClick={m.browseCollection(genre,"/api/catalog?section=tracks&genre="+URLEncoder.encode(genre,"UTF-8"),"장르별 음악 탐색")},modifier=Modifier.weight(1f).testTag("discover-genre-$genre"),shape=RoundedCornerShape(16.dp),color=Panel,border=BorderStroke(1.dp,Stroke)){
    Box(Modifier.heightIn(min=96.dp).fillMaxWidth()){
     GenreArtwork[genre]?.let{AsyncImage(Endpoint.url(it),null,Modifier.matchParentSize(),contentScale=ContentScale.Crop)}
     Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Ink.copy(alpha=.88f),Ink.copy(alpha=.20f)))))
     Icon(Icons.Rounded.ChevronRight,null,tint=SoftText,modifier=Modifier.align(Alignment.BottomEnd).padding(12.dp).size(18.dp))
     Text(genre,fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,color=Color.White,maxLines=3,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(start=14.dp,end=28.dp,top=14.dp,bottom=14.dp))
    }
   }}
   if(items.size==1)Spacer(Modifier.weight(1f))
  }}
 }
}

@Composable private fun DiscoveryChip(label:String,icon:ImageVector?=null,selected:Boolean?=null,tag:String="",onClick:()->Unit){
 val active=selected==true
 val shape=RoundedCornerShape(12.dp)
 val interaction=if(selected==null)Modifier.clickable(role=androidx.compose.ui.semantics.Role.Button,onClick=onClick)else Modifier.selectable(selected,role=androidx.compose.ui.semantics.Role.Tab,onClick=onClick)
 Row(Modifier.clip(shape).then(if(active)Modifier.background(BrandGradient)else Modifier.background(Panel)).border(1.dp,if(active)Color.Transparent else Stroke,shape).then(interaction).testTag(tag).heightIn(min=44.dp).padding(horizontal=13.dp,vertical=9.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){
  icon?.let{Icon(it,null,Modifier.size(17.dp),tint=if(active)Ink else Pink)}
  Text(label,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.Medium,color=if(active)Ink else SoftText,maxLines=1)
 }
}

@Composable internal fun SearchScreen(m:MusicModel){
 var category by rememberSaveable{mutableStateOf("전체")}
 LazyColumn(Modifier.fillMaxSize().testTag("search-scroll"),contentPadding=PagePadding){
  item{
   Text("발견",fontSize=22.sp,lineHeight=30.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=16.dp))
   Text("지금의 기분에서, 다음 취향까지",fontSize=13.sp,lineHeight=19.sp,color=Muted,modifier=Modifier.padding(top=5.dp,bottom=16.dp))
   CurrentSearch(m.search,m::searchFor,"곡 · 아티스트 검색","global-search")
   Text("제작자와 플레이리스트도 함께 찾아요",fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=8.dp))
  }
  if(m.search.isNotBlank()){
   item{Spacer(Modifier.height(16.dp));LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){items(listOf("전체","곡","사람","플레이리스트")){label->DiscoveryChip(label,selected=category==label,tag="discover-filter-$label"){category=label}}};if(m.searching)LinearProgressIndicator(Modifier.fillMaxWidth().padding(top=12.dp),color=Violet,trackColor=Stroke)}
   if(category in listOf("전체","곡")&&m.searchResults.isNotEmpty()){
    item{Section("곡 · ${m.searchResults.size}")};items(m.searchResults,key={"song-"+it.id}){TwoLineSongRow(it,m,m.searchResults)}
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
    Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     DiscoveryChip("인기 차트",Icons.AutoMirrored.Rounded.TrendingUp){m.listenPage="차트";m.selectTab(0)}
     DiscoveryChip("플레이",Icons.Rounded.PlayArrow){m.selectTab(2)}
     DiscoveryChip("커버곡",Icons.Rounded.PeopleOutline){m.browseCollection("커버곡 둘러보기","/api/community?kind=cover")}
    }
    Section("기분과 순간");MoodShelf(m)
    Section("장르별로 둘러보기");GenreGrid(m)
   }
   if(m.publicLists.isNotEmpty())item{Section("함께 듣는 플레이리스트");PlaylistShelf(m.publicLists,m)}
  }
 }
}

@Composable internal fun SingScreen(m:MusicModel,sing:(Song)->Unit,resumeDraft:(JSONObject)->Unit={},openNavigation:()->Unit={}){
 val compactType=androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp<360||LocalDensity.current.fontScale>1.15f
 var query by rememberSaveable{mutableStateOf("")}
 var genre by rememberSaveable{mutableStateOf("전체")}
 var section by rememberSaveable{mutableStateOf("추천")}
 val pages=rememberSaveableStateHolder()
 val source=if(section=="듀엣")m.duetInvitations else m.singable
 val tracks=source.filter{(genre=="전체"||genre in it.genres)&&(query.isBlank()||it.title.contains(query,true)||it.credit.contains(query,true))}
 LaunchedEffect(Unit){m.loadRankHighlights();m.loadDuets()}
 BackHandler(section!="추천"&&m.detail==null&&m.collection==null&&!m.fullPlayer&&!m.showRecordingDrafts&&!m.rankOpen){section="추천"}
 Column(Modifier.fillMaxSize()){
  Row(Modifier.padding(horizontal=14.dp,vertical=6.dp),verticalAlignment=Alignment.CenterVertically){
   if(section!="추천")IconButton(onClick={section="추천"}){Icon(Icons.AutoMirrored.Rounded.ArrowBack,"부르기 처음으로")}
   OutlinedTextField(query,{query=it},modifier=Modifier.weight(1f).testTag("sing-search"),singleLine=true,placeholder={Text(if(section=="듀엣")"참여할 듀엣 찾기" else "부르고 싶은 노래 찾기",fontSize=13.sp)},leadingIcon={Icon(Icons.Rounded.Search,null,Modifier.size(20.dp))},shape=RoundedCornerShape(50))
   IconButton(onClick=openNavigation,modifier=Modifier.testTag("navigation-menu")){Icon(Icons.Rounded.Menu,"전체 메뉴",tint=StreamPurple)}
  }
  pages.SaveableStateProvider(section){
   LazyColumn(Modifier.fillMaxSize().testTag("sing-scroll"),contentPadding=PagePadding){
    if(section=="추천"&&query.isBlank()){
     item{
      Box(Modifier.fillMaxWidth().padding(top=4.dp,bottom=10.dp).heightIn(min=116.dp).clip(RoundedCornerShape(14.dp)).background(Brush.linearGradient(listOf(Color(0xFF292365),Color(0xFF5032A0),Color(0xFF24366F)))).border(1.dp,StreamPurple.copy(alpha=.45f),RoundedCornerShape(14.dp))){
       if(!compactType)Image(painterResource(R.drawable.streaming_microphone),null,Modifier.align(Alignment.CenterEnd).size(106.dp).padding(end=8.dp),contentScale=ContentScale.Fit)
       Column(Modifier.fillMaxWidth().padding(16.dp).padding(end=if(compactType)0.dp else 94.dp)){Text(if(compactType)"지금,\n노래해보세요" else "지금, 노래해보세요",fontSize=21.sp,lineHeight=27.sp,fontWeight=FontWeight.Bold);Text("좋아하는 곡을 부르고\n당신의 목소리를 들려주세요",fontSize=12.sp,lineHeight=18.sp,color=SoftText,modifier=Modifier.padding(top=6.dp))}
      }
      Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
       listOf("솔로" to Icons.Rounded.Mic,"듀엣" to Icons.Rounded.PeopleOutline).forEach{(mode,icon)->
        val tint=if(mode=="솔로")StreamCyan else StreamPink
        Surface(onClick={section=mode;genre="전체"},color=Color.Transparent,border=BorderStroke(1.dp,tint.copy(alpha=.4f)),shape=RoundedCornerShape(12.dp),modifier=Modifier.weight(1f).testTag("sing-entry-$mode")){
         val backdrop=Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(tint.copy(alpha=.22f),StreamPanel))).heightIn(min=76.dp).padding(horizontal=10.dp,vertical=8.dp)
         if(compactType)Column(backdrop,horizontalAlignment=Alignment.CenterHorizontally){
          StreamingIcon(icon,tint)
          Text(if(mode=="솔로")"바로 부르기" else "듀엣 참여하기",fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
         }else Row(backdrop,verticalAlignment=Alignment.CenterVertically){
          StreamingIcon(icon,tint)
          Column(Modifier.weight(1f).padding(start=6.dp)){Text(if(mode=="솔로")"바로 부르기" else "듀엣 참여하기",fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold);Text(if(mode=="솔로")"내 목소리로 완성하는 곡" else "함께 부르는 새로운 경험",color=Muted,fontSize=10.sp,lineHeight=14.sp,modifier=Modifier.padding(top=3.dp))}
         }
        }
       }
      }
      RecordingDraftPreview(m,resumeDraft)

     }
    }
    item{
     StreamingSection(if(section=="듀엣")"참여를 기다리는 듀엣" else if(section=="추천")"추천 곡" else "부를 수 있는 곡")
     Chips(listOf("전체")+Genres,genre){genre=it};Spacer(Modifier.height(10.dp))
     if(section=="듀엣"&&m.duetLoading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua,trackColor=Stroke)
     if(section=="듀엣")m.duetError?.let{Text(it,color=Pink);TextButton(onClick=m::loadDuets){Text("다시 불러오기")}}
    }
    if(section=="듀엣")items(tracks,key={it.id}){song->
     val mine=song.raw.optString("user_id")==m.user?.optString("id")
     Surface(color=Panel,shape=RoundedCornerShape(18.dp),border=BorderStroke(1.dp,Violet.copy(alpha=.35f)),modifier=Modifier.fillMaxWidth().padding(bottom=12.dp).testTag("duet-invitation-${song.id}")){
      Column(Modifier.padding(16.dp)){
       Row(verticalAlignment=Alignment.CenterVertically){Artwork(song,Modifier.size(72.dp).clickable{m.openSong(song)});Column(Modifier.weight(1f).padding(start=14.dp)){Text("듀엣 · 참여 대기",color=Aqua,fontSize=12.sp);Text(song.title,fontWeight=FontWeight.Bold,fontSize=17.sp,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=6.dp));Text(song.producer,color=Muted,fontSize=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis)}}
       Row(Modifier.padding(top=12.dp),verticalAlignment=Alignment.CenterVertically){IconButton(onClick={m.play(song,tracks)}){Icon(Icons.Rounded.PlayCircle,"${song.title} 먼저 듣기",tint=Pink)};BrandButton(onClick={if(mine)m.openSong(song)else sing(song)},modifier=Modifier.weight(1f).testTag("duet-join-${song.id}")){Text(if(mine)"내 듀엣 보기" else "듀엣 참여")}}
      }
     }
    }else items(tracks,key={it.id}){song->StreamingSongRow(song,m,tracks,sing);Spacer(Modifier.height(4.dp))}
    if(tracks.isEmpty()&&!(section=="듀엣"&&(m.duetError!=null||m.duetLoading)))item{Empty(if(m.loading)"곡을 불러오고 있어요" else if(section=="듀엣"&&query.isBlank())"아직 대기 중인 듀엣이 없어요" else "조건에 맞는 곡이 없어요","다른 장르나 제목으로 찾아보세요.",Icons.Rounded.MicNone)}
    item{Section("노래로 더 만나기");MusicEntry("커버 랭킹","사람들이 함께 듣는 목소리",Icons.Rounded.EmojiEvents){m.openRanking("week")};Spacer(Modifier.height(8.dp));MusicEntry("노래방 차트","많이 부르는 곡 둘러보기",Icons.Rounded.BarChart){m.openRanking("week",chart=true)};Spacer(Modifier.height(8.dp));MusicEntry("내 커버곡","공개한 녹음과 업로드 관리",Icons.Rounded.LibraryMusic){m.library("내 커버곡")}}
    if(m.recentCovers.isNotEmpty())item{Box(Modifier.testTag("new-voices-more")){Section("새로 올라온 목소리",action="더보기",onAction={m.browseCollection("새로 올라온 목소리","/api/community?kind=cover",asPage=true)})};SongShelf(m.recentCovers.take(10),m)}
    item{Row{TextButton(onClick={m.browseCollection("솔로 커버","/api/community?kind=cover&cover_mode=solo")}){Text("솔로 커버")};TextButton(onClick={m.browseCollection("듀엣 커버","/api/community?kind=cover&cover_mode=duet")}){Text("듀엣 커버")}}}
   }
  }
 }
}
@Composable private fun PlayButtons(tracks:List<Song>,m:MusicModel){
 Row(Modifier.fillMaxWidth().padding(vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
  FilledTonalButton(onClick={m.playAll(tracks)},enabled=tracks.isNotEmpty(),modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp)){Icon(Icons.Rounded.PlayArrow,null,Modifier.size(21.dp));Text("전체 재생",fontSize=13.sp,modifier=Modifier.padding(start=5.dp))}
  OutlinedButton(onClick={m.playAll(tracks,true)},enabled=tracks.isNotEmpty(),modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp)){Icon(SimpleShuffle,null,Modifier.size(18.dp));Text("셔플",fontSize=13.sp,modifier=Modifier.padding(start=6.dp))}
 }
}
@Composable internal fun CollectionSheet(m:MusicModel,c:MusicCollection,sing:(Song)->Unit){
 var grid by rememberSaveable(c.path,c.title){mutableStateOf(true)}
 val columns=musicGalleryColumns()
 val covers=!c.twoLineRows&&(c.path?.contains("kind=cover")==true||c.tracks.any{it.cover})
 val content:@Composable ()->Unit={
  LazyColumn(Modifier.fillMaxSize().testTag("collection-scroll"),contentPadding=PagePadding){
   item{
    Row(verticalAlignment=Alignment.CenterVertically){IconButton(onClick=m::dismissCollection,modifier=Modifier.testTag("collection-back")){Icon(if(c.asPage)Icons.AutoMirrored.Rounded.ArrowBack else Icons.Rounded.Close,if(c.asPage)"이전 화면" else "목록 닫기")};Column(Modifier.weight(1f)){Heading(c.title,c.caption.takeIf{it.isNotBlank()})}}
    if(m.collectionBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    m.collectionError?.let{Text(it,color=Coral,fontSize=14.sp);TextButton(onClick={c.path?.let{path->m.browseCollection(c.title,path,c.caption,c.resultKey,c.asPage)}}){Text("다시 불러오기")}}
    if(c.tracks.isNotEmpty())PlayButtons(c.tracks,m)
    if(covers)MusicLayoutControl(c.tracks.size,grid,{grid=it},"collection")
   }
   if(c.twoLineRows)items(c.tracks,key={it.id}){song->TwoLineSongRow(song,m,c.tracks,if(m.singable.any{it.id==song.id})({sing(song)})else null)}
   else if(covers)musicGallery(c.tracks,m,grid,columns,"collection")
   else items(c.tracks,key={it.id}){song->SongRow(song,m,c.tracks){Row{
    IconButton(onClick={m.play(song,c.tracks)}){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",tint=SoftText)}
    if(m.singable.any{it.id==song.id})IconButton(onClick={sing(song)}){Icon(Icons.Rounded.Mic,"${song.title} 부르기",tint=Violet)}
   }}}
   if(c.tracks.isEmpty()&&!m.collectionBusy&&m.collectionError==null)item{Empty("아직 이곳에 음악이 없어요","새로운 곡이 공개되면 여기에서 만나요.");TextButton(onClick={m.dismissCollection();m.listenPage="추천";m.selectTab(0)},modifier=Modifier.fillMaxWidth()){Text("다른 음악 둘러보기")}}
  }
 }
 AppPage(title="음악 목록",onDismissRequest=m::dismissCollection,containerColor=Ink){Box(Modifier.fillMaxSize().testTag("collection-page")){content()}}
}

@Composable internal fun LibraryScreen(m:MusicModel,create:()->Unit,browser:(String)->Unit){
 val pages=rememberSaveableStateHolder()
 pages.SaveableStateProvider(m.libraryPage){LibraryPage(m,create,browser)}
}
@Composable private fun LibraryPage(m:MusicModel,create:()->Unit,browser:(String)->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 var sort by rememberSaveable{mutableStateOf("기본 순서")}
 var sorting by remember{mutableStateOf(false)}
 var deleting by remember{mutableStateOf<Song?>(null)}
 var coverGrid by rememberSaveable{mutableStateOf(true)}
 val columns=musicGalleryColumns()
 val filter=m.libraryPage
 val state=rememberLazyListState()
 LaunchedEffect(filter,m.user?.optString("id")){if(m.user!=null&&filter in listOf("내 커버곡","내 제작곡"))m.loadStudio()}
 LazyColumn(Modifier.fillMaxSize().testTag("library-scroll"),state=state,contentPadding=PagePadding){
  item{
   Row(verticalAlignment=Alignment.CenterVertically){IconButton(onClick=m::leaveLibrary,modifier=Modifier.testTag("library-back")){Icon(Icons.AutoMirrored.Rounded.ArrowBack,"이전 화면")};Text(if(filter=="보관함")"내 보관함" else filter,fontSize=23.sp,fontWeight=FontWeight.Bold)}
   if(m.user==null){
    Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
     listOf("플레이리스트" to Icons.AutoMirrored.Rounded.QueueMusic,"좋아요" to Icons.Rounded.FavoriteBorder,"내 커버곡" to Icons.Rounded.Mic).forEach{(name,icon)->
      Surface(onClick={m.showLogin=true},color=Panel,shape=RoundedCornerShape(16.dp),modifier=Modifier.weight(1f)){Column(Modifier.padding(vertical=20.dp),horizontalAlignment=Alignment.CenterHorizontally){Icon(icon,null,tint=if(name=="플레이리스트")SoftText else Pink);Text(name,fontSize=12.sp,modifier=Modifier.padding(top=12.dp))}}
     }
    }
    Column(Modifier.fillMaxWidth().padding(top=18.dp).clip(RoundedCornerShape(22.dp)).musicSurface(feature=true).padding(24.dp)){
     Text("취향이 차곡차곡 쌓이는 곳",fontSize=23.sp,fontWeight=FontWeight.Bold)
     Text("좋아요한 곡부터 나만의 플레이리스트까지.\n로그인하고 어디서든 이어 들어요.",color=Muted,fontSize=14.sp,modifier=Modifier.padding(vertical=16.dp))
     BrandButton(onClick={m.showLogin=true}){Text("로그인하고 시작하기")}
    }
   }else{
    Chips(listOf("보관함","플레이리스트","최근 감상","좋아요","내 커버곡","내 제작곡","팔로잉","팔로워"),filter){m.libraryPage=it;query=""}
    Spacer(Modifier.height(12.dp))
    if(filter!="보관함")OutlinedTextField(query,{query=it},placeholder={Text("보관함 안에서 검색",fontSize=13.sp)},leadingIcon={Icon(Icons.Rounded.Search,null,Modifier.size(20.dp))},singleLine=true,shape=RoundedCornerShape(14.dp),modifier=Modifier.fillMaxWidth().testTag("library-search"))
   }
  }
  if(m.user!=null)when(filter){
   "보관함"->{
    item{MusicLibraryShortcuts(m);Section("내 플레이리스트",action="새로 만들기",onAction=create)}
    items(m.playlists.take(3),key={it.getString("id")}){PlaylistRow(it,m)}
    if(m.playlists.isEmpty())item{Text("아직 플레이리스트가 없어요. 좋아하는 곡을 모아보세요.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(vertical=12.dp))}
    item{Section("좋아요한 노래",action="모두 보기",onAction={m.libraryPage="좋아요"});PlayButtons(m.likes,m)}
    items(m.likes.take(5),key={"liked-"+it.id}){StreamingSongRow(it,m,m.likes);Spacer(Modifier.height(6.dp))}
    item{Section("최근 감상",action="모두 보기",onAction={m.libraryPage="최근 감상"})}
    items(m.history.take(5),key={"recent-"+it.id}){StreamingSongRow(it,m,m.history);Spacer(Modifier.height(6.dp))}
    if(m.likes.isEmpty()&&m.history.isEmpty())item{Empty("음악으로 채워보세요","곡을 듣거나 좋아요하면 이곳에서 다시 만나요.");TextButton(onClick={m.selectTab(1)}){Text("음악 찾아보기")}}
   }
   "플레이리스트"->{
    item{Section("내 플레이리스트",action="새로 만들기",onAction=create)}
    val lists=m.playlists.filter{it.optString("name").contains(query,true)}
    items(lists,key={it.getString("id")}){PlaylistRow(it,m)}
    if(lists.isEmpty())item{Empty(if(query.isBlank())"첫 플레이리스트를 만들어보세요" else "일치하는 목록이 없어요","우울할 땐 위로를, 신날 땐 기분 좋은 음악을.",Icons.AutoMirrored.Rounded.QueueMusic)}
   }
   "팔로워"->{
    val people=m.ownProfile.optJSONArray("followers").objects().filter{it.optString("name").contains(query,true)}
    items(people){p->Surface(onClick={m.openFollower(p)},color=Panel,shape=MaterialTheme.shapes.large,modifier=Modifier.fillMaxWidth().testTag("follower-"+p.optString("user_id",p.optString("id")))){Row(Modifier.fillMaxWidth().padding(16.dp),verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),p,48);Text(p.optString("name"),Modifier.weight(1f).padding(start=14.dp));Icon(Icons.Rounded.ChevronRight,"페이지 보기",tint=Muted)}}}
    if(people.isEmpty())item{Empty(if(query.isBlank())"아직 팔로워가 없어요" else "일치하는 사람이 없어요","음악으로 새로운 사람들을 만나보세요.",Icons.Rounded.PeopleOutline)}
   }
   "팔로잉"->{
    val people=m.follows.filter{it.optString("name").contains(query,true)}
    items(people,key={it.optString("kind")+it.optString("target_id")}){p->Row(Modifier.fillMaxWidth().clickable{m.openProfile(p.getString("target_id"),p.optString("kind"))}.padding(vertical=14.dp),verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),JSONObject(p.toString()).put("id",p.optString("target_id")).put("profile_kind",p.optString("kind")),48);Text(p.optString("name"),modifier=Modifier.weight(1f).padding(start=14.dp));Icon(Icons.Rounded.ChevronRight,null,tint=Muted)}}
    if(people.isEmpty())item{Empty("아직 만날 음악가가 없어요","커뮤니티에서 마음에 드는 프로필을 팔로우해보세요.",Icons.Rounded.PeopleOutline)}
   }
   "내 커버곡","내 제작곡"->{
    val own=m.myTracks.filter{it.cover==(filter=="내 커버곡")&&it.title.contains(query,true)}
    item{Section(filter,"내가 업로드한 음악의 상태를 확인해요");if(filter=="내 커버곡")MusicLayoutControl(own.size,coverGrid,{coverGrid=it},"library-covers");if(m.studioBusy)LinearProgressIndicator(Modifier.fillMaxWidth());m.studioError?.let{Text(it,color=Coral);TextButton(onClick=m::loadStudio){Text("다시 불러오기")}}}
    if(filter=="내 커버곡")musicGallery(own,m,coverGrid,columns,"library-covers",onDelete={deleting=it})
    else items(own,key={it.id}){s->
     Column {
     if(s.raw.optString("status")=="published")SongRow(s,m,own.filter{it.raw.optString("status")=="published"})
     else Row(Modifier.fillMaxWidth().padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){Artwork(s,Modifier.size(58.dp));Column(Modifier.padding(start=14.dp)){Text(s.title,fontSize=15.sp);Text(when(s.raw.optString("status")){"hidden"->"비공개";"failed","rejected"->"확인 필요";else->"처리 중"},color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=5.dp))}}
     if(s.cover)TextButton(onClick={deleting=s}){Icon(Icons.Rounded.DeleteOutline,null);Text("커버곡 삭제")}
     }
    }
    if(own.isEmpty()&&!m.studioBusy&&m.studioError==null)item{Empty("아직 올린 ${if(filter=="내 커버곡")"커버곡" else "제작곡"}이 없어요",if(filter=="내 커버곡")"부르기에서 첫 커버를 남겨보세요." else "제작한 음악을 스튜디오에서 공개해보세요.")}
    item{TextButton(onClick={if(filter=="내 커버곡")m.selectTab(2) else m.openStudio()},modifier=Modifier.fillMaxWidth()){Icon(if(filter=="내 커버곡")Icons.Rounded.Mic else Icons.AutoMirrored.Rounded.OpenInNew,null);Text(if(filter=="내 커버곡")"노래 부르러 가기" else "스튜디오",modifier=Modifier.padding(start=8.dp))}}
   }
   else->{
    val base=if(filter=="최근 감상")m.history else m.likes
    val found=base.filter{it.title.contains(query,true)||it.artist.contains(query,true)}
    val tracks=when(sort){"제목순"->found.sortedBy{it.title};"아티스트순"->found.sortedBy{it.artist};else->found}
    item{
     PlayButtons(tracks,m)
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("${tracks.size}곡",fontSize=13.sp,color=Muted,modifier=Modifier.weight(1f));Box{
      TextButton(onClick={sorting=true}){Icon(Icons.AutoMirrored.Rounded.Sort,null,Modifier.size(17.dp));Text(sort,fontSize=13.sp,modifier=Modifier.padding(start=5.dp))}
      AppMenuPage(title="정렬",expanded=sorting,onDismissRequest={sorting=false}){listOf("기본 순서","제목순","아티스트순").forEach{label->PageMenuItem(text={Text(label)},onClick={sort=label;sorting=false})}}
     }}
    }
    items(tracks,key={it.id}){s->StreamingSongRow(s,m,tracks);Spacer(Modifier.height(6.dp))}
    if(tracks.isEmpty())item{Empty(if(query.isNotBlank())"일치하는 음악이 없어요" else if(filter=="최근 감상")"최근 들은 음악이 없어요" else "아직 좋아요한 음악이 없어요","듣기에서 마음에 드는 음악을 만나보세요.",Icons.Rounded.FavoriteBorder)}
   }
  }
 }
 deleting?.let{s->AlertDialog(onDismissRequest={deleting=null},title={Text("커버곡을 삭제할까요?")},text={Text("「${s.title}」이 공개 목록에서 삭제돼요. 되돌릴 수 없어요.")},confirmButton={TextButton(onClick={m.deleteCover(s);deleting=null},enabled=!m.busy){Text("삭제")}},dismissButton={TextButton(onClick={deleting=null}){Text("취소")}})}
}
