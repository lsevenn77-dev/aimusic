package kr.co.aifect.app

import android.content.Context
import android.media.AudioManager
import android.os.Build
/** Audio focus protects interruptions on all devices. On Android 12+ also observe carrier call mode. */
internal class VoiceCallMonitor(private val context:Context,private val changed:(Boolean)->Unit){
 private val audio=context.getSystemService(AudioManager::class.java)
 private var unregister:(()->Unit)?=null
 private var active=false
 private fun observe(mode:Int){val next=mode==AudioManager.MODE_IN_CALL||mode==AudioManager.MODE_RINGTONE;if(next!=active){active=next;changed(next)}}
 fun start(){if(unregister!=null)return
  if(Build.VERSION.SDK_INT>=31){val listener=AudioManager.OnModeChangedListener(::observe);audio.addOnModeChangedListener(context.mainExecutor,listener);unregister={audio.removeOnModeChangedListener(listener)}}
  observe(audio.mode)
 }
 fun close(){unregister?.invoke();unregister=null;active=false}
}
