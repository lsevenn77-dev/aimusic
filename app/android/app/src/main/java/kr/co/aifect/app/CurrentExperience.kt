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
 val equalWidth=tag in setOf("community-main","play-main")
 Column(Modifier.fillMaxWidth()){
 Row(Modifier.fillMaxWidth().then(if(equalWidth)Modifier else Modifier.horizontalScroll(rememberScrollState())).padding(horizontal=if(tag.startsWith("my-"))0.dp else 20.dp).testTag(tag),horizontalArrangement=Arrangement.spacedBy(if(equalWidth)0.dp else 20.dp)){
  items.forEach{(key,label)->
   Column((if(equalWidth)Modifier.weight(1f)else Modifier.width(IntrinsicSize.Max)).selectable(selected==key,role=Role.Tab,onClick={onSelect(key)}).testTag("$tag-$key").heightIn(min=48.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
    Text(label,color=if(selected==key)Pink else Muted,fontWeight=if(selected==key)FontWeight.SemiBold else FontWeight.Medium,fontSize=14.sp,lineHeight=20.sp,modifier=Modifier.padding(vertical=13.dp))
    Box(Modifier.fillMaxWidth().height(2.dp).then(if(selected==key)Modifier.background(BrandGradient)else Modifier))
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
  }else LazyColumn(Modifier.fillMaxSize().testTag("play-results"),contentPadding=PaddingValues(16.dp,4.dp,16.dp,24.dp),verticalArrangement=Arrangement.spacedBy(if(mode=="song"&&section=="duets")0.dp else 16.dp)){
   if(gated)item{SignInEntry(m)}else{
    if(mode=="dubbing")item{BrandButton(onClick={m.openCurrentWorkspace("dubbing/new","더빙 만들기")},modifier=Modifier.fillMaxWidth().testTag("dubbing-create")){Icon(Icons.Rounded.Add,null);Text("더빙 만들기")}}
    item{CurrentSearch(query,{query=it},if(mode=="song")"곡 · 아티스트 · 제작자 검색" else "작품 · 창작자 검색","play-search")}
    if(mode=="browse")item{SelectionField("작품 유형",mapOf("all" to "전체","solo" to "솔로","duet" to "듀엣","dubbing" to "더빙").getValue(kind),"play-kind-picker",Modifier.fillMaxWidth()){choosingKind=true}}
    if(read.loading||read.error!=null)item{ReadStatus(read)}
    if(mode=="dubbing")items(filtered,key={it.optString("id")}){r->CurrentDubbingRow(r,section,m)}
    else if(mode=="song"&&section=="duets")items(filtered,key={it.optString("id")}){r->DuetParticipationRow(Song(r),m,filtered.map{Song(it)},sing)}
    else items(filtered.chunked(2),key={row->row.joinToString("|"){it.optString("id")}}){row->
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(14.dp)){
      row.forEach{r->Box(Modifier.weight(1f)){
       if(r.optString("type")=="dubbing"||r.optString("kind")=="dubbing")CurrentDubbingCard(r,m)
       else CurrentSongCard(Song(r),m,filtered.filter{it.optString("type")!="dubbing"}.map{Song(it)},if(mode=="song")sing else null)
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
   "crews"->CurrentCrewDirectory(m)
   "rankings"->CurrentRankings(m)
   else->LazyColumn(Modifier.fillMaxSize().testTag("voice-lobby"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
    item{Text("지금 열려 있는 토킹룸",fontSize=18.sp,fontWeight=FontWeight.SemiBold);Text("공개된 방만 보여줘요",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=6.dp))}
    item{Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
     CurrentSearch(query,{query=it},"방 제목·방장 검색","voice-search",Modifier.weight(1f))
     BrandButton(onClick={m.openCurrentWorkspace("voice/create","방 만들기")},enabled=status.data?.optBoolean("enabled")==true,modifier=Modifier.width(108.dp).heightIn(min=48.dp).testTag("voice-create"),contentPadding=PaddingValues(horizontal=10.dp)){Icon(Icons.Rounded.Add,null,Modifier.size(18.dp));Text("방 만들기",fontSize=13.sp,maxLines=2)}
    }}
    if(status.loading||status.error!=null||read.loading||read.error!=null)item{ReadStatus(status);ReadStatus(read)}
    items(rooms.chunked(2)){row->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
     row.forEach{r->Box(Modifier.weight(1f)){CurrentRoomCard(r,m)}};if(row.size==1)Spacer(Modifier.weight(1f))
    }}
    if(rooms.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty(if(status.data?.optBoolean("enabled")==false)"토킹룸 연결을 준비하고 있어요" else if(query.isBlank())"아직 열린 공개 토킹룸이 없어요." else "검색 결과가 없어요")}
   }
  }
 }
}
@Composable internal fun CurrentMyScreen(m:MusicModel){
 var area by rememberSaveable{mutableStateOf("works")};var kind by rememberSaveable{mutableStateOf("all")}
 LaunchedEffect(m.user?.optString("id")){m.refreshMyDashboard()}
 val self=m.ownProfile
 val pid=self.optJSONObject("profile")?.optString("id").orEmpty()
 val data=m.ownDashboard;val p=data?.optJSONObject("profile")?:self.optJSONObject("profile")?:JSONObject()
 val loading=m.ownDashboardLoading||data==null&&m.ownDashboardError==null
 val tracks=data?.tracks().orEmpty();val covers=data?.tracks("covers").orEmpty();val dubbings=data?.optJSONArray("dubbings").objects()
 val gallery=data?.optJSONArray("gallery").objects()
 LazyColumn(Modifier.fillMaxSize().testTag("current-my"),contentPadding=PaddingValues(start=20.dp,end=20.dp,top=8.dp,bottom=24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
  if(m.user==null)item{SignInEntry(m)}else{
   item{
    if(loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink,trackColor=Stroke)
    m.ownDashboardError?.let{Text(it,fontSize=12.sp,color=Muted);TextButton({m.refreshMyDashboard(fresh=true)}){Text("다시 불러오기")}}
    Row(verticalAlignment=Alignment.CenterVertically){
     Box(Modifier.testTag("my-avatar-open").clickable{m.viewProfilePhoto(p)}){Avatar(p.optString("name",m.user?.optString("name").orEmpty()),p,80)}
     Column(Modifier.weight(1f).padding(start=14.dp)){
      Text(p.optString("name",m.user?.optString("name").orEmpty()),fontSize=21.sp,lineHeight=28.sp,fontWeight=FontWeight.Bold)
      val crew=data?.optJSONObject("crew")
      if(crew!=null)Text(crew.optString("name"),fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=6.dp).clickable{m.openCurrentWorkspace("crew/${crew.optString("id")}",crew.optString("name"))})
      else Text("소속 크루 없음",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=6.dp))
      Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
       Text("${data?.optInt("followers",self.optInt("follower_count"))?:0} 팔로워",fontSize=12.sp,color=SoftText,modifier=Modifier.weight(1f).heightIn(min=44.dp).wrapContentHeight().clickable{m.library("팔로워")})
       Text("${data?.optInt("following_count",0)?:0} 팔로잉",fontSize=12.sp,color=SoftText,modifier=Modifier.weight(1f).heightIn(min=44.dp).wrapContentHeight().clickable{m.library("팔로잉")})
      }
     }
    }
    Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     BrandButton(onClick=m::editProfile,modifier=Modifier.weight(1f).height(48.dp),contentPadding=PaddingValues(8.dp)){Text("프로필 수정",fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold)}
     OutlinedButton(onClick=m::openStudio,modifier=Modifier.weight(1f).height(48.dp),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,SoftText.copy(alpha=.3f)),colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText),contentPadding=PaddingValues(8.dp)){Text("스튜디오",fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold)}
    }
   }
   item{CurrentPanel("갤러리",gallery.size,"전체보기",{if(pid.isNotBlank())m.openCurrentWorkspace("profile-gallery/$pid","갤러리")}){
    if(gallery.isEmpty()&&loading)Row(horizontalArrangement=Arrangement.spacedBy(12.dp),modifier=Modifier.testTag("my-gallery-loading")){repeat(2){Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(10.dp)).background(Raised))}}
    else if(gallery.isEmpty())Text("아직 등록한 사진이 없어요.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(bottom=12.dp))
    else BoxWithConstraints(Modifier.fillMaxWidth()){
     val size=((maxWidth-12.dp)/2).coerceAtMost(156.dp)
     LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){items(gallery){photo->val url=photo.optString("url");AsyncImage(if(url.startsWith('/'))Endpoint.url(url)else url,"갤러리 사진",Modifier.size(size).clip(RoundedCornerShape(10.dp)).clickable{m.openCurrentWorkspace("profile-gallery/$pid","갤러리")},contentScale=ContentScale.Crop)}}
    }
   }}
   item{CurrentMySwitch(area){area=it}}
   if(area=="works"){
    item{CurrentPanel("제작곡",tracks.size,"전체보기",{m.library("내 제작곡")}){
     if(tracks.isEmpty()&&!loading)Text("등록된 제작곡이 없어요.",color=Muted,fontSize=13.sp)
     else CurrentSongGrid(tracks.take(4),m,tracks)
    }}
    item{CurrentPanel("커버 · 듀엣 · 더빙",covers.size+dubbings.size){
     CurrentTabs(listOf("all" to "전체","cover" to "커버","duet" to "듀엣","dubbing" to "더빙"),kind,"my-kind"){kind=it}
     Spacer(Modifier.height(16.dp))
     val visible=covers.filter{kind=="all"||kind=="duet"&&it.raw.optString("cover_mode")=="duet"||kind=="cover"&&it.raw.optString("cover_mode")!="duet"}
     CurrentSongGrid(visible,m,covers)
     if(kind in listOf("all","dubbing"))dubbings.chunked(2).forEach{row->Row(Modifier.padding(top=16.dp),horizontalArrangement=Arrangement.spacedBy(14.dp)){row.forEach{dub->Box(Modifier.weight(1f)){CurrentDubbingCard(dub,m)}};if(row.size==1)Spacer(Modifier.weight(1f))}}
     if(visible.isEmpty()&&(kind !in listOf("all","dubbing")||dubbings.isEmpty())&&!loading)Text("아직 등록된 작품이 없어요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(vertical=12.dp))
    }}
    item{CurrentPanel("소속 아티스트",action="전체보기",onAction={if(pid.isNotBlank())m.openCurrentWorkspace("profile-artists/$pid","소속 아티스트")}){
     val artists=data?.optJSONArray("artists").objects()
     artists.chunked(2).forEach{row->Row(Modifier.fillMaxWidth().padding(bottom=12.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)){
      row.forEach{artist->Column(Modifier.weight(1f).testTag("my-artist-${artist.optString("id")}").clickable{m.openProfile(artist.optString("id"),"artist")}){
       Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Raised)){
        DefaultProfileArtwork(artist.optString("name"),Modifier.fillMaxSize())
        val version=artist.optString("image_version")
        if(version.isNotBlank()&&version!="0"&&version!="null")AsyncImage(Endpoint.url("/media/artist/${artist.optString("id")}?v=$version"),"${artist.optString("name")} 아티스트 사진",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
       }
       Text(artist.optString("name"),fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=8.dp))
      }}
      if(row.size==1)Spacer(Modifier.weight(1f))
     }}
     if(artists.isEmpty())Text("등록된 아티스트가 없어요.",fontSize=13.sp,color=Muted)
    }}
    item{CurrentPanel("스튜디오"){
     Text("나만의 음악과 더빙을 제작하고 관리해보세요.",fontSize=13.sp,lineHeight=20.sp,color=Muted)
     BrandButton(onClick=m::openStudio,modifier=Modifier.fillMaxWidth().padding(top=12.dp)){Text("스튜디오 바로가기",fontSize=13.sp)}
    }}
    item{CurrentPanel("참여 가능한 작품"){
     TextButton(onClick={m.selectTab(2);m.playMode="song";m.playSection="duets"},colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text("참여 가능한 듀엣",fontSize=14.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp))}
     TextButton(onClick={m.selectTab(2);m.playMode="dubbing";m.playSection="join"},colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text("참여 가능한 더빙",fontSize=14.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp))}
    }}
   }else{
    item{CurrentPanel("내 지갑",action="골드 충전",onAction={m.billingInitialTab="gold";m.showBilling=true}){MyWalletPanel(m)}}
    item{PlayerHomePanel(m,compact=true)}
    item{CurrentPanel("바로가기"){MusicLibraryShortcuts(m,compact=true,inventoryFirst=true)}}
    item{CurrentActivityLinks(m)}
   }
  }
 }
}
@Composable private fun CurrentActivityLinks(m:MusicModel){
 CurrentPanel("내 활동"){
  listOf("보유 이용권","내 크루","최근 활동","알림 기록","계정 관리").forEach{label->TextButton(onClick={when(label){"보유 이용권"->m.showBilling=true;"내 크루"->{m.selectTab(3);m.communityMode="crews"};"최근 활동","알림 기록"->m.showNotifications=true;else->m.showAccount=true}},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp),colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text(label,Modifier.weight(1f),fontSize=14.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Muted)}}
 }
}
