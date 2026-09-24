@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import org.json.JSONObject

internal val Pink=Color(0xFFF2A1C6)
internal val Aqua=Color(0xFF8CDCE2)
internal val Ink=Color(0xFF101114)
internal val Panel=Color(0xFF191B20)
internal val Muted=Color(0xFFA2A3AF)
internal val Violet=Color(0xFFD6B5ED)
internal val Stroke=Color(0xFF30313A)
private val BrandFont=FontFamily(Font(R.font.manrope_extralight,FontWeight.ExtraLight))
private val Scheme=darkColorScheme(primary=Pink,onPrimary=Ink,primaryContainer=Color(0xFF34252E),onPrimaryContainer=Pink,background=Ink,surface=Panel,onSurface=Color(0xFFF3F2F5),surfaceVariant=Stroke,onSurfaceVariant=Muted,secondary=Aqua,onSecondary=Ink,secondaryContainer=Color(0xFF20383C),onSecondaryContainer=Aqua)

@Composable private fun BrandLockup(){
 Column(horizontalAlignment=Alignment.CenterHorizontally){
  Text("AIFECT",style=TextStyle(fontFamily=BrandFont,fontWeight=FontWeight.ExtraLight,fontSize=30.sp,letterSpacing=5.sp,brush=Brush.linearGradient(listOf(Pink,Violet,Aqua))))
  Text("AI와 음악의 만남",fontSize=10.sp,letterSpacing=1.sp,color=Muted,modifier=Modifier.padding(top=1.dp))
 }
}

@Composable fun AifectApp(m:MusicModel,sing:(Song)->Unit,browser:(String)->Unit,social:(String)->Unit={},adPrivacy:()->Unit={}){
 MaterialTheme(colorScheme=Scheme){
  val snack=remember {SnackbarHostState()}
  var listPicker by remember {mutableStateOf<Song?>(null)}
  var createList by remember {mutableStateOf(false)}
  val pages=rememberSaveableStateHolder()
  LaunchedEffect(m.notice){m.notice?.let {snack.showSnackbar(it);m.notice=null}}
  BackHandler(m.fullPlayer||m.detail!=null||m.selectedList!=null||m.profile!=null||m.showLogin||m.showAccount||m.collection!=null||m.rankOpen){
   when{m.showLogin->m.showLogin=false;m.showAccount->m.showAccount=false;m.detail!=null->m.detail=null;m.selectedList!=null->m.selectedList=null;m.profile!=null->m.profile=null;m.fullPlayer->m.fullPlayer=false;m.collection!=null->m.dismissCollection();else->m.dismissRanking()}
  }
  Scaffold(containerColor=Ink,snackbarHost={SnackbarHost(snack)},bottomBar={
   Column {
    AnimatedVisibility(m.current!=null){m.current?.let {MiniPlayer(m,it)}}
    NavigationBar(containerColor=Ink,tonalElevation=0.dp){
     listOf("듣기" to Icons.Rounded.Headphones,"검색" to Icons.Rounded.Search,"부르기" to Icons.Rounded.Mic,"커뮤니티" to Icons.Rounded.People,"보관함" to Icons.Rounded.LibraryMusic).forEachIndexed {i,(name,icon)->
      NavigationBarItem(selected=m.tab==i,onClick={m.selectTab(i)},icon={Icon(icon,name)},label={Text(name,fontSize=11.sp,fontWeight=FontWeight.SemiBold)},colors=NavigationBarItemDefaults.colors(selectedIconColor=Pink,selectedTextColor=Pink,indicatorColor=Color(0xFF34252E),unselectedIconColor=Muted,unselectedTextColor=Muted))
     }
    }
   }
  }){padding->
   Column(Modifier.fillMaxSize().padding(padding)){
    Row(Modifier.fillMaxWidth().padding(horizontal=22.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
     BrandLockup()
     Spacer(Modifier.weight(1f))
     IconButton(onClick=m::refresh,enabled=!m.refreshing){Icon(Icons.Rounded.Refresh,"새로고침",tint=Muted)}
     Surface(onClick={if(m.user==null)m.showLogin=true else m.showAccount=true},shape=CircleShape,color=Stroke){
      Box(Modifier.size(38.dp),contentAlignment=Alignment.Center){if(m.user==null)Icon(Icons.Rounded.PersonOutline,"로그인",Modifier.size(21.dp)) else Text(m.user?.optString("name")?.take(1)?:"A",color=Pink,fontWeight=FontWeight.Bold)}
     }
    }
    if(m.error!=null)Row(Modifier.fillMaxWidth().background(Color(0xFF36261E)).padding(horizontal=20.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
     Text(m.error?:"",Modifier.weight(1f),fontSize=12.sp,color=Color(0xFFFFC69C));TextButton(onClick=m::refresh){Text("재시도")}
    }
    pages.SaveableStateProvider(m.tab){when(m.tab){
     0->ListenScreen(m,sing)
     1->SearchScreen(m)
     2->SingScreen(m,sing)
     3->CommunityScreen(m,sing)
     4->LibraryScreen(m,{createList=true},browser)
    }
    }
   }
  }
  if(m.rankOpen&&m.detail==null&&m.profile==null&&!m.fullPlayer&&!m.showLogin&&m.collection==null)CoverRankingSheet(m)
  m.collection?.let { CollectionSheet(m,it,sing) }
  if(m.showLogin)LoginSheet(m,browser,social)
  if(m.showAccount)AccountSheet(m,browser,adPrivacy)
  m.detail?.let { SongSheet(m,it,sing,{listPicker=it}) }
  m.selectedList?.let { PlaylistSheet(m,it) }
  if(m.detail==null&&!m.fullPlayer)m.profile?.let { ProfileSheet(m,it) }
  if(m.fullPlayer)m.current?.let { PlayerSheet(m,it,{listPicker=it}) }
  listPicker?.let { song->
   ModalBottomSheet(onDismissRequest={listPicker=null},containerColor=Panel){
    Column(Modifier.fillMaxWidth().padding(24.dp)){
     Text("플레이리스트에 담기",fontSize=22.sp,fontWeight=FontWeight.Bold);Text(song.title,color=Muted,modifier=Modifier.padding(vertical=8.dp))
     if(m.user==null)Button(onClick={listPicker=null;m.showLogin=true}){Text("로그인하고 저장하기")}
     else {
      m.playlists.filter {it.optString("user_id")==m.user?.optString("id")}.forEach {p->TextButton(onClick={m.addToList(p.getString("id"),song);listPicker=null},enabled=!m.busy,modifier=Modifier.fillMaxWidth()){Icon(Icons.AutoMirrored.Rounded.QueueMusic,null);Spacer(Modifier.width(10.dp));Text(p.optString("name"),Modifier.weight(1f));Text("${p.optInt("tracks")}곡")}}
      TextButton(onClick={listPicker=null;createList=true}){Icon(Icons.Rounded.Add,null);Text("새 플레이리스트")}
     };Spacer(Modifier.height(30.dp))
    }
   }
  }
  if(createList)PlaylistEditor("새 플레이리스트","",false,m.busy,{createList=false}){name,public->m.createList(name,public){createList=false}}
 }
}
@Composable internal fun Heading(title:String,subtitle:String?=null){
 Column(Modifier.padding(top=12.dp,bottom=20.dp)){
  Text(title,fontSize=30.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1).sp)
  if(subtitle!=null)Text(subtitle,color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=8.dp))
 }
}
@Composable internal fun Section(title:String,subtitle:String?=null,action:String?=null,onAction:()->Unit={}){
 Row(Modifier.fillMaxWidth().padding(top=26.dp,bottom=14.dp),verticalAlignment=Alignment.CenterVertically){
  Column(Modifier.weight(1f)){Text(title,fontSize=20.sp,fontWeight=FontWeight.Bold);subtitle?.let {Text(it,color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=5.dp))}}
  action?.let {TextButton(onClick=onAction){Text(it,color=Pink,fontSize=12.sp)}}
 }
}
@Composable internal fun Artwork(song:Song,modifier:Modifier=Modifier){
 Box(modifier.clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(Color(0xFF37303E),Color(0xFF23343B)))),contentAlignment=Alignment.Center){
  Icon(if(song.cover)Icons.Rounded.Mic else Icons.Rounded.MusicNote,null,tint=Pink.copy(alpha=.45f),modifier=Modifier.fillMaxSize(.4f))
  song.art?.let {AsyncImage(it,contentDescription="${song.title} 앨범 표지",modifier=Modifier.fillMaxSize(),contentScale=ContentScale.Crop)}
 }
}
@Composable internal fun Chips(items:List<String>,selected:String,onSelect:(String)->Unit){
 LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){
  items(items){label->FilterChip(selected==label,{onSelect(label)},label={Text(label,fontSize=12.sp)},shape=RoundedCornerShape(24.dp),colors=FilterChipDefaults.filterChipColors(selectedContainerColor=Pink,selectedLabelColor=Ink),border=FilterChipDefaults.filterChipBorder(enabled=true,selected=selected==label,borderColor=Stroke))}
 }
}
@Composable internal fun Empty(title:String,subtitle:String,icon:ImageVector=Icons.Rounded.MusicNote){
 Column(Modifier.fillMaxWidth().padding(vertical=44.dp,horizontal=16.dp),horizontalAlignment=Alignment.CenterHorizontally){
  Icon(icon,null,tint=Muted,modifier=Modifier.size(40.dp));Text(title,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=16.dp));Text(subtitle,color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=7.dp))
 }
}
@Composable internal fun SongRow(song:Song,m:MusicModel,queue:List<Song>,trailing:(@Composable ()->Unit)?=null){
 Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable {m.openSong(song)}.padding(vertical=9.dp),verticalAlignment=Alignment.CenterVertically){
  Box(Modifier.size(58.dp).clickable{m.play(song,queue)}){Artwork(song,Modifier.fillMaxSize());if(m.current?.id==song.id)Box(Modifier.fillMaxSize().background(Ink.copy(alpha=.45f)),contentAlignment=Alignment.Center){Icon(if(m.playing)Icons.Rounded.GraphicEq else Icons.Rounded.PlayArrow,"재생",tint=Pink)}}
  Column(Modifier.weight(1f).padding(horizontal=13.dp)){
   Text(song.title,fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
   Text(song.credit,fontSize=12.sp,color=Muted,maxLines=1,modifier=Modifier.padding(top=5.dp))
   Text(if(song.cover)"커버곡 · ${song.plays}회 재생" else "${song.genre} · ${timeLabel((song.duration*1000).toLong())}",fontSize=10.sp,color=Muted,modifier=Modifier.padding(top=4.dp))
  }
  if(trailing!=null)trailing() else IconButton(onClick={m.play(song,queue)}){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",tint=Pink)}
 }
}
@Composable internal fun Avatar(name:String,p:JSONObject?=null,size:Int=38){
 Box(Modifier.size(size.dp).clip(CircleShape).background(Color(0xFF34303B)),contentAlignment=Alignment.Center){
  Text(name.take(1).ifBlank{"♪"},color=Pink,fontSize=(size*.36).sp,fontWeight=FontWeight.Bold)
  if(p?.optString("image_version")?.isNotBlank()==true)AsyncImage(Endpoint.url("/media/${p.optString("profile_kind","producer")}/${p.optString("id")}?v=${p.optString("image_version")}"),"$name 프로필",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
 }
}
@Composable internal fun CommunityCard(song:Song,m:MusicModel,queue:List<Song>,sing:(Song)->Unit){
   Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Panel).padding(16.dp)){
    Row(Modifier.fillMaxWidth().clickable{m.openProfile(song.producerId)},verticalAlignment=Alignment.CenterVertically){
     Avatar(song.producer);Column(Modifier.weight(1f).padding(start=11.dp)){Text(song.producer,fontSize=13.sp,fontWeight=FontWeight.Bold);Text(if(song.cover)"새로운 커버곡을 불렀어요" else "새로운 음악을 만들었어요",fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=3.dp))}
     Surface(shape=RoundedCornerShape(7.dp),color=if(song.cover)Color(0xFF20383C) else Color(0xFF34252E)){Text(if(song.cover)"COVER" else "ORIGINAL",fontSize=9.sp,color=if(song.cover)Aqua else Pink,modifier=Modifier.padding(7.dp),letterSpacing=1.sp)}
    }
    if(song.description.isNotBlank())Text(song.description,fontSize=13.sp,maxLines=3,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=14.dp))
    Artwork(song,Modifier.padding(top=16.dp).fillMaxWidth().aspectRatio(1.5f).clickable{m.openSong(song)})
    Row(Modifier.padding(top=14.dp).fillMaxWidth().clickable{m.openSong(song)},verticalAlignment=Alignment.CenterVertically){
     Column(Modifier.weight(1f).padding(end=12.dp)){Text(song.title,fontSize=18.sp,fontWeight=FontWeight.SemiBold,maxLines=2);Text(song.credit,fontSize=12.sp,color=Muted,maxLines=1,modifier=Modifier.padding(top=5.dp))}
     FilledIconButton(onClick={m.play(song,queue)},colors=IconButtonDefaults.filledIconButtonColors(containerColor=Pink,contentColor=Ink)){Icon(Icons.Rounded.PlayArrow,"커뮤니티 곡 재생")}
    }
    Row(Modifier.fillMaxWidth().padding(top=8.dp),verticalAlignment=Alignment.CenterVertically){
     TextButton(onClick={m.like(song)},contentPadding=PaddingValues(8.dp),enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",Modifier.size(18.dp),tint=if(m.likes.any{it.id==song.id})Pink else Muted);Text(" ${song.likes}",color=Muted,fontSize=12.sp)}
     TextButton(onClick={m.openSong(song)},contentPadding=PaddingValues(8.dp)){Icon(Icons.AutoMirrored.Rounded.Chat,"댓글",Modifier.size(18.dp),tint=Muted);Text(" ${song.comments}",color=Muted,fontSize=12.sp)}
     Spacer(Modifier.weight(1f));Icon(Icons.Rounded.Headphones,null,Modifier.size(13.dp),tint=Muted);Text(" ${song.plays}",fontSize=11.sp,color=Muted)
    }
    if(song.cover){
     Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
      TextButton(onClick={m.openOriginal(song)}){Icon(Icons.Rounded.Album,null,Modifier.size(16.dp));Text("원곡 듣기",fontSize=12.sp,modifier=Modifier.padding(start=5.dp))}
      m.singable.find{it.id==song.raw.optString("original_id")}?.let{original->TextButton(onClick={sing(original)}){Icon(Icons.Rounded.Mic,null,Modifier.size(16.dp));Text("나도 부르기",fontSize=12.sp,modifier=Modifier.padding(start=5.dp))}}
     }
    }else if(song.raw.optInt("accepts_covers")==1)TextButton(onClick={m.openCovers(song)}){Icon(Icons.Rounded.PeopleOutline,null,Modifier.size(16.dp));Text("이 곡의 다른 목소리",fontSize=12.sp,modifier=Modifier.padding(start=6.dp))}
   }
}
@Composable private fun CommunityScreen(m:MusicModel,sing:(Song)->Unit){
 val filter=m.feedFilter
 LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,26.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
  item{Heading("음악으로, 우리","같은 노래, 다른 목소리. 듣다 보면 더 재밌어져요.");Chips(listOf("전체","팔로잉","커버곡","제작곡"),filter){m.community(it)}}
  items(m.feed,key={it.id}){song->
   CommunityCard(song,m,m.feed,sing)
  }
  if(m.feed.isEmpty())item{Empty(if(m.loading)"음악을 불러오고 있어요" else if(filter=="팔로잉")"아직 새 소식이 없어요" else "첫 번째 무대를 기다려요",if(filter=="팔로잉")"마음에 드는 프로필을 팔로우해보세요." else "커버곡이나 제작곡을 공개하면 여기에 보여요.",Icons.Rounded.PeopleOutline)}
  if(filter=="전체"&&m.people.isNotEmpty())item{
   Section("더 만나보고 싶은 음악가","프로필에서 제작곡과 커버곡을 함께 들어요")
   LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){items(m.people,key={it.getString("id")}){PersonCard(it,m)}}
  }
  if(filter=="전체"&&m.publicLists.isNotEmpty())item{
   Section("이 사람의 취향이 궁금해","함께 듣고 싶은 공개 플레이리스트");PlaylistShelf(m.publicLists,m)
  }
 }
}
@Composable private fun MiniPlayer(m:MusicModel,song:Song){
 Column(Modifier.fillMaxWidth().background(Color(0xFF202127))){
  Row(Modifier.fillMaxWidth().clickable{m.fullPlayer=true}.padding(start=12.dp,end=2.dp,top=8.dp,bottom=8.dp),verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(44.dp));Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(song.title,maxLines=1,fontSize=13.sp,fontWeight=FontWeight.SemiBold,overflow=TextOverflow.Ellipsis);Text(song.credit,maxLines=1,fontSize=10.sp,color=Muted,modifier=Modifier.padding(top=4.dp))}
   IconButton(onClick=m::toggle){if(m.buffering)CircularProgressIndicator(Modifier.size(20.dp),strokeWidth=2.dp,color=Pink) else Icon(if(m.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(m.playing)"일시정지" else "재생",tint=Pink)}
   IconButton(onClick={m.controller?.seekToNextMediaItem()},enabled=m.controller?.hasNextMediaItem()==true){Icon(Icons.Rounded.SkipNext,"다음 곡",Modifier.size(22.dp))}
   IconButton(onClick=m::closePlayer){Icon(Icons.Rounded.Close,"재생바 닫기",Modifier.size(19.dp),tint=Muted)}
  }
  LinearProgressIndicator(progress={if(m.duration>0)(m.position.toFloat()/m.duration).coerceIn(0f,1f)else 0f},modifier=Modifier.fillMaxWidth().height(2.dp),color=Pink,trackColor=Stroke,drawStopIndicator={})
 }
}
@Composable private fun PlayerSheet(m:MusicModel,song:Song,save:(Song)->Unit){
 val sheet=rememberModalBottomSheetState(skipPartiallyExpanded=true)
 var seek by remember(song.id){mutableStateOf<Float?>(null)}
 LaunchedEffect(song.id){while(true){m.lyricsAt(song,m.position/1000.0);delay(500)}}
 ModalBottomSheet(onDismissRequest={m.fullPlayer=false},sheetState=sheet,containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp,0.dp,24.dp,30.dp)){
   item{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("NOW PLAYING",color=Muted,fontSize=10.sp,letterSpacing=2.sp,modifier=Modifier.weight(1f));IconButton(onClick=m::closePlayer){Icon(Icons.Rounded.Close,"재생 종료",tint=Muted)}}
    Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.Center){Artwork(song,Modifier.widthIn(max=380.dp).fillMaxWidth().aspectRatio(1f))}
    Row(Modifier.fillMaxWidth().padding(top=22.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(song.title,fontSize=24.sp,fontWeight=FontWeight.Bold,maxLines=2);Text(song.credit,color=Muted,modifier=Modifier.padding(top=7.dp))};IconButton(onClick={m.like(song)},enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",tint=Pink)}}
    Slider(value=seek?:m.position.toFloat(),onValueChange={seek=it},onValueChangeFinished={seek?.let{m.controller?.seekTo(it.toLong())};seek=null},valueRange=0f..m.duration.coerceAtLeast(1).toFloat(),modifier=Modifier.fillMaxWidth().padding(top=15.dp))
    Row(Modifier.fillMaxWidth()){Text(timeLabel((seek?:m.position.toFloat()).toLong()),fontSize=11.sp,color=Muted);Spacer(Modifier.weight(1f));Text(timeLabel(m.duration),fontSize=11.sp,color=Muted)}
    Row(Modifier.fillMaxWidth().padding(vertical=18.dp),horizontalArrangement=Arrangement.SpaceEvenly,verticalAlignment=Alignment.CenterVertically){
     IconButton(onClick={m.controller?.shuffleModeEnabled=!m.shuffle}){Icon(Icons.Rounded.Shuffle,"셔플",tint=if(m.shuffle)Pink else Muted)}
     IconButton(onClick={m.controller?.seekToPreviousMediaItem()},enabled=m.controller?.hasPreviousMediaItem()==true){Icon(Icons.Rounded.SkipPrevious,"이전 곡",Modifier.size(32.dp))}
     FilledIconButton(onClick=m::toggle,modifier=Modifier.size(70.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=Pink,contentColor=Ink)){if(m.buffering)CircularProgressIndicator(Modifier.size(24.dp),color=Ink) else Icon(if(m.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(m.playing)"일시정지" else "재생",Modifier.size(38.dp))}
     IconButton(onClick={m.controller?.seekToNextMediaItem()},enabled=m.controller?.hasNextMediaItem()==true){Icon(Icons.Rounded.SkipNext,"다음 곡",Modifier.size(32.dp))}
     IconButton(onClick={m.controller?.repeatMode=when(m.repeat){Player.REPEAT_MODE_OFF->Player.REPEAT_MODE_ALL;Player.REPEAT_MODE_ALL->Player.REPEAT_MODE_ONE;else->Player.REPEAT_MODE_OFF}}){Icon(if(m.repeat==Player.REPEAT_MODE_ONE)Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,"반복",tint=if(m.repeat!=Player.REPEAT_MODE_OFF)Pink else Muted)}
    }
    m.playerError?.let{Text(it,color=Color(0xFFFFB4A5),fontSize=12.sp)}
    if(m.user==null)TextButton(onClick={m.showLogin=true}){Text("로그인하면 전체곡을 무료로 들을 수 있어요",fontSize=12.sp)}
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceEvenly){TextButton(onClick={save(song)}){Icon(Icons.AutoMirrored.Rounded.PlaylistAdd,null);Text("담기",Modifier.padding(start=7.dp))};TextButton(onClick={m.fullPlayer=false;m.openSong(song)}){Icon(Icons.AutoMirrored.Rounded.Chat,null);Text("댓글",Modifier.padding(start=7.dp))}}
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Panel).padding(22.dp)){
     Text("LYRICS",color=Muted,fontSize=10.sp,letterSpacing=2.sp)
     if(m.lyricRows.isNotEmpty()){
      val index=m.lyricRows.indexOfLast{it.first<=m.position/1000.0}
      val start=(index-1).coerceAtLeast(0);val end=(index+2).coerceAtLeast(2).coerceAtMost(m.lyricRows.lastIndex)
      m.lyricRows.subList(start,end+1).forEachIndexed {i,row->Text(row.second.ifBlank{"♪"},fontSize=if(start+i==index)21.sp else 15.sp,color=if(start+i==index)Pink else Muted,fontWeight=if(start+i==index)FontWeight.Bold else FontWeight.Normal,modifier=Modifier.padding(top=16.dp))}
     }else Text(m.lyric.ifBlank{"♪"},fontSize=20.sp,fontWeight=FontWeight.SemiBold,color=Pink,modifier=Modifier.padding(top=18.dp))
    }
   }
  }
 }
}
@Composable private fun LoginSheet(m:MusicModel,browser:(String)->Unit,social:(String)->Unit){
 var email by rememberSaveable{mutableStateOf("")};var password by remember{mutableStateOf("")};var name by rememberSaveable{mutableStateOf("")};var register by rememberSaveable{mutableStateOf(false)}
 ModalBottomSheet(onDismissRequest={if(!m.busy)m.showLogin=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp)){
   Text("취향이 이어지는 곳",fontSize=27.sp,fontWeight=FontWeight.Bold);Text("로그인하고 듣고, 부르고, 함께 나눠요.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=8.dp,bottom=22.dp))
   if("google" in m.providers)Button(onClick={social("google")},enabled=!m.busy,colors=ButtonDefaults.buttonColors(containerColor=Color.White,contentColor=Color(0xFF1F1F1F)),modifier=Modifier.fillMaxWidth().height(52.dp)){Text("Google로 계속하기",fontSize=14.sp)}
   if("kakao" in m.providers)Button(onClick={social("kakao")},enabled=!m.busy,colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFFEE500),contentColor=Color.Black),modifier=Modifier.fillMaxWidth().padding(top=10.dp).height(52.dp)){Icon(Icons.Rounded.ChatBubble,null,Modifier.size(18.dp));Text("카카오로 계속하기",Modifier.padding(start=8.dp),fontSize=14.sp)}
   if("apple" in m.providers)OutlinedButton(onClick={social("apple")},enabled=!m.busy,modifier=Modifier.fillMaxWidth().padding(top=10.dp).height(52.dp)){Text("Apple로 계속하기",fontSize=14.sp)}
   if(m.providers.isNotEmpty())Text("카카오톡 미설치 시와 Apple 로그인은 인증 화면을 거쳐 앱으로 돌아와요.",color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=9.dp,bottom=22.dp))
   if(m.emailEnabled){
    if(register)OutlinedTextField(name,{name=it},label={Text("닉네임")},modifier=Modifier.fillMaxWidth(),singleLine=true)
    OutlinedTextField(email,{email=it},label={Text("이메일")},modifier=Modifier.fillMaxWidth().padding(top=8.dp),singleLine=true,keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Email))
    OutlinedTextField(password,{password=it},label={Text("비밀번호 · 12자 이상")},modifier=Modifier.fillMaxWidth().padding(top=8.dp),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Password))
    Button(onClick={m.login(email,password,name,register)},enabled=!m.busy&&email.contains("@")&&password.length>=12&&(!register||name.isNotBlank()),modifier=Modifier.fillMaxWidth().padding(top=18.dp).height(50.dp)){if(m.busy)CircularProgressIndicator(Modifier.size(20.dp),color=Ink,strokeWidth=2.dp) else Text(if(register)"가입하고 시작하기" else "이메일로 로그인")}
    TextButton(onClick={register=!register},modifier=Modifier.align(Alignment.CenterHorizontally)){Text(if(register)"이미 계정이 있어요" else "이메일로 회원가입")}
   }
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center){TextButton(onClick={browser(Endpoint.url("/terms"))}){Text("이용약관",fontSize=11.sp)};TextButton(onClick={browser(Endpoint.url("/privacy"))}){Text("개인정보처리방침",fontSize=11.sp)}}
   Spacer(Modifier.height(20.dp))
  }
 }
}
@Composable private fun AccountSheet(m:MusicModel,browser:(String)->Unit,adPrivacy:()->Unit){
 ModalBottomSheet(onDismissRequest={m.showAccount=false},containerColor=Panel){
  Column(Modifier.fillMaxWidth().padding(24.dp)){
   Text(m.user?.optString("name")?:"내 계정",fontSize=25.sp,fontWeight=FontWeight.Bold);Text(m.user?.optString("email")?:"",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=8.dp,bottom=18.dp))
   listOf("이용약관" to "/terms","개인정보처리방침" to "/privacy","고객센터 · 탈퇴" to "/contact").forEach{(label,path)->TextButton(onClick={browser(Endpoint.url(path))}){Text(label)}}
   Text("무료 감상은 5곡마다 곡 사이에 광고가 표시될 수 있어요. Premium은 광고 없이 감상해요.",fontSize=12.sp,color=Muted)
   TextButton(onClick=adPrivacy){Text("광고 개인정보 설정")}
   TextButton(onClick={browser(Endpoint.url("/#studio"))}){Icon(Icons.AutoMirrored.Rounded.OpenInNew,null,Modifier.size(16.dp));Text("제작자 웹 스튜디오",modifier=Modifier.padding(start=8.dp))}
   TextButton(onClick=m::logout,enabled=!m.busy){Text("로그아웃",color=Color(0xFFFFB4A5))}
   Text("AIFECT Android ${BuildConfig.VERSION_NAME}",color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=22.dp,bottom=24.dp))
  }
 }
}
@Composable private fun SongSheet(m:MusicModel,song:Song,sing:(Song)->Unit,save:(Song)->Unit){
 var text by remember(song.id){mutableStateOf("")}
 var delete by remember(song.id) {mutableStateOf<JSONObject?>(null)}
 var report by remember(song.id) {mutableStateOf<JSONObject?>(null)}
 ModalBottomSheet(onDismissRequest={m.detail=null},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth().imePadding(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp)){
   item{
    Row(verticalAlignment=Alignment.CenterVertically){Artwork(song,Modifier.size(84.dp));Column(Modifier.weight(1f).padding(start=16.dp)){Text(song.title,fontSize=22.sp,fontWeight=FontWeight.Bold);Text(song.credit,color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=6.dp));TextButton(onClick={m.openProfile(song.producerId)},contentPadding=PaddingValues(0.dp)){Text("by ${song.producer}",fontSize=12.sp)}}}
    Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){Button(onClick={m.play(song)}){Icon(Icons.Rounded.PlayArrow,null);Text("듣기")};OutlinedButton(onClick={save(song)}){Icon(Icons.AutoMirrored.Rounded.PlaylistAdd,null);Text("담기")};IconButton(onClick={m.like(song)},enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",tint=Pink)}}
    if(song.raw.optBoolean("karaoke_ready"))OutlinedButton(onClick={sing(song)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Rounded.Mic,null);Text("이 노래 부르기",Modifier.padding(start=8.dp))}
    if(!song.cover&&(song.raw.optInt("covers")>0||song.raw.optInt("accepts_covers")==1))TextButton(onClick={m.openCovers(song)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Rounded.PeopleOutline,null);Text("다른 사람은 어떻게 불렀을까? · 커버 ${song.raw.optInt("covers")}곡",fontSize=12.sp,modifier=Modifier.padding(start=8.dp))}
    if(song.cover)Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){TextButton(onClick={m.openProfile(song.producerId,showCovers=true)},modifier=Modifier.weight(1f)){Text("${song.producer}의 커버곡",fontSize=12.sp)};OutlinedButton(onClick={m.followPerson(song.producerId)},enabled=!m.busy){Text(if(m.follows.any{it.optString("target_id")==song.producerId&&it.optString("kind")=="producer"})"팔로잉" else "팔로우",fontSize=12.sp)}}
    if(!song.cover&&song.raw.optInt("accepts_covers")==1)TextButton(onClick={m.openRanking("all",song)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Rounded.EmojiEvents,null);Text("이 곡의 좋아요 랭킹",modifier=Modifier.padding(start=8.dp))}
    if(song.cover)TextButton(onClick={m.openOriginal(song)}){Icon(Icons.Rounded.Album,null);Text("이 커버의 원곡 듣기",modifier=Modifier.padding(start=8.dp))}
    if(song.description.isNotBlank())Text(song.description,fontSize=13.sp,color=Muted,modifier=Modifier.padding(vertical=12.dp))
    Text("재생 ${song.plays} · 좋아요 ${song.likes} · 댓글 ${song.comments}",color=Muted,fontSize=11.sp,modifier=Modifier.padding(vertical=15.dp))
    HorizontalDivider(color=Stroke);Section("이 음악에 남기는 이야기")
    if(m.detailBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    if(m.user==null)TextButton(onClick={m.showLogin=true}){Text("로그인하고 첫 감상을 남겨보세요")}
    else {
     OutlinedTextField(text,{text=it.take(2000)},placeholder={Text("어떤 순간이 마음에 닿았나요?",fontSize=13.sp)},modifier=Modifier.fillMaxWidth(),minLines=2,maxLines=5,shape=RoundedCornerShape(16.dp))
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){TextButton(onClick={m.comment(text){text=""}},enabled=text.isNotBlank()&&!m.busy){Text("댓글 남기기");Icon(Icons.AutoMirrored.Rounded.Send,null,Modifier.size(17.dp).padding(start=4.dp))}}
    }
   }
   items(m.comments,key={it.getString("id")}){c->
    Row(Modifier.fillMaxWidth().padding(vertical=12.dp),verticalAlignment=Alignment.Top){
     Avatar(c.optString("name"),size=30)
     Column(Modifier.weight(1f).padding(start=11.dp)){
      Text(c.optString("name")+if(c.optInt("creator")==1)" · 업로더" else "",fontSize=12.sp,fontWeight=FontWeight.Bold)
      Text(c.optString("body"),fontSize=13.sp,color=if(c.optLong("deleted_at")>0)Muted else MaterialTheme.colorScheme.onSurface,modifier=Modifier.padding(top=7.dp))
      if(c.optLong("deleted_at")==0L)Row(verticalAlignment=Alignment.CenterVertically){
       TextButton(onClick={m.commentLike(c)},contentPadding=PaddingValues(0.dp),enabled=!m.busy){Icon(if(c.optInt("liked")==1)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"댓글 좋아요",Modifier.size(14.dp));Text(" ${c.optInt("likes")}",fontSize=11.sp)}
       if(c.optBoolean("can_delete"))TextButton(onClick={delete=c},enabled=!m.busy){Text("삭제",color=Muted,fontSize=11.sp)}
       if(c.optBoolean("can_report"))TextButton(onClick={report=c},enabled=!m.busy){Text("신고",color=Muted,fontSize=11.sp)}
       if(c.optInt("reported")==1)Text("신고됨",color=Muted,fontSize=11.sp)
      }
     }
    }
   }
   if(m.comments.isEmpty()&&!m.detailBusy)item{Text("아직 댓글이 없어요. 첫 감상을 들려주세요.",fontSize=12.sp,color=Muted,modifier=Modifier.padding(vertical=20.dp))}
  }
 }
 report?.let{c->CommentReportDialog(m,{report=null}){reason,details->m.reportComment(c,reason,details){report=null}}}
 delete?.let{c->AlertDialog(onDismissRequest={delete=null},title={Text("댓글을 삭제할까요?")},confirmButton={TextButton(onClick={m.deleteComment(c);delete=null}){Text("삭제")}},dismissButton={TextButton(onClick={delete=null}){Text("취소")}})}
}
@Composable private fun PlaylistEditor(title:String,initial:String,visible:Boolean,busy:Boolean,dismiss:()->Unit,save:(String,Boolean)->Unit){
 var name by remember{mutableStateOf(initial)};var public by remember{mutableStateOf(visible)}
 AlertDialog(onDismissRequest=dismiss,title={Text(title)},text={Column{OutlinedTextField(name,{name=it.take(80)},label={Text("플레이리스트 이름")},singleLine=true);Row(verticalAlignment=Alignment.CenterVertically){Checkbox(public,{public=it});Text("다른 사람에게 공개하기",fontSize=12.sp)}}},confirmButton={TextButton(onClick={save(name,public)},enabled=name.isNotBlank()&&!busy){Text("저장")}},dismissButton={TextButton(onClick=dismiss){Text("취소")}})
}
@Composable private fun PlaylistSheet(m:MusicModel,p:JSONObject){
 val own=p.optString("user_id")==m.user?.optString("id")
 var edit by remember{mutableStateOf(false)};var deleting by remember{mutableStateOf(false)};var add by remember{mutableStateOf(false)}
 ModalBottomSheet(onDismissRequest={m.selectedList=null},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp)){
   item{
    Icon(Icons.AutoMirrored.Rounded.QueueMusic,null,tint=Pink,modifier=Modifier.size(44.dp));Text(p.optString("name"),fontSize=28.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=14.dp));Text("${p.optString("owner_name")} · ${m.listSongs.size}곡",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=7.dp))
    Row(Modifier.fillMaxWidth().padding(top=16.dp),horizontalArrangement=Arrangement.spacedBy(7.dp)){
     Button(onClick={m.listSongs.firstOrNull()?.let{m.play(it,m.listSongs)}},enabled=m.listSongs.isNotEmpty()){Icon(Icons.Rounded.PlayArrow,null);Text("전체 재생",fontSize=12.sp)}
     if(own){TextButton(onClick={edit=true}){Text("편집")};IconButton(onClick={deleting=true}){Icon(Icons.Rounded.DeleteOutline,"플레이리스트 삭제",tint=Muted)}}
     else OutlinedButton(onClick=m::saveList,enabled=!m.busy){Text(if(p.optInt("saved")==1)"보관함에서 빼기" else "보관함 저장",fontSize=12.sp)}
    }
    if(p.optBoolean("locked"))Text("현재 요금제의 플레이리스트 한도를 넘었어요. 보관함을 정리해주세요.",color=Violet,fontSize=12.sp,modifier=Modifier.padding(vertical=12.dp))
    if(own)TextButton(onClick={add=!add}){Icon(Icons.Rounded.Add,null);Text(if(add)"곡 선택 닫기" else "곡 추가")}
   }
   if(add){
    val candidates=(m.likes+m.home).distinctBy{it.id}.filterNot{t->m.listSongs.any{it.id==t.id}}
    items(candidates,key={"add-"+it.id}){song->SongRow(song,m,candidates){IconButton(onClick={m.addToList(p.getString("id"),song)},enabled=!m.busy){Icon(Icons.Rounded.Add,"곡 추가",tint=Pink)}}}
    if(candidates.isEmpty())item{Text("추가할 음악이 없어요. 듣기에서 곡을 찾아 담아보세요.",fontSize=12.sp,color=Muted)}
   }else {
    itemsIndexed(m.listSongs,key={_,s->s.id}){index,song->
     Column{SongRow(song,m,m.listSongs);if(own)Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
      TextButton(onClick={m.moveSong(index,-1)},enabled=index>0&&!m.busy){Icon(Icons.Rounded.KeyboardArrowUp,null,Modifier.size(16.dp));Text("위로",fontSize=11.sp)}
      TextButton(onClick={m.moveSong(index,1)},enabled=index<m.listSongs.lastIndex&&!m.busy){Icon(Icons.Rounded.KeyboardArrowDown,null,Modifier.size(16.dp));Text("아래로",fontSize=11.sp)}
      TextButton(onClick={m.removeFromList(song)},enabled=!m.busy){Text("빼기",fontSize=11.sp,color=Muted)}
     }}
    }
   }
   if(m.listSongs.isEmpty()&&!add)item{Empty("이 순간에 어울리는 음악을 담아요","좋아하는 곡으로 순서까지 직접 구성해보세요.",Icons.AutoMirrored.Rounded.QueueMusic)}
  }
 }
 if(edit)PlaylistEditor("플레이리스트 편집",p.optString("name"),p.optInt("is_public")==1,m.busy,{edit=false}){name,public->m.renameList(name,public);edit=false}
 if(deleting)AlertDialog(onDismissRequest={deleting=false},title={Text("플레이리스트를 삭제할까요?")},text={Text("목록과 곡 순서가 삭제돼요. 원곡과 좋아요는 그대로 남아요.")},confirmButton={TextButton(onClick={m.deleteList();deleting=false}){Text("삭제")}},dismissButton={TextButton(onClick={deleting=false}){Text("취소")}})
}
@Composable private fun ProfileSheet(m:MusicModel,p:JSONObject){
 var covers by remember(p.optString("id")){mutableStateOf(p.optBoolean("show_covers"))}
 val tracks=if(covers)m.profileCovers else m.profileSongs
 ModalBottomSheet(onDismissRequest={m.profile=null},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp)){
   item{
    Row(verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),p,68);Column(Modifier.weight(1f).padding(start=16.dp)){Text(p.optString("name"),fontSize=24.sp,fontWeight=FontWeight.Bold);Text("팔로워 ${m.profileFollowers}",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=7.dp))};OutlinedButton(onClick=m::follow,enabled=!m.busy){Text(if(m.follows.any{it.optString("target_id")==p.optString("id")})"팔로잉" else "팔로우",fontSize=12.sp)}}
    if(p.optString("bio").isNotBlank())Text(p.optString("bio"),color=Muted,fontSize=13.sp,modifier=Modifier.padding(vertical=20.dp))
    Spacer(Modifier.height(18.dp));Chips(listOf("제작곡","커버곡"),if(covers)"커버곡" else "제작곡"){covers=it=="커버곡"}
   }
   items(tracks,key={it.id}){SongRow(it,m,tracks)}
   if(tracks.isEmpty())item{Empty("아직 공개한 ${if(covers)"커버곡" else "제작곡"}이 없어요","새로운 음악이 공개되면 여기에서 만나요.")}
  }
 }
}
