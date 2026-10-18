@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class,androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import org.json.JSONObject

/** Saving always keeps this recording's ID, never silently substitutes its original. */
@Composable internal fun SaveMusicButton(song:Song,m:MusicModel,compact:Boolean=false){
 TextButton(onClick={m.pickPlaylist(song)},enabled=!m.busy,colors=ButtonDefaults.textButtonColors(contentColor=SoftText),contentPadding=PaddingValues(horizontal=8.dp,vertical=4.dp)){
  Icon(Icons.AutoMirrored.Rounded.QueueMusic,null,Modifier.size(18.dp))
  Text(if(compact)"담기" else "플레이리스트 담기",fontSize=if(compact)12.sp else 14.sp,modifier=Modifier.padding(start=5.dp))
 }
}

@Composable internal fun MusicCommunityScreen(m:MusicModel,sing:(Song)->Unit){
 val crews=m.communityCrewMode
 val initialCrew=m.communityCrewTarget
 var invitations by rememberSaveable(m.user?.optString("id")){mutableStateOf(false)}
 val label=if(crews)"크루" else when(m.feedFilter){"전체"->"추천";"커버곡"->"커버";else->m.feedFilter}
 LaunchedEffect(m.user?.optString("id"),crews){if(!crews)m.community(m.feedFilter)}
 Column(Modifier.fillMaxSize()){
  if(crews){  Column(Modifier.padding(horizontal=20.dp)){
   Chips(listOf("추천","커버","듀엣","크루","팔로잉"),label){chosen->
    m.communityCrewMode=chosen=="크루";m.communityCrewTarget=null;m.crewBrowsing=false;invitations=false
    if(chosen!="크루")m.community(when(chosen){"추천"->"전체";"커버"->"커버곡";else->chosen})
    if(chosen=="듀엣")m.loadDuets()
   }
  }
CrewScreen(m,sing,initialCrew);return}
  val tracks=if(invitations)m.duetInvitations else m.feed
  LazyColumn(Modifier.fillMaxSize().testTag("music-community-feed"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
   item{WebMusicBanner("커뮤니티","좋은 음악을 듣고, 담고, 함께 만들어가요.");  Column(Modifier.padding(horizontal=20.dp)){
   Chips(listOf("추천","커버","듀엣","크루","팔로잉"),label){chosen->
    m.communityCrewMode=chosen=="크루";m.communityCrewTarget=null;m.crewBrowsing=false;invitations=false
    if(chosen!="크루")m.community(when(chosen){"추천"->"전체";"커버"->"커버곡";else->chosen})
    if(chosen=="듀엣")m.loadDuets()
   }
  }
}
   if(m.feedFilter=="듀엣")item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
    FilterChip(!invitations,{invitations=false},label={Text("듀엣 감상")},colors=neutralChipColors(),border=neutralChipBorder(!invitations))
    FilterChip(invitations,{invitations=true;m.loadDuets()},label={Text("참여를 기다리는 듀엣")},colors=neutralChipColors(),border=neutralChipBorder(invitations))
   }}
   if(m.feedLoading&&!invitations)item{LinearProgressIndicator(Modifier.fillMaxWidth())}
   (if(invitations)m.duetError else m.feedError)?.let{error->item{Text(error,color=Pink);TextButton(onClick={if(invitations)m.loadDuets() else m.community(m.feedFilter,refresh=true)}){Text("다시 불러오기")}}}
   if(m.feedFilter=="전체"){
    items(tracks.distinctBy{it.id},key={"feed-"+it.id}){CommunityCard(it,m,tracks,sing)}
    item{CommunityCrewPreview(m){id->m.communityCrewTarget=id;m.communityCrewMode=true;m.crewBrowsing=false}}
   }else items(tracks,key={it.id}){song->CommunityCard(song,m,tracks,sing)}
   if(tracks.isEmpty()&&!m.feedLoading&&m.feedError==null)item{Empty("아직 이곳에 공개된 음악이 없어요","다른 탭에서 음악을 발견하거나 첫 목소리를 들려주세요.")}
  }
 }
}

@Composable internal fun MusicProfileHeader(m:MusicModel,p:JSONObject,tracks:List<Song>,covers:List<Song>,followers:Int,myPage:Boolean=false,close:(()->Unit)?=null){
 val own=p.optString("user_id")==m.user?.optString("id")
 val person=p.optString("profile_kind","producer")=="producer"
 val music=(tracks+covers).distinctBy{it.id}
 val name=p.optString("display_name",p.optString("name")).ifBlank{m.user?.optString("name").orEmpty()}
 val context=if(myPage)"my-profile" else "profile"
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).musicSurface().border(1.dp,Stroke,RoundedCornerShape(20.dp)).padding(16.dp).testTag("$context-header")){
  Row(verticalAlignment=Alignment.CenterVertically){
   // The outer padding reserves room for the frame's 1.26x decoration.
   Box(Modifier.padding(8.dp).size(60.dp).testTag("$context-photo-frame"),contentAlignment=Alignment.Center){
    if(p.optString("image_version").isBlank())Text(name.take(1).ifBlank{"♪"},fontSize=26.sp,color=Aqua)
    else AsyncImage(Endpoint.url("/media/${p.optString("profile_kind","producer")}/${p.optString("id")}?v=${p.optString("image_version")}"),"$name 프로필 사진",Modifier.fillMaxSize().clip(androidx.compose.foundation.shape.CircleShape).testTag("$context-cover-image"),contentScale=ContentScale.Crop)
    if(person)PlayerAvatarDecoration(p,60)
   }
   Column(Modifier.weight(1f).padding(start=8.dp)){
    Text(name,fontSize=19.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("$context-name"))
    if(person&&p.optString("partner_badge").let{it.isNotBlank()&&it!="null"})Text(p.optString("partner_badge"),fontSize=11.sp,color=Aqua,modifier=Modifier.padding(top=4.dp))
    if(p.optString("bio").isNotBlank())Text(p.optString("bio"),color=Muted,fontSize=12.sp,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
   }
   if(myPage)IconButton(onClick={m.showAccount=true},modifier=Modifier.testTag("my-profile-settings")){Icon(Icons.Rounded.Settings,"계정 설정",tint=Aqua,modifier=Modifier.size(21.dp))}
   else close?.let{dismiss->IconButton(onClick=dismiss,modifier=Modifier.testTag("profile-close")){Icon(Icons.Rounded.Close,"프로필 닫기",tint=SoftText)}}
  }
  HorizontalDivider(Modifier.padding(top=12.dp,bottom=4.dp),color=Stroke.copy(alpha=.6f))
  Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp)){
   ProfileStatistic("공개곡",music.size,Modifier.weight(1f),"$context-stat-music")
   ProfileStatistic("팔로워",followers,Modifier.weight(1f),"$context-stat-followers",if(own){{if(!myPage)m.profile=null;m.library("팔로워")}}else null)
   ProfileStatistic(if(own)"팔로잉" else "커버",if(own)m.ownProfile.optInt("following_count") else covers.distinctBy{it.id}.size,Modifier.weight(1f),"$context-stat-following",if(own){{if(!myPage)m.profile=null;m.library("팔로잉")}}else null)
  }
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){
   if(own){
    TextButton(onClick=m::editProfile,modifier=Modifier.testTag("$context-edit"),contentPadding=PaddingValues(horizontal=6.dp)){Icon(Icons.Rounded.Tune,null,Modifier.size(16.dp));Text("프로필 수정",fontSize=12.sp,modifier=Modifier.padding(start=4.dp))}
    Spacer(Modifier.weight(1f))
   }else if(p.optString("profile_kind")!="listener")BrandButton(onClick=m::follow,enabled=!m.busy,modifier=Modifier.weight(1f).testTag("profile-follow"),contentPadding=PaddingValues(horizontal=8.dp)){Text(if(m.follows.any{it.optString("target_id")==p.optString("id")&&it.optString("kind")==p.optString("profile_kind","producer")})"팔로잉" else "팔로우",fontSize=12.sp)}
   if(person&&!own){
    OutlinedButton(onClick={m.openMessages(p.optString("id"))},modifier=Modifier.weight(1f).testTag("profile-message"),contentPadding=PaddingValues(horizontal=6.dp)){Text("메시지",fontSize=12.sp)}
    OutlinedButton(onClick={m.openPersonGift(p)},modifier=Modifier.weight(1f).testTag("profile-gift"),contentPadding=PaddingValues(horizontal=6.dp)){Icon(Icons.Rounded.CardGiftcard,null,Modifier.size(16.dp));Text("선물",fontSize=12.sp,modifier=Modifier.padding(start=4.dp))}
   }
   if(person&&own)ProfileGiftRanking(m,p,compact=true)
  }
  if(person&&!own){
   ProfileCrewInvite(m,p)
   ProfileGiftRanking(m,p)
  }
 }
}

@Composable private fun ProfileStatistic(label:String,count:Int,modifier:Modifier,tag:String,onClick:(()->Unit)?=null){
 Surface(onClick={onClick?.invoke()},enabled=onClick!=null,color=Color.Transparent,modifier=modifier.testTag(tag)){
  Text("$label $count",fontSize=12.sp,color=SoftText,modifier=Modifier.heightIn(min=44.dp).wrapContentHeight().padding(horizontal=2.dp),textAlign=TextAlign.Center,maxLines=2,overflow=TextOverflow.Ellipsis)
 }
}

@Composable internal fun MyMusicScreen(m:MusicModel,browser:(String)->Unit){
 var area by rememberSaveable{mutableStateOf("내 음악")}
 var tab by rememberSaveable{mutableStateOf("전체")}
 var grid by rememberSaveable{mutableStateOf(true)}
 val columns=musicGalleryColumns()
 var confirmLogout by remember{mutableStateOf(false)}
 if(confirmLogout)AlertDialog(onDismissRequest={confirmLogout=false},title={Text("로그아웃할까요?")},text={Text("이 기기에서 계정 연결이 해제돼요.")},confirmButton={TextButton(onClick={confirmLogout=false;m.logout()}){Text("로그아웃")}},dismissButton={TextButton(onClick={confirmLogout=false}){Text("취소")}})
 LaunchedEffect(m.user?.optString("id")){if(m.user!=null){m.loadStudio();m.refreshLibrary()}}
 val p=JSONObject((m.ownProfile.optJSONObject("profile")?:JSONObject()).toString()).apply{
  if(optString("name").isBlank())put("name",m.user?.optString("name"))
  if(optString("id").isBlank())put("id",m.user?.optString("profile_id"))
  if(optString("image_version").isBlank())put("image_version",m.user?.optString("image_version"))
  put("user_id",m.user?.optString("id"));put("profile_kind","producer")
 }
 val published=m.myTracks.filter{it.raw.optString("status")=="published"}.distinctBy{it.id}
 val tracks=published.filter{when(tab){"제작곡"->!it.cover;"커버"->it.cover;"듀엣"->it.cover&&it.raw.optString("cover_mode")=="duet";else->true}}
 LazyColumn(Modifier.fillMaxSize().testTag("my-music-page"),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  item{
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("마이",fontSize=26.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f));if(m.user!=null)TextButton(onClick={confirmLogout=true},enabled=!m.busy,colors=ButtonDefaults.textButtonColors(contentColor=Muted),modifier=Modifier.testTag("my-logout")){Text("로그아웃",fontSize=12.sp)}}
   Spacer(Modifier.height(12.dp))
   if(m.user==null){Empty("음악을 듣기만 해도 좋아요","로그인하면 플레이리스트와 나의 활동을 모아둘 수 있어요.");BrandButton(onClick={m.showLogin=true}){Text("로그인")}}
   else {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).musicSurface(feature=true).padding(16.dp),verticalAlignment=Alignment.CenterVertically){
     Box(Modifier.clickable{m.editProfile()}){Avatar(p.optString("name"),p,56)}
     Column(Modifier.weight(1f).padding(start=14.dp)){
      Text(p.optString("display_name",p.optString("name")),fontSize=20.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
      FlowRow{TextButton(onClick={m.library("팔로워")},contentPadding=PaddingValues(end=10.dp)){Text("팔로워 ${m.ownProfile.optInt("follower_count")}",fontSize=12.sp,maxLines=1)};TextButton(onClick={m.library("팔로잉")},contentPadding=PaddingValues(0.dp)){Text("팔로잉 ${m.ownProfile.optInt("following_count")}",fontSize=12.sp,maxLines=1)}}
     }
     IconButton(onClick={m.editProfile()}){Icon(Icons.Rounded.Edit,"프로필 수정",tint=Muted)}
    }
    Row(Modifier.padding(top=8.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     TextButton(onClick={p.optString("id").takeIf{it.isNotBlank()}?.let{m.openProfile(it,seed=p)}}){Text("내 공개 페이지")}
     TextButton(onClick={m.showAccount=true}){Text("계정 설정")}
    }
    Chips(listOf("내 음악","내 활동"),area){area=it}
   }
  }
  if(m.user!=null&&area=="내 음악"){
   item{MusicLibraryShortcuts(m)}
   item{MusicEntry("창작자 스튜디오","내 작업 · 업로드한 음악 관리",Icons.Rounded.Tune){m.openStudio()}}
   item{Section("내 플레이리스트",action="모두 보기",onAction={m.library("플레이리스트")})}
   items(m.playlists.take(3),key={it.getString("id")}){PlaylistRow(it,m)}
   if(m.playlists.isEmpty())item{MusicEntry("첫 플레이리스트 만들기","좋아하는 음악을 하나씩 모아보세요",Icons.AutoMirrored.Rounded.QueueMusic){m.library("플레이리스트")}}
   item{Section("최근 감상",action="모두 보기",onAction={m.library("최근 감상")})}
   items(m.history.take(4),key={it.id}){StreamingSongRow(it,m,m.history)}
   if(m.history.isEmpty())item{Text("음악을 들으면 최근 감상에 모여요.",color=Muted,fontSize=13.sp);TextButton(onClick={m.selectTab(0)}){Text("음악 들으러 가기")}}
   item{MusicEntry("녹음 이어 하기","이 기기에 저장한 초안",Icons.Rounded.Edit){m.showRecordingDrafts=true}}
  }
  if(m.user!=null&&area=="내 활동"){
   item{PlayerHomePanel(m)}
   item{MyWalletPanel(m)}
   item{NotificationEntry(m)}
   item{
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     FilledTonalButton(onClick={m.library("플레이리스트")}){Text("내 플레이리스트")};OutlinedButton(onClick={m.library("좋아요")}){Text("좋아요")};OutlinedButton(onClick={m.library("최근 감상")},colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText)){Text("최근 감상")}
    }
    Row(Modifier.horizontalScroll(rememberScrollState())){TextButton(onClick={m.showRecordingDrafts=true}){Text("녹음 초안")};TextButton(onClick={m.library("내 제작곡")},colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text("업로드 관리")};TextButton(onClick={m.openStudio()}){Text("창작자 스튜디오")}}
    Text("저장한 음악은 내 보관함에서, 공개한 음악은 아래에서 확인해요.",color=Muted,fontSize=12.sp,modifier=Modifier.padding(vertical=12.dp))
    Chips(listOf("전체","제작곡","커버","듀엣"),tab){tab=it}
    MusicLayoutControl(tracks.size,grid,{grid=it},"my-music")
    if(m.studioBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
    m.studioError?.let{Text(it,color=Pink);TextButton(onClick=m::loadStudio){Text("다시 불러오기")}}
   }
   musicGallery(tracks,m,grid,columns,"my-music")
   if(tracks.isEmpty()&&!m.studioBusy&&m.studioError==null)item{Empty("이 탭에 공개한 음악이 없어요","제작곡과 커버를 공개하면 여기에 모여요.")}
  }
 }
}

@Composable private fun CommunityCrewPreview(m:MusicModel,open:(String?)->Unit){
 val account=m.user?.optString("id")
 var crews by remember(account){mutableStateOf(rankedCrews(m.peekCrewDirectory()?.optJSONArray("crews").objects()).take(3))}
 LaunchedEffect(account){try{val data=m.readCrewDirectory();if(m.user?.optString("id")==account)crews=rankedCrews(data.optJSONArray("crews").objects()).take(3)}catch(e:Exception){if(e is kotlinx.coroutines.CancellationException)throw e}}
 Section("크루 랭킹","레벨 · 경험치순",action="모두 보기",onAction={open(null)})
 if(crews.isEmpty())TextButton(onClick={open(null)}){Text("취향이 맞는 크루 찾아보기")}
 crews.forEachIndexed{index,crew->CrewDiscoveryCard(crew,rank=index+1){open(crew.optString("id"))};Spacer(Modifier.height(10.dp))}
}
