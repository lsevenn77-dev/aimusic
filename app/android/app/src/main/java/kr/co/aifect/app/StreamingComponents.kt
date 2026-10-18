package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Every entry uses MusicModel's existing account-scoped library, never a second store. */
@Composable internal fun MusicLibraryShortcuts(m:MusicModel,compact:Boolean=false){
 val entries=listOf(
  Triple("내 보관함","보관함",Icons.Rounded.LibraryMusic),
  Triple("좋아요한 노래","좋아요",Icons.Rounded.FavoriteBorder),
  Triple("플레이리스트","플레이리스트",Icons.AutoMirrored.Rounded.QueueMusic),
  Triple("최근 감상","최근 감상",Icons.Rounded.History))
 BoxWithConstraints(Modifier.fillMaxWidth()){
  val columns=if(compact&&maxWidth>=340.dp&&LocalDensity.current.fontScale<=1.15f)4 else 2
  Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
   entries.chunked(columns).forEach{row->
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
     row.forEach{(label,page,icon)->
      val accent=if(page=="좋아요"||page=="플레이리스트")Pink else Aqua
      Surface(onClick={m.library(page)},color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke.copy(alpha=.65f)),modifier=Modifier.weight(1f).testTag("music-shortcut-$page")){
       Column(Modifier.heightIn(min=if(columns==4)88.dp else 98.dp).padding(horizontal=8.dp,vertical=14.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
        Icon(icon,null,tint=accent,modifier=Modifier.size(23.dp))
        Text(label,color=SoftText,fontSize=if(columns==4)11.sp else 14.sp,fontWeight=FontWeight.Medium,textAlign=TextAlign.Center,modifier=Modifier.padding(top=8.dp))
       }
      }
     }
    }
   }
  }
 }
}

/** Information opens the track; explicit controls play this recording in its visible queue. */
@Composable internal fun StreamingSongRow(song:Song,m:MusicModel,queue:List<Song>,sing:((Song)->Unit)?=null){
 val active=m.current?.id==song.id
 Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if(active)Violet.copy(alpha=.12f)else Panel.copy(alpha=.65f)).testTag("stream-song-${song.id}")){
  Row(Modifier.fillMaxWidth().padding(start=10.dp,end=2.dp,top=8.dp,bottom=8.dp),verticalAlignment=Alignment.CenterVertically){
   Row(Modifier.weight(1f).clickable{m.openSong(song)}.semantics{contentDescription="${song.title} 곡 정보"},verticalAlignment=Alignment.CenterVertically){
    Artwork(song,Modifier.size(48.dp),corner=10.dp)
    Column(Modifier.weight(1f).padding(horizontal=10.dp)){
     Text(song.title,fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("music-title-${song.id}"))
     Text(song.credit,fontSize=12.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
    }
   }
   IconButton(onClick={m.play(song,queue)},modifier=Modifier.testTag("stream-play-${song.id}")){
    Icon(Icons.Rounded.PlayCircle,"${song.title} 재생",tint=if(active)Aqua else Pink,modifier=Modifier.size(30.dp))
   }
   if(sing!=null)IconButton(onClick={sing(song)},modifier=Modifier.testTag("stream-sing-${song.id}")){Icon(Icons.Rounded.Mic,"${song.title} 부르기",tint=Aqua)}
   else TrackActionsMenu(song,m)
  }
 }
}

@Composable internal fun MusicEntry(title:String,caption:String,icon:androidx.compose.ui.graphics.vector.ImageVector,onClick:()->Unit){
 Surface(onClick=onClick,color=Panel,shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Stroke.copy(alpha=.65f)),modifier=Modifier.fillMaxWidth()){
  Row(Modifier.padding(14.dp),verticalAlignment=Alignment.CenterVertically){
   Icon(icon,null,tint=Aqua,modifier=Modifier.size(24.dp))
   Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(title,fontWeight=FontWeight.SemiBold,fontSize=15.sp);if(caption.isNotBlank())Text(caption,color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=4.dp))}
   Icon(Icons.Rounded.ChevronRight,null,tint=Muted)
  }
 }
}
