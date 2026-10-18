package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.net.URLEncoder

@Composable internal fun MessageInbox(m:MusicModel,conversations:List<JSONObject>,synced:Boolean,modifier:Modifier=Modifier,readAll:()->Unit,clear:()->Unit,openProfile:(JSONObject)->Unit){
 var filter by rememberSaveable{mutableStateOf("전체")}
 var search by rememberSaveable{mutableStateOf("")}
 var searching by rememberSaveable{mutableStateOf(false)}
 var compose by remember{mutableStateOf(false)}
 var management by remember{mutableStateOf(false)}
 val matching=conversations.filter{p->(filter!="안 읽음"||p.optInt("unread")>0)&&(search.isBlank()||p.optString("name").contains(search,true)||p.optString("last_message").contains(search,true))}
 val crew=m.inboxCrew?.takeIf{c->(filter!="안 읽음"||c.optInt("unread")>0)&&(search.isBlank()||c.optString("name").contains(search,true))}
 Column(modifier.testTag("message-inbox")){
  Row(Modifier.fillMaxWidth().padding(start=18.dp,end=5.dp).heightIn(min=56.dp),verticalAlignment=Alignment.CenterVertically){
   Text("메시지",fontSize=23.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
   IconButton(onClick={searching=!searching;if(!searching)search=""},modifier=Modifier.testTag("inbox-search-toggle")){Icon(if(searching)Icons.Rounded.Close else Icons.Rounded.Search,"대화 검색",Modifier.size(22.dp),tint=SoftText)}
   IconButton(onClick={compose=true},modifier=Modifier.testTag("inbox-compose")){Icon(Icons.Rounded.PersonAddAlt,"새 대화",Modifier.size(22.dp),tint=SoftText)}
   IconButton(onClick={management=true},modifier=Modifier.testTag("inbox-management")){Icon(Icons.Rounded.MoreVert,"메시지 관리",Modifier.size(21.dp),tint=Muted)}
  }
  if(searching)OutlinedTextField(search,{search=it},placeholder={Text("이름이나 메시지 검색",fontSize=13.sp)},singleLine=true,shape=RoundedCornerShape(14.dp),modifier=Modifier.fillMaxWidth().padding(horizontal=14.dp).testTag("inbox-search"))
  LazyRow(Modifier.fillMaxWidth().padding(vertical=5.dp),contentPadding=PaddingValues(horizontal=14.dp),horizontalArrangement=Arrangement.spacedBy(7.dp)){
   items(listOf("전체","안 읽음","크루","알림")){value->
    FilterChip(filter==value,{filter=value},label={Text(value,fontSize=12.sp)},shape=RoundedCornerShape(50),colors=FilterChipDefaults.filterChipColors(selectedContainerColor=StreamPurple.copy(alpha=.32f),selectedLabelColor=Pink),border=BorderStroke(1.dp,if(filter==value)StreamPurple else StreamBorder),modifier=Modifier.testTag("inbox-filter-$value"))
   }
  }
  LazyColumn(Modifier.fillMaxWidth().weight(1f).testTag("inbox-list"),contentPadding=PaddingValues(horizontal=14.dp,vertical=3.dp)){
   if(filter!="알림"&&crew!=null)item(key="pinned-crew"){
    Surface(onClick={m.openCrewMessages(crew.getString("id"))},color=Color.Transparent,modifier=Modifier.fillMaxWidth().testTag("inbox-crew")){
     Row(Modifier.padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
      Box(Modifier.size(51.dp).clip(CircleShape).background(Brush.linearGradient(listOf(StreamPurple,Color(0xFF534B9A)))),contentAlignment=Alignment.Center){
       Icon(Icons.Rounded.Groups,null,Modifier.size(28.dp),tint=Color.White)
       if(crew.optString("image_version").isNotBlank())AsyncImage(Endpoint.url("/media/crew/${crew.optString("id")}?v=${crew.optString("image_version")}"),"크루 사진",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
      }
      Column(Modifier.weight(1f).padding(horizontal=12.dp)){
       Text(crew.optString("name"),fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
       Text(crew.optString("last_message").ifBlank{"크루와 함께하는 대화"},fontSize=12.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
      }
      Column(horizontalAlignment=Alignment.End){Text("크루",fontSize=10.sp,color=StreamPurple);UnreadCount(crew.optInt("unread"))}
     }
    }
   }
   if(filter !in listOf("크루","알림"))items(matching,key={it.optString("id")}){p->
    Surface(onClick={m.messagePeer=p.getString("id")},color=Color.Transparent,modifier=Modifier.fillMaxWidth().testTag("dm-conversation-"+p.optString("id"))){
     Row(Modifier.padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
      Box(Modifier.size(51.dp).testTag("dm-list-profile-"+p.optString("id")).clickable(onClickLabel="상대 페이지 보기"){openProfile(p)}){Avatar(p.optString("name"),p,51)}
      Column(Modifier.weight(1f).padding(horizontal=12.dp)){
       Row(verticalAlignment=Alignment.CenterVertically){Text(p.optString("name"),fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f));if(p.optInt("muted")==1)Icon(Icons.Rounded.NotificationsOff,"알림 꺼짐",Modifier.size(13.dp),tint=Muted)}
       Text(p.optString("last_message"),fontSize=12.sp,lineHeight=17.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
      }
      Column(horizontalAlignment=Alignment.End){Text(socialTime(p.optLong("updated")),fontSize=10.sp,color=Muted);UnreadCount(p.optInt("unread"))}
     }
    }
   }
   if(filter=="알림")item{NotificationEntry(m)}
   val empty=when(filter){"알림"->false;"크루"->crew==null;else->matching.isEmpty()&&crew==null}
   if(empty)item{Empty(if(!synced)"대화를 불러오고 있어요" else if(search.isNotBlank())"검색 결과가 없어요" else if(filter=="안 읽음")"모든 대화를 확인했어요" else if(filter=="크루")"함께하는 크루가 없어요" else "첫 대화를 시작해보세요",if(filter=="크루")"커뮤니티에서 음악 취향이 맞는 크루를 찾아보세요." else "오른쪽 위 새 대화에서 음악 친구를 찾아보세요.",Icons.Rounded.ChatBubbleOutline)}
  }
 }
 AppMenuPage("메시지 관리",management,{management=false}){
  PageMenuItem(text={Text("모두 읽음")},onClick={management=false;readAll()})
  PageMenuItem(text={Text("알림 기록")},onClick={management=false;m.showNotifications=true})
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("내 DM 전체 삭제",modifier=Modifier.weight(1f).padding(start=12.dp));DmActions(m,null,false,{},clear)}
 }
 if(compose)NewConversationPage(m,{compose=false}){id->compose=false;m.messagePeer=id}
}

@Composable private fun UnreadCount(count:Int){if(count>0)Box(Modifier.padding(top=6.dp).sizeIn(minWidth=21.dp,minHeight=21.dp).clip(CircleShape).background(StreamPurple).padding(horizontal=5.dp,vertical=2.dp),contentAlignment=Alignment.Center){Text(if(count>99)"99+" else "$count",fontSize=11.sp,fontWeight=FontWeight.Bold,color=Ink)}}

@Composable private fun NewConversationPage(m:MusicModel,dismiss:()->Unit,select:(String)->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 var people by remember{mutableStateOf(m.people)}
 var loading by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf<String?>(null)}
 var revision by remember{mutableIntStateOf(0)}
 val selectable=people.filter{it.optString("id")!=m.user?.optString("profile_id")&&it.optString("user_id")!=m.user?.optString("id")}.distinctBy{it.optString("id")}
 LaunchedEffect(query,revision){
  loading=true;error=null
  try{if(query.isNotBlank())delay(250);val d=m.api.call(if(query.isBlank())"/api/catalog?section=producers" else "/api/search?q="+URLEncoder.encode(query.trim(),"UTF-8"));people=d.optJSONArray("producers").objects()}
  catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{loading=false}
 }
 AppPage("새 대화",dismiss){
  OutlinedTextField(query,{query=it},label={Text("음악 친구 찾기")},singleLine=true,shape=RoundedCornerShape(14.dp),modifier=Modifier.fillMaxWidth().padding(14.dp).testTag("new-conversation-search"))
  if(loading)LinearProgressIndicator(Modifier.fillMaxWidth())
  if(error!=null)Column(Modifier.padding(16.dp)){Text(error?:"",color=Pink);TextButton(onClick={revision++}){Text("다시 불러오기")}}
  LazyColumn(Modifier.fillMaxWidth().weight(1f),contentPadding=PaddingValues(14.dp)){
   items(selectable,key={it.optString("id")}){p->
    Surface(onClick={select(p.getString("id"))},color=Color.Transparent,modifier=Modifier.fillMaxWidth().testTag("new-conversation-${p.optString("id")}")){Row(Modifier.padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),p,46);Text(p.optString("name"),fontSize=15.sp,modifier=Modifier.weight(1f).padding(horizontal=12.dp));Icon(Icons.Rounded.ChatBubbleOutline,"대화 시작",tint=Pink)}}
   }
   if(!loading&&selectable.isEmpty()&&error==null)item{Text("검색 결과가 없어요.",color=Muted)}
  }
 }
}
