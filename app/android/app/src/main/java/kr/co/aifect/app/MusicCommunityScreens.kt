@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
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
  Column(Modifier.padding(horizontal=20.dp)){
   if(!crews)Heading("커뮤니티","음악을 발견하고, 담고, 함께 만들어가요.")
   Chips(listOf("추천","커버","듀엣","크루","팔로잉"),label){chosen->
    m.communityCrewMode=chosen=="크루";m.communityCrewTarget=null;m.crewBrowsing=false;invitations=false
    if(chosen!="크루")m.community(when(chosen){"추천"->"전체";"커버"->"커버곡";else->chosen})
    if(chosen=="듀엣")m.loadDuets()
   }
  }
  if(crews){CrewScreen(m,sing,initialCrew);return}
  val tracks=if(invitations)m.duetInvitations else m.feed
  LazyColumn(Modifier.fillMaxSize().testTag("music-community-feed"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
   if(m.feedFilter=="전체")item{
    Surface(onClick={m.communityCrewMode=true;m.communityCrewTarget=null;m.crewBrowsing=false},color=Panel,shape=RoundedCornerShape(18.dp)){
     Row(Modifier.fillMaxWidth().padding(16.dp),verticalAlignment=Alignment.CenterVertically){
      Icon(Icons.Rounded.Groups,null,tint=Aqua)
      Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text("크루에서 함께 듣고 부르기",fontWeight=FontWeight.SemiBold);Text("내 크루 · 멤버들의 음악 · 크루 채팅",fontSize=12.sp,color=Muted)}
      Icon(Icons.Rounded.ChevronRight,null,tint=Muted)
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
    val popular=tracks.sortedByDescending{it.plays}.take(2)
    val covers=tracks.filter{it.cover&&it.raw.optString("cover_mode")!="duet"}.take(2)
    val duets=m.duetInvitations.take(2)
    val originals=tracks.filter{!it.cover}.take(2)
    if(popular.isNotEmpty())item{Section("지금 함께 듣는 음악",action="차트",onAction={m.selectTab(0);m.listenPage="차트"})}
    items(popular,key={"popular-"+it.id}){CommunityCard(it,m,tracks,sing)}
    if(covers.isNotEmpty())item{Section("새로 올라온 커버",action="더 보기",onAction={m.community("커버곡")})}
    items(covers,key={"cover-"+it.id}){CommunityCard(it,m,covers,sing)}
    if(duets.isNotEmpty())item{Section("같이 부를 사람을 찾고 있어요",action="듀엣",onAction={m.community("듀엣");invitations=true})}
    items(duets,key={"duet-"+it.id}){CommunityCard(it,m,m.duetInvitations,sing)}
    val people=tracks.distinctBy{it.producerId}.filter{it.producerId.isNotBlank()}.take(8)
    if(people.isNotEmpty())item{Section("새로운 목소리");LazyRow(Modifier.testTag("community-voices"),horizontalArrangement=Arrangement.spacedBy(12.dp)){items(people,key={it.producerId}){song->Surface(onClick={m.openProfile(song.producerId)},shape=RoundedCornerShape(16.dp),color=Panel){Column(Modifier.width(112.dp).padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally){Avatar(song.producer,song.producerProfile);Text(song.producer,fontSize=14.sp,modifier=Modifier.padding(top=8.dp))}}}}}
    item{CommunityCrewPreview(m){id->m.communityCrewTarget=id;m.communityCrewMode=true;m.crewBrowsing=false}}
    if(originals.isNotEmpty())item{Section("새로 공개된 제작곡")}
    items(originals,key={"original-"+it.id}){CommunityCard(it,m,originals,sing)}
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
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Panel).testTag("$context-header")){
  BoxWithConstraints(Modifier.fillMaxWidth()){
   val photoLimit=if(maxWidth<340.dp)192.dp else 256.dp
   Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(top=12.dp,bottom=2.dp),horizontalAlignment=Alignment.CenterHorizontally){
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     Text(name,fontSize=25.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis,color=MaterialTheme.colorScheme.onSurface,modifier=Modifier.weight(1f).testTag("$context-name"))
     if(myPage)IconButton(onClick={m.showAccount=true},modifier=Modifier.testTag("my-profile-settings")){Icon(Icons.Rounded.Settings,"계정 설정",tint=SoftText)}
     else close?.let{dismiss->IconButton(onClick=dismiss,modifier=Modifier.testTag("profile-close")){Icon(Icons.Rounded.Close,"프로필 닫기",tint=SoftText)}}
    }
    Spacer(Modifier.height(12.dp))
    // The existing single photo keeps its proportions instead of becoming a cropped banner.
    Box(Modifier.widthIn(max=photoLimit).fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp)).background(Raised).testTag("$context-photo-frame"),contentAlignment=Alignment.Center){
     if(p.optString("image_version").isBlank())Text(name.take(1).ifBlank{"♪"},fontSize=96.sp,fontWeight=FontWeight.Bold,color=Muted.copy(alpha=.3f))
     else AsyncImage(
      Endpoint.url("/media/${p.optString("profile_kind","producer")}/${p.optString("id")}?v=${p.optString("image_version")}"),
      "$name 프로필 사진",Modifier.fillMaxSize().testTag("$context-cover-image"),contentScale=ContentScale.Fit)
    }
    if(person)ProfileGiftRanking(m,p)
    Text("팔로워 $followers · 공개 음악 ${music.size}",fontSize=12.sp,color=Muted,modifier=Modifier.fillMaxWidth().padding(top=12.dp))
   }
  }
  Column(Modifier.padding(horizontal=16.dp,vertical=16.dp)){
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)){
    ProfileStatistic("공개곡",music.size,Modifier.weight(1f),"$context-stat-music")
    ProfileStatistic("팔로워",followers,Modifier.weight(1f),"$context-stat-followers",if(own){{if(!myPage)m.profile=null;m.library("팔로워")}}else null)
    ProfileStatistic(if(own)"팔로잉" else "커버",if(own)m.ownProfile.optInt("following_count") else covers.distinctBy{it.id}.size,Modifier.weight(1f),"$context-stat-following",if(own){{if(!myPage)m.profile=null;m.library("팔로잉")}}else null)
   }
   if(p.optString("bio").isNotBlank())Text(p.optString("bio"),color=Muted,fontSize=14.sp,modifier=Modifier.padding(top=15.dp,bottom=1.dp))
   Row(Modifier.fillMaxWidth().padding(top=14.dp),horizontalArrangement=Arrangement.spacedBy(7.dp)){
    if(own)OutlinedButton(onClick=m::editProfile,colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText),modifier=Modifier.weight(1f).heightIn(min=48.dp).testTag("$context-edit"),shape=RoundedCornerShape(14.dp)){Icon(Icons.Rounded.Edit,null,Modifier.size(17.dp));Text("프로필 수정",fontSize=13.sp,modifier=Modifier.padding(start=6.dp))}
    else if(p.optString("profile_kind")!="listener")Button(onClick=m::follow,enabled=!m.busy,modifier=Modifier.weight(1f).heightIn(min=48.dp).testTag("profile-follow"),contentPadding=PaddingValues(horizontal=7.dp),shape=RoundedCornerShape(14.dp)){Text(if(m.follows.any{it.optString("target_id")==p.optString("id")&&it.optString("kind")==p.optString("profile_kind","producer")})"팔로잉" else "팔로우",fontSize=13.sp)}
    if(person&&!own){
     OutlinedButton(onClick={m.openMessages(p.optString("id"))},colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText),modifier=Modifier.weight(1f).heightIn(min=48.dp).testTag("profile-message"),contentPadding=PaddingValues(horizontal=6.dp),shape=RoundedCornerShape(14.dp)){Text("메시지",fontSize=13.sp)}
     OutlinedButton(onClick={m.openPersonGift(p)},modifier=Modifier.weight(1f).heightIn(min=48.dp).testTag("profile-gift"),contentPadding=PaddingValues(horizontal=6.dp),shape=RoundedCornerShape(14.dp)){Icon(Icons.Rounded.CardGiftcard,null,Modifier.size(16.dp));Text("선물",fontSize=13.sp,modifier=Modifier.padding(start=4.dp))}
    }
   }
  }
 }

}

@Composable private fun ProfileStatistic(label:String,count:Int,modifier:Modifier,tag:String,onClick:(()->Unit)?=null){
 Surface(onClick={onClick?.invoke()},enabled=onClick!=null,color=Color(0xFF222331),shape=RoundedCornerShape(13.dp),modifier=modifier.testTag(tag)){
  Text("$label $count",fontSize=13.sp,fontWeight=FontWeight.SemiBold,color=if(onClick!=null)Aqua else MaterialTheme.colorScheme.onSurface,modifier=Modifier.heightIn(min=50.dp).wrapContentHeight().padding(horizontal=5.dp,vertical=12.dp),textAlign=TextAlign.Center,maxLines=2,overflow=TextOverflow.Ellipsis)
 }
}

@Composable internal fun MyMusicScreen(m:MusicModel,browser:(String)->Unit){
 var tab by rememberSaveable{mutableStateOf("전체")}
 var grid by rememberSaveable{mutableStateOf(true)}
 val columns=musicGalleryColumns()
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
   Heading("마이","내 플레이리스트와 공개한 음악을 한곳에")
   if(m.user==null){Empty("음악을 듣기만 해도 좋아요","로그인하면 플레이리스트와 나의 활동을 모아둘 수 있어요.");Button(onClick={m.showLogin=true}){Text("로그인")}}
   else MusicProfileHeader(m,p,published.filter{!it.cover},published.filter{it.cover},m.ownProfile.optInt("follower_count"),myPage=true)
  }
  if(m.user!=null){
   item{
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     FilledTonalButton(onClick={m.library("플레이리스트")}){Text("내 플레이리스트")};OutlinedButton(onClick={m.library("좋아요")}){Text("좋아요")};OutlinedButton(onClick={m.library("최근 감상")},colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText)){Text("최근 감상")}
    }
    Row(Modifier.horizontalScroll(rememberScrollState())){TextButton(onClick={m.showRecordingDrafts=true}){Text("녹음 초안")};TextButton(onClick={m.library("내 제작곡")},colors=ButtonDefaults.textButtonColors(contentColor=SoftText)){Text("업로드 관리")};TextButton(onClick={browser(Endpoint.url("/#studio"))}){Text("제작곡 올리기")}}
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
 var crews by remember(account){mutableStateOf(m.peekCrewDirectory()?.optJSONArray("crews").objects().sortedByDescending{it.optInt("xp")}.take(3))}
 LaunchedEffect(account){try{val data=m.readCrewDirectory();if(m.user?.optString("id")==account)crews=data.optJSONArray("crews").objects().sortedByDescending{it.optInt("xp")}.take(3)}catch(e:Exception){if(e is kotlinx.coroutines.CancellationException)throw e}}
 Section("음악으로 모이는 크루",action="모두 보기",onAction={open(null)})
 if(crews.isEmpty())TextButton(onClick={open(null)}){Text("취향이 맞는 크루 찾아보기")}
 crews.forEach{crew->Surface(onClick={open(crew.optString("id"))},color=Panel,shape=RoundedCornerShape(16.dp),modifier=Modifier.fillMaxWidth().padding(bottom=8.dp)){Column(Modifier.padding(16.dp)){Text(crew.optString("name"),fontWeight=FontWeight.SemiBold,fontSize=16.sp);Text("LV "+crew.optInt("level")+" · "+crew.optInt("members")+"명 · "+crew.optString("interests"),fontSize=14.sp,color=Muted)}}}
}
