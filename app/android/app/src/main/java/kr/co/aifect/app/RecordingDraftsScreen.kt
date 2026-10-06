@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
    items(drafts){d->Surface(onClick={m.showRecordingDrafts=false;open(d)},shape=RoundedCornerShape(14.dp),color=Stroke,modifier=Modifier.fillMaxWidth().testTag("draft-"+d.optString("trackId"))){
     Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically){Icon(Icons.Rounded.Mic,null,tint=Pink,modifier=Modifier.size(24.dp));Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(d.optString("title"),fontSize=15.sp,fontWeight=FontWeight.SemiBold);val seconds=d.optDouble("duration").toInt();Text((if(d.optString("coverMode")=="duet")"듀엣" else "솔로")+" · "+"%d:%02d".format(seconds/60,seconds%60)+" · "+DateFormat.getDateInstance(DateFormat.SHORT).format(Date(d.optLong("updated"))),color=Muted,fontSize=12.sp,lineHeight=18.sp,modifier=Modifier.padding(top=6.dp))};Icon(Icons.Rounded.Edit,"이어 편집",tint=Pink,modifier=Modifier.size(20.dp))}
    }}
   }
   Spacer(Modifier.height(24.dp))
  }
 }
}
