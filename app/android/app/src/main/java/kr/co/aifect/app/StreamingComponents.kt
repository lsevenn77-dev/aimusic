package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val StreamPurple=Color(0xFFB49AFF)
internal val StreamPink=Color(0xFFF397DC)
internal val StreamCyan=Color(0xFF79E5F2)
internal val StreamBlue=Color(0xFF78ADFF)
internal val StreamPanel=Color(0xFF111D30)
internal val StreamBorder=Color(0xFF354568)

@Composable internal fun StreamingSection(title:String,action:String?=null,onAction:()->Unit={}){
 Row(Modifier.fillMaxWidth().heightIn(min=48.dp),verticalAlignment=Alignment.CenterVertically){
  Text(title,fontSize=16.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
  if(action!=null)TextButton(onClick=onAction,contentPadding=PaddingValues(start=10.dp)){Text(action,color=Violet,fontSize=11.sp);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(16.dp),tint=Muted)}
 }
}

@Composable internal fun StreamingIcon(icon:ImageVector,tint:Color,boxed:Boolean=false){
 Box(Modifier.size(if(boxed)42.dp else 34.dp).clip(RoundedCornerShape(10.dp)).background(if(boxed)Brush.linearGradient(listOf(tint.copy(alpha=.4f),tint.copy(alpha=.12f)))else Brush.radialGradient(listOf(tint.copy(alpha=.25f),Color.Transparent))),contentAlignment=Alignment.Center){
  Icon(icon,null,tint=tint,modifier=Modifier.size(if(boxed)27.dp else 25.dp))
 }
}

/** Same account-scoped library from both entrances. Counts are loaded data, not mock values. */
@Composable internal fun MusicLibraryShortcuts(m:MusicModel,compact:Boolean=false){
 data class Entry(val label:String,val page:String,val icon:ImageVector,val tint:Color,val caption:String)
 val entries=listOf(
  Entry("내 보관함","보관함",Icons.Rounded.LibraryMusic,StreamCyan,"저장한 음악"),
  Entry("좋아요한 노래","좋아요",Icons.Rounded.Favorite,StreamPink,"${m.likes.size}곡"),
  Entry("최근 감상","최근 감상",Icons.Rounded.Schedule,StreamBlue,"${m.history.size}곡"),
  Entry("플레이리스트","플레이리스트",Icons.AutoMirrored.Rounded.QueueMusic,StreamPurple,"${m.playlists.size}개"))
 val ordered=if(compact)entries else listOf(entries[0],entries[1],entries[3],entries[2])
 BoxWithConstraints(Modifier.fillMaxWidth()){
  val largeType=LocalDensity.current.fontScale>1.15f
  val columns=if(compact&&maxWidth>=330.dp&&!largeType)4 else 2
  Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
   ordered.chunked(columns).forEach{row->Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
    row.forEach{e->
     val shape=RoundedCornerShape(if(columns==4)12.dp else 13.dp)
     Surface(onClick={m.library(e.page)},color=Color.Transparent,shape=shape,border=BorderStroke(1.dp,e.tint.copy(alpha=.38f)),modifier=Modifier.weight(1f).testTag("music-shortcut-${e.page}")){
      val backdrop=Modifier.background(Brush.linearGradient(listOf(e.tint.copy(alpha=.22f),StreamPanel)))
      if(columns==4||largeType)Column(backdrop.heightIn(min=78.dp).padding(horizontal=3.dp,vertical=8.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
       StreamingIcon(e.icon,e.tint)
       Text(e.label,color=SoftText,fontSize=if(largeType)13.sp else 11.sp,lineHeight=18.sp,fontWeight=FontWeight.Medium,textAlign=TextAlign.Center,modifier=Modifier.padding(top=3.dp))
       if(largeType&&!compact)Text(e.caption,color=Muted,fontSize=11.sp,lineHeight=15.sp,textAlign=TextAlign.Center)
      }else Row(backdrop.heightIn(min=68.dp).padding(10.dp),verticalAlignment=Alignment.CenterVertically){
       StreamingIcon(e.icon,e.tint,boxed=true)
       Column(Modifier.weight(1f).padding(start=9.dp)){Text(e.label,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold);Text(e.caption,color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=3.dp))}
      }
     }
    }
   }}
  }
 }
}

/** Approved artwork/title/control hierarchy; touch targets remain 48dp. */
@Composable internal fun StreamingSongRow(song:Song,m:MusicModel,queue:List<Song>,sing:((Song)->Unit)?=null,rank:Int?=null){
 val active=m.current?.id==song.id
 Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(if(active)StreamPurple.copy(alpha=.14f)else StreamPanel.copy(alpha=.75f)).testTag(if(rank==null)"stream-song-${song.id}" else "home-rank-${song.id}").heightIn(min=56.dp).padding(start=if(rank==null)6.dp else 0.dp,end=0.dp,top=4.dp,bottom=4.dp),verticalAlignment=Alignment.CenterVertically){
  if(rank!=null)Box(Modifier.width(25.dp).heightIn(min=46.dp).background(Brush.verticalGradient(listOf(if(rank==1)StreamPink else StreamBlue,StreamPurple.copy(alpha=.3f)))),contentAlignment=Alignment.Center){Text(rank.toString(),fontSize=13.sp,color=Color.White,fontWeight=FontWeight.Bold)}
  Row(Modifier.weight(1f).clickable{m.openSong(song)}.semantics{contentDescription="${song.title} 곡 정보"}.padding(start=if(rank==null)0.dp else 5.dp),verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(42.dp),corner=7.dp)
   Column(Modifier.weight(1f).padding(horizontal=9.dp)){
    Text(song.title,fontSize=13.sp,lineHeight=17.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.testTag("music-title-${song.id}"))
    Text(song.credit,fontSize=11.sp,lineHeight=15.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=2.dp))
   }
  }
  IconButton(onClick={m.play(song,queue)},modifier=Modifier.testTag("stream-play-${song.id}")){
   Icon(Icons.Rounded.PlayCircle,"${song.title} 재생",tint=if(active)StreamCyan else Color(0xFFBFC4ED),modifier=Modifier.size(29.dp))
  }
  if(sing!=null)TextButton(onClick={sing(song)},contentPadding=PaddingValues(horizontal=6.dp),modifier=Modifier.widthIn(min=62.dp).testTag("stream-sing-${song.id}")){
   Box(Modifier.clip(RoundedCornerShape(50)).background(StreamPurple.copy(alpha=.17f)).border(1.dp,StreamPurple.copy(alpha=.55f),RoundedCornerShape(50)).padding(horizontal=11.dp,vertical=6.dp)){Text("부르기",fontSize=12.sp,color=Pink)}
  }else TrackActionsMenu(song,m)
 }
}

@Composable internal fun MusicEntry(title:String,caption:String,icon:ImageVector,onClick:()->Unit){
 Surface(onClick=onClick,color=StreamPanel,shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,StreamBorder.copy(alpha=.65f)),modifier=Modifier.fillMaxWidth()){
  Row(Modifier.padding(12.dp),verticalAlignment=Alignment.CenterVertically){
   StreamingIcon(icon,StreamPurple)
   Column(Modifier.weight(1f).padding(horizontal=10.dp)){Text(title,fontWeight=FontWeight.SemiBold,fontSize=14.sp);if(caption.isNotBlank())Text(caption,color=Muted,fontSize=11.sp,modifier=Modifier.padding(top=3.dp))}
   Icon(Icons.Rounded.ChevronRight,null,tint=Muted,modifier=Modifier.size(18.dp))
  }
 }
}


@Composable internal fun MyWorkShortcut(title:String,caption:String,icon:ImageVector,tint:Color,onClick:()->Unit){
 val largeType=LocalDensity.current.fontScale>1.15f
 Surface(onClick=onClick,color=Color.Transparent,shape=RoundedCornerShape(13.dp),border=BorderStroke(1.dp,tint.copy(alpha=.38f))){
  val backdrop=Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(tint.copy(alpha=.3f),StreamPanel))).heightIn(min=68.dp).padding(10.dp)
  if(largeType)Column(backdrop,horizontalAlignment=Alignment.CenterHorizontally){StreamingIcon(icon,tint);Text(title,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,textAlign=TextAlign.Center);Text(caption,fontSize=10.sp,lineHeight=14.sp,color=Muted,textAlign=TextAlign.Center)}
  else Row(backdrop,verticalAlignment=Alignment.CenterVertically){
   StreamingIcon(icon,tint,boxed=true)
   Column(Modifier.weight(1f).padding(start=9.dp)){Text(title,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold);Text(caption,fontSize=10.sp,lineHeight=14.sp,color=Muted,modifier=Modifier.padding(top=3.dp))}
  }
 }
}
@Composable internal fun StreamingPlaylistRow(p:org.json.JSONObject,m:MusicModel){
 Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(StreamPanel.copy(alpha=.7f)).padding(start=6.dp).heightIn(min=56.dp),verticalAlignment=Alignment.CenterVertically){
  Row(Modifier.weight(1f).clickable{m.openList(p.getString("id"))},verticalAlignment=Alignment.CenterVertically){
   PlaylistArt(p,Modifier.size(42.dp))
   Column(Modifier.weight(1f).padding(horizontal=9.dp)){Text(p.optString("name"),fontSize=13.sp,maxLines=2,overflow=TextOverflow.Ellipsis);Text("${p.optInt("tracks")}곡",fontSize=11.sp,color=Muted)}
  }
  IconButton(onClick={m.playPlaylist(p.getString("id"))},enabled=m.playlistPlayLoading!=p.optString("id"),modifier=Modifier.testTag("playlist-play-"+p.optString("id"))){
   if(m.playlistPlayLoading==p.optString("id"))CircularProgressIndicator(Modifier.size(24.dp),color=StreamPurple,strokeWidth=2.dp)
   else Icon(Icons.Rounded.PlayCircle,"${p.optString("name")} 전체 재생",tint=StreamPurple,modifier=Modifier.size(29.dp))
  }
  IconButton(onClick={m.openList(p.getString("id"))}){Icon(Icons.Rounded.MoreVert,"플레이리스트 상세 및 관리",tint=Muted,modifier=Modifier.size(21.dp))}
 }
}
