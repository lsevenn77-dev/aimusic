package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import org.json.JSONObject
import kotlin.math.*

/** A neutral crew emblem, not a replacement for a crew's uploaded logo. */
@Composable internal fun DefaultCrewArtwork(modifier:Modifier=Modifier){
 Canvas(modifier.background(Brush.linearGradient(listOf(Color(0xFF272842),Color(0xFF101B2C))))){
  val c=center;val r=size.minDimension*.38f
  drawCircle(Brush.linearGradient(listOf(Pink,Aqua)),r,c,style=Stroke(size.minDimension*.015f))
  drawCircle(Violet.copy(alpha=.25f),r*.72f,c,style=Stroke(size.minDimension*.009f))
  val star=Path().apply{repeat(16){i->val a=-PI/2+i*PI/8;val radius=if(i%2==0)r*(if(i%4==0).94f else .65f)else r*.21f;val x=c.x+cos(a).toFloat()*radius;val y=c.y+sin(a).toFloat()*radius;if(i==0)moveTo(x,y)else lineTo(x,y)};close()}
  drawPath(star,Brush.linearGradient(listOf(Pink,Violet,Aqua)))
  drawCircle(Ink,r*.13f,c);drawCircle(Aqua,r*.065f,c)
 }
}

private fun JSONObject.crewText(key:String)=optString(key).takeUnless{it.isBlank()||it=="null"||it=="0"}.orEmpty()
@Composable private fun RankCrewPhoto(row:JSONObject,crew:JSONObject?,modifier:Modifier){
 val id=row.crewText("id");val name=row.crewText("name")
 val version=crew?.crewText("image_version").orEmpty().ifBlank{row.crewText("image_version")}
 Box(modifier.clip(CircleShape).border(1.dp,BrandGradient,CircleShape).testTag("rank-crew-photo-$id")){
  DefaultCrewArtwork(Modifier.fillMaxSize())
  if(CurrentNavigation.safeID(id)&&version.isNotBlank())AsyncImage(Endpoint.url("/media/crew/$id?v=${CurrentNavigation.query(version)}"),"$name 사진",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
 }
}

@Composable internal fun CommunityPodium(rows:List<JSONObject>,category:String,card:@Composable (JSONObject,Int,Modifier)->Unit){
 val top=rows.take(3)
 val order=if(top.size>1)listOf(1,0)+top.indices.drop(2) else top.indices.toList()
 Column(Modifier.fillMaxWidth().testTag(if(category=="crew")"crew-rank-podium" else "ranking-podium-$category")){
  Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.Bottom){
   order.forEach{i->
    val width=if(top.size==1)Modifier.width(150.dp)else Modifier.weight(if(i==0)1.14f else 1f)
    card(top[i],i+1,width.height(if(i==0)208.dp else 177.dp))
   }
  }
  Canvas(Modifier.fillMaxWidth().height(18.dp)){
   val w=size.width;val h=size.height
   repeat(4){i->
    val path=Path().apply{moveTo(0f,h*.29f+i);cubicTo(w*.22f,h*1.35f,w*.32f,-h*.35f,w*.51f,h*.50f+i);cubicTo(w*.69f,h*1.25f,w*.87f,0f,w,h*.34f+i)}
    drawPath(path,Brush.horizontalGradient(listOf(Color.Transparent,Pink.copy(alpha=.22f),DiscoveryRose.copy(alpha=.28f),Color.Transparent)),style=Stroke(1.dp.toPx()))
   }
  }
 }
}

@Composable internal fun MyCrewRank(row:JSONObject,rank:Int,crew:JSONObject?,open:()->Unit){
 Surface(onClick=open,shape=RoundedCornerShape(14.dp),color=Panel,border=BorderStroke(1.dp,BrandGradient),modifier=Modifier.fillMaxWidth().padding(bottom=14.dp).testTag("my-crew-ranking")){
  Column(Modifier.background(Brush.linearGradient(listOf(Violet.copy(alpha=.12f),Aqua.copy(alpha=.04f)))).padding(12.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
   Text("내 크루 순위",fontSize=11.sp,lineHeight=16.sp,color=Pink)
   Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
    Text("${rank}위",fontSize=19.sp,fontWeight=FontWeight.Bold)
    RankCrewPhoto(row,crew,Modifier.size(40.dp))
    Column(Modifier.weight(1f)){
     Text(row.crewText("name"),fontSize=14.sp,maxLines=1,overflow=TextOverflow.Ellipsis,fontWeight=FontWeight.SemiBold)
     crew?.let{Text("LV.${it.optInt("level",1)} · ${it.optInt("members")}명",fontSize=11.sp,lineHeight=16.sp,color=Muted)}
    }
    val change=communityRankChange(row,rank)
    Text(change.first,fontSize=11.sp,color=Pink,modifier=Modifier.semantics{contentDescription=change.second})
    Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
   }
  }
 }
}
