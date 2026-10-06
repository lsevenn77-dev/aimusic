package kr.co.aifect.app

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.ui.test.*
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.viewModelScope
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import java.io.*
import java.net.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.launch

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
 private val savedMusic=java.util.concurrent.ConcurrentLinkedQueue<String>()
 private val giftPosts=java.util.concurrent.atomic.AtomicInteger(0)
 private val claimPosts=java.util.concurrent.atomic.AtomicInteger(0)
 private val coverDeleted=AtomicBoolean(false)
 private val crewMessages=JSONArray()
 private val directMessages=JSONArray()
 private var crew:JSONObject?=null
 private val crewRole=AtomicReference("member")
 private val crewJoinedSequence=java.util.concurrent.atomic.AtomicLong(1)
 private val requests=java.util.concurrent.ConcurrentLinkedQueue<String>()
 private val heldResponses=java.util.concurrent.ConcurrentHashMap<String,CountDownLatch>()
 private val heldRequests=java.util.concurrent.ConcurrentHashMap<String,CountDownLatch>()
 private val completedHeldResponses=java.util.concurrent.ConcurrentLinkedQueue<String>()
 private val fixtureResponses=java.util.concurrent.ConcurrentHashMap<String,Pair<Int,String>>()
 private val disconnectedResponses=java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
 private val cookieHeaders=java.util.concurrent.ConcurrentHashMap<String,String>()
 private val user=payload("id" to "test-user","name" to "테스트 리스너","email" to "native@example.test","provider" to "email")
 private val song=payload("id" to "fixture","title" to "밤의 산책","artist" to "AIFECT","producer" to "테스트 뮤지션","producer_id" to "person","duration" to 30,"genre" to "City Pop","kind" to "original","likes" to 0,"comments" to 0,"plays" to 0,"lyrics_mode" to "synced","lyrics_access" to "line","karaoke_ready" to true,"description" to "하루 끝에 함께 듣는 음악")
 @Before fun setUp(){
  assertTrue("Only the isolated test package is allowed",context.packageName.endsWith(".test"))
  NativeSession.put(context,"cookie","");NativeSession.put(context,"ticket","")
  server=ServerSocket(0,10,InetAddress.getByName("127.0.0.1"))
  if(testName.methodName=="giftsUseNativeWalletAndConfirmedServerPrice")logged.set(true)
  if(testName.methodName=="createCrewOpensEditorWithoutProfileSetup")logged.set(true)
  val duetTest=testName.methodName=="duetInvitationsAndMiniPlayerLyrics"
  val qualityTest=testName.methodName=="nativePlaybackQualityShowsServerBitrateAndPendingFallback"
  if(qualityTest){logged.set(true);user.put("premium_until",System.currentTimeMillis()/1000+3600)}
  val collectionCacheTest=testName.methodName=="cachedCollectionReopensBeforeFreshResponseAndKeepsFiltersSeparate"
  val accountCacheTest=testName.methodName=="accountChangeClearsCachedPrivateListsBeforeLateResponse"
  val logoutTest=testName.methodName in listOf("logoutServerFailureStillClearsLocalAccountAndPlayback","logoutDisconnectedServerStillClearsLocalAccountAndPlayback","logoutSuccessClearsLocalAccountWithoutAnotherMeRequest")
  if(accountCacheTest||logoutTest){
   logged.set(true);liked.set(true);followed.set(true);user.put("profile_id","own")
   lists.put(payload("id" to "private-list","name" to "내 계정의 비공개 목록","user_id" to "test-user","owner_name" to "테스트 리스너","tracks" to 1,"is_public" to 0))
  }
  if(logoutTest)NativeSession.put(context,"cookie","aifect_session=logout-fixture")
  if(duetTest||testName.methodName=="everySongCanChooseSoloOrDuetInsideRecording")logged.set(true)
  val polishTest=testName.methodName=="photoProfilesAndCoverLayoutsKeepTheRecordingId"
  val uploaderPhotoTest=testName.methodName=="communityUploaderPhotosUseTheProducerInsteadOfArtistOrCover"
  val musicTest=testName.methodName=="streamCommunityNavigationSavesTheCoverItself"||polishTest||uploaderPhotoTest
  if(musicTest){logged.set(true);user.put("profile_id","own")}
  if(uploaderPhotoTest)song.put("producer_image_version","uploader-photo").put("artist_id","ai-fixture").put("has_ai_artist",1).put("has_cover",1).put("cover_version","album-photo")
  if(polishTest){followed.set(true);user.put("image_version","fixture-photo")}
  val navigationTest=testName.methodName in listOf("peopleListsOpenProfilesAndMessagesReturnToInbox","followerProfileMessagesCanBeDismissedAndReopened","delayedDirectMessageLoadKeepsBackAndFollowersResponsive","delayedFollowerProfileOpensImmediatelyAndBackCancelsLateResult","cachedFollowerConversationReopensWhileServerIsDelayed")
  if(navigationTest){logged.set(true);followed.set(true);user.put("profile_id","own")}
  val dmPhotoTest=testName.methodName=="directMessagePhotosOpenThePeerAndReturnToTheSameConversation"
  val cachedDmTest=testName.methodName=="cachedFollowerConversationReopensWhileServerIsDelayed"
  val joinedCrewTest=testName.methodName in listOf("joinedCrewOpensItsChatBeforeDiscoveryAndKeepsMemberMusicLinks","crewHistoryWithoutJoinedSequenceKeepsChatShellButBlocksPrivateMessages","cachedCrewReopensPublicSummaryBeforeFreshMembershipAndChatWritesKeepFeedWarm","crewRejoinOnlyShowsHistoryAfterTheNewJoinedSequence","accountChangeDropsCrewSummaryAndLatePrivateHistory")
  if(testName.methodName in listOf("joinedCrewOpensItsChatBeforeDiscoveryAndKeepsMemberMusicLinks","crewHistoryWithoutJoinedSequenceKeepsChatShellButBlocksPrivateMessages"))crewJoinedSequence.set(0)
  val crewDiscoveryTest=testName.methodName=="crewDiscoveryForNonMembersKeepsSearchAndCreation"
  val socialPriorityTest=dmPhotoTest||joinedCrewTest||crewDiscoveryTest
  if(socialPriorityTest){logged.set(true);user.put("profile_id","own");user.put("image_version","fixture-photo")}
  if(dmPhotoTest||cachedDmTest)directMessages.put(payload("id" to "dm-other-1","request_id" to "00000000-0000-0000-0000-000000000001","body" to "어제 녹음 좋았어요","sender_id" to "other","recipient_id" to "test-user","sequence" to 1,"created" to System.currentTimeMillis()/1000,"read_at" to 0))
  if(joinedCrewTest){
   crew=payload("id" to "crew-fixture","name" to "우리의 노래","description" to "함께 듣고 부르는 크루","interests" to "Ballad","level" to 1,"xp" to 10,"next_xp" to 100,"capacity" to 10,"members" to 2,"recruiting" to 1)
   crewRole.set("manager")
   crewMessages.put(payload("id" to "crew-other-1","request_id" to "00000000-0000-0000-0000-000000000002","body" to "크루에서 함께해요","user_id" to "other","profile_id" to "person","name" to "커버 가수","role" to "manager","sequence" to 1,"created" to System.currentTimeMillis()/1000,"kind" to "message"))
   crewMessages.put(payload("id" to "crew-other-2","request_id" to "00000000-0000-0000-0000-000000000003","body" to "기대돼요","user_id" to "other","profile_id" to "person","name" to "커버 가수","role" to "manager","sequence" to 2,"created" to System.currentTimeMillis()/1000,"kind" to "message"))
  }
  val menuTest=testName.methodName=="accountMenuLibraryOrderAndCompactRewards"
  val improvementsTest=testName.methodName in listOf("profileAndCoverDeletionStayNative","crewChatAndDirectMessagesStayNative")||menuTest
  if(improvementsTest||testName.methodName=="accountSettingsKeepEmailReadOnlyAndChangeNicknamePassword"||testName.methodName=="recordingDraftListOpensSavedReviewWithoutMicrophone"){logged.set(true);user.put("profile_id","own")}
  val rankingTest=testName.methodName=="coverRankingDiscoveryAndCommentModeration"
  val cover=JSONObject(song.toString()).put("id","cover-fixture").put("kind","cover").put("producer","커버 가수").put("rank",1).put("rank_likes",3).put("likes",3).put("original_id","fixture").put("karaoke_ready",false)
  if(duetTest||testName.methodName=="duetSongOpensWithoutGenderChoice")song.put("performance_mode","duet")
  if(duetTest)cover.put("cover_mode","duet").put("duet_part","male").put("duet_open",1).put("user_id","other")
  if(rankingTest){logged.set(true);song.put("covers",1);comments.put(payload("id" to "comment-1","name" to "다른 리스너","body" to "이 목소리 좋네요","user_id" to "someone","can_delete" to true,"can_report" to true))}
  val adTest=testName.methodName=="fiveCompletedSongsPauseForOneAdAndResume"
  if(adTest){logged.set(true);song.put("duration",3);context.getSharedPreferences("listening_ads",0).edit().clear().commit()}
  val audio=wav(if(adTest)3 else 30)
  val photo=ByteArrayOutputStream().apply{val b=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);b.eraseColor(android.graphics.Color.rgb(51,64,88));b.compress(Bitmap.CompressFormat.PNG,100,this);b.recycle()}.toByteArray()
  workers.execute { while(!server.isClosed)try {val socket=server.accept();workers.execute {try {socket.use connection@{ c->
   val input=c.getInputStream().buffered()
   fun header():String {val data=ByteArrayOutputStream();while(true){val byte=input.read();if(byte<0||byte==10)break;if(byte!=13)data.write(byte)};return data.toString("US-ASCII")}
   val request=header().split(" ");if(request.size<2)return@connection;val method=request[0];val path=request[1].substringBefore("?");requests.add(request[1]);var length=0
   while(true){val line=header();if(line.isEmpty())break;if(line.startsWith("Content-Length:",true))length=line.substringAfter(":").trim().toInt();if(line.startsWith("Cookie:",true))cookieHeaders[path]=line.substringAfter(":").trim()}
   val bytes=ByteArray(length);var offset=0;while(offset<length){val n=input.read(bytes,offset,length-offset);if(n<0)break;offset+=n}
   val body=runCatching{JSONObject(String(bytes,Charsets.UTF_8))}.getOrDefault(JSONObject())
   val fixedResponse=fixtureResponses[path]
   heldResponses[path]?.let{gate->heldRequests[path]?.countDown();gate.await(20,TimeUnit.SECONDS);completedHeldResponses.add(path)}
   if(path in disconnectedResponses)return@connection
   if(path=="/api/chat/events"){
    val out=c.getOutputStream();out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".toByteArray());out.flush()
    var previous=""
    try{repeat(20){val revision=crewMessages.length().toString()+":"+directMessages.length()+":"+crewRole.get();val event=if(revision==previous)"heartbeat" else "change";previous=revision;out.write("event: $event\ndata: {}\n\n".toByteArray());out.flush();Thread.sleep(100)}}catch(e:InterruptedException){Thread.currentThread().interrupt()}
    return@connection
   }
   var cookie="";var status=200;var content="application/json"
   val result:ByteArray=when {
    path.startsWith("/media/producer/")->{content="image/png";photo}
    path.startsWith("/media/")->{content="audio/wav";audio}
    else -> {
     val response=when {
      fixedResponse!=null->{status=fixedResponse.first;JSONObject(fixedResponse.second)}
      path=="/api/gold"->payload("balance" to (10-giftPosts.get()),"free" to payload("balance" to (claimPosts.get()*3),"gift" to payload("id" to "star","name" to "응원별","image" to "/assets/gifts/star.webp"),"rewards" to JSONArray().put(payload("kind" to "checkin","amount" to 3,"eligible" to true,"claimed" to (claimPosts.get()>0))).apply{if(menuTest)listOf("cover","listen","comment1","comment2","comment3").forEach{put(payload("kind" to it,"amount" to 1,"target" to if(it=="listen")5 else 1,"progress" to 0,"eligible" to false,"claimed" to false))}}),"gifts" to JSONArray().put(payload("id" to "balloon","name" to "풍선","gold" to 1,"price" to 10,"image" to "/assets/gifts/balloon.webp")))
      path=="/api/gifts/free/claim"->{claimPosts.incrementAndGet();payload("balance" to 3,"gift" to payload("id" to "star","name" to "응원별","image" to "/assets/gifts/star.webp"),"rewards" to JSONArray().put(payload("kind" to "checkin","amount" to 3,"eligible" to true,"claimed" to true)))}
      path=="/api/tracks/fixture/gifts"&&method=="POST"->{check(body.optString("gift_type")=="balloon");check(body.optString("request_id").length==36);giftPosts.incrementAndGet();payload("balance" to 9,"gift" to payload("type" to "balloon","gold" to 1))}
      path=="/api/tracks/fixture/gifts"->payload("ranking" to JSONArray())
      path=="/api/account/nickname"->{if(method=="PUT"){user.put("name",body.optString("name"));payload("user" to user)}else payload("available" to !request[1].contains(java.net.URLEncoder.encode("중복아이디","UTF-8")),"message" to "이미 사용 중인 아이디입니다.")}
      path=="/api/account/password"->{check(body.optString("current_password")=="fixture-password-123");check(body.optString("new_password")=="changed-password-456");cookie="Set-Cookie: aifect_session=rotated-fixture; Path=/; HttpOnly\r\n";payload("ok" to true)}
      path=="/api/me/profile"->{if(method=="PUT")user.put("name",body.optString("name"));payload("profile" to payload("id" to "own","name" to user.optString("name"),"bio" to "","image_version" to if(polishTest||socialPriorityTest)"fixture-photo" else ""),"followers" to if(navigationTest)JSONArray().put(payload("id" to "person","user_id" to "other","name" to "커버 가수")).put(payload("id" to null,"user_id" to "listener","name" to "기본 리스너"))else JSONArray(),"follower_count" to if(navigationTest)2 else 0,"following_count" to if(navigationTest)1 else 0)}
      path=="/api/followers/listener"->payload("profile" to payload("id" to null,"user_id" to "listener","name" to "기본 리스너"))
      path=="/api/crews"->{if(method=="POST"){crew=payload("id" to "crew-fixture","name" to body.optString("name"),"description" to body.optString("description"),"interests" to body.optString("interests"),"level" to 1,"xp" to 0,"next_xp" to 100,"capacity" to 10,"members" to 1,"recruiting" to 1);payload("crew" to crew)}else payload("crews" to if(crew==null)JSONArray()else JSONArray().put(crew),"tracks" to if(joinedCrewTest)JSONArray().put(cover) else JSONArray(),"mine" to if(crew==null)null else "crew-fixture")}
      path=="/api/crews/crew-fixture"->payload("crew" to crew,"membership" to crewFixtureMembership(joinedCrewTest),"members" to JSONArray().put(payload("id" to "person","user_id" to "other","name" to "커버 가수","image_version" to if(socialPriorityTest)"fixture-photo" else "","role" to crewRole.get())).apply{if(joinedCrewTest)put(payload("id" to "own","user_id" to user.optString("id"),"name" to user.optString("name"),"image_version" to "fixture-photo","role" to "member"))},"tracks" to if(joinedCrewTest)JSONArray().put(cover) else JSONArray())
      path=="/api/crews/crew-fixture/members/person"->{if(method=="PATCH")crewRole.set(body.getString("role"));payload("ok" to true)}
      path=="/api/crews/crew-fixture/messages"->{if(method=="POST"){val next=crewMessages.length()+1;crewMessages.put(payload("id" to "msg-$next","body" to body.optString("body"),"user_id" to user.optString("id"),"profile_id" to "own","name" to user.optString("name"),"role" to if(joinedCrewTest)"member" else "owner","sequence" to next,"created" to System.currentTimeMillis()/1000,"request_id" to body.optString("request_id")))};crewFixtureHistory(joinedCrewTest).put("message",if(method=="POST")crewMessages.optJSONObject(crewMessages.length()-1)else JSONObject.NULL)}
      path=="/api/dm/person"->{if(method=="POST"){val next=directMessages.length()+1;directMessages.put(payload("id" to "dm-$next","body" to body.optString("body"),"sender_id" to "test-user","recipient_id" to "other","sequence" to next,"created" to System.currentTimeMillis()/1000,"request_id" to body.optString("request_id")))};if(method=="PATCH")for(i in 0 until directMessages.length()){val msg=directMessages.getJSONObject(i);if(msg.optString("recipient_id")=="test-user")msg.put("read_at",System.currentTimeMillis()/1000)};payload("message" to if(method=="POST")directMessages.optJSONObject(directMessages.length()-1)else null,"peer" to payload("id" to "person","name" to "커버 가수","image_version" to if(dmPhotoTest)"fixture-photo" else ""),"messages" to directMessages,"has_more" to false)}
      path=="/api/uploads/cover-fixture"&&method=="DELETE"->{coverDeleted.set(true);payload("ok" to true)}
      path=="/api/me"->payload("user" to if(logged.get())user else null,"membership" to if(qualityTest&&logged.get())payload("plan" to "premium","premium_until" to user.optLong("premium_until"))else JSONObject(),"providers" to JSONArray(),"emailEnabled" to true)
      path=="/api/auth/login"->{logged.set(true);cookie="Set-Cookie: aifect_session=fixture; Path=/; HttpOnly\r\n";payload("user" to user)}
      path=="/api/auth/logout"->{logged.set(false);cookie="Set-Cookie: aifect_session=; Path=/; Max-Age=0\r\n";payload("ok" to true)}
      path=="/api/auth/google/nonce"->{cookie="Set-Cookie: aifect_google_oauth=nonce-fixture; Path=/; HttpOnly\r\n";payload("nonce" to "fixture-nonce")}
      path=="/api/auth/google/token"->{cookie="Set-Cookie: aifect_google_oauth=; Path=/; Max-Age=0\r\nSet-Cookie: aifect_session=google-fixture; Path=/; HttpOnly\r\n";payload("user" to user)}
      path=="/api/library"->payload("likes" to if(liked.get())JSONArray().put(if(accountCacheTest)JSONObject(song.toString()).put("id","private-saved").put("title","내 계정만 저장한 음악") else if(rankingTest)cover else song) else JSONArray(),"collections" to lists,"follows" to if(followed.get())JSONArray().put(payload("target_id" to "person","kind" to "producer","name" to "커버 가수")) else JSONArray())
      path=="/api/cover-rankings"->payload("tracks" to if(request[1].contains("kind=singers"))JSONArray() else JSONArray().put(cover),"singers" to if(request[1].contains("kind=singers"))JSONArray().put(payload("id" to "person","name" to "커버 가수","rank" to 1,"rank_likes" to 3,"ranked_covers" to 1)) else JSONArray())
      path=="/api/producers/person/follow"->{followed.set(method=="PUT");payload("ok" to true)}
      path=="/api/producers/person"->payload("profile" to payload("id" to "person","name" to "커버 가수","user_id" to "other","image_version" to if(polishTest||socialPriorityTest)"fixture-photo" else ""),"covers" to JSONArray().put(cover),"tracks" to JSONArray(),"followers" to if(followed.get())1 else 0)
      path=="/api/tracks/cover-fixture/like"->{liked.set(method=="PUT");payload("ok" to true)}
      path=="/api/tracks/cover-fixture/comments"->payload("comments" to comments)
      path=="/api/comments/comment-1/report"->{reported.set(true);comments.getJSONObject(0).put("reported",1).put("can_report",false);payload("ok" to true)}
      path=="/api/comments/comment-1"&&method=="DELETE"->{comments.remove(0);payload("ok" to true)}
      path=="/api/tracks/cover-fixture"->payload("track" to cover)
      path=="/api/playback/cover-fixture"->payload("id" to "listen-cover","src" to "/media/cover-fixture/preview","duration" to 30,"preview" to true,"bitrate_kbps" to 128,"high_quality_pending" to false)
      path=="/api/duets"->payload("tracks" to if(duetTest)JSONArray().put(cover) else JSONArray())
      path=="/api/karaoke/fixture"->payload("track" to song,"words" to JSONArray(),"mr" to "/media/fixture/mr")
      path=="/api/duets/cover-fixture"->payload("track" to song,"words" to JSONArray(),"mr" to "/media/cover-fixture/stream","duet" to payload("parent_id" to "cover-fixture","part" to "female","partner" to cover))
      path=="/api/history"->payload("tracks" to JSONArray())
      path=="/api/studio"->payload("producer" to null,"artists" to JSONArray(),"tracks" to if((improvementsTest||polishTest)&&!coverDeleted.get())JSONArray().put(JSONObject(cover.toString()).put("status","published").put("user_id","test-user"))else JSONArray())
      path=="/api/dm"->payload("conversations" to if(navigationTest||dmPhotoTest)JSONArray().put(payload("id" to "person","name" to "커버 가수","last_message" to if(dmPhotoTest)"어제 녹음 좋았어요" else "다음에 같이 불러요","updated" to System.currentTimeMillis()/1000,"image_version" to if(dmPhotoTest)"fixture-photo" else "","unread" to if(dmPhotoTest)1 else 0))else JSONArray())
      path=="/api/community"&&musicTest->payload("tracks" to (if(request[1].contains("kind=cover"))JSONArray().put(cover) else JSONArray().put(song).put(cover)),"producers" to JSONArray())
      path=="/api/catalog"&&collectionCacheTest&&(request[1].contains("genre=cache-a")||request[1].contains("genre=cache-b"))->{val a=request[1].contains("genre=cache-a");payload("tracks" to JSONArray().put(JSONObject(song.toString()).put("id",if(a)"cache-a" else "cache-b").put("title",if(a)"캐시 장르 A의 음악" else "새로운 장르 B의 음악")),"producers" to JSONArray())}
      path=="/api/catalog"||path=="/api/discovery"||path=="/api/search"||path=="/api/community"||path=="/api/karaoke"->payload("tracks" to JSONArray().put(song),"producers" to JSONArray())
      path=="/api/playlists"&&method=="POST"->{body.optJSONArray("track_ids")?.let{ids->for(i in 0 until ids.length())savedMusic.add(ids.getString(i))};val p=payload("id" to "list-1","name" to body.optString("name"),"user_id" to "test-user","owner_name" to "테스트 리스너","tracks" to 0);lists.put(p);payload("id" to "list-1")}
      path=="/api/playlists"->payload("playlists" to JSONArray())
      path=="/api/playlists/list-1"->payload("playlist" to lists.getJSONObject(0),"tracks" to JSONArray())
      path=="/api/tracks/fixture/like"->{liked.set(method=="PUT");payload("ok" to true)}
      path=="/api/tracks/fixture/comments"->{if(method=="POST")comments.put(payload("id" to "comment-1","name" to "테스트 리스너","body" to body.optString("body"),"user_id" to "test-user"));payload("comments" to comments,"id" to "comment-1")}
      path=="/api/tracks/fixture/lyrics/line"->payload("line" to payload("text" to "밤길을 함께 걸어요","from" to 0,"until" to 30))
      path=="/api/tracks/fixture"->payload("track" to song)
      path=="/api/tracks/fixture/covers"->payload("covers" to JSONArray())
      path=="/api/playback/fixture"->payload("id" to "listen-1","src" to "/media/fixture/preview","duration" to if(adTest)3 else 30,"preview" to !adTest,"bitrate_kbps" to 128,"high_quality_pending" to false)
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
  heldResponses.values.forEach{it.countDown()}
  finishNativeRooms()
  if(::screen.isInitialized)screen.close()
  context.stopService(Intent(context,PlaybackService::class.java))
  if(::server.isInitialized)server.close();workers.shutdownNow()
 }
 private fun finishNativeRooms(){
  val instrument=InstrumentationRegistry.getInstrumentation();val pending=AtomicBoolean(true)
  val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3)
  while(pending.get()&&System.nanoTime()<until){
   instrument.runOnMainSync{
    val monitor=ActivityLifecycleMonitorRegistry.getInstance()
    val rooms=Stage.values().filter{it!=Stage.DESTROYED}.flatMap{monitor.getActivitiesInStage(it).toList()}.filterIsInstance<kr.co.aifect.app.karaoke.KaraokeActivity>().distinct()
    pending.set(rooms.any{!it.isDestroyed});rooms.filter{!it.isFinishing}.forEach{it.finish()}
   }
   instrument.waitForIdleSync();if(pending.get())Thread.sleep(50)
  }
 }
 private fun waitText(text:String){ui.waitUntil(30_000){ui.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()}}
 private fun crewFixtureMembership(joined:Boolean)=payload("role" to if(joined)"member" else "owner","crew_id" to "crew-fixture","user_id" to user.optString("id"),"joined_sequence" to crewJoinedSequence.get(),"joined" to System.currentTimeMillis()/1000-60)
 private fun crewFixtureHistory(joined:Boolean)=payload("messages" to JSONArray().apply{for(i in 0 until crewMessages.length()){val message=crewMessages.getJSONObject(i);if(message.optLong("sequence")>=crewJoinedSequence.get())put(JSONObject(message.toString()))}},"has_more" to false,"membership" to crewFixtureMembership(joined),"member_roles" to JSONArray().put(payload("profile_id" to "person","role" to crewRole.get())).put(payload("profile_id" to "own","role" to if(joined)"member" else "owner")))
 private fun assertCrewChatShellBlocksSending(){
  for(tag in listOf("crew-chat-title","chat-history","crew-chat-composer","crew-chat-input","crew-chat-send")){
   try{ui.onNodeWithTag(tag).assertIsDisplayed()}
   catch(failure:AssertionError){
    val bounds=runCatching{ui.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot}.getOrNull()
    val root=runCatching{ui.onRoot().fetchSemanticsNode().boundsInRoot}.getOrNull()
    val config=context.resources.configuration
    throw AssertionError("Crew shell tag '$tag' must stay displayed at ${config.screenWidthDp}dp / font ${config.fontScale}; bounds=$bounds, root=$root",failure)
   }
  }
  for(tag in listOf("crew-chat-input","crew-chat-send")){
   try{ui.onNodeWithTag(tag).assertIsNotEnabled()}
   catch(failure:AssertionError){throw AssertionError("Crew shell tag '$tag' must stay disabled before fresh membership authorizes private history",failure)}
  }
 }
 private fun screenshot(name:String){
  ui.waitForIdle();InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(300)
  val bitmap=InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
  FileOutputStream(File(context.getExternalFilesDir(null),name)).use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
 }
 @Test fun duetInvitationsAndMiniPlayerLyrics(){
  ui.onNodeWithText("바로 듣기").performClick();waitText("밤길을 함께 걸어요")
  ui.onNodeWithTag("mini-player-lyrics").assertIsDisplayed()
  val before=ui.onNodeWithTag("mini-player-lyrics").fetchSemanticsNode().boundsInRoot
  val model=AtomicReference<MusicModel>()
  screen.onActivity{a->model.set(androidx.lifecycle.ViewModelProvider(a)[MusicModel::class.java]);model.get().controller?.pause()}
  for(text in listOf("짧은 가사","한 줄보다 길어도 재생바의 높이를 바꾸지 않는 아주 긴 가사입니다. ".repeat(5),"첫 줄\n둘째 줄","♪")){
   ui.runOnIdle{model.get().lyricsAccess="full";model.get().lyricRows=listOf(0.0 to text,100.0 to "다음 줄은 재생바에 표시하지 않아요")}
   ui.onNodeWithTag("mini-player-current-lyric",useUnmergedTree=true).assertTextEquals(text)
   val layouts=mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
   ui.onNodeWithTag("mini-player-current-lyric",useUnmergedTree=true).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult){it(layouts)}
   assertEquals("Playback lyrics occupy exactly one line",1,layouts.single().lineCount)
   assertEquals("Lyric changes must not move the playback bar",before.height,ui.onNodeWithTag("mini-player-lyrics").fetchSemanticsNode().boundsInRoot.height,1f)
   ui.onNodeWithText("다음 줄은 재생바에 표시하지 않아요").assertDoesNotExist()
  }
  screenshot("native-mini-lyrics-single-line-2512.png")
  ui.onNodeWithText("부르기").performClick();waitText("참여를 기다리는 듀엣")
  ui.onNodeWithTag("sing-scroll").performScrollToNode(hasText("듀엣 참여"));waitText("듀엣 참여");ui.onNodeWithText("듀엣 참여").performClick()
  val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);var loaded=false
  while(System.nanoTime()<until){try{androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`("recording-primary"))).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isEnabled()));loaded=true;break}catch(_:Throwable){Thread.sleep(100)}}
  assertTrue("Duet room opens without a gender choice",loaded)
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("듀엣")).perform(androidx.test.espresso.action.ViewActions.scrollTo()).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`("duet-legend"))).perform(androidx.test.espresso.action.ViewActions.scrollTo()).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("● 내 파트")).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("● 파트너 파트")).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
  while(!requests.any{it=="/media/cover-fixture/stream"}&&System.nanoTime()<until)Thread.sleep(100)
  assertTrue(requests.any{it=="/api/duets/cover-fixture"});assertTrue(requests.any{it=="/media/cover-fixture/stream"});assertFalse(requests.any{it=="/media/fixture/mr"})
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
  screenshot("native-duet-room-259.png")
 }
 @Test fun everySongCanChooseSoloOrDuetInsideRecording(){
  ui.onNodeWithText("부르기").performClick();waitText("목소리를 발견하는 곳")
  ui.onNodeWithTag("sing-scroll").performScrollToNode(hasText("이 곡 부르기"));ui.onNodeWithText("이 곡 부르기").performClick()
  fun waitMode(label:String,selected:Boolean=false){val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);var ready=false;while(System.nanoTime()<until){try{val view=androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText(label));view.check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isEnabled()));if(selected)view.check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isSelected()));ready=true;break}catch(_:Throwable){Thread.sleep(100)}};assertTrue("Recording mode '$label' must become ready${if(selected)" and selected after the room switches" else ""}",ready)}
  waitMode("듀엣")
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("듀엣")).perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click())
  waitMode("듀엣",selected=true)
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("듀엣")).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isSelected()))
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("솔로")).perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click())
  waitMode("솔로",selected=true)
  androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("솔로")).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isSelected()))
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun nativeTabsRenderWithoutWebViewOrMicrophone(){
  screen.onActivity { a->
   fun hasWeb(v:View):Boolean = v is WebView || (v is ViewGroup && (0 until v.childCount).any { hasWeb(v.getChildAt(it)) })
   assertFalse(hasWeb(a.window.decorView))
  }
  screenshot("native-listen.png")
  ui.onNodeWithTag("listen-scroll").performScrollToNode(hasText("이번엔 내 목소리로"));screenshot("native-listen-shelves.png")
  ui.onNodeWithTag("listen-tabs").performScrollToNode(hasText("발견"));ui.onNodeWithText("발견").performClick();waitText("발견하는 즐거움");screenshot("native-search.png")
  ui.onNodeWithText("부르기").performClick();waitText("목소리를 발견하는 곳");screenshot("native-sing.png")
  ui.onNodeWithTag("main-tab-3").performClick();waitText("지금 함께 듣는 음악");ui.onNodeWithText("크루",useUnmergedTree=true).performClick();waitText("함께할 크루");waitText("새 크루 만들기");ui.onNodeWithTag("crew-search").assertIsDisplayed();screenshot("native-community.png")
  ui.onNodeWithTag("main-tab-6").performClick();waitText("음악을 듣기만 해도 좋아요");screenshot("native-library.png")
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
  ui.onAllNodesWithText("삭제").onLast().performClick();ui.waitUntil(10000){comments.length()==0};ui.onNodeWithText("삭제된 댓글입니다.").assertDoesNotExist();ui.onNodeWithText("이 목소리 좋네요").assertDoesNotExist()
  screenshot("native-cover-comments.png")
 }
 @Test fun accountMenuLibraryOrderAndCompactRewards(){
  ui.onNodeWithTag("main-tab-6").performClick();ui.onNodeWithText("내 플레이리스트").performClick();waitText("내 플레이리스트")
  val chips=ui.onNodeWithTag("chips-플레이리스트")
  listOf("플레이리스트","최근 감상","좋아요","내 커버곡","내 제작곡","팔로잉","팔로워").forEach{label->chips.performScrollToNode(hasText(label));ui.onNode(hasText(label) and hasAnyAncestor(hasTestTag("chips-플레이리스트"))).assertExists()}
  ui.onNodeWithText("오늘의 응원별 보상").assertDoesNotExist()
  ui.onNodeWithTag("account-menu").performClick();waitText("DM 보기")
  ui.onNodeWithText("공개 닉네임").assertDoesNotExist();ui.onNodeWithText("내 정산").assertExists();ui.onNodeWithText("로그아웃").assertExists()
  screenshot("native-account-menu-258.png")
  ui.onNodeWithText("DM 보기").performScrollTo().performClick();ui.onNodeWithTag("account-actions").assertDoesNotExist()
  androidx.test.espresso.Espresso.pressBack()
  ui.onNodeWithTag("account-menu").performClick();waitText("오늘의 응원별")
  ui.onNodeWithText("오늘의 응원별").performScrollTo().performClick();waitText("별 받기")
  ui.onNodeWithTag("account-actions").assertDoesNotExist()
  val rewards=ui.onNodeWithTag("rewards-list").fetchSemanticsNode().boundsInRoot
  assertTrue("Rewards must leave the top of the app visible",rewards.height<context.resources.displayMetrics.heightPixels*.83f)
  val card=ui.onNodeWithTag("reward-checkin").fetchSemanticsNode().boundsInRoot
  val action=ui.onNodeWithText("별 받기").fetchSemanticsNode().boundsInRoot
  assertTrue("Reward action uses the right side of its card",action.right>card.right-card.width*.12f)
  screenshot("native-rewards-258.png")
  ui.onNodeWithTag("rewards-list").performScrollToNode(hasText("3번째 댓글"));ui.onNodeWithText("3번째 댓글").assertIsDisplayed()
  ui.onNodeWithTag("rewards-list").performScrollToIndex(0)
  ui.onNodeWithText("별 받기").performScrollTo().performClick();waitText("받음");assertEquals(1,claimPosts.get())
 }
 @Test fun giftsUseNativeWalletAndConfirmedServerPrice(){
  ui.onNodeWithText("바로 듣기").performClick()
  ui.waitUntil(30_000){ui.onAllNodesWithContentDescription("일시정지").fetchSemanticsNodes().isNotEmpty()}
  ui.onAllNodesWithText("밤의 산책").onLast().performClick()
  waitText("별 · 골드 선물로 응원하기")
  ui.onNodeWithText("별 · 골드 선물로 응원하기").performScrollTo().performClick()
  ui.waitUntil(30000){runCatching{ui.onNodeWithTag("gift-list").performScrollToNode(hasText("오늘의 응원별 보상 받기"));true}.getOrDefault(false)};ui.onNodeWithText("오늘의 응원별 보상 받기").performClick();waitText("별 받기");ui.onNodeWithText("별 받기").performScrollTo().performClick();waitText("받음");androidx.test.espresso.Espresso.pressBack();ui.onNodeWithText("별 · 골드 선물로 응원하기").performScrollTo().performClick();waitText("풍선")
  ui.onNodeWithText("풍선").performScrollTo().performClick()
  ui.onNodeWithText("풍선 1 G 보내기").performScrollTo().performClick()
  assertEquals(0,giftPosts.get())
  ui.onNodeWithText("1 G 보내기").performClick();waitText("풍선 선물을 보냈어요")
  assertEquals(1,giftPosts.get());assertEquals(1,claimPosts.get())
  screenshot("native-gifts.png")
 }
 @Test fun profileAndCoverDeletionStayNative(){
  ui.onNodeWithTag("main-tab-6").performClick();waitText("프로필 수정");ui.onNodeWithText("프로필 수정").performClick();waitText("공개 닉네임")
  ui.onNodeWithText("공개 닉네임").performTextReplacement("달빛 리스너")
  ui.onNodeWithText("프로필 저장").performScrollTo().performClick()
  ui.waitUntil(10000){user.optString("name")=="달빛 리스너"}
  ui.waitUntil(10000){ui.onAllNodesWithText("공개 닉네임").fetchSemanticsNodes().isEmpty()}
  waitText("달빛 리스너");assertEquals("달빛 리스너",user.optString("name"))
  screenshot("native-profile-library.png");ui.onNodeWithText("내 플레이리스트").performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("chips-플레이리스트").fetchSemanticsNodes().isNotEmpty()}
  ui.onNodeWithTag("chips-플레이리스트").performScrollTo().performScrollToNode(hasText("내 커버곡"));ui.onNodeWithText("내 커버곡").performScrollTo().performClick()
  ui.waitUntil(30000){runCatching{ui.onNodeWithTag("library-scroll").performScrollToNode(hasText("커버곡 삭제"));true}.getOrDefault(false)}
  ui.onNodeWithText("커버곡 삭제").performSemanticsAction(SemanticsActions.OnClick){it()};waitText("커버곡을 삭제할까요?")
  ui.onNodeWithText("취소").performClick();assertFalse(coverDeleted.get())
  ui.onNodeWithText("커버곡 삭제").performSemanticsAction(SemanticsActions.OnClick){it()};waitText("커버곡을 삭제할까요?");ui.onNodeWithText("삭제",useUnmergedTree=true).performClick();ui.waitUntil(10000){coverDeleted.get()}
  ui.waitUntil(30000){runCatching{ui.onNodeWithTag("library-scroll").performScrollToNode(hasText("아직 올린 커버곡이 없어요"));true}.getOrDefault(false)};screenshot("native-cover-deletion.png")
 }
 @Test fun crewChatAndDirectMessagesStayNative(){
  ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick();waitText("새 크루 만들기");ui.onNodeWithText("새 크루 만들기").performClick()
  ui.onNodeWithText("크루 이름").performTextInput("우리의 노래")
  ui.onNodeWithText("크루 소개").performTextInput("함께 듣고 불러요")
  ui.onNodeWithText("관심사 · 예: Ballad, K-POP").performTextInput("Ballad")
  ui.onNodeWithText("저장").performClick();waitText("우리의 노래");ui.onNodeWithTag("crew-chat-title").assertIsDisplayed()
  ui.onNodeWithTag("crew-chat-input").assertIsDisplayed().performTextInput("오늘도 노래해요")
  ui.onNodeWithTag("crew-chat-input").performImeAction();waitText("테스트 리스너(크루장) 오늘도 노래해요");ui.waitUntil(10000){crewMessages.length()==1};androidx.test.espresso.Espresso.closeSoftKeyboard();assertTrue(requests.any{it.startsWith("/api/chat/events?crew=")});screenshot("native-crew-chat.png")
  ui.onNodeWithTag("crew-tab-members").performClick();ui.onNodeWithTag("crew-member-person").performClick();waitText("크루 직책");ui.onNodeWithText("매니저").performClick();ui.onNodeWithText("직책 저장").performClick();ui.waitUntil(10000){crewRole.get()=="manager"};ui.onNodeWithTag("crew-member-person").performClick();ui.onNodeWithText("프로필 보기").performClick();waitText("메시지");ui.onAllNodesWithText("메시지").onLast().performScrollTo().performClick()
  ui.onNodeWithTag("dm-input").assertIsDisplayed().performTextInput("함께 부를까요?");ui.onNodeWithTag("dm-input").performImeAction();waitText("함께 부를까요?");ui.waitUntil(10000){directMessages.length()==1};ui.waitUntil(10000){requests.any{it.startsWith("/api/chat/events?peer=")}};androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithTag("dm-message-dm-1").assertIsDisplayed();screenshot("native-dm.png")
  ui.onNodeWithTag("dm-back").performClick();ui.waitUntil(10000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isNotEmpty()};ui.onNodeWithTag("profile-message").assertIsDisplayed();ui.onAllNodesWithTag("dm-panel").assertCountEquals(0)
 }
 @Test fun peopleListsOpenProfilesAndMessagesReturnToInbox(){
  ui.onNodeWithTag("main-tab-6").performClick();waitText("팔로잉 1");ui.onNodeWithText("팔로잉 1").performClick();waitText("커버 가수");ui.onNodeWithText("커버 가수").performClick();waitText("팔로워 1 · 공개 음악 1")
  assertTrue(requests.contains("/api/producers/person"));androidx.test.espresso.Espresso.pressBack()
  ui.onNodeWithTag("main-tab-6").performClick();ui.onNodeWithText("팔로워 2").performClick();waitText("기본 리스너")
  ui.onNodeWithTag("follower-other").performClick();waitText("팔로워 1 · 공개 음악 1");androidx.test.espresso.Espresso.pressBack()
  ui.onNodeWithTag("follower-listener").performClick();waitText("이 탭에 공개된 음악이 없어요");assertTrue(requests.contains("/api/followers/listener"));ui.onAllNodesWithText("팔로우",useUnmergedTree=true).assertCountEquals(0);androidx.test.espresso.Espresso.pressBack()
  ui.onNodeWithTag("main-tab-5").performClick();waitText("다음에 같이 불러요");ui.onNodeWithText("다음에 같이 불러요").performClick();ui.waitUntil(10000){ui.onAllNodesWithTag("dm-back").fetchSemanticsNodes().isNotEmpty()};ui.onNodeWithTag("dm-back").performClick();waitText("다음에 같이 불러요")
  ui.onNodeWithText("다음에 같이 불러요").performClick();ui.waitUntil(10000){ui.onAllNodesWithTag("dm-back").fetchSemanticsNodes().isNotEmpty()};androidx.test.espresso.Espresso.pressBack();waitText("다음에 같이 불러요");screenshot("native-people-inbox.png")
 }
 @Test fun followerProfileMessagesCanBeDismissedAndReopened(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-6").performClick();waitText("팔로워 2");ui.onNodeWithText("팔로워 2").performClick();waitText("기본 리스너")
  repeat(3){cycle->
   ui.onNodeWithTag("follower-other").performClick();waitText("팔로워 1 · 공개 음악 1")
   ui.onNodeWithTag("profile-message").performScrollTo().performClick()
   ui.waitUntil(10000){ui.onAllNodesWithTag("dm-input").fetchSemanticsNodes().isNotEmpty()}
   screen.onActivity{assertTrue(model.get().showMessages);assertEquals("person",model.get().messagePeer);assertNull(model.get().profile)}
   if(cycle==1)ui.onNodeWithTag("dm-back").performClick() else androidx.test.espresso.Espresso.pressBack()
   ui.waitUntil(10000){ui.onAllNodesWithTag("dm-panel").fetchSemanticsNodes().isEmpty()}
   ui.onNodeWithTag("profile-close").assertIsDisplayed();waitText("팔로워 1 · 공개 음악 1")
   screen.onActivity{assertFalse("A dismissed sheet must release its dialog",model.get().showMessages);assertNull(model.get().messagePeer);assertEquals("person",model.get().profile?.optString("id"))}
   ui.onNodeWithTag("profile-close").performClick()
   // Exercise real touches on both the same producer and a different listener after dismissal.
   ui.onNodeWithTag("follower-listener").performClick();waitText("이 탭에 공개된 음악이 없어요")
   screen.onActivity{assertEquals("listener",model.get().profile?.optString("user_id"))}
   ui.onNodeWithTag("profile-close").performClick()
   ui.onNodeWithTag("follower-other").performClick();waitText("팔로워 1 · 공개 음악 1")
   screen.onActivity{assertEquals("person",model.get().profile?.optString("id"))}
   androidx.test.espresso.Espresso.pressBack()
  }
  ui.onNodeWithTag("main-tab-0").performClick();waitText("바로 듣기")
  ui.onNodeWithTag("main-tab-6").performClick();waitText("프로필 수정")
  screenshot("native-followers-dm-repeated-back.png")
 }
 @Test fun delayedDirectMessageLoadKeepsBackAndFollowersResponsive(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-6").performClick();waitText("팔로워 2");ui.onNodeWithText("팔로워 2").performClick();waitText("기본 리스너")
  ui.onNodeWithTag("follower-other").performClick();waitText("팔로워 1 · 공개 음악 1")
  val requested=CountDownLatch(1);val response=CountDownLatch(1);heldRequests["/api/dm/person"]=requested;heldResponses["/api/dm/person"]=response
  try{
   ui.onNodeWithTag("profile-message").performScrollTo().performClick()
   ui.waitUntil(10000){requested.count==0L}
   ui.onNodeWithTag("dm-back").assertIsDisplayed()
   androidx.test.espresso.Espresso.pressBack()
   ui.waitUntil(5000){ui.onAllNodesWithTag("dm-panel").fetchSemanticsNodes().isEmpty()}
   ui.onNodeWithTag("profile-close").assertIsDisplayed().performClick()
   ui.onNodeWithTag("follower-listener").performClick()
   ui.waitUntil(5000){ui.onAllNodesWithText("이 탭에 공개된 음악이 없어요").fetchSemanticsNodes().isNotEmpty()}
   screen.onActivity{assertEquals("listener",model.get().profile?.optString("user_id"));assertFalse(model.get().showMessages);assertNull(model.get().messagePeer)}
   assertEquals("Back and another profile must respond before the slow DM request completes",1L,response.count)
   assertFalse("The fixture must still be holding the DM response",completedHeldResponses.contains("/api/dm/person"))
   ui.onNodeWithTag("profile-close").performClick();ui.onNodeWithTag("main-tab-0").performClick();waitText("바로 듣기")
  }finally{response.countDown();heldResponses.remove("/api/dm/person");heldRequests.remove("/api/dm/person")}
  ui.onNodeWithTag("main-tab-6").performClick();waitText("팔로워 2");ui.onNodeWithText("팔로워 2").performClick();waitText("기본 리스너")
  ui.onNodeWithTag("follower-other").performClick();waitText("팔로워 1 · 공개 음악 1")
  ui.onNodeWithTag("profile-message").performScrollTo().performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("dm-peer-profile-person").fetchSemanticsNodes().isNotEmpty()}
  screen.onActivity{assertEquals("person",model.get().messagePeer);assertTrue(model.get().showMessages);assertNull(model.get().profile)}
  androidx.test.espresso.Espresso.pressBack()
  ui.waitUntil(10000){ui.onAllNodesWithTag("dm-panel").fetchSemanticsNodes().isEmpty()}
  ui.onNodeWithTag("profile-close").assertIsDisplayed().performClick()
  ui.onNodeWithTag("follower-listener").performClick();waitText("이 탭에 공개된 음악이 없어요");ui.onNodeWithTag("profile-close").performClick()
 }
 @Test fun delayedFollowerProfileOpensImmediatelyAndBackCancelsLateResult(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-6").performClick();waitText("팔로워 2");ui.onNodeWithText("팔로워 2").performClick();waitText("기본 리스너")
  val busyRequest=CountDownLatch(1);val busyResponse=CountDownLatch(1);val profileRequest=CountDownLatch(1);val profileResponse=CountDownLatch(1)
  heldRequests["/api/gold"]=busyRequest;heldResponses["/api/gold"]=busyResponse
  heldRequests["/api/producers/person"]=profileRequest;heldResponses["/api/producers/person"]=profileResponse
  try{
   ui.runOnIdle{model.get().action{model.get().api.call("/api/gold")}}
   assertTrue("An unrelated action must be in flight",busyRequest.await(10,TimeUnit.SECONDS))
   ui.onNodeWithTag("follower-other").performClick()
   assertTrue("Profile navigation must start even during an unrelated action",profileRequest.await(5,TimeUnit.SECONDS))
   ui.waitUntil(3000){ui.onAllNodesWithTag("profile-loading").fetchSemanticsNodes().isNotEmpty()}
   ui.onNodeWithTag("profile-close").assertIsDisplayed()
   screen.onActivity{assertTrue(model.get().profileLoading);assertTrue(model.get().busy);assertEquals("person",model.get().profile?.optString("id"))}
   assertFalse("The loading profile must appear before the response",completedHeldResponses.contains("/api/producers/person"))
   androidx.test.espresso.Espresso.pressBack()
   ui.waitUntil(3000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isEmpty()}
   screen.onActivity{assertNull(model.get().profile);assertFalse(model.get().profileLoading)}
  }finally{
   profileResponse.countDown();busyResponse.countDown()
   heldResponses.remove("/api/producers/person");heldRequests.remove("/api/producers/person");heldResponses.remove("/api/gold");heldRequests.remove("/api/gold")
  }
  ui.waitUntil(10000){completedHeldResponses.contains("/api/producers/person")&&completedHeldResponses.contains("/api/gold")}
  ui.waitUntil(10000){!model.get().busy}
  ui.onAllNodesWithTag("profile-close").assertCountEquals(0)
  screen.onActivity{assertNull("A canceled profile response must not reopen its sheet",model.get().profile)}
  ui.onNodeWithTag("follower-listener").performClick();waitText("이 탭에 공개된 음악이 없어요");ui.onNodeWithTag("profile-close").performClick()
  ui.onNodeWithTag("follower-other").performClick();waitText("팔로워 1 · 공개 음악 1");ui.onNodeWithTag("profile-message").assertIsEnabled()
 }
 @Test fun cachedFollowerConversationReopensWhileServerIsDelayed(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-6").performClick();waitText("팔로워 2");ui.onNodeWithText("팔로워 2").performClick();waitText("기본 리스너")
  ui.onNodeWithTag("follower-other").performClick();waitText("팔로워 1 · 공개 음악 1");ui.onNodeWithTag("profile-message").performScrollTo().performClick()
  waitText("어제 녹음 좋았어요");ui.onNodeWithTag("dm-message-dm-other-1").assertIsDisplayed()
  val draft="다시 돌아와서 보낼 말";ui.onNodeWithTag("dm-input").performTextInput(draft);androidx.test.espresso.Espresso.closeSoftKeyboard()
  androidx.test.espresso.Espresso.pressBack()
  ui.waitUntil(10000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isNotEmpty()}
  ui.waitUntil(10000){NativeChatCache.peek(context,"test-user")?.threads?.get("person")?.draft==draft}
  repeat(2){round->
   if(round==1){NativeChatCache.forgetMemory(context,"test-user");assertNull("The next opening must read device storage",NativeChatCache.peek(context,"test-user"))}
   completedHeldResponses.removeAll{it=="/api/dm/person"}
   val requested=CountDownLatch(1);val response=CountDownLatch(1);heldRequests["/api/dm/person"]=requested;heldResponses["/api/dm/person"]=response
   try{
    ui.onNodeWithTag("profile-message").performScrollTo().performClick()
    ui.waitUntil(10000){requested.count==0L}
    ui.waitUntil(3000){ui.onAllNodesWithTag("dm-message-dm-other-1").fetchSemanticsNodes().isNotEmpty()}
    ui.onNodeWithTag("dm-message-dm-other-1").assertIsDisplayed();ui.onNodeWithTag("dm-input").assertTextEquals(draft)
    assertFalse("Cached history and draft must appear before the refresh completes",completedHeldResponses.contains("/api/dm/person"))
    screen.onActivity{assertTrue(model.get().showMessages);assertEquals("person",model.get().messagePeer)}
    // Close while refresh remains held so it cannot overwrite the persisted fixture.
    androidx.test.espresso.Espresso.pressBack()
    ui.waitUntil(10000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isNotEmpty()};ui.onNodeWithTag("profile-message").assertIsDisplayed()
   }finally{response.countDown();heldResponses.remove("/api/dm/person");heldRequests.remove("/api/dm/person")}
   ui.waitUntil(10000){completedHeldResponses.contains("/api/dm/person")}
  }
 }
 @Test fun directMessagePhotosOpenThePeerAndReturnToTheSameConversation(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-5").performClick();waitText("어제 녹음 좋았어요")
  ui.onNodeWithTag("dm-list-profile-person").assertIsDisplayed().performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isNotEmpty()}
  screen.onActivity{assertEquals("person",model.get().profile?.optString("id"));assertNull("The avatar opens a profile, not a conversation",model.get().messagePeer)}
  assertTrue(requests.contains("/api/producers/person"));assertFalse(requests.contains("/api/producers/other"))
  ui.onNodeWithTag("profile-close").performClick();waitText("어제 녹음 좋았어요")
  ui.onNodeWithTag("dm-conversation-person").performClick();waitText("어제 녹음 좋았어요");ui.onNodeWithTag("dm-message-dm-other-1").assertIsDisplayed()
  ui.onNodeWithTag("dm-peer-profile-person").assertIsDisplayed().performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isNotEmpty()}
  screen.onActivity{assertEquals("person",model.get().profile?.optString("id"));assertEquals("person",model.get().messagePeer)}
  ui.onNodeWithTag("profile-close").performClick();waitText("어제 녹음 좋았어요");ui.onNodeWithTag("dm-message-dm-other-1").assertIsDisplayed();ui.onNodeWithTag("dm-back").assertIsDisplayed()
  ui.onNodeWithTag("dm-message-profile-dm-other-1").assertIsDisplayed().performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isNotEmpty()}
  screen.onActivity{assertEquals("person",model.get().profile?.optString("id"));assertEquals("person",model.get().messagePeer)}
  androidx.test.espresso.Espresso.pressBack();waitText("어제 녹음 좋았어요");ui.onNodeWithTag("dm-message-dm-other-1").assertIsDisplayed()
  ui.onNodeWithTag("dm-peer-profile-person").performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("profile-message").fetchSemanticsNodes().isNotEmpty()}
  ui.waitUntil(10000){!model.get().profileLoading}
  ui.onNodeWithTag("profile-message").performScrollTo().performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("dm-panel").fetchSemanticsNodes().size==1}
  screen.onActivity{assertFalse("Messages from a profile on the DM tab reuse the embedded conversation",model.get().showMessages);assertEquals("person",model.get().messagePeer);assertNull(model.get().profile)}
  ui.onNodeWithTag("dm-message-dm-other-1").assertIsDisplayed()
  ui.onNodeWithTag("dm-input").assertIsDisplayed().performTextInput("프사에서 돌아왔어요");ui.onNodeWithTag("dm-input").performImeAction()
  ui.waitUntil(10000){directMessages.length()==2};waitText("프사에서 돌아왔어요");androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithTag("dm-message-dm-2").assertIsDisplayed()
  assertTrue(requests.any{it.startsWith("/api/chat/events?peer=person")});assertTrue(requests.any{it.startsWith("/media/producer/person?")})
  screenshot("native-social-dm-photo-profile.png")
  ui.onNodeWithTag("dm-back").performClick();waitText("어제 녹음 좋았어요")
  screen.onActivity{assertNull(model.get().messagePeer)}
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun joinedCrewOpensItsChatBeforeDiscoveryAndKeepsMemberMusicLinks(){
  assertEquals("Migration 0027 preserves existing members with an explicit zero boundary",0L,crewJoinedSequence.get())
  ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick()
  waitText("커버 가수(매니저) 크루에서 함께해요")
  // No scrolling or second crew selection is allowed before the chat is visible.
  ui.onNodeWithTag("crew-chat-title").assertIsDisplayed();ui.onNodeWithTag("chat-history").assertIsDisplayed()
  ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertIsDisplayed();ui.onNodeWithTag("crew-chat-composer").assertIsDisplayed()
  ui.onAllNodesWithTag("crew-search").assertCountEquals(0);ui.onAllNodesWithTag("crew-create").assertCountEquals(0)
  assertTrue(requests.contains("/api/crews/crew-fixture"));assertTrue(requests.any{it.startsWith("/api/crews/crew-fixture/messages")})
  ui.onNodeWithTag("crew-chat-input").performClick().performTextInput("바로 이어서 이야기해요")
  val imeVisible=AtomicBoolean()
  ui.waitUntil(10000){screen.onActivity{a->imeVisible.set(androidx.core.view.ViewCompat.getRootWindowInsets(a.window.decorView)?.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())==true)};imeVisible.get()}
  ui.onNodeWithTag("chat-history").assertIsDisplayed()
  val history=ui.onNodeWithTag("chat-history").fetchSemanticsNode().boundsInRoot
  assertTrue("An open keyboard must leave at least 80dp for crew conversation history",history.height>=80f*context.resources.displayMetrics.density-1f)
  ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertIsDisplayed();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertIsDisplayed()
  ui.onNodeWithTag("crew-chat-composer").assertIsDisplayed();ui.onNodeWithTag("crew-chat-input").assertIsDisplayed();ui.onNodeWithTag("crew-chat-send").assertIsDisplayed()
  screenshot("native-social-crew-ime-${context.resources.configuration.screenWidthDp}dp.png")
  ui.onNodeWithTag("crew-chat-input").performImeAction()
  ui.waitUntil(10000){crewMessages.length()==3};waitText("테스트 리스너) 바로 이어서 이야기해요");androidx.test.espresso.Espresso.closeSoftKeyboard()
  assertTrue(requests.any{it.startsWith("/api/chat/events?crew=crew-fixture")});screenshot("native-social-crew-chat-first.png")
  ui.onNodeWithTag("crew-tab-members").performClick();ui.onNodeWithTag("crew-member-person").assertIsDisplayed().performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("profile-close").fetchSemanticsNodes().isNotEmpty()};assertTrue(requests.contains("/api/producers/person"));ui.onNodeWithTag("profile-close").performClick()
  ui.onNodeWithTag("crew-tab-music").performClick();waitText("밤의 산책");ui.onNodeWithTag("crew-scroll").performScrollToNode(hasContentDescription("커뮤니티 곡 재생"));ui.onNodeWithContentDescription("커뮤니티 곡 재생").performClick()
  ui.waitUntil(10000){requests.contains("/api/playback/cover-fixture")};assertFalse(requests.contains("/api/playback/fixture"))
  ui.onNodeWithTag("crew-scroll").performScrollToNode(hasTestTag("crew-tab-chat"));ui.onNodeWithTag("crew-tab-chat").performClick();waitText("테스트 리스너) 바로 이어서 이야기해요")
  ui.onNodeWithTag("crew-browse").performClick();ui.onNodeWithTag("crew-search").assertIsDisplayed().performTextInput("다른 크루")
  val encoded=URLEncoder.encode("다른 크루","UTF-8");ui.waitUntil(10000){requests.any{it.startsWith("/api/crews?q=")&&it.contains(encoded)}}
  androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithTag("crew-return-home").performClick()
  waitText("테스트 리스너) 바로 이어서 이야기해요");ui.onNodeWithTag("crew-chat-composer").assertIsDisplayed();ui.onAllNodesWithTag("crew-search").assertCountEquals(0)
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun crewHistoryWithoutJoinedSequenceKeepsChatShellButBlocksPrivateMessages(){
  assertEquals(0L,crewJoinedSequence.get())
  val detailPath="/api/crews/crew-fixture";val historyPath="$detailPath/messages"
  val invalidHistory=crewFixtureHistory(true).apply{getJSONObject("membership").remove("joined_sequence")}
  assertFalse(invalidHistory.getJSONObject("membership").has("joined_sequence"))
  fixtureResponses[historyPath]=200 to invalidHistory.toString()
  val detailRequested=CountDownLatch(1);val detailResponse=CountDownLatch(1)
  heldRequests[detailPath]=detailRequested;heldResponses[detailPath]=detailResponse
  try{
   ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick()
   ui.waitUntil(5000){detailRequested.count==0L}
   waitText("크루 가입 상태를 다시 확인해주세요.")
   screenshot("native-crew-missing-boundary-pending-${context.resources.configuration.screenWidthDp}dp-font${context.resources.configuration.fontScale}.png")
   assertCrewChatShellBlocksSending()
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertDoesNotExist()
   assertEquals("Missing boundary must block private history before independent public detail completes",1L,detailResponse.count)
   detailResponse.countDown();heldResponses.remove(detailPath);heldRequests.remove(detailPath)
   ui.waitUntil(10000){completedHeldResponses.contains(detailPath)&&ui.onAllNodesWithTag("crew-home-summary").fetchSemanticsNodes().isNotEmpty()}
   ui.onNodeWithTag("crew-home-summary").assertIsDisplayed()
   screenshot("native-crew-missing-boundary-public-${context.resources.configuration.screenWidthDp}dp-font${context.resources.configuration.fontScale}.png")
   assertCrewChatShellBlocksSending()
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist()
   // An absent field is not defaulted to zero. Fresh explicit legacy zero restores history and sending.
   fixtureResponses[historyPath]=200 to crewFixtureHistory(true).toString()
   ui.onNodeWithText("다시 불러오기").performClick()
   waitText("커버 가수(매니저) 크루에서 함께해요");ui.onNodeWithTag("crew-chat-composer").assertIsDisplayed()
   ui.onNodeWithTag("crew-chat-input").assertIsEnabled().performTextInput("권한 확인 뒤 남기는 이야기");ui.onNodeWithTag("crew-chat-send").assertIsEnabled()
   ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertIsDisplayed()
  }finally{detailResponse.countDown();heldResponses.remove(detailPath);heldRequests.remove(detailPath);fixtureResponses.remove(historyPath)}
 }
 @Test fun cachedCrewReopensPublicSummaryBeforeFreshMembershipAndChatWritesKeepFeedWarm(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick()
  waitText("커버 가수(매니저) 크루에서 함께해요")
  ui.waitUntil(10000){!model.get().refreshing&&model.get().peekCrewDetail("crew-fixture")!=null&&model.get().api.peek("/api/community")!=null}
  ui.onNodeWithTag("main-tab-0").performClick();waitText("바로 듣기")
  val detailPath="/api/crews/crew-fixture";val historyPath="$detailPath/messages"
  val detailRequested=CountDownLatch(1);val historyRequested=CountDownLatch(1);val detailResponse=CountDownLatch(1);val historyResponse=CountDownLatch(1)
  heldRequests[detailPath]=detailRequested;heldRequests[historyPath]=historyRequested;heldResponses[detailPath]=detailResponse;heldResponses[historyPath]=historyResponse
  try{
   ui.onNodeWithTag("main-tab-3").performClick()
   ui.waitUntil(5000){detailRequested.count==0L&&historyRequested.count==0L}
   ui.onNodeWithTag("crew-home-summary").assertIsDisplayed();ui.onNodeWithText("우리의 노래").assertIsDisplayed()
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertDoesNotExist()
   assertCrewChatShellBlocksSending()
   ui.onAllNodesWithTag("crew-leave").assertCountEquals(0)
   if(ui.onAllNodesWithTag("crew-join").fetchSemanticsNodes().isNotEmpty())ui.onNodeWithTag("crew-join").assertIsNotEnabled()
   assertEquals("Public crew information must display before fresh detail authorizes membership",1L,detailResponse.count)
   assertEquals("Cached private conversation history must stay hidden until fresh authorization",1L,historyResponse.count)
   assertFalse(completedHeldResponses.contains(detailPath));assertFalse(completedHeldResponses.contains(historyPath))
   historyResponse.countDown();heldResponses.remove(historyPath);heldRequests.remove(historyPath)
   waitText("커버 가수(매니저) 크루에서 함께해요");ui.onNodeWithTag("crew-chat-composer").assertIsDisplayed()
   ui.onNodeWithTag("crew-chat-input").assertIsEnabled()
   assertEquals("Fresh history membership can authorize chat while independent detail remains pending",1L,detailResponse.count)
   assertFalse(completedHeldResponses.contains(detailPath))
   detailResponse.countDown();heldResponses.remove(detailPath);heldRequests.remove(detailPath)
   ui.waitUntil(10000){completedHeldResponses.contains(detailPath)}
   val revision=java.util.concurrent.atomic.AtomicLong();screen.onActivity{revision.set(model.get().api.readRevision)}
   ui.onNodeWithTag("crew-chat-input").performTextInput("캐시가 유지되는 대화");ui.onNodeWithTag("crew-chat-input").performImeAction()
   ui.waitUntil(10000){crewMessages.length()==3};waitText("테스트 리스너) 캐시가 유지되는 대화");androidx.test.espresso.Espresso.closeSoftKeyboard()
   ui.waitUntil(10000){ui.onAllNodesWithText("전송 중…").fetchSemanticsNodes().isEmpty()}
   screen.onActivity{assertEquals("A crew message does not invalidate unrelated public music",revision.get(),model.get().api.readRevision);assertNotNull(model.get().api.peek("/api/community"))}
   val markedRead=CountDownLatch(1)
   val markError=AtomicReference<Throwable?>()
   ui.runOnIdle{model.get().viewModelScope.launch{try{model.get().api.call("/api/dm/person","PATCH",payload("through_sequence" to 1))}catch(e:Exception){markError.set(e)}finally{markedRead.countDown()}}}
   ui.waitUntil(10000){markedRead.count==0L}
   assertNull("The isolated fixture must complete the real read-receipt request",markError.get())
   screen.onActivity{assertEquals("DM read receipts keep the community browse cache warm",revision.get(),model.get().api.readRevision);assertNotNull(model.get().api.peek("/api/community"))}
  }finally{detailResponse.countDown();historyResponse.countDown();heldResponses.remove(detailPath);heldRequests.remove(detailPath);heldResponses.remove(historyPath);heldRequests.remove(historyPath)}
 }
 @Test fun crewRejoinOnlyShowsHistoryAfterTheNewJoinedSequence(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick();waitText("커버 가수(매니저) 크루에서 함께해요")
  ui.waitUntil(10000){!model.get().refreshing&&model.get().peekCrewDetail("crew-fixture")!=null}
  ui.onNodeWithTag("main-tab-0").performClick();waitText("바로 듣기")
  crewJoinedSequence.set(3)
  crewMessages.put(payload("id" to "crew-other-3","request_id" to "00000000-0000-0000-0000-000000000004","body" to "새 가입 이후 대화","user_id" to "other","profile_id" to "person","name" to "커버 가수","role" to "manager","sequence" to 3,"created" to System.currentTimeMillis()/1000,"kind" to "message"))
  val detailPath="/api/crews/crew-fixture";val historyPath="$detailPath/messages"
  val detailRequested=CountDownLatch(1);val historyRequested=CountDownLatch(1);val detailResponse=CountDownLatch(1);val historyResponse=CountDownLatch(1)
  val changedBoundaryRequested=CountDownLatch(1);val changedBoundaryResponse=CountDownLatch(1)
  heldRequests[detailPath]=detailRequested;heldRequests[historyPath]=historyRequested;heldResponses[detailPath]=detailResponse;heldResponses[historyPath]=historyResponse
  try{
   ui.onNodeWithTag("main-tab-3").performClick();ui.waitUntil(5000){detailRequested.count==0L&&historyRequested.count==0L}
   ui.onNodeWithTag("crew-home-summary").assertIsDisplayed();assertCrewChatShellBlocksSending()
   ui.onAllNodesWithTag("crew-leave").assertCountEquals(0)
   if(ui.onAllNodesWithTag("crew-join").fetchSemanticsNodes().isNotEmpty())ui.onNodeWithTag("crew-join").assertIsNotEnabled()
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertDoesNotExist()
   historyResponse.countDown();heldResponses.remove(historyPath);heldRequests.remove(historyPath)
   waitText("커버 가수(매니저) 새 가입 이후 대화");ui.onNodeWithTag("crew-chat-composer").assertIsDisplayed()
   assertEquals(1L,detailResponse.count)
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertDoesNotExist()
   detailResponse.countDown();heldResponses.remove(detailPath);heldRequests.remove(detailPath)
   ui.waitUntil(10000){completedHeldResponses.contains(detailPath)};ui.waitForIdle()
   ui.onNodeWithText("커버 가수(매니저) 새 가입 이후 대화").assertIsDisplayed();ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertDoesNotExist()
   val freshHistoryBefore=requests.count{it==historyPath}
   heldRequests[historyPath]=changedBoundaryRequested;heldResponses[historyPath]=changedBoundaryResponse
   crewJoinedSequence.set(4)
   crewMessages.put(payload("id" to "crew-other-4","request_id" to "00000000-0000-0000-0000-000000000005","body" to "다시 가입한 뒤 새 이야기","user_id" to "other","profile_id" to "person","name" to "커버 가수","role" to "manager","sequence" to 4,"created" to System.currentTimeMillis()/1000,"kind" to "message"))
   ui.waitUntil(10000){changedBoundaryRequested.count==0L}
   assertEquals(1L,changedBoundaryResponse.count)
   changedBoundaryResponse.countDown();heldResponses.remove(historyPath);heldRequests.remove(historyPath)
   waitText("커버 가수(매니저) 다시 가입한 뒤 새 이야기")
   ui.waitUntil(10000){requests.count{it==historyPath}>freshHistoryBefore}
   ui.onNodeWithText("커버 가수(매니저) 다시 가입한 뒤 새 이야기").assertIsDisplayed();ui.onNodeWithText("커버 가수(매니저) 새 가입 이후 대화").assertDoesNotExist()
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertDoesNotExist()
  }finally{detailResponse.countDown();historyResponse.countDown();changedBoundaryResponse.countDown();heldResponses.remove(detailPath);heldRequests.remove(detailPath);heldResponses.remove(historyPath);heldRequests.remove(historyPath)}
 }
 @Test fun accountChangeDropsCrewSummaryAndLatePrivateHistory(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick();waitText("커버 가수(매니저) 크루에서 함께해요")
  ui.waitUntil(10000){!model.get().refreshing&&model.get().peekCrewDetail("crew-fixture")!=null}
  val detailPath="/api/crews/crew-fixture";val historyPath="$detailPath/messages";val directoryPath="/api/crews"
  screen.onActivity{fixtureResponses[detailPath]=200 to model.get().peekCrewDetail("crew-fixture")!!.put("membership",crewFixtureMembership(true)).toString()}
  fixtureResponses[historyPath]=200 to crewFixtureHistory(true).toString()
  val detailRequested=CountDownLatch(1);val historyRequested=CountDownLatch(1);val directoryRequested=CountDownLatch(1)
  val detailResponse=CountDownLatch(1);val historyResponse=CountDownLatch(1);val directoryResponse=CountDownLatch(1)
  ui.onNodeWithTag("main-tab-0").performClick();waitText("바로 듣기")
  heldRequests[detailPath]=detailRequested;heldRequests[historyPath]=historyRequested;heldResponses[detailPath]=detailResponse;heldResponses[historyPath]=historyResponse
  try{
   ui.onNodeWithTag("main-tab-3").performClick();ui.waitUntil(5000){detailRequested.count==0L&&historyRequested.count==0L}
   ui.onNodeWithTag("crew-home-summary").assertIsDisplayed();assertCrewChatShellBlocksSending()
   heldRequests[directoryPath]=directoryRequested;heldResponses[directoryPath]=directoryResponse
   fixtureResponses[directoryPath]=200 to payload("crews" to JSONArray(),"tracks" to JSONArray(),"mine" to null).toString()
   user.put("id","next-user").put("name","새 계정 리스너").put("profile_id","next-profile")
   ui.runOnIdle{model.get().viewModelScope.launch{model.get().loadMe(loadPrivate=false)}}
   ui.waitUntil(5000){model.get().user?.optString("id")=="next-user"}
   screen.onActivity{assertFalse(model.get().communityCrewMode);assertNull(model.get().lastKnownCrewId);assertNull(model.get().peekCrewDetail("crew-fixture"));assertNull(model.get().peekCrewDirectory())}
   ui.onAllNodesWithTag("crew-home-summary").assertCountEquals(0);ui.onAllNodesWithTag("crew-chat-composer").assertCountEquals(0)
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist()
   assertEquals("Account cleanup must happen before account A's private response finishes",1L,historyResponse.count)
   ui.onNodeWithText("크루",useUnmergedTree=true).performClick();ui.waitUntil(5000){directoryRequested.count==0L}
   ui.onAllNodesWithTag("crew-home-summary").assertCountEquals(0);ui.onAllNodesWithTag("crew-chat-composer").assertCountEquals(0)
   detailResponse.countDown();historyResponse.countDown();heldResponses.remove(detailPath);heldRequests.remove(detailPath);heldResponses.remove(historyPath);heldRequests.remove(historyPath)
   ui.waitUntil(10000){completedHeldResponses.contains(detailPath)&&completedHeldResponses.contains(historyPath)};ui.waitForIdle()
   ui.onAllNodesWithTag("crew-home-summary").assertCountEquals(0);ui.onAllNodesWithTag("crew-chat-composer").assertCountEquals(0)
   ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist();ui.onNodeWithText("커버 가수(매니저) 기대돼요").assertDoesNotExist()
   assertEquals("The next account's discovery stays pending independently of previous responses",1L,directoryResponse.count)
   directoryResponse.countDown();heldResponses.remove(directoryPath);heldRequests.remove(directoryPath)
   ui.waitUntil(10000){ui.onAllNodesWithTag("crew-create").fetchSemanticsNodes().isNotEmpty()}
   screen.onActivity{assertEquals("next-user",model.get().user?.optString("id"));assertNull(model.get().lastKnownCrewId);assertNull(model.get().peekCrewDetail("crew-fixture"))}
   ui.onAllNodesWithTag("crew-chat-composer").assertCountEquals(0);ui.onNodeWithText("커버 가수(매니저) 크루에서 함께해요").assertDoesNotExist()
  }finally{detailResponse.countDown();historyResponse.countDown();directoryResponse.countDown();listOf(detailPath,historyPath,directoryPath).forEach{heldResponses.remove(it);heldRequests.remove(it);fixtureResponses.remove(it)}}
 }
 @Test fun crewDiscoveryForNonMembersKeepsSearchAndCreation(){
  assertNull(crew);ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick()
  ui.waitUntil(10000){ui.onAllNodesWithTag("crew-create").fetchSemanticsNodes().isNotEmpty()}
  ui.onNodeWithTag("crew-search").assertIsDisplayed().performTextInput("발라드")
  val encoded=URLEncoder.encode("발라드","UTF-8");ui.waitUntil(10000){requests.any{it.startsWith("/api/crews?q=")&&it.contains(encoded)}}
  androidx.test.espresso.Espresso.closeSoftKeyboard();ui.onNodeWithTag("crew-create").assertIsDisplayed().performClick();waitText("새 크루")
  ui.onNodeWithText("크루 이름").performTextInput("새로운 음악 모임");ui.onNodeWithText("크루 소개").performTextInput("음악으로 만나요")
  ui.onNodeWithText("관심사 · 예: Ballad, K-POP").performTextInput("Ballad");ui.onNodeWithText("저장").performClick()
  ui.waitUntil(10000){crew?.optString("name")=="새로운 음악 모임"&&ui.onAllNodesWithTag("crew-chat-composer").fetchSemanticsNodes().isNotEmpty()}
  ui.onNodeWithTag("crew-chat-composer").assertIsDisplayed();ui.onAllNodesWithTag("crew-search").assertCountEquals(0);ui.onAllNodesWithTag("crew-create").assertCountEquals(0)
  screenshot("native-social-new-crew-chat.png")
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
  ui.onNodeWithTag("main-tab-6").performClick();ui.onNodeWithText("로그인").performClick()
  ui.onNodeWithText("이메일").performTextInput("native@example.test")
  ui.onNodeWithText("비밀번호 · 12자 이상").performTextInput("fixture-password-123")
  ui.onNodeWithText("이메일로 로그인").performClick();waitText("테스트 리스너")
  ui.onNodeWithText("내 플레이리스트").performClick();waitText("새로 만들기");ui.onNodeWithText("새로 만들기").performClick()
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
  ui.onNodeWithTag("listen-tabs").performScrollToNode(hasText("발견"));ui.onNodeWithText("발견").performClick()
  ui.onNodeWithTag("global-search").performTextInput("밤")
  waitText("곡 · 1")
  assertTrue(requests.any{it.startsWith("/api/search?q=")})
  ui.onNodeWithContentDescription("검색 지우기").performClick()
  ui.onNodeWithText("기분을 올려줘").performClick()
  waitText("전체 재생")
  ui.waitUntil(10000){requests.any{it=="/api/discovery?mood=energy"}}
  ui.onNodeWithText("밤의 산책").assertExists()
  ui.onNodeWithContentDescription("목록 닫기").performClick()
  ui.onNodeWithTag("main-tab-0").performClick()
  ui.onNodeWithText("추천").performClick();ui.onNodeWithText("오늘의 새로운 발견").assertExists()
  ui.onNodeWithText("차트").performClick();waitText("AIFECT 인기곡")
  ui.onNodeWithText("최신곡").performClick();waitText("가장 최근에 공개된 제작곡부터 만나보세요")
  ui.onNodeWithText("밤의 산책").assertExists()
 }
 @Test fun cachedCollectionReopensBeforeFreshResponseAndKeepsFiltersSeparate(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.waitUntil(10000){!model.get().refreshing}
  val first="/api/catalog?section=tracks&genre=cache-a";val second="/api/catalog?section=tracks&genre=cache-b"
  ui.runOnIdle{model.get().browseCollection("장르 A",first)}
  waitText("캐시 장르 A의 음악");ui.waitUntil(10000){!model.get().collectionBusy&&model.get().api.peek(first)!=null}
  screen.onActivity{assertEquals(listOf("cache-a"),model.get().collection?.tracks?.map{song->song.id})}
  ui.onNodeWithContentDescription("목록 닫기").performClick();ui.waitUntil(5000){ui.onAllNodesWithTag("collection-scroll").fetchSemanticsNodes().isEmpty()}
  val requested=CountDownLatch(1);val response=CountDownLatch(1)
  heldRequests["/api/catalog"]=requested;heldResponses["/api/catalog"]=response
  try{
   ui.runOnIdle{model.get().browseCollection("장르 A",first)}
   ui.waitUntil(5000){requested.count==0L}
   ui.onNodeWithText("캐시 장르 A의 음악").assertIsDisplayed()
   screen.onActivity{assertTrue(model.get().collectionBusy);assertEquals(first,model.get().collection?.path);assertEquals(listOf("cache-a"),model.get().collection?.tracks?.map{song->song.id})}
   assertEquals("Cached music must appear while the fresh response remains held",1L,response.count)
   assertFalse(completedHeldResponses.contains("/api/catalog"))
   ui.runOnIdle{model.get().browseCollection("장르 B",second)}
   ui.waitUntil(5000){requests.contains(second)}
   ui.onNodeWithText("캐시 장르 A의 음악").assertDoesNotExist()
   screen.onActivity{assertTrue(model.get().collectionBusy);assertEquals(second,model.get().collection?.path);assertTrue("A different genre cannot borrow the previous genre's cache",model.get().collection?.tracks?.isEmpty()==true)}
   assertEquals(1L,response.count);assertFalse(completedHeldResponses.contains("/api/catalog"))
   response.countDown();heldResponses.remove("/api/catalog");heldRequests.remove("/api/catalog")
   waitText("새로운 장르 B의 음악");ui.waitUntil(10000){!model.get().collectionBusy}
   screen.onActivity{assertEquals(listOf("cache-b"),model.get().collection?.tracks?.map{song->song.id})}
   ui.onNodeWithText("캐시 장르 A의 음악").assertDoesNotExist()
  }finally{response.countDown();heldResponses.remove("/api/catalog");heldRequests.remove("/api/catalog")}
 }
 @Test fun accountChangeClearsCachedPrivateListsBeforeLateResponse(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.waitUntil(10000){!model.get().refreshing&&model.get().likes.any{it.id=="private-saved"}&&model.get().playlists.any{it.optString("id")=="private-list"}&&model.get().follows.isNotEmpty()&&model.get().ownProfile.has("profile")}
  val requested=CountDownLatch(1);val response=CountDownLatch(1)
  heldRequests["/api/library"]=requested;heldResponses["/api/library"]=response
  try{
   ui.runOnIdle{model.get().browseCollection("저장한 음악","/api/library",resultKey="likes")}
   ui.waitUntil(5000){requested.count==0L}
   ui.onNodeWithText("내 계정만 저장한 음악").assertIsDisplayed()
   screen.onActivity{assertNotNull(model.get().api.peek("/api/library"));assertTrue(model.get().collectionBusy)}
   logged.set(false)
   ui.runOnIdle{model.get().viewModelScope.launch{model.get().loadMe(loadPrivate=false)}}
   ui.waitUntil(5000){model.get().user==null&&ui.onAllNodesWithTag("collection-scroll").fetchSemanticsNodes().isEmpty()}
   screen.onActivity{
    assertTrue(model.get().likes.isEmpty());assertTrue(model.get().playlists.isEmpty());assertTrue(model.get().follows.isEmpty());assertTrue(model.get().history.isEmpty())
    assertEquals(0,model.get().ownProfile.length());assertNull(model.get().collection);assertNull(model.get().selectedList)
    assertNull(model.get().api.peek("/api/library"));assertNull(model.get().api.peek("/api/me/profile"))
   }
   ui.onNodeWithText("내 계정만 저장한 음악").assertDoesNotExist()
   assertEquals("Account state must clear before the previous user's held response completes",1L,response.count)
   assertFalse(completedHeldResponses.contains("/api/library"))
  }finally{response.countDown();heldResponses.remove("/api/library");heldRequests.remove("/api/library")}
  ui.waitUntil(10000){completedHeldResponses.contains("/api/library")};ui.waitForIdle()
  screen.onActivity{assertNull(model.get().user);assertTrue(model.get().likes.isEmpty());assertTrue(model.get().playlists.isEmpty());assertTrue(model.get().follows.isEmpty());assertEquals(0,model.get().ownProfile.length());assertNull(model.get().api.peek("/api/library"));assertNull(model.get().collection)}
 }
 @Test fun createCrewOpensEditorWithoutProfileSetup(){
  assertFalse(user.has("profile_id"));ui.onNodeWithTag("main-tab-3").performClick();ui.onNodeWithText("크루",useUnmergedTree=true).performClick();waitText("새 크루 만들기");ui.onNodeWithText("새 크루 만들기").performClick();waitText("새 크루")
  ui.onNodeWithText("크루 이름").performTextInput("프로필 설정 없이 만든 크루");ui.onNodeWithText("저장").performClick();waitText("프로필 설정 없이 만든 크루")
  assertNotNull(crew);ui.onAllNodesWithText("공개 닉네임").assertCountEquals(0);assertEquals("테스트 리스너",user.optString("name"));assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 @Test fun recordingDraftListOpensSavedReviewWithoutMicrophone(){
  val ownerMethod=kr.co.aifect.app.karaoke.KaraokeActivity::class.java.getDeclaredMethod("draftOwner",String::class.java,String::class.java).apply{isAccessible=true}
  val owner=ownerMethod.invoke(null,Endpoint.origin,"user:test-user") as String
  val dir=File(context.filesDir,"karaoke-fixture-$owner").apply{mkdirs()};val dry=File(dir,"voice.pcm");dry.writeBytes(ByteArray(48000*3*2));File(dir,"session.json").writeText(payload("trackId" to "fixture","coverMode" to "solo","duetPart" to "","duetParent" to "","title" to "초안으로 남긴 목소리","cursor" to 1,"words" to JSONArray()).toString())
  val instrument=InstrumentationRegistry.getInstrumentation();val monitor=instrument.addMonitor(kr.co.aifect.app.karaoke.KaraokeActivity::class.java.name,null,false);var room:android.app.Activity?=null
  try{
   assertEquals(1,kr.co.aifect.app.karaoke.RecordingDraftStore.list(context,Endpoint.origin,"test-user").length())
   ui.onNodeWithText("부르기").performClick()
   waitText("초안")
   ui.onNodeWithText("초안",useUnmergedTree=true).performClick()
   ui.waitUntil(10000){ui.onAllNodesWithTag("draft-fixture").fetchSemanticsNodes().isNotEmpty()}
   ui.onNodeWithTag("draft-fixture").performClick();room=monitor.waitForActivityWithTimeout(10000);assertNotNull(room);assertEquals("fixture",room!!.intent.getStringExtra("trackId"));assertEquals("test-user",room!!.intent.getStringExtra("ownerId"))
   val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);while(true){try{androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`("recording-post"))).check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()));break}catch(e:Throwable){if(System.nanoTime()>deadline)throw e;Thread.sleep(100)}}

   fun tagged(tag:String)=androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withTagValue(org.hamcrest.Matchers.`is`(tag)))
   fun preset()=room!!.javaClass.getDeclaredField("presetId").apply{isAccessible=true}.get(room) as String
   tagged("vocal-preset-hall").perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click());assertEquals("hall",preset());screenshot("native-polish-recording-effects.png")
   tagged("post-settings").perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click());androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("리버브")).perform(androidx.test.espresso.action.ViewActions.click())
   tagged("vocal-preset-original").perform(androidx.test.espresso.action.ViewActions.click());assertEquals("original",preset());androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withContentDescription("세부 설정 닫기")).perform(androidx.test.espresso.action.ViewActions.click());assertEquals("hall",preset())
   tagged("post-settings").perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click());androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("리버브")).perform(androidx.test.espresso.action.ViewActions.click());tagged("vocal-preset-karaoke").perform(androidx.test.espresso.action.ViewActions.click());androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("적용하기")).perform(androidx.test.espresso.action.ViewActions.click());assertEquals("karaoke",preset())
   androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("다시 부르기")).perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click())
   for(choice in listOf("small","normal","large")){tagged("lyric-size-$choice").perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click());assertEquals(choice,context.getSharedPreferences("karaoke_display",0).getString("lyricTextSize",""))}
   assertEquals("large",JSONObject(File(dir,"session.json").readText()).optString("lyricTextSize"))
   val wheel=room!!.window.decorView.findViewWithTag<View>("karaoke-lyrics");val beforeFont=AtomicReference<String>();instrument.runOnMainSync{beforeFont.set(wheel.javaClass.getDeclaredMethod("textSizeChoice").apply{isAccessible=true}.invoke(wheel) as String)};assertEquals("large",beforeFont.get())
   val stateClass=room!!.javaClass.declaredClasses.first{it.simpleName=="State"};val setState=room!!.javaClass.getDeclaredMethod("setState",stateClass).apply{isAccessible=true}
   instrument.runOnMainSync{setState.invoke(room,stateClass.enumConstants!!.first{it.toString()=="PREROLL"})};Thread.sleep(600);val visible=android.graphics.Rect();instrument.runOnMainSync{assertTrue(wheel.getGlobalVisibleRect(visible));assertTrue("Recording lyric viewport is fully in view",visible.height()>=wheel.height-4)};screenshot("native-polish-recording-large.png")
   instrument.runOnMainSync{setState.invoke(room,stateClass.enumConstants!!.first{it.toString()=="PAUSED"})}

   assertEquals(48000*3*2L,dry.length());assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
  }catch(error:Throwable){runCatching{screenshot("draft-restore-failure.png");val roots=ui.onAllNodes(isRoot(),useUnmergedTree=true);repeat(roots.fetchSemanticsNodes().size){println(roots[it].printToString().take(9000))}};throw error}finally{instrument.removeMonitor(monitor);room?.let{a->instrument.runOnMainSync{a.finish()}};dir.listFiles()?.forEach{it.delete()};dir.delete()}
 }
 private fun logoutAndAssertLocalAccountCleared(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.waitUntil(10000){!model.get().refreshing&&!model.get().busy&&model.get().user!=null&&model.get().likes.isNotEmpty()&&model.get().playlists.isNotEmpty()&&model.get().follows.isNotEmpty()&&model.get().ownProfile.has("profile")&&model.get().controller!=null}
  NativeSession.put(context,"ticket","logout-pending-ticket");NativeSession.put(context,"verifier","logout-pending-verifier")
  ui.runOnIdle{model.get().history=listOf(Song(song));model.get().messagePeer="person";model.get().play(Song(song))}
  val playbackReady=AtomicBoolean(false)
  ui.waitUntil(10000){screen.onActivity{playbackReady.set(model.get().controller?.currentMediaItem!=null)};playbackReady.get()}
  ui.onNodeWithTag("account-menu").performClick();waitText("로그아웃")
  val meReads=requests.count{it.substringBefore("?")=="/api/me"}
  ui.onNodeWithText("로그아웃").performScrollTo().performClick()
  ui.waitUntil(10000){!model.get().busy&&model.get().user==null&&NativeSession.cookie(context).isEmpty()}
  screen.onActivity{
   assertNull(model.get().user);assertEquals(0,model.get().membership.length());assertFalse(model.get().showAccount);assertFalse(model.get().showLogin)
   assertTrue(model.get().likes.isEmpty());assertTrue(model.get().playlists.isEmpty());assertTrue(model.get().follows.isEmpty());assertTrue(model.get().history.isEmpty())
   assertEquals(0,model.get().ownProfile.length());assertNull(model.get().profile);assertNull(model.get().collection);assertNull(model.get().selectedList)
   assertFalse(model.get().showMessages);assertNull(model.get().messagePeer);assertNull(model.get().current);assertEquals(0,model.get().controller?.mediaItemCount)
   assertNull(model.get().api.peek("/api/library"));assertNull(model.get().api.peek("/api/me/profile"))
  }
  assertEquals("",NativeSession.cookie(context));assertEquals("",NativeSession.get(context,"ticket"));assertEquals("",NativeSession.get(context,"verifier"))
  assertEquals("Local logout must not depend on a second account request",meReads,requests.count{it.substringBefore("?")=="/api/me"})
  ui.onAllNodesWithTag("account-actions").assertCountEquals(0)
 }
 @Test fun logoutServerFailureStillClearsLocalAccountAndPlayback(){
  fixtureResponses["/api/auth/logout"]=503 to payload("error" to "로그아웃 서버에 연결할 수 없어요.").toString()
  logoutAndAssertLocalAccountCleared()
  assertTrue(requests.contains("/api/auth/logout"));assertEquals("aifect_session=logout-fixture",cookieHeaders["/api/auth/logout"])
  assertTrue("A failed remote revocation must not pretend that the server session was deleted",logged.get())
 }
 @Test fun logoutDisconnectedServerStillClearsLocalAccountAndPlayback(){
  disconnectedResponses.add("/api/auth/logout")
  logoutAndAssertLocalAccountCleared()
  assertTrue(requests.contains("/api/auth/logout"));assertTrue(logged.get())
 }
 @Test fun logoutSuccessClearsLocalAccountWithoutAnotherMeRequest(){
  logoutAndAssertLocalAccountCleared()
  assertTrue(requests.contains("/api/auth/logout"));assertFalse(logged.get())
 }
 @Test fun nativePlaybackQualityShowsServerBitrateAndPendingFallback(){
  val model=AtomicReference<MusicModel>();screen.onActivity{model.set(androidx.lifecycle.ViewModelProvider(it)[MusicModel::class.java])}
  ui.waitUntil(10000){!model.get().refreshing&&model.get().controller!=null&&model.get().membership.optString("plan")=="premium"}
  val path="/api/playback/fixture"
  fun response(bitrate:Int,pending:Boolean=false,preview:Boolean=false)=payload("id" to "quality-listen-$bitrate-$pending-$preview","src" to "/media/fixture/${if(preview)"preview" else if(bitrate==256)"premium" else "stream"}","duration" to 30,"preview" to preview,"bitrate_kbps" to bitrate,"high_quality_pending" to pending)
  fun assertQuality(bitrate:Int,label:String){
   ui.waitUntil(10000){model.get().playbackQualityLabel==label}
   ui.onNodeWithTag("mini-player-quality").assertIsDisplayed().assertTextEquals("AAC $bitrate")
   ui.onNodeWithTag("mini-player-lyrics").performClick()
   ui.onNodeWithTag("player-quality").assertIsDisplayed().assertTextEquals(label)
  }
  fixtureResponses[path]=200 to response(128,pending=true).toString()
  ui.runOnIdle{model.get().play(Song(song))}
  assertQuality(128,"AAC 128kbps · 고음질 준비 중")
  screen.onActivity{assertEquals("premium",model.get().membership.optString("plan"));assertTrue(model.get().playbackHighQualityPending)}
  ui.onNodeWithContentDescription("재생 종료").performClick()
  val requested=CountDownLatch(1);val held=CountDownLatch(1)
  heldRequests[path]=requested;heldResponses[path]=held;fixtureResponses[path]=200 to response(256).toString()
  try{
   ui.runOnIdle{model.get().play(Song(song))}
   ui.waitUntil(5000){requested.count==0L&&model.get().current!=null&&model.get().playbackBitrateKbps==0}
   ui.onAllNodesWithTag("mini-player-quality").assertCountEquals(0)
   assertEquals("An older song's quality must stay hidden before this request resolves",1L,held.count)
  }finally{held.countDown();heldResponses.remove(path);heldRequests.remove(path)}
  assertQuality(256,"AAC 256kbps")
  screen.onActivity{assertFalse(model.get().playbackHighQualityPending);assertFalse(model.get().playbackPreview)}
  ui.onNodeWithText("AAC 128kbps · 고음질 준비 중").assertDoesNotExist()
  ui.onNodeWithContentDescription("재생 종료").performClick()
  logged.set(false)
  ui.runOnIdle{model.get().viewModelScope.launch{model.get().loadMe(loadPrivate=false)}}
  ui.waitUntil(10000){model.get().user==null}
  fixtureResponses[path]=200 to response(128,preview=true).toString()
  ui.runOnIdle{model.get().play(Song(song))}
  assertQuality(128,"60초 미리 듣기 · AAC 128kbps")
  screen.onActivity{assertTrue(model.get().playbackPreview);assertFalse(model.get().playbackHighQualityPending)}
  ui.onNodeWithContentDescription("재생 종료").performClick()
  ui.waitUntil(5000){model.get().current==null&&model.get().playbackBitrateKbps==0}
  ui.onAllNodesWithTag("mini-player-quality").assertCountEquals(0)
 }
 @Test fun communityUploaderPhotosUseTheProducerInsteadOfArtistOrCover(){
  val source=Song(song)
  assertEquals("uploader-photo",source.producerImageVersion);assertEquals("person",source.producerProfile.getString("id"));assertEquals("producer",source.producerProfile.getString("profile_kind"))
  assertEquals("album-photo",source.raw.getString("cover_version"));assertEquals("ai-fixture",source.raw.getString("artist_id"))
  val noPhoto=Song(payload("id" to "no-photo","producer_id" to "another-person","producer" to "사진 없는 제작자","has_cover" to 1,"cover_version" to "album-only"))
  assertEquals("",noPhoto.producerImageVersion);assertEquals("",noPhoto.producerProfile.getString("image_version"))
  ui.onNodeWithTag("main-tab-3").performClick();waitText("지금 함께 듣는 음악")
  ui.waitUntil(10000){requests.contains("/media/producer/person?v=uploader-photo")}
  ui.onNodeWithTag("music-community-feed").performScrollToNode(hasTestTag("community-voices"))
  ui.onNode(hasContentDescription("테스트 뮤지션 프로필") and hasAnyAncestor(hasTestTag("community-voices")),useUnmergedTree=true).assertIsDisplayed()
  assertFalse(requests.any{it.startsWith("/media/artist/ai-fixture")||it.startsWith("/media/producer/fixture")||it.startsWith("/media/producer/person?v=album-photo")})
 }
 @Test fun accountSettingsKeepEmailReadOnlyAndChangeNicknamePassword(){
  ui.onNodeWithTag("account-menu").performClick();waitText("계정 설정");ui.onNodeWithText("계정 설정").performClick();waitText("아이디 · 활동명")
  ui.onNodeWithText("native@example.test").assertExists().assert(!hasSetTextAction())
  val nickname=ui.onNode(hasText("아이디 · 활동명") and hasSetTextAction());nickname.performTextClearance();nickname.performTextInput("중복아이디");ui.onNodeWithText("중복 확인").performClick();waitText("이미 사용 중인 아이디입니다.")
  nickname.performTextClearance();nickname.performTextInput("새로운아이디");ui.onNodeWithText("아이디 저장").performClick();waitText("아이디를 변경했습니다.");assertEquals("새로운아이디",user.optString("name"));assertEquals("native@example.test",user.optString("email"))
  ui.onNodeWithText("비밀번호 변경").performScrollTo().performClick()
  ui.onNode(hasText("현재 비밀번호") and hasSetTextAction()).performTextInput("fixture-password-123")
  ui.onNode(hasText("새 비밀번호 · 12자 이상") and hasSetTextAction()).performTextInput("changed-password-456")
  ui.onNode(hasText("새 비밀번호 확인") and hasSetTextAction()).performTextInput("changed-password-456")
  ui.onNodeWithText("비밀번호 저장").performScrollTo().performClick();ui.waitUntil(10000){requests.any{it=="/api/account/password"}}
  ui.waitUntil(10000){NativeSession.cookie(context)=="aifect_session=rotated-fixture"}
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
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
 @Test fun streamCommunityNavigationSavesTheCoverItself(){
  listOf(0,3,2,5,6).forEach{ui.onNodeWithTag("main-tab-$it").assertExists()}
  screenshot("native-new-home.png")
  ui.onNodeWithTag("main-tab-3").performClick();waitText("지금 함께 듣는 음악")
  screenshot("native-new-community.png")
  ui.onNodeWithText("커버",useUnmergedTree=true).performClick();waitText("새로운 커버곡을 불렀어요")
  ui.onNodeWithTag("music-community-feed").performScrollToNode(hasText("플레이리스트 담기"))
  ui.onNodeWithText("플레이리스트 담기").performClick();waitText("플레이리스트에 담기")
  ui.onNodeWithText("새 플레이리스트").performClick();ui.onNodeWithText("플레이리스트 이름").performTextInput("좋아한 커버")
  ui.onNodeWithText("저장").performClick();ui.waitUntil(10000){savedMusic.isNotEmpty()}
  assertEquals(listOf("cover-fixture"),savedMusic.toList())
  ui.onNodeWithTag("main-tab-5").performClick();waitText("아직 나눈 대화가 없어요. 프로필의 메시지로 시작해보세요.")
  screenshot("native-new-messages.png")
  ui.onNodeWithTag("main-tab-6").performClick();ui.onNodeWithTag("my-music-page").performScrollToNode(hasText("내 플레이리스트"));waitText("내 플레이리스트")
  screenshot("native-new-my.png")
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasText("내 플레이리스트"));ui.onNodeWithText("내 플레이리스트").performClick();waitText("좋아한 커버")
  assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }

 @Test fun photoProfilesAndCoverLayoutsKeepTheRecordingId(){
  ui.onNodeWithTag("main-tab-6").performClick();ui.waitUntil(10000){ui.onAllNodesWithTag("my-profile-cover-image").fetchSemanticsNodes().isNotEmpty()};screenshot("native-polish-my-photo.png")
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-layout-list"));ui.onAllNodes(hasText("커버") and hasClickAction()).onFirst().performClick()
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-layout-list"));ui.onNodeWithTag("my-music-layout-list").performClick()
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-row-cover-fixture"));ui.onNodeWithTag("my-music-row-cover-fixture").assertIsDisplayed();screenshot("native-polish-covers-list.png")
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-layout-grid"));ui.onNodeWithTag("my-music-layout-grid").performClick()
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-card-cover-fixture"));ui.onNodeWithTag("my-music-card-cover-fixture").assertIsDisplayed();screenshot("native-polish-covers-grid.png")
  ui.onNodeWithTag("my-music-play-cover-fixture").performClick();ui.waitUntil(10000){requests.contains("/api/playback/cover-fixture")};assertFalse(requests.contains("/api/playback/fixture"))
  ui.onNodeWithTag("my-music-page").performScrollToNode(hasTestTag("my-music-save-cover-fixture"));ui.waitUntil(10000){ui.onAllNodes(hasTestTag("my-music-save-cover-fixture") and isEnabled()).fetchSemanticsNodes().isNotEmpty()};ui.onNodeWithTag("my-music-save-cover-fixture").performClick();waitText("플레이리스트에 담기");ui.onNodeWithText("새 플레이리스트").performClick();ui.onNodeWithText("플레이리스트 이름").performTextInput("격자에서 담은 커버");ui.onNodeWithText("저장").performClick();ui.waitUntil(10000){savedMusic.isNotEmpty()};assertEquals(listOf("cover-fixture"),savedMusic.toList())
  val model=AtomicReference<MusicModel>();screen.onActivity{a->model.set(androidx.lifecycle.ViewModelProvider(a)[MusicModel::class.java])}
  val ready=java.util.concurrent.atomic.AtomicBoolean(false)
  ui.waitUntil(10000){screen.onActivity{ready.set(!model.get().busy&&model.get().playlistTarget==null)};ready.get()&&ui.onAllNodesWithText("새 플레이리스트").fetchSemanticsNodes().isEmpty()}
  screen.onActivity{model.get().openProfile("person",showCovers=true)}
  ui.waitUntil(10000){ui.onAllNodesWithTag("profile-cover-image").fetchSemanticsNodes().isNotEmpty()};screenshot("native-polish-public-photo.png")
  ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("profile-layout-grid"));ui.onNodeWithTag("profile-layout-grid").performClick();ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("profile-card-cover-fixture"));ui.onNodeWithTag("profile-card-cover-fixture").assertExists()
  ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("profile-layout-list"));ui.onNodeWithTag("profile-layout-list").performClick();ui.onNodeWithTag("profile-scroll").performScrollToNode(hasTestTag("profile-row-cover-fixture"));ui.onNodeWithTag("profile-row-cover-fixture").assertExists();assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO))
 }
 private fun wav(seconds:Int=30):ByteArray{
  val size=seconds*16000*2;return ByteBuffer.allocate(44+size).order(ByteOrder.LITTLE_ENDIAN).apply{
   put("RIFF".toByteArray());putInt(36+size);put("WAVEfmt ".toByteArray());putInt(16);putShort(1);putShort(1);putInt(16000);putInt(32000);putShort(2);putShort(16);put("data".toByteArray());putInt(size)
  }.array()
 }
}
