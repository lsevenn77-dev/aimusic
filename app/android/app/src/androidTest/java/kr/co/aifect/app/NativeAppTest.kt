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
 private val context=InstrumentationRegistry.getInstrumentation().targetContext
 private lateinit var server:ServerSocket
 private lateinit var screen:ActivityScenario<MainActivity>
 private val workers=Executors.newCachedThreadPool()
 private val logged=AtomicBoolean(false)
 private val liked=AtomicBoolean(false)
 private val comments=JSONArray()
 private val lists=JSONArray()
 private val user=payload("id" to "test-user","name" to "테스트 리스너","email" to "native@example.test","provider" to "email")
 private val song=payload("id" to "fixture","title" to "밤의 산책","artist" to "AIFECT","producer" to "테스트 뮤지션","producer_id" to "person","duration" to 30,"genre" to "City Pop","kind" to "original","likes" to 0,"comments" to 0,"plays" to 0,"lyrics_mode" to "synced","lyrics_access" to "line","karaoke_ready" to true,"description" to "하루 끝에 함께 듣는 음악")
 @Before fun setUp(){
  assertTrue("Only the isolated test package is allowed",context.packageName.endsWith(".test"))
  NativeSession.put(context,"cookie","");NativeSession.put(context,"ticket","")
  server=ServerSocket(0,10,InetAddress.getByName("127.0.0.1"))
  val audio=wav()
  workers.execute { while(!server.isClosed)try {val socket=server.accept();workers.execute {try {socket.use { c->
   val input=c.getInputStream().buffered()
   fun header():String {val data=ByteArrayOutputStream();while(true){val byte=input.read();if(byte<0||byte==10)break;if(byte!=13)data.write(byte)};return data.toString("US-ASCII")}
   val request=header().split(" ");val method=request[0];val path=request[1].substringBefore("?");var length=0
   while(true){val line=header();if(line.isEmpty())break;if(line.startsWith("Content-Length:",true))length=line.substringAfter(":").trim().toInt()}
   val bytes=ByteArray(length);var offset=0;while(offset<length){val n=input.read(bytes,offset,length-offset);if(n<0)break;offset+=n}
   val body=runCatching{JSONObject(String(bytes,Charsets.UTF_8))}.getOrDefault(JSONObject())
   var cookie="";var status=200;var content="application/json"
   val result:ByteArray=when {
    path.startsWith("/media/")->{content="audio/wav";audio}
    else -> {
     val response=when {
      path=="/api/me"->payload("user" to if(logged.get())user else null,"membership" to JSONObject(),"providers" to JSONArray(),"emailEnabled" to true)
      path=="/api/auth/login"->{logged.set(true);cookie="Set-Cookie: aifect_session=fixture; Path=/; HttpOnly\r\n";payload("user" to user)}
      path=="/api/library"->payload("likes" to if(liked.get())JSONArray().put(song) else JSONArray(),"collections" to lists,"follows" to JSONArray())
      path=="/api/history"->payload("tracks" to JSONArray())
      path=="/api/catalog"||path=="/api/discovery"||path=="/api/search"||path=="/api/community"||path=="/api/karaoke"->payload("tracks" to JSONArray().put(song),"producers" to JSONArray())
      path=="/api/playlists"&&method=="POST"->{val p=payload("id" to "list-1","name" to body.optString("name"),"user_id" to "test-user","owner_name" to "테스트 리스너","tracks" to 0);lists.put(p);payload("id" to "list-1")}
      path=="/api/playlists"->payload("playlists" to JSONArray())
      path=="/api/playlists/list-1"->payload("playlist" to lists.getJSONObject(0),"tracks" to JSONArray())
      path=="/api/tracks/fixture/like"->{liked.set(method=="PUT");payload("ok" to true)}
      path=="/api/tracks/fixture/comments"->{if(method=="POST")comments.put(payload("id" to "comment-1","name" to "테스트 리스너","body" to body.optString("body"),"user_id" to "test-user"));payload("comments" to comments,"id" to "comment-1")}
      path=="/api/tracks/fixture/lyrics/line"->payload("line" to payload("text" to "밤길을 함께 걸어요","from" to 0,"until" to 30))
      path=="/api/tracks/fixture"->payload("track" to song)
      path=="/api/playback/fixture"->payload("id" to "listen-1","src" to "/media/fixture/preview","duration" to 30,"preview" to true)
      path.startsWith("/api/listens/")->payload("ok" to true)
      else->{status=404;payload("error" to "unknown fixture path: "+path)}
     };response.toString().toByteArray()
    }
   }
   c.getOutputStream().write(("HTTP/1.1 $status OK\r\nContent-Type: $content\r\nContent-Length: ${result.size}\r\n"+cookie+"Connection: close\r\n\r\n").toByteArray())
   c.getOutputStream().write(result)
  }}catch(_:IOException){} } }catch(e:Exception){if(!server.isClosed)throw e} }
  screen=ActivityScenario.launch(Intent(context,MainActivity::class.java).putExtra("testOrigin","http://127.0.0.1:${server.localPort}"))
  waitText("바로 듣기")
 }
 @After fun tearDown(){
  if(::screen.isInitialized)screen.close()
  context.stopService(Intent(context,PlaybackService::class.java))
  if(::server.isInitialized)server.close();workers.shutdownNow()
 }
 private fun waitText(text:String){ui.waitUntil(30_000){ui.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()}}
 private fun screenshot(name:String){
  val bitmap=InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
  FileOutputStream(File(context.getExternalFilesDir(null),name)).use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
 }
 @Test fun nativeTabsRenderWithoutWebViewOrMicrophone(){
  screen.onActivity { a->
   fun hasWeb(v:View):Boolean = v is WebView || (v is ViewGroup && (0 until v.childCount).any { hasWeb(v.getChildAt(it)) })
   assertFalse(hasWeb(a.window.decorView))
  }
  screenshot("native-listen.png")
  ui.onNodeWithText("부르기").performClick();waitText("여기가 나의 작은 무대");screenshot("native-sing.png")
  ui.onNodeWithText("커뮤니티").performClick();waitText("음악으로, 우리");ui.onNodeWithText("커버곡").assertExists();ui.onNodeWithText("제작곡").assertExists();screenshot("native-community.png")
  ui.onNodeWithText("내 음악").performClick();waitText("로그인하고 시작하기");screenshot("native-library.png")
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
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
  ui.onNodeWithText("내 음악").performClick();ui.onNodeWithText("로그인하고 시작하기").performClick()
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
 private fun wav():ByteArray{
  val size=30*16000*2;return ByteBuffer.allocate(44+size).order(ByteOrder.LITTLE_ENDIAN).apply{
   put("RIFF".toByteArray());putInt(36+size);put("WAVEfmt ".toByteArray());putInt(16);putShort(1);putShort(1);putInt(16000);putInt(32000);putShort(2);putShort(16);put("data".toByteArray());putInt(size)
  }.array()
 }
}
