@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/** The work a just-created dubbing room should load once its host has joined. */
internal object DubbingRoomLaunch {val pending=mutableMapOf<String,String>()}

/** Phase-1 live dubbing room: the room says whose line is next and when; each phone records its own take. */
@Composable internal fun NativeDubbingRoomScreen(engine:NativeVoiceEngine,leave:()->Unit,openRoute:(String)->Unit){
 val state by engine.state.collectAsState();val error by engine.error.collectAsState();val mic by engine.micOn.collectAsState()
 val context=LocalContext.current;val scope=rememberCoroutineScope()
 val api=engine.api
 val audio=remember{NativeDubbingAudio(context,api)};DisposableEffect(Unit){onDispose{audio.close()}}
 val recording by audio.running.collectAsState();val capturing by audio.capturing.collectAsState();val elapsed by audio.elapsed.collectAsState();val audioStatus by audio.status.collectAsState()
 val selfId=state.optString("self");val members=state.optJSONArray("members").objects();val self=members.find{it.optString("id")==selfId};val host=self?.optString("role")=="host"
 val room=state.optJSONObject("room")?:JSONObject();val g=state.optJSONObject("dubbing")?:JSONObject()
 val project=g.optJSONObject("project");val roles=project?.optJSONArray("roles").objects();val lines=project?.optJSONArray("lines").objects()
 val cast=g.optJSONObject("cast")?:JSONObject();val ready=g.optJSONObject("ready")?:JSONObject()
 val phase=g.optString("phase","casting");val lineIndex=g.optInt("lineIndex",-1);val cueAt=g.optLong("cueAt")
 val current=lines.getOrNull(lineIndex);val myRole=roles.firstOrNull{cast.optString(it.optString("id"))==selfId}
 val mine=current!=null&&cast.optString(current.optString("roleId"))==selfId
 var busy by remember{mutableStateOf(false)};var note by remember{mutableStateOf<String?>(null)};var castingRole by remember{mutableStateOf<JSONObject?>(null)}
 var drafts by remember{mutableStateOf<DubbingDrafts?>(null)}
 var now by remember{mutableLongStateOf(System.currentTimeMillis())}
 LaunchedEffect(Unit){while(true){now=System.currentTimeMillis();delay(100)}}
 val lineStartLocal=cueAt-engine.clockOffset
 fun task(block:suspend ()->Unit){if(busy)return;busy=true;note=null;scope.launch{try{block()}catch(e:Exception){if(e is CancellationException)throw e;note=e.message}finally{busy=false}}}
 suspend fun dubbing(operation:String,vararg more:Pair<String,Any?>)=engine.command("dubbing",payload("operation" to operation,*more))
 BackHandler{leave()}
 // A room opened from a work loads that work as soon as its host is in.
 LaunchedEffect(host,project==null){val pending=DubbingRoomLaunch.pending[engine.roomId];if(host&&project==null&&pending!=null){DubbingRoomLaunch.pending.remove(engine.roomId);task{dubbing("load","project_id" to pending)}}}
 val micPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->if(!granted)note="녹음하려면 마이크 권한을 허용해주세요."}
 // Ready = this phone can record its role: claim it in the work, open the recording session, fetch the background.
 fun prepare()=task{
  val p=project?:error("연결된 작품이 없어요.");val role=myRole?:error("배역을 먼저 받아주세요.")
  if(ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){micPermission.launch(Manifest.permission.RECORD_AUDIO);error("마이크 권한을 허용한 뒤 다시 눌러주세요.")}
  val path="/api/dubbing/projects/${p.getString("id")}";val roleId=role.getString("id")
  val detail=api.call(path,fresh=true).getJSONObject("project");val inWork=detail.optJSONArray("roles").objects().find{it.optString("id")==roleId}
  if(inWork?.optBoolean("mine")!=true){check(inWork?.optBoolean("claimed")!=true){"이 작품에서 다른 사람이 이미 맡은 배역이에요."};api.call("$path/claims/$roleId","POST",payload("revision" to detail.getInt("revision")))}
  api.call("$path/recording/$roleId/start","POST",payload("soundId" to p.getString("soundId")))
  audio.prepareBackground("$path/background",p.getString("soundId"))
  drafts=DubbingDrafts(context,selfId,p.getString("id"),p.getString("soundId"),roleId)
  dubbing("ready")
 }
 // My line is cued: pause the live microphone (one phone cannot capture twice), record at the shared cue, upload, register.
 LaunchedEffect(phase,lineIndex,cueAt,mine){
  if(phase!="cue"||!mine||current==null||project==null)return@LaunchedEffect
  val d=drafts?:run{note="이 폰에서 준비를 먼저 눌러주세요.";return@LaunchedEffect}
  val path="/api/dubbing/projects/${project.getString("id")}";val roleId=current.getString("roleId");val lineId=current.getString("id")
  val wasLive=engine.micOn.value;if(wasLive)engine.microphone(false)
  audio.record("$path/background",current,d,{take->scope.launch{
   try{
    val view=api.call("$path/recording",fresh=true)
    val rev=view.getJSONObject("recording").getJSONArray("roles").objects().first{it.getString("roleId")==roleId}.getInt("revision")
    api.uploadDubbingTake("$path/recording/$roleId/lines/$lineId?revision=$rev&take=${take.getString("id")}",d.file(take))
    d.uploaded(lineId,take.getString("id"))
    dubbing("take","line_id" to lineId,"take_id" to take.getString("id"))
   }catch(e:Exception){if(e is CancellationException)throw e;note=e.message?:"녹음을 올리지 못했어요. 다시 녹음해주세요."}
   finally{if(wasLive)runCatching{engine.microphone(true)}}
  }},{message->note=message;scope.launch{if(wasLive)runCatching{engine.microphone(true)}}},lineStartLocal)
 }
 // Everyone else who is ready hears the same effects under the line.
 LaunchedEffect(phase,lineIndex,cueAt,mine){
  if(phase=="cue"&&!mine&&current!=null&&project!=null&&ready.optBoolean(selfId))audio.playLine("/api/dubbing/projects/${project.getString("id")}/background",current,lineStartLocal)
  else if(!recording&&phase!="cue")audio.stop()
 }
 val ends=g.optLong("expiresAt")-engine.clockOffset;val left=((ends-now)/1000).coerceAtLeast(0)
 Box(Modifier.fillMaxSize().background(Ink)){
  RoomCreateBackdrop(Modifier.matchParentSize())
  Column(Modifier.fillMaxSize().testTag("native-dubbing-room")){
   NativeAudioHeader("실시간 더빙방",leave){
    if(ends>0)Text("%d:%02d".format(left/60,left%60),Modifier.padding(end=6.dp),fontSize=13.sp,color=if(left<300)Pink else SoftText)
    Text("${members.size}/${room.optInt("max_members",6)}",Modifier.padding(end=12.dp),fontSize=13.sp,color=SoftText)
   }
   Text(project?.optString("title")?:room.optString("title"),Modifier.padding(horizontal=16.dp),fontSize=17.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
   // Stage: one place per role, the current speaker lit.
   LazyRow(Modifier.fillMaxWidth().padding(top=12.dp).testTag("dubbing-room-stage"),contentPadding=PaddingValues(horizontal=16.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
    items(roles,key={it.optString("id")}){r->
     val holder=members.find{it.optString("id")==cast.optString(r.optString("id"))};val speaking=current?.optString("roleId")==r.optString("id")&&phase in setOf("cue","review")
     val at=roles.indexOf(r)
     Surface(onClick={if(host&&phase in setOf("casting","ready"))castingRole=r},enabled=host&&phase in setOf("casting","ready"),color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(if(speaking)2.dp else 1.dp,if(speaking)Violet else Stroke),modifier=Modifier.width(92.dp).testTag("dubbing-room-role-${r.optString("id")}")){
      Column(Modifier.padding(vertical=10.dp,horizontal=6.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(6.dp)){
       Box{if(holder!=null)Avatar(holder.optString("name"),holder,52) else Box(Modifier.size(52.dp).clip(CircleShape).border(1.dp,Stroke,CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Outlined.PersonAdd,null,Modifier.size(22.dp),tint=Muted)}
        if(holder!=null&&ready.optBoolean(holder.optString("id")))Icon(Icons.Outlined.CheckCircle,"준비 완료",Modifier.size(18.dp).align(Alignment.BottomEnd).background(Ink,CircleShape),tint=Aqua)}
       Surface(color=dubbingRoleColor(at).copy(alpha=.16f),shape=RoundedCornerShape(8.dp)){Text(r.optString("name"),Modifier.padding(horizontal=8.dp,vertical=2.dp),fontSize=12.sp,color=dubbingRoleColor(at),fontWeight=FontWeight.SemiBold,maxLines=1)}
       Text(holder?.optString("name")?:"비어 있음",fontSize=11.sp,color=if(holder!=null)SoftText else Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
      }
     }
    }
   }
   // Lines: now · next · after.
   Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
    if(project==null)Text(if(host)"작품을 연결하고 있어요…" else "방장이 작품을 연결하면 대본이 보여요.",color=Muted,fontSize=14.sp)
    val upcoming=if(lineIndex<0)lines.take(3) else lines.drop(lineIndex).take(3)
    upcoming.forEachIndexed{i,l->
     val at=roles.indexOfFirst{it.optString("id")==l.optString("roleId")};val label=listOf("현재","다음","그다음")[i]
     Surface(color=if(i==0)Panel else Color.Transparent,shape=RoundedCornerShape(14.dp),border=BorderStroke(if(i==0)1.5.dp else 1.dp,if(i==0)Violet else Stroke),modifier=Modifier.fillMaxWidth()){
      Row(Modifier.padding(horizontal=12.dp,vertical=if(i==0)12.dp else 8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
       Text("$label · ${roles.getOrNull(at)?.optString("name").orEmpty()}",Modifier.width(84.dp),fontSize=12.sp,color=dubbingRoleColor(at),fontWeight=FontWeight.SemiBold,maxLines=1)
       Text(l.optString("text"),Modifier.weight(1f),fontSize=if(i==0)16.sp else 13.sp,lineHeight=if(i==0)23.sp else 18.sp,color=if(i==0)Color.White else SoftText,fontWeight=if(i==0)FontWeight.SemiBold else FontWeight.Normal,maxLines=if(i==0)3 else 1,overflow=TextOverflow.Ellipsis)
      }
     }
    }
    if(lines.isNotEmpty()&&lineIndex>=0)Text("대사 ${(lineIndex+1).coerceAtMost(lines.size)} / ${lines.size}",fontSize=12.sp,color=Muted)
   }
   Spacer(Modifier.weight(1f))
   // Controls follow the phase.
   Column(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=12.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(10.dp)){
    val untilLine=(lineStartLocal-now)/1000.0
    val holderName=current?.let{l->members.find{it.optString("id")==cast.optString(l.optString("roleId"))}?.optString("name")}.orEmpty()
    when{
     phase=="cue"&&untilLine>0&&untilLine<=DUBBING_COUNT_IN->Box(Modifier.size(104.dp).clip(CircleShape).background(Ink).border(3.dp,Brush.linearGradient(listOf(Violet,Pink)),CircleShape).testTag("dubbing-room-countdown"),contentAlignment=Alignment.Center){Text("${kotlin.math.ceil(untilLine).toInt()}",fontSize=44.sp,fontWeight=FontWeight.Bold)}
     phase=="cue"&&untilLine>DUBBING_COUNT_IN->Text(if(mine)"곧 내 차례예요 · 효과음이 먼저 나와요" else "$holderName 님 차례가 곧 시작돼요",color=SoftText,fontSize=14.sp)
     phase=="cue"->{
      val total=current?.let{dubbingWindow(it).duration}?:0.0
      Surface(color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth()){
       Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        Row(verticalAlignment=Alignment.CenterVertically){Box(Modifier.size(10.dp).clip(CircleShape).background(Color(0xFFFF5A6E)));Text(if(mine)(if(capturing)"녹음 중..." else audioStatus) else "$holderName 님 녹음 중",Modifier.weight(1f).padding(start=8.dp),fontSize=15.sp,fontWeight=FontWeight.SemiBold)
         if(mine)Text("%.1f / %.1f초".format(elapsed,total),fontSize=13.sp,color=Muted)}
        LinearProgressIndicator({if(mine&&total>0)(elapsed/total).toFloat().coerceIn(0f,1f) else ((-untilLine)/total.coerceAtLeast(.1)).toFloat().coerceIn(0f,1f)},Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),color=Violet,trackColor=Stroke)
       }
      }
     }
     phase=="review"->Text(if(mine)"녹음을 올렸어요." else "$holderName 님이 녹음을 마쳤어요.",color=SoftText,fontSize=14.sp)
     phase=="done"->Text("모든 대사를 녹음했어요. 작품 화면에서 내 배역을 제출하면 합성돼요.",color=SoftText,fontSize=14.sp,textAlign=TextAlign.Center)
     !host->Text(if(myRole==null)"방장이 배역을 정해주면 참여할 수 있어요." else "방장이 녹음을 시작하면 자동으로 진행돼요.",color=SoftText,fontSize=14.sp,textAlign=TextAlign.Center)
    }
    (note?:error)?.let{Text(it,color=Pink,fontSize=12.sp,textAlign=TextAlign.Center)}
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
     val buttonModifier=Modifier.weight(1f).heightIn(min=52.dp)
     if(myRole!=null&&!ready.optBoolean(selfId)&&phase in setOf("casting","ready"))BrandButton({prepare()},enabled=!busy,modifier=buttonModifier.testTag("dubbing-room-ready"),shape=RoundedCornerShape(26.dp)){Text("준비 완료",fontWeight=FontWeight.Bold)}
     if(host&&phase in setOf("casting","ready"))BrandButton({task{dubbing("start")}},enabled=!busy&&project!=null,modifier=buttonModifier.testTag("dubbing-room-start"),shape=RoundedCornerShape(26.dp)){Icon(Icons.Outlined.FiberManualRecord,null,Modifier.size(18.dp));Text("녹음 시작",Modifier.padding(start=6.dp),fontWeight=FontWeight.Bold)}
     if(phase=="review"&&(host||mine)){
      OutlinedButton({task{dubbing("retake")}},enabled=!busy,modifier=buttonModifier,shape=RoundedCornerShape(26.dp),border=BorderStroke(1.dp,Stroke)){Icon(Icons.Outlined.Refresh,null,Modifier.size(18.dp));Text("다시 녹음",Modifier.padding(start=6.dp),color=SoftText)}
      BrandButton({task{dubbing("next")}},enabled=!busy,modifier=buttonModifier.testTag("dubbing-room-next"),shape=RoundedCornerShape(26.dp)){Icon(Icons.Outlined.SkipNext,null,Modifier.size(18.dp));Text("다음으로",Modifier.padding(start=6.dp),fontWeight=FontWeight.Bold)}
     }
     if(host&&phase=="cue")OutlinedButton({audio.stop();task{dubbing("stop")}},enabled=!busy,modifier=buttonModifier,shape=RoundedCornerShape(26.dp),border=BorderStroke(1.dp,Stroke)){Text("멈춤",color=SoftText)}
     if(phase=="done"&&project!=null)BrandButton({openRoute("dubbing/${project.getString("id")}")},modifier=buttonModifier,shape=RoundedCornerShape(26.dp)){Text("작품 화면으로",fontWeight=FontWeight.Bold)}
    }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){
     if(host&&current!=null&&phase in setOf("ready","review"))TextButton({task{dubbing("skip")}},enabled=!busy){Text("이 대사 건너뛰기",color=Muted,fontSize=13.sp)} else Spacer(Modifier.width(1.dp))
     if(myRole!=null)IconButton({engine.launch{engine.microphone(!mic)}},enabled=!recording){Icon(if(mic)Icons.Outlined.Mic else Icons.Outlined.MicOff,if(mic)"마이크 끄기" else "마이크 켜기",tint=if(mic)Aqua else Muted)}
    }
   }
  }
 }
 castingRole?.let{r->
  AlertDialog(onDismissRequest={castingRole=null},title={Text("${r.optString("name")} 역은 누가 맡을까요?")},text={Column{
   members.forEach{m->TextButton({castingRole=null;task{dubbing("cast","role_id" to r.optString("id"),"target_id" to m.optString("id"))}},Modifier.fillMaxWidth()){Text(m.optString("name"),Modifier.fillMaxWidth())}}
   TextButton({castingRole=null;task{dubbing("cast","role_id" to r.optString("id"),"target_id" to "")}},Modifier.fillMaxWidth()){Text("비우기",Modifier.fillMaxWidth(),color=Muted)}
  }},confirmButton={TextButton({castingRole=null}){Text("닫기")}})
 }
}
