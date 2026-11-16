@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PageSize
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

private fun JSONObject.clean(key:String)=optString(key).takeUnless{it.isBlank()||it=="null"}.orEmpty()
private fun crewOpen(c:JSONObject)=c.optInt("recruiting")==1&&(c.optInt("capacity")==0||c.optInt("members")<c.optInt("capacity"))
private fun crewInterests(c:JSONObject)=c.clean("interests").split(',', '·', '#').map{it.trim()}.filter{it.isNotEmpty()}

@Composable private fun CommunityPhoto(id:String,name:String,version:String,kind:String,modifier:Modifier,round:Boolean=false){
 Box(modifier.clip(if(round)CircleShape else RoundedCornerShape(12.dp)).background(Raised).testTag("community-photo-$kind-$id"),contentAlignment=Alignment.Center){
  if(kind=="artist")DefaultProfileArtwork(name,Modifier.fillMaxSize())else DefaultCrewArtwork(Modifier.fillMaxSize())
  if(CurrentNavigation.safeID(id)&&version.isNotBlank())AsyncImage(Endpoint.url("/media/$kind/$id?v=${CurrentNavigation.query(version)}"),"$name 사진",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
 }
}

@Composable private fun CommunityChoice(label:String,tag:String,options:List<Pair<String,String>>,selected:String,modifier:Modifier=Modifier,onSelect:(String)->Unit){
 var expanded by remember{mutableStateOf(false)}
 Box(modifier){
  OutlinedButton(onClick={expanded=true},modifier=Modifier.heightIn(min=44.dp).testTag(tag),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,Stroke),colors=ButtonDefaults.outlinedButtonColors(contentColor=SoftText),contentPadding=PaddingValues(horizontal=10.dp)){
   Text(label,fontSize=12.sp,lineHeight=17.sp,maxLines=1);Icon(Icons.Rounded.ExpandMore,null,Modifier.size(17.dp))
  }
  DropdownMenu(expanded,{expanded=false},containerColor=Panel){options.forEach{(key,title)->DropdownMenuItem(text={Text(title,fontSize=14.sp)},onClick={onSelect(key);expanded=false},modifier=Modifier.testTag("$tag-$key"),trailingIcon={if(selected==key)Icon(Icons.Rounded.Check,null,Modifier.size(18.dp),tint=Pink)})}}
 }
}

@Composable internal fun CurrentCrewDirectory(m:MusicModel,home:CurrentRead?=null,onRankings:()->Unit,onBack:(()->Unit)?=null){
 val list=rememberLazyListState()
 val read=home?:currentRead(m,"/api/crews?summary=1",poll=30000)
 if(home!=null){
  val lifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
  LaunchedEffect(home,lifecycle){
   lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){
    while(true){delay(30000);if(!home.loading)home.retry()}
   }
  }
 }
 var query by rememberSaveable{mutableStateOf("")}
 var interest by rememberSaveable{mutableStateOf("")}
 var recruitment by rememberSaveable{mutableStateOf("")}
 var level by rememberSaveable{mutableStateOf("")}
 var onlyMine by rememberSaveable{mutableStateOf(false)}
 var sort by rememberSaveable{mutableStateOf("recommended")}
 var filtering by remember{mutableStateOf(false)}
 var creating by remember{mutableStateOf(false)}
 val all=read.data?.optJSONArray("crews").objects()
 val mine=read.data?.clean("mine").orEmpty()
 val selectedFilters=listOf(interest.isNotEmpty(),recruitment.isNotEmpty(),level.isNotEmpty(),onlyMine).count{it}
 val filtered=all.filter{c->
  (query.isBlank()||(c.clean("name")+" "+c.clean("description")+" "+c.clean("interests")).contains(query.trim(),true))&&
  (interest.isBlank()||interest in crewInterests(c))&&(recruitment.isBlank()||crewOpen(c)==(recruitment=="open"))&&
  (level.isBlank()||c.optInt("level").toString()==level)&&(!onlyMine||c.clean("id")==mine)
 }.let{list->when(sort){
  "recent"->list.sortedByDescending{it.optLong("created")};"members"->list.sortedByDescending{it.optInt("members")}
  "level"->list.sortedWith(compareByDescending<JSONObject>{it.optInt("level")}.thenByDescending{it.optLong("xp")})
  else->list.sortedWith(compareByDescending<JSONObject>{it.optInt("match")}.thenByDescending{it.optLong("xp")})
 }}
 fun open(c:JSONObject){val id=c.clean("id");if(CurrentNavigation.safeID(id))m.openCurrentWorkspace("crew/$id",c.clean("name"))}
 LazyColumn(Modifier.fillMaxSize().testTag("crew-directory-scroll"),state=list,contentPadding=PaddingValues(16.dp,4.dp,16.dp,24.dp)){
  item{
   Row(Modifier.fillMaxWidth().heightIn(min=44.dp),verticalAlignment=Alignment.CenterVertically){
    if(onBack!=null)IconButton(onClick=onBack,modifier=Modifier.size(44.dp)){Icon(Icons.Rounded.ChevronLeft,"내 크루로 돌아가기",tint=Pink)}
    Text("크루 찾기",Modifier.weight(1f),fontSize=18.sp,fontWeight=FontWeight.Bold,color=Pink)
    if(onBack==null&&mine.isBlank())TextButton({if(m.authenticated())creating=true},enabled=!read.loading&&read.error==null,modifier=Modifier.testTag("current-crews-open")){Text("크루 만들기",color=Pink)}
   }
   CurrentSearch(query,{query=it},"크루명 · 관심사 검색","crew-directory-search",Modifier.fillMaxWidth().padding(vertical=6.dp))
   Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
    FilterChip(selected=recruitment=="open",onClick={recruitment=if(recruitment=="open")"" else "open"},label={Text("모집 중")},modifier=Modifier.testTag("crew-open-filter"),
     colors=FilterChipDefaults.filterChipColors(selectedContainerColor=DiscoveryRose.copy(alpha=.13f),selectedLabelColor=DiscoveryRose))
    TextButton({filtering=true},modifier=Modifier.testTag("crew-filters")){Icon(Icons.Rounded.Tune,null,Modifier.size(16.dp));Text(if(selectedFilters==0)" 필터" else " 필터 $selectedFilters")}
   }
   Row(Modifier.fillMaxWidth().padding(vertical=6.dp),verticalAlignment=Alignment.CenterVertically){
    Text(if(query.isBlank()&&selectedFilters==0)"전체 크루" else "검색 결과",fontWeight=FontWeight.Bold)
    Text(" ${filtered.size}",Modifier.weight(1f),color=Pink)
    val sorts=listOf("recommended" to "추천순","recent" to "최신순","level" to "레벨순","members" to "인원순")
    CommunityChoice(sorts.first{it.first==sort}.second,"crew-sort",sorts,sort){sort=it}
   }
   HorizontalDivider(color=Stroke)
  }
  if(read.loading||read.error!=null)item{ReadStatus(read)}
  items(filtered,key={it.clean("id")}){c->
   Row(Modifier.fillMaxWidth().clickable{open(c)}.testTag("crew-discovery-${c.clean("id")}").heightIn(min=78.dp).padding(vertical=9.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
    CommunityPhoto(c.clean("id"),c.clean("name"),c.clean("image_version"),"crew",Modifier.size(52.dp),true)
    Column(Modifier.weight(1f)){
     Text(c.clean("name"),fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
     Row(Modifier.padding(top=4.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(5.dp)){
      val badge=when{c.clean("id")==mine->"내 크루";crewOpen(c)->"모집 중";else->null}
      if(badge!=null)Text(badge,color=DiscoveryRose,fontSize=10.sp,lineHeight=14.sp,modifier=Modifier.border(.7.dp,DiscoveryRose.copy(alpha=.75f),CircleShape).padding(horizontal=6.dp,vertical=1.dp))
      Text("멤버 ${c.optInt("members")}명 · Lv.${c.optInt("level",1)}",fontSize=12.sp,color=Muted)
     }
    }
    Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Pink)
   }
   HorizontalDivider(color=Stroke.copy(alpha=.6f))
  }
  if(filtered.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty("조건에 맞는 크루가 없어요","검색어나 필터를 바꿔보세요.")}
  item{Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){TextButton(onRankings,modifier=Modifier.testTag("crew-directory-ranking")){Text("크루 랭킹 보기",color=Pink);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Pink)}}}
 }
 if(filtering)ModalBottomSheet(onDismissRequest={filtering=false},containerColor=Panel){Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=28.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){Text("크루 필터",fontSize=20.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f));TextButton(onClick={interest="";recruitment="";level="";onlyMine=false}){Text("초기화",color=SoftText)}}
  CommunityChoice(interest.ifBlank{"모든 관심사"},"crew-interest",listOf("" to "모든 관심사")+all.flatMap(::crewInterests).distinct().sorted().map{it to it},interest){interest=it}
  CommunityChoice(when(recruitment){"open"->"모집 중";"closed"->"모집 마감";else->"모든 모집 상태"},"crew-recruitment",listOf("" to "모든 모집 상태","open" to "모집 중","closed" to "모집 마감"),recruitment){recruitment=it}
  CommunityChoice(if(level.isBlank())"모든 레벨" else "LV.$level","crew-level",listOf("" to "모든 레벨")+all.map{it.optInt("level",1)}.distinct().sorted().map{it.toString() to "LV.$it"},level){level=it}
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("내 크루만 보기",Modifier.weight(1f),fontSize=14.sp);Switch(onlyMine,{onlyMine=it},enabled=mine.isNotBlank(),modifier=Modifier.testTag("crew-filter-mine"))}
  BrandButton(onClick={filtering=false},modifier=Modifier.fillMaxWidth().testTag("crew-filter-apply")){Text("${filtered.size}개 크루 보기")}
 }}
 if(creating)CrewEditor(null,m.busy,{creating=false}){name,description,interests,recruiting->m.action{
  val data=m.api.call("/api/crews","POST",payload("name" to name,"description" to description,"interests" to interests,"recruiting" to recruiting));creating=false;m.invalidateCrewPreviews();read.retry();data.optJSONObject("crew")?.let{open(it)}
 }}
}

@Composable internal fun CurrentRankings(m:MusicModel,category:String,onCategory:(String)->Unit){
 var period by rememberSaveable{mutableStateOf("week")}
 var kind by rememberSaveable{mutableStateOf("solo")}
 val read=currentRead(m,"/api/community/rankings?category=$category&period=$period&workKind=$kind")
 val crews=currentRead(m,"/api/crews?summary=1",enabled=category=="crew")
 val crewPhotos=crews.data?.optJSONArray("crews").objects().associateBy{it.clean("id")}
 val categories=listOf("work" to "작품","aiArtist" to "AI 아티스트","crew" to "크루","dubbing" to "더빙")
 LazyColumn(Modifier.fillMaxSize().testTag("community-rankings-scroll"),contentPadding=PaddingValues(16.dp,16.dp,16.dp,28.dp)){
  item{
   DiscoverySections(categories,category,"ranking-category",onSelect=onCategory)
   Row(Modifier.fillMaxWidth().padding(top=8.dp,bottom=6.dp).testTag("ranking-toolbar"),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
    if(category=="work")Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
     listOf("solo" to "솔로","duet" to "듀엣").forEach{(key,label)->val active=kind==key;Box(Modifier.clip(RoundedCornerShape(10.dp)).background(if(active)DiscoveryGradient else Brush.linearGradient(listOf(Panel,Panel))).selectable(active,role=Role.Tab){kind=key}.testTag("ranking-kind-$key").heightIn(min=44.dp).padding(horizontal=15.dp),contentAlignment=Alignment.Center){Text(label,fontSize=13.sp,color=if(active)Ink else SoftText,fontWeight=FontWeight.Medium)}}
    }else Text(categories.first{it.first==category}.second+" 랭킹",fontSize=15.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
    CommunityChoice(if(period=="week")"주간" else "월간","ranking-period",listOf("week" to "주간","month" to "월간"),period){period=it}
   }
   ReadStatus(read)
  }
  val rows=read.data?.optJSONArray("rows").objects()
  if(rows.isNotEmpty())item{
   CommunityPodium(rows,category){row,position,modifier->
    CommunityRankRow(row,position,category,crewPhotos[row.clean("id")],m,modifier)
   }
  }
  if(category=="crew"){
   val mine=crews.data?.clean("mine").orEmpty()
   val myIndex=rows.indexOfFirst{it.clean("id")==mine}
   if(mine.isNotBlank()&&myIndex>=0)item{val row=rows[myIndex];MyCrewRank(row,row.optInt("rank",myIndex+1),crewPhotos[mine]){m.openCurrentWorkspace("crew/$mine",row.clean("name"))}}
  }
  itemsIndexed(rows.drop(3),key={i,r->"$category-${r.clean("id").ifBlank{r.clean("href").ifBlank{i.toString()}}}"}){index,r->
   CommunityRankRow(r,index+4,category,crewPhotos[r.clean("id")],m)
  }
  if(rows.isNotEmpty())item{Text("이전 순위 기록이 없는 항목은 —로 표시해요.",fontSize=11.sp,lineHeight=17.sp,color=Muted,modifier=Modifier.padding(top=16.dp))}
  if(rows.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty("아직 집계된 순위가 없어요.",read.data?.optString("message").orEmpty())}
 }
}

/** Never infer a change from scores, array positions, or a first visit. */
internal fun communityRankChange(row:JSONObject,rank:Int):Pair<String,String>{
 val movement=row.clean("chart_movement").ifBlank{row.clean("rank_movement")}
 if(movement=="new")return "NEW" to "새로 진입"
 val delta=when{row.has("rank_change")&&!row.isNull("rank_change")->row.optInt("rank_change");row.optInt("previous_rank")>0->row.optInt("previous_rank")-rank;else->return "—" to "이전 순위 기록 없음"}
 return when{delta>0->"▲$delta" to "${delta}계단 상승";delta<0->"▼${-delta}" to "${-delta}계단 하락";else->"—" to "순위 변동 없음"}
}
@Composable private fun RankingArtwork(row:JSONObject,id:String,name:String,category:String,crew:JSONObject?,track:JSONObject?,modifier:Modifier){
 when(category){
  "aiArtist"->CommunityPhoto(id,name,row.clean("image_version"),"artist",modifier)
  "crew"->CommunityPhoto(id,name,crew?.clean("image_version").orEmpty().ifBlank{row.clean("image_version")},"crew",modifier)
  "work"->Artwork(Song(track?:payload("id" to id,"title" to name)),modifier.testTag("ranking-art-$id"),8.dp)
  else->Box(modifier.clip(RoundedCornerShape(8.dp)).background(Raised).testTag("ranking-art-$id"),contentAlignment=Alignment.Center){
   Icon(Icons.Rounded.RecordVoiceOver,"$name 더빙",tint=Pink)
   DubbingImage(currentDubbingImage(row),Modifier.fillMaxSize())
  }
 }
}

@Composable private fun RankScore(row:JSONObject,accent:Color){
 val value=row.clean("score").toBigDecimalOrNull()?:return
 val score=remember(value){java.text.DecimalFormat("#,##0.##",java.text.DecimalFormatSymbols(java.util.Locale.KOREA)).format(value)}
 Row(Modifier.background(accent.copy(alpha=.19f),CircleShape).padding(horizontal=6.dp,vertical=2.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(3.dp)){
  Icon(Icons.Rounded.Diamond,null,Modifier.size(12.dp),tint=accent)
  Text("${score}점",fontSize=11.sp,lineHeight=15.sp,fontWeight=FontWeight.SemiBold,color=Color.White,maxLines=1,overflow=TextOverflow.Ellipsis)
 }
}

@Composable private fun RankMovement(change:Pair<String,String>,category:String,id:String){
 Text(change.first,fontSize=10.sp,lineHeight=14.sp,fontWeight=FontWeight.SemiBold,color=if(change.first.startsWith("▼"))Aqua else if(change.first=="—")SoftText else Pink,modifier=Modifier.testTag("community-movement-$category-$id").semantics{contentDescription=change.second})
}

@Composable private fun CommunityRankRow(row:JSONObject,position:Int,category:String,crew:JSONObject?,m:MusicModel,podium:Modifier?=null){
 val id=row.clean("id").ifBlank{row.clean("href").substringAfterLast('/')}
 val name=row.clean("name")
 val rank=row.optInt("rank",position).takeIf{it>0}?:position
 val account=m.user?.optString("id")
 var track by remember(id,account,category){mutableStateOf(if(category=="work")m.api.peek("/api/tracks/$id")?.optJSONObject("track")else null)}
 LaunchedEffect(id,account,category){if(category=="work"&&CurrentNavigation.safeID(id)&&track==null)try{track=m.api.call("/api/tracks/$id").optJSONObject("track")}catch(e:Exception){if(e is CancellationException)throw e}}
 val song=remember(track){track?.let(::Song)}
 val detail=listOfNotNull(song?.credit?.takeIf{it.isNotBlank()},row.clean("detail").takeIf{it.isNotBlank()}).joinToString(" · ")
 val change=communityRankChange(row,rank)
 val open={if(CurrentNavigation.safeID(id))when(category){"work"->m.openCurrentSong(id);"aiArtist"->m.openProfile(id,"artist");"crew"->m.openCurrentWorkspace("crew/$id",name);"dubbing"->m.openCurrentWorkspace("dubbing/$id",name);else->Unit}}
 val tag="community-rank-$category-$id"
 val shape=RoundedCornerShape(14.dp)
 val accent=when(rank){1->DiscoveryRose;2->Violet;else->Pink}
 if(podium!=null){
  Box(podium.clip(shape).background(Panel).clickable(onClick=open).testTag(tag).border(1.dp,Brush.verticalGradient(listOf(accent.copy(alpha=.70f),accent.copy(alpha=.28f))),shape)){
   RankingArtwork(row,id,name,category,crew,track,Modifier.fillMaxSize())
   Spacer(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha=.18f),Color.Transparent,Ink.copy(alpha=.80f),Ink))))
   Row(Modifier.fillMaxWidth().align(Alignment.TopCenter).padding(7.dp),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){
    Text("${rank}위",fontSize=12.sp,lineHeight=17.sp,fontWeight=FontWeight.Bold,color=Ink,modifier=Modifier.background(accent,RoundedCornerShape(6.dp)).padding(horizontal=6.dp,vertical=2.dp))
    Box(Modifier.background(Ink.copy(alpha=.76f),CircleShape).padding(horizontal=4.dp)){RankMovement(change,category,id)}
   }
   Column(Modifier.fillMaxWidth().align(Alignment.BottomCenter).padding(horizontal=6.dp,vertical=8.dp),horizontalAlignment=Alignment.CenterHorizontally){
    if(song!=null)Box(Modifier.align(Alignment.End)){HomePlaybackButton(song,m,listOf(song))}
    Text(name,fontSize=if(rank==1)15.sp else 13.sp,lineHeight=18.sp,fontWeight=FontWeight.Bold,color=Color.White,maxLines=2,overflow=TextOverflow.Ellipsis,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
    if(detail.isNotBlank())Text(detail,fontSize=10.sp,lineHeight=13.sp,color=SoftText,maxLines=2,overflow=TextOverflow.Ellipsis,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
    Spacer(Modifier.height(5.dp));RankScore(row,accent)
   }
  }
 }else{
  Row(Modifier.fillMaxWidth().padding(bottom=5.dp).clip(shape).background(Brush.horizontalGradient(listOf(Panel,Ink))).border(.8.dp,Stroke,shape).clickable(onClick=open).testTag(tag).padding(horizontal=8.dp,vertical=6.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)){
   Text("$rank",fontSize=18.sp,fontWeight=FontWeight.Bold,color=Violet,modifier=Modifier.widthIn(min=22.dp))
   RankingArtwork(row,id,name,category,crew,track,Modifier.size(51.dp))
   Column(Modifier.weight(1f)){
    Text(name,fontSize=14.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
    if(detail.isNotBlank())Text(detail,fontSize=11.sp,lineHeight=15.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){RankScore(row,Violet);RankMovement(change,category,id)}
   }
   if(song!=null)HomePlaybackButton(song,m,listOf(song)) else Icon(Icons.Rounded.ChevronRight,null,Modifier.size(19.dp),tint=Muted)
  }
 }
}
