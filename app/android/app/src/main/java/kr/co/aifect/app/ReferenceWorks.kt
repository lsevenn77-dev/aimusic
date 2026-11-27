@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
package kr.co.aifect.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

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

internal suspend fun deleteSelectedWorks(targets:List<ReferenceWork>,delete:suspend (ReferenceWork)->Unit,onDeleted:(String)->Unit){
 for(work in targets){
  try{delete(work)}
  catch(e:CancellationException){throw e}
  catch(_:Exception){continue}
  onDeleted(work.id)
 }
}

@Composable private fun ReferenceWorkCard(work:ReferenceWork,m:MusicModel,queue:List<Song>,selecting:Boolean=false,checked:Boolean=false,toggle:(()->Unit)?=null){
 fun open(){work.song?.let{m.openSong(it)}?:work.dubbing?.let{m.openCurrentWorkspace("dubbing/${it.optString("id")}",it.optString("title"))}}
 Column(Modifier.fillMaxWidth().testTag("work-card-${work.id}").combinedClickable(onLongClick=toggle,onClick={if(selecting)toggle?.invoke() else open()})){
  Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Panel)){
   work.song?.let{Artwork(it,Modifier.fillMaxSize(),12.dp)}?:work.dubbing?.let{DubbingImage(currentDubbingImage(it),Modifier.fillMaxSize())}
   if(selecting)Checkbox(checked,null,Modifier.align(Alignment.TopEnd).background(Ink,RoundedCornerShape(8.dp))) else BrandPlayButton("${work.title} 듣기",{work.song?.let{m.play(it,queue)}?:open()},Modifier.align(Alignment.BottomEnd).padding(6.dp),diameter=32.dp)
  }
  if(work.song!=null)CoverPickTitle(work.song,m,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
  else Text(work.title,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
  Row(Modifier.padding(top=5.dp),verticalAlignment=Alignment.CenterVertically){
   if(work.type!="original")Text(work.label,fontSize=9.sp,lineHeight=13.sp,color=Pink,modifier=Modifier.clip(RoundedCornerShape(5.dp)).background(Pink.copy(alpha=.1f)).padding(horizontal=6.dp,vertical=3.dp))
   Text(work.song?.credit?:work.dubbing?.optString("ownerName",work.dubbing.optString("owner_name")).orEmpty(),fontSize=10.sp,lineHeight=14.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(start=if(work.type=="original")0.dp else 6.dp).weight(1f))
  }
 }
}

@Composable internal fun ReferenceWorkShelf(works:List<ReferenceWork>,m:MusicModel,onSelect:((String)->Unit)?=null){
 BoxWithConstraints(Modifier.fillMaxWidth()){
  val width=((maxWidth-24.dp)/3f).coerceAtMost(150.dp)
  LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){
   items(works.take(4),key={it.id}){work->Box(Modifier.width(width)){ReferenceWorkCard(work,m,works.mapNotNull{it.song},toggle=onSelect?.let{action->{action(work.id)}})}}
  }
 }
}

/** A single grid implementation keeps every category at the same size and column count. */
@Composable internal fun ReferenceWorksPage(m:MusicModel,initial:String,originals:List<Song>,covers:List<Song>,dubbings:List<JSONObject>,ownerLabel:String="내",manageOwn:Boolean=false,initialSelection:String?=null,close:()->Unit){
 var kind by rememberSaveable(initial){mutableStateOf(if(initial=="original")"original" else "all")}
 var query by rememberSaveable{mutableStateOf("")}
 val all=referenceWorks(if(initial=="original")originals else if(initial=="all")originals+covers else covers,if(initial=="original")emptyList()else dubbings)
 val scope=rememberCoroutineScope()
 var selected by rememberSaveable(initialSelection){mutableStateOf(arrayListOf<String>().apply{if(manageOwn&&initialSelection!=null)add(initialSelection)})}
 var removed by remember{mutableStateOf(emptySet<String>())}
 var deleting by remember{mutableStateOf(false)}
 var confirm by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf<String?>(null)}
 fun toggle(id:String){if(!deleting)selected=ArrayList(if(id in selected)selected-id else selected+id)}
 fun back(){if(!deleting){if(selected.isEmpty())close() else selected=arrayListOf()}}
 val visible=all.filter{it.id !in removed}.filter{(kind=="all"||it.type==kind)&&(query.isBlank()||it.title.contains(query,ignoreCase=true))}
 AppPage(if(initial=="original")"$ownerLabel 제작곡" else if(initial=="all")"$ownerLabel 공개 작품" else "$ownerLabel 커버 · 듀엣 · 더빙",::back){
  Column(Modifier.fillMaxSize().padding(horizontal=20.dp)){
   if(initial!="original")CurrentTabs(listOf("all" to "전체","cover" to "커버","duet" to "듀엣","dubbing" to "더빙"),kind,"my-all-kind"){kind=it}
   if(selected.isNotEmpty())Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
    Text("${selected.size}개 선택",Modifier.weight(1f))
    TextButton({selected=arrayListOf()},enabled=!deleting){Text("취소")}
    TextButton({confirm=true},enabled=!deleting){Text("삭제",color=Pink)}
   }
   if(deleting)LinearProgressIndicator(Modifier.fillMaxWidth())
   error?.let{Text(it,color=Pink,fontSize=13.sp)}
   CurrentSearch(query,{query=it},"작품 검색","my-all-search",Modifier.padding(vertical=12.dp))
   Text("${visible.size}개 작품 · 최신순",fontSize=12.sp,color=Muted,modifier=Modifier.padding(bottom=12.dp))
   LazyColumn(Modifier.weight(1f).testTag("my-all-grid"),contentPadding=PaddingValues(bottom=24.dp),verticalArrangement=Arrangement.spacedBy(22.dp)){
    items(visible.chunked(2),key={it.first().id}){row->Row(horizontalArrangement=Arrangement.spacedBy(14.dp)){
     row.forEach{work->Box(Modifier.weight(1f)){ReferenceWorkCard(work,m,visible.mapNotNull{it.song},selected.isNotEmpty(),work.id in selected,if(manageOwn&&initial=="creations"){{toggle(work.id)}} else null)}}
     if(row.size==1)Spacer(Modifier.weight(1f))
    }}
    if(visible.isEmpty())item{Empty("표시할 작품이 없어요",if(query.isBlank())"공개한 작품이 이곳에 모여요." else "다른 제목으로 검색해보세요.")}
   }
   if(confirm)AlertDialog(onDismissRequest={confirm=false},title={Text("선택한 ${selected.size}개 작품을 삭제할까요?")},text={Text("삭제한 작품은 복구할 수 없어요.")},
    dismissButton={TextButton({confirm=false}){Text("취소")}},confirmButton={TextButton({
     confirm=false;deleting=true;error=null
     val targets=all.filter{it.id in selected}
     scope.launch{
      try{
       deleteSelectedWorks(targets,{work->
         val song=work.song
         if(song!=null)m.api.call("/api/uploads/${song.id}","DELETE") else{
          val path="/api/dubbing/projects/${work.dubbing!!.getString("id")}"
          val detail=m.api.call(path,fresh=true).getJSONObject("project")
          check(detail.optBoolean("isOwner"))
          m.api.call(path,"DELETE",payload("revision" to detail.getInt("revision")))
         }
       },{id->removed=removed+id;selected=ArrayList(selected-id)})
       if(selected.isNotEmpty())error="${selected.size}개 작품을 삭제하지 못했어요. 다시 시도해주세요."
      }finally{deleting=false;m.refreshMyDashboard(true)}
     }
    }){Text("삭제",color=Pink)}})
  }
 }
}
