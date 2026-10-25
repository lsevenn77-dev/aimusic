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

@Composable private fun RankCrown(rank:Int){
 val color=when(rank){1->Color(0xFFE7C483);2->Violet;else->Color(0xFFC3A1AA)}
 Column(horizontalAlignment=Alignment.CenterHorizontally){
  Canvas(Modifier.size(30.dp,17.dp)){
   val w=size.width;val h=size.height
   val crown=Path().apply{moveTo(w*.12f,h*.2f);lineTo(w*.32f,h*.5f);lineTo(w*.5f,0f);lineTo(w*.68f,h*.5f);lineTo(w*.88f,h*.2f);lineTo(w*.78f,h*.88f);lineTo(w*.22f,h*.88f);close()}
   drawPath(crown,Brush.verticalGradient(listOf(color,color.copy(alpha=.35f))))
   drawLine(color,Offset(w*.23f,h),Offset(w*.77f,h),2.dp.toPx())
  }
  Text("$rank",fontSize=16.sp,lineHeight=21.sp,fontWeight=FontWeight.Bold,color=color)
 }
}

@Composable internal fun CrewRankPodium(rows:List<JSONObject>,crews:Map<String,JSONObject>,open:(JSONObject)->Unit){
 val top=rows.take(3)
 val ordered=if(top.size>=2)listOf(top[1],top[0])+top.drop(2)else top
 Box(Modifier.fillMaxWidth().testTag("crew-rank-podium").padding(bottom=14.dp)){
  Canvas(Modifier.matchParentSize()){
   drawRect(Brush.radialGradient(listOf(Violet.copy(alpha=.20f),Color.Transparent),Offset(size.width*.5f,size.height*.72f),size.width*.6f))
   repeat(21){i->val x=size.width*((i*47%101)/100f);val y=size.height*((i*23%71)/100f);drawCircle(Violet.copy(alpha=if(i%3==0).5f else .18f),if(i%3==0)1.2.dp.toPx()else .7.dp.toPx(),Offset(x,y))}
   drawLine(Brush.horizontalGradient(listOf(Color.Transparent,Pink,Aqua,Color.Transparent)),Offset(0f,size.height-3.dp.toPx()),Offset(size.width,size.height-3.dp.toPx()),1.dp.toPx())
  }
  Row(Modifier.fillMaxWidth().padding(top=8.dp,bottom=8.dp),horizontalArrangement=Arrangement.spacedBy(8.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.Bottom){
   ordered.forEach{row->val position=top.indexOf(row)+1;val rank=row.optInt("rank",position).takeIf{it>0}?:position;val winner=rank==1;val crew=crews[row.crewText("id")];val movement=communityRankChange(row,rank)
    Column((if(top.size==1)Modifier.width(148.dp)else Modifier.weight(if(winner)1.15f else 1f)).height(if(winner)244.dp else 218.dp).clip(RoundedCornerShape(15.dp)).background(Brush.verticalGradient(listOf(if(winner)Color(0xFF353453)else Color(0xFF21283D),Panel.copy(alpha=.88f)))).border(1.dp,if(winner)BrandGradient else Brush.verticalGradient(listOf(Violet.copy(alpha=.7f),Aqua.copy(alpha=.22f))),RoundedCornerShape(15.dp)).clickable{open(row)}.testTag("community-rank-crew-${row.crewText("id")}").padding(horizontal=6.dp,vertical=10.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(7.dp)){
     RankCrown(rank)
     RankCrewPhoto(row,crew,Modifier.size(if(winner)66.dp else 54.dp))
     Text(row.crewText("name"),fontSize=if(winner)14.sp else 12.sp,lineHeight=18.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth())
     crew?.let{Text("LV.${it.optInt("level",1)}",fontSize=10.sp,lineHeight=14.sp,color=SoftText,modifier=Modifier.background(Violet.copy(alpha=.15f),CircleShape).padding(horizontal=8.dp,vertical=3.dp))}
     Text(movement.first,fontSize=11.sp,lineHeight=15.sp,color=if(movement.first.startsWith("▼"))Aqua else if(movement.first=="—")Muted else Pink,modifier=Modifier.testTag("community-movement-crew-${row.crewText("id")}").semantics{contentDescription=movement.second})
    }
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
