@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CardGiftcard
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

@Composable internal fun GiftEntry(m:MusicModel,song:Song){
 if(song.raw.optString("user_id")==m.user?.optString("id"))return
 OutlinedButton(onClick={m.openGifts(song)},modifier=Modifier.fillMaxWidth().padding(vertical=8.dp)){
  Icon(Icons.Rounded.CardGiftcard,null,tint=Pink);Text("별 · 골드 선물로 응원하기",Modifier.padding(start=8.dp))
 }
}

@Composable internal fun GiftSheet(m:MusicModel){
 val target=m.giftTarget
 val scope=rememberCoroutineScope()
 var wallet by remember(target?.id){mutableStateOf<JSONObject?>(null)}
 var ranking by remember(target?.id){mutableStateOf<JSONObject?>(null)}
 var selected by remember(target?.id){mutableStateOf("star")}
 var requestId by remember(target?.id){mutableStateOf(UUID.randomUUID().toString())}
 var working by remember{mutableStateOf(false)}
 var loading by remember{mutableStateOf(true)}
 var error by remember{mutableStateOf<String?>(null)}
 var success by remember{mutableStateOf<String?>(null)}
 var confirm by remember{mutableStateOf(false)}
 suspend fun refresh(){
  wallet=m.api.call("/api/gold")
  if(target!=null)ranking=m.api.call("/api/tracks/${target.id}/gifts")
 }
 LaunchedEffect(target?.id,m.user?.optString("id")){
  if(m.user==null){m.showGifts=false;return@LaunchedEffect}
  try{refresh()}catch(e:Exception){error=e.message}finally{loading=false}
 }
 val free=wallet?.optJSONObject("free")
 val catalog=listOfNotNull(free?.optJSONObject("gift"))+wallet?.optJSONArray("gifts").objects()
 val choice=catalog.find{it.optString("id")==selected}
 val isFree=selected=="star"
 val balance=if(isFree)free?.optInt("balance")?:0 else wallet?.optInt("balance")?:0
 val cost=if(isFree)1 else choice?.optInt("gold")?:0
 val suffix=if(isFree)"★" else "G"
 ModalBottomSheet(onDismissRequest={if(!working)m.showGifts=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth().heightIn(max=620.dp).testTag("gift-list"),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
   item{Text(if(target==null)"내 선물함" else "음악에 응원 보내기",fontSize=25.sp);target?.let{Text("${it.producer} · ${it.title}",color=Muted,modifier=Modifier.padding(top=8.dp))}}
   if(loading)item{LinearProgressIndicator(Modifier.fillMaxWidth())}
   error?.let{message->item{Text(message,color=Pink);if(wallet==null)TextButton(onClick={scope.launch{loading=true;error=null;try{refresh()}catch(e:Exception){error=e.message}finally{loading=false}}}){Text("다시 불러오기")}}}
   success?.let{item{Text(it,color=Aqua,fontSize=17.sp)}}
   if(wallet!=null){
    item{Text("보유 응원별 ★ ${free?.optInt("balance")?:0}    골드 ${wallet?.optInt("balance")} G",color=Aqua);Text("별은 무료 응원 선물이에요. 현금 가치·골드 전환·수익 정산이 없어요.",fontSize=14.sp,color=Muted,modifier=Modifier.padding(top=8.dp))}
    item{Surface(onClick={m.showGifts=false;m.showRewards=true},color=Raised,shape=RoundedCornerShape(16.dp)){Text("오늘의 응원별 · 무료 보상 받기",color=Aqua,modifier=Modifier.fillMaxWidth().padding(18.dp))}}
    item{Text("선물 고르기",fontSize=19.sp);Text("★ 1 = 1 G = 응원 순위 1점 · 1 G = 10원",fontSize=13.sp,color=Muted)}
    items(catalog.chunked(4)){row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(7.dp)){
     row.forEach{gift->val gid=gift.optString("id");Surface(onClick={if(!working){selected=gid;requestId=UUID.randomUUID().toString();success=null;error=null}},modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp),color=if(selected==gid)Stroke else Ink,border=BorderStroke(1.dp,if(selected==gid)Pink else Stroke)){
      Column(Modifier.padding(vertical=9.dp),horizontalAlignment=Alignment.CenterHorizontally){val path=gift.optString("image");if(path.startsWith("/assets/gifts/"))AsyncImage(Endpoint.url(path),null,Modifier.size(56.dp));Text(gift.optString("name"),fontSize=14.sp);Text(if(gid=="star")"★ 1" else "${gift.optInt("gold")} G",color=Aqua,fontSize=13.sp)}
     }};repeat(4-row.size){Spacer(Modifier.weight(1f))}
    }}
    item{
     if(target!=null){
      Text(if(balance>=cost)"보낸 뒤 ${balance-cost} $suffix" else if(isFree)"오늘의 보상을 받아 응원별을 모아주세요." else "보유 골드가 부족해요.",color=Muted,fontSize=14.sp)
      Button(onClick={confirm=true},enabled=!working&&choice!=null&&balance>=cost,modifier=Modifier.fillMaxWidth().padding(top=10.dp)){Text(if(working)"보내는 중…" else "${choice?.optString("name")?:"선물"} $cost $suffix 보내기")}
     }else Text("곡의 재생 화면이나 상세 화면에서 선물할 수 있어요.",color=Aqua)
     Button(onClick={m.showGifts=false;m.showBilling=true},modifier=Modifier.fillMaxWidth()){Text("Google Play로 골드 충전")}
     Text("받은 별은 누적되며 매일 0시(한국 시간)에 보상 조건이 갱신돼요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=10.dp))
    }
   }
   ranking?.let{data->
    item{HorizontalDivider(color=Stroke);Text("이 곡의 응원 순위",fontSize=19.sp,modifier=Modifier.padding(top=14.dp))}
    items(data.optJSONArray("ranking").objects()){r->Row(Modifier.fillMaxWidth()){Text("${r.optInt("rank")}  ${r.optString("name")}",Modifier.weight(1f));Text("${r.optInt("score")}점 · ${r.optInt("stars")}★ / ${r.optInt("gold")}G",color=Aqua,fontSize=13.sp)}}
    if(data.optJSONArray("ranking").objects().isEmpty())item{Text("첫 응원을 보내보세요.",color=Muted)}
   }
  }
 }
 if(confirm&&choice!=null&&target!=null)AlertDialog(onDismissRequest={if(!working)confirm=false},title={Text("${choice.optString("name")} 선물하기")},text={Text("${target.producer}님에게 $cost $suffix 선물을 보낼까요?\n보낸 뒤 직접 취소할 수 없어요.")},dismissButton={TextButton(onClick={confirm=false},enabled=!working){Text("취소")}},confirmButton={TextButton(enabled=!working,onClick={scope.launch{
  working=true;error=null
  try{val result=m.api.call("/api/tracks/${target.id}/gifts","POST",payload("gift_type" to selected,"request_id" to requestId));success="${choice.optString("name")} 선물을 보냈어요";confirm=false
   wallet=JSONObject(wallet.toString()).apply{if(isFree)put("free",JSONObject(free.toString()).put("balance",result.optInt("free_balance")))else put("balance",result.optInt("balance"))}
   requestId=UUID.randomUUID().toString();try{ranking=m.api.call("/api/tracks/${target.id}/gifts")}catch(_:Exception){}
  }catch(e:Exception){error=e.message;confirm=false}finally{working=false}
 }}){Text(if(working)"보내는 중…" else "$cost $suffix 보내기")}})
}
