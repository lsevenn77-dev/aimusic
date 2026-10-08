@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable internal fun ChatImage(m:MusicModel,message:JSONObject){
 val context=LocalContext.current
 val owner=m.user?.optString("id")?:return
 val loader=remember(owner){ImageLoader.Builder(context).okHttpClient(m.api.client).diskCache(null).build()}
 DisposableEffect(loader){onDispose{loader.shutdown()}}
 var failed by remember(message.optString("image_id")){mutableStateOf(false)}
 if(failed||message.optLong("image_expires")<=System.currentTimeMillis()/1000)Text("보관 기간이 지난 사진",color=Muted,modifier=Modifier.padding(14.dp))
 else AsyncImage(ImageRequest.Builder(context).data(Endpoint.url("/media/dm/"+message.optString("image_id"))).memoryCacheKey(owner+":"+message.optString("image_id")).build(),"대화 사진",imageLoader=loader,contentScale=ContentScale.Fit,modifier=Modifier.width(240.dp).heightIn(min=120.dp,max=280.dp),onError={failed=true})
}

@Composable internal fun DmActions(m:MusicModel,peer:String?,muted:Boolean,change:(Boolean)->Unit,clear:()->Unit,withDelete:Boolean=true){
 var confirm by remember(peer){mutableStateOf(false)}
 var working by remember(peer){mutableStateOf(false)}
 val scope=rememberCoroutineScope()
 val context=LocalContext.current.applicationContext
 val account=m.user?.optString("id")?:return
 if(peer!=null)IconButton(enabled=!working,onClick={scope.launch{working=true;try{m.api.call("/api/dm/$peer/settings","PUT",payload("muted" to !muted));if(m.user?.optString("id")==account)change(!muted)}catch(e:Exception){if(e is CancellationException)throw e;m.notice=e.message}finally{working=false}}}){Icon(if(muted)Icons.Rounded.NotificationsOff else Icons.Rounded.NotificationsNone,if(muted)"대화 알림 켜기" else "대화 알림 끄기",tint=if(muted)Aqua else Muted)}
 if(withDelete)IconButton(onClick={confirm=true},enabled=!working){Icon(Icons.Rounded.DeleteOutline,if(peer==null)"내 DM 전체 삭제" else "내 대화 전체 삭제",tint=Muted)}
 if(confirm)AlertDialog(onDismissRequest={if(!working)confirm=false},title={Text(if(peer==null)"내 DM 전체 삭제" else "내 대화 삭제")},text={Text("내 기기와 내 목록에서 대화를 삭제해요. 상대방의 기록은 유지되며 새 메시지는 다시 표시돼요.")},dismissButton={TextButton(onClick={confirm=false},enabled=!working){Text("취소")}},confirmButton={TextButton(enabled=!working,onClick={scope.launch{working=true;try{m.api.call("/api/dm"+(peer?.let{"/$it"}?:""),"DELETE");NativeChatCache.clear(context,account,peer);if(m.user?.optString("id")==account){clear();m.refreshMessageSummary()};confirm=false}catch(e:Exception){if(e is CancellationException)throw e;m.notice=e.message}finally{working=false}}}){Text("삭제")}})
}

@Composable internal fun DmAttachments(m:MusicModel,peer:String,busy:Boolean,send:(JSONObject)->Unit){
 val scope=rememberCoroutineScope();val account=m.user?.optString("id")
 var uploading by remember(peer){mutableStateOf(false)}
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null&&!busy&&!uploading)scope.launch{
  uploading=true
  try{val photo=m.api.uploadWebp("/api/dm/$peer/images",uri);if(m.user?.optString("id")==account&&m.messagePeer==peer){val rid=java.util.UUID.randomUUID().toString();send(payload("id" to "pending:$rid","request_id" to rid,"body" to "사진","image_id" to photo.getString("id"),"image_expires" to photo.getLong("expires"),"created" to System.currentTimeMillis()/1000,"sender_id" to account))}}
  catch(e:Exception){if(e is CancellationException)throw e;m.notice=e.message}finally{uploading=false}
 }}
 Row(Modifier.fillMaxWidth().padding(horizontal=14.dp),verticalAlignment=Alignment.CenterVertically){
  IconButton(onClick={picker.launch("image/*")},enabled=!busy&&!uploading){Icon(Icons.Rounded.AddPhotoAlternate,"사진 보내기",tint=Aqua)}
  IconButton(enabled=!busy&&!uploading,onClick={scope.launch{try{val d=m.api.call("/api/producers/$peer");if(m.user?.optString("id")==account)m.openPersonGift(d.getJSONObject("profile"))}catch(e:Exception){if(e is CancellationException)throw e;m.notice=e.message}}}){Icon(Icons.Rounded.CardGiftcard,"선물 보내기",tint=Pink)}
  Text(if(uploading)"사진 변환·전송 중…" else "사진은 서버에 14일 동안 보관돼요.",color=Muted,fontSize=11.sp,modifier=Modifier.weight(1f))
 }

}

@Composable internal fun CrewHomeBanner(m:MusicModel,crew:JSONObject,owner:Boolean,changed:()->Unit){
 val cid=crew.getString("id");val scope=rememberCoroutineScope();var busy by remember(cid){mutableStateOf(false)}
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)scope.launch{busy=true;try{m.api.uploadWebp("/api/crews/$cid/image",uri);changed()}catch(e:Exception){if(e is CancellationException)throw e;m.notice=e.message}finally{busy=false}}}
 Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(10.dp)){
  val version=crew.optString("image_version")
  if(version.isNotBlank())AsyncImage(Endpoint.url("/media/crew/$cid?v=$version"),"크루 대표 이미지",modifier=Modifier.fillMaxWidth().height(200.dp),contentScale=ContentScale.Crop)
  if(owner)TextButton(onClick={picker.launch("image/*")},enabled=!busy){Icon(Icons.Rounded.AddPhotoAlternate,null);Text(if(busy)"저장 중…" else "크루 대표 이미지 설정")}
  FilledTonalButton(onClick={m.openCrewMessages(cid)},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(16.dp),contentPadding=PaddingValues(16.dp)){Icon(Icons.Rounded.Forum,null,tint=Aqua);Text("크루 채팅창 들어가기",modifier=Modifier.padding(start=10.dp))}
 }
}


@Composable internal fun CrewMuteAction(m:MusicModel,cid:String,initial:Boolean){
 var muted by remember(cid,initial){mutableStateOf(initial)};var busy by remember(cid){mutableStateOf(false)};val scope=rememberCoroutineScope()
 IconButton(enabled=!busy,onClick={scope.launch{busy=true;try{val result=m.api.call("/api/crews/$cid/settings","PUT",payload("muted" to !muted));muted=result.optBoolean("muted");m.refreshMessageSummary()}catch(e:Exception){if(e is CancellationException)throw e;m.notice=e.message}finally{busy=false}}}){Icon(if(muted)Icons.Rounded.NotificationsOff else Icons.Rounded.NotificationsNone,if(muted)"크루 알림 켜기" else "크루 알림 끄기",tint=if(muted)Aqua else Muted)}
}

@Composable internal fun ProfileGiftRanking(m:MusicModel,p:JSONObject){
 var open by remember(p.optString("id")){mutableStateOf(false)}
 TextButton(onClick={open=true}){Icon(Icons.Rounded.EmojiEvents,null,tint=Aqua);Text("선물 랭킹 TOP 50",modifier=Modifier.padding(start=6.dp),color=Aqua)}
 if(open){
  var data by remember{mutableStateOf<JSONObject?>(null)};var error by remember{mutableStateOf<String?>(null)};val scope=rememberCoroutineScope()
  suspend fun load(){try{data=m.api.call("/api/producers/${p.optString("id")}/gifts",fresh=true);error=null}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
  LaunchedEffect(p.optString("id")){load()}
  ModalBottomSheet(onDismissRequest={open=false},containerColor=Panel,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true)){
   LazyColumn(Modifier.fillMaxWidth().heightIn(max=600.dp),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
    item{Text("선물 랭킹 TOP 50",fontSize=23.sp);Text("누적 응원 · 1 G와 ★ 1은 각각 1점",fontSize=13.sp,color=Muted)}
    if(data==null&&error==null)item{LinearProgressIndicator(Modifier.fillMaxWidth())}
    error?.let{message->item{Text(message,color=Pink);TextButton(onClick={scope.launch{load()}}){Text("다시 불러오기")}}}
    val fans=data?.optJSONArray("ranking").objects()
    if(data!=null&&fans.isEmpty())item{Text("아직 받은 선물이 없어요.",color=Muted)}
    items(fans){fan->val pid=fan.optString("profile_id").takeUnless{it.isBlank()||it=="null"};Surface(onClick={if(pid!=null){open=false;m.openProfile(pid)}},enabled=pid!=null,color=Panel){Row(Modifier.fillMaxWidth().padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically){Text(fan.optInt("rank").toString(),color=Aqua,modifier=Modifier.width(30.dp));Avatar(fan.optString("name"),pid?.let{payload("id" to it,"image_version" to fan.optString("image_version"))},38);Column(Modifier.weight(1f).padding(horizontal=10.dp)){Text(fan.optString("name"),fontSize=15.sp);Text("${fan.optInt("gold")} G · ★ ${fan.optInt("stars")}",fontSize=12.sp,color=Muted)};Text("${fan.optInt("score")}점",color=Aqua,fontSize=13.sp)}}}
   }
  }
 }
}
