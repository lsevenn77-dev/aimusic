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

private class CurrentRead {
 var data by mutableStateOf<JSONObject?>(null)
 var loading by mutableStateOf(true)
 var error by mutableStateOf<String?>(null)
 var revision by mutableIntStateOf(0)
 fun retry(){revision++}
}
@Composable private fun currentRead(m:MusicModel,path:String,enabled:Boolean=true,poll:Long=0):CurrentRead {
 val account=m.user?.optString("id")
 val read=remember(path,account){CurrentRead()}
 val lifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
 LaunchedEffect(path,account,enabled,read.revision){
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
@Composable private fun ReadStatus(read:CurrentRead){
 if(read.loading)LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical=8.dp),color=Pink,trackColor=Stroke)
 read.error?.let{Column(Modifier.fillMaxWidth().padding(vertical=12.dp)){Text(it,color=Muted,fontSize=14.sp);TextButton(onClick=read::retry){Text("다시 불러오기")}}}
}
@Composable internal fun CurrentTabs(items:List<Pair<String,String>>,selected:String,tag:String,onSelect:(String)->Unit){
 Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).testTag(tag)){
  items.forEach{(key,label)->
   Column(Modifier.width(IntrinsicSize.Max).selectable(selected==key,role=Role.Tab,onClick={onSelect(key)}).testTag("$tag-$key").heightIn(min=48.dp).padding(horizontal=14.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
    Text(label,color=if(selected==key)Pink else Muted,fontWeight=if(selected==key)FontWeight.SemiBold else FontWeight.Normal,fontSize=15.sp,modifier=Modifier.padding(vertical=12.dp))
    Box(Modifier.fillMaxWidth().height(2.dp).background(if(selected==key)Pink else Color.Transparent))
   }
  }
 }
}
@Composable private fun CurrentHeader(title:String,menu:()->Unit){
 Row(Modifier.fillMaxWidth().padding(start=20.dp,end=8.dp).heightIn(min=56.dp),verticalAlignment=Alignment.CenterVertically){Text(title,fontSize=24.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f));IconButton(onClick=menu){Icon(Icons.Rounded.Menu,"전체 메뉴",tint=SoftText)}}
}

@Composable internal fun CurrentPlayScreen(m:MusicModel,sing:(Song)->Unit,resumeDraft:(JSONObject)->Unit,menu:()->Unit){
 var query by rememberSaveable(m.playMode,m.playSection){mutableStateOf("")}
 var kind by rememberSaveable{mutableStateOf("all")}
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
  match&&!(mode=="song"&&section=="duets"&&(!r.flag("duet_open")||r.optString("user_id")==m.user?.optString("id")||r.optString("duet_parent_id").let{it.isNotBlank()&&it!="null"}))
 }
 Column(Modifier.fillMaxSize().testTag("current-play")){
  CurrentHeader("플레이",menu)
  CurrentTabs(listOf("song" to "노래","dubbing" to "더빙","browse" to "둘러보기"),mode,"play-main"){m.playMode=it;m.playSection=if(it=="dubbing")"discover" else "recommended"}
  CurrentTabs(sections,section,"play-section"){m.playSection=it}
  if(mode=="song"&&section=="drafts"){
   if(gated)SignInEntry(m)else RecordingDraftsContent(m,resumeDraft)
  }else LazyColumn(Modifier.fillMaxSize().testTag("play-results"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   if(gated)item{SignInEntry(m)}else{
    if(mode=="dubbing")item{BrandButton(onClick={m.openCurrentWorkspace("dubbing/new","더빙 만들기")},modifier=Modifier.fillMaxWidth().testTag("dubbing-create")){Icon(Icons.Rounded.Add,null);Text("더빙 만들기")}}
    item{OutlinedTextField(query,{query=it},singleLine=true,placeholder={Text(if(mode=="song")"곡 · 아티스트 · 제작자 검색" else "작품 · 창작자 검색",fontSize=14.sp)},leadingIcon={Icon(Icons.Rounded.Search,null)},modifier=Modifier.fillMaxWidth().testTag("play-search"),shape=RoundedCornerShape(12.dp))}
    if(mode=="browse")item{CurrentTabs(listOf("all" to "전체","solo" to "솔로","duet" to "듀엣","dubbing" to "더빙"),kind,"play-kind"){kind=it}}
    item{ReadStatus(read)}
    items(filtered,key={it.optString("id")}){r->
     if(mode=="dubbing"||r.optString("type")=="dubbing"||r.optString("kind")=="dubbing")CurrentDubbingRow(r,if(mode=="dubbing")section else "complete",m)
     else CurrentSongRow(Song(r),m,filtered.filter{it.optString("type")!="dubbing"}.map{Song(it)},if(mode=="song")sing else null)
    }
    if(filtered.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty(if(query.isNotBlank())"검색 결과가 없어요" else "아직 표시할 작품이 없어요",if(query.isNotBlank())"다른 제목이나 창작자를 찾아보세요." else "공개된 작품이 여기에 모여요.")}
    if(read.data?.has("nextOffset")==true&&!read.data!!.isNull("nextOffset"))item{OutlinedButton(onClick={offset=read.data!!.optInt("nextOffset")},enabled=!read.loading,modifier=Modifier.fillMaxWidth()){Text("더 보기")}}
   }
  }
 }
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
@Composable private fun CurrentEmpty(title:String,body:String=""){
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
  if(sing!=null)OutlinedButton(onClick={m.singTarget(song,sing)},modifier=Modifier.fillMaxWidth().padding(top=8.dp).testTag("current-sing-${song.id}"),shape=RoundedCornerShape(12.dp)){Icon(Icons.Rounded.Mic,null,Modifier.size(18.dp));Text(if(song.cover)"듀엣 참여" else "노래하기",Modifier.padding(start=6.dp))}
  HorizontalDivider(Modifier.padding(top=12.dp),color=Stroke.copy(alpha=.6f))
 }
}
private val NoneDescription:String?=null
@Composable private fun CurrentDubbingRow(p:JSONObject,section:String,m:MusicModel){
 val id=p.optString("id");val states=mapOf("script_ready" to "초안","recruiting" to "배역 모집 중","recording" to "녹음 중","in_progress" to "녹음 중","mixing" to "믹싱 중","complete" to "완료")
 Surface(onClick={if(CurrentNavigation.safeID(id))m.openCurrentWorkspace("dubbing/$id",p.optString("title","더빙"))},color=Panel,shape=RoundedCornerShape(16.dp),modifier=Modifier.fillMaxWidth().testTag("dubbing-project-$id")){
  Row(Modifier.padding(14.dp),verticalAlignment=Alignment.CenterVertically){
   Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(Raised),contentAlignment=Alignment.Center){
    Icon(Icons.Rounded.RecordVoiceOver,null,Modifier.size(24.dp),tint=Muted)
    val genres=p.optJSONArray("genres");val genre=genres?.optString(0).orEmpty()
    val slug=mapOf("SF" to "sf","이세계물" to "isekai","판타지" to "fantasy","사극" to "historical","로맨스" to "romance","액션" to "action","코미디" to "comedy","첩보" to "spy","공포" to "horror","스릴러" to "thriller","미스터리" to "mystery","일상" to "daily","감동" to "moving")[genre]?:"daily"
    AsyncImage(Endpoint.url("/assets/dubbing-genres/$slug.webp"),"더빙 장르 이미지",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
   }
   Column(Modifier.weight(1f).padding(horizontal=12.dp)){
    Text(p.optString("title"),fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis)
    Text(p.optString("ownerName",p.optString("owner_name")),fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=5.dp))
    Text(if(section=="discover")"극본 · ${p.optInt("roleCount")}개 배역" else "${states[p.optString("state")]?:"제작 중"} · ${p.optInt("participants")} / ${p.optInt("roleCount")}명",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=3.dp))
   }
   Icon(Icons.Rounded.ChevronRight,if(section=="join")"배역 보기" else "작품 보기",tint=Muted)
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
  CurrentTabs(listOf("voice" to "토킹룸","crews" to "크루","rankings" to "랭킹"),m.communityMode,"community-main"){m.communityMode=it}
  when(m.communityMode){
   "crews"->Column(Modifier.padding(20.dp)){Text("음악으로 만나는 모임",fontSize=20.sp,fontWeight=FontWeight.SemiBold);BrandButton(onClick={m.openCurrentWorkspace("community/crews","크루 둘러보기")},modifier=Modifier.fillMaxWidth().padding(top=12.dp).testTag("current-crews-open")){Text("검색 · 필터 · 크루 만들기")};CurrentCrewDirectory(m)}
   "rankings"->CurrentRankings(m)
   else->LazyColumn(Modifier.fillMaxSize().testTag("voice-lobby"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
    item{Text("지금 열려 있는 토킹룸",fontSize=20.sp,fontWeight=FontWeight.SemiBold);Text("공개된 방만 보여줘요",fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=8.dp))}
    item{Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
     OutlinedTextField(query,{query=it},singleLine=true,placeholder={Text("방 제목·방장 검색",fontSize=14.sp,maxLines=1,overflow=TextOverflow.Ellipsis)},leadingIcon={Icon(Icons.Rounded.Search,null,Modifier.size(20.dp))},modifier=Modifier.weight(1f).testTag("voice-search"),shape=RoundedCornerShape(12.dp))
     BrandButton(onClick={m.openCurrentWorkspace("voice/create","방 만들기")},enabled=status.data?.optBoolean("enabled")==true,modifier=Modifier.width(112.dp).heightIn(min=56.dp).testTag("voice-create"),contentPadding=PaddingValues(horizontal=10.dp)){Icon(Icons.Rounded.Add,null,Modifier.size(18.dp));Text("방 만들기",fontSize=14.sp,maxLines=2)}
    }}
    item{ReadStatus(status);ReadStatus(read)}
    items(rooms.chunked(2)){row->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
     row.forEach{r->val id=r.optString("id");Surface(onClick={if(CurrentNavigation.safeID(id))m.openCurrentWorkspace("voice/$id",r.optString("title","토킹룸"))},color=Panel,shape=RoundedCornerShape(16.dp),modifier=Modifier.weight(1f).testTag("voice-room-$id")){
      Column{Box(Modifier.fillMaxWidth().aspectRatio(1.25f).background(Brush.linearGradient(listOf(Raised,Panel))),contentAlignment=Alignment.Center){Icon(Icons.Rounded.Headphones,null,Modifier.size(32.dp),tint=Muted);Text("${r.optInt("member_count")}명",Modifier.align(Alignment.BottomEnd).padding(10.dp),fontSize=12.sp,color=SoftText)};Column(Modifier.padding(12.dp)){Text(r.optString("title"),fontWeight=FontWeight.SemiBold,fontSize=15.sp,maxLines=2,overflow=TextOverflow.Ellipsis);Text(r.optString("host_name"),fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=5.dp))}}
     }};if(row.size==1)Spacer(Modifier.weight(1f))
    }}
    if(rooms.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty(if(status.data?.optBoolean("enabled")==false)"토킹룸 연결을 준비하고 있어요" else if(query.isBlank())"아직 열린 공개 토킹룸이 없어요." else "검색 결과가 없어요")}
   }
  }
 }
}
@Composable private fun CurrentCrewDirectory(m:MusicModel){
 val read=currentRead(m,"/api/crews?summary=1",poll=30000)
 var query by rememberSaveable{mutableStateOf("")}
 val crews=read.data?.optJSONArray("crews").objects().filter{it.optString("name").contains(query,true)}
 Column(Modifier.fillMaxSize()){
  OutlinedTextField(query,{query=it},singleLine=true,placeholder={Text("크루 검색")},modifier=Modifier.fillMaxWidth().padding(vertical=12.dp),shape=RoundedCornerShape(12.dp));ReadStatus(read)
  LazyColumn(verticalArrangement=Arrangement.spacedBy(12.dp)){
   items(crews,key={it.optString("id")}){c->Surface(onClick={m.openCurrentWorkspace("crew/${c.optString("id")}",c.optString("name"))},color=Panel,shape=RoundedCornerShape(16.dp),modifier=Modifier.fillMaxWidth()){Row(Modifier.padding(14.dp),verticalAlignment=Alignment.CenterVertically){Icon(Icons.Rounded.Groups,null,tint=Muted);Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(c.optString("name"),fontWeight=FontWeight.SemiBold);Text("LV.${c.optInt("level",1)} · ${c.optInt("members")}명",color=Muted,fontSize=13.sp)};Icon(Icons.Rounded.ChevronRight,"크루 보기",tint=Muted)}}}
   if(crews.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty("조건에 맞는 크루가 없어요")}
  }
 }
}
@Composable private fun CurrentRankings(m:MusicModel){
 var category by rememberSaveable{mutableStateOf("work")};var period by rememberSaveable{mutableStateOf("week")};var kind by rememberSaveable{mutableStateOf("solo")}
 val read=currentRead(m,"/api/community/rankings?category=$category&period=$period&workKind=$kind")
 Column(Modifier.fillMaxSize()){
  CurrentTabs(listOf("work" to "작품 랭킹","aiArtist" to "AI 아티스트","relationship" to "관계 랭킹","crew" to "크루 랭킹","dubbing" to "더빙 랭킹"),category,"ranking-category"){category=it}
  if(category=="work")CurrentTabs(listOf("solo" to "솔로","duet" to "듀엣","dubbing" to "더빙"),kind,"ranking-kind"){kind=it}
  CurrentTabs(listOf("week" to "주간","month" to "월간"),period,"ranking-period"){period=it}
  LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   item{ReadStatus(read)}
   itemsIndexed(read.data?.optJSONArray("rows").objects()){index,r->Row(Modifier.fillMaxWidth().padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){Text("${index+1}",fontSize=20.sp,color=Muted,modifier=Modifier.width(36.dp));Column(Modifier.weight(1f)){Text(r.optString("name"),fontWeight=FontWeight.SemiBold);Text(r.optString("detail"),fontSize=12.sp,color=Muted)};Text("${r.optLong("score")}점",fontSize=14.sp)}}
   if(read.data?.optJSONArray("rows").objects().isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty("아직 집계된 순위가 없어요.",read.data?.optString("message").orEmpty())}
  }
 }
}

@Composable internal fun CurrentMyScreen(m:MusicModel){
 var area by rememberSaveable{mutableStateOf("works")};var kind by rememberSaveable{mutableStateOf("all")}
 val self=currentRead(m,"/api/me/profile",m.user!=null)
 val pid=self.data?.optJSONObject("profile")?.optString("id").orEmpty()
 val read=currentRead(m,if(CurrentNavigation.safeID(pid))"/api/producers/$pid?dashboard=1" else "/api/me/profile",m.user!=null&&pid.isNotBlank())
 val data=read.data;val p=data?.optJSONObject("profile")?:self.data?.optJSONObject("profile")?:JSONObject()
 val tracks=data?.tracks().orEmpty();val covers=data?.tracks("covers").orEmpty();val dubbings=data?.optJSONArray("dubbings").objects()
 val gallery=data?.optJSONArray("gallery").objects()
 LazyColumn(Modifier.fillMaxSize().testTag("current-my"),contentPadding=PaddingValues(horizontal=20.dp,vertical=8.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  if(m.user==null)item{SignInEntry(m)}else{
   item{
    ReadStatus(self)
    ReadStatus(read)
    Row(verticalAlignment=Alignment.CenterVertically){
     Box(Modifier.padding(6.dp)){Avatar(p.optString("name",m.user?.optString("name")),p,64)}
     Column(Modifier.weight(1f).padding(start=14.dp)){
      Text(p.optString("name",m.user?.optString("name")),fontSize=22.sp,fontWeight=FontWeight.Bold)
      p.optLong("public_number").takeIf{it>0}?.let{Text("ID: $it",fontSize=12.sp,color=Muted)}
      data?.optJSONObject("crew")?.let{c->
       TextButton(onClick={m.openCurrentWorkspace("crew/${c.optString("id")}",c.optString("name"))}){Text(c.optString("name"))}
      }
     }
    }
    Row{
     TextButton(onClick=m::editProfile){Text("프로필 수정")}
     TextButton(onClick=m::openStudio){Text("스튜디오")}
    }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(16.dp)){
     TextButton(onClick={m.library("팔로워")},modifier=Modifier.weight(1f)){Text("${data?.optInt("followers",self.data?.optInt("follower_count")?:0)?:0} 팔로워",maxLines=2)}
     TextButton(onClick={m.library("팔로잉")},modifier=Modifier.weight(1f)){Text("${data?.optInt("following_count",0)?:0} 팔로잉",maxLines=2)}
    }
   }
   item{Section("갤러리",action="전체 보기",onAction={if(pid.isNotBlank())m.openCurrentWorkspace("profile-gallery/$pid","갤러리")});if(gallery.isEmpty())Text("아직 등록한 사진이 없어요.",color=Muted,fontSize=13.sp)else LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){items(gallery){photo->val url=photo.optString("url");AsyncImage(if(url.startsWith('/'))Endpoint.url(url)else url,"갤러리 사진",Modifier.size(104.dp).clip(RoundedCornerShape(12.dp)).clickable{m.openCurrentWorkspace("profile-gallery/$pid","갤러리")},contentScale=ContentScale.Crop)}}}
   item{CurrentTabs(listOf("works" to "내 작품","activity" to "내 활동"),area,"my-section"){area=it}}
   if(area=="works"){
    item{MusicLibraryShortcuts(m);Section("제작곡",action="전체 보기",onAction={m.library("내 제작곡")})}
    items(tracks.take(3),key={"original-"+it.id}){CurrentSongRow(it,m,tracks)}
    if(tracks.isEmpty()&&!read.loading)item{Text("등록된 제작곡이 없어요.",color=Muted,fontSize=13.sp)}
    item{Section("커버 · 듀엣 · 더빙");CurrentTabs(listOf("all" to "전체","cover" to "커버","duet" to "듀엣","dubbing" to "더빙"),kind,"my-kind"){kind=it}}
    items(covers.filter{kind=="all"||kind=="duet"&&it.raw.optString("cover_mode")=="duet"||kind=="cover"&&it.raw.optString("cover_mode")!="duet"},key={"cover-"+it.id}){CurrentSongRow(it,m,covers)}
    if(kind in listOf("all","dubbing"))items(dubbings,key={"dub-"+it.optString("id")}){CurrentDubbingRow(it,"mine",m)}
    if(covers.isEmpty()&&dubbings.isEmpty()&&!read.loading)item{Text("아직 등록된 커버·듀엣·더빙이 없어요.",fontSize=13.sp,color=Muted)}
    item{Section("소속 아티스트",action="전체 보기",onAction={if(pid.isNotBlank())m.openCurrentWorkspace("profile-artists/$pid","소속 아티스트")});val artists=data?.optJSONArray("artists").objects();artists.forEach{a->TextButton(onClick={m.openProfile(a.optString("id"),"artist")}){Text(a.optString("name"))}};if(artists.isEmpty())Text("등록된 아티스트가 없어요.",fontSize=13.sp,color=Muted)}
    item{Section("스튜디오");BrandButton(onClick=m::openStudio,modifier=Modifier.fillMaxWidth()){Text("스튜디오 바로가기")};TextButton(onClick={m.selectTab(2);m.playMode="song";m.playSection="duets"}){Text("참여 가능한 듀엣")};TextButton(onClick={m.selectTab(2);m.playMode="dubbing";m.playSection="join"}){Text("참여 가능한 더빙")}}
   }else{
    item{MyWalletPanel(m);PlayerHomePanel(m,compact=true);MusicLibraryShortcuts(m)}
    item{CurrentActivityLinks(m)}
   }
  }
 }
}
@Composable private fun CurrentActivityLinks(m:MusicModel){
 Column{
  Section("내 활동")
  listOf("보유 이용권","인벤토리","나의 관계","내 크루","받은 선물","최근 활동","알림 기록","계정 관리").forEach{label->TextButton(onClick={when(label){"보유 이용권"->m.showBilling=true;"인벤토리"->m.showInventory=true;"나의 관계"->m.openCurrentWorkspace("relations","나의 관계");"내 크루"->{m.selectTab(3);m.communityMode="crews"};"받은 선물"->m.openCurrentWorkspace("gift-inventory","받은 선물");"최근 활동","알림 기록"->m.showNotifications=true;else->m.showAccount=true}},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp),colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text(label,Modifier.weight(1f));Icon(Icons.Rounded.ChevronRight,null,tint=Muted)}}
 }
}
