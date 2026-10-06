@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import org.json.JSONObject

internal fun threadedComments(comments:List<JSONObject>):List<JSONObject>{
 val visible=comments.filter{it.optLong("deleted_at")==0L}
 val roots=visible.filter{it.isNull("parent_id")||visible.none{p->p.optString("id")==it.optString("parent_id")}}
 return roots.flatMap{root->listOf(root)+visible.filter{it.optString("parent_id")==root.optString("id")}.sortedBy{it.optLong("created")}}
}

@Composable internal fun ProfileEditorSheet(m:MusicModel){
 val p=m.ownProfile.optJSONObject("profile")
 var name by remember{mutableStateOf(m.user?.optString("name")?:"")}
 var bio by remember{mutableStateOf(p?.optString("bio")?:"")}
 var image by remember{mutableStateOf<Uri?>(null)}
 var edited by remember{mutableStateOf(false)}
 LaunchedEffect(p?.toString()){if(!edited){name=p?.optString("name")?:name;bio=p?.optString("bio")?:bio}}
 val pick=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){image=it}
 ModalBottomSheet(onDismissRequest={if(!m.busy)m.showProfileEdit=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
   Text("내 프로필",fontSize=25.sp)
   Box(Modifier.clickable{pick.launch("image/*")}){if(image!=null)AsyncImage(image,"선택한 프로필 사진",Modifier.size(90.dp))else Avatar(name,p,90)}
   TextButton(onClick={pick.launch("image/*")}){Text("프로필 사진 바꾸기")}
   OutlinedTextField(name,{name=it.take(60);edited=true},label={Text("공개 닉네임")},modifier=Modifier.fillMaxWidth(),singleLine=true)
   Text("댓글·선물·크루·DM에는 이 이름이 표시돼요.",color=Muted,fontSize=14.sp)
   OutlinedTextField(bio,{bio=it.take(1000);edited=true},label={Text("소개")},modifier=Modifier.fillMaxWidth(),minLines=3)
   Button(onClick={m.saveProfile(name,bio,image){m.showProfileEdit=false}},enabled=!m.busy&&name.isNotBlank(),modifier=Modifier.fillMaxWidth()){Text(if(m.busy)"저장 중…" else "프로필 저장")}
   Spacer(Modifier.height(20.dp))
  }
 }
}

@Composable internal fun RewardsSheet(m:MusicModel){
 val scope=rememberCoroutineScope()
 var free by remember{mutableStateOf<JSONObject?>(null)}
 var error by remember{mutableStateOf<String?>(null)}
 var busy by remember{mutableStateOf(false)}
 suspend fun load(){free=m.api.call("/api/gold").optJSONObject("free")}
 LaunchedEffect(m.user?.optString("id")){try{load()}catch(e:Exception){error=e.message}}
 ModalBottomSheet(onDismissRequest={m.showRewards=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Panel){
  val maximumHeight=(LocalConfiguration.current.screenHeightDp*.74f).dp
  val largeText=LocalDensity.current.fontScale>1.25f
  LazyColumn(Modifier.fillMaxWidth().heightIn(max=maximumHeight).testTag("rewards-list"),contentPadding=PaddingValues(20.dp,0.dp,20.dp,24.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
   item{
    Text("오늘의 응원별",fontSize=23.sp,fontWeight=FontWeight.Bold)
    Row(Modifier.fillMaxWidth().padding(top=14.dp,bottom=4.dp).background(Aqua.copy(alpha=.08f),RoundedCornerShape(16.dp)).padding(16.dp),verticalAlignment=Alignment.CenterVertically){
     Icon(Icons.Rounded.Star,null,Modifier.size(32.dp),tint=Aqua)
     Column(Modifier.weight(1f).padding(start=12.dp)){
      Text("보유 응원별",color=Muted,fontSize=12.sp)
      Text(if(free==null)"불러오는 중…" else "★ ${free?.optInt("balance")?:0}",color=Aqua,fontSize=23.sp,fontWeight=FontWeight.Bold)
     }
     Text("하루 최대\n★ 10",color=Aqua,fontSize=12.sp)
    }
   }
   if(free==null&&error==null)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)}
   error?.let{item{Text(it,color=Pink);TextButton(onClick={scope.launch{try{load();error=null}catch(e:Exception){error=e.message}}}){Text("다시 불러오기")}}}
   items(free?.optJSONArray("rewards").objects(),key={it.optString("kind")}){r->
    val kind=r.optString("kind")
    val label=when(kind){"checkin"->"오늘 출석";"cover"->"커버곡 공개";"listen"->"노래 5곡 감상";else->"${kind.takeLast(1)}번째 댓글"}
    val claimed=r.optBoolean("claimed");val eligible=r.optBoolean("eligible")
    val target=r.optInt("target",1).coerceAtLeast(1)
    val progress=if(claimed||eligible)target else r.optInt("progress").coerceIn(0,target)
    val subtitle=when{claimed->"오늘 보상 완료";kind=="listen"->"${progress} / ${target}곡 · 곡마다 60% 이상";kind.startsWith("comment")->"3자 이상 감상 남기기";else->"하루 1회"}
    val claim:()->Unit={
      if(!r.optBoolean("eligible")){m.showRewards=false;m.selectTab(if(kind=="cover")2 else 0);m.notice=if(kind.startsWith("comment"))"좋아하는 곡에서 3자 이상 감상을 남겨보세요." else if(kind=="listen")"서로 다른 5곡을 각각 60% 이상 감상해주세요." else "커버곡을 공개하면 보상을 받을 수 있어요."}
      else scope.launch{busy=true;try{free=m.api.call("/api/gifts/free/claim","POST",payload("kind" to kind));error=null}catch(e:Exception){error=e.message}finally{busy=false}}
    }
    BoxWithConstraints(Modifier.fillMaxWidth().background(Stroke.copy(alpha=.45f),RoundedCornerShape(16.dp)).padding(14.dp).testTag("reward-$kind")){
     val stacked=maxWidth<280.dp||largeText
     val description:@Composable (Modifier)->Unit={modifier->
      Column(modifier){
       Text(label,fontSize=15.sp,fontWeight=FontWeight.SemiBold)
       Text(subtitle,color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=5.dp))
       if(kind=="listen")LinearProgressIndicator(progress={progress.toFloat()/target},modifier=Modifier.fillMaxWidth().padding(top=8.dp),color=Aqua,trackColor=Stroke)
      }
     }
     val action:@Composable ()->Unit={
      Column(horizontalAlignment=Alignment.End){
       Text("★ ${r.optInt("amount")}",color=if(claimed)Muted else Aqua,fontSize=13.sp,fontWeight=FontWeight.Bold)
       Button(enabled=!busy&&!claimed,onClick=claim,contentPadding=PaddingValues(horizontal=14.dp,vertical=8.dp),modifier=Modifier.padding(top=4.dp).heightIn(min=40.dp)){
        Text(if(claimed)"받음" else if(eligible)"별 받기" else "활동하기",fontSize=13.sp)
       }
      }
     }
     if(stacked)Column(Modifier.fillMaxWidth()){
      description(Modifier.fillMaxWidth())
      Row(Modifier.fillMaxWidth().padding(top=8.dp),horizontalArrangement=Arrangement.End){action()}
     }else Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
      description(Modifier.weight(1f).padding(end=14.dp));action()
     }
    }
   }
   item{Text("매일 0시 갱신 · 받은 별은 누적돼요.\n응원별은 수익 정산 대상이 아니에요.",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=4.dp))}
  }
 }
}
