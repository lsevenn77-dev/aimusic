package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import org.json.JSONObject

internal data class ReferenceWork(val song:Song?=null,val dubbing:JSONObject?=null){
 val id get()=song?.let{"song-${it.id}"}?:"dubbing-${dubbing?.optString("id") }"
 val type get()=song?.let{if(!it.cover)"original" else if(it.raw.optString("cover_mode")=="duet")"duet" else "cover"}?:"dubbing"
 val label get()=when(type){"original"->"제작곡";"duet"->"듀엣";"cover"->"커버";else->"더빙"}
 val title get()=song?.title?:dubbing?.optString("title").orEmpty()
 val created get()=song?.raw?.optLong("created")?:dubbing?.optLong("created")?:0L
}
internal fun referenceWorks(songs:List<Song>,dubbings:List<JSONObject>)=(songs.map{ReferenceWork(song=it)}+dubbings.map{ReferenceWork(dubbing=it)}).sortedByDescending{it.created}

@Composable private fun ReferenceWorkCard(work:ReferenceWork,m:MusicModel,queue:List<Song>){
 fun open(){work.song?.let{m.openSong(it)}?:work.dubbing?.let{m.openCurrentWorkspace("dubbing/${it.optString("id")}",it.optString("title"))}}
 Column(Modifier.fillMaxWidth().testTag("work-card-${work.id}")){
  Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Panel).clickable{open()}){
   work.song?.let{Artwork(it,Modifier.fillMaxSize(),12.dp)}?:work.dubbing?.let{AsyncImage(currentDubbingImage(it),"더빙 장르 이미지",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)}
   BrandPlayButton("${work.title} 듣기",{work.song?.let{m.play(it,queue)}?:open()},Modifier.align(Alignment.BottomEnd).padding(6.dp),diameter=32.dp)
  }
  Text(work.title,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp).clickable{open()})
  Row(Modifier.padding(top=5.dp),verticalAlignment=Alignment.CenterVertically){
   if(work.type!="original")Text(work.label,fontSize=9.sp,lineHeight=13.sp,color=Pink,modifier=Modifier.clip(RoundedCornerShape(5.dp)).background(Pink.copy(alpha=.1f)).padding(horizontal=6.dp,vertical=3.dp))
   Text(work.song?.credit?:work.dubbing?.optString("ownerName",work.dubbing.optString("owner_name")).orEmpty(),fontSize=10.sp,lineHeight=14.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(start=if(work.type=="original")0.dp else 6.dp).weight(1f))
  }
 }
}

@Composable internal fun ReferenceWorkShelf(works:List<ReferenceWork>,m:MusicModel){
 BoxWithConstraints(Modifier.fillMaxWidth()){
  val width=((maxWidth-24.dp)/3f).coerceAtMost(150.dp)
  LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){
   items(works.take(4),key={it.id}){work->Box(Modifier.width(width)){ReferenceWorkCard(work,m,works.mapNotNull{it.song})}}
  }
 }
}

/** A single grid implementation keeps every category at the same size and column count. */
@Composable internal fun ReferenceWorksPage(m:MusicModel,initial:String,originals:List<Song>,covers:List<Song>,dubbings:List<JSONObject>,close:()->Unit){
 var kind by rememberSaveable(initial){mutableStateOf(if(initial=="original")"original" else "all")}
 var query by rememberSaveable{mutableStateOf("")}
 val all=referenceWorks(if(initial=="original")originals else if(initial=="all")originals+covers else covers,if(initial=="original")emptyList()else dubbings)
 val visible=all.filter{(kind=="all"||it.type==kind)&&(query.isBlank()||it.title.contains(query,ignoreCase=true))}
 AppPage(if(initial=="original")"내 제작곡" else if(initial=="all")"내 공개 작품" else "내 커버 · 듀엣 · 더빙",close){
  Column(Modifier.fillMaxSize().padding(horizontal=20.dp)){
   if(initial!="original")CurrentTabs(listOf("all" to "전체","cover" to "커버","duet" to "듀엣","dubbing" to "더빙"),kind,"my-all-kind"){kind=it}
   CurrentSearch(query,{query=it},"내 작품 검색","my-all-search",Modifier.padding(vertical=12.dp))
   Text("${visible.size}개 작품 · 최신순",fontSize=12.sp,color=Muted,modifier=Modifier.padding(bottom=12.dp))
   LazyColumn(Modifier.weight(1f).testTag("my-all-grid"),contentPadding=PaddingValues(bottom=24.dp),verticalArrangement=Arrangement.spacedBy(22.dp)){
    items(visible.chunked(2),key={it.first().id}){row->Row(horizontalArrangement=Arrangement.spacedBy(14.dp)){
     row.forEach{work->Box(Modifier.weight(1f)){ReferenceWorkCard(work,m,visible.mapNotNull{it.song})}}
     if(row.size==1)Spacer(Modifier.weight(1f))
    }}
    if(visible.isEmpty())item{Empty("표시할 작품이 없어요",if(query.isBlank())"공개한 작품이 이곳에 모여요." else "다른 제목으로 검색해보세요.")}
   }
  }
 }
}
