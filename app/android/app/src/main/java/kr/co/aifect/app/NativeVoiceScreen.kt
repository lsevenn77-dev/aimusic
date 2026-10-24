@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class,androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package kr.co.aifect.app

import android.Manifest
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URLEncoder

@Composable internal fun NativeAudioHeader(title:String,close:()->Unit,actions:@Composable RowScope.()->Unit={}){
 Row(Modifier.fillMaxWidth().heightIn(min=54.dp),verticalAlignment=Alignment.CenterVertically){IconButton(close){Icon(Icons.Outlined.ArrowBack,"돌아가기")};Text(title,Modifier.weight(1f),fontSize=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis);actions()}
}
@Composable internal fun NativeVoiceScreen(engine:NativeVoiceEngine,leave:()->Unit){
 val state by engine.state.collectAsState();val status by engine.status.collectAsState();val error by engine.error.collectAsState();val mic by engine.micOn.collectAsState();val level by engine.level.collectAsState()
 val context=LocalContext.current;val scope=rememberCoroutineScope();val members=state.optJSONArray("members").objects();val room=state.optJSONObject("room")?:JSONObject();val self=members.find{it.optString("id")==state.optString("self")};val host=self?.optString("role")=="host"
 var panel by remember{mutableStateOf("")};var target by remember{mutableStateOf<JSONObject?>(null)};var message by remember{mutableStateOf("")};var messageId by remember{mutableStateOf(requestIdentity())};var sending by remember{mutableStateOf(false)}
 val micPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){ok->if(ok)engine.launch{engine.microphone(true)}else engine.error.value="마이크 권한이 필요해요. 대화 청취는 계속할 수 있어요."}
 fun action(name:String,data:JSONObject=JSONObject()){engine.launch{engine.command(name,data)}}
 val keyboard=WindowInsets.isImeVisible
 val chats=(state.optJSONArray("chat").objects()+state.optJSONArray("notices").objects()).sortedBy{it.optLong("sequence")}
 val chatList=rememberLazyListState()
 LaunchedEffect(chats.lastOrNull()?.optString("id")){
  if(chats.isNotEmpty()&&!chatList.isScrollInProgress&&(chatList.layoutInfo.visibleItemsInfo.lastOrNull()?.index?:0)>=chats.lastIndex-3)chatList.animateScrollToItem(chats.lastIndex)
 }
 fun send(){
  if(message.isBlank()||sending)return
  sending=true
  scope.launch{try{engine.command("chat",payload("body" to message,"request_id" to messageId));message="";messageId=requestIdentity();engine.command("heartbeat")}
   catch(e:Exception){if(e is kotlinx.coroutines.CancellationException)throw e;engine.error.value=e.message}finally{sending=false}}
 }
 Column(Modifier.fillMaxSize().testTag("native-voice-room")){
  NativeAudioHeader("토킹룸",leave){
   IconButton({panel="members"}){Icon(Icons.Outlined.Group,"참여자")}
   IconButton({panel="sound"}){Icon(Icons.Outlined.MicNone,"소리 설정")}
   IconButton({panel="room"}){Icon(Icons.Outlined.Home,"방 설정")}
   IconButton({context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"${room.optString("title")}\nhttps://aifect.co.kr/#voice/${engine.roomId}"),"토킹룸 공유"))}){Icon(Icons.Outlined.Share,"공유")}
  }
  Column(Modifier.fillMaxWidth().padding(horizontal=16.dp)){
   Text(room.optString("title","토킹룸"),fontSize=20.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)
   if(!keyboard)Text("${members.size}명 · $status",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=4.dp,bottom=10.dp))
   BoxWithConstraints(Modifier.fillMaxWidth()){
    val diameter=((maxWidth-24.dp)/4-6.dp).coerceIn(40.dp,if(keyboard)44.dp else 58.dp)
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
     (0..7).toList().chunked(4).forEach{seats->
      Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
       seats.forEach{seat->
        val person=members.find{!it.isNull("seat")&&it.optInt("seat")==seat}
        Column(Modifier.weight(1f).clickable{if(person!=null){target=person;panel="person"}else if(seat>0)action("request-mic",payload("seat" to seat))}.testTag("voice-seat-$seat"),horizontalAlignment=Alignment.CenterHorizontally){
         Box(Modifier.size(diameter).border(1.dp,if(person?.optString("role")=="host")Pink else Stroke,CircleShape),contentAlignment=Alignment.Center){
          if(person!=null){NativeMemberAvatar(person,(diameter.value-4).toInt());if(person.optBoolean("muted"))Icon(Icons.Outlined.MicOff,null,Modifier.align(Alignment.BottomEnd).size(18.dp).background(Panel,CircleShape),tint=Muted)}
          else Icon(Icons.Outlined.Add,"좌석 참여 신청",Modifier.size(22.dp),tint=Muted)
         }
         Text(person?.optString("name")?:"빈 좌석",fontSize=12.sp,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
        }
       }
      }
     }
    }
   }
   Row(Modifier.fillMaxWidth().heightIn(min=44.dp),verticalAlignment=Alignment.CenterVertically){
    Text(if(self?.optBoolean("requested")==true)"방장 승인 대기" else if(self?.isNull("seat")!=false)"대화 청취 중" else if(mic)"내 마이크 켜짐" else "내 마이크 꺼짐",fontSize=12.sp,color=Muted,modifier=Modifier.weight(1f))
    if(self?.optBoolean("requested")==true)TextButton({action("cancel-mic")}){Text("신청 취소")}
    if(self?.isNull("seat")==false){
     IconButton(onClick={if(mic)engine.launch{engine.microphone(false)}else micPermission.launch(Manifest.permission.RECORD_AUDIO)},enabled=!self.optBoolean("locked"),modifier=Modifier.testTag("voice-microphone")){Icon(if(mic)Icons.Outlined.Mic else Icons.Outlined.MicOff,if(mic)"내 마이크 끄기" else "내 마이크 켜기",tint=if(mic)Pink else Muted)}
     if(!host)IconButton({action("release-mic")}){Icon(Icons.Outlined.Logout,"좌석 내려가기",tint=Muted)}
    }
   }
  }
  HorizontalDivider(color=Stroke)
  LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("native-voice-conversation"),state=chatList,contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   room.optString("announcement").takeIf{it.isNotBlank()}?.let{notice->item{Text(notice,color=SoftText,fontSize=13.sp)}}
   state.optJSONArray("seat_invites").objects().forEach{invite->item{Text("좌석 초대가 왔어요",fontSize=13.sp);Row{TextButton({action("seat-answer",payload("invitation_id" to invite.getString("id"),"accept" to true))}){Text("수락")};TextButton({action("seat-answer",payload("invitation_id" to invite.getString("id"),"accept" to false))}){Text("거절")}}}}
   if(host)members.filter{it.optBoolean("requested")}.forEach{person->item{Row(verticalAlignment=Alignment.CenterVertically){Text("${person.optString("name")} · 좌석 신청",Modifier.weight(1f),fontSize=13.sp);TextButton({action("approve-mic",payload("target_id" to person.getString("id")))}){Text("승인")};TextButton({action("reject-mic",payload("target_id" to person.getString("id")))}){Text("거절")}}}}
   if(error!=null)item{Text(error.orEmpty(),color=Muted,fontSize=13.sp);TextButton({engine.error.value=null;engine.retry()}){Text("연결 다시 확인")}}
   itemsIndexed(chats,key={index,chat->chat.optString("id").ifBlank{"notice-${chat.optLong("sequence")}-${index}"}}){_,chat->
    if(chat.optString("kind")=="system")Text(chat.optString("body"),color=Muted,fontSize=12.sp)
    else Row(verticalAlignment=Alignment.Top,horizontalArrangement=Arrangement.spacedBy(9.dp)){
     NativeMemberAvatar(chat,30)
     Column{Text(chat.optString("name"),fontSize=11.sp,color=Muted);Text(chat.optString("body"),fontSize=14.sp,color=if(chat.optString("kind")=="gift")Pink else SoftText,modifier=Modifier.padding(top=4.dp))}
    }
   }
  }
  Row(Modifier.padding(horizontal=12.dp,vertical=6.dp),verticalAlignment=Alignment.CenterVertically){
   OutlinedTextField(message,{if(it.length<=500){message=it;messageId=requestIdentity()}},placeholder={Text("메시지를 입력하세요",fontSize=14.sp)},modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp),maxLines=3,enabled=!sending,keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(imeAction=androidx.compose.ui.text.input.ImeAction.Send),keyboardActions=androidx.compose.foundation.text.KeyboardActions(onSend={send()}))
   IconButton(enabled=message.isNotBlank()&&!sending,onClick=::send){Icon(Icons.Outlined.Send,"메시지 보내기",tint=Muted)}
  }
  val music=state.optJSONObject("music")?:JSONObject();val song=music.optJSONArray("queue")?.optJSONObject(music.optInt("index",-1))
  if(!keyboard)Row(Modifier.fillMaxWidth().background(Panel).heightIn(min=54.dp).padding(horizontal=8.dp),verticalAlignment=Alignment.CenterVertically){
   IconButton({panel="music"}){Icon(Icons.Outlined.QueueMusic,"공동 음악",tint=Muted)}
   Column(Modifier.weight(1f)){Text(song?.optString("title")?:"함께 들을 음악",fontSize=14.sp,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis);song?.optString("artist")?.let{Text(it,fontSize=11.sp,color=Muted)}}
   if(host){IconButton({action("music",payload("operation" to if(music.optBoolean("playing"))"pause" else "play","request_id" to requestIdentity()))}){Icon(if(music.optBoolean("playing"))Icons.Outlined.Pause else Icons.Outlined.PlayArrow,"공동 음악 재생",tint=Muted)};IconButton({action("music",payload("operation" to "next","request_id" to requestIdentity()))}){Icon(Icons.Outlined.SkipNext,"다음 곡",tint=Muted)}}
  }
 }
 if(panel.isNotBlank())ModalBottomSheet(onDismissRequest={panel=""},containerColor=Panel,dragHandle=null){Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  when(panel){
   "sound"->NativeVoiceSoundSettings(engine)
   "room"->if(host)NativeRoomForm(engine.api,room){data->engine.launch{engine.command("settings",data.put("revision",room.optInt("settings_revision")));panel=""}}else{Text(room.optString("title"),fontSize=20.sp);Text(room.optString("announcement"),color=Muted)}
   "members"->{Text("참여자 ${members.size}",fontSize=20.sp);members.forEach{p->TextButton({target=p;panel="person"}){NativeMemberAvatar(p,36);Text(p.optString("name"),Modifier.padding(start=10.dp))}}}
   "person"->target?.let{p->Text(p.optString("name"),fontSize=22.sp);if(p.optString("id")!=state.optString("self")){Button({panel="gift"}){Text("선물 보내기")};if(host){listOf("mute" to "마이크 제한","unlock" to "제한 해제","remove-seat" to "좌석 내리기","kick" to "강퇴").forEach{(op,label)->TextButton({action("moderate",payload("target_id" to p.getString("id"),"operation" to op));panel=""}){Text(label)}}}}}
   "gift"->target?.let{NativeRoomGift(engine,it){panel=""}}
   "music"->NativeRoomMusic(engine)
   "invite"->NativeRoomInvite(engine)
  }
  if(panel=="members")OutlinedButton({panel="invite"}){Text("음악 친구 초대")}
  if(panel=="person"&&host)target?.let{person->
   Text("빈 좌석 선택",fontSize=14.sp)
   FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){(1..7).filter{s->members.none{!it.isNull("seat")&&it.optInt("seat")==s}}.forEach{s->
    OutlinedButton({if(person.isNull("seat"))action("seat-invite",payload("target_id" to person.getString("id"),"seat" to s))else action("moderate",payload("target_id" to person.getString("id"),"operation" to "move-seat","seat" to s));panel=""}){Text("${s+1}번")}
   }}
  }
  if(panel=="room")OutlinedButton({engine.launch{engine.command("close");leave()}}){Text("방 종료")}
  Spacer(Modifier.height(16.dp))
 }}
}
@Composable internal fun NativeMemberAvatar(p:JSONObject,size:Int){val id=p.optString("profile_id",p.optString("id"));AsyncImage(if(id.isNotBlank())Endpoint.url("/media/producer/$id?v=${p.optString("image_version")}")else Endpoint.url("/assets/default-avatar.png"),null,Modifier.size(size.dp).clip(CircleShape),contentScale=androidx.compose.ui.layout.ContentScale.Crop)}
@Composable private fun NativeVoiceSoundSettings(e:NativeVoiceEngine){
 var preset by remember{mutableStateOf(e.preset)};var gain by remember{mutableFloatStateOf(e.inputGain)};var voice by remember{mutableFloatStateOf(e.voiceVolume.toFloat())};var reverb by remember{mutableFloatStateOf(e.reverb)};var speaker by remember{mutableStateOf(e.isSpeaker())}
 var localMusic by remember{mutableFloatStateOf(e.localMusicVolume)};var echo by remember{mutableStateOf(e.echoCancellation)};var noise by remember{mutableStateOf(e.noiseSuppression)}
 Text("소리 설정",fontSize=21.sp,fontWeight=FontWeight.Bold);Text("마이크 음량 ${(gain*100).toInt()}%");Slider(gain,{gain=it;e.inputGain=it});Text("대화 음량 ${(voice*100).toInt()}%");Slider(voice,{voice=it;e.setVoiceVolume(it)})
 FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){listOf("original" to "원음","radio" to "라디오 클린","studio" to "스튜디오").forEach{(id,name)->FilterChip(preset==id,{preset=id;e.preset=id},label={Text(name)})}}
 if(preset=="studio"){Text("공간 울림");Slider(reverb,{reverb=it;e.reverb=it},valueRange=0f..0.07f)}
 Row(verticalAlignment=Alignment.CenterVertically){Text("스피커로 듣기",Modifier.weight(1f));Switch(speaker,{speaker=it;e.setSpeaker(it)})}
 Text("내가 듣는 음악 ${(localMusic*100).toInt()}%");Slider(localMusic,{localMusic=it;e.setMusicVolume(it)})
 Row(verticalAlignment=Alignment.CenterVertically){Text("에코 제거",Modifier.weight(1f));Switch(echo,{echo=it;e.launch{e.processing(echo,noise)}})}
 Row(verticalAlignment=Alignment.CenterVertically){Text("잡음 억제",Modifier.weight(1f));Switch(noise,{noise=it;e.launch{e.processing(echo,noise)}})}
 Text("이어폰을 사용하면 상대방 목소리가 마이크에 다시 들어가는 것을 줄일 수 있어요.",fontSize=12.sp,color=Muted)
}
@Composable internal fun NativeRoomForm(api:NativeApi,initial:JSONObject=JSONObject(),submit:(JSONObject)->Unit){
 var title by remember{mutableStateOf(initial.optString("title"))};var visibility by remember{mutableStateOf(initial.optString("visibility","public"))};var max by remember{mutableFloatStateOf(initial.optInt("max_members",30).toFloat())};var announcement by remember{mutableStateOf(initial.optString("announcement"))};var background by remember{mutableStateOf(initial.optString("background","navy"))};var crew by remember{mutableStateOf(initial.optString("crew_id"))};var crews by remember{mutableStateOf<List<JSONObject>>(emptyList())};var error by remember{mutableStateOf<String?>(null)}
 LaunchedEffect(Unit){try{crews=api.call("/api/voice/options").optJSONArray("crews").objects()}catch(e:Exception){error=e.message}}
 Text("토킹룸 설정",fontSize=22.sp,fontWeight=FontWeight.Bold);OutlinedTextField(title,{if(it.length<=60)title=it},label={Text("방 이름")},modifier=Modifier.fillMaxWidth());OutlinedTextField(announcement,{if(it.length<=200)announcement=it},label={Text("공지")},modifier=Modifier.fillMaxWidth())
 FlowRow{listOf("public" to "공개","private" to "초대 전용","followers" to "팔로워","crew" to "크루").forEach{(id,label)->FilterChip(visibility==id,{visibility=id},label={Text(label)})}}
 if(visibility=="crew")crews.forEach{c->FilterChip(crew==c.getString("id"),{crew=c.getString("id")},label={Text(c.optString("name"))})}
 Text("최대 ${max.toInt()}명");Slider(max,{max=it},valueRange=2f..30f,steps=27)
 FlowRow{listOf("navy" to "네이비","sunset" to "노을","night" to "밤하늘").forEach{(id,label)->FilterChip(background==id,{background=id},label={Text(label)})}}
 error?.let{Text(it,color=Pink)}
 Button({submit(payload("title" to title.trim(),"visibility" to visibility,"max_members" to max.toInt(),"announcement" to announcement.trim(),"background" to background,"crew_id" to crew.takeIf{visibility=="crew"}))},enabled=title.isNotBlank()&&(visibility!="crew"||crew.isNotBlank()),modifier=Modifier.fillMaxWidth()){Text(if(initial.has("id"))"설정 저장" else "방 만들기")}
}
@Composable private fun NativeRoomMusic(e:NativeVoiceEngine){
 var query by remember{mutableStateOf("")};var result by remember{mutableStateOf(JSONObject())};var error by remember{mutableStateOf<String?>(null)};var consent by remember{mutableStateOf<JSONObject?>(null)};val state by e.state.collectAsState();val scope=rememberCoroutineScope();val music=state.optJSONObject("music")?:JSONObject()
 Text("함께 듣는 음악",fontSize=21.sp);Text("일반 감상 재생수·정산에 중복 반영되지 않아요.",color=Muted,fontSize=12.sp)
 if(e.isHost()){OutlinedTextField(query,{query=it},label={Text("음악 검색")},modifier=Modifier.fillMaxWidth());Button({scope.launch{try{result=e.api.call(e.path("music-search")+"?generation=${state.getString("generation")}&q=${URLEncoder.encode(query,"UTF-8")}",fresh=true)}catch(x:Exception){error=x.message}}}){Text("검색")}}
 result.optJSONArray("tracks").objects().forEach{t->TextButton({if(t.optBoolean("room_allowed"))e.launch{e.command("music",payload("operation" to "enqueue","track_id" to t.getString("id"),"request_id" to requestIdentity()))}else consent=t}){Text(t.optString("title")+if(t.optBoolean("room_allowed"))" · 추가" else " · 공동 감상 동의")}}
 music.optJSONArray("queue").objects().forEachIndexed{i,t->Row(verticalAlignment=Alignment.CenterVertically){Text(t.optString("title"),Modifier.weight(1f));if(e.isHost()){IconButton({e.launch{e.command("music",payload("operation" to "remove","index" to i,"request_id" to requestIdentity()))}}){Icon(Icons.Outlined.Close,"대기열에서 삭제")}}}}
 if(e.isHost()){
  FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){listOf("previous" to "이전 곡","restart" to "처음부터","next" to "다음 곡","clear" to "대기열 비우기").forEach{(operation,label)->OutlinedButton({e.launch{e.command("music",payload("operation" to operation,"request_id" to requestIdentity()))}}){Text(label)}}}
  FlowRow{listOf("off" to "반복 안 함","one" to "한 곡 반복","all" to "전체 반복").forEach{(mode,label)->FilterChip(music.optString("repeat")==mode,{e.launch{e.command("music",payload("operation" to "repeat","mode" to mode,"request_id" to requestIdentity()))}},label={Text(label)})}}
  var volume by remember(music.optDouble("volume")){mutableFloatStateOf(music.optDouble("volume",.7).toFloat())}
  Text("방 전체 음악 음량 ${(volume*100).toInt()}%");Slider(volume,{volume=it},onValueChangeFinished={e.launch{e.command("music",payload("operation" to "volume","value" to volume,"request_id" to requestIdentity()))}})
  val current=music.optJSONArray("queue")?.optJSONObject(music.optInt("index",-1));if(current!=null){var seek by remember(music.optLong("revision")){mutableFloatStateOf(music.optDouble("position").toFloat())};Text("재생 위치 ${timeLabel((seek*1000).toLong())}");Slider(seek,{seek=it},valueRange=0f..current.optDouble("duration",1.0).toFloat().coerceAtLeast(1f),onValueChangeFinished={e.launch{e.command("music",payload("operation" to "seek","position" to seek,"request_id" to requestIdentity()))}})}
 }
 error?.let{Text(it,color=Pink)}
 consent?.let{t->AlertDialog(onDismissRequest={consent=null},title={Text("공동 감상 동의")},text={Text(result.optString("consent"))},confirmButton={TextButton({consent=null;e.launch{e.command("music-consent",payload("track_id" to t.getString("id"),"accept" to true));e.command("music",payload("operation" to "enqueue","track_id" to t.getString("id"),"request_id" to requestIdentity()))}}){Text("동의하고 추가")}},dismissButton={TextButton({consent=null}){Text("취소")}})}
}
@Composable private fun NativeRoomInvite(e:NativeVoiceEngine){
 var query by remember{mutableStateOf("")};var people by remember{mutableStateOf<List<JSONObject>>(emptyList())};var error by remember{mutableStateOf<String?>(null)};var sent by remember{mutableStateOf(setOf<String>())};var pending by remember{mutableStateOf<String?>(null)};val requests=remember{mutableMapOf<String,String>()};val scope=rememberCoroutineScope()
 Text("음악 친구 초대",fontSize=21.sp);OutlinedTextField(query,{query=it},label={Text("닉네임 검색")},modifier=Modifier.fillMaxWidth())
 LaunchedEffect(query){try{kotlinx.coroutines.delay(350);people=e.api.call(if(query.isBlank())"/api/catalog?section=producers" else "/api/search?q=${URLEncoder.encode(query,"UTF-8")}").optJSONArray("producers").objects()}catch(x:Exception){if(x is kotlinx.coroutines.CancellationException)throw x;error=x.message}}
 people.forEach{p->val id=p.getString("id");Row(verticalAlignment=Alignment.CenterVertically){Text(p.optString("name"),Modifier.weight(1f));TextButton(enabled=pending==null&&id !in sent,onClick={pending=id;scope.launch{try{e.command("invite",payload("profile_id" to id,"request_id" to requests.getOrPut(id){requestIdentity()}));sent=sent+id}catch(x:Exception){if(x is kotlinx.coroutines.CancellationException)throw x;error=x.message}finally{pending=null}}}){Text(if(id in sent)"초대 완료" else "초대 메시지 보내기")}}};error?.let{Text(it,color=Pink)}
}
@Composable private fun NativeRoomGift(e:NativeVoiceEngine,target:JSONObject,done:()->Unit){
 var wallet by remember{mutableStateOf(JSONObject())};var selected by remember{mutableStateOf<JSONObject?>(null)};var quantity by remember{mutableIntStateOf(1)};var request by remember{mutableStateOf(requestIdentity())};var busy by remember{mutableStateOf(false)};var error by remember{mutableStateOf<String?>(null)};var confirm by remember{mutableStateOf(false)};val scope=rememberCoroutineScope()
 LaunchedEffect(Unit){try{wallet=e.api.call("/api/gold",fresh=true)}catch(x:Exception){error=x.message}}
 Text("${target.optString("name")}님에게 선물",fontSize=20.sp);Text("보유 ${wallet.optInt("balance")} G",color=Aqua)
 wallet.optJSONArray("gifts").objects().forEach{g->FilterChip(selected?.optString("id")==g.getString("id"),{selected=g;request=requestIdentity()},label={Text("${g.optString("name")} · ${g.optInt("gold")} G")})}
 Row{OutlinedButton({quantity--;request=requestIdentity()},enabled=quantity>1&&!busy){Text("−")};Text(" $quantity ",Modifier.padding(14.dp));OutlinedButton({quantity++;request=requestIdentity()},enabled=quantity<100&&!busy){Text("+")}}
 val total=(selected?.optInt("gold")?:0).toLong()*quantity
 Button({confirm=true},enabled=!busy&&selected!=null&&total in 1..minOf(100000,wallet.optInt("balance")).toLong()){Text("${total} G 선물하기")};error?.let{Text(it,color=Pink)}
 if(confirm)AlertDialog(onDismissRequest={if(!busy)confirm=false},title={Text("${total} G를 사용해 선물할까요?")},text={Text("${target.optString("name")}님에게 ${selected?.optString("name")} ×$quantity")},confirmButton={TextButton(enabled=!busy,onClick={busy=true;scope.launch{try{e.command("gifts",payload("profile_id" to target.getString("profile_id"),"gift_type" to selected!!.getString("id"),"quantity" to quantity,"request_id" to request));done()}catch(x:Exception){error=x.message;confirm=false}finally{busy=false}}}){Text("선물 보내기")}},dismissButton={TextButton({confirm=false},enabled=!busy){Text("취소")}})
}
