package kr.co.aifect.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable internal fun SongShareButton(song:Song){
 val ctx=LocalContext.current
 IconButton(onClick={val share=Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,song.title+" · "+song.credit+"\n"+Endpoint.url("/music/"+song.id));ctx.startActivity(Intent.createChooser(share,"곡 공유"))}){Icon(Icons.Rounded.Share,"곡 공유")}
}

@Composable internal fun UserSafety(m:MusicModel,uid:String,profile:String,name:String,compact:Boolean=false){
 val account=m.user?.optString("id")?:return
 if(uid==account||!CurrentNavigation.safeID(profile))return
 val ctx=LocalContext.current
 var open by remember(account,profile){mutableStateOf(false)}
 var error by remember(open){mutableStateOf("")}
 if(compact)IconButton(onClick={open=true}){Icon(Icons.Rounded.Flag,"차단 또는 신고")}else TextButton(onClick={open=true}){Text("차단 · 신고")}
 if(open)AlertDialog(onDismissRequest={if(!m.busy)open=false},title={Text(name+" · 차단 및 신고")},text={Column{
  Text("차단하면 이 이용자와 메시지를 주고받을 수 없어요. 차단은 계정에서 해제할 수 있어요.")
  TextButton(onClick={
   val body="신고 대상: "+name+"\n프로필 ID: "+profile+"\n신고 사유: "
   val mail=Intent(Intent.ACTION_SENDTO,Uri.parse("mailto:lsevenn88@gmail.com?subject="+Uri.encode("AIFECT 이용자 신고")+"&body="+Uri.encode(body)))
   try{ctx.startActivity(mail)}catch(e:android.content.ActivityNotFoundException){error="메일 앱이 없어요. lsevenn88@gmail.com으로 프로필 ID "+profile+"와 신고 사유를 보내주세요."}
  }){Text("이용자 신고 메일 작성")}
  if(error.isNotEmpty())Text(error,color=MaterialTheme.colorScheme.error)
 }},confirmButton={TextButton(enabled=!m.busy,onClick={m.action{try{
   val target=uid.takeIf{it!="null"&&CurrentNavigation.safeID(it)}?:m.api.call("/api/producers/"+profile,fresh=true).getJSONObject("profile").getString("user_id")
   require(CurrentNavigation.safeID(target)&&target!=account){"차단할 계정을 확인해주세요."}
   if(m.user?.optString("id")==account){m.api.call("/api/blocks/"+target,"PUT",payload());if(m.user?.optString("id")==account){open=false;m.onBlocked(account);m.notice="차단했어요."}}
  }catch(e:Exception){if(e is CancellationException)throw e;error=e.message?:"차단하지 못했어요."}}}){Text("이용자 차단")}},dismissButton={TextButton(enabled=!m.busy,onClick={open=false}){Text("닫기")}})
}

@Composable internal fun TrackSafety(m:MusicModel,song:Song){
 var open by remember(song.id){mutableStateOf(false)}
 var detail by remember(open){mutableStateOf("")};var error by remember(open){mutableStateOf("")}
 TextButton(onClick={if(m.authenticated())open=true}){Icon(Icons.Rounded.Flag,null);Text("음원 문제 신고")}
 if(open)AlertDialog(onDismissRequest={if(!m.busy)open=false},title={Text("음원 문제 신고")},text={Column{Text(song.title+"의 음질이나 재생 문제를 알려주세요.");OutlinedTextField(detail,{detail=it.take(500)},label={Text("설명 (선택)")});if(error.isNotEmpty())Text(error)}},confirmButton={TextButton(enabled=!m.busy,onClick={m.action{try{m.api.call("/api/tracks/"+song.id+"/report","POST",payload("reason" to "low_quality","details" to detail));open=false;m.notice="음원 신고가 접수됐어요."}catch(e:Exception){if(e is CancellationException)throw e;error=e.message?:"신고하지 못했어요."}}}){Text("신고 접수")}},dismissButton={TextButton(enabled=!m.busy,onClick={open=false}){Text("취소")}})
}

@Composable internal fun SafetySettings(m:MusicModel,close:()->Unit,web:(String)->Unit){
 val account=m.user?.optString("id")?:return
 var blocks by remember(account){mutableStateOf<List<JSONObject>?>(null)}
 var revision by remember{mutableIntStateOf(0)};var error by remember{mutableStateOf("")}
 var deleting by remember{mutableStateOf(false)};var confirmation by remember(deleting){mutableStateOf("")}
 LaunchedEffect(account,revision){error="";try{blocks=m.api.call("/api/blocks",fresh=true).optJSONArray("blocks").objects()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message?:"목록을 불러오지 못했어요."}}
 AppPage("차단 관리 · 계정 삭제",close){Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("차단한 이용자",style=MaterialTheme.typography.titleLarge)
  if(error.isNotBlank()){Text(error);TextButton(onClick={revision++}){Text("다시 시도")}}else if(blocks==null)CircularProgressIndicator()else if(blocks!!.isEmpty())Text("차단한 이용자가 없어요.")
  blocks.orEmpty().forEach{b->Row(Modifier.fillMaxWidth(),verticalAlignment=androidx.compose.ui.Alignment.CenterVertically){Text(b.optString("name"),Modifier.weight(1f));OutlinedButton(enabled=!m.busy,onClick={m.action{m.api.call("/api/blocks/"+b.getString("id"),"DELETE");m.api.invalidateReads();revision++}}){Text("차단 해제")}}}
  HorizontalDivider();Text("계정 삭제",style=MaterialTheme.typography.titleLarge);Text("삭제한 계정과 작품은 복구할 수 없어요. 삭제 전에 보관되는 정보와 구독 안내를 확인해주세요.")
  TextButton(onClick={web("/account/delete")}){Text("계정 삭제 안내 보기")}
  OutlinedButton(onClick={deleting=true},modifier=Modifier.testTag("request-account-delete")){Text("계정 영구 삭제")}
 }}
 if(deleting)AlertDialog(onDismissRequest={if(!m.busy)deleting=false},title={Text("계정을 영구 삭제할까요?")},text={Column{Text("현재 계정: "+m.user?.optString("name")+"\n계속하려면 DELETE를 입력해주세요.");OutlinedTextField(confirmation,{confirmation=it},singleLine=true,label={Text("DELETE")});if(error.isNotBlank())Text(error)}},confirmButton={TextButton(enabled=confirmation=="DELETE"&&!m.busy,onClick={m.action{try{if(m.user?.optString("id")==account){val cookie=NativeSession.cookie(m.getApplication());val result=m.api.call("/api/account/delete","POST",payload("confirmation" to confirmation,"account_id" to account));check(result.optBoolean("deleted"));m.clearLocalAccount(account,cookie);m.notice="계정을 삭제했어요."}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message?:"삭제하지 못했어요."}}}){Text("영구 삭제")}},dismissButton={TextButton(enabled=!m.busy,onClick={deleting=false}){Text("취소")}})
}
