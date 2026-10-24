package kr.co.aifect.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

internal fun validNativePerformanceRoute(route:String)=route in setOf("voice","dubbing","dubbing/new","dubbing?tab=mine","profile")||Regex("^(voice|dubbing)/[A-Za-z0-9_-]{1,64}$").matches(route)
internal fun openNativePerformance(context:Context,m:MusicModel,route:String){
 if(!validNativePerformanceRoute(route)||!m.authenticated())return
 if(route=="profile"){m.user?.optString("profile_id")?.takeIf{it.isNotBlank()}?.let{m.openProfile(it)};return}
 m.controller?.pause()
 context.startActivity(Intent(context,NativePerformanceActivity::class.java).putExtra("route",route).apply{if(context !is android.app.Activity)addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)})
}

/** Native Compose routes. Authentication and domain rules remain on the existing API. */
class NativePerformanceActivity:ComponentActivity(){
 private var session=""
 private val sessionChanged=android.content.SharedPreferences.OnSharedPreferenceChangeListener{_,_->if(session!=NativeSession.cookie(this)){stopService(Intent(this,NativeVoiceService::class.java));finish()}}
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  session=NativeSession.cookie(this);getSharedPreferences("native_session",0).registerOnSharedPreferenceChangeListener(sessionChanged)
  val initial=intent.getStringExtra("route").orEmpty();if(!validNativePerformanceRoute(initial)){finish();return}
  window.statusBarColor=android.graphics.Color.rgb(12,18,27);window.navigationBarColor=window.statusBarColor
  setContent{MaterialTheme(colorScheme=Scheme,typography=ReadableTypography){Surface(color=Ink){
   var route by rememberSaveable{mutableStateOf(initial)}
   val api=remember{NativeApi(this)};val scope=rememberCoroutineScope()
   var error by remember{mutableStateOf<String?>(null)};var busy by remember{mutableStateOf(false)}
   var createId by rememberSaveable{mutableStateOf(requestIdentity())}
   val engine by NativeVoiceService.current.collectAsState()
   val voiceError by NativeVoiceService.lastError.collectAsState()
   fun leave(){stopService(Intent(this,NativeVoiceService::class.java));finish()}
   Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars).imePadding()){
    when {
     route=="voice"->{
      NativeAudioHeader("새 토킹룸",{finish()})
      Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(18.dp)){
       if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
       error?.let{Text(it,color=Pink)}
       NativeRoomForm(api){body->if(!busy){busy=true;scope.launch{try{val result=api.call("/api/voice/rooms","POST",body.put("request_id",createId));route="voice/"+result.getJSONObject("room").getString("id")}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}}}
      }
     }
     route.startsWith("voice/")->{
      val id=route.substringAfter('/')
      LaunchedEffect(id){try{ContextCompat.startForegroundService(this@NativePerformanceActivity,Intent(this@NativePerformanceActivity,NativeVoiceService::class.java).putExtra("room",id))}catch(e:Exception){error=e.message}}
      BackHandler{leave()}
      if(engine?.roomId==id)NativeVoiceScreen(engine!!,::leave)else{NativeAudioHeader("토킹룸",::leave);Text(error?:voiceError?:"대화에 연결하는 중…",Modifier.padding(20.dp))}
     }
     else->NativeDubbingScreen(api,route,{route=it},{finish()})
    }
   }
  }}}
 }
 override fun onDestroy(){getSharedPreferences("native_session",0).unregisterOnSharedPreferenceChangeListener(sessionChanged);super.onDestroy()}
}
