package kr.co.aifect.app

import android.content.Intent
import android.graphics.Bitmap
import android.os.SystemClock
import android.view.*
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Exercises official game pages in practice mode only; no score or purchase requests. */
class MobileExperienceDeviceTest {
 private val ins=InstrumentationRegistry.getInstrumentation()
 private val context=ins.targetContext
 private fun web(v:View):WebView?=if(v is WebView)v else if(v is ViewGroup)(0 until v.childCount).firstNotNullOfOrNull{web(v.getChildAt(it))}else null
 private fun js(w:WebView,code:String):String{val latch=CountDownLatch(1);var result="null";ins.runOnMainSync{w.evaluateJavascript(code){result=it;latch.countDown()}};assertTrue("JavaScript returned",latch.await(10,TimeUnit.SECONDS));return result}
 private fun waitJs(w:WebView,code:String,timeout:Long=30000){val deadline=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<deadline){if(js(w,code)=="true")return;SystemClock.sleep(250)};fail("Page did not become ready: $code; "+js(w,"JSON.stringify({summary:document.querySelector('.jump-summary')?.textContent,overlay:document.querySelector('.jump-overlay')?.textContent,tail:document.body.innerText.slice(-1400)})"))}
 private fun tap(w:WebView,selector:String){
  js(w,"document.querySelector("+JSONObject.quote(selector)+").scrollIntoView({behavior:'instant',block:'center'})");SystemClock.sleep(350)
  val raw=js(w,"(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");const b=e.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2,scale:devicePixelRatio})})()")
  val j=JSONObject(org.json.JSONTokener(raw).nextValue().toString());val pos=IntArray(2);ins.runOnMainSync{w.getLocationOnScreen(pos)}
  val x=pos[0]+(j.getDouble("x")*j.getDouble("scale")).toFloat();val y=pos[1]+(j.getDouble("y")*j.getDouble("scale")).toFloat()
  val now=SystemClock.uptimeMillis();listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP).forEachIndexed{i,a->val e=MotionEvent.obtain(now,now+50*i,a,x,y,0);e.source=InputDevice.SOURCE_TOUCHSCREEN;ins.uiAutomation.injectInputEvent(e,true);e.recycle()}
 }
 private fun twoFingerTouch(w:WebView){
  val pos=IntArray(2);var width=0;var height=0;ins.runOnMainSync{w.getLocationOnScreen(pos);width=w.width;height=w.height}
  val props=Array(2){MotionEvent.PointerProperties().apply{id=it;toolType=MotionEvent.TOOL_TYPE_FINGER}}
  val coords=Array(2){MotionEvent.PointerCoords().apply{x=pos[0]+width*(if(it==0).3f else .7f);y=pos[1]+height*.8f;pressure=1f;size=1f}}
  val down=SystemClock.uptimeMillis()
  listOf(Triple(MotionEvent.ACTION_DOWN,1,0L),Triple(MotionEvent.ACTION_POINTER_DOWN or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,60L),Triple(MotionEvent.ACTION_POINTER_UP or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,220L),Triple(MotionEvent.ACTION_UP,1,280L)).forEach{(action,count,elapsed)->
   SystemClock.sleep(65);val e=MotionEvent.obtain(down,down+elapsed,action,count,props,coords,0,0,1f,1f,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);assertTrue(ins.uiAutomation.injectInputEvent(e,true));e.recycle()
  }
 }
 private fun capture(name:String){val f=File(context.getExternalFilesDir("mobile-qa"),"$name.png");f.parentFile?.mkdirs();ins.uiAutomation.takeScreenshot().let{bmp->f.outputStream().use{bmp.compress(Bitmap.CompressFormat.PNG,100,it)};bmp.recycle()}}
 /** Start tests/preview-live-karaoke.mjs locally, reverse its port, and pass its generated room id. */
 @Test fun karaokeReservationInputStaysAboveSystemKeyboard(){
  val args=InstrumentationRegistry.getArguments();val origin=args.getString("karaokeFixtureOrigin");val id=args.getString("karaokeFixtureRoom")
  org.junit.Assume.assumeTrue(context.packageName.endsWith(".test")&&origin!=null&&id!=null)
  Endpoint.configureTest(origin);check(Endpoint.origin==origin&&CurrentNavigation.safeID(id!!))
  ActivityScenario.launch<MobileExperienceActivity>(Intent(context,MobileExperienceActivity::class.java).putExtra("route","live/"+id)).use{scene->
   lateinit var w:WebView;scene.onActivity{w=web(it.window.decorView)!!}
   val open="[data-voice=karaoke-search-open]";waitJs(w,"!!document.querySelector("+JSONObject.quote(open)+")",45000);waitJs(w,"!!document.getElementById('aifect-mobile-experience') && document.documentElement.scrollWidth<=innerWidth+2");capture("karaoke-reference-room");tap(w,open)
   waitJs(w,"!!document.querySelector('#live-query')");val fullHeight=js(w,"innerHeight").toDouble();tap(w,"#live-query")
   val deadline=SystemClock.elapsedRealtime()+10000;var ime=false
   while(!ime&&SystemClock.elapsedRealtime()<deadline){scene.onActivity{ime=androidx.core.view.ViewCompat.getRootWindowInsets(w)?.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())==true};SystemClock.sleep(100)}
   assertTrue("Android IME appeared",ime)
   waitJs(w,"innerHeight < "+(fullHeight-100))
   SystemClock.sleep(1200) // Let Android finish its IME inset animation before measuring.
   waitJs(w,"(()=>{const e=document.querySelector('#live-query'),r=e.getBoundingClientRect(),v=window.visualViewport;return document.activeElement===e && r.height>0 && r.top>=v.offsetTop-1 && r.bottom<=v.offsetTop+v.height+1})()")
   capture("karaoke-keyboard-visible")
  }
 }

 @Test fun roomModeSwitchKeepsMembershipAndBackUsesCurrentMode(){
  val args=InstrumentationRegistry.getArguments();val origin=args.getString("karaokeFixtureOrigin");val id=args.getString("karaokeFixtureRoom")
  org.junit.Assume.assumeTrue(context.packageName.endsWith(".test")&&origin!=null&&id!=null)
  Endpoint.configureTest(origin)
  ActivityScenario.launch<MobileExperienceActivity>(Intent(context,MobileExperienceActivity::class.java).putExtra("route","live/"+id)).use{scene->
   lateinit var w:WebView;scene.onActivity{w=web(it.window.decorView)!!}
   waitJs(w,"typeof voiceController!=='undefined' && voiceController?.joined && !!document.getElementById('aifect-mobile-experience')",45000)
   js(w,"window.__qaRoom={client:voiceController,generation:voiceController.generation,socket:voiceController.ws,initialChat:voiceController.state.chat.map(x=>x.id)};true")
   for(mode in listOf("talk","karaoke","talk")){
    tap(w,"[data-voice=settings]");waitJs(w,"document.querySelector('#voice-room-settings').open && !voiceController.settingsLoading")
    tap(w,"#voice-settings-form label:has(input[name=mode][value="+mode+"])")
    tap(w,"#voice-settings-form button[type=submit]")
    waitJs(w,"voiceController.state.room.mode==="+JSONObject.quote(mode)+" && voiceController.liveMode==="+(mode=="karaoke")+" && !document.querySelector('#voice-room-settings').open")
    assertEquals("same room connection and generation","true",js(w,"voiceController===window.__qaRoom.client && voiceController.generation===window.__qaRoom.generation && !voiceController.closed"))
    assertEquals("mode changes never enable capture","true",js(w,"!voiceController.micDesired && !voiceController.stream && !document.querySelector('#talk-leave').open"))
    assertEquals("existing chat preserved","true",js(w,"window.__qaRoom.initialChat.every(id=>voiceController.state.chat.some(m=>m.id===id))"))
   }
   scene.onActivity{it.onBackPressedDispatcher.onBackPressed()}
   waitJs(w,"!!document.querySelector('#talk-leave[open]')")
   assertEquals("talking room leave title","true",js(w,"document.querySelector('#talk-leave').textContent.includes('토킹룸에서 나갈까요?')"))
   capture("talking-leave-current-mode")
   tap(w,"#talk-leave [data-voice=dismiss]")
   waitJs(w,"!document.querySelector('#talk-leave').open")
   assertEquals("staying preserves membership","true",js(w,"voiceController.joined && !voiceController.closed"))
   tap(w,"[data-voice=leave]");tap(w,"[data-voice=confirm-leave]")
   val deadline=SystemClock.elapsedRealtime()+10000
   while(scene.state!=androidx.lifecycle.Lifecycle.State.DESTROYED&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(100)
   assertEquals("actual leave closes the room Activity",androidx.lifecycle.Lifecycle.State.DESTROYED,scene.state)
  }
 }

 /** Run only against the disposable preview-crew-fishing SQLite server. */
 @Test fun fishingLobbyFitsNativeChromeAndPracticeStaysInGame(){
  val origin=InstrumentationRegistry.getArguments().getString("fishingFixtureOrigin")
  org.junit.Assume.assumeTrue(context.packageName.endsWith(".test") && origin?.matches(Regex("http://127[.]0[.]0[.]1:[0-9]{2,5}"))==true)
  Endpoint.configureTest(origin);check(Endpoint.origin==origin)
  val previous=NativeSession.cookie(context)
  try{
   NativeSession.put(context,"cookie","")
   ActivityScenario.launch<MobileExperienceActivity>(Intent(context,MobileExperienceActivity::class.java).putExtra("route","game/fishing/preview")).use{scene->
    lateinit var w:WebView;scene.onActivity{w=web(it.window.decorView)!!}
    val ready="!!document.querySelector('.fl-hero') && !!document.getElementById('aifect-mobile-experience')"
    waitJs(w,ready)
    assertEquals("one native header, no horizontal overflow","true",js(w,"getComputedStyle(document.querySelector('body>header')).display==='none' && document.documentElement.scrollWidth<=innerWidth+1"))
    js(w,"window.__qaArtReady=false; Promise.all(['./art/lobby-sea-v1.webp','./art/lobby-aquarium-v1.webp'].map(src=>{const im=new Image();im.src=src;return im.decode()})).then(()=>window.__qaArtReady=true);true")
    waitJs(w,"window.__qaArtReady===true")
    val drawn=CountDownLatch(1)
    ins.runOnMainSync{w.postVisualStateCallback(1,object:WebView.VisualStateCallback(){override fun onComplete(requestId:Long){w.postOnAnimation{w.postOnAnimation{drawn.countDown()}}}})}
    assertTrue("WebView presented the illustrated lobby",drawn.await(8,TimeUnit.SECONDS))
    ins.waitForIdleSync();capture("fishing-native-lobby")
    for((button,title) in listOf("aquarium" to "크루 수족관","book" to "물고기 도감")){
     tap(w,"[data-act="+button+"]");waitJs(w,"document.querySelector('h1')?.textContent==="+JSONObject.quote(title));tap(w,"[data-act=lobby]");waitJs(w,ready)
    }
    tap(w,"[data-fishing-catalog]");waitJs(w,"document.querySelectorAll('.book .specimen').length===27");tap(w,"[data-act=lobby]");waitJs(w,ready)
    tap(w,"[data-act=rules]");waitJs(w,"document.querySelector('#rules').open");tap(w,"#rules button")
    tap(w,"a[href*='mode=practice']");waitJs(w,ready+" && document.body.classList.contains('practice')")
    assertEquals("practice preserves the crew route","true",js(w,"new URLSearchParams(location.search).get('crew')==='preview'"))
    tap(w,"[data-act=start]");waitJs(w,"!!document.querySelector('.stage:not(.casting)')",22000)
    capture("fishing-native-bite")
    scene.onActivity{assertTrue("bite reached native haptics",it.javaClass.getDeclaredField("lastBiteAt").apply{isAccessible=true}.getLong(it)>0)}
    tap(w,"[data-act=lobby]");waitJs(w,ready)
   }
  }finally{NativeSession.put(context,"cookie",previous)}
 }
 @Test fun allFourGamesFitPhoneAndReceiveTouches(){
  val crew=runBlocking{NativeApi(context).call("/api/crews?summary=1",fresh=true).optString("mine")}
  assertTrue("Existing signed-in crew required for device comparison",CurrentNavigation.safeID(crew)&&crew!="null")
  for(game in listOf("rhythm","jump","racing","fishing").filter{InstrumentationRegistry.getArguments().getString("game")?.let{chosen->chosen==it}?:true}){
   ActivityScenario.launch<MobileExperienceActivity>(Intent(context,MobileExperienceActivity::class.java).putExtra("route","game/$game/$crew")).use{scenario->
    lateinit var w:WebView;scenario.onActivity{w=web(it.window.decorView)!!}
    waitJs(w,"document.readyState==='complete' && !!document.getElementById('aifect-mobile-experience')")
    if(game=="fishing"){
     ins.runOnMainSync{w.loadUrl(Endpoint.origin+"/crew-fishing/?crew=$crew&mode=practice")}
     waitJs(w,"document.body.classList.contains('practice') && !!document.querySelector('[data-act=start]')")
    }
    if(game=="racing"){
     ins.runOnMainSync{w.loadUrl(Endpoint.origin+"/crew-racing/?crew=$crew&from=crew#course=riverside")}
     waitJs(w,"document.readyState==='complete' && !!document.querySelector('#practiceBtn')")
    }
    val selector=when(game){"jump"->"[data-do=practice]";"fishing"->"[data-act=start]";else->"#practiceBtn"}
    waitJs(w,"!!document.querySelector("+JSONObject.quote(selector)+") && !document.querySelector("+JSONObject.quote(selector)+").disabled")
    assertEquals("$game lobby fits viewport","true",js(w,"document.documentElement.scrollWidth<=innerWidth+2"))
    capture("$game-lobby")
    tap(w,selector)
    val started=when(game){"jump"->"document.body.classList.contains('crew-jump-playing') && !!document.querySelector('.jump-hud:not([hidden])')";"racing"->"document.body.classList.contains('racing') && document.getElementById('readyOv').hidden";"fishing"->"!!document.querySelector('.stage')";else->"document.getElementById('lobbyView').hidden"}
    waitJs(w,started);SystemClock.sleep(1000)
    js(w,"window.__mobilePointers=[];window.addEventListener('pointerdown',e=>window.__mobilePointers.push(e.pointerId),true);true")
    twoFingerTouch(w)
    assertEquals("$game delivers two independent fingers","true",js(w,"new Set(window.__mobilePointers).size>=2"))
    assertEquals("$game playfield fits viewport","true",js(w,"document.documentElement.scrollWidth<=innerWidth+2"))
    capture("$game-playing")
    if(game=="racing"){tap(w,"#mLeft");tap(w,"#mRight");tap(w,"#pauseBtn");waitJs(w,"!document.getElementById('pauseOv').hidden");capture("racing-paused")}
   }
  }
 }
}
