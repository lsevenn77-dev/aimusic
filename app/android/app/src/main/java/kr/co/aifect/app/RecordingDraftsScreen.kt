@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import kotlinx.coroutines.*
import kr.co.aifect.app.karaoke.RecordingDraftStore
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

@Composable internal fun RecordingDraftsSheet(m:MusicModel,open:(JSONObject)->Unit){
 val context=LocalContext.current;val owner=m.user?.optString("id")
 var drafts by remember(owner){mutableStateOf<List<JSONObject>>(emptyList())};var loading by remember(owner){mutableStateOf(true)}
 var error by remember(owner){mutableStateOf<String?>(null)};var attempt by remember(owner){mutableIntStateOf(0)}
 val scope=rememberCoroutineScope()
 var deleting by remember(owner){mutableStateOf<JSONObject?>(null)}
 var deletingNow by remember(owner){mutableStateOf(false)}
 deleting?.let{draft->AlertDialog(onDismissRequest={if(!deletingNow)deleting=null},title={Text("초안을 삭제할까요?")},text={Text("「${draft.optString("title")}」의 이 기기 녹음이 삭제돼요. 공개한 커버곡은 유지되며 삭제한 초안은 복구할 수 없어요.")},confirmButton={TextButton(enabled=!deletingNow,onClick={scope.launch{
  if(owner!=m.user?.optString("id"))return@launch
  deletingNow=true
  try{withContext(Dispatchers.IO){RecordingDraftStore.delete(context,Endpoint.origin,owner,draft.getString("folder"))};deleting=null;attempt++}
  catch(e:Exception){if(e is CancellationException)throw e;error=e.message;deleting=null}
  finally{deletingNow=false}
 }}){Text("삭제")}},dismissButton={TextButton(enabled=!deletingNow,onClick={deleting=null}){Text("취소")}})}
 LaunchedEffect(owner,attempt){
  try{val loaded=withContext(Dispatchers.IO){RecordingDraftStore.list(context,Endpoint.origin,owner).let{a->(0 until a.length()).map{a.getJSONObject(it)}}};withContext(Dispatchers.Main.immediate){drafts=loaded;error=null;loading=false}}
  catch(e:Exception){if(e is CancellationException)throw e;withContext(Dispatchers.Main.immediate){error="초안을 불러오지 못했어요.";loading=false}}
 }
 ModalBottomSheet(onDismissRequest={m.showRecordingDrafts=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  Column(Modifier.fillMaxWidth().padding(horizontal=22.dp).testTag("recording-drafts")){
   Row(verticalAlignment=Alignment.CenterVertically){Text("초안",Modifier.weight(1f),fontSize=25.sp,fontWeight=FontWeight.Bold);IconButton(onClick={m.showRecordingDrafts=false}){Icon(Icons.Rounded.Close,"초안 닫기")}}
   Text("이 기기에 저장한 녹음이에요. 다른 기기에는 표시되지 않아요.",color=Muted,fontSize=13.sp,lineHeight=20.sp,modifier=Modifier.padding(top=6.dp,bottom=20.dp))
   if(loading)CircularProgressIndicator(Modifier.padding(24.dp),color=Pink)
   else if(error!=null){Text(error!!,color=Muted);TextButton(onClick={loading=true;attempt++}){Text("다시 불러오기")}}
   else if(drafts.isEmpty())Text("아직 저장된 초안이 없어요. 녹음 후 임시 저장하면 여기에 모여요.",color=Muted,fontSize=15.sp,lineHeight=23.sp,modifier=Modifier.padding(vertical=28.dp))
   else LazyColumn(Modifier.heightIn(max=500.dp),verticalArrangement=Arrangement.spacedBy(12.dp),contentPadding=PaddingValues(bottom=30.dp)){
    items(drafts,key={it.getString("folder")}){d->Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).musicSurface().padding(16.dp).testTag("draft-"+d.optString("trackId"))){
     Row(verticalAlignment=Alignment.CenterVertically){Icon(Icons.Rounded.Mic,null,tint=Pink,modifier=Modifier.size(24.dp));Column(Modifier.weight(1f).padding(start=12.dp)){Text(d.optString("title"),fontSize=15.sp,fontWeight=FontWeight.SemiBold);val seconds=d.optDouble("duration").toInt();Text((if(d.optString("coverMode")=="duet")"듀엣" else "솔로")+" · "+"%d:%02d".format(seconds/60,seconds%60)+" · "+DateFormat.getDateInstance(DateFormat.SHORT).format(Date(d.optLong("updated"))),color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=6.dp))}}
     Row(Modifier.fillMaxWidth().padding(top=10.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
      OutlinedButton(onClick={m.showRecordingDrafts=false;open(d)},enabled=!deletingNow){Icon(Icons.Rounded.Edit,null,Modifier.size(17.dp));Text("이어 편집",fontSize=13.sp,modifier=Modifier.padding(start=5.dp))}
      TextButton(onClick={deleting=d},enabled=!deletingNow,modifier=Modifier.testTag("draft-delete-"+d.optString("trackId"))){Icon(Icons.Rounded.DeleteOutline,null,Modifier.size(18.dp));Text("삭제",fontSize=13.sp,modifier=Modifier.padding(start=5.dp))}
     }
    }}
   }
   Spacer(Modifier.height(24.dp))
  }
 }
}

/** Reads the same account/device-scoped drafts as the existing editor sheet. */
@Composable internal fun RecordingDraftPreview(m:MusicModel,open:(JSONObject)->Unit){
 val context=LocalContext.current
 val owner=m.user?.optString("id")
 val lifecycle=LocalLifecycleOwner.current.lifecycle
 var revision by remember{mutableIntStateOf(0)}
 var latest by remember(owner){mutableStateOf<JSONObject?>(null)}
 var loading by remember(owner){mutableStateOf(true)}
 var error by remember(owner){mutableStateOf(false)}
 DisposableEffect(lifecycle){val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)revision++};lifecycle.addObserver(observer);onDispose{lifecycle.removeObserver(observer)}}
 LaunchedEffect(owner,revision,m.showRecordingDrafts){
  loading=true
  try{latest=withContext(Dispatchers.IO){RecordingDraftStore.list(context,Endpoint.origin,owner).let{a->(0 until a.length()).map{a.getJSONObject(it)}.maxByOrNull{it.optLong("updated")}}};error=false}
  catch(e:Exception){if(e is CancellationException)throw e;error=true}
  finally{loading=false}
 }
 Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
  TextButton(onClick={m.showRecordingDrafts=true},contentPadding=PaddingValues(0.dp),modifier=Modifier.weight(1f)){Text("녹음 이어 하기",Modifier.fillMaxWidth(),fontSize=16.sp,fontWeight=FontWeight.Bold,color=MaterialTheme.colorScheme.onSurface)}
  TextButton(onClick={m.showRecordingDrafts=true}){Text("더보기",fontSize=11.sp,color=Violet);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(16.dp))}
 }
 val draft=latest
 Surface(onClick={if(draft!=null)open(draft) else m.showRecordingDrafts=true},color=StreamPanel,shape=RoundedCornerShape(11.dp),border=BorderStroke(1.dp,StreamBorder),modifier=Modifier.fillMaxWidth().testTag("draft-preview")){
  Row(Modifier.heightIn(min=64.dp).padding(horizontal=9.dp,vertical=7.dp),verticalAlignment=Alignment.CenterVertically){
   StreamingIcon(Icons.Rounded.Mic,StreamPurple,boxed=true)
   Column(Modifier.weight(1f).padding(horizontal=10.dp)){
    Text(draft?.optString("title")?:if(loading)"초안을 불러오는 중" else if(error)"초안을 불러오지 못했어요" else "저장된 녹음이 없어요",fontSize=13.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
    Text(draft?.let{(if(it.optString("coverMode")=="duet")"듀엣" else "솔로")+" · "+DateFormat.getDateInstance(DateFormat.SHORT).format(Date(it.optLong("updated")))}?:if(error)"눌러서 다시 확인하기" else "이 기기에 저장한 초안을 이어서 편집해요",fontSize=11.sp,color=Muted,maxLines=2)
   }
   Icon(if(draft!=null)Icons.Rounded.Edit else Icons.Rounded.ChevronRight,if(draft!=null)"초안 이어 편집" else null,tint=StreamPurple,modifier=Modifier.size(22.dp))
  }
 }
}
