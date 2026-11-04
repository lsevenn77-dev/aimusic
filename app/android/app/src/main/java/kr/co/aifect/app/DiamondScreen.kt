@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.DecimalFormat
import java.util.UUID

private fun diamondFormat(n:Double)=DecimalFormat("#,##0.#####").format(n)

@Composable internal fun DiamondSheet(m:MusicModel){
 val scope=rememberCoroutineScope()
 val accountId=m.user?.optString("id")
 var wallet by remember(accountId){mutableStateOf<JSONObject?>(null)}
 var payouts by remember(accountId){mutableStateOf<JSONObject?>(null)}
 var loading by remember(accountId){mutableStateOf(true)}
 var error by remember(accountId){mutableStateOf<String?>(null)}
 var working by remember{mutableStateOf(false)}
 var amount by remember(accountId){mutableStateOf("50")}
 var cash by remember(accountId){mutableStateOf(false)}
 var confirm by remember(accountId){mutableStateOf(false)}
 var request by remember(accountId,amount,cash){mutableStateOf(UUID.randomUUID().toString())}
 var editAccount by remember(accountId){mutableStateOf(false)}
 var holder by remember(accountId){mutableStateOf("")}
 var bank by remember(accountId){mutableStateOf("")}
 var bankMenu by remember(accountId){mutableStateOf(false)}
 var account by remember(accountId){mutableStateOf("")}
 var resident by remember(accountId){mutableStateOf("")}
 var consent by remember(accountId){mutableStateOf(false)}
 var policyExpanded by remember{mutableStateOf(false)}
 var allStatements by remember{mutableStateOf(false)}
 var allHistory by remember{mutableStateOf(false)}

 suspend fun load(){
  loading=true
  try{
   val balance=m.api.call("/api/diamonds",fresh=true)
   if(accountId==m.user?.optString("id"))wallet=balance
   val payoutData=m.api.call("/api/studio/payout-account",fresh=true)
   if(accountId==m.user?.optString("id")){payouts=payoutData;error=null}
  }finally{loading=false}
 }
 fun perform(action:suspend ()->Unit){scope.launch{
  working=true;error=null
  try{action()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{working=false}
 }}
 LaunchedEffect(accountId){try{load()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}

 // Amount limits and conversions are unchanged; preview withholding follows the server.
 val n=amount.toLongOrNull()?:0L
 val available=wallet?.optDouble("available")?:0.0
 val cashPreview=diamondCashPreview(n)
 val gross=cashPreview.grossKrw
 val income=cashPreview.incomeTaxKrw
 val local=cashPreview.localTaxKrw
 val preview=if(cash)"세전 ${diamondFormat(gross.toDouble())}원 · 원천징수 ${diamondFormat((income+local).toDouble())}원\n예상 지급 ${diamondFormat(cashPreview.netKrw.toDouble())}원"
  else "${diamondFormat(n.toDouble())}다이아 → ${diamondFormat(n*10.0)}골드"
 val minimum=if(cash)100 else 1
 val canSubmit=!working&&n>=minimum&&n<=available&&n<=1000000

 AppPage(title="다이아 · 내 정산",onDismissRequest={if(!working)m.showDiamonds=false},containerColor=Ink){
  LazyColumn(Modifier.fillMaxSize().imePadding().testTag("diamond-screen"),contentPadding=PaddingValues(20.dp,8.dp,20.dp,28.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
   if(loading)item{LinearProgressIndicator(Modifier.fillMaxWidth().testTag("diamond-loading"),color=Aqua,trackColor=Stroke)}
   error?.let{message->item{DiamondPanel{
    Text(message,fontSize=14.sp,lineHeight=21.sp,color=Pink,modifier=Modifier.testTag("diamond-error"))
    TextButton(onClick={perform{load()}},enabled=!working){Text("다시 불러오기",fontSize=14.sp)}
   }}}
   wallet?.let{w->
    item{Surface(color=Panel,shape=RoundedCornerShape(20.dp),border=BorderStroke(1.dp,BrandGradient),modifier=Modifier.fillMaxWidth().testTag("diamond-balance-card")){
     Column(Modifier.background(Brush.linearGradient(listOf(Pink.copy(alpha=.08f),Color.Transparent,Aqua.copy(alpha=.06f)))).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
      Row(verticalAlignment=Alignment.CenterVertically){Icon(Icons.Rounded.Diamond,null,Modifier.size(21.dp),tint=Aqua);Text("사용 가능한 다이아",fontSize=14.sp,lineHeight=21.sp,color=SoftText,modifier=Modifier.padding(start=8.dp))}
      Text("◇ ${diamondFormat(available)}",fontSize=34.sp,lineHeight=42.sp,fontWeight=FontWeight.SemiBold,color=Aqua,modifier=Modifier.testTag("diamond-available"))
      Surface(color=Ink.copy(alpha=.45f),shape=RoundedCornerShape(10.dp)){
       Text("1다이아 = 세전 100원 = 10골드",fontSize=13.sp,lineHeight=20.sp,color=SoftText,modifier=Modifier.padding(horizontal=12.dp,vertical=9.dp).testTag("diamond-rate"))
      }
      Text(if(available==0.0)"월 마감 후 수익이 확정되면 사용할 수 있어요."else "월 마감 후 확정된 수익이에요. 소수점도 누적돼요.",fontSize=13.sp,lineHeight=20.sp,color=Muted)
     }
    }}
    item{DiamondPanel(Modifier.testTag("diamond-use-card")){
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
      DiamondModeButton("골드 전환",Icons.Rounded.SwapHoriz,!cash,!working,Modifier.weight(1f).testTag("diamond-mode-gold")){cash=false}
      DiamondModeButton("현금 정산",Icons.Rounded.AccountBalanceWallet,cash,!working,Modifier.weight(1f).testTag("diamond-mode-cash")){cash=true}
     }
     OutlinedTextField(amount,{if(it.length<=7&&it.all(Char::isDigit))amount=it},label={Text("사용할 다이아",fontSize=14.sp)},suffix={Text("다이아",fontSize=13.sp,color=Muted)},textStyle=LocalTextStyle.current.copy(fontSize=22.sp,lineHeight=29.sp,fontWeight=FontWeight.SemiBold),singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),enabled=!working,shape=RoundedCornerShape(12.dp),modifier=Modifier.fillMaxWidth().testTag("diamond-amount"))
     if(cash){
      DiamondValueRow("세전 금액","${diamondFormat(gross.toDouble())}원")
      DiamondValueRow("원천징수","${diamondFormat((income+local).toDouble())}원")
      HorizontalDivider(color=Stroke)
      DiamondValueRow("예상 지급액","${diamondFormat(cashPreview.netKrw.toDouble())}원",prominent=true,tag="diamond-preview")
     }else{
      Column(Modifier.fillMaxWidth().background(Aqua.copy(alpha=.06f),RoundedCornerShape(12.dp)).padding(14.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
       Text("받을 골드",fontSize=13.sp,lineHeight=20.sp,color=Muted)
       Text("${diamondFormat(n*10.0)} G",fontSize=26.sp,lineHeight=34.sp,fontWeight=FontWeight.SemiBold,color=Aqua,modifier=Modifier.testTag("diamond-preview"))
       Text("${diamondFormat(n.toDouble())}다이아 사용",fontSize=13.sp,lineHeight=20.sp,color=SoftText)
      }
     }
     val hint=when{
      n<minimum->if(cash)"100다이아부터 현금 정산할 수 있어요."else "1다이아부터 골드로 전환할 수 있어요."
      n>1000000->"한 번에 최대 1,000,000다이아를 사용할 수 있어요."
      n>available->"사용 가능한 다이아가 부족해요."
      cash&&payouts?.optJSONObject("account")==null->"현금 정산에는 등록된 정산 계좌가 필요해요."
      else->null
     }
     hint?.let{Text(it,fontSize=13.sp,lineHeight=20.sp,color=Muted,modifier=Modifier.testTag("diamond-amount-hint"))}
     BrandButton(onClick={confirm=true},enabled=canSubmit,modifier=Modifier.fillMaxWidth().heightIn(min=50.dp).testTag("diamond-submit")){
      Text(if(working)"처리 중…"else if(cash)"현금 정산 신청"else "골드로 전환",fontSize=15.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold)
     }
     val payoutDate=w.optString("next_payout_on").takeUnless{it.isBlank()||it=="null"}
     Text(if(cash)"월 1회 신청 · "+(payoutDate?.let{"지급 예정 $it"}?:"지급일은 신청 시 확인")+"\n별도 환전 수수료 없음"else "추가 차감 없이 전환해요. 전환은 되돌릴 수 없어요.",fontSize=13.sp,lineHeight=20.sp,color=Muted)
    }}
    if(payouts!=null){
     item{val a=payouts?.optJSONObject("account");DiamondPanel(Modifier.testTag("diamond-account-card")){
      Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
       Icon(Icons.Rounded.AccountBalance,null,Modifier.size(21.dp),tint=Pink)
       Text("정산 계좌",fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f).padding(start=8.dp))
       if(payouts?.optBoolean("can_register")==true||a!=null)TextButton(onClick={editAccount=!editAccount},enabled=!working,modifier=Modifier.testTag("diamond-account-edit")){Text(if(editAccount)"닫기"else if(a!=null)"수정"else "등록",fontSize=14.sp)}
      }
      if(a!=null){Text("${a.optString("bank")} ${a.optString("account")}",fontSize=15.sp,lineHeight=22.sp);Text("예금주 ${a.optString("holder")}",fontSize=13.sp,lineHeight=20.sp,color=Muted)}
      else Text(if(payouts?.optBoolean("can_register")==true)"현금 정산을 받을 계좌를 등록해주세요."else "확정 수익이 생기면 정산 계좌를 등록할 수 있어요.",fontSize=14.sp,lineHeight=21.sp,color=Muted)
     }}
     if(editAccount)item{DiamondPanel(Modifier.testTag("diamond-account-form")){
      Text("정산 정보 등록",fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.SemiBold)
      OutlinedTextField(holder,{holder=it.take(40)},label={Text("예금주 실명")},enabled=!working,modifier=Modifier.fillMaxWidth())
      Box{OutlinedButton(onClick={bankMenu=true},enabled=!working,modifier=Modifier.fillMaxWidth()){Text(bank.ifEmpty{"은행 선택"},fontSize=14.sp);Icon(Icons.Rounded.ExpandMore,null,Modifier.size(18.dp))}
       AppMenuPage(title="은행 선택",expanded=bankMenu,onDismissRequest={bankMenu=false}){payouts?.optJSONArray("banks")?.let{banks->for(i in 0 until banks.length())PageMenuItem(text={Text(banks.getString(i))},onClick={bank=banks.getString(i);bankMenu=false})}}
      }
      OutlinedTextField(account,{account=it.filter(Char::isDigit).take(16)},label={Text("계좌번호")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),enabled=!working,modifier=Modifier.fillMaxWidth())
      OutlinedTextField(resident,{resident=it.filter(Char::isDigit).take(13)},label={Text("주민등록번호 · 원천징수용")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.NumberPassword),visualTransformation=PasswordVisualTransformation(),enabled=!working,modifier=Modifier.fillMaxWidth())
      Row(verticalAlignment=Alignment.Top){Checkbox(consent,{consent=it},enabled=!working);Text("수익 지급과 원천징수를 위한 개인정보 처리에 동의합니다. 계좌번호와 주민등록번호는 암호화해 보관합니다.",fontSize=13.sp,lineHeight=20.sp,modifier=Modifier.weight(1f).padding(top=10.dp))}
      BrandButton(onClick={perform{payouts=m.api.call("/api/studio/payout-account","PUT",payload("holder" to holder,"bank" to bank,"account" to account,"resident_number" to resident,"consent" to consent));resident="";account="";editAccount=false}},enabled=!working&&consent&&bank.isNotEmpty(),modifier=Modifier.fillMaxWidth()){Text("정산 정보 저장",fontSize=15.sp)}
     }}
    }
    item{val p=w.optJSONObject("partner");DiamondPanel(Modifier.testTag("diamond-partner-card")){
     Row(verticalAlignment=Alignment.CenterVertically){Icon(if(p?.optString("tier")=="partner")Icons.Rounded.Verified else Icons.Rounded.PersonOutline,null,Modifier.size(22.dp),tint=Aqua);Text(if(p?.optString("tier")=="partner")"공식 파트너"else "일반 창작자",fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(start=8.dp))}
     if(p!=null){
      Text("인정 실적 ${diamondFormat(p.optDouble("eligible_krw"))}원 / 1,000,000원",fontSize=13.sp,lineHeight=20.sp,color=Muted)
      LinearProgressIndicator(progress={(p.optDouble("eligible_krw")/1000000.0).toFloat().coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth(),color=Aqua,trackColor=Stroke)
     }
     Text("일반 선물 수익 배분",fontSize=13.sp,lineHeight=20.sp,color=Muted)
     Text("일반 60% · 파트너 70%",fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.SemiBold,color=SoftText)
     Text("파트너는 확정 세전 수익 100만 원 달성 후 운영자 검증 또는 특별 선정으로 승인돼요.",fontSize=13.sp,lineHeight=20.sp,color=Muted)
    }}
    item{DiamondPanel(Modifier.testTag("diamond-policy-card")){
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("정산 · 분배 기준",fontSize=17.sp,lineHeight=24.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f));TextButton({policyExpanded=!policyExpanded},modifier=Modifier.testTag("diamond-policy-toggle")){Text(if(policyExpanded)"접기"else "자세히",fontSize=14.sp);Icon(if(policyExpanded)Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,null,Modifier.size(18.dp))}}
     DiamondPolicyRow("커버 선물","가창자 70% · 플랫폼 30%")
     DiamondPolicyRow("스트리밍","원곡자 50% · 플랫폼 50%")
     Text("세금 · 결제 수수료를 제외한 기준이에요.",fontSize=13.sp,lineHeight=20.sp,color=Muted)
     if(policyExpanded)Column(Modifier.testTag("diamond-policy-details"),verticalArrangement=Arrangement.spacedBy(12.dp)){
      HorizontalDivider(color=Stroke)
      Text("다이아와 전환",fontSize=15.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
      Text("월 마감 후 확정한 수익이에요. 소수점 수익도 누적돼요. 1다이아는 세전 100원 또는 10골드예요. 추가 차감과 웹 구매 보너스는 없어요. 전환한 골드로 다른 사람에게 선물할 수 있어요. 전환은 되돌릴 수 없고, 골드는 현금 정산할 수 없어요.",fontSize=14.sp,lineHeight=22.sp,color=SoftText)
      Text("현금 정산",fontSize=15.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
      Text("100다이아부터 월 1회 신청할 수 있어요. 계좌 등록이 필요하며, 25일까지 신청하면 같은 달 25일에, 25일 이후 신청하면 다음 달 25일에 지급 예정이에요. 별도 환전 수수료는 없어요. 지급액에는 해당 원천징수가 반영돼요.",fontSize=14.sp,lineHeight=22.sp,color=SoftText)
      Text("선물 · 스트리밍 배분",fontSize=15.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
      Text("일반 선물 수익은 일반 창작자 60%, 파트너 70%예요. 커버 선물은 등급과 관계없이 가창자 70% / 플랫폼 30%이며, 원곡자 선물 몫은 없어요. 스트리밍은 원곡자 50% / 플랫폼 50%이며 커버 재생도 원곡자에게 반영돼요. 세금·결제 수수료를 제외한 기준입니다.",fontSize=14.sp,lineHeight=22.sp,color=SoftText)
      Text("파트너 기준",fontSize=15.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
      Text("파트너는 확정 세전 수익 100만 원 달성 후 운영자 검증 또는 특별 선정으로 승인돼요. 환불·취소·자가 후원·부정 수익은 제외하며, 승급 이후 선물부터 적용해요. 사용한 다이아는 누적 실적을 줄이지 않아요.",fontSize=14.sp,lineHeight=22.sp,color=SoftText)
     }
    }}
   }
   val statements=payouts?.optJSONArray("statements").objects()
   if(statements.isNotEmpty()){
    item{DiamondHistoryHeader("현금 정산 내역",statements.size>3,allStatements){allStatements=!allStatements}}
    items(if(allStatements)statements else statements.take(3),key={it.optString("id").ifBlank{it.optString("period")}}){s->DiamondPanel{
     DiamondValueRow(s.optString("period"),"${diamondFormat(s.optDouble("net_krw"))}원")
     Text(if(s.optString("status")=="paid")"지급 완료"else "지급 예정 ${s.optString("due_on")}",fontSize=13.sp,lineHeight=20.sp,color=if(s.optString("status")=="paid")Aqua else Muted)
    }}
   }
   val history=wallet?.optJSONArray("history").objects()
   if(history.isNotEmpty()){
    item{DiamondHistoryHeader("다이아 내역",history.size>3,allHistory){allHistory=!allHistory}}
    items(if(allHistory)history else history.take(3),key={it.optString("id").ifBlank{it.toString()}}){h->DiamondPanel{
     Text(h.optString("detail"),fontSize=15.sp,lineHeight=22.sp,fontWeight=FontWeight.SemiBold)
     DiamondValueRow(h.optString("period"),"${diamondFormat(h.optDouble("diamonds"))} 다이아")
    }}
   }
  }
 }
 if(confirm)AlertDialog(onDismissRequest={if(!working)confirm=false},title={Text(if(cash)"다이아 현금 정산"else "다이아를 골드로 전환")},text={Text(preview+if(cash)"\n이 금액으로 정산을 신청할까요?"else "\n전환은 되돌릴 수 없어요.")},dismissButton={TextButton(onClick={confirm=false},enabled=!working){Text("취소")}},confirmButton={TextButton(enabled=!working,onClick={perform{
  val result=m.api.call("/api/diamonds/"+(if(cash)"payout"else "exchange"),"POST",payload("diamonds" to n,"request_id" to request))
  wallet=result.optJSONObject("wallet");request=UUID.randomUUID().toString();confirm=false;load();m.notice=if(cash)"정산 신청했어요"else "골드로 전환했어요"
 }}){Text("확인")}})
}

@Composable private fun DiamondPanel(modifier:Modifier=Modifier,content:@Composable ColumnScope.()->Unit){
 Surface(color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke),modifier=modifier.fillMaxWidth()){
  Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp),content=content)
 }
}

@Composable private fun DiamondModeButton(label:String,icon:ImageVector,selected:Boolean,enabled:Boolean,modifier:Modifier,select:()->Unit){
 Surface(onClick=select,enabled=enabled,color=if(selected)Pink.copy(alpha=.12f)else Ink.copy(alpha=.35f),shape=RoundedCornerShape(11.dp),border=BorderStroke(1.dp,if(selected)Pink else Stroke),modifier=modifier){
  Column(Modifier.padding(horizontal=6.dp,vertical=12.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(6.dp)){
   Icon(icon,null,Modifier.size(22.dp),tint=if(selected)Pink else Muted)
   Text(label,fontSize=14.sp,lineHeight=20.sp,fontWeight=if(selected)FontWeight.SemiBold else FontWeight.Normal,color=if(selected)Pink else Muted)
  }
 }
}

@Composable private fun DiamondValueRow(label:String,value:String,prominent:Boolean=false,tag:String?=null){
 Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Top){
  Text(label,fontSize=14.sp,lineHeight=22.sp,color=Muted,modifier=Modifier.weight(1f).padding(end=12.dp))
  Text(value,fontSize=if(prominent)20.sp else 15.sp,lineHeight=if(prominent)28.sp else 22.sp,fontWeight=if(prominent)FontWeight.SemiBold else FontWeight.Medium,color=if(prominent)Aqua else SoftText,modifier=if(tag!=null)Modifier.testTag(tag)else Modifier)
 }
}

@Composable private fun DiamondPolicyRow(label:String,detail:String){
 Column(verticalArrangement=Arrangement.spacedBy(3.dp)){
  Text(label,fontSize=13.sp,lineHeight=20.sp,color=Muted)
  Text(detail,fontSize=15.sp,lineHeight=22.sp,color=SoftText)
 }
}

@Composable private fun DiamondHistoryHeader(title:String,hasMore:Boolean,expanded:Boolean,toggle:()->Unit){
 Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
  Text(title,fontSize=18.sp,lineHeight=25.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
  if(hasMore)TextButton(toggle){Text(if(expanded)"간단히"else "전체보기",fontSize=14.sp)}
 }
}
