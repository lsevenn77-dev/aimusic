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
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.platform.testTag
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

// ───── 입력창의 이모티콘 ─────
// 입력창에는 그림을 넣을 수 없어서, 토큰 자리를 빈칸 두 개로 바꿔 보이게 하고 그 위에 그림을 겹친다.
// 커서는 토큰 안으로 들어가지 않고, 일부만 지우면 토큰 전체를 지운다.
private const val StickerSlot="  "
private class StickerSlots(private val tokens:List<IntRange>):androidx.compose.ui.text.input.OffsetMapping{
 override fun originalToTransformed(offset:Int):Int{var shift=0
  for(t in tokens){val s=t.first;val e=t.last+1;if(offset<=s)break;if(offset<e)return s-shift;shift+=(e-s)-StickerSlot.length}
  return offset-shift}
 override fun transformedToOriginal(offset:Int):Int{var shift=0
  for(t in tokens){val s=t.first;val e=t.last+1;val ts=s-shift;if(offset<=ts)break;if(offset<ts+StickerSlot.length)return s;shift+=(e-s)-StickerSlot.length}
  return offset+shift}
}
internal fun keepStickersWhole(old:androidx.compose.ui.text.input.TextFieldValue,next:androidx.compose.ui.text.input.TextFieldValue):androidx.compose.ui.text.input.TextFieldValue{
 val a=old.text;val b=next.text;if(a==b)return next
 var p=0;while(p<a.length&&p<b.length&&a[p]==b[p])p++
 var s=0;while(s<a.length-p&&s<b.length-p&&a[a.length-1-s]==b[b.length-1-s])s++
 var start=p;var end=a.length-s;val inserted=b.substring(p,b.length-s)
 for(t in StickerTag.findAll(a)){val ts=t.range.first;val te=t.range.last+1;if(ts<end&&te>start||start==end&&ts<start&&start<te){start=minOf(start,ts);end=maxOf(end,te)}}
 if(start==p&&end==a.length-s)return next
 return androidx.compose.ui.text.input.TextFieldValue(a.substring(0,start)+inserted+a.substring(end),TextRange(start+inserted.length))
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun StickerTextField(value:androidx.compose.ui.text.input.TextFieldValue,onValueChange:(androidx.compose.ui.text.input.TextFieldValue)->Unit,placeholder:String,modifier:Modifier,enabled:Boolean,keyboardOptions:androidx.compose.foundation.text.KeyboardOptions,keyboardActions:androidx.compose.foundation.text.KeyboardActions,colors:TextFieldColors,shape:androidx.compose.ui.graphics.Shape){
 val library=roomStickers()
 val tokens=remember(value.text,library){StickerTag.findAll(value.text).filter{m->library.any{it.key==m.groupValues[1]}}.toList()}
 val transformation=remember(tokens){androidx.compose.ui.text.input.VisualTransformation{text->
  val out=buildString{var i=0;for(t in tokens){append(text.text,i,t.range.first);append(StickerSlot);i=t.range.last+1};append(text.text,i,text.text.length)}
  androidx.compose.ui.text.input.TransformedText(androidx.compose.ui.text.AnnotatedString(out),StickerSlots(tokens.map{it.range}))}}
 var layout by remember{mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null)}
 val interaction=remember{androidx.compose.foundation.interaction.MutableInteractionSource()}
 val density=androidx.compose.ui.platform.LocalDensity.current
 val textStyle=LocalTextStyle.current.copy(color=if(enabled)MaterialTheme.colorScheme.onSurface else Muted)
 androidx.compose.foundation.text.BasicTextField(value,onValueChange,modifier,enabled=enabled,textStyle=textStyle,keyboardOptions=keyboardOptions,keyboardActions=keyboardActions,singleLine=false,maxLines=5,visualTransformation=transformation,onTextLayout={layout=it},interactionSource=interaction,cursorBrush=SolidColor(Aqua)){inner->
  TextFieldDefaults.DecorationBox(value.text,innerTextField={Box{inner()
   layout?.let{l->var shift=0
    tokens.forEach{t->val ts=t.range.first-shift;shift+=(t.range.last+1-t.range.first)-StickerSlot.length
     if(ts+1<l.layoutInput.text.length){val r=l.getBoundingBox(ts).let{a->val b=l.getBoundingBox(ts+1);androidx.compose.ui.geometry.Rect(a.left,minOf(a.top,b.top),b.right,maxOf(a.bottom,b.bottom))}
      val side=minOf(r.width,r.height);val s=library.first{it.key==t.groupValues[1]}
      AsyncImage(s.url,s.label,Modifier.offset{androidx.compose.ui.unit.IntOffset((r.center.x-side/2).toInt(),(r.center.y-side/2).toInt())}.size(with(density){side.toDp()}).testTag("dm-input-sticker"))}}}
  }},enabled=enabled,singleLine=false,visualTransformation=transformation,interactionSource=interaction,placeholder={Text(placeholder,fontSize=13.sp)},shape=shape,colors=colors)
 }
}
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
