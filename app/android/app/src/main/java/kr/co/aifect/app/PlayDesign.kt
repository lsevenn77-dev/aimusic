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

internal val DiscoveryRose=Color(0xFFF39EBB)
internal val DiscoveryGradient=Brush.horizontalGradient(listOf(Violet,DiscoveryRose))

@Composable internal fun DiscoverySections(items:List<Pair<String,String>>,selected:String,tag:String,modifier:Modifier=Modifier,onSelect:(String)->Unit){
 Row(modifier.fillMaxWidth().testTag(tag),horizontalArrangement=Arrangement.spacedBy(4.dp)){
  items.forEach{(key,label)->
   val active=key==selected
   val image=when(key){
    "recommended"->R.drawable.nav_orbit_recommended
    "following"->R.drawable.nav_orbit_following
    "popular"->R.drawable.nav_orbit_popular
    "latest"->R.drawable.nav_orbit_latest
    "duets"->R.drawable.nav_orbit_duets
    "drafts"->R.drawable.nav_orbit_drafts
    "work"->R.drawable.nav_orbit_work
    "aiArtist"->R.drawable.nav_orbit_aiartist
    "crew"->R.drawable.nav_orbit_crew
    "dubbing"->R.drawable.nav_orbit_dubbing
    else->error("Unknown discovery category: $key")
   }
   Column(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).selectable(active,role=Role.Tab){onSelect(key)}
    .testTag("$tag-$key").heightIn(min=62.dp).padding(vertical=3.dp),
    horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(2.dp)){
    Image(androidx.compose.ui.res.painterResource(image),null,Modifier.size(if(tag=="play-section")30.dp else 27.dp),alpha=if(active||tag=="play-section")1f else .78f)
    Text(label,Modifier.testTag(if(tag=="ranking-category")"ranking-label-$key" else "play-label-$key"),fontSize=12.sp,lineHeight=15.sp,maxLines=2,textAlign=TextAlign.Center,color=if(active)Pink else SoftText,fontWeight=if(active)FontWeight.Bold else FontWeight.Medium)
    Spacer(Modifier.size(4.dp).background(if(active)Violet else Color.Transparent,androidx.compose.foundation.shape.CircleShape))
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
 Column(Modifier.fillMaxWidth().testTag("current-track-${song.id}")){
  Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).testTag("duet-card-art-${song.id}")){
   Artwork(song,Modifier.fillMaxSize().clickable{m.openSong(song)},12.dp)
   BrandPlayButton("${song.title} 먼저 듣기",{m.play(song,queue)},Modifier.align(Alignment.BottomEnd).padding(5.dp),diameter=34.dp)
  }
  Row(Modifier.fillMaxWidth().heightIn(min=44.dp),verticalAlignment=Alignment.CenterVertically){
   Row(Modifier.weight(1f).clickable{m.openSong(song)},verticalAlignment=Alignment.CenterVertically){
    Icon(Icons.Rounded.PeopleOutline,null,Modifier.size(15.dp),tint=Muted);Spacer(Modifier.width(4.dp))
    Text(song.title,fontSize=15.sp,lineHeight=21.sp,maxLines=1,overflow=TextOverflow.Ellipsis,fontWeight=FontWeight.SemiBold)
   }
   TrackActionsMenu(song,m,Modifier.size(36.dp))
  }
  Text(song.credit,fontSize=13.sp,lineHeight=19.sp,maxLines=1,overflow=TextOverflow.Ellipsis,color=Muted)
  Text(count,fontSize=12.sp,lineHeight=18.sp,maxLines=1,color=Muted,modifier=Modifier.padding(top=3.dp).testTag("duet-participation-${song.id}"))
  OutlinedButton(onClick={m.singTarget(song,sing)},modifier=Modifier.fillMaxWidth().padding(top=10.dp).heightIn(min=44.dp).testTag("current-sing-${song.id}"),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,SoftText.copy(alpha=.3f)),colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText),contentPadding=PaddingValues(horizontal=8.dp,vertical=8.dp)){
   Icon(Icons.Rounded.Mic,null,Modifier.size(16.dp));Text("듀엣 참여",fontSize=13.sp,lineHeight=18.sp,modifier=Modifier.padding(start=5.dp))
  }
 }
}

@Composable internal fun DubbingCover(project:JSONObject,modifier:Modifier=Modifier){
 Box(modifier.clip(RoundedCornerShape(12.dp)).background(Panel),contentAlignment=Alignment.Center){
  Icon(Icons.Rounded.TheaterComedy,null,Modifier.fillMaxSize(.5f),tint=Violet)
  DubbingImage(currentDubbingImage(project),Modifier.fillMaxSize())
 }
}
