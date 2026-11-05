package kr.co.aifect.app

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.*

class NativeVoiceService:Service(){
 companion object {internal val current=MutableStateFlow<NativeVoiceEngine?>(null);internal val lastError=MutableStateFlow<String?>(null)}
 private var shuttingDown=false
 private var roomId=""
 private var microphoneForeground=false
 private val calls by lazy{VoiceCallMonitor(this){active->current.value?.phoneCallChanged(active)}}
 private val wake by lazy{(getSystemService(POWER_SERVICE) as android.os.PowerManager).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK,"AIFECT:VoiceRoom").apply{setReferenceCounted(false)}}
 private val serviceScope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 private var watch:Job?=null
 private var lease:Job?=null
 override fun onBind(intent:Intent):IBinder=Binder()
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  if(intent?.action=="leave"){stopSelf();return START_NOT_STICKY}
  val id=intent?.getStringExtra("room").orEmpty()
  if(!Regex("^[A-Za-z0-9_-]{1,64}$").matches(id)){stopSelf();return START_NOT_STICKY}
  roomId=id;lastError.value=null;try{foreground(if(current.value?.roomId==id)microphoneForeground else false)}catch(e:IllegalStateException){stopSelf();return START_NOT_STICKY}catch(e:SecurityException){stopSelf();return START_NOT_STICKY}
  if(lease?.isActive!=true)lease=serviceScope.launch{while(isActive){wake.acquire(10*60_000L);delay(8*60_000L)}}
  if(current.value?.roomId!=id){watch?.cancel();current.value?.close();try{current.value=NativeVoiceEngine(this,id,::foreground).also{engine->engine.join();watch=serviceScope.launch{engine.finished.collect{if(it)stopSelf()}}}}catch(e:Exception){android.widget.Toast.makeText(this,"음성 연결을 시작하지 못했어요.",android.widget.Toast.LENGTH_LONG).show();stopSelf()}}
  return START_NOT_STICKY
 }
 private fun foreground(mic:Boolean){
  if(shuttingDown)return
  val manager=getSystemService(NotificationManager::class.java)
  manager.createNotificationChannel(NotificationChannel("native-talking-room","토킹룸 음성",NotificationManager.IMPORTANCE_LOW))
  val open=PendingIntent.getActivity(this,601,Intent(this,NativePerformanceActivity::class.java).putExtra("route","voice/$roomId"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val leave=PendingIntent.getService(this,602,Intent(this,NativeVoiceService::class.java).setAction("leave"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val note=NotificationCompat.Builder(this,"native-talking-room").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("AIFECT 토킹룸").setContentText(if(mic)"마이크 연결 중 · 대화 청취" else "대화 청취 중").setContentIntent(open).setOngoing(true).addAction(0,"나가기",leave).build()
  val type=if(android.os.Build.VERSION.SDK_INT>=29)ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or if(mic&&android.os.Build.VERSION.SDK_INT>=30)ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0 else 0
  try{ServiceCompat.startForeground(this,601,note,type)}catch(e:RuntimeException){if(e !is SecurityException&&e !is IllegalStateException)throw e;lastError.value="화면을 열고 마이크 권한을 확인한 뒤 다시 연결해주세요.";stopSelf();throw e}
  microphoneForeground=mic;calls.start()
 }
 override fun onTaskRemoved(rootIntent:Intent?){stopSelf()}
 override fun onDestroy(){shuttingDown=true;calls.close();if(wake.isHeld)wake.release();watch?.cancel();serviceScope.cancel();lastError.value=lastError.value?:current.value?.error?.value?:"토킹룸에서 나왔어요.";current.value?.close();current.value=null;super.onDestroy()}
}
