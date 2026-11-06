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
  responses["/api/voice/options"]=payload("crews" to JSONArray(),"themes" to arr(payload("sku" to "navy","name" to "차분한 다크","paid" to false,"selectable" to true)))
  state=payload("generation" to "native-generation","self" to me,"revision" to 1,"serverNow" to System.currentTimeMillis(),"room" to payload("id" to "native-room","title" to "밤하늘 음악 이야기","host_id" to "host","max_members" to 30,"visibility" to "public"),"members" to arr(payload("id" to "host","profile_id" to "host-profile","name" to "지유","role" to "host","seat" to 0,"muted" to true,"publishing" to false),payload("id" to me,"profile_id" to "mine","name" to "하린","role" to "listener","seat" to null,"muted" to true,"publishing" to false)),"chat" to JSONArray(),"seat_invites" to JSONArray(),"music" to payload("queue" to JSONArray(),"index" to -1))
  val genreImage=ins.context.assets.open("design/dubbing-daily.webp").use{it.readBytes()}
  val giftImage=ins.context.assets.open("design/gifts/lollipop.png").use{it.readBytes()}
  val frameImage=ByteArrayOutputStream().use{out->
   val bitmap=android.graphics.Bitmap.createBitmap(128,128,android.graphics.Bitmap.Config.ARGB_8888)
   android.graphics.Canvas(bitmap).drawCircle(64f,64f,58f,android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply{color=android.graphics.Color.rgb(214,186,255);style=android.graphics.Paint.Style.STROKE;strokeWidth=10f})
   bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();out.toByteArray()
  }
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
    key=="/api/voice/rooms"&&method=="POST"->{
     val form=JSONObject(bytes.toString(Charsets.UTF_8));form.put("id","native-room").put("host_id","host")
     val sku=form.optString("theme_sku");val chosen=responses["/api/voice/options"]?.optJSONArray("themes")?.objects()?.find{it.optString("sku")==sku}
     form.put("theme",payload("sku" to sku,"assets" to chosen?.optJSONObject("assetPaths")))
     state.put("room",form);data=payload("room" to form)
    }
    key.startsWith("/api/voice/rooms/native-room/")->{val op=key.substringAfterLast('/');if(op=="chat"){val b=JSONObject(bytes.toString(Charsets.UTF_8));state.getJSONArray("chat").put(payload("id" to b.getString("request_id"),"name" to "하린","profile_id" to "mine","body" to b.getString("body")));state.put("revision",state.getInt("revision")+1)};if(op=="request-mic")state.getJSONArray("members").getJSONObject(1).put("requested",true)
     if(op=="settings"){val b=JSONObject(bytes.toString(Charsets.UTF_8));b.keys().forEach{k->if(k!="generation")state.getJSONObject("room").put(k,b.get(k))}}
     if(op=="approve-mic"){val b=JSONObject(bytes.toString(Charsets.UTF_8));state.getJSONArray("members").objects().find{it.optString("id")==b.optString("target_id")}?.put("requested",false)?.put("seat",1)}
     if(op!="socket")state.put("revision",state.optInt("revision")+1);data=state}
    key=="$path/recording"||key.endsWith("/start")->data=recording
    key.contains("/recording/role_1/lines/")&&method=="PUT"->{
     assertEquals("RIFF",bytes.copyOfRange(0,4).toString(Charsets.US_ASCII));assertEquals(48000,ByteBuffer.wrap(bytes,24,4).order(ByteOrder.LITTLE_ENDIAN).int);assertTrue(bytes.size<=44+86402)
     val take=URLDecoder.decode(url.substringAfter("take="),"UTF-8");val lineId=key.substringAfterLast('/');recording.getJSONArray("lines").objects().first{it.getString("id")==lineId}.put("takeId",take).put("audioUrl",key)
     val r=recording.getJSONObject("recording").getJSONArray("roles").getJSONObject(0);r.put("revision",r.getInt("revision")+1);data=recording
     if(!uploadReplyLost){uploadReplyLost=true;code=503;data=payload("error" to "테스트: 저장 후 응답 유실")}
    }
    key.endsWith("/submit")->{recording.getJSONObject("recording").getJSONArray("roles").getJSONObject(0).put("state","submitted");data=recording}
   }
   val isAudio=key.endsWith("/background")||key.contains("/lines/")&&method=="GET";val isFrame=key=="/assets/products/qa-voice-frame.png";val isImage=isFrame||key.startsWith("/assets/dubbing-genres/")||key.startsWith("/assets/gifts/")||key.startsWith("/media/producer/");val body=if(isAudio)audio else if(isFrame)frameImage else if(key.startsWith("/assets/gifts/"))giftImage else if(isImage)genreImage else data.toString().toByteArray();val type=if(isAudio)"audio/wav" else if(isFrame)"image/png" else if(isImage)"image/webp" else "application/json";client.getOutputStream().write("HTTP/1.1 $code Response\r\nContent-Type: $type\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray()+body)
  }}catch(_:Exception){}}}catch(_:SocketException){}}
 }
 @After fun teardown(){activity?.close();context.stopService(Intent(context,NativeVoiceService::class.java));if(::server.isInitialized)server.close();workers.shutdownNow()}
 private fun launch(route:String){activity=ActivityScenario.launch(Intent(context,NativePerformanceActivity::class.java).putExtra("route",route))}
 private fun visible(tag:String){ui.waitUntil(20000){ui.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()}}
 private fun text(value:String){ui.waitUntil(20000){ui.onAllNodesWithText(value,substring=true).fetchSemanticsNodes().isNotEmpty()}}
 private fun capture(name:String){val dir=File(context.getExternalFilesDir(null),"native-audio").apply{mkdirs()};ins.waitForIdleSync();Thread.sleep(200);ins.uiAutomation.takeScreenshot().let{bitmap->FileOutputStream(File(dir,"$name.png")).use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()}}
 @Test fun roomCreationUsesSelectedBackgroundAndKeepsPrimaryActionVisible(){
  responses["/api/voice/options"]=payload(
   "crews" to arr(payload("id" to "crew-one","name" to "밤산책")),
   "themes" to JSONArray(listOf("navy","sunset","night").map{sku->payload("sku" to sku,"name" to sku,"paid" to false,"selectable" to true)})
  )
  launch("voice");visible("voice-room-form")
  ui.onNodeWithTag("room-submit").assertIsDisplayed().assertIsNotEnabled()
  ui.onNodeWithText("토킹룸").performClick()
  ui.onNodeWithTag("room-title").performTextInput("오늘의 음악 이야기")
  androidx.test.espresso.Espresso.closeSoftKeyboard()
  ui.onNodeWithText("허락 후 착석").assertIsSelected()
  ui.onNodeWithTag("room-theme-night").performScrollTo().performClick().assertIsSelected()
  ui.onNodeWithTag("room-submit").assertIsDisplayed().assertIsEnabled()
  capture("room-269-create")
  ui.onNodeWithText("최대 인원").performScrollTo().performClick()
  ui.onNodeWithTag("room-capacity-picker").performScrollToIndex(10)
  ui.onNodeWithText("12명").performClick()
  ui.onNodeWithText("공지",useUnmergedTree=true).performScrollTo().performClick()
  ui.onNodeWithTag("room-announcement").performTextInput("편하게 음악 이야기 나눠요")
  androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithText("적용").performClick()
  ui.onNodeWithText("크루",useUnmergedTree=true).performScrollTo().performClick()
  ui.onNodeWithTag("room-submit").assertIsNotEnabled()
  ui.onNodeWithText("참여할 크루").performScrollTo().performClick();ui.onNodeWithText("밤산책").performClick()
  ui.onNodeWithText("자유 착석").performScrollTo().performClick()
  ui.onNodeWithTag("room-submit").performClick();visible("native-voice-room")
  val submitted=JSONObject(requests.single{it.first=="POST /api/voice/rooms"}.second.toString(Charsets.UTF_8))
  assertEquals("talk",submitted.getString("mode"))
  assertEquals("오늘의 음악 이야기",submitted.getString("title"));assertEquals(12,submitted.getInt("max_members"))
  assertEquals("night",submitted.getString("background"));assertEquals("night",submitted.getString("theme_sku"))
  assertEquals("free",submitted.getString("seating_mode"));assertEquals("crew-one",submitted.getString("crew_id"))
  assertEquals("편하게 음악 이야기 나눠요",submitted.getString("announcement"))
  ui.onNodeWithTag("voice-background-night",useUnmergedTree=true).assertIsDisplayed();capture("room-269-applied")
 }
 @Test fun roomCreationUsesOwnedThemeAndPreservesDraftOnRecreation(){
  val image="/assets/dubbing-genres/daily.webp"
  responses["/api/voice/options"]=payload("crews" to JSONArray(),"themes" to arr(
   payload("sku" to "theme-owned","name" to "보유한 라운지","paid" to true,"selectable" to true,"assetPaths" to payload("roomMobile" to image)),
   payload("sku" to "theme-locked","name" to "미보유 테마","paid" to true,"selectable" to false)))
  launch("voice");visible("voice-room-form");ui.onNodeWithText("토킹룸").performScrollTo().performClick();ui.onNodeWithTag("room-title").performTextInput("함께 듣는 밤")
  androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithText("전체 보기").performScrollTo().performClick()
  visible("room-theme-picker");ui.onNodeWithText("미보유 테마").assertDoesNotExist();capture("room-269-themes")
  ui.onNode(hasTestTag("room-theme-theme-owned") and hasAnyAncestor(hasTestTag("room-theme-picker"))).performScrollTo().performClick()
  ui.onNodeWithTag("room-theme-theme-owned").assertIsSelected()
  activity!!.recreate();visible("voice-room-form");text("보유한 라운지")
  ui.onNodeWithTag("room-title").assertTextContains("함께 듣는 밤")
  ui.onNodeWithTag("room-theme-theme-owned").performScrollTo().assertIsSelected()
  ui.onNodeWithTag("room-submit").performClick();visible("native-voice-room")
  val submitted=JSONObject(requests.single{it.first=="POST /api/voice/rooms"}.second.toString(Charsets.UTF_8))
  assertEquals("theme-owned",submitted.getString("theme_sku"));assertEquals("navy",submitted.getString("background"))
  ui.onNodeWithTag("voice-background-theme-owned",useUnmergedTree=true).assertIsDisplayed()
  ui.onNodeWithTag("voice-background-image",useUnmergedTree=true).assertIsDisplayed();capture("room-269-owned-applied")
 }
 @Test fun roomCreationPrefersActivePaidThemesAndKeepsExplicitFreeChoiceOnRefresh(){
  val paid=payload("sku" to "theme-aurora","name" to "활성 오로라 라운지","paid" to true,"selectable" to true,"assetPaths" to payload("roomMobile" to "/assets/dubbing-genres/daily.webp"))
  val second=payload("sku" to "theme-starlight","name" to "활성 별빛 라운지","paid" to true,"selectable" to true)
  val navy=payload("sku" to "navy","name" to "차분한 다크","paid" to false,"selectable" to true)
  val night=payload("sku" to "night","name" to "밤하늘","paid" to false,"selectable" to true)
  val locked=payload("sku" to "theme-stock-only","name" to "미사용 보관 테마","paid" to true,"selectable" to false)
  responses["/api/voice/options"]=payload("crews" to JSONArray(),"themes" to arr(paid,second,navy,night,locked),"preferred_theme" to "theme-aurora")
  launch("voice");visible("room-theme-theme-aurora");ui.onNodeWithText("토킹룸").performScrollTo().performClick()
  ui.onNodeWithTag("room-theme-theme-aurora").performScrollTo().assertIsSelected()
  ui.onNodeWithTag("room-title").performScrollTo().performTextInput("선택을 유지하는 방")
  androidx.test.espresso.Espresso.closeSoftKeyboard()
  ui.onNodeWithText("전체 보기").performScrollTo().performClick();visible("room-theme-picker")
  fun option(sku:String)=ui.onNode(hasTestTag("room-theme-$sku") and hasAnyAncestor(hasTestTag("room-theme-picker")))
  option("theme-aurora").assertIsSelected();option("theme-stock-only").assertDoesNotExist()
  val paidBounds=option("theme-aurora").fetchSemanticsNode().boundsInRoot
  val freeBounds=option("navy").fetchSemanticsNode().boundsInRoot
  assertTrue("Active paid choices precede free backgrounds",paidBounds.top<freeBounds.top)
  capture("room-paid-default")
  option("night").performScrollTo().performClick()
  ui.onNodeWithTag("room-theme-night").performScrollTo().assertIsSelected()
  val before=requests.count{it.first.substringBefore('?')=="GET /api/voice/options"}
  responses["/api/voice/options"]=payload("crews" to JSONArray(),"themes" to arr(second,paid,navy,night),"preferred_theme" to "theme-starlight")
  activity!!.recreate();visible("voice-room-form")
  ui.waitUntil(10000){requests.count{it.first.substringBefore('?')=="GET /api/voice/options"}>before}
  ui.onNodeWithTag("room-title").assertTextContains("선택을 유지하는 방")
  ui.onNodeWithTag("room-theme-night").performScrollTo().assertIsSelected()
  ui.onNodeWithTag("room-submit").performClick();visible("native-voice-room")
  val submitted=JSONObject(requests.single{it.first=="POST /api/voice/rooms"}.second.toString(Charsets.UTF_8))
  assertEquals("night",submitted.getString("theme_sku"));assertEquals("night",submitted.getString("background"))
 }
 @Test fun roomFramesSurviveTransportOnlySnapshotsAndClearAfterValidation(){
  val frame="/assets/products/qa-voice-frame.png"
  state.getJSONObject("room").put("theme",payload("sku" to "theme-aurora","assets" to payload("roomMobile" to "/assets/dubbing-genres/daily.webp")))
  state.getJSONArray("members").objects().forEach{it.put("profile_frame","frame_aurora_ring").put("profile_frame_artwork",frame)}
  state.getJSONArray("members").getJSONObject(1).put("seat",1)
  val permissionBefore=ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)
  launch("voice/native-room");visible("native-voice-room")
  ui.onNodeWithTag("voice-background-theme-aurora",useUnmergedTree=true).assertIsDisplayed()
  ui.onNodeWithTag("voice-member-frame-host-profile",useUnmergedTree=true).assertIsDisplayed()
  ui.onNodeWithTag("voice-member-frame-mine",useUnmergedTree=true).assertIsDisplayed()
  ui.waitUntil(10000){requests.any{it.first=="GET $frame"}}
  val photo=ui.onNodeWithTag("voice-member-frame-host-profile",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
  val slot=ui.onNodeWithTag("voice-member-avatar-host-profile",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
  assertTrue("Decorative overhang stays within the reserved avatar slot",photo.width*1.26f<=slot.width+1f)
  capture("voice-framed-members")
  val engine=NativeVoiceService.current.value!!
  // Transport-only snapshots omit Site-owned entitlement fields; keep the last
  // validated frame until an HTTP response explicitly clears expired equipment.
  state.getJSONArray("members").objects().forEach{it.remove("profile_frame");it.remove("profile_frame_artwork")}
  state.getJSONObject("room").remove("theme")
  runBlocking(kotlinx.coroutines.Dispatchers.IO){engine.command("heartbeat")}
  ui.onNodeWithTag("voice-member-frame-host-profile",useUnmergedTree=true).assertIsDisplayed()
  ui.onNodeWithTag("voice-background-theme-aurora",useUnmergedTree=true).assertIsDisplayed()
  state.getJSONArray("members").objects().forEach{it.put("profile_frame",JSONObject.NULL).put("profile_frame_artwork",JSONObject.NULL)}
  runBlocking(kotlinx.coroutines.Dispatchers.IO){engine.command("heartbeat")}
  ui.onNodeWithTag("voice-member-frame-host-profile",useUnmergedTree=true).assertDoesNotExist()
  ui.onNodeWithTag("voice-member-frame-mine",useUnmergedTree=true).assertDoesNotExist()
  assertEquals(permissionBefore,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));assertFalse(engine.micOn.value)
  assertTrue(requests.none{it.first.endsWith("/publish")});assertTrue(requests.none{it.first.endsWith("/leave")})
 }
 @Test fun listenerJoinsAndChatsWithoutRequestingMicrophone(){
  val permissionBefore=ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)
  launch("voice/native-room");visible("native-voice-room");text("청취 중")
  assertEquals("Listening must not request microphone permission",permissionBefore,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));assertFalse(NativeVoiceService.current.value!!.micOn.value)
  ui.onNodeWithText("메시지를 입력하세요").performTextInput("같이 이야기해요")
  ui.onNodeWithContentDescription("메시지 보내기").performClick();text("같이 이야기해요");ui.waitUntil(10000){ui.onNodeWithText("메시지를 입력하세요").isDisplayed()};assertNull(NativeVoiceService.current.value!!.error.value);capture("voice-listener")
  for(seat in 0..7)ui.onNodeWithTag("voice-seat-$seat").assertIsDisplayed()
  ui.onNodeWithText("메시지를 입력하세요").assertIsDisplayed()
  androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithTag("voice-seat-1").performClick();text("신청 취소")
  assertTrue(requests.none{it.first.contains("/publish")});assertTrue(requests.any{it.first.endsWith("/chat")})
  ui.onNodeWithContentDescription("소리 설정").performClick();text("내가 듣는 음악");capture("voice-settings")
 }

 private fun voiceMusicFixture(){
  val song=payload("id" to "voice-song","title" to "너와 함께 걷는 밤의 아주 긴 노래 제목","artist" to "NOVA","duration" to 180)
  state.put("music",payload("queue" to arr(song),"index" to 0,"playing" to false,"position" to 0,"updated" to System.currentTimeMillis()))
  responses["/api/library"]=payload("likes" to JSONArray(),"collections" to arr(payload("id" to "voice-list","user_id" to me,"name" to "함께 들은 음악")))
  responses["/api/producers/host-profile"]=payload("profile" to payload("id" to "host-profile","name" to "지유","bio" to "음악으로 이야기해요"),"followers" to 12,"tracks" to arr(song),"covers" to JSONArray(),"gallery" to arr(payload("id" to "photo","url" to "/media/producer/sample")),"crew" to payload("name" to "밤산책"))
 }
 @Test fun voiceTopMusicProfileAndPlaylistKeepRoomConnected(){
  voiceMusicFixture();launch("voice/native-room");visible("voice-top-music");text("NOVA")
  ui.onNodeWithContentDescription("방 설정").assertDoesNotExist();ui.onNodeWithTag("voice-muted-host",useUnmergedTree=true).assertIsDisplayed()
  val top=ui.onNodeWithTag("voice-top-music").fetchSemanticsNode().boundsInRoot
  val seat=ui.onNodeWithTag("voice-seat-0").fetchSemanticsNode().boundsInRoot;assertTrue(top.bottom<=seat.top)
  val engine=NativeVoiceService.current.value
  ui.waitUntil(10000){ui.onAllNodesWithContentDescription("좋아요").fetchSemanticsNodes().isNotEmpty()};ui.onNodeWithContentDescription("좋아요").performClick();text("너와 함께")
  ui.waitUntil(10000){requests.any{it.first=="PUT /api/tracks/voice-song/like"}}
  ui.onNodeWithContentDescription("내 플레이리스트에 담기").performClick();text("함께 들은 음악");ui.onNodeWithText("함께 들은 음악").performClick()
  ui.waitUntil(10000){requests.any{it.first=="PUT /api/playlists/voice-list/tracks/voice-song"}}
  ui.onNodeWithTag("voice-seat-0").performClick();ui.onNodeWithText("프로필 보기").performClick();visible("voice-profile-popup");ui.onNodeWithText("밤산책").assertDoesNotExist();capture("voice-267-profile")
  ui.onNodeWithContentDescription("팝업 닫기").performClick();assertSame(engine,NativeVoiceService.current.value);assertFalse(requests.any{it.first.endsWith("/leave")});assertEquals(1,requests.count{it.first.endsWith("/join")})
  ui.waitUntil(10000){ui.onAllNodesWithTag("voice-profile-popup").fetchSemanticsNodes().isEmpty()}
  capture("voice-267-listener")
 }
 @Test fun voiceHostRequestsStayAtTopAndSeatingPolicySaves(){
  voiceMusicFixture();state.put("self","host");state.getJSONArray("members").getJSONObject(1).put("requested",true).put("requestedSeat",1)
  repeat(35){i->state.getJSONArray("chat").put(payload("id" to "chat-$i","name" to "하린","user_id" to me,"body" to "대화 $i","sequence" to i))}
  launch("voice/native-room");visible("voice-seat-alert");ui.onNodeWithTag("native-voice-conversation").performScrollToIndex(34)
  ui.onNodeWithTag("voice-seat-alert").assertIsDisplayed();capture("voice-267-seat-alert");ui.onNodeWithTag("voice-seat-alert").performClick();ui.onNodeWithText("승인").performClick()
  ui.waitUntil(10000){state.getJSONArray("members").getJSONObject(1).optInt("seat")==1};ui.onNodeWithContentDescription("팝업 닫기").performClick()
  ui.onNodeWithTag("voice-seat-alert").assertDoesNotExist();ui.onNodeWithContentDescription("방 설정").performClick()
  ui.onNodeWithText("자유 착석").performScrollTo().performClick();capture("voice-267-room-settings")
  ui.onNodeWithTag("room-submit").performScrollTo().assertIsEnabled().performClick()
  ui.waitUntil(10000){requests.any{it.first.endsWith("/settings")}};assertEquals("free",JSONObject(requests.last{it.first.endsWith("/settings")}.second.toString(Charsets.UTF_8)).getString("seating_mode"))
 }
 @Test fun voiceGiftImagesAnimateOnceAndCallsMuteWithoutLeaving(){
  voiceMusicFixture();launch("voice/native-room");visible("voice-top-music");val engine=NativeVoiceService.current.value!!
  val gift=payload("id" to "gift-test","kind" to "gift","name" to "지유","recipient_name" to "하린","sequence" to 1,"gift" to payload("id" to "receipt-test","type" to "lollipop","name" to "막대사탕","quantity" to 2))
  state.getJSONArray("chat").put(gift);ins.runOnMainSync{engine.launch{engine.command("heartbeat")}}
  visible("voice-gift-gift-test");visible("voice-gift-animation");capture("voice-267-gift")
  ui.waitUntil(8000){ui.onAllNodesWithTag("voice-gift-animation").fetchSemanticsNodes().isEmpty()}
  ins.runOnMainSync{engine.launch{engine.command("heartbeat")}};Thread.sleep(400);ui.onNodeWithTag("voice-gift-animation").assertDoesNotExist()
  ins.runOnMainSync{engine.micOn.value=true;engine.phoneCallChanged(true)}
  assertFalse(engine.micOn.value);assertFalse(engine.finished.value);assertSame(engine,NativeVoiceService.current.value)
  ins.runOnMainSync{engine.phoneCallChanged(false);engine.audioFocusChanged(android.media.AudioManager.AUDIOFOCUS_GAIN)}
  runBlocking(kotlinx.coroutines.Dispatchers.IO){engine.command("heartbeat")};assertNull(engine.error.value)
  assertFalse("No automatic mic restart after a call",engine.micOn.value);assertFalse(requests.any{it.first.endsWith("/leave")});capture("voice-267-after-call")
 }

 @Test fun nativeRecordingCountsDownSavesTogetherAndRecoversLostResponse(){
  ins.uiAutomation.grantRuntimePermission(context.packageName,Manifest.permission.RECORD_AUDIO)
  launch("dubbing/$projectId");visible("native-dubbing-project");ui.onNodeWithText("녹음하기").performScrollTo().performClick();visible("native-dubbing-recorder");try{ui.waitUntil(20000){ui.onNodeWithTag("dubbing-record-line").fetchSemanticsNode().config.contains(androidx.compose.ui.semantics.SemanticsProperties.Disabled).not()}}catch(e:Throwable){capture("polish-268-dubbing-prepare-failure");throw AssertionError(ui.onRoot().printToString(),e)}
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
  assertFalse("Editing must not automatically save",prefs.contains(key))
  capture("polish-268-dubbing-options")
  androidx.test.espresso.Espresso.pressBack();visible("dubbing-save-leave");capture("polish-268-dubbing-save-confirm");ui.onNodeWithTag("dubbing-save-leave").performClick()
  val saved=JSONObject(prefs.getString(key,"{}")!!).getJSONObject("options")
  assertEquals(3,saved.getInt("roleCount"));assertEquals(2.5,saved.getDouble("minutes"),0.0);assertEquals("유쾌하게",saved.getString("mood"));assertEquals("반전",saved.getString("ending"));assertEquals(2,saved.getJSONArray("genres").length())
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
  assertFalse(prefs.contains(key));androidx.test.espresso.Espresso.pressBack();visible("dubbing-save-leave");ui.onNodeWithTag("dubbing-save-leave").performClick()
  assertEquals("ready",JSONObject(prefs.getString(key,"{}")!!).getJSONObject("generation").getString("state"))
  prefs.edit().remove(key).commit()
 }
 @Test fun dubbingDiscardDoesNotKeepNewScript(){
  val prefs=context.getSharedPreferences("native_dubbing",0);val key="script:$me:new";prefs.edit().remove(key).commit()
  launch("dubbing/new");visible("native-dubbing-form");ui.onNodeWithTag("dubbing-choice-roleCount").performClick();ui.onNodeWithTag("dubbing-option-3").performScrollTo().performClick()
  androidx.test.espresso.Espresso.pressBack();visible("dubbing-discard-leave");ui.onNodeWithTag("dubbing-continue").performClick();visible("native-dubbing-form")
  androidx.test.espresso.Espresso.pressBack();visible("dubbing-discard-leave");ui.onNodeWithTag("dubbing-discard-leave").performClick();assertFalse(prefs.contains(key))
 }
 @Test fun dubbingDraftStorageKeepsOnlyExplicitlySavedTakes(){
  val sound="save-${System.nanoTime()}";val d=DubbingDrafts(context,me,projectId,sound,"role_1")
  val first=payload("id" to requestIdentity());d.file(first).writeBytes(wave);d.commit("line1",first);assertTrue(d.hasUnsavedChanges)
  d.discard();assertTrue(d.takes.isEmpty());assertFalse(d.file(first).exists())
  val saved=payload("id" to requestIdentity());d.file(saved).writeBytes(wave);d.commit("line1",saved);d.save();assertFalse(d.hasUnsavedChanges)
  val replacement=payload("id" to requestIdentity());d.file(replacement).writeBytes(wave);d.commit("line1",replacement);d.discard()
  assertEquals(saved.getString("id"),d.takes.getValue("line1").getString("id"));assertFalse(d.file(replacement).exists());assertTrue(d.file(saved).exists())
  val restored=DubbingDrafts(context,me,projectId,sound,"role_1");assertEquals(saved.getString("id"),restored.takes.getValue("line1").getString("id"));restored.directory.deleteRecursively()
 }
 @Test fun dubbingRecordedProgressAsksBeforeLeaving(){
  ins.uiAutomation.grantRuntimePermission(context.packageName,Manifest.permission.RECORD_AUDIO)
  launch("dubbing/$projectId");visible("native-dubbing-project")
  fun openRecorder(){ui.onNodeWithText("녹음하기").performScrollTo().performClick();visible("native-dubbing-recorder");try{ui.waitUntil(30000){!ui.onNodeWithTag("dubbing-record-line").fetchSemanticsNode().config.contains(androidx.compose.ui.semantics.SemanticsProperties.Disabled)}}catch(e:Throwable){capture("polish-268-reopen-failure");throw AssertionError(ui.onRoot().printToString()+"\nRequests: "+requests.map{it.first},e)}}
  openRecorder();ui.onNodeWithTag("dubbing-record-line").performClick();text("내 대사 1 / 2")
  androidx.test.espresso.Espresso.pressBack();visible("dubbing-discard-leave");capture("polish-268-recording-save-confirm");ui.onNodeWithTag("dubbing-discard-leave").performClick();visible("native-dubbing-project")
  openRecorder();text("내 대사 0 / 2");ui.onNodeWithTag("dubbing-record-line").performClick();text("내 대사 1 / 2")
  androidx.test.espresso.Espresso.pressBack();visible("dubbing-save-leave");ui.onNodeWithTag("dubbing-save-leave").performClick();visible("native-dubbing-project")
  openRecorder();text("내 대사 1 / 2");assertFalse("Leaving only keeps the explicitly requested local draft",requests.any{it.first.startsWith("PUT ")});capture("polish-268-recording-resumed")
 }
}
