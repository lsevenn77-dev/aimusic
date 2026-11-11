@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CardGiftcard
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

@Composable internal fun GiftItemImage(path:String,modifier:Modifier=Modifier){
 var failed by remember(path){mutableStateOf(false)}
 Box(modifier,contentAlignment=Alignment.Center){
  val image=CatalogAssets.url(path)
  if(!failed&&image!=null)AsyncImage(image,null,Modifier.fillMaxSize(),onError={failed=true})
  else Icon(Icons.Rounded.CardGiftcard,null,tint=Muted,modifier=Modifier.size(30.dp))
 }
}

/** Catalog and prices come from the server. A retry preserves the purchase request ID. */
@Composable internal fun ItemShopPage(m:MusicModel){
 val account=m.user?.optString("id")
 val scope=rememberCoroutineScope()
 var wallet by remember(account){mutableStateOf<JSONObject?>(null)}
 var loading by remember{mutableStateOf(true)}
 var error by remember{mutableStateOf<String?>(null)}
 var success by remember{mutableStateOf<String?>(null)}
 var currency by rememberSaveable{mutableStateOf("gold")}
 var category by rememberSaveable{mutableStateOf("gifts")}
 var selected by rememberSaveable{mutableStateOf<String?>(null)}
 var quantity by rememberSaveable{mutableIntStateOf(1)}
 var requestId by rememberSaveable{mutableStateOf(UUID.randomUUID().toString())}
 var working by remember{mutableStateOf(false)}
 var orderError by remember{mutableStateOf<String?>(null)}
 var retry by remember{mutableIntStateOf(0)}
 suspend fun refresh(silent:Boolean=false){
  if(!silent)loading=true
  try{val result=m.api.call("/api/gold",fresh=true);if(account==m.user?.optString("id")){wallet=result;error=null}}
  catch(e:Exception){if(e is CancellationException)throw e;error=e.message;if(!silent)wallet=null}
  finally{if(!silent)loading=false}
 }
 LaunchedEffect(account,retry,m.showBilling){
  if(!m.showBilling){
   refresh()
   // New gifts appear without an app release while this shop stays open.
   while(true){kotlinx.coroutines.delay(60000L);refresh(silent=true)}
  }
 }
 val gold=wallet?.optJSONArray("gifts").objects()
 val silver=wallet?.optJSONArray("silver_gifts").objects()
 val catalog=if(currency=="gold")gold else silver
 val choice=(gold+silver).find{it.optString("id")==selected}
 AppPage(title="상점",onDismissRequest={if(!working)m.showShop=false},containerColor=Ink){
  LazyColumn(Modifier.fillMaxSize().testTag("item-shop"),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
   item{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     Column(Modifier.weight(1f)){Text("내 골드",color=Muted,fontSize=12.sp);Text(wallet?.let{"${itemNumber(it.optLong("balance"))} G"}?:"—",fontSize=22.sp,fontWeight=FontWeight.Bold)}
     FilledTonalButton(onClick={m.billingInitialTab="gold";m.showBilling=true},enabled=!working,modifier=Modifier.testTag("shop-charge")){Text("골드 충전")}
    }
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     Text(wallet?.let{"실버 ${itemNumber(it.optJSONObject("free")?.optLong("balance")?:0)} S"}?:"실버 —",fontSize=13.sp,color=Muted,modifier=Modifier.weight(1f))
     TextButton(onClick={m.showInventory=true},enabled=!working,modifier=Modifier.testTag("shop-inventory")){Text("인벤토리")}
    }
    Text("구매한 아이템은 인벤토리에 보관돼요.",color=Muted,fontSize=13.sp)
   }
   if(loading)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)}
   error?.let{item{Text(it,color=Pink);TextButton(onClick={retry++}){Text("다시 불러오기")}}}
   success?.let{item{Surface(color=Aqua.copy(alpha=.08f),shape=RoundedCornerShape(12.dp)){
    Column(Modifier.fillMaxWidth().padding(12.dp)){Text(it,color=Aqua,fontSize=14.sp,modifier=Modifier.testTag("shop-success"));TextButton(onClick={m.showInventory=true}){Text("인벤토리에서 보기")}}
   }}}
   item{TabRow(selectedTabIndex=listOf("gifts","frames","themes").indexOf(category),containerColor=Ink,contentColor=Aqua){
    listOf("gifts" to "선물","frames" to "액자","themes" to "토크룸 배경").forEach{(key,label)->Tab(selected=category==key,onClick={category=key},enabled=!working,text={Text(label,fontSize=13.sp,maxLines=1)},modifier=Modifier.testTag("shop-category-$key"))}
   }}
   if(category=="gifts"){
   item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
    listOf("gold" to "골드","silver" to "실버").forEach{(key,label)->FilterChip(selected=currency==key,onClick={currency=key},enabled=!working,label={Text(label)},modifier=Modifier.testTag("shop-tab-$key"))}
   }}
   items(catalog.chunked(3)){row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
    row.forEach{gift->Surface(onClick={selected=gift.optString("id");quantity=1;requestId=UUID.randomUUID().toString();orderError=null},enabled=!working&&!loading,color=Panel,shape=RoundedCornerShape(14.dp),modifier=Modifier.weight(1f).testTag("shop-item-${gift.optString("id")}")){
     Column(Modifier.padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally){
      GiftItemImage(gift.optString("image"),Modifier.fillMaxWidth().aspectRatio(1f))
      Text(gift.optString("name"),fontSize=12.sp,lineHeight=18.sp,maxLines=2,overflow=TextOverflow.Ellipsis,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth().heightIn(min=46.dp).wrapContentHeight())
      Text(if(currency=="gold")"${itemNumber(gift.optLong("gold"))} G" else "${itemNumber(gift.optLong("silver"))} S",fontSize=12.sp,color=if(currency=="gold")Pink else Aqua)
     }
    }}
    repeat(3-row.size){Spacer(Modifier.weight(1f))}
   }}
   }else item{DecorationShopPanel(m,category,wallet?.optLong("balance")?:0,working,{working=it}){refresh()}}
  }
 }
 if(choice!=null){
  val isSilver=choice.optBoolean("free")
  val unit=choice.optLong(if(isSilver)"silver" else "gold")
  val suffix=if(isSilver)"S" else "G"
  val balance=if(isSilver)wallet?.optJSONObject("free")?.optLong("balance")?:0 else wallet?.optLong("balance")?:0
  val total=unit*quantity
  AlertDialog(onDismissRequest={if(!working)selected=null},title={Text(choice.optString("name"))},text={
   Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp),horizontalAlignment=Alignment.CenterHorizontally){
    GiftItemImage(choice.optString("image"),Modifier.size(96.dp))
    Text("1개 · ${itemNumber(unit)} $suffix",color=Muted,fontSize=13.sp)
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
     IconButton(onClick={quantity--;requestId=UUID.randomUUID().toString();orderError=null},enabled=!working&&quantity>1,modifier=Modifier.testTag("shop-quantity-less")){Text("−",fontSize=24.sp)}
     Text("${quantity}개",fontWeight=FontWeight.Bold,modifier=Modifier.testTag("shop-quantity"))
     IconButton(onClick={quantity++;requestId=UUID.randomUUID().toString();orderError=null},enabled=!working&&quantity<100,modifier=Modifier.testTag("shop-quantity-more")){Text("+",fontSize=24.sp)}
    }
    Text("총 ${itemNumber(total)} $suffix",fontWeight=FontWeight.Bold,fontSize=20.sp)
    Text(if(balance>=total)"구매 후 ${itemNumber(balance-total)} $suffix" else if(isSilver)"실버가 부족해요." else "골드가 부족해요.",color=if(balance>=total)Muted else Pink,fontSize=13.sp)
    Text("구매하면 인벤토리에 보관돼요.",fontSize=12.sp,color=Muted)
    orderError?.let{Text(it,color=Pink,fontSize=13.sp,modifier=Modifier.testTag("shop-order-error"))}
   }
  },dismissButton={TextButton(onClick={selected=null},enabled=!working){Text("취소")}},confirmButton={
   if(balance<total&&!isSilver)TextButton(onClick={selected=null;m.billingInitialTab="gold";m.showBilling=true},modifier=Modifier.testTag("shop-order-charge")){Text("골드 충전")}
   else TextButton(enabled=!working&&wallet!=null&&unit>0&&quantity in 1..100&&balance>=total,modifier=Modifier.testTag("shop-buy-confirm"),onClick={
    if(!working&&account==m.user?.optString("id")){
     working=true;orderError=null
     scope.launch{try{
      m.api.call("/api/me/gift-inventory/buy","POST",payload("gift_type" to selected,"quantity" to quantity,"request_id" to requestId))
      if(account==m.user?.optString("id")){success="${choice.optString("name")} ${quantity}개를 구매했어요.";selected=null;refresh()}
     }catch(e:Exception){if(e is CancellationException)throw e;orderError=e.message}
     finally{working=false}}
    }
   }){Text(if(working)"구매 중…" else "${itemNumber(total)} $suffix 구매")}
  })
 }
}
