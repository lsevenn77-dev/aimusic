package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

@Composable internal fun RecipientOwnedGifts(m:MusicModel,recipientId:String?,recipient:String,fromSong:Boolean,busy:Boolean,setBusy:(Boolean)->Unit,sent:()->Unit){
 val account=m.user?.optString("id");val scope=rememberCoroutineScope()
 var inventory by remember(account,recipientId){mutableStateOf<List<JSONObject>?>(null)}
 var error by remember(account,recipientId){mutableStateOf<String?>(null)}
 var selected by remember(account,recipientId){mutableStateOf<JSONObject?>(null)}
 var requestId by remember{mutableStateOf(UUID.randomUUID().toString())}
 var retry by remember{mutableIntStateOf(0)}
 var success by remember{mutableStateOf<String?>(null)}
 LaunchedEffect(account,recipientId,retry){try{
  val result=m.api.call("/api/me/gift-inventory",fresh=true)
  if(account==m.user?.optString("id")){inventory=result.optJSONArray("items").objects();error=null}
 }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 Column(Modifier.fillMaxWidth().testTag("recipient-owned-gifts"),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("보유 아이템",fontSize=19.sp,fontWeight=FontWeight.Bold)
  if(inventory==null&&error==null)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)
  if(inventory?.isEmpty()==true)Text("보유한 선물 아이템이 없어요.",fontSize=13.sp,color=Muted)
  error?.let{Text(it,color=Pink,fontSize=13.sp);if(selected==null)TextButton(onClick={retry++},enabled=!busy){Text("다시 불러오기")}}
  success?.let{Text(it,color=Aqua,fontSize=13.sp,modifier=Modifier.testTag("recipient-owned-success"))}
  val groups=inventory.orEmpty().groupBy{it.optString("gift_type")+":"+it.optBoolean("available",true)}.values.toList()
  groups.chunked(3).forEach{row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
   row.forEach{group->val item=group.first();val available=item.optBoolean("available",true)
    Surface(onClick={selected=item;requestId=UUID.randomUUID().toString();error=null},enabled=!busy&&available&&!recipientId.isNullOrBlank(),color=Raised,shape=RoundedCornerShape(12.dp),modifier=Modifier.weight(1f).testTag("recipient-owned-${item.optString("gift_type")}")){
     Column(Modifier.padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally){
      GiftItemImage(item.optString("image"),Modifier.fillMaxWidth().aspectRatio(1f))
      Text(item.optString("gift_name"),fontSize=12.sp,lineHeight=17.sp,maxLines=2,overflow=TextOverflow.Ellipsis,textAlign=TextAlign.Center,modifier=Modifier.heightIn(min=42.dp).wrapContentHeight())
      Text("${group.size}개 보유",color=Aqua,fontSize=12.sp,modifier=Modifier.testTag("recipient-owned-count-${item.optString("gift_type")}"))
      Text(if(available)"선물하기" else "사용 보류",color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=4.dp))
     }
    }
   };repeat(3-row.size){Spacer(Modifier.weight(1f))}
  }}
  if(fromSong&&groups.isNotEmpty())Text("보유 아이템은 ${recipient}님의 프로필에 선물로 전달돼요.",fontSize=12.sp,color=Muted)
 }
 selected?.let{item->AlertDialog(onDismissRequest={if(!busy)selected=null},title={Text("${item.optString("gift_name")} 보내기")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("${recipient}님에게 보유한 ${item.optString("gift_name")} 1개를 보내요. 실버·골드는 추가로 사용하지 않아요.")
  if(fromSong)Text("이 아이템은 받는 사람의 프로필에 전달돼요.",fontSize=13.sp)
  Text("보낸 선물은 취소할 수 없어요.",fontSize=12.sp,color=Muted)
  error?.let{Text(it,color=Pink,fontSize=13.sp)}
 }},dismissButton={TextButton(onClick={selected=null},enabled=!busy){Text("취소")}},confirmButton={TextButton(enabled=!busy,modifier=Modifier.testTag("recipient-owned-send-confirm"),onClick={
  if(!busy&&account==m.user?.optString("id")&&!recipientId.isNullOrBlank()){
   setBusy(true);error=null
   scope.launch{try{
    val result=m.api.call("/api/me/gift-inventory/${item.optString("id")}/send","POST",payload("profile_id" to recipientId,"request_id" to requestId))
    if(account==m.user?.optString("id")){inventory=result.optJSONArray("items").objects();selected=null;success="${item.optString("gift_name")} 1개를 보냈어요.";sent()}
   }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{setBusy(false)}}
  }
 }){Text(if(busy)"보내는 중…" else "보유 아이템 1개 보내기")}})}
}
