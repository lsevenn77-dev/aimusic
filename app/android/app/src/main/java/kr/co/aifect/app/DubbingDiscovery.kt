package kr.co.aifect.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
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
  .selectable(on,role=Role.Tab,onClick=click).heightIn(min=34.dp).padding(horizontal=5.dp),
  verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.Center){
  val tint=if(on)Color(0xFF20172B) else SoftText
  if(icon!=null){Icon(icon,null,Modifier.size(16.dp),tint=tint);Spacer(Modifier.width(3.dp))}
  Text(label,color=tint,fontSize=13.sp,fontWeight=if(on)FontWeight.Bold else FontWeight.Medium,maxLines=1)
 }
}
@Composable private fun DubModes(done:Boolean,change:(Boolean)->Unit){
 Row(Modifier.fillMaxWidth().glass(pill).padding(2.dp)){
  DubTab("참여 가능",!done,{change(false)},Modifier.weight(1f).heightIn(min=40.dp).testTag("dub-mode-open"),Icons.Rounded.Mic)
  DubTab("완성작 보기",done,{change(true)},Modifier.weight(1f).heightIn(min=40.dp).testTag("dub-mode-done"),Icons.Rounded.PlayArrow)
 }
}
@Composable private fun DubHeading(label:String,icon:ImageVector,action:(@Composable ()->Unit)?=null){
 Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
  Icon(icon,null,Modifier.size(21.dp),tint=lavender);Spacer(Modifier.width(6.dp))
  Text(label,Modifier.weight(1f),fontSize=17.sp,lineHeight=22.sp,fontWeight=FontWeight.Bold)
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
 if(work.genres.any{it in dubbingGenres})DubbingCover(work.project,modifier)
 else Box(modifier.clip(RoundedCornerShape(10.dp)).background(Panel),contentAlignment=Alignment.Center){Icon(Icons.Rounded.TheaterComedy,null,tint=Muted)}
}
@Composable private fun DubPoster(work:DubWork,rank:Int?,open:()->Unit,modifier:Modifier){
 Box(modifier.aspectRatio(3f/4f).clip(RoundedCornerShape(10.dp)).background(Panel).clickable(onClick=open)
  .testTag((if(rank!=null)"dub-cover-" else "dub-starter-")+work.id)){
  DubArtwork(work,Modifier.fillMaxSize())
  Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent,.3f to Color.Transparent,.72f to Color.Black.copy(alpha=.70f),1f to Color(0xF20E1120))))
  if(rank!=null)Text(rank.toString(),Modifier.align(Alignment.TopStart).padding(4.dp).clip(RoundedCornerShape(5.dp)).background(Color(0xCC101323)).padding(horizontal=5.dp,vertical=1.dp),fontSize=12.sp,fontWeight=FontWeight.Bold,color=rankColor(rank))
  Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(6.dp)){
   Text(work.title,color=Color.White,fontSize=14.sp,lineHeight=16.sp,maxLines=2,fontWeight=FontWeight.SemiBold,overflow=TextOverflow.Ellipsis)
   val meta=listOfNotNull(work.project.optInt("roleCount").takeIf{it>0}?.let{"${it}인극"},
    if(rank==null)work.seconds.takeIf{it>0}?.let{"약 ${(it+30)/60}분"} else work.badge).joinToString(" · ")
   Text(meta,Modifier.padding(top=3.dp),fontSize=11.sp,lineHeight=13.sp,maxLines=2,color=SoftText,overflow=TextOverflow.Ellipsis)
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
   Text("${work.project.optInt("roleCount")}인극",fontSize=11.sp,color=SoftText)
   if(work.finished)Text(work.plays?.let{"재생 ${it}회"}?:"재생 수 미집계",color=Muted,fontSize=11.sp)
   DubBadge(work.badge,if(work.count==0)Muted else if(rank!=null)Aqua else lavender)
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

@Composable internal fun DubbingDiscovery(m:MusicModel,menu:()->Unit){
 var page by rememberSaveable{mutableStateOf("home")}
 var done by rememberSaveable{mutableStateOf(false)}
 var weekly by rememberSaveable(done){mutableStateOf(true)}
 var periodChosen by rememberSaveable(done){mutableStateOf(false)}
 var genre by rememberSaveable{mutableStateOf("전체")}
 var query by rememberSaveable{mutableStateOf("")}
 var order by rememberSaveable{mutableStateOf("최신순")}
 var limit by rememberSaveable(page,genre,done,query,weekly){mutableIntStateOf(12)}
 var sortMenu by remember{mutableStateOf(false)}
 var info by remember{mutableStateOf(false)}
 var revision by remember{mutableIntStateOf(0)}
 val account=m.user?.optString("id")
 val cache=remember(account){mutableStateMapOf<Boolean,DubCatalogue>()}
 var loading by remember(done,account){mutableStateOf(true)}
 var editionRoot by rememberSaveable(done,account){mutableStateOf<String?>(null)}
 var error by remember(done,account){mutableStateOf<String?>(null)}
 val lifecycle=androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
 LaunchedEffect(done,account,revision,lifecycle){
  lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED){
   loading=true;error=null
   try{loadDubCatalogue(m.api,done){if(cache[done]==null||it.incomplete||it.works.isEmpty()||it.works.any{w->w.count!=null})cache[done]=it}}
   catch(e:CancellationException){throw e}catch(e:Exception){error=e.message?:"작품을 불러오지 못했어."}
   finally{loading=false}
  }
 }
 val data=cache[done]?:DubCatalogue(emptyList())
 LaunchedEffect(done,data,loading){
  if(!loading&&!periodChosen&&data.works.isNotEmpty()&&!data.incomplete){
   weekly=data.ranked(true,done).isNotEmpty()
   periodChosen=true
  }
 }
 fun setPeriod(value:Boolean){periodChosen=true;weekly=value}
 val ranks=remember(data,weekly,done){data.ranked(weekly,done)}
 val filtered=data.works.filter{(genre=="전체"||genre in it.genres)&&(query.trim().let{q->it.title.contains(q,true)||it.creator.contains(q,true)||it.editions.any{p->p.optString("ownerName").contains(q,true) || p.optString("title").contains(q,true)}})}
 val beginners=filtered.filter{it.beginner}.sortedWith(compareByDescending<DubWork>{it.preferredBeginner}.thenByDescending{it.created})
 val list=if(page=="starter")beginners else when(order){"제목순"->filtered.sortedBy{it.title};"인기순"->{
  val positions=data.ranked(false,done).mapIndexed{i,w->w.id to i}.toMap()
  filtered.sortedBy{positions[it.id]?:Int.MAX_VALUE}
 };else->filtered.sortedByDescending{it.created}}
 val visibleRanks=ranks.filter{w->filtered.any{it.id==w.id}}
 val context=androidx.compose.ui.platform.LocalContext.current
 var previewId by remember{mutableStateOf<String?>(null)}
 var player by remember{mutableStateOf<NativeDubbingAudio?>(null)}
 var previewError by remember{mutableStateOf<String?>(null)}
 val scope=rememberCoroutineScope()
 var previewJob by remember{mutableStateOf<kotlinx.coroutines.Job?>(null)}
 fun stop(){previewJob?.cancel();previewJob=null;player?.close();player=null;previewId=null}
 DisposableEffect(lifecycle,page,done){
  val observer=androidx.lifecycle.LifecycleEventObserver{_,event->if(event==androidx.lifecycle.Lifecycle.Event.ON_STOP)stop()}
  lifecycle.addObserver(observer)
  onDispose{lifecycle.removeObserver(observer);stop()}
 }
 val playing=player?.previewing?.collectAsState()?.value==true
 fun open(w:DubWork){stop();if(w.finished)editionRoot=w.rootId else m.openCurrentWorkspace("dubbing/"+w.id,w.title)}
 fun preview(w:DubWork){
  val wasPlaying=previewId==w.id && (playing||previewJob?.isActive==true)
  stop();if(wasPlaying)return
  previewId=w.id
  previewJob=scope.launch{
   try{
    val detail=m.api.call("/api/dubbing/projects/"+w.id).getJSONObject("project")
    val source=if(w.finished)detail.optJSONObject("recording")?.optJSONObject("final") else detail.optJSONObject("sound")
    if(source?.optString("state")!="ready"){previewError=if(w.finished)"아직 완성 음원이 준비되지 않았어." else "아직 미리 들을 배경 음원이 없어.";return@launch}
    val url=source.optString("audioUrl").ifBlank{if(w.finished)"" else "/api/dubbing/projects/"+w.id+"/background"}
    if(url.isBlank()){previewError="재생할 음원이 없어.";return@launch}
    m.controller?.pause()
    player=NativeDubbingAudio(context,m.api).also{it.listen(url,finalProjectId=w.id.takeIf{w.finished})}
   }catch(e:CancellationException){throw e}catch(e:Exception){previewError=e.message?:"음원을 열 수 없어."}
  }
 }
 fun navigate(target:String){page=target;query="";genre="전체";order="최신순"}
 fun home(){navigate("home")}
 BackHandler(page!="home"&&editionRoot==null){home()}
 Column(Modifier.fillMaxSize().testTag("current-play")){
  if(page=="home"){
   CurrentTabs(listOf("song" to "노래","dubbing" to "더빙","browse" to "둘러보기"),"dubbing","play-main",actions={IconButton(menu){Icon(Icons.Rounded.Menu,"전체 메뉴")}}){if(it!="dubbing"){m.playMode=it;m.playSection="recommended"}}
  }else Row(Modifier.fillMaxWidth().heightIn(min=48.dp).padding(horizontal=8.dp),verticalAlignment=Alignment.CenterVertically){
   IconButton(::home){Icon(Icons.AutoMirrored.Rounded.ArrowBack,"더빙 홈으로")}
   Text(when(page){"rank"->"랭킹";"genre"->"장르별 작품 찾기";"mine"->"내 작업";"starter"->"처음이라면 여기부터";else->if(done)"신규 완성작" else "신규 참여 작품"},Modifier.weight(1f),fontWeight=FontWeight.Bold,fontSize=18.sp,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
   Spacer(Modifier.width(48.dp))
  }
  if(page=="mine"){
   if(m.user==null){TextButton({m.showLogin=true}){Text("로그인하고 내 작업 보기")}}
   else DubMine(m)
   return@Column
  }
  val scroller=key(page,done){rememberLazyListState()}
  LazyColumn(Modifier.fillMaxSize().testTag("dub-list"),state=scroller,contentPadding=PaddingValues(12.dp,8.dp,12.dp,24.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
   if(page=="genre"){
    item{CurrentSearch(query,{query=it},"작품 제목 또는 창작자 검색","dub-search")}
    item{GenreStrip(genre,{genre=it})}
   }
   item{DubModes(done){done=it}}
   if(page=="home"&&!done)item{
    Row(Modifier.fillMaxWidth().glass(pill).padding(2.dp)){
     listOf("home" to "추천","rank" to "랭킹","genre" to "장르","new" to "신규").forEach{(p,label)->DubTab(label,p==page,{navigate(p)},Modifier.weight(1f).testTag("dub-nav-$p"),when(p){"rank"->Icons.Rounded.EmojiEvents;"genre"->Icons.Rounded.GridView;"new"->Icons.Rounded.AutoAwesome;else->null})}
    }
   }
   if(page=="rank"){
    item{GenreStrip(genre,{genre=it})}
    item{Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){CurrentSearch(query,{query=it},"제목 또는 창작자","dub-search",Modifier.weight(1f));DubPeriod(weekly,::setPeriod)}}
   }
   if(loading&&data.works.isEmpty())item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=lavender)}
   if(error!=null||data.incomplete&&!loading)item{Row(verticalAlignment=Alignment.CenterVertically){Text(error?:"일부 작품의 더빙 집계를 불러오지 못했어.",Modifier.weight(1f),fontSize=12.sp,color=Muted);TextButton({revision++}){Text("다시 시도")}}}
   if(page=="home"||page=="rank"){
    val title=if(done)"완성작 인기 랭킹" else if(page=="rank")"참여 가능 작품 인기 랭킹" else "작품 인기 랭킹"
    item{DubHeading(title,Icons.Rounded.EmojiEvents){
     if(page=="home"){IconButton({navigate("rank")},Modifier.size(36.dp).testTag("dub-open-ranking")){Icon(Icons.Rounded.ChevronRight,"랭킹 전체보기")};DubPeriod(weekly,::setPeriod)}
     else IconButton({info=true}){Icon(Icons.Rounded.Info,"집계 기준")}
    }}
    if(page=="home"){
     itemsIndexed(ranks.take(6).chunked(3)){i,row->DubPosterRow(row,i*3+1,::open)}
    }else{
     items(visibleRanks.take(limit),key={it.id}){w->DubRow(w,ranks.indexOf(w)+1,{open(w)},{preview(w)},playing&&previewId==w.id)}
     if(visibleRanks.size>limit)item{MoreDub{limit+=12}}
    }
    if((if(page=="home")ranks else visibleRanks).isEmpty()&&!loading&&error==null)item{
     Column(Modifier.fillMaxWidth().glass().padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally){
      Text(if(weekly)"이번 주 집계된 작품이 없어." else "조건에 맞는 랭킹 작품이 없어.",color=Muted,fontSize=13.sp)
      if(weekly)TextButton({setPeriod(false)}){Text("전체 기간 보기")}
     }
    }
   }
   if(page=="home"&&!done)item{
    Row(Modifier.fillMaxWidth().clip(cardShape).background(Brush.horizontalGradient(listOf(Color(0xFFD7B8EF),Color(0xFF8EDDD2)))).clickable{m.openCurrentWorkspace("dubbing/new","더빙 대본 만들기")}.heightIn(min=51.dp).testTag("dubbing-create").padding(horizontal=14.dp),verticalAlignment=Alignment.CenterVertically){
     Icon(Icons.Rounded.Edit,null,tint=Ink);Text("  + 더빙 대본 만들기",Modifier.weight(1f),color=Ink,fontSize=17.sp,fontWeight=FontWeight.Bold);Icon(Icons.Rounded.ChevronRight,null,tint=Ink)
    }
   }
   if(page=="home"){
    item{DubHeading("장르별 작품 찾기",Icons.Rounded.Search){TextButton({navigate("genre")}){Text("전체보기 ›",color=Muted)}}}
    item{GenreStrip(genre,{genre=it})}
    if(done)item{CurrentSearch(query,{query=it},"작품 제목 또는 창작자 검색","dub-search")}
   }
   if(page=="home"&&!done){
    item{DubHeading("처음이라면 여기부터",Icons.Rounded.AutoAwesome){if(beginners.isNotEmpty())TextButton({page="starter"}){Text("전체보기 ›",color=Muted)}}}
    if(beginners.isNotEmpty())item{DubPosterRow(beginners.take(3),null,::open)}
    else if(!loading&&error==null)item{Text("아직 등록된 초보자 추천 작품이 없어요.",color=Muted,fontSize=13.sp)}
   }
   if(page!="rank"){
    item{DubHeading(when(page){"genre","starter"->"작품 ${list.size}개";else->if(done)"완성작 리스트" else "신규 참여 작품"},Icons.Rounded.Layers){
     if(page=="home"&&!done)TextButton({navigate("new")}){Text("전체보기 ›",color=Muted)}
     else Box{
      TextButton({sortMenu=true}){Text("$order ⌄",color=SoftText)}
      DropdownMenu(sortMenu,{sortMenu=false},containerColor=Panel){listOf("최신순","인기순","제목순").forEach{label->DropdownMenuItem(text={Text(label)},onClick={order=label;sortMenu=false})}}
     }
    }}
    items(list.take(if(page=="home"&&!done)3 else limit),key={"list-"+it.id}){w->DubRow(w,null,{open(w)},{preview(w)},playing&&previewId==w.id)}
    if(list.isEmpty()&&!loading&&error==null)item{CurrentEmpty(if(query.isNotBlank()||genre!="전체")"검색 결과가 없어." else if(done)"아직 공개된 완성작이 없어." else "아직 공개된 대본이 없어.")}
    if((page!="home"||done)&&list.size>limit)item{MoreDub{limit+=12}}
   }
   if(page=="home")item{TextButton({navigate("mine")},Modifier.fillMaxWidth().testTag("dub-mine")){Text("내 더빙 작업",color=Muted)}}
  }
 }
 data.works.firstOrNull{editionRoot!=null && it.rootId==editionRoot}?.let{w->
  AlertDialog(onDismissRequest={editionRoot=null},title={Text(w.title)},text={
   LazyColumn(verticalArrangement=Arrangement.spacedBy(6.dp)){
    item{Text("완성 더빙 ${w.editions.size}개",color=lavender)}
    items(w.editions,key={it.getString("id")}){p->
     TextButton({editionRoot=null;m.openCurrentWorkspace("dubbing/"+p.getString("id"),w.title)},Modifier.fillMaxWidth()){
      Column(Modifier.weight(1f)){Text(p.optString("ownerName"),fontWeight=FontWeight.SemiBold);Text((p.opt("plays") as? Number)?.let{"재생 ${it.toLong()}회"}?:"재생 수 미집계",fontSize=11.sp,color=Muted)}
      Icon(Icons.Rounded.ChevronRight,"완성본 보기")
     }
    }
   }
  },confirmButton={TextButton({editionRoot=null}){Text("닫기")}})
 }
 if(info||previewError!=null)AlertDialog(onDismissRequest={info=false;previewError=null},title={Text(if(info)"랭킹 집계 기준" else "미리 듣기")},text={Text(previewError?:if(done){if(weekly)"커뮤니티 더빙 주간 순위를 기준으로 표시해." else "완성된 더빙의 좋아요 순으로 표시해."}else if(weekly)"이번 주 월요일부터 시작된 참여 가능 더빙 수를 기준으로 정렬해." else "작품별로 현재 진행 중인 공개 더빙 수를 기준으로 정렬해.")},confirmButton={TextButton({info=false;previewError=null}){Text("확인")}})
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
