package kr.co.aifect.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Keep two roomy columns on phones, including a 320dp display at 1.15 font scale. */
@Composable internal fun musicGalleryColumns():Int =
 if(LocalConfiguration.current.screenWidthDp>=600 && LocalDensity.current.fontScale<=1.2f)3 else 2

@Composable internal fun MusicLayoutControl(count:Int,grid:Boolean,onGrid:(Boolean)->Unit,context:String){
 Row(Modifier.fillMaxWidth().padding(top=12.dp,bottom=4.dp),verticalAlignment=Alignment.CenterVertically){
  Text("${count}곡",color=Muted,fontSize=13.sp,modifier=Modifier.weight(1f))
  Row(Modifier.clip(RoundedCornerShape(14.dp)).background(Color(0xFF222331)).padding(3.dp)){
   IconToggleButton(checked=grid,onCheckedChange={onGrid(true)},modifier=Modifier.size(44.dp).testTag("$context-layout-grid"),colors=IconButtonDefaults.iconToggleButtonColors(checkedContainerColor=Pink.copy(alpha=.18f),checkedContentColor=Pink,contentColor=Muted)){
    Icon(Icons.Rounded.GridView,"격자로 보기",Modifier.size(21.dp))
   }
   IconToggleButton(checked=!grid,onCheckedChange={onGrid(false)},modifier=Modifier.size(44.dp).testTag("$context-layout-list"),colors=IconButtonDefaults.iconToggleButtonColors(checkedContainerColor=Pink.copy(alpha=.18f),checkedContentColor=Pink,contentColor=Muted)){
    Icon(Icons.AutoMirrored.Rounded.ViewList,"목록으로 보기",Modifier.size(23.dp))
   }
  }
 }
}

internal fun LazyListScope.musicGallery(tracks:List<Song>,m:MusicModel,grid:Boolean,columns:Int,context:String,onDelete:((Song)->Unit)?=null){
 // Every action receives the recording Song itself. Artwork may be shared with the original.
 val queue=tracks.filter{it.raw.optString("status").let{status->status.isBlank()||status=="published"}}
 if(grid){
  items(tracks.chunked(columns),key={"$context-grid-"+it.first().id}){row->
   Row(Modifier.fillMaxWidth().padding(bottom=12.dp).testTag("$context-grid-row-"+row.first().id),horizontalArrangement=Arrangement.spacedBy(10.dp),verticalAlignment=Alignment.Top){
    row.forEach{song->MusicGalleryCard(song,m,queue,context,Modifier.weight(1f),onDelete)}
    repeat(columns-row.size){Spacer(Modifier.weight(1f))}
   }
  }
 }else{
  items(tracks,key={"$context-list-"+it.id}){song->MusicGalleryRow(song,m,queue,context,onDelete)}
 }
}

private fun Song.galleryPlayable()=raw.optString("status").let{it.isBlank()||it=="published"}
private fun Song.galleryStatus()=when(raw.optString("status")){"hidden"->"비공개";"failed","rejected"->"확인 필요";else->"처리 중"}

@Composable private fun MusicGalleryCard(song:Song,m:MusicModel,queue:List<Song>,context:String,modifier:Modifier,onDelete:((Song)->Unit)?){
 val playable=song.galleryPlayable()
 Column(modifier.clip(RoundedCornerShape(18.dp)).background(Panel).border(1.dp,Stroke.copy(alpha=.45f),RoundedCornerShape(18.dp)).clickable(enabled=playable){m.openSong(song)}.testTag("$context-card-${song.id}")){
  Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(18.dp))){
   Artwork(song,Modifier.fillMaxSize())
   Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Ink.copy(alpha=.10f),Color.Transparent,Ink.copy(alpha=.93f)))))
   Surface(color=Ink.copy(alpha=.76f),shape=RoundedCornerShape(7.dp),modifier=Modifier.align(Alignment.TopStart).padding(8.dp)){
    Text(if(!playable)song.galleryStatus() else if(song.cover)if(song.raw.optString("cover_mode")=="duet")"듀엣" else "커버" else "제작곡",fontSize=11.sp,color=if(playable&&song.cover)Aqua else if(playable)Pink else Muted,modifier=Modifier.padding(horizontal=7.dp,vertical=4.dp))
   }
   IconButton(onClick={m.play(song,queue)},enabled=playable,modifier=Modifier.align(Alignment.TopEnd).padding(3.dp).size(44.dp).testTag("$context-play-${song.id}")){
    Icon(if(m.current?.id==song.id&&m.playing)Icons.Rounded.GraphicEq else Icons.Rounded.PlayCircle,"${song.title} ${if(song.cover)"커버 " else ""}재생",tint=if(playable)Pink else Muted,modifier=Modifier.size(30.dp))
   }
   Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(10.dp)){
    Text(song.title,fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,color=Color.White)
    Row(Modifier.padding(top=5.dp),verticalAlignment=Alignment.CenterVertically){
     Icon(if(playable)Icons.Rounded.Headphones else Icons.Rounded.Lock,null,Modifier.size(13.dp),tint=Muted)
     Text(if(playable)" ${song.plays}회 재생" else " ${song.galleryStatus()}",fontSize=11.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
    }
   }
  }
  Row(Modifier.fillMaxWidth().padding(start=10.dp,end=3.dp),verticalAlignment=Alignment.CenterVertically){
   Text(song.credit,fontSize=12.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f).padding(end=2.dp))
   MusicGallerySave(song,m,playable,context)
  }
  if(onDelete!=null&&song.cover)TextButton(onClick={onDelete(song)},modifier=Modifier.fillMaxWidth().testTag("$context-delete-${song.id}"),contentPadding=PaddingValues(horizontal=4.dp,vertical=4.dp)){
   Icon(Icons.Rounded.DeleteOutline,null,Modifier.size(15.dp));Text("커버곡 삭제",fontSize=11.sp,modifier=Modifier.padding(start=3.dp))
  }
 }
}

@Composable private fun MusicGalleryRow(song:Song,m:MusicModel,queue:List<Song>,context:String,onDelete:((Song)->Unit)?){
 val playable=song.galleryPlayable()
 Column(Modifier.fillMaxWidth().padding(bottom=10.dp).clip(RoundedCornerShape(16.dp)).background(Panel).clickable(enabled=playable){m.openSong(song)}.testTag("$context-row-${song.id}")){
  Row(Modifier.fillMaxWidth().padding(start=12.dp,top=12.dp,end=4.dp,bottom=4.dp),verticalAlignment=Alignment.CenterVertically){
   Artwork(song,Modifier.size(60.dp))
   Column(Modifier.weight(1f).padding(horizontal=12.dp)){
    Text(song.title,fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis)
    Text(song.credit,fontSize=12.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
    Text(if(!playable)song.galleryStatus() else "${if(song.cover)if(song.raw.optString("cover_mode")=="duet")"듀엣" else "솔로 커버" else song.genre} · ${song.plays}회 재생",fontSize=11.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
   }
   IconButton(onClick={m.play(song,queue)},enabled=playable,modifier=Modifier.size(44.dp).testTag("$context-play-${song.id}")){
    Icon(if(m.current?.id==song.id&&m.playing)Icons.Rounded.GraphicEq else Icons.Rounded.PlayArrow,"${song.title} ${if(song.cover)"커버 " else ""}재생",tint=Pink)
   }
  }
  Row(Modifier.fillMaxWidth().padding(horizontal=8.dp),horizontalArrangement=Arrangement.End,verticalAlignment=Alignment.CenterVertically){
   if(onDelete!=null&&song.cover)TextButton(onClick={onDelete(song)},modifier=Modifier.testTag("$context-delete-${song.id}")){
    Icon(Icons.Rounded.DeleteOutline,null,Modifier.size(16.dp));Text("커버곡 삭제",fontSize=12.sp,modifier=Modifier.padding(start=4.dp))
   }
   Spacer(Modifier.weight(1f))
   TextButton(onClick={m.pickPlaylist(song)},enabled=playable&&!m.busy,modifier=Modifier.testTag("$context-save-${song.id}").semantics{contentDescription="${song.title} 플레이리스트 담기"},contentPadding=PaddingValues(horizontal=10.dp)){
    Icon(Icons.AutoMirrored.Rounded.QueueMusic,null,Modifier.size(18.dp));Text("담기",fontSize=12.sp,modifier=Modifier.padding(start=5.dp))
   }
  }
 }
}

@Composable private fun MusicGallerySave(song:Song,m:MusicModel,enabled:Boolean,context:String){
 IconButton(onClick={m.pickPlaylist(song)},enabled=enabled&&!m.busy,modifier=Modifier.size(44.dp).testTag("$context-save-${song.id}")){
  Icon(Icons.AutoMirrored.Rounded.QueueMusic,"${song.title} 플레이리스트 담기",tint=if(enabled)Pink else Muted,modifier=Modifier.size(19.dp))
 }
}
