package kr.co.aifect.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import androidx.lifecycle.repeatOnLifecycle

private val genres=listOf("전체","로맨스","판타지","스릴러","공포","코미디","액션","일상","사극","SF")
private val lavender=Color(0xFFDEB5FA)
private val glass=Brush.linearGradient(listOf(Color(0xFF24253F),Color(0xFF141B30)))
private val tabColor=Color(0xFFD7B8EF)
private val cardShape=RoundedCornerShape(15.dp)
private val pill=RoundedCornerShape(50)
private fun Modifier.glass(shape:RoundedCornerShape=cardShape)=clip(shape).background(glass).border(1.dp,Color(0xFF35384C),shape)

@Composable private fun DubTab(label:String,on:Boolean,click:()->Unit,modifier:Modifier=Modifier,icon:ImageVector?=null){
 Row(modifier.clip(pill).then(if(on)Modifier.background(tabColor) else Modifier)
  .selectable(on,role=Role.Tab,onClick=click).heightIn(min=44.dp).padding(horizontal=5.dp),
  verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.Center){
  val tint=if(on)Color(0xFF20172B) else SoftText
  if(icon!=null){Icon(icon,null,Modifier.size(16.dp),tint=tint);Spacer(Modifier.width(3.dp))}
  Text(label,color=tint,fontSize=13.sp,fontWeight=if(on)FontWeight.Bold else FontWeight.Medium,maxLines=1)
 }
}
@Composable internal fun StudioSectionTabs(items:List<Pair<String,String>>,selected:String,tag:String,modifier:Modifier=Modifier,onSelect:(String)->Unit){
 Row(modifier.fillMaxWidth().glass(pill).padding(2.dp).testTag(tag)){
  items.forEach{(id,label)->
   val icon=when(id){
    "rank","popular"->Icons.Rounded.EmojiEvents
    "genre"->Icons.Rounded.GridView
    "new","latest"->Icons.Rounded.AutoAwesome
    "duets"->Icons.Rounded.PeopleOutline
    "drafts"->Icons.Rounded.Edit
    else->null
   }
   DubTab(label,id==selected,{onSelect(id)},Modifier.weight(1f).testTag("$tag-$id"),icon)
  }
 }
}
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun DubHeading(label:String,icon:ImageVector,caption:String?=null,action:(@Composable ()->Unit)?=null){
 Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
  Icon(icon,null,Modifier.size(21.dp),tint=lavender);Spacer(Modifier.width(6.dp))
  FlowRow(Modifier.weight(1f),horizontalArrangement=Arrangement.spacedBy(5.dp),verticalArrangement=Arrangement.Center){
   Text(label,fontSize=17.sp,lineHeight=22.sp,fontWeight=FontWeight.Bold)
   if(caption!=null)Text(caption,Modifier.align(Alignment.CenterVertically),fontSize=12.sp,color=Muted)
  }
  action?.invoke()
 }
}
@Composable private fun GenreStrip(genre:String,choose:(String)->Unit){
 Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).testTag("dub-genres"),horizontalArrangement=Arrangement.spacedBy(6.dp)){
  genres.forEach{g->DubTab(if(g=="사극")"시대극" else g,genre==g,{choose(g)},Modifier.widthIn(min=55.dp).glass(pill))}
 }
}
@Composable private fun DubPeriod(weekly:Boolean,set:(Boolean)->Unit){
 Row(Modifier.glass(pill).padding(2.dp)){
  DubTab("주간",weekly,{set(true)},Modifier.widthIn(min=42.dp).testTag("dub-week"))
  DubTab("전체",!weekly,{set(false)},Modifier.widthIn(min=42.dp).testTag("dub-all"))
 }
}
@Composable private fun DubBadge(label:String,tint:Color){
 Text(label,Modifier.clip(pill).background(tint.copy(alpha=.12f)).border(1.dp,tint.copy(alpha=.65f),pill).padding(horizontal=5.dp,vertical=2.dp),
  color=tint,fontSize=10.sp,lineHeight=14.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
}
private fun rankColor(n:Int)=when(n){1->Color(0xFFFFCF65);2->Color(0xFFDFE4F6);3->Color(0xFFF0B690);else->Color.White}
@Composable private fun DubArtwork(work:DubWork,modifier:Modifier){
 if(customDubbingPoster(work.project)!=null || work.genres.any{it in dubbingGenres})DubbingCover(work.project,modifier)
 else Box(modifier.clip(RoundedCornerShape(10.dp)).background(Panel),contentAlignment=Alignment.Center){Icon(Icons.Rounded.TheaterComedy,null,tint=Muted)}
}
@Composable private fun DubPoster(work:DubWork,rank:Int?,open:()->Unit,modifier:Modifier){
 val tag=(if(rank!=null)"dub-cover-" else "dub-starter-")+work.id
 Column(modifier.clickable(onClick=open).testTag(tag),verticalArrangement=Arrangement.spacedBy(4.dp)){
  Box(Modifier.fillMaxWidth().aspectRatio(3f/4f).clip(RoundedCornerShape(10.dp)).background(Panel).testTag("$tag-art")){
   DubArtwork(work,Modifier.fillMaxSize())
   if(rank!=null)Text(rank.toString(),Modifier.align(Alignment.TopStart).padding(5.dp).clip(RoundedCornerShape(5.dp)).background(Color(0xDA101323)).padding(horizontal=5.dp,vertical=1.dp),fontSize=12.sp,fontWeight=FontWeight.Bold,color=rankColor(rank))
  }
  Text(work.title,color=Color.White,fontSize=14.sp,lineHeight=18.sp,maxLines=2,fontWeight=FontWeight.SemiBold,overflow=TextOverflow.Ellipsis)
  val meta=listOfNotNull(work.genres.firstOrNull(),work.formatLabel.takeIf{it.isNotBlank()}).joinToString(" · ")
  Text(meta,fontSize=11.sp,lineHeight=14.sp,maxLines=1,color=SoftText,overflow=TextOverflow.Ellipsis)
 }
}
@Composable private fun DubOriginals(works:List<DubWork>,open:(DubWork)->Unit){
 Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
  Text("AIFECT 오리지널",fontSize=19.sp,fontWeight=FontWeight.Bold)
  BoxWithConstraints(Modifier.fillMaxWidth()){
   val width=(maxWidth*.86f).coerceAtMost(420.dp)
   val pages=rememberPagerState(pageCount={works.size})
   HorizontalPager(state=pages,contentPadding=PaddingValues(end=maxWidth-width),pageSpacing=9.dp,key={works[it].id}){index->
    val w=works[index]
     Box(Modifier.width(width).aspectRatio(1.55f).clip(cardShape).background(Panel).clickable{open(w)}.testTag("dub-feature-"+w.id)){
      DubArtwork(w,Modifier.fillMaxSize())
      Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent,.32f to Color.Transparent,.78f to Color(0xB8080B16),1f to Color(0xF5080B16))))
      Row(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(8.dp)){
       Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)){
        Text((w.genres+listOf(w.formatLabel)).joinToString(" · "),fontSize=12.sp,color=SoftText,maxLines=1,overflow=TextOverflow.Ellipsis)
        Text(if(w.title=="계약 연애 종료 5분 전") "계약 연애\n종료 5분 전" else w.title,color=Color.White,fontSize=21.sp,lineHeight=25.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
       }
       Text("더빙하기",Modifier.clip(pill).background(Color(0xFF8EDDD2)).padding(horizontal=11.dp,vertical=7.dp),fontWeight=FontWeight.Bold,color=Ink,fontSize=13.sp)
      }
     }
   }
  }
 }
}
@Composable private fun DubPosterRow(row:List<DubWork>,firstRank:Int?,open:(DubWork)->Unit){
 Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
  row.forEachIndexed{i,w->DubPoster(w,firstRank?.plus(i),{open(w)},Modifier.weight(1f))}
  repeat(3-row.size){Spacer(Modifier.weight(1f))}
 }
}
@Composable private fun DubRow(work:DubWork,rank:Int?,open:()->Unit,preview:()->Unit,playing:Boolean){
 var menu by remember{mutableStateOf(false)}
 Row(Modifier.fillMaxWidth().glass().clickable(onClick=open).testTag("dubbing-project-"+work.id).padding(6.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){
  if(rank!=null)Text(rank.toString(),Modifier.widthIn(min=24.dp),fontWeight=FontWeight.Bold,fontSize=18.sp,color=rankColor(rank))
  DubArtwork(work,Modifier.width(if(rank==null)83.dp else 73.dp).height(65.dp))
  Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(2.dp)){
   Text(work.title,fontSize=15.sp,lineHeight=19.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
   if(rank==null)Text("창작자  "+work.creator,fontSize=11.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
   Text(work.formatLabel,fontSize=11.sp,color=SoftText)
   if(work.finished)Text(work.plays?.let{"재생 ${it}회"}?:"재생 수 미집계",color=Muted,fontSize=11.sp)
   if(rank==null || work.finished || (work.count ?: 0)>0)DubBadge(work.badge,if(work.count==0)Muted else if(rank!=null)Aqua else lavender)
  }
  if(rank!=null)Icon(Icons.Rounded.ChevronRight,"작품 보기",Modifier.size(21.dp),tint=Muted)
  else Column(horizontalAlignment=Alignment.CenterHorizontally){
   Box{
    IconButton({menu=true},Modifier.size(40.dp,32.dp)){Icon(Icons.Rounded.MoreVert,"작품 메뉴",Modifier.size(18.dp))}
    DropdownMenu(menu,{menu=false},containerColor=Panel){
     DropdownMenuItem(text={Text("작품 상세 보기")},onClick={menu=false;open()})
     DropdownMenuItem(text={Text(if(playing)"재생 정지" else if(work.finished)"완성작 듣기" else "배경 미리 듣기")},onClick={menu=false;preview()})
    }
   }
   IconButton(preview,Modifier.size(40.dp).testTag("dub-preview-"+work.id)){Box(Modifier.size(28.dp).border(1.dp,lavender,pill),contentAlignment=Alignment.Center){Icon(if(playing)Icons.Rounded.Stop else Icons.Rounded.PlayArrow,"재생 전환",Modifier.size(19.dp),tint=lavender)}}
  }
 }
}

@Composable internal fun DubbingDiscovery(m:MusicModel){
 var page by rememberSaveable{mutableStateOf("home")}
 var weekly by rememberSaveable{mutableStateOf(true)}
 var periodChosen by rememberSaveable{mutableStateOf(false)}
 var genre by rememberSaveable{mutableStateOf("전체")}
 var query by rememberSaveable{mutableStateOf("")}
 var order by rememberSaveable{mutableStateOf("최신순")}
 var limit by rememberSaveable(page,genre,query,weekly){mutableIntStateOf(12)}
 var sortMenu by remember{mutableStateOf(false)}
 var info by remember{mutableStateOf(false)}
 var revision by remember{mutableIntStateOf(0)}
 val account=m.user?.optString("id")
 var data by remember(account){mutableStateOf(DubCatalogue(
  m.api.peek("/api/dubbing/projects?tab=open&discovery=1&offset=0")?.optJSONArray("projects").objects()
   .map{DubWork(it,null,false,it.optInt("weeklyActiveCount"),null,null)}
 ))}
 var loading by remember(account){mutableStateOf(true)}
 var error by remember(account){mutableStateOf<String?>(null)}
 val lifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
 LaunchedEffect(account,revision,lifecycle){
  lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){
   loading=true;error=null
   try{loadDubCatalogue(m.api,false){if(data.works.isEmpty()||it.incomplete||it.works.isEmpty()||it.works.any{w->w.count!=null})data=it}}
   catch(e:CancellationException){throw e}catch(e:Exception){
    if(e is ApiException&&e.status in listOf(401,403,404))data=DubCatalogue(emptyList())
    error=e.message?:"작품을 불러오지 못했어."
   }
   finally{loading=false}
  }
 }
 LaunchedEffect(data,loading){
  if(!loading&&!periodChosen&&data.works.isNotEmpty()&&!data.incomplete){
   weekly=data.ranked(true,false).isNotEmpty()
   periodChosen=true
  }
 }
 fun setPeriod(value:Boolean){periodChosen=true;weekly=value}
 val originals=remember(data){data.works.filter{it.project.optBoolean("isOfficialOriginal")}.sortedByDescending{it.created}}
 val ranks=remember(data,weekly){data.ranked(weekly,false)}
 val filtered=remember(data,genre,query){data.works.filter{(genre=="전체"||genre in it.genres)&&(query.trim().let{q->it.title.contains(q,true)||it.creator.contains(q,true)||it.editions.any{p->p.optString("ownerName").contains(q,true) || p.optString("title").contains(q,true)}})}}
 val beginners=remember(filtered){filtered.filter{it.beginner}.sortedWith(compareByDescending<DubWork>{it.preferredBeginner}.thenByDescending{it.created})}
 val list=if(page=="starter")beginners else when(order){"제목순"->filtered.sortedBy{it.title};"인기순"->{
  val positions=data.ranked(false,false).mapIndexed{i,w->w.id to i}.toMap()
  filtered.sortedBy{positions[it.id]?:Int.MAX_VALUE}
 };else->filtered.sortedByDescending{it.created}}
 val visibleRanks=remember(ranks,filtered){val ids=filtered.mapTo(hashSetOf()){it.id};ranks.filter{it.id in ids}}
 val context=androidx.compose.ui.platform.LocalContext.current
 var previewId by remember{mutableStateOf<String?>(null)}
 var player by remember{mutableStateOf<NativeDubbingAudio?>(null)}
 var previewError by remember{mutableStateOf<String?>(null)}
 val scope=rememberCoroutineScope()
 var previewJob by remember{mutableStateOf<kotlinx.coroutines.Job?>(null)}
 fun stop(){previewJob?.cancel();previewJob=null;player?.close();player=null;previewId=null}
 DisposableEffect(lifecycle,page){
  val observer=androidx.lifecycle.LifecycleEventObserver{_,event->if(event==androidx.lifecycle.Lifecycle.Event.ON_STOP)stop()}
  lifecycle.addObserver(observer)
  onDispose{lifecycle.removeObserver(observer);stop()}
 }
 val playing=player?.previewing?.collectAsState()?.value==true
 fun open(w:DubWork){stop();m.openCurrentWorkspace("dubbing/"+w.id,w.title)}
 fun preview(w:DubWork){
  val wasPlaying=previewId==w.id && (playing||previewJob?.isActive==true)
  stop();if(wasPlaying)return
  previewId=w.id
  previewJob=scope.launch{
   try{
    val detail=m.api.call("/api/dubbing/projects/"+w.id).getJSONObject("project")
    val sound=detail.optJSONObject("sound")
    if(sound?.optString("state")!="ready"){previewError="아직 미리 들을 배경 음원이 없어.";return@launch}
    val url=sound.optString("audioUrl").ifBlank{"/api/dubbing/projects/"+w.id+"/background"}
    m.controller?.pause()
    player=NativeDubbingAudio(context,m.api).also{it.listen(url)}
   }catch(e:CancellationException){throw e}catch(e:Exception){previewError=e.message?:"음원을 열 수 없어."}
  }
 }
 fun navigate(target:String){page=target;query="";genre="전체";order="최신순"}
 fun home(){navigate("home")}
 BackHandler(page!="home"){home()}
 Column(Modifier.fillMaxSize().testTag("current-play")){
  if(page=="home"){
   CurrentTabs(listOf("song" to "노래","dubbing" to "더빙","browse" to "둘러보기"),"dubbing","play-main"){if(it!="dubbing"){m.playMode=it;m.playSection="recommended"}}
  }else Row(Modifier.fillMaxWidth().heightIn(min=48.dp).padding(horizontal=8.dp),verticalAlignment=Alignment.CenterVertically){
   IconButton(::home){Icon(Icons.AutoMirrored.Rounded.ArrowBack,"더빙 홈으로")}
   Text(when(page){"rank"->"인기";"genre"->"장르별 작품 찾기";"mine"->"내 작업";"starter"->"처음이라면 여기부터";else->"신규 참여 작품"},Modifier.weight(1f),fontWeight=FontWeight.Bold,fontSize=18.sp,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
   Spacer(Modifier.width(48.dp))
  }
  if(page=="mine"){
   if(m.user==null){TextButton({m.showLogin=true}){Text("로그인하고 내 작업 보기")}}
   else DubMine(m)
   return@Column
  }
  val scroller=key(page){rememberLazyListState()}
  LazyColumn(Modifier.fillMaxSize().testTag("dub-list"),state=scroller,contentPadding=PaddingValues(12.dp,8.dp,12.dp,24.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
   if(page=="genre"){
    item{CurrentSearch(query,{query=it},"작품 제목 또는 창작자 검색","dub-search")}
    item{GenreStrip(genre,{genre=it})}
   }
   if(page=="home")item{
    StudioSectionTabs(listOf("home" to "추천","rank" to "인기","genre" to "장르","new" to "신규"),page,"dub-nav",onSelect=::navigate)
   }
   if(page=="home")item{
    BrandButton({m.openCurrentWorkspace("dubbing/new","더빙 대본 만들기")},modifier=Modifier.fillMaxWidth().heightIn(min=52.dp).testTag("dubbing-create")){
     Icon(Icons.Rounded.Edit,null,Modifier.size(20.dp));Spacer(Modifier.width(8.dp))
     Text("더빙 만들기",Modifier.weight(1f),fontSize=17.sp,fontWeight=FontWeight.Bold)
     Icon(Icons.Rounded.ChevronRight,null)
    }
   }
   if(page=="home"&&originals.isNotEmpty())item{DubOriginals(originals,::open)}
   if(page=="rank"){
    item{GenreStrip(genre,{genre=it})}
    item{Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){CurrentSearch(query,{query=it},"제목 또는 창작자","dub-search",Modifier.weight(1f));DubPeriod(weekly,::setPeriod)}}
   }
   if(loading&&data.works.isEmpty())item{LoadingRows()}
   if(error!=null||data.incomplete&&!loading)item{Row(verticalAlignment=Alignment.CenterVertically){Text(error?:"일부 작품의 더빙 집계를 불러오지 못했어.",Modifier.weight(1f),fontSize=12.sp,color=Muted);TextButton({revision++}){Text("다시 시도")}}}
   if(page=="home"||page=="rank"){
    val title="인기 작품"
    item{DubHeading(title,Icons.Rounded.EmojiEvents){
     if(page=="home"){IconButton({navigate("rank")},Modifier.size(36.dp).testTag("dub-open-ranking")){Icon(Icons.Rounded.ChevronRight,"인기 작품 전체보기")};DubPeriod(weekly,::setPeriod)}
     else IconButton({info=true}){Icon(Icons.Rounded.Info,"집계 기준")}
    }}
    if(page=="home"){
     itemsIndexed(ranks.take(6).chunked(3)){i,row->DubPosterRow(row,i*3+1,::open)}
    }else{
     items(visibleRanks.take(limit),key={it.id}){w->DubRow(w,ranks.indexOf(w)+1,{open(w)},{preview(w)},(playing&&previewId==w.id)||(m.current?.dubbing==true&&m.current?.id==w.id&&m.playing))}
     if(visibleRanks.size>limit)item{MoreDub{limit+=12}}
    }
    if((if(page=="home")ranks else visibleRanks).isEmpty()&&!loading&&error==null)item{
     Column(Modifier.fillMaxWidth().glass().padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally){
      Text(if(weekly)"이번 주 집계된 작품이 없어." else "조건에 맞는 인기 작품이 없어.",color=Muted,fontSize=13.sp)
      if(weekly)TextButton({setPeriod(false)}){Text("전체 기간 보기")}
     }
    }
   }
   if(page=="home"){
    item{DubHeading("장르별 작품 찾기",Icons.Rounded.Search){TextButton({navigate("genre")}){Text("전체보기 ›",color=Muted)}}}
    item{GenreStrip(genre,{genre=it})}
   }
   if(page=="home"){
    item{DubHeading("처음이라면 여기부터",Icons.Rounded.AutoAwesome){if(beginners.isNotEmpty())TextButton({page="starter"}){Text("전체보기 ›",color=Muted)}}}
    if(beginners.isNotEmpty())item{DubPosterRow(beginners.take(3),null,::open)}
    else if(!loading&&error==null)item{Text("아직 등록된 초보자 추천 작품이 없어요.",color=Muted,fontSize=13.sp)}
   }
   if(page!="rank"){
    item{DubHeading(when(page){"genre","starter"->"작품 ${list.size}개";else->"신규 참여 작품"},Icons.Rounded.Layers){
     if(page=="home")TextButton({navigate("new")}){Text("전체보기 ›",color=Muted)}
     else Box{
      TextButton({sortMenu=true}){Text("$order ⌄",color=SoftText)}
      DropdownMenu(sortMenu,{sortMenu=false},containerColor=Panel){listOf("최신순","인기순","제목순").forEach{label->DropdownMenuItem(text={Text(label)},onClick={order=label;sortMenu=false})}}
     }
    }}
    items(list.take(if(page=="home")3 else limit),key={"list-"+it.id}){w->DubRow(w,null,{open(w)},{preview(w)},(playing&&previewId==w.id)||(m.current?.dubbing==true&&m.current?.id==w.id&&m.playing))}
    if(list.isEmpty()&&!loading&&error==null)item{CurrentEmpty(if(query.isNotBlank()||genre!="전체")"검색 결과가 없어." else "아직 공개된 대본이 없어.")}
    if((page!="home")&&list.size>limit)item{MoreDub{limit+=12}}
   }
   if(page=="home")item{TextButton({navigate("mine")},Modifier.fillMaxWidth().testTag("dub-mine")){Text("내 더빙 작업",color=Muted)}}
  }
 }
 if(info||previewError!=null)AlertDialog(onDismissRequest={info=false;previewError=null},title={Text(if(info)"인기 집계 기준" else "미리 듣기")},text={Text(previewError?:if(weekly)"이번 주 월요일부터 시작된 참여 가능 더빙 수를 기준으로 정렬해." else "작품별로 현재 진행 중인 공개 더빙 수를 기준으로 정렬해.")},confirmButton={TextButton({info=false;previewError=null}){Text("확인")}})
}

@Composable private fun MoreDub(click:()->Unit){OutlinedButton(click,Modifier.fillMaxWidth(),shape=pill){Text("더 많은 작품 보기")}}

@Composable private fun DubMine(m:MusicModel){
 var offset by rememberSaveable{mutableIntStateOf(0)}
 val read=currentRead(m,"/api/dubbing/projects?tab=mine&offset=$offset")
 var rows by remember{mutableStateOf(emptyList<org.json.JSONObject>())}
 LaunchedEffect(read.data){read.data?.let{d->val incoming=d.optJSONArray("projects").objects();rows=(if(offset==0)incoming else rows+incoming).distinctBy{it.optString("id")}}}
 LazyColumn(contentPadding=PaddingValues(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
  item{ReadStatus(read)}
  items(rows,key={it.getString("id")}){p->
   Row(Modifier.fillMaxWidth().glass().clickable{m.openCurrentWorkspace("dubbing/"+p.getString("id"),p.optString("title"))}.padding(8.dp),verticalAlignment=Alignment.CenterVertically){
    DubbingCover(p,Modifier.size(54.dp));Text(p.optString("title"),Modifier.weight(1f).padding(horizontal=10.dp));Icon(Icons.Rounded.ChevronRight,"작업 이어가기")
   }
  }
  if(rows.isEmpty()&&!read.loading&&read.error==null)item{CurrentEmpty("아직 참여한 더빙 작업이 없어.")}
  read.data?.takeUnless{it.isNull("nextOffset")}?.let{item{MoreDub{offset=it.getInt("nextOffset")}}}
 }
}
