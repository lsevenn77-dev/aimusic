@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.text.DecimalFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal fun activityDate(seconds:Long):String=SimpleDateFormat("yyyy.MM.dd HH:mm",Locale.KOREA).apply{timeZone=TimeZone.getTimeZone("Asia/Seoul")}.format(Date(seconds*1000))

@Composable internal fun NotificationEntry(m:MusicModel){
 Surface(onClick={if(m.authenticated())m.showNotifications=true},shape=RoundedCornerShape(14.dp),color=Raised){
  Row(Modifier.fillMaxWidth().padding(14.dp),verticalAlignment=Alignment.CenterVertically){
   Icon(Icons.Rounded.NotificationsNone,null,tint=Aqua)
   Column(Modifier.weight(1f).padding(horizontal=10.dp)){Text("알림 기록");Text("커버·듀엣 참여와 받은 선물",color=Muted,fontSize=12.sp)}
   if(m.unreadActivities>0)Badge{Text(if(m.unreadActivities>99)"99+" else "${m.unreadActivities}")}
   Icon(Icons.Rounded.ChevronRight,null,tint=Muted)
  }
 }
}

@Composable internal fun ActivitySheet(m:MusicModel){
 val account=m.user?.optString("id")
 val scope=rememberCoroutineScope()
 var filter by remember(account){mutableStateOf("all")}
 var entries by remember(account,filter){mutableStateOf<List<JSONObject>>(emptyList())}
 var next by remember(account,filter){mutableStateOf<String?>(null)}
 var working by remember(account,filter){mutableStateOf(false)}
 var error by remember(account,filter){mutableStateOf<String?>(null)}
 var revision by remember{mutableIntStateOf(0)}
 fun active()=m.user?.optString("id")==account&&m.showNotifications
 suspend fun load(older:Boolean=false){
  working=true;error=null
  try{
   val d=m.api.call("/api/notifications?filter=$filter"+(if(older&&next!=null)"&before="+URLEncoder.encode(next,"UTF-8") else ""),fresh=true)
   if(!active())return
   entries=(if(older)entries+d.optJSONArray("items").objects()else d.optJSONArray("items").objects()).distinctBy{it.optString("id")}
   next=d.optString("next").takeIf{it.isNotBlank()&&it!="null"};m.unreadActivities=d.optInt("unread")
  }catch(e:Exception){if(e is CancellationException)throw e;if(active())error=e.message}finally{working=false}
 }
 suspend fun mark(ids:List<String>){
  for(chunk in ids.chunked(50)){if(!active())return;m.api.call("/api/notifications/read","POST",payload("ids" to JSONArray(chunk)))}
  if(active()){entries=entries.map{if(it.optString("id") in ids)JSONObject(it.toString()).put("read_at",System.currentTimeMillis()/1000)else it};m.refreshActivitySummary()}
 }
 LaunchedEffect(account,filter,revision){if(account!=null)load()}
 AppPage(title="알림",onDismissRequest={m.showNotifications=false},containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth().fillMaxHeight().testTag("activity-list"),contentPadding=PaddingValues(18.dp,0.dp,18.dp,28.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   item{Text("알림 기록",fontSize=25.sp);Text("한국 시간 · 날짜와 함께 모아보는 참여와 선물",fontSize=12.sp,color=Muted)
    Chips(listOf("전체","커버 · 듀엣","받은 선물"),when(filter){"gifts"->"받은 선물";"participation"->"커버 · 듀엣";else->"전체"}){filter=when(it){"받은 선물"->"gifts";"커버 · 듀엣"->"participation";else->"all"}}
    Row{TextButton(enabled=!working,onClick={revision++}){Text("새로고침")};TextButton(enabled=!working&&entries.any{it.optLong("read_at")==0L},onClick={scope.launch{working=true;try{mark(entries.filter{it.optLong("read_at")==0L}.map{it.optString("id")})}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{working=false}}}){Text("이 목록 읽음")}}
    if(working)LinearProgressIndicator(Modifier.fillMaxWidth());error?.let{Text(it,color=Pink)}
   }
   items(entries,key={it.optString("id")}){n->
    val gift=n.optString("kind") in listOf("gift","person_gift")
    Column(Modifier.fillMaxWidth().clipActivity().padding(16.dp)){
     Row(verticalAlignment=Alignment.CenterVertically){
      Avatar(n.optString("actor_name"),payload("id" to n.optString("actor_profile_id"),"image_version" to n.optString("actor_image_version").takeUnless{it=="null"}.orEmpty()),36)
      Column(Modifier.weight(1f).padding(start=10.dp)){Text(n.optString("actor_name"));Text(activityDate(n.optLong("created")),fontSize=11.sp,color=Muted)}
      if(n.optLong("read_at")==0L)Text("NEW",color=Pink,fontSize=10.sp)
     }
     Text(if(gift)"${n.optString("gift_name").replace("은화","실버")} ${n.optInt("quantity",1)}개를 보냈어요." else if(n.optString("kind")=="duet")"내 듀엣에 참여했어요." else "내 곡으로 커버를 공개했어요.",modifier=Modifier.padding(top=12.dp))
     Text(n.optString("source_title").ifBlank{"나에게 보낸 선물"},fontSize=13.sp,color=Muted)
     if(gift)Text("${n.optInt("amount")} ${if(n.optString("currency")=="gold")"G" else "S"}",color=Aqua,modifier=Modifier.padding(top=6.dp))
     Row{
      if(n.optInt("available")==1)TextButton(enabled=!working,onClick={scope.launch{working=true;try{mark(listOf(n.optString("id")));if(active()){if(n.optString("kind")=="person_gift"){m.showNotifications=false;m.openProfile(n.optString("target"))}else{val song=Song(m.api.call("/api/tracks/${n.optString("target")}",fresh=true).getJSONObject("track"));if(active()){m.showNotifications=false;m.openSong(song)}}}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{working=false}}}){Text(if(gift)"선물 받은 곳 보기" else "참여곡 듣기")}
      if(n.optLong("read_at")==0L)TextButton(enabled=!working,onClick={scope.launch{working=true;try{mark(listOf(n.optString("id")))}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{working=false}}}){Text("읽음")}
     }
    }
   }
   if(entries.isEmpty()&&!working&&error==null)item{Empty("아직 도착한 알림이 없어요","내 곡에 참여하거나 선물을 보내면 이곳에 표시돼요.",Icons.Rounded.NotificationsNone)}
   if(next!=null)item{OutlinedButton(onClick={scope.launch{load(true)}},enabled=!working,modifier=Modifier.fillMaxWidth()){Text("이전 알림 더 보기")}}
  }
 }
}
private fun Modifier.clipActivity()=this.background(Panel,RoundedCornerShape(16.dp)).border(1.dp,Stroke,RoundedCornerShape(16.dp))

@Composable internal fun GiftHistorySheet(wallet:JSONObject?,dismiss:()->Unit){
 SentGiftHistoryPage(wallet,null,dismiss)
}

/** Optional model enables real receipt destinations; the legacy call remains read-only compatible. */
@Composable internal fun GiftHistorySheet(wallet:JSONObject?,m:MusicModel,dismiss:()->Unit){SentGiftHistoryPage(wallet,m,dismiss)}

private fun JSONObject.receiptText(key:String)=optString(key).takeUnless{it.isBlank()||it=="null"}
private fun receiptNumber(value:Long)=DecimalFormat("#,##0").format(value)

/** Resolve actual catalog assets, never infer a gift type from the amount spent. */
private fun sentReceiptCatalog(wallet:JSONObject?,receipt:JSONObject,unit:String):JSONObject? {
 val catalog=if(unit=="G")wallet?.optJSONArray("gifts").objects()
  else wallet?.optJSONArray("silver_gifts").objects()+listOfNotNull(wallet?.optJSONObject("free")?.optJSONObject("gift"))
 val type=receipt.receiptText("gift_type")
 if(type!=null){
  catalog.firstOrNull{it.receiptText("id")==type}?.let{return it}
  // Retired note remains a recognized server gift, outside the current storefront catalog.
  return if(type=="note"&&unit=="G")JSONObject().put("name","음표").put("image","/assets/gifts/note.webp")else null
 }
 val name=receipt.receiptText("gift_name")?:return null
 return catalog.singleOrNull{it.receiptText("name")==name}
}

@Composable private fun SentGiftHistoryPage(wallet:JSONObject?,m:MusicModel?,dismiss:()->Unit){
 val scope=rememberCoroutineScope()
 var filter by remember{mutableStateOf("all")}
 var opening by remember{mutableStateOf<String?>(null)}
 var error by remember{mutableStateOf<String?>(null)}
 val receipts=(wallet?.optJSONArray("sent").objects().map{it to "G"}+wallet?.optJSONArray("free_sent").objects().map{it to "S"}).sortedByDescending{it.first.optLong("created")}
 val visible=receipts.filter{filter=="all"||it.second==if(filter=="gold")"G"else "S"}
 fun open(receipt:JSONObject,key:String){
  if(m==null||opening!=null)return
  val trackId=receipt.receiptText("track_id")?.takeIf(CurrentNavigation::safeID)
  val recipientId=receipt.receiptText("recipient_profile_id")?.takeIf(CurrentNavigation::safeID)
  if(trackId!=null){
   val owner=m.user?.optString("id")
   opening=key;error=null
   scope.launch{
    try{
     val response=m.api.call("/api/tracks/$trackId",fresh=true)
     if(owner==m.user?.optString("id")){val track=response.optJSONObject("track")?:throw IllegalStateException("선물을 보낸 작품을 찾을 수 없어요.");dismiss();m.openSong(Song(track))}
    }catch(e:Exception){if(e is CancellationException)throw e;error=e.message?:"선물을 보낸 작품을 불러오지 못했어요."}finally{opening=null}
   }
  }else if(recipientId!=null){dismiss();m.openProfile(recipientId)}
 }
 AppPage(title="보낸 선물",onDismissRequest=dismiss,containerColor=Ink){
  LazyColumn(Modifier.fillMaxSize().testTag("sent-gift-history"),contentPadding=PaddingValues(20.dp,4.dp,20.dp,28.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   item{
    Row(Modifier.fillMaxWidth().padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
     Icon(Icons.Rounded.CardGiftcard,null,Modifier.size(22.dp),tint=Pink)
     Text("최근 골드 · 실버 선물",fontSize=14.sp,lineHeight=21.sp,color=SoftText,modifier=Modifier.weight(1f).padding(start=8.dp))
     if(wallet!=null)Text("${receipts.size}건",fontSize=13.sp,lineHeight=20.sp,color=Muted,modifier=Modifier.testTag("sent-gift-count"))
    }
    CurrentTabs(listOf("all" to "전체","gold" to "골드","silver" to "실버"),filter,"sent-gift-filter"){filter=it}
   }
   if(wallet==null)item{LinearProgressIndicator(Modifier.fillMaxWidth().testTag("sent-gift-loading"),color=Aqua,trackColor=Stroke)}
   error?.let{message->item{Text(message,fontSize=13.sp,lineHeight=20.sp,color=Pink,modifier=Modifier.testTag("sent-gift-error"))}}
   items(visible){(g,unit)->
    val key="sent-gift-$unit-${g.receiptText("id")?:"${g.optLong("created")}-${g.receiptText("gift_type")?:"legacy"}"}"
    val gift=sentReceiptCatalog(wallet,g,unit)
    val name=(g.receiptText("gift_name")?:gift?.receiptText("name")?:if(unit=="G")"골드 선물"else "실버 선물").replace("은화","실버")
    val trackId=g.receiptText("track_id")?.takeIf(CurrentNavigation::safeID)
    val recipientId=g.receiptText("recipient_profile_id")?.takeIf(CurrentNavigation::safeID)
    val target=g.receiptText("title")
    val targetLabel=if(trackId!=null)"작품"else "받는 사람"
    val amountKey=if(unit=="G")"gold"else "silver"
    val amount=if(g.has(amountKey)&&!g.isNull(amountKey))"${receiptNumber(g.optLong(amountKey))} $unit"else "— $unit"
    val canOpen=m!=null&&(trackId!=null||recipientId!=null)&&opening==null
    Surface(color=Panel,shape=RoundedCornerShape(15.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag(key).then(if(canOpen)Modifier.clickable(onClickLabel=if(trackId!=null)"선물을 보낸 작품 보기"else "선물 받은 회원 보기"){open(g,key)}else Modifier)){
     Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(11.dp)){
      Row(verticalAlignment=Alignment.CenterVertically){
       Surface(color=Raised,shape=RoundedCornerShape(12.dp)){
        Box(Modifier.size(64.dp).padding(5.dp).testTag("$key-image").semantics{contentDescription="$name 이미지"}){GiftItemImage(gift?.receiptText("image").orEmpty(),Modifier.fillMaxSize())}
       }
       Column(Modifier.weight(1f).padding(start=12.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
        Row(verticalAlignment=Alignment.Top){
         Text(name,fontSize=15.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f).testTag("$key-name"))
         Text("×${receiptNumber(g.optLong("quantity",1))}",fontSize=13.sp,lineHeight=20.sp,color=Pink,modifier=Modifier.padding(start=8.dp).testTag("$key-quantity"))
        }
        Text(target?.let{"$targetLabel · $it"}?:if(trackId!=null)"작품에 보낸 선물"else "개인에게 보낸 선물",fontSize=13.sp,lineHeight=20.sp,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("$key-target"))
       }
       if(canOpen)Icon(Icons.Rounded.ChevronRight,null,Modifier.padding(start=5.dp).size(18.dp),tint=Muted)
      }
      HorizontalDivider(color=Stroke.copy(alpha=.6f))
      Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Top){
       Text(amount,fontSize=15.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,color=if(unit=="G")Pink else Aqua,modifier=Modifier.weight(1f).padding(end=12.dp).testTag("$key-amount"))
       Text(g.optLong("created").takeIf{it>0}?.let(::activityDate)?:"일시 정보 없음",fontSize=13.sp,lineHeight=20.sp,color=Muted,textAlign=TextAlign.End,modifier=Modifier.testTag("$key-time"))
      }
      if(opening==key)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua,trackColor=Stroke)
     }
    }
   }
   if(wallet!=null&&visible.isEmpty())item{Empty(if(filter=="all")"아직 보낸 선물이 없어요."else "아직 보낸 ${if(filter=="gold")"골드"else "실버"} 선물이 없어요.","선물을 보내면 이미지와 함께 이곳에 기록돼요.",Icons.Rounded.CardGiftcard)}
  }
 }
}
