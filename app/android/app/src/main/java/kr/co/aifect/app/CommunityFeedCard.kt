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

/** Large artwork feed from the approved board, using the actual upload and profile. */
@Composable internal fun CommunityCard(song:Song,m:MusicModel,queue:List<Song>,sing:(Song)->Unit){
 val context=LocalContext.current
 val own=song.raw.optString("user_id")==m.user?.optString("id")
 val followed=m.follows.any{it.optString("kind")=="producer"&&it.optString("target_id")==song.producerId}
 val liked=m.likes.any{it.id==song.id}
 val isDuet=song.cover&&song.raw.optString("cover_mode")=="duet"
 val openDuet=isDuet&&song.raw.optInt("duet_open")==1&&!own
 val singable=!(isDuet&&song.raw.optInt("duet_open")==1&&own)&&(openDuet||song.cover||song.raw.optBoolean("karaoke_ready"))
 val active=m.current?.id==song.id&&m.playing
 Column(Modifier.fillMaxWidth().testTag("community-card-${song.id}")){
  Row(Modifier.fillMaxWidth().padding(vertical=7.dp),verticalAlignment=Alignment.CenterVertically){
   Row(Modifier.weight(1f).clickable{m.openProfile(song.producerId)}.padding(vertical=3.dp),verticalAlignment=Alignment.CenterVertically){
    Avatar(song.producer,song.producerProfile,40)
    Column(Modifier.weight(1f).padding(start=10.dp)){
     Text(song.producer,fontSize=14.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("feed-author-${song.id}"))
     Text(socialTime(song.raw.optLong("created")).ifBlank{if(song.cover)"커버 공개" else "제작곡 공개"},fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=2.dp))
    }
   }
   if(!own)OutlinedButton(onClick={m.followPerson(song.producerId)},enabled=!m.busy,shape=RoundedCornerShape(10.dp),border=BorderStroke(1.dp,StreamPurple.copy(alpha=.65f)),contentPadding=PaddingValues(horizontal=13.dp,vertical=0.dp),modifier=Modifier.heightIn(min=42.dp).testTag("feed-follow-${song.id}")){Text(if(followed)"팔로잉" else "팔로우",fontSize=11.sp,color=Pink)}
  }
  Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(StreamPanel).testTag("feed-artwork-${song.id}")){
   Artwork(song,Modifier.fillMaxWidth().aspectRatio(1.42f),corner=12.dp)
   Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Transparent,.43f to Color.Transparent,1f to Color.Black.copy(alpha=.9f))).clickable{m.openSong(song)})
   Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start=13.dp,end=66.dp,bottom=13.dp)){
    Text(song.title+when{isDuet->" (DUET)";song.cover->" (COVER)";else->""},fontSize=17.sp,lineHeight=23.sp,fontWeight=FontWeight.Bold,color=Color.White,maxLines=3,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("feed-title-${song.id}"))
    if(song.description.isNotBlank())Text(song.description,fontSize=12.sp,lineHeight=18.sp,color=Color(0xFFE0DCEA),maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
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
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
   Text("${song.plays}회 재생",fontSize=11.sp,color=Muted,modifier=Modifier.weight(1f))
   if(song.cover)TextButton(onClick={m.openOriginal(song)},contentPadding=PaddingValues(horizontal=6.dp)){Text("원곡 듣기",fontSize=11.sp,color=Muted)}
   else if(song.raw.optInt("accepts_covers")==1)TextButton(onClick={m.openCovers(song)},contentPadding=PaddingValues(horizontal=6.dp)){Text("다른 목소리",fontSize=11.sp,color=Muted)}
   TrackActionsMenu(song,m)
  }
  HorizontalDivider(color=StreamBorder.copy(alpha=.6f))
 }
}
