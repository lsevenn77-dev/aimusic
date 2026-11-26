package kr.co.aifect.app

import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import coil.compose.AsyncImage
import kotlinx.coroutines.*
import org.json.JSONObject

internal data class MemberStyle(val until:Long=0, val defaultFrame:Boolean=false)
private fun JSONObject.memberStyle()=MemberStyle(optLong("premium_style_until"),optInt("premium_default_frame")==1)
private val memberId=Regex("[-a-zA-Z0-9_]{1,100}")
private fun lookupKey(person:JSONObject):String?{
 fun id(key:String)=person.optString(key).takeIf { it!="null" && memberId.matches(it) }
 return id("profile_id") ?: id("user_id")?.let{"member:$it"} ?: id("id")
}

// Visible nicknames and photos share one public identity lookup per batch.
private object MemberStyles {
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 private val waiting=linkedMapOf<String,CompletableDeferred<MemberStyle>>()
 private val cache=android.util.LruCache<String,Pair<Long,MemberStyle>>(500)
 private var scheduled=false
 private var client:NativeApi?=null
 suspend fun load(key:String,context:android.content.Context):MemberStyle{
  val api=client?:NativeApi(context).also{client=it}
  val now=System.currentTimeMillis()/1000
  cache.get(key)?.takeIf{it.first>now}?.let{return it.second}
  val result=waiting.getOrPut(key){CompletableDeferred()}
  if(!scheduled){
   scheduled=true
   scope.launch{
    delay(25)
    val batch=waiting.toMap();waiting.clear();scheduled=false
    for(keys in batch.keys.chunked(60)){
     val byKey=try{
      api.call("/api/decorations/avatars?profiles="+CurrentNavigation.query(keys.joinToString(",")),fresh=true)
       .getJSONArray("avatars").objects().associateBy{it.optString("lookup_key",it.optString("profile_id"))}
     }catch(e:Exception){if(e is CancellationException)throw e;emptyMap()}
     for(id in keys){
      val value=byKey[id]?.memberStyle()?:MemberStyle()
      cache.put(id,(System.currentTimeMillis()/1000+60) to value)
      batch[id]?.complete(value)
     }
    }
   }
  }
  return result.await()
 }
}

@Composable internal fun memberStyle(person:JSONObject?):MemberStyle {
 if(person==null || person.optString("profile_kind")=="artist")return MemberStyle()
 val key=lookupKey(person)
 val supplied=person.takeIf{it.has("premium_style_until")}?.memberStyle()
 val context=LocalContext.current.applicationContext
 return key(key,supplied){
  var style by remember{ mutableStateOf(supplied ?: MemberStyle()) }
  LaunchedEffect(key,supplied){
   if(supplied==null && key!=null)style=MemberStyles.load(key,context)
   if(style.until>0){
    delay((style.until*1000-System.currentTimeMillis()).coerceAtLeast(0))
    style=MemberStyle()
   }
  }
  if(style.until>System.currentTimeMillis()/1000)style else MemberStyle()
 }
}

@Composable internal fun MemberName(person:JSONObject?, text:String, modifier:Modifier=Modifier,
 fontSize:TextUnit=TextUnit.Unspecified, lineHeight:TextUnit=TextUnit.Unspecified,
 fontWeight:FontWeight?=null, color:Color=Color.Unspecified, maxLines:Int=Int.MAX_VALUE,
 overflow:TextOverflow=TextOverflow.Clip,textAlign:TextAlign?=null){
 if(memberStyle(person).until==0L){
  Text(text,modifier,color=color,fontSize=fontSize,lineHeight=lineHeight,fontWeight=fontWeight,maxLines=maxLines,overflow=overflow,textAlign=textAlign)
 }else{
  val label=buildAnnotatedString{append(text);appendInlineContent("gold-star"," 프리미엄")}
  val badge=InlineTextContent(Placeholder(1.05.em,.90.em,PlaceholderVerticalAlign.TextCenter)){
   AsyncImage(Endpoint.url("/assets/premium/gold-star.png"),null)
  }
  Text(label,modifier,color=Color(0xFFF5C66F),fontSize=fontSize,lineHeight=lineHeight,fontWeight=fontWeight,
   maxLines=maxLines,overflow=overflow,textAlign=textAlign,inlineContent=mapOf("gold-star" to badge))
 }
}
