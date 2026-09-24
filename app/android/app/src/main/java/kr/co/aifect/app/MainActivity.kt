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

class MainActivity:ComponentActivity(){
 private val model:MusicModel by viewModels()
 private lateinit var signIn:NativeSignIn
 private lateinit var ads:ListeningAds
 override fun onCreate(savedInstanceState:Bundle?){
  installSplashScreen();super.onCreate(savedInstanceState)
  Endpoint.configureTest(intent.getStringExtra("testOrigin"))
  signIn=NativeSignIn(this)
  ads=ListeningAds(this)
  enableEdgeToEdge(statusBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),navigationBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
  setContent {
   LaunchedEffect(model.user,model.membership){if(model.user!=null)ads.prepare()}
   AifectApp(model,::sing,::openBrowser,::login,{ads.privacy{model.notice=it}})
  }
  if(intent.data!=null)model.finishLogin(intent.data)
 }
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);model.finishLogin(intent.data)}
 override fun onResume(){super.onResume();model.finishLogin();if(::ads.isInitialized){SongAdBreaks.host=ads;if(model.user!=null)ads.prepare()}}
 override fun onPause(){if(::ads.isInitialized&&SongAdBreaks.host===ads)SongAdBreaks.host=null;super.onPause()}
 override fun onDestroy(){if(::ads.isInitialized)ads.dispose();super.onDestroy()}
 private fun openBrowser(url:String){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}
 private fun login(provider:String){
  when(provider){
   "google"->model.nativeLogin(provider){client,nonce->signIn.google(client,nonce)}
   "kakao"->model.nativeLogin(provider){_,_->signIn.kakao()}
   "apple"->model.socialLogin{url->CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this,Uri.parse(url))}
  }
 }
 private fun sing(song:Song){
  if(!model.authenticated())return
  model.controller?.pause()
  startActivity(Intent(this,KaraokeActivity::class.java).putExtra("origin",Endpoint.origin).putExtra("trackId",song.id))
 }
}
