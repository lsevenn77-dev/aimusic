package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDate
import java.time.ZonedDateTime
import kotlinx.coroutines.delay

@Composable internal fun CrewGameButtons(m:MusicModel,crew:String,day:LocalDate){
 val context=LocalContext.current
 val read=currentRead(m,"/api/crews/$crew/games",poll=30000)
 val catalog=read.data
 val games=if(read.error==null)catalog?.optJSONArray("games").objects().filter{
  MobileExperienceRoute.valid(it.optString("route"))&&it.optString("route").endsWith("/$crew")
 }else emptyList()
 val selectedId=CrewWeeklyGameSchedule.activeId(
  day,catalog?.optString("active_game_id"),catalog?.optString("week_start")
 )
 val selected=games.firstOrNull{it.optString("id")==selectedId}
 val banner=when(selectedId){
  "jump"->R.drawable.crew_weekly_jump_rush
  "fishing"->R.drawable.crew_weekly_fishing_hunter
  "rhythm"->R.drawable.crew_weekly_beat_combo
  "racing"->R.drawable.crew_weekly_turbo_race
  else->null
 }
 Column(verticalArrangement=Arrangement.spacedBy(5.dp)){
  if(selected!=null&&banner!=null){
   Image(
    painter=painterResource(banner),
    contentDescription="이번 주 크루 경쟁 게임: ${CrewWeeklyGameSchedule.label(selectedId.orEmpty())}. 플레이",
    modifier=Modifier.fillMaxWidth().aspectRatio(3f)
     .clip(RoundedCornerShape(16.dp))
     .clickable{m.controller?.pause();openMobileExperience(context,selected.optString("route"))}
     .testTag("crew-weekly-game-banner"),
    contentScale=ContentScale.FillBounds
   )
   if(catalog?.optString("mode")=="test")Text("테스트 중",color=Muted,fontSize=11.sp,modifier=Modifier.align(Alignment.End))
  }else if(read.loading||read.error!=null){
   ReadStatus(read)
  }else{
   Text("이번 주 크루 경쟁 게임을 준비 중이에요.",color=Muted,fontSize=13.sp)
  }
 }
}

@Composable private fun rememberCrewKstDate():LocalDate {
 val today by produceState(initialValue=CrewWeeklyGameSchedule.date()){
  while(true){
   value=CrewWeeklyGameSchedule.date()
   val now=ZonedDateTime.now(CrewWeeklyGameSchedule.zone)
   val nextMidnight=now.toLocalDate().plusDays(1).atStartOfDay(CrewWeeklyGameSchedule.zone)
   delay(Duration.between(now,nextMidnight).toMillis().coerceAtLeast(50L)+50L)
  }
 }
 return today
}

@Composable internal fun NativeCrewHome(m:MusicModel){
 val directory=currentRead(m,"/api/crews?summary=1")
 val mine=directory.data?.optString("mine").orEmpty().takeIf{CurrentNavigation.safeID(it)&&it!="null"}.orEmpty()
 var browsing by rememberSaveable{mutableStateOf(false)}
 var tab by rememberSaveable{mutableStateOf("works")}
 var page by rememberSaveable(mine,m.user?.optString("id")){mutableStateOf<String?>(null)}
 val today=rememberCrewKstDate()
 if(browsing||(!directory.loading&&mine.isEmpty())){
  Column{if(browsing&&mine.isNotEmpty())TextButton({browsing=false}){Text("‹ 내 크루로 돌아가기")};CurrentCrewDirectory(m)};return
 }
 val read=currentRead(m,"/api/crews/$mine",mine.isNotEmpty())
 val data=read.data;val crew=data?.optJSONObject("crew")?:JSONObject()
 LazyColumn(Modifier.fillMaxSize().testTag("native-crew-home"),contentPadding=PaddingValues(18.dp,14.dp,18.dp,24.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
  if(directory.loading||directory.error!=null)item{ReadStatus(directory)}
  if(read.loading||read.error!=null)item{ReadStatus(read)}
  if(data!=null){
   item{Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(14.dp)){
    AsyncImage(Endpoint.url("/media/crew/$mine?v=${crew.optString("image_version")}"),"크루 이미지",Modifier.size(88.dp).clip(RoundedCornerShape(19.dp)).background(Panel),contentScale=ContentScale.Crop)
    Column(Modifier.weight(1f)){Text(crew.optString("name"),fontSize=24.sp,lineHeight=30.sp,fontWeight=FontWeight.Bold);Text("멤버 ${crew.optInt("members")} / ${crew.optInt("capacity")}명",fontSize=14.sp,color=Muted,modifier=Modifier.padding(top=9.dp));Text("Lv.${crew.optInt("level")} · ${crew.optLong("xp")} XP",fontSize=13.sp,color=Pink,modifier=Modifier.padding(top=7.dp))}
   }}
   if(CrewWeeklyGameSchedule.isBannerDay(today))item(key="crew-weekly-game"){CrewGameButtons(m,mine,today)}
   item{Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text("Lv.${crew.optInt("level")}  ${crew.optLong("xp")} XP",fontSize=13.sp,color=Pink);Text(if(crew.isNull("next_xp"))"최고 레벨" else "다음 레벨까지 ${(crew.optLong("next_xp")-crew.optLong("xp")).coerceAtLeast(0)} XP",fontSize=11.sp,color=Muted)}
    LinearProgressIndicator(progress={crew.optDouble("progress",0.0).toFloat().coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(4.dp)),color=Aqua,trackColor=Raised)
   }}
   item{
    CurrentTabs(listOf("works" to "작품","members" to "멤버","about" to "소개"),tab,"crew-home-tabs"){tab=it}
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     TextButton({page="notice"}){Text("공지")}
     TextButton({page="membership"}){Text("크루 관리")}
     Spacer(Modifier.weight(1f))
     TextButton({browsing=true}){Text("크루 찾기")}
    }
   }
   when(tab){
    "members"->items(data.optJSONArray("members").objects(),key={it.optString("id")}){p->Row(Modifier.fillMaxWidth().heightIn(min=68.dp).clickable{m.openProfile(p.optString("id"))},verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),p,46);Column(Modifier.padding(start=12.dp)){Text(p.optString("name"),fontWeight=FontWeight.SemiBold);Text(CrewRoles[p.optString("role")]?:"크루원",color=Muted,fontSize=12.sp)}}}
    "about"->item{Text(crew.optString("description").ifBlank{"아직 등록된 소개가 없어요."},fontSize=15.sp,lineHeight=23.sp);TextButton({m.openCurrentWorkspace("crew/$mine",crew.optString("name"))}){Text("크루 자세히 보기")}}
    else->{
     val tracks=data.tracks()
     item{Text("크루 작품  ${tracks.size}",fontSize=22.sp,fontWeight=FontWeight.Bold)}
     items(tracks.chunked(3),key={it.first().id}){row->Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
      row.forEach{song->Column(Modifier.weight(1f)){
       Box(Modifier.fillMaxWidth().aspectRatio(1f)){Artwork(song,Modifier.fillMaxSize().clickable{m.openSong(song)},14.dp);BrandPlayButton("${song.title} 재생",{m.play(song,tracks)},Modifier.align(Alignment.BottomEnd),diameter=32.dp)}
       Text(song.title,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=7.dp));Text(song.credit,fontSize=11.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
      }};repeat(3-row.size){Spacer(Modifier.weight(1f))}
     }}
     if(tracks.isEmpty())item{CurrentEmpty("아직 공개된 크루 작품이 없어요","크루원이 공개한 음악이 여기에 표시돼요.")}
    }
   }
  }
 }

 when(page){
  "notice"->CrewNotices(m,mine){page=null}
  "membership"->CrewMembershipPage(m,mine,read,{page=null}){
   page=null
   tab="works"
   directory.data=JSONObject(directory.data.toString()).put("mine",JSONObject.NULL)
   directory.retry()
  }
 }
}

@Composable private fun CrewNotices(m:MusicModel,crewId:String,onBack:()->Unit){
 val feed=currentRead(m,"/api/crews/$crewId/notices")
 var editing by rememberSaveable(crewId){mutableStateOf(false)}
 LaunchedEffect(m.workspace,editing){
  if(editing&&m.workspace==null){editing=false;feed.retry()}
 }
 AppPage("크루 공지",onBack){
  LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
   if(feed.loading||feed.error!=null)item{ReadStatus(feed)}
   feed.data?.let{data->
    if(data.optBoolean("can_manage"))item{
     TextButton({m.openCurrentWorkspace("crew/$crewId?tab=notice","공지 관리");editing=true}){Text("공지 관리")}
    }
    val notices=data.optJSONArray("items").objects()
    if(notices.isEmpty())item{CurrentEmpty("등록된 공지가 없어요","새 공지가 올라오면 여기에 표시돼요.")}
    items(notices){notice->
     Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
      if(notice.optBoolean("is_pinned")||notice.optInt("is_pinned")==1)Text("고정 공지",color=Pink,fontSize=12.sp)
      Text(notice.optString("title"),fontSize=18.sp,fontWeight=FontWeight.Bold)
      val created=notice.optLong("created")
      Text(listOfNotNull(notice.optString("author_name").takeIf{it.isNotBlank()},if(created>0)activityDate(created) else null).joinToString(" · "),fontSize=12.sp,color=Muted)
      val body=notice.optString("body")
      if(body.isNotBlank())Text(body,fontSize=15.sp,lineHeight=22.sp)
      notice.optJSONArray("images").objects().forEach{photo->
       profileMediaUrl(photo.optString("url"))?.let{url->
        AsyncImage(url,"공지 첨부 이미지",Modifier.fillMaxWidth(),contentScale=ContentScale.FillWidth)
       }
      }
     }
    }
   }
  }
 }
}

@Composable private fun CrewMembershipPage(m:MusicModel,crewId:String,read:CurrentRead,onBack:()->Unit,onLeft:()->Unit){
 var confirming by rememberSaveable(crewId){mutableStateOf(false)}
 val crew=read.data?.optJSONObject("crew")
 val member=read.data?.optJSONObject("membership")
 val role=member?.optString("role")
 val account=m.user?.optString("id")
 AppPage("크루 관리",onBack){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   if(read.loading||read.error!=null)ReadStatus(read)
   if(member!=null){
    Text(crew?.optString("name").orEmpty(),fontSize=22.sp,fontWeight=FontWeight.Bold)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).padding(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
     val joined=member.optLong("joined")
     for((label,value) in listOf("내 역할" to (CrewRoles[role]?:"확인할 수 없음"),"가입일" to if(joined>0)activityDate(joined).substringBefore(' ') else "확인할 수 없음")){
      Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(label,color=Muted);Text(value)}
     }
    }
    if(role=="owner")Text("크루장을 위임한 후 탈퇴할 수 있어요.",color=Muted)
    OutlinedButton({confirming=true},enabled=role!=null&&role!="owner"&&!m.busy,modifier=Modifier.testTag("crew-membership-leave")){Text("크루 탈퇴")}
   }else if(!read.loading&&read.error==null){Text("가입 정보를 확인할 수 없어요.");TextButton({read.retry()}){Text("다시 시도")}}
  }
  if(confirming)AlertDialog(
   onDismissRequest={confirming=false},title={Text("크루를 탈퇴할까요?")},text={Text("${crew?.optString("name").orEmpty()}에서 탈퇴합니다.")},
   dismissButton={TextButton({confirming=false}){Text("취소")}},
   confirmButton={TextButton({
    confirming=false
    m.action{
     m.api.call("/api/crews/$crewId/leave","POST")
     if(m.user?.optString("id")==account){
      m.invalidateCrewPreviews()
      if(m.lastKnownCrewId==crewId)m.lastKnownCrewId=null
      if(m.inboxCrew?.optString("id")==crewId)m.inboxCrew=null
      onLeft()
      m.notice="크루에서 탈퇴했어요."
     }
    }
   },enabled=!m.busy){Text("탈퇴")}}
  )
 }
}
