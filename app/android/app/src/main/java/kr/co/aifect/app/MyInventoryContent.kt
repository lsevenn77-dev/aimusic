package kr.co.aifect.app

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import java.text.DecimalFormat

private fun inventoryAmount(value:Number)=DecimalFormat("#,##0.#####").format(value)
private fun JSONObject.presentAmount(key:String):String?=
 if(has(key)&&!isNull(key))optDouble(key,Double.NaN).takeIf{it.isFinite()}?.let(::inventoryAmount)else null

/** Private wallet and unused gift units are fetched only for the signed-in account. */
@Composable internal fun MyInventoryContent(m:MusicModel){
 val signedIn=m.user!=null
 val wallet=currentRead(m,"/api/gold",signedIn)
 val inventory=currentRead(m,"/api/me/gift-inventory",signedIn)
 val profile=(m.ownDashboard?.optJSONObject("profile")?:m.ownProfile.optJSONObject("profile"))
 val pid=profile?.optString("id").orEmpty().takeUnless{it=="null"}.orEmpty()
 val receivedEnabled=signedIn&&CurrentNavigation.safeID(pid)
 val received=currentRead(m,"/api/producers/$pid/gifts",receivedEnabled)
 var history by remember(m.user?.optString("id")){mutableStateOf(false)}
 var ranking by remember(pid){mutableStateOf(false)}
 LaunchedEffect(m.showInventory,m.showShop,m.showBilling,m.showDiamonds,m.showRewards){
  if(!m.showInventory&&!m.showShop&&!m.showBilling&&!m.showDiamonds&&!m.showRewards&&wallet.data!=null){wallet.retry();inventory.retry();received.retry()}
 }
 Column(Modifier.fillMaxWidth().testTag("my-inventory"),verticalArrangement=Arrangement.spacedBy(14.dp)){
  if(!signedIn){
   Text("로그인하고 보유한 재화와 아이템을 확인하세요.",fontSize=13.sp,color=Muted)
   BrandButton({m.showLogin=true}){Text("로그인")}
  }else{
   if(wallet.loading||inventory.loading||(receivedEnabled&&received.loading))LinearProgressIndicator(Modifier.fillMaxWidth().testTag("my-inventory-loading"),color=Aqua,trackColor=Stroke)
   listOf("재화" to wallet,"보유 선물" to inventory).plus(if(receivedEnabled)listOf("받은 선물" to received)else emptyList()).forEach{(label,source)->
    source.error?.let{message->Column{
     Text("$label · $message",fontSize=12.sp,lineHeight=18.sp,color=Muted)
     TextButton(source::retry){Text("$label 다시 불러오기",fontSize=12.sp)}
    }}
   }
   Text("내 재화",fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
   BoxWithConstraints(Modifier.fillMaxWidth()){
    val stacked=maxWidth<300.dp||LocalDensity.current.fontScale>1.2f
    if(stacked)Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
     InventoryBalanceCard("골드",wallet.data?.presentAmount("balance"),"G","충전",Icons.Rounded.AccountBalanceWallet,Pink,Modifier.fillMaxWidth().testTag("inventory-gold"),true){m.billingInitialTab="gold";m.showBilling=true}
     InventoryBalanceCard("실버",wallet.data?.optJSONObject("free")?.presentAmount("balance"),"S","실버 받기",Icons.Rounded.Stars,Violet,Modifier.fillMaxWidth().testTag("inventory-silver"),true){m.showRewards=true}
     InventoryBalanceCard("다이아",wallet.data?.optJSONObject("diamonds")?.presentAmount("balance"),"◇","정산 내역",Icons.Rounded.Diamond,Aqua,Modifier.fillMaxWidth().testTag("inventory-diamonds"),true){m.showDiamonds=true}
    }else Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     InventoryBalanceCard("골드",wallet.data?.presentAmount("balance"),"G","충전",Icons.Rounded.AccountBalanceWallet,Pink,Modifier.weight(1f).testTag("inventory-gold")){m.billingInitialTab="gold";m.showBilling=true}
     InventoryBalanceCard("실버",wallet.data?.optJSONObject("free")?.presentAmount("balance"),"S","실버 받기",Icons.Rounded.Stars,Violet,Modifier.weight(1f).testTag("inventory-silver")){m.showRewards=true}
     InventoryBalanceCard("다이아",wallet.data?.optJSONObject("diamonds")?.presentAmount("balance"),"◇","정산 내역",Icons.Rounded.Diamond,Aqua,Modifier.weight(1f).testTag("inventory-diamonds")){m.showDiamonds=true}
    }
   }
   InventoryEntry("프레임 · 배경","보유 아이템과 장착 상태 보기",Icons.Rounded.Inventory2,"inventory-equipment"){m.showInventory=true}
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
    Text("보유 선물",fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
    TextButton({m.showShop=true},modifier=Modifier.testTag("inventory-shop")){Text("선물 상점",fontSize=12.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(16.dp))}
   }
   val groups=inventory.data?.optJSONArray("items").objects().groupBy{it.optString("gift_type")+":"+it.optBoolean("available",true)}.values.toList()
   groups.chunked(3).forEach{row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
    row.forEach{group->val gift=group.first();val available=gift.optBoolean("available",true)
     Surface(onClick={m.showInventory=true},color=Panel,shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.weight(1f).testTag("my-owned-gift-${gift.optString("gift_type")}-${if(available)"available"else "held"}")){
      Column(Modifier.padding(9.dp),horizontalAlignment=Alignment.CenterHorizontally){
       GiftItemImage(gift.optString("image"),Modifier.fillMaxWidth().height(64.dp))
       Text(gift.optString("gift_name"),fontSize=12.sp,lineHeight=17.sp,maxLines=2,overflow=TextOverflow.Ellipsis,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth().heightIn(min=34.dp).wrapContentHeight())
       Text("${inventoryAmount(group.size)}개 보유",fontSize=11.sp,lineHeight=16.sp,color=if(available)Aqua else Muted)
       Text(if(available)"선물 관리"else "사용 보류",fontSize=10.sp,lineHeight=15.sp,color=Muted)
      }
     }
    };repeat(3-row.size){Spacer(Modifier.weight(1f))}
   }}
   if(inventory.data!=null&&groups.isEmpty())Text("보유한 선물 아이템이 없어요.",fontSize=12.sp,lineHeight=18.sp,color=Muted)
   Text("보유 선물은 선물 관리에서 다른 회원에게 보낼 수 있어요.",fontSize=11.sp,lineHeight=17.sp,color=Muted)
   HorizontalDivider(color=Stroke)
   Text("받은 선물 · 응원",fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
   val receivedData=received.data
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){
    ReceivedGiftTotal("골드 선물",receivedData?.presentAmount("total_gold")?.let{"$it G"},Modifier.weight(1f))
    ReceivedGiftTotal("실버 선물",receivedData?.presentAmount("free_count")?.let{"$it S"},Modifier.weight(1f))
   }
   if(receivedEnabled)InventoryEntry("선물 랭킹","나를 응원한 회원 보기",Icons.Rounded.EmojiEvents,"inventory-gift-ranking"){ranking=true}
   Text("받은 선물은 응원 내역이며, 사용 가능한 보유 선물과 달라요.",fontSize=11.sp,lineHeight=17.sp,color=Muted)
   InventoryEntry("보낸 선물 내역","최근 골드 · 실버 선물",Icons.Rounded.History,"inventory-sent-gifts",wallet.data!=null){history=true}
  }
 }
 if(history&&wallet.data!=null)GiftHistorySheet(wallet.data,m){history=false}
 if(ranking&&receivedEnabled)MyGiftRankingPage(m,pid){ranking=false}
}

@Composable private fun InventoryBalanceCard(label:String,value:String?,unit:String,action:String,icon:ImageVector,tint:Color,modifier:Modifier,wide:Boolean=false,open:()->Unit){
 Surface(onClick=open,color=Panel,shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke),modifier=modifier){
  if(wide)Row(Modifier.padding(horizontal=13.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
   Icon(icon,null,Modifier.size(20.dp),tint=tint)
   Column(Modifier.padding(start=10.dp)){
    Text(label,fontSize=12.sp,lineHeight=17.sp,color=Muted)
    Text(action,fontSize=10.sp,lineHeight=15.sp,color=SoftText,modifier=Modifier.padding(top=3.dp))
   }
   Text(value?.let{"$it $unit"}?:"—",fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,color=tint,textAlign=TextAlign.End,modifier=Modifier.weight(1f).padding(start=12.dp).testTag("inventory-balance-$label"))
  }else Column(Modifier.padding(horizontal=10.dp,vertical=12.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
   Row(verticalAlignment=Alignment.CenterVertically){Icon(icon,null,Modifier.size(15.dp),tint=tint);Text(label,fontSize=11.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.padding(start=4.dp))}
   Text(value?.let{"$it $unit"}?:"—",fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,color=tint,modifier=Modifier.testTag("inventory-balance-$label"))
   Text(action,fontSize=10.sp,lineHeight=15.sp,color=SoftText)
  }
 }
}

@Composable private fun ReceivedGiftTotal(label:String,value:String?,modifier:Modifier){
 Column(modifier){Text(label,fontSize=11.sp,lineHeight=16.sp,color=Muted);Text(value?:"—",fontSize=16.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=4.dp))}
}

@Composable private fun InventoryEntry(title:String,subtitle:String,icon:ImageVector,tag:String,enabled:Boolean=true,open:()->Unit){
 Surface(onClick=open,enabled=enabled,color=Panel,shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag(tag)){
  Row(Modifier.padding(13.dp),verticalAlignment=Alignment.CenterVertically){
   Icon(icon,null,Modifier.size(22.dp),tint=Pink)
   Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(title,fontSize=13.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold);Text(subtitle,fontSize=11.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.padding(top=3.dp))}
   Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
  }
 }
}

/** Personal appreciation ranking includes official support; financial rankings remain separate. */
@Composable internal fun MyGiftRankingPage(m:MusicModel,pid:String,close:()->Unit){
 val valid=pid!="null"&&CurrentNavigation.safeID(pid)
 val read=currentRead(m,"/api/producers/$pid/gifts",valid)
 AppPage("선물 랭킹",close){
  LazyColumn(Modifier.fillMaxSize().testTag("my-gift-ranking-page"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   item{Text("나를 응원한 회원",fontSize=19.sp,lineHeight=26.sp,fontWeight=FontWeight.Bold);Text("골드 1G · 실버 1S · AI 응원별 1개 = ★1",fontSize=12.sp,lineHeight=18.sp,color=Muted,modifier=Modifier.padding(top=5.dp))}
   if(valid)item{ReadStatus(read)}else item{Text("프로필을 불러온 뒤 다시 확인해주세요.",fontSize=13.sp,color=Muted)}
   val fans=(read.data?.optJSONArray("support_ranking")?:read.data?.optJSONArray("ranking")).objects()
   items(fans,key={it.optString("profile_id").ifBlank{it.optString("rank")}}){fan->
    val profileId=fan.optString("profile_id").takeIf{it!="null"&&CurrentNavigation.safeID(it)}
    Surface(onClick={if(profileId!=null){close();m.openProfile(profileId)}},enabled=profileId!=null,color=Color.Transparent,modifier=Modifier.fillMaxWidth().testTag("my-gift-rank-${fan.optInt("rank")}")){
     Row(Modifier.padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
      Text("${fan.optInt("rank") }.",fontSize=14.sp,lineHeight=20.sp,color=Pink,modifier=Modifier.width(27.dp))
      Avatar(fan.optString("name"),JSONObject().put("id",profileId).put("image_version",fan.optString("image_version")),36)
      Column(Modifier.weight(1f).padding(horizontal=10.dp)){
       Row(verticalAlignment=Alignment.CenterVertically){Text(fan.optString("name"),fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f,false));OfficialAiBadge(fan)}
       Text(if(fan.optString("account_type")=="ai_bot")"응원별 ${inventoryAmount(fan.optLong("official_stars"))}개"else "${inventoryAmount(fan.optLong("gold"))} G · ${inventoryAmount(fan.optLong("stars"))} S",fontSize=10.sp,lineHeight=15.sp,color=Muted,modifier=Modifier.padding(top=3.dp))
      }
      Text(fan.presentAmount("score")?.let{"★x$it"}?:"—",fontSize=13.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold,color=Aqua,modifier=Modifier.testTag("my-gift-rank-score-${fan.optInt("rank")}"))
     }
    }
    HorizontalDivider(color=Stroke)
   }
   if(read.data!=null&&fans.isEmpty())item{Text("아직 받은 선물이 없어요.",fontSize=13.sp,lineHeight=19.sp,color=Muted)}
   item{Text("AI 응원도 함께 표시해요. 무료 응원별은 정산 대상이 아니에요.",fontSize=11.sp,lineHeight=17.sp,color=Muted)}
  }
 }
}

