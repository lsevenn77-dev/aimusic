package kr.co.aifect.app

import android.content.Intent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.junit.*
import org.junit.Assert.*
import java.io.*
import java.net.*
import java.util.concurrent.*

/** Gate real HTTP responses: measure ordering without a live account or timing guesses. */
class HomeStartupTest {
 @get:Rule val ui=createEmptyComposeRule()
 private val context=InstrumentationRegistry.getInstrumentation().targetContext
 private val workers=Executors.newCachedThreadPool()
 private val requested=CopyOnWriteArrayList<String>()
 private val firstScreen=CountDownLatch(1)
 private val optional=CountDownLatch(1)
 private lateinit var server:ServerSocket
 private lateinit var screen:ActivityScenario<MainActivity>
 private lateinit var model:MusicModel
 private val chart="/api/catalog?section=tracks&chart=top"
 private val latest="/api/catalog?section=tracks&limit=40"
 private fun launch(chartStatus:Int=200) {
  NativeSession.clear(context)
  context.getSharedPreferences("native_push",0).edit().putBoolean("permission_asked",true).commit()
  server=ServerSocket(0,32,InetAddress.getByName("127.0.0.1"))
  workers.execute { while(!server.isClosed)try {
   val socket=server.accept()
   workers.execute { try { socket.use { c->
    c.soTimeout=15000
    val input=c.getInputStream().buffered()
    fun line():String { val out=ByteArrayOutputStream();while(true){val b=input.read();if(b<0||b==10)break;if(b!=13)out.write(b)};return out.toString("UTF-8") }
    val request=line().split(' ');if(request.size<2)return@use
    var length=0;while(true){val h=line();if(h.isEmpty())break;if(h.startsWith("Content-Length:",true))length=h.substringAfter(':').trim().toInt()}
    repeat(length){input.read()}
    val path=request[1];requested.add(path)
    when(path){chart,latest->firstScreen.await(20,TimeUnit.SECONDS);"/api/me"->{};else->optional.await(20,TimeUnit.SECONDS)}
    val song=payload("id" to "startup-song","title" to "시작 화면 테스트곡","artist" to "테스트 아티스트","kind" to "original","status" to "published")
    val status=if(path==chart)chartStatus else 200
    val response=when {
     status!=200->payload("error" to "차트를 잠시 불러올 수 없어요.")
     path=="/api/me"->payload("user" to payload("id" to "startup-user","name" to "시작 테스트","profile_id" to "startup-profile"),"membership" to payload("premium_until" to 0),"providers" to JSONArray())
     path==chart||path==latest->payload("tracks" to JSONArray().put(song))
     else->payload("ok" to true)
    }.toString().toByteArray()
    c.getOutputStream().apply { write("HTTP/1.1 $status Response\r\nContent-Type: application/json\r\nContent-Length: ${response.size}\r\nConnection: close\r\n\r\n".toByteArray());write(response);flush() }
   }}catch(_:IOException){}catch(_:InterruptedException){Thread.currentThread().interrupt()} }
  }catch(_:IOException){} }
  screen=ActivityScenario.launch(Intent(context,MainActivity::class.java).putExtra("testOrigin","http://127.0.0.1:${server.localPort}"))
  screen.onActivity { model=ViewModelProvider(it)[MusicModel::class.java] }
  ui.waitUntil(8000){requested.contains(chart)&&requested.contains(latest)}
 }
 @After fun close(){
  firstScreen.countDown();optional.countDown()
  if(::screen.isInitialized)screen.close()
  context.stopService(Intent(context,PlaybackService::class.java))
  if(::server.isInitialized)server.close()
  workers.shutdownNow();NativeSession.clear(context)
 }
 @Test fun homeGetsConnectionsBeforeOptionalPrefetchAndRemainsTouchable(){
  launch()
  assertEquals(listOf("/api/me",chart,latest).toSet(),requested.toSet())
  assertTrue(model.loading)
  firstScreen.countDown()
  ui.waitUntil(8000){model.home.isNotEmpty()&&model.latest.isNotEmpty()&&!model.loading}
  ui.onNodeWithTag("home-featured-play").assertIsDisplayed()
  ui.waitUntil(5000){requested.any{it !in setOf("/api/me",chart,latest)}}
  assertTrue("Optional work is still held",model.refreshing)
  ui.onNodeWithTag("main-tab-3").performClick()
  assertEquals(3,model.tab)
  optional.countDown()
  ui.waitUntil(8000){!model.refreshing&&requested.contains("/api/library")}
 }
 @Test fun failedChartDoesNotBlockLatestOrLeaveSpinnerRunning(){
  launch(503);firstScreen.countDown()
  ui.waitUntil(8000){model.latest.isNotEmpty()&&!model.loading}
  assertTrue(model.home.isEmpty())
  ui.onNodeWithTag("home-featured-play").assertIsDisplayed()
  assertNotNull(model.error)
 }
 @Test fun accountChangeDiscardsInFlightHomeResponses(){
  launch()
  screen.onActivity{model.user=null}
  firstScreen.countDown()
  ui.waitUntil(8000){!model.refreshing}
  assertTrue(model.home.isEmpty());assertTrue(model.latest.isEmpty())
  assertFalse(requested.contains("/api/library"))
 }
}

