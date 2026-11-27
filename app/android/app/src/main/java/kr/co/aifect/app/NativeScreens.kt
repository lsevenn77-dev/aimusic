@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class,androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package kr.co.aifect.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.repeatOnLifecycle
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.em
import androidx.media3.common.Player
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

internal val Pink=Color(0xFFD6BAFF)
internal val Aqua=Color(0xFFAEEBDF)
internal val Ink=Color(0xFF0B1024)
internal val Panel=Color(0xFF1B2136)
internal val Muted=Color(0xFFA9B0C1)
internal val Violet=Color(0xFFB7B6FF)
internal val Stroke=Color(0xFFB7B6FF).copy(alpha=.32f)
internal val Raised=Color(0xFF1F1F26)
internal val SoftText=Color(0xFFCDD2DC)
// Relative leading follows each Text's explicit size instead of retaining the
// 24sp body line box for tiny captions, counters and profile metadata.
private fun TextStyle.readable()=copy(fontSize=(fontSize.value+1).sp,lineHeight=1.4.em,platformStyle=androidx.compose.ui.text.PlatformTextStyle(includeFontPadding=false))
internal val ReadableTypography=Typography().run{copy(displayLarge=displayLarge.readable(),displayMedium=displayMedium.readable(),displaySmall=displaySmall.readable(),headlineLarge=headlineLarge.readable(),headlineMedium=headlineMedium.readable(),headlineSmall=headlineSmall.readable(),titleLarge=titleLarge.readable(),titleMedium=titleMedium.readable(),titleSmall=titleSmall.readable(),bodyLarge=bodyLarge.readable(),bodyMedium=bodyMedium.readable(),bodySmall=bodySmall.readable(),labelLarge=labelLarge.readable(),labelMedium=labelMedium.readable(),labelSmall=labelSmall.readable())}
internal val Scheme=darkColorScheme(primary=Pink,onPrimary=Ink,primaryContainer=Color(0xFF302B42),onPrimaryContainer=Pink,background=Ink,surface=Panel,onSurface=Color(0xFFF5F5FC),surfaceVariant=Stroke,onSurfaceVariant=Muted,secondary=Aqua,onSecondary=Ink,secondaryContainer=Color(0xFF20383C),onSecondaryContainer=Aqua)

@Composable private fun BrandLockup(wide:Boolean=false){
 Image(painterResource(R.drawable.aifect_wordmark_vector),contentDescription="AIFECT",modifier=Modifier.width(if(wide)120.dp else 104.dp).height(if(wide)29.dp else 25.dp),contentScale=ContentScale.Fit)
}

@Composable fun AifectApp(m:MusicModel,sing:(Song)->Unit,browser:(String)->Unit,social:(String)->Unit={},adPrivacy:()->Unit={},resumeDraft:(JSONObject)->Unit={}){
 MaterialTheme(colorScheme=Scheme,typography=ReadableTypography){
  val snack=remember {SnackbarHostState()}
  var listPicker by m::playlistTarget
  var createWithSong by remember {mutableStateOf<Song?>(null)}
  var createList by remember {mutableStateOf(false)}
  var navigationOpen by remember {mutableStateOf(false)}
  var myToolsOpen by rememberSaveable(m.user?.optString("id")) {mutableStateOf(false)}
  var homeBackdrop by remember {mutableStateOf<String?>(null)}
  val pages=rememberSaveableStateHolder()
  val pageStack=remember{AppPageStack()}
  val lyricSong=m.current
  LaunchedEffect(lyricSong?.id,m.user?.optString("id"),m.membership.optLong("premium_until")){
   m.resetLyrics()
   if(lyricSong!=null&&!lyricSong.dubbing)while(true){m.lyricsAt(lyricSong,m.position/1000.0);delay(500)}
  }
  val keyboardVisible=WindowInsets.isImeVisible
  val navConfiguration=androidx.compose.ui.platform.LocalConfiguration.current
  val compactNavLabels=navConfiguration.screenWidthDp<360||navConfiguration.fontScale>1.2f
  val inboxUnread=m.unreadMessages+m.unreadActivities
  val chatLifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
  LaunchedEffect(m.user?.optString("id"),m.loading){m.unreadMessages=0;m.inboxCrew=null;if(m.user!=null&&!m.loading)chatLifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){while(true){try{m.refreshMessageSummary()}catch(e:Exception){if(e is kotlinx.coroutines.CancellationException)throw e};delay(8000)}}}
  LaunchedEffect(m.user?.optString("id"),m.loading){if(m.user!=null&&!m.loading)chatLifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){while(true){try{m.refreshActivitySummary()}catch(e:Exception){if(e is kotlinx.coroutines.CancellationException)throw e};delay(30000)}}}
  LaunchedEffect(m.notice){m.notice?.let {snack.showSnackbar(it);m.notice=null}}
  BackHandler(m.tab==4){m.leaveLibrary()}
  BackHandler(m.showGifts||m.fullPlayer||m.detail!=null||m.selectedList!=null||m.profile!=null||m.showLogin||m.showAccount||m.collection!=null||m.rankOpen){
   when{m.showGifts->m.showGifts=false;m.showLogin->m.showLogin=false;m.showAccount->m.showAccount=false;m.detail!=null->m.detail=null;m.selectedList!=null->m.selectedList=null;m.profile!=null->m.dismissProfile();m.fullPlayer->m.fullPlayer=false;m.collection!=null->m.dismissCollection();else->m.dismissRanking()}
  }
  BackHandler(m.tab==7&&!m.studioEditing&&m.detail==null&&!m.showProfileEdit&&!m.showDiamonds){m.selectTab(m.studioReturnTab)}
  AppPageScope(pageStack){
  Scaffold(containerColor=Ink,snackbarHost={SnackbarHost(snack)},bottomBar={
   if(!keyboardVisible&&!m.studioEditing)Column {
    AnimatedVisibility(!(m.tab==3&&m.communityMode=="rankings")&&m.current!=null&&m.visibleChatCount==0&&!m.fullPlayer&&m.detail==null){m.current?.let {MiniPlayer(m,it)}}
    HorizontalDivider(color=Stroke,thickness=.5.dp)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart=24.dp,topEnd=24.dp)).background(Brush.horizontalGradient(listOf(Color(0xFF181B34),Ink,Color(0xFF20213B)))).navigationBarsPadding().heightIn(min=52.dp),verticalAlignment=Alignment.CenterVertically){
     listOf(Triple(0,"홈",Icons.Outlined.Home),Triple(3,"커뮤니티",Icons.Outlined.PeopleOutline),Triple(2,"플레이",Icons.Outlined.PlayArrow),Triple(5,"메시지",Icons.Outlined.ChatBubbleOutline),Triple(6,"마이",Icons.Outlined.PersonOutline)).forEach{(i,name,icon)->
      val selected=m.tab==i||(m.tab==4&&i==m.libraryReturnTab)
      Column(Modifier.weight(1f).selectable(selected=selected,role=Role.Tab,onClick={pageStack.closeAll();m.selectTab(i)}).testTag("main-tab-$i").heightIn(min=52.dp).padding(vertical=2.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
       Box(Modifier.size(30.dp).then(if(i==2)Modifier.background(Brush.radialGradient(listOf(SoftText.copy(alpha=.16f),Ink)),CircleShape)else Modifier),contentAlignment=Alignment.Center){
        val navIcon=if(selected)when(i){0->Icons.Rounded.Home;3->Icons.Rounded.People;5->Icons.Rounded.ChatBubble;6->Icons.Rounded.Person;else->icon}else icon
        BadgedBox(badge={if(i==5&&inboxUnread>0)Badge(modifier=Modifier.testTag("inbox-nav-badge"),containerColor=StreamPurple,contentColor=Ink){Text(if(inboxUnread>99)"99+" else inboxUnread.toString(),fontSize=9.sp)}}){Icon(navIcon,name,Modifier.size(22.dp),tint=if(selected)StreamPurple else Muted)}
       }
       Text(if(compactNavLabels&&i==3)"커뮤" else name,fontSize=11.sp,lineHeight=15.sp,fontWeight=if(selected)FontWeight.Bold else FontWeight.Normal,color=if(selected)Pink else Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
       Spacer(Modifier.padding(top=1.dp).size(28.dp,2.dp).background(if(selected)Pink else Color.Transparent,CircleShape))
      }
     }
    }
   }
  }){padding->
   AppPageHost(pageStack,Modifier.padding(padding).consumeWindowInsets(padding)){
   Box(Modifier.fillMaxSize().referenceBackdrop())
   if(m.tab==0&&m.listenPage=="추천")Crossfade(homeBackdrop,animationSpec=tween(500),label="home backdrop",modifier=Modifier.fillMaxSize().testTag("home-art-ambience")){art->
    Box(Modifier.fillMaxSize()){
     art?.let{AsyncImage(it,null,Modifier.matchParentSize().blur(36.dp).alpha(.5f),contentScale=ContentScale.Crop)}
     Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Ink.copy(alpha=.35f),.5f to Ink.copy(alpha=.6f),1f to Ink)))
    }
   }
   Column(Modifier.fillMaxSize()){
    if(!keyboardVisible&&!m.studioEditing&&m.tab!=2&&m.tab!=3&&m.tab!=5)Row(Modifier.fillMaxWidth().heightIn(min=50.dp).padding(horizontal=14.dp),verticalAlignment=Alignment.CenterVertically){
     if(m.tab==6){BrandLockup();Spacer(Modifier.weight(1f));IconButton(onClick={if(m.authenticated())m.showNotifications=true}){Icon(Icons.Rounded.NotificationsNone,"알림 기록",tint=SoftText)}}
     else {
      Box(Modifier.heightIn(min=48.dp).clickable(role=androidx.compose.ui.semantics.Role.Button,onClickLabel="메뉴 열기"){navigationOpen=true}.testTag("navigation-menu"),contentAlignment=Alignment.CenterStart){BrandLockup(m.tab==0)}
      Spacer(Modifier.weight(1f))
      IconButton(onClick={if(m.authenticated())m.showNotifications=true}){BadgedBox(badge={if(m.unreadActivities>0)Badge(containerColor=StreamPurple,contentColor=Ink){Text(if(m.unreadActivities>99)"99+" else "${m.unreadActivities}",fontSize=9.sp)}}){Icon(Icons.Rounded.NotificationsNone,"알림 기록",Modifier.size(22.dp),tint=SoftText)}}
      IconButton(onClick={m.selectTab(1)}){Icon(Icons.Rounded.Search,"검색",Modifier.size(22.dp),tint=SoftText)}
     }
     if(m.tab==6)IconButton(onClick={if(m.authenticated())myToolsOpen=true},modifier=Modifier.testTag("my-settings")){
      Icon(Icons.Rounded.Settings,"계정 관리",Modifier.size(22.dp),tint=SoftText)
     }else if(m.tab!=0)IconButton(onClick={if(m.authenticated())m.showAccount=true},modifier=Modifier.testTag("account-menu")){
      Icon(Icons.Outlined.PersonOutline,if(m.user==null)"로그인" else "계정 메뉴",Modifier.size(22.dp),tint=SoftText)
     }

    }
    if(m.error!=null)Row(Modifier.fillMaxWidth().background(Color(0xFF36261E)).padding(horizontal=20.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
     Text(m.error?:"",Modifier.weight(1f),fontSize=13.sp,color=Color(0xFFFFC69C));TextButton(onClick=m::refresh){Text("재시도")}
    }
    pages.SaveableStateProvider(m.tab){when(m.tab){
     0->ListenScreen(m,sing){homeBackdrop=it}
     1->SearchScreen(m)
     2->CurrentPlayScreen(m,sing,resumeDraft)
     3->CurrentCommunityScreen(m)
     4->LibraryScreen(m,{createWithSong=null;createList=true},browser)
     5->MessagesSheet(m,embedded=true)
     6->CurrentMyScreen(m,myToolsOpen){myToolsOpen=it}
     7->CreatorStudioScreen(m)
     8->MusicDirectoryScreen(m)
    }
    }
   }
  if(navigationOpen)NavigationSheet(m,{navigationOpen=false})
  m.workspace?.let{key(m.user?.optString("id"),it.route){CurrentWorkspacePage(m,it)}}
  if(m.rankOpen&&m.detail==null&&m.profile==null&&!m.fullPlayer&&!m.showLogin&&m.collection==null)CoverRankingSheet(m)
  m.collection?.let { CollectionSheet(m,it,sing) }
  if(m.showLogin)LoginSheet(m,browser,social)
  if(m.showAccount)AccountSheet(m,browser,adPrivacy)
  if(m.showAccountSettings)AccountSettingsSheet(m)
  if(m.showShop)ItemShopPage(m)
  if(m.showBilling)PlayBillingSheet(m)
  if(m.showDiamonds)DiamondSheet(m)
  if(m.showInventory)PlayerInventorySheet(m,{m.showInventory=false}){}
  if(m.showRecordingDrafts)RecordingDraftsSheet(m,resumeDraft)
  m.detail?.let { song->key(song.id){SongSheet(m,song,sing,{listPicker=it})} }
  m.pendingTrackDelete?.let{song->AlertDialog(onDismissRequest={if(!m.busy)m.pendingTrackDelete=null},title={Text(if(song.cover)"커버곡을 삭제할까요?" else "음원을 삭제할까요?")},text={Text("${song.title}\n삭제하면 되돌릴 수 없어요.")},confirmButton={TextButton({m.deleteOwnTrack(song)},enabled=!m.busy,modifier=Modifier.testTag("delete-track-confirm")){Text("삭제")}},dismissButton={TextButton({m.pendingTrackDelete=null},enabled=!m.busy){Text("취소")}})}
  m.selectedList?.let { PlaylistSheet(m,it) }
  if(m.detail==null&&!m.fullPlayer)m.profile?.let { p->pages.SaveableStateProvider("profile:"+p.optString("id")){ProfileSheet(m,p)} }
  if(m.fullPlayer)m.current?.let { PlayerSheet(m,it,{listPicker=it},sing) }
  if(m.showNotifications)ActivitySheet(m)
  if(m.showGifts)GiftSheet(m)
  if(m.showRewards)RewardsSheet(m)
  if(m.showProfileEdit)ProfileEditorSheet(m)
  m.galleryPreview?.let{gallery->ProfileGalleryDialog(m,gallery){m.galleryPreview=null}}
  m.photoPreview?.let{photo->ProfilePhotoViewer(m,photo){m.photoPreview=null}}
  if(m.showMessages)MessagesSheet(m)
  listPicker?.let { song->
   if(song.cover&&m.user!=null)WorkPlaylistPicker(m.api,song.id,song.title,"cover",{listPicker=null}){
    m.notice="플레이리스트에 담았습니다.";m.refreshLibrary(true)
   }
   else
   AppPage(title="음악 담기",onDismissRequest={listPicker=null},containerColor=Panel){
    Column(Modifier.fillMaxWidth().padding(24.dp)){
     Text("플레이리스트에 담기",fontSize=23.sp,fontWeight=FontWeight.Bold);Text(song.title,color=Muted,modifier=Modifier.padding(vertical=8.dp))
     if(m.user==null)BrandButton(onClick={listPicker=null;m.showLogin=true}){Text("로그인하고 저장하기")}
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
  }
 }
}
@Composable internal fun Heading(title:String,subtitle:String?=null){
 Column(Modifier.fillMaxWidth().musicIllustration().padding(top=12.dp,bottom=20.dp)){
  Text(title,fontSize=22.sp,fontWeight=FontWeight.Bold,letterSpacing=(-.4).sp)
  if(subtitle!=null)Text(subtitle,color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=7.dp))
 }
}
@Composable internal fun Section(title:String,subtitle:String?=null,action:String?=null,onAction:()->Unit={}){
 Row(Modifier.fillMaxWidth().padding(top=22.dp,bottom=12.dp),verticalAlignment=Alignment.CenterVertically){
  Column(Modifier.weight(1f)){Text(title,fontSize=20.sp,fontWeight=FontWeight.Bold);subtitle?.let {Text(it,color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=5.dp))}}
  action?.let {TextButton(onClick=onAction,colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text(it,fontSize=13.sp)}}
 }
}
@Composable internal fun Artwork(song:Song,modifier:Modifier=Modifier,corner:androidx.compose.ui.unit.Dp=16.dp,imageAlignment:Alignment=Alignment.Center){
 Box(modifier.clip(RoundedCornerShape(corner)).background(Brush.linearGradient(listOf(Color(0xFF2A313E),Color(0xFF23343B)))),contentAlignment=Alignment.Center){
  Icon(if(song.cover)Icons.Rounded.Mic else Icons.Rounded.MusicNote,null,tint=SoftText.copy(alpha=.45f),modifier=Modifier.fillMaxSize(.4f))
  if(song.cover&&song.producerImageVersion.let{it.isBlank()||it=="null"})DefaultProfileArtwork(song.credit,Modifier.fillMaxSize())
  else song.art?.let {AsyncImage(it,contentDescription=if(song.cover)"${song.credit} 프로필" else "${song.title} 앨범 표지",modifier=Modifier.fillMaxSize(),contentScale=ContentScale.Crop,alignment=imageAlignment)}
 }
}
@Composable internal fun neutralChipColors()=FilterChipDefaults.filterChipColors(selectedContainerColor=Raised,selectedLabelColor=MaterialTheme.colorScheme.onSurface)
internal fun neutralChipBorder(selected:Boolean)=BorderStroke(1.dp,if(selected)Pink.copy(alpha=.7f)else Stroke)
@Composable internal fun Chips(items:List<String>,selected:String,onSelect:(String)->Unit){
 LazyRow(Modifier.testTag("chips-"+items.firstOrNull()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
  items(items){label->val active=selected==label;FilterChip(active,{onSelect(label)},label={Text(label,fontSize=13.sp)},shape=RoundedCornerShape(24.dp),colors=FilterChipDefaults.filterChipColors(selectedContainerColor=Violet,selectedLabelColor=Ink),border=if(active)null else neutralChipBorder(false))}
 }
}
@Composable internal fun Empty(title:String,subtitle:String,icon:ImageVector=Icons.Rounded.MusicNote){
 Column(Modifier.fillMaxWidth().padding(vertical=44.dp,horizontal=16.dp),horizontalAlignment=Alignment.CenterHorizontally){
  Icon(icon,null,tint=Muted,modifier=Modifier.size(40.dp));Text(title,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=16.dp));Text(subtitle,color=Muted,fontSize=14.sp,modifier=Modifier.padding(top=7.dp))
 }
}
@Composable internal fun SongRow(song:Song,m:MusicModel,queue:List<Song>,trailing:(@Composable ()->Unit)?=null){
 Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if(m.current?.id==song.id)Pink.copy(alpha=.10f)else Panel.copy(alpha=.45f)).clickable {m.openSong(song)}.padding(horizontal=8.dp,vertical=9.dp),verticalAlignment=Alignment.CenterVertically){
  Box(Modifier.size(50.dp).clickable{m.play(song,queue)}){Artwork(song,Modifier.fillMaxSize());if(m.current?.id==song.id)Box(Modifier.fillMaxSize().background(Ink.copy(alpha=.45f)),contentAlignment=Alignment.Center){Icon(if(m.playing)Icons.Rounded.GraphicEq else Icons.Rounded.PlayArrow,"재생",tint=Aqua)}}
  Column(Modifier.weight(1f).padding(horizontal=13.dp)){
   CoverPickTitle(song,m,fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
   Text(song.credit,fontSize=13.sp,color=Muted,maxLines=1,modifier=Modifier.padding(top=5.dp))
   Text("재생 ${song.plays} · 좋아요 ${song.likes} · 댓글 ${verifiedSongCommentCount(song,m)}",fontSize=10.sp,color=Muted,modifier=Modifier.padding(top=4.dp))
  }
  if(trailing!=null)trailing() else IconButton(onClick={m.play(song,queue)}){Icon(Icons.Rounded.PlayCircle,"${song.title} 재생",tint=Pink,modifier=Modifier.size(30.dp))}
  TrackActionsMenu(song,m)
 }
}
@Composable internal fun Avatar(name:String,p:JSONObject?=null,size:Int=38){
 val display=frameDisplay(p)
 val decorated=p?.optString("profile_kind")!="artist"&&(profileMediaUrl(display?.optString("overlay").orEmpty().ifBlank{p?.optString("profile_frame_artwork").orEmpty()})!=null||p?.optString("profile_frame")=="crew-outline")
 val scale=if(decorated)display?.optDouble("scale",1.26)?.toFloat()?.coerceIn(1f,1.6f)?:1.26f else 1f
 val photoSize=size/scale
 Box(Modifier.size(size.dp),contentAlignment=Alignment.Center){
 Box(Modifier.size(photoSize.dp)){
 Box(Modifier.fillMaxSize().clip(CircleShape).background(Raised),contentAlignment=Alignment.Center){
  DefaultProfileArtwork(name,Modifier.fillMaxSize())
  if(p?.optString("image_version")?.let{it.isNotBlank()&&it!="null"&&it!="0"}==true)AsyncImage(Endpoint.url("/media/${p.optString("profile_kind","producer")}/${p.optString("id")}?v=${p.optString("image_version")}"),"$name 프로필",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
 }
 PlayerAvatarDecoration(p,photoSize.toInt())
 }
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
 if(song.dubbing){
  DubbingPlaybackBar(m.controller)
  return
 }
 val shape=RoundedCornerShape(22.dp)
 val liked=m.likes.any{it.id==song.id}
 val line=compactLyrics(m.lyricRows,m.position/1000.0,m.lyric).first
 var seek by remember(song.id){mutableStateOf<Float?>(null)}
 BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal=3.dp,vertical=3.dp).testTag("mini-player")
  .clip(shape).background(Brush.linearGradient(listOf(Color(0xFF292541),Color(0xFF141529),Color(0xFF1C2537))))
  .border(1.dp,Brush.horizontalGradient(listOf(Color(0xFFDB9AFF),Violet,Aqua)),shape)){
  val actionWidth=(maxWidth*.12f).coerceIn(36.dp,48.dp)
  val actionSize=Modifier.width(actionWidth).height(44.dp)
  Column(Modifier.fillMaxWidth().padding(horizontal=9.dp,vertical=2.dp)){
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
    Row(Modifier.weight(1f).heightIn(min=40.dp).testTag("mini-player-open").clickable{m.fullPlayer=true},verticalAlignment=Alignment.CenterVertically){
     Artwork(song,Modifier.size(35.dp).testTag("mini-player-art"),corner=7.dp)
     Column(Modifier.weight(1f).padding(horizontal=8.dp)){
      if(m.isCoverPicked(song))CoverPickTitle(song,m,Modifier.fillMaxWidth().testTag("mini-player-title"),fontSize=14.sp,lineHeight=17.sp,fontWeight=FontWeight.SemiBold)
      else Text(song.title,Modifier.fillMaxWidth().testTag("mini-player-title").basicMarquee(iterations=Int.MAX_VALUE),maxLines=1,softWrap=false,fontSize=14.sp,lineHeight=17.sp,fontWeight=FontWeight.SemiBold)
      Row(verticalAlignment=Alignment.CenterVertically){
       Text(song.credit,Modifier.weight(1f,fill=false),maxLines=1,fontSize=10.sp,lineHeight=13.sp,color=Muted,overflow=TextOverflow.Ellipsis)
       if(m.playing)Icon(Icons.Rounded.Equalizer,null,Modifier.padding(start=3.dp).size(11.dp),tint=Pink)
      }
     }
    }
    Row(Modifier.testTag("mini-player-controls"),verticalAlignment=Alignment.CenterVertically){
     IconButton(onClick={m.controller?.seekToPreviousMediaItem()},enabled=m.controller?.hasPreviousMediaItem()==true,modifier=actionSize){
      Icon(Icons.Rounded.SkipPrevious,"이전 곡",Modifier.size(22.dp))
     }
     IconButton(onClick=m::toggle,modifier=actionSize){
      Box(Modifier.size(31.dp).background(BrandGradient,CircleShape),contentAlignment=Alignment.Center){
       if(m.buffering)CircularProgressIndicator(Modifier.size(15.dp),strokeWidth=2.dp,color=Ink)
       else Icon(if(m.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(m.playing)"일시정지" else "재생",Modifier.size(21.dp),tint=Ink)
      }
     }
     IconButton(onClick={m.controller?.seekToNextMediaItem()},enabled=m.controller?.hasNextMediaItem()==true,modifier=actionSize){
      Icon(Icons.Rounded.SkipNext,"다음 곡",Modifier.size(22.dp))
     }
    }
    IconButton(onClick=m::closePlayer,modifier=Modifier.size(44.dp,40.dp).testTag("mini-player-close")){
     Icon(Icons.Rounded.Close,"재생 종료",Modifier.size(21.dp),tint=SoftText)
    }
   }
   Box(Modifier.fillMaxWidth().padding(horizontal=3.dp).clip(androidx.compose.ui.graphics.RectangleShape)){
    val duration=m.duration.coerceAtLeast(1).toFloat()
    Slider(value=(seek?:m.position.toFloat()).coerceIn(0f,duration),onValueChange={seek=it},onValueChangeFinished={seek?.let{m.controller?.seekTo(it.toLong())};seek=null},enabled=m.duration>0,valueRange=0f..duration,
     modifier=Modifier.fillMaxWidth().height(9.dp).testTag("mini-player-seek"),thumb={Box(Modifier.size(7.dp).background(Color.White,CircleShape).border(1.dp,Pink,CircleShape))},track={slider->
      Box(Modifier.fillMaxWidth().height(2.dp).clip(CircleShape).background(SoftText.copy(alpha=.28f))){
       Box(Modifier.fillMaxWidth((slider.value/duration).coerceIn(0f,1f)).fillMaxHeight().background(Pink))
      }
     })
   }
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
    IconButton(onClick={m.like(song)},enabled=!m.busy,modifier=actionSize){
     Icon(if(liked)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,if(liked)"좋아요 취소" else "좋아요 추가",Modifier.size(22.dp),tint=if(liked)Pink else Color.White)
    }
    Box(Modifier.weight(1f).padding(start=5.dp,end=7.dp).testTag("mini-player-lyrics")){
     Text(line.ifBlank{"♪"},modifier=Modifier.fillMaxWidth().testTag("mini-player-current-lyric"),fontSize=12.sp,lineHeight=15.sp,color=Pink,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
    }
    val modeIcon=when{
     m.repeat==Player.REPEAT_MODE_ONE->Icons.Rounded.RepeatOne
     m.shuffle->SimpleShuffle
     m.repeat==Player.REPEAT_MODE_ALL->Icons.Rounded.Repeat
     else->Icons.AutoMirrored.Rounded.PlaylistPlay
    }
    val modeName=when{
     m.repeat==Player.REPEAT_MODE_ONE->"한 곡 반복재생"
     m.shuffle->"랜덤재생"
     m.repeat==Player.REPEAT_MODE_ALL->"전체 반복재생"
     else->"순차재생"
    }
    IconButton(onClick=m::cyclePlaybackMode,enabled=m.controller!=null,modifier=actionSize.testTag("mini-player-mode")){
     Icon(modeIcon,"재생 모드 변경, 현재 $modeName",Modifier.size(22.dp),tint=if(m.shuffle||m.repeat!=Player.REPEAT_MODE_OFF)Aqua else SoftText)
    }
    IconButton(onClick={m.pickPlaylist(song)},modifier=actionSize){
     Icon(Icons.AutoMirrored.Rounded.PlaylistAdd,"보관함에 담기",Modifier.size(24.dp))
    }
   }
  }
 }
}
@Composable private fun PlayerSheet(m:MusicModel,song:Song,save:(Song)->Unit,sing:(Song)->Unit){
 var seek by remember(song.id){mutableStateOf<Float?>(null)}
 var queueOpen by remember{mutableStateOf(false)}
 if(queueOpen)PlayerQueueSheet(m){queueOpen=false}

 AppPage(title="재생 중",onDismissRequest={m.fullPlayer=false},containerColor=Ink,backdrop={AlbumListeningBackdrop(song.art,"player-art-backdrop")}){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp,0.dp,24.dp,30.dp)){
   item{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("NOW PLAYING",color=Muted,fontSize=12.sp,letterSpacing=2.sp,modifier=Modifier.weight(1f));SongShareButton(song);IconButton(onClick={queueOpen=true},modifier=Modifier.testTag("player-queue")){Icon(Icons.AutoMirrored.Rounded.QueueMusic,"재생목록",tint=Aqua)};IconButton(onClick=m::closePlayer){Icon(Icons.Rounded.Close,"재생 종료",tint=Muted)}}
    Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.Center){Artwork(song,Modifier.widthIn(max=380.dp).fillMaxWidth().aspectRatio(1f))}
    Row(Modifier.fillMaxWidth().padding(top=22.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){CoverPickTitle(song,m,fontSize=25.sp,fontWeight=FontWeight.Bold,maxLines=2);Text(song.credit,color=Muted,modifier=Modifier.padding(top=7.dp))};IconButton(onClick={m.like(song)},enabled=!m.busy){Icon(if(m.likes.any{it.id==song.id})Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",tint=Pink)}}
    m.playbackQualityLabel?.let{Text(it,fontSize=12.sp,color=Aqua,modifier=Modifier.padding(top=8.dp).testTag("player-quality"))}
    Slider(value=seek?:m.position.toFloat(),onValueChange={seek=it},onValueChangeFinished={seek?.let{m.controller?.seekTo(it.toLong())};seek=null},valueRange=0f..m.duration.coerceAtLeast(1).toFloat(),modifier=Modifier.fillMaxWidth().padding(top=15.dp),colors=SliderDefaults.colors(thumbColor=Color.White,activeTrackColor=Aqua,inactiveTrackColor=Stroke))
    Row(Modifier.fillMaxWidth()){Text(timeLabel((seek?:m.position.toFloat()).toLong()),fontSize=12.sp,color=Muted);Spacer(Modifier.weight(1f));Text(timeLabel(m.duration),fontSize=12.sp,color=Muted)}
    Row(Modifier.fillMaxWidth().padding(vertical=18.dp),horizontalArrangement=Arrangement.SpaceEvenly,verticalAlignment=Alignment.CenterVertically){
     IconButton(onClick={m.controller?.shuffleModeEnabled=!m.shuffle}){Icon(SimpleShuffle,"셔플",Modifier.size(22.dp),tint=if(m.shuffle)Aqua else Muted)}
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
 AppPage(title="로그인",onDismissRequest={if(!m.busy)m.showLogin=false},containerColor=Panel){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp)){
   Text("취향이 이어지는 곳",fontSize=28.sp,fontWeight=FontWeight.Bold);Text("로그인하고 듣고, 부르고, 함께 나눠요.",color=Muted,fontSize=14.sp,modifier=Modifier.padding(top=8.dp,bottom=22.dp))
   m.loginError?.let{Text(it,color=Color(0xFFFFB4A5),fontSize=14.sp,modifier=Modifier.fillMaxWidth().padding(bottom=14.dp).testTag("login-error"))}
   if(m.busy)LinearProgressIndicator(Modifier.fillMaxWidth().padding(bottom=14.dp).testTag("login-progress"))
   if("google" in m.providers)BrandButton(onClick={social("google")},enabled=!m.busy,colors=ButtonDefaults.buttonColors(containerColor=Color.White,contentColor=Color(0xFF1F1F1F)),modifier=Modifier.fillMaxWidth().height(52.dp)){Text("Google로 계속하기",fontSize=15.sp)}
   if("google" in m.providers){
    TextButton(onClick={social("google-browser")},enabled=!m.busy){Text("브라우저로 Google 로그인",fontSize=12.sp)}
   }
   if(m.browserLoginPending){
    Text("브라우저에서 인증을 마치면 이 앱으로 돌아와 주세요.",fontSize=12.sp,color=Muted)
    OutlinedButton(onClick={m.finishLogin(reportPending=true)},modifier=Modifier.fillMaxWidth().padding(top=8.dp).testTag("browser-login-check")){Text("로그인 완료 확인")}
   }
   if("kakao" in m.providers)BrandButton(onClick={social("kakao")},enabled=!m.busy,colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFFEE500),contentColor=Color.Black),modifier=Modifier.fillMaxWidth().padding(top=10.dp).height(52.dp)){Icon(Icons.Rounded.ChatBubble,null,Modifier.size(18.dp));Text("카카오로 계속하기",Modifier.padding(start=8.dp),fontSize=15.sp)}
   if("apple" in m.providers)OutlinedButton(onClick={social("apple")},enabled=!m.busy,modifier=Modifier.fillMaxWidth().padding(top=10.dp).height(52.dp)){Text("Apple로 계속하기",fontSize=15.sp)}
   if(m.providers.isNotEmpty())Text("카카오톡 미설치 시와 Apple 로그인은 인증 화면을 거쳐 앱으로 돌아와요.",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=9.dp,bottom=22.dp))
   if(m.emailEnabled){
    if(register)OutlinedTextField(name,{name=it},label={Text("닉네임")},modifier=Modifier.fillMaxWidth(),singleLine=true)
    OutlinedTextField(email,{email=it},label={Text("이메일")},modifier=Modifier.fillMaxWidth().padding(top=8.dp),singleLine=true,keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Email))
    OutlinedTextField(password,{password=it},label={Text("비밀번호 · 12자 이상")},modifier=Modifier.fillMaxWidth().padding(top=8.dp),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Password))
    BrandButton(onClick={m.login(email,password,name,register)},enabled=!m.busy&&email.contains("@")&&password.length>=12&&(!register||name.isNotBlank()),modifier=Modifier.fillMaxWidth().padding(top=18.dp).height(50.dp)){if(m.busy)CircularProgressIndicator(Modifier.size(20.dp),color=Ink,strokeWidth=2.dp) else Text(if(register)"가입하고 시작하기" else "이메일로 로그인")}
    TextButton(onClick={register=!register},modifier=Modifier.align(Alignment.CenterHorizontally)){Text(if(register)"이미 계정이 있어요" else "이메일로 회원가입")}
   }
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center){TextButton(onClick={browser(Endpoint.url("/terms"))}){Text("이용약관",fontSize=12.sp)};TextButton(onClick={browser(Endpoint.url("/privacy"))}){Text("개인정보처리방침",fontSize=12.sp)}}
   Spacer(Modifier.height(20.dp))
  }
 }
}
@Composable private fun AccountSheet(m:MusicModel,browser:(String)->Unit,adPrivacy:()->Unit){
 var safety by remember{mutableStateOf(false)}
 var information by remember{mutableStateOf(false)}
 fun open(path:String){m.showAccount=false;browser(Endpoint.url(path))}
 AppPage(title="계정",onDismissRequest={m.showAccount=false},containerColor=Panel){
  Column(Modifier.fillMaxWidth().heightIn(max=600.dp).verticalScroll(rememberScrollState()).padding(horizontal=22.dp).padding(bottom=24.dp).testTag("account-actions")){
   Row(Modifier.padding(bottom=20.dp),verticalAlignment=Alignment.CenterVertically){
    Avatar(m.user?.optString("name")?:"",m.ownProfile.optJSONObject("profile"),52)
    Column(Modifier.weight(1f).padding(start=14.dp)){
     Text(m.user?.optString("display_name",m.user?.optString("name")?:"")?:"내 계정",fontSize=22.sp,fontWeight=FontWeight.Bold)
     val premium=m.membership.optLong("premium_until")>System.currentTimeMillis()/1000
     Text(if(premium)"Premium 회원" else "무료 회원",fontSize=13.sp,color=if(premium)Pink else Muted,modifier=Modifier.padding(top=4.dp))
    }
   }
   AccountMenuRow("계정 설정",Icons.Rounded.ManageAccounts){m.openAccountSettings()}
   AccountMenuRow("로그아웃",Icons.AutoMirrored.Rounded.Logout,tint=Color(0xFFFFB4A5),enabled=!m.busy){m.logout()}
   AccountMenuRow("Premium · 골드 구매",Icons.Rounded.ShoppingBag){m.showBilling=true}
   AccountMenuRow("DM 보기",Icons.AutoMirrored.Rounded.Chat){m.showAccount=false;m.openMessages()}
   AccountMenuRow("알림 기록",Icons.Rounded.NotificationsNone){m.showNotifications=true}
   AccountMenuRow("다이아 · 내 정산",Icons.Rounded.AccountBalanceWallet){m.showDiamonds=true}
   AccountMenuRow("오늘의 실버",Icons.Rounded.Star){m.showRewards=true}
   AccountMenuRow("스튜디오",Icons.Rounded.Tune){m.openStudio()}
   AccountMenuRow("선물함",Icons.Rounded.CardGiftcard,tint=Pink){m.openGifts()}
   HorizontalDivider(Modifier.padding(vertical=12.dp),color=Stroke)
   AccountMenuRow("차단 관리 · 계정 삭제",Icons.Rounded.ManageAccounts){safety=true}
   TextButton(onClick={information=!information},modifier=Modifier.fillMaxWidth()){
    Text("이용 안내",color=Muted);Spacer(Modifier.weight(1f));Icon(if(information)Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,null,tint=Muted)
   }
   if(information){
    Text("제작곡은 무료 월 3곡 · Premium 월 10곡, 커버곡은 업로드 제한이 없어요. 무료회원은 제작곡 업로드 중 또는 커버 업로드 완료 후 화면 광고가 한 번 표시될 수 있어요. 감상 중 음성광고는 준비 중이며, Premium은 광고가 없어요.",fontSize=13.sp,color=Muted)
    listOf("이용약관" to "/terms","개인정보처리방침" to "/privacy","고객센터" to "/contact","계정 삭제 안내" to "/account/delete").forEach{(label,path)->TextButton(onClick={open(path)}){Text(label)}}
    TextButton(onClick={m.showAccount=false;adPrivacy()}){Text("광고 개인정보 설정")}
   }
   Text("AIFECT ${BuildConfig.VERSION_NAME}",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=12.dp))
  }
 }
 if(safety) SafetySettings(m,{safety=false},{browser(Endpoint.url(it))})
}

@Composable private fun AccountSettingsSheet(m:MusicModel){
 var name by rememberSaveable{mutableStateOf(m.user?.optString("name")?:"")}
 var current by remember{mutableStateOf("")};var next by remember{mutableStateOf("")};var confirm by remember{mutableStateOf("")};var passwordOpen by rememberSaveable{mutableStateOf(false)}
 AppPage(title="설정",onDismissRequest={m.showAccountSettings=false},containerColor=Panel){
  Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(22.dp).testTag("account-settings")){
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
    Text("계정 설정",Modifier.weight(1f),fontSize=22.sp,fontWeight=FontWeight.Bold)
    TextButton(onClick={m.logout()},enabled=!m.busy,modifier=Modifier.testTag("settings-logout")){Text("로그아웃",color=Color(0xFFFFB4A5))}
   }
   val pushContext=androidx.compose.ui.platform.LocalContext.current
   Text("푸시 알림",fontSize=18.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=18.dp))
   listOf("dm" to "메시지", "comment" to "댓글 · 커버/듀엣 참여", "gift" to "선물").forEach{(kind,label)->
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
    BrandButton(onClick={m.saveNickname(name)},enabled=!m.busy&&name.isNotBlank(),modifier=Modifier.weight(1f)){Text("아이디 저장")}
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
     BrandButton(onClick={if(next!=confirm)m.accountError="새 비밀번호 확인이 일치하지 않습니다." else m.changePassword(current,next){current="";next="";confirm="";passwordOpen=false}},enabled=!m.busy&&current.isNotBlank()&&next.length in 12..128&&confirm.isNotBlank(),modifier=Modifier.fillMaxWidth().padding(top=14.dp)){Text("비밀번호 저장")}
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
 val list=rememberLazyListState()
 val scope=rememberCoroutineScope()
 var composing by rememberSaveable(song.id){mutableStateOf(!song.cover)}
 var includePosition by rememberSaveable(song.id){mutableStateOf(true)}
 var share by rememberSaveable(song.id){mutableStateOf(false)}
 val commentFocus=remember{FocusRequester()}
 val detailsVisible by remember{derivedStateOf{list.firstVisibleItemIndex>0}}
 var controlsEnd by remember{mutableFloatStateOf(Float.MAX_VALUE)}
 val miniVisible by remember{derivedStateOf{list.firstVisibleItemIndex>0||list.firstVisibleItemScrollOffset>=controlsEnd}}
 var management by remember{mutableStateOf(false)}
 AppPage(title=if(detailsVisible)song.title else "AIFECT",onDismissRequest={m.detail=null},containerColor=Ink,actions={if(!song.cover)IconButton({if(m.authenticated())share=true}){Icon(Icons.Rounded.Share,"공유")};IconButton({management=true},modifier=Modifier.testTag("song-menu")){Icon(Icons.Rounded.Menu,"곡 메뉴")}},backdrop={
  if(!detailsVisible&&!song.cover)AlbumListeningBackdrop(song.art,"song-art-backdrop")
 }){
  BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()){
   val viewport=remember(maxWidth){maxHeight}
   LazyColumn(Modifier.fillMaxSize().imePadding().testTag("song-detail-scroll"),state=list,contentPadding=PaddingValues(20.dp,0.dp,20.dp,24.dp)){
   item(key="listening"){
    if(song.cover)CoverWorkHero(m,song,{save(song)},{m.singTarget(song,sing)},{
     composing=!composing;if(composing)scope.launch{list.animateScrollToItem(1)}
    },{if(m.authenticated())share=true})
    else ReferenceSongHero(m,song,viewport,{save(song)},{m.singTarget(song,sing)},{controlsEnd=it}){scope.launch{list.animateScrollToItem(1)}}
   }
   item(key="details"){Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)){
    if(!song.cover){ReferenceSongDescription(song);ReferenceLyrics(m,song)}
    if(!song.cover&&(song.raw.optInt("covers")>0||song.raw.optInt("accepts_covers")==1))SongCoverTabs(m,song,sing)
    HorizontalDivider(color=Stroke);Section("댓글 ${verifiedSongCommentCount(song,m)}")
    if(m.detailBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    if(composing&&m.user==null)TextButton(onClick={m.showLogin=true}){Text("로그인하고 첫 감상을 남겨보세요")}
    else if(composing) {
     if(song.cover)LaunchedEffect(composing){commentFocus.requestFocus()}
     reply?.let{Row(verticalAlignment=Alignment.CenterVertically){Text("${it.optString("name")}님에게 답글",Modifier.weight(1f),color=Pink);TextButton(onClick={reply=null}){Text("취소")}}}
     OutlinedTextField(text,{text=it.take(2000)},placeholder={Text("이 곡의 어떤 순간이 좋았나요?",fontSize=12.sp)},modifier=Modifier.fillMaxWidth().focusRequester(commentFocus),minLines=1,maxLines=5,shape=RoundedCornerShape(12.dp),trailingIcon={
      IconButton(onClick={m.comment(text,reply?.optString("id"),song.cover&&includePosition){text="";reply=null}},enabled=text.isNotBlank()&&!m.busy){Icon(Icons.AutoMirrored.Rounded.Send,"댓글 남기기",Modifier.size(20.dp))}
     })
     if(song.cover)Row(verticalAlignment=Alignment.CenterVertically){Checkbox(includePosition,{includePosition=it});Text("현재 재생 시간 포함",fontSize=12.sp,color=Muted)}
    }
   }}
   items(threadedComments(m.comments),key={it.getString("id")}){c->
    Row(Modifier.fillMaxWidth().padding(start=if(!c.isNull("parent_id"))24.dp else 0.dp).padding(vertical=12.dp),verticalAlignment=Alignment.Top){
     Avatar(c.optString("name"),JSONObject().put("id",c.optString("profile_id")).put("image_version",c.optString("image_version")),size=30)
     Column(Modifier.weight(1f).padding(start=11.dp)){
      Text(c.optString("name")+if(c.optInt("creator")==1)" · 업로더" else "",fontSize=13.sp,fontWeight=FontWeight.Bold)
      if(!c.isNull("parent_id"))Text("└ 답글",fontSize=11.sp,color=Violet,modifier=Modifier.padding(top=4.dp))
      Text(c.optString("body"),fontSize=14.sp,color=if(c.optLong("deleted_at")>0)Muted else MaterialTheme.colorScheme.onSurface,modifier=Modifier.padding(top=7.dp))
      if(c.optLong("deleted_at")==0L)Row(verticalAlignment=Alignment.CenterVertically){
       TextButton(onClick={m.commentLike(c)},contentPadding=PaddingValues(0.dp),enabled=!m.busy){Icon(if(c.optInt("liked")==1)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"댓글 좋아요",Modifier.size(14.dp));Text(" ${c.optInt("likes")}",fontSize=12.sp)}
       TextButton(onClick={reply=if(c.isNull("parent_id"))c else m.comments.find{it.optString("id")==c.optString("parent_id")};composing=true;scope.launch{list.animateScrollToItem(1)}},enabled=!m.busy){Text("답글",fontSize=13.sp)}
       if(c.optBoolean("can_delete"))TextButton(onClick={delete=c},enabled=!m.busy){Text("삭제",color=Muted,fontSize=12.sp)}
       if(c.optBoolean("can_report"))TextButton(onClick={report=c},enabled=!m.busy){Text("신고",color=Muted,fontSize=12.sp)}
       if(c.optInt("reported")==1)Text("신고됨",color=Muted,fontSize=12.sp)
      }
     }
    }
   }
   if(m.comments.isEmpty()&&!m.detailBusy)item{Text("아직 댓글이 없어요. 첫 감상을 들려주세요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(vertical=20.dp))}
   item{ReferenceSupporters(m,song)}
  }
  }
  if(miniVisible&&m.current!=null&&!m.fullPlayer)m.current?.let{MiniPlayer(m,it)}
 }

 if(share)WorkMessageShare(m,song.id,song.title,if(song.cover)"cover" else "original"){share=false}
 if(management)AppPage("곡 메뉴",{management=false}){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text(song.title,fontSize=20.sp,fontWeight=FontWeight.Bold)
  TextButton({save(song)}){Icon(Icons.Rounded.Add,null);Text("플레이리스트에 저장")}
  TextButton({m.openProfile(song.producerId)}){Text("제작자 페이지")}
  if(!m.ownsTrack(song)) TrackSafety(m,song)
  AlbumImageEditor(m,song)
  if(m.ownsTrack(song))TextButton({m.requestTrackDelete(song)},modifier=Modifier.testTag("song-detail-delete")){Icon(Icons.Rounded.DeleteOutline,null);Text("${if(song.cover)"커버곡"else "음원"} 삭제")}
 }}

 report?.let{c->CommentReportDialog(m,{report=null}){reason,details->m.reportComment(c,reason,details){report=null}}}
 delete?.let{c->AlertDialog(onDismissRequest={delete=null},title={Text("댓글을 삭제할까요?")},confirmButton={TextButton(onClick={m.deleteComment(c);delete=null}){Text("삭제")}},dismissButton={TextButton(onClick={delete=null}){Text("취소")}})}
}
@Composable private fun PlaylistEditor(title:String,initial:String,visible:Boolean,busy:Boolean,dismiss:()->Unit,save:(String,Boolean)->Unit){
 var name by remember{mutableStateOf(initial)};var public by remember{mutableStateOf(visible)}
 AppFormPage(onDismissRequest=dismiss,title={Text(title)},text={Column{OutlinedTextField(name,{name=it.take(80)},label={Text("플레이리스트 이름")},singleLine=true);Row(verticalAlignment=Alignment.CenterVertically){Checkbox(public,{public=it});Text("다른 사람에게 공개하기",fontSize=13.sp)}}},confirmButton={TextButton(onClick={save(name,public)},enabled=name.isNotBlank()&&!busy){Text("저장")}},dismissButton={TextButton(onClick=dismiss){Text("취소")}})
}
@Composable private fun PlaylistSheet(m:MusicModel,p:JSONObject){
 val own=p.optString("user_id")==m.user?.optString("id")
 var edit by remember{mutableStateOf(false)};var deleting by remember{mutableStateOf(false)};var add by remember{mutableStateOf(false)}
 AppPage(title="플레이리스트",onDismissRequest={m.selectedList=null},containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp)){
   item{
    PlaylistArt(p,Modifier.size(112.dp));if(own)PlaylistImageEditor(m,p);Text(p.optString("name"),fontSize=29.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=14.dp));Text("${p.optString("owner_name")} · ${m.listSongs.size}곡",color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=7.dp))
    Row(Modifier.fillMaxWidth().padding(top=16.dp),horizontalArrangement=Arrangement.spacedBy(7.dp)){
     BrandButton(onClick={m.listSongs.firstOrNull()?.let{m.play(it,m.listSongs)}},enabled=m.listSongs.isNotEmpty(),colors=ButtonDefaults.buttonColors(containerColor=Aqua,contentColor=Ink)){Icon(Icons.Rounded.PlayArrow,null);Text("전체 재생",fontSize=13.sp)}
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
 var viewAll by rememberSaveable(p.optString("id")){mutableStateOf<String?>(null)}
 val dubbings=p.optJSONArray("dubbings").objects()
 val columns=musicGalleryColumns()
 val all=(m.profileSongs+m.profileCovers).distinctBy{it.id}
 val tracks=when(tab){"제작곡"->m.profileSongs;"커버"->m.profileCovers;"듀엣"->m.profileCovers.filter{it.raw.optString("cover_mode")=="duet"};else->all}
 AppPage(title="프로필",onDismissRequest=m::dismissProfile,containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth().testTag("profile-scroll"),contentPadding=PaddingValues(16.dp,0.dp,16.dp,28.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   if(m.profileLoading||m.profileError!=null)item{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text(p.optString("name").ifBlank{"프로필"},Modifier.weight(1f),fontSize=22.sp);IconButton(onClick=m::dismissProfile,modifier=Modifier.testTag("profile-close")){Icon(Icons.Rounded.Close,"프로필 닫기")}}
    if(m.profileLoading){LinearProgressIndicator(Modifier.fillMaxWidth().testTag("profile-loading"));Text("프로필을 불러오는 중이에요",color=Muted,modifier=Modifier.padding(vertical=18.dp))}
    m.profileError?.let{Text(it,color=Pink);TextButton(onClick=m::retryProfile){Text("다시 불러오기")}}
   }
   else item{MusicProfileHeader(m,p,m.profileSongs,m.profileCovers,m.profileFollowers,close=m::dismissProfile)}
   if(!m.profileLoading&&m.profileError==null){
   if(p.optString("profile_kind","producer")=="producer"){
    val originals=m.profileSongs
    val covers=m.profileCovers
    val sections=if(p.optBoolean("show_covers"))listOf("creations","original") else listOf("original","creations")
    sections.forEach{section->
     val original=section=="original"
     val works=if(original)referenceWorks(originals,emptyList()) else referenceWorks(covers,dubbings)
     if(works.isNotEmpty())item(key=section){
      CurrentPanel(if(original)"제작곡" else "커버 · 듀엣 · 더빙",works.size,"전체보기",{viewAll=section}){ReferenceWorkShelf(works,m)}
     }
    }
    if(originals.isEmpty()&&covers.isEmpty()&&dubbings.isEmpty())item{Text("아직 공개한 작품이 없어요.",Modifier.padding(vertical=12.dp),color=Muted,fontSize=13.sp)}
    if(p.optJSONArray("gallery").objects().isNotEmpty())item{PublicProfileGallery(m,p)}
   }else{
   item{Chips(if(p.optString("profile_kind")=="artist")listOf("음악","갤러리")else listOf("전체","제작곡","커버","듀엣"),if(tab=="전체"&&p.optString("profile_kind")=="artist")"음악" else tab){tab=it};if(tab!="갤러리")MusicLayoutControl(tracks.size,grid,{grid=it},"profile")}
   if(tab=="갤러리")item{ArtistPhotoGallery(m,p)}else{
   musicGallery(tracks,m,grid,columns,"profile")
   if(tracks.isEmpty())item{Empty("이 탭에 공개된 음악이 없어요","새로운 음악이 공개되면 여기에서 만나요.")}
   }
   }
   }
  }
 }
 viewAll?.let{kind->ReferenceWorksPage(m,kind,m.profileSongs,m.profileCovers,dubbings,p.optString("name")){viewAll=null}}
}
