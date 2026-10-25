package kr.co.aifect.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso
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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Reproducible UI handoff: real product composables, loopback sample data, no live account. */
class DesignCaptureTest {
 @get:Rule val ui=createEmptyComposeRule()
 private val instrumentation=InstrumentationRegistry.getInstrumentation()
 private val context=instrumentation.targetContext
 private lateinit var screen:ActivityScenario<MainActivity>
 private lateinit var server:ServerSocket
 private lateinit var model:MusicModel
 private val workers=Executors.newCachedThreadPool()
 private val responses=ConcurrentHashMap<String,JSONObject>()
 private val responseStatuses=ConcurrentHashMap<String,Int>()
 private val requestBodies=ConcurrentHashMap<String,String>()
 private val uploadBytes=ConcurrentHashMap<String,Int>()
 private val requestUrls=java.util.concurrent.CopyOnWriteArrayList<String>()
 private val heldResponses=ConcurrentHashMap<String,CountDownLatch>()
 private val heldRequests=ConcurrentHashMap<String,CountDownLatch>()
 private val now=System.currentTimeMillis()/1000
 private val me=payload("id" to "design-user","profile_id" to "design-own","name" to "소리","display_name" to "소리(밤산책)","email" to "design@example.test","provider" to "email","image_version" to "sample-ocean")
 private fun arr(vararg values:Any)=JSONArray().apply{values.forEach{put(it)}}
 private fun person(id:String,name:String,user:String)=payload("id" to id,"name" to name,"display_name" to "$name(밤산책)","user_id" to user,"image_version" to "sample","bio" to "좋아하는 음악을 듣고, 나만의 목소리로 남겨요.","crew_name" to "밤산책")
 private val own=person("design-own","소리","design-user")
 private val peer=person("design-peer","하루","design-other")
 private val crew=payload("id" to "design-crew","name" to "밤산책","description" to "하루 끝, 음악으로 만나는 우리. 서로의 노래를 듣고 함께 불러요.","interests" to "City Pop · Ballad · R&B","image_version" to "sample","level" to 3,"xp" to 1280,"next_xp" to 2000,"capacity" to 50,"members" to 12,"recruiting" to 1)
 private val member=payload("crew_id" to "design-crew","user_id" to "design-user","role" to "member","joined_sequence" to 1,"joined" to now-86400,"muted" to 0)
 private fun track(id:String,title:String,cover:Boolean=false)=payload("id" to id,"title" to title,"artist" to "NOVA","artist_id" to "design-artist","producer" to if(cover)"하루" else "소리","producer_id" to if(cover)"design-peer" else "design-own","producer_image_version" to "sample","user_id" to if(cover)"design-other" else "design-user","kind" to if(cover)"cover" else "original","genre" to "City Pop","description" to "오늘의 마음을 음악으로 남겨요.","duration" to 180,"has_cover" to 1,"cover_version" to "sample","has_ai_artist" to if(cover)0 else 1,"plays" to 128,"likes" to 24,"comments" to 3,"covers" to 4,"status" to "published","created" to now-3600,"lyrics_mode" to "synced","lyrics_access" to "line","karaoke_ready" to !cover,"original_id" to "design-song")
 private val song=track("design-song","밤의 산책")
 private val second=track("design-ocean","푸른 순간")
 private val cover=track("design-cover","밤의 산책",true)
 private val duet=track("design-duet","우리의 멜로디",true).put("cover_mode","duet").put("duet_open",1).put("duet_part","first")
 private val playlist=payload("id" to "design-list","name" to "퇴근길에 듣는 음악","user_id" to "design-user","owner_name" to "소리","tracks" to 4,"is_public" to 1)
 private val rank=arr(payload("rank" to 1,"profile_id" to "design-peer","name" to "하루","image_version" to "sample","score" to 1320,"stars" to 20,"gold" to 1300),payload("rank" to 2,"profile_id" to "design-other","name" to "새벽","score" to 840,"stars" to 40,"gold" to 800))

 @Before fun launch(){
  assertTrue(context.packageName.endsWith(".test"))
  assertTrue("Capture is emulator-only",android.os.Build.HARDWARE in listOf("ranchu","goldfish"))
  NativeSession.put(context,"cookie","");NativeSession.put(context,"ticket","")
  responses["/api/me"]=payload("user" to me,"membership" to payload("plan" to "free"),"providers" to JSONArray(),"emailEnabled" to true)
  responses["/api/me/profile"]=payload("profile" to own,"followers" to arr(peer),"follower_count" to 24,"following_count" to 18)
  responses["/api/me/player"]=payload("player" to payload("level" to 3,"xp" to 180,"remaining" to 120,"progress" to 0.2),"inventory" to JSONArray(),"rewards" to JSONArray(),"rules" to JSONArray())
  responses["/api/library"]=payload("likes" to arr(song,cover),"collections" to arr(playlist),"follows" to arr(payload("target_id" to "design-peer","kind" to "producer","name" to "하루")))
  responses["/api/history"]=payload("tracks" to arr(second,song,cover))
  responses["/api/catalog"]=payload("tracks" to arr(song,second,cover,duet),"producers" to arr(peer,own),"artists" to arr(payload("id" to "design-artist","name" to "NOVA","image_version" to "sample")))
  responses["/api/discovery"]=responses.getValue("/api/catalog")
  responses["/api/search"]=responses.getValue("/api/catalog")
  responses["/api/community"]=payload("tracks" to arr(cover,duet,song),"producers" to arr(peer,own))
  responses["/api/karaoke"]=payload("tracks" to arr(song,second))
  responses["/api/play/latest"]=payload("tracks" to arr(second,song))
  responses["/api/voice/status"]=payload("enabled" to true)
  responses["/api/voice/public-rooms"]=payload("rooms" to arr(payload("id" to "design-room","title" to "퇴근길 음악 이야기","host_name" to "하루","member_count" to 3,"background" to "navy"),payload("id" to "design-room-2","title" to "밤의 라디오","host_name" to "새벽","member_count" to 2,"background" to "night")))
  responses["/api/voice/options"]=payload("crews" to arr(crew))
  responses["/api/community/rankings"]=payload("rows" to arr(payload("name" to "밤의 산책","detail" to "솔로 · 하루","score" to 12,"href" to "#song/design-song")))
  val dubbing=payload("id" to "design-dubbing","title" to "마지막 전철","ownerName" to "소리","owner_name" to "소리","genres" to arr("일상","감동"),"roleCount" to 2,"participants" to 1,"duration" to 60,"state" to "recruiting","visibility" to "public")
  responses["/api/dubbing/projects"]=payload("projects" to arr(dubbing),"nextOffset" to null)
  responses["/api/play/participate"]=payload("projects" to arr(dubbing),"nextOffset" to null)
  responses["/api/play/works"]=payload("works" to arr(cover,duet,JSONObject(dubbing.toString()).put("type","dubbing")),"nextOffset" to null)
  responses["/api/dubbing/config"]=payload("enabled" to true,"aiAvailable" to false,"recordingEnabled" to true,"soundPriceGold" to 50,"goldChargingEnabled" to false,"quota" to payload("limit" to 0,"remaining" to 0))
  responses["/api/duets"]=payload("tracks" to arr(duet))
  responses["/api/karaoke/design-song"]=payload("track" to song,"words" to JSONArray(),"mr" to "/media/sample/audio")
  responses["/api/duets/design-duet"]=payload("track" to song,"words" to JSONArray(),"mr" to "/media/sample/audio","duet" to payload("parent_id" to "design-duet","part" to "second","partner" to duet))
  responses["/api/studio"]=payload("producer" to own,"artists" to arr(payload("id" to "design-artist","name" to "NOVA","genre" to "City Pop")),"upload_quota" to payload("used" to 2,"limit" to 10,"remaining" to 8),"tracks" to arr(song,second,JSONObject(cover.toString()).put("user_id","design-user")))
  responses["/api/playlists"]=payload("playlists" to arr(playlist))
  responses["/api/playlists/design-list"]=payload("playlist" to playlist,"tracks" to arr(song,second,cover,duet))
  responses["/api/cover-rankings"]=payload("tracks" to arr(JSONObject(cover.toString()).put("rank",1).put("rank_likes",24)),"singers" to arr(peer))
  responses["/api/producers/design-peer"]=payload("profile" to peer,"tracks" to JSONArray(),"covers" to arr(cover,duet),"followers" to 128)
  responses["/api/producers/design-own"]=payload("profile" to own,"tracks" to arr(song,second),"covers" to arr(cover),"followers" to 24)
  responses["/api/producers/design-own?dashboard=1"]=payload("profile" to own,"tracks" to arr(song,second),"covers" to arr(cover,duet),"dubbings" to arr(dubbing),"followers" to 24,"following_count" to 18,"crew" to crew,"artists" to arr(payload("id" to "design-artist","name" to "NOVA")),"gallery" to arr(payload("url" to "/media/producer-gallery/design-photo?v=sample")))
  responses["/api/artists/design-artist"]=payload("profile" to payload("id" to "design-artist","name" to "NOVA","bio" to "도시의 밤과 푸른 순간을 노래하는 AI 아티스트","image_version" to "sample","user_id" to "design-user"),"tracks" to arr(song,second),"followers" to 86,"can_manage" to true,"gallery" to arr(payload("id" to "photo-1","url" to "/media/artist-gallery/photo-1?v=sample"),payload("id" to "photo-2","url" to "/media/artist-gallery/photo-2?v=sample")))
  for(t in listOf(song,second,cover,duet)){
   val id=t.getString("id")
   responses["/api/studio/tracks/$id"]=payload("profile" to JSONObject(t.toString()).put("ai_tool","Suno").put("lyrics","[00:00.000] 오늘의 마음을 담아요"),"karaoke" to payload("mr_ready" to true))
   responses["/api/tracks/$id"]=payload("track" to t)
   responses["/api/tracks/$id/comments"]=payload("comments" to arr(payload("id" to "sample-comment","name" to "하루","body" to "퇴근길에 계속 듣고 있어요!","user_id" to "design-other","created" to now-300)))
   responses["/api/tracks/$id/covers"]=payload("covers" to arr(cover))
   responses["/api/tracks/$id/lyrics/line"]=payload("line" to payload("text" to "오늘의 마음을 이 노래에 담아요","from" to 0,"until" to 180))
   responses["/api/playback/$id"]=payload("id" to "sample-listen-$id","src" to "/media/sample/audio","duration" to 180,"preview" to false,"bitrate_kbps" to 128)
   responses["/api/tracks/$id/gifts"]=payload("ranking" to rank)
  }
  responses["/api/producers/design-peer/gifts"]=payload("ranking" to rank)
  responses["/api/producers/design-own/gifts"]=payload("ranking" to rank)
  val gifts=JSONArray();listOf(Triple("balloon","풍선",5),Triple("clover","행운",30),Triple("heart","하트",50),Triple("cheer-star","응원별",100),Triple("rose","장미",200),Triple("coffee","커피",300),Triple("microphone","마이크",500),Triple("crown","왕관",777),Triple("superstar","스타",1000),Triple("moon","달빛",2000)).forEach{(id,name,cost)->gifts.put(payload("id" to id,"name" to name,"gold" to cost,"image" to "/assets/gifts/$id.webp"))}
  responses["/api/gold"]=payload("balance" to 500,"free" to payload("balance" to 8,"gift" to payload("id" to "star","name" to "응원별","image" to "/assets/gifts/star.webp"),"rewards" to arr(payload("kind" to "checkin","amount" to 3,"eligible" to true,"claimed" to false),payload("kind" to "listen","amount" to 1,"progress" to 2,"target" to 5,"eligible" to false,"claimed" to false))),"gifts" to gifts,"packs" to JSONArray())
  val silver=JSONArray();listOf(Triple("letter","손편지",2),Triple("sticker","반짝 스티커",5),Triple("bell","은종",10),Triple("ribbon","리본 배지",20),Triple("bouquet","작은 부케",50),Triple("photo-frame","포토액자",100),Triple("lantern","응원 등불",200),Triple("trophy","미니 트로피",500),Triple("music-box","달빛 오르골",1000)).forEach{(id,name,cost)->silver.put(payload("id" to "silver-$id","name" to name,"silver" to cost,"free" to true,"image" to "/assets/gifts/silver-$id.webp"))}
  responses.getValue("/api/gold").put("silver_gifts",silver).getJSONObject("free").put("balance",80).put("gift",payload("id" to "star","name" to "실버","image" to "/assets/gifts/silver-coin-v1.webp"))
  responses["/api/gold/balance"]=payload("balance" to 500,"silver_balance" to 80)
  responses["/api/notifications/summary"]=payload("unread" to 1)
  responses["/api/notifications"]=payload("unread" to 1,"next" to null,"items" to arr(payload("id" to "notice-1","actor_name" to "하루","actor_profile_id" to "design-peer","actor_image_version" to "sample","created" to now,"kind" to "gift","gift_name" to "손편지","quantity" to 5,"amount" to 10,"currency" to "silver","source_title" to "밤의 산책","target" to "design-cover","available" to 1,"read_at" to 0)))
  responses["/api/crews"]=payload("mine" to "design-crew","crews" to arr(crew,payload("id" to "other-crew","name" to "새벽 라디오","description" to "감성적인 목소리가 모이는 곳","level" to 2,"members" to 8,"capacity" to 20,"recruiting" to 1)),"tracks" to arr(cover,song))
  responses["/api/crews/design-crew"]=payload("crew" to crew,"membership" to member,"members" to arr(JSONObject(own.toString()).put("role","member"),JSONObject(peer.toString()).put("role","owner")),"tracks" to arr(cover,song),"rules" to payload("publishedTrack" to 1,"receivedGold" to 1,"dailyChat" to 10,"levels" to arr(payload("level" to 1,"xp" to 0),payload("level" to 3,"xp" to 1000),payload("level" to 4,"xp" to 2000))))
  responses["/api/crews/design-crew/settings"]=payload("muted" to false)
  responses["/api/crews/design-crew/messages"]=payload("membership" to member,"messages" to arr(payload("id" to "sample-crew-1","request_id" to "sample-crew-1","user_id" to "design-other","profile_id" to "design-peer","name" to "하루","role" to "owner","sequence" to 2,"body" to "이번 주엔 어떤 노래를 함께 부를까요?","created" to now-900,"kind" to "message"),payload("id" to "sample-crew-2","request_id" to "sample-crew-2","user_id" to "design-user","profile_id" to "design-own","name" to "소리","role" to "member","sequence" to 3,"body" to "밤의 산책 듀엣 어때요? 🎵","created" to now-600,"kind" to "message")),"has_more" to false,"joined_sequence" to 1,"latest_sequence" to 3)
  responses["/api/dm/summary"]=payload("unread" to 3,"crew" to payload("id" to "design-crew","name" to "밤산책","unread" to 2,"muted" to false))
  responses["/api/dm"]=payload("conversations" to arr(JSONObject(peer.toString()).put("last_message","다음에도 같이 불러요 🎵").put("updated",now-60).put("unread",1).put("muted",0),payload("id" to "design-friend","name" to "새벽","image_version" to "sample","last_message" to "새로 올린 커버 잘 들었어요!","updated" to now-1800,"unread" to 0,"muted" to 1)))
  responses["/api/dm/design-peer"]=payload("peer" to peer,"settings" to payload("muted" to 0),"messages" to arr(payload("id" to "sample-dm-1","sender_id" to "design-other","recipient_id" to "design-user","body" to "새 커버 분위기 정말 좋아요!","sequence" to 1,"created" to now-900,"read_at" to now-800),payload("id" to "sample-dm-2","sender_id" to "design-user","recipient_id" to "design-other","body" to "고마워요! 다음엔 듀엣도 함께해요.","sequence" to 2,"created" to now-600,"read_at" to now-500),payload("id" to "sample-dm-3","sender_id" to "design-other","recipient_id" to "design-user","body" to "다음에도 같이 불러요 🎵","sequence" to 3,"created" to now-60)),"has_more" to false)
  val photos=listOf("nova.png","ocean.png").map{instrumentation.context.assets.open("design/$it").use{stream->stream.readBytes()}}
  val giftsBytes=instrumentation.context.assets.list("design/gifts").orEmpty().associateWith{instrumentation.context.assets.open("design/gifts/$it").use{stream->stream.readBytes()}}
  val audio=ByteBuffer.allocate(44+48000*2*180).order(ByteOrder.LITTLE_ENDIAN).apply{put("RIFF".toByteArray());putInt(capacity()-8);put("WAVEfmt ".toByteArray());putInt(16);putShort(1);putShort(1);putInt(48000);putInt(96000);putShort(2);putShort(16);put("data".toByteArray());putInt(capacity()-44)}.array()
  server=ServerSocket(0,20,InetAddress.getByName("127.0.0.1"))
  workers.execute{while(!server.isClosed)try{val socket=server.accept();workers.execute{try{socket.use{c->
   val input=c.getInputStream().buffered()
   fun line():String{val bytes=ByteArrayOutputStream();while(true){val b=input.read();if(b<0||b==10)break;if(b!=13)bytes.write(b)};return bytes.toString("UTF-8")}
   val request=line().split(" ");if(request.size<2)return@use
   val path=request[1].substringBefore('?');var length=0
   while(true){val header=line();if(header.isEmpty())break;if(header.startsWith("Content-Length:",true))length=header.substringAfter(":").trim().toInt()}
   if(length>0){val body=ByteArray(length);var read=0;while(read<length){val n=input.read(body,read,length-read);if(n<0)break;read+=n};uploadBytes[path]=read;requestBodies[path]=String(body,0,read,Charsets.UTF_8)}
   requestUrls.add(request[1])
   heldResponses[path]?.let{gate->heldRequests[path]?.countDown();gate.await(20,TimeUnit.SECONDS)}
   val out=c.getOutputStream()
   if(path=="/api/chat/events"){
    out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".toByteArray());repeat(30){out.write("event: heartbeat\ndata: {}\n\n".toByteArray());out.flush();Thread.sleep(1000)}
   }else{
    val type:String;val bytes:ByteArray
    val webAsset=if(path.startsWith("/api/")||path.startsWith("/media/"))null else runCatching{instrumentation.context.assets.open("current-web/"+(if(path=="/")"index.html" else path.removePrefix("/"))).use{it.readBytes()}}.getOrNull()
    when{webAsset!=null->{type=when{path.endsWith(".js")->"application/javascript; charset=utf-8";path.endsWith(".css")->"text/css; charset=utf-8";path.endsWith(".svg")->"image/svg+xml";else->"text/html; charset=utf-8"};bytes=webAsset}
     path=="/media/sample/audio"->{type="audio/wav";bytes=audio}
     path.startsWith("/media/")->{type="image/png";bytes=photos[if(path.contains("ocean")||path.contains("own")||path.contains("photo-2")||path.contains("crew"))1 else 0]}
     path.startsWith("/assets/gifts/")->{type="image/webp";bytes=giftsBytes[path.substringAfterLast('/')]?:giftsBytes.values.first()}
     else->{type="application/json";bytes=(responses[request[1]]?:responses[path]?:payload("ok" to true)).toString().toByteArray()}}
    val status=responseStatuses[path]?:200
    val session=if(path=="/api/auth/mobile/exchange"&&status==200)"Set-Cookie: aifect_session=browser-fixture; Path=/; HttpOnly\r\n" else ""
    out.write("HTTP/1.1 $status Response\r\n${session}Content-Type: $type\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray());out.write(bytes)
   }
  }}catch(_:IOException){}catch(_:InterruptedException){Thread.currentThread().interrupt()}}}catch(_:IOException){} }
  screen=ActivityScenario.launch(Intent(context,MainActivity::class.java).putExtra("testOrigin","http://127.0.0.1:${server.localPort}"))
  screen.onActivity{model=ViewModelProvider(it)[MusicModel::class.java];it.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
  ui.waitUntil(30000){!model.loading&&model.user!=null&&model.home.isNotEmpty()}
 }
 @After fun close(){if(::screen.isInitialized)screen.close();context.stopService(Intent(context,PlaybackService::class.java));if(::server.isInitialized)server.close();workers.shutdownNow()}
 private fun ready(tag:String){ui.waitUntil(15000){ui.onAllNodesWithTag(tag,useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}}
 private fun text(value:String){ui.waitUntil(15000){ui.onAllNodesWithText(value).fetchSemanticsNodes().isNotEmpty()}}
 private fun act(block:(MusicModel)->Unit){screen.onActivity{block(model)};ui.waitForIdle()}
 private fun capture(name:String){ui.waitForIdle();instrumentation.waitForIdleSync();Thread.sleep(850);val image=instrumentation.uiAutomation.takeScreenshot();val dir=File(context.getExternalFilesDir(null),"design-2549");dir.mkdirs();FileOutputStream(File(dir,name+".png")).use{image.compress(Bitmap.CompressFormat.PNG,100,it)};image.recycle()}

 @Test fun homeKeepsTwoLineRowsAndFollowsItsTabOrder(){
  ready("home-featured-play");capture("home-257-01-top")
  val scroll=ui.onNodeWithTag("listen-scroll",useUnmergedTree=true)
  fun focus(tag:String){
   scroll.performScrollToNode(hasTestTag(tag))
   val offset=ui.onNodeWithTag(tag,useUnmergedTree=true).fetchSemanticsNode().boundsInRoot.top-scroll.fetchSemanticsNode().boundsInRoot.top
   scroll.performSemanticsAction(SemanticsActions.ScrollBy){it(0f,offset)}
  }
  val sections=listOf("recommended","charts","latest","discover","playlists")
  val encountered=linkedSetOf<String>()
  repeat(35){
   if(encountered.size<sections.size){
    val viewport=scroll.fetchSemanticsNode().boundsInRoot
    sections.mapNotNull{section->
     ui.onAllNodesWithTag("home-section-$section",useUnmergedTree=true).fetchSemanticsNodes().firstOrNull()
      ?.boundsInRoot?.takeIf{it.top>=viewport.top&&it.top<viewport.bottom}?.let{section to it.top}
    }.sortedBy{it.second}.forEach{encountered.add(it.first)}
    if(encountered.size<sections.size)scroll.performSemanticsAction(SemanticsActions.ScrollBy){it(0f,viewport.height*.28f)}
   }
  }
  assertEquals("Home must follow the same order as its four navigation tabs",sections,encountered.toList())
  focus("home-section-charts");capture("home-257-02-charts-latest")
  focus("home-section-discover");capture("home-257-03-discover-playlists")
  val longSong=Song(JSONObject(song.toString()).put("title","조금씩 멀어지고 있었나 봐 우리의 이야기를 끝까지 들어주세요").put("artist","아주 긴 이름의 가수와 함께 부르는 밤").put("plays",12840).put("likes",2410).put("comments",128))
  val original=model.home
  act{it.home=listOf(longSong)+original.drop(1)}
  scroll.performScrollToNode(hasTestTag("home-song-copy-design-song"))
  fun bounds(tag:String)=ui.onAllNodesWithTag(tag,useUnmergedTree=true).onFirst().fetchSemanticsNode().boundsInRoot
  for(tag in listOf("music-title-design-song","home-song-artist-design-song")){
   val layouts=mutableListOf<TextLayoutResult>()
   ui.onAllNodesWithTag(tag,useUnmergedTree=true).onFirst().performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(layouts)}
   assertEquals("Title and artist each occupy one line",1,layouts.single().lineCount)
  }
  val artist=bounds("home-song-artist-design-song");val stats=bounds("home-song-stats-design-song")
  val copy=bounds("home-song-copy-design-song")
  val art=ui.onNode(hasTestTag("stream-play-design-song") and hasAnyAncestor(hasTestTag("stream-song-design-song")),useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
  capture("home-257-04-long-row")
  assertTrue("Artist remains readable beside counts",artist.width>24*context.resources.displayMetrics.density)
  assertTrue("Counts cannot overlap the artist",stats.left>=artist.right)
  assertTrue("Counts stay on the artist line",kotlin.math.abs(artist.center.y-stats.center.y)<3*context.resources.displayMetrics.density)
  assertTrue("Two-line block fits the artwork: text=$copy art=$art",copy.height<=art.height+6*context.resources.displayMetrics.density)
  assertTrue("Metadata stays within the row",stats.right<=copy.right+1)
  ui.onNodeWithContentDescription("재생 12840",useUnmergedTree=true).assertExists()
  act{it.home=original};scroll.performScrollToIndex(0)
  ui.onNode(hasText("모두 보기") and hasAnyAncestor(hasTestTag("home-section-recommended"))).performClick()
  ready("collection-page")
  ui.onNode(hasTestTag("home-song-meta-design-song") and hasAnyAncestor(hasTestTag("collection-page")),useUnmergedTree=true).assertIsDisplayed()
  ui.onNodeWithContentDescription("밤의 산책 부르기").assertIsDisplayed()
  capture("home-258-recommended-list")
  ui.onNode(hasTestTag("stream-play-design-ocean") and hasAnyAncestor(hasTestTag("collection-page"))).performClick()
  ui.waitUntil(15000){model.playing&&model.current?.id=="design-ocean"}
  ui.onNodeWithTag("collection-back").performClick();ready("home-featured-play")
  ui.onAllNodesWithContentDescription("밤의 산책 더보기").onFirst().performClick();text("플레이리스트 담기")
  Espresso.pressBack()
  ui.onAllNodesWithTag("stream-play-design-song").onFirst().performClick()
  ui.waitUntil(15000){model.playing&&model.current?.id=="design-song"}
 }

 @Test fun currentCommunityStartsWithPublicRoomsAndFiltersWithoutWrites(){
  responses["/api/tracks/design-ocean"]=payload("track" to track("design-ocean","푸른 순간",true).put("producer_image_version","").put("original_id","rank-ocean").put("original_has_cover",1).put("original_cover_version","rank-fallback"))
  val rankedWork=payload("id" to "design-cover","name" to "밤의 산책","detail" to "솔로","score" to 47.8,"rank_change" to 2,"href" to "#song/design-cover")
  responses["/api/community/rankings"]=payload("rows" to arr(rankedWork,payload("id" to "design-ocean","name" to "푸른 순간","detail" to "솔로","score" to 35,"href" to "#song/design-ocean")))
  responses["/api/community/rankings?category=work&period=month&workKind=solo"]=payload("rows" to arr(JSONObject(rankedWork.toString()).put("rank_change",-1)))
  responses["/api/community/rankings?category=aiArtist&period=month&workKind=solo"]=payload("rows" to arr(payload("id" to "design-artist","name" to "NOVA","image_version" to "sample","detail" to "공개 원곡 2곡","score" to 72,"href" to "#artist/design-artist")))
  val rankedCrews=listOf("design-crew" to "밤산책","crew-zero" to "ZERO","crew-eclipse" to "ECLIPSE","crew-mine" to "NOVA","crew-prism" to "PRISM").mapIndexed{i,(id,name)->payload("id" to id,"name" to name,"rank" to i+1,"detail" to "${12+i*4}명 · 활동 참여 8명","rank_change" to if(i==0)2 else if(i==2)-1 else 0,"score" to 99-i,"href" to "#crew/$id")}
  responses["/api/community/rankings?category=crew&period=month&workKind=solo"]=payload("rows" to JSONArray(rankedCrews))
  responses["/api/crews?summary=1"]=payload("mine" to "crew-mine","crews" to JSONArray(rankedCrews.mapIndexed{i,c->JSONObject(c.toString()).put("level",15-i).put("members",12+i*4).put("image_version",if(i==0)"sample" else "")}))
  responses["/api/community/rankings?category=dubbing&period=month&workKind=solo"]=payload("rows" to JSONArray(),"message" to "공개된 완성 더빙이 모이면 표시해요.")
  ui.onNodeWithTag("main-tab-3").performClick();ready("voice-room-design-room")
  ui.onNodeWithTag("community-main-voice").assertIsSelected()
  ui.onNodeWithTag("voice-search").performTextInput("없는 방");text("검색 결과가 없어요")
  ui.onAllNodesWithTag("voice-room-design-room").assertCountEquals(0)
  Espresso.closeSoftKeyboard();ui.onNodeWithTag("community-main-rankings").performClick();ready("community-rank-work-design-cover")
  ui.waitUntil(15000){requestUrls.contains("/api/tracks/design-cover")};text("하루 · 솔로")
  ui.onNodeWithTag("ranking-category-relationship").assertDoesNotExist();ui.onNodeWithText("47점").assertDoesNotExist();ui.onNodeWithText("35점").assertDoesNotExist()
  ui.onNodeWithTag("community-movement-work-design-cover",useUnmergedTree=true).assertTextEquals("▲2")
  ui.onNodeWithTag("community-movement-work-design-ocean",useUnmergedTree=true).assertTextEquals("—")
  ui.onNodeWithContentDescription("이전 순위 기록 없음",useUnmergedTree=true).assertExists()
  val categoryHeights=listOf("work","aiArtist","crew","dubbing").map{ui.onNodeWithTag("ranking-category-$it").fetchSemanticsNode().boundsInRoot.height}
  assertTrue("Ranking category cards keep equal heights",categoryHeights.max()-categoryHeights.min()<1f)
  val artistLabel=mutableListOf<TextLayoutResult>();ui.onNodeWithTag("ranking-label-aiArtist",useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(artistLabel)}
  capture("community-261-label-check");assertEquals(2,artistLabel.single().lineCount);assertFalse("AI artist label overflow: size=${artistLabel.single().size} width=${artistLabel.single().didOverflowWidth} height=${artistLabel.single().didOverflowHeight}",artistLabel.single().hasVisualOverflow)
  ui.onNodeWithTag("ranking-art-design-cover",useUnmergedTree=true).assertExists()
  ui.waitUntil(15000){requestUrls.any{it=="/media/producer/design-peer?v=sample"}&&ui.onAllNodesWithTag("default-profile-artwork",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}
  assertFalse("A cover without a profile photo must not use the original album",requestUrls.any{it.startsWith("/media/rank-ocean/cover")})
  capture("community-261-work")
  ui.onNodeWithTag("community-rank-work-design-cover").performClick();ui.waitUntil(15000){model.detail?.id=="design-cover"};Espresso.pressBack();ready("ranking-period")
  ui.onNodeWithTag("ranking-period").performClick();ui.onNodeWithTag("ranking-period-month").performClick()
  ui.waitUntil(10000){requestUrls.any{it.startsWith("/api/community/rankings?")&&it.contains("period=month")}}
  ui.waitUntil(10000){ui.onAllNodesWithText("▼1").fetchSemanticsNodes().isNotEmpty()}
  ui.onNodeWithTag("ranking-category-aiArtist").performClick();ready("community-rank-aiArtist-design-artist")
  ui.onNodeWithTag("community-photo-artist-design-artist",useUnmergedTree=true).assertExists();ui.onNodeWithText("72점").assertDoesNotExist();capture("community-261-artists")
  ui.onNodeWithTag("community-rank-aiArtist-design-artist").performClick();ui.waitUntil(15000){model.profile?.optString("id")=="design-artist"};Espresso.pressBack();ready("ranking-category-crew")
  ui.onNodeWithTag("ranking-category-crew").performClick();ready("community-rank-crew-design-crew")
  ui.waitUntil(15000){requestUrls.any{it.startsWith("/media/crew/design-crew")}};ui.onNodeWithContentDescription("밤산책 사진",useUnmergedTree=true).assertExists();ui.onNodeWithText("99점").assertDoesNotExist()
  val first=ui.onNodeWithTag("community-rank-crew-design-crew").fetchSemanticsNode().boundsInRoot
  val second=ui.onNodeWithTag("community-rank-crew-crew-zero").fetchSemanticsNode().boundsInRoot
  val third=ui.onNodeWithTag("community-rank-crew-crew-eclipse").fetchSemanticsNode().boundsInRoot
  assertTrue("Podium order is 2, 1, 3",second.right<first.left&&first.right<third.left)
  assertTrue("Winner has the tallest card",first.top<second.top&&first.top<third.top)
  ui.onNodeWithTag("community-movement-crew-design-crew",useUnmergedTree=true).assertTextEquals("▲2")
  ui.onNodeWithTag("my-crew-ranking").assertExists();capture("community-263-crew-rank")
  ui.onNodeWithTag("community-rankings-scroll").performScrollToNode(hasTestTag("community-rank-crew-crew-mine"));ui.onNodeWithTag("community-rank-crew-crew-mine").assertExists()
  ui.onNodeWithTag("community-rankings-scroll").performScrollToNode(hasTestTag("crew-rank-podium"))
  ui.onNodeWithTag("community-rank-crew-design-crew").performClick();ui.waitUntil(15000){model.workspace?.route=="crew/design-crew"};act{it.workspace=null};ready("ranking-category-dubbing")
  ui.onNodeWithTag("ranking-category-dubbing").performClick();text("아직 집계된 순위가 없어요.")
  assertFalse(requestUrls.any{it.contains("category=relationship")});assertFalse(requestBodies.keys.any{it.startsWith("/api/voice/")})
 }
 @Test fun crewDiscoveryUsesPhotosAndFiltersAndOpensDetails(){
  val other=payload("id" to "other-crew","name" to "새벽 라디오","description" to "감성적인 목소리가 모이는 곳","image_version" to "sample-ocean","level" to 2,"xp" to 700,"members" to 8,"capacity" to 20,"recruiting" to 0,"interests" to "Jazz","created" to now)
  responses["/api/crews?summary=1"]=payload("mine" to "design-crew","crews" to arr(crew,other),"rankings" to arr(crew,other))
  ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithTag("community-main-crews").performClick();ready("crew-featured-design-crew")
  ui.waitUntil(15000){requestUrls.any{it.startsWith("/media/crew/design-crew")}};capture("community-261-crews-top")
  val scroll=ui.onNodeWithTag("crew-directory-scroll",useUnmergedTree=true)
  scroll.performScrollToNode(hasTestTag("crew-discovery-design-crew"))
  val offset=ui.onNodeWithTag("crew-discovery-design-crew",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot.top-scroll.fetchSemanticsNode().boundsInRoot.top
  scroll.performSemanticsAction(SemanticsActions.ScrollBy){it(0f,offset)}
  val one=ui.onNodeWithTag("crew-discovery-design-crew",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
  val two=ui.onNodeWithTag("crew-discovery-other-crew",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
  assertTrue(one.right<two.left);assertEquals(one.top,two.top,1f);assertTrue(one.width>125*context.resources.displayMetrics.density);capture("community-261-crews-grid")
  ui.onNodeWithTag("crew-discovery-design-crew").performClick();ui.waitUntil(15000){model.workspace?.route=="crew/design-crew"};act{it.workspace=null};ready("crew-directory-scroll")
  scroll.performScrollToNode(hasTestTag("crew-filters"));ui.onNodeWithTag("crew-filters").performClick();ready("crew-recruitment")
  ui.onNodeWithTag("crew-recruitment").performClick();ui.onNodeWithTag("crew-recruitment-open").performClick();ui.onNodeWithTag("crew-filter-apply").performClick()
  scroll.performScrollToNode(hasTestTag("crew-discovery-design-crew"));ui.onNodeWithTag("crew-discovery-other-crew").assertDoesNotExist()
  scroll.performScrollToNode(hasTestTag("crew-directory-search"));ui.onNodeWithTag("crew-directory-search").performTextInput("없는 크루");Espresso.closeSoftKeyboard()
  scroll.performScrollToNode(hasText("조건에 맞는 크루가 없어요"));ui.onNodeWithText("조건에 맞는 크루가 없어요").assertIsDisplayed()
  scroll.performScrollToNode(hasTestTag("crew-directory-search"));ui.onNodeWithTag("crew-directory-search").performTextClearance();Espresso.closeSoftKeyboard()
  scroll.performScrollToNode(hasTestTag("crew-directory-ranking"));capture("community-261-crews-ranking")
  assertFalse(requestBodies.containsKey("/api/crews"))
 }
 @Test fun currentPlaySeparatesRecordingDubbingAndFinishedWorks(){
  val invalid=JSONObject(cover.toString()).put("duet_open",1).put("cover_mode","solo")
  val completed=JSONObject(duet.toString()).put("id","completed-duet").put("duet_parent_id","parent")
  val closed=JSONObject(duet.toString()).put("id","closed-duet").put("duet_open",0)
  val ownDuet=JSONObject(duet.toString()).put("id","own-duet").put("user_id","design-user")
  responses["/api/duets"]=payload("tracks" to arr(duet,invalid,completed,closed,ownDuet))
  responses["/api/tracks/design-song/covers?mode=duet&sort=recent"]=payload("covers" to arr(
   payload("id" to "join1","duet_parent_id" to "design-duet","duet_open" to 0,"user_id" to "user-a"),
   payload("id" to "join2","duet_parent_id" to "design-duet","duet_open" to 0,"user_id" to "user-a"),
   payload("id" to "join3","duet_parent_id" to "design-duet","duet_open" to 0,"user_id" to "user-b"),
   payload("id" to "join4","duet_parent_id" to "another-invitation","duet_open" to 0,"user_id" to "user-c")),"counts" to payload("duet" to 4))
  ready("home-featured-play");capture("revision-00-home")
  ui.onNodeWithTag("main-tab-2").performClick();ready("current-sing-design-song")
  ui.onNodeWithTag("current-sing-design-song").assertIsDisplayed()
  ui.onNodeWithTag("current-sing-design-ocean").assertIsDisplayed()
  capture("play-263-songs")
  ui.onNodeWithTag("play-section-duets").performClick();ready("current-sing-design-duet");text("2명 참여")
  for(id in listOf("design-cover","completed-duet","closed-duet","own-duet"))ui.onNodeWithTag("current-track-$id").assertDoesNotExist()
  val row=ui.onNodeWithTag("current-track-design-duet").fetchSemanticsNode().boundsInRoot
  assertTrue("Duet rows stay compact",row.height/context.resources.displayMetrics.density<=96f)
  capture("play-263-duets")
  val monitor=instrumentation.addMonitor("kr.co.aifect.app.karaoke.KaraokeActivity",null,false)
  try{ui.onNodeWithTag("current-sing-design-duet").performClick();val room=instrumentation.waitForMonitorWithTimeout(monitor,15000);assertNotNull(room)
   assertEquals("design-duet",room.intent.getStringExtra("duetParentId"));assertEquals("design-song",room.intent.getStringExtra("trackId"));room.runOnUiThread{room.finish()}
  }finally{instrumentation.removeMonitor(monitor)}
  ready("play-main-dubbing")
  ui.onNodeWithTag("play-main-dubbing").performClick();ready("dubbing-project-design-dubbing")
  capture("current-03-play-dubbing")
  ui.onNodeWithTag("play-section-join").performClick();ui.waitUntil(10000){requestUrls.any{it.startsWith("/api/play/participate")}}
  ui.onNodeWithTag("play-section-mine").performClick();ui.waitUntil(10000){requestUrls.any{it.startsWith("/api/dubbing/projects?tab=mine")}}
  ui.onNodeWithTag("play-main-browse").performClick();ready("play-kind-picker")
  ui.onNodeWithTag("play-section-popular").performClick();ui.onNodeWithTag("play-kind-picker").performClick();ui.onNodeWithTag("play-kind-duet").performClick()
  ui.waitUntil(10000){requestUrls.any{it.startsWith("/api/play/works?")&&it.contains("tab=popular")&&it.contains("type=duet")}}
  assertFalse(requestBodies.keys.any{it.startsWith("/api/dubbing/")})
 }
 @Test fun polish264MyGridInventoryWalletAndCachedGallery(){
  val dashboard=responses.getValue("/api/producers/design-own?dashboard=1")
  dashboard.getJSONObject("profile").put("public_number",1)
  dashboard.put("artists",arr(payload("id" to "design-artist","name" to "NOVA","image_version" to "sample"),payload("id" to "design-artist-2","name" to "ARIA","image_version" to "sample-ocean")))
  val inventory=JSONArray();repeat(5){inventory.put(payload("id" to "frame-$it","item_key" to "crew-outline","name" to "프레임 ${it+1}","owned" to true,"available" to true,"equipped" to (it==0),"description" to "숨길 설명"))}
  responses["/api/me/player"]=payload("inventory" to inventory,"rewards" to arr(payload("id" to "locked","name" to "미보유 보상","owned" to false)),"player" to payload("level" to 3))
  for(currency in listOf("silver","gold"))responses["/api/gold/history?currency=$currency"]=payload("currency" to currency,"earned" to arr(payload("kind" to if(currency=="silver")"checkin" else "purchase","amount" to 100,"created" to now)),"spent" to arr(payload("kind" to "gift","title" to "하트 선물","amount" to 20,"created" to now-10)))
  act{it.refreshMyDashboard(true)};ui.waitUntil(15000){!model.ownDashboardLoading&&model.ownDashboard?.optJSONArray("artists")?.length()==2}
  act{it.selectTab(6)};ready("current-my");ui.onAllNodesWithText("ID 1",substring=true).assertCountEquals(0)
  val scroll=ui.onNodeWithTag("current-my")
  scroll.performScrollToNode(hasTestTag("my-artist-design-artist"));ui.onNodeWithContentDescription("NOVA 아티스트 사진").assertIsDisplayed()
  val first=ui.onNodeWithTag("my-artist-design-artist").fetchSemanticsNode().boundsInRoot
  val second=ui.onNodeWithTag("my-artist-design-artist-2").fetchSemanticsNode().boundsInRoot
  assertEquals(first.top,second.top,.5f);assertEquals(first.width,second.width,.5f);assertTrue(first.right<second.left)
  capture("polish-264-artists")
  scroll.performScrollToNode(hasTestTag("my-section-activity"));ui.onNodeWithTag("my-section-activity").performClick()
  scroll.performScrollToNode(hasTestTag("wallet-silver"));capture("polish-264-wallet")
  for(currency in listOf("silver","gold")){
   ui.onNodeWithTag("wallet-$currency").performClick();ready("wallet-history-$currency");text(if(currency=="silver")"출석 보상" else "골드 충전")
   ui.onNodeWithText("최근 사용").performClick();text("하트 선물");capture("polish-264-$currency-history");Espresso.pressBack()
  }
  scroll.performScrollToNode(hasTestTag("music-shortcut-보관함"))
  val boxes=listOf("보관함","좋아요","최근 감상","플레이리스트").map{ui.onNodeWithTag("music-shortcut-$it").fetchSemanticsNode().boundsInRoot}
  boxes.forEach{assertEquals(boxes[0].height,it.height,.5f);assertEquals(boxes[0].width,it.width,.5f)}
  capture("polish-264-library")
  act{it.showInventory=true};ready("owned-inventory");text("프레임 1")
  ui.onAllNodesWithText("달성할 수 있는 보상").assertCountEquals(0);ui.onAllNodesWithText("숨길 설명").assertCountEquals(0);ui.onAllNodesWithText("미보유 보상").assertCountEquals(0)
  val items=(0..2).map{ui.onNodeWithTag("inventory-item-frame-$it").fetchSemanticsNode().boundsInRoot};items.forEach{assertEquals(items[0].top,it.top,.5f);assertEquals(items[0].width,it.width,1.1f)}
  capture("polish-264-inventory");Espresso.pressBack()
  act{it.selectTab(0)};val gate=CountDownLatch(1);heldResponses["/api/producers/design-own"]=gate
  try{act{it.selectTab(6)};ui.onNodeWithTag("current-my").performScrollToIndex(0);ui.onNodeWithContentDescription("갤러리 사진").assertExists()}finally{gate.countDown();heldResponses.clear()}
 }
 @Test fun polish264CoverActionsLatestAndOwnDeletion(){
  act{it.openSong(Song(duet))};ready("song-detail-duet")
  ui.onNodeWithTag("song-detail-duet").performScrollTo()
  val listen=ui.onNodeWithTag("song-detail-listen").fetchSemanticsNode().boundsInRoot
  val join=ui.onNodeWithTag("song-detail-duet").fetchSemanticsNode().boundsInRoot
  assertTrue("Listen and join cannot overlap",listen.bottom<=join.top);capture("polish-264-cover-detail")
  ui.onNodeWithTag("song-detail-delete").assertDoesNotExist();Espresso.pressBack()
  act{it.selectTab(2);it.playMode="song";it.playSection="latest"};ui.waitUntil(15000){requestUrls.contains("/api/community?kind=cover")}
  ui.onNodeWithTag("current-play").assertExists();assertFalse(model.playSection!="latest")
  act{it.openSong(Song(song))};ready("song-detail-delete");ui.onNodeWithTag("song-detail-delete").performScrollTo().performClick()
  ui.onNodeWithText("취소").performClick();assertFalse(requestUrls.contains("/api/uploads/design-song"))
  responseStatuses["/api/uploads/design-song"]=403;responses["/api/uploads/design-song"]=payload("error" to "삭제 권한 확인")
  ui.onNodeWithTag("song-detail-delete").performClick();ui.onNodeWithTag("delete-track-confirm").performClick();ui.waitUntil(15000){!model.busy&&requestUrls.contains("/api/uploads/design-song")};assertNotNull(model.detail)
  responseStatuses["/api/uploads/design-song"]=200;responses["/api/uploads/design-song"]=payload("ok" to true)
  responses["/api/producers/design-own?dashboard=1"]?.put("tracks",arr(second));responses["/api/me/profile"]?.put("tracks",arr(second))
  ui.onNodeWithTag("delete-track-confirm").performClick();ui.waitUntil(15000){model.detail==null&&model.pendingTrackDelete==null};assertFalse(model.home.any{it.id=="design-song"})
  val ownedCover=JSONObject(cover.toString()).put("user_id","design-user");responses["/api/tracks/design-cover"]=payload("track" to ownedCover)
  act{it.openSong(Song(ownedCover))};ready("song-detail-delete");ui.onNodeWithTag("song-detail-delete").performScrollTo().performClick();ui.onNodeWithTag("delete-track-confirm").performClick()
  ui.waitUntil(15000){model.detail==null&&model.pendingTrackDelete==null};assertTrue(requestUrls.contains("/api/uploads/design-cover"))
 }
 @Test fun currentMyRetainsProfileAndGalleryWhenChangingSections(){
  ui.onNodeWithTag("main-tab-6").performClick();ready("my-section-works")
  ui.waitUntil(15000){requestUrls.contains("/api/producers/design-own?dashboard=1")}
  capture("revision-04-my-top")
  ui.onNodeWithText("프로필 수정").assertIsDisplayed()
  ui.onNodeWithText("스튜디오",useUnmergedTree=true).assertIsDisplayed()
  ui.onNodeWithTag("current-my").performScrollToNode(hasTestTag("my-section-activity"))
  capture("current-04-my-works")
  ui.onNodeWithTag("my-section-activity").performClick()
  ui.onNodeWithTag("current-my").performScrollToNode(hasText("내 활동") and !hasTestTag("my-section-activity"))
  capture("current-05-my-activity")
  ui.onNodeWithTag("current-my").performScrollToIndex(0)
  ui.onNodeWithText("프로필 수정").assertIsDisplayed()
  ui.onNodeWithContentDescription("갤러리 사진").assertExists()
  ui.onAllNodesWithText("사진 올리기").assertCountEquals(0)
 }
 @Test fun currentDubbingFormUsesNativeWorkflowWithoutMicrophone(){
  ui.onNodeWithTag("main-tab-2").performClick();ui.onNodeWithTag("play-main-dubbing").performClick();ready("dubbing-create")
  val before=ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)
  ui.onNodeWithTag("dubbing-create").performClick();ready("native-dubbing-create")
  ui.waitUntil(15000){requestUrls.contains("/api/dubbing/config")}
  capture("current-06-dubbing-create")
  assertEquals(before,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
  assertFalse(requestBodies.keys.any{it.startsWith("/api/dubbing/")})
 }

 @Test fun browserGoogleLoginKeepsVerifierUntilApproved(){
  val ticket="browser-test-ticket"
  responses["/api/auth/mobile/start"]=payload("ticket" to ticket,"url" to Endpoint.url("/api/auth/mobile/browser?ticket=$ticket"))
  responses["/api/auth/mobile/exchange"]=payload("error" to "브라우저에서 로그인을 마쳐주세요.")
  responseStatuses["/api/auth/mobile/exchange"]=409
  var opened=""
  act{it.user=null;it.showLogin=true;it.providers=listOf("google");it.socialLogin("google"){url->opened=url}}
  ui.waitUntil(15000){!model.busy&&opened.isNotBlank()}
  val uri=android.net.Uri.parse(opened)
  assertEquals("google",uri.getQueryParameter("provider"));assertEquals(ticket,uri.getQueryParameter("ticket"))
  val verifier=NativeSession.get(context,"verifier")
  assertTrue(verifier.length>=43);assertFalse(opened.contains(verifier))
  val challenge=java.security.MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()).joinToString(""){"%02x".format(it)}
  assertEquals(challenge,JSONObject(requestBodies.getValue("/api/auth/mobile/start")).getString("challenge"))
  ready("browser-login-check");phaseCapture("31-browser-login")
  act{it.finishLogin(android.net.Uri.parse("kr.co.aifect.app://auth?ticket=wrong"))}
  assertFalse(requestUrls.contains("/api/auth/mobile/exchange"))
  ui.onNodeWithTag("browser-login-check").performScrollTo().performClick()
  ui.waitUntil(15000){model.notice!=null||ui.onAllNodesWithText("브라우저에서 로그인을 마친 뒤 돌아와주세요.").fetchSemanticsNodes().isNotEmpty()}
  assertNull(model.user);assertTrue(model.browserLoginPending);assertEquals(verifier,NativeSession.get(context,"verifier"))
  responses["/api/auth/mobile/exchange"]=payload("user" to me);responseStatuses["/api/auth/mobile/exchange"]=200
  act{it.finishLogin(android.net.Uri.parse("kr.co.aifect.app://auth?ticket=$ticket"))}
  ui.waitUntil(15000){model.user!=null&&!model.showLogin}
  assertEquals("aifect_session=browser-fixture",NativeSession.cookie(context))
  assertEquals("",NativeSession.get(context,"ticket"));assertEquals("",NativeSession.get(context,"verifier"));assertFalse(model.browserLoginPending)
 }
 @Test fun browserLoginRejectsForeignDestination(){
  NativeSession.put(context,"verifier","")
  responses["/api/auth/mobile/start"]=payload("ticket" to "safe-ticket","url" to "https://untrusted.invalid/api/auth/mobile/browser?ticket=safe-ticket")
  var opened=false
  act{it.socialLogin("google"){opened=true}}
  ui.waitUntil(15000){!model.busy}
  assertFalse(opened);assertFalse(model.browserLoginPending);assertEquals("",NativeSession.get(context,"ticket"));assertEquals("",NativeSession.get(context,"verifier"))
 }
 @Test fun communityBoardKeepsTrackActionsAndDuetContext(){
  responses["/api/community?kind=cover&cover_mode=duet"]=payload("tracks" to arr(duet))
  act{it.selectTab(3)};ready("feed-artwork-design-cover")
  ui.onNodeWithTag("community-tab-추천").assertIsDisplayed();ui.onNodeWithTag("community-tab-팔로잉").assertIsDisplayed();ui.onNodeWithTag("community-tab-크루").assertIsDisplayed()
  ui.onNodeWithTag("feed-play-design-cover").performClick();ui.waitUntil(15000){model.current?.id=="design-cover"&&model.playing}
  phaseCapture("32-community-feed")
  ui.onNodeWithTag("music-community-feed").performScrollToNode(hasContentDescription("밤의 산책 더보기"))
  ui.onAllNodesWithContentDescription("밤의 산책 더보기").onFirst().performClick();ui.onNodeWithText("플레이리스트 담기").performClick()
  assertEquals("design-cover",model.playlistTarget?.id);Espresso.pressBack()
  ui.onNodeWithTag("community-tab-팔로잉").performClick();ui.waitUntil(15000){requestUrls.contains("/api/community?following=1")&&!model.feedLoading}
  ui.onNodeWithTag("community-filter").performClick();ui.onNodeWithText("듀엣",useUnmergedTree=true).performClick()
  ready("feed-sing-design-duet");phaseCapture("33-community-duet")
  val monitor=instrumentation.addMonitor(kr.co.aifect.app.karaoke.KaraokeActivity::class.java.name,null,false)
  try{
   ui.onNodeWithTag("music-community-feed").performScrollToNode(hasTestTag("feed-sing-design-duet"));ui.onNodeWithTag("feed-sing-design-duet").performClick()
   val room=instrumentation.waitForMonitorWithTimeout(monitor,15000);assertNotNull(room)
   assertEquals("design-duet",room.intent.getStringExtra("duetParentId"));assertEquals("design-song",room.intent.getStringExtra("trackId"));assertEquals("duet",room.intent.getStringExtra("coverMode"))
   instrumentation.runOnMainSync{room.finish()}
  }finally{instrumentation.removeMonitor(monitor)}
 }
 @Test fun messageBoardFiltersSearchAndStartsRealConversations(){
  responses.getValue("/api/dm").put("crew",JSONObject(crew.toString()).put("unread",2)).put("unread",3)
  act{it.play(Song(song),listOf(Song(song)));it.selectTab(5)}
  ready("dm-conversation-design-peer");ready("inbox-crew");phaseCapture("34-message-inbox")
  ui.onNodeWithTag("inbox-filter-안 읽음").performClick();ui.onNodeWithTag("dm-conversation-design-friend").assertDoesNotExist()
  ui.onNodeWithTag("inbox-search-toggle").performClick();ui.onNodeWithTag("inbox-search").performTextInput("하루");Espresso.closeSoftKeyboard()
  ui.onNodeWithTag("inbox-crew").assertDoesNotExist();ui.onNodeWithTag("dm-conversation-design-peer").performClick();ready("dm-composer")
  ui.onNodeWithTag("dm-input").performTextInput("보관할 초안");Espresso.closeSoftKeyboard();ui.onNodeWithTag("dm-back").performClick()
  ready("inbox-search");ui.onNodeWithTag("inbox-search").assertTextContains("하루");ui.onNodeWithTag("inbox-filter-안 읽음").assertIsSelected()
  ui.onNodeWithTag("inbox-search-toggle").performClick();ui.onNodeWithTag("inbox-filter-크루").performClick();ready("inbox-crew");ui.onNodeWithTag("dm-conversation-design-peer").assertDoesNotExist();phaseCapture("35-message-crews")
  ui.onNodeWithTag("inbox-crew").performClick();ready("crew-chat-input");Espresso.pressBack();ready("inbox-filter-크루");ui.onNodeWithTag("inbox-filter-크루").assertIsSelected()
  ui.onNodeWithTag("inbox-filter-알림").performClick();ui.onNodeWithText("알림 기록").assertIsDisplayed()
  ui.onNodeWithTag("inbox-compose").performClick();ready("new-conversation-design-peer");phaseCapture("36-message-new")
  ui.onNodeWithTag("new-conversation-search").performTextInput("하루");ui.waitUntil(15000){requestUrls.any{it.startsWith("/api/search?q=")}};Espresso.closeSoftKeyboard()
  ui.onNodeWithTag("new-conversation-design-own").assertDoesNotExist();ui.onNodeWithTag("new-conversation-design-peer").performClick();ready("dm-input")
  ui.onNodeWithTag("dm-input").assertTextContains("보관할 초안");assertEquals("design-peer",model.messagePeer);assertEquals("design-song",model.current?.id)
 }

 @Test fun creatorStudioOpensFromMyAccountAndSavesOriginal(){
  ui.onNodeWithTag("main-tab-6").performClick();ready("my-music-page")
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasText("창작자 스튜디오"))
  ui.onNodeWithText("창작자 스튜디오").performClick();ready("creator-studio")
  ui.waitUntil(15000){!model.studioBusy};capture("60-native-studio")
  ui.onNodeWithTag("creator-studio").performScrollToNode(hasTestTag("studio-edit-design-song"))
  ui.onNodeWithTag("studio-edit-design-song").performClick();ready("studio-title")
  ui.onNodeWithTag("studio-title").performTextReplacement("수정한 밤의 산책")
  Espresso.closeSoftKeyboard();ui.onNodeWithTag("studio-cover-picker").assertExists();capture("61-studio-edit")
  ui.onNodeWithTag("studio-description").performScrollTo().performTextReplacement("앱에서 수정한 소개")
  Espresso.closeSoftKeyboard();ui.onNodeWithTag("studio-save").performScrollTo().performClick();ready("creator-studio")
  val body=JSONObject(requestBodies.getValue("/api/studio/tracks/design-song"))
  assertEquals("수정한 밤의 산책",body.getString("title"));assertEquals("앱에서 수정한 소개",body.getString("description"))
  assertEquals("design-artist",body.getString("artist_id"));assertEquals("[00:00.000] 오늘의 마음을 담아요",body.getString("lyrics"))
  Espresso.pressBack();assertEquals(6,model.tab)
  ui.onNodeWithTag("account-menu").performClick();ready("account-actions")
  ui.onNodeWithTag("account-창작자 스튜디오").performScrollTo().performClick();ready("creator-studio")
 }

 @Test fun studioCoverOnlyEditsDescriptionAndOwnedImageCanUpload(){
  act{it.openStudio()};ready("creator-studio");ui.waitUntil(15000){!model.studioBusy}
  ui.onNodeWithTag("creator-studio").performScrollToNode(hasTestTag("studio-edit-design-cover"))
  ui.onNodeWithTag("studio-edit-design-cover").performClick();ready("studio-description")
  ui.onNodeWithTag("studio-title").assertDoesNotExist();ui.onNodeWithTag("studio-cover-picker").assertDoesNotExist()
  ui.onNodeWithTag("studio-description").performTextReplacement("나의 커버 소개");Espresso.closeSoftKeyboard()
  ui.onNodeWithTag("studio-save").performScrollTo().performClick();ready("creator-studio")
  val body=JSONObject(requestBodies.getValue("/api/studio/tracks/design-cover"));assertEquals(1,body.length());assertEquals("나의 커버 소개",body.getString("description"))
  val file=File(context.cacheDir,"studio-test.png")
  try{
   instrumentation.context.assets.open("design/nova.png").use{input->file.outputStream().use{input.copyTo(it)}}
   kotlinx.coroutines.runBlocking{model.api.uploadWebp("/api/studio/tracks/design-song/image",android.net.Uri.fromFile(file))}
   assertTrue(uploadBytes.getValue("/api/studio/tracks/design-song/image")>100)
  }finally{file.delete()}
 }

 @Test fun crewInvitationOpensDmAndItsCrew(){
  responses.getValue("/api/producers/design-peer").put("invite_crew",crew)
  responses["/api/dm/design-peer/crew-invite"]=payload("peer_id" to "design-peer","message_id" to "invite-1")
  responses.getValue("/api/dm/design-peer").getJSONArray("messages").put(payload("id" to "invite-1","sender_id" to "design-user","recipient_id" to "design-other","body" to "밤산책 크루에 초대해요.","crew_invite_id" to "design-crew","sequence" to 4,"created" to now))
  act{it.openProfile("design-peer","producer")};ready("profile-crew-invite")
  ui.onNodeWithTag("profile-crew-invite").performScrollTo().performClick();ready("dm-crew-invite-invite-1")
  val body=JSONObject(requestBodies.getValue("/api/dm/design-peer/crew-invite"));assertEquals("design-crew",body.getString("crew_id"));assertTrue(body.getString("request_id").isNotBlank())
  capture("62-crew-invitation");ui.onNodeWithTag("dm-crew-invite-invite-1").performClick()
  ui.waitUntil(15000){model.tab==3&&model.communityCrewTarget=="design-crew"};assertFalse(model.showMessages)
 }

 @Test fun allMenuDestinationsRemainInsideApp(){
  fun go(label:String){ui.onNodeWithTag("navigation-menu").performClick();ready("all-navigation");ui.onNodeWithTag("menu-$label").performScrollTo().performClick()}
  go("공개 플레이리스트");ready("music-directory");text("퇴근길에 듣는 음악")
  go("AI 아티스트");ready("music-directory");text("NOVA")
  go("인기 차트");ready("chart-popular")
  go("기분 · 장르별 발견");ready("search-scroll");capture("63-native-discover")
  go("내 보관함");ready("library-scroll")
  go("창작자 스튜디오");ready("creator-studio")
  ui.onNodeWithTag("navigation-menu").performClick();ready("all-navigation");capture("64-all-menu")
 }

 @Test fun studioUploadUsesPickerBytesAndSingleDraft(){
  val file=File(context.cacheDir,"original-test.wav").apply{writeBytes(ByteArray(1024){it.toByte()})}
  val uri=androidx.core.content.FileProvider.getUriForFile(context,context.packageName+".fileprovider",file)
  val result=android.app.Instrumentation.ActivityResult(android.app.Activity.RESULT_OK,Intent().setData(uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
  val monitor=object:android.app.Instrumentation.ActivityMonitor(){
   override fun onStartActivity(intent:Intent):android.app.Instrumentation.ActivityResult?=if(intent.action==Intent.ACTION_OPEN_DOCUMENT)result else null
  }
  instrumentation.addMonitor(monitor)
  responses["/api/uploads"]=payload("id" to "new-original")
  responses["/api/studio/tracks/new-original"]=payload("profile" to payload("status" to "uploading"))
  try{
   act{it.openStudio()};ready("creator-studio");ui.waitUntil(15000){!model.studioBusy}
   ui.onNodeWithTag("creator-studio").performScrollToNode(hasTestTag("studio-upload"));ui.onNodeWithTag("studio-upload").performClick();ready("studio-title")
   ui.onNodeWithText("WAV · FLAC · MP3 선택 (80MB 이하)").performClick();text("original-test.wav")
   ui.onNodeWithTag("studio-field-AI 제작 도구").performScrollTo().performTextReplacement("Suno");Espresso.closeSoftKeyboard()
   for(label in listOf("AI로 제작한 음원입니다.","음원과 이미지의 권리를 보유하고 있습니다.","노래방 MR 제공 및 다른 이용자의 커버를 허락합니다."))ui.onNodeWithTag("studio-consent-$label").performScrollTo().performClick()
   ui.onNodeWithTag("studio-save").performScrollTo().performClick();ready("creator-studio")
   val body=JSONObject(requestBodies.getValue("/api/uploads"));assertEquals("wav",body.getString("extension"));assertEquals(1024,body.getInt("bytes"))
   assertEquals(1024,uploadBytes.getValue("/api/uploads/new-original/audio"));assertEquals(1,requestUrls.count{it=="/api/uploads"})
   assertEquals(1,requestUrls.count{it=="/api/uploads/new-original/complete"})
  }finally{instrumentation.removeMonitor(monitor);file.delete()}
 }

 @Test fun crewRenameCooldownKeepsDescriptionEditable(){
  member.put("role","owner");crew.put("can_rename",false).put("name_change_available_at",now+30*86400)
  act{it.communityCrewMode=true;it.communityCrewTarget="design-crew";it.selectTab(3)}
  ready("crew-tab-about");ui.onNodeWithTag("crew-tab-about").performClick()
  ui.onNodeWithTag("crew-scroll").performScrollToNode(hasText("소개 · 모집 수정"));ui.onNodeWithText("소개 · 모집 수정").performClick()
  ready("crew-rename");ui.onNodeWithTag("crew-rename").assertIsNotEnabled()
  ui.onNodeWithTag("crew-rename-help").assertTextContains("30일 뒤에 수정 가능합니다.",substring=true)
  ui.onNodeWithText("크루 소개").assertIsEnabled();capture("65-crew-rename-cooldown")
 }

 @Test fun captureMainScreens(){
  capture("01-home")
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasText("같은 노래, 다른 목소리"));capture("02-home-covers")
  ui.onNodeWithTag("main-tab-3").performClick();ready("music-community-feed");capture("03-community")
  ui.onNodeWithTag("main-tab-2").performClick();ready("sing-scroll");capture("04-sing")
  ui.onNodeWithTag("sing-scroll").performScrollToNode(hasText("추천 곡"));capture("05-sing-songs")
  act{it.selectTab(1)};ready("search-scroll");capture("06-search")
  act{it.library("플레이리스트")};ready("library-scroll");capture("07-library")
  act{it.openList("design-list")};ui.waitUntil(15000){!model.listLoading&&model.listSongs.isNotEmpty()};capture("08-playlist")
  act{it.selectedList=null;it.collection=null;it.selectTab(0);it.play(Song(song),listOf(Song(song),Song(second)))}
  ready("mini-player-lyrics");act{it.fullPlayer=true};capture("09-player")
  act{it.fullPlayer=false;it.controller?.pause();it.openSong(Song(song))};text("밤의 산책");capture("10-song-detail")
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun newVoicesUsesPageNavigationAndRestoresScroll(){
  act{it.selectTab(2)};ready("sing-scroll")
  ui.onNodeWithTag("sing-scroll").performScrollToNode(hasTestTag("new-voices-more"))
  val more=hasText("더보기") and hasAnyAncestor(hasTestTag("new-voices-more"))
  ui.onNode(more).performClick();ready("collection-page")
  ui.waitUntil(15000){!model.collectionBusy&&model.collection?.tracks?.isNotEmpty()==true}
  assertTrue(model.collection?.asPage==true)
  ui.onNodeWithTag("sing-scroll").assertDoesNotExist()
  ui.onNodeWithTag("main-tab-2").assertIsDisplayed()
  capture("40-new-voices-page")
  Espresso.pressBack();ready("sing-scroll")
  ui.onNode(more).assertIsDisplayed().performClick();ready("collection-page")
  ui.onNodeWithTag("collection-back").performClick();ready("sing-scroll")
  ui.onNode(more).assertIsDisplayed()
 }
 @Test fun chartsHavePanelsAndSearchStaysOneLine(){
  val longCover=JSONObject(second.toString()).put("kind","cover").put("has_ai_artist",0).put("producer","이름이 아주 긴 가수와 함께하는 밤").put("producer_id","design-peer").put("title","한 걸음씩 너에게 다가가고 있어요 우리의 이야기를 들어줘").put("rank",3).put("rank_likes",9).put("likes",12840).put("comments",128)
  responses["/api/cover-rankings"]=payload("tracks" to arr(JSONObject(cover.toString()).put("rank",1).put("rank_likes",24),JSONObject(duet.toString()).put("rank",2).put("rank_likes",12),longCover),"singers" to arr(peer))
  act{it.listenPage="차트";it.selectTab(0)};ready("chart-popular");capture("41-chart-panels")
  ui.onNodeWithTag("chart-category-karaoke").performClick();ui.waitUntil(15000){model.rankOpen&&!model.rankBusy};ready("karaoke-row-design-cover");capture("karaoke-259-top")
  val ranking=ui.onNodeWithTag("ranking-scroll",useUnmergedTree=true)
  ranking.performScrollToNode(hasTestTag("karaoke-row-design-cover"))
  val offset=ui.onNodeWithTag("karaoke-row-design-cover",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot.top-ranking.fetchSemanticsNode().boundsInRoot.top
  ranking.performSemanticsAction(SemanticsActions.ScrollBy){it(0f,offset)}
  val titleLayout=mutableListOf<TextLayoutResult>()
  ui.onNodeWithTag("karaoke-title-design-ocean",useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(titleLayout)}
  assertEquals(1,titleLayout.single().lineCount)
  capture("karaoke-259-rows")
  ui.onNodeWithTag("karaoke-like-design-cover").assertIsEnabled()
  ui.onNodeWithTag("karaoke-play-design-cover").performClick();ui.waitUntil(15000){model.current?.id=="design-cover"&&model.playing}
  ui.onNodeWithTag("karaoke-artist-design-cover").performClick();ui.waitUntil(15000){model.profile?.optString("id")=="design-peer"&&!model.profileLoading}
  act{it.dismissProfile()}
  ui.onNodeWithTag("karaoke-comments-design-cover").performClick();ui.waitUntil(15000){model.detail?.id=="design-cover"&&!model.detailBusy}
  act{it.detail=null;it.dismissRanking();it.closePlayer()}
  act{it.listenPage="최신곡"};ready("stream-song-design-song");capture("43-latest-panels")
  act{it.selectTab(1)};ready("global-search")
  val layouts=mutableListOf<TextLayoutResult>()
  ui.onNodeWithText("곡 · 아티스트 검색",useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(layouts)}
  assertEquals(1,layouts.single().lineCount)
  capture("44-single-line-search")
  ui.onNodeWithTag("global-search").performTextInput("밤의 산책")
  ui.waitUntil(15000){model.searched&&!model.searching&&model.searchResults.isNotEmpty()}
  Espresso.closeSoftKeyboard()
 }
 @Test fun chartPeriodsUseServerRanksAndOpenTrackActions(){
  val rising="/api/catalog?section=tracks&chart=rising"
  val newcomers="/api/catalog?section=tracks&chart=newcomers"
  responses[rising]=payload("tracks" to arr(second,song))
  responses[newcomers]=payload("tracks" to arr(song,second,JSONObject(song.toString()).put("id","design-new").put("title","새로운 목소리의 긴 노래 제목을 확인해요")))
  val month="/api/catalog?section=tracks&chart=top&period=month"
  responses[month]=payload("tracks" to arr(JSONObject(second.toString()).put("chart_rank",7).put("rank_change",2).put("chart_movement","up")),"chart" to payload("comparison" to payload("available" to true)))
  act{it.listenPage="차트";it.selectTab(0)};ready("chart-period-month")
  ui.onNodeWithTag("chart-period-month").performClick()
  ui.waitUntil(15000){requestUrls.contains(month)&&ui.onAllNodesWithTag("chart-loading").fetchSemanticsNodes().isEmpty()}
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasTestTag("chart-song-design-ocean"))
  ui.onNodeWithTag("chart-movement-design-ocean",useUnmergedTree=true).assertTextEquals("▲2")
  ui.onNodeWithText("7").assertExists()
  ui.onNodeWithTag("chart-song-design-song").assertDoesNotExist()
  capture("66-chart-month")
  ui.onNodeWithTag("chart-category-rising").performScrollTo().performClick()
  ui.waitUntil(15000){requestUrls.contains(rising)&&ui.onAllNodesWithTag("chart-loading").fetchSemanticsNodes().isEmpty()}
  ui.onNodeWithTag("chart-rank-design-ocean",useUnmergedTree=true).assertTextEquals("1")
  ui.onNodeWithTag("chart-rank-design-song",useUnmergedTree=true).assertTextEquals("2")
  ui.onNodeWithTag("chart-movement-design-ocean",useUnmergedTree=true).assertDoesNotExist()
  val risingTitle=mutableListOf<TextLayoutResult>()
  ui.onNodeWithTag("music-title-design-ocean",useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(risingTitle)}
  assertEquals(1,risingTitle.single().lineCount)
  ui.onNodeWithContentDescription("푸른 순간 재생").performClick();ui.waitUntil(15000){model.playing&&model.current?.id=="design-ocean"}
  capture("chart-260-rising")
  ui.onNodeWithTag("chart-category-newcomers").performScrollTo().performClick()
  ui.waitUntil(15000){requestUrls.contains(newcomers)&&ui.onAllNodesWithTag("chart-loading").fetchSemanticsNodes().isEmpty()}
  val first=ui.onNodeWithTag("newcomer-card-design-song",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
  val secondCard=ui.onNodeWithTag("newcomer-card-design-ocean",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
  assertTrue("Newcomers have large artwork cards",first.width>120*context.resources.displayMetrics.density)
  assertTrue(first.right<secondCard.left);assertEquals(first.top,secondCard.top,1f)
  ui.onNodeWithTag("newcomer-like-design-song").assertIsEnabled()
  capture("chart-260-newcomers")
  ui.onNodeWithContentDescription("밤의 산책 먼저 듣기").performClick();ui.waitUntil(15000){model.playing&&model.current?.id=="design-song"}
  ui.onNodeWithTag("chart-category-top").performScrollTo().performClick()
  ui.waitUntil(15000){ui.onAllNodesWithTag("chart-loading").fetchSemanticsNodes().isEmpty()&&ui.onAllNodesWithTag("chart-movement-design-ocean",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}
  ui.onNodeWithTag("chart-movement-design-ocean",useUnmergedTree=true).assertTextEquals("▲2")
  ui.onNodeWithContentDescription("${second.getString("title")} 더보기").performClick()
  ui.onNodeWithText("플레이리스트 담기").assertIsDisplayed()
  ui.onNodeWithText("선물하기").assertIsDisplayed()
  ui.onNodeWithText("댓글 보기").performClick();ui.waitUntil(15000){model.detail?.id=="design-ocean"}
 }
 @Test fun crewIntroductionHasRealGraphsAndFollowingIsAligned(){
  act{it.communityCrewMode=true;it.communityCrewTarget="design-crew";it.selectTab(3)}
  ready("crew-tab-about");ui.onNodeWithTag("crew-tab-about").performClick();ready("crew-about-visual")
  ui.onNodeWithTag("crew-scroll").performScrollToNode(hasTestTag("crew-xp-progress"))
  ui.onNodeWithText("LV 4까지 720 XP").assertExists();capture("45-crew-growth")
  ui.onNodeWithTag("crew-scroll").performScrollToNode(hasTestTag("crew-members-progress"))
  ui.onNodeWithText("12명 / 50명").assertExists();capture("46-crew-members-graph")
  act{it.communityCrewMode=false;it.community("팔로잉")};ready("music-community-feed")
  ui.waitUntil(15000){!model.feedLoading&&model.feed.isNotEmpty()}
  act{it.feed=listOf(Song(JSONObject(cover.toString()).put("producer","아주 긴 이름의 크루원(밤산책)").put("title","우리의 목소리로 함께 부르는 긴 제목의 노래")))}
  ui.onNodeWithTag("music-community-feed",useUnmergedTree=true).performScrollToNode(hasTestTag("feed-title-design-cover"))
  ui.onNodeWithTag("feed-author-design-cover",useUnmergedTree=true).assertIsDisplayed()
  capture("47-following-alignment")
 }
 @Test fun crewChatOpensMessagesTabWithoutModalAndBackReturnsToInbox(){
  act{it.communityCrewMode=true;it.communityCrewTarget="design-crew";it.selectTab(3)}
  ready("crew-tab-chat");ui.onNodeWithTag("crew-tab-chat").performClick();ready("crew-chat-input")
  assertEquals(5,model.tab);assertFalse(model.showMessages);assertEquals("design-crew",model.messageCrew)
  ready("dm-message-sample-crew-1");capture("49-crew-chat-messages-page")
  Espresso.pressBack();ready("dm-conversation-design-peer")
  assertNull(model.messageCrew);assertEquals(5,model.tab);assertFalse(model.showMessages)
  ui.onNodeWithTag("main-tab-3").performClick();ready("crew-home-summary")
 }
 @Test fun popularSongCardsKeepFullTitlesAndSeparateRows(){
  val title="조금씩 멀어지고 있었나 봐 우리의 이야기를 끝까지 들어주세요 다시 함께 노래하는 밤"
  val longSong=Song(JSONObject(song.toString()).put("title",title))
  responses["/api/catalog?section=tracks&chart=top&period=week"]=payload("tracks" to arr(longSong.raw,second))
  act{it.latest=listOf(longSong,Song(second));it.listenPage="차트";it.selectTab(0)}
  ready("chart-popular")
  fun assertFullTitle(){
   val layouts=mutableListOf<TextLayoutResult>()
   ui.onAllNodesWithTag("music-title-design-song",useUnmergedTree=true).onFirst().performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(layouts)}
   val result=layouts.single();assertEquals(title,result.layoutInput.text.text)
   assertTrue(result.lineCount>1);assertFalse(result.hasVisualOverflow)
   for(line in 0 until result.lineCount)assertFalse(result.isLineEllipsized(line))
  }
  ui.waitUntil(15000){ui.onAllNodesWithTag("chart-loading").fetchSemanticsNodes().isEmpty()}
  assertFullTitle();capture("50-popular-full-title-cards")
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasTestTag("chart-song-design-ocean") and hasAnyAncestor(hasTestTag("chart-popular")))
  val first=ui.onNode(hasTestTag("chart-song-design-song") and hasAnyAncestor(hasTestTag("chart-popular"))).fetchSemanticsNode().boundsInRoot
  val next=ui.onNode(hasTestTag("chart-song-design-ocean") and hasAnyAncestor(hasTestTag("chart-popular"))).fetchSemanticsNode().boundsInRoot
  assertTrue(next.top>first.bottom)
  act{it.listenPage="최신곡"};ready("stream-song-design-song")
  val latestLayouts=mutableListOf<TextLayoutResult>()
  ui.onNodeWithTag("music-title-design-song",useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(latestLayouts)}
  assertEquals(title,latestLayouts.single().layoutInput.text.text);assertTrue(latestLayouts.single().lineCount<=2)
  capture("51-latest-compact-title")
 }
 @Test fun singingGenresWrapAndCreatorCardsKeepEqualSize(){
  val description="도시의 하루가 끝나는 순간을 노래한 곡이에요. 원곡을 먼저 들어보고 반주에 맞춰 나만의 목소리로 새로운 이야기를 남겨보세요."
  val genres=listOf("K-POP","Indie Pop","R&B","Korean Folklore Fusion")
  act{
   it.singable=listOf(Song(JSONObject(song.toString()).put("genres",JSONArray(genres)).put("description",description)))
   it.people=listOf(JSONObject(peer.toString()).put("bio","짧은 소개"),JSONObject(own.toString()).put("name","아주 긴 이름을 가진 음악가").put("bio","음악을 좋아하고 노래를 만들며 하루의 여러 순간을 목소리로 남기는 창작자입니다."),person("no-bio","새벽","third").put("bio",""))
   it.selectTab(0)
  }
  // Genre filtering now lives in the singing catalogue, outside each compact song row.
  act{it.selectTab(2)};ui.onNodeWithTag("sing-entry-솔로").performClick()
  ui.onNodeWithTag("chips-전체").performScrollToNode(hasText("Korean Folklore Fusion"))
  ui.onNodeWithText("Korean Folklore Fusion").performClick()
  ui.onNodeWithTag("stream-song-design-song").assertExists();capture("52-singing-genre-filter")
  act{it.selectTab(0)}
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasTestTag("home-people-shelf"))
  val first=ui.onNodeWithTag("person-card-design-peer").fetchSemanticsNode().boundsInRoot
  val second=ui.onNodeWithTag("person-card-design-own").fetchSemanticsNode().boundsInRoot
  assertEquals(first.height,second.height,1f)
  for((tag,lines) in listOf("person-name-design-own" to 2,"person-bio-design-own" to 3)){
   val textLayouts=mutableListOf<TextLayoutResult>()
   ui.onNodeWithTag(tag,useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(textLayouts)}
   val result=textLayouts.single()
   assertEquals("$tag: ${result.layoutInput.style}; ${result.layoutInput.constraints}; ${result.size}",lines,result.lineCount)
  }
  ui.onNodeWithTag("home-people-shelf").performScrollToNode(hasTestTag("person-card-no-bio"))
  val empty=ui.onNodeWithTag("person-card-no-bio").fetchSemanticsNode().boundsInRoot
  assertEquals(first.height,empty.height,1f);capture("53-equal-creator-cards")
 }
 @Test fun crewHomeNeverFlashesVisitorGrowthWhileMembershipIsPending(){
  val detailPath="/api/crews/design-crew";val historyPath="$detailPath/messages"
  // Check both response orders, including a cached re-entry with no cached rights.
  for(publicFirst in listOf(true,false)){
   val detailGate=CountDownLatch(1);val historyGate=CountDownLatch(1)
   heldResponses[detailPath]=detailGate;heldResponses[historyPath]=historyGate
   heldRequests[detailPath]=CountDownLatch(1);heldRequests[historyPath]=CountDownLatch(1)
   try{
    act{it.communityCrewMode=true;it.communityCrewTarget="design-crew";it.selectTab(3)}
    ui.waitUntil(5000){heldRequests.getValue(detailPath).count==0L&&heldRequests.getValue(historyPath).count==0L}
    ui.onNodeWithTag("crew-about-visual").assertDoesNotExist();ui.onNodeWithTag("crew-join").assertDoesNotExist()
    if(!publicFirst)ui.onNodeWithTag("crew-home-summary").assertIsDisplayed()
    if(publicFirst){detailGate.countDown();heldResponses.remove(detailPath);ready("crew-home-summary")}
    else {historyGate.countDown();heldResponses.remove(historyPath);ready("crew-tab-music")}
    ui.onNodeWithTag("crew-scroll").performScrollToNode(hasText("크루의 최신 음악"))
    ui.onNodeWithTag("crew-about-visual").assertDoesNotExist();ui.onNodeWithTag("crew-join").assertDoesNotExist()
    if(publicFirst){
     // Public membership alone must not expose private conversations/actions.
     ui.onNodeWithTag("crew-chat-composer").assertDoesNotExist();ui.onNodeWithTag("crew-leave").assertDoesNotExist()
     capture("48-crew-home-pending-membership")
    }
    detailGate.countDown();historyGate.countDown();heldResponses.clear()
    ui.onNodeWithTag("crew-scroll").performScrollToIndex(0);ready("crew-tab-music")
    ui.onNodeWithTag("crew-tab-music").assertIsSelected()
    ui.onNodeWithTag("crew-about-visual").assertDoesNotExist()
    act{it.selectTab(0)};ready("listen-scroll")
   }finally{detailGate.countDown();historyGate.countDown();heldResponses.clear();heldRequests.clear()}
  }
 }
 @Test fun crewVisitorIntroductionWaitsForConfirmationAndChatStillRequiresFreshHistory(){
  val historyPath="/api/crews/design-crew/messages";val historyGate=CountDownLatch(1)
  heldResponses[historyPath]=historyGate;heldRequests[historyPath]=CountDownLatch(1)
  try{
   act{it.openCrewMessages("design-crew")};ready("crew-chat-input")
   ui.waitUntil(5000){heldRequests.getValue(historyPath).count==0L}
   ready("crew-home-summary")
   ui.onNodeWithTag("crew-chat-input").assertIsNotEnabled()
   ui.onNodeWithTag("dm-message-sample-crew-1").assertDoesNotExist()
   historyGate.countDown();heldResponses.clear();ready("dm-message-sample-crew-1")
   ui.onNodeWithTag("crew-chat-input").assertIsEnabled()
  }finally{historyGate.countDown();heldResponses.clear();heldRequests.clear()}
  act{it.messageCrew=null;it.selectTab(0)}
  val detailPath="/api/crews/design-crew";val detailGate=CountDownLatch(1)
  responses[detailPath]=JSONObject(responses.getValue(detailPath).toString()).put("membership",JSONObject.NULL)
  responses[historyPath]=payload("membership" to null,"messages" to JSONArray())
  heldResponses[detailPath]=detailGate;heldRequests[detailPath]=CountDownLatch(1)
  try{
   act{it.communityCrewMode=true;it.communityCrewTarget="design-crew";it.selectTab(3)}
   ui.waitUntil(5000){heldRequests.getValue(detailPath).count==0L};ready("crew-home-summary")
   ui.onNodeWithTag("crew-about-visual").assertDoesNotExist();ui.onNodeWithTag("crew-join").assertDoesNotExist()
   detailGate.countDown();heldResponses.clear();ready("crew-about-visual")
   ui.onNodeWithTag("crew-scroll").performScrollToNode(hasTestTag("crew-join"))
   ui.onNodeWithTag("crew-join").assertIsEnabled()
   ui.onNodeWithTag("crew-chat-composer").assertDoesNotExist()
  }finally{detailGate.countDown();heldResponses.clear();heldRequests.clear()}
 }
 @Test fun captureSocialScreens(){
  ui.onNodeWithTag("main-tab-5").performClick();ready("dm-conversation-design-peer");text("내 크루 · 고정");capture("11-message-list")
  ui.onNodeWithTag("dm-conversation-design-peer").performClick();ready("dm-message-sample-dm-3");capture("12-direct-message")
  ui.onNodeWithTag("dm-input").performClick().performTextInput("같이 불러요");capture("13-dm-keyboard");Espresso.closeSoftKeyboard()
  act{it.messagePeer=null;it.communityCrewMode=true;it.communityCrewTarget="design-crew";it.selectTab(3)}
  ready("crew-home-summary");capture("14-crew-home")
  ui.onNodeWithTag("crew-scroll").performScrollToNode(hasText("크루의 최신 음악"));ui.onNodeWithText("크루의 최신 음악").assertIsDisplayed()
  ui.onNodeWithTag("crew-scroll").performScrollToIndex(0)
  ui.onNodeWithTag("crew-tab-members").performClick();ready("crew-member-design-peer");capture("15-crew-members")
  ui.onNodeWithTag("crew-browse").performClick();ready("crew-search");capture("16-crew-discovery")
  act{it.openCrewMessages("design-crew")};ready("crew-chat-input");ready("dm-message-sample-crew-1")
  ui.onNodeWithText("하루(크루장)").assertExists();ui.onNodeWithText("이번 주엔 어떤 노래를 함께 부를까요?").assertExists();capture("17-crew-chat")
  ui.onNodeWithTag("crew-chat-input").performClick().performTextInput("듀엣 참여할게요");capture("18-crew-keyboard");Espresso.closeSoftKeyboard()
 }
 @Test fun singingRowsKeepPlaybackAndRecordingActionsTogether(){
  act{it.selectTab(2)};ui.onNodeWithTag("sing-entry-솔로").performClick()
  ui.onNodeWithTag("stream-play-design-song").assertIsDisplayed()
  ui.onNodeWithTag("stream-sing-design-song").assertIsDisplayed()
  ui.onNodeWithTag("stream-play-design-song").performClick();ui.waitUntil(15000){model.current?.id=="design-song"}
  ui.onNodeWithContentDescription("밤의 산책 곡 정보").performClick();ui.waitUntil(15000){model.detail?.id=="design-song"}
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun webParityGiftQuantityAndActivityHistory(){
  responses["/api/producers/design-peer/gifts"]=payload("free_balance" to 70,"ranking" to rank)
  act{it.giftPerson=peer;it.giftTarget=null;it.showGifts=true};text("하루(밤산책)님에게 선물")
  ui.onNodeWithTag("gift-list").performScrollToNode(hasText("손편지"));capture("40-silver-gifts")
  ui.onNodeWithTag("gift-list").performScrollToNode(hasTestTag("gift-quantity"))
  ui.onNodeWithText("5",substring=false).performClick()
  ui.onNodeWithText("손편지 5개 · 10 S 보내기").performScrollTo().performClick()
  text("손편지 선물하기");capture("41-gift-quantity")
  ui.onNodeWithText("10 S 보내기",substring=false).performClick()
  ui.waitUntil(10000){requestBodies["/api/producers/design-peer/gifts"]!=null&&ui.onAllNodesWithText("손편지 선물하기").fetchSemanticsNodes().isEmpty()}
  ui.onNodeWithTag("gift-list").performScrollToNode(hasText("손편지 5개를 보냈어요"))
  val body=JSONObject(requestBodies.getValue("/api/producers/design-peer/gifts"))
  assertEquals("silver-letter",body.getString("gift_type"));assertEquals(5,body.getInt("quantity"));assertEquals(10,body.getInt("silver"));assertTrue(body.getString("request_id").isNotBlank())
  act{it.showGifts=false;it.showNotifications=true};ready("activity-list")
  text("손편지 5개를 보냈어요.")
  ui.onNodeWithTag("activity-list").performScrollToNode(hasText("손편지 5개를 보냈어요."))
  ui.onNodeWithText("10 S").assertExists();capture("42-activity-history")
  ui.onNodeWithText("읽음",substring=false).performClick()
  ui.waitUntil(10000){requestBodies["/api/notifications/read"]!=null}
  assertEquals("notice-1",JSONObject(requestBodies.getValue("/api/notifications/read")).getJSONArray("ids").getString(0))
  act{it.showNotifications=false;it.openSong(Song(song))};text("노래 듣기")
  ui.onNodeWithTag("album-cover-edit").assertExists()
  ui.onNodeWithText("커버곡",substring=false).performScrollTo()
  ui.onNodeWithText("랭킹",substring=false).performClick()
  ui.waitUntil(10000){requestUrls.any{it.contains("/covers?mode=all&sort=plays")}}
  capture("43-cover-ranking")
  act{it.detail=null;it.openList("design-list")};ready("playlist-cover-edit");capture("44-playlist-photo")
 }
 @Test fun compactPlayerShowsPlaybackControlsAndOneLyric(){
  act{it.play(Song(song),listOf(Song(song),Song(second)))}
  ready("mini-player-open");text("오늘의 마음을 이 노래에 담아요")
  val layouts=mutableListOf<TextLayoutResult>()
  ui.onNodeWithTag("mini-player-current-lyric",useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(layouts)}
  assertEquals(1,layouts.single().lineCount)
  ui.onNodeWithContentDescription("랜덤 재생").assertDoesNotExist()
  ui.onNodeWithContentDescription("다음 곡").assertIsDisplayed();phaseCapture("21-compact-player")
 }
 @Test fun captureProfileAndGiftScreens(){
  ui.onNodeWithTag("main-tab-6").performClick();ready("music-shortcut-보관함");ui.onNodeWithTag("account-menu").assertIsDisplayed();capture("19-my-profile")
  ui.onNodeWithText("내 활동").performClick();ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-layout-grid"));capture("20-my-music")
  act{it.openProfile("design-peer")};ui.waitUntil(15000){!model.profileLoading&&model.profile!=null};ready("profile-close");capture("21-public-profile")
  ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("profile-gift"));ui.onNodeWithTag("profile-gift").performClick();text("하루(밤산책)님에게 선물");capture("22-person-gift")
  act{it.showGifts=false;it.dismissProfile();it.openProfile("design-artist","artist")};ui.waitUntil(15000){!model.profileLoading&&model.profile?.optString("id")=="design-artist"};capture("23-artist-profile")
  ui.onNodeWithTag("profile-scroll").performScrollToNode(hasText("갤러리"));ui.onNodeWithText("갤러리",useUnmergedTree=true).performClick();ready("artist-photo-gallery");ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("artist-photo-gallery"));capture("24-artist-gallery")
  ui.onAllNodesWithContentDescription("NOVA 갤러리 사진 크게 보기").onFirst().performClick();text("NOVA");capture("25-gallery-photo");Espresso.pressBack()
  act{it.dismissProfile();it.openGifts()};text("내 선물함");capture("26-wallet")
  act{it.showGifts=false;it.showRewards=true};text("오늘의 실버");capture("27-rewards")
  act{it.showRewards=false;it.showAccount=true};ready("account-actions");capture("28-account-menu")
  act{it.showAccount=false;it.openAccountSettings()};ready("account-settings");capture("29-account-settings")
 }

 private fun phaseCapture(name:String){
  ui.waitForIdle();instrumentation.waitForIdleSync();Thread.sleep(500)
  val image=instrumentation.uiAutomation.takeScreenshot()
  val dir=File(context.getExternalFilesDir(null),"streaming-visual-refinement").apply{mkdirs()}
  FileOutputStream(File(dir,"$name.png")).use{image.compress(Bitmap.CompressFormat.PNG,100,it)};image.recycle()
 }
 @Test fun streamingHomeTabsPlayAndRestoreDiscovery(){
  ready("home-featured-play");phaseCapture("01-home")
  listOf("추천","차트","최신곡","발견").forEach{ui.onNodeWithTag("listen-tab-$it").assertIsDisplayed()}
  ui.onNodeWithTag("home-featured-play").performClick();ui.waitUntil(15000){model.playing};ready("mini-player-lyrics");phaseCapture("02-home-playing")
  ui.onNodeWithTag("listen-tab-차트").performClick();ready("chart-period-month")
  ui.onNodeWithTag("chart-period-month").performClick();ui.waitUntil(15000){requestUrls.any{it.contains("period=month")}}
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasTestTag("chart-song-design-ocean"))
  ui.onNodeWithContentDescription("푸른 순간 재생").performClick();ui.waitUntil(15000){model.current?.id=="design-ocean"};phaseCapture("03-chart")
  ui.onNodeWithTag("listen-tab-최신곡").performClick();ready("stream-play-design-song")
  ui.onNodeWithTag("stream-play-design-song").performClick();ui.waitUntil(15000){model.current?.id=="design-song"};phaseCapture("04-latest")
  ui.onNodeWithTag("listen-tab-발견").performClick();ready("global-search");phaseCapture("05-discover");capture("chart-260-discovery-top")
  ui.onNodeWithTag("discover-mood-comfort").performScrollTo().performClick();ready("collection-page")
  ui.waitUntil(15000){requestUrls.contains("/api/discovery?mood=comfort")&&!model.collectionBusy}
  ui.onNodeWithTag("collection-back").performClick();ready("global-search")
  ui.onNodeWithTag("discover-genre-K-POP").performScrollTo()
  val searchScroll=ui.onNodeWithTag("search-scroll",useUnmergedTree=true)
  val genreOffset=ui.onNodeWithTag("discover-genre-K-POP",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot.top-searchScroll.fetchSemanticsNode().boundsInRoot.top
  searchScroll.performSemanticsAction(SemanticsActions.ScrollBy){it(0f,genreOffset)};capture("chart-260-discovery-genres")
  ui.onNodeWithTag("discover-genre-K-POP").performClick();ready("collection-page")
  ui.waitUntil(15000){requestUrls.contains("/api/catalog?section=tracks&genre=K-POP")&&!model.collectionBusy}
  ui.onNodeWithTag("collection-back").performClick();ready("search-scroll")
  searchScroll.performScrollToIndex(0);ready("global-search")
  ui.onNodeWithTag("global-search").performTextInput("푸른")
  ui.waitUntil(15000){model.searched&&!model.searching};Espresso.closeSoftKeyboard()
  ui.onNodeWithTag("discover-filter-곡").performClick();ui.onNodeWithTag("discover-filter-곡").assertIsSelected();capture("chart-260-discovery-results")
  ui.onNodeWithTag("listen-tab-추천").performClick();ui.onNodeWithTag("listen-tab-발견").performClick()
  ui.onNodeWithTag("global-search").assertTextContains("푸른")
  ui.onNodeWithTag("discover-filter-곡").assertIsSelected()
  ui.onNodeWithTag("search-scroll").performScrollToNode(hasContentDescription("푸른 순간 재생"))
  ui.onNodeWithContentDescription("푸른 순간 재생").performClick();ui.waitUntil(15000){model.current?.id=="design-ocean"}
  assertTrue(requestUrls.any{it.startsWith("/api/search")})
 }
 @Test fun streamingLibrarySharesServerStateAndReturnsToSource(){
  ready("music-shortcut-좋아요");ui.onNodeWithTag("music-shortcut-좋아요").performClick()
  ready("library-search");assertEquals("좋아요",model.libraryPage)
  ui.onNodeWithTag("stream-play-design-cover").performClick();ui.waitUntil(15000){model.current?.id=="design-cover"}
  ui.onNodeWithTag("library-back").performClick();assertEquals(0,model.tab)
  ui.onNodeWithTag("main-tab-6").performClick();ready("my-music-page");phaseCapture("06-my-music")
  ui.onNodeWithTag("music-shortcut-좋아요").performClick();ready("stream-song-design-cover")
  responses["/api/library"]=payload("likes" to arr(song),"collections" to arr(playlist),"follows" to JSONArray())
  // Change the same server-backed like from the full player's visible action.
  ui.onNodeWithTag("mini-player-open").performClick();ui.onNodeWithContentDescription("좋아요").performClick()
  ui.waitUntil(15000){!model.busy&&model.likes.none{it.id=="design-cover"}}
  Espresso.pressBack();ready("library-search");ui.onNodeWithTag("stream-song-design-cover").assertDoesNotExist()
  Espresso.pressBack();assertEquals(6,model.tab)
  ui.onNodeWithTag("music-shortcut-플레이리스트").performClick();text("퇴근길에 듣는 음악")
  ui.onNodeWithText("퇴근길에 듣는 음악").performClick();ui.waitUntil(15000){model.selectedList!=null&&model.listSongs.size==4};phaseCapture("07-playlist")
  Espresso.pressBack();Espresso.pressBack();assertEquals(6,model.tab)
  ui.onNodeWithTag("music-shortcut-보관함").performClick();ready("library-scroll");phaseCapture("08-library")
  Espresso.pressBack();ui.onNodeWithText("내 활동").performClick();phaseCapture("09-my-activity")
  ui.onNodeWithTag("account-menu").performClick();ready("account-actions");Espresso.pressBack()
  ui.onNodeWithText("내 음악").performClick();ui.onNodeWithTag("my-music-page").performScrollToNode(hasText("창작자 스튜디오"));ui.onNodeWithText("창작자 스튜디오").performClick();ready("creator-studio");Espresso.pressBack();assertEquals(6,model.tab)
 }
 @Test fun streamingMiniPlayerKeepsSessionAndExpandedControls(){
  act{it.play(Song(song),listOf(Song(song),Song(second)))};ui.waitUntil(15000){model.playing};ready("mini-player-open");text("오늘의 마음을 이 노래에 담아요")
  val layout=mutableListOf<TextLayoutResult>()
  ui.onNodeWithTag("mini-player-current-lyric",useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(layout)}
  assertEquals(1,layout.single().lineCount)
  val controller=model.controller
  for(tab in listOf(3,2,5,6,0)){ui.onNodeWithTag("main-tab-$tab").performClick();assertSame(controller,model.controller);assertEquals("design-song",model.current?.id);assertTrue(model.playing)}
  ui.onNodeWithTag("mini-player-open").performClick();ready("player-queue");phaseCapture("10-full-player")
  ui.onNodeWithContentDescription("셔플").performScrollTo().performClick();ui.waitUntil(10000){model.shuffle}
  ui.onNodeWithContentDescription("반복").performClick();ui.waitUntil(10000){model.repeat==androidx.media3.common.Player.REPEAT_MODE_ALL}
  ui.onNodeWithTag("player-queue").performScrollTo().performClick();text("재생목록");phaseCapture("11-queue")
  instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
  ui.waitUntil(5000){ui.onAllNodesWithText("재생목록").fetchSemanticsNodes().isEmpty()}
  instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
  ui.waitUntil(5000){!model.fullPlayer};assertTrue(model.playing)
  screen.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);Thread.sleep(800)
  instrumentation.runOnMainSync{assertTrue(controller!!.isPlaying);controller.pause()}
  screen.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);ui.waitUntil(10000){!model.playing}
  ui.onNodeWithContentDescription("재생").performClick();ui.waitUntil(10000){model.playing}
  ui.onNodeWithContentDescription("다음 곡").performClick();ui.waitUntil(10000){model.current?.id=="design-ocean"}
  ui.onNodeWithTag("mini-player-open").performClick();ui.onNodeWithContentDescription("재생 종료").performClick();ui.waitUntil(10000){model.current==null}
  ui.onNodeWithTag("mini-player").assertDoesNotExist()
 }
 @Test fun streamingSingSearchDraftAndDuetRoutes(){
  ui.onNodeWithTag("main-tab-2").performClick();ready("sing-search");phaseCapture("12-sing")
  ui.onNodeWithTag("sing-entry-솔로").performClick();ready("stream-sing-design-ocean")
  ui.onNodeWithTag("sing-search").performTextInput("푸른")
  ui.onNodeWithTag("stream-song-design-song").assertDoesNotExist();ui.onNodeWithTag("stream-song-design-ocean").assertExists()
  Espresso.closeSoftKeyboard();ui.onNodeWithContentDescription("부르기 처음으로").performClick()
  ui.onNodeWithTag("sing-search").performTextClearance();Espresso.closeSoftKeyboard()
  ui.onNodeWithText("녹음 이어 하기").performClick();ready("recording-drafts");Espresso.pressBack()
  ui.onNodeWithTag("sing-entry-듀엣").performClick();ready("duet-invitation-design-duet");phaseCapture("13-duets")
  ui.onNodeWithContentDescription("우리의 멜로디 먼저 듣기").performClick();ui.waitUntil(15000){model.current?.id=="design-duet"&&model.playing}
  // Monitor the actual Android Activity launch, preserving original + parent + mode.
  val monitor=instrumentation.addMonitor(kr.co.aifect.app.karaoke.KaraokeActivity::class.java.name,null,false)
  try{
   ui.onNodeWithTag("duet-join-design-duet").performClick()
   val activity=instrumentation.waitForMonitorWithTimeout(monitor,15000)
   assertNotNull("Existing recorder must be launched",activity)
   assertEquals("design-song",activity.intent.getStringExtra("trackId"));assertEquals("design-duet",activity.intent.getStringExtra("duetParentId"));assertEquals("duet",activity.intent.getStringExtra("coverMode"))
   ui.waitUntil(10000){!model.playing}
   instrumentation.runOnMainSync{activity.finish()}
  }finally{instrumentation.removeMonitor(monitor)}
 }
 @Test fun streamingEmptyAndSignedOutStates(){
  responses["/api/library"]=payload("likes" to JSONArray(),"collections" to JSONArray(),"follows" to JSONArray())
  responses["/api/history"]=payload("tracks" to JSONArray())
  act{it.refreshLibrary(fresh=true)};ui.waitUntil(15000){model.likes.isEmpty()&&model.history.isEmpty()&&model.playlists.isEmpty()}
  act{it.library("보관함")};ready("library-scroll");phaseCapture("14-empty-library")
  ui.onNodeWithTag("library-scroll").performScrollToNode(hasText("음악 찾아보기"));ui.onNodeWithText("음악 찾아보기").performClick();ready("global-search")
  act{it.duetInvitations=emptyList();it.duetError="듀엣을 불러오지 못했어요";it.selectTab(2)}
  ui.onNodeWithTag("sing-entry-듀엣").performClick();act{it.duetInvitations=emptyList();it.duetError="듀엣을 불러오지 못했어요"};text("다시 불러오기");phaseCapture("15-duet-error")
  act{it.user=null;it.selectTab(6)};text("로그인");phaseCapture("16-signed-out")
  ui.onNodeWithText("로그인").performClick();text("이메일로 로그인")
 }
 @Test fun streamingLargeTextKeepsControlsReachable(){
  val long=Song(JSONObject(song.toString()).put("title","아주 긴 한국어 노래 제목도 두 줄로 읽으며 음악을 고르고 재생할 수 있어요"))
  act{it.latest=listOf(long);it.home=listOf(long,Song(second));it.singable=listOf(long,Song(second));it.history=emptyList();it.listenPage="추천";it.selectTab(0)}
  ready("home-featured-play");phaseCapture("17-large-text-home")
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasTestTag("music-shortcut-좋아요"));ui.onNodeWithTag("music-shortcut-좋아요").assertIsDisplayed()
  ui.onNodeWithTag("main-tab-2").performClick();ready("sing-search");phaseCapture("18-large-text-sing")
  ui.onNodeWithTag("sing-scroll").performScrollToNode(hasTestTag("stream-play-design-song"));ui.onNodeWithTag("stream-play-design-song").assertIsDisplayed()
  ui.onNodeWithTag("stream-sing-design-song").assertIsDisplayed();phaseCapture("19-large-text-row")
  ui.onNodeWithTag("main-tab-6").performClick();ready("my-music-page");phaseCapture("20-large-text-my")
 }


 @Test fun streamingPlaylistChangesAppearFromBothEntrances(){
  val changed=JSONObject(playlist.toString()).put("tracks",2)
  responses["/api/library"]=payload("likes" to arr(song),"collections" to arr(changed),"follows" to JSONArray())
  responses["/api/playlists/design-list"]=payload("playlist" to changed,"tracks" to arr(song,cover))
  act{it.play(Song(cover),listOf(Song(cover)))};ui.waitUntil(15000){model.current?.id=="design-cover"}
  ui.onNodeWithTag("mini-player-open").performClick()
  ui.onNodeWithText("담기").performScrollTo().performClick();text("플레이리스트에 담기")
  ui.onNodeWithText("퇴근길에 듣는 음악").performClick()
  ui.waitUntil(15000){!model.busy&&requestUrls.contains("/api/playlists/design-list/tracks/design-cover")}
  act{it.fullPlayer=false;it.selectTab(0)}
  ui.onNodeWithTag("music-shortcut-플레이리스트").performClick();text("퇴근길에 듣는 음악");ui.onNodeWithText("퇴근길에 듣는 음악").performClick()
  ui.waitUntil(15000){model.listSongs.map{it.id}==listOf("design-song","design-cover")}
  Espresso.pressBack();Espresso.pressBack();assertEquals(0,model.tab)
  ui.onNodeWithTag("main-tab-6").performClick();ui.onNodeWithTag("music-shortcut-플레이리스트").performClick()
  ui.onNodeWithText("퇴근길에 듣는 음악").performClick();ui.waitUntil(15000){model.listSongs.size==2}
  assertTrue(model.listSongs.any{it.id=="design-cover"});assertEquals(2,model.playlists.single().getInt("tracks"))
 }
 @Test fun streamingDraftResumesExistingRecordingWithoutMicrophone(){
  val microphoneBefore=ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)
  val ownerMethod=kr.co.aifect.app.karaoke.KaraokeActivity::class.java.getDeclaredMethod("draftOwner",String::class.java,String::class.java).apply{isAccessible=true}
  val owner=ownerMethod.invoke(null,Endpoint.origin,"user:design-user") as String
  val dir=File(context.filesDir,"karaoke-design-song-$owner").apply{mkdirs()}
  val dry=File(dir,"voice.pcm").apply{writeBytes(ByteArray(48000*3*2))}
  File(dir,"session.json").writeText(payload("trackId" to "design-song","coverMode" to "solo","duetPart" to "","duetParent" to "","title" to "이어 부를 초안","cursor" to 1,"words" to JSONArray()).toString())
  val monitor=instrumentation.addMonitor(kr.co.aifect.app.karaoke.KaraokeActivity::class.java.name,null,false)
  var room:android.app.Activity?=null
  try{
   room=instrumentation.startActivitySync(Intent(context,kr.co.aifect.app.karaoke.KaraokeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("origin",Endpoint.origin).putExtra("trackId","design-song").putExtra("ownerId","design-user").putExtra("resumeDraft",true).putExtra("draftFolder",dir.name))
   assertNotNull(room);assertTrue(room!!.intent.getBooleanExtra("resumeDraft",false));assertEquals(dir.name,room!!.intent.getStringExtra("draftFolder"))
   val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(30)
   while(true){try{androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`("recording-post"))).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()));break}catch(e:Throwable){if(System.nanoTime()>deadline)throw e;Thread.sleep(100)}}
   androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`("recording-complete"))).check(androidx.test.espresso.assertion.ViewAssertions.matches(org.hamcrest.Matchers.not(androidx.test.espresso.matcher.ViewMatchers.isDisplayed())))
   for(tag in listOf("recording-again","recording-draft","recording-publish","recording-publication","post-settings")){
    androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`(tag))).perform(androidx.test.espresso.action.ViewActions.scrollTo()).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
   }
   phaseCapture("polish-264-review-actions")
   assertEquals(48000*3*2L,dry.length())
   assertEquals(microphoneBefore,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
   androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`("recording-again"))).perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click())
   androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`("recording-key-settings"))).perform(androidx.test.espresso.action.ViewActions.scrollTo()).check{view,error->if(error!=null)throw error;assertTrue("Key control stays compact",view.height<=64*context.resources.displayMetrics.density)}
   phaseCapture("polish-264-recording-key")
  }finally{
   instrumentation.removeMonitor(monitor);room?.let{a->instrumentation.runOnMainSync{a.finish()}}
   // Only files created by this isolated fixture are removed.
   dir.listFiles()?.forEach{it.delete()};dir.delete()
  }
 }

 @Test fun fullPagePlayerContinuesLyricsWithoutMini(){
  responses["/api/tracks/design-ocean/lyrics/line"]=payload("line" to payload("text" to "다음 곡의 가사도 이어져요","from" to 0,"until" to 180))
  act{it.play(Song(song),listOf(Song(song),Song(second)))};ui.waitUntil(15000){model.playing}
  ui.onNodeWithTag("mini-player-open").performClick();ready("player-queue")
  ui.onNodeWithTag("mini-player").assertDoesNotExist()
  ui.onNodeWithContentDescription("다음 곡").performScrollTo().performClick()
  ui.waitUntil(15000){model.current?.id=="design-ocean"&&model.lyric=="다음 곡의 가사도 이어져요"}
  ui.onNodeWithText("다음 곡의 가사도 이어져요").performScrollTo().assertIsDisplayed()
  Espresso.pressBack();ready("mini-player-current-lyric")
  ui.onNodeWithTag("mini-player-current-lyric",useUnmergedTree=true).assertTextEquals("다음 곡의 가사도 이어져요")
 }

 @Test fun menusUsePagesAndRestoreParent(){
  ui.onNodeWithTag("home-featured-play").performClick();ui.waitUntil(15000){model.playing}
  val playing=model.current?.id
  ui.onNodeWithTag("account-menu").performClick();ready("account-actions")
  ui.onNodeWithTag("app-page").assertIsDisplayed();ui.onAllNodes(isDialog()).assertCountEquals(0)
  ui.onNodeWithTag("listen-tabs").assertDoesNotExist();phaseCapture("24-account-page")
  ui.onNodeWithText("계정 설정").performClick();ready("account-settings")
  ui.onNodeWithTag("account-actions").assertDoesNotExist();ui.onAllNodes(isDialog()).assertCountEquals(0)
  ui.onNodeWithTag("page-back").performClick();ui.onNodeWithTag("account-actions").assertIsDisplayed()
  Espresso.pressBack();ui.onNodeWithTag("listen-tabs").assertIsDisplayed()
  ui.onNodeWithTag("navigation-menu").performClick();ready("all-navigation")
  ui.onNodeWithTag("menu-인벤토리").performScrollTo().performClick();text("인벤토리")
  ui.onAllNodes(isDialog()).assertCountEquals(0);phaseCapture("25-inventory-page")
  Espresso.pressBack();ui.onNodeWithTag("menu-인벤토리").assertIsDisplayed()
  ui.onNodeWithTag("main-tab-6").performClick();ready("my-music-page")
  ui.onNodeWithTag("app-page").assertDoesNotExist();assertFalse(model.showInventory)
  assertEquals(playing,model.current?.id);assertTrue(model.playing)
 }

 @Test fun pageSelectorsPreserveUnsavedStudioFields(){
  act{it.openStudio()};ready("creator-studio");ui.waitUntil(15000){!model.studioBusy}
  ui.onNodeWithTag("creator-studio").performScrollToNode(hasTestTag("studio-edit-design-song"))
  ui.onNodeWithTag("studio-edit-design-song").performClick();ready("studio-title")
  ui.onNodeWithTag("studio-title").performTextReplacement("저장 전 수정한 제목");Espresso.closeSoftKeyboard()
  ui.onNodeWithText("AI 아티스트 · NOVA").performScrollTo().performClick();ready("app-page")
  ui.onAllNodes(isDialog()).assertCountEquals(0);ui.onNodeWithTag("studio-title").assertDoesNotExist()
  phaseCapture("26-artist-selection-page")
  Espresso.pressBack();ui.onNodeWithTag("studio-title").performScrollTo().assertTextContains("저장 전 수정한 제목")
  ui.onNodeWithContentDescription("스튜디오로 돌아가기").performClick();text("저장하지 않은 변경사항은 사라져요.")
  ui.onAllNodes(isDialog()).assertCountEquals(1)
  ui.onNodeWithText("계속 수정").performClick();ui.onNodeWithTag("studio-title").assertTextContains("저장 전 수정한 제목")
  assertFalse(requestBodies.containsKey("/api/studio/tracks/design-song"))
 }

 @Test fun playlistEditorIsAPageAndBackDoesNotSave(){
  act{it.openList("design-list")};ui.waitUntil(15000){model.selectedList!=null&&model.listSongs.size==4}
  ui.onNodeWithText("편집").performClick();text("플레이리스트 편집")
  ui.onAllNodes(isDialog()).assertCountEquals(0)
  ui.onNodeWithText("플레이리스트 이름").performTextReplacement("취소할 이름");Espresso.closeSoftKeyboard()
  phaseCapture("27-playlist-edit-page")
  ui.onNodeWithTag("page-back").performClick();ui.onNodeWithText("퇴근길에 듣는 음악").assertIsDisplayed()
  assertEquals("퇴근길에 듣는 음악",model.selectedList?.optString("name"));assertFalse(requestBodies.containsKey("/api/playlists/design-list"))
  Espresso.pressBack();ui.onNodeWithTag("home-featured-play").assertIsDisplayed()
 }

 @Test fun streamingMyPlaylistPlaysActualQueueAndHandlesEmpty(){
  ui.onNodeWithTag("main-tab-6").performClick();ready("my-music-page")
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("playlist-play-design-list"))
  ui.onNodeWithTag("playlist-play-design-list").performClick()
  ui.waitUntil(15000){model.playing&&model.current?.id=="design-song"&&!model.busy}
  ui.runOnIdle{assertEquals(4,model.controller!!.mediaItemCount)};assertNull(model.selectedList)
  ui.onNodeWithContentDescription("다음 곡").performClick();ui.waitUntil(10000){model.current?.id=="design-ocean"}
  responses["/api/playlists/design-list"]=payload("playlist" to playlist,"tracks" to JSONArray())
  ui.onNodeWithTag("playlist-play-design-list").performClick();text("아직 재생할 곡이 없어요.")
  assertEquals("design-ocean",model.current?.id)
 }

 @Test fun streamingDelayedPlaylistCannotReplaceANewerSong(){
  val path="/api/playlists/design-list";val gate=CountDownLatch(1)
  heldResponses[path]=gate;heldRequests[path]=CountDownLatch(1)
  try{
   act{it.playPlaylist("design-list")}
   ui.waitUntil(5000){heldRequests.getValue(path).count==0L&&model.playlistPlayLoading=="design-list"}
   act{it.play(Song(second),listOf(Song(second)))}
   gate.countDown();heldResponses.remove(path)
   ui.waitUntil(15000){model.playing&&model.current?.id=="design-ocean"}
   assertNull(model.playlistPlayLoading);ui.runOnIdle{assertEquals(1,model.controller!!.mediaItemCount)}
  }finally{gate.countDown();heldResponses.clear();heldRequests.clear()}
 }

}
