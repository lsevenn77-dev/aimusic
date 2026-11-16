package kr.co.aifect.app

import android.content.Intent
import android.os.SystemClock
import android.util.Log
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Opt-in timing of the normal UI against the current server. Opens read-only pages. */
class PageSpeedDeviceTest {
 @get:Rule val ui=createEmptyComposeRule()
 private val timings=org.json.JSONArray()

 @Test fun readOnlyMainPages(){
  assumeTrue(InstrumentationRegistry.getArguments().getString("liveReadAudit")=="1")
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  check(context.packageName=="kr.co.aifect.app.test")
  val started=SystemClock.elapsedRealtime()
  val screen=ActivityScenario.launch<MainActivity>(Intent(context,MainActivity::class.java))
  lateinit var model:MusicModel
  try{
   screen.onActivity{
    model=ViewModelProvider(it)[MusicModel::class.java]
    it.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
   }
   check(Endpoint.origin=="https://aifect.co.kr")
   ui.waitUntil(30000){model.home.isNotEmpty()}
   waitFor("home-song-copy-")
   log("home-first-content",started)
   ui.waitUntil(30000){!model.loading}
   val firstSong=model.home.first()
   log("home-start",started)
   Log.i("PageAudit","environment widthDp=${context.resources.configuration.screenWidthDp} loggedIn=${model.user!=null}")
   fun open(block:(MusicModel)->Unit){screen.onActivity{block(model)}}
   fun measure(name:String,prefix:String,fallback:String?=null,block:(MusicModel)->Unit){
    val at=SystemClock.elapsedRealtime()
    open(block)
    waitFor(prefix,fallback)
    log(name,at)
   }
   repeat(2){index->
    val round=if(index==0)"first" else "return"
    measure("song-$round","play-grid-card-","아직 표시할 작품이 없어요"){
     it.playMode="song";it.playSection="recommended";it.selectTab(2)
    }
    measure("popular-$round","play-grid-card-","아직 표시할 작품이 없어요"){it.playSection="popular"}
    measure("duet-$round","duet-card-art-","아직 표시할 작품이 없어요"){it.playSection="duets"}
    measure("browse-$round","play-grid-card-","아직 표시할 작품이 없어요"){it.playMode="browse";it.playSection="recommended"}
    measure("dubbing-$round","dub-cover-","아직 공개된 대본이 없어."){it.playMode="dubbing";it.playSection="discover"}
    measure("live-$round","voice-room-","아직 열린 공개 노래방·토킹룸이 없어요."){it.communityMode="voice";it.selectTab(3)}
    measure("crew-$round","crew-home-tabs|crew-discovery-"){
     it.communityMode="crews"
    }
    measure("rankings-$round","community-rank-","아직 집계된 순위가 없어요."){it.communityMode="rankings"}
    measure("messages-$round","dm-conversation-|inbox-crew",if(model.user==null)"로그인" else "첫 대화를 시작해보세요"){it.selectTab(5)}
    val myAt=SystemClock.elapsedRealtime()
    open{it.selectTab(6)}
    ui.waitUntil(20000){model.user==null||model.ownDashboard!=null}
    waitFor("current-my")
    log("my-$round",myAt)
    measure("home-$round","home-song-copy-"){it.selectTab(0);it.listenPage="추천"}
   }
   val detailAt=SystemClock.elapsedRealtime()
   open{it.openCurrentSong(firstSong.id)}
   waitFor("song-detail-scroll")
   log("song-detail",detailAt)
   open{it.detail=null}
   firstSong.producerId.takeIf{it.isNotBlank()}?.let{id->
    val at=SystemClock.elapsedRealtime()
    open{it.openProfile(id)}
    ui.waitUntil(20000){!model.profileLoading}
    waitFor("profile-scroll")
    log("profile",at)
    open{it.dismissProfile()}
    val reopened=SystemClock.elapsedRealtime()
    open{it.openProfile(id)}
    waitFor("profile-scroll")
    ui.waitUntil(20000){!model.profileLoading}
    log("profile-return",reopened)
    open{it.dismissProfile()}
   }
   model.publicLists.firstOrNull()?.optString("id")?.takeIf{it.isNotBlank()}?.let{id->
    val at=SystemClock.elapsedRealtime()
    open{it.openList(id)}
    ui.waitUntil(20000){!model.listLoading&&model.selectedList?.optString("id")==id}
    log("playlist",at)
    open{it.selectedList=null}
    val reopened=SystemClock.elapsedRealtime()
    open{it.openList(id)}
    ui.waitUntil(20000){model.selectedList?.optString("id")==id&&model.listSongs.isNotEmpty()}
    log("playlist-return",reopened)
    open{it.selectedList=null}
   }
  }finally{screen.close()}
 }

 private fun waitFor(prefix:String,fallback:String?=null){
  val prefixes=prefix.split('|')
  val tag=SemanticsMatcher("page data is present"){
   val value=it.config.getOrNull(SemanticsProperties.TestTag).orEmpty()
   prefixes.any{value.startsWith(it)}
  }
  ui.waitUntil(20000){
   ui.onAllNodes(tag,useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()||
    fallback!=null&&ui.onAllNodesWithText(fallback,substring=true).fetchSemanticsNodes().isNotEmpty()
  }
 }

 private fun log(name:String,started:Long){
  val elapsed=SystemClock.elapsedRealtime()-started
  Log.i("PageAudit","live $name visibleMs=$elapsed")
  timings.put(payload("page" to name,"visibleMs" to elapsed))
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  java.io.File(context.getExternalFilesDir(null),"page-speed-device.json").writeText(timings.toString(2))
 }
}
