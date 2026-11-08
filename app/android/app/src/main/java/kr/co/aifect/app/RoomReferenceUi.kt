package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

internal fun Modifier.roomGlass(radius:Int=16):Modifier{
 val shape=RoundedCornerShape(radius.dp)
 return clip(shape).drawWithCache{
  val radiusLight=38.dp.toPx()
  val hi=Brush.radialGradient(listOf(Color.White.copy(alpha=.19f),Color.Transparent),Offset.Zero,radiusLight)
  val lo=Brush.radialGradient(listOf(Color.White.copy(alpha=.13f),Color.Transparent),Offset(size.width,size.height),radiusLight)
  onDrawBehind{drawRect(hi);drawRect(lo)}
 }.border(.75.dp,Brush.linearGradient(listOf(Color.White.copy(alpha=.68f),Color.White.copy(alpha=.23f),Color.White.copy(alpha=.48f))),shape)
}
@Composable internal fun RoomTitle(room:JSONObject,members:Int,modifier:Modifier=Modifier){
 val created=room.optLong("created")
 var elapsed by remember(created){mutableLongStateOf(0L)}
 LaunchedEffect(created){if(created>0)while(true){elapsed=((System.currentTimeMillis()-created)/1000).coerceAtLeast(0);delay(1000)}}
 Column(modifier){Text(room.optString("title").ifBlank{"토킹룸"},fontSize=17.sp,lineHeight=22.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
  Text(if(created>0)java.lang.String.format(java.util.Locale.ROOT,"%02d:%02d:%02d",elapsed/3600,elapsed/60%60,elapsed%60)else "참여자 "+members+"명",fontSize=12.sp,lineHeight=16.sp,color=Muted)}
}
internal data class RoomSticker(val key:String,val label:String,val group:String,val url:String)
@Composable private fun roomStickers():List<RoomSticker>{
 val ctx=LocalContext.current
 return remember(ctx){val rows=JSONArray(ctx.resources.openRawResource(R.raw.room_stickers).bufferedReader().use{it.readText()});rows.objects().map{val group=it.getString("group");val key=it.getString("key");RoomSticker(key,it.getString("label"),group,Endpoint.url("/assets/chat-stickers/"+it.optString("assetVersion",if(group=="text")"v2" else "v1")+"/"+group+"/"+key+".webp"))}}
}
@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun RoomStickerPicker(insert:(String)->Unit){
 val library=roomStickers();var group by remember{mutableStateOf("basic")}
 Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())){listOf("basic" to "표정","hand" to "손짓","text" to "텍스트","prop" to "효과").forEach{(key,title)->TextButton({group=key}){Text(title,color=if(key==group)Aqua else Muted)}}}
 FlowRow(Modifier.fillMaxWidth()){library.filter{it.group==group}.forEach{item->Box(Modifier.size(46.dp).clickable(role=Role.Button,onClickLabel=item.label){insert("[aifect:"+item.key+"]")},contentAlignment=Alignment.Center){AsyncImage(item.url,item.label,Modifier.size(24.dp))}}}
}
private val StickerTag=Regex("\\[aifect:([a-z0-9_]+)\\]")
// 목록 미리보기처럼 그림을 넣을 수 없는 곳: 웹과 같이 [라벨]로 바꾼다
@Composable internal fun stickerPreview(body:String):String{
 val library=roomStickers()
 return remember(body,library){StickerTag.replace(body){m->library.firstOrNull{it.key==m.groupValues[1]}?.let{"["+it.label+"]"}?:m.value}}
}
// 메시지 본문의 [aifect:키]를 고양이 이모티콘 그림으로 그린다 (토킹룸·메시지함 공통)
@Composable internal fun StickerText(body:String,fontSize:androidx.compose.ui.unit.TextUnit,lineHeight:androidx.compose.ui.unit.TextUnit,modifier:Modifier=Modifier,color:Color=Color.Unspecified,stickerSize:androidx.compose.ui.unit.TextUnit=22.sp){
 val library=roomStickers();val tags=remember(body){StickerTag.findAll(body).toList()}
 if(tags.isEmpty()){Text(body,modifier,fontSize=fontSize,lineHeight=lineHeight,color=color);return}
 val inline=mutableMapOf<String,androidx.compose.foundation.text.InlineTextContent>()
 val rich=androidx.compose.ui.text.buildAnnotatedString{var i=0;for(m in tags){append(body.substring(i,m.range.first));val s=library.firstOrNull{it.key==m.groupValues[1]};if(s==null)append(m.value)else{inline[s.key]=androidx.compose.foundation.text.InlineTextContent(androidx.compose.ui.text.Placeholder(stickerSize,stickerSize,androidx.compose.ui.text.PlaceholderVerticalAlign.TextCenter)){AsyncImage(s.url,s.label,Modifier.fillMaxSize())};appendInlineContent(s.key,s.label)};i=m.range.last+1};append(body.substring(i))}
 Text(rich,modifier,inlineContent=inline,fontSize=fontSize,lineHeight=maxOf(lineHeight.value,stickerSize.value).sp,color=color)
}
@Composable internal fun RoomMessageBody(body:String){StickerText(body,13.sp,18.sp,color=SoftText)}
@Composable internal fun RoomChatBubble(author:JSONObject,name:String,body:String,own:Boolean,profile:()->Unit){
 Row(Modifier.fillMaxWidth(),horizontalArrangement=if(own)Arrangement.End else Arrangement.Start,verticalAlignment=Alignment.Top){
  val avatar:@Composable ()->Unit={Box(Modifier.size(44.dp).clickable(role=Role.Button,onClickLabel=name+" 프로필",onClick=profile),contentAlignment=Alignment.Center){NativeMemberAvatar(author,28)}}
  if(!own)avatar()
  Column(Modifier.widthIn(max=256.dp).padding(vertical=2.dp),horizontalAlignment=if(own)Alignment.End else Alignment.Start){
   Text(name,fontWeight=FontWeight.Bold,fontSize=13.sp,lineHeight=18.sp,color=SoftText,maxLines=1,overflow=TextOverflow.Ellipsis)
   Box(Modifier.roomGlass(13).padding(horizontal=9.dp,vertical=4.dp)){RoomMessageBody(body)}
  };if(own)avatar()
 }
}
