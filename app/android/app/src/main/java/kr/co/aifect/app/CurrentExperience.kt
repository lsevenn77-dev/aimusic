@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import androidx.lifecycle.repeatOnLifecycle
import org.json.JSONObject

internal class CurrentRead {
 var data by mutableStateOf<JSONObject?>(null)
 var loading by mutableStateOf(true)
 var error by mutableStateOf<String?>(null)
 var revision by mutableIntStateOf(0)
 fun retry(){revision++}
}
@Composable internal fun currentRead(m:MusicModel,path:String,enabled:Boolean=true,poll:Long=0):CurrentRead {
 val account=m.user?.optString("id")
 val read=remember(path,account,m.trackContentRevision){CurrentRead().apply{
  if(enabled)data=m.api.peek(path)
  loading=data==null
 }}
 val lifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
 LaunchedEffect(path,account,enabled,read.revision,m.trackContentRevision){
  if(!enabled){read.loading=false;return@LaunchedEffect}
  lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){
   do{
    read.loading=read.data==null
    try{val d=m.api.call(path,fresh=true);if(account==m.user?.optString("id")){read.data=d;read.error=null}}
    catch(e:Exception){if(e is CancellationException)throw e;if(e is ApiException&&e.status in listOf(401,403,404))read.data=null;read.error=e.message?:"불러오지 못했어요."}
    finally{read.loading=false}
    if(poll>0)delay(poll)
   }while(poll>0)
  }
 }
 return read
}
@Composable internal fun LoadingRows(){
 Column(Modifier.fillMaxWidth().padding(vertical=8.dp).testTag("loading-skeleton"),verticalArrangement=Arrangement.spacedBy(10.dp)){
  repeat(2){
   Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
    Spacer(Modifier.size(46.dp).background(Panel,RoundedCornerShape(8.dp)))
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
     Spacer(Modifier.fillMaxWidth(.62f).height(12.dp).background(Panel,RoundedCornerShape(4.dp)))
     Spacer(Modifier.fillMaxWidth(.36f).height(9.dp).background(Panel,RoundedCornerShape(4.dp)))
    }
   }
  }
 }
}
@Composable internal fun ReadStatus(read:CurrentRead){
 if(read.loading&&read.data==null)LoadingRows()
 read.error?.let{Column(Modifier.fillMaxWidth().padding(vertical=12.dp)){Text(it,color=Muted,fontSize=14.sp);TextButton(onClick=read::retry){Text("다시 불러오기")}}}
}
@Composable internal fun CurrentTabs(
 items:List<Pair<String,String>>,selected:String,tag:String,
 actions:(@Composable RowScope.()->Unit)?=null,onSelect:(String)->Unit
){
 val equalWidth=tag in setOf("community-main","play-main","my-section","inbox-filter")
 Column(Modifier.fillMaxWidth()){
  Row(Modifier.fillMaxWidth().padding(horizontal=if(actions!=null)4.dp else 0.dp),verticalAlignment=Alignment.CenterVertically){
   BoxWithConstraints(Modifier.weight(1f)) {
    val minSlot=48.dp*androidx.compose.ui.platform.LocalDensity.current.fontScale.coerceAtLeast(1f)
    val fit=equalWidth && (actions==null || maxWidth>=minSlot*items.size)
    Row(Modifier.fillMaxWidth().then(if(fit)Modifier else Modifier.horizontalScroll(rememberScrollState()))
     .padding(horizontal=if(actions!=null || tag.startsWith("my-"))0.dp else 20.dp).testTag(tag),
     horizontalArrangement=Arrangement.spacedBy(if(equalWidth)0.dp else 20.dp)){
     items.forEach{(key,label)->
      val slot=if(fit)Modifier.weight(1f) else if(equalWidth)Modifier.widthIn(min=minSlot) else Modifier.width(IntrinsicSize.Max)
      Column(slot.selectable(selected==key,role=Role.Tab,onClick={onSelect(key)}).testTag("$tag-$key").heightIn(min=48.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
       Text(label,color=if(selected==key)Pink else Muted,fontWeight=if(selected==key)FontWeight.SemiBold else FontWeight.Medium,fontSize=13.sp,lineHeight=18.sp,maxLines=1,modifier=Modifier.padding(vertical=11.dp))
       Box(Modifier.then(if(fit)Modifier.fillMaxWidth() else Modifier.width(30.dp)).height(3.dp).clip(RoundedCornerShape(2.dp)).then(if(selected==key)Modifier.background(if(tag=="community-main"||tag=="play-main")DiscoveryGradient else BrandGradient)else Modifier))
      }
     }
    }
   }
   if(actions!=null) actions()
  }
  HorizontalDivider(color=Stroke)
 }
}
@Composable internal fun CurrentPlayScreen(m:MusicModel,sing:(Song)->Unit,resumeDraft:(JSONObject)->Unit){
 if(m.playMode=="dubbing"){
  DubbingDiscovery(m)
  return
 }
 var query by rememberSaveable(m.playMode,m.playSection){mutableStateOf("")}
 var kind by rememberSaveable{mutableStateOf("all")}
 var choosingKind by remember{mutableStateOf(false)}
 var finishedId by rememberSaveable(m.playMode){mutableStateOf<String?>(null)}
 val account=m.user?.optString("id")
 var offset by remember(m.playMode,m.playSection,kind,account){mutableIntStateOf(0)}
 val mode=m.playMode;val section=m.playSection
 val sections=when(mode){"browse"->listOf("recommended" to "추천","following" to "팔로잉","popular" to "인기","latest" to "최신");else->listOf("recommended" to "추천","popular" to "인기","duets" to "듀엣 참여","drafts" to "내 초안")}
 val gated=(mode=="song"&&section=="drafts"||mode=="browse"&&section=="following")&&m.user==null
 val base=CurrentNavigation.playPath(mode,section,kind)
 val path=base+(if('?' in base)"&" else "?")+"offset=$offset"
 val read=currentRead(m,path,enabled=!gated&&!(mode=="song"&&section=="drafts"))
 val listKey=CurrentNavigation.playListKey(mode,section,kind)
 val tabLists=remember(account){mutableMapOf<String,List<JSONObject>>()}
 var records by remember(listKey,account){mutableStateOf(tabLists[listKey].orEmpty())}
 var appliedData by remember(listKey,account){mutableStateOf<JSONObject?>(null)}
 LaunchedEffect(listKey,read.data,read.error){
  val data=read.data
  if(data!=null){
   val incoming=data.optJSONArray(if(mode=="browse")"works" else "tracks").objects()
   records=(if(offset==0)incoming else records+incoming).distinctBy{it.optString("id")}
   tabLists[listKey]=records;appliedData=data
  }else if(read.error!=null){records=emptyList();tabLists.remove(listKey);appliedData=null}
 }
 val responseApplied=read.data==null||read.data===appliedData
 val userId=m.user?.optString("id")
 val filtered=remember(records,query,mode,section,userId){records.filter{r->
  val match=query.isBlank()||listOf("title","artist","producer","ownerName","owner_name").any{r.optString(it).contains(query.trim(),true)}
  match&&(mode!="song"||section!="duets"||Song(r).openDuetFor(userId))
 }}
 val nextOffset=read.data?.takeUnless{it.isNull("nextOffset")}?.optInt("nextOffset")?.takeIf{it>offset}
 val queue=remember(filtered){filtered.filter{it.optString("type")!="dubbing"&&it.optString("kind")!="dubbing"}.map(::Song)}
 Column(Modifier.fillMaxSize().testTag("current-play")){
  CurrentTabs(listOf("song" to "노래","dubbing" to "더빙","browse" to "둘러보기"),mode,"play-main"){m.playMode=it;m.playSection=if(it=="dubbing")"discover" else "recommended"}
  if(mode=="song"){
   StudioSectionTabs(sections,section,"play-section",Modifier.padding(horizontal=12.dp,vertical=8.dp)){m.playSection=it}
  }
  else DiscoverySections(sections,section,"play-section",Modifier.padding(horizontal=16.dp,vertical=7.dp)){m.playSection=it}
  if(mode=="song"&&section=="drafts"){
   if(gated)SignInEntry(m)else RecordingDraftsContent(m,resumeDraft)
  }else LazyColumn(Modifier.fillMaxSize().testTag("play-results"),contentPadding=PaddingValues(16.dp,4.dp,16.dp,24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
   if(gated)item{SignInEntry(m)}else{
    item{CurrentSearch(query,{query=it},if(mode=="song")"곡 · 아티스트 · 제작자 검색" else "작품 · 창작자 검색","play-search")}
    if(mode=="browse")item{SelectionField("작품 유형",mapOf("all" to "전체","solo" to "솔로","duet" to "듀엣","dubbing" to "더빙").getValue(kind),"play-kind-picker",Modifier.fillMaxWidth()){choosingKind=true}}
    if(CurrentNavigation.playLoaderVisible(read.loading,records.size,offset)||read.error!=null)item{ReadStatus(read)}
    items(filtered.chunked(2),key={row->row.joinToString("|"){it.optString("id")}}){row->
     Row(Modifier.fillMaxWidth().testTag("play-grid-row-"+row.first().optString("id")),horizontalArrangement=Arrangement.spacedBy(14.dp)){
      row.forEach{r->Box(Modifier.weight(1f).testTag("play-grid-card-"+r.optString("id"))){
       when{
        mode=="song"&&section=="duets"->DuetParticipationRow(Song(r),m,queue,sing)
        r.optString("type")=="dubbing"||r.optString("kind")=="dubbing"->CurrentDubbingCard(r){id->finishedId=id}
        else->CurrentSongCard(Song(r),m,queue,if(mode=="song")sing else null)
       }
      }}
      if(row.size==1)Spacer(Modifier.weight(1f))
     }
    }
    if(CurrentNavigation.playEmptyVisible(filtered.size,read.loading,read.error!=null,responseApplied))item{CurrentEmpty(if(query.isNotBlank())"검색 결과가 없어요" else "아직 표시할 작품이 없어요",if(query.isNotBlank())"다른 제목이나 창작자를 찾아보세요." else "공개된 작품이 여기에 모여요.")}
    if(nextOffset!=null)item{OutlinedButton(onClick={offset=nextOffset},enabled=!read.loading&&responseApplied,modifier=Modifier.fillMaxWidth().testTag("play-more")){Text("더 보기")}}
   }
  }
 }
 finishedId?.let{id->CompletedDubbingDetail(m,id){finishedId=null}}
 if(choosingKind)SelectionSheet("작품 유형",listOf("all" to "전체","solo" to "솔로","duet" to "듀엣","dubbing" to "더빙"),listOf(kind),"play-kind",{choosingKind=false}){kind=it}
}
@Composable private fun RecordingDraftsContent(m:MusicModel,resume:(JSONObject)->Unit){
 Column(Modifier.fillMaxSize().padding(20.dp)){
  Text("저장한 녹음부터 이어서 작업해요.",color=Muted,fontSize=14.sp)
  BrandButton(onClick={m.showRecordingDrafts=true},modifier=Modifier.fillMaxWidth().padding(top=16.dp).testTag("play-drafts-open")){Icon(Icons.Rounded.Edit,null);Text("녹음 초안 열기")}
  RecordingDraftPreview(m,resume)
 }
}
private fun JSONObject.flag(key:String)=optBoolean(key,false)||optInt(key,0)==1
@Composable private fun SignInEntry(m:MusicModel){Column(Modifier.padding(20.dp)){Text("로그인하고 내 작업을 이어가세요.",color=Muted);BrandButton(onClick={m.showLogin=true},modifier=Modifier.padding(top=16.dp)){Text("로그인")}}}
@Composable internal fun CurrentEmpty(title:String,body:String=""){
 Column(Modifier.fillMaxWidth().padding(vertical=28.dp),horizontalAlignment=Alignment.CenterHorizontally){Text(title,fontSize=15.sp,color=SoftText);if(body.isNotBlank())Text(body,color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=8.dp))}
}
@Composable private fun CurrentSongRow(song:Song,m:MusicModel,queue:List<Song>,sing:((Song)->Unit)?=null){
 Column(Modifier.fillMaxWidth().testTag("current-track-${song.id}")){
  Row(verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(56.dp).clickable{m.openSong(song)},12.dp)
   Column(Modifier.weight(1f).padding(horizontal=12.dp).clickable{m.openSong(song)}){
    Row(verticalAlignment=Alignment.CenterVertically){if(song.cover){Icon(if(song.raw.optString("cover_mode")=="duet")Icons.Rounded.PeopleOutline else Icons.Rounded.Mic,NoneDescription,Modifier.size(16.dp),tint=Muted);Spacer(Modifier.width(5.dp))};Text(song.title,fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)}
    Text(song.credit,color=Muted,fontSize=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
    Text("${song.genreLabel} · ${timeLabel((song.duration*1000).toLong())}",color=Muted,fontSize=12.sp,maxLines=1,modifier=Modifier.padding(top=3.dp))
   }
   IconButton(onClick={m.play(song,queue)}){Icon(Icons.Rounded.PlayArrow,"${song.title} 먼저 듣기",tint=SoftText)}
  }
  if(sing!=null)OutlinedButton(onClick={m.singTarget(song,sing)},modifier=Modifier.fillMaxWidth().padding(top=8.dp).testTag("current-sing-${song.id}"),shape=RoundedCornerShape(12.dp)){Icon(Icons.Rounded.Mic,null,Modifier.size(18.dp));Text(if(song.openDuetFor(m.user?.optString("id")))"듀엣 참여" else "노래하기",Modifier.padding(start=6.dp))}
  HorizontalDivider(Modifier.padding(top=12.dp),color=Stroke.copy(alpha=.6f))
 }
}
private val NoneDescription:String?=null
@Composable internal fun CurrentCommunityScreen(m:MusicModel){
 var rankCategory by rememberSaveable{mutableStateOf("work")}
 var query by rememberSaveable{mutableStateOf("")}
 LaunchedEffect(m.user?.optString("id"),m.communityMode){
  if(m.user!=null&&m.communityMode=="voice"&&m.crewHomePreview()==null){
   try{m.readCrewHome()}catch(e:CancellationException){throw e}catch(_:Exception){ /* Retry on entry. */ }
  }
 }
 val status=currentRead(m,"/api/voice/status",m.communityMode=="voice")
 val read=currentRead(m,"/api/voice/public-rooms",m.communityMode=="voice"&&status.data?.optBoolean("enabled")==true,poll=20000)
 val rooms=read.data?.takeIf{status.data?.optBoolean("enabled")==true}?.optJSONArray("rooms").objects().filter{query.isBlank()||(it.optString("title")+" "+it.optString("host_name")).contains(query.trim(),true)}
 Column(Modifier.fillMaxSize().testTag("current-community")){
  CurrentTabs(listOf("voice" to "라이브","crews" to "크루","rankings" to "랭킹"),m.communityMode,"community-main"){m.communityMode=it}
  when(m.communityMode){
   "crews"->NativeCrewHome(m){rankCategory="crew";m.communityMode="rankings"}
   "rankings"->CurrentRankings(m,rankCategory){rankCategory=it}
   else->LazyColumn(Modifier.fillMaxSize().testTag("voice-lobby"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
    item{Text("지금 열려 있는 노래방 · 토킹룸",fontSize=18.sp,fontWeight=FontWeight.SemiBold);Text("공개된 방만 보여줘요",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=6.dp))}
    item{Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
     CurrentSearch(query,{query=it},"방 제목·방장 검색","voice-search",Modifier.weight(1f))
     BrandButton(onClick={m.openCurrentWorkspace("live/create","방 만들기")},enabled=status.data?.optBoolean("enabled")==true,modifier=Modifier.width(108.dp).heightIn(min=48.dp).testTag("voice-create"),contentPadding=PaddingValues(horizontal=10.dp)){Icon(Icons.Rounded.Add,null,Modifier.size(18.dp));Text("방 만들기",fontSize=13.sp,maxLines=2)}
    }}
    if(status.loading||status.error!=null||read.loading||read.error!=null)item{ReadStatus(status);ReadStatus(read)}
    items(rooms.chunked(2)){row->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
     row.forEach{r->Box(Modifier.weight(1f)){CurrentRoomCard(r,m)}};if(row.size==1)Spacer(Modifier.weight(1f))
    }}
    if(rooms.isEmpty()&&!status.loading&&status.error==null&&!read.loading&&read.error==null)item{CurrentRoomEmpty(if(status.data?.optBoolean("enabled")==false)"라이브 연결을 준비하고 있어요" else if(query.isBlank())"아직 열린 공개 노래방·토킹룸이 없어요." else "검색 결과가 없어요")}
   }
  }
 }
}
@Composable private fun CurrentRoomEmpty(message:String){
 Column(Modifier.fillMaxWidth().padding(top=56.dp,bottom=48.dp),horizontalAlignment=Alignment.CenterHorizontally){
  Box(Modifier.size(132.dp,104.dp)){
   Box(Modifier.align(Alignment.BottomEnd).size(76.dp,60.dp).clip(RoundedCornerShape(22.dp,22.dp,6.dp,22.dp)).background(Brush.linearGradient(listOf(Color(0xFF346981),Color(0xFF99F0DC)))).border(1.dp,Color(0xFFA5F4E7),RoundedCornerShape(22.dp,22.dp,6.dp,22.dp)))
   Box(Modifier.align(Alignment.TopStart).size(98.dp,76.dp).clip(RoundedCornerShape(25.dp,25.dp,25.dp,7.dp)).background(Brush.linearGradient(listOf(Color(0xFFAD79DC),Color(0xFF3B3B70)))).border(1.dp,Color(0xFFE3BDFF),RoundedCornerShape(25.dp,25.dp,25.dp,7.dp)),contentAlignment=Alignment.Center){Text("•••",fontSize=32.sp,color=Color(0xFFE9CEFF),letterSpacing=5.sp)}
   Icon(Icons.Rounded.AutoAwesome,null,Modifier.align(Alignment.TopEnd).size(26.dp),tint=Color(0xFFDEB5FF))
  }
  Text(message,Modifier.padding(top=28.dp),fontSize=15.sp,lineHeight=23.sp,color=SoftText,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
 }
}
@Composable internal fun CurrentMyScreen(m:MusicModel,toolsOpen:Boolean,onToolsOpen:(Boolean)->Unit){
 var area by rememberSaveable{mutableStateOf("works")}
 var selectedWork by rememberSaveable{mutableStateOf<String?>(null)}
 var allWorks by rememberSaveable{mutableStateOf<String?>(null)}
 var rankingOpen by rememberSaveable{mutableStateOf(false)}
 LaunchedEffect(m.user?.optString("id")){m.refreshMyDashboard()}
 val self=m.ownProfile
 val pid=self.optJSONObject("profile")?.optString("id").orEmpty()
 val data=m.ownDashboard;val p=data?.optJSONObject("profile")?:self.optJSONObject("profile")?:JSONObject()
 val loading=m.ownDashboardLoading||data==null&&m.ownDashboardError==null
 val tracks=data?.tracks().orEmpty();val covers=data?.tracks("covers").orEmpty();val dubbings=data?.optJSONArray("dubbings").objects()
 val gallery=m.ownGallery?:data?.optJSONArray("gallery").objects()
 LazyColumn(Modifier.fillMaxSize().testTag("current-my"),contentPadding=PaddingValues(start=20.dp,end=20.dp,top=8.dp,bottom=24.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
  if(m.user==null)item{SignInEntry(m)}else{
   item{
    if(loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink,trackColor=Stroke)
    m.ownDashboardError?.let{Text(it,fontSize=12.sp,color=Muted);TextButton({m.refreshMyDashboard(fresh=true)}){Text("다시 불러오기")}}
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     Box(Modifier.padding(5.dp).testTag("my-avatar-open").clickable{m.viewProfilePhoto(p)}){Avatar(p.optString("name",m.user?.optString("name").orEmpty()),p,72)}
     Column(Modifier.weight(1f).padding(start=10.dp)){
      Row(verticalAlignment=Alignment.CenterVertically){
       MemberName(p,p.optString("name",m.user?.optString("name").orEmpty()),Modifier.widthIn(max=130.dp).weight(1f,false),fontSize=21.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
       IconButton(onClick=m::editProfile){Icon(Icons.Rounded.Edit,"프로필 수정",Modifier.size(17.dp),tint=Pink)}
      }
      val crew=data?.optJSONObject("crew")
      Text(crew?.optString("name")?:"소속 크루 없음",fontSize=12.sp,color=Muted,modifier=Modifier.clickable{if(crew!=null)m.openCurrentWorkspace("crew/${crew.optString("id")}",crew.optString("name"))else{m.selectTab(3);m.communityMode="crews"}})
      Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)){
       listOf(Triple("팔로워",data?.optInt("followers",self.optInt("follower_count"))?:0,{m.library("팔로워")}),Triple("팔로잉",data?.optInt("following_count",self.optInt("following_count"))?:0,{m.library("팔로잉")}),Triple("공개곡",data?.optInt("public_track_count",tracks.size+covers.size)?:tracks.size+covers.size,{allWorks="all"})).forEach{(label,count,action)->
        Text("$label $count",fontSize=11.sp,lineHeight=15.sp,color=SoftText,modifier=Modifier.clickable(onClick=action).padding(vertical=8.dp))
       }
      }
     }
    }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End,verticalAlignment=Alignment.CenterVertically){
     TextButton(onClick={rankingOpen=true},enabled=p.optString("id").isNotBlank(),modifier=Modifier.testTag("my-gift-ranking")){Icon(Icons.Rounded.StarBorder,null,Modifier.size(16.dp));Text(" 선물 랭킹",fontSize=12.sp)}
     OutlinedButton(onClick=m::openStudio,contentPadding=PaddingValues(horizontal=12.dp,vertical=4.dp)){Icon(Icons.Rounded.Hub,null,Modifier.size(16.dp));Text(" 스튜디오",fontSize=12.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(16.dp))}
    }
   }
   item{CurrentMySwitch(area){area=it}}
   if(area=="works"){
    item{CurrentPanel("제작곡",tracks.size,"전체보기",{allWorks="original"}){
     ReferenceWorkShelf(referenceWorks(tracks,emptyList()),m)
     if(tracks.isEmpty()&&!loading)Text("등록된 제작곡이 없어요.",color=Muted,fontSize=13.sp)
    };HorizontalDivider(color=Stroke)}
    item{Box(Modifier.testTag("my-creations-preview")){CurrentPanel("커버 · 듀엣 · 더빙",covers.size+dubbings.size,"전체보기",{allWorks="creations"}){
     ReferenceWorkShelf(referenceWorks(covers,dubbings),m){id->selectedWork=id;allWorks="creations"}
     if(covers.isEmpty()&&dubbings.isEmpty()&&!loading)Text("아직 등록된 작품이 없어요.",color=Muted,fontSize=13.sp)
    }};HorizontalDivider(color=Stroke)}
    item{CurrentPanel("갤러리",gallery.size,"전체보기",{m.galleryPreview=ProfileGalleryPreview(p.optString("name"),gallery,pid.takeIf{it.isNotBlank()})}){
     BoxWithConstraints(Modifier.fillMaxWidth()){
      val tile=(maxWidth-24.dp)/4
      Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
      repeat(minOf(gallery.size,3)+1){index->val photo=gallery.getOrNull(index).takeIf{index<3}
       Box(Modifier.size(tile).clip(RoundedCornerShape(12.dp)).border(1.dp,Stroke,RoundedCornerShape(12.dp)).clickable{if(photo==null)m.galleryPreview=ProfileGalleryPreview(p.optString("name"),gallery,pid.takeIf{it.isNotBlank()})else m.photoPreview=ProfilePhotoPreview(p.optString("name")+" 갤러리",profileMediaUrl(photo.optString("url")))},contentAlignment=Alignment.Center){
        if(photo!=null)ProfileImage(m,profileMediaUrl(photo.optString("url")),"갤러리 사진",Modifier.fillMaxSize())else Icon(Icons.Rounded.Add,"갤러리 관리",Modifier.size(26.dp),tint=SoftText)
       }
      }
     }
     }
    }}
    item{CurrentPanel("소속 아티스트",action="전체보기",onAction={if(pid.isNotBlank())m.openCurrentWorkspace("profile-artists/$pid","소속 아티스트")}){
     val artists=data?.optJSONArray("artists").objects()
     BoxWithConstraints(Modifier.fillMaxWidth()){
      val cardWidth=((maxWidth-20.dp)/2.35f).coerceAtMost(150.dp)
      LazyRow(Modifier.fillMaxWidth().testTag("my-artist-shelf"),horizontalArrangement=Arrangement.spacedBy(12.dp)){
       items(artists,key={it.optString("id")}){artist->Column(Modifier.width(cardWidth).testTag("my-artist-${artist.optString("id")}").clickable{m.openProfile(artist.optString("id"),"artist")}){
       Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Raised)){
        DefaultProfileArtwork(artist.optString("name"),Modifier.fillMaxSize())
        val version=artist.optString("image_version")
        if(version.isNotBlank()&&version!="0"&&version!="null")AsyncImage(Endpoint.url("/media/artist/${artist.optString("id")}?v=$version"),"${artist.optString("name")} 아티스트 사진",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
       }
       Text(artist.optString("name"),fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
      }}
      }
     }
     if(artists.isEmpty())Text("등록된 아티스트가 없어요.",fontSize=13.sp,color=Muted)
    }}

   }else if(area=="library"){
    item{ReferenceLibrary(m)}
    item{TextButton(onClick={onToolsOpen(true)},modifier=Modifier.fillMaxWidth()){Text("레벨 · 계정 관리");Icon(Icons.Rounded.ChevronRight,null)}}
   }else item{MyInventoryContent(m)}
  }
 }
 if(rankingOpen)MyGiftRankingPage(m,p.optString("id")){rankingOpen=false}
 allWorks?.let{kind->ReferenceWorksPage(m,kind,tracks,covers,dubbings,manageOwn=kind=="creations",initialSelection=selectedWork){allWorks=null;selectedWork=null}}
 if(toolsOpen)AppPage("내 보관함 관리",{onToolsOpen(false)}){Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
  CurrentPanel("내 지갑",action="골드 충전",onAction={m.billingInitialTab="gold";m.showBilling=true}){MyWalletPanel(m)}
  PlayerHomePanel(m,compact=true)
  CurrentPanel("바로가기"){MusicLibraryShortcuts(m,compact=true,inventoryFirst=true)}
  CurrentActivityLinks(m)
 }}
}
@Composable private fun CurrentActivityLinks(m:MusicModel){
 CurrentPanel("내 활동"){
  listOf("보유 이용권","내 크루","최근 활동","알림 기록","설정","계정 관리").forEach{label->TextButton(onClick={when(label){"보유 이용권"->m.showBilling=true;"내 크루"->{m.selectTab(3);m.communityMode="crews"};"최근 활동","알림 기록"->m.showNotifications=true;"설정"->m.openAccountSettings();else->m.showAccount=true}},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp),colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text(label,Modifier.weight(1f),fontSize=14.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Muted)}}
 }
}
