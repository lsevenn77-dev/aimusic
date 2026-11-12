package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
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
 val notices=filter=="알림"
 val unreadOnly=filter=="안 읽음"
 fun matches(p:JSONObject)=search.isBlank()||p.optString("name").contains(search,true)||p.optString("last_message").contains(search,true)
 val matching=conversations.filter{p->(!notices||p.optBoolean("is_notice")||p.optInt("is_notice")==1)&&(!unreadOnly||p.optInt("unread")>0)&&matches(p)}
 val crew=m.inboxCrew?.takeIf{!notices&&(!unreadOnly||it.optInt("unread")>0)&&matches(it)}
 Column(modifier.testTag("message-inbox")){
  Row(Modifier.fillMaxWidth().padding(horizontal=8.dp),horizontalArrangement=Arrangement.End){
   IconButton(onClick={compose=true},modifier=Modifier.testTag("inbox-compose")){Icon(Icons.Rounded.PersonAddAlt,"새 대화",tint=SoftText)}
   IconButton(onClick={management=true},modifier=Modifier.testTag("inbox-management")){Icon(Icons.Rounded.Menu,"메시지 관리",tint=SoftText)}
  }
  Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
   listOf("전체","안 읽음","알림").forEach{label->
    val selected=filter==label
    val count=when(label){"안 읽음"->m.unreadMessages;"알림"->m.unreadActivities;else->0}
    Box(Modifier.weight(1f).heightIn(min=48.dp).selectable(selected,role=Role.Tab,onClick={filter=label}).testTag("inbox-filter-"+label),contentAlignment=Alignment.Center){
     val fill=if(selected)Modifier.background(Brush.horizontalGradient(listOf(Color(0xFF9164AB),Color(0xFF555176),Color(0xFF468D90))),CircleShape) else Modifier
     Box(Modifier.fillMaxWidth().heightIn(min=38.dp).then(fill).border(1.dp,if(selected)Aqua.copy(alpha=.65f) else Stroke,CircleShape).padding(horizontal=3.dp,vertical=5.dp),contentAlignment=Alignment.Center){
      Text(label,fontSize=14.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1)
     }
     if(count>0)Box(Modifier.align(Alignment.TopEnd).padding(end=2.dp)){UnreadCount(count,small=true)}
    }
   }
   IconButton(onClick={searching=!searching;if(!searching)search=""},modifier=Modifier.size(48.dp).testTag("inbox-search-toggle")){
    Box(Modifier.size(39.dp).border(1.dp,Stroke,CircleShape),contentAlignment=Alignment.Center){Icon(if(searching)Icons.Rounded.Close else Icons.Rounded.Search,"대화 검색",tint=SoftText)}
   }
  }
  if(searching)OutlinedTextField(search,{search=it},placeholder={Text(if(notices)"알림 검색" else "이름이나 메시지 검색",fontSize=13.sp)},singleLine=true,shape=RoundedCornerShape(14.dp),modifier=Modifier.fillMaxWidth().padding(horizontal=14.dp).testTag("inbox-search"))
  val rows:LazyListScope.()->Unit={
   if(crew!=null)item(key="pinned-crew"){
    InboxCard(crew,true,{m.openCrewMessages(crew.getString("id"))},openProfile)
   }
   items(matching,key={"dm-"+it.optString("id")}){p->InboxCard(p,false,{m.messagePeer=p.getString("id")},openProfile)}
  }
  if(notices)ActivityFeed(m,embedded=true,query=search,hasConversations=matching.isNotEmpty(),conversations=rows)
  else LazyColumn(Modifier.fillMaxWidth().weight(1f).testTag("inbox-list"),contentPadding=PaddingValues(12.dp,12.dp,12.dp,20.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
   rows()
   if(matching.isEmpty()&&crew==null)item{
    val title=when{!synced->"대화를 불러오고 있어요";search.isNotBlank()->"검색 결과가 없어요";unreadOnly->"모든 대화를 확인했어요";else->"첫 대화를 시작해보세요"}
    Empty(title,when{search.isNotBlank()->"다른 이름이나 메시지로 검색해보세요.";unreadOnly->"새 메시지가 오면 여기에 표시돼요.";else->"오른쪽 위 새 대화에서 음악 친구를 찾아보세요."},Icons.Rounded.ChatBubbleOutline)
   }
  }
 }
 AppMenuPage("메시지 관리",management,{management=false}){
  PageMenuItem(text={Text("모두 읽음")},onClick={management=false;readAll()})
  PageMenuItem(text={Text("알림 기록")},onClick={management=false;m.showNotifications=true})
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("내 DM 전체 삭제",modifier=Modifier.weight(1f).padding(start=12.dp));DmActions(m,null,false,{},clear)}
 }
 if(compose)NewConversationPage(m,{compose=false}){id->compose=false;m.messagePeer=id}
}

/** Material Surface clips its children: reserve the decorative frame's 13% overhang. */
@Composable internal fun MessageInboxRow(modifier:Modifier=Modifier,content:@Composable RowScope.()->Unit){
 Row(modifier.fillMaxWidth().padding(vertical=5.dp).clip(RoundedCornerShape(18.dp)).background(Panel.copy(alpha=.80f)).border(1.dp,Stroke,RoundedCornerShape(18.dp)).padding(horizontal=14.dp,vertical=17.dp),verticalAlignment=Alignment.CenterVertically,content=content)
}

@Composable private fun InboxCard(p:JSONObject,crew:Boolean,open:()->Unit,openProfile:(JSONObject)->Unit){
 val unread=p.optInt("unread")
 val accent=if(crew)StreamPurple else Aqua
 val shape=RoundedCornerShape(18.dp)
 val id=p.optString("id")
 val name=p.optString("name")
 Surface(onClick=open,shape=shape,color=Panel.copy(alpha=.84f),modifier=Modifier.fillMaxWidth().border(1.dp,Stroke,shape).testTag(if(crew)"inbox-crew" else "dm-conversation-"+id)){
  Box(contentAlignment=Alignment.CenterStart){
   if(crew||unread>0)Box(Modifier.padding(start=2.dp).size(3.dp,34.dp).background(accent,CircleShape))
   Row(Modifier.fillMaxWidth().heightIn(min=68.dp).padding(start=19.dp,end=13.dp,top=9.dp,bottom=9.dp),verticalAlignment=Alignment.CenterVertically){
    if(crew)Box(Modifier.size(48.dp),contentAlignment=Alignment.Center){
     Box(Modifier.fillMaxSize().clip(CircleShape).background(Brush.linearGradient(listOf(StreamPurple,Color(0xFF534B9A)))),contentAlignment=Alignment.Center){
      Icon(Icons.Rounded.Groups,null,Modifier.size(26.dp),tint=Color.White)
      if(!p.isNull("image_version")&&p.optString("image_version").isNotBlank())AsyncImage(Endpoint.url("/media/crew/$id?v=${p.optString("image_version")}"),"크루 사진",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
     }
     if(unread>0)Spacer(Modifier.align(Alignment.TopEnd).size(9.dp).background(StreamPurple,CircleShape))
    }else Box(Modifier.size(48.dp).testTag("dm-list-profile-"+id).clickable(onClickLabel="상대 페이지 보기"){openProfile(p)}){Avatar(name,p,48)}
    Column(Modifier.weight(1f).padding(horizontal=12.dp)){
     Row(verticalAlignment=Alignment.CenterVertically){
      Text(name,fontSize=16.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f,false))
      if(p.optInt("muted")==1)Icon(Icons.Rounded.NotificationsOff,"알림 꺼짐",Modifier.size(13.dp),tint=Muted)
     }
     Text(stickerPreview(p.optString("last_message")).ifBlank{if(crew)"크루와 함께하는 대화" else ""},fontSize=13.sp,lineHeight=18.sp,color=SoftText,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
    }
    Column(horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(5.dp)){
     if(crew)Box(Modifier.background(StreamPurple.copy(alpha=.16f),CircleShape).border(1.dp,StreamPurple.copy(alpha=.35f),CircleShape).padding(horizontal=8.dp,vertical=2.dp)){Text("크루",fontSize=10.sp,color=StreamPurple)}
     else if(p.optLong("updated")>0)Text(socialTime(p.optLong("updated")),fontSize=11.sp,lineHeight=14.sp,color=Muted)
     UnreadCount(unread)
    }
   }
  }
 }
}

@Composable private fun UnreadCount(count:Int,small:Boolean=false){
 if(count<=0)return
 Box(Modifier.sizeIn(minWidth=if(small)17.dp else 21.dp,minHeight=if(small)17.dp else 18.dp).background(StreamPurple,CircleShape).padding(horizontal=4.dp),contentAlignment=Alignment.Center){
  Text(if(count>99)"99+" else count.toString(),fontSize=if(small)10.sp else 11.sp,lineHeight=14.sp,fontWeight=FontWeight.Bold,color=Ink)
 }
}

@Composable private fun NewConversationPage(m:MusicModel,dismiss:()->Unit,select:(String)->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 var people by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var loading by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf<String?>(null)}
 var revision by remember{mutableIntStateOf(0)}
 val selectable=if(query.isBlank())emptyList()else people.filter{CurrentNavigation.safeID(it.optString("id"))&&it.optString("id")!=m.user?.optString("profile_id")&&it.optString("user_id")!=m.user?.optString("id")}.distinctBy{it.optString("id")}
 LaunchedEffect(query,revision){
  people=emptyList();loading=false;error=null
  val term=query.trim()
  if(term.isBlank())return@LaunchedEffect
  loading=true
  try{delay(250);val d=m.api.call("/api/search?q="+URLEncoder.encode(term,"UTF-8"));people=d.optJSONArray("producers").objects()}
  catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{loading=false}
 }
 AppPage("새 대화",dismiss){
  OutlinedTextField(query,{query=it},label={Text("음악 친구 찾기")},placeholder={Text("닉네임 또는 고유 ID",fontSize=13.sp)},singleLine=true,shape=RoundedCornerShape(14.dp),modifier=Modifier.fillMaxWidth().padding(14.dp).testTag("new-conversation-search"))
  if(loading)LinearProgressIndicator(Modifier.fillMaxWidth())
  if(error!=null)Column(Modifier.padding(16.dp)){Text(error?:"",color=Pink);TextButton(onClick={revision++}){Text("다시 불러오기")}}
  LazyColumn(Modifier.fillMaxWidth().weight(1f),contentPadding=PaddingValues(14.dp)){
   items(selectable,key={it.optString("id")}){p->
    Surface(onClick={select(p.getString("id"))},color=Color.Transparent,modifier=Modifier.fillMaxWidth().testTag("new-conversation-${p.optString("id")}")){MessageInboxRow{Avatar(p.optString("name"),p,46);Column(Modifier.weight(1f).padding(horizontal=12.dp)){Row(verticalAlignment=Alignment.CenterVertically){Text(p.optString("name"),fontSize=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f,false));OfficialAiBadge(p)};p.optString("public_id").takeIf{it.matches(Regex("[A-Z]{3}[0-9]{4}"))}?.let{Text("ID $it",fontSize=11.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.padding(top=4.dp))}};Icon(Icons.Rounded.ChatBubbleOutline,"대화 시작",tint=Pink)}}
   }
   if(!loading&&selectable.isEmpty()&&error==null)item{Text(if(query.isBlank())"닉네임이나 고유 ID를 입력해 친구를 찾아보세요."else "검색 결과가 없어요.",fontSize=13.sp,lineHeight=20.sp,color=Muted,modifier=Modifier.testTag("new-conversation-empty"))}
  }
 }
}
