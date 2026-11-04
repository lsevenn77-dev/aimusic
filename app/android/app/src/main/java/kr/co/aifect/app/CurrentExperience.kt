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
 val read=remember(path,account){CurrentRead()}
 val lifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
 LaunchedEffect(path,account,enabled,read.revision,m.trackContentRevision){
  if(!enabled){read.loading=false;return@LaunchedEffect}
  lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){
   do{
    read.loading=read.data==null
    try{val d=m.api.call(path,fresh=true);if(account==m.user?.optString("id")){read.data=d;read.error=null}}
    catch(e:Exception){if(e is CancellationException)throw e;read.error=e.message?:"불러오지 못했어요."}
    finally{read.loading=false}
    if(poll>0)delay(poll)
   }while(poll>0)
  }
 }
 return read
}
@Composable internal fun ReadStatus(read:CurrentRead){
 if(read.loading)LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical=8.dp),color=Pink,trackColor=Stroke)
 read.error?.let{Column(Modifier.fillMaxWidth().padding(vertical=12.dp)){Text(it,color=Muted,fontSize=14.sp);TextButton(onClick=read::retry){Text("다시 불러오기")}}}
}
@Composable internal fun CurrentTabs(items:List<Pair<String,String>>,selected:String,tag:String,onSelect:(String)->Unit){
 val equalWidth=tag in setOf("community-main","play-main","my-section","inbox-filter")
 Column(Modifier.fillMaxWidth()){
 Row(Modifier.fillMaxWidth().then(if(equalWidth)Modifier else Modifier.horizontalScroll(rememberScrollState())).padding(horizontal=if(tag.startsWith("my-"))0.dp else 20.dp).testTag(tag),horizontalArrangement=Arrangement.spacedBy(if(equalWidth)0.dp else 20.dp)){
  items.forEach{(key,label)->
   Column((if(equalWidth)Modifier.weight(1f)else Modifier.width(IntrinsicSize.Max)).selectable(selected==key,role=Role.Tab,onClick={onSelect(key)}).testTag("$tag-$key").heightIn(min=48.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
    Text(label,color=if(selected==key)Pink else Muted,fontWeight=if(selected==key)FontWeight.SemiBold else FontWeight.Medium,fontSize=13.sp,lineHeight=18.sp,modifier=Modifier.padding(vertical=11.dp))
    Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).then(if(selected==key)Modifier.background(BrandGradient)else Modifier))
   }
  }
 }
 HorizontalDivider(color=Stroke)
 }
}
@Composable private fun CurrentHeader(title:String,menu:()->Unit){
 Row(Modifier.fillMaxWidth().padding(start=20.dp,end=8.dp).heightIn(min=56.dp),verticalAlignment=Alignment.CenterVertically){Text(title,fontSize=24.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f));IconButton(onClick=menu){Icon(Icons.Rounded.Menu,"전체 메뉴",tint=SoftText)}}
}

@Composable internal fun CurrentPlayScreen(m:MusicModel,sing:(Song)->Unit,resumeDraft:(JSONObject)->Unit,menu:()->Unit){
 var query by rememberSaveable(m.playMode,m.playSection){mutableStateOf("")}
 var kind by rememberSaveable{mutableStateOf("all")}
 var choosingKind by remember{mutableStateOf(false)}
 var offset by rememberSaveable(m.playMode,m.playSection,kind){mutableIntStateOf(0)}
 val mode=m.playMode;val section=m.playSection
 val sections=when(mode){"dubbing"->listOf("discover" to "작품찾기","join" to "더빙참여","mine" to "내 작업");"browse"->listOf("recommended" to "추천","following" to "팔로잉","popular" to "인기","latest" to "최신");else->listOf("recommended" to "추천곡","duets" to "듀엣참여","latest" to "최신곡","drafts" to "내 초안")}
 val gated=(mode=="song"&&section=="drafts"||mode=="dubbing"&&section=="mine"||mode=="browse"&&section=="following")&&m.user==null
 val base=CurrentNavigation.playPath(mode,section,kind)
 val path=base+(if('?' in base)"&" else "?")+"offset=$offset"
 val read=currentRead(m,path,enabled=!gated&&!(mode=="song"&&section=="drafts"))
 var records by remember(mode,section,kind,m.user?.optString("id")){mutableStateOf<List<JSONObject>>(emptyList())}
 LaunchedEffect(read.data){read.data?.let{d->val incoming=d.optJSONArray(if(mode=="dubbing")"projects" else if(mode=="browse")"works" else "tracks").objects();records=(if(offset==0)incoming else records+incoming).distinctBy{it.optString("id")}}}
 val filtered=records.filter{r->
  val match=query.isBlank()||listOf("title","artist","producer","ownerName","owner_name").any{r.optString(it).contains(query.trim(),true)}
  match&&(mode!="song"||section!="duets"||Song(r).openDuetFor(m.user?.optString("id")))&&(mode!="song"||section!="latest"||Song(r).cover)
 }
 Column(Modifier.fillMaxSize().testTag("current-play")){
  CurrentHeader("플레이",menu)
  CurrentTabs(listOf("song" to "노래","dubbing" to "더빙","browse" to "둘러보기"),mode,"play-main"){m.playMode=it;m.playSection=if(it=="dubbing")"discover" else "recommended"}
  PlaySections(sections,section){m.playSection=it}
  if(mode=="song"&&section=="drafts"){
   if(gated)SignInEntry(m)else RecordingDraftsContent(m,resumeDraft)
  }else LazyColumn(Modifier.fillMaxSize().testTag("play-results"),contentPadding=PaddingValues(16.dp,4.dp,16.dp,24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
   if(gated)item{SignInEntry(m)}else{
    if(mode=="dubbing")item{BrandButton(onClick={m.openCurrentWorkspace("dubbing/new","더빙 만들기")},modifier=Modifier.fillMaxWidth().testTag("dubbing-create")){Icon(Icons.Rounded.Add,null);Text("더빙 만들기")}}
    item{CurrentSearch(query,{query=it},if(mode=="song")"곡 · 아티스트 · 제작자 검색" else "작품 · 창작자 검색","play-search")}
    if(mode=="browse")item{SelectionField("작품 유형",mapOf("all" to "전체","solo" to "솔로","duet" to "듀엣","dubbing" to "더빙").getValue(kind),"play-kind-picker",Modifier.fillMaxWidth()){choosingKind=true}}
    if(read.loading||read.error!=null)item{ReadStatus(read)}
    items(filtered.chunked(2),key={row->row.joinToString("|"){it.optString("id")}}){row->
     Row(Modifier.fillMaxWidth().testTag("play-grid-row-"+row.first().optString("id")),horizontalArrangement=Arrangement.spacedBy(14.dp)){
      row.forEach{r->Box(Modifier.weight(1f).testTag("play-grid-card-"+r.optString("id"))){
       when{
        mode=="dubbing"->CurrentPlayDubbingCard(r,section,m)
        mode=="song"&&section=="duets"->DuetParticipationRow(Song(r),m,filtered.map{Song(it)},sing)
        r.optString("type")=="dubbing"||r.optString("kind")=="dubbing"->CurrentDubbingCard(r,m)
        else->CurrentSongCard(Song(r),m,filtered.filter{it.optString("type")!="dubbing"}.map{Song(it)},if(mode=="song")sing else null)
       }
      }}
      if(row.size==1)Spacer(Modifier.weight(1f))
     }
    }
    if(filtered.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty(if(query.isNotBlank())"검색 결과가 없어요" else "아직 표시할 작품이 없어요",if(query.isNotBlank())"다른 제목이나 창작자를 찾아보세요." else "공개된 작품이 여기에 모여요.")}
    if(read.data?.has("nextOffset")==true&&!read.data!!.isNull("nextOffset"))item{OutlinedButton(onClick={offset=read.data!!.optInt("nextOffset")},enabled=!read.loading,modifier=Modifier.fillMaxWidth()){Text("더 보기")}}
   }
  }
 }
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
@Composable private fun CurrentPlayDubbingCard(p:JSONObject,section:String,m:MusicModel){
 val id=p.optString("id");val states=mapOf("script_ready" to "초안","recruiting" to "배역 모집 중","recording" to "녹음 중","in_progress" to "녹음 중","mixing" to "믹싱 중","complete" to "완료")
 fun open(){if(CurrentNavigation.safeID(id))m.openCurrentWorkspace("dubbing/$id",p.optString("title","더빙"))}
 Column(Modifier.fillMaxWidth().testTag("dubbing-project-$id")){
  Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Raised).clickable{open()}.testTag("dubbing-card-art-$id")){
   Icon(Icons.Rounded.RecordVoiceOver,null,Modifier.size(32.dp).align(Alignment.Center),tint=Muted)
   AsyncImage(currentDubbingImage(p),"더빙 장르 이미지",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
   BrandPlayButton(if(p.optString("state")=="complete")"${p.optString("title")} 더빙 듣기"else "${p.optString("title")} 작품 보기",::open,Modifier.align(Alignment.BottomEnd).padding(5.dp),diameter=34.dp)
  }
  Row(Modifier.fillMaxWidth().heightIn(min=44.dp).clickable{open()},verticalAlignment=Alignment.CenterVertically){
   Icon(Icons.Rounded.RecordVoiceOver,null,Modifier.size(15.dp),tint=Muted);Spacer(Modifier.width(4.dp))
   Text(p.optString("title"),fontSize=15.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
  }
  Text(p.optString("ownerName",p.optString("owner_name")),fontSize=13.sp,lineHeight=19.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
  Text(if(section=="discover")"극본 · ${p.optInt("roleCount")}개 배역" else "${states[p.optString("state")]?:"제작 중"} · ${p.optInt("participants")} / ${p.optInt("roleCount")}명",fontSize=12.sp,lineHeight=18.sp,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=3.dp).testTag("dubbing-card-status-$id"))
  OutlinedButton(onClick=::open,modifier=Modifier.fillMaxWidth().padding(top=10.dp).heightIn(min=44.dp).testTag("dubbing-card-open-$id"),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,SoftText.copy(alpha=.3f)),colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText),contentPadding=PaddingValues(horizontal=8.dp,vertical=8.dp)){
   Text(when(section){"join"->"배역 보기";"mine"->"작업 이어가기";else->"극본 보기"},fontSize=13.sp,lineHeight=18.sp)
   }
 }
}

@Composable internal fun CurrentCommunityScreen(m:MusicModel,menu:()->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 val status=currentRead(m,"/api/voice/status",m.communityMode=="voice")
 val read=currentRead(m,"/api/voice/public-rooms",m.communityMode=="voice"&&status.data?.optBoolean("enabled")==true,poll=20000)
 val rooms=read.data?.optJSONArray("rooms").objects().filter{query.isBlank()||(it.optString("title")+" "+it.optString("host_name")).contains(query.trim(),true)}
 Column(Modifier.fillMaxSize().testTag("current-community")){
  CurrentHeader("커뮤니티",menu)
  CurrentTabs(listOf("voice" to "라이브","crews" to "크루","rankings" to "랭킹"),m.communityMode,"community-main"){m.communityMode=it}
  when(m.communityMode){
   "crews"->NativeCrewHome(m)
   "rankings"->CurrentRankings(m)
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
@Composable internal fun CurrentMyScreen(m:MusicModel){
 var area by rememberSaveable{mutableStateOf("works")}
 var allWorks by rememberSaveable{mutableStateOf<String?>(null)}
 var toolsOpen by rememberSaveable{mutableStateOf(false)}
 var rankingOpen by rememberSaveable{mutableStateOf(false)}
 val clipboard=androidx.compose.ui.platform.LocalClipboardManager.current
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
    Row(verticalAlignment=Alignment.CenterVertically){
     Box(Modifier.testTag("my-avatar-open").clickable{m.viewProfilePhoto(p)}){Avatar(p.optString("name",m.user?.optString("name").orEmpty()),p,96)}
     Column(Modifier.weight(1f).padding(start=12.dp)){
      Text(p.optString("name",m.user?.optString("name").orEmpty()),fontSize=23.sp,lineHeight=30.sp,fontWeight=FontWeight.Bold)
      val code=sequenceOf(data?.optString("public_id").orEmpty(),p.optString("public_id"),m.user?.optString("public_id").orEmpty()).firstOrNull{it.matches(Regex("[A-Z]{3}[0-9]{4}"))}.orEmpty()
      if(code.isBlank())Text("ID 발급 확인 중",fontSize=11.sp,lineHeight=15.sp,color=Muted)
      else Text("ID $code  ⧉",fontSize=11.sp,lineHeight=15.sp,color=Muted,modifier=Modifier.heightIn(min=26.dp).wrapContentHeight().clickable{clipboard.setText(androidx.compose.ui.text.AnnotatedString(code));m.notice="ID를 복사했어요."})
      val crew=data?.optJSONObject("crew")
      Text(crew?.optString("name")?:"소속 크루 없음",fontSize=11.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.padding(top=2.dp).clickable{if(crew!=null)m.openCurrentWorkspace("crew/${crew.optString("id")}",crew.optString("name"))else{m.selectTab(3);m.communityMode="crews"}})
     }
     Column(horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(2.dp)){
      IconButton(onClick={toolsOpen=true},modifier=Modifier.size(44.dp)){Icon(Icons.Rounded.Settings,"계정 관리",Modifier.size(24.dp))}
      TextButton(onClick={rankingOpen=true},enabled=p.optString("id").isNotBlank(),contentPadding=PaddingValues(horizontal=5.dp,vertical=0.dp),modifier=Modifier.heightIn(min=44.dp).testTag("my-gift-ranking")){Icon(Icons.Rounded.StarBorder,null,Modifier.size(15.dp));Text("선물 랭킹",fontSize=10.sp,lineHeight=14.sp,modifier=Modifier.padding(start=3.dp))}
     }
    }
    Row(Modifier.fillMaxWidth().padding(top=12.dp,bottom=12.dp),horizontalArrangement=Arrangement.SpaceEvenly,verticalAlignment=Alignment.CenterVertically){
     listOf(Triple("팔로워",data?.optInt("followers",self.optInt("follower_count"))?:0,{m.library("팔로워")}),Triple("팔로잉",data?.optInt("following_count",self.optInt("following_count"))?:0,{m.library("팔로잉")}),Triple("공개곡",data?.optInt("public_track_count",tracks.size+covers.size)?:tracks.size+covers.size,{allWorks="all"})).forEachIndexed{index,(label,count,action)->
      if(index>0)Box(Modifier.width(1.dp).height(28.dp).background(Stroke))
      Column(Modifier.weight(1f).clickable(onClick=action).padding(vertical=4.dp),horizontalAlignment=Alignment.CenterHorizontally){Text("$count",fontSize=21.sp,lineHeight=28.sp,fontWeight=FontWeight.SemiBold);Text(label,fontSize=11.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.padding(top=3.dp))}
     }
    }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     BrandButton(onClick=m::editProfile,modifier=Modifier.weight(.42f).heightIn(min=48.dp),shape=RoundedCornerShape(12.dp),contentPadding=PaddingValues(horizontal=8.dp)){Text("프로필 수정",fontSize=13.sp,fontWeight=FontWeight.SemiBold)}
     OutlinedButton(onClick=m::openStudio,modifier=Modifier.weight(.58f).heightIn(min=48.dp),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Pink.copy(alpha=.7f)),contentPadding=PaddingValues(horizontal=8.dp)){
      Icon(Icons.Rounded.Hub,null,Modifier.size(17.dp));Text("스튜디오 바로가기",Modifier.padding(start=6.dp),fontSize=12.sp,lineHeight=18.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(17.dp))
     }
    }
   }
   item{CurrentMySwitch(area){area=it}}
   if(area=="works"){
    item{CurrentPanel("갤러리",gallery.size,"전체보기",{m.galleryPreview=ProfileGalleryPreview(p.optString("name"),gallery,pid.takeIf{it.isNotBlank()})}){
     Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
      repeat(4){index->val photo=gallery.getOrNull(index)
       Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(12.dp)).border(1.dp,Stroke,RoundedCornerShape(12.dp)).clickable{if(photo==null)m.galleryPreview=ProfileGalleryPreview(p.optString("name"),gallery,pid.takeIf{it.isNotBlank()})else m.photoPreview=ProfilePhotoPreview(p.optString("name")+" 갤러리",profileMediaUrl(photo.optString("url")))},contentAlignment=Alignment.Center){
        if(photo!=null)ProfileImage(m,profileMediaUrl(photo.optString("url")),"갤러리 사진",Modifier.fillMaxSize())else Icon(Icons.Rounded.Add,"갤러리 관리",Modifier.size(26.dp),tint=SoftText)
       }
      }
     }
    }}
    item{CurrentPanel("제작곡",tracks.size,"전체보기",{allWorks="original"}){
     ReferenceWorkShelf(referenceWorks(tracks,emptyList()),m)
     if(tracks.isEmpty()&&!loading)Text("등록된 제작곡이 없어요.",color=Muted,fontSize=13.sp)
    };HorizontalDivider(color=Stroke)}
    item{Box(Modifier.testTag("my-creations-preview")){CurrentPanel("커버 · 듀엣 · 더빙",covers.size+dubbings.size,"전체보기",{allWorks="creations"}){
     ReferenceWorkShelf(referenceWorks(covers,dubbings),m)
     if(covers.isEmpty()&&dubbings.isEmpty()&&!loading)Text("아직 등록된 작품이 없어요.",color=Muted,fontSize=13.sp)
    }};HorizontalDivider(color=Stroke)}
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
    item{TextButton(onClick={toolsOpen=true},modifier=Modifier.fillMaxWidth()){Text("레벨 · 계정 관리");Icon(Icons.Rounded.ChevronRight,null)}}
   }else item{MyInventoryContent(m)}
  }
 }
 if(rankingOpen)MyGiftRankingPage(m,p.optString("id")){rankingOpen=false}
 allWorks?.let{kind->ReferenceWorksPage(m,kind,tracks,covers,dubbings){allWorks=null}}
 if(toolsOpen)AppPage("내 보관함 관리",{toolsOpen=false}){Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
  CurrentPanel("내 지갑",action="골드 충전",onAction={m.billingInitialTab="gold";m.showBilling=true}){MyWalletPanel(m)}
  PlayerHomePanel(m,compact=true)
  CurrentPanel("바로가기"){MusicLibraryShortcuts(m,compact=true,inventoryFirst=true)}
  CurrentActivityLinks(m)
 }}
}
@Composable private fun CurrentActivityLinks(m:MusicModel){
 CurrentPanel("내 활동"){
  listOf("보유 이용권","내 크루","최근 활동","알림 기록","계정 관리").forEach{label->TextButton(onClick={when(label){"보유 이용권"->m.showBilling=true;"내 크루"->{m.selectTab(3);m.communityMode="crews"};"최근 활동","알림 기록"->m.showNotifications=true;else->m.showAccount=true}},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp),colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text(label,Modifier.weight(1f),fontSize=14.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Muted)}}
 }
}
