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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.animation.core.animateFloatAsState
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
 Row(Modifier.fillMaxWidth().heightIn(min=48.dp).padding(horizontal=4.dp),verticalAlignment=Alignment.CenterVertically){IconButton(close){Icon(Icons.Outlined.ArrowBack,"돌아가기",Modifier.size(23.dp))};Text(title,Modifier.weight(1f),fontSize=18.sp,lineHeight=24.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis);actions()}
}
@Composable internal fun NativeVoiceScreen(engine:NativeVoiceEngine,leave:()->Unit,openRoute:(String)->Unit={}){
 val dubbingRoom by engine.state.collectAsState()
 if(dubbingRoom.optJSONObject("room")?.optString("mode")=="dubbing"){NativeDubbingRoomScreen(engine,leave,openRoute);return}
 val state by engine.state.collectAsState();val error by engine.error.collectAsState();val mic by engine.micOn.collectAsState()
 val context=LocalContext.current;val scope=rememberCoroutineScope();val members=state.optJSONArray("members").objects();val room=state.optJSONObject("room")?:JSONObject();val self=members.find{it.optString("id")==state.optString("self")};val host=self?.optString("role")=="host"
 var panel by remember{mutableStateOf("")};var target by remember{mutableStateOf<JSONObject?>(null)};var message by remember{mutableStateOf("")};var messageId by remember{mutableStateOf(requestIdentity())};var sending by remember{mutableStateOf(false)}
 var roomSaving by remember{mutableStateOf(false)};var roomSaveError by remember{mutableStateOf<String?>(null)}
 var playlistSong by remember{mutableStateOf<JSONObject?>(null)}
 val micPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){result->
  if(result[Manifest.permission.RECORD_AUDIO]==true||androidx.core.content.ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED)engine.launch{engine.microphone(true)}else engine.error.value="마이크 권한이 필요해요. 대화 청취는 계속할 수 있어요."
 }
 fun enableMicrophone(){
  val permissions=mutableListOf<String>()
  if(androidx.core.content.ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED)permissions+=Manifest.permission.RECORD_AUDIO
  if(permissions.isEmpty())engine.launch{engine.microphone(true)}else micPermission.launch(permissions.toTypedArray())
 }
 fun action(name:String,data:JSONObject=JSONObject()){engine.launch{engine.command(name,data)}}
 val keyboard=WindowInsets.isImeVisible
 val chats=(state.optJSONArray("chat").objects()+state.optJSONArray("notices").objects()).sortedBy{it.optLong("sequence")}
 val chatList=rememberLazyListState()
 val sheetScroll=rememberScrollState()
 LaunchedEffect(panel){sheetScroll.scrollTo(0)}
 LaunchedEffect(chats.lastOrNull()?.optString("id")){
  if(chats.isNotEmpty()&&!chatList.isScrollInProgress&&(chatList.layoutInfo.visibleItemsInfo.lastOrNull()?.index?:0)>=chats.lastIndex-3)chatList.animateScrollToItem(chats.lastIndex)
 }
 fun send(){
  if(message.isBlank()||sending)return
  sending=true
  scope.launch{try{engine.command("chat",payload("body" to message,"request_id" to messageId));message="";messageId=requestIdentity();engine.command("heartbeat")}
   catch(e:Exception){if(e is kotlinx.coroutines.CancellationException)throw e;engine.error.value=e.message}finally{sending=false}}
 }
 Box(Modifier.fillMaxSize()){
 VoiceRoomBackdrop(room.optString("background","navy"),room.optJSONObject("theme"),Modifier.matchParentSize())
 Column(Modifier.fillMaxSize().testTag("native-voice-room")){
  VoiceSeatAlert(state,host){panel="seats"}
  BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal=10.dp)){
   val narrow=maxWidth<350.dp
   Row(verticalAlignment=Alignment.CenterVertically,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){
    RoomTitle(room,members.size,Modifier.weight(1f))
    val tools=if(narrow)listOf("members","sound","more","leave")else listOfNotNull("inbox","members","sound","share","room".takeIf{host},"leave")
    tools.forEach{key->val (icon,label)=when(key){"inbox"->Icons.Outlined.MailOutline to "메시지";"members"->Icons.Outlined.Group to "참여자";"sound"->Icons.Outlined.Tune to "소리 설정";"share"->Icons.Outlined.Share to "공유";"room"->Icons.Outlined.Settings to "방 설정";"more"->Icons.Outlined.MoreHoriz to "더보기";else->Icons.Outlined.Logout to "방 나가기"}
     IconButton({when(key){"leave"->panel="leave";"share"->context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,room.optString("title")+"\nhttps://aifect.co.kr/#voice/"+engine.roomId),"토킹룸 공유"));else->panel=key}},Modifier.size(44.dp)){Icon(icon,label,Modifier.size(18.dp),tint=SoftText)}
    }
   }
  }
  val stage:@Composable ()->Unit={Column(Modifier.fillMaxWidth().padding(horizontal=10.dp)){
   if(!keyboard){VoiceMusicBar(engine,state,{panel="music"}){playlistSong=it;panel="playlist"};Spacer(Modifier.height(8.dp))}
   BoxWithConstraints(Modifier.fillMaxWidth().roomGlass().padding(8.dp)){
    val diameter=((maxWidth-36.dp)/4).coerceIn(40.dp,if(keyboard)40.dp else 46.dp)
    Column(verticalArrangement=Arrangement.spacedBy(if(keyboard)2.dp else 10.dp)){
     (0..7).toList().chunked(4).forEach{seats->
      Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
       seats.forEach{seat->
        val person=members.find{!it.isNull("seat")&&it.optInt("seat")==seat}
        Column(Modifier.weight(1f).clickable{if(person!=null){target=person;panel="person"}else if(seat>0){if(host)panel="members" else action("request-mic",payload("seat" to seat))}}.testTag("voice-seat-$seat"),horizontalAlignment=Alignment.CenterHorizontally){
         Box(Modifier.size(diameter),contentAlignment=Alignment.Center){
          if(person!=null){
           val muted=if(person.optString("id")==state.optString("self"))!mic else person.optBoolean("muted")
           val opacity by animateFloatAsState(if(muted).55f else 1f,label="muted-avatar")
           Box(Modifier.alpha(opacity)){NativeMemberAvatar(person,(diameter.value-4).toInt())}
           if(muted)Box(Modifier.align(Alignment.BottomEnd).size(19.dp).background(Panel,CircleShape).border(1.dp,Stroke,CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Outlined.MicOff,"${person.optString("name")} 음소거",Modifier.size(12.dp).testTag("voice-muted-${person.optString("id")}"),tint=Muted)}
          }else Icon(Icons.Outlined.Add,if(room.optString("seating_mode")=="free")"자유 착석" else "좌석 참여 신청",Modifier.size(20.dp),tint=SoftText)
         }
         if(person!=null)Text((if(person.optString("role")=="host")"♛ " else "")+person.optString("name"),color=SoftText,fontSize=12.sp,lineHeight=17.sp,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis,modifier=Modifier.padding(top=6.dp))
        }
       }
      }
     }
    }
   }
   Row(Modifier.fillMaxWidth().padding(top=7.dp,bottom=4.dp).roomGlass(18).heightIn(min=44.dp).padding(horizontal=10.dp),verticalAlignment=Alignment.CenterVertically){
    Text(if(self?.optBoolean("requested")==true)"좌석 신청 · 승인 대기" else if(self?.isNull("seat")!=false)"대화 청취 중" else if(mic)"내 마이크 켜짐" else "내 마이크 꺼짐",fontSize=12.sp,lineHeight=17.sp,color=if(self?.optBoolean("requested")==true)SeatRequestGreen else Muted,modifier=Modifier.weight(1f))
    if(self?.optBoolean("requested")==true)TextButton({action("cancel-mic")}){Text("신청 취소")}
    if(self!=null&&self.isNull("seat")&&!self.optBoolean("requested")){
     val vacancy=(1..7).firstOrNull{seat->members.none{p->!p.isNull("seat")&&p.optInt("seat")==seat}}
     TextButton({vacancy?.let{action("request-mic",payload("seat" to it))}},enabled=vacancy!=null){Text(if(vacancy==null)"빈 좌석 없음" else "말하기 참여",fontSize=13.sp,color=Aqua)}
    }
    if(self?.isNull("seat")==false){
     Switch(checked=mic,onCheckedChange={if(mic)engine.launch{engine.microphone(false)}else enableMicrophone()},enabled=!self.optBoolean("locked"),modifier=Modifier.testTag("voice-microphone").semantics{contentDescription=if(mic)"내 마이크 끄기" else "내 마이크 켜기"})
     if(!host)IconButton({action("release-mic")}){Icon(Icons.Outlined.Logout,"좌석 내려가기",tint=Muted)}
    }
   }
  }
  }
  val chat:@Composable ColumnScope.()->Unit={
  HorizontalDivider(Modifier.padding(horizontal=10.dp),color=Stroke)
  room.optString("announcement").takeIf{it.isNotBlank()&&!keyboard}?.let{Text(it,Modifier.padding(horizontal=16.dp,vertical=6.dp),color=Muted,fontSize=12.sp,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)}
  if(error!=null)TextButton({engine.error.value=null;engine.retry()},modifier=Modifier.fillMaxWidth()){Text(error.orEmpty()+" · 다시 확인",fontSize=12.sp,maxLines=2,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)}
  Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal=10.dp)){
  LazyColumn(Modifier.fillMaxSize().testTag("native-voice-conversation"),state=chatList,contentPadding=PaddingValues(horizontal=2.dp,vertical=5.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
   itemsIndexed(chats,key={index,chat->chat.optString("id").ifBlank{"notice-${chat.optLong("sequence")}-${index}"}}){_,chat->
    if(chat.optString("kind")=="system")Text(chat.optString("body"),color=Muted,fontSize=12.sp)
    else if(chat.optString("kind")=="gift")VoiceGiftMessage(chat)
    else {
     val author=members.find{it.optString("id")==chat.optString("user_id")}?:JSONObject(chat.toString()).put("id",chat.optString("user_id"))
     RoomChatBubble(author,chat.optString("name").ifBlank{author.optString("name")},chat.optString("body"),chat.optString("user_id")==state.optString("self")){target=author;panel="person"}
    }
   }
  }
  VoiceGiftAnimation(engine,Modifier.align(Alignment.Center))
  }
  Row(Modifier.fillMaxWidth().padding(horizontal=10.dp,vertical=6.dp),horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
   Row(Modifier.weight(1f).roomGlass(24).heightIn(min=44.dp).padding(start=12.dp),verticalAlignment=Alignment.CenterVertically){
    androidx.compose.foundation.text.BasicTextField(message,{if(it.length<=500){message=it;messageId=requestIdentity()}},Modifier.weight(1f),enabled=!sending,maxLines=2,textStyle=LocalTextStyle.current.copy(color=SoftText,fontSize=14.sp,lineHeight=19.sp),cursorBrush=androidx.compose.ui.graphics.SolidColor(Aqua),keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(imeAction=androidx.compose.ui.text.input.ImeAction.Send),keyboardActions=androidx.compose.foundation.text.KeyboardActions(onSend={send()}),decorationBox={inner->Box{if(message.isEmpty())Text("메시지를 입력하세요",fontSize=13.sp,color=Muted);inner()}})
    IconButton({panel="emoji"},Modifier.size(44.dp)){Icon(Icons.Outlined.SentimentSatisfiedAlt,"이모티콘",Modifier.size(19.dp))}
   }
   IconButton(enabled=message.isNotBlank()&&!sending,onClick=::send,modifier=Modifier.size(44.dp).roomGlass(13)){Icon(Icons.Outlined.Send,"메시지 보내기",Modifier.size(18.dp),tint=if(message.isNotBlank())SoftText else Muted)}
   IconButton({panel="gift-target"},Modifier.size(44.dp).roomGlass(13)){Icon(Icons.Outlined.CardGiftcard,"선물",Modifier.size(18.dp),tint=SoftText)}
  }

  }
  BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)){if(maxWidth>=600.dp&&maxWidth>maxHeight)Row(Modifier.fillMaxSize()){Column(Modifier.weight(1.1f).fillMaxHeight().verticalScroll(rememberScrollState())){stage()};Column(Modifier.weight(1f).fillMaxHeight()){chat()}}else Column(Modifier.fillMaxSize()){stage();chat()}}
 }
 }
 if(panel.isNotBlank())ModalBottomSheet(onDismissRequest={panel=""},containerColor=Color(0xFF121923),dragHandle=null){Column(Modifier.fillMaxWidth().heightIn(max=(androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp*.53f)).verticalScroll(sheetScroll).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){IconButton({panel=""}){Icon(Icons.Outlined.Close,"팝업 닫기")}}
  when(panel){
   "emoji"->RoomStickerPicker{token->if(message.length+token.length<=500){message+=token;messageId=requestIdentity();panel=""}}
   "gift-target"->{Text("선물 받을 사람",style=MaterialTheme.typography.titleMedium);val recipients=members.filter{it.optString("id")!=state.optString("self")};if(recipients.isEmpty())Text("다른 참여자가 들어오면 선물할 수 있어요.",color=Muted);recipients.forEach{p->TextButton({target=p;panel="gift"}){NativeMemberAvatar(p,28);Text(p.optString("name"),Modifier.padding(start=8.dp))}}}
   "leave"->{Text("토킹룸에서 나갈까요?");Button(leave){Text("나가기")}}
   "more"->{TextButton({panel="inbox"}){Text("메시지")};if(host)TextButton({panel="room"}){Text("방 설정")};TextButton({context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"https://aifect.co.kr/#voice/"+engine.roomId),"토킹룸 공유"));panel=""}){Text("공유")}}
   "inbox"->{val model:MusicModel=androidx.lifecycle.viewmodel.compose.viewModel();val stack=remember{AppPageStack()};Box(Modifier.fillMaxWidth().heightIn(min=230.dp,max=440.dp).height(380.dp)){AppPageHost(stack){if(model.loading)CircularProgressIndicator() else MessagesSheet(model,embedded=true)}}}
   "sound"->NativeVoiceSoundSettings(engine)
   "playlist"->playlistSong?.let{VoicePlaylistPicker(engine.api,it,state.optString("self")){panel=""}}
   "profile"->target?.let{VoiceProfilePopup(engine.api,it,it.optString("id")!=state.optString("self")){panel="gift"}}
   "seats"->{
    Text(if(host)"좌석 신청" else "좌석 초대",fontSize=20.sp,fontWeight=FontWeight.Bold)
    if(host){val pending=members.filter{it.optBoolean("requested")};if(pending.isEmpty())Text("대기 중인 신청이 없어요.",color=Muted);pending.forEach{p->
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){NativeMemberAvatar(p,36);Text(p.optString("name"),Modifier.weight(1f).padding(start=10.dp),color=SeatRequestGreen,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis);TextButton({action("approve-mic",payload("target_id" to p.getString("id")))}){Text("승인",color=SeatRequestGreen)};TextButton({action("reject-mic",payload("target_id" to p.getString("id")))}){Text("거절",color=Muted)}}
    }}else state.optJSONArray("seat_invites").objects().forEach{invite->Text("${invite.optInt("seat")+1}번 좌석 초대",color=SeatRequestGreen);Row{TextButton({action("seat-answer",payload("invitation_id" to invite.getString("id"),"accept" to true));panel=""}){Text("수락")};TextButton({action("seat-answer",payload("invitation_id" to invite.getString("id"),"accept" to false));panel=""}){Text("거절")}}}
   }
   "room"->if(host)NativeRoomForm(engine.api,room,busy=roomSaving,submissionError=roomSaveError){data->if(!roomSaving){roomSaving=true;roomSaveError=null;engine.launch{try{val result=engine.command("settings",data.put("revision",room.optInt("settings_revision")));check(result.optJSONObject("room")?.optString("seating_mode","approval")==data.optString("seating_mode")){"좌석 방식 변경은 서버 업데이트 후 사용할 수 있어요."};panel=""}catch(e:Exception){if(e is kotlinx.coroutines.CancellationException)throw e;roomSaveError=e.message}finally{roomSaving=false}}}}else{Text(room.optString("title"),fontSize=20.sp);Text(room.optString("announcement"),color=Muted)}
   "members"->{Text("참여자 ${members.size}",fontSize=20.sp);members.forEach{p->TextButton({target=p;panel="person"}){NativeMemberAvatar(p,36);Text(p.optString("name"),Modifier.padding(start=10.dp))}}}
   "person"->target?.let{p->Text(p.optString("name"),fontSize=22.sp);OutlinedButton({panel="profile"},modifier=Modifier.fillMaxWidth()){Text("프로필 보기")};if(p.optString("id")!=state.optString("self")){Button({panel="gift"}){Text("선물 보내기")};if(host){listOf("mute" to "마이크 제한","unlock" to "제한 해제","remove-seat" to "좌석 내리기","kick" to "강퇴").forEach{(op,label)->TextButton({action("moderate",payload("target_id" to p.getString("id"),"operation" to op));panel=""}){Text(label)}}}}}
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
  if(panel=="room"&&host)OutlinedButton({engine.launch{engine.command("close");leave()}}){Text("방 종료")}
  Spacer(Modifier.height(16.dp))
 }}
}
@Composable internal fun NativeMemberAvatar(p:JSONObject,size:Int){
 val id=p.optString("profile_id",p.optString("id"));val version=p.optString("image_version")
 val frame=p.optString("profile_frame")
 val artwork=p.optString("profile_frame_artwork")
 val display=frameDisplay(p)
 val decorated=frame=="crew-outline"||profileMediaUrl(display?.optString("overlay").orEmpty().ifBlank{artwork})!=null
 val scale=display?.optDouble("scale",1.26)?.toFloat()?.coerceIn(1f,1.6f)?:1.26f
 val photoSize=if(decorated)size/scale else size.toFloat()
 Box(Modifier.size(size.dp).testTag("voice-member-avatar-$id"),contentAlignment=Alignment.Center){
  Box(Modifier.size(photoSize.dp).then(if(decorated)Modifier.testTag("voice-member-frame-$id")else Modifier)){
   Box(Modifier.fillMaxSize().clip(CircleShape)){
    DefaultProfileArtwork(p.optString("name"),Modifier.fillMaxSize())
    if(id.isNotBlank()&&version.isNotBlank()&&version!="null")AsyncImage(Endpoint.url("/media/producer/$id?v=$version"),null,Modifier.fillMaxSize(),contentScale=androidx.compose.ui.layout.ContentScale.Crop)
   }
   PlayerAvatarDecoration(p,photoSize.toInt())
  }
 }
}
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
