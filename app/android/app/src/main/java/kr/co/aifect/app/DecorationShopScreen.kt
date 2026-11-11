package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
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
import coil.compose.AsyncImage
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

internal fun decorationImage(product:JSONObject):String?=CatalogAssets.decorationImage(product)
@Composable internal fun DecorationShopPanel(m:MusicModel,category:String,balance:Long,working:Boolean,setWorking:(Boolean)->Unit,refreshWallet:suspend ()->Unit){
 val account=m.user?.optString("id");val scope=rememberCoroutineScope()
 var data by remember(account){mutableStateOf<JSONObject?>(null)};var error by remember{mutableStateOf<String?>(null)}
 var retry by remember{mutableIntStateOf(0)};var message by remember{mutableStateOf<String?>(null)}
 var selected by rememberSaveable{mutableStateOf<String?>(null)};var period by rememberSaveable{mutableStateOf("P7D")}
 var request by rememberSaveable{mutableStateOf(UUID.randomUUID().toString())}
 val lifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
 LaunchedEffect(account,retry){lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){
  while(true){
   try{val result=m.api.call("/api/decorations",fresh=true);if(account==m.user?.optString("id")){data=result;error=null}}
   catch(e:Exception){if(e is CancellationException)throw e;error=e.message}
   kotlinx.coroutines.delay(60000L)
  }
 }}
 val products=data?.optJSONArray("products").objects().filter{it.optString("kind")==if(category=="frames")"PROFILE_FRAME" else "TALKING_ROOM_THEME"}
 val choice=data?.optJSONArray("products").objects().find{it.optString("sku")==selected}
 val periods=data?.optJSONObject("periods")?:JSONObject()
 Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(14.dp)){
  if(data==null&&error==null)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)
  error?.let{Text(it,color=Pink);TextButton({retry++}){Text("다시 불러오기")}}
  message?.let{Text(it,color=Aqua,modifier=Modifier.testTag("decoration-purchased"));TextButton({m.showInventory=true}){Text("인벤토리에서 보기")}}
  products.chunked(2).forEach{row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){
   row.forEach{p->Surface(onClick={selected=p.optString("sku");period="P7D";request=UUID.randomUUID().toString();error=null},enabled=!working,color=Panel,shape=RoundedCornerShape(14.dp),modifier=Modifier.weight(1f).testTag("shop-decoration-${p.optString("sku")}")){
    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
     AsyncImage(decorationImage(p),p.optString("name"),Modifier.fillMaxWidth().aspectRatio(1f),contentScale=if(category=="frames")ContentScale.Fit else ContentScale.Crop)
     Text(p.optString("name"),fontSize=14.sp,fontWeight=FontWeight.SemiBold)
     Text("${itemNumber(p.optJSONObject("periodPrices")?.optLong("P7D")?:0)} G · ${periods.optString("P7D","7일")}",fontSize=12.sp,color=Muted)
    }
   }}
   if(row.size==1)Spacer(Modifier.weight(1f))
  }}
  if(data!=null&&products.isEmpty())Text("등록된 상품이 없어요.",color=Muted)
 }
 choice?.let{product->
  val price=product.optJSONObject("periodPrices")?.optLong(period)?:0
  AlertDialog(onDismissRequest={if(!working)selected=null},title={Text(product.optString("name"))},text={Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)){
   AsyncImage(decorationImage(product),product.optString("name"),Modifier.fillMaxWidth().height(180.dp),contentScale=ContentScale.Fit)
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)){listOf("P7D","P1M","P3M").filter{product.optJSONObject("periodPrices")?.has(it)==true}.forEach{key->FilterChip(selected=period==key,onClick={period=key;request=UUID.randomUUID().toString();error=null},enabled=!working,label={Text(periods.optString(key),fontSize=12.sp)},modifier=Modifier.testTag("decoration-period-$key"))}}
   Text("${itemNumber(price)} G",fontSize=22.sp,fontWeight=FontWeight.Bold)
   Text("구매 후 인벤토리에 보관돼요. 사용할 때부터 기간이 시작돼요.",color=Muted,fontSize=13.sp)
   if(balance<price)Text("골드가 부족해요.",color=Pink)
   error?.let{Text(it,color=Pink,fontSize=13.sp)}
  }},dismissButton={TextButton({selected=null},enabled=!working){Text("취소")}},confirmButton={
   if(balance<price)TextButton({selected=null;m.billingInitialTab="gold";m.showBilling=true}){Text("골드 충전")}
   else TextButton(enabled=!working&&price>0,modifier=Modifier.testTag("decoration-buy-confirm"),onClick={if(account==m.user?.optString("id")&&!working){setWorking(true);error=null;scope.launch{try{
    m.api.call("/api/decorations/buy","POST",payload("sku" to selected,"period" to period,"request_id" to request))
    if(account==m.user?.optString("id")){selected=null;message="${product.optString("name")}를 인벤토리에 보관했어요.";refreshWallet()}
   }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{setWorking(false)}}}}){Text(if(working)"구매 중…" else "${itemNumber(price)} G 구매")}
  })
 }
}
