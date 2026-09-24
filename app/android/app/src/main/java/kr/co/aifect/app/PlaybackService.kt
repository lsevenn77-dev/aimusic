package kr.co.aifect.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.*
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.*
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

@UnstableApi
class PlaybackService : MediaSessionService() {
 private lateinit var player:ExoPlayer
 private lateinit var session:MediaSession
 private lateinit var api:NativeApi
 private val worker=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 private val handler=Handler(Looper.getMainLooper())
 private data class Listening(val id:String,val uri:String,val cookie:String,val limit:Double,var seconds:Double=0.0)
 private val resolved=ConcurrentHashMap<String,Listening>()
 private var lastTick=0L
 private var ticks=0
 private var reportingKey:String?=null
 override fun onCreate() {
  super.onCreate();api=NativeApi(this)
  val data=ResolvingDataSource.Factory(OkHttpDataSource.Factory(api.client)) { spec ->
   val uri=spec.uri
   if(uri.host!="play.aifect.invalid")throw IOException("재생 주소를 확인해주세요.")
   val id=uri.pathSegments.firstOrNull()?:""
   if(!Regex("[\\w-]{1,80}").matches(id))throw IOException("곡을 찾을 수 없어요.")
   val key=uri.toString()
   val saved=resolved[key]?.takeIf { it.cookie==NativeSession.cookie(this) }
   val entry=saved?:run {
    val response=api.blocking("/api/playback/$id","POST")
    Listening(response.getString("id"),Endpoint.url(response.getString("src")),NativeSession.cookie(this),
     if(response.optBoolean("preview")) minOf(60.0,response.optDouble("duration",60.0)) else response.optDouble("duration",7200.0))
     .also { resolved[key]=it }
   }
   spec.withUri(android.net.Uri.parse(entry.uri))
  }
  player=ExoPlayer.Builder(this).setMediaSourceFactory(DefaultMediaSourceFactory(data)).build().apply {
   setWakeMode(C.WAKE_MODE_LOCAL)
   setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
   setHandleAudioBecomingNoisy(true)
   addListener(object:Player.Listener {
    override fun onIsPlayingChanged(isPlaying:Boolean) { if(!isPlaying) report() }
    override fun onMediaItemTransition(item:MediaItem?,reason:Int) {
     report(reportingKey)
     reportingKey=item?.localConfiguration?.uri?.toString()
    }
   })
  }
  session=MediaSession.Builder(this,player).setSessionActivity(PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
   .setCallback(object:MediaSession.Callback {
    override fun onAddMediaItems(s:MediaSession,c:MediaSession.ControllerInfo,items:MutableList<MediaItem>):ListenableFuture<MutableList<MediaItem>> {
     if(c.packageName!=packageName)return Futures.immediateFailedFuture(SecurityException("Only the app may choose media"))
     return Futures.immediateFuture(items.map { item ->
      require(Regex("[\\w-]{1,80}").matches(item.mediaId))
      item.buildUpon().setUri("https://play.aifect.invalid/${item.mediaId}?run=${java.util.UUID.randomUUID()}").build()
     }.toMutableList())
    }
   }).build()
  lastTick=android.os.SystemClock.elapsedRealtime();handler.post(tick)
 }
 private val tick=object:Runnable {
  override fun run() {
   val now=android.os.SystemClock.elapsedRealtime()
   val key=player.currentMediaItem?.localConfiguration?.uri?.toString()
   if(player.isPlaying && key!=null)resolved[key]?.let { it.seconds=minOf(it.limit,it.seconds+(now-lastTick).coerceIn(0,1500)/1000.0) }
   lastTick=now;if(++ticks%15==0)report();handler.postDelayed(this,1000)
  }
 }
 private fun report(key:String?=player.currentMediaItem?.localConfiguration?.uri?.toString()) {
  if(key==null)return
  val entry=resolved[key] ?: return
  val seconds=kotlin.math.floor(entry.seconds).toInt()
  if(seconds<=0 || entry.cookie!=NativeSession.cookie(this))return
  worker.launch { runCatching { api.call("/api/listens/${entry.id}","PATCH",payload("seconds" to seconds)) } }
 }
 override fun onGetSession(controllerInfo:MediaSession.ControllerInfo)=session
 override fun onTaskRemoved(rootIntent:Intent?) { if(!player.playWhenReady || player.mediaItemCount==0)stopSelf() }
 override fun onDestroy() {
  handler.removeCallbacksAndMessages(null);player.release();session.release();worker.cancel();super.onDestroy()
 }
}
