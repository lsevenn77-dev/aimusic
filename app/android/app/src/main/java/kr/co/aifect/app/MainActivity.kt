package kr.co.aifect.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kr.co.aifect.app.karaoke.KaraokeActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.LaunchedEffect
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.withResumed
import kotlinx.coroutines.launch

class MainActivity:ComponentActivity(){
 private val model:MusicModel by viewModels()
 private lateinit var signIn:NativeSignIn
 private lateinit var ads:ListeningAds
 private val notificationPermission=registerForActivityResult(ActivityResultContracts.RequestPermission()){ }
 private fun push(intent:Intent){
  val kind=intent.getStringExtra("pushKind")?:return
  val target=intent.getStringExtra("pushTarget")?:return
  val recipient=intent.getStringExtra("pushRecipient")?:return
  model.openPush(kind,target,recipient)
  intent.removeExtra("pushKind")
 }
 private val recordingLauncher=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result->
  if(result.resultCode==RESULT_OK&&!result.data?.getStringExtra("uploadedId").isNullOrBlank()){
   model.notice="커버곡을 올렸어요! 변환이 끝나면 공개돼요.";lifecycleScope.launch{runCatching{model.loadLibrary()}}
   if(result.data?.getBooleanExtra("showUploadAd",false)==true)lifecycleScope.launch {
    val uploadedId=result.data?.getStringExtra("uploadedId").orEmpty()
    lifecycle.withResumed {SongAdBreaks.afterCoverUpload(uploadedId,{model.controller?.pause()},{})}
   }
  }
 }
 override fun onCreate(savedInstanceState:Bundle?){
  installSplashScreen();super.onCreate(savedInstanceState)
  Endpoint.configureTest(intent.getStringExtra("testOrigin"))
  signIn=NativeSignIn(this)
  model.playBilling=PlayBilling(this,model)
  ads=ListeningAds(this)
  enableEdgeToEdge(statusBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),navigationBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
  setContent {
   LaunchedEffect(model.user,model.membership){if(model.user!=null){ads.prepare();push(intent)
    if(android.os.Build.VERSION.SDK_INT>=33&&com.google.firebase.FirebaseApp.getApps(this@MainActivity).isNotEmpty()&&
     checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){
     val prefs=getSharedPreferences("native_push",0)
     if(!prefs.getBoolean("permission_asked",false)){prefs.edit().putBoolean("permission_asked",true).apply();notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)}
    }
   }}
   AifectApp(model,::sing,::openBrowser,::login,{ads.privacy{model.notice=it}},::resumeDraft)
  }
  if(intent.data!=null)model.finishLogin(intent.data)
 }
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);model.finishLogin(intent.data);if(model.user!=null)push(intent)}
 override fun onResume(){super.onResume();model.finishLogin();PushNotifications.refresh(this);model.playBilling?.resume();if(::ads.isInitialized){SongAdBreaks.host=ads;if(model.user!=null)ads.prepare()}}
 override fun onPause(){if(::ads.isInitialized&&SongAdBreaks.host===ads)SongAdBreaks.host=null;super.onPause()}
 override fun onDestroy(){model.playBilling?.close();model.playBilling=null;if(::ads.isInitialized)ads.dispose();super.onDestroy()}
 private fun openBrowser(url:String){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}
 private fun login(provider:String){
  when(provider){
   "google"->model.nativeLogin(provider){client,nonce->signIn.google(client,nonce)}
   "kakao"->model.nativeLogin(provider){_,_->signIn.kakao()}
   "apple"->model.socialLogin{url->CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this,Uri.parse(url))}
  }
 }
 private fun resumeDraft(draft:org.json.JSONObject){
  if(!model.authenticated())return
  model.controller?.pause()
  recordingLauncher.launch(Intent(this,KaraokeActivity::class.java).putExtra("origin",Endpoint.origin).putExtra("ownerId",model.user?.optString("id")).putExtra("resumeDraft",true).putExtra("draftFolder",draft.optString("folder")).putExtra("trackId",draft.getString("trackId")).putExtra("coverMode",draft.optString("coverMode","solo")).putExtra("duetPart",draft.optString("duetPart","")).putExtra("duetParentId",draft.optString("duetParent","")))
 }
 private fun sing(song:Song){
  if(!model.authenticated())return
  fun open(mode:String,part:String,parent:String=""){
   model.controller?.pause()
   recordingLauncher.launch(Intent(this,KaraokeActivity::class.java).putExtra("origin",Endpoint.origin).putExtra("trackId",if(parent.isBlank())song.id else song.raw.optString("original_id")).putExtra("ownerId",model.user?.optString("id")).putExtra("coverMode",mode).putExtra("duetPart",part).putExtra("duetParentId",parent))
  }
  if(song.cover&&song.raw.optInt("duet_open")==1){open("duet",if(song.raw.optString("duet_part")=="male")"female" else "male",song.id);return}
  open("solo","")
 }
}
