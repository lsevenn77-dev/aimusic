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
import androidx.compose.ui.draw.clip
import coil.compose.AsyncImage
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.EmojiEvents
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
 Surface(color=Panel,shape=RoundedCornerShape(18.dp),border=BorderStroke(1.dp,Stroke)){
  Column(Modifier.fillMaxWidth().musicSurface().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("레벨 $level",fontSize=18.sp,fontWeight=FontWeight.Bold);Spacer(Modifier.weight(1f));Text("$xp XP",color=Aqua,fontSize=14.sp)}
   LinearProgressIndicator(progress={p.optDouble("progress",0.0).toFloat().coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().height(5.dp),color=Aqua,trackColor=Raised)
   Text(if(level>=100)"최고 레벨에 도달했어요." else "다음 레벨까지 $remaining XP",fontSize=12.sp,color=Muted)
   if(open!=null)TextButton(onClick=open,colors=ButtonDefaults.textButtonColors(contentColor=Aqua),contentPadding=PaddingValues(0.dp)){Text("경험치 자세히 보기  ›",fontSize=12.sp)}
  }
 }
}
@Composable internal fun PlayerHomePanel(m:MusicModel,compact:Boolean=false){
 val account=m.user?.optString("id")
 var data by remember(account){mutableStateOf<JSONObject?>(null)}
 var error by remember(account){mutableStateOf<String?>(null)}
 var show by remember(account){mutableStateOf(false)}
 var revision by remember{mutableIntStateOf(0)}
 LaunchedEffect(account,revision){if(account!=null)try{val d=m.api.call("/api/me/player");if(m.user?.optString("id")==account){data=d;error=null}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 data?.optJSONObject("player")?.let{if(compact)PlayerLevelStrip(it){show=true}else PlayerXPCard(it){show=true}}
 if(error!=null)TextButton(onClick={revision++}){Text("레벨 다시 불러오기")}
 if(show)PlayerExperiencePage(m,data,{show=false;revision++})
}
@Composable internal fun PlayerInventorySheet(m:MusicModel,close:()->Unit,updated:(JSONObject)->Unit){
 val account=m.user?.optString("id")
 val scope=rememberCoroutineScope()
 var data by remember(account){mutableStateOf<JSONObject?>(null)}
 var error by remember(account){mutableStateOf<String?>(null)}
 var busy by remember{mutableStateOf(false)}
 var retry by remember{mutableIntStateOf(0)}
 var gifts by remember(account){mutableStateOf<List<JSONObject>?>(null)}
 var giftError by remember(account){mutableStateOf<String?>(null)}
 var gift by remember(account){mutableStateOf<JSONObject?>(null)}
 var decoration by remember(account){mutableStateOf<JSONObject?>(null)}
 LaunchedEffect(account,retry){try{val d=m.api.call("/api/me/player");if(m.user?.optString("id")==account){data=d;error=null}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}}
 LaunchedEffect(account,retry){try{val d=m.api.call("/api/me/gift-inventory",fresh=true);if(m.user?.optString("id")==account){gifts=d.optJSONArray("items").objects();giftError=null}}catch(e:Exception){if(e is CancellationException)throw e;giftError=e.message}}
 AppPage(title="인벤토리",onDismissRequest=close,containerColor=Ink){
  LazyColumn(Modifier.fillMaxSize().testTag("owned-inventory"),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   if(data==null&&error==null)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)}
   error?.let{item{Text(it,color=Pink);TextButton(onClick={retry++}){Text("다시 불러오기")}}}
   data?.let{d->
    val inventory=d.optJSONArray("inventory").objects().filter{it.optBoolean("owned",true)}
    if(inventory.isNotEmpty())item{Text("프레임",fontSize=16.sp,fontWeight=FontWeight.SemiBold)}
    items(inventory.chunked(3)){row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     row.forEach{i->
      val equipped=i.optBoolean("equipped")
      val p=JSONObject((m.ownProfile.optJSONObject("profile")?:JSONObject()).toString()).put("profile_frame",i.optString("item_key")).put("profile_frame_artwork",i.optString("artwork")).put("player_xp",d.optJSONObject("player")?.optInt("xp")?:0)
      Surface(onClick={busy=true;scope.launch{try{
       val result=m.api.call("/api/me/player/equipment","PUT",payload("frame_inventory_id" to if(equipped)JSONObject.NULL else i.optString("id")))
       if(m.user?.optString("id")==account){data=result;updated(result);error=null;m.loadOwnProfile(fresh=true)}
      }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}},enabled=i.optBoolean("available")&&!busy,color=Panel,shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,if(equipped)Pink else Stroke),modifier=Modifier.weight(1f).testTag("inventory-item-${i.optString("id")}")){
       Column(Modifier.height(156.dp).padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally){
        Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center){Avatar(p.optString("name"),p,56)}
        Text(i.optString("name"),fontSize=12.sp,lineHeight=17.sp,maxLines=2,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis,textAlign=androidx.compose.ui.text.style.TextAlign.Center,modifier=Modifier.fillMaxWidth().height(44.dp).wrapContentHeight())
        Text(if(equipped)"장착 중" else if(i.optBoolean("available"))"장착" else "보유",fontSize=11.sp,lineHeight=16.sp,color=if(equipped)Pink else Muted)
       }
      }
     }
     repeat(3-row.size){Spacer(Modifier.weight(1f))}
    }}
   }
   val decorations=(data?.optJSONArray("stored_decorations").objects()+data?.optJSONArray("decorations").objects()).distinctBy{it.optString("id")}
   if(decorations.isNotEmpty())item{Text("액자 · 토크룸 배경",fontSize=16.sp,fontWeight=FontWeight.SemiBold)}
   items(decorations.chunked(3)){row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
    row.forEach{i->val product=i.optJSONObject("product")?:i;val stored=i.optBoolean("stored")||i.optString("source")=="decoration_stock"
     Surface(onClick={decoration=i},enabled=stored&&i.optBoolean("available")&&!busy,color=Panel,shape=RoundedCornerShape(12.dp),modifier=Modifier.weight(1f).testTag("inventory-decoration-${i.optString("id")}")){
      Column(Modifier.height(156.dp).padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally){
       AsyncImage(decorationImage(product),product.optString("name"),Modifier.fillMaxWidth().weight(1f),contentScale=ContentScale.Fit)
       Text(product.optString("name"),fontSize=12.sp,maxLines=2,modifier=Modifier.height(44.dp).wrapContentHeight())
       Text(if(stored)"보관 중" else if(i.optBoolean("available"))"사용 가능" else "기간 만료",fontSize=11.sp,color=Muted)
      }
     }
    };repeat(3-row.size){Spacer(Modifier.weight(1f))}
   }}
   if(gifts==null&&giftError==null)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=Aqua)}
   giftError?.let{item{Text(it,color=Pink);TextButton(onClick={retry++}){Text("보유 선물 다시 불러오기")}}}
   val ownedGifts=gifts.orEmpty().groupBy{it.optString("gift_type")+":"+it.optBoolean("available",true)}.values.toList()
   if(ownedGifts.isNotEmpty())item{Text("선물",fontSize=16.sp,fontWeight=FontWeight.SemiBold)}
   items(ownedGifts.chunked(3)){row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
    row.forEach{group->val i=group.first();val available=i.optBoolean("available",true)
     Surface(onClick={gift=i},enabled=available,color=Panel,shape=RoundedCornerShape(12.dp),modifier=Modifier.weight(1f).testTag("inventory-gift-${i.optString("gift_type")}")){
      Column(Modifier.height(156.dp).padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally){
       Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center){GiftItemImage(i.optString("image"),Modifier.size(64.dp))}
       Text(i.optString("gift_name"),fontSize=12.sp,lineHeight=17.sp,maxLines=2,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis,textAlign=androidx.compose.ui.text.style.TextAlign.Center,modifier=Modifier.fillMaxWidth().height(44.dp).wrapContentHeight())
       Text(if(available)"${group.size}개 보유" else "${group.size}개 · 사용 보류",fontSize=11.sp,lineHeight=16.sp,color=Muted)
      }
     }
    };repeat(3-row.size){Spacer(Modifier.weight(1f))}
   }}
   if(data!=null&&data?.optJSONArray("inventory").objects().none{it.optBoolean("owned",true)}&&decorations.isEmpty()&&gifts?.isEmpty()==true)item{Text("보유한 아이템이 없어요.",fontSize=14.sp,color=Muted)}
  }
 }
 gift?.let{selected->OwnedGiftSendPage(m,selected,{gift=null}){result->gifts=result.optJSONArray("items").objects();gift=null;m.notice="선물을 보냈어요."}}
 decoration?.let{i->val request=remember(i.optString("id")){requestIdentity()};AlertDialog(onDismissRequest={if(!busy)decoration=null},title={Text("아이템을 사용할까요?")},text={Text("사용을 시작하면 이용 기간이 적용돼요. 액자는 장착하고, 배경은 토크룸 설정에서 선택할 수 있어요.")},dismissButton={TextButton({decoration=null},enabled=!busy){Text("취소")}},confirmButton={TextButton(enabled=!busy,onClick={busy=true;scope.launch{try{m.api.call("/api/decorations/inventory/${i.optString("id")}/use","POST",payload("request_id" to request));val result=m.api.call("/api/me/player",fresh=true);if(account==m.user?.optString("id")){data=result;decoration=null;error=null}}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}}){Text("사용 시작")}})}
}

@Composable private fun PlayerLevelStrip(p:JSONObject,open:()->Unit){
 val level=p.optInt("level",1);val xp=p.optInt("xp")
 Row(Modifier.fillMaxWidth().testTag("my-level").semantics{contentDescription="레벨 $level · 경험치 정보 보기"}.clip(RoundedCornerShape(10.dp)).background(Brush.horizontalGradient(listOf(Color(0xFF8B40DA),Color(0xFF5830C8),Color(0xFF2BACC9)))).clickable(onClick=open).heightIn(min=54.dp).padding(horizontal=12.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
  Icon(Icons.Rounded.EmojiEvents,null,Modifier.size(28.dp),tint=Pink)
  Column(Modifier.weight(1f).padding(start=10.dp)){
   Row(Modifier.fillMaxWidth()){Text("Lv.$level",fontSize=14.sp,fontWeight=FontWeight.Bold,color=Color.White);Spacer(Modifier.weight(1f));Text("$xp XP",fontSize=11.sp,color=Color.White)}
   LinearProgressIndicator(progress={p.optDouble("progress",0.0).toFloat().coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().padding(top=5.dp).height(4.dp),color=Pink,trackColor=Color.White.copy(alpha=.25f))
  }
 }
}
