@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import coil.compose.AsyncImage
import coil.ImageLoader
import coil.request.CachePolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.text.Normalizer

internal fun studioStatus(status:String)=when(status){"published"->"공개됨";"hidden"->"비공개";"uploading"->"업로드 대기";"queued"->"음원 변환 대기";"processing"->"음원 변환 중";"failed"->"음원 변환 실패";"rejected"->"검토 필요";else->status}

private fun studioLyricsStatus(row:JSONObject):String?=when(row.optString("alignment_state")){
 "queued"->"가사 싱크 대기";"processing"->"가사 싱크 작업 중";"ready"->"자동 가사 확인 필요";"failed"->"가사 싱크 재시도 필요"
 else->when(row.optString("lyrics_mode")){"no_lyrics"->"가사 없음";"later","none"->"가사 미등록";"synced"->"가사 등록";else->null}
}

private val studioLyricsModes=linkedMapOf("auto" to "가사 입력하고 자동 싱크 (추천)","no_lyrics" to "가사가 없는 노래","later" to "나중에 등록","synced" to "직접 싱크 등록 / LRC")
private val studioDefaultLanguages=linkedMapOf("ko" to "한국어","en" to "영어","ja" to "일본어","zh" to "중국어","es" to "스페인어","fr" to "프랑스어","de" to "독일어","pt" to "포르투갈어")
private val studioParticipation=listOf("작사","작곡","편곡","보컬","믹싱")
private fun JSONArray?.texts():List<String> = if(this==null)emptyList() else (0 until length()).map{optString(it)}
private fun stripStudioAnnotations(text:String)=text.replace(Regex("\\[[^\\]\\r\\n]*]"),"")
private fun validStudioAutoLyrics(text:String):Boolean{
 val lines=stripStudioAnnotations(text).lineSequence().map{it.trim()}.filter{it.isNotEmpty()}.toList()
 return text.length<=6000&&lines.size in 1..200&&lines.none{it.length>300}&&!Regex("\\[\\d{1,3}:").containsMatchIn(text)
}

@Composable internal fun CreatorStudioScreen(m:MusicModel){
 val account=m.user?.optString("id")
 var editing by rememberSaveable(account){mutableStateOf<String?>(null)}
 var artist by remember(account){mutableStateOf<JSONObject?>(null)}
 var operation by remember(account){mutableStateOf<Pair<Song,String>?>(null)}
 var filter by rememberSaveable{mutableStateOf("전체")}
 if(editing!=null){StudioTrackEditor(m,editing!!.takeUnless{it=="new"}){editing=null;m.loadStudio()};return}
 if(m.user==null){Column(Modifier.padding(20.dp)){Heading("스튜디오");BrandButton(onClick={m.showLogin=true}){Text("로그인")}};return}
 val quota=m.studioData.optJSONObject("upload_quota")
 val artists=m.studioData.optJSONArray("artists").objects()
 val tracks=m.myTracks.filter{when(filter){"제작곡"->!it.cover;"커버"->it.cover;else->true}}
 LazyColumn(Modifier.fillMaxSize().testTag("creator-studio"),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  item{
   TextButton(onClick={m.selectTab(m.studioReturnTab)}){Icon(Icons.AutoMirrored.Outlined.ArrowBack,null,Modifier.size(18.dp));Text("돌아가기")}
   Text("스튜디오",fontSize=25.sp,fontWeight=FontWeight.Bold)
   Text("음악, 이미지, 프로필을 한곳에서 관리하세요.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=8.dp))
  }
  item{val context=androidx.compose.ui.platform.LocalContext.current;Surface(onClick={openNativePerformance(context,m,"dubbing?tab=mine")},color=Panel,shape=RoundedCornerShape(14.dp),modifier=Modifier.fillMaxWidth()){
   Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically){Icon(Icons.Outlined.MicNone,null,tint=Aqua);Column(Modifier.weight(1f).padding(start=12.dp)){Text("내 더빙 관리",fontSize=15.sp,fontWeight=FontWeight.SemiBold);Text("대본 · 녹음 · 완성작",color=Muted,fontSize=12.sp)};Icon(Icons.Outlined.ChevronRight,null,tint=Muted)}
  }}
  quota?.let{q->item{Column(Modifier.padding(vertical=8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
   Text("이번 달 제작곡 ${q.optInt("used")} / ${q.optInt("limit")}곡 · ${q.optInt("remaining")}곡 남음",fontWeight=FontWeight.Bold,color=Pink)
   Text("무료 월 3곡 · Premium 월 10곡\n매월 1일 한국시간에 새로 시작해요. 커버곡은 제한 없이 올릴 수 있어요.",color=Muted,fontSize=13.sp)
  }}}
  item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
   listOf("공개 음악" to m.myTracks.count{it.raw.optString("status")=="published"},"처리 중" to m.myTracks.count{it.raw.optString("status") in listOf("uploading","queued","processing")},"AI 아티스트" to artists.size).forEach{(name,count)->
    Column(Modifier.weight(1f).padding(vertical=8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Text(name,fontSize=12.sp,color=Muted);Text("$count",fontSize=24.sp,color=SoftText,fontWeight=FontWeight.Bold)}
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
     if(!song.cover)studioLyricsStatus(song.raw)?.let{Text(it,color=Muted,fontSize=12.sp)}
    }}
    song.raw.optString("error").takeIf{it.isNotBlank()&&it!="null"}?.let{Text(it,color=Pink,fontSize=12.sp)}
    FilledTonalButton(onClick={editing=song.id},modifier=Modifier.fillMaxWidth().testTag("studio-edit-${song.id}")){Icon(Icons.Outlined.Edit,null,Modifier.size(18.dp));Text(if(song.cover)"커버곡 정보 수정" else "커버 · 가사 · 정보 수정",Modifier.padding(start=6.dp))}
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
  item{StudioPanel{Text("내 프로필",fontSize=18.sp,fontWeight=FontWeight.Bold);Text("제작곡과 커버곡이 모두 내 프로필에 모여요.",color=Muted,fontSize=13.sp);TextButton(onClick=m::editProfile,modifier=Modifier.fillMaxWidth()){Text("프로필 사진 · 소개 수정")}}}
  if(artists.isNotEmpty())item{Text("AI 가수 · 아티스트 프로필",fontSize=18.sp,fontWeight=FontWeight.Bold)}
  items(artists,key={"artist-"+it.getString("id")}){a->StudioPanel{Row(verticalAlignment=Alignment.CenterVertically){Avatar(a.optString("name"),JSONObject(a.toString()).put("profile_kind","artist"),48);Text(a.optString("name"),Modifier.weight(1f).padding(start=12.dp));TextButton(onClick={artist=a}){Text("수정")}}}}
  item{TextButton(onClick={m.showDiamonds=true},modifier=Modifier.fillMaxWidth()){Text("다이아 · 정산 내역 보기")}}
 }
 operation?.let{(song,action)->AlertDialog(onDismissRequest={if(!m.busy)operation=null},title={Text(if(action=="delete")"음원을 삭제할까요?" else if(action=="unpublish")"비공개로 바꿀까요?" else "다시 처리할까요?")},text={Text(if(action=="delete")"${song.title}\n삭제한 음원은 복구할 수 없어요." else song.title)},confirmButton={TextButton(enabled=!m.busy,onClick={m.action{
  m.api.call("/api/uploads/${song.id}"+(if(action=="delete")"" else "/$action"),if(action=="delete")"DELETE" else "POST")
  operation=null;m.loadStudio();m.refreshLibrary(true);m.notice="변경했어요."
 }}){Text("확인")}},dismissButton={TextButton(onClick={operation=null},enabled=!m.busy){Text("취소")}})}
 artist?.let{StudioArtistEditor(m,it){artist=null;m.loadStudio()}}
}

@Composable internal fun StudioPanel(modifier:Modifier=Modifier,content:@Composable ColumnScope.()->Unit){
 Surface(modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp),color=Panel){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp),content=content)}
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

@OptIn(ExperimentalFoundationApi::class)
@Composable private fun StudioTrackForm(m:MusicModel,trackId:String?,data:JSONObject,close:()->Unit){
 val account=m.user?.optString("id")
 val initial=data.optJSONObject("profile")?:JSONObject()
 val cover=initial.optString("kind")=="cover"
 val appearance=remember(trackId){WorkAppearance(initial.optString("listening_template"),initial.optString("description"))}
 DisposableEffect(appearance){onDispose{appearance.close()}}
 val scope=rememberCoroutineScope()
 val creating=trackId==null
 var title by rememberSaveable{mutableStateOf(initial.optString("title"))}
 var description by rememberSaveable{mutableStateOf(initial.optString("description"))}
 var tool by rememberSaveable{mutableStateOf(initial.optString("ai_tool"))}
 var genres by rememberSaveable{mutableStateOf(initial.optJSONArray("genres")?.let{(0 until it.length()).joinToString(", "){i->it.optString(i)}}?:initial.optString("genre","K-POP"))}
 var moods by rememberSaveable{mutableStateOf(initial.optJSONArray("moods")?.let{(0 until it.length()).joinToString(", "){i->it.optString(i)}}?:"")}
 var artistId by rememberSaveable{mutableStateOf(initial.optString("artist_id","none"))}
 var newArtist by rememberSaveable{mutableStateOf("")}
 var mode by rememberSaveable{mutableStateOf(initial.optString("performance_mode","solo"))}
 var lyricsMode by rememberSaveable{mutableStateOf(if(data.optJSONObject("alignment")?.optString("state") in listOf("queued","processing","ready","failed"))"auto" else initial.optString("lyrics_mode",if(creating)"auto" else "none"))}
 var lyrics by rememberSaveable{mutableStateOf(initial.optString("lyrics"))}
 var autoSource by rememberSaveable{mutableStateOf(data.optJSONObject("alignment")?.optString("source_text").orEmpty())}
 var lyricsLanguage by rememberSaveable{mutableStateOf(data.optJSONObject("alignment")?.optString("language","ko")?:"ko")}
 var lyricsChanged by rememberSaveable{mutableStateOf(false)}
 var autoFilename by rememberSaveable{mutableStateOf("")}
 var syncedFilename by rememberSaveable{mutableStateOf("")}
 var uploadConsent by rememberSaveable(account,trackId){mutableStateOf(false)}
 var audioPath by rememberSaveable(account,trackId){mutableStateOf<String?>(null)}
 var audioName by rememberSaveable(account,trackId){mutableStateOf("")}
 val audio=audioPath?.let{path->File(path).takeIf{it.isFile}?.let{StudioAudio(it,audioName,it.extension)}}
 var image by rememberSaveable(account,trackId){mutableStateOf<Uri?>(null)}
 var draftId by rememberSaveable(account,trackId){mutableStateOf<String?>(null)}
 var requestId by rememberSaveable(account,trackId){mutableStateOf<String?>(null)}
 var availableOptions by remember{mutableStateOf<JSONObject?>(null)}
 var optionsAttempt by remember{mutableIntStateOf(0)}
 var producer by rememberSaveable(account,trackId){mutableStateOf(m.studioData.optJSONObject("producer")?.optString("name")?:m.user?.optString("name").orEmpty())}
 var uploadGenres by rememberSaveable(account,trackId){mutableStateOf(arrayListOf<String>())}
 var aiTools by rememberSaveable{mutableStateOf(arrayListOf<String>())}
 var otherTool by rememberSaveable{mutableStateOf(false)}
 var noAI by rememberSaveable{mutableStateOf(false)}
 var participation by rememberSaveable{mutableStateOf(arrayListOf<String>())}
 var tags by rememberSaveable{mutableStateOf("")}
 var qa by rememberSaveable{mutableStateOf(false)}
 var working by remember{mutableStateOf(false)}
 var stage by remember{mutableStateOf("")}
 var error by remember{mutableStateOf<String?>(null)}
 var confirmLeave by remember{mutableStateOf(false)}
 var artistPicker by remember{mutableStateOf(false)}
 val artists=m.studioData.optJSONArray("artists").objects()
 val sectionKeys=remember{listOf("audio","cover","title","producer","artist","genres","lyrics","credit","consent").associateWith{BringIntoViewRequester()}}
 val focusKeys=remember{listOf("title","producer","artist","genres","lyrics","credit").associateWith{FocusRequester()}}
 val terms=availableOptions?.optJSONObject("terms")
 val creditTools=availableOptions?.optJSONArray("ai_tools").objects().map{it.optString("name")}
 val otherCredits=tool.split(Regex("[,，;\\n]")).map{it.trim()}.filter{it.isNotEmpty()}
 val credit=(aiTools+if(otherTool)otherCredits else emptyList()).distinctBy{it.lowercase()}.joinToString(", ")
 LaunchedEffect(account,creating,optionsAttempt){
  if(creating)try{availableOptions=m.api.call("/api/studio/upload-options")}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}
 }
 fun leave(){if(!working)confirmLeave=true}
 BackHandler{leave()}
 fun discard(){audio?.file?.delete();close()}
 val audioPicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)scope.launch{
  working=true;stage="음원 파일 확인 중…";try{val selected=m.api.prepareStudioAudio(uri);audio?.file?.delete();audioPath=selected.file.path;audioName=selected.name;if(title.isBlank())title=selected.name.substringBeforeLast('.');error=null}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{working=false;stage=""}
 }}
 val imagePicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)scope.launch{
  try{
   withContext(Dispatchers.IO){
    val resolver=m.api.appContext.contentResolver
    require(resolver.getType(uri) in listOf("image/jpeg","image/png","image/webp")){"JPG·PNG·WebP 이미지를 선택해 주세요."}
    val size=resolver.openAssetFileDescriptor(uri,"r")?.use{it.length}?:-1
    require(size<=5*1024*1024){"커버 이미지는 5MB 이하로 선택해 주세요."}
    runCatching{resolver.takePersistableUriPermission(uri,android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)}
   }
   image=uri;error=null
  }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}
 }}
 val lyricPicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)scope.launch{
  try{
   val (name,text)=withContext(Dispatchers.IO){
    val resolver=m.api.appContext.contentResolver
    val name=resolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())it.getString(0)else null}.orEmpty()
    require(name.substringAfterLast('.').lowercase() in if(lyricsMode=="auto")listOf("txt")else listOf("txt","lrc")){"지원하는 가사 파일을 선택해 주세요."}
    val bytes=resolver.openInputStream(uri)?.use{input->
     val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
     while(output.size()<=65536){val count=input.read(buffer);if(count<0)break;output.write(buffer,0,count)}
     output.toByteArray()
    }?:error("가사 파일을 열 수 없습니다.")
    require(bytes.size<=65536){"가사 파일은 64KB 이하로 선택해 주세요."}
    name to Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString()
   }
   if(lyricsMode=="auto"){require(validStudioAutoLyrics(text)){"자동 싱크 가사는 최대 6,000자·200줄, 한 줄 300자입니다."};autoSource=stripStudioAnnotations(text);autoFilename=name}
   else {require(text.length<=12000){"가사는 최대 12,000자까지 입력해 주세요."};lyrics=text;syncedFilename=name}
   lyricsChanged=true;error=null
  }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}
 }}
 fun save(){
  if(working)return
  val missing=if(!creating)null else when{
   audio==null->"audio" to "음원 파일을 선택해 주세요."
   image==null->"cover" to "커버 이미지를 선택해 주세요."
   draftId!=null->null
   title.isBlank()->"title" to "곡 제목을 입력해 주세요."
   producer.isBlank()->"producer" to "제작자 이름을 입력해 주세요."
   artistId=="new"&&newArtist.isBlank()->"artist" to "아티스트 이름을 입력해 주세요."
   uploadGenres.isEmpty()->"genres" to "장르를 추가해 주세요."
   lyricsMode=="auto"&&!validStudioAutoLyrics(autoSource)->"lyrics" to "자동 싱크 가사를 확인해 주세요. 최대 6,000자·200줄, 한 줄 300자입니다."
   lyricsMode=="synced"&&lyrics.isBlank()->"lyrics" to "LRC 파일을 불러오거나 타임코드를 입력해 주세요."
   !noAI&&(credit.isBlank()||credit.length>100||otherTool&&otherCredits.isEmpty())->"credit" to "도구 또는 AI 사용 안 함을 선택해 주세요. 도구 이름은 합계 100자 이내입니다."
   !uploadConsent||terms==null->"consent" to "음원 이용허락을 확인하고 동의해 주세요."
   else->null
  }
  if(missing!=null){error=missing.second;scope.launch{sectionKeys[missing.first]?.bringIntoView();runCatching{focusKeys[missing.first]?.requestFocus()}};return}
  working=true
  scope.launch{
  error=null
  try{
   var uploadAd:String?=null
   val body=if(cover)appearance.changes("description").apply{put("release_date",initial.optString("release_date").takeUnless{it=="null"}?:"")}else JSONObject(initial.toString()).apply{
    val chosen=if(creating)uploadGenres else genres.split(',').map{it.trim()}.filter{it.isNotEmpty()}
    put("title",title.trim());put("description",description);put("ai_tool",if(creating){if(noAI)"AI 사용 안 함" else credit}else tool.trim());put("genre",chosen.firstOrNull().orEmpty())
    put("genres",JSONArray(chosen));put("moods",JSONArray(moods.split(',').map{it.trim()}.filter{it.isNotEmpty()}))
    if(artistId=="new"){remove("artist_id");put("artist",newArtist.trim())}else put("artist_id",artistId)
    put("performance_mode",mode)
    if(!creating)put("is_ai",tool.trim()!="AI 사용 안 함")
    remove("lyrics_mode");remove("lyrics");remove("lyrics_source");remove("lyrics_language")
    if(creating||lyricsChanged){
     put("lyrics_mode",if(lyricsMode=="none")"later" else lyricsMode)
     if(lyricsMode=="auto"){put("lyrics_source",autoSource);put("lyrics_language",lyricsLanguage)}
     if(lyricsMode=="synced")put("lyrics",lyrics)
    }
   }
   if(trackId==null){
    val file=audio?:throw IllegalArgumentException("음원 파일을 선택해주세요.")
    body.put("producer",producer.trim());body.put("extension",file.extension);body.put("bytes",file.file.length());body.put("rights",uploadConsent);body.put("is_ai",!noAI);body.put("karaoke",uploadConsent)
    body.put("upload_consent_version",terms?.optString("version"));body.put("classification_mode","manual")
    body.put("participation",participation.joinToString(", "));body.put("tags",tags)
    body.put("request_id",requestId?:UUID.randomUUID().toString().also{requestId=it})
    stage="1 / 3 · 업로드 준비 중…"
    val id=draftId?:m.api.call("/api/uploads","POST",body).getString("id").also{draftId=it}
    // Reuse the same draft after a network failure. A completed draft is never submitted twice.
    val status=m.api.call("/api/studio/tracks/$id",fresh=true).getJSONObject("profile").optString("status")
    if(status=="uploading"){
     val profile=m.studioData.optJSONObject("producer")
     if(profile!=null&&producer.trim()!=profile.optString("name"))m.api.call("/api/studio/profile","PUT",payload("name" to producer.trim(),"bio" to profile.optString("bio")))
     stage="2 / 3 · 음원 업로드 중…";m.api.uploadStudioAudio("/api/uploads/$id/audio",file.file)
     stage="앨범 커버 저장 중…";m.api.uploadWebp("/api/uploads/$id/cover",checkNotNull(image))
     stage="3 / 3 · 음악 제출 중…"
     if(m.api.call("/api/uploads/$id/complete","POST",payload("require_cover" to true)).optBoolean("show_upload_ad"))uploadAd=id
    }else if(status !in listOf("queued","processing","published","hidden")){
     error("스튜디오에서 곡 상태를 확인해 주세요.")
    }
   }else{
    stage="음원 정보 저장 중…";m.api.call("/api/studio/tracks/$trackId","PUT",body)
    if(cover)appearance.imageFile?.let{stage="커버사진 저장 중…";m.api.uploadListeningPhoto("/api/studio/tracks/$trackId/image",it)}
    if(!cover)image?.let{stage="앨범 커버 저장 중…";m.api.uploadWebp("/api/studio/tracks/$trackId/image",it)}
   }
   m.api.invalidateReads()
   if(account==m.user?.optString("id")){m.notice=if(trackId==null)"업로드 완료 · 음원 변환 후 공개됩니다." else "음원 정보를 저장했습니다.";m.refreshLibrary(true);discard();uploadAd?.let{SongAdBreaks.afterCoverUpload(it,{m.controller?.pause()},{})}}
  }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}
  finally{working=false;stage=""}
 }}
 val editable=!working&&draftId==null
 val lyricText=if(lyricsMode=="auto")autoSource else if(lyricsMode=="synced")lyrics else ""
 Column(Modifier.fillMaxSize().imePadding().testTag("studio-track-editor")){
  Row(Modifier.fillMaxWidth().padding(horizontal=8.dp),verticalAlignment=Alignment.CenterVertically){
   IconButton(onClick=::leave,enabled=!working){Icon(Icons.AutoMirrored.Outlined.ArrowBack,"스튜디오로 돌아가기")}
   Text(if(creating)"음원 업로드" else "음원 수정",fontSize=21.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
   if(creating){Text("* 필수 입력",color=Pink,fontSize=12.sp);IconButton(onClick={qa=true}){Icon(Icons.AutoMirrored.Outlined.HelpOutline,"업로드 Q&A")}}
  }
  Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp).testTag("studio-editor-scroll"),verticalArrangement=Arrangement.spacedBy(10.dp)){
   if(!cover){
    if(creating){
     Column(Modifier.bringIntoViewRequester(sectionKeys.getValue("audio"))){
      StudioRequired("원본 음원")
      OutlinedButton(onClick={audioPicker.launch(arrayOf("audio/*","application/octet-stream"))},enabled=editable,modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.AudioFile,null);Text(audio?.name?:"음원 선택",Modifier.padding(start=8.dp))}
      Text("WAV · FLAC · MP3 · 최대 80MB · 5초~20분",color=Muted,fontSize=12.sp)
     }
    }
    Column(Modifier.fillMaxWidth().bringIntoViewRequester(sectionKeys.getValue("cover"))){
     if(creating)StudioRequired("커버 이미지")
     val picture=image?:trackId?.takeIf{initial.optInt("has_cover")>0}?.let{Endpoint.url("/media/$it/cover?v=${initial.optString("cover_version")}")}
     picture?.let{StudioImage(it,m,Modifier.size(88.dp))}
     Row(verticalAlignment=Alignment.CenterVertically){
      OutlinedButton(onClick={imagePicker.launch(arrayOf("image/jpeg","image/png","image/webp"))},enabled=!working,modifier=Modifier.testTag("studio-cover-picker")){Icon(Icons.Outlined.AddPhotoAlternate,null);Text(if(picture==null)"커버 이미지 선택" else "커버 이미지 교체",Modifier.padding(start=8.dp))}
      if(image!=null&&editable)TextButton(onClick={image=null}){Text("선택 취소")}
     }
     if(creating)Text("JPG · PNG · WebP · 최대 5MB · 정사각형 권장",color=Muted,fontSize=12.sp)
    }
    if(creating)HorizontalDivider()
    StudioField("곡 제목",title,{title=it.take(120)},editable,"studio-title",Modifier.bringIntoViewRequester(sectionKeys.getValue("title")).focusRequester(focusKeys.getValue("title")),creating)
    if(draftId==null){
     Text("노래 구성",color=Muted,fontSize=13.sp)
     Chips(listOf("솔로","듀엣"),if(mode=="duet")"듀엣"else"솔로"){if(!working)mode=if(it=="듀엣")"duet"else"solo"}
    }
    if(creating)StudioField("작곡가 / 제작자 이름",producer,{producer=it.take(60)},editable,"studio-producer",Modifier.bringIntoViewRequester(sectionKeys.getValue("producer")).focusRequester(focusKeys.getValue("producer")),true)
    OutlinedButton(onClick={artistPicker=true},enabled=editable,modifier=Modifier.fillMaxWidth()){Text("AI 아티스트 · "+when(artistId){"none"->"선택 안 함 (내 활동명)";"new"->"새 아티스트";else->artists.find{it.optString("id")==artistId}?.optString("name")?:"내 활동명"})}
    if(artistId=="new")StudioField("새 아티스트 이름",newArtist,{newArtist=it.take(60)},editable,"studio-artist",Modifier.bringIntoViewRequester(sectionKeys.getValue("artist")).focusRequester(focusKeys.getValue("artist")),true)
    if(creating){
     HorizontalDivider()
     StudioUploadGenres(m,audio,availableOptions,uploadGenres,editable,Modifier.bringIntoViewRequester(sectionKeys.getValue("genres")),focusKeys.getValue("genres")){uploadGenres=ArrayList(it)}
    }else{
     StudioField("AI 제작 도구",tool,{tool=it.take(100)},editable)
     StudioChoiceField("장르",genres,Genres.map{it to it},3,1,editable){genres=it}
    }
    StudioChoiceField("기분 · 활동",moods,MoodTiles.map{it.id to it.name},4,0,editable){moods=it}
    OutlinedTextField(description,{description=it.take(4000)},label={Text("곡 소개")},minLines=3,enabled=editable,modifier=Modifier.fillMaxWidth().testTag("studio-description"))
    HorizontalDivider()
    Text("가사 등록",fontSize=18.sp,fontWeight=FontWeight.Bold)
    StudioUploadMenu("가사 등록 방식",studioLyricsModes,if(lyricsMode=="none")"later" else lyricsMode,editable){lyricsMode=it;lyricsChanged=true}
    if(lyricsMode in listOf("auto","synced")){
     if(lyricsMode=="auto")StudioUploadMenu("가사 언어",studioDefaultLanguages,lyricsLanguage,editable){lyricsLanguage=it;lyricsChanged=true}
     Column(Modifier.bringIntoViewRequester(sectionKeys.getValue("lyrics"))){
      Row(verticalAlignment=Alignment.CenterVertically){
       Box(Modifier.weight(1f)){StudioRequired(if(lyricsMode=="auto")"가사 입력" else "LRC 입력",creating)}
       TextButton(onClick={lyricPicker.launch(arrayOf("text/*","application/octet-stream"))},enabled=editable){Text(if(lyricsMode=="auto")"TXT 파일 불러오기" else "LRC 파일 불러오기")}
      }
      val lyricFile=if(lyricsMode=="auto")autoFilename else syncedFilename
      if(lyricFile.isNotEmpty())Text(lyricFile,color=Muted,fontSize=12.sp)
      OutlinedTextField(lyricText,{if(lyricsMode=="auto")autoSource=it.take(6000)else lyrics=it.take(12000);lyricsChanged=true},
       placeholder={Text(if(lyricsMode=="auto")"실제 부르는 가사를 한 줄씩 입력하세요.\n반복 가사도 노래 순서대로 모두 입력하세요." else "[00:12.500] 가사")},
       minLines=5,modifier=Modifier.fillMaxWidth().focusRequester(focusKeys.getValue("lyrics")).testTag("studio-lyrics"),enabled=editable)
     }
     Text(if(lyricsMode=="auto")"최대 6,000자 · 200줄 / [ ] 안의 구간 설명은 자동 제외됩니다.\n음원 변환 완료 후 가사 싱크가 자동 생성·적용됩니다.\n스튜디오에서 가사를 수정할 수 있습니다." else "LRC 또는 TXT · UTF-8 · 최대 64KB · 12,000자",color=Muted,fontSize=12.sp)
    }
    if(lyricsMode=="no_lyrics")Text("가사 변환 없이 등록됩니다.",color=Muted,fontSize=12.sp)
    if(lyricsMode in listOf("none","later"))Text("스튜디오에서 가사를 추가할 수 있습니다.",color=Muted,fontSize=12.sp)
    data.optJSONObject("alignment")?.let{studioLyricsStatus(JSONObject().put("alignment_state",it.optString("state")))?.let{label->Text(label,fontSize=12.sp,color=Aqua)}}
    if(trackId!=null)StudioBackingControls(m,trackId,data.optJSONObject("karaoke"),working)
   }else WorkAppearanceFields(appearance,Song(initial).workArtwork(),!working,noteLimit=1000)
   if(creating){
    HorizontalDivider()
    Column(Modifier.bringIntoViewRequester(sectionKeys.getValue("credit"))){
     StudioRequired("사용한 AI 도구 (복수 선택)")
     FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)){
      creditTools.forEach{choice->FilterChip(selected=choice in aiTools,onClick={noAI=false;aiTools=ArrayList(if(choice in aiTools)aiTools-choice else aiTools+choice)},label={Text(choice)},enabled=editable)}
      FilterChip(selected=otherTool,onClick={otherTool=!otherTool;if(otherTool)noAI=false},label={Text("기타")},enabled=editable)
      FilterChip(selected=noAI,onClick={noAI=!noAI;if(noAI){aiTools=arrayListOf();otherTool=false}},label={Text("AI 사용 안 함")},enabled=editable)
     }
     if(otherTool)StudioField("기타 AI 도구",tool,{tool=it.take(100)},editable,"studio-other-tool",Modifier.focusRequester(focusKeys.getValue("credit")),true)
    }
    Text("사람이 참여한 부분",color=Muted,fontSize=13.sp)
    FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)){
     studioParticipation.forEach{role->FilterChip(selected=role in participation,onClick={participation=ArrayList(if(role in participation)participation-role else participation+role)},label={Text(role)},enabled=editable)}
    }
    StudioUploadTags(m,title,lyricText,tags,editable){tags=it}
    HorizontalDivider()
    if(draftId==null)Column(Modifier.bringIntoViewRequester(sectionKeys.getValue("consent"))){
     StudioRequired("등록 동의")
     if(terms==null)TextButton(onClick={optionsAttempt++},enabled=!working){Text("이용허락 불러오기")}
     else{
      Text(terms.optString("notice"),color=Muted,fontSize=13.sp)
      StudioConsent(terms.optString("text"),uploadConsent,editable){uploadConsent=it}
     }
    }
   }
   if(working){LinearProgressIndicator(Modifier.fillMaxWidth());Text(stage,color=Aqua)}
   error?.let{Text(it,color=MaterialTheme.colorScheme.error,modifier=Modifier.testTag("studio-save-error"))}
   BrandButton(onClick=::save,enabled=!working&&!appearance.choosing&&(creating||cover||title.isNotBlank()&&tool.isNotBlank()),modifier=Modifier.fillMaxWidth().testTag("studio-save")){
    Text(if(working)"저장 중…" else if(draftId!=null)"업로드 다시 시도" else if(creating)"음원 등록" else "변경사항 저장")
   }
  }
 }
 if(qa)AlertDialog(onDismissRequest={qa=false},title={Text("업로드 Q&A")},text={Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)){
  Text("음원은 80MB 이하 WAV·FLAC·MP3, 커버는 5MB 이하 JPG·PNG·WebP를 선택해 주세요.")
  Text("장르는 검색·직접 입력·추천·자동 기입을 섞어서 최대 3개까지 등록할 수 있습니다.")
  Text("가사가 없는 노래는 가사 변환 없이 등록됩니다. ‘나중에 등록’을 선택하면 스튜디오에서 가사를 추가할 수 있습니다.")
  TextButton(onClick={m.api.appContext.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,Uri.parse(Endpoint.url("/terms#original-upload"))).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))}){Text("음원 이용허락 약관 보기")}
 }},confirmButton={TextButton(onClick={qa=false}){Text("닫기")}})
 if(confirmLeave)AlertDialog(onDismissRequest={confirmLeave=false},title={Text("스튜디오로 돌아갈까요?")},text={Text("저장하지 않은 변경사항은 사라져요.")},confirmButton={TextButton(onClick=::discard){Text("돌아가기")}},dismissButton={TextButton(onClick={confirmLeave=false}){Text("계속 수정")}})
 if(artistPicker)AppFormPage(onDismissRequest={artistPicker=false},title={Text("AI 아티스트")},text={Column(Modifier){
  (listOf("none" to "선택 안 함 (내 활동명)")+(if(trackId==null)listOf("new" to "새 아티스트 만들기")else emptyList())+artists.map{it.getString("id") to it.optString("name")}).forEach{(id,name)->TextButton(onClick={artistId=id;artistPicker=false}){Text(name)}}
 }},confirmButton={TextButton(onClick={artistPicker=false}){Text("닫기")}})
}

@Composable private fun StudioConsent(label:String,checked:Boolean,enabled:Boolean,onChange:(Boolean)->Unit){
 Row(Modifier.fillMaxWidth().testTag("studio-upload-consent").toggleable(value=checked,enabled=enabled,role=Role.Checkbox,onValueChange=onChange).padding(vertical=8.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
  Checkbox(checked,onCheckedChange=null,enabled=enabled)
  Text(label,fontSize=14.sp)
 }
}
@Composable private fun StudioRequired(label:String,required:Boolean=true){
 Row(verticalAlignment=Alignment.CenterVertically){Text(label);if(required)Text(" *",color=Pink)}
}

@Composable private fun StudioField(label:String,value:String,onChange:(String)->Unit,enabled:Boolean=true,tag:String="studio-field-$label",modifier:Modifier=Modifier,required:Boolean=false){
 OutlinedTextField(value,onChange,label={StudioRequired(label,required)},enabled=enabled,modifier=modifier.fillMaxWidth().testTag(tag),singleLine=true,shape=RoundedCornerShape(12.dp))
}

@Composable private fun StudioUploadMenu(title:String,choices:Map<String,String>,value:String,enabled:Boolean,change:(String)->Unit){
 var open by remember{mutableStateOf(false)}
 Column{
  Text(title,color=Muted,fontSize=12.sp)
  Box{
   OutlinedButton(onClick={open=true},enabled=enabled){Text(choices[value].orEmpty(),Modifier.weight(1f));Icon(Icons.Outlined.ArrowDropDown,null)}
   DropdownMenu(expanded=open,onDismissRequest={open=false}){
    choices.forEach{(key,label)->DropdownMenuItem(text={Text(label)},onClick={open=false;change(key)})}
   }
  }
 }
}

private fun uploadGenreKey(value:String)=Normalizer.normalize(value,Normalizer.Form.NFKC).lowercase().replace(Regex("[\\s\\p{Z}&-]+"),"")

@Composable private fun StudioUploadGenres(m:MusicModel,audio:StudioAudio?,options:JSONObject?,chosen:List<String>,enabled:Boolean,modifier:Modifier,focus:FocusRequester,change:(List<String>)->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 var status by remember{mutableStateOf("")}
 var analyzing by remember{mutableStateOf(false)}
 val activeFile by rememberUpdatedState(audio?.file)
 val selected by rememberUpdatedState(chosen)
 val canEdit by rememberUpdatedState(enabled)
 val scope=rememberCoroutineScope()
 val aliases=options?.optJSONObject("genre_aliases")
 fun optionsFor(genre:String)=listOf(genre)+aliases?.optJSONArray(genre).texts()
 fun canonical(value:String)=Genres.firstOrNull{genre->optionsFor(genre).any{uploadGenreKey(it)==uploadGenreKey(value)}}?:value.trim()
 fun add(value:String){
  val genre=canonical(value)
  status=when{
   genre.isBlank()||genre=="분석 대기"->"장르를 1~80자로 입력해 주세요."
   selected.any{uploadGenreKey(it)==uploadGenreKey(genre)}->"이미 추가한 장르입니다."
   selected.size>=3->"장르는 최대 3개까지 등록할 수 있습니다."
   else->{change(selected+genre);query="";""}
  }
 }
 Column(modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(5.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Box(Modifier.weight(1f)){StudioRequired("등록 장르")}
   FilledTonalButton(enabled=enabled&&!analyzing,onClick={
    val file=audio
    if(file==null)status="음원을 먼저 선택해 주세요."
    else if(selected.size>=3)status="장르를 삭제하면 분석 결과를 추가할 수 있습니다."
    else {
     analyzing=true;status="음원에서 장르를 분석하고 있습니다…"
     scope.launch{
      try{
       val result=m.api.uploadStudioAudio("/api/studio/upload-genre-analysis?ext="+file.extension,file.file,"POST").optJSONArray("genres").texts()
       if(activeFile==file.file&&canEdit){
        val combined=(selected+result.filter{it in Genres}).distinctBy(::uploadGenreKey).take(3)
        change(combined);status=if(combined.size==selected.size)"추가할 장르가 없습니다." else "분석한 장르를 추가했습니다."
       }else status="음원이 바뀌었습니다. 자동 장르 기입을 다시 눌러 주세요."
      }catch(e:Exception){if(e is CancellationException)throw e;status=e.message.orEmpty()}finally{analyzing=false}
     }
    }
   }){Icon(Icons.Outlined.AutoAwesome,null,Modifier.size(16.dp));Text("자동 장르 기입",Modifier.padding(start=5.dp))}
  }
  if(chosen.isEmpty())Text("장르를 추가해 주세요.",color=Muted,fontSize=13.sp)
  FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp)){
   chosen.forEachIndexed{index,genre->AssistChip(onClick={change(chosen.filterIndexed{i,_->i!=index})},label={Text("$genre ×",color=Aqua)},enabled=enabled)}
  }
  Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)){
   OutlinedTextField(query,{query=it.take(80);status=""},placeholder={Text("장르 검색 또는 직접 입력")},leadingIcon={Icon(Icons.Outlined.Search,null)},singleLine=true,
    keyboardOptions=KeyboardOptions(imeAction=ImeAction.Done),keyboardActions=KeyboardActions(onDone={add(query)}),
    modifier=Modifier.weight(1f).focusRequester(focus),enabled=enabled)
   TextButton(onClick={add(query)},enabled=enabled){Text("추가")}
  }
  val key=uploadGenreKey(query)
  if(key.isNotEmpty())FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp)){
   Genres.filter{genre->genre !in chosen&&optionsFor(genre).any{uploadGenreKey(it).contains(key)}}.forEach{genre->AssistChip(onClick={add(genre)},label={Text(genre)},enabled=enabled)}
  }
  Text("추천 장르",color=Muted,fontSize=12.sp)
  FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp)){
   (options?.optJSONArray("recommended_genres").texts().ifEmpty{Genres.take(12)}).forEach{genre->
    FilterChip(selected=genre in chosen,onClick={add(genre)},enabled=enabled,label={Text((if(genre in chosen)"✓ " else "+ ")+genre)})
   }
  }
  if(status.isNotEmpty())Text(status,color=Muted,fontSize=12.sp)
 }
}

@Composable private fun StudioUploadTags(m:MusicModel,title:String,lyrics:String,value:String,enabled:Boolean,change:(String)->Unit){
 var suggestions by remember{mutableStateOf(emptyList<String>())}
 var error by remember{mutableStateOf("")}
 var refresh by remember{mutableIntStateOf(0)}
 val contents=stripStudioAnnotations(lyrics).trim()
 LaunchedEffect(title,contents,refresh,m.user?.optString("id")){
  suggestions=emptyList();error=""
  if(title.isNotBlank()||contents.isNotBlank()){
   delay(1200)
   try{suggestions=m.api.call("/api/studio/tag-suggestions","POST",payload("title" to title.trim(),"lyrics" to contents)).optJSONArray("tags").texts()}
   catch(e:Exception){if(e is CancellationException)throw e;error="추천을 불러오지 못했습니다."}
  }
 }
 StudioField("태그 (쉼표로 구분)",value,{change(it.take(300))},enabled)
 val selected=value.split(',').map{it.trim()}.filter{it.isNotEmpty()}
 FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp)){
  selected.forEach{tag->AssistChip(onClick={change(selected.filterNot{it==tag}.joinToString(", "))},label={Text("$tag ×")},enabled=enabled)}
 }
 TextButton(onClick={refresh++},enabled=enabled&&(title.isNotBlank()||contents.isNotBlank())){Text("추천 새로 받기")}
 FlowRow(horizontalArrangement=Arrangement.spacedBy(5.dp)){
  suggestions.filterNot{tag->selected.any{it.equals(tag,true)}}.forEach{tag->AssistChip(onClick={
   val next=(selected+tag).joinToString(", ");if(next.length<=300)change(next)else error="태그는 300자까지 입력할 수 있습니다."
  },label={Text("+ $tag")},enabled=enabled)}
 }
 if(error.isNotEmpty())Text(error,color=Muted,fontSize=12.sp)
}

@Composable private fun StudioArtistEditor(m:MusicModel,a:JSONObject,close:()->Unit){
 var name by remember{mutableStateOf(a.optString("name"))};var bio by remember{mutableStateOf(a.optString("bio"))};var genre by remember{mutableStateOf(a.optString("genre","K-POP"))}
 var picture by remember{mutableStateOf<Uri?>(null)};var busy by remember{mutableStateOf(false)};var error by remember{mutableStateOf<String?>(null)}
 val account=m.user?.optString("id");val scope=rememberCoroutineScope()
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){picture=it}
 AppPage(title="아티스트 수정",onDismissRequest={if(!busy)close()},containerColor=Ink){Column(Modifier.imePadding().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
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
  AppFormPage(onDismissRequest={open=false},title={Text("$label · 최대 ${max}개")},text={Column(Modifier){
   (options+selected.filter{id->options.none{it.first==id}}.map{it to it}).forEach{(id,name)->Row(verticalAlignment=Alignment.CenterVertically){
    val checked=id in chosen
    Checkbox(checked,{chosen=if(it)chosen+id else chosen-id},enabled=checked||chosen.size<max);Text(name,fontSize=14.sp)
   }}
  }},confirmButton={TextButton(enabled=chosen.size>=min,onClick={onChange(chosen.joinToString(", "));open=false}){Text("적용")}},dismissButton={TextButton(onClick={open=false}){Text("취소")}})
 }
}
