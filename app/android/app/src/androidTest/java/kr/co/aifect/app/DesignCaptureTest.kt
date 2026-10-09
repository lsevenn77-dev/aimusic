package kr.co.aifect.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
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

/** Reproducible UI handoff: real product composables, loopback sample data, no live account. */
class DesignCaptureTest {
 @get:Rule val ui=createEmptyComposeRule()
 private val instrumentation=InstrumentationRegistry.getInstrumentation()
 private val context=instrumentation.targetContext
 private lateinit var screen:ActivityScenario<MainActivity>
 private lateinit var server:ServerSocket
 private lateinit var model:MusicModel
 private val workers=Executors.newCachedThreadPool()
 private val responses=linkedMapOf<String,JSONObject>()
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
  responses["/api/library"]=payload("likes" to arr(song,cover),"collections" to arr(playlist),"follows" to arr(payload("target_id" to "design-peer","kind" to "producer","name" to "하루")))
  responses["/api/history"]=payload("tracks" to arr(second,song,cover))
  responses["/api/catalog"]=payload("tracks" to arr(song,second,cover,duet),"producers" to arr(peer,own),"artists" to arr(payload("id" to "design-artist","name" to "NOVA","image_version" to "sample")))
  responses["/api/discovery"]=responses.getValue("/api/catalog")
  responses["/api/search"]=responses.getValue("/api/catalog")
  responses["/api/community"]=payload("tracks" to arr(cover,duet,song),"producers" to arr(peer,own))
  responses["/api/karaoke"]=payload("tracks" to arr(song,second))
  responses["/api/duets"]=payload("tracks" to arr(duet))
  responses["/api/studio"]=payload("producer" to own,"artists" to JSONArray(),"tracks" to arr(song,second,JSONObject(cover.toString()).put("user_id","design-user")))
  responses["/api/playlists"]=payload("playlists" to arr(playlist))
  responses["/api/playlists/design-list"]=payload("playlist" to playlist,"tracks" to arr(song,second,cover,duet))
  responses["/api/cover-rankings"]=payload("tracks" to arr(JSONObject(cover.toString()).put("rank",1).put("rank_likes",24)),"singers" to arr(peer))
  responses["/api/producers/design-peer"]=payload("profile" to peer,"tracks" to JSONArray(),"covers" to arr(cover,duet),"followers" to 128)
  responses["/api/producers/design-own"]=payload("profile" to own,"tracks" to arr(song,second),"covers" to arr(cover),"followers" to 24)
  responses["/api/artists/design-artist"]=payload("profile" to payload("id" to "design-artist","name" to "NOVA","bio" to "도시의 밤과 푸른 순간을 노래하는 AI 아티스트","image_version" to "sample","user_id" to "design-user"),"tracks" to arr(song,second),"followers" to 86,"can_manage" to true,"gallery" to arr(payload("id" to "photo-1","url" to "/media/artist-gallery/photo-1?v=sample"),payload("id" to "photo-2","url" to "/media/artist-gallery/photo-2?v=sample")))
  for(t in listOf(song,second,cover,duet)){
   val id=t.getString("id")
   responses["/api/tracks/$id"]=payload("track" to t)
   responses["/api/tracks/$id/comments"]=payload("comments" to arr(payload("id" to "sample-comment","name" to "하루","body" to "퇴근길에 계속 듣고 있어요!","user_id" to "design-other","created" to now-300)))
   responses["/api/tracks/$id/covers"]=payload("covers" to arr(cover))
   responses["/api/tracks/$id/lyrics/line"]=payload("line" to payload("text" to "오늘의 마음을 이 노래에 담아요","from" to 0,"until" to 180))
   responses["/api/playback/$id"]=payload("id" to "sample-listen-$id","src" to "/media/sample/audio","duration" to 180,"preview" to false,"bitrate_kbps" to 128)
   responses["/api/tracks/$id/gifts"]=payload("ranking" to rank)
  }
  responses["/api/producers/design-peer/gifts"]=payload("ranking" to rank)
  responses["/api/producers/design-own/gifts"]=payload("ranking" to rank)
  val gifts=JSONArray();listOf("balloon" to "풍선","rose" to "장미","heart" to "하트","coffee" to "커피","note" to "음표","microphone" to "마이크","crown" to "왕관").forEachIndexed{i,(id,name)->gifts.put(payload("id" to id,"name" to name,"gold" to (i+1)*10,"image" to "/assets/gifts/$id.webp"))}
  responses["/api/gold"]=payload("balance" to 500,"free" to payload("balance" to 8,"gift" to payload("id" to "star","name" to "응원별","image" to "/assets/gifts/star.webp"),"rewards" to arr(payload("kind" to "checkin","amount" to 3,"eligible" to true,"claimed" to false),payload("kind" to "listen","amount" to 1,"progress" to 2,"target" to 5,"eligible" to false,"claimed" to false))),"gifts" to gifts,"packs" to JSONArray())
  responses["/api/crews"]=payload("mine" to "design-crew","crews" to arr(crew,payload("id" to "other-crew","name" to "새벽 라디오","description" to "감성적인 목소리가 모이는 곳","level" to 2,"members" to 8,"capacity" to 20,"recruiting" to 1)),"tracks" to arr(cover,song))
  responses["/api/crews/design-crew"]=payload("crew" to crew,"membership" to member,"members" to arr(JSONObject(own.toString()).put("role","member"),JSONObject(peer.toString()).put("role","owner")),"tracks" to arr(cover,song))
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
   val input=c.getInputStream().bufferedReader();val request=input.readLine()?.split(" ")?:return@use;val path=request[1].substringBefore('?');while(!input.readLine().isNullOrEmpty()){}
   val out=c.getOutputStream()
   if(path=="/api/chat/events"){
    out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".toByteArray());repeat(30){out.write("event: heartbeat\ndata: {}\n\n".toByteArray());out.flush();Thread.sleep(1000)}
   }else{
    val type:String;val bytes:ByteArray
    when{path=="/media/sample/audio"->{type="audio/wav";bytes=audio}
     path.startsWith("/media/")->{type="image/png";bytes=photos[if(path.contains("ocean")||path.contains("own")||path.contains("photo-2")||path.contains("crew"))1 else 0]}
     path.startsWith("/assets/gifts/")->{type="image/webp";bytes=giftsBytes[path.substringAfterLast('/')]?:giftsBytes.values.first()}
     else->{type="application/json";bytes=(responses[path]?:payload("ok" to true)).toString().toByteArray()}}
    out.write("HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray());out.write(bytes)
   }
  }}catch(_:IOException){}catch(_:InterruptedException){Thread.currentThread().interrupt()}}}catch(_:IOException){} }
  screen=ActivityScenario.launch(Intent(context,MainActivity::class.java).putExtra("testOrigin","http://127.0.0.1:${server.localPort}"))
  screen.onActivity{model=ViewModelProvider(it)[MusicModel::class.java];it.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
  ui.waitUntil(30000){!model.loading&&model.user!=null&&model.home.isNotEmpty()}
 }
 @After fun close(){if(::screen.isInitialized)screen.close();context.stopService(Intent(context,PlaybackService::class.java));if(::server.isInitialized)server.close();workers.shutdownNow()}
 private fun ready(tag:String){ui.waitUntil(15000){ui.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()}}
 private fun text(value:String){ui.waitUntil(15000){ui.onAllNodesWithText(value).fetchSemanticsNodes().isNotEmpty()}}
 private fun act(block:(MusicModel)->Unit){screen.onActivity{block(model)};ui.waitForIdle()}
 private fun capture(name:String){ui.waitForIdle();instrumentation.waitForIdleSync();Thread.sleep(850);val image=instrumentation.uiAutomation.takeScreenshot();val dir=File(context.getExternalFilesDir(null),"design-2535");dir.mkdirs();FileOutputStream(File(dir,name+".png")).use{image.compress(Bitmap.CompressFormat.PNG,100,it)};image.recycle()}

 @Test fun captureMainScreens(){
  capture("01-home")
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasText("같은 노래, 다른 목소리"));capture("02-home-covers")
  ui.onNodeWithTag("main-tab-3").performClick();ready("music-community-feed");capture("03-community")
  ui.onNodeWithTag("main-tab-2").performClick();ready("sing-scroll");capture("04-sing")
  ui.onNodeWithTag("sing-scroll").performScrollToNode(hasText("나의 다음 무대"));capture("05-sing-songs")
  act{it.selectTab(1)};ready("search-scroll");capture("06-search")
  act{it.library("플레이리스트")};ready("library-scroll");capture("07-library")
  act{it.openList("design-list")};ui.waitUntil(15000){!model.listLoading&&model.listSongs.isNotEmpty()};capture("08-playlist")
  act{it.selectedList=null;it.collection=null;it.selectTab(0);it.play(Song(song),listOf(Song(song),Song(second)))}
  ready("mini-player-lyrics");act{it.fullPlayer=true};capture("09-player")
  act{it.fullPlayer=false;it.controller?.pause();it.openSong(Song(song))};text("밤의 산책");capture("10-song-detail")
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun captureSocialScreens(){
  ui.onNodeWithTag("main-tab-5").performClick();ready("dm-conversation-design-peer");text("내 크루 · 고정");capture("11-message-list")
  ui.onNodeWithTag("dm-conversation-design-peer").performClick();ready("dm-message-sample-dm-3");capture("12-direct-message")
  ui.onNodeWithTag("dm-input").performClick().performTextInput("같이 불러요");capture("13-dm-keyboard");Espresso.closeSoftKeyboard()
  act{it.messagePeer=null;it.communityCrewMode=true;it.communityCrewTarget="design-crew";it.selectTab(3)}
  ready("crew-home-summary");text("크루의 최신 음악");capture("14-crew-home")
  ui.onNodeWithTag("crew-tab-members").performClick();ready("crew-member-design-peer");capture("15-crew-members")
  ui.onNodeWithTag("crew-browse").performClick();ready("crew-search");capture("16-crew-discovery")
  act{it.openCrewMessages("design-crew")};ready("crew-chat-input");text("하루(크루장) 이번 주엔 어떤 노래를 함께 부를까요?");capture("17-crew-chat")
  ui.onNodeWithTag("crew-chat-input").performClick().performTextInput("듀엣 참여할게요");capture("18-crew-keyboard");Espresso.closeSoftKeyboard()
 }
 @Test fun captureProfileAndGiftScreens(){
  ui.onNodeWithTag("main-tab-6").performClick();ready("my-profile-cover-image");ui.onNodeWithTag("my-logout").assertIsDisplayed();capture("19-my-profile")
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-layout-grid"));capture("20-my-music")
  act{it.openProfile("design-peer")};ui.waitUntil(15000){!model.profileLoading&&model.profile!=null};ready("profile-close");capture("21-public-profile")
  ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("profile-gift"));ui.onNodeWithTag("profile-gift").performClick();text("하루(밤산책)님에게 선물");capture("22-person-gift")
  act{it.showGifts=false;it.dismissProfile();it.openProfile("design-artist","artist")};ui.waitUntil(15000){!model.profileLoading&&model.profile?.optString("id")=="design-artist"};capture("23-artist-profile")
  ui.onNodeWithTag("profile-scroll").performScrollToNode(hasText("갤러리"));ui.onNodeWithText("갤러리",useUnmergedTree=true).performClick();ready("artist-photo-gallery");ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("artist-photo-gallery"));capture("24-artist-gallery")
  ui.onAllNodesWithContentDescription("NOVA 갤러리 사진 크게 보기").onFirst().performClick();text("NOVA");capture("25-gallery-photo");Espresso.pressBack()
  act{it.dismissProfile();it.openGifts()};text("내 선물함");capture("26-wallet")
  act{it.showGifts=false;it.showRewards=true};text("오늘의 응원별");capture("27-rewards")
  act{it.showRewards=false;it.showAccount=true};ready("account-actions");capture("28-account-menu")
  act{it.showAccount=false;it.openAccountSettings()};ready("account-settings");capture("29-account-settings")
 }
}
