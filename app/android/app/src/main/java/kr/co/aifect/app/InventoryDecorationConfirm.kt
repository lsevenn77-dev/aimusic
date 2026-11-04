package kr.co.aifect.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import org.json.JSONObject

/** Stored stock and an activated usage period are distinct records in the existing API. */
internal fun inventoryDecorationStatus(item:JSONObject,at:Long=System.currentTimeMillis()/1000):String{
 val product=item.optJSONObject("product")?:item
 val stored=item.optBoolean("stored")||item.optString("source")=="decoration_stock"
 val available=item.optBoolean("available")
 if(stored)return if(available)"보관 중"else "사용 보류"
 if(!available)return if(item.optLong("expires_at") in 1L..at)"기간 만료"else "사용 불가"
 if(product.optString("kind")=="PROFILE_FRAME")return if(item.optBoolean("equipped"))"장착 중"else "장착"
 return if(item.optString("source")=="decoration"||item.optBoolean("active")||item.optBoolean("applied")||item.optBoolean("equipped"))"적용 중"else "사용 가능"
}

@Composable internal fun InventoryDecorationConfirm(item:JSONObject,busy:Boolean,error:String?,dismiss:()->Unit,use:()->Unit){
 val product=item.optJSONObject("product")?:item
 val frame=product.optString("kind")=="PROFILE_FRAME"
 val period=mapOf("P7D" to "7일","P1M" to "1개월","P3M" to "3개월")[item.optString("period_code")]
 val available=item.optBoolean("available")
 Dialog(onDismissRequest={if(!busy)dismiss()},properties=DialogProperties(usePlatformDefaultWidth=false,dismissOnBackPress=!busy,dismissOnClickOutside=!busy)){
  Surface(color=Ink,shape=RoundedCornerShape(20.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.padding(horizontal=22.dp).widthIn(max=360.dp).fillMaxWidth().testTag("inventory-use-dialog")){
   Column(Modifier.referenceBackdrop().verticalScroll(rememberScrollState()).padding(22.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
    Text("아이템 사용",fontSize=19.sp,lineHeight=26.sp,fontWeight=FontWeight.Bold)
    Box(Modifier.fillMaxWidth().height(if(frame)156.dp else 140.dp).clip(RoundedCornerShape(14.dp)).background(Panel),contentAlignment=Alignment.Center){
     AsyncImage(decorationImage(product),product.optString("name"),Modifier.fillMaxSize().padding(if(frame)12.dp else 0.dp).testTag("inventory-use-image"),contentScale=if(frame)ContentScale.Fit else ContentScale.Crop)
    }
    Column(verticalArrangement=Arrangement.spacedBy(6.dp)){
     Text(product.optString("name","아이템"),fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.testTag("inventory-use-name"))
     period?.let{Text("$it · 사용 시작부터 적용",fontSize=12.sp,lineHeight=18.sp,color=Aqua,modifier=Modifier.testTag("inventory-use-period"))}
     Text(if(frame)"프로필에 액자를 장착합니다."else "사용 기간을 시작한 뒤 토킹룸 설정에서 배경을 선택할 수 있어요.",fontSize=13.sp,lineHeight=20.sp,color=SoftText)
     Text("보관 아이템 1개를 사용해요. 같은 아이템의 남은 기간은 연장돼요.",fontSize=11.sp,lineHeight=17.sp,color=Muted)
     if(!available)Text(item.optString("reason").ifBlank{"사용 상태를 다시 확인해주세요."},fontSize=12.sp,lineHeight=18.sp,color=Pink)
    }
    error?.takeIf{it.isNotBlank()}?.let{Text(it,fontSize=12.sp,lineHeight=18.sp,color=Pink,modifier=Modifier.testTag("inventory-use-error").semantics{liveRegion=LiveRegionMode.Polite})}
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
     OutlinedButton(onClick=dismiss,enabled=!busy,shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.weight(1f).heightIn(min=44.dp).testTag("inventory-use-cancel")){Text("취소",fontSize=13.sp,lineHeight=18.sp)}
     BrandButton(onClick=use,enabled=available&&!busy,modifier=Modifier.weight(1f).heightIn(min=44.dp).testTag("inventory-use-confirm"),contentPadding=PaddingValues(horizontal=10.dp,vertical=11.dp)){
      if(busy)CircularProgressIndicator(Modifier.size(16.dp).padding(end=3.dp),strokeWidth=2.dp,color=Ink)
      Text(if(busy)"적용 중…"else "사용 시작",fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold)
     }
    }
   }
  }
 }
}
