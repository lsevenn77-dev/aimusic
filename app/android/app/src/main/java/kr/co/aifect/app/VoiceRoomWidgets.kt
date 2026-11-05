@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.sin

internal val SeatRequestGreen=androidx.compose.ui.graphics.Color(0xFF8EDDD2)
internal fun voiceGiftImage(type:String):String? {
 val known=setOf("lollipop","balloon","clover","heart","cheer-star","coffee","microphone","crown","superstar","moon","note")
 return if(type in known)Endpoint.url("/assets/gifts/$type.${if(type=="lollipop")"png" else "webp"}") else null
}
@Composable internal fun VoiceGiftArt(gift:JSONObject,size:Int=48){
 val image=voiceGiftImage(gift.optString("type"))
 if(image==null)Icon(Icons.Outlined.CardGiftcard,gift.optString("name"),Modifier.size(size.dp),tint=Pink)
 else SubcomposeAsyncImage(image,gift.optString("name"),Modifier.size(size.dp),contentScale=ContentScale.Fit,
  loading={Icon(Icons.Outlined.CardGiftcard,null,Modifier.padding(10.dp),tint=Pink)},error={Icon(Icons.Outlined.CardGiftcard,null,Modifier.padding(10.dp),tint=Pink)})
}
@Composable internal fun VoiceGiftMessage(chat:JSONObject){
 val gift=chat.optJSONObject("gift")?:JSONObject()
 Row(Modifier.fillMaxWidth().background(Pink.copy(alpha=.07f),RoundedCornerShape(12.dp)).padding(10.dp).testTag("voice-gift-${chat.optString("id")}"),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
  VoiceGiftArt(gift)
  Column(Modifier.weight(1f)){
   Text("${chat.optString("name")} → ${chat.optString("recipient_name")}",fontSize=12.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
   Text("${gift.optString("name")} ×${gift.optInt("quantity",1)} 보냈어요",fontSize=14.sp,color=SoftText,fontWeight=FontWeight.Medium)
  }
 }
}
@Composable internal fun VoiceGiftAnimation(engine:NativeVoiceEngine,modifier:Modifier=Modifier){
 var chat by remember(engine){mutableStateOf<JSONObject?>(null)}
 val progress=remember{Animatable(0f)}
 val context=LocalContext.current
 LaunchedEffect(engine){engine.giftAnimations.collect{next->
  chat=next;progress.snapTo(0f)
  val reduce=android.provider.Settings.Global.getFloat(context.contentResolver,android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,1f)==0f
  if(reduce){progress.snapTo(.5f);delay(1200)}else progress.animateTo(1f,tween(2500,easing=LinearEasing))
  chat=null
 }}
 chat?.let{c->val p=progress.value;val scale=when{p<.18f->.2f+p/.18f*.8f;p>.8f->((1f-p)/.2f).coerceAtLeast(0f);else->1f}
  Column(modifier.testTag("voice-gift-animation").graphicsLayer{scaleX=scale;scaleY=scale;rotationZ=if(p in .2f.. .7f)sin((p-.2f)*60f)*9f else 0f;alpha=if(p>.8f)((1f-p)/.2f)else(p/.12f).coerceAtMost(1f)},horizontalAlignment=Alignment.CenterHorizontally){
   VoiceGiftArt(c.optJSONObject("gift")?:JSONObject(),112)
   Text("${c.optJSONObject("gift")?.optString("name")} ×${c.optJSONObject("gift")?.optInt("quantity",1)}",color=SoftText,fontWeight=FontWeight.Bold,modifier=Modifier.background(Panel.copy(alpha=.94f),RoundedCornerShape(12.dp)).padding(horizontal=12.dp,vertical=6.dp))
  }
 }
}
@Composable internal fun VoiceMusicBar(e:NativeVoiceEngine,state:JSONObject,openMusic:()->Unit,addPlaylist:(JSONObject)->Unit){
 val music=state.optJSONObject("music")?:JSONObject();val song=music.optJSONArray("queue")?.optJSONObject(music.optInt("index",-1));val id=song?.optString("id").orEmpty()
 var liked by remember(id){mutableStateOf(false)};var loading by remember(id){mutableStateOf(true)};var busy by remember(id){mutableStateOf(false)}
 var retry by remember{mutableIntStateOf(0)};val scope=rememberCoroutineScope()
 LaunchedEffect(id,retry){if(id.isBlank())return@LaunchedEffect;loading=true;try{liked=e.api.call("/api/library",fresh=true).optJSONArray("likes").objects().any{it.optString("id")==id};loading=false}catch(x:Exception){if(x is kotlinx.coroutines.CancellationException)throw x;e.error.value=x.message}}
 Row(Modifier.fillMaxWidth().roomGlass(16).heightIn(min=44.dp).padding(start=4.dp,end=4.dp).testTag("voice-top-music"),verticalAlignment=Alignment.CenterVertically){
  IconButton(openMusic){Icon(Icons.Outlined.QueueMusic,"함께 듣는 음악",tint=Aqua)}
  Column(Modifier.weight(1f).heightIn(min=48.dp).clickable(onClick=openMusic),verticalArrangement=Arrangement.Center){
   Text(song?.optString("title")?:"함께 들을 음악",fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
   song?.optString("artist")?.takeIf{it.isNotBlank()}?.let{Text(it,fontSize=12.sp,lineHeight=15.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)}
  }
  if(song!=null){
   IconButton(enabled=!busy,onClick={if(loading){retry++;return@IconButton};busy=true;scope.launch{try{e.api.call("/api/tracks/$id/like",if(liked)"DELETE" else "PUT");liked=!liked}catch(x:Exception){if(x is kotlinx.coroutines.CancellationException)throw x;e.error.value=x.message}finally{busy=false}}}){Icon(if(liked)Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,if(loading)"좋아요 상태 다시 확인" else if(liked)"좋아요 취소" else "좋아요",tint=if(liked)Pink else Muted)}
   IconButton({addPlaylist(song)}){Icon(Icons.Outlined.PlaylistAdd,"내 플레이리스트에 담기",tint=Muted)}
   if(e.isHost())IconButton({e.launch{e.command("music",payload("operation" to if(music.optBoolean("playing"))"pause" else "play","request_id" to requestIdentity()))}}){Icon(if(music.optBoolean("playing"))Icons.Outlined.Pause else Icons.Outlined.PlayArrow,if(music.optBoolean("playing"))"공동 음악 일시정지" else "공동 음악 재생",tint=Muted)}
  }else IconButton(openMusic){Icon(Icons.Outlined.ChevronRight,"음악 목록 열기",tint=SoftText)}
  var volume by remember(e){mutableFloatStateOf(e.localMusicVolume)}
  Slider(value=volume,onValueChange={volume=it;e.setMusicVolume(it)},modifier=Modifier.width(62.dp).heightIn(min=44.dp),colors=SliderDefaults.colors(thumbColor=SoftText,activeTrackColor=Aqua))
 }
}
@Composable internal fun VoiceSeatAlert(state:JSONObject,host:Boolean,open:()->Unit){
 val requests=state.optJSONArray("members").objects().filter{it.optBoolean("requested")};val invites=state.optJSONArray("seat_invites").objects()
 val count=if(host)requests.size else invites.size
 if(count>0)Row(Modifier.fillMaxWidth().background(SeatRequestGreen.copy(alpha=.08f)).clickable(onClick=open).heightIn(min=44.dp).padding(horizontal=16.dp).testTag("voice-seat-alert"),verticalAlignment=Alignment.CenterVertically){
  Icon(Icons.Outlined.PersonAdd,null,Modifier.size(18.dp),tint=SeatRequestGreen)
  Text(if(host)"좌석 신청 ${count}명" else "좌석 초대가 왔어요",Modifier.weight(1f).padding(start=8.dp),color=SeatRequestGreen,fontSize=13.sp,fontWeight=FontWeight.SemiBold)
  Text(if(host)"확인" else "수락하기",color=SeatRequestGreen,fontSize=12.sp);Icon(Icons.Outlined.ChevronRight,null,tint=SeatRequestGreen)
 }
}
@Composable internal fun VoicePlaylistPicker(api:NativeApi,song:JSONObject,ownerId:String,done:()->Unit){
 var lists by remember{mutableStateOf<List<JSONObject>>(emptyList())};var loading by remember{mutableStateOf(true)};var busy by remember{mutableStateOf(false)};var error by remember{mutableStateOf<String?>(null)};var name by remember{mutableStateOf("")};var retry by remember{mutableIntStateOf(0)};val scope=rememberCoroutineScope();val context=LocalContext.current
 LaunchedEffect(retry){loading=true;error=null;try{lists=api.call("/api/library",fresh=true).optJSONArray("collections").objects().filter{it.optString("user_id")==ownerId}}catch(x:Exception){if(x is kotlinx.coroutines.CancellationException)throw x;error=x.message}finally{loading=false}}
 fun add(id:String?){if(busy)return;busy=true;scope.launch{try{if(id==null)api.call("/api/playlists","POST",payload("name" to name.trim(),"is_public" to false,"track_ids" to JSONArray(listOf(song.getString("id")))))else api.call("/api/playlists/$id/tracks/${song.getString("id")}","PUT");android.widget.Toast.makeText(context,"플레이리스트에 담았어요",android.widget.Toast.LENGTH_SHORT).show();done()}catch(x:Exception){if(x is kotlinx.coroutines.CancellationException)throw x;error=x.message}finally{busy=false}}}
 Text("내 플레이리스트에 담기",fontSize=20.sp,fontWeight=FontWeight.Bold);Text(song.optString("title"),color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis)
 if(loading)LinearProgressIndicator(Modifier.fillMaxWidth())
 lists.forEach{p->TextButton({add(p.getString("id"))},enabled=!busy,modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.PlaylistAdd,null);Text(p.optString("name"),Modifier.weight(1f).padding(start=12.dp),maxLines=2,overflow=TextOverflow.Ellipsis)}}
 if(!loading&&lists.isEmpty()&&error==null)Text("첫 플레이리스트를 만들어 담아보세요.",color=Muted,fontSize=13.sp)
 OutlinedTextField(name,{if(it.length<=60)name=it},label={Text("새 플레이리스트 이름")},singleLine=true,modifier=Modifier.fillMaxWidth())
 Button({add(null)},enabled=!busy&&name.isNotBlank(),modifier=Modifier.fillMaxWidth()){Text("새로 만들어 담기")}
 error?.let{Text(it,color=Pink);TextButton({retry++}){Text("다시 불러오기")}}
}
@Composable internal fun VoiceProfilePopup(api:NativeApi,person:JSONObject,canGift:Boolean=true,gift:()->Unit){
 val id=person.optString("profile_id");var data by remember(id){mutableStateOf<JSONObject?>(null)};var error by remember(id){mutableStateOf<String?>(null)};var retry by remember{mutableIntStateOf(0)}
 var photo by remember{mutableStateOf<String?>(null)}
 LaunchedEffect(id,retry){error=null;try{check(CurrentNavigation.safeID(id)){"프로필을 확인할 수 없어요."};data=api.call("/api/producers/$id",fresh=true)}catch(x:Exception){if(x is kotlinx.coroutines.CancellationException)throw x;error=x.message}}
 val p=data?.optJSONObject("profile")?:person
 Column(Modifier.fillMaxWidth().testTag("voice-profile-popup"),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(12.dp)){
  NativeMemberAvatar(JSONObject(p.toString()).put("profile_id",id),80)
  Text(p.optString("name"),fontSize=22.sp,fontWeight=FontWeight.Bold)
  p.optString("bio").takeIf{it.isNotBlank()&&it!="null"}?.let{Text(it,color=SoftText,fontSize=14.sp)}
  if(data==null&&error==null)LinearProgressIndicator(Modifier.fillMaxWidth())
  data?.let{d->Text("팔로워 ${d.optInt("followers")} · 음원 ${d.optJSONArray("tracks")?.length()?:0} · 커버 ${d.optJSONArray("covers")?.length()?:0}",color=Muted,fontSize=12.sp)
   val photos=d.optJSONArray("gallery").objects()
   if(photos.isNotEmpty()){Text("갤러리",Modifier.fillMaxWidth(),fontWeight=FontWeight.SemiBold);LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){items(photos){g->val path=g.optString("url");if(path.startsWith("/")&&!path.startsWith("//")){val url=Endpoint.url(path);AsyncImage(url,"갤러리 사진",Modifier.size(130.dp).clip(RoundedCornerShape(12.dp)).clickable{photo=url},contentScale=ContentScale.Crop)}}}}
  }
  error?.let{Text(it,color=Pink);TextButton({retry++}){Text("다시 불러오기")}}
  if(canGift)Button(gift,Modifier.fillMaxWidth()){Text("선물 보내기")}
 }
 photo?.let{url->AlertDialog(onDismissRequest={photo=null},confirmButton={TextButton({photo=null}){Text("닫기")}},text={AsyncImage(url,"갤러리 사진 크게 보기",Modifier.fillMaxWidth().heightIn(max=440.dp),contentScale=ContentScale.Fit)})}
}
