@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class,androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package kr.co.aifect.app

import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import coil.compose.AsyncImage
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

internal val dubbingGenres=listOf("SF","이세계물","판타지","사극","로맨스","액션","코미디","첩보","공포","스릴러","미스터리","일상","감동")
internal fun defaultDubbingOptions()=payload("genres" to JSONArray(listOf("일상")),"roleCount" to 2,"minutes" to 1.0,"mood" to "랜덤","ending" to "랜덤","idea" to "")
internal fun manualDubbingScript(title:String,text:String,options:JSONObject):JSONObject{
 val count=options.getInt("roleCount");val roles=(0 until count).map{payload("id" to "role_${it+1}","name" to "배역 ${it+1}","gender" to "unspecified","personality" to "")}
 val lines=text.lines().filter{it.isNotBlank()}.mapIndexed{i,raw->
  val match=Regex("^\\s*([A-Fa-f])\\s*[:：]\\s*(.+)$").matchEntire(raw)
  require(match!=null){"${i+1}번째 줄을 A: 대사 형식으로 적어주세요."}
  val role=match.groupValues[1].uppercase()[0]-'A';require(role<count){"${match.groupValues[1]} 배역이 참여 인원보다 많아요."}
  val words=match.groupValues[2].trim();require(words.length<=700){"대사는 700자 이내로 적어주세요."}
  payload("id" to requestIdentity(),"order" to i+1,"sceneId" to "scene_1","roleId" to roles[role].getString("id"),"text" to words,"emotion" to "자연스럽게","direction" to "","durationSeconds" to (words.length/5.0+1).coerceIn(1.0,40.0),"gapSeconds" to 1.0)
 }
 require(lines.size in count..120){"각 배역의 대사를 적어주세요. 최대 120줄이에요."}
 require(roles.all{r->lines.any{it.getString("roleId")==r.getString("id")}}){"모든 배역에 대사가 필요해요."}
 return payload("version" to 1,"title" to title.trim(),"genres" to options.getJSONArray("genres"),"roles" to JSONArray(roles),"scenes" to JSONArray(listOf(payload("id" to "scene_1","title" to "첫 장면","description" to ""))),"lines" to JSONArray(lines),"soundCues" to JSONArray())
}

@Composable internal fun NativeDubbingScreen(api:NativeApi,route:String,navigate:(String)->Unit,close:()->Unit){
 var account by remember{mutableStateOf<String?>(null)};var error by remember{mutableStateOf<String?>(null)}
 // The project detail is slow on the server; ask for it together with the account check instead of after it.
 val early=rememberCoroutineScope();val projectId=route.substringAfter('/',"").takeIf{route.startsWith("dubbing/")&&route!="dubbing/new"}
 val prefetched=remember(projectId){projectId?.let{pid->early.async{runCatching{api.call("/api/dubbing/projects/$pid",fresh=true).getJSONObject("project")}.getOrNull()}}}
 LaunchedEffect(Unit){try{account=api.call("/api/me",fresh=true).optJSONObject("user")?.optString("id").orEmpty();if(account.isNullOrBlank())error="로그인한 뒤 다시 열어주세요."}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 if(account.isNullOrBlank()){NativeAudioHeader("더빙",close);Text(error?:"계정 확인 중…",Modifier.padding(20.dp));return}
 key(account,route){when{
  route=="dubbing/new"->NativeDubbingCreate(api,account!!,null,{navigate("dubbing/$it")},{navigate("dubbing")})
  route.startsWith("dubbing/")->NativeDubbingProject(api,account!!,route.substringAfter('/'),navigate,{navigate("dubbing")},prefetched)
  else->NativeDubbingLibrary(api,route.contains("mine"),navigate,close)
 }}
}

@Composable private fun NativeDubbingLibrary(api:NativeApi,mine:Boolean,navigate:(String)->Unit,close:()->Unit){
 var choosing by remember{mutableStateOf("")}
 val tabs=listOf("open" to "참여 가능한 극본","complete" to "완성된 더빙","popular" to "인기","latest" to "최신","mine" to "내 더빙")
 var tab by rememberSaveable{mutableStateOf(if(mine)"mine" else "open")};var genre by rememberSaveable{mutableStateOf("")};var projects by remember{mutableStateOf<List<JSONObject>>(emptyList())};var next by remember{mutableStateOf<Int?>(null)};var error by remember{mutableStateOf<String?>(null)};var busy by remember{mutableStateOf(false)};val scope=rememberCoroutineScope()
 suspend fun fetch(offset:Int){busy=true;error=null;try{val result=api.call("/api/dubbing/projects?tab=$tab&genre=${URLEncoder.encode(genre,"UTF-8")}&offset=$offset",fresh=true);projects=if(offset==0)result.optJSONArray("projects").objects()else (projects+result.optJSONArray("projects").objects()).distinctBy{it.getString("id")};next=if(result.isNull("nextOffset"))null else result.optInt("nextOffset")}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}
 LaunchedEffect(tab,genre){projects=emptyList();next=null;fetch(0)}
 Column(Modifier.fillMaxSize().testTag("native-dubbing-library")){
  NativeAudioHeader("더빙 스튜디오",close){IconButton({navigate("dubbing/new")}){Icon(Icons.Outlined.Add,"새 대본 만들기")}}
  Row(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=12.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
   SelectionField("작품 목록",tabs.first{it.first==tab}.second,"dubbing-library-tab",Modifier.weight(1f)){choosing="tab"}
   SelectionField("장르",genre.ifBlank{"전체 장르"},"dubbing-library-genre",Modifier.weight(1f)){choosing="genre"}
  }
  LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   if(busy)item{LinearProgressIndicator(Modifier.fillMaxWidth())}
   if(error!=null)item{Text(error.orEmpty(),color=Pink);TextButton({scope.launch{fetch(if(projects.isEmpty())0 else next?:0)}}){Text("다시 불러오기")}}
   if(!busy&&error==null&&projects.isEmpty())item{Text("아직 이 목록에 공개된 작품이 없어요.",color=Muted)}
   items(projects,key={it.getString("id")}){p->Surface(onClick={navigate("dubbing/${p.getString("id")}")},color=Panel,shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Stroke)){
    Row(Modifier.padding(12.dp),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalAlignment=Alignment.CenterVertically){
     DubbingCover(p,Modifier.size(60.dp))
     Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)){
      Text(p.optString("title"),fontSize=15.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
      Text(p.optString("ownerName"),fontSize=12.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
      Text(if(p.optString("state")=="complete")"완성된 더빙" else "${p.optInt("participants")}/${p.optInt("roleCount")}명 참여",fontSize=11.sp,color=SoftText)
     }
     Icon(Icons.Outlined.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
    }
   }}
   if(next!=null)item{OutlinedButton({scope.launch{fetch(next!!)}},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("더 보기")}}
  }
 }
 if(choosing.isNotBlank())SelectionSheet(if(choosing=="tab")"작품 목록" else "장르",if(choosing=="tab")tabs else listOf("" to "전체 장르")+dubbingGenres.map{it to it},listOf(if(choosing=="tab")tab else genre),"dubbing-library-choice",{choosing=""}){if(choosing=="tab")tab=it else genre=it}
}

@Composable private fun NativeDubbingCreate(api:NativeApi,account:String,existing:JSONObject?,saved:(String)->Unit,back:()->Unit){
 val context=LocalContext.current;val scope=rememberCoroutineScope();val preferences=remember{context.getSharedPreferences("native_dubbing",0)}
 val draftKey="script:$account:${existing?.optString("id")?:"new"}"
 val cached=remember{runCatching{JSONObject(preferences.getString(draftKey,"{}")!!)}.getOrDefault(JSONObject())}
 var options by remember{mutableStateOf(existing?.getJSONObject("options")?:cached.optJSONObject("options")?:defaultDubbingOptions())}
 var script by remember{mutableStateOf(existing?.getJSONObject("script")?:cached.optJSONObject("script"))}
 var generationId by remember{mutableStateOf(cached.optString("generationId"))};var projectId by remember{mutableStateOf(cached.optString("projectId").ifBlank{requestIdentity()})}
 var generation by remember{mutableStateOf(cached.optJSONObject("generation")?:if(generationId.isNotBlank()&&script==null)payload("id" to generationId,"state" to "running")else JSONObject())};var config by remember{mutableStateOf(JSONObject())};var busy by remember{mutableStateOf(false)};var error by remember{mutableStateOf<String?>(null)}
 var choosing by remember{mutableStateOf("")}
 var manual by remember{mutableStateOf(false)};var title by remember{mutableStateOf(cached.optString("manualTitle"))};var text by remember{mutableStateOf(cached.optString("manualText"))}
 var dirty by remember{mutableStateOf(false)};var confirmLeave by remember{mutableStateOf(false)}
 fun persist(){dirty=true}
 fun saveDraft(){preferences.edit().putString(draftKey,payload("options" to options,"script" to script,"projectId" to projectId,"generationId" to generationId,"generation" to generation,"manualTitle" to title,"manualText" to text).toString()).apply();dirty=false}
 fun leave(){if(dirty||busy)confirmLeave=true else back()}
 fun setOption(name:String,value:Any){options=JSONObject(options.toString()).put(name,value);persist()}
 fun acceptGeneration(result:JSONObject){generation=result;if(!result.isNull("id"))generationId=result.getString("id");result.optJSONObject("script")?.let{script=it;options=result.getJSONObject("options")};persist()}
 suspend fun generate(){
  generationId=requestIdentity();generation=payload("id" to generationId,"state" to "running","message" to "이야기를 구성하고 있어요. 결과를 확인할 때까지 새 요청을 보내지 않아요.");persist()
  try{acceptGeneration(api.call("/api/dubbing/generations","POST",payload("requestId" to generationId,"options" to options)))}catch(e:ApiException){
   // These responses reject the request before generation. Unknown outcomes retain the ID for read-only recovery.
   if(e.status in listOf(400,401,403,404,429)){generation=payload("state" to "failed");generationId="";persist()};throw e
  }
 }
 fun task(block:suspend ()->Unit){if(busy)return;busy=true;error=null;scope.launch{try{block()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}}
 LaunchedEffect(Unit){try{config=api.call("/api/dubbing/config",fresh=true)}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 LaunchedEffect(generation.optString("id"),generation.optString("state")){if(generation.optString("state")=="running")while(isActive){delay(5000);try{val result=api.call("/api/dubbing/generations/${generation.getString("id")}",fresh=true);acceptGeneration(result);if(result.optString("state")!="running")break}catch(e:Exception){if(e is CancellationException)throw e;error=e.message;break}}}
 BackHandler{leave()}
 if(confirmLeave)DubbingLeaveDialog(busy=false,onContinue={confirmLeave=false},onSave={saveDraft();confirmLeave=false;back()},onDiscard={preferences.edit().remove(draftKey).apply();confirmLeave=false;back()})
 Column(Modifier.fillMaxSize().testTag("native-dubbing-create")){
  NativeAudioHeader(if(script==null)"더빙 만들기" else "대본 편집",::leave)
  LazyColumn(Modifier.weight(1f).testTag("native-dubbing-form"),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
   if(script==null){
    item{SelectionField("장르 · 최대 2개",options.getJSONArray("genres").let{a->(0 until a.length()).joinToString(" · "){a.getString(it)}},"dubbing-choice-genres",Modifier.fillMaxWidth()){choosing="genres"}}
    item{Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
     SelectionField("참여 인원","${options.optInt("roleCount")}명","dubbing-choice-roleCount",Modifier.weight(1f)){choosing="roleCount"}
     SelectionField("대본 길이",timeLabel((options.optDouble("minutes")*60000).toLong()),"dubbing-choice-minutes",Modifier.weight(1f)){choosing="minutes"}
    }}
    item{Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
     SelectionField("분위기",options.optString("mood"),"dubbing-choice-mood",Modifier.weight(1f)){choosing="mood"}
     SelectionField("결말",options.optString("ending"),"dubbing-choice-ending",Modifier.weight(1f)){choosing="ending"}
    }}
    item{Text("이야기의 세부사항",fontWeight=FontWeight.Bold);Text("‘랜덤’ 또는 ‘무작위’라고 적으면 AI가 이야기를 만들어요.",fontSize=12.sp,color=Muted);OutlinedTextField(options.optString("idea"),{if(it.length<=1500)setOption("idea",it)},modifier=Modifier.fillMaxWidth(),minLines=3,shape=RoundedCornerShape(12.dp),placeholder={Text("예: 막차에서 만난 두 사람의 비밀")});TextButton({setOption("idea","(랜덤)")}){Text("이야기 랜덤 생성")}}
    item{val q=config.optJSONObject("quota")?:JSONObject();Text("일반 하루 1회 · 프리미엄 하루 3회 무료",fontSize=13.sp,color=SoftText);Text("오늘 남은 작성 ${q.optInt("remaining")}회 · 한국 시간 자정 초기화",fontSize=12.sp,color=Muted);Text("생성 예상 30초~2분 · 요청이 많으면 더 걸릴 수 있어요.",fontSize=12.sp,color=Muted)}
    item{Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
     error?.let{Text(it,color=Pink,fontSize=13.sp)}
     if(generation.optString("message").isNotBlank())Text(generation.optString("message"),color=SoftText,fontSize=13.sp)
     BrandButton({task{generate()}},enabled=!busy&&generation.optString("state")!="running"&&config.optBoolean("aiAvailable"),modifier=Modifier.fillMaxWidth()){Text("AI 대본 작성하기")};OutlinedButton({manual=!manual},enabled=!busy,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke)){Text("직접 대사 쓰기",fontSize=14.sp,color=SoftText)};TextButton({task{acceptGeneration(api.call("/api/dubbing/generations/"+generationId.ifBlank{"latest"},fresh=true));if(generation.isNull("id"))error="이전 생성 요청이 없어요."}}){Text("이전 AI 생성 결과 확인")}}}
    if(manual)item{OutlinedTextField(title,{title=it.take(100);persist()},label={Text("작품 제목")},modifier=Modifier.fillMaxWidth());OutlinedTextField(text,{text=it;persist()},label={Text("A: 대사\nB: 대사\nA: 대사")},minLines=8,modifier=Modifier.fillMaxWidth().testTag("dubbing-manual-lines"));BrandButton({try{require(title.isNotBlank()){ "작품 제목을 적어주세요." };script=manualDubbingScript(title,text,options);generationId="";persist()}catch(e:Exception){error=e.message}},enabled=title.isNotBlank()&&text.isNotBlank()){Text("대본으로 정리하기")}}
   }else{
    item{DubbingScriptEditor(script!!){script=it;persist()}}
    item{Text("비공개 저장 · 골드 차감 없음",color=Muted,fontSize=12.sp);BrandButton({task{val body=payload("id" to projectId,"options" to options,"script" to script);if(generationId.isNotBlank())body.put("generationId",generationId);if(existing!=null)body.put("revision",existing.getInt("revision"));val result=api.call("/api/dubbing/projects"+(existing?.let{"/${it.getString("id")}"}?:""),if(existing==null)"POST" else "PUT",body);preferences.edit().remove(draftKey).apply();saved(result.getJSONObject("project").getString("id"))}},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("대본 저장")}}
   }
   if(busy)item{LinearProgressIndicator(Modifier.fillMaxWidth())}
   if(script!=null&&generation.optString("message").isNotBlank())item{Text(generation.optString("message"),color=SoftText)}
   if(script!=null&&error!=null)item{Text(error.orEmpty(),color=Pink)}
  }
 }
 if(choosing.isNotBlank()){
  val selected=when(choosing){"genres"->options.getJSONArray("genres").let{a->(0 until a.length()).map{a.getString(it)}};"roleCount"->listOf(options.optInt("roleCount").toString());"minutes"->listOf(options.optDouble("minutes").toString());else->listOf(options.optString(choosing))}
  val choices=when(choosing){"genres"->dubbingGenres.map{it to it};"roleCount"->(1..6).map{it.toString() to "${it}명"};"minutes"->(1..10).map{(it*.5).toString() to timeLabel(it*30000L)};"mood"->listOf("유쾌하게","설레게","진지하게","긴장감 있게","슬프게","랜덤").map{it to it};else->listOf("해피엔딩","새드엔딩","반전","열린 결말","랜덤").map{it to it}}
  SelectionSheet(when(choosing){"genres"->"장르 선택 · 최대 2개";"roleCount"->"참여 인원";"minutes"->"대본 길이";"mood"->"분위기";else->"결말"},choices,selected,"dubbing-option",{choosing=""},multiple=choosing=="genres"){value->
   when(choosing){"genres"->setOption("genres",JSONArray(if(value in selected&&selected.size>1)selected-value else if(value !in selected&&selected.size<2)selected+value else selected));"roleCount"->setOption(choosing,value.toInt());"minutes"->setOption(choosing,value.toDouble());else->setOption(choosing,value)}
  }
 }
}

@Composable private fun DubbingScriptEditor(script:JSONObject,changed:(JSONObject)->Unit){
 fun edit(change:(JSONObject)->Unit){val copy=JSONObject(script.toString());change(copy);changed(copy)}
 var advanced by remember{mutableStateOf(false)}
 Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
  OutlinedTextField(script.optString("title"),{v->edit{it.put("title",v.take(100))}},label={Text("작품 제목")},modifier=Modifier.fillMaxWidth())
  Text("등장인물",fontWeight=FontWeight.Bold)
  script.optJSONArray("roles").objects().forEachIndexed{i,r->
   OutlinedTextField(r.optString("name"),{v->edit{it.getJSONArray("roles").getJSONObject(i).put("name",v.take(40))}},label={Text("${('A'.code+i).toChar()} · 배역 이름")},modifier=Modifier.fillMaxWidth())
   FlowRow{listOf("male" to "남","female" to "여","unspecified" to "미정").forEach{(id,label)->FilterChip(r.optString("gender","unspecified")==id,{edit{it.getJSONArray("roles").getJSONObject(i).put("gender",id)}},label={Text(label)})}}
   OutlinedTextField(r.optString("personality"),{v->edit{it.getJSONArray("roles").getJSONObject(i).put("personality",v.take(240))}},label={Text("캐릭터 소개")},modifier=Modifier.fillMaxWidth())
  }
  Row(verticalAlignment=Alignment.CenterVertically){Text("연기 지시·시간 조절",Modifier.weight(1f));Switch(advanced,{advanced=it})}
  script.optJSONArray("scenes").objects().forEachIndexed{si,scene->
   OutlinedTextField(scene.optString("title"),{v->edit{it.getJSONArray("scenes").getJSONObject(si).put("title",v.take(80))}},label={Text("장면 ${si+1}")},modifier=Modifier.fillMaxWidth())
   OutlinedTextField(scene.optString("description"),{v->edit{it.getJSONArray("scenes").getJSONObject(si).put("description",v.take(500))}},label={Text("장면 설명")},modifier=Modifier.fillMaxWidth())
   script.optJSONArray("lines").objects().forEachIndexed{li,l->if(l.getString("sceneId")==scene.getString("id")){
    val role=script.optJSONArray("roles").objects().find{it.getString("id")==l.getString("roleId")}
    OutlinedTextField(l.optString("text"),{v->edit{it.getJSONArray("lines").getJSONObject(li).put("text",v.take(700))}},label={Text("${li+1} · ${role?.optString("name")}")},modifier=Modifier.fillMaxWidth(),minLines=2)
    if(advanced){
     FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)){script.optJSONArray("roles").objects().forEach{role->FilterChip(l.getString("roleId")==role.getString("id"),{edit{it.getJSONArray("lines").getJSONObject(li).put("roleId",role.getString("id"))}},label={Text(role.getString("name"))})}}
     OutlinedTextField(l.optString("emotion"),{v->edit{it.getJSONArray("lines").getJSONObject(li).put("emotion",v.take(80))}},label={Text("감정")},modifier=Modifier.fillMaxWidth())
     OutlinedTextField(l.optString("direction"),{v->edit{it.getJSONArray("lines").getJSONObject(li).put("direction",v.take(240))}},label={Text("연기 지시")},modifier=Modifier.fillMaxWidth())
     Text("대사 ${"%.1f".format(l.optDouble("durationSeconds"))}초");Slider(l.optDouble("durationSeconds",5.0).toFloat(),{v->edit{it.getJSONArray("lines").getJSONObject(li).put("durationSeconds",(v*10).toInt()/10.0)}},valueRange=1f..40f)
     Text("대사 뒤 여유 ${"%.1f".format(l.optDouble("gapSeconds"))}초");Slider(l.optDouble("gapSeconds",1.0).toFloat(),{v->edit{it.getJSONArray("lines").getJSONObject(li).put("gapSeconds",(v*10).toInt()/10.0)}},valueRange=.3f..8f)
     Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
      TextButton({edit{s->val lines=s.getJSONArray("lines").objects().toMutableList();val next=JSONObject(l.toString()).put("id",requestIdentity()).put("text","");lines.add(li+1,next);lines.forEachIndexed{i,line->line.put("order",i+1)};s.put("lines",JSONArray(lines))}},enabled=script.getJSONArray("lines").length()<120){Text("아래 대사 추가")}
      TextButton({edit{s->val lines=s.getJSONArray("lines").objects().filter{it.getString("id")!=l.getString("id")};lines.forEachIndexed{i,line->line.put("order",i+1)};s.put("lines",JSONArray(lines));s.put("soundCues",JSONArray(s.optJSONArray("soundCues").objects().filter{it.optString("lineId")!=l.getString("id")&&it.optString("endLineId")!=l.getString("id")}))}},enabled=script.getJSONArray("lines").objects().count{it.getString("roleId")==l.getString("roleId")}>1&&script.getJSONArray("lines").objects().count{it.getString("sceneId")==l.getString("sceneId")}>1){Text("대사 삭제",color=Pink)}
     }
    }
   }}
  }
  OutlinedButton({edit{s->val sceneId=requestIdentity();s.getJSONArray("scenes").put(payload("id" to sceneId,"title" to "새 장면","description" to ""));s.getJSONArray("lines").put(payload("id" to requestIdentity(),"order" to s.getJSONArray("lines").length()+1,"sceneId" to sceneId,"roleId" to s.getJSONArray("roles").getJSONObject(0).getString("id"),"text" to "","emotion" to "자연스럽게","direction" to "","durationSeconds" to 5,"gapSeconds" to 1))}},enabled=script.getJSONArray("scenes").length()<12&&script.getJSONArray("lines").length()<120){Text("장면 추가")}
  if(script.optJSONArray("soundCues").objects().isNotEmpty()){Text("음향 연출",fontWeight=FontWeight.Bold);script.optJSONArray("soundCues").objects().forEach{c->Text("${c.optString("label",c.optString("kind"))} · ${c.optString("prompt")}",fontSize=12.sp,color=Muted)}}
 }
}

@Composable private fun NativeDubbingProject(api:NativeApi,account:String,id:String,navigate:(String)->Unit,back:()->Unit,prefetched:Deferred<JSONObject?>?=null){
 var project by remember{mutableStateOf<JSONObject?>(null)};var error by remember{mutableStateOf<String?>(null)};var busy by remember{mutableStateOf(false)};var editing by remember{mutableStateOf(false)};var recording by rememberSaveable{mutableStateOf(false)};var confirm by remember{mutableStateOf("")};val scope=rememberCoroutineScope();val context=LocalContext.current
 val audio=remember{NativeDubbingAudio(context,api)};DisposableEffect(Unit){onDispose{audio.close()}}
 val lifecycleOwner=LocalLifecycleOwner.current
 DisposableEffect(lifecycleOwner){val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_STOP)audio.stop()};lifecycleOwner.lifecycle.addObserver(observer);onDispose{lifecycleOwner.lifecycle.removeObserver(observer)}}
 var soundRequest by rememberSaveable{mutableStateOf(requestIdentity())};var performanceRequest by rememberSaveable{mutableStateOf(requestIdentity())}
 suspend fun reload(){project=api.call("/api/dubbing/projects/$id",fresh=true).getJSONObject("project")}
 fun task(block:suspend ()->Unit){if(busy)return;busy=true;error=null;scope.launch{try{block()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}}
 LaunchedEffect(id){try{val early=prefetched?.await();if(early!=null&&early.optString("id")==id)project=early else reload()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 val sound=project?.optJSONObject("sound")?:JSONObject();val currentRole=project?.optJSONArray("roles").objects().find{it.optBoolean("mine")}
 LaunchedEffect(sound.optString("state"),recording){if(!recording&&sound.optString("state") in listOf("queued","planning","generating","mixing")){while(isActive){delay(5000);try{reload()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message;break}}}}
 if(editing&&project!=null){NativeDubbingCreate(api,account,project,{editing=false;task{reload()}},{editing=false});return}
 if(recording&&project!=null&&currentRole!=null){NativeDubbingRecorder(api,account,project!!,currentRole,{recording=false;task{reload()}});return}
 var scriptOpen by rememberSaveable{mutableStateOf(false)};var versionsOpen by rememberSaveable{mutableStateOf(false)};var menu by remember{mutableStateOf(false)}
 val previewing by audio.previewing.collectAsState();var previewAt by remember{mutableLongStateOf(0L)}
 LaunchedEffect(previewing){while(previewing){previewAt=audio.previewPositionMs();delay(200)}}
 // Fetch the ready background while the singer reads the page, so the recorder opens without a download.
 LaunchedEffect(sound.optString("id"),sound.optString("state")){
  val soundId=sound.optString("id");if(sound.optString("state")=="ready"&&soundId.isNotBlank())withContext(Dispatchers.IO){runCatching{dubbingBackgroundFile(context,api,"/api/dubbing/projects/$id/background",soundId)}}
 }
 Column(Modifier.fillMaxSize().testTag("native-dubbing-project")){
  NativeAudioHeader("더빙 스튜디오",back){
   Box{
    IconButton({menu=true}){Icon(Icons.Outlined.MoreHoriz,"더빙 메뉴")}
    DropdownMenu(menu,{menu=false},containerColor=Panel){
     DropdownMenuItem(text={Text("새로고침")},onClick={menu=false;task{reload()}})
     project?.takeIf{it.optBoolean("isOwner")}?.let{p->
      if(p.optBoolean("canEdit"))DropdownMenuItem(text={Text("대본 수정")},onClick={menu=false;editing=true})
      DropdownMenuItem(text={Text(if(p.optString("visibility")=="private")"배역 모집 시작" else "모집 중지")},onClick={menu=false;confirm=if(p.optString("visibility")=="private")"publish" else "unpublish"})
      DropdownMenuItem(text={Text("작품 삭제",color=Pink)},onClick={menu=false;confirm="delete"})
     }
    }
   }
  }
  LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(16.dp,4.dp,16.dp,28.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   if(error!=null)item{Text(error.orEmpty(),color=Pink)}
   if(busy||project==null&&error==null)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink,trackColor=Stroke)}
   project?.let{p->
    val script=p.getJSONObject("script");val roles=p.getJSONArray("roles").objects();val lines=script.optJSONArray("lines").objects().sortedBy{it.optInt("order")}
    // The singer's own role comes first, as in the approved design; script colours keep the original order.
    val roleCards=roles.sortedByDescending{it.optBoolean("mine")}
    item{DubbingSectionTitle("작품 정보")}
    item{
     DubbingInfoCard(p,sound,previewing,previewAt,{if(previewing)audio.stop()else audio.listen(sound.optString("audioUrl","/api/dubbing/projects/$id/background"))}){
      if(p.optBoolean("isOwner")&&sound.optString("state")=="not_started")Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
       OutlinedButton({confirm="basic"},enabled=!busy,modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke)){Text("기본 배경",fontSize=12.sp,color=SoftText)}
       BrandButton({confirm="sound"},enabled=!busy&&sound.optBoolean("aiAvailable"),modifier=Modifier.weight(1f),contentPadding=PaddingValues(horizontal=8.dp)){Text("효과음 · ${sound.optInt("chargeGold",sound.optInt("priceGold",50))} G",fontSize=12.sp)}
      }
      if(sound.optInt("refundedGold")>0)Text("${sound.optInt("refundedGold")} G 환급",fontSize=12.sp,color=Muted)
     }
    }
    if(p.optBoolean("isOwner")&&p.optString("visibility")=="private")item{BrandButton({confirm="publish"},enabled=!busy,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text("배역 모집 시작",fontSize=14.sp)}}
    item{DubbingSectionTitle("배역 선택","${roles.count{it.optBoolean("claimed")}} / ${roles.size}명 참여")}
    items(roleCards,key={it.getString("id")}){r->
     var more by remember{mutableStateOf(false)}
     val mine=r.optBoolean("mine")
     val cancel=mine&&p.optJSONObject("recording")?.optJSONArray("roles").objects().none{it.getString("roleId")==r.getString("id")}
     val fresh=p.optString("visibility")=="public"&&p.optString("rootId")==id&&sound.optString("state")=="ready"
     Surface(color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(if(mine)1.5.dp else 1.dp,if(mine)Violet else Stroke),modifier=Modifier.fillMaxWidth().testTag("dubbing-role-${r.getString("id")}")){
      Column(Modifier.padding(horizontal=14.dp,vertical=12.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
       Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        DefaultProfileArtwork(r.optString("name"),Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)))
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)){
         Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
          Text(r.optString("name"),fontSize=17.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
          if(mine)DubbingChip("내 배역",Violet)
          else if(r.optBoolean("claimed"))Text(r.optString("participant").takeIf{it!="null"&&it.isNotBlank()}?:"참여 중",fontSize=11.sp,color=Muted,maxLines=1)
          else Text("참여 가능",fontSize=11.sp,color=Aqua)
         }
         if(r.optString("personality").isNotBlank())Text(r.optString("personality"),fontSize=13.sp,lineHeight=18.sp,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis)
        }
        if(cancel||fresh)Box{
         IconButton({more=true}){Icon(Icons.Outlined.MoreVert,"${r.optString("name")} 배역 메뉴",Modifier.size(20.dp),tint=Muted)}
         DropdownMenu(more,{more=false},containerColor=Panel){
          if(cancel)DropdownMenuItem(text={Text("배역 취소")},enabled=!busy,onClick={more=false;task{api.call("/api/dubbing/projects/$id/claims/${r.getString("id")}","DELETE",payload("revision" to p.getInt("revision")));reload()}})
          if(fresh)DropdownMenuItem(text={Text("이 배역으로 새 더빙 시작")},enabled=!busy,onClick={more=false;task{val result=api.call("/api/dubbing/projects/$id/performances","POST",payload("id" to performanceRequest,"roleId" to r.getString("id")));navigate("dubbing/${result.getString("id")}")}})
         }
        }
       }
       if(!r.optBoolean("claimed")&&currentRole==null&&p.optString("visibility")=="public"&&p.optString("state") in listOf("recruiting","recording"))BrandButton({task{api.call("/api/dubbing/projects/$id/claims/${r.getString("id")}","POST",payload("revision" to p.getInt("revision")));reload();recording=true}},enabled=!busy,modifier=Modifier.fillMaxWidth().heightIn(min=44.dp)){Text("배역 선택하고 녹음",fontSize=14.sp)}
      }
     }
    }
    if(currentRole!=null)item{
     BrandButton({audio.stop();recording=true},enabled=!busy&&p.optBoolean("recordingAvailable"),modifier=Modifier.fillMaxWidth().heightIn(min=56.dp).testTag("dubbing-open-recorder"),shape=RoundedCornerShape(28.dp)){
      Icon(Icons.Outlined.Mic,null,Modifier.size(22.dp));Text("녹음하기",Modifier.padding(start=8.dp),fontSize=17.sp,fontWeight=FontWeight.Bold)
     }
    }
    p.optJSONObject("recording")?.optJSONObject("final")?.let{final->item{if(final.optString("state")=="ready"){BrandButton({audio.listen(final.getString("audioUrl"))},modifier=Modifier.fillMaxWidth()){Text("완성된 더빙 듣기")};TextButton({audio.stop()}){Text("재생 정지")}}else Text("더빙 합성 상태 · ${final.optString("state")}",color=SoftText)}}
    item{DubbingSectionTitle("대본 미리보기","총 ${lines.size}개 대사")}
    val starts=dubbingLineStarts(lines)
    items(if(scriptOpen)lines else lines.take(4),key={"line-"+it.getString("id")}){l->DubbingLineCard(l,roles,currentRole?.optString("id"),starts[l.getString("id")]?:0.0)}
    if(lines.size>4)item{DubbingExpandButton(scriptOpen){scriptOpen=!scriptOpen}}
    val others=p.optJSONArray("versions").objects().filter{it.getString("id")!=id}
    if(others.isNotEmpty())item{DubbingVersions(p,others,versionsOpen,{versionsOpen=!versionsOpen}){navigate("dubbing/$it")}}
    if(p.optString("visibility")=="public")item{NativeDubbingComments(api,p)}
   }
  }
 }
 if(confirm.isNotBlank()&&project!=null){val p=project!!;val action=confirm;val charge=if(action=="basic")0 else sound.optInt("chargeGold",sound.optInt("priceGold",50));AlertDialog(onDismissRequest={if(!busy)confirm=""},title={Text(when(action){"publish"->"배역 모집을 시작할까요?";"unpublish"->"모집을 중지할까요?";"delete"->"내 더빙을 삭제할까요?";"basic"->"기본 배경을 준비할까요?";else->"${charge} G로 음향을 제작할까요?"})},text={Text(when(action){"publish"->"대본을 공개하고 다른 사람과 함께 연기할 권한이 있음을 확인합니다.";"delete"->"삭제하면 이 작품을 다시 열거나 참여할 수 없어요.";"basic"->"효과음 없이 녹음에 사용할 배경을 준비해요.";"unpublish"->"새로운 참여자 모집을 중지해요.";else->"생성 전 최종 금액을 확인해주세요. 실패하면 서버에서 자동 환급돼요."})},confirmButton={TextButton(enabled=!busy,onClick={task{
  when(action){"delete"->{api.call("/api/dubbing/projects/$id","DELETE",payload("revision" to p.getInt("revision")));back()};"publish","unpublish"->{api.call("/api/dubbing/projects/$id/$action","POST",payload("revision" to p.getInt("revision"),"rightsAccepted" to true));if(action=="publish")back()else reload()};else->{api.call("/api/dubbing/projects/$id/sound","POST",payload("requestId" to soundRequest,"mode" to if(action=="basic")"basic" else "ai","revision" to p.getInt("revision"),"acceptedGold" to sound.optInt("priceGold",50),"acceptedChargeGold" to charge));reload()}};confirm=""
 }}){Text(if(action=="publish")"동의하고 공개" else "확인")}},dismissButton={TextButton({confirm=""},enabled=!busy){Text("취소")}})}
}

@Composable private fun NativeDubbingRecorder(api:NativeApi,account:String,project:JSONObject,role:JSONObject,back:()->Unit){
 val context=LocalContext.current;val scope=rememberCoroutineScope();val owner=LocalLifecycleOwner.current;val id=project.getString("id");val roleId=role.getString("id");val path="/api/dubbing/projects/$id"
 val audio=remember{NativeDubbingAudio(context,api)};val running by audio.running.collectAsState();val status by audio.status.collectAsState();val count by audio.countdown.collectAsState();val level by audio.level.collectAsState();val elapsed by audio.elapsed.collectAsState()
 var view by remember{mutableStateOf(JSONObject())};var sound by remember{mutableStateOf(project.optJSONObject("sound")?:JSONObject())};var error by remember{mutableStateOf<String?>(null)};var busy by remember{mutableStateOf(false)};var drafts by remember{mutableStateOf<DubbingDrafts?>(null)};var changed by remember{mutableIntStateOf(0)};var selected by rememberSaveable{mutableIntStateOf(0)};var submit by remember{mutableStateOf(false)};var recordLine by remember{mutableStateOf<JSONObject?>(null)}
 var confirmLeave by remember{mutableStateOf(false)};var leaving by remember{mutableStateOf(false)}
 val latestDrafts by rememberUpdatedState(drafts)
 fun leave(){if(busy)return;if(running){leaving=true;audio.finishLine()}else if(drafts?.hasUnsavedChanges==true)confirmLeave=true else{audio.stop();back()}}
 val mine=view.optJSONArray("lines").objects().filter{it.getString("roleId")==roleId};val all=project.getJSONObject("script").optJSONArray("lines").objects();val current=mine.getOrNull(selected);val own=view.optJSONObject("recording")?.optJSONArray("roles").objects().find{it.getString("roleId")==roleId};val submitted=own?.optString("state")=="submitted"
 fun start(l:JSONObject){drafts?.let{d->audio.record("$path/background",l,d,{changed++;recordLine=null},{error=it;recordLine=null})}}
 val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->if(granted)recordLine?.let(::start)else{error="녹음하려면 마이크 권한을 허용해주세요.";recordLine=null}}
 DisposableEffect(owner){val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_STOP){audio.stop();if(latestDrafts?.hasUnsavedChanges==true)confirmLeave=true}};owner.lifecycle.addObserver(observer);onDispose{owner.lifecycle.removeObserver(observer);audio.close();latestDrafts?.discard()}}
 BackHandler{leave()}
 LaunchedEffect(running,leaving){if(leaving&&!running){leaving=false;leave()}}
 suspend fun refresh(){view=api.call("$path/recording",fresh=true)}
 fun task(block:suspend ()->Unit){if(busy)return;busy=true;error=null;scope.launch{try{block()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}}
 suspend fun prepare(){
  if(sound.optString("state")=="not_started")sound=api.call("$path/recording/prepare","POST").getJSONObject("sound")
  if(sound.optString("state")!="ready"){audio.status.value="배경 음향을 준비하고 있어요. 완료되면 녹음을 시작할 수 있어요.";try{withTimeout(180000){while(sound.optString("state") in listOf("queued","planning","generating","mixing")){delay(5000);sound=api.call("$path/sound",fresh=true).getJSONObject("sound")}}}catch(e:TimeoutCancellationException){throw IllegalStateException("음향 준비에 시간이 더 필요해요. 준비 상태를 다시 확인해주세요.",e)}}
  check(sound.optString("state")=="ready"){sound.optString("error","배경 음향 상태를 확인해주세요.")}
  coroutineScope{val background=async{audio.prepareBackground("$path/background",sound.getString("id"))};view=api.call("$path/recording/$roleId/start","POST",payload("soundId" to sound.getString("id")));background.await()}
  drafts=DubbingDrafts(context,account,id,sound.getString("id"),roleId);selected=mine.indexOfFirst{!it.has("takeId")}.coerceAtLeast(0)
 }
 LaunchedEffect(Unit){busy=true;try{prepare()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}
 suspend fun saveAll(){audio.stop();val d=drafts?:error("녹음 준비를 확인해주세요.");d.save();refresh();for(l in view.optJSONArray("lines").objects().filter{it.getString("roleId")==roleId}){val key=l.getString("id");val take=d.takes[key]?:continue;if(l.optString("takeId")==take.optString("id")){d.uploaded(key,take.getString("id"));continue};if(take.optBoolean("uploaded"))continue;val rev=view.getJSONObject("recording").getJSONArray("roles").objects().first{it.getString("roleId")==roleId}.getInt("revision");view=api.uploadDubbingTake("$path/recording/$roleId/lines/$key?revision=$rev&take=${take.getString("id")}",d.file(take));d.uploaded(key,take.getString("id"));changed++};audio.status.value="지금까지 녹음한 대사를 모두 임시 저장했어요."}
 val complete=mine.count{it.has("takeId")||drafts?.takes?.containsKey(it.getString("id"))==true}
 val scriptList=rememberLazyListState()
 val selectedId=current?.optString("id")
 val roles=project.getJSONObject("script").optJSONArray("roles").objects()
 var scriptOpen by rememberSaveable{mutableStateOf(false)}
 val capturing by audio.capturing.collectAsState()
 val selectedAt=all.indexOfFirst{it.optString("id")==selectedId}
 // A short window around the chosen line, as in the approved design; the whole script opens on request.
 val windowStart=(selectedAt-1).coerceIn(0,(all.size-4).coerceAtLeast(0))
 val visible=if(scriptOpen)all else all.drop(windowStart).take(4)
 LaunchedEffect(selectedId,scriptOpen){if(scriptOpen&&selectedAt>=0)scriptList.animateScrollToItem((selectedAt-1).coerceAtLeast(0))}
 Column(Modifier.fillMaxSize().testTag("native-dubbing-recorder")){
  NativeAudioHeader("${role.optString("name")} · 녹음",::leave)
  Row(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=6.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
   DubbingCover(project,Modifier.size(56.dp))
   Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)){
    Text(project.optString("title"),fontSize=18.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
    Text("내 대사 $complete / ${mine.size} · ${if(submitted)"제출 완료" else "대사를 선택해 녹음하세요"}",color=Muted,fontSize=12.sp)
   }
  }
  if(busy)LinearProgressIndicator(Modifier.fillMaxWidth().padding(horizontal=16.dp),color=Pink,trackColor=Stroke)
  error?.let{Column(Modifier.padding(horizontal=16.dp)){Text(it,color=Muted,fontSize=13.sp);TextButton({task{if(drafts==null){sound=api.call("$path/sound",fresh=true).getJSONObject("sound");prepare()}else refresh()}}){Text(if(drafts==null)"준비 상태 확인" else "저장 상태 확인")}}}
  LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("dubbing-full-script"),state=scriptList,contentPadding=PaddingValues(horizontal=16.dp,vertical=8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
   items(visible,key={it.getString("id")}){line->
    val lineId=line.getString("id");val mineIndex=mine.indexOfFirst{it.getString("id")==lineId};val ownLine=mineIndex>=0;val at=roles.indexOfFirst{it.optString("id")==line.optString("roleId")};val active=lineId==selectedId
    val saved=mine.getOrNull(mineIndex)?.has("takeId")==true;val local=drafts?.takes?.get(lineId);val recorded=saved||local!=null
    Surface(onClick={if(ownLine&&!running&&!busy){audio.stop();selected=mineIndex}},enabled=ownLine&&!running&&!busy,color=Panel,shape=RoundedCornerShape(14.dp),border=BorderStroke(if(active)1.5.dp else 1.dp,if(active)Violet else Stroke),modifier=Modifier.fillMaxWidth().testTag("dubbing-script-$lineId")){
     Row(Modifier.padding(12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
      DubbingRoleChip(roles.getOrNull(at)?.optString("name").orEmpty(),dubbingRoleColor(at))
      Column(Modifier.weight(1f)){
       Text(line.optString("text"),fontSize=15.sp,lineHeight=22.sp,color=if(active)Color.White else SoftText,fontWeight=if(active)FontWeight.SemiBold else FontWeight.Normal)
       if(ownLine&&recorded)Row(Modifier.padding(top=4.dp),verticalAlignment=Alignment.CenterVertically){
        Icon(Icons.Outlined.CheckCircle,null,Modifier.size(13.dp),tint=Aqua)
        Text(if(saved||local?.optBoolean("uploaded")==true)"임시 저장됨" else "녹음됨 · 저장 전",fontSize=11.sp,color=Muted,modifier=Modifier.padding(start=5.dp))
       }
      }
     }
    }
   }
   if(all.size>4)item{DubbingExpandButton(scriptOpen){scriptOpen=!scriptOpen}}
  }
  Column(Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=6.dp,bottom=12.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
   if(current!=null){
    val local=drafts?.takes?.get(current.getString("id"));val url=local?.let{drafts!!.file(it).toURI().toString()}?:current.optString("audioUrl").takeIf{it.isNotBlank()}
    val total=dubbingWindow(current).duration;val taken=local?.optDouble("duration",total)?:total
    fun record(){recordLine=current;permission.launch(Manifest.permission.RECORD_AUDIO)}
    when{
     count>0->Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.Center){
      Box(Modifier.size(108.dp).clip(CircleShape).background(Ink).border(3.dp,Brush.linearGradient(listOf(Violet,Pink)),CircleShape).clickable(onClickLabel="녹음 준비 취소"){audio.finishLine()}.testTag("dubbing-countdown"),contentAlignment=Alignment.Center){
       Text("$count",fontSize=46.sp,fontWeight=FontWeight.Bold)
      }
     }
     running->{
      DubbingProgressCard(if(capturing)"녹음 중..." else status,capturing,elapsed,total,if(capturing)(elapsed/total).toFloat() else 0f)
      Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.Center){
       Box(Modifier.size(72.dp).clip(CircleShape).border(2.dp,Violet,CircleShape).clickable(onClickLabel=if(capturing)"이 대사 마치기" else "녹음 준비 취소"){audio.finishLine()}.testTag("dubbing-record-line"),contentAlignment=Alignment.Center){
        Box(Modifier.size(24.dp).background(SoftText,RoundedCornerShape(5.dp)))
       }
      }
     }
     (local!=null||current.has("takeId"))&&!submitted->Surface(color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag("dubbing-line-done")){
      Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
       DubbingProgressHeader("녹음 완료",Icons.Outlined.CheckCircle,taken,total)
       LinearProgressIndicator({1f},Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),color=Violet,trackColor=Stroke)
       Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
        OutlinedButton({record()},enabled=!busy&&drafts!=null,modifier=Modifier.weight(1f).heightIn(min=48.dp).testTag("dubbing-record-line"),shape=RoundedCornerShape(24.dp),border=BorderStroke(1.dp,Stroke)){Icon(Icons.Outlined.Refresh,null,Modifier.size(18.dp));Text("다시 녹음",Modifier.padding(start=6.dp),color=SoftText)}
        BrandButton({if(url!=null)audio.listen(url)},enabled=url!=null,modifier=Modifier.weight(1f).heightIn(min=48.dp),shape=RoundedCornerShape(24.dp)){Icon(Icons.Outlined.PlayArrow,null,Modifier.size(20.dp));Text("녹음 확인",Modifier.padding(start=6.dp))}
       }
      }
     }
     !submitted->BrandButton({record()},enabled=!busy&&drafts!=null,modifier=Modifier.fillMaxWidth().heightIn(min=56.dp).testTag("dubbing-record-line"),shape=RoundedCornerShape(28.dp)){
      Icon(Icons.Outlined.Mic,null,Modifier.size(22.dp));Text("녹음하기",Modifier.padding(start=8.dp),fontSize=17.sp,fontWeight=FontWeight.Bold)
     }
     url!=null->OutlinedButton({audio.listen(url)},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(24.dp),border=BorderStroke(1.dp,Stroke)){Text("녹음 확인",color=SoftText)}
    }
    if(!running&&status.isNotBlank())Text(status,fontSize=12.sp,color=Muted,maxLines=2)
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
     TextButton({audio.stop();selected--},enabled=selected>0&&!running&&!busy){Text("이전",fontSize=15.sp,color=if(selected>0)SoftText else Muted)}
     TextButton({audio.stop();selected++},enabled=selected<mine.lastIndex&&!running&&!busy){Text("다음",fontSize=15.sp,color=if(selected<mine.lastIndex)SoftText else Muted)}
    }
   }
   if(!submitted)Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
    OutlinedButton({task{saveAll()}},enabled=!busy&&!running&&drafts!=null,modifier=Modifier.weight(1f).heightIn(min=52.dp).testTag("dubbing-save-all"),shape=RoundedCornerShape(26.dp),border=BorderStroke(1.dp,Violet.copy(alpha=.6f))){Text("임시 저장",fontSize=15.sp,color=Color.White)}
    val ready=!busy&&!running&&mine.isNotEmpty()&&complete==mine.size
    Button({submit=true},enabled=ready,modifier=Modifier.weight(1f).heightIn(min=52.dp),shape=RoundedCornerShape(26.dp),colors=ButtonDefaults.buttonColors(containerColor=Color(0xFF5B3F8F),contentColor=Color.White,disabledContainerColor=Panel,disabledContentColor=Muted)){Text("전체 제출",fontSize=15.sp,fontWeight=FontWeight.SemiBold)}
   }
  }
 }
 if(confirmLeave)DubbingLeaveDialog(busy,onContinue={confirmLeave=false},onSave={try{drafts?.save();confirmLeave=false;audio.stop();back()}catch(e:Exception){error=e.message;confirmLeave=false}},onDiscard={drafts?.discard();confirmLeave=false;audio.stop();back()})
 if(submit)AlertDialog(onDismissRequest={if(!busy)submit=false},title={Text("모든 대사를 제출할까요?")},text={Text("내 음성을 함께 만든 더빙 작품으로 공개하는 데 동의합니다. 제출한 녹음은 수정할 수 없어요.")},confirmButton={TextButton(enabled=!busy,onClick={task{saveAll();val rev=view.getJSONObject("recording").getJSONArray("roles").objects().first{it.getString("roleId")==roleId}.getInt("revision");view=api.call("$path/recording/$roleId/submit","POST",payload("revision" to rev,"rightsAccepted" to true));submit=false;audio.status.value="제출했어요. 모든 배역이 완료되면 더빙이 합성돼요."}}){Text("동의하고 제출")}},dismissButton={TextButton({submit=false},enabled=!busy){Text("취소")}})
}

@Composable internal fun DubbingLeaveDialog(busy:Boolean,onContinue:()->Unit,onSave:()->Unit,onDiscard:()->Unit){
 AlertDialog(onDismissRequest=onContinue,title={Text("진행사항을 저장할까요?")},text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
  Text("저장을 선택하면 이 기기에서 이어서 작업할 수 있어요. 저장하지 않으면 이번 작업의 저장 전 변경사항을 삭제해요.")
  TextButton(onContinue,enabled=!busy,modifier=Modifier.testTag("dubbing-continue")){Text("계속 작업하기")}
 }},confirmButton={TextButton(onSave,enabled=!busy,modifier=Modifier.testTag("dubbing-save-leave")){Text("저장하고 나가기")}},dismissButton={TextButton(onDiscard,enabled=!busy,modifier=Modifier.testTag("dubbing-discard-leave")){Text("저장 안 함")}})
}

@Composable private fun NativeDubbingComments(api:NativeApi,project:JSONObject){
 val path="/api/dubbing/projects/${project.getString("id")}";val scope=rememberCoroutineScope();var comments by remember{mutableStateOf<List<JSONObject>>(emptyList())};var text by remember{mutableStateOf("")};var request by remember{mutableStateOf(requestIdentity())};var error by remember{mutableStateOf<String?>(null)};var busy by remember{mutableStateOf(false)};var community by remember{mutableStateOf(project.optJSONObject("community")?:JSONObject())}
 suspend fun load(){comments=api.call("$path/comments",fresh=true).optJSONArray("comments").objects()}
 fun task(block:suspend ()->Unit){if(busy)return;busy=true;scope.launch{try{block()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}}
 LaunchedEffect(Unit){try{load()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 val liked=community.optBoolean("liked")||community.optInt("liked")==1
 Column(Modifier.padding(top=6.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Text("함께 나누는 이야기",Modifier.weight(1f),fontSize=18.sp,fontWeight=FontWeight.Bold)
   TextButton({task{community=api.call("$path/like",if(liked)"DELETE" else "PUT")}},enabled=!busy){Icon(if(liked)Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,"좋아요",tint=if(liked)Pink else Violet);Text("좋아요 ${community.optInt("likes")}",Modifier.padding(start=6.dp),color=SoftText)}
  }
  comments.forEach{c->Column(Modifier.fillMaxWidth().background(Panel,RoundedCornerShape(12.dp)).padding(12.dp)){Row(verticalAlignment=Alignment.CenterVertically){Text(c.optString("name"),fontWeight=FontWeight.Bold,fontSize=14.sp);OfficialAiBadge(c)};Text(c.optString("body"),fontSize=14.sp,color=SoftText);if(c.optBoolean("canDelete"))TextButton({task{api.call("$path/comments/${c.getString("id")}","DELETE");load()}}){Text("삭제",fontSize=12.sp)}}}
  Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
   OutlinedTextField(text,{text=it.take(2000);request=requestIdentity()},Modifier.weight(1f).testTag("dubbing-comment-input"),placeholder={Text("응원의 말을 남겨주세요.",color=Muted)},shape=RoundedCornerShape(14.dp),colors=OutlinedTextFieldDefaults.colors(unfocusedContainerColor=Panel,focusedContainerColor=Panel,unfocusedBorderColor=Stroke,focusedBorderColor=Violet),maxLines=4)
   val canSend=!busy&&text.isNotBlank()
   Box(Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)).background(if(canSend)BrandGradient else Brush.linearGradient(listOf(Panel,Panel))).clickable(enabled=canSend,onClickLabel="댓글 등록"){task{api.call("$path/comments","POST",payload("id" to request,"body" to text));text="";request=requestIdentity();load()}}.testTag("dubbing-comment-send"),contentAlignment=Alignment.Center){
    Icon(Icons.AutoMirrored.Outlined.Send,"댓글 등록",tint=if(canSend)Ink else Muted)
   }
  }
  error?.let{Text(it,color=Pink,fontSize=12.sp)}
 }
}

private val DubbingRoleColors=listOf(Color(0xFFA7C9FF),Color(0xFFF4B1D3),Color(0xFF9DE1C7),Color(0xFFF1D38F),Color(0xFFCFB5F5),Color(0xFFFFB6A1))
internal fun dubbingRoleColor(index:Int)=DubbingRoleColors[index.coerceAtLeast(0)%DubbingRoleColors.size]
/** Script lines start one after another: each line's length plus its pause. */
internal fun dubbingLineStarts(lines:List<JSONObject>):Map<String,Double>{var at=0.0;return lines.sortedBy{it.optInt("order")}.associate{l->val start=at;at+=l.optDouble("durationSeconds",0.0).coerceAtLeast(0.0)+l.optDouble("gapSeconds",0.0).coerceAtLeast(0.0);l.optString("id") to start}}

@Composable private fun DubbingSectionTitle(title:String,trailing:String?=null){
 Row(Modifier.fillMaxWidth().padding(top=6.dp),verticalAlignment=Alignment.CenterVertically){
  Text(title,Modifier.weight(1f),fontSize=18.sp,fontWeight=FontWeight.Bold)
  trailing?.let{Text(it,fontSize=13.sp,color=SoftText)}
 }
}
@Composable private fun DubbingChip(text:String,color:Color){
 Surface(color=color.copy(alpha=.16f),shape=RoundedCornerShape(8.dp),border=BorderStroke(1.dp,color.copy(alpha=.45f))){Text(text,Modifier.padding(horizontal=7.dp,vertical=2.dp),fontSize=11.sp,color=color,fontWeight=FontWeight.SemiBold,maxLines=1)}
}
@Composable private fun DubbingRoleChip(name:String,color:Color){
 Surface(color=color.copy(alpha=.16f),shape=RoundedCornerShape(10.dp)){Text(name,Modifier.widthIn(min=44.dp).padding(horizontal=10.dp,vertical=5.dp),fontSize=13.sp,color=color,fontWeight=FontWeight.SemiBold,maxLines=1,textAlign=androidx.compose.ui.text.style.TextAlign.Center)}
}
@Composable private fun DubbingExpandButton(open:Boolean,toggle:()->Unit){
 OutlinedButton(toggle,Modifier.fillMaxWidth().heightIn(min=48.dp).testTag("dubbing-script-expand"),shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke)){
  Icon(Icons.AutoMirrored.Outlined.List,null,Modifier.size(18.dp),tint=SoftText);Text(if(open)"대본 접기" else "전체 대본 펼쳐보기",Modifier.padding(horizontal=8.dp),color=Color.White,fontWeight=FontWeight.SemiBold)
  Icon(if(open)Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,null,Modifier.size(20.dp),tint=SoftText)
 }
}
@Composable private fun DubbingLineCard(l:JSONObject,roles:List<JSONObject>,mineRole:String?,start:Double){
 val at=roles.indexOfFirst{it.optString("id")==l.optString("roleId")};val mine=mineRole!=null&&l.optString("roleId")==mineRole;val color=dubbingRoleColor(at)
 Surface(color=Panel,shape=RoundedCornerShape(14.dp),border=BorderStroke(if(mine)1.5.dp else 1.dp,if(mine)Violet else Stroke),modifier=Modifier.fillMaxWidth()){
  Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
   Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
    Surface(color=Raised,shape=RoundedCornerShape(8.dp)){Text("%02d".format(l.optInt("order")),Modifier.padding(horizontal=7.dp,vertical=2.dp),fontSize=12.sp,fontWeight=FontWeight.Bold)}
    Text(listOf(l.optString("emotion"),l.optString("direction")).filter{it.isNotBlank()&&it!="null"}.joinToString(" · "),Modifier.weight(1f),fontSize=12.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
    if(mine)DubbingChip("내 대사",Pink) else Surface(color=Color.Transparent,shape=RoundedCornerShape(10.dp),border=BorderStroke(1.dp,Stroke)){Text(timeLabel((start*1000).toLong()),Modifier.padding(horizontal=7.dp,vertical=1.dp),fontSize=11.sp,color=Muted)}
   }
   Row(verticalAlignment=Alignment.Top,horizontalArrangement=Arrangement.spacedBy(10.dp)){
    DubbingRoleChip(roles.getOrNull(at)?.optString("name").orEmpty(),color)
    Text(l.optString("text"),Modifier.weight(1f).padding(top=3.dp),fontSize=15.sp,lineHeight=22.sp,color=if(mine)Color.White else SoftText)
   }
  }
 }
}
/** Cover-backed project summary with the background sound player, as in the approved design. */
@Composable private fun DubbingInfoCard(p:JSONObject,sound:JSONObject,playing:Boolean,positionMs:Long,toggle:()->Unit,extra:@Composable ColumnScope.()->Unit){
 val durationMs=(p.optDouble("duration")*1000).toLong().coerceAtLeast(1)
 val description=p.optJSONObject("options")?.optString("idea").orEmpty().takeIf{it.isNotBlank()&&it!="null"}?:p.optJSONObject("script")?.optJSONArray("scenes").objects().firstOrNull()?.optString("description").orEmpty().takeIf{it.isNotBlank()&&it!="null"}
 Surface(color=Panel,shape=RoundedCornerShape(18.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag("dubbing-info")){
  Box{
   DubbingCover(p,Modifier.matchParentSize())
   Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Ink.copy(alpha=.94f),Ink.copy(alpha=.72f),Ink.copy(alpha=.40f)))))
   Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
    DubbingChip("더빙 작품",SoftText)
    Text(p.optString("title"),fontSize=22.sp,lineHeight=29.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
    Text("${p.optString("ownerName")}  ·  ${timeLabel(durationMs)}",fontSize=13.sp,color=SoftText)
    description?.let{Text(it,fontSize=13.sp,lineHeight=19.sp,color=SoftText,maxLines=3,overflow=TextOverflow.Ellipsis)}
    Surface(color=Ink.copy(alpha=.72f),shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().padding(top=4.dp)){
     Row(Modifier.padding(horizontal=12.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
      Text("배경 음향",fontSize=13.sp,fontWeight=FontWeight.SemiBold)
      if(sound.optString("state")=="ready"){
       Box(Modifier.size(40.dp).clip(CircleShape).border(1.5.dp,Violet,CircleShape).clickable(onClickLabel=if(playing)"배경 음향 정지" else "배경 음향 듣기",onClick=toggle).testTag("dubbing-background-toggle"),contentAlignment=Alignment.Center){
        Icon(if(playing)Icons.Outlined.Pause else Icons.Outlined.PlayArrow,null,Modifier.size(22.dp))
       }
       Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)){
        DubbingWave((positionMs.toFloat()/durationMs).coerceIn(0f,1f),Modifier.fillMaxWidth().height(22.dp))
        Text("${timeLabel(if(playing)positionMs else 0)} / ${timeLabel(durationMs)}",fontSize=11.sp,color=Muted)
       }
      }else Text(when(sound.optString("state")){"not_started"->"기본 배경 또는 효과음을 선택해요";"failed","unknown"->sound.optString("error","제작 결과를 확인해주세요.");else->"음향 제작 중 · ${sound.optInt("progress")}%"},Modifier.weight(1f),fontSize=12.sp,lineHeight=17.sp,color=Muted)
     }
    }
    extra()
   }
  }
 }
}
@Composable private fun DubbingWave(progress:Float,modifier:Modifier){
 Canvas(modifier){
  val bars=40;val gap=size.width/bars
  for(i in 0 until bars){
   val h=size.height*(.25f+.75f*((kotlin.math.sin(i*1.7)+kotlin.math.sin(i*.45)+2)/4).toFloat())
   drawLine(if(i.toFloat()/bars<progress)Violet else Violet.copy(alpha=.35f),androidx.compose.ui.geometry.Offset(i*gap+gap/2,(size.height-h)/2),androidx.compose.ui.geometry.Offset(i*gap+gap/2,(size.height+h)/2),strokeWidth=gap*.5f,cap=androidx.compose.ui.graphics.StrokeCap.Round)
  }
 }
}
@Composable private fun DubbingVersions(p:JSONObject,others:List<JSONObject>,open:Boolean,toggle:()->Unit,openVersion:(String)->Unit){
 Surface(color=Panel,shape=RoundedCornerShape(18.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag("dubbing-versions")){
  Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
   Row(verticalAlignment=Alignment.CenterVertically){
    Text("다른 더빙",Modifier.weight(1f).padding(start=4.dp),fontSize=18.sp,fontWeight=FontWeight.Bold)
    if(others.size>3)TextButton(toggle){Text(if(open)"접기" else "더보기",color=SoftText,fontSize=13.sp);Icon(if(open)Icons.Outlined.ExpandLess else Icons.Outlined.ChevronRight,null,Modifier.size(18.dp),tint=SoftText)}
   }
   (if(open)others else others.take(3)).forEach{v->
    Surface(onClick={openVersion(v.getString("id"))},color=Color.Transparent,shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth()){
     Row(Modifier.padding(10.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
      DubbingCover(p,Modifier.size(52.dp))
      Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(2.dp)){
       Text(v.optString("ownerName"),fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
       Text("${v.optInt("participants")} / ${v.optInt("roleCount")}명 참여",fontSize=12.sp,color=Muted)
      }
      val (label,color)=when(v.optString("state")){"recruiting"->"모집중" to Violet;"recording"->"녹음중" to Aqua;"mixing"->"합성중" to Aqua;"complete"->"완성" to Pink;"script_ready"->"준비중" to Muted;else->v.optString("state") to Muted}
      Surface(color=color.copy(alpha=.14f),shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,color.copy(alpha=.6f))){Text(label,Modifier.padding(horizontal=12.dp,vertical=5.dp),fontSize=13.sp,color=color,fontWeight=FontWeight.SemiBold)}
     }
    }
   }
  }
 }
}
@Composable private fun DubbingProgressHeader(label:String,icon:androidx.compose.ui.graphics.vector.ImageVector?,elapsed:Double,total:Double,live:Boolean=false){
 Row(verticalAlignment=Alignment.CenterVertically){
  if(live)Box(Modifier.size(10.dp).clip(CircleShape).background(Color(0xFFFF5A6E)))
  icon?.let{Icon(it,null,Modifier.size(20.dp),tint=Aqua)}
  Text(label,Modifier.weight(1f).padding(start=8.dp),fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=2)
  Text(androidx.compose.ui.text.buildAnnotatedString{pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight=FontWeight.Bold,color=Color.White));append("%.1f".format(elapsed));pop();append(" / %.1f초".format(total))},fontSize=14.sp,color=Muted)
 }
}
@Composable private fun DubbingProgressCard(label:String,live:Boolean,elapsed:Double,total:Double,progress:Float){
 Surface(color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag("dubbing-line-progress")){
  Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   DubbingProgressHeader(label,null,elapsed,total,live)
   LinearProgressIndicator({progress.coerceIn(0f,1f)},Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),color=Violet,trackColor=Stroke)
  }
 }
}
