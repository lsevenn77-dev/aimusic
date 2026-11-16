package kr.co.aifect.app

import android.content.ComponentName
import android.os.Bundle
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.media3.common.*
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.delay
import org.json.JSONObject

internal fun MediaItem.isDubbingEdition() = mediaMetadata.extras?.getBoolean("dubbing") == true

internal fun MediaController.playDubbingEdition(project: JSONObject) {
 val id = project.getString("id")
 if(currentMediaItem?.isDubbingEdition()==true && currentMediaItem?.mediaId==id && playerError==null){
  if(playbackState==Player.STATE_ENDED)seekTo(0)
  play()
  return
 }
 val title=project.optString("title")
 val owner=project.optString("ownerName")
 val raw=payload("id" to id,"kind" to "dubbing","title" to title,"producer" to owner,"duration" to project.optDouble("duration",0.0))
 val metadata=MediaMetadata.Builder().setTitle(title).setArtist(owner).setArtworkUri(android.net.Uri.parse(currentDubbingImage(project))).setExtras(Bundle().apply {
  putBoolean("dubbing",true)
  putString("song",raw.toString())
 }).build()
 setMediaItem(MediaItem.Builder().setMediaId(id).setMediaMetadata(metadata).build())
 prepare()
 play()
}

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable internal fun rememberDubbingController():MediaController? {
 val context=LocalContext.current.applicationContext
 var controller by remember(context){mutableStateOf<MediaController?>(null)}
 DisposableEffect(context){
  var attached=true
  val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,PlaybackService::class.java))).buildAsync()
  future.addListener({if(attached)controller=runCatching{future.get()}.getOrNull()},ContextCompat.getMainExecutor(context))
  onDispose{attached=false;MediaController.releaseFuture(future)}
 }
 return controller
}

@Composable internal fun DubbingPlaybackBar(controller:MediaController?){
 if(controller==null)return
 var item by remember(controller){mutableStateOf(controller.currentMediaItem)}
 var playing by remember(controller){mutableStateOf(controller.isPlaying)}
 var position by remember(controller){mutableLongStateOf(controller.currentPosition.coerceAtLeast(0))}
 var duration by remember(controller){mutableLongStateOf(controller.duration.coerceAtLeast(0))}
 var failed by remember(controller){mutableStateOf(controller.playerError!=null)}
 var buffering by remember(controller){mutableStateOf(controller.playbackState==Player.STATE_BUFFERING)}
 DisposableEffect(controller){
  val listener=object:Player.Listener{
   override fun onEvents(player:Player,events:Player.Events){
    item=player.currentMediaItem;playing=player.isPlaying;position=player.currentPosition.coerceAtLeast(0)
    duration=player.duration.coerceAtLeast(0);failed=player.playerError!=null;buffering=player.playbackState==Player.STATE_BUFFERING
   }
  }
  controller.addListener(listener)
  onDispose{controller.removeListener(listener)}
 }
 val current=item?.takeIf{it.isDubbingEdition()}?:return
 LaunchedEffect(controller,current.mediaId,playing){while(playing){position=controller.currentPosition.coerceAtLeast(0);delay(250)}}
 var seek by remember(current.mediaId){mutableStateOf<Float?>(null)}
 val end=duration.coerceAtLeast(1).toFloat()
 Surface(Modifier.fillMaxWidth().padding(horizontal=4.dp,vertical=3.dp).testTag("dubbing-mini-player"),shape=RoundedCornerShape(18.dp),color=Panel){
  Column(Modifier.background(Brush.horizontalGradient(listOf(Panel,Ink))).padding(horizontal=12.dp,vertical=4.dp)){
   Row(verticalAlignment=Alignment.CenterVertically){
    current.mediaMetadata.artworkUri?.let{DubbingImage(it.toString(),Modifier.size(40.dp).clip(RoundedCornerShape(8.dp)))}
     ?:Icon(Icons.Rounded.RecordVoiceOver,null,tint=Pink)
    Column(Modifier.weight(1f).padding(horizontal=10.dp)){
     Text(current.mediaMetadata.title?.toString().orEmpty(),fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
     Text(if(failed)"재생 실패 · 다시 재생해 주세요" else current.mediaMetadata.artist?.toString().orEmpty(),style=MaterialTheme.typography.labelSmall,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
    }
    IconButton({if(playing)controller.pause() else {if(failed)controller.prepare();if(controller.playbackState==Player.STATE_ENDED)controller.seekTo(0);controller.play()}}){
     if(buffering)CircularProgressIndicator(Modifier.size(20.dp),strokeWidth=2.dp)
     else Icon(if(playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(playing)"더빙 일시정지" else "더빙 재생",tint=Pink)
    }
    IconButton({controller.stop();controller.clearMediaItems()}){Icon(Icons.Rounded.Close,"더빙 재생 종료")}
   }
   Row(verticalAlignment=Alignment.CenterVertically){
    Text(timeLabel(position),style=MaterialTheme.typography.labelSmall,color=Muted)
    Slider(value=(seek?:position.toFloat()).coerceIn(0f,end),onValueChange={seek=it},onValueChangeFinished={seek?.let{controller.seekTo(it.toLong())};seek=null},enabled=duration>0,valueRange=0f..end,modifier=Modifier.weight(1f).height(26.dp).padding(horizontal=8.dp).testTag("dubbing-mini-seek"))
    Text(timeLabel(duration),style=MaterialTheme.typography.labelSmall,color=Muted)
   }
  }
 }
}
