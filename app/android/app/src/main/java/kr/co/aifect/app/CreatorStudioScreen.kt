@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.ImageLoader
import coil.request.CachePolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

internal fun studioStatus(status:String)=when(status){"published"->"공개됨";"hidden"->"비공개";"uploading"->"업로드 대기";"queued"->"변환 대기";"processing"->"변환 중";"failed"->"변환 실패";"rejected"->"검토 필요";else->status}

@Composable internal fun CreatorStudioScreen(m:MusicModel){
 val account=m.user?.optString("id")
 var editing by rememberSaveable(account){mutableStateOf<String?>(null)}
 var artist by remember(account){mutableStateOf<JSONObject?>(null)}
 var operation by remember(account){mutableStateOf<Pair<Song,String>?>(null)}
 var filter by rememberSaveable{mutableStateOf("전체")}
 if(editing!=null){StudioTrackEditor(m,editing!!.takeUnless{it=="new"}){editing=null;m.loadStudio()};return}
 if(m.user==null){Column(Modifier.padding(20.dp)){Heading("창작자 스튜디오");BrandButton(onClick={m.showLogin=true}){Text("로그인")}};return}
 val quota=m.studioData.optJSONObject("upload_quota")
 val artists=m.studioData.optJSONArray("artists").objects()
 val tracks=m.myTracks.filter{when(filter){"제작곡"->!it.cover;"커버"->it.cover;else->true}}
 LazyColumn(Modifier.fillMaxSize().testTag("creator-studio"),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  item{
   TextButton(onClick={m.selectTab(m.studioReturnTab)}){Icon(Icons.AutoMirrored.Outlined.ArrowBack,null,Modifier.size(18.dp));Text("돌아가기")}
   StudioPanel{Text("창작자 스튜디오",fontSize=25.sp,fontWeight=FontWeight.Bold);Text("음악, 이미지, 프로필을 한곳에서 관리하세요.",color=Muted,fontSize=13.sp)}
  }
  quota?.let{q->item{StudioPanel{
   Text("이번 달 제작곡 ${q.optInt("used")} / ${q.optInt("limit")}곡 · ${q.optInt("remaining")}곡 남음",fontWeight=FontWeight.Bold,color=Pink)
   Text("무료 월 3곡 · Premium 월 10곡\n매월 1일 한국시간에 새로 시작해요. 커버곡은 제한 없이 올릴 수 있어요.",color=Muted,fontSize=13.sp)
  }}}
  item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
   listOf("공개 음악" to m.myTracks.count{it.raw.optString("status")=="published"},"처리 중" to m.myTracks.count{it.raw.optString("status") in listOf("uploading","queued","processing")},"AI 아티스트" to artists.size).forEach{(name,count)->
    Box(Modifier.weight(1f)){StudioPanel{Text(name,fontSize=12.sp,color=Muted);Text("$count",fontSize=24.sp,color=Pink,fontWeight=FontWeight.Bold)}}
   }
  }}
  item{
   Row(verticalAlignment=Alignment.CenterVertically){Text("내 음원 · 앨범 커버",fontSize=18.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f));IconButton(onClick=m::loadStudio,enabled=!m.studioBusy){Icon(Icons.Outlined.Refresh,"스튜디오 새로고침")}}
   BrandButton(onClick={editing="new"},enabled=quota!=null&&quota.optInt("remaining")>0,modifier=Modifier.fillMaxWidth().testTag("studio-upload")){Icon(Icons.Outlined.Upload,null,Modifier.size(20.dp));Text("음원 업로드",Modifier.padding(start=8.dp))}
   Chips(listOf("전체","제작곡","커버"),filter){filter=it}
   if(m.studioBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
   m.studioError?.let{Text(it,color=Pink);TextButton(onClick=m::loadStudio){Text("다시 불러오기")}}
  }
  items(tracks,key={it.id}){song->
   StudioPanel(Modifier.testTag("studio-track-${song.id}")){
    Row(verticalAlignment=Alignment.CenterVertically){if(song.art!=null)StudioImage(song.art,m,Modifier.size(68.dp))else Artwork(song,Modifier.size(68.dp));Column(Modifier.weight(1f).padding(start=12.dp)){
     Text(song.title,fontSize=16.sp,fontWeight=FontWeight.Bold);Text(studioStatus(song.raw.optString("status")),color=Aqua,fontSize=12.sp)
     Text(if(song.cover)"커버 · ${song.credit}" else song.genreLabel,color=Muted,fontSize=12.sp)
    }}
    song.raw.optString("error").takeIf{it.isNotBlank()&&it!="null"}?.let{Text(it,color=Pink,fontSize=12.sp)}
    OutlinedButton(onClick={editing=song.id},modifier=Modifier.fillMaxWidth().testTag("studio-edit-${song.id}")){Icon(Icons.Outlined.Edit,null,Modifier.size(18.dp));Text(if(song.cover)"커버곡 정보 수정" else "커버 · 가사 · 정보 수정",Modifier.padding(start=6.dp))}
    FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)){
     if(song.raw.optString("status")=="published"){
      TextButton(onClick={m.openSong(song)}){Text("곡 보기")}
      TextButton(onClick={operation=song to "unpublish"}){Text("비공개로 전환")}
     }
     if(song.raw.optString("status") in listOf("failed","hidden"))TextButton(onClick={operation=song to "retry"}){Text(if(song.raw.optString("status")=="hidden")"다시 공개" else "다시 처리")}
     TextButton(onClick={operation=song to "delete"},enabled=!m.busy){Text("삭제",color=Muted)}
    }
   }
  }
  if(tracks.isEmpty()&&!m.studioBusy&&m.studioError==null)item{Empty("아직 올린 음악이 없어요","음원 업로드 또는 부르기에서 첫 음악을 남겨보세요.")}
  item{StudioPanel{Text("내 프로필",fontSize=18.sp,fontWeight=FontWeight.Bold);Text("제작곡과 커버곡이 모두 내 프로필에 모여요.",color=Muted,fontSize=13.sp);OutlinedButton(onClick=m::editProfile,modifier=Modifier.fillMaxWidth()){Text("프로필 사진 · 소개 수정")}}}
  if(artists.isNotEmpty())item{Text("AI 가수 · 아티스트 프로필",fontSize=18.sp,fontWeight=FontWeight.Bold)}
  items(artists,key={"artist-"+it.getString("id")}){a->StudioPanel{Row(verticalAlignment=Alignment.CenterVertically){Avatar(a.optString("name"),JSONObject(a.toString()).put("profile_kind","artist"),48);Text(a.optString("name"),Modifier.weight(1f).padding(start=12.dp));TextButton(onClick={artist=a}){Text("수정")}}}}
  item{OutlinedButton(onClick={m.showDiamonds=true},modifier=Modifier.fillMaxWidth()){Text("다이아 · 정산 내역 보기")}}
 }
 operation?.let{(song,action)->AlertDialog(onDismissRequest={if(!m.busy)operation=null},title={Text(if(action=="delete")"음원을 삭제할까요?" else if(action=="unpublish")"비공개로 바꿀까요?" else "다시 처리할까요?")},text={Text(if(action=="delete")"${song.title}\n삭제한 음원은 복구할 수 없어요." else song.title)},confirmButton={TextButton(enabled=!m.busy,onClick={m.action{
  m.api.call("/api/uploads/${song.id}"+(if(action=="delete")"" else "/$action"),if(action=="delete")"DELETE" else "POST")
  operation=null;m.loadStudio();m.refreshLibrary(true);m.notice="변경했어요."
 }}){Text("확인")}},dismissButton={TextButton(onClick={operation=null},enabled=!m.busy){Text("취소")}})}
 artist?.let{StudioArtistEditor(m,it){artist=null;m.loadStudio()}}
}

@Composable internal fun StudioPanel(modifier:Modifier=Modifier,content:@Composable ColumnScope.()->Unit){
 Surface(modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp),color=Panel,border=BorderStroke(1.dp,Stroke.copy(alpha=.7f))){Column(Modifier.musicSurface().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp),content=content)}
}

@Composable private fun StudioImage(data:Any?,m:MusicModel,modifier:Modifier){
 val account=m.user?.optString("id")
 val loader=remember(account){ImageLoader.Builder(m.api.appContext).okHttpClient(m.api.client).diskCachePolicy(CachePolicy.DISABLED).memoryCachePolicy(CachePolicy.DISABLED).build()}
 DisposableEffect(loader){onDispose{loader.shutdown()}}
 AsyncImage(data,"앨범 커버",imageLoader=loader,modifier=modifier,contentScale=ContentScale.Crop)
}

@Composable private fun StudioTrackEditor(m:MusicModel,trackId:String?,close:()->Unit){
 DisposableEffect(m){m.studioEditing=true;onDispose{m.studioEditing=false}}
 val account=m.user?.optString("id")
 var loaded by remember(trackId){mutableStateOf<JSONObject?>(if(trackId==null)JSONObject()else null)}
 var error by remember{mutableStateOf<String?>(null)}
 var retry by remember{mutableIntStateOf(0)}
 LaunchedEffect(trackId,retry){if(trackId!=null)try{val d=m.api.call("/api/studio/tracks/$trackId",fresh=true);if(m.user?.optString("id")==account){loaded=d;error=null}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 if(loaded==null){
  Column(Modifier.padding(20.dp)){
   TextButton(onClick=close){Text("스튜디오로")}
   if(error==null)LinearProgressIndicator(Modifier.fillMaxWidth())
   else{Text(error.orEmpty());TextButton(onClick={retry++}){Text("다시 불러오기")}}
  }
  BackHandler{close()};return
 }
 StudioTrackForm(m,trackId,loaded!!,close)
}

@Composable private fun StudioTrackForm(m:MusicModel,trackId:String?,data:JSONObject,close:()->Unit){
 val account=m.user?.optString("id")
 val initial=data.optJSONObject("profile")?:JSONObject()
 val cover=initial.optString("kind")=="cover"
 val scope=rememberCoroutineScope()
 var title by rememberSaveable{mutableStateOf(initial.optString("title"))}
 var description by rememberSaveable{mutableStateOf(initial.optString("description"))}
 var tool by rememberSaveable{mutableStateOf(initial.optString("ai_tool"))}
 var genres by rememberSaveable{mutableStateOf(initial.optJSONArray("genres")?.let{(0 until it.length()).joinToString(", "){i->it.optString(i)}}?:initial.optString("genre","K-POP"))}
 var moods by rememberSaveable{mutableStateOf(initial.optJSONArray("moods")?.let{(0 until it.length()).joinToString(", "){i->it.optString(i)}}?:"")}
 var artistId by rememberSaveable{mutableStateOf(initial.optString("artist_id","none"))}
 var newArtist by rememberSaveable{mutableStateOf("")}
 var mode by rememberSaveable{mutableStateOf(initial.optString("performance_mode","solo"))}
 var lyricsMode by rememberSaveable{mutableStateOf(initial.optString("lyrics_mode","none"))}
 var lyrics by rememberSaveable{mutableStateOf(initial.optString("lyrics"))}
 var autoSource by rememberSaveable{mutableStateOf(data.optJSONObject("alignment")?.optString("source_text").orEmpty())}
 var rights by rememberSaveable{mutableStateOf(false)}
 var karaoke by rememberSaveable{mutableStateOf(false)}
 var ai by rememberSaveable{mutableStateOf(false)}
 var audio by remember{mutableStateOf<StudioAudio?>(null)}
 var image by remember{mutableStateOf<Uri?>(null)}
 var draftId by remember{mutableStateOf<String?>(null)}
 var working by remember{mutableStateOf(false)}
 var stage by remember{mutableStateOf("")}
 var error by remember{mutableStateOf<String?>(null)}
 var confirmLeave by remember{mutableStateOf(false)}
 var artistPicker by remember{mutableStateOf(false)}
 val artists=m.studioData.optJSONArray("artists").objects()
 fun leave(){if(!working)confirmLeave=true}
 BackHandler{leave()}
 DisposableEffect(Unit){onDispose{audio?.file?.delete()}}
 val audioPicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)scope.launch{
  working=true;stage="음원 파일 확인 중…";try{val selected=m.api.prepareStudioAudio(uri);audio?.file?.delete();audio=selected;if(title.isBlank())title=selected.name.substringBeforeLast('.');error=null}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{working=false;stage=""}
 }}
 val imagePicker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)image=uri}
 fun save(){scope.launch{
  working=true;error=null
  try{
   var uploadAd:String?=null
   val body=if(cover)payload("description" to description)else JSONObject(initial.toString()).apply{
    put("title",title.trim());put("description",description);put("ai_tool",tool.trim());put("genre",genres.split(',').first().trim())
    put("genres",JSONArray(genres.split(',').map{it.trim()}.filter{it.isNotEmpty()}));put("moods",JSONArray(moods.split(',').map{it.trim()}.filter{it.isNotEmpty()}))
    if(artistId=="new"){remove("artist_id");put("artist",newArtist.trim())}else put("artist_id",artistId)
    put("performance_mode",mode);put("lyrics_mode",lyricsMode)
    if(lyricsMode=="auto"){put("lyrics_source",autoSource);put("lyrics_language","ko")}else put("lyrics",lyrics)
   }
   if(trackId==null){
    val file=audio?:throw IllegalArgumentException("음원 파일을 선택해주세요.")
    body.put("producer",m.studioData.optJSONObject("producer")?.optString("name")?:m.user?.optString("name"));body.put("extension",file.extension);body.put("bytes",file.file.length());body.put("rights",rights);body.put("is_ai",ai);body.put("karaoke",karaoke)
    stage="1 / 3 · 업로드 준비 중…"
    val id=draftId?:m.api.call("/api/uploads","POST",body).getString("id").also{draftId=it}
    // Reuse the same draft after a network failure. A completed draft is never submitted twice.
    val status=m.api.call("/api/studio/tracks/$id",fresh=true).getJSONObject("profile").optString("status")
    if(status=="uploading"){
     stage="2 / 3 · 음원 업로드 중…";m.api.uploadStudioAudio("/api/uploads/$id/audio",file.file)
     image?.let{stage="앨범 커버 저장 중…";m.api.uploadWebp("/api/uploads/$id/cover",it)}
     stage="3 / 3 · 음악 제출 중…"
     if(m.api.call("/api/uploads/$id/complete","POST").optBoolean("show_upload_ad"))uploadAd=id
    }
   }else{
    stage="음원 정보 저장 중…";m.api.call("/api/studio/tracks/$trackId","PUT",body)
    if(!cover)image?.let{stage="앨범 커버 저장 중…";m.api.uploadWebp("/api/studio/tracks/$trackId/image",it)}
   }
   m.api.invalidateReads()
   if(account==m.user?.optString("id")){m.notice=if(trackId==null)"음원을 올렸어요. 변환이 끝나면 공개돼요." else "음원 정보를 저장했어요.";m.refreshLibrary(true);close();uploadAd?.let{SongAdBreaks.afterCoverUpload(it,{m.controller?.pause()},{})}}
  }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}
  finally{working=false;stage=""}
 }}
 Column(Modifier.fillMaxSize().testTag("studio-track-editor")){
  Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),verticalAlignment=Alignment.CenterVertically){IconButton(onClick=::leave,enabled=!working){Icon(Icons.AutoMirrored.Outlined.ArrowBack,"스튜디오로 돌아가기")};Text(if(trackId==null)"음원 업로드" else "음원 수정",fontSize=21.sp,fontWeight=FontWeight.Bold)}
  Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(18.dp).testTag("studio-editor-scroll"),verticalArrangement=Arrangement.spacedBy(14.dp)){
   if(!cover){
    if(trackId==null){OutlinedButton(onClick={audioPicker.launch(arrayOf("audio/*","application/octet-stream"))},enabled=!working&&draftId==null,modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.AudioFile,null);Text(audio?.name?:"WAV · FLAC · MP3 선택 (80MB 이하)",Modifier.padding(start=8.dp))}}
    StudioField("곡 제목",title,{title=it.take(120)},!working&&draftId==null,"studio-title")
    StudioPanel{
     val picture=image?:trackId?.takeIf{initial.optInt("has_cover")>0}?.let{Endpoint.url("/media/$it/cover?v=${initial.optString("cover_version")}")}
     picture?.let{StudioImage(it,m,Modifier.size(144.dp).align(Alignment.CenterHorizontally))}
     OutlinedButton(onClick={imagePicker.launch("image/*")},enabled=!working,modifier=Modifier.fillMaxWidth().testTag("studio-cover-picker")){Icon(Icons.Outlined.AddPhotoAlternate,null);Text("앨범 커버 변경",Modifier.padding(start=8.dp))}
    }
    OutlinedButton(onClick={artistPicker=true},enabled=!working&&draftId==null,modifier=Modifier.fillMaxWidth()){Text("AI 아티스트 · "+when(artistId){"none"->"선택 안 함 (내 활동명)";"new"->"새 아티스트";else->artists.find{it.optString("id")==artistId}?.optString("name")?:"내 활동명"})}
    if(artistId=="new")StudioField("새 아티스트 이름",newArtist,{newArtist=it.take(60)},!working&&draftId==null)
    StudioField("AI 제작 도구",tool,{tool=it.take(100)},!working&&draftId==null)
    if(draftId==null){Text("노래 구성",color=Muted,fontSize=13.sp);Chips(listOf("솔로","듀엣"),if(mode=="duet")"듀엣"else"솔로"){if(!working)mode=if(it=="듀엣")"duet"else"solo"}}
    StudioChoiceField("장르",genres,Genres.map{it to it},3,1,!working&&draftId==null){genres=it}
    StudioChoiceField("기분",moods,MoodTiles.map{it.id to it.name},4,0,!working&&draftId==null){moods=it}
    Text("새 제작곡은 업로드 후 AI가 음원을 분석해 장르와 기분을 분류해요.",fontSize=12.sp,color=Muted)
    Text("가사",fontSize=18.sp,fontWeight=FontWeight.Bold)
    if(draftId==null)Chips(listOf("가사 없음","자동 싱크","LRC 직접 입력"),when(lyricsMode){"auto"->"자동 싱크";"synced"->"LRC 직접 입력";else->"가사 없음"}){if(!working)lyricsMode=when(it){"자동 싱크"->"auto";"LRC 직접 입력"->"synced";else->"none"}}
    if(lyricsMode!="none")OutlinedTextField(if(lyricsMode=="auto")autoSource else lyrics,{if(lyricsMode=="auto")autoSource=it.take(6000)else lyrics=it.take(12000)},label={Text(if(lyricsMode=="auto")"가사를 줄마다 입력하세요"else"[00:12.500] 가사")},minLines=5,modifier=Modifier.fillMaxWidth().testTag("studio-lyrics"),enabled=!working&&draftId==null)
    if(lyricsMode=="auto")Text("입력한 가사로 자동 싱크를 요청해요. 완료 상태는 스튜디오에서 확인할 수 있어요.",color=Muted,fontSize=12.sp)
    data.optJSONObject("alignment")?.let{Text("가사 싱크 · ${it.optString("state")}",fontSize=12.sp,color=Aqua)}
    if(trackId!=null)StudioBackingControls(m,trackId,data.optJSONObject("karaoke"),working)
   }else Text("커버곡의 사진은 내 프로필 사진을 사용해요. 제목과 장르는 원곡을 따릅니다.",color=Muted,fontSize=13.sp)
   OutlinedTextField(description,{description=it.take(if(cover)1000 else 4000)},label={Text("곡 소개")},minLines=3,enabled=!working&&draftId==null,modifier=Modifier.fillMaxWidth().testTag("studio-description"))
   if(trackId==null){
    StudioConsent("AI로 제작한 음원입니다.",ai,!working&&draftId==null){ai=it}
    StudioConsent("음원과 이미지의 권리를 보유하고 있습니다.",rights,!working&&draftId==null){rights=it}
    StudioConsent("노래방 MR 제공 및 다른 이용자의 커버를 허락합니다.",karaoke,!working&&draftId==null){karaoke=it}
   }
   if(working){LinearProgressIndicator(Modifier.fillMaxWidth());Text(stage,color=Aqua)}
   error?.let{Text(it,color=MaterialTheme.colorScheme.error,modifier=Modifier.testTag("studio-save-error"))}
   BrandButton(onClick=::save,enabled=!working&&(cover||title.isNotBlank()&&tool.isNotBlank())&&(trackId!=null||audio!=null&&rights&&ai&&karaoke),modifier=Modifier.fillMaxWidth().testTag("studio-save")){Text(if(working)"저장 중…"else if(draftId!=null)"업로드 다시 시도"else if(trackId==null)"음원 올리기"else"변경사항 저장")}
  }
 }
 if(confirmLeave)AlertDialog(onDismissRequest={confirmLeave=false},title={Text("스튜디오로 돌아갈까요?")},text={Text("저장하지 않은 변경사항은 사라져요.")},confirmButton={TextButton(onClick=close){Text("돌아가기")}},dismissButton={TextButton(onClick={confirmLeave=false}){Text("계속 수정")}})
 if(artistPicker)AlertDialog(onDismissRequest={artistPicker=false},title={Text("AI 아티스트")},text={Column(Modifier.verticalScroll(rememberScrollState())){
  (listOf("none" to "선택 안 함 (내 활동명)")+(if(trackId==null)listOf("new" to "새 아티스트 만들기")else emptyList())+artists.map{it.getString("id") to it.optString("name")}).forEach{(id,name)->TextButton(onClick={artistId=id;artistPicker=false}){Text(name)}}
 }},confirmButton={TextButton(onClick={artistPicker=false}){Text("닫기")}})
}

@Composable private fun StudioConsent(label:String,checked:Boolean,enabled:Boolean,onChange:(Boolean)->Unit){Row(verticalAlignment=Alignment.CenterVertically){Checkbox(checked,onChange,enabled=enabled,modifier=Modifier.testTag("studio-consent-$label"));Text(label,fontSize=13.sp)}}
@Composable private fun StudioField(label:String,value:String,onChange:(String)->Unit,enabled:Boolean=true,tag:String="studio-field-$label"){
 OutlinedTextField(value,onChange,label={Text(label)},enabled=enabled,modifier=Modifier.fillMaxWidth().testTag(tag),singleLine=true,shape=RoundedCornerShape(12.dp))
}

@Composable private fun StudioArtistEditor(m:MusicModel,a:JSONObject,close:()->Unit){
 var name by remember{mutableStateOf(a.optString("name"))};var bio by remember{mutableStateOf(a.optString("bio"))};var genre by remember{mutableStateOf(a.optString("genre","K-POP"))}
 var picture by remember{mutableStateOf<Uri?>(null)};var busy by remember{mutableStateOf(false)};var error by remember{mutableStateOf<String?>(null)}
 val account=m.user?.optString("id");val scope=rememberCoroutineScope()
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){picture=it}
 ModalBottomSheet(onDismissRequest={if(!busy)close()},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){Column(Modifier.imePadding().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("AI 아티스트 수정",fontSize=22.sp);StudioField("이름",name,{name=it.take(60)},!busy);StudioField("장르",genre,{genre=it.take(80)},!busy)
  OutlinedTextField(bio,{bio=it.take(1000)},label={Text("소개")},modifier=Modifier.fillMaxWidth(),enabled=!busy)
  picture?.let{AsyncImage(it,"선택한 사진",Modifier.size(100.dp))}
  OutlinedButton(onClick={picker.launch("image/*")},enabled=!busy){Text("프로필 사진 변경")}
  error?.let{Text(it,color=Pink)}
  BrandButton(onClick={scope.launch{busy=true;try{m.api.call("/api/studio/artists/${a.getString("id")}","PUT",payload("name" to name,"bio" to bio,"genre" to genre));picture?.let{m.api.uploadWebp("/api/studio/artists/${a.getString("id")}/image",it)};m.api.invalidateReads();if(account==m.user?.optString("id")){m.notice="아티스트를 저장했어요.";close()}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}},enabled=!busy&&name.isNotBlank(),modifier=Modifier.fillMaxWidth()){Text("저장")}
 }}
}

@Composable private fun StudioBackingControls(m:MusicModel,id:String,k:JSONObject?,saving:Boolean){
 var busy by remember{mutableStateOf(false)};var confirm by remember{mutableStateOf(false)};var status by remember{mutableStateOf<String?>(null)}
 val scope=rememberCoroutineScope()
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)scope.launch{busy=true;var file:File?=null;try{val audio=m.api.prepareStudioAudio(uri);file=audio.file;m.api.uploadStudioAudio("/api/studio/tracks/$id/karaoke/mr?ext=${audio.extension}",audio.file);status="반주 파일을 올렸어요. 변환 중입니다."}catch(e:Exception){if(e is CancellationException)throw e;status=e.message}finally{file?.delete();busy=false}}}
 StudioPanel{
  Text("노래방 MR",fontWeight=FontWeight.Bold);Text(status?:if(k?.optBoolean("mr_ready")==true)"반주 준비 완료"else k?.optString("state").orEmpty().ifBlank{"반주 준비 중"},fontSize=13.sp,color=Muted)
  OutlinedButton(onClick={picker.launch(arrayOf("audio/*","application/octet-stream"))},enabled=!busy&&!saving,modifier=Modifier.fillMaxWidth()){Text("내 반주 파일로 바꾸기")}
  TextButton(onClick={confirm=true},enabled=!busy&&!saving){Text("MR 자동으로 다시 만들기")}
  Text("원곡과 길이가 같은 WAV · FLAC · MP3, 80MB 이하",fontSize=12.sp,color=Muted)
 }
 if(confirm)AlertDialog(onDismissRequest={confirm=false},title={Text("MR을 다시 만들까요?")},text={Text("현재 반주를 원곡에서 새로 분리한 반주로 바꿔요.")},confirmButton={TextButton(onClick={confirm=false;scope.launch{busy=true;try{m.api.call("/api/studio/tracks/$id/karaoke","POST");status="반주를 다시 만들고 있어요."}catch(e:Exception){if(e is CancellationException)throw e;status=e.message}finally{busy=false}}}){Text("다시 만들기")}},dismissButton={TextButton(onClick={confirm=false}){Text("취소")}})
}

@Composable private fun StudioChoiceField(label:String,value:String,options:List<Pair<String,String>>,max:Int,min:Int,enabled:Boolean,onChange:(String)->Unit){
 var open by remember{mutableStateOf(false)}
 val selected=value.split(',').map{it.trim()}.filter{it.isNotEmpty()}
 Text(label,color=Muted,fontSize=13.sp)
 OutlinedButton(onClick={open=true},enabled=enabled,modifier=Modifier.fillMaxWidth()){
  Text(selected.joinToString(" · "){id->options.find{it.first==id}?.second?:id}.ifBlank{"선택 안 함"},modifier=Modifier.weight(1f));Icon(Icons.Outlined.ExpandMore,null)
 }
 if(open){
  var chosen by remember{mutableStateOf(selected)}
  AlertDialog(onDismissRequest={open=false},title={Text("$label · 최대 ${max}개")},text={Column(Modifier.heightIn(max=360.dp).verticalScroll(rememberScrollState())){
   (options+selected.filter{id->options.none{it.first==id}}.map{it to it}).forEach{(id,name)->Row(verticalAlignment=Alignment.CenterVertically){
    val checked=id in chosen
    Checkbox(checked,{chosen=if(it)chosen+id else chosen-id},enabled=checked||chosen.size<max);Text(name,fontSize=14.sp)
   }}
  }},confirmButton={TextButton(enabled=chosen.size>=min,onClick={onChange(chosen.joinToString(", "));open=false}){Text("적용")}},dismissButton={TextButton(onClick={open=false}){Text("취소")}})
 }
}
