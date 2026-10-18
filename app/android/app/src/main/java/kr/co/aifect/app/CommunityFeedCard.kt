@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package kr.co.aifect.app

import android.content.Intent
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal fun socialTime(seconds:Long):String {
 if(seconds<=0)return ""
 val minutes=((System.currentTimeMillis()/1000-seconds).coerceAtLeast(0)/60)
 return when{minutes<1->"방금";minutes<60->"${minutes}분 전";minutes<1440->"${minutes/60}시간 전";minutes<10080->"${minutes/1440}일 전";else->activityDate(seconds).substringBefore(' ')}
}

/** Compact artwork cards retain the board's colors while showing more music at once. */
@Composable internal fun CommunityCard(song:Song,m:MusicModel,queue:List<Song>,sing:(Song)->Unit){
 val context=LocalContext.current
 val own=song.raw.optString("user_id")==m.user?.optString("id")
 val followed=m.follows.any{it.optString("kind")=="producer"&&it.optString("target_id")==song.producerId}
 val liked=m.likes.any{it.id==song.id}
 val isDuet=song.cover&&song.raw.optString("cover_mode")=="duet"
 val openDuet=isDuet&&song.raw.optInt("duet_open")==1&&!own
 val singable=!(isDuet&&song.raw.optInt("duet_open")==1&&own)&&(openDuet||song.cover||song.raw.optBoolean("karaoke_ready"))
 val active=m.current?.id==song.id&&m.playing
 val largeType=LocalDensity.current.fontScale>1.15f
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brush.verticalGradient(listOf(Color(0xFF182031),Color(0xFF111925)))).border(1.dp,StreamBorder.copy(alpha=.65f),RoundedCornerShape(16.dp)).padding(horizontal=9.dp,vertical=4.dp).testTag("community-card-${song.id}")){
  Row(Modifier.fillMaxWidth().heightIn(min=48.dp),verticalAlignment=Alignment.CenterVertically){
   Row(Modifier.weight(1f).clickable{m.openProfile(song.producerId)}.padding(vertical=3.dp),verticalAlignment=Alignment.CenterVertically){
    Avatar(song.producer,song.producerProfile,32)
    Column(Modifier.weight(1f).padding(start=8.dp)){
     Text(song.producer,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("feed-author-${song.id}"))
     Text(socialTime(song.raw.optLong("created")).ifBlank{if(song.cover)"커버 공개" else "제작곡 공개"}+" · ${song.plays}회 재생",fontSize=10.sp,lineHeight=15.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
    }
   }
   if(!own)TextButton(onClick={m.followPerson(song.producerId)},enabled=!m.busy,contentPadding=PaddingValues(horizontal=8.dp),modifier=Modifier.testTag("feed-follow-${song.id}")){Text(if(followed)"팔로잉" else "팔로우",fontSize=11.sp,color=Pink)}
   TrackActionsMenu(song,m,includeRelated=true)
  }
  Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(StreamPanel).testTag("feed-artwork-${song.id}")){
   Artwork(song,Modifier.fillMaxWidth().aspectRatio(if(largeType)1.9f else 2.15f),corner=12.dp,imageAlignment=if(song.cover)Alignment.TopCenter else Alignment.Center)
   Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Transparent,.43f to Color.Transparent,1f to Color.Black.copy(alpha=.9f))).clickable{m.openSong(song)})
   Text(when{isDuet->"DUET";song.cover->"COVER";else->"ORIGINAL"},fontSize=9.sp,fontWeight=FontWeight.SemiBold,color=Color.White,modifier=Modifier.align(Alignment.TopStart).padding(9.dp).background(Color.Black.copy(alpha=.5f),RoundedCornerShape(50)).padding(horizontal=7.dp,vertical=3.dp))
   Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start=11.dp,end=60.dp,bottom=11.dp)){
    Text(song.title,fontSize=16.sp,lineHeight=21.sp,fontWeight=FontWeight.Bold,color=Color.White,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("feed-title-${song.id}"))
    if(song.description.isNotBlank())Text(song.description,fontSize=11.sp,lineHeight=16.sp,color=Color(0xFFE0DCEA),maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=3.dp))
   }
   Column(Modifier.align(Alignment.BottomEnd).padding(9.dp),horizontalAlignment=Alignment.CenterHorizontally){
    IconButton(onClick={if(active)m.toggle() else m.play(song,queue)},modifier=Modifier.testTag("feed-play-${song.id}").background(Color.Black.copy(alpha=.3f),CircleShape)){Icon(if(active)Icons.Rounded.PauseCircle else Icons.Rounded.PlayCircle,if(active)"${song.title} 일시정지" else "${song.title} 재생",tint=Color.White,modifier=Modifier.size(37.dp))}
    Text(timeLabel((song.duration*1000).toLong()),fontSize=10.sp,color=Color.White,modifier=Modifier.background(Color.Black.copy(alpha=.65f),RoundedCornerShape(6.dp)).padding(horizontal=5.dp,vertical=2.dp))
   }
  }
  FlowRow(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(2.dp),verticalArrangement=Arrangement.Center){
   TextButton(onClick={m.like(song)},enabled=!m.busy,contentPadding=PaddingValues(horizontal=6.dp),modifier=Modifier.testTag("feed-like-${song.id}")){Icon(if(liked)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,"좋아요",tint=if(liked)StreamPink else Muted,modifier=Modifier.size(23.dp));Text(" ${song.likes}",fontSize=12.sp,color=SoftText)}
   TextButton(onClick={m.openSong(song)},contentPadding=PaddingValues(horizontal=6.dp),modifier=Modifier.testTag("feed-comments-${song.id}")){Icon(Icons.AutoMirrored.Rounded.Chat,"댓글",tint=SoftText,modifier=Modifier.size(21.dp));Text(" ${song.comments}",fontSize=12.sp,color=SoftText)}
   IconButton(onClick={val share=Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"${song.title} · ${song.credit}\n${Endpoint.origin}/#song/${song.id}");context.startActivity(Intent.createChooser(share,"음악 공유"))},modifier=Modifier.testTag("feed-share-${song.id}")){Icon(Icons.Rounded.Share,"음악 공유",tint=SoftText,modifier=Modifier.size(21.dp))}
   if(singable)TextButton(onClick={m.singTarget(song,sing)},enabled=!m.busy,contentPadding=PaddingValues(horizontal=4.dp),modifier=Modifier.testTag("feed-sing-${song.id}")){
    Row(Modifier.background(Brush.horizontalGradient(listOf(StreamPink,StreamPurple)),RoundedCornerShape(50)).padding(horizontal=10.dp,vertical=6.dp),verticalAlignment=Alignment.CenterVertically){Icon(if(openDuet)Icons.Rounded.People else Icons.Rounded.Mic,null,Modifier.size(16.dp),tint=Ink);Text(if(openDuet)"듀엣 참여" else "함께 부르기",fontSize=11.sp,fontWeight=FontWeight.SemiBold,color=Ink,modifier=Modifier.padding(start=4.dp))}
   }
  }
 }
}
