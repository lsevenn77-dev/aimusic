@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import coil.compose.AsyncImage
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import kotlin.math.sqrt

internal fun playerLevel(xp:Int)=((1+sqrt(1+xp.coerceAtLeast(0)/12.5))/2).toInt().coerceIn(1,100)
@Composable internal fun BoxScope.PlayerAvatarDecoration(p:JSONObject?,size:Int){
 if(p==null||p.optString("profile_kind","producer")=="artist")return
 val frameKey=p.optString("profile_frame")
 val framePath=p.optString("profile_frame_artwork")
 val remoteFrame=frameKey.isNotBlank()&&Regex("/assets/[A-Za-z0-9_./-]+\\.(png|webp)(\\?v=[A-Za-z0-9_-]+)?").matches(framePath)&&!framePath.contains("..")
 val frameModifier=Modifier.matchParentSize().graphicsLayer(scaleX=1.26f,scaleY=1.26f)
 if(remoteFrame)AsyncImage(Endpoint.url(framePath),contentDescription=null,modifier=frameModifier,contentScale=ContentScale.Fit)
 else if(frameKey=="crew-outline")Image(painterResource(R.drawable.player_frame_clan_aether),contentDescription=null,modifier=frameModifier,contentScale=ContentScale.Fit)
 if(size>=80&&(!p.isNull("player_xp")||p.has("player_level"))){
  val level=p.optInt("player_level",playerLevel(p.optInt("player_xp"))).coerceIn(1,100).toString()
  val height=(size*.28f).coerceIn(11f,20f)
  val fontScale=LocalDensity.current.fontScale
  // Decorative badge has its own compact line metrics, independent of body-text scaling.
  Box(Modifier.align(Alignment.BottomStart).offset(x=(-1).dp,y=(height*.25f).dp)
   .size(width=(height*.55f*level.length+6f).dp,height=height.dp)
   .background(Raised,RoundedCornerShape((height/2).dp)).border(1.dp,Panel,RoundedCornerShape((height/2).dp))
   .testTag("avatar-level").semantics{contentDescription="레벨 $level"},contentAlignment=Alignment.Center){
   Text(level,maxLines=1,softWrap=false,color=Aqua,style=TextStyle(fontSize=(height*.68f/fontScale).sp,lineHeight=((height-2)/fontScale).sp,fontWeight=FontWeight.SemiBold,platformStyle=PlatformTextStyle(includeFontPadding=false)))
  }
 }
}
@Composable private fun PlayerXPCard(p:JSONObject,open:(()->Unit)?=null){
 val xp=p.optInt("xp");val level=p.optInt("level",1);val remaining=p.optInt("remaining")
 Surface(color=Panel,shape=RoundedCornerShape(18.dp)){
  Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("레벨 $level",fontSize=22.sp,fontWeight=FontWeight.Bold);Spacer(Modifier.weight(1f));Text("$xp XP",color=Aqua)}
   LinearProgressIndicator(progress={p.optDouble("progress",0.0).toFloat().coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().height(5.dp),color=Aqua,trackColor=Raised)
   Text(if(level>=100)"최고 레벨에 도달했어요." else "다음 레벨까지 $remaining XP",fontSize=12.sp,color=Muted)
   if(open!=null)TextButton(onClick=open,modifier=Modifier.fillMaxWidth(),colors=ButtonDefaults.textButtonColors(contentColor=Aqua)){Text("아이템 보관함")}
  }
 }
}
@Composable internal fun PlayerHomePanel(m:MusicModel){
 val account=m.user?.optString("id")
 var data by remember(account){mutableStateOf<JSONObject?>(null)}
 var error by remember(account){mutableStateOf<String?>(null)}
 var show by remember(account){mutableStateOf(false)}
 var revision by remember{mutableIntStateOf(0)}
 LaunchedEffect(account,revision){if(account!=null)try{val d=m.api.call("/api/me/player");if(m.user?.optString("id")==account){data=d;error=null}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 data?.optJSONObject("player")?.let{PlayerXPCard(it){show=true}}
 if(error!=null)TextButton(onClick={revision++}){Text("레벨 · 아이템 다시 불러오기")}
 if(show)PlayerInventorySheet(m,{show=false;revision++}){data=it}
}
@Composable private fun PlayerInventorySheet(m:MusicModel,close:()->Unit,updated:(JSONObject)->Unit){
 val account=m.user?.optString("id")
 val scope=rememberCoroutineScope()
 var data by remember(account){mutableStateOf<JSONObject?>(null)}
 var error by remember(account){mutableStateOf<String?>(null)}
 var busy by remember{mutableStateOf(false)}
 var retry by remember{mutableIntStateOf(0)}
 LaunchedEffect(account,retry){try{val d=m.api.call("/api/me/player");if(m.user?.optString("id")==account){data=d;error=null}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 ModalBottomSheet(onDismissRequest=close,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){
  LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(.94f),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
   item{Text("아이템 보관함",fontSize=24.sp,fontWeight=FontWeight.Bold)}
   if(data==null&&error==null)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)}
   error?.let{item{Text(it,color=Pink);TextButton(onClick={retry++}){Text("다시 불러오기")}}}
   data?.let{d->
    item{PlayerXPCard(d.optJSONObject("player")?:JSONObject())}
    val inventory=d.optJSONArray("inventory").objects()
    if(inventory.isEmpty())item{Empty("첫 액자를 만나보세요","크루에 가입하면 전용 장식 액자를 무료로 드려요.");TextButton(onClick={close();m.selectTab(3);m.communityCrewMode=true;m.crewBrowsing=true}){Text("크루 둘러보기")}}
    val rewards=d.optJSONArray("rewards").objects()
    items(inventory+rewards,key={it.optString("id").ifBlank{"reward:"+it.optString("item_key")}}){i->
     val owned=i.optBoolean("owned",true)
     if(!owned&&i==rewards.firstOrNull())Text("달성할 수 있는 보상",fontSize=18.sp,fontWeight=FontWeight.Bold)
     val p=JSONObject((m.ownProfile.optJSONObject("profile")?:JSONObject()).toString()).put("profile_frame",i.optString("item_key")).put("profile_frame_artwork",i.optString("artwork")).put("player_xp",d.optJSONObject("player")?.optInt("xp")?:0)
     Surface(color=Panel,shape=RoundedCornerShape(18.dp)){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
      Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(20.dp)){Avatar(p.optString("name"),p,64);Column{Text(i.optString("name"),fontWeight=FontWeight.Bold);Text(if(i.optBoolean("equipped"))"장착 중" else if(owned)"보유 중" else "달성 보상",color=Aqua,fontSize=12.sp)}}
      Text(i.optString("description"),color=Muted,fontSize=13.sp)
      Text(i.optString("reason").ifBlank{i.optString("usage","보유 아이템")},color=Muted,fontSize=12.sp)
      if(owned)Button(enabled=i.optBoolean("available")&&!busy,onClick={busy=true;scope.launch{try{
       val result=m.api.call("/api/me/player/equipment","PUT",payload("frame_inventory_id" to if(i.optBoolean("equipped"))JSONObject.NULL else i.optString("id")))
       if(m.user?.optString("id")==account){data=result;updated(result);error=null;m.loadOwnProfile(fresh=true)}
      }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}},modifier=Modifier.fillMaxWidth(),colors=ButtonDefaults.buttonColors(containerColor=Aqua,contentColor=Ink)){Text(if(i.optBoolean("equipped"))"해제하기" else "장착하기")}
     }}
    }
    item{Text("이렇게 레벨이 올라요",fontWeight=FontWeight.Bold)}
    items(d.optJSONArray("rules").objects()){r->Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(r.optString("label"),fontSize=14.sp);Text(r.optString("limit"),fontSize=11.sp,color=Muted)};Text("+${r.optInt("xp")} XP",color=Aqua,fontSize=13.sp)}}
    item{Text("매일 활동은 한국 시간 자정에 새로 시작해요. 기존 공개곡도 반영되며 같은 곡의 경험치는 한 번만 지급돼요.",fontSize=12.sp,color=Muted)}
   }
  }
 }
}
