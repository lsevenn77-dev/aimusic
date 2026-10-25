package kr.co.aifect.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URLEncoder
import java.util.UUID

/** Existing owned items are sent by profile ID; no public numeric ID or additional debit. */
@Composable internal fun OwnedGiftSendPage(m:MusicModel,item:JSONObject,close:()->Unit,sent:(JSONObject)->Unit){
 val account=m.user?.optString("id")
 val scope=rememberCoroutineScope()
 var query by remember{mutableStateOf("")}
 var people by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var person by remember{mutableStateOf<JSONObject?>(null)}
 var loading by remember{mutableStateOf(true)}
 var working by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf<String?>(null)}
 var sendError by remember{mutableStateOf<String?>(null)}
 var requestId by remember{mutableStateOf(UUID.randomUUID().toString())}
 var retry by remember{mutableIntStateOf(0)}
 LaunchedEffect(account,query,retry){
  loading=true;error=null;people=emptyList()
  try{
   if(query.isNotBlank())delay(300)
   val result=m.api.call(if(query.isBlank())"/api/catalog?section=producers" else "/api/search?q="+URLEncoder.encode(query.trim(),"UTF-8"))
   if(account==m.user?.optString("id"))people=result.optJSONArray("producers").objects().filter{it.optString("user_id")!=account&&it.optString("id")!=m.user?.optString("profile_id")&&it.optString("id")!=m.ownProfile.optJSONObject("profile")?.optString("id")}
  }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{loading=false}
 }
 AppPage(title="선물 보내기",onDismissRequest={if(!working)close()},containerColor=Ink){
  LazyColumn(Modifier.fillMaxSize().testTag("owned-gift-send"),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
   item{Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(14.dp)){
    GiftItemImage(item.optString("image"),Modifier.size(72.dp))
    Column{Text(item.optString("gift_name"),fontWeight=FontWeight.Bold,fontSize=18.sp);Text("인벤토리에서 1개 사용",color=Muted,fontSize=13.sp);Text("추가 차감 없이 보낼 수 있어요.",color=Muted,fontSize=12.sp)}
   }}
   item{OutlinedTextField(query,{query=it},label={Text("받는 사람 검색")},singleLine=true,modifier=Modifier.fillMaxWidth().testTag("owned-gift-search"))}
   if(loading)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)}
   error?.let{item{Text(it,color=Pink);TextButton(onClick={retry++}){Text("다시 불러오기")}}}
   if(!loading&&error==null&&people.isEmpty())item{Text("검색된 회원이 없어요.",color=Muted)}
   items(people,key={it.optString("id")}){p->Row(Modifier.fillMaxWidth().clickable(enabled=!working){person=p;requestId=UUID.randomUUID().toString();sendError=null}.testTag("owned-gift-recipient-${p.optString("id")}").padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
    Avatar(p.optString("name"),p,48);Text(p.optString("display_name",p.optString("name")),Modifier.weight(1f).padding(start=12.dp),fontSize=14.sp);Text("선택",color=Aqua,fontSize=13.sp)
   }}
  }
 }
 person?.let{p->AlertDialog(onDismissRequest={if(!working)person=null},title={Text("선물을 보낼까요?")},text={Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("${p.optString("display_name",p.optString("name"))}님에게 ${item.optString("gift_name")} 1개를 보내요. 보낸 선물은 취소할 수 없어요.")
  sendError?.let{Text(it,color=Pink)}
 }},dismissButton={TextButton(onClick={person=null},enabled=!working){Text("취소")}},confirmButton={TextButton(enabled=!working,modifier=Modifier.testTag("owned-gift-send-confirm"),onClick={
  if(!working&&account==m.user?.optString("id")){
   working=true;sendError=null
   scope.launch{try{
    val result=m.api.call("/api/me/gift-inventory/${item.optString("id")}/send","POST",payload("profile_id" to p.optString("id"),"request_id" to requestId))
    if(account==m.user?.optString("id"))sent(result)
   }catch(e:Exception){if(e is CancellationException)throw e;sendError=e.message}finally{working=false}}
  }
 }){Text(if(working)"보내는 중…" else "1개 보내기")}})}
}
