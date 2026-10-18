@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
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
 var wallet by remember{mutableStateOf<JSONObject?>(null)}
 var payouts by remember{mutableStateOf<JSONObject?>(null)}
 var error by remember{mutableStateOf<String?>(null)}
 var working by remember{mutableStateOf(false)}
 var amount by remember{mutableStateOf("50")}
 var cash by remember{mutableStateOf(false)}
 var confirm by remember{mutableStateOf(false)}
 var request by remember(amount,cash){mutableStateOf(UUID.randomUUID().toString())}
 var editAccount by remember{mutableStateOf(false)}
 var holder by remember{mutableStateOf("")}
 var bank by remember{mutableStateOf("")}
 var bankMenu by remember{mutableStateOf(false)}
 var account by remember{mutableStateOf("")}
 var resident by remember{mutableStateOf("")}
 var consent by remember{mutableStateOf(false)}
 suspend fun load(){wallet=m.api.call("/api/diamonds",fresh=true);payouts=m.api.call("/api/studio/payout-account",fresh=true)}
 fun perform(action:suspend ()->Unit){scope.launch{working=true;error=null;try{action()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{working=false}}}
 LaunchedEffect(m.user?.optString("id")){try{load()}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 val n=amount.toLongOrNull()?:0L
 val available=wallet?.optDouble("available")?:0.0
 val gross=n*100L
 val income=if(gross*3/100>=1000)gross*3/100 else 0L
 val local=income/10
 val preview=if(cash)"세전 ${diamondFormat(gross.toDouble())}원 · 원천징수 ${diamondFormat((income+local).toDouble())}원\n예상 지급 ${diamondFormat((gross-income-local).toDouble())}원" else "${diamondFormat(n.toDouble())}다이아 → ${diamondFormat(n*10.0)}골드"
 AppPage(title="다이아",onDismissRequest={if(!working)m.showDiamonds=false},containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth().imePadding(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
   item{Text("다이아 · 내 정산",fontSize=25.sp)}
   if(wallet==null)item{LinearProgressIndicator(Modifier.fillMaxWidth())}
   error?.let{message->item{Text(message,color=Pink);TextButton(onClick={perform{load()}},enabled=!working){Text("다시 불러오기")}}}
   wallet?.let{w->
    item{Text("사용 가능한 다이아",color=Muted);Text("◇ ${diamondFormat(available)}",fontSize=30.sp,color=Aqua);Text("1다이아 = 세전 100원 = 10골드",color=Muted);Text("월 마감 후 확정한 수익이에요. 소수점 수익도 누적돼요. 골드는 현금 정산할 수 없어요.",fontSize=13.sp,color=Muted)}
    item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){FilterChip(!cash,{cash=false},label={Text("골드로 전환")});FilterChip(cash,{cash=true},label={Text("현금 정산")})}}
    item{OutlinedTextField(amount,{if(it.length<=7&&it.all(Char::isDigit))amount=it},label={Text("사용할 다이아")},singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),enabled=!working,modifier=Modifier.fillMaxWidth());Text(preview,color=Aqua,modifier=Modifier.padding(vertical=12.dp));BrandButton(onClick={confirm=true},enabled=!working&&n>=(if(cash)100 else 1)&&n<=available&&n<=1000000,modifier=Modifier.fillMaxWidth()){Text(if(cash)"현금 정산 신청" else "골드로 전환")};Text(if(cash)"100다이아부터 월 1회 신청 · 계좌 등록 필요 · 신청 다음 달 25일 지급 예정 · 별도 환전 수수료 없음" else "500다이아 = 5,000골드. 추가 차감과 웹 구매 보너스는 없어요. 전환한 골드로 다른 사람에게 선물할 수 있어요. 전환은 되돌릴 수 없어요.",color=Muted,fontSize=13.sp)}
    item{val p=w.optJSONObject("partner");HorizontalDivider();Text(if(p?.optString("tier")=="partner")"✓ 공식 파트너" else "일반 창작자",color=Aqua);Text("인정 실적 ${diamondFormat(p?.optDouble("eligible_krw")?:0.0)}원 / 1,000,000원",color=Muted);Text("일반 선물 수익 60% · 파트너 70%. 커버 선물은 등급과 관계없이 가창자 70% / 플랫폼 30%, 원곡자 선물 몫은 없어요. 스트리밍은 원곡자 50% / 플랫폼 50%이며 커버 재생도 원곡자에게 반영돼요.",fontSize=13.sp);Text("세금·결제 수수료를 제외한 기준입니다. 파트너는 확정 세전 수익 100만 원 달성 후 운영자 검증 또는 특별 선정으로 승인돼요. 환불·취소·자가 후원·부정 수익은 제외하며, 승급 이후 선물부터 적용해요. 사용한 다이아는 누적 실적을 줄이지 않아요.",fontSize=13.sp,color=Muted)}
   }
   if(payouts!=null){
    item{HorizontalDivider();val a=payouts?.optJSONObject("account");Text("정산 계좌",fontSize=20.sp);if(a!=null)Text("${a.optString("bank")} ${a.optString("account")} · ${a.optString("holder")}");if(payouts?.optBoolean("can_register")==true||a!=null)TextButton(onClick={editAccount=!editAccount}){Text(if(editAccount)"닫기" else "계좌 등록 · 수정")}else Text("확정 수익이 생기면 정산 계좌를 등록할 수 있어요.",color=Muted)}
    if(editAccount){
     item{OutlinedTextField(holder,{holder=it.take(40)},label={Text("예금주 실명")},modifier=Modifier.fillMaxWidth());Box{TextButton(onClick={bankMenu=true}){Text(bank.ifEmpty{"은행 선택"})};AppMenuPage(title="은행 선택",expanded=bankMenu,onDismissRequest={bankMenu=false}){payouts?.optJSONArray("banks")?.let{banks->for(i in 0 until banks.length())PageMenuItem(text={Text(banks.getString(i))},onClick={bank=banks.getString(i);bankMenu=false})}}};OutlinedTextField(account,{account=it.filter(Char::isDigit).take(16)},label={Text("계좌번호")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),modifier=Modifier.fillMaxWidth());OutlinedTextField(resident,{resident=it.filter(Char::isDigit).take(13)},label={Text("주민등록번호 · 원천징수용")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.NumberPassword),visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth());Row{Checkbox(consent,{consent=it});Text("수익 지급과 원천징수를 위한 개인정보 처리에 동의합니다. 계좌번호와 주민등록번호는 암호화해 보관합니다.",fontSize=13.sp)};BrandButton(onClick={perform{payouts=m.api.call("/api/studio/payout-account","PUT",payload("holder" to holder,"bank" to bank,"account" to account,"resident_number" to resident,"consent" to consent));resident="";account="";editAccount=false}},enabled=!working&&consent&&bank.isNotEmpty()){Text("정산 정보 저장")}}
    }
    items(payouts?.optJSONArray("statements").objects()){s->Text("${s.optString("period")} · ${diamondFormat(s.optDouble("net_krw"))}원 · ${if(s.optString("status")=="paid")"지급 완료" else "지급 예정 ${s.optString("due_on")}"}",color=Muted)}
   }
   if(!wallet?.optJSONArray("history").objects().isNullOrEmpty())item{HorizontalDivider();Text("다이아 내역",fontSize=20.sp)}
   items(wallet?.optJSONArray("history").objects()){h->Text("${h.optString("period")} · ${h.optString("detail")}\n${diamondFormat(h.optDouble("diamonds"))} 다이아",color=Muted)}
  }
 }
 if(confirm)AlertDialog(onDismissRequest={if(!working)confirm=false},title={Text(if(cash)"다이아 현금 정산" else "다이아를 골드로 전환")},text={Text(preview+if(cash)"\n이 금액으로 정산을 신청할까요?" else "\n전환은 되돌릴 수 없어요.")},dismissButton={TextButton(onClick={confirm=false},enabled=!working){Text("취소")}},confirmButton={TextButton(enabled=!working,onClick={perform{val result=m.api.call("/api/diamonds/"+(if(cash)"payout" else "exchange"),"POST",payload("diamonds" to n,"request_id" to request));wallet=result.optJSONObject("wallet");request=UUID.randomUUID().toString();confirm=false;load();m.notice=if(cash)"정산 신청했어요" else "골드로 전환했어요"}}){Text("확인")}})
}
