package kr.co.aifect.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import org.json.JSONObject

internal fun singingCardColumns(widthDp: Float, fontScale: Float): Int = if(widthDp >= 600 && fontScale <= 1.3f) 2 else 1

/** The same photography as the web. Text remains native, scalable and accessible. */
@Composable internal fun WebMusicBanner(title:String,subtitle:String,eyebrow:String="AIFECT COMMUNITY"){
 Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.dp,Stroke,RoundedCornerShape(18.dp))){
  Image(painterResource(R.drawable.community_studio),null,Modifier.matchParentSize(),contentScale=ContentScale.Crop,alignment=Alignment.CenterEnd)
  Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Ink.copy(alpha=.85f),Ink.copy(alpha=.68f),Ink.copy(alpha=.15f)))))
  Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
   Text(eyebrow,color=Pink,fontSize=10.sp,letterSpacing=1.3.sp,fontWeight=FontWeight.SemiBold)
   Text(title,fontSize=23.sp,fontWeight=FontWeight.Bold,color=Color.White)
   Text(subtitle,color=SoftText,fontSize=12.sp,modifier=Modifier.fillMaxWidth(.78f))
  }
 }
}

@Composable internal fun SingReadyCards(tracks:List<Song>,m:MusicModel,sing:(Song)->Unit){
 BoxWithConstraints(Modifier.fillMaxWidth()){
  val columns=singingCardColumns(maxWidth.value,LocalDensity.current.fontScale)
  Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
   tracks.chunked(columns).forEach{row->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
    row.forEach{song->SingReadyCard(song,m,tracks,sing,Modifier.weight(1f))}
    repeat(columns-row.size){Spacer(Modifier.weight(1f))}
   }}
  }
 }
}

@Composable internal fun SingReadyCard(song:Song,m:MusicModel,queue:List<Song>,sing:(Song)->Unit,modifier:Modifier=Modifier){
 Column(modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).musicSurface(feature=true).musicIllustration().padding(16.dp).testTag("sing-ready-${song.id}"),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Row(verticalAlignment=Alignment.Top){
   Artwork(song,Modifier.size(64.dp).clickable{m.openSong(song)})
   Column(Modifier.weight(1f).padding(start=12.dp)){
    Text(song.title,fontSize=17.sp,lineHeight=23.sp,fontWeight=FontWeight.SemiBold,style=MaterialTheme.typography.bodyMedium.copy(lineBreak=LineBreak.Paragraph))
    Text(song.credit,color=Muted,fontSize=13.sp,lineHeight=19.sp,modifier=Modifier.padding(top=4.dp))
    Text("MR 준비 완료 · ${timeLabel((song.duration*1000).toLong())}",color=Aqua,fontSize=11.sp,modifier=Modifier.padding(top=5.dp))
   }
  }
  GenreTags(song.genres,Modifier.testTag("sing-genres-${song.id}"))
  Text(song.description.trim().ifEmpty{"원곡을 들어보고, 준비된 반주에 나만의 목소리를 담아보세요."},fontSize=12.sp,lineHeight=19.sp,color=SoftText,style=MaterialTheme.typography.bodySmall.copy(lineBreak=LineBreak.Paragraph),modifier=Modifier.fillMaxWidth().testTag("sing-description-${song.id}"))
  FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
   OutlinedButton(onClick={m.play(song,queue)},contentPadding=PaddingValues(horizontal=14.dp),modifier=Modifier.testTag("sing-ready-play-${song.id}")){
    Icon(Icons.Rounded.PlayArrow,null,Modifier.size(18.dp));Text("재생",fontSize=13.sp,modifier=Modifier.padding(start=4.dp))
   }
   Button(onClick={sing(song)},colors=ButtonDefaults.buttonColors(containerColor=Pink,contentColor=Ink),contentPadding=PaddingValues(horizontal=14.dp)){
    Icon(Icons.Rounded.Mic,null,Modifier.size(18.dp));Text("부르기",fontSize=13.sp,modifier=Modifier.padding(start=4.dp))
   }
  }
  TextButton(onClick={m.openCovers(song)},contentPadding=PaddingValues(0.dp),modifier=Modifier.fillMaxWidth().testTag("sing-ready-covers-${song.id}")){
   Icon(Icons.Rounded.PeopleOutline,null,Modifier.size(17.dp))
   Text("커버 ${song.raw.optInt("covers").coerceAtLeast(0)} · 참여 커버 보기",fontSize=12.sp,modifier=Modifier.weight(1f).padding(horizontal=6.dp))
   Icon(Icons.Rounded.ChevronRight,null,Modifier.size(17.dp))
  }
 }
}

@Composable internal fun GenreTags(genres:List<String>,modifier:Modifier=Modifier){
 FlowRow(modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
  genres.map{it.trim()}.filter{it.isNotEmpty()}.distinct().forEach{genre->
   Text(genre,fontSize=11.sp,lineHeight=16.sp,color=Violet,modifier=Modifier.clip(RoundedCornerShape(50)).background(Violet.copy(alpha=.08f)).border(1.dp,Violet.copy(alpha=.25f),RoundedCornerShape(50)).padding(horizontal=10.dp,vertical=5.dp))
  }
 }
}

internal fun rankedCrews(crews:List<JSONObject>)=crews.sortedWith(compareByDescending<JSONObject>{it.optInt("level")}.thenByDescending{it.optInt("xp")}.thenBy{it.optString("id")})

@Composable internal fun MusicBannerPanel(title:String,subtitle:String,icon:androidx.compose.ui.graphics.vector.ImageVector,tag:String,action:(()->Unit)?=null,content:@Composable ColumnScope.()->Unit){
 Column(Modifier.fillMaxWidth().padding(top=16.dp).clip(RoundedCornerShape(20.dp)).musicSurface(feature=true).border(1.dp,Stroke,RoundedCornerShape(20.dp)).padding(14.dp).testTag(tag)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Icon(icon,null,tint=Pink,modifier=Modifier.size(20.dp))
   Text(title,fontSize=17.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f).padding(start=8.dp))
   if(action!=null)IconButton(onClick=action){Icon(Icons.Rounded.ChevronRight,"$title 더보기",tint=Muted)}
  }
  Text(subtitle,fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=6.dp,bottom=12.dp))
  content()
 }
}

internal fun crewMetricFraction(value:Int,target:Int,start:Int=0):Float =
 if(target<=start)0f else ((value.toDouble()-start)/(target.toDouble()-start)).toFloat().coerceIn(0f,1f)

/** Only server-provided totals/rules are charted; no invented activity history. */
@Composable internal fun CrewAboutPanel(crew:JSONObject,rules:JSONObject,trackCount:Int){
 val level=crew.optInt("level");val xp=crew.optInt("xp");val next=crew.optInt("next_xp")
 val levels=rules.optJSONArray("levels").objects()
 val start=levels.firstOrNull{it.optInt("level")==level}?.optInt("xp")?:0
 val members=crew.optInt("members");val capacity=crew.optInt("capacity")
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).musicSurface(feature=true).border(1.dp,Stroke,RoundedCornerShape(20.dp)).padding(16.dp).testTag("crew-about-visual"),verticalArrangement=Arrangement.spacedBy(16.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Box(Modifier.size(76.dp).clip(RoundedCornerShape(18.dp)).background(Raised),contentAlignment=Alignment.Center){
    Icon(Icons.Rounded.Groups,null,tint=Aqua,modifier=Modifier.size(34.dp))
    if(crew.optString("image_version").isNotBlank())AsyncImage(Endpoint.url("/media/crew/${crew.optString("id")}?v=${crew.optString("image_version")}"),"크루 이미지",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
   }
   Column(Modifier.weight(1f).padding(start=14.dp)){
    Text("OUR CREW",fontSize=10.sp,letterSpacing=1.sp,color=Pink)
    Text(crew.optString("name"),fontSize=20.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
    Text("레벨 $level · 함께 만드는 음악",fontSize=12.sp,color=Aqua,modifier=Modifier.padding(top=6.dp))
   }
  }
  Text(crew.optString("description").ifBlank{"아직 소개가 등록되지 않았어요."},fontSize=14.sp,lineHeight=21.sp,color=SoftText)
  if(crew.optString("interests").isNotBlank())Text(crew.optString("interests"),fontSize=12.sp,color=Violet)
  HorizontalDivider(color=Stroke)
  Row(verticalAlignment=Alignment.CenterVertically){Icon(Icons.Rounded.AutoAwesome,null,tint=Aqua,modifier=Modifier.size(20.dp));Text("크루 성장",fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f).padding(start=8.dp));Text("$xp XP",fontSize=16.sp,color=Aqua,fontWeight=FontWeight.Bold)}
  if(next>start){
   LinearProgressIndicator(progress={crewMetricFraction(xp,next,start)},modifier=Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).testTag("crew-xp-progress"),color=Aqua,trackColor=Stroke,drawStopIndicator={})
   Text("LV ${level+1}까지 ${(next-xp).coerceAtLeast(0)} XP",fontSize=12.sp,color=Muted)
  }else if(levels.lastOrNull()?.optInt("level")==level)Text("최고 레벨에 도달했어요",fontSize=12.sp,color=Aqua)
  Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)){
   Box(Modifier.size(76.dp),contentAlignment=Alignment.Center){
    CircularProgressIndicator(progress={crewMetricFraction(members,capacity)},modifier=Modifier.fillMaxSize().testTag("crew-members-progress"),color=Pink,strokeWidth=6.dp,trackColor=Stroke)
    Icon(Icons.Rounded.PeopleOutline,null,tint=Pink,modifier=Modifier.size(26.dp))
   }
   Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(6.dp)){
    Text("함께하는 멤버",fontSize=13.sp,color=Muted)
    Text(if(capacity>0)"${members}명 / ${capacity}명" else "${members}명",fontSize=18.sp,fontWeight=FontWeight.Bold)
    Text("표시된 공개 음악 ${trackCount}곡",fontSize=12.sp,color=Aqua)
   }
  }
  val activities=listOf(Triple("publishedTrack","음악 공개",Icons.Rounded.MusicNote),Triple("receivedGold","골드 1개 받기",Icons.Rounded.CardGiftcard),Triple("dailyChat","하루 첫 채팅",Icons.Rounded.ChatBubbleOutline))
  if(activities.any{rules.has(it.first)}){
   HorizontalDivider(color=Stroke);Text("함께 성장하는 방법",fontSize=14.sp,fontWeight=FontWeight.SemiBold)
   activities.filter{rules.has(it.first)}.forEach{(key,label,icon)->Row(verticalAlignment=Alignment.CenterVertically){Icon(icon,null,tint=Violet,modifier=Modifier.size(20.dp));Text(label,fontSize=13.sp,modifier=Modifier.weight(1f).padding(start=10.dp));Text("+${rules.optInt(key)} XP",fontSize=13.sp,color=Aqua)}}
  }
 }
}

@Composable internal fun CrewDiscoveryCard(crew:JSONObject,mine:Boolean=false,rank:Int?=null,open:()->Unit){
 Surface(onClick=open,shape=RoundedCornerShape(18.dp),color=Panel,border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag("crew-card-"+crew.optString("id"))){
  Column(Modifier.musicSurface().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   Row(verticalAlignment=Alignment.CenterVertically){
    Surface(shape=RoundedCornerShape(14.dp),color=Raised){Box(Modifier.size(64.dp),contentAlignment=Alignment.Center){
     Icon(Icons.Rounded.Groups,null,tint=Violet,modifier=Modifier.size(28.dp))
     if(crew.optString("image_version").isNotBlank())AsyncImage(Endpoint.url("/media/crew/${crew.optString("id")}?v=${crew.optString("image_version")}"),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
    }}
    Column(Modifier.weight(1f).padding(start=12.dp)){
     if(rank!=null)Text("크루 랭킹 $rank",color=Pink,fontSize=11.sp)
     Text(crew.optString("name"),fontSize=17.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
     Text("LV ${crew.optInt("level")} · ${crew.optInt("xp")} XP · ${crew.optInt("members")}명",fontSize=12.sp,color=Aqua,modifier=Modifier.padding(top=5.dp))
    }
   }
   if(crew.optString("description").isNotBlank())Text(crew.optString("description"),fontSize=13.sp,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis)
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
    Text(if(mine)"내 크루" else if(crew.optInt("recruiting")==1)"모집 중" else "모집 마감",fontSize=12.sp,color=if(mine)Pink else Aqua,modifier=Modifier.weight(1f))
    Text("자세히 보기",fontSize=13.sp,color=Pink);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Pink)
   }
  }
 }
}
