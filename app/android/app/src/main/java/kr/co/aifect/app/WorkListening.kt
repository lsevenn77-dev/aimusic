package kr.co.aifect.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.util.AtomicFile
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import coil.imageLoader
import coil.request.ImageRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kr.co.aifect.app.karaoke.WorkListeningArtwork
import kr.co.aifect.app.karaoke.WorkListeningControls
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import kr.co.aifect.app.karaoke.WorkListeningPhoto
import org.json.JSONObject
import java.io.File
import java.util.UUID

internal fun Song.workArtwork():String? {
 val key=raw.optString("artwork_id").takeIf{it!="null"&&CurrentNavigation.safeID(it)}
  ?:id.takeIf{raw.optInt("has_cover")>0&&CurrentNavigation.safeID(it)}
 return key?.let{Endpoint.url("/media/"+it+"/cover?artwork=track&v="+Uri.encode(raw.optString("cover_version","original")))}
}

@Composable internal fun WorkListeningScene(template:String,photo:String?,position:Long,duration:Long,playing:Boolean,caption:String,enabled:Boolean,play:()->Unit,seek:(Long)->Unit,selectedPhoto:Bitmap?=null){
 val context=LocalContext.current
 var failed by remember(photo){mutableStateOf(false)}
 val bitmap by produceState<Bitmap?>(null,photo){
  value=null
  if(photo!=null){
   val response=context.imageLoader.execute(ImageRequest.Builder(context).data(photo).size(900).allowHardware(false).build())
   val decoded=(response.drawable as? BitmapDrawable)?.bitmap
   failed=decoded==null;value=decoded
  }
 }
 Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)).background(Panel).testTag("work-listening-scene")){
  AndroidView(factory={WorkListeningArtwork(it)},update={
   it.show(if(failed&&selectedPhoto==null)WorkListeningArtwork.BASIC else template,selectedPhoto?:bitmap)
   it.playback(position,playing)
  },modifier=Modifier.fillMaxSize())
  AndroidView(factory={WorkListeningControls(it)},update={controls->
   controls.bind(play,object:WorkListeningControls.SeekListener{
    override fun begin() {}
    override fun move(position:Long) {}
    override fun end(position:Long) { seek(position) }
   })
   controls.show(position,duration,playing,caption,enabled)
  },modifier=Modifier.align(Alignment.BottomCenter).fillMaxWidth().wrapContentHeight())
 }
}

internal class WorkAppearance(template:String,description:String) {
 private val styles=setOf("cover","turntable-v1","projector-v1")
 val originalTemplate=template.takeIf{it in styles}
 val originalNote=description
 var template by mutableStateOf(originalTemplate)
 var note by mutableStateOf(description)
 var image by mutableStateOf<Bitmap?>(null)
 var imageFile by mutableStateOf<File?>(null)
 var choosing by mutableStateOf(false)
 var error by mutableStateOf<String?>(null)

 fun close(){imageFile?.delete();imageFile=null;image=null}
 val edited:Boolean get()=changes().length()>0||imageFile!=null
 fun changes(noteKey:String="listening_description"):JSONObject=JSONObject().apply{
  if(template!=null&&template!=originalTemplate)put("listening_template",template)
  if(note!=originalNote)put(noteKey,note)
 }
 suspend fun saveDraft(folder:File){
  val file=imageFile
  val selected=template
  val description=note
  withContext(Dispatchers.IO){
   val record=payload("template" to selected,"note" to description)
   if(file!=null)record.put("photo",Base64.encodeToString(file.readBytes(),Base64.NO_WRAP))
   val output=AtomicFile(File(folder,"listening.json"))
   val stream=output.startWrite()
   try{stream.write(record.toString().toByteArray(Charsets.UTF_8));output.finishWrite(stream)}
   catch(error:Exception){output.failWrite(stream);throw error}
  }
 }
 suspend fun restoreDraft(folder:File,cache:File){
  val path=File(folder,"listening.json")
  val atomic=AtomicFile(path)
  if(!path.isFile&&!File(folder,"listening.json.bak").isFile)return
  var temp:File?=null
  try{
   val (record,bitmap)=withContext(Dispatchers.IO){
    val value=JSONObject(atomic.readFully().toString(Charsets.UTF_8))
    val photo=value.opt("photo") as? String
    val bitmap=photo?.let{
     val bytes=Base64.decode(it,Base64.NO_WRAP)
     val file=File.createTempFile("work-listening-",".webp",cache)
     temp=file;file.writeBytes(bytes)
     requireNotNull(BitmapFactory.decodeByteArray(bytes,0,bytes.size)){"저장한 커버사진을 열 수 없습니다."}
    }
    value to bitmap
   }
   if(!edited){
    template=(record.opt("template") as? String)?.takeIf{it in styles}
    note=record.optString("note")
    image=bitmap;imageFile=temp;temp=null
   }
  }finally{temp?.delete()}
 }
 suspend fun saveDubbing(api:NativeApi,path:String,revision:Int){
  val metadata=changes()
  if(metadata.length()>0)api.call("$path/listening","PUT",metadata.put("revision",revision))
  imageFile?.let{api.uploadListeningPhoto("$path/poster",it)}
 }
}

@Composable internal fun WorkAppearanceFields(state:WorkAppearance, photo:String?, enabled:Boolean=true,noteLimit:Int=500,
 preview:(@Composable ()->Unit)?=null,afterPreview:@Composable ()->Unit={},beforeNote:@Composable ()->Unit={}){

 val context=LocalContext.current
 val scope=rememberCoroutineScope()
 val select=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->
  if(uri!=null&&!state.choosing)scope.launch{
   state.choosing=true;state.error=null
   var next:File?=null
   try{
    val result=withContext(Dispatchers.IO){
     val file=File.createTempFile("work-listening-",".webp",context.cacheDir)
     next=file
     val bitmap=context.contentResolver.openInputStream(uri)?.use{WorkListeningPhoto.store(it,file)}
     requireNotNull(bitmap){"커버사진을 열 수 없습니다."}
    }
    state.close();state.image=result;state.imageFile=next;next=null
   }catch(e:CancellationException){throw e}
   catch(e:Exception){state.error=e.message}
   finally{next?.delete();state.choosing=false}
  }
 }
 Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)){
  Text("미리보기",fontSize=16.sp,fontWeight=FontWeight.SemiBold)
  if(preview==null)WorkListeningScene(state.template.orEmpty(),photo,0,0,false,"",false,{},{},selectedPhoto=state.image) else preview()
  afterPreview()
  Text("작품 커버사진",fontSize=14.sp,fontWeight=FontWeight.SemiBold)
  Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
   AsyncImage(model=state.image?:photo?:R.drawable.listening_cover,contentDescription="현재 작품 커버사진",
    contentScale=ContentScale.Crop,modifier=Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)))
   Column{
    OutlinedButton({select.launch("image/*")},enabled=enabled&&!state.choosing){Text(if(state.choosing)"사진 확인 중…" else "커버사진 변경")}
    Text("JPG · PNG · WebP · 최대 5MB",fontSize=12.sp,color=Muted)
   }
  }
  Text("감상 화면 템플릿",fontSize=14.sp,fontWeight=FontWeight.SemiBold)
  state.error?.let{Text(it,fontSize=12.sp,color=Pink)}
  Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
   listOf(Triple("cover","기본",R.drawable.listening_cover_thumb),
    Triple("turntable-v1","턴테이블",R.drawable.listening_turntable_thumb),
    Triple("projector-v1","영사기",R.drawable.listening_projector_thumb)).forEach{(key,label,asset)->
    val selected=(state.template?:"cover")==key
    OutlinedButton({state.template=key},enabled=enabled,contentPadding=PaddingValues(5.dp),
     border=BorderStroke(1.dp,if(selected)Aqua else Stroke),shape=RoundedCornerShape(8.dp)){
     Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(4.dp)){
      Box{
       Image(painterResource(asset),null,Modifier.size(66.dp).clip(RoundedCornerShape(4.dp)))
       if(selected)Icon(Icons.Rounded.Check,"선택됨",Modifier.align(Alignment.TopEnd).padding(2.dp).size(16.dp)
        .background(Aqua,androidx.compose.foundation.shape.CircleShape).padding(2.dp),tint=Ink)
      }
      Text(label,fontSize=11.sp,color=if(selected)Aqua else SoftText)
     }
    }
   }
  }
  beforeNote()
  OutlinedTextField(state.note,{state.note=it.take(noteLimit)},enabled=enabled,label={Text("작품에 남기는 한마디")},
   modifier=Modifier.fillMaxWidth(),maxLines=4)
 }
}

@Composable internal fun WorkPlaylistPicker(api:NativeApi,id:String,title:String,kind:String,close:()->Unit,saved:()->Unit){
 var query by remember(id){mutableStateOf("")}
 var name by remember(id){mutableStateOf("")}
 var ready by remember(id){mutableStateOf(false)}
 var busy by remember(id){mutableStateOf(false)}
 var loading by remember(id){mutableStateOf(true)}
 var error by remember(id){mutableStateOf<String?>(null)}
 var lists by remember(id){mutableStateOf<List<JSONObject>>(emptyList())}
 var confirmation by remember(id){mutableStateOf<JSONObject?>(null)}
 val scope=rememberCoroutineScope()
 LaunchedEffect(query){
  loading=true;error=null;lists=emptyList();delay(170)
  try{
   ready=api.call("/api/library/unification").optBoolean("ready")
   if(ready){
    val path="/api/me/music-library?section=playlists&filter=mine&limit=50&contains=${Uri.encode(id)}&kind=$kind&q=${Uri.encode(query)}"
    lists=api.call(path,fresh=true).optJSONArray("items").objects()
   }else error="현재 플레이리스트에 담기를 사용할 수 없습니다."
  }catch(e:CancellationException){throw e}
  catch(e:Exception){error=e.message}
  finally{loading=false}
 }
 fun save(list:JSONObject?,confirmPrivate:Boolean=false){
  if(busy||loading||!ready)return
  busy=true;error=null
  scope.launch{
   try{
    val item=payload("kind" to kind,"content_id" to id)
    if(list==null)api.call("/api/playlists","POST",payload("name" to name.trim(),"is_public" to false,"items" to org.json.JSONArray(listOf(item))))
    else api.call("/api/playlists/${list.getString("id")}/items","PUT",item.put("revision",list.getInt("revision")).put("confirm_private",confirmPrivate))
    saved();close()
   }catch(e:CancellationException){throw e}
   catch(e:Exception){error=e.message}
   finally{busy=false}
  }
 }
 AlertDialog(onDismissRequest={if(!busy)close()},title={Text("플레이리스트에 담기")},text={
  Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
   Text(title)
   OutlinedTextField(query,{query=it.take(100)},enabled=!busy,singleLine=true,label={Text("플레이리스트 검색")})
   if(loading)LinearProgressIndicator(Modifier.fillMaxWidth())
   if(lists.isNotEmpty())LazyColumn(Modifier.fillMaxWidth().heightIn(max=180.dp)){
    items(lists,key={it.getString("id")}){list->
     val contains=list.optBoolean("contains")||list.optInt("contains")==1
     TextButton({if(list.optBoolean("is_public")||list.optInt("is_public")==1)confirmation=list else save(list)},
      enabled=!busy&&!contains,modifier=Modifier.fillMaxWidth()){Text(list.optString("name")+if(contains)" · 담김" else "")}
    }
   }
   if(ready)OutlinedTextField(name,{name=it.take(100)},enabled=!busy,singleLine=true,label={Text("새 플레이리스트 이름")})
   error?.let{Text(it,color=Pink,fontSize=12.sp)}
  }
 },dismissButton={TextButton(close,enabled=!busy){Text("닫기")}},
 confirmButton={TextButton({save(null)},enabled=ready&&!busy&&!loading&&name.isNotBlank()){Text("만들고 담기")}})
 confirmation?.let{list->AlertDialog(onDismissRequest={confirmation=null},title={Text("비공개로 변경할까요?")},
  text={Text("이 작품을 담으려면 플레이리스트를 비공개로 변경해야 합니다.")},
  dismissButton={TextButton({confirmation=null}){Text("취소")}},
  confirmButton={TextButton({confirmation=null;save(list,true)}){Text("비공개로 변경 후 담기")}})}
}

@Composable internal fun CoverWorkPlayback(m:MusicModel,song:Song,template:String?,photo:Bitmap?=null,enabled:Boolean=true){
 val active=m.current?.id==song.id
 WorkListeningScene(template.orEmpty(),song.workArtwork(),if(active)m.position else 0L,
  if(active&&m.duration>0)m.duration else (song.duration*1000).toLong(),active&&m.playing,
  if(active)m.workCaption(song.id) else "",enabled,
  play={if(active)m.toggle() else m.play(song)},
  seek={if(active)m.controller?.seekTo(it) else m.play(song,startPosition=it)},selectedPhoto=photo)
}

@Composable internal fun CoverWorkHero(m:MusicModel,song:Song,save:()->Unit,join:()->Unit,comment:()->Unit,share:()->Unit){
 Column(Modifier.fillMaxWidth().padding(top=8.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  CoverWorkPlayback(m,song,song.raw.optString("listening_template"))
  Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
   CoverPickTitle(song,m,Modifier.weight(1f,false),fontSize=22.sp,fontWeight=FontWeight.Bold,maxLines=3,overflow=TextOverflow.Ellipsis)
   Text(if(song.raw.optString("cover_mode")=="duet")"듀엣" else "커버",fontSize=12.sp,color=Pink)
   if(song.raw.optBoolean("can_manage_cover_pick"))TrackActionsMenu(song,m)
  }
  Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
   TextButton(onClick={m.openProfile(song.producerId,showCovers=true)},contentPadding=PaddingValues(0.dp)){
    Avatar(song.credit,JSONObject().put("id",song.producerId).put("image_version",song.raw.opt("producer_image_version")),size=26)
    Text(song.credit,Modifier.padding(start=6.dp),color=SoftText)
   }
   if(song.originalId!=null)TextButton({m.openOriginal(song)}){Text("원곡 듣기")}
  }
  if(song.description.isNotBlank())Text(song.description,color=SoftText)
  val canJoin=if(song.raw.has("duet_joinable"))song.raw.optBoolean("duet_joinable") else song.openDuetFor(m.user?.optString("id"))
  if(canJoin)Button(join,Modifier.fillMaxWidth().heightIn(min=44.dp),colors=ButtonDefaults.buttonColors(containerColor=Color(0xff5b438d),contentColor=Color.White)){
   Text("참여하기")
  }
  Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp)){
   val liked=m.likes.any{it.id==song.id}
   val actions=listOf(
    Triple("좋아요",if(liked)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,{m.like(song)}),
    Triple("댓글",Icons.Rounded.ChatBubbleOutline,comment),Triple("담기",Icons.Rounded.Add,save),
    Triple("선물",Icons.Rounded.CardGiftcard,{m.openGifts(song)}),Triple("공유",Icons.Rounded.Share,share))
   val giftBlocked=!song.raw.optString("gift_block_reason").let{it.isBlank()||it=="null"}||song.raw.opt("user_id")==m.user?.optString("id")&&m.user!=null
   actions.filterNot{it.first=="선물"&&giftBlocked}.forEach{(label,icon,tap)->
    OutlinedButton(tap,Modifier.weight(1f).heightIn(min=44.dp),
     contentPadding=PaddingValues(vertical=5.dp),shape=RoundedCornerShape(8.dp),border=BorderStroke(1.dp,Stroke)){
     Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(2.dp)){
      Icon(icon,null,Modifier.size(17.dp),tint=if(label=="좋아요"&&liked)Pink else LocalContentColor.current)
      Text(label,fontSize=11.sp)
     }
    }
   }
  }
 }
}

@Composable internal fun DubbingWorkScene(m:MusicModel,project:JSONObject,preview:NativeDubbingAudio?=null){
 val id=project.getString("id")
 val final=project.optJSONObject("recording")?.optJSONObject("final")
 val published=final?.optString("state")=="ready"&&final.opt("audioUrl") is String
 val background=project.optJSONObject("sound")?.takeIf{it.optString("state")=="ready"}?.opt("audioUrl") as? String
 val previewing=preview?.previewing?.collectAsState()?.value==true
 var backgroundPosition by remember(id){mutableLongStateOf(0L)}
 LaunchedEffect(id,previewing){
  if(preview!=null)do{backgroundPosition=preview.previewPositionMs();if(previewing)delay(150)}while(previewing)
 }
 val active=published&&m.current?.dubbing==true&&m.current?.id==id
 val position=if(active)m.position else if(!published)backgroundPosition else 0L
 val duration=when{
  active&&m.duration>0->m.duration
  !published&&preview!=null&&preview.previewDurationMs()>0->preview.previewDurationMs()
  else->(project.optDouble("duration",0.0)*1000).toLong()
 }
 val seconds=position/1000.0
 val caption=if(active)final?.optJSONArray("captions").objects().firstOrNull{
  seconds>=it.optDouble("start")&&seconds<it.optDouble("end")
 }?.optString("text").orEmpty() else ""
 WorkListeningScene(project.optString("listening_template"),currentDubbingImage(project),position,duration,
  active&&m.playing||!published&&previewing,caption,(published&&m.controller!=null)||(!published&&preview!=null&&background!=null),
  play={
   if(published){
    preview?.stop()
    if(active&&m.playing)m.controller?.pause() else m.controller?.playDubbingEdition(project)
   }else if(background!=null&&preview!=null){
    m.controller?.pause();preview.togglePreview(background,backgroundPosition)
   }
  },
  seek={target->
   if(published){
    if(!active)m.controller?.playDubbingEdition(project)
    m.controller?.seekTo(target)
   }else if(background!=null&&preview!=null){
    if(preview.previewDurationMs()>0)preview.seekPreview(target)
    else{m.controller?.pause();preview.listen(background,target/1000.0)}
    backgroundPosition=target
   }
  }
 )
}

@Composable internal fun WorkMessageShare(m:MusicModel,id:String,title:String,kind:String,close:()->Unit){
 val account=m.user?.optString("id")?:return
 val scope=rememberCoroutineScope()
 var query by remember(id){mutableStateOf("")}
 var recipients by remember(id){mutableStateOf<List<JSONObject>>(emptyList())}
 var recipient by remember(id){mutableStateOf<JSONObject?>(null)}
 var error by remember(id){mutableStateOf("")}
 var loading by remember(id){mutableStateOf(true)}
 var sending by remember(id){mutableStateOf(false)}
 val ids=remember(id,account){mutableMapOf<String,String>()}
 LaunchedEffect(account,query){
  loading=true;error="";recipients=emptyList();delay(180)
  try{recipients=m.api.call("/api/dm/recipients/search?suggested=1&q="+Uri.encode(query),fresh=true).optJSONArray("members").objects()}
  catch(e:CancellationException){throw e}
  catch(e:Exception){error=e.message.orEmpty()}
  finally{loading=false}
 }
 AlertDialog(onDismissRequest={if(!sending)close()},title={Text("작품 공유")},text={
  Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
   Text(title)
   OutlinedTextField(query,{query=it.take(100);recipient=null},singleLine=true,enabled=!sending,label={Text("받는 사람 검색")})
   if(loading)LinearProgressIndicator(Modifier.fillMaxWidth())
   if(!loading&&recipients.isEmpty())Text("닉네임이나 ID로 받는 사람을 검색해 주세요.",color=SoftText,fontSize=12.sp)
   LazyColumn(Modifier.fillMaxWidth().heightIn(max=220.dp)){
    items(recipients,key={it.optString("id")}){person->
     TextButton({recipient=person},enabled=!sending,modifier=Modifier.fillMaxWidth()){
      RadioButton(selected=recipient?.optString("id")==person.optString("id"),onClick=null)
      Text(person.optString("nickname"),Modifier.padding(start=6.dp))
     }
    }
   }
   if(error.isNotEmpty())Text(error,color=MaterialTheme.colorScheme.error)
  }
 },dismissButton={TextButton(close,enabled=!sending){Text("취소")}},confirmButton={
  TextButton(enabled=!sending&&recipient!=null,onClick={
   val peer=recipient?.optString("id")?.takeIf(CurrentNavigation::safeID)?:return@TextButton
   sending=true;error=""
   scope.launch{
    try{
     val body=payload("track_id" to id,"request_id" to ids.getOrPut(peer){UUID.randomUUID().toString()})
     if(kind=="dubbing")body.put("track_kind","dubbing")
     m.api.call("/api/dm/"+peer,"POST",body)
     if(m.user?.optString("id")==account){m.notice="작품을 보냈습니다.";close();m.refreshMessageSummary()}
    }catch(e:CancellationException){throw e}
    catch(e:Exception){if(m.user?.optString("id")==account)error=e.message.orEmpty()}
    finally{sending=false}
   }
  }){Text(if(sending)"보내는 중…" else "메시지 보내기")}
 })
}
