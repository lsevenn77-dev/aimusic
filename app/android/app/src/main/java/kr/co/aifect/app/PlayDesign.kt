@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import org.json.JSONObject
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal fun Song.openDuetFor(userId:String?):Boolean=cover&&raw.optString("cover_mode")=="duet"&&
 (raw.optInt("duet_open")==1||raw.optBoolean("duet_open"))&&
 raw.optString("duet_parent_id").let{it.isBlank()||it=="null"}&&
 CurrentNavigation.safeID(raw.optString("original_id"))&&raw.optString("user_id")!=userId

/** Shared default profile artwork; uploaded profile images always paint over it. */
@Composable internal fun DefaultProfileArtwork(name:String,modifier:Modifier=Modifier){
 Canvas(modifier.background(Brush.linearGradient(listOf(Color(0xFF36344D),Color(0xFF243D47)))).semantics{contentDescription="$name 기본 프로필"}.testTag("default-profile-artwork")){
  val w=size.width;val h=size.height;val scale=size.minDimension
  val paint=Brush.linearGradient(listOf(Pink,Violet,Aqua),Offset(w*.2f,h*.2f),Offset(w*.8f,h*.8f))
  drawCircle(paint,scale*.105f,Offset(w*.5f,h*.36f))
  val shoulders=Path().apply{moveTo(w*.27f,h*.75f);cubicTo(w*.27f,h*.58f,w*.38f,h*.53f,w*.5f,h*.53f);cubicTo(w*.62f,h*.53f,w*.73f,h*.58f,w*.73f,h*.75f);quadraticBezierTo(w*.5f,h*.82f,w*.27f,h*.75f);close()}
  drawPath(shoulders,paint)
 }
}

@Composable internal fun PlaySections(items:List<Pair<String,String>>,selected:String,onSelect:(String)->Unit){
 Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(horizontal=16.dp,vertical=14.dp).testTag("play-section"),horizontalArrangement=Arrangement.spacedBy(8.dp)){
  items.forEach{(key,label)->val active=selected==key
   val icon=when(key){"duets","join"->Icons.Rounded.PeopleOutline;"latest"->Icons.Rounded.Schedule;"drafts"->Icons.Rounded.EditNote;"mine"->Icons.Rounded.FolderOpen;"popular"->Icons.Rounded.BarChart;"following"->Icons.Rounded.FavoriteBorder;"discover"->Icons.Rounded.Explore;else->Icons.Rounded.AutoAwesome}
   Column(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(13.dp)).background(if(active)Violet.copy(alpha=.13f)else Panel).border(1.dp,if(active)Violet else Stroke,RoundedCornerShape(13.dp)).selectable(active,role=Role.Tab){onSelect(key)}.testTag("play-section-$key").padding(vertical=10.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(7.dp)){
    Icon(icon,null,Modifier.size(20.dp),tint=if(active)Pink else Muted)
    Text(label,fontSize=12.sp,lineHeight=16.sp,maxLines=2,color=if(active)Pink else SoftText,fontWeight=FontWeight.Medium,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth().padding(horizontal=1.dp))
   }
  }
 }
}

@Composable internal fun SelectionField(label:String,value:String,tag:String,modifier:Modifier=Modifier,enabled:Boolean=true,onClick:()->Unit){
 Surface(onClick=onClick,enabled=enabled,color=Panel,shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke),modifier=modifier.testTag(tag)){
  Row(Modifier.heightIn(min=64.dp).padding(horizontal=14.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically){
   Column(Modifier.weight(1f)){Text(label,fontSize=11.sp,color=Muted);Text(value,fontSize=14.sp,lineHeight=20.sp,maxLines=1,overflow=TextOverflow.Ellipsis,color=SoftText,modifier=Modifier.padding(top=4.dp))}
   Icon(Icons.Rounded.ExpandMore,null,Modifier.size(20.dp),tint=Muted)
  }
 }
}

@Composable internal fun SelectionSheet(title:String,choices:List<Pair<String,String>>,selected:List<String>,tag:String,dismiss:()->Unit,multiple:Boolean=false,onSelect:(String)->Unit){
 ModalBottomSheet(onDismissRequest=dismiss,containerColor=Panel){
  Text(title,fontSize=20.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(horizontal=20.dp).padding(bottom=16.dp))
  LazyColumn(Modifier.fillMaxWidth().heightIn(max=420.dp),contentPadding=PaddingValues(horizontal=12.dp)){
   items(choices,key={it.first}){(key,label)->Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).selectable(key in selected,role=if(multiple)Role.Checkbox else Role.RadioButton){onSelect(key);if(!multiple)dismiss()}.testTag("$tag-$key").heightIn(min=52.dp).padding(horizontal=12.dp),verticalAlignment=Alignment.CenterVertically){
    Text(label,Modifier.weight(1f),fontSize=15.sp,color=if(key in selected)Pink else SoftText)
    if(multiple)Checkbox(key in selected,null)else RadioButton(key in selected,null)
   }}
  }
  BrandButton(dismiss,Modifier.fillMaxWidth().padding(20.dp)){Text("선택 완료")}
 }
}

@Composable internal fun DuetParticipationRow(song:Song,m:MusicModel,queue:List<Song>,sing:(Song)->Unit){
 val original=song.raw.optString("original_id")
 val read=currentRead(m,"/api/tracks/$original/covers?mode=duet&sort=recent")
 val matches=read.data?.optJSONArray("covers").objects().filter{it.optString("duet_parent_id")==song.id&&it.optInt("duet_open")==0}
 val participants=matches.mapNotNull{it.optString("user_id").takeIf{v->v.isNotBlank()&&v!="null"}}.distinct().size
 val complete=read.data?.optJSONObject("counts")?.optInt("duet",Int.MAX_VALUE)?.let{it<=read.data?.optJSONArray("covers").objects().size}==true
 val count=when{read.data==null->if(read.loading)"참여 집계 중" else "참여 집계 확인 중";complete->"${participants}명 참여";else->"${participants}명 이상 참여"}
 Row(Modifier.fillMaxWidth().testTag("current-track-${song.id}").padding(vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(10.dp),verticalAlignment=Alignment.CenterVertically){
  Box(Modifier.size(56.dp)){
   Artwork(song,Modifier.fillMaxSize().clickable{m.openSong(song)},10.dp)
   BrandPlayButton("${song.title} 먼저 듣기",{m.play(song,queue)},Modifier.align(Alignment.Center),diameter=26.dp)
  }
  Column(Modifier.weight(1f).clickable{m.openSong(song)}){
   Text(song.title,fontSize=15.sp,lineHeight=21.sp,maxLines=1,overflow=TextOverflow.Ellipsis,fontWeight=FontWeight.SemiBold)
   Text(song.credit,fontSize=12.sp,lineHeight=18.sp,maxLines=1,overflow=TextOverflow.Ellipsis,color=Muted)
  }
  Column(horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(2.dp)){
   Text(count,fontSize=10.sp,lineHeight=14.sp,maxLines=1,color=Muted,modifier=Modifier.testTag("duet-participation-${song.id}"))
   BrandButton({m.singTarget(song,sing)},Modifier.heightIn(min=44.dp).testTag("current-sing-${song.id}"),contentPadding=PaddingValues(horizontal=12.dp,vertical=8.dp)){Text("참여",fontSize=12.sp,lineHeight=18.sp)}
  }
 }
 HorizontalDivider(color=Stroke)
}

@Composable internal fun DubbingCover(project:JSONObject,modifier:Modifier=Modifier){
 Box(modifier.clip(RoundedCornerShape(12.dp)).background(Panel),contentAlignment=Alignment.Center){
  Icon(Icons.Rounded.TheaterComedy,null,Modifier.fillMaxSize(.5f),tint=Violet)
  AsyncImage(currentDubbingImage(project),"더빙 장르 이미지",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
 }
}
