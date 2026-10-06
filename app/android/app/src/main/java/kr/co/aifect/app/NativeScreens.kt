@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class,androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
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
import androidx.compose.ui.platform.testTag
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

internal val Pink=Color(0xFFEF86B6)
internal val Aqua=Color(0xFF8EDDD2)
internal val Ink=Color(0xFF10131B)
internal val Panel=Color(0xFF191E29)
internal val Muted=Color(0xFFA6ADBA)
internal val Violet=Color(0xFFD6B5ED)
internal val Stroke=Color(0xFF2B2E39)
internal val Raised=Color(0xFF242C38)
internal val SoftText=Color(0xFFCDD2DC)
private val BrandFont=FontFamily(Font(R.font.manrope_extralight,FontWeight.ExtraLight))
private fun TextStyle.readable()=copy(fontSize=(fontSize.value+1).sp)
private val ReadableTypography=Typography().run{copy(displayLarge=displayLarge.readable(),displayMedium=displayMedium.readable(),displaySmall=displaySmall.readable(),headlineLarge=headlineLarge.readable(),headlineMedium=headlineMedium.readable(),headlineSmall=headlineSmall.readable(),titleLarge=titleLarge.readable(),titleMedium=titleMedium.readable(),titleSmall=titleSmall.readable(),bodyLarge=bodyLarge.readable(),bodyMedium=bodyMedium.readable(),bodySmall=bodySmall.readable(),labelLarge=labelLarge.readable(),labelMedium=labelMedium.readable(),labelSmall=labelSmall.readable())}
private val Scheme=darkColorScheme(primary=Pink,onPrimary=Ink,primaryContainer=Color(0xFF34252E),onPrimaryContainer=Pink,background=Ink,surface=Panel,onSurface=Color(0xFFF3F6F8),surfaceVariant=Stroke,onSurfaceVariant=Muted,secondary=Aqua,onSecondary=Ink,secondaryContainer=Color(0xFF20383C),onSecondaryContainer=Aqua)

@Composable private fun BrandLockup(){
 Column(horizontalAlignment=Alignment.CenterHorizontally){
  Text("AIFECT",style=TextStyle(fontFamily=BrandFont,fontWeight=FontWeight.ExtraLight,fontSize=31.sp,letterSpacing=5.sp,brush=Brush.linearGradient(listOf(Pink,Violet,Aqua))))
 }
}

@Composable fun AifectApp(m:MusicModel,sing:(Song)->Unit,browser:(String)->Unit,social:(String)->Unit={},adPrivacy:()->Unit={},resumeDraft:(JSONObject)->Unit={}){
 MaterialTheme(colorScheme=Scheme,typography=ReadableTypography){
  val snack=remember {SnackbarHostState()}
  var listPicker by m::playlistTarget
  var createWithSong by remember {mutableStateOf<Song?>(null)}
  var createList by remember {mutableStateOf(false)}
  val pages=rememberSaveableStateHolder()
  val keyboardVisible=WindowInsets.isImeVisible
  LaunchedEffect(m.notice){m.notice?.let {snack.showSnackbar(it);m.notice=null}}
  BackHandler(m.showGifts||m.fullPlayer||m.detail!=null||m.selectedList!=null||m.profile!=null||m.showLogin||m.showAccount||m.collection!=null||m.rankOpen){
   when{m.showGifts->m.showGifts=false;m.showLogin->m.showLogin=false;m.showAccount->m.showAccount=false;m.detail!=null->m.detail=null;m.selectedList!=null->m.selectedList=null;m.profile!=null->m.dismissProfile();m.fullPlayer->m.fullPlayer=false;m.collection!=null->m.dismissCollection();else->m.dismissRanking()}
  }
  Scaffold(containerColor=Ink,snackbarHost={SnackbarHost(snack)},bottomBar={
   if(!keyboardVisible)Column {
    AnimatedVisibility(m.current!=null){m.current?.let {MiniPlayer(m,it)}}
    NavigationBar(containerColor=Ink,tonalElevation=0.dp){
     listOf(Triple(0,"홈",Icons.Rounded.Headphones),Triple(3,"커뮤니티",Icons.Rounded.People),Triple(2,"부르기",Icons.Rounded.Mic),Triple(5,"메시지",Icons.AutoMirrored.Rounded.Chat),Triple(6,"마이",Icons.Rounded.PersonOutline)).forEach {(i,name,icon)->
      NavigationBarItem(selected=m.tab==i||(m.tab==4&&i==6),onClick={m.selectTab(i)},modifier=Modifier.testTag("main-tab-$i"),icon={Icon(icon,name)},label={Text(name,fontSize=12.sp,fontWeight=FontWeight.SemiBold)},colors=NavigationBarItemDefaults.colors(selectedIconColor=if(i==2)Pink else Aqua,selectedTextColor=MaterialTheme.colorScheme.onSurface,indicatorColor=Raised,unselectedIconColor=Muted,unselectedTextColor=Muted))
     }
    }
   }
  }){padding->
   Column(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)){
    if(!keyboardVisible)Row(Modifier.fillMaxWidth().padding(horizontal=22.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
     BrandLockup()
     Spacer(Modifier.weight(1f))
     IconButton(onClick={m.selectTab(1)}){Icon(Icons.Rounded.Search,"검색",tint=Muted)}
     IconButton(onClick=m::refresh,enabled=!m.refreshing){Icon(Icons.Rounded.Refresh,"새로고침",tint=Muted)}
     Surface(onClick={if(m.user==null)m.showLogin=true else m.showAccount=true},modifier=Modifier.testTag("account-menu"),shape=CircleShape,color=Stroke){
      Box(Modifier.size(38.dp),contentAlignment=Alignment.Center){if(m.user==null)Icon(Icons.Rounded.PersonOutline,"로그인",Modifier.size(21.dp)) else Avatar(m.user?.optString("name")?:"",m.ownProfile.optJSONObject("profile")?:JSONObject().put("id",m.user?.optString("profile_id")).put("image_version",m.user?.optString("image_version")))}
     }
    }
    if(m.error!=null)Row(Modifier.fillMaxWidth().background(Color(0xFF36261E)).padding(horizontal=20.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
     Text(m.error?:"",Modifier.weight(1f),fontSize=13.sp,color=Color(0xFFFFC69C));TextButton(onClick=m::refresh){Text("재시도")}
    }
    pages.SaveableStateProvider(m.tab){when(m.tab){
     0->ListenScreen(m,sing)
     1->SearchScreen(m)
     2->SingScreen(m,sing)
     3->MusicCommunityScreen(m,sing)
     4->LibraryScreen(m,{createWithSong=null;createList=true},browser)
     5->MessagesSheet(m,embedded=true)
     6->MyMusicScreen(m,browser)
    }
    }
   }
  }
  if(m.rankOpen&&m.detail==null&&m.profile==null&&!m.fullPlayer&&!m.showLogin&&m.collection==null)CoverRankingSheet(m)
  m.collection?.let { CollectionSheet(m,it,sing) }
  if(m.showLogin)LoginSheet(m,browser,social)
  if(m.showAccount)AccountSheet(m,browser,adPrivacy)
  if(m.showAccountSettings)AccountSettingsSheet(m)
  if(m.showBilling)PlayBillingSheet(m)
  if(m.showRecordingDrafts)RecordingDraftsSheet(m,resumeDraft)
  m.detail?.let { SongSheet(m,it,sing,{listPicker=it}) }
  m.selectedList?.let { PlaylistSheet(m,it) }
  if(m.detail==null&&!m.fullPlayer)m.profile?.let { p->pages.SaveableStateProvider("profile:"+p.optString("id")){ProfileSheet(m,p)} }
  if(m.fullPlayer)m.current?.let { PlayerSheet(m,it,{listPicker=it},sing) }
  if(m.showGifts)GiftSheet(m)
  if(m.showRewards)RewardsSheet(m)
  if(m.showProfileEdit)ProfileEditorSheet(m)
  if(m.showMessages)MessagesSheet(m)
  listPicker?.let { song->
   ModalBottomSheet(onDismissRequest={listPicker=null},containerColor=Panel){
    Column(Modifier.fillMaxWidth().padding(24.dp)){
     Text("플레이리스트에 담기",fontSize=23.sp,fontWeight=FontWeight.Bold);Text(song.title,color=Muted,modifier=Modifier.padding(vertical=8.dp))
     if(m.user==null)Button(onClick={listPicker=null;m.showLogin=true}){Text("로그인하고 저장하기")}
     else {
      m.playlists.filter {it.optString("user_id")==m.user?.optString("id")}.forEach {p->TextButton(onClick={m.addToList(p.getString("id"),song);listPicker=null},enabled=!m.busy,modifier=Modifier.fillMaxWidth()){Icon(Icons.AutoMirrored.Rounded.QueueMusic,null);Spacer(Modifier.width(10.dp));Text(p.optString("name"),Modifier.weight(1f));Text("${p.optInt("tracks")}곡")}}
      TextButton(onClick={createWithSong=song;listPicker=null;createList=true}){Icon(Icons.Rounded.Add,null);Text("새 플레이리스트")}
     };Spacer(Modifier.height(30.dp))
    }
   }
  }
  if(createList)PlaylistEditor("새 플레이리스트","",false,m.busy,{createList=false}){name,public->m.createList(name,public,createWithSong){createList=false;createWithSong=null}}
 }
}
@Composable internal fun Heading(title:String,subtitle:String?=null){
 Column(Modifier.padding(top=12.dp,bottom=20.dp)){
  Text(title,fontSize=31.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1).sp)
  if(subtitle!=null)Text(subtitle,color=Muted,fontSize=14.sp,modifier=Modifier.padding(top=8.dp))
 }
}
@Composable internal fun Section(title:String,subtitle:String?=null,action:String?=null,onAction:()->Unit={}){
 Row(Modifier.fillMaxWidth().padding(top=26.dp,bottom=14.dp),verticalAlignment=Alignment.CenterVertically){
  Column(Modifier.weight(1f)){Text(title,fontSize=21.sp,fontWeight=FontWeight.Bold);subtitle?.let {Text(it,color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=5.dp))}}
  action?.let {TextButton(onClick=onAction,colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text(it,fontSize=13.sp)}}
 }
}
@Composable internal fun Artwork(song:Song,modifier:Modifier=Modifier){
 Box(modifier.clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(Color(0xFF2A313E),Color(0xFF23343B)))),contentAlignment=Alignment.Center){
  Icon(if(song.cover)Icons.Rounded.Mic else Icons.Rounded.MusicNote,null,tint=SoftText.copy(alpha=.45f),modifier=Modifier.fillMaxSize(.4f))
  song.art?.let {AsyncImage(it,contentDescription="${song.title} 앨범 표지",modifier=Modifier.fillMaxSize(),contentScale=ContentScale.Crop)}
 }
}
@Composable internal fun neutralChipColors()=FilterChipDefaults.filterChipColors(selectedContainerColor=Raised,selectedLabelColor=MaterialTheme.colorScheme.onSurface)
internal fun neutralChipBorder(selected:Boolean)=BorderStroke(1.dp,if(selected)Aqua.copy(alpha=.55f)else Stroke)
@Composable internal fun Chips(items:List<String>,selected:String,onSelect:(String)->Unit){
 LazyRow(Modifier.testTag("chips-"+items.firstOrNull()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
  items(items){label->FilterChip(selected==label,{onSelect(label)},label={Text(label,fontSize=13.sp)},shape=RoundedCornerShape(24.dp),colors=neutralChipColors(),border=neutralChipBorder(selected==label))}
 }
}
@Composable internal fun Empty(title:String,subtitle:String,icon:ImageVector=Icons.Rounded.MusicNote){
 Column(Modifier.fillMaxWidth().padding(vertical=44.dp,horizontal=16.dp),horizontalAlignment=Alignment.CenterHorizontally){
  Icon(icon,null,tint=Muted,modifier=Modifier.size(40.dp));Text(title,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=16.dp));Text(subtitle,color=Muted,fontSize=14.sp,modifier=Modifier.padding(top=7.dp))
 }
}
@Composable internal fun SongRow(song:Song,m:MusicModel,queue:List<Song>,trailing:(@Composable ()->Unit)?=null){
 Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable {m.openSong(song)}.padding(vertical=9.dp),verticalAlignment=Alignment.CenterVertically){
  Box(Modifier.size(58.dp).clickable{m.play(song,queue)}){Artwork(song,Modifier.fillMaxSize());if(m.current?.id==song.id)Box(Modifier.fillMaxSize().background(Ink.copy(alpha=.45f)),contentAlignment=Alignment.Center){Icon(if(m.playing)Icons.Rounded.GraphicEq else Icons.Rounded.PlayArrow,"재생",tint=Aqua)}}
  Column(Modifier.weight(1f).padding(horizontal=13.dp)){
   Text(song.title,fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
   Text(song.credit,fontSize=13.sp,color=Muted,maxLines=1,modifier=Modifier.padding(top=5.dp))
   Text(if(song.cover)"${if(song.raw.optString("cover_mode")=="duet")"듀엣" else "솔로 커버"} · ${song.plays}회 재생" else "${song.genre} · ${timeLabel((song.duration*1000).toLong())}",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=4.dp))
  }
  if(trailing!=null)trailing() else IconButton(onClick={m.play(song,queue)}){Icon(Icons.Rounded.PlayArrow,"${song.title} 재생",tint=SoftText)}
  SaveMusicButton(song,m,compact=true)
 }
}
@Composable internal fun Avatar(name:String,p:JSONObject?=null,size:Int=38){
 Box(Modifier.size(size.dp).clip(CircleShape).background(Raised),contentAlignment=Alignment.Center){
  Text(name.take(1).ifBlank{"♪"},color=SoftText,fontSize=(size*.36).sp,fontWeight=FontWeight.Bold)
  if(p?.optString("image_version")?.isNotBlank()==true)AsyncImage(Endpoint.url("/media/${p.optString("profile_kind","producer")}/${p.optString("id")}?v=${p.optString("image_version")}"),"$name 프로필",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
 }
}
@Composable internal fun CommunityCard(song:Song,m:MusicModel,queue:List<Song>,sing:(Song)->Unit){
   Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Panel).padding(16.dp)){
    Row(Modifier.fillMaxWidth().clickable{m.openProfile(song.producerId)},verticalAlignment=Alignment.CenterVertically){
     Avatar(song.producer,song.producerProfile);Column(Modifier.weight(1f).padding(start=11.dp)){Text(song.producer,fontSize=14.sp,fontWeight=FontWeight.Bold);Text(if(song.cover)"새로운 커버곡을 불렀어요" else "새로운 음악을 만들었어요",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=3.dp))}
     Surface(shape=RoundedCornerShape(7.dp),color=if(song.cover)Color(0xFF20383C) else Color(0xFF34252E)){Text(if(song.cover)if(song.raw.optString("cover_mode")=="duet")"DUET" else "COVER" else "ORIGINAL",fontSize=12.sp,color=if(song.cover)Aqua else Pink,modifier=Modifier.padding(7.dp),letterSpacing=1.sp)}
    }
    if(song.description.isNotBlank())Text(song.description,fontSize=14.sp,maxLines=3,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=14.dp))
    Artwork(song,Modifier.padding(top=16.dp).fillMaxWidth().aspectRatio(1.5f).clickable{m.openSong(song)})
    Row(Modifier.padding(top=14.dp).fillMaxWidth().clickable{m.openSong(song)},verticalAlignment=Alignment.CenterVertically){
     Column(Modifier.weight(1f).padding(end=12.dp)){Text(song.title,fontSize=19.sp,fontWeight=FontWeight.SemiBold,maxLines=2);Text(song.credit,fontSize=13.sp,color=Muted,maxLines=1,modifier=Modifier.padding(top=5.dp))}
     FilledIconButton(onClick={m.play(song,queue)},colors=IconButtonDefaults.filledIconButtonColors(containerColor=Aqua,contentColor=Ink)){Icon(Icons.Rounded.PlayArrow,"커뮤니티 곡 재생")}
    }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){SaveMusicButton(song,m)}
    Row(Modifier.fillMaxWidth().padding(top=8.dp),verticalAlignment=Alignment.CenterVertically){
     TextButton(onClick={m.like(song)},contentPadding=PaddingValues(8.dp),enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",Modifier.size(18.dp),tint=if(m.likes.any{it.id==song.id})Pink else Muted);Text(" ${song.likes}",color=Muted,fontSize=13.sp)}
     TextButton(onClick={m.openSong(song)},contentPadding=PaddingValues(8.dp)){Icon(Icons.AutoMirrored.Rounded.Chat,"댓글",Modifier.size(18.dp),tint=Muted);Text(" ${song.comments}",color=Muted,fontSize=13.sp)}
     if(song.raw.optString("user_id")!=m.user?.optString("id"))TextButton(onClick={m.openGifts(song)},contentPadding=PaddingValues(8.dp)){Text("선물",fontSize=12.sp)}
     Spacer(Modifier.weight(1f));Text("${song.plays}회",fontSize=12.sp,color=Muted)
    }
    if(song.cover&&song.raw.optInt("duet_open")==1&&song.raw.optString("user_id")!=m.user?.optString("id"))TextButton(onClick={sing(song)}){Text("이 듀엣에 참여하기")}
    if(song.cover){
     Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
      TextButton(onClick={m.openOriginal(song)}){Icon(Icons.Rounded.Album,null,Modifier.size(16.dp));Text("원곡 듣기",fontSize=13.sp,modifier=Modifier.padding(start=5.dp))}
      m.singable.find{it.id==song.raw.optString("original_id")}?.let{original->TextButton(onClick={sing(original)}){Icon(Icons.Rounded.Mic,null,Modifier.size(16.dp));Text("나도 부르기",fontSize=13.sp,modifier=Modifier.padding(start=5.dp))}}
     }
    }else if(song.raw.optInt("accepts_covers")==1)TextButton(onClick={m.openCovers(song)}){Icon(Icons.Rounded.PeopleOutline,null,Modifier.size(16.dp));Text("이 곡의 다른 목소리",fontSize=13.sp,modifier=Modifier.padding(start=6.dp))}
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
 LaunchedEffect(song.id,m.user?.optString("id"),m.membership.optLong("premium_until")){m.resetLyrics();while(true){m.lyricsAt(song,m.position/1000.0);delay(500)}}
 Column(Modifier.fillMaxWidth().background(Color(0xFF202127))){
  val line=compactLyrics(m.lyricRows,m.position/1000.0,m.lyric).first
  val lyricRowHeight=with(androidx.compose.ui.platform.LocalDensity.current){20.sp.toDp()}+16.dp
  Box(Modifier.fillMaxWidth().height(lyricRowHeight).clickable{m.fullPlayer=true}.testTag("mini-player-lyrics").padding(horizontal=18.dp,vertical=8.dp),contentAlignment=Alignment.Center){
   Text(line,modifier=Modifier.fillMaxWidth().testTag("mini-player-current-lyric"),fontSize=13.sp,lineHeight=20.sp,color=Aqua,minLines=1,maxLines=1,softWrap=false,overflow=TextOverflow.Ellipsis,textAlign=androidx.compose.ui.text.style.TextAlign.Center,style=TextStyle(platformStyle=androidx.compose.ui.text.PlatformTextStyle(includeFontPadding=false)))
  }
  Row(Modifier.fillMaxWidth().clickable{m.fullPlayer=true}.padding(start=12.dp,end=2.dp,top=8.dp,bottom=8.dp),verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(44.dp));Column(Modifier.weight(1f).padding(horizontal=12.dp)){
    Text(song.title,maxLines=1,fontSize=14.sp,fontWeight=FontWeight.SemiBold,overflow=TextOverflow.Ellipsis)
    Row(Modifier.fillMaxWidth().padding(top=4.dp),verticalAlignment=Alignment.CenterVertically){
     Text(song.credit,maxLines=1,fontSize=12.sp,color=Muted,modifier=Modifier.weight(1f),overflow=TextOverflow.Ellipsis)
     if(m.playbackBitrateKbps>0)Text("AAC ${m.playbackBitrateKbps}",maxLines=1,fontSize=10.sp,color=Aqua,modifier=Modifier.padding(start=5.dp).testTag("mini-player-quality"))
    }
   }
   IconButton(onClick=m::toggle){if(m.buffering)CircularProgressIndicator(Modifier.size(20.dp),strokeWidth=2.dp,color=Aqua) else Icon(if(m.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(m.playing)"일시정지" else "재생",tint=Aqua)}
   IconButton(onClick={m.controller?.seekToNextMediaItem()},enabled=m.controller?.hasNextMediaItem()==true){Icon(Icons.Rounded.SkipNext,"다음 곡",Modifier.size(22.dp))}
   IconButton(onClick=m::closePlayer){Icon(Icons.Rounded.Close,"재생바 닫기",Modifier.size(19.dp),tint=Muted)}
  }
  LinearProgressIndicator(progress={if(m.duration>0)(m.position.toFloat()/m.duration).coerceIn(0f,1f)else 0f},modifier=Modifier.fillMaxWidth().height(2.dp),color=Aqua,trackColor=Stroke,drawStopIndicator={})
 }
}
@Composable private fun PlayerSheet(m:MusicModel,song:Song,save:(Song)->Unit,sing:(Song)->Unit){
 val sheet=rememberModalBottomSheetState(skipPartiallyExpanded=true)
 var seek by remember(song.id){mutableStateOf<Float?>(null)}

 ModalBottomSheet(onDismissRequest={m.fullPlayer=false},sheetState=sheet,containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp,0.dp,24.dp,30.dp)){
   item{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("NOW PLAYING",color=Muted,fontSize=12.sp,letterSpacing=2.sp,modifier=Modifier.weight(1f));IconButton(onClick=m::closePlayer){Icon(Icons.Rounded.Close,"재생 종료",tint=Muted)}}
    Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.Center){Artwork(song,Modifier.widthIn(max=380.dp).fillMaxWidth().aspectRatio(1f))}
    Row(Modifier.fillMaxWidth().padding(top=22.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(song.title,fontSize=25.sp,fontWeight=FontWeight.Bold,maxLines=2);Text(song.credit,color=Muted,modifier=Modifier.padding(top=7.dp))};IconButton(onClick={m.like(song)},enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",tint=Pink)}}
    m.playbackQualityLabel?.let{Text(it,fontSize=12.sp,color=Aqua,modifier=Modifier.padding(top=8.dp).testTag("player-quality"))}
    Slider(value=seek?:m.position.toFloat(),onValueChange={seek=it},onValueChangeFinished={seek?.let{m.controller?.seekTo(it.toLong())};seek=null},valueRange=0f..m.duration.coerceAtLeast(1).toFloat(),modifier=Modifier.fillMaxWidth().padding(top=15.dp),colors=SliderDefaults.colors(thumbColor=Aqua,activeTrackColor=Aqua,inactiveTrackColor=Stroke))
    Row(Modifier.fillMaxWidth()){Text(timeLabel((seek?:m.position.toFloat()).toLong()),fontSize=12.sp,color=Muted);Spacer(Modifier.weight(1f));Text(timeLabel(m.duration),fontSize=12.sp,color=Muted)}
    Row(Modifier.fillMaxWidth().padding(vertical=18.dp),horizontalArrangement=Arrangement.SpaceEvenly,verticalAlignment=Alignment.CenterVertically){
     IconButton(onClick={m.controller?.shuffleModeEnabled=!m.shuffle}){Icon(Icons.Rounded.Shuffle,"셔플",tint=if(m.shuffle)Aqua else Muted)}
     IconButton(onClick={m.controller?.seekToPreviousMediaItem()},enabled=m.controller?.hasPreviousMediaItem()==true){Icon(Icons.Rounded.SkipPrevious,"이전 곡",Modifier.size(32.dp))}
     FilledIconButton(onClick=m::toggle,modifier=Modifier.size(70.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=Aqua,contentColor=Ink)){if(m.buffering)CircularProgressIndicator(Modifier.size(24.dp),color=Ink) else Icon(if(m.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(m.playing)"일시정지" else "재생",Modifier.size(38.dp))}
     IconButton(onClick={m.controller?.seekToNextMediaItem()},enabled=m.controller?.hasNextMediaItem()==true){Icon(Icons.Rounded.SkipNext,"다음 곡",Modifier.size(32.dp))}
     IconButton(onClick={m.controller?.repeatMode=when(m.repeat){Player.REPEAT_MODE_OFF->Player.REPEAT_MODE_ALL;Player.REPEAT_MODE_ALL->Player.REPEAT_MODE_ONE;else->Player.REPEAT_MODE_OFF}}){Icon(if(m.repeat==Player.REPEAT_MODE_ONE)Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,"반복",tint=if(m.repeat!=Player.REPEAT_MODE_OFF)Aqua else Muted)}
    }
    m.playerError?.let{Text(it,color=Color(0xFFFFB4A5),fontSize=13.sp)}
    if(m.user==null)TextButton(onClick={m.showLogin=true}){Text("로그인하면 전체곡을 무료로 들을 수 있어요",fontSize=13.sp)}
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceEvenly){TextButton(onClick={save(song)},colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Icon(Icons.AutoMirrored.Rounded.PlaylistAdd,null);Text("담기",Modifier.padding(start=7.dp))};TextButton(onClick={m.singTarget(song,sing)}){Icon(Icons.Rounded.Mic,null);Text("부르기",Modifier.padding(start=5.dp))};TextButton(onClick={m.fullPlayer=false;m.openSong(song)},colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Icon(Icons.AutoMirrored.Rounded.Chat,null);Text("댓글",Modifier.padding(start=7.dp))}}
    GiftEntry(m,song)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Panel).padding(22.dp)){
     Text("LYRICS",color=Muted,fontSize=12.sp,letterSpacing=2.sp)
     if(m.lyricRows.isNotEmpty()){
      val index=m.lyricRows.indexOfLast{it.first<=m.position/1000.0}
      val start=(index-1).coerceAtLeast(0);val end=(index+1).coerceAtLeast(2).coerceAtMost(m.lyricRows.lastIndex)
      m.lyricRows.subList(start,end+1).forEachIndexed {i,row->Text(row.second.ifBlank{"♪"},fontSize=if(start+i==index)21.sp else 15.sp,color=if(start+i==index)Aqua else Muted,fontWeight=if(start+i==index)FontWeight.Bold else FontWeight.Normal,modifier=Modifier.padding(top=16.dp))}
     }else Text(m.lyric.ifBlank{"♪"},fontSize=21.sp,fontWeight=FontWeight.SemiBold,color=Aqua,modifier=Modifier.padding(top=18.dp))
    }
   }
  }
 }
}
@Composable private fun LoginSheet(m:MusicModel,browser:(String)->Unit,social:(String)->Unit){
 var email by rememberSaveable{mutableStateOf("")};var password by remember{mutableStateOf("")};var name by rememberSaveable{mutableStateOf("")};var register by rememberSaveable{mutableStateOf(false)}
 ModalBottomSheet(onDismissRequest={if(!m.busy)m.showLogin=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp)){
   Text("취향이 이어지는 곳",fontSize=28.sp,fontWeight=FontWeight.Bold);Text("로그인하고 듣고, 부르고, 함께 나눠요.",color=Muted,fontSize=14.sp,modifier=Modifier.padding(top=8.dp,bottom=22.dp))
   if("google" in m.providers)Button(onClick={social("google")},enabled=!m.busy,colors=ButtonDefaults.buttonColors(containerColor=Color.White,contentColor=Color(0xFF1F1F1F)),modifier=Modifier.fillMaxWidth().height(52.dp)){Text("Google로 계속하기",fontSize=15.sp)}
   if("kakao" in m.providers)Button(onClick={social("kakao")},enabled=!m.busy,colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFFEE500),contentColor=Color.Black),modifier=Modifier.fillMaxWidth().padding(top=10.dp).height(52.dp)){Icon(Icons.Rounded.ChatBubble,null,Modifier.size(18.dp));Text("카카오로 계속하기",Modifier.padding(start=8.dp),fontSize=15.sp)}
   if("apple" in m.providers)OutlinedButton(onClick={social("apple")},enabled=!m.busy,modifier=Modifier.fillMaxWidth().padding(top=10.dp).height(52.dp)){Text("Apple로 계속하기",fontSize=15.sp)}
   if(m.providers.isNotEmpty())Text("카카오톡 미설치 시와 Apple 로그인은 인증 화면을 거쳐 앱으로 돌아와요.",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=9.dp,bottom=22.dp))
   if(m.emailEnabled){
    if(register)OutlinedTextField(name,{name=it},label={Text("닉네임")},modifier=Modifier.fillMaxWidth(),singleLine=true)
    OutlinedTextField(email,{email=it},label={Text("이메일")},modifier=Modifier.fillMaxWidth().padding(top=8.dp),singleLine=true,keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Email))
    OutlinedTextField(password,{password=it},label={Text("비밀번호 · 12자 이상")},modifier=Modifier.fillMaxWidth().padding(top=8.dp),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Password))
    Button(onClick={m.login(email,password,name,register)},enabled=!m.busy&&email.contains("@")&&password.length>=12&&(!register||name.isNotBlank()),modifier=Modifier.fillMaxWidth().padding(top=18.dp).height(50.dp)){if(m.busy)CircularProgressIndicator(Modifier.size(20.dp),color=Ink,strokeWidth=2.dp) else Text(if(register)"가입하고 시작하기" else "이메일로 로그인")}
    TextButton(onClick={register=!register},modifier=Modifier.align(Alignment.CenterHorizontally)){Text(if(register)"이미 계정이 있어요" else "이메일로 회원가입")}
   }
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center){TextButton(onClick={browser(Endpoint.url("/terms"))}){Text("이용약관",fontSize=12.sp)};TextButton(onClick={browser(Endpoint.url("/privacy"))}){Text("개인정보처리방침",fontSize=12.sp)}}
   Spacer(Modifier.height(20.dp))
  }
 }
}
@Composable private fun AccountSheet(m:MusicModel,browser:(String)->Unit,adPrivacy:()->Unit){
 var information by remember{mutableStateOf(false)}
 fun open(path:String){m.showAccount=false;browser(Endpoint.url(path))}
 ModalBottomSheet(onDismissRequest={m.showAccount=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  Column(Modifier.fillMaxWidth().heightIn(max=600.dp).verticalScroll(rememberScrollState()).padding(horizontal=22.dp).padding(bottom=24.dp).testTag("account-actions")){
   Row(Modifier.padding(bottom=20.dp),verticalAlignment=Alignment.CenterVertically){
    Avatar(m.user?.optString("name")?:"",m.ownProfile.optJSONObject("profile"),52)
    Column(Modifier.weight(1f).padding(start=14.dp)){
     Text(m.user?.optString("name")?:"내 계정",fontSize=22.sp,fontWeight=FontWeight.Bold)
     val premium=m.membership.optLong("premium_until")>System.currentTimeMillis()/1000
     Text(if(premium)"Premium 회원" else "무료 회원",fontSize=13.sp,color=if(premium)Pink else Muted,modifier=Modifier.padding(top=4.dp))
    }
   }
   AccountMenuRow("계정 설정",Icons.Rounded.ManageAccounts){m.openAccountSettings()}
   AccountMenuRow("Premium · 골드 구매",Icons.Rounded.ShoppingBag){m.showAccount=false;m.showBilling=true}
   AccountMenuRow("DM 보기",Icons.AutoMirrored.Rounded.Chat){m.showAccount=false;m.openMessages()}
   AccountMenuRow("내 정산",Icons.Rounded.AccountBalanceWallet){open("/#payouts")}
   AccountMenuRow("오늘의 응원별",Icons.Rounded.Star){m.showAccount=false;m.showRewards=true}
   AccountMenuRow("창작자 스튜디오",Icons.Rounded.Tune){open("/#studio")}
   AccountMenuRow("선물함",Icons.Rounded.CardGiftcard,tint=Pink){m.showAccount=false;m.openGifts()}
   HorizontalDivider(Modifier.padding(vertical=12.dp),color=Stroke)
   AccountMenuRow("로그아웃",Icons.AutoMirrored.Rounded.Logout,tint=Color(0xFFFFB4A5),enabled=!m.busy){m.logout()}
   TextButton(onClick={information=!information},modifier=Modifier.fillMaxWidth()){
    Text("이용 안내",color=Muted);Spacer(Modifier.weight(1f));Icon(if(information)Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,null,tint=Muted)
   }
   if(information){
    Text("제작곡은 무료 월 5곡 · Premium 월 20곡, 커버곡은 업로드 제한이 없어요. 무료회원은 5곡 감상 후와 커버 업로드 완료 후 광고가 표시될 수 있어요. Premium은 광고가 없어요.",fontSize=13.sp,color=Muted)
    listOf("이용약관" to "/terms","개인정보처리방침" to "/privacy","고객센터 · 탈퇴" to "/contact").forEach{(label,path)->TextButton(onClick={open(path)}){Text(label)}}
    TextButton(onClick={m.showAccount=false;adPrivacy()}){Text("광고 개인정보 설정")}
   }
   Text("AIFECT ${BuildConfig.VERSION_NAME}",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=12.dp))
  }
 }
}

@Composable private fun AccountSettingsSheet(m:MusicModel){
 var name by rememberSaveable{mutableStateOf(m.user?.optString("name")?:"")}
 var current by remember{mutableStateOf("")};var next by remember{mutableStateOf("")};var confirm by remember{mutableStateOf("")};var passwordOpen by rememberSaveable{mutableStateOf(false)}
 ModalBottomSheet(onDismissRequest={m.showAccountSettings=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(22.dp).testTag("account-settings")){
   Text("계정 설정",fontSize=22.sp,fontWeight=FontWeight.Bold)
   val pushContext=androidx.compose.ui.platform.LocalContext.current
   Text("푸시 알림",fontSize=18.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=18.dp))
   listOf("dm" to "메시지", "comment" to "댓글", "gift" to "선물").forEach{(kind,label)->
    var enabled by remember(kind){mutableStateOf(PushNotifications.enabled(pushContext,kind))}
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text(label,Modifier.weight(1f));Switch(enabled,{enabled=it;PushNotifications.setEnabled(pushContext,kind,it)})}
   }
   TextButton(onClick={pushContext.startActivity(android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,pushContext.packageName))}){Text("휴대폰 알림 설정")}
   val email=m.user?.optString("email")?:""
   OutlinedTextField(if(email.endsWith(".invalid"))"소셜 로그인 계정" else email,{},label={Text("이메일 · 확인용")},readOnly=true,modifier=Modifier.fillMaxWidth().padding(top=18.dp),singleLine=true)
   Text("이메일은 이 화면에서 변경할 수 없어요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=6.dp))
   OutlinedTextField(name,{name=it.take(60);m.nicknameCheck=null;m.accountError=null},label={Text("아이디 · 활동명")},modifier=Modifier.fillMaxWidth().padding(top=18.dp),singleLine=true)
   Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
    OutlinedButton(onClick={m.checkNickname(name)},enabled=!m.busy&&name.isNotBlank(),modifier=Modifier.weight(1f)){Text("중복 확인")}
    Button(onClick={m.saveNickname(name)},enabled=!m.busy&&name.isNotBlank(),modifier=Modifier.weight(1f)){Text("아이디 저장")}
   }
   m.nicknameCheck?.let{Text(it,fontSize=13.sp,color=Pink,modifier=Modifier.padding(top=8.dp))}
   HorizontalDivider(Modifier.padding(vertical=22.dp),color=Stroke)
   if(m.user?.optString("provider")=="email"){
    TextButton(onClick={passwordOpen=!passwordOpen}){Text("비밀번호 변경");Icon(if(passwordOpen)Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,null)}
    if(passwordOpen){
     listOf(Triple("현재 비밀번호",current,0),Triple("새 비밀번호 · 12자 이상",next,1),Triple("새 비밀번호 확인",confirm,2)).forEach{(label,value,index)->
      OutlinedTextField(value,{when(index){0->current=it;1->next=it;else->confirm=it};m.accountError=null},label={Text(label)},modifier=Modifier.fillMaxWidth().padding(top=12.dp),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Password))
     }
     Text("변경하면 다른 기기의 로그인은 해제돼요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=12.dp))
     Button(onClick={if(next!=confirm)m.accountError="새 비밀번호 확인이 일치하지 않습니다." else m.changePassword(current,next){current="";next="";confirm="";passwordOpen=false}},enabled=!m.busy&&current.isNotBlank()&&next.length in 12..128&&confirm.isNotBlank(),modifier=Modifier.fillMaxWidth().padding(top=14.dp)){Text("비밀번호 저장")}
    }
   }else Text("소셜 로그인 계정의 비밀번호는 Google·카카오·Apple에서 변경해주세요.",fontSize=14.sp,color=Muted)
   m.accountError?.let{Text(it,color=Color(0xFFFFB4A5),modifier=Modifier.padding(top=12.dp))}
   if(m.busy)LinearProgressIndicator(Modifier.fillMaxWidth().padding(top=16.dp))
   Spacer(Modifier.height(24.dp))
  }
 }
}

@Composable private fun AccountMenuRow(label:String,icon:ImageVector,tint:Color=SoftText,enabled:Boolean=true,onClick:()->Unit){
 Surface(onClick=onClick,enabled=enabled,color=Panel,shape=RoundedCornerShape(12.dp),modifier=Modifier.fillMaxWidth().testTag("account-$label")){
  Row(Modifier.padding(horizontal=12.dp,vertical=14.dp),verticalAlignment=Alignment.CenterVertically){
   Icon(icon,null,Modifier.size(23.dp),tint=tint)
   Text(label,fontSize=16.sp,modifier=Modifier.weight(1f).padding(horizontal=14.dp),color=if(enabled)MaterialTheme.colorScheme.onSurface else Muted)
   Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
  }
 }
}
@Composable private fun SongSheet(m:MusicModel,song:Song,sing:(Song)->Unit,save:(Song)->Unit){
 var text by remember(song.id){mutableStateOf("")}
 var reply by remember(song.id){mutableStateOf<JSONObject?>(null)}
 var delete by remember(song.id) {mutableStateOf<JSONObject?>(null)}
 var report by remember(song.id) {mutableStateOf<JSONObject?>(null)}
 ModalBottomSheet(onDismissRequest={m.detail=null},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth().imePadding(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp)){
   item{
    Row(verticalAlignment=Alignment.CenterVertically){Artwork(song,Modifier.size(84.dp));Column(Modifier.weight(1f).padding(start=16.dp)){Text(song.title,fontSize=23.sp,fontWeight=FontWeight.Bold);Text(song.credit,color=Muted,fontSize=14.sp,modifier=Modifier.padding(top=6.dp).clickable{if(song.hasAiArtist)m.openProfile(song.raw.optString("artist_id"),"artist")else m.openProfile(song.producerId)})}}
    Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){Button(onClick={m.play(song)},colors=ButtonDefaults.buttonColors(containerColor=Aqua,contentColor=Ink)){Icon(Icons.Rounded.PlayArrow,null);Text("듣기")};OutlinedButton(onClick={save(song)},colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText)){Icon(Icons.AutoMirrored.Rounded.PlaylistAdd,null);Text("담기")};IconButton(onClick={m.like(song)},enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",tint=Pink)}}
    if(song.raw.optBoolean("karaoke_ready"))OutlinedButton(onClick={sing(song)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Rounded.Mic,null);Text("이 노래 부르기",Modifier.padding(start=8.dp))}
    if(!song.cover&&(song.raw.optInt("covers")>0||song.raw.optInt("accepts_covers")==1))TextButton(onClick={m.openCovers(song)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Rounded.PeopleOutline,null);Text("다른 사람은 어떻게 불렀을까? · 커버 ${song.raw.optInt("covers")}곡",fontSize=13.sp,modifier=Modifier.padding(start=8.dp))}
    if(song.cover&&song.raw.optInt("duet_open")==1&&song.raw.optString("user_id")!=m.user?.optString("id"))Button(onClick={sing(song)},modifier=Modifier.fillMaxWidth()){Text("듀엣 참여")}
    if(song.cover)Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){TextButton(onClick={m.openProfile(song.producerId,showCovers=true)},modifier=Modifier.weight(1f)){Text("${song.producer}의 커버곡",fontSize=13.sp)};OutlinedButton(onClick={m.followPerson(song.producerId)},enabled=!m.busy){Text(if(m.follows.any{it.optString("target_id")==song.producerId&&it.optString("kind")=="producer"})"팔로잉" else "팔로우",fontSize=13.sp)}}
    if(!song.cover&&song.raw.optInt("accepts_covers")==1)TextButton(onClick={m.openRanking("all",song)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Rounded.EmojiEvents,null);Text("이 곡의 좋아요 랭킹",modifier=Modifier.padding(start=8.dp))}
    if(song.cover)TextButton(onClick={m.openOriginal(song)}){Icon(Icons.Rounded.Album,null);Text("이 커버의 원곡 듣기",modifier=Modifier.padding(start=8.dp))}
    if(song.description.isNotBlank())Text(song.description,fontSize=14.sp,color=Muted,modifier=Modifier.padding(vertical=12.dp))
    Text("재생 ${song.plays} · 좋아요 ${song.likes} · 댓글 ${song.comments}",color=Muted,fontSize=12.sp,modifier=Modifier.padding(vertical=15.dp))
    GiftEntry(m,song)
    HorizontalDivider(color=Stroke);Section("이 음악에 남기는 이야기")
    if(m.detailBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    if(m.user==null)TextButton(onClick={m.showLogin=true}){Text("로그인하고 첫 감상을 남겨보세요")}
    else {
     reply?.let{Row(verticalAlignment=Alignment.CenterVertically){Text("${it.optString("name")}님에게 답글",Modifier.weight(1f),color=Pink);TextButton(onClick={reply=null}){Text("취소")}}}
     OutlinedTextField(text,{text=it.take(2000)},placeholder={Text("어떤 순간이 마음에 닿았나요?",fontSize=14.sp)},modifier=Modifier.fillMaxWidth(),minLines=2,maxLines=5,shape=RoundedCornerShape(16.dp))
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){TextButton(onClick={m.comment(text,reply?.optString("id")){text="";reply=null}},enabled=text.isNotBlank()&&!m.busy){Text("댓글 남기기");Icon(Icons.AutoMirrored.Rounded.Send,null,Modifier.size(17.dp).padding(start=4.dp))}}
    }
   }
   items(threadedComments(m.comments),key={it.getString("id")}){c->
    Row(Modifier.fillMaxWidth().padding(start=if(!c.isNull("parent_id"))24.dp else 0.dp).padding(vertical=12.dp),verticalAlignment=Alignment.Top){
     Avatar(c.optString("name"),size=30)
     Column(Modifier.weight(1f).padding(start=11.dp)){
      Text(c.optString("name")+if(c.optInt("creator")==1)" · 업로더" else "",fontSize=13.sp,fontWeight=FontWeight.Bold)
      Text(c.optString("body"),fontSize=14.sp,color=if(c.optLong("deleted_at")>0)Muted else MaterialTheme.colorScheme.onSurface,modifier=Modifier.padding(top=7.dp))
      if(c.optLong("deleted_at")==0L)Row(verticalAlignment=Alignment.CenterVertically){
       TextButton(onClick={m.commentLike(c)},contentPadding=PaddingValues(0.dp),enabled=!m.busy){Icon(if(c.optInt("liked")==1)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"댓글 좋아요",Modifier.size(14.dp));Text(" ${c.optInt("likes")}",fontSize=12.sp)}
       TextButton(onClick={reply=if(c.isNull("parent_id"))c else m.comments.find{it.optString("id")==c.optString("parent_id")}},enabled=!m.busy){Text("답글",fontSize=13.sp)}
       if(c.optBoolean("can_delete"))TextButton(onClick={delete=c},enabled=!m.busy){Text("삭제",color=Muted,fontSize=12.sp)}
       if(c.optBoolean("can_report"))TextButton(onClick={report=c},enabled=!m.busy){Text("신고",color=Muted,fontSize=12.sp)}
       if(c.optInt("reported")==1)Text("신고됨",color=Muted,fontSize=12.sp)
      }
     }
    }
   }
   if(m.comments.isEmpty()&&!m.detailBusy)item{Text("아직 댓글이 없어요. 첫 감상을 들려주세요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(vertical=20.dp))}
  }
 }
 report?.let{c->CommentReportDialog(m,{report=null}){reason,details->m.reportComment(c,reason,details){report=null}}}
 delete?.let{c->AlertDialog(onDismissRequest={delete=null},title={Text("댓글을 삭제할까요?")},confirmButton={TextButton(onClick={m.deleteComment(c);delete=null}){Text("삭제")}},dismissButton={TextButton(onClick={delete=null}){Text("취소")}})}
}
@Composable private fun PlaylistEditor(title:String,initial:String,visible:Boolean,busy:Boolean,dismiss:()->Unit,save:(String,Boolean)->Unit){
 var name by remember{mutableStateOf(initial)};var public by remember{mutableStateOf(visible)}
 AlertDialog(onDismissRequest=dismiss,title={Text(title)},text={Column{OutlinedTextField(name,{name=it.take(80)},label={Text("플레이리스트 이름")},singleLine=true);Row(verticalAlignment=Alignment.CenterVertically){Checkbox(public,{public=it});Text("다른 사람에게 공개하기",fontSize=13.sp)}}},confirmButton={TextButton(onClick={save(name,public)},enabled=name.isNotBlank()&&!busy){Text("저장")}},dismissButton={TextButton(onClick=dismiss){Text("취소")}})
}
@Composable private fun PlaylistSheet(m:MusicModel,p:JSONObject){
 val own=p.optString("user_id")==m.user?.optString("id")
 var edit by remember{mutableStateOf(false)};var deleting by remember{mutableStateOf(false)};var add by remember{mutableStateOf(false)}
 ModalBottomSheet(onDismissRequest={m.selectedList=null},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp)){
   item{
    Icon(Icons.AutoMirrored.Rounded.QueueMusic,null,tint=Pink,modifier=Modifier.size(44.dp));Text(p.optString("name"),fontSize=29.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=14.dp));Text("${p.optString("owner_name")} · ${m.listSongs.size}곡",color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=7.dp))
    Row(Modifier.fillMaxWidth().padding(top=16.dp),horizontalArrangement=Arrangement.spacedBy(7.dp)){
     Button(onClick={m.listSongs.firstOrNull()?.let{m.play(it,m.listSongs)}},enabled=m.listSongs.isNotEmpty(),colors=ButtonDefaults.buttonColors(containerColor=Aqua,contentColor=Ink)){Icon(Icons.Rounded.PlayArrow,null);Text("전체 재생",fontSize=13.sp)}
     if(own){TextButton(onClick={edit=true}){Text("편집")};IconButton(onClick={deleting=true}){Icon(Icons.Rounded.DeleteOutline,"플레이리스트 삭제",tint=Muted)}}
     else OutlinedButton(onClick=m::saveList,enabled=!m.busy){Text(if(p.optInt("saved")==1)"보관함에서 빼기" else "보관함 저장",fontSize=13.sp)}
    }
    if(p.optBoolean("locked"))Text("현재 요금제의 플레이리스트 한도를 넘었어요. 보관함을 정리해주세요.",color=Violet,fontSize=13.sp,modifier=Modifier.padding(vertical=12.dp))
    if(own)TextButton(onClick={add=!add}){Icon(Icons.Rounded.Add,null);Text(if(add)"곡 선택 닫기" else "곡 추가")}
   }
   if(add){
    val candidates=(m.likes+m.home).distinctBy{it.id}.filterNot{t->m.listSongs.any{it.id==t.id}}
    items(candidates,key={"add-"+it.id}){song->SongRow(song,m,candidates){IconButton(onClick={m.addToList(p.getString("id"),song)},enabled=!m.busy){Icon(Icons.Rounded.Add,"곡 추가",tint=Pink)}}}
    if(candidates.isEmpty())item{Text("추가할 음악이 없어요. 듣기에서 곡을 찾아 담아보세요.",fontSize=13.sp,color=Muted)}
   }else {
    itemsIndexed(m.listSongs,key={_,s->s.id}){index,song->
     Column{SongRow(song,m,m.listSongs);if(own)Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
      TextButton(onClick={m.moveSong(index,-1)},enabled=index>0&&!m.busy){Icon(Icons.Rounded.KeyboardArrowUp,null,Modifier.size(16.dp));Text("위로",fontSize=12.sp)}
      TextButton(onClick={m.moveSong(index,1)},enabled=index<m.listSongs.lastIndex&&!m.busy){Icon(Icons.Rounded.KeyboardArrowDown,null,Modifier.size(16.dp));Text("아래로",fontSize=12.sp)}
      TextButton(onClick={m.removeFromList(song)},enabled=!m.busy){Text("빼기",fontSize=12.sp,color=Muted)}
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
 var tab by rememberSaveable(p.optString("id")){mutableStateOf(if(p.optBoolean("show_covers"))"커버" else "전체")}
 var grid by rememberSaveable(p.optString("id")){mutableStateOf(true)}
 val columns=musicGalleryColumns()
 val all=(m.profileSongs+m.profileCovers).distinctBy{it.id}
 val tracks=when(tab){"제작곡"->m.profileSongs;"커버"->m.profileCovers;"듀엣"->m.profileCovers.filter{it.raw.optString("cover_mode")=="duet"};else->all}
 ModalBottomSheet(onDismissRequest=m::dismissProfile,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth().testTag("profile-scroll"),contentPadding=PaddingValues(16.dp,0.dp,16.dp,28.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   if(m.profileLoading||m.profileError!=null)item{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text(p.optString("name").ifBlank{"프로필"},Modifier.weight(1f),fontSize=22.sp);IconButton(onClick=m::dismissProfile,modifier=Modifier.testTag("profile-close")){Icon(Icons.Rounded.Close,"프로필 닫기")}}
    if(m.profileLoading){LinearProgressIndicator(Modifier.fillMaxWidth().testTag("profile-loading"));Text("프로필을 불러오는 중이에요",color=Muted,modifier=Modifier.padding(vertical=18.dp))}
    m.profileError?.let{Text(it,color=Pink);TextButton(onClick=m::retryProfile){Text("다시 불러오기")}}
   }
   else item{MusicProfileHeader(m,p,m.profileSongs,m.profileCovers,m.profileFollowers,close=m::dismissProfile)}
   if(!m.profileLoading&&m.profileError==null){
   item{Chips(listOf("전체","제작곡","커버","듀엣"),tab){tab=it};MusicLayoutControl(tracks.size,grid,{grid=it},"profile")}
   musicGallery(tracks,m,grid,columns,"profile")
   if(tracks.isEmpty())item{Empty("이 탭에 공개된 음악이 없어요","새로운 음악이 공개되면 여기에서 만나요.")}
   }
  }
 }
}
