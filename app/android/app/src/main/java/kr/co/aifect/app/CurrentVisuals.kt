package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import org.json.JSONObject

/** Compact native form of the deployed .play-search / global search surface. */
@Composable internal fun CurrentSearch(value:String,onChange:(String)->Unit,hint:String,tag:String,modifier:Modifier=Modifier){
 Row(modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(Color(0xFF1C2533),Color(0xFF1B202C)))).border(1.dp,Stroke,RoundedCornerShape(12.dp)).heightIn(min=48.dp).padding(start=14.dp,end=4.dp),verticalAlignment=Alignment.CenterVertically){
  Icon(Icons.Rounded.Search,null,Modifier.size(19.dp),tint=Muted)
  BasicTextField(value,onChange,modifier=Modifier.weight(1f).padding(horizontal=10.dp,vertical=12.dp).testTag(tag),singleLine=true,
   textStyle=MaterialTheme.typography.bodyMedium.copy(color=MaterialTheme.colorScheme.onSurface,fontSize=14.sp,lineHeight=20.sp),cursorBrush=SolidColor(Pink),keyboardOptions=KeyboardOptions(imeAction=ImeAction.Search),
   decorationBox={field->Box{if(value.isEmpty())Text(hint,color=Muted,fontSize=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis);field()}})
  if(value.isNotEmpty())IconButton(onClick={onChange("")}){Icon(Icons.Rounded.Close,"검색어 지우기",Modifier.size(18.dp),tint=Muted)}
 }
}

/** Album art, title, credit and recording action retain the mobile web hierarchy. */
@Composable internal fun CurrentSongCard(song:Song,m:MusicModel,queue:List<Song>,sing:((Song)->Unit)?=null){
 Column(Modifier.fillMaxWidth().testTag("current-track-${song.id}")){
  Box(Modifier.fillMaxWidth().aspectRatio(1f)){
   Artwork(song,Modifier.fillMaxSize().clickable{m.openSong(song)},12.dp)
   BrandPlayButton("${song.title} 먼저 듣기",{m.play(song,queue)},Modifier.align(Alignment.BottomEnd).padding(5.dp),diameter=34.dp)
  }
  Row(Modifier.fillMaxWidth().heightIn(min=44.dp),verticalAlignment=Alignment.CenterVertically){
   Row(Modifier.weight(1f).clickable{m.openSong(song)},verticalAlignment=Alignment.CenterVertically){
    if(song.cover){Icon(if(song.raw.optString("cover_mode")=="duet")Icons.Rounded.PeopleOutline else Icons.Rounded.Mic,null,Modifier.size(15.dp),tint=Muted);Spacer(Modifier.width(4.dp))}
    CoverPickTitle(song,m,fontSize=15.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
   }
   TrackActionsMenu(song,m,Modifier.size(36.dp))
  }
  Text(song.credit,color=Muted,fontSize=13.sp,lineHeight=19.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
  Text("${song.genreLabel} · ${timeLabel((song.duration*1000).toLong())}",color=Muted,fontSize=12.sp,lineHeight=18.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=3.dp))
  if(sing!=null)OutlinedButton(onClick={m.singTarget(song,sing)},modifier=Modifier.fillMaxWidth().padding(top=10.dp).heightIn(min=44.dp).testTag("current-sing-${song.id}"),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,SoftText.copy(alpha=.3f)),colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText),contentPadding=PaddingValues(horizontal=8.dp,vertical=8.dp)){
   Icon(Icons.Rounded.Mic,null,Modifier.size(16.dp));Text(if(song.openDuetFor(m.user?.optString("id")))"듀엣 참여" else "노래하기",fontSize=13.sp,lineHeight=18.sp,modifier=Modifier.padding(start=5.dp))
  }
 }
}

@Composable internal fun CurrentSongGrid(tracks:List<Song>,m:MusicModel,queue:List<Song> = tracks){
 Column(verticalArrangement=Arrangement.spacedBy(20.dp)){
  tracks.chunked(2).forEach{row->Row(horizontalArrangement=Arrangement.spacedBy(14.dp)){
   row.forEach{song->Box(Modifier.weight(1f)){CurrentSongCard(song,m,queue)}}
   if(row.size==1)Spacer(Modifier.weight(1f))
  }}
 }
}

private val dubbingPosterPath=Regex("""/api/dubbing/projects/[A-Za-z0-9_-]+/poster(?:\?v=[A-Za-z0-9_-]+)?""")

internal fun customDubbingPoster(project:JSONObject):String? =
 (project.opt("posterUrl") as? String)?.takeIf(dubbingPosterPath::matches)?.let(Endpoint::url)

internal fun currentDubbingImage(p:JSONObject):String {
 customDubbingPoster(p)?.let{return it}
 val genre=(p.optJSONArray("genres")?:p.optJSONObject("options")?.optJSONArray("genres"))?.optString(0).orEmpty()
 val slug=mapOf("SF" to "sf","이세계물" to "isekai","판타지" to "fantasy","사극" to "historical","로맨스" to "romance","액션" to "action","코미디" to "comedy","첩보" to "spy","공포" to "horror","스릴러" to "thriller","미스터리" to "mystery","일상" to "daily","감동" to "moving")[genre]?:"daily"
 return Endpoint.url("/assets/dubbing-genres/$slug.webp")
}
@Composable internal fun DubbingImage(url:String,modifier:Modifier){
 if(url.startsWith(Endpoint.origin+"/api/dubbing/projects/")){
  val app=androidx.compose.ui.platform.LocalContext.current.applicationContext as AifectApplication
  AsyncImage(url,"더빙 썸네일",modifier=modifier,imageLoader=app.dubbingPosters,contentScale=ContentScale.Crop)
 }else AsyncImage(url,"더빙 썸네일",modifier,contentScale=ContentScale.Crop)
}

@Composable internal fun CurrentDubbingCard(p:JSONObject,onOpen:(String)->Unit){
 val id=p.optString("id")
 fun open(){if(CurrentNavigation.safeID(id))onOpen(id)}
 Column(Modifier.fillMaxWidth().testTag("dubbing-project-$id")){
  Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Raised).clickable{open()}){
   Icon(Icons.Rounded.RecordVoiceOver,null,Modifier.size(32.dp).align(Alignment.Center),tint=Muted)
   DubbingImage(currentDubbingImage(p),Modifier.fillMaxSize())
   BrandPlayButton("${p.optString("title")} 완성작 보기",::open,Modifier.align(Alignment.BottomEnd).padding(5.dp),diameter=34.dp)
  }
  Row(Modifier.fillMaxWidth().heightIn(min=44.dp).clickable{open()},verticalAlignment=Alignment.CenterVertically){
   Icon(Icons.Rounded.RecordVoiceOver,null,Modifier.size(15.dp),tint=Muted);Spacer(Modifier.width(4.dp))
   Text(p.optString("title"),fontSize=15.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
  }
  Text(p.optString("ownerName",p.optString("owner_name")),fontSize=13.sp,lineHeight=19.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
  Text("${p.optJSONArray("genres")?.optString(0).orEmpty()} · ${timeLabel((p.optDouble("duration")*1000).toLong())}",fontSize=12.sp,lineHeight=18.sp,color=Muted,modifier=Modifier.padding(top=3.dp))
 }
}

@Composable internal fun CompletedDubbingDetail(m:MusicModel,id:String,dismiss:()->Unit){
 val read=currentRead(m,"/api/dubbing/projects/$id")
 val project=read.data?.optJSONObject("project")
 AlertDialog(onDismissRequest=dismiss,title={Text(project?.optString("title")?:"완성된 더빙")},
  text={Column(Modifier.verticalScroll(rememberScrollState()).testTag("completed-dubbing-detail"),verticalArrangement=Arrangement.spacedBy(8.dp)){
   ReadStatus(read)
   project?.let{p->
    DubbingWorkScene(m,p)
    Text(p.optString("ownerName"),color=Muted)
    (p.opt("listening_description") as? String)?.takeIf{it.isNotBlank()}?.let{Text(it,color=SoftText)}
    val participants=p.optJSONArray("roles").objects().filter{it.optBoolean("claimed")}
     .distinctBy{it.opt("participantUserId") as? String?:it.optString("participant")}
    if(participants.isNotEmpty()){
     Text("참여자",fontWeight=FontWeight.SemiBold)
     participants.forEach{role->
      val userId=role.opt("participantUserId") as? String
      val name=role.optString("participant","참여자")
      if(userId!=null&&CurrentNavigation.safeID(userId)){
       val member=currentRead(m,"/api/member-preview/$userId")
       val code=member.data?.optJSONObject("profile")?.opt("public_id") as? String
       Text(if(code.isNullOrBlank())name else "$name · ID $code",color=SoftText)
       if(member.error!=null)TextButton(member::retry){Text("참여자 ID 다시 불러오기")}
      }else Text(name,color=SoftText)
     }
    }
   }
  }},dismissButton={TextButton(dismiss){Text("닫기")}},confirmButton={
   if(project!=null)TextButton({dismiss();m.openCurrentWorkspace("dubbing/$id",project.optString("title"))}){Text("작품 열기")}
  })
}

/** The deployed My page's section surface, rather than a standalone oversized heading. */
@Composable internal fun CurrentPanel(title:String,count:Int?=null,action:String?=null,onAction:()->Unit={},content:@Composable ColumnScope.()->Unit){
 Surface(color=Color.Transparent,modifier=Modifier.fillMaxWidth()){
  Column(Modifier.padding(vertical=5.dp)){
   Row(Modifier.fillMaxWidth().heightIn(min=44.dp),verticalAlignment=Alignment.CenterVertically){
    Text(title,fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
    count?.let{Text(" $it",color=Aqua,fontSize=15.sp,fontWeight=FontWeight.SemiBold)}
    Spacer(Modifier.weight(1f))
    if(action!=null)TextButton(onClick=onAction,colors=ButtonDefaults.textButtonColors(contentColor=SoftText),contentPadding=PaddingValues(start=8.dp)){
     Text(action,fontSize=12.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(16.dp))
    }
   }
   Spacer(Modifier.height(5.dp));content()
  }
 }
}

@Composable internal fun CurrentMySwitch(selected:String,onSelect:(String)->Unit){
 CurrentTabs(listOf("works" to "내 작품","library" to "내 보관함","inventory" to "인벤토리"),selected,"my-section",onSelect=onSelect)
}

@Composable internal fun CurrentRoomCard(room:JSONObject,m:MusicModel){
 val id=room.optString("id")
 Column(Modifier.fillMaxWidth().clickable{if(CurrentNavigation.safeID(id))m.openCurrentWorkspace((if(room.optString("mode")=="karaoke")"live/" else "voice/")+id,room.optString("title","토킹룸"))}.testTag("voice-room-$id")){
  Box(Modifier.fillMaxWidth().height(112.dp).clip(RoundedCornerShape(12.dp))){
   VoiceRoomBackdrop(RoomThemeSync.shownSku(room,null),RoomThemeSync.current(room,null),Modifier.matchParentSize())
   Text(if(room.optString("mode")=="karaoke")"♫ 노래방" else "● 토킹룸",fontSize=10.sp,color=Color(0xFF8EDDD2),modifier=Modifier.padding(10.dp).clip(RoundedCornerShape(6.dp)).background(Ink.copy(alpha=.9f)).padding(horizontal=7.dp,vertical=4.dp))
   Row(Modifier.align(Alignment.BottomEnd).padding(10.dp).clip(RoundedCornerShape(6.dp)).background(Ink.copy(alpha=.9f)).padding(horizontal=7.dp,vertical=4.dp),verticalAlignment=Alignment.CenterVertically){Icon(Icons.Rounded.PeopleOutline,null,Modifier.size(13.dp),tint=SoftText);Text(" ${room.optInt("member_count")}명",fontSize=11.sp,color=SoftText)}
  }
  Text(room.optString("title"),fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=10.dp))
  Text(room.optString("host_name"),fontSize=12.sp,lineHeight=18.sp,color=Muted,modifier=Modifier.padding(top=4.dp))
 }
}
