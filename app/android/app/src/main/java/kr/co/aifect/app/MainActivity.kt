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

class MainActivity:ComponentActivity(){
 private val model:MusicModel by viewModels()
 override fun onCreate(savedInstanceState:Bundle?){
  installSplashScreen();super.onCreate(savedInstanceState)
  Endpoint.configureTest(intent.getStringExtra("testOrigin"))
  enableEdgeToEdge(statusBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),navigationBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
  setContent { AifectApp(model,::sing,::openBrowser) }
  if(intent.data!=null)model.finishLogin(intent.data)
 }
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);model.finishLogin(intent.data)}
 override fun onResume(){super.onResume();model.finishLogin()}
 private fun openBrowser(url:String){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}
 private fun sing(song:Song){
  if(!model.authenticated())return
  model.controller?.pause()
  startActivity(Intent(this,KaraokeActivity::class.java).putExtra("origin",Endpoint.origin).putExtra("trackId",song.id))
 }
}
