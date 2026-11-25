@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.android.billingclient.api.BillingClient
import kotlinx.coroutines.launch

@Composable fun PlayBillingSheet(m:MusicModel){
 val billing=m.playBilling
 val goldOnly=remember{m.billingInitialTab=="gold"}
 val owner=m.user?.optString("id")
 var canStart by remember(owner){mutableStateOf(false)}
 var playSubscription by remember(owner){mutableStateOf(false)}
 var policyError by remember(owner){mutableStateOf(false)}
 var checking by remember(owner){mutableStateOf(false)}
 val scope=rememberCoroutineScope()
 suspend fun loadPolicy():Boolean {
  canStart=false;playSubscription=false;policyError=false
  if(owner.isNullOrBlank())return false
  return try{
   val summary=m.api.call("/api/account/summary",fresh=true)
   if(m.user?.optString("id")!=owner || summary.optJSONObject("account")?.optString("id")!=owner)return false
   canStart=summary.optBoolean("can_start_subscription")
   playSubscription=summary.optJSONArray("passes").objects().any{
    it.optString("source")=="google_play" && it.optString("state") !in setOf("expired","failed","refunded")
   }
   canStart
  }catch(e:Exception){
   if(e is kotlinx.coroutines.CancellationException)throw e
   if(m.user?.optString("id")==owner)policyError=true
   false
  }
 }
 DisposableEffect(Unit){onDispose{m.billingInitialTab="premium"}}
 LaunchedEffect(owner){billing?.load()}
 LaunchedEffect(owner,m.membership,billing?.message){if(!goldOnly)loadPolicy()}
 AppPage(title=if(goldOnly)"골드 충전" else "이용권·골드",onDismissRequest={m.showBilling=false},containerColor=Panel){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(22.dp)){
   Text(if(goldOnly)"골드 충전" else "Premium · 골드",fontSize=25.sp,fontWeight=FontWeight.Bold)
   Text("Google Play에서 안전하게 구매해요.",color=Muted,modifier=Modifier.padding(top=8.dp))
   if(!goldOnly){
   Text("Premium",fontSize=20.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=24.dp))

   if(policyError)TextButton(onClick={scope.launch{loadPolicy()}}){Text("이용권 정보 다시 불러오기")}
   if(canStart)billing?.products?.filter{it.productType==BillingClient.ProductType.SUBS}?.forEach{product->
    BrandButton(onClick={if(!checking){checking=true;scope.launch{try{if(loadPolicy())billing.buy(product)}finally{checking=false}}}},enabled=!checking && !billing.busy,modifier=Modifier.fillMaxWidth()){Text("${billing.price(product)} / 월 · Premium 구독")}
    Text("매월 자동 갱신되며 Google Play에서 해지할 수 있어요. 최종 가격과 갱신 조건은 구매창에서 확인해주세요.",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=8.dp))
   }
   }
   Text("골드 충전",fontSize=20.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=24.dp))
   Text("좋아하는 음악에 선물을 보낼 때 사용해요. 실버는 무료 보상으로 따로 모을 수 있어요.",color=Muted,modifier=Modifier.padding(vertical=12.dp))
   billing?.products?.filter{it.productType==BillingClient.ProductType.INAPP}?.sortedBy{it.productId.substringAfterLast('_').toIntOrNull()?:0}?.forEach{product->
    OutlinedButton(onClick={billing.buy(product)},enabled=!billing.busy,modifier=Modifier.fillMaxWidth()){Text("${product.productId.substringAfterLast('_')} G");Spacer(Modifier.weight(1f));Text(billing.price(product))}
   }
   billing?.message?.let{Text(it,color=Aqua,modifier=Modifier.padding(vertical=16.dp))}
   if(billing?.busy==true)LinearProgressIndicator(Modifier.fillMaxWidth())
   TextButton(onClick={billing?.load()},enabled=billing?.busy!=true){Text("상품 다시 불러오기")}
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
    OutlinedButton(onClick={billing?.restore()},enabled=billing?.available==true && !billing.busy,modifier=Modifier.weight(1f)){Text("구매 복원")}
    if(playSubscription)TextButton(onClick={billing?.manage()},modifier=Modifier.weight(1f)){Text("구독 관리")}
   }
   Spacer(Modifier.height(20.dp))
  }
 }
}
