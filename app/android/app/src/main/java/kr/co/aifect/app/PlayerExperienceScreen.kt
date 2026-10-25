package kr.co.aifect.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal fun itemNumber(value:Long)=NumberFormat.getIntegerInstance(Locale.KOREA).format(value)

@Composable internal fun PlayerExperiencePage(m:MusicModel,initial:JSONObject?,close:()->Unit){
 val account=m.user?.optString("id")
 var data by remember(account){mutableStateOf(initial)}
 var error by remember(account){mutableStateOf<String?>(null)}
 var retry by remember{mutableIntStateOf(0)}
 var rulesOpen by remember{mutableStateOf(false)}
 LaunchedEffect(account,retry){try{val result=m.api.call("/api/me/player",fresh=true);if(account==m.user?.optString("id")){data=result;error=null}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 AppPage(title="레벨 · 경험치",onDismissRequest=close,containerColor=Ink){
  LazyColumn(Modifier.fillMaxSize().testTag("player-experience"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(24.dp)){
   if(data==null&&error==null)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)}
   error?.let{item{Text(it,color=Pink);TextButton(onClick={retry++}){Text("다시 불러오기")}}}
   data?.let{d->d.optJSONObject("player")?.let{p->
    val level=p.optInt("level",1);val max=level>=100
    val current=p.optLong("level_xp").coerceAtLeast(0);val remaining=p.optLong("remaining").coerceAtLeast(0)
    item{
     Surface(color=Panel,shape=RoundedCornerShape(20.dp)){
      Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Pink.copy(alpha=.1f),Aqua.copy(alpha=.05f)))).padding(22.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
       Text("현재 레벨",color=Muted,fontSize=13.sp)
       Text("Lv. $level",fontSize=36.sp,fontWeight=FontWeight.Bold,modifier=Modifier.testTag("xp-level"))
       Text(if(max)"최고 레벨에 도달했어요" else "레벨 ${level+1}까지 ${itemNumber(remaining)} XP",color=Aqua,fontSize=15.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.testTag("xp-remaining"))
       LinearProgressIndicator(progress={if(max)1f else p.optDouble("progress",0.0).toFloat().coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().height(6.dp),color=Aqua,trackColor=Raised)
       if(!max)Text("현재 레벨 경험치  ${itemNumber(current)} / ${itemNumber(current+remaining)} XP",fontSize=12.sp,lineHeight=19.sp,color=Muted,modifier=Modifier.testTag("xp-progress"))
      }
     }
    }
    item{
     XPDetailRow("누적 경험치","${itemNumber(p.optLong("xp"))} XP","xp-total")
     if(!max){
      XPDetailRow("레벨업 필요 경험치","${itemNumber(current+remaining)} XP","xp-required")
      if(!p.isNull("next_xp"))XPDetailRow("다음 레벨 누적 기준","${itemNumber(p.optLong("next_xp"))} XP","xp-next-total")
     }
    }
   }
    val rules=d.optJSONArray("rules").objects()
    if(rules.isNotEmpty())item{
     TextButton(onClick={rulesOpen=!rulesOpen},contentPadding=PaddingValues(0.dp)){Text(if(rulesOpen)"경험치 얻는 방법 접기" else "경험치 얻는 방법 보기",color=Aqua)}
     if(rulesOpen)Column(verticalArrangement=Arrangement.spacedBy(16.dp)){
      rules.forEach{rule->Column{XPDetailRow(rule.optString("label"),"+${rule.optInt("xp")} XP");Text(rule.optString("limit"),fontSize=12.sp,lineHeight=18.sp,color=Muted)}}
     }
    }
    item{Text("최근 획득 내역",fontSize=19.sp,fontWeight=FontWeight.Bold)}
    val recent=d.optJSONArray("recent").objects()
    if(recent.isEmpty())item{Text("아직 획득한 경험치가 없어요.",color=Muted,fontSize=14.sp)}
    items(recent){entry->
     val kind=entry.optString("kind")
     val label=rules.find{it.optString("kind")==kind}?.optString("label")?:when(kind){"publish"->"제작곡 공개";"cover"->"커버 · 듀엣 공개";"listen"->"음악 감상";"comment"->"댓글 작성";"crew_chat"->"크루 대화";else->"활동 경험치"}
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
      Column(Modifier.weight(1f)){Text(label,fontSize=14.sp);Text(SimpleDateFormat("M월 d일 HH:mm",Locale.KOREA).format(Date(entry.optLong("created")*1000)),color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=4.dp))}
      Text("+${itemNumber(entry.optLong("amount"))} XP",color=Aqua,fontSize=14.sp)
     }
    }
   }
  }
 }
}

@Composable private fun XPDetailRow(label:String,value:String,tag:String=""){
 Row(Modifier.fillMaxWidth().padding(vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalAlignment=Alignment.CenterVertically){
  Text(label,Modifier.weight(1f),color=Muted,fontSize=13.sp,lineHeight=19.sp)
  Text(value,Modifier.testTag(tag),fontWeight=FontWeight.SemiBold,fontSize=14.sp,lineHeight=20.sp)
 }
}
