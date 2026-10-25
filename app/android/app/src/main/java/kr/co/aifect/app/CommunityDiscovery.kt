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

@Composable internal fun CurrentCrewDirectory(m:MusicModel){
 val list=rememberLazyListState()
 val read=currentRead(m,"/api/crews?summary=1",poll=30000)
 var query by rememberSaveable{mutableStateOf("")}
 var interest by rememberSaveable{mutableStateOf("")}
 var recruitment by rememberSaveable{mutableStateOf("")}
 var level by rememberSaveable{mutableStateOf("")}
 var onlyMine by rememberSaveable{mutableStateOf(false)}
 var sort by rememberSaveable{mutableStateOf("recommended")}
 var grid by rememberSaveable{mutableStateOf(true)}
 var filtering by remember{mutableStateOf(false)}
 var creating by remember{mutableStateOf(false)}
 val all=read.data?.optJSONArray("crews").objects()
 val mine=read.data?.clean("mine").orEmpty()
 val selectedFilters=listOf(interest.isNotEmpty(),recruitment.isNotEmpty(),level.isNotEmpty(),onlyMine).count{it}
 val recommended=all.sortedWith(compareByDescending<JSONObject>{it.optInt("match")}.thenByDescending{it.optLong("xp")})
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
 LazyColumn(Modifier.fillMaxSize().testTag("crew-directory-scroll"),state=list,contentPadding=PaddingValues(16.dp,18.dp,16.dp,28.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
  item{Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
   Column(Modifier.weight(1f)){Text("함께하는 음악 모임",fontSize=19.sp,lineHeight=26.sp,fontWeight=FontWeight.Bold);Text("듣고, 부르고, 이야기해요",fontSize=12.sp,color=Muted,modifier=Modifier.padding(top=5.dp))}
   BrandButton(onClick={if(mine.isNotBlank())m.openCurrentWorkspace("crew/$mine","내 크루")else if(m.authenticated())creating=true},enabled=!read.loading,modifier=Modifier.testTag("current-crews-open"),contentPadding=PaddingValues(horizontal=12.dp)){Text(if(mine.isNotBlank())"내 크루" else "크루 만들기",fontSize=12.sp)}
  }}
  if(read.loading||read.error!=null)item{ReadStatus(read)}
  if(recommended.isNotEmpty())item(key="featured-crews"){
   val featured=recommended.take(5)
   val pager=rememberAutoCarousel(featured.size,list.layoutInfo.visibleItemsInfo.any{it.key=="featured-crews"})
   val current=pager.currentPage%featured.size
   Surface(color=Panel,shape=RoundedCornerShape(18.dp),border=BorderStroke(1.dp,Stroke)){
    Column(Modifier.background(Brush.linearGradient(listOf(Pink.copy(alpha=.06f),Aqua.copy(alpha=.02f)))).padding(vertical=16.dp)){
     Text("지금 주목할 만한 크루",fontSize=16.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(horizontal=14.dp).padding(bottom=14.dp))
     BoxWithConstraints(Modifier.fillMaxWidth()){
      val cardWidth=(maxWidth-44.dp).coerceAtMost(268.dp)
      HorizontalPager(state=pager,pageSize=PageSize.Fixed(cardWidth),contentPadding=PaddingValues(horizontal=14.dp),pageSpacing=12.dp,modifier=Modifier.fillMaxWidth().testTag("crew-carousel").semantics{stateDescription="${current+1} / ${featured.size}"}){page->
       val c=featured[page%featured.size];FeaturedCrewCard(c,mine,Modifier.fillMaxWidth()){open(c)}
      }
     }
     if(featured.size>1)Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.Center){repeat(featured.size){page->Box(Modifier.padding(horizontal=3.dp).size(5.dp).clip(CircleShape).background(if(page==current)Pink else Muted.copy(alpha=.35f)))}}
    }
   }
  }
  item{
   Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
    CurrentSearch(query,{query=it},"크루명 · 관심사 검색","crew-directory-search",Modifier.weight(1f))
    OutlinedButton(onClick={filtering=true},modifier=Modifier.heightIn(min=48.dp).testTag("crew-filters"),shape=RoundedCornerShape(12.dp),border=BorderStroke(1.dp,if(selectedFilters>0)Pink else Stroke),contentPadding=PaddingValues(horizontal=10.dp)){
     Icon(Icons.Rounded.Tune,null,Modifier.size(18.dp),tint=SoftText);Text(if(selectedFilters>0)" $selectedFilters" else " 필터",fontSize=12.sp,color=SoftText)
    }
   }
  }
  item{Column{
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("발견할 크루",fontSize=16.sp,fontWeight=FontWeight.Bold);Text(" ${filtered.size}",fontSize=15.sp,color=Pink);Spacer(Modifier.weight(1f))
    IconButton(onClick={grid=true},modifier=Modifier.size(44.dp).testTag("crew-layout-grid")){Icon(Icons.Rounded.GridView,"크루 카드로 보기",Modifier.size(20.dp),tint=if(grid)Pink else Muted)}
    IconButton(onClick={grid=false},modifier=Modifier.size(44.dp).testTag("crew-layout-list")){Icon(Icons.Rounded.ViewList,"크루 목록으로 보기",Modifier.size(20.dp),tint=if(!grid)Pink else Muted)}
   }
   val sorts=listOf("recommended" to "추천순","recent" to "최신순","level" to "레벨순","members" to "인원순")
   CommunityChoice(sorts.first{it.first==sort}.second,"crew-sort",sorts,sort){sort=it}
  }}
  if(grid)items(filtered.chunked(2),key={"grid-"+it.first().clean("id")}){pair->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
   pair.forEach{c->CrewPhotoCard(c,mine,Modifier.weight(1f)){open(c)}};if(pair.size==1)Spacer(Modifier.weight(1f))
  }}else items(filtered,key={"list-"+it.clean("id")}){c->FeaturedCrewCard(c,mine,Modifier.fillMaxWidth()){open(c)}}
  if(filtered.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty("조건에 맞는 크루가 없어요","검색어나 필터를 바꿔보세요.")}
  val ranked=read.data?.optJSONArray("rankings").objects().ifEmpty{rankedCrews(all)}.take(5)
  if(ranked.isNotEmpty())item{
   Surface(color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.testTag("crew-directory-ranking")){
    Column(Modifier.padding(14.dp)){
     Text("크루 랭킹",fontSize=16.sp,fontWeight=FontWeight.Bold);Text("레벨순 · 같은 레벨은 누적 경험치순",fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=4.dp,bottom=8.dp))
     ranked.forEachIndexed{index,c->Row(Modifier.fillMaxWidth().clickable{open(c)}.padding(vertical=10.dp),verticalAlignment=Alignment.CenterVertically){
      Text("${index+1}",fontSize=15.sp,fontWeight=FontWeight.Bold,color=Pink,modifier=Modifier.width(26.dp))
      CommunityPhoto(c.clean("id"),c.clean("name"),c.clean("image_version"),"crew",Modifier.size(44.dp),true)
      Column(Modifier.weight(1f).padding(horizontal=10.dp)){Text(c.clean("name"),fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis);Text("${c.optInt("members")}명",fontSize=12.sp,color=Muted)}
      Text("LV.${c.optInt("level",1)}",fontSize=12.sp,color=Muted)
     }}
    }
   }
  }
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

@Composable private fun CrewState(c:JSONObject,mine:String){
 val open=crewOpen(c)
 Text(if(c.clean("id")==mine)"내 크루" else if(open)"모집 중" else "모집 마감",fontSize=10.sp,lineHeight=15.sp,color=if(open)Aqua else Muted,modifier=Modifier.border(1.dp,if(open)Aqua.copy(alpha=.35f) else Stroke,CircleShape).padding(horizontal=7.dp,vertical=3.dp))
}
@Composable private fun FeaturedCrewCard(c:JSONObject,mine:String,modifier:Modifier,open:()->Unit){
 Surface(onClick=open,color=Ink.copy(alpha=.55f),shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Stroke),modifier=modifier.testTag("crew-featured-${c.clean("id")}")){
  Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
    CommunityPhoto(c.clean("id"),c.clean("name"),c.clean("image_version"),"crew",Modifier.size(84.dp))
    Column(Modifier.weight(1f)){
     Text(c.clean("name"),fontSize=16.sp,lineHeight=21.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
     Text(c.clean("description").ifBlank{"함께 음악을 나눠요"},fontSize=12.sp,lineHeight=17.sp,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=5.dp))
     Text("${c.optInt("members")}명 · LV.${c.optInt("level",1)}",fontSize=11.sp,color=SoftText,modifier=Modifier.padding(top=7.dp))
    }
   }
   Row(verticalAlignment=Alignment.CenterVertically){CrewState(c,mine);Spacer(Modifier.weight(1f));Box(Modifier.clip(RoundedCornerShape(9.dp)).background(BrandGradient).padding(horizontal=14.dp,vertical=8.dp)){Row(verticalAlignment=Alignment.CenterVertically){Text("자세히 보기",fontSize=11.sp,fontWeight=FontWeight.SemiBold,color=Ink);Icon(Icons.Rounded.ChevronRight,null,Modifier.size(15.dp),tint=Ink)}}}
  }
 }
}
@Composable private fun CrewPhotoCard(c:JSONObject,mine:String,modifier:Modifier,open:()->Unit){
 Surface(onClick=open,color=Panel,shape=RoundedCornerShape(16.dp),border=BorderStroke(1.dp,Stroke),modifier=modifier.testTag("crew-discovery-${c.clean("id")}")){
  Column(Modifier.padding(10.dp)){
   CommunityPhoto(c.clean("id"),c.clean("name"),c.clean("image_version"),"crew",Modifier.fillMaxWidth().aspectRatio(1f))
   Text(c.clean("name"),fontSize=15.sp,lineHeight=21.sp,fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=10.dp))
   Text(c.clean("description").ifBlank{"함께 음악을 나눠요"},fontSize=12.sp,lineHeight=17.sp,color=Muted,maxLines=2,minLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
   Text("${c.optInt("members")}명 · LV.${c.optInt("level",1)}",fontSize=11.sp,color=Muted,modifier=Modifier.padding(top=8.dp,bottom=10.dp))
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){CrewState(c,mine);Spacer(Modifier.weight(1f));Icon(Icons.Rounded.ChevronRight,null,Modifier.size(18.dp),tint=Pink)}
  }
 }
}

@Composable internal fun CurrentRankings(m:MusicModel){
 var category by rememberSaveable{mutableStateOf("work")}
 var period by rememberSaveable{mutableStateOf("week")}
 var kind by rememberSaveable{mutableStateOf("solo")}
 val read=currentRead(m,"/api/community/rankings?category=$category&period=$period&workKind=$kind")
 val crews=currentRead(m,"/api/crews?summary=1",enabled=category=="crew")
 val crewPhotos=crews.data?.optJSONArray("crews").objects().associateBy{it.clean("id")}
 val categories=listOf(Triple("work","작품",Icons.Rounded.MusicNote),Triple("aiArtist","AI 아티스트",Icons.Rounded.Person),Triple("crew","크루",Icons.Rounded.Groups),Triple("dubbing","더빙",Icons.Rounded.RecordVoiceOver))
 LazyColumn(Modifier.fillMaxSize().testTag("community-rankings-scroll"),contentPadding=PaddingValues(16.dp,16.dp,16.dp,28.dp)){
  item{
   Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).testTag("ranking-category"),horizontalArrangement=Arrangement.spacedBy(8.dp)){
    categories.forEach{(key,label,icon)->val active=category==key;Column(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(13.dp)).background(if(active)Violet.copy(alpha=.13f)else Panel).border(1.dp,if(active)Violet else Stroke,RoundedCornerShape(13.dp)).selectable(active,role=Role.Tab){category=key}.testTag("ranking-category-$key").padding(vertical=12.dp),horizontalAlignment=Alignment.CenterHorizontally){
     Icon(icon,null,Modifier.size(22.dp),tint=if(active)Pink else Muted)
     Spacer(Modifier.height(7.dp))
     Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal=1.dp),contentAlignment=Alignment.Center){Text(if(key=="aiArtist")"AI\n아티스트" else label,fontSize=12.sp,lineHeight=16.sp,fontWeight=FontWeight.SemiBold,color=if(active)Pink else SoftText,maxLines=2,modifier=Modifier.fillMaxWidth().testTag("ranking-label-$key"),textAlign=androidx.compose.ui.text.style.TextAlign.Center)}
    }
    }
   }
   Row(Modifier.fillMaxWidth().padding(top=14.dp,bottom=16.dp).testTag("ranking-toolbar"),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
    if(category=="work")Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
     listOf("solo" to "솔로","duet" to "듀엣").forEach{(key,label)->val active=kind==key;Box(Modifier.clip(RoundedCornerShape(10.dp)).background(if(active)BrandGradient else Brush.linearGradient(listOf(Panel,Panel))).selectable(active,role=Role.Tab){kind=key}.testTag("ranking-kind-$key").heightIn(min=44.dp).padding(horizontal=15.dp),contentAlignment=Alignment.Center){Text(label,fontSize=13.sp,color=if(active)Ink else SoftText,fontWeight=FontWeight.Medium)}}
    }else Text(categories.first{it.first==category}.second+" 랭킹",fontSize=15.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
    CommunityChoice(if(period=="week")"주간" else "월간","ranking-period",listOf("week" to "주간","month" to "월간"),period){period=it}
   }
   ReadStatus(read)
  }
  val rows=read.data?.optJSONArray("rows").objects()
  val podium=category=="crew"
  if(podium&&rows.isNotEmpty()){
   item{CrewRankPodium(rows,crewPhotos){r->val id=r.clean("id");if(CurrentNavigation.safeID(id))m.openCurrentWorkspace("crew/$id",r.clean("name"))}}
   val mine=crews.data?.clean("mine").orEmpty()
   val myIndex=rows.indexOfFirst{it.clean("id")==mine}
   if(mine.isNotBlank()&&myIndex>=0)item{val row=rows[myIndex];MyCrewRank(row,row.optInt("rank",myIndex+1),crewPhotos[mine]){m.openCurrentWorkspace("crew/$mine",row.clean("name"))}}
  }
  itemsIndexed(if(podium)rows.drop(3)else rows,key={i,r->"$category-${r.clean("id").ifBlank{r.clean("href").ifBlank{i.toString()}}}"}){index,r->
   CommunityRankRow(r,index+1+(if(podium)3 else 0),category,crewPhotos[r.clean("id")],m)
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
@Composable private fun CommunityRankRow(row:JSONObject,position:Int,category:String,crew:JSONObject?,m:MusicModel){
 val id=row.clean("id").ifBlank{row.clean("href").substringAfterLast('/')}
 val name=row.clean("name")
 val rank=row.optInt("rank",position).takeIf{it>0}?:position
 val account=m.user?.optString("id")
 var track by remember(id,account){mutableStateOf(m.api.peek("/api/tracks/$id")?.optJSONObject("track"))}
 LaunchedEffect(id,account,category){if(category=="work"&&CurrentNavigation.safeID(id)&&track==null)try{track=m.api.call("/api/tracks/$id").optJSONObject("track")}catch(e:Exception){if(e is CancellationException)throw e}}
 val change=communityRankChange(row,rank)
 fun open(){if(CurrentNavigation.safeID(id))when(category){"work"->m.openCurrentSong(id);"aiArtist"->m.openProfile(id,"artist");"crew"->m.openCurrentWorkspace("crew/$id",name);"dubbing"->m.openCurrentWorkspace("dubbing/$id",name)}}
 Row(Modifier.fillMaxWidth().clickable(onClick=::open).testTag("community-rank-$category-$id").padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
  Text("$rank",fontSize=17.sp,fontWeight=FontWeight.Bold,color=if(rank<=3)Pink else SoftText,modifier=Modifier.width(25.dp))
  when(category){
   "aiArtist"->CommunityPhoto(id,name,row.clean("image_version"),"artist",Modifier.size(56.dp),true)
   "crew"->CommunityPhoto(id,name,crew?.clean("image_version").orEmpty().ifBlank{row.clean("image_version")},"crew",Modifier.size(56.dp))
   // Cover works use the uploader's profile photo, including its default avatar.
   "work"->Artwork(Song(track?:payload("id" to id,"title" to name)),Modifier.size(56.dp).testTag("ranking-art-$id"),10.dp)
   else->Box(Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)).background(Raised).testTag("ranking-art-$id"),contentAlignment=Alignment.Center){Icon(Icons.Rounded.RecordVoiceOver,"$name 더빙",tint=Pink);AsyncImage(currentDubbingImage(row),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)}
  }
  Column(Modifier.weight(1f)){
   Text(name,fontSize=15.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
   val detail=if(category=="work"&&track!=null)Song(track!!).credit+" · "+row.clean("detail") else row.clean("detail")
   Text(detail,fontSize=12.sp,lineHeight=17.sp,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
  }
  Text(change.first,fontSize=11.sp,fontWeight=FontWeight.SemiBold,color=if(change.first.startsWith("▲")||change.first=="NEW")Pink else if(change.first.startsWith("▼"))Aqua else Muted,modifier=Modifier.widthIn(min=30.dp).testTag("community-movement-$category-$id").semantics{contentDescription=change.second},textAlign=androidx.compose.ui.text.style.TextAlign.End)
 }
 HorizontalDivider(color=Stroke)
}
