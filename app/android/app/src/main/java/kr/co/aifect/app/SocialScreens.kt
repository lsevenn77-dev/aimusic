@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import org.json.JSONObject
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

internal val CrewRoles=linkedMapOf("owner" to "크루장","deputy" to "부크루장","operator" to "운영자","manager" to "매니저","member" to "크루원")
internal fun crewJoinedSequence(member:JSONObject?):Long? {
 // Migration 0027 gives existing members an explicit zero to retain their history.
 // Missing, null, string, fractional and out-of-range values are not boundaries.
 val value=member?.opt("joined_sequence") as? Number?:return null
 val sequence=runCatching{java.math.BigDecimal(value.toString()).longValueExact()}.getOrNull()?:return null
 return sequence.takeIf{it>=0L}
}
internal fun crewName(p:JSONObject):String=p.optString("name")+(p.optString("role").takeIf{it.isNotBlank()&&it!="member"}?.let{"("+(CrewRoles[it]?:"크루원")+")"}?:"")
internal fun mergeChat(old:List<JSONObject>,incoming:List<JSONObject>):List<JSONObject>{
 val combined=old+incoming
 val confirmed=combined.filter{it.optLong("sequence")>0}.map{it.optString("request_id") to it.optString("user_id",it.optString("sender_id"))}.toSet()
 return combined.filterNot{it.optString("delivery").isNotEmpty()&&(it.optString("request_id") to it.optString("user_id",it.optString("sender_id"))) in confirmed}.associateBy{it.optString("id")}.values.sortedWith(compareBy<JSONObject>{it.optLong("sequence").takeIf{n->n>0}?:Long.MAX_VALUE}.thenBy{it.optLong("created")})
}
internal fun applyDmReadReceipt(messages:List<JSONObject>,accountId:String,receipt:JSONObject?):List<JSONObject>{
 val sequence=receipt?.optLong("sequence")?:0L
 val readAt=receipt?.optLong("read_at")?:0L
 if(sequence<=0L||readAt<=0L)return messages
 // The server marks the peer's entire received conversation read. The receipt
 // updates cached outgoing rows without retrieving their message bodies again.
 return messages.map{message->
  if(message.optString("sender_id")==accountId&&message.optLong("sequence") in 1..sequence&&message.optLong("read_at")==0L)JSONObject(message.toString()).put("read_at",readAt)else message
 }
}
private fun chatTime(seconds:Long)=if(seconds>0)SimpleDateFormat("M/d HH:mm",Locale.KOREA).format(Date(seconds*1000))else ""
private fun chatCursor(messages:List<JSONObject>,older:Boolean):String {
 val saved=messages.filter{it.optLong("sequence")>0}
 val cursor=if(older)saved.firstOrNull()?.optLong("sequence")else saved.lastOrNull()?.optLong("sequence")
 return if(cursor!=null&&cursor>0)"?"+(if(older)"before=" else "after=")+cursor else ""
}

@Composable internal fun CrewScreen(m:MusicModel,sing:(Song)->Unit,initialCrew:String?=null,initialChat:Boolean=false){
 val accountId=m.user?.optString("id")
 var selected by remember(accountId,initialCrew){mutableStateOf(initialCrew?:m.lastKnownCrewId.takeUnless{m.crewBrowsing})}
 var myCrew by remember(accountId){mutableStateOf(m.lastKnownCrewId)}
 var browsing by remember(accountId){mutableStateOf(m.crewBrowsing)}
 var crewTab by remember(selected){mutableStateOf(if(initialChat)"채팅" else "음악")}
 val crewScroll=rememberLazyListState()
 var query by remember(accountId){mutableStateOf("")}
 var result by remember(accountId,query){mutableStateOf(m.peekCrewDirectory(query)?:JSONObject())}
 var detail by remember(accountId,selected){mutableStateOf(selected?.let{m.peekCrewDetail(it)})}
 var detailVerified by remember(accountId,selected){mutableStateOf(false)}
 var verifiedMembership by remember(accountId,selected){mutableStateOf<JSONObject?>(null)}
 var membershipDenied by remember(accountId,selected){mutableStateOf(false)}
 var historyReady by remember(accountId,selected){mutableStateOf(false)}
 var historyLoading by remember(accountId,selected){mutableStateOf(false)}
 var detailLoading by remember(accountId,selected){mutableStateOf(false)}
 var messages by remember(accountId,selected){mutableStateOf<List<JSONObject>>(emptyList())}
 var latestSequence by remember(accountId,selected){mutableLongStateOf(0L)}
 var joinedBoundary by remember(accountId,selected){mutableStateOf<Long?>(null)}
 var chatGeneration by remember(accountId){mutableIntStateOf(0)}
 var earlier by remember(accountId,selected){mutableStateOf(false)}
 var body by remember(accountId,selected){mutableStateOf("")}
 var sending by remember(accountId,selected){mutableStateOf(false)}
 var connection by remember(accountId,selected){mutableStateOf("")}
 var error by remember(accountId,selected,query){mutableStateOf<String?>(null)}
 var creating by remember(accountId){mutableStateOf(false)}
 var editing by remember(accountId,selected){mutableStateOf(false)}
 var leaving by remember(accountId,selected){mutableStateOf(false)}
 var managing by remember(accountId,selected){mutableStateOf<JSONObject?>(null)}
 val screenScope=rememberCoroutineScope()
 val searchFocus=remember{FocusRequester()}
 val keyboardVisible=WindowInsets.ime.getBottom(LocalDensity.current)>0
 val crewFocus=LocalFocusManager.current
 val keyboardController=LocalSoftwareKeyboardController.current
 val lifecycle=LocalLifecycleOwner.current.lifecycle
 fun clearCrewHistory(){messages=emptyList();latestSequence=0L;earlier=false;body="";sending=false;chatGeneration++}
 fun current(cid:String?,generation:Int)=m.user?.optString("id")==accountId&&selected==cid&&chatGeneration==generation
 fun denyMembership(cid:String){
  verifiedMembership=null;historyReady=false;membershipDenied=true;joinedBoundary=null;managing=null;editing=false;leaving=false
  if(myCrew==cid)myCrew=null;if(m.lastKnownCrewId==cid)m.lastKnownCrewId=null
  clearCrewHistory()
 }
 fun selectCrew(cid:String?,browse:Boolean=false){browsing=browse;m.crewBrowsing=browse;m.communityCrewTarget=cid;selected=cid}
 suspend fun load(older:Boolean=false,refresh:Boolean=true){
  val cid=selected
  val generation=chatGeneration
  if(!current(cid,generation))return
  if(cid==null){
   val q=query;val listing=m.readCrewDirectory(q);if(!current(cid,generation)||query!=q)return
   result=listing;myCrew=listing.optString("mine").takeIf{it.isNotBlank()&&it!="null"};detail=null;messages=emptyList()
   if(!browsing&&myCrew!=null)selectCrew(myCrew)
   return
  }
  suspend fun historyPage(){
   val pageGeneration=chatGeneration;val cursor=if(older)chatCursor(messages,true)else if(latestSequence>0)"?after=$latestSequence" else ""
   val history=m.api.call("/api/crews/$cid/messages"+cursor,fresh=true)
   if(!current(cid,pageGeneration)||membershipDenied)return
   val member=history.optJSONObject("membership")?.takeIf{it.optString("crew_id")==cid&&it.optString("user_id")==accountId&&crewJoinedSequence(it)!=null}
   if(member==null){denyMembership(cid);error="크루 가입 상태를 다시 확인해주세요.";return}
   val boundary=crewJoinedSequence(member)!!
   if(joinedBoundary!=null&&joinedBoundary!=boundary){
    // Neither optimistic sends nor a before/after cursor may cross leave/rejoin.
    // Keep the watcher alive while its own callback reloads the new boundary.
    // Removing verifiedMembership immediately hides the composer and history.
    clearCrewHistory();joinedBoundary=boundary;verifiedMembership=null
    load(refresh=false);return
   }
   joinedBoundary=boundary;verifiedMembership=member;historyReady=true;myCrew=cid;m.lastKnownCrewId=cid
   val incoming=history.optJSONArray("messages").objects().filter{it.optLong("sequence")>=boundary}
   if(older||latestSequence==0L)earlier=history.optBoolean("has_more")
   val roles=history.optJSONArray("member_roles").objects().associate{it.optString("profile_id") to it.optString("role")}
   messages=mergeChat(messages,incoming).filter{it.optLong("sequence")==0L||it.optLong("sequence")>=boundary}.map{msg->JSONObject(msg.toString()).apply{roles[msg.optString("profile_id")]?.let{put("role",it)}}}
   if(!older)latestSequence=maxOf(latestSequence,incoming.maxOfOrNull{it.optLong("sequence")}?:0L)
   if(!older&&cursor.isNotEmpty()&&history.optBoolean("has_more"))load(refresh=false)
  }
  if(refresh){verifiedMembership=null;historyReady=false;membershipDenied=false;detailVerified=false}
  supervisorScope{
   val publicRead=if(refresh||detail==null)launch{
    detailLoading=true
    try{
     val data=m.api.call("/api/crews/$cid",fresh=true);if(m.user?.optString("id")!=accountId||selected!=cid)return@launch
     detail=data;detailVerified=true;m.rememberCrewDetail(data)
     if(data.optJSONObject("membership")==null)denyMembership(cid)
    }catch(e:Exception){if(e is CancellationException)throw e;if(current(cid,generation)){if(e is ApiException&&e.status in listOf(401,403,404)){denyMembership(cid);if(e.status==404){detail=null;m.forgetCrewDetail(cid)}};error=e.message}}
    finally{if(m.user?.optString("id")==accountId&&selected==cid)detailLoading=false}
   }else null
   val historyRead=if(accountId!=null)launch{
    val showLoading=refresh||older;if(showLoading)historyLoading=true
    try{historyPage()}catch(e:Exception){if(e is CancellationException)throw e;if(current(cid,generation)){if(e is ApiException&&e.status in listOf(401,403,404))denyMembership(cid);error=e.message}}
    finally{if(showLoading&&m.user?.optString("id")==accountId&&selected==cid)historyLoading=false}
   }else null
   publicRead?.join();historyRead?.join()
  }
 }
 fun send(retry:JSONObject?=null){val cid=selected?:return;if((retry==null&&body.isBlank())||sending||verifiedMembership==null||!historyReady||membershipDenied)return
  val generation=chatGeneration
  val rid=retry?.optString("request_id")?:UUID.randomUUID().toString()
  val pending=retry?.let{JSONObject(it.toString())}?:payload("id" to "pending:$rid","request_id" to rid,"body" to body.trim(),"created" to System.currentTimeMillis()/1000,"user_id" to accountId,"name" to m.user?.optString("name"),"profile_id" to m.user?.optString("profile_id"),"role" to verifiedMembership?.optString("role"))
  pending.put("delivery","sending");messages=mergeChat(messages,listOf(pending));if(retry==null)body="";sending=true
  m.viewModelScope.launch{try{
   val sent=m.api.call("/api/crews/$cid/messages","POST",payload("body" to pending.optString("body"),"request_id" to rid,"image_id" to pending.optString("image_id").takeIf{it.isNotBlank()}))
   if(m.user?.optString("id")==accountId)m.invalidateCrewPreviews()
   if(current(cid,generation))sent.optJSONObject("message")?.let{messages=mergeChat(messages,listOf(it))}
  }catch(e:Exception){if(e is CancellationException)throw e;if(current(cid,generation)){if(e is ApiException&&e.status in listOf(401,403))denyMembership(cid)else if(messages.any{it.optString("id")==pending.optString("id")})messages=messages.map{if(it.optString("id")==pending.optString("id"))JSONObject(it.toString()).put("delivery","failed")else it};error=e.message}
  }finally{if(generation==chatGeneration)sending=false}}
 }
 LaunchedEffect(selected,query,m.user?.optString("id")){
  detail=selected?.let{m.peekCrewDetail(it)};detailVerified=false;verifiedMembership=null;membershipDenied=false;historyReady=false;joinedBoundary=null;clearCrewHistory();error=null
  if(selected==null&&query.isNotEmpty())delay(200)
  try{load()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}
 }
 LaunchedEffect(selected,crewTab,latestSequence){crewScroll.scrollToItem(0);if(crewTab=="채팅"&&selected!=null&&latestSequence>0)try{m.api.call("/api/crews/$selected/read","POST",payload("sequence" to latestSequence));m.refreshMessageSummary()}catch(e:Exception){if(e is CancellationException)throw e}}
 LaunchedEffect(selected,crewTab,historyReady&&!historyLoading,m.user?.optString("id")){
  val cid=selected?:return@LaunchedEffect;if(crewTab!="채팅"||!historyReady||historyLoading)return@LaunchedEffect
  fun watchCurrent()=m.user?.optString("id")==accountId&&selected==cid
  lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED){
   try{m.api.watchChat("?crew=$cid",{if(watchCurrent())connection=it}){if(watchCurrent())load(refresh=false);if(watchCurrent())error=null}}
   catch(e:Exception){if(e is CancellationException)throw e;if(watchCurrent()){error=e.message;if(e is ApiException&&e.status in listOf(401,403))denyMembership(cid)}}
  }
 }
 val shownDetail=detail?.takeIf{it.optJSONObject("crew")?.optString("id")==selected}
 val membership=verifiedMembership?.takeIf{historyReady&&!membershipDenied}
 val joined=membership!=null&&shownDetail!=null
 val chatPaneVisible=selected!=null&&crewTab=="채팅"&&(!detailVerified||shownDetail?.optJSONObject("membership")!=null||joined)
 val pageHeader:@Composable ()->Unit={
  Row(Modifier.fillMaxWidth().heightIn(min=48.dp),verticalAlignment=Alignment.CenterVertically){
   Text(if(joined)"내 크루" else "크루",fontSize=24.sp,modifier=Modifier.weight(1f))
   if(selected==null){
    myCrew?.let{mine->TextButton(onClick={crewFocus.clearFocus();keyboardController?.hide();selectCrew(mine)},modifier=Modifier.testTag("crew-return-home")){Text("내 크루로")}}
   }else TextButton(onClick={crewFocus.clearFocus();keyboardController?.hide();selectCrew(null,browse=true);query=""},modifier=Modifier.testTag("crew-browse")){Text("다른 크루 찾기",fontSize=13.sp)}
  }
  if(!chatPaneVisible){
   if(selected!=null&&(detailLoading||historyLoading)&&!historyReady)Text("크루와 새 대화를 확인하고 있어요.",fontSize=12.sp,color=Muted,modifier=Modifier.testTag("crew-loading"))
   error?.let{Text(it,color=Pink);TextButton(onClick={screenScope.launch{try{load();error=null}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}},enabled=!detailLoading&&!historyLoading){Text("다시 불러오기")}}
  }
 }
 val crewSummary:@Composable ()->Unit={
  shownDetail?.optJSONObject("crew")?.let{c->
   Surface(color=Panel,shape=MaterialTheme.shapes.large,modifier=Modifier.fillMaxWidth().testTag("crew-home-summary")){
    Column(Modifier.padding(horizontal=12.dp,vertical=8.dp),verticalArrangement=Arrangement.spacedBy(2.dp)){
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text(c.optString("name"),fontSize=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f));if(membership!=null)CrewMuteAction(m,c.getString("id"),membership!!.optInt("muted")==1)}
     Text("LV${c.optInt("level")} · ${c.optInt("members")}/${c.optInt("capacity")}명"+(membership?.let{" · "+(CrewRoles[it.optString("role")]?:"크루원")}?:""),color=Aqua,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
    }
   }
  }
 }
 val crewNavigation:@Composable ()->Unit={
  Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)){
   listOf("채팅" to "chat","멤버" to "members","음악" to "music","소개" to "about").forEach{(tab,tag)->
    FilterChip(crewTab==tab,{if(tab=="채팅"&&!initialChat)selected?.let{m.openCrewMessages(it)} else crewTab=tab},label={Text(tab,fontSize=13.sp)},modifier=Modifier.weight(1f).heightIn(min=48.dp).testTag("crew-tab-$tag"),colors=neutralChipColors(),border=neutralChipBorder(crewTab==tab))
   }
  }
 }
 if(chatPaneVisible){
  val cid=selected!!
  Column(Modifier.fillMaxSize().imePadding().padding(horizontal=18.dp,vertical=8.dp).testTag("crew-scroll"),verticalArrangement=Arrangement.spacedBy(if(keyboardVisible)4.dp else 8.dp)){
   if(!keyboardVisible){pageHeader();crewSummary()}
   Box(Modifier.fillMaxWidth().testTag("crew-chat-title")){crewNavigation()}
   key(cid,joinedBoundary){ChatHistory(m,if(joined)messages else emptyList(),joined&&earlier,historyLoading,{if(joined)screenScope.launch{try{load(older=true,refresh=false)}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}},m.user?.optString("id"),true,retry={if(joined)send(it)},modifier=Modifier.weight(1f),fill=true,emptyLabel=if(joined)null else if(membershipDenied)"크루 가입 상태를 확인한 뒤 대화할 수 있어요." else "가입 이후의 대화를 확인하고 있어요.",loadError=error,reload={screenScope.launch{try{load();error=null}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}},reloadEnabled=!detailLoading&&!historyLoading,author={msg->
    val generation=chatGeneration
    screenScope.launch{try{val latest=m.api.call("/api/crews/$cid",fresh=true);if(!current(cid,generation))return@launch;detail=latest;detailVerified=true;m.rememberCrewDetail(latest);val member=latest.optJSONObject("membership");if(member==null){denyMembership(cid);return@launch};if(member.optLong("joined_sequence")!=joinedBoundary){clearCrewHistory();joinedBoundary=null;verifiedMembership=null;historyReady=false;load(refresh=false);return@launch};val p=latest.optJSONArray("members").objects().find{it.optString("id")==msg.optString("profile_id")};if(p!=null&&member.optString("role")=="owner"&&p.optString("role")!="owner")managing=p}catch(e:Exception){if(e is CancellationException)throw e;if(current(cid,generation))error=e.message}}
   })}
   if(joined&&connection.isNotBlank()&&!keyboardVisible)Text(connection,color=Muted,fontSize=11.sp)
   ChatComposer(if(joined)body else "",{if(joined)body=it},"크루에 이야기 남기기",sending,Modifier.testTag("crew-chat-composer"),"crew-chat",enabled=joined){send()}
  }
 }else Column(Modifier.fillMaxSize().imePadding()){
  Column(Modifier.fillMaxWidth().background(Ink).padding(horizontal=18.dp,vertical=4.dp).testTag("crew-fixed-header")){pageHeader()}
  LazyColumn(Modifier.fillMaxWidth().weight(1f).testTag("crew-scroll"),state=crewScroll,contentPadding=PaddingValues(start=18.dp,end=18.dp,top=8.dp,bottom=18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  if(selected==null){
   item{
    Text(if(myCrew==null)"취향이 맞는 크루에 가입해 함께 듣고 불러보세요." else "새로운 크루를 둘러보고 내 크루로 돌아갈 수 있어요.",color=Muted)
    OutlinedTextField(query,{query=it.take(80)},label={Text("크루 · 관심사 찾기")},modifier=Modifier.fillMaxWidth().focusRequester(searchFocus).testTag("crew-search"),singleLine=true)
    if(result.has("crews")&&myCrew==null)TextButton(onClick={if(m.authenticated())creating=true},modifier=Modifier.testTag("crew-create")){Text("새 크루 만들기")}
   }
   val recent=result.tracks()
   if(!browsing&&recent.isNotEmpty()){item{Section(if(myCrew==null)"크루에서 나온 새 음악" else "우리 크루의 최신 음악")};items(recent.take(6),key={"feed-"+it.id}){CommunityCard(it,m,recent,sing)}}
   item{Section("함께할 크루")}
   items(result.optJSONArray("crews").objects(),key={it.optString("id")}){c->
    Surface(onClick={selectCrew(c.optString("id"))},color=Panel,shape=MaterialTheme.shapes.large,modifier=Modifier.testTag("crew-card-"+c.optString("id"))){Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
     Text(c.optString("name")+if(myCrew==c.optString("id"))" · 내 크루" else "",fontSize=21.sp)
     Text("LV${c.optInt("level")} · ${c.optInt("members")}/${c.optInt("capacity")}명 · ${if(c.optInt("recruiting")==1)"모집 중" else "모집 마감"}",color=Aqua)
     Text(c.optString("description"),fontSize=15.sp);Text(c.optString("interests"),color=Muted)
    }}
   }
   if(result.has("crews")&&result.optJSONArray("crews").objects().isEmpty())item{Text("아직 크루가 없어요. 좋아하는 음악으로 첫 모임을 만들어보세요.",color=Muted)}
  }else if(shownDetail==null){item{CircularProgressIndicator(Modifier.size(28.dp),color=Pink)}}
  else{
   val d=shownDetail;val c=d.getJSONObject("crew");val cid=c.getString("id")
   item{crewSummary();if(joined)crewNavigation()}
   if(!joined||crewTab=="소개")item{
    if(joined)Text("크루 채팅에서는 가입 이후의 대화를 함께 나눌 수 있어요.",fontSize=12.sp,color=Muted)
    Text(c.optString("description"),modifier=Modifier.padding(vertical=8.dp));Text(c.optString("interests"),color=Muted)
    Text("${c.optInt("xp")} XP · "+if(c.isNull("next_xp"))"최고 레벨이에요." else "다음 레벨까지 ${c.optInt("next_xp")-c.optInt("xp")} XP",color=Aqua)
    Text("공개곡 +1 XP · 받은 선물 1골드당 +1 XP · 하루 첫 채팅 +10 XP\nLV1 10명 · LV2 20명 · LV3 50명 · LV4 100명 · LV5 150명",fontSize=14.sp,color=Muted)
    if(!joined)Button(onClick={if(m.authenticated())m.action{m.api.call("/api/crews/$cid/join","POST");browsing=false;m.crewBrowsing=false;crewTab="음악";load()}},enabled=detailVerified&&!detailLoading&&!historyLoading&&d.optJSONObject("membership")==null&&!m.busy&&!d.optBoolean("banned")&&c.optInt("recruiting")==1&&c.optInt("members")<c.optInt("capacity"),modifier=Modifier.testTag("crew-join")){Text(if(d.optBoolean("banned"))"가입할 수 없는 크루" else "크루 가입하기")}
    else Row{if(membership?.optString("role")=="owner")TextButton(onClick={editing=true}){Text("소개 · 모집 수정")};TextButton(onClick={leaving=true},modifier=Modifier.testTag("crew-leave")){Text("크루 탈퇴")}}
   }
   if(!joined||crewTab=="멤버"){
    item{Section("크루 멤버","함께 듣고 부르는 사람들과 교류해요.")}
    items(d.optJSONArray("members").objects(),key={"member-"+it.optString("id")}){p->
     Surface(onClick={if(membership?.optString("role")=="owner"&&p.optString("role")!="owner")managing=p else m.openProfile(p.getString("id"))},color=Panel,shape=MaterialTheme.shapes.large,modifier=Modifier.testTag("crew-member-"+p.optString("id"))){
      Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically){Avatar(p.optString("name"),p);Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(p.optString("name"));Text(CrewRoles[p.optString("role")]?:"크루원",fontSize=12.sp,color=Aqua)}
       if(joined&&p.optString("user_id")!=m.user?.optString("id"))TextButton(onClick={m.openMessages(p.getString("id"))},modifier=Modifier.testTag("crew-member-message-"+p.optString("id"))){Text("메시지",fontSize=12.sp)}
      }
     }
    }
   }
   if(!joined||crewTab=="음악"){
    if(joined)item{CrewHomeBanner(m,c,membership?.optString("role")=="owner"){screenScope.launch{try{load()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}}}
    item{Section("크루의 최신 음악","멤버가 공개한 제작곡과 커버곡")}
    val tracks=d.tracks();items(tracks,key={"track-"+it.id}){CommunityCard(it,m,tracks,sing)}
    if(tracks.isEmpty())item{Text("멤버가 공개한 음악이 여기에 모여요.",color=Muted)}
   }
  }
 }
 }
 managing?.let{p->CrewMemberDialog(p,m.busy,{managing=null},{managing=null;m.openProfile(p.getString("id"))}){role->m.action{
  val cid=selected?:return@action;m.api.call("/api/crews/$cid/members/"+p.getString("id"),if(role==null)"DELETE" else "PATCH",role?.let{payload("role" to it)});managing=null;load()
 }}}
 if(creating||editing)CrewEditor(if(editing)detail?.optJSONObject("crew")else null,m.busy,{creating=false;editing=false}){name,description,interests,recruiting->m.action{
  val data=m.api.call(if(editing)"/api/crews/$selected" else "/api/crews",if(editing)"PATCH" else "POST",payload("name" to name,"description" to description,"interests" to interests,"recruiting" to recruiting));selectCrew(data.getJSONObject("crew").getString("id"));creating=false;editing=false;load()
 }}
 if(leaving)AlertDialog(onDismissRequest={leaving=false},title={Text("크루에서 탈퇴할까요?")},text={Text("크루장이라면 가장 먼저 가입한 멤버에게 크루장을 넘겨요. 마지막 멤버가 나가면 크루와 채팅이 삭제돼요.")},confirmButton={TextButton(onClick={m.action{m.api.call("/api/crews/$selected/leave","POST");selected?.let{denyMembership(it)};m.invalidateCrewPreviews();myCrew=null;m.lastKnownCrewId=null;selectCrew(null);leaving=false;load()}}){Text("탈퇴")}},dismissButton={TextButton(onClick={leaving=false}){Text("취소")}})
}

@Composable private fun CrewEditor(c:JSONObject?,busy:Boolean,dismiss:()->Unit,save:(String,String,String,Boolean)->Unit){
 var name by remember{mutableStateOf(c?.optString("name")?:"")};var description by remember{mutableStateOf(c?.optString("description")?:"")};var interests by remember{mutableStateOf(c?.optString("interests")?:"")};var recruiting by remember{mutableStateOf(c?.optInt("recruiting",1)!=0)}
 AlertDialog(onDismissRequest=dismiss,title={Text(if(c==null)"새 크루" else "크루 소개와 모집")},text={Column(Modifier.verticalScroll(rememberScrollState())){
  OutlinedTextField(name,{name=it.take(40)},label={Text("크루 이름")},enabled=c==null)
  OutlinedTextField(description,{description=it.take(1000)},label={Text("크루 소개")},minLines=2)
  OutlinedTextField(interests,{interests=it.take(160)},label={Text("관심사 · 예: Ballad, K-POP")})
  Row{Checkbox(recruiting,{recruiting=it});Text("새 멤버 모집")}
 }},confirmButton={TextButton(onClick={save(name,description,interests,recruiting)},enabled=!busy&&name.isNotBlank()){Text("저장")}},dismissButton={TextButton(onClick=dismiss){Text("취소")}})
}

@Composable internal fun MessagesSheet(m:MusicModel,embedded:Boolean=false){
 if(m.user==null){if(embedded)Column(Modifier.padding(24.dp)){Heading("메시지","음악으로 만난 사람들과 대화해요.");Button(onClick={m.showLogin=true}){Text("로그인")}};return}
 if(m.messageCrew!=null){
  val content:@Composable ()->Unit={Column(Modifier.fillMaxSize()){TextButton(onClick={m.messageCrew=null}){Icon(Icons.AutoMirrored.Rounded.ArrowBack,null);Text("메시지 목록")};CrewScreen(m,{m.notice="크루 홈에서 부르기를 선택해주세요."},m.messageCrew,true)}}
  androidx.activity.compose.BackHandler{m.messageCrew=null}
  if(embedded)content() else ModalBottomSheet(onDismissRequest={m.dismissMessages()},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){Box(Modifier.fillMaxHeight(.94f)){content()}}
  return
 }
 val context=LocalContext.current.applicationContext
 val accountId=m.user!!.optString("id")
 val peerId=m.messagePeer
 val cached=remember(accountId,peerId){NativeChatCache.peek(context,accountId)}
 val cachedThread=peerId?.let{cached?.threads?.get(it)}
 val knownPeer=cachedThread?.peer?:cached?.conversations?.find{it.optString("id")==peerId}
 var conversations by remember(accountId){mutableStateOf(cached?.conversations?:emptyList())}
 var data by remember(accountId,peerId){mutableStateOf<JSONObject?>(knownPeer?.let{payload("peer" to it)})}
 var messages by remember(accountId,peerId){mutableStateOf(cachedThread?.messages?:emptyList())}
 var latestSequence by remember(accountId,peerId){mutableLongStateOf(cachedThread?.readSequence?:0L)}
 var earlier by remember(accountId,peerId){mutableStateOf(cachedThread?.earlier?:false)}
 val draftState=remember(accountId,peerId){mutableStateOf(cachedThread?.draft?:"")}
 var body by draftState
 var sending by remember(accountId,peerId){mutableStateOf(false)}
 var historyLoading by remember(accountId,peerId){mutableStateOf(false)}
 val sheetScope=rememberCoroutineScope()
 var connection by remember(accountId,peerId){mutableStateOf("")}
 var error by remember(accountId,peerId){mutableStateOf<String?>(null)}
 var hydrated by remember(accountId,peerId){mutableStateOf(cached!=null)}
 var synced by remember(accountId,peerId){mutableStateOf(false)}
 val profileOverlay=m.profile!=null||m.showGifts||m.showBilling||m.showRewards
 androidx.activity.compose.BackHandler(embedded&&m.messagePeer!=null&&!profileOverlay){m.messagePeer=null}
 androidx.activity.compose.BackHandler(!embedded&&!profileOverlay){m.dismissMessages()}
 fun openMessageProfile(person:JSONObject){
  // The DM API's id is a producer profile id; message sender_id/recipient_id are account ids.
  val id=person.optString("id").takeIf{it.isNotBlank()&&it!="null"}?:return
  m.openProfile(id)
 }
 val lifecycle=LocalLifecycleOwner.current.lifecycle
 fun current(pid:String?)=m.user?.optString("id")==accountId&&m.messagePeer==pid
 suspend fun load(older:Boolean=false,refreshLatest:Boolean=false){
  val pid=peerId
  if(!current(pid))return
  if(pid==null){
   val inbox=m.api.call("/api/dm");val result=inbox.optJSONArray("conversations").objects();if(!current(pid))return
   m.inboxCrew=inbox.optJSONObject("crew");m.unreadMessages=inbox.optInt("unread")
   conversations=result;synced=true;NativeChatCache.saveConversations(context,accountId,result);return
  }
  val cursor=if(older)chatCursor(messages,true)else if(!refreshLatest&&latestSequence>0)"?after=$latestSequence" else ""
  val d=m.api.call("/api/dm/$pid"+cursor)
  if(!current(pid))return
  data=d;synced=true;if(older||latestSequence==0L)earlier=d.optBoolean("has_more")
  val cutoff=d.optJSONObject("settings")?.optLong("cleared_sequence")?:0L
  NativeChatCache.clearThrough(context,accountId,pid,cutoff)
  messages=applyDmReadReceipt(mergeChat(messages.filter{it.optLong("sequence")==0L||it.optLong("sequence")>cutoff},d.optJSONArray("messages").objects()),accountId,d.optJSONObject("read_receipt"))
  if(!older)latestSequence=maxOf(latestSequence,d.optJSONArray("messages").objects().maxOfOrNull{it.optLong("sequence")}?:0L)
  NativeChatCache.saveThread(context,accountId,pid,d.optJSONObject("peer"),messages,earlier,readSequence=latestSequence)
  if(!current(pid))return
  if(messages.any{it.optString("recipient_id")==accountId&&it.optLong("read_at")==0L}){
   m.api.call("/api/dm/$pid","PATCH");m.refreshMessageSummary()
   if(!current(pid))return
   messages=messages.map{if(it.optString("recipient_id")==accountId&&it.optLong("read_at")==0L)JSONObject(it.toString()).put("read_at",System.currentTimeMillis()/1000)else it}
   NativeChatCache.saveThread(context,accountId,pid,d.optJSONObject("peer"),messages,earlier,readSequence=latestSequence)
  }
  if(!older&&cursor.isNotEmpty()&&d.optBoolean("has_more"))load()
 }
 fun send(retry:JSONObject?=null){val pid=peerId?:return;if(!current(pid)||(retry==null&&body.isBlank())||sending)return
  val rid=retry?.optString("request_id")?:UUID.randomUUID().toString()
  val pending=retry?.let{JSONObject(it.toString())}?:payload("id" to "pending:$rid","request_id" to rid,"body" to body.trim(),"created" to System.currentTimeMillis()/1000,"sender_id" to accountId)
  val person=data?.optJSONObject("peer");val hadEarlier=earlier
  pending.put("delivery","sending");messages=mergeChat(messages,listOf(pending));if(retry==null)body="";sending=true
  m.viewModelScope.launch{try{
   NativeChatCache.saveThread(context,accountId,pid,person,listOf(pending),hadEarlier,draft=draftState.value)
   if(m.user?.optString("id")!=accountId)return@launch
   val sent=m.api.call("/api/dm/$pid","POST",payload("body" to pending.optString("body"),"request_id" to rid,"image_id" to pending.optString("image_id").takeIf{it.isNotBlank()}))
   if(m.user?.optString("id")==accountId)sent.optJSONObject("message")?.let{message->
    NativeChatCache.saveThread(context,accountId,pid,person,listOf(message),hadEarlier)
    // A POST confirms this send only; earlier peer messages may still be unread.
    // Advance the history cursor exclusively after a GET has retrieved the gap.
    if(current(pid))messages=mergeChat(messages,listOf(message))
   }
  }catch(e:Exception){
   if(e is CancellationException)throw e
   val failed=JSONObject(pending.toString()).put("delivery","failed")
   NativeChatCache.saveThread(context,accountId,pid,person,listOf(failed),hadEarlier)
   if(current(pid)&&messages.any{it.optString("id")==pending.optString("id")})messages=mergeChat(messages,listOf(failed))
   if(m.user?.optString("id")==accountId){if(e is ApiException&&e.status==401){m.user=null;m.showLogin=true};m.notice=e.message?:"메시지를 보내지 못했어요. 다시 시도해주세요."}
  }finally{sending=false}}
 }
 // Dispose flushes the captured peer's draft even when the sheet closes before debounce.
 DisposableEffect(accountId,peerId){onDispose{if(peerId!=null){val draft=draftState.value;if(hydrated||draft.isNotEmpty())m.viewModelScope.launch{NativeChatCache.saveDraft(context,accountId,peerId,draft)}}}}
 LaunchedEffect(accountId,peerId,body,hydrated){if(peerId!=null&&hydrated){delay(200);NativeChatCache.saveDraft(context,accountId,peerId,body)}}
 LaunchedEffect(peerId,accountId){
  val snapshot=NativeChatCache.read(context,accountId)
  if(!current(peerId))return@LaunchedEffect
  conversations=snapshot.conversations
  peerId?.let{snapshot.threads[it]}?.let{thread->
   if(data==null)data=thread.peer?.let{payload("peer" to it)}
   messages=mergeChat(thread.messages,messages);latestSequence=maxOf(latestSequence,thread.readSequence);earlier=thread.earlier
   if(body.isEmpty())body=thread.draft
  }
  hydrated=true
  lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED){
   try{
    try{
     val historyWasCached=latestSequence>0L
     // Fill every sequence since the device snapshot before refreshing read receipts.
     // Jumping straight to the newest page could leave a gap after a long offline period.
     load();if(historyWasCached&&current(peerId))load(refreshLatest=true)
    }catch(e:Exception){if(e is CancellationException)throw e;if(current(peerId))error=e.message;if(e is ApiException&&e.status in listOf(401,403))throw e}
    m.api.watchChat(peerId?.let{"?peer=$it"}?:"",{if(current(peerId))connection=it}){load();if(current(peerId))error=null}
   }
   catch(e:Exception){if(e is CancellationException)throw e;if(current(peerId))error=e.message}
  }
 }
 val content:@Composable ()->Unit={
  val peer=data?.optJSONObject("peer")
  val panelModifier=if(embedded)Modifier.fillMaxSize()else Modifier.fillMaxWidth().fillMaxHeight(.92f)
  Column(panelModifier.imePadding().testTag("dm-panel")){
   Row(Modifier.fillMaxWidth().padding(horizontal=12.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
    if(m.messagePeer!=null)IconButton(onClick={if(!embedded&&m.messagesReturnToProfile)m.dismissMessages() else m.messagePeer=null},modifier=Modifier.testTag("dm-back")){Icon(Icons.AutoMirrored.Rounded.ArrowBack,if(!embedded&&m.messagesReturnToProfile)"이전 페이지로" else "대화 목록으로")}
    if(m.messagePeer!=null&&peer!=null)MessageProfileAvatar(peer,"dm-peer-profile-"+peer.optString("id"),44){openMessageProfile(peer)}
    Text(peer?.optString("name")?:if(m.messagePeer!=null)"대화" else "메시지",fontSize=21.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f),maxLines=2,overflow=TextOverflow.Ellipsis)
    DmActions(m,peerId,data?.optJSONObject("settings")?.optInt("muted")==1,{value->data=JSONObject((data?:JSONObject()).toString()).put("settings",payload("muted" to if(value)1 else 0))},{body="";messages=emptyList();conversations=emptyList();m.messagePeer=null;sheetScope.launch{try{load()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}})
    if(m.messagePeer!=null&&peer!=null){
     val id=peer.optString("id");val followed=m.follows.any{it.optString("kind")=="producer"&&it.optString("target_id")==id}
     TextButton(onClick={m.followPerson(id)},enabled=!m.busy,modifier=Modifier.testTag("dm-peer-follow"),contentPadding=PaddingValues(horizontal=6.dp)){Text(if(followed)"팔로잉" else "팔로우",fontSize=12.sp)}
    }
   }
   error?.let{Text(it,color=Pink,modifier=Modifier.padding(horizontal=18.dp))}
   if(m.messagePeer==null){
    LazyColumn(Modifier.fillMaxWidth().weight(1f),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
     m.inboxCrew?.let{crew->item(key="pinned-crew"){Surface(onClick={m.openCrewMessages(crew.getString("id"))},color=Raised,shape=MaterialTheme.shapes.large){Row(Modifier.fillMaxWidth().padding(16.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text("내 크루 · 고정",color=Aqua,fontSize=12.sp);Text(crew.optString("name"));Text("크루 채팅",color=Muted,fontSize=13.sp)};if(crew.optInt("unread")>0)Badge{Text(crew.optInt("unread").toString())}}}}}
     item{TextButton(onClick={sheetScope.launch{try{m.api.call("/api/dm/read-all","POST");load()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}}){Text("모두 읽음")}}
     items(conversations,key={it.optString("id")}){p->
      Surface(onClick={m.messagePeer=p.getString("id")},color=Panel,shape=MaterialTheme.shapes.large,modifier=Modifier.testTag("dm-conversation-"+p.optString("id"))){Row(Modifier.fillMaxWidth().padding(14.dp),verticalAlignment=Alignment.CenterVertically){
       MessageProfileAvatar(p,"dm-list-profile-"+p.optString("id"),44){openMessageProfile(p)}
       Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(p.optString("name"),fontWeight=FontWeight.SemiBold);Text(p.optString("last_message"),color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,fontSize=13.sp)}
       DmActions(m,p.getString("id"),p.optInt("muted")==1,{value->conversations=conversations.map{if(it.optString("id")==p.optString("id"))JSONObject(it.toString()).put("muted",if(value)1 else 0)else it}},{},withDelete=false)
       Column(horizontalAlignment=Alignment.End){Text(chatTime(p.optLong("updated")),color=Muted,fontSize=10.sp);if(p.optInt("unread")>0)Text("${p.optInt("unread")} 새 메시지",color=Pink,fontSize=11.sp)}
      }}
     }
     if(conversations.isEmpty())item{Text(if(synced)"아직 나눈 대화가 없어요. 프로필의 메시지로 시작해보세요." else "대화 목록을 확인하고 있어요.",color=Muted)}
    }
   }else{
    ChatHistory(m,messages,earlier,historyLoading,{if(!historyLoading){historyLoading=true;sheetScope.launch{try{load(older=true)}catch(e:Exception){if(e is CancellationException)throw e;if(current(peerId))error=e.message}finally{historyLoading=false}}}},m.user?.optString("id"),false,peer=peer?.optString("name")?:"",retry={send(it)},modifier=Modifier.weight(1f).padding(horizontal=8.dp),fill=true,peerPerson=peer,openPeer={peer?.let{openMessageProfile(it)}})
    if(connection.isNotBlank())Text(connection,color=Muted,fontSize=11.sp,modifier=Modifier.padding(horizontal=18.dp))
    DmAttachments(m,peerId!!,sending){if(sending)m.notice="메시지 전송이 끝나면 사진을 다시 선택해주세요." else send(it)}
    ChatComposer(body,{body=it},"메시지",sending,Modifier.fillMaxWidth().padding(horizontal=14.dp,vertical=10.dp).testTag("dm-composer"),"dm"){send()}
   }
  }
 }
 // Keep conversation state while a profile is on top, with only one modal dialog visible.
 if(!profileOverlay){
  if(embedded)content() else ModalBottomSheet(onDismissRequest={m.dismissMessages()},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){content()}
 }
}

@Composable private fun MessageProfileAvatar(person:JSONObject,tag:String,size:Int=38,open:()->Unit){
 val name=person.optString("name")
 Box(Modifier.size(size.dp).testTag(tag).clickable(onClickLabel="상대 페이지 보기",role=Role.Button,onClick=open).semantics(mergeDescendants=true){contentDescription="$name 페이지 보기"},contentAlignment=Alignment.Center){Avatar(name,person,size)}
}

@Composable private fun ChatComposer(body:String,change:(String)->Unit,label:String,busy:Boolean,modifier:Modifier=Modifier,tagPrefix:String?=null,enabled:Boolean=true,send:()->Unit){
 var value by remember(tagPrefix){mutableStateOf(TextFieldValue(body,TextRange(body.length)))}
 if(value.text!=body)value=TextFieldValue(body,TextRange(body.length))
 val changeValue:(TextFieldValue)->Unit={next->if(next.composition!=null||next.text.length<=2000){value=next;change(next.text)}}
 Row(modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
  val inputModifier=Modifier.weight(1f).then(tagPrefix?.let{Modifier.testTag("$it-input")}?:Modifier)
  val keyboardOptions=KeyboardOptions(imeAction=ImeAction.Send)
  val keyboardActions=KeyboardActions(onSend={if(enabled&&value.composition==null&&body.isNotBlank()&&body.length<=2000&&!busy)send()})
  if(tagPrefix=="dm")TextField(value,changeValue,placeholder={Text(label,fontSize=13.sp)},modifier=inputModifier,enabled=enabled,singleLine=true,keyboardOptions=keyboardOptions,keyboardActions=keyboardActions,shape=RoundedCornerShape(18.dp),colors=TextFieldDefaults.colors(focusedContainerColor=Panel,unfocusedContainerColor=Panel,disabledContainerColor=Panel,focusedIndicatorColor=androidx.compose.ui.graphics.Color.Transparent,unfocusedIndicatorColor=androidx.compose.ui.graphics.Color.Transparent,disabledIndicatorColor=androidx.compose.ui.graphics.Color.Transparent))
  else OutlinedTextField(value,changeValue,label={Text(label,fontSize=13.sp)},modifier=inputModifier,enabled=enabled,singleLine=true,keyboardOptions=keyboardOptions,keyboardActions=keyboardActions,shape=RoundedCornerShape(18.dp))
  Button(onClick=send,enabled=enabled&&body.isNotBlank()&&body.length<=2000&&!busy,modifier=Modifier.heightIn(min=48.dp).then(tagPrefix?.let{Modifier.testTag("$it-send")}?:Modifier),contentPadding=PaddingValues(horizontal=12.dp)){Text("보내기",fontSize=13.sp)}
 }
}
@Composable private fun ChatHistory(m:MusicModel,messages:List<JSONObject>,earlier:Boolean,busy:Boolean,loadEarlier:()->Unit,userId:String?,crew:Boolean,peer:String="",retry:((JSONObject)->Unit)?=null,modifier:Modifier=Modifier,fill:Boolean=false,peerPerson:JSONObject?=null,openPeer:(()->Unit)?=null,emptyLabel:String?=null,loadError:String?=null,reload:(()->Unit)?=null,reloadEnabled:Boolean=true,author:((JSONObject)->Unit)?=null){
 val peerKey=peerPerson?.optString("id")
 val state=remember(peerKey,crew){LazyListState()}
 var initialized by remember(peerKey,crew){mutableStateOf(false)}
 LaunchedEffect(messages.lastOrNull()?.optString("id")){
  val last=state.layoutInfo.visibleItemsInfo.lastOrNull()?.index?:0
  if(messages.isNotEmpty()&&(!initialized||last>=messages.size-4)){state.scrollToItem(messages.lastIndex);initialized=true}
 }
 Column(modifier){
  if(earlier)TextButton(onClick=loadEarlier,enabled=!busy){Text("이전 대화 보기")}
  val historyModifier=Modifier.fillMaxWidth().then(if(fill)Modifier.weight(1f)else Modifier.height(480.dp)).background(if(crew)Panel else Ink).testTag("chat-history")
  LazyColumn(historyModifier,state=state,contentPadding=PaddingValues(10.dp),verticalArrangement=Arrangement.spacedBy(if(crew)4.dp else 10.dp,Alignment.Bottom)){
   if(messages.isEmpty())item{Text(emptyLabel?:if(crew)"첫 이야기를 남겨보세요." else "메시지를 보내 대화를 시작해보세요.",color=Muted,fontSize=14.sp,modifier=Modifier.padding(12.dp))}
   items(messages,key={it.optString("id")}){msg->
    val mine=(if(crew)msg.optString("user_id")else msg.optString("sender_id"))==userId
    if(msg.optString("kind")=="system")Text(msg.optString("body"),modifier=Modifier.fillMaxWidth().padding(vertical=6.dp),color=Muted,fontSize=13.sp,textAlign=TextAlign.Center)
    else if(crew){
     val name=crewName(msg)
     Text(buildAnnotatedString{withStyle(SpanStyle(color=Aqua,fontWeight=FontWeight.SemiBold)){append(name)};append(" ");append(msg.optString("body"))},fontSize=16.sp,lineHeight=24.sp,modifier=Modifier.fillMaxWidth().then(if(author!=null)Modifier.clickable{author(msg)}else Modifier).padding(vertical=4.dp))
     if(msg.optString("delivery")=="sending")Text("전송 중…",color=Muted,fontSize=12.sp)
     if(msg.optString("delivery")=="failed")TextButton(onClick={retry?.invoke(msg)},enabled=!busy){Text("다시 보내기")}
    }else{
     Row(Modifier.fillMaxWidth().testTag("dm-message-"+msg.optString("id")),horizontalArrangement=if(mine)Arrangement.End else Arrangement.Start,verticalAlignment=Alignment.Top){
      if(!mine&&peerPerson!=null){MessageProfileAvatar(peerPerson,"dm-message-profile-"+msg.optString("id"),36){openPeer?.invoke()};Spacer(Modifier.width(8.dp))}
      Column(Modifier.widthIn(max=260.dp),horizontalAlignment=if(mine)Alignment.End else Alignment.Start){
       Surface(color=if(mine)Raised else Panel,shape=RoundedCornerShape(topStart=18.dp,topEnd=18.dp,bottomEnd=if(mine)4.dp else 18.dp,bottomStart=if(mine)18.dp else 4.dp)){
        if(msg.optString("image_id").isNotBlank()&&msg.optString("image_id")!="null")ChatImage(m,msg) else Text(msg.optString("body"),fontSize=15.sp,lineHeight=23.sp,modifier=Modifier.padding(horizontal=13.dp,vertical=11.dp))
       }
       Row(Modifier.padding(top=4.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)){
        Text(chatTime(msg.optLong("created")),color=Muted,fontSize=10.sp)
        if(mine&&msg.optLong("read_at")>0)Text("읽음",color=Muted,fontSize=10.sp)
        if(msg.optString("delivery")=="sending")Text("전송 중…",color=Muted,fontSize=10.sp)
       }
       if(msg.optString("delivery")=="failed")TextButton(onClick={retry?.invoke(msg)},enabled=!busy){Text("다시 보내기")}
      }
     }
    }
   }
   loadError?.let{message->item(key="history-load-error"){
    Column(Modifier.fillMaxWidth().padding(horizontal=12.dp)){
     Text(message,color=Pink,fontSize=13.sp)
     reload?.let{again->TextButton(onClick=again,enabled=reloadEnabled){Text("다시 불러오기")}}
    }
   }}
  }
 }
}
@Composable private fun CrewMemberDialog(person:JSONObject,busy:Boolean,dismiss:()->Unit,profile:()->Unit,save:(String?)->Unit){
 var role by remember(person.optString("id")){mutableStateOf(person.optString("role","member"))}
 var kick by remember{mutableStateOf(false)}
 AlertDialog(onDismissRequest=dismiss,title={Text(person.optString("name"))},text={Column(Modifier.verticalScroll(rememberScrollState())){
  TextButton(onClick=profile){Text("프로필 보기")}
  if(kick)Text("이 멤버를 강퇴하면 이 크루에 다시 가입할 수 없어요.")else{
   Text("크루 직책",fontSize=18.sp)
   CrewRoles.filterKeys{it!="owner"}.forEach{(key,label)->Row(verticalAlignment=Alignment.CenterVertically,modifier=Modifier.fillMaxWidth().clickable{role=key}){RadioButton(role==key,{role=key});Text(label)}}
   TextButton(onClick={kick=true}){Text("크루에서 강퇴",color=Pink)}
  }
 }},confirmButton={TextButton(onClick={save(if(kick)null else role)},enabled=!busy){Text(if(kick)"강퇴" else "직책 저장")}},dismissButton={TextButton(onClick={if(kick)kick=false else dismiss()}){Text("취소")}})
}
