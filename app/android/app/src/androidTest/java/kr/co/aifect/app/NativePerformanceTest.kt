package kr.co.aifect.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.core.content.ContextCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import java.io.*
import java.net.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.*

/** Device tests use loopback data and synthetic background; never charge or publish live content. */
class NativePerformanceTest{
 @get:Rule val ui=createEmptyComposeRule()
 private val ins=InstrumentationRegistry.getInstrumentation()
 private val context=ins.targetContext
 private lateinit var server:ServerSocket
 private var activity:ActivityScenario<NativePerformanceActivity>?=null
 private val workers=Executors.newCachedThreadPool()
 private val requests=CopyOnWriteArrayList<Pair<String,ByteArray>>()
 private val me="native-audio-test-user"
 private val projectId="11111111-1111-4111-8111-111111111111"
 private val path="/api/dubbing/projects/$projectId"
 private val responses=ConcurrentHashMap<String,JSONObject>()
 private var state=JSONObject()
 private var recording=JSONObject()
 private var uploadReplyLost=false
 @Volatile private var generationMode="rejected"
 @Volatile private var generatedId=""
 @Volatile private var generationReady=false
 private fun arr(vararg values:Any)=JSONArray(values.toList())
 private val wave:ByteArray get(){val count=48000*8;val buffer=ByteBuffer.allocate(44+count*2).order(ByteOrder.LITTLE_ENDIAN);buffer.put(dubbingWavHeader(count));repeat(count){buffer.putShort((kotlin.math.sin(it*2*Math.PI*440/48000)*1200).toInt().toShort())};return buffer.array()}
 @Before fun setup(){
  assertTrue(context.packageName.endsWith(".test"));assertTrue(android.os.Build.HARDWARE in listOf("ranchu","goldfish"))
  NativeSession.put(context,"cookie","")
  val options=defaultDubbingOptions();val script=manualDubbingScript("닫힌 복도","A: 문 뒤에서 발소리가 들려.\nB: 잠깐, 조용히 해.\nA: 이제 가자.",options)
  script.getJSONArray("lines").objects().forEachIndexed{i,l->l.put("id","line${i+1}").put("durationSeconds",.8)}
  val roles=script.getJSONArray("roles").objects().mapIndexed{i,r->JSONObject(r.toString()).put("mine",i==0).put("claimed",i==0).put("participant",if(i==0)"나" else JSONObject.NULL)}
  val sound=payload("id" to "sound-test-${System.nanoTime()}","state" to "ready","audioUrl" to "$path/background","mode" to "ai")
  val project=payload("id" to projectId,"title" to "닫힌 복도","ownerName" to "테스트","isOwner" to true,"options" to options,"script" to script,"rootId" to projectId,"roles" to JSONArray(roles),"versions" to JSONArray(),"state" to "recording","visibility" to "public","revision" to 2,"duration" to 8,"canEdit" to false,"recordingAvailable" to true,"sound" to sound,"recording" to payload("roles" to JSONArray()),"community" to payload("liked" to 0,"likes" to 0))
  recording=payload("recording" to payload("available" to true,"roles" to arr(payload("roleId" to "role_1","state" to "draft","revision" to 1,"saved" to 0))),"timeline" to payload("duration" to 8),"lines" to arr(payload("id" to "line1","roleId" to "role_1","cueStart" to 0.0,"start" to .6,"end" to 1.4,"recordEnd" to 1.5),payload("id" to "line2","roleId" to "role_2","cueStart" to 2.0,"start" to 2.0,"end" to 2.8,"recordEnd" to 3.0),payload("id" to "line3","roleId" to "role_1","cueStart" to 3.2,"start" to 3.6,"end" to 4.4,"recordEnd" to 4.5)))
  responses["/api/me"]=payload("user" to payload("id" to me))
  responses["/api/dubbing/config"]=payload("aiAvailable" to true,"quota" to payload("remaining" to 3))
  responses[path]=payload("project" to project)
  responses["$path/comments"]=payload("comments" to JSONArray())
  responses["/api/voice/options"]=payload("crews" to JSONArray())
  state=payload("generation" to "native-generation","self" to me,"revision" to 1,"serverNow" to System.currentTimeMillis(),"room" to payload("id" to "native-room","title" to "밤하늘 음악 이야기","host_id" to "host","max_members" to 30,"visibility" to "public"),"members" to arr(payload("id" to "host","profile_id" to "host-profile","name" to "지유","role" to "host","seat" to 0,"muted" to true,"publishing" to false),payload("id" to me,"profile_id" to "mine","name" to "하린","role" to "listener","seat" to null,"muted" to true,"publishing" to false)),"chat" to JSONArray(),"seat_invites" to JSONArray(),"music" to payload("queue" to JSONArray(),"index" to -1))
  val genreImage=ins.context.assets.open("design/dubbing-daily.webp").use{it.readBytes()}
  val audio=wave
  server=ServerSocket(0,50,InetAddress.getByName("127.0.0.1"));Endpoint.configureTest("http://127.0.0.1:${server.localPort}")
  workers.execute{while(!server.isClosed)try{val socket=server.accept();workers.execute{try{socket.use{client->
   client.soTimeout=10000;val input=client.getInputStream().buffered();fun line():String{val out=ByteArrayOutputStream();while(true){val b=input.read();if(b<0||b==10)break;if(b!=13)out.write(b)};return out.toString("UTF-8")}
   val first=line().split(' ');if(first.size<2)return@use;val method=first[0];val url=first[1];val key=url.substringBefore('?');var size=0;while(true){val h=line();if(h.isEmpty())break;if(h.startsWith("Content-Length:",true))size=h.substringAfter(':').trim().toInt()};val bytes=ByteArray(size);var read=0;while(read<size){val n=input.read(bytes,read,size-read);if(n<=0)break;read+=n};requests.add("$method $url" to bytes)
   var code=200;var data=responses[key]?:payload("ok" to true)
   when{
    key=="/api/dubbing/generations"&&method=="POST"->{
     generatedId=JSONObject(bytes.toString(Charsets.UTF_8)).getString("requestId")
     if(generationMode=="rejected"){code=429;data=payload("error" to "테스트: 작성 횟수 제한")}else{code=503;data=payload("error" to "테스트: 생성 접수 후 응답 유실")}
    }
    key.startsWith("/api/dubbing/generations/")->{data=if(generationReady)payload("id" to generatedId,"state" to "ready","options" to options,"script" to script)else payload("id" to generatedId,"state" to "running")}
    key.startsWith("/api/voice/rooms/native-room/")->{val op=key.substringAfterLast('/');if(op=="chat"){val b=JSONObject(bytes.toString(Charsets.UTF_8));state.getJSONArray("chat").put(payload("id" to b.getString("request_id"),"name" to "하린","profile_id" to "mine","body" to b.getString("body")));state.put("revision",state.getInt("revision")+1)};if(op=="request-mic")state.getJSONArray("members").getJSONObject(1).put("requested",true);data=state}
    key=="$path/recording"||key.endsWith("/start")->data=recording
    key.contains("/recording/role_1/lines/")&&method=="PUT"->{
     assertEquals("RIFF",bytes.copyOfRange(0,4).toString(Charsets.US_ASCII));assertEquals(48000,ByteBuffer.wrap(bytes,24,4).order(ByteOrder.LITTLE_ENDIAN).int);assertTrue(bytes.size<=44+86402)
     val take=URLDecoder.decode(url.substringAfter("take="),"UTF-8");val lineId=key.substringAfterLast('/');recording.getJSONArray("lines").objects().first{it.getString("id")==lineId}.put("takeId",take).put("audioUrl",key)
     val r=recording.getJSONObject("recording").getJSONArray("roles").getJSONObject(0);r.put("revision",r.getInt("revision")+1);data=recording
     if(!uploadReplyLost){uploadReplyLost=true;code=503;data=payload("error" to "테스트: 저장 후 응답 유실")}
    }
    key.endsWith("/submit")->{recording.getJSONObject("recording").getJSONArray("roles").getJSONObject(0).put("state","submitted");data=recording}
   }
   val isAudio=key.endsWith("/background")||key.contains("/lines/")&&method=="GET";val isImage=key.startsWith("/assets/dubbing-genres/");val body=if(isAudio)audio else if(isImage)genreImage else data.toString().toByteArray();val type=if(isAudio)"audio/wav" else if(isImage)"image/webp" else "application/json";client.getOutputStream().write("HTTP/1.1 $code Response\r\nContent-Type: $type\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray()+body)
  }}catch(_:Exception){}}}catch(_:SocketException){}}
 }
 @After fun teardown(){activity?.close();context.stopService(Intent(context,NativeVoiceService::class.java));if(::server.isInitialized)server.close();workers.shutdownNow()}
 private fun launch(route:String){activity=ActivityScenario.launch(Intent(context,NativePerformanceActivity::class.java).putExtra("route",route))}
 private fun visible(tag:String){ui.waitUntil(20000){ui.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()}}
 private fun text(value:String){ui.waitUntil(20000){ui.onAllNodesWithText(value,substring=true).fetchSemanticsNodes().isNotEmpty()}}
 private fun capture(name:String){val dir=File(context.getExternalFilesDir(null),"native-audio").apply{mkdirs()};ins.waitForIdleSync();Thread.sleep(200);ins.uiAutomation.takeScreenshot().let{bitmap->FileOutputStream(File(dir,"$name.png")).use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()}}
 @Test fun listenerJoinsAndChatsWithoutRequestingMicrophone(){
  val permissionBefore=ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)
  launch("voice/native-room");visible("native-voice-room");text("청취 중")
  assertEquals("Listening must not request microphone permission",permissionBefore,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));assertFalse(NativeVoiceService.current.value!!.micOn.value)
  ui.onNodeWithText("메시지를 입력하세요").performTextInput("같이 이야기해요")
  ui.onNodeWithContentDescription("메시지 보내기").performClick();text("같이 이야기해요");capture("voice-listener")
  for(seat in 0..7)ui.onNodeWithTag("voice-seat-$seat").assertIsDisplayed()
  ui.onNodeWithText("메시지를 입력하세요").assertIsDisplayed()
  androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithTag("voice-seat-1").performClick();text("신청 취소")
  assertTrue(requests.none{it.first.contains("/publish")});assertTrue(requests.any{it.first.endsWith("/chat")})
  ui.onNodeWithContentDescription("소리 설정").performClick();text("내가 듣는 음악");capture("voice-settings")
 }
 @Test fun nativeRecordingCountsDownSavesTogetherAndRecoversLostResponse(){
  ins.uiAutomation.grantRuntimePermission(context.packageName,Manifest.permission.RECORD_AUDIO)
  launch("dubbing/$projectId");visible("native-dubbing-project");ui.onNodeWithText("녹음하기").performScrollTo().performClick();visible("native-dubbing-recorder");ui.waitUntil(20000){ui.onNodeWithTag("dubbing-record-line").fetchSemanticsNode().config.contains(androidx.compose.ui.semantics.SemanticsProperties.Disabled).not()}
  ui.onNodeWithTag("dubbing-record-line").assertIsDisplayed();ui.onNodeWithTag("dubbing-save-all").assertIsDisplayed();ui.onNodeWithTag("dubbing-script-line2").assertExists()
  ui.onNodeWithTag("dubbing-record-line").performClick();text("3");capture("dubbing-countdown");text("내 대사 1 / 2")
  assertTrue(requests.none{it.first.startsWith("PUT ")})
  ui.onNodeWithText("다음").performClick();ui.onNodeWithTag("dubbing-record-line").performClick();text("내 대사 2 / 2");capture("dubbing-checks");assertEquals("Two lines reuse a single complete background download",1,requests.count{it.first.endsWith("/background")})
  ui.onNodeWithTag("dubbing-save-all").performClick();text("응답 유실")
  ui.onNodeWithTag("dubbing-save-all").performClick();text("모두 임시 저장했어요")
  assertEquals(2,requests.count{it.first.startsWith("PUT ")})
  ui.onNodeWithText("전체 제출").performClick();ui.onNodeWithText("동의하고 제출").performClick();text("제출 완료")
  assertEquals(2,requests.count{it.first.startsWith("PUT ")});assertEquals(1,requests.count{it.first.endsWith("/submit")})
  val submitted=JSONObject(requests.first{it.first.endsWith("/submit")}.second.toString(Charsets.UTF_8));assertTrue(submitted.getBoolean("rightsAccepted"));capture("dubbing-submitted")
 }
 @Test fun manualScriptAndAccountDraftIsolation(){
  val script=manualDubbingScript("테스트","A: 먼저 시작해요\nB： 이어서 말해요",defaultDubbingOptions());assertEquals(2,script.getJSONArray("lines").length());assertTrue(runCatching{manualDubbingScript("x","대사만",defaultDubbingOptions())}.isFailure)
  val d=DubbingDrafts(context,"first",projectId,"unique-${System.nanoTime()}","role_1");val take=payload("id" to requestIdentity());d.file(take).writeBytes(wave);d.commit("line1",take)
  assertTrue(DubbingDrafts(context,"other",projectId,d.directory.parentFile!!.name,"role_1").takes.isEmpty())
  assertEquals(.6,dubbingWindow(recording.getJSONArray("lines").getJSONObject(0)).start,0.0)
  val music=payload("queue" to arr(payload("duration" to 10)),"index" to 0,"position" to 3,"playing" to true,"updated" to 1000);assertEquals(7000L,voiceMusicPosition(music,5000));assertEquals(10000L,voiceMusicPosition(music,20000))
 }
 @Test fun dubbingOptionsOpenOnDemandAndPersistWithoutCreating(){
  val prefs=context.getSharedPreferences("native_dubbing",0);val key="script:$me:new";prefs.edit().remove(key).commit()
  launch("dubbing/new");visible("native-dubbing-form")
  ui.onNodeWithTag("dubbing-option-SF").assertDoesNotExist()
  ui.onNodeWithTag("dubbing-choice-genres").performClick();ui.onNodeWithTag("dubbing-option-코미디").performScrollTo().performClick()
  ui.onNodeWithText("선택 완료").performClick()
  for((field,value) in listOf("roleCount" to "3","minutes" to "2.5","mood" to "유쾌하게","ending" to "반전")){
   ui.onNodeWithTag("dubbing-choice-$field").performScrollTo().performClick();ui.onNodeWithTag("dubbing-option-$value").performScrollTo().performClick()
  }
  val saved=JSONObject(prefs.getString(key,"{}")!!).getJSONObject("options")
  assertEquals(3,saved.getInt("roleCount"));assertEquals(2.5,saved.getDouble("minutes"),0.0);assertEquals("유쾌하게",saved.getString("mood"));assertEquals("반전",saved.getString("ending"));assertEquals(2,saved.getJSONArray("genres").length())
  ui.onNodeWithTag("native-dubbing-form").performScrollToNode(hasTestTag("dubbing-choice-genres"));capture("dubbing-create-263")
  assertFalse(requests.any{it.first.startsWith("POST ")})
  activity?.close();activity=null;launch("dubbing/$projectId");visible("native-dubbing-project");text("닫힌 복도");capture("dubbing-studio-263")
  prefs.edit().remove(key).commit()
 }
 @Test fun generationRejectionUnlocksAndLostResponseRecoversWithoutReposting(){
  val prefs=context.getSharedPreferences("native_dubbing",0);val key="script:$me:new";prefs.edit().remove(key).commit()
  launch("dubbing/new");visible("native-dubbing-form")
  ui.onNodeWithTag("native-dubbing-form").performScrollToNode(hasText("AI 대본 작성하기"));ui.onNodeWithText("AI 대본 작성하기").performClick();text("테스트: 작성 횟수 제한")
  ui.onNodeWithText("AI 대본 작성하기").assertIsEnabled()
  activity?.close();activity=null;launch("dubbing/new");visible("native-dubbing-form");ui.onNodeWithTag("native-dubbing-form").performScrollToNode(hasText("AI 대본 작성하기"));ui.onNodeWithText("AI 대본 작성하기").assertIsEnabled()
  generationMode="lost";ui.onNodeWithText("AI 대본 작성하기").performClick();text("테스트: 생성 접수 후 응답 유실");ui.onNodeWithText("AI 대본 작성하기").assertIsNotEnabled()
  generationReady=true;ui.onNodeWithText("이전 AI 생성 결과 확인").performScrollTo().performClick();text("대본 편집");capture("dubbing-native-editor")
  assertEquals(2,requests.count{it.first=="POST /api/dubbing/generations"})
  assertTrue(requests.any{it.first=="GET /api/dubbing/generations/$generatedId"})
  assertEquals("ready",JSONObject(prefs.getString(key,"{}")!!).getJSONObject("generation").getString("state"))
  prefs.edit().remove(key).commit()
 }
}
