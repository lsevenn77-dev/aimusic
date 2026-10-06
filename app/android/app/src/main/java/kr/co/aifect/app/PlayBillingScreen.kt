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

@Composable fun PlayBillingSheet(m:MusicModel){
 val billing=m.playBilling
 LaunchedEffect(m.user?.optString("id")){billing?.load()}
 ModalBottomSheet(onDismissRequest={m.showBilling=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(22.dp)){
   Text("Premium · 골드",fontSize=25.sp,fontWeight=FontWeight.Bold)
   Text("Google Play에서 안전하게 구매해요.",color=Muted,modifier=Modifier.padding(top=8.dp))
   Text("Premium",fontSize=20.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=24.dp))
   Text("광고 없이 AAC 256 감상 · 제작곡 월 20곡 · 플레이리스트 10개",color=Muted,modifier=Modifier.padding(vertical=12.dp))
   billing?.products?.filter{it.productType==BillingClient.ProductType.SUBS}?.forEach{product->
    Button(onClick={billing.buy(product)},enabled=!billing.busy,modifier=Modifier.fillMaxWidth()){Text("${billing.price(product)} / 월 · Premium 구독")}
    Text("매월 자동 갱신되며 Google Play에서 해지할 수 있어요. 최종 가격과 갱신 조건은 구매창에서 확인해주세요.",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=8.dp))
   }
   Text("골드 충전",fontSize=20.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=24.dp))
   Text("좋아하는 음악에 선물을 보낼 때 사용해요. 응원별은 무료 보상으로 따로 모을 수 있어요.",color=Muted,modifier=Modifier.padding(vertical=12.dp))
   billing?.products?.filter{it.productType==BillingClient.ProductType.INAPP}?.sortedBy{it.productId.substringAfterLast('_').toIntOrNull()?:0}?.forEach{product->
    OutlinedButton(onClick={billing.buy(product)},enabled=!billing.busy,modifier=Modifier.fillMaxWidth()){Text("${product.productId.substringAfterLast('_')} G");Spacer(Modifier.weight(1f));Text(billing.price(product))}
   }
   billing?.message?.let{Text(it,color=Aqua,modifier=Modifier.padding(vertical=16.dp))}
   if(billing?.busy==true)LinearProgressIndicator(Modifier.fillMaxWidth())
   TextButton(onClick={billing?.load()},enabled=billing?.busy!=true){Text("상품 다시 불러오기")}
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
    OutlinedButton(onClick={billing?.restore()},enabled=billing?.busy!=true,modifier=Modifier.weight(1f)){Text("구매 복원")}
    TextButton(onClick={billing?.manage()},modifier=Modifier.weight(1f)){Text("구독 관리")}
   }
   Spacer(Modifier.height(20.dp))
  }
 }
}
