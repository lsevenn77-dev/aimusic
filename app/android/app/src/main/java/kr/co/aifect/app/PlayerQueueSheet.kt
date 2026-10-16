@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable internal fun PlayerQueueSheet(m:MusicModel,dismiss:()->Unit){
 val player=m.controller
 val queue=player?.let{(0 until it.mediaItemCount).map(it::getMediaItemAt)}.orEmpty()
 ModalBottomSheet(onDismissRequest=dismiss,containerColor=Panel){
  LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(22.dp,0.dp,22.dp,28.dp)){
   item{Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("재생목록",fontSize=24.sp,modifier=Modifier.weight(1f));TextButton(onClick={m.closePlayer();dismiss()}){Text("재생 종료")}}}
   itemsIndexed(queue){index,item->Row(Modifier.fillMaxWidth().clickable{player?.seekTo(index,0);player?.play();dismiss()}.padding(vertical=14.dp),verticalAlignment=Alignment.CenterVertically){
    Text("${index+1}",color=if(m.current?.id==item.mediaId)Aqua else Muted,modifier=Modifier.width(30.dp))
    Column{Text(item.mediaMetadata.title?.toString().orEmpty(),color=if(m.current?.id==item.mediaId)Aqua else SoftText);Text(item.mediaMetadata.artist?.toString().orEmpty(),fontSize=12.sp,color=Muted)}
   }}
  }
 }
}
