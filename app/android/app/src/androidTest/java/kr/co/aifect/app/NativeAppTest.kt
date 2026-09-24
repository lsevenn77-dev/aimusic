package kr.co.aifect.app

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import java.io.*
import java.net.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** No production API, real account, microphone permission, or microphone samples. */
class NativeAppTest {
 @get:Rule val ui=createEmptyComposeRule()
 @get:Rule val testName=org.junit.rules.TestName()
 private val context=InstrumentationRegistry.getInstrumentation().targetContext
 private lateinit var server:ServerSocket
 private lateinit var screen:ActivityScenario<MainActivity>
 private val workers=Executors.newCachedThreadPool()
 private val logged=AtomicBoolean(false)
 private val liked=AtomicBoolean(false)
 private val followed=AtomicBoolean(false)
 private val reported=AtomicBoolean(false)
 private val comments=JSONArray()
 private val lists=JSONArray()
 private val requests=java.util.concurrent.ConcurrentLinkedQueue<String>()
 private val cookieHeaders=java.util.concurrent.ConcurrentHashMap<String,String>()
 private val user=payload("id" to "test-user","name" to "테스트 리스너","email" to "native@example.test","provider" to "email")
 private val song=payload("id" to "fixture","title" to "밤의 산책","artist" to "AIFECT","producer" to "테스트 뮤지션","producer_id" to "person","duration" to 30,"genre" to "City Pop","kind" to "original","likes" to 0,"comments" to 0,"plays" to 0,"lyrics_mode" to "synced","lyrics_access" to "line","karaoke_ready" to true,"description" to "하루 끝에 함께 듣는 음악")
 @Before fun setUp(){
  assertTrue("Only the isolated test package is allowed",context.packageName.endsWith(".test"))
  NativeSession.put(context,"cookie","");NativeSession.put(context,"ticket","")
  server=ServerSocket(0,10,InetAddress.getByName("127.0.0.1"))
  val rankingTest=testName.methodName=="coverRankingDiscoveryAndCommentModeration"
  val cover=JSONObject(song.toString()).put("id","cover-fixture").put("kind","cover").put("producer","커버 가수").put("rank",1).put("rank_likes",3).put("likes",3).put("original_id","fixture").put("karaoke_ready",false)
  if(rankingTest){logged.set(true);song.put("covers",1);comments.put(payload("id" to "comment-1","name" to "다른 리스너","body" to "이 목소리 좋네요","user_id" to "someone","can_delete" to true,"can_report" to true))}
  val adTest=testName.methodName=="fiveCompletedSongsPauseForOneAdAndResume"
  if(adTest){logged.set(true);song.put("duration",3);context.getSharedPreferences("listening_ads",0).edit().clear().commit()}
  val audio=wav(if(adTest)3 else 30)
  workers.execute { while(!server.isClosed)try {val socket=server.accept();workers.execute {try {socket.use { c->
   val input=c.getInputStream().buffered()
   fun header():String {val data=ByteArrayOutputStream();while(true){val byte=input.read();if(byte<0||byte==10)break;if(byte!=13)data.write(byte)};return data.toString("US-ASCII")}
   val request=header().split(" ");val method=request[0];val path=request[1].substringBefore("?");requests.add(request[1]);var length=0
   while(true){val line=header();if(line.isEmpty())break;if(line.startsWith("Content-Length:",true))length=line.substringAfter(":").trim().toInt();if(line.startsWith("Cookie:",true))cookieHeaders[path]=line.substringAfter(":").trim()}
   val bytes=ByteArray(length);var offset=0;while(offset<length){val n=input.read(bytes,offset,length-offset);if(n<0)break;offset+=n}
   val body=runCatching{JSONObject(String(bytes,Charsets.UTF_8))}.getOrDefault(JSONObject())
   var cookie="";var status=200;var content="application/json"
   val result:ByteArray=when {
    path.startsWith("/media/")->{content="audio/wav";audio}
    else -> {
     val response=when {
      path=="/api/me"->payload("user" to if(logged.get())user else null,"membership" to JSONObject(),"providers" to JSONArray(),"emailEnabled" to true)
      path=="/api/auth/login"->{logged.set(true);cookie="Set-Cookie: aifect_session=fixture; Path=/; HttpOnly\r\n";payload("user" to user)}
      path=="/api/auth/google/nonce"->{cookie="Set-Cookie: aifect_google_oauth=nonce-fixture; Path=/; HttpOnly\r\n";payload("nonce" to "fixture-nonce")}
      path=="/api/auth/google/token"->{cookie="Set-Cookie: aifect_google_oauth=; Path=/; Max-Age=0\r\nSet-Cookie: aifect_session=google-fixture; Path=/; HttpOnly\r\n";payload("user" to user)}
      path=="/api/library"->payload("likes" to if(liked.get())JSONArray().put(if(rankingTest)cover else song) else JSONArray(),"collections" to lists,"follows" to if(followed.get())JSONArray().put(payload("target_id" to "person","kind" to "producer")) else JSONArray())
      path=="/api/cover-rankings"->payload("tracks" to if(request[1].contains("kind=singers"))JSONArray() else JSONArray().put(cover),"singers" to if(request[1].contains("kind=singers"))JSONArray().put(payload("id" to "person","name" to "커버 가수","rank" to 1,"rank_likes" to 3,"ranked_covers" to 1)) else JSONArray())
      path=="/api/producers/person/follow"->{followed.set(method=="PUT");payload("ok" to true)}
      path=="/api/producers/person"->payload("profile" to payload("id" to "person","name" to "커버 가수"),"covers" to JSONArray().put(cover),"tracks" to JSONArray(),"followers" to if(followed.get())1 else 0)
      path=="/api/tracks/cover-fixture/like"->{liked.set(method=="PUT");payload("ok" to true)}
      path=="/api/tracks/cover-fixture/comments"->payload("comments" to comments)
      path=="/api/comments/comment-1/report"->{reported.set(true);comments.getJSONObject(0).put("reported",1).put("can_report",false);payload("ok" to true)}
      path=="/api/comments/comment-1"&&method=="DELETE"->{comments.getJSONObject(0).put("body","삭제된 댓글입니다.").put("deleted_at",1).put("can_delete",false).put("can_report",false);payload("ok" to true)}
      path=="/api/tracks/cover-fixture"->payload("track" to cover)
      path=="/api/playback/cover-fixture"->payload("id" to "listen-cover","src" to "/media/cover-fixture/preview","duration" to 30,"preview" to true)
      path=="/api/history"->payload("tracks" to JSONArray())
      path=="/api/studio"->payload("producer" to null,"artists" to JSONArray(),"tracks" to JSONArray())
      path=="/api/catalog"||path=="/api/discovery"||path=="/api/search"||path=="/api/community"||path=="/api/karaoke"->payload("tracks" to JSONArray().put(song),"producers" to JSONArray())
      path=="/api/playlists"&&method=="POST"->{val p=payload("id" to "list-1","name" to body.optString("name"),"user_id" to "test-user","owner_name" to "테스트 리스너","tracks" to 0);lists.put(p);payload("id" to "list-1")}
      path=="/api/playlists"->payload("playlists" to JSONArray())
      path=="/api/playlists/list-1"->payload("playlist" to lists.getJSONObject(0),"tracks" to JSONArray())
      path=="/api/tracks/fixture/like"->{liked.set(method=="PUT");payload("ok" to true)}
      path=="/api/tracks/fixture/comments"->{if(method=="POST")comments.put(payload("id" to "comment-1","name" to "테스트 리스너","body" to body.optString("body"),"user_id" to "test-user"));payload("comments" to comments,"id" to "comment-1")}
      path=="/api/tracks/fixture/lyrics/line"->payload("line" to payload("text" to "밤길을 함께 걸어요","from" to 0,"until" to 30))
      path=="/api/tracks/fixture"->payload("track" to song)
      path=="/api/tracks/fixture/covers"->payload("covers" to JSONArray())
      path=="/api/playback/fixture"->payload("id" to "listen-1","src" to "/media/fixture/preview","duration" to if(adTest)3 else 30,"preview" to !adTest)
      path.startsWith("/api/listens/")->payload("ok" to true)
      else->{status=404;payload("error" to "unknown fixture path: "+path)}
     };response.toString().toByteArray()
    }
   }
   c.getOutputStream().write(("HTTP/1.1 $status OK\r\nContent-Type: $content\r\nContent-Length: ${result.size}\r\n"+cookie+"Connection: close\r\n\r\n").toByteArray())
   c.getOutputStream().write(result)
  }}catch(_:IOException){} } }catch(e:Exception){if(!server.isClosed)throw e} }
  screen=ActivityScenario.launch(Intent(context,MainActivity::class.java).putExtra("testOrigin","http://127.0.0.1:${server.localPort}"))
  screen.onActivity { it.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
  waitText("바로 듣기")
 }
 @After fun tearDown(){
  if(::screen.isInitialized)screen.close()
  context.stopService(Intent(context,PlaybackService::class.java))
  if(::server.isInitialized)server.close();workers.shutdownNow()
 }
 private fun waitText(text:String){ui.waitUntil(30_000){ui.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()}}
 private fun screenshot(name:String){
  ui.waitForIdle();InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(300)
  val bitmap=InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
  FileOutputStream(File(context.getExternalFilesDir(null),name)).use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
 }
 @Test fun nativeTabsRenderWithoutWebViewOrMicrophone(){
  screen.onActivity { a->
   fun hasWeb(v:View):Boolean = v is WebView || (v is ViewGroup && (0 until v.childCount).any { hasWeb(v.getChildAt(it)) })
   assertFalse(hasWeb(a.window.decorView))
  }
  screenshot("native-listen.png")
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasText("이번엔 내 목소리로"));screenshot("native-listen-shelves.png")
  ui.onNodeWithText("검색").performClick();waitText("발견하는 즐거움");screenshot("native-search.png")
  ui.onNodeWithText("부르기").performClick();waitText("목소리를 발견하는 곳");screenshot("native-sing.png")
  ui.onNodeWithText("커뮤니티").performClick();waitText("음악으로, 우리");ui.onNodeWithText("커버곡").assertExists();ui.onNodeWithText("제작곡").assertExists();screenshot("native-community.png")
  ui.onNodeWithText("보관함").performClick();waitText("로그인하고 시작하기");screenshot("native-library.png")
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun coverRankingDiscoveryAndCommentModeration(){
  ui.onNodeWithText("부르기").performClick();waitText("오늘의 인기 커버")
  screenshot("native-cover-discovery.png")
  ui.onNodeWithTag("rank-today").performClick();waitText("오늘 좋아요 3")
  ui.onNodeWithContentDescription("커버 좋아요").performClick()
  ui.waitUntil(10000){liked.get()}
  ui.onNodeWithText("가수",useUnmergedTree=true).performClick();waitText("팔로우")
  ui.onNodeWithText("팔로우").performClick();waitText("팔로잉");assertTrue(followed.get())
  screenshot("native-singer-rankings.png")
  ui.onNodeWithText("커버곡",useUnmergedTree=true).performClick();waitText("오늘 좋아요 3")
  for(label in listOf("이번 주","이달","명예의 전당")){ui.onAllNodesWithText(label,useUnmergedTree=true).onLast().performClick();waitText("$label 좋아요 3")}
  ui.onNodeWithTag("ranking-search").performTextInput("커버")
  ui.waitUntil(10000){requests.any{it.contains("q=%EC%BB%A4%EB%B2%84")}}
  screenshot("native-cover-rankings.png")
  ui.onNodeWithContentDescription("랭킹 닫기").performClick()
  ui.onNodeWithTag("sing-scroll").performScrollToNode(hasText("커버 랭킹 · 1"))
  ui.onNodeWithText("커버 랭킹 · 1").performClick();waitText("이 곡의 커버 랭킹")
  ui.waitUntil(10000){requests.any{it.contains("original_id=fixture")}}
  ui.onNode(hasContentDescription("밤의 산책 재생") and hasAnyAncestor(hasTestTag("ranking-scroll"))).performClick()
  ui.waitUntil(10000){requests.any{it=="/api/playback/cover-fixture"}}
  ui.onAllNodesWithText("밤의 산책").onLast().performClick()
  waitText("신고")
  ui.onNodeWithText("신고").performScrollTo().performClick()
  ui.onNodeWithText("도배·광고").performClick();ui.onNodeWithText("신고 접수").performClick();waitText("신고됨");assertTrue(reported.get())
  ui.onNodeWithText("삭제").performScrollTo().performClick()
  ui.onAllNodesWithText("삭제").onLast().performClick();waitText("삭제된 댓글입니다.")
  screenshot("native-cover-comments.png")
 }
 @Test fun playbackSurvivesBackgroundAndCloseRemovesBar(){
  ui.onNodeWithText("바로 듣기").performClick()
  ui.waitUntil(30_000){ui.onAllNodesWithContentDescription("일시정지").fetchSemanticsNodes().isNotEmpty()}
  val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,PlaybackService::class.java))).buildAsync()
  val control=future.get(10,TimeUnit.SECONDS)
  screen.moveToState(Lifecycle.State.CREATED);Thread.sleep(800)
  val playing=AtomicBoolean();InstrumentationRegistry.getInstrumentation().runOnMainSync{playing.set(control.isPlaying)};assertTrue("Foreground service must keep native audio playing",playing.get())
  screen.moveToState(Lifecycle.State.RESUMED)
  ui.onNodeWithContentDescription("재생바 닫기").performClick()
  ui.waitUntil(10000){ui.onAllNodesWithContentDescription("재생바 닫기").fetchSemanticsNodes().isEmpty()}
  InstrumentationRegistry.getInstrumentation().runOnMainSync{assertFalse(control.isPlaying)}
  InstrumentationRegistry.getInstrumentation().runOnMainSync{MediaController.releaseFuture(future)}
 }
 @Test fun emailLoginAndPlaylistCreationStayNative(){
  ui.onNodeWithText("보관함").performClick();ui.onNodeWithText("로그인하고 시작하기").performClick()
  ui.onNodeWithText("이메일").performTextInput("native@example.test")
  ui.onNodeWithText("비밀번호 · 12자 이상").performTextInput("fixture-password-123")
  ui.onNodeWithText("이메일로 로그인").performClick();waitText("테스트 리스너")
  ui.onNodeWithText("플레이리스트").performClick();ui.onNodeWithText("새로 만들기").performClick()
  ui.onNodeWithText("플레이리스트 이름").performTextInput("기분 좋은 오후")
  ui.onNodeWithText("저장").performClick();waitText("전체 재생")
  ui.onAllNodesWithText("기분 좋은 오후").onLast().assertExists()
  assertTrue(NativeSession.cookie(context).startsWith("aifect_session="))
  val raw=context.getSharedPreferences("native_session",0).getString("vault","")!!
  assertFalse(raw.contains("aifect_session"));assertFalse(raw.contains("fixture"))
 }
 @Test fun apiRejectsForeignHostAndPathTraversal(){
  val api=NativeApi(context)
  assertThrows(IllegalArgumentException::class.java){api.blocking("//evil.invalid/token")}
  assertThrows(IllegalArgumentException::class.java){api.blocking("/../private")}
 }
 @Test fun googleNonceCookieIsTemporaryAndScopedToAuthentication(){
  val api=NativeApi(context)
  api.blocking("/api/auth/google/nonce","POST",payload())
  api.blocking("/api/me")
  assertFalse(cookieHeaders["/api/me"].orEmpty().contains("aifect_google_oauth"))
  api.blocking("/api/auth/google/token","POST",payload("credential" to "fixture"))
  assertTrue(cookieHeaders["/api/auth/google/token"].orEmpty().contains("aifect_google_oauth=nonce-fixture"))
  assertEquals("aifect_session=google-fixture",NativeSession.cookie(context))
  api.blocking("/api/auth/google/token","POST",payload("credential" to "fixture"))
  assertFalse(cookieHeaders["/api/auth/google/token"].orEmpty().contains("aifect_google_oauth"))
  api.blocking("/api/auth/google/nonce","POST",payload());api.clearGoogleBinding()
  api.blocking("/api/auth/google/token","POST",payload("credential" to "fixture"))
  assertFalse(cookieHeaders["/api/auth/google/token"].orEmpty().contains("aifect_google_oauth"))
 }
 @Test fun discoverySearchAndCollectionDoNotReplaceHome(){
  ui.onNodeWithText("검색").performClick()
  ui.onNodeWithTag("global-search").performTextInput("밤")
  waitText("곡 · 1")
  assertTrue(requests.any{it.startsWith("/api/search?q=")})
  ui.onNodeWithContentDescription("검색 지우기").performClick()
  ui.onNodeWithText("기분을 올려줘").performClick()
  waitText("전체 재생")
  ui.waitUntil(10000){requests.any{it=="/api/discovery?mood=energy"}}
  ui.onNodeWithText("밤의 산책").assertExists()
  ui.onNodeWithContentDescription("목록 닫기").performClick()
  ui.onNodeWithText("듣기").performClick()
  ui.onNodeWithText("오늘의 새로운 발견").assertExists()
  ui.onNodeWithText("차트").performClick();waitText("AIFECT 인기곡")
  ui.onNodeWithText("최신곡").performClick();waitText("가장 최근에 공개된 제작곡부터 만나보세요")
  ui.onNodeWithText("밤의 산책").assertExists()
 }
 @Test fun fiveCompletedSongsPauseForOneAdAndResume(){
  val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,PlaybackService::class.java))).buildAsync()
  val control=future.get(10,TimeUnit.SECONDS)
  val shown=java.util.concurrent.atomic.AtomicInteger(0)
  var finish:(()->Unit)?=null
  screen.onActivity {
   SongAdBreaks.configure(context,"ad-test",0)
   SongAdBreaks.host=object:SongAdBreaks.Host{
    override fun ready()=true
    override fun show(onShown:()->Unit,onFinished:()->Unit):Boolean{
     shown.incrementAndGet();onShown();finish=onFinished;return true
    }
   }
   control.repeatMode=androidx.media3.common.Player.REPEAT_MODE_ONE
  }
  ui.onNodeWithText("바로 듣기").performClick()
  ui.waitUntil(35000){shown.get()==1}
  val paused=java.util.concurrent.atomic.AtomicBoolean(false)
  ui.waitUntil(5000){screen.onActivity{paused.set(!control.playWhenReady&&!control.isPlaying)};paused.get()}
  screen.onActivity{assertFalse("Music remains paused while the ad is open",control.playWhenReady);assertFalse(SongAdBreaks.due);finish!!()}
  val resumed=java.util.concurrent.atomic.AtomicBoolean(false)
  ui.waitUntil(5000){screen.onActivity{resumed.set(control.playWhenReady&&control.isPlaying)};resumed.get()}
  screen.onActivity{
   SongAdBreaks.configure(context,"ad-test",System.currentTimeMillis()/1000+3600)
   repeat(5){SongAdBreaks.completed(3000,3000,false)}
   assertFalse("Premium never accrues ad breaks",SongAdBreaks.due)
   control.stop();SongAdBreaks.host=null;MediaController.releaseFuture(future)
  }
 }
 private fun wav(seconds:Int=30):ByteArray{
  val size=seconds*16000*2;return ByteBuffer.allocate(44+size).order(ByteOrder.LITTLE_ENDIAN).apply{
   put("RIFF".toByteArray());putInt(36+size);put("WAVEfmt ".toByteArray());putInt(16);putShort(1);putShort(1);putInt(16000);putInt(32000);putShort(2);putShort(16);put("data".toByteArray());putInt(size)
  }.array()
 }
}
