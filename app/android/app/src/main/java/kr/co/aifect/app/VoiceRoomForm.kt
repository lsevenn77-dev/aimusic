@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

private val FreeRoomBackgrounds=listOf("navy" to "네이비","sunset" to "노을","night" to "밤하늘")

/** The picker and the room use the same painting and the same mobile theme asset. */
@Composable internal fun VoiceRoomBackdrop(background:String,theme:JSONObject?=null,modifier:Modifier=Modifier,preview:Boolean=false){
 val sku=theme?.optString("sku").orEmpty().ifBlank{background}.ifBlank{"navy"}
 val asset=theme?.optJSONObject("assets")?.optString("roomMobile").orEmpty()
  .ifBlank{theme?.optJSONObject("assetPaths")?.optString("roomMobile").orEmpty()}
 val image=profileMediaUrl(asset)
 Box(modifier.testTag("voice-background-$sku")){
  Canvas(Modifier.matchParentSize()){
   val base=when(sku){"sunset"->Color(0xFF0C1422);"night"->Color(0xFF050E1C);else->Color(0xFF07111F)}
   drawRect(base)
   fun wash(color:Color,x:Float,y:Float,radius:Float){
    drawRect(Brush.radialGradient(listOf(color,Color.Transparent),Offset(size.width*x,size.height*y),size.maxDimension*radius))
   }
   // Picker tiles show each free theme at full colour, as in the approved creation screen.
   if(sku in setOf("navy","sunset","night"))when(sku){
    "sunset"->{
     drawRect(Brush.verticalGradient(listOf(Color(0xFF1B1233),Color(0xFF2A1A44),Color(0xFF1A1532))))
     wash(Color(0x884C2A80),.15f,.10f,.60f)
     // A long, tilted glow band like a sunset streak rather than a round spot.
     val mid=Offset(size.width*.52f,size.height*.50f)
     withTransform({rotate(-14f,mid);scale(2.6f,.42f,mid)}){
      drawCircle(Brush.radialGradient(listOf(Color(0xDDF08A78),Color(0x99D0508C),Color.Transparent),mid,size.height*.55f),size.height*.55f,mid)
     }
    }
    "night"->{
     drawRect(Brush.linearGradient(listOf(Color(0xFF070C26),Color(0xFF0C1C4A),Color(0xFF081233)),Offset.Zero,Offset(size.width,size.height)))
     wash(Color(0x664A78E0),.62f,.48f,.48f);wash(Color(0x443A5BC0),.30f,.70f,.40f)
     val stars=java.util.Random(7)
     repeat(60){drawCircle(Color.White.copy(alpha=.25f+stars.nextFloat()*.55f),(.25f+stars.nextFloat()*.55f)*density,Offset(stars.nextFloat()*size.width,stars.nextFloat()*size.height))}
    }
    else->{
     drawRect(Brush.linearGradient(listOf(Color(0xFF241250),Color(0xFF151538),Color(0xFF0E3240)),Offset.Zero,Offset(size.width,size.height)))
     wash(Color(0xCC7B3FE4),.58f,.18f,.55f);wash(Color(0x887A4BF0),.20f,.85f,.40f);wash(Color(0x8840B8B0),.98f,.98f,.40f)
    }
   }else when(sku){
    "sunset"->{wash(Color(0x7770435A),.35f,.15f,.65f);wash(Color(0x66242954),.5f,1f,.65f)}
    "night"->{wash(Color(0x77233D74),.70f,.10f,.48f);wash(Color(0x5539295B),.20f,.80f,.45f)}
    else->{
     drawRect(Color(0xFF0C1025))
     wash(Color(0x884C317B),.88f,.03f,.48f)
     wash(Color(0x663D316C),.18f,.68f,.52f)
     wash(Color(0x55347F91),.98f,.88f,.40f)
    }
   }
   // Preserve the selected free theme's distinguishing colours and stars in-room.
   // The picker remains full-colour; the listening surface is gently dimmed.
   if(!preview&&sku in setOf("navy","sunset","night"))drawRect(Color(0xFF080D1B).copy(alpha=.32f))
  }
  if(image!=null){
   // A picker tile shows the theme's own colours; inside a room the art stays dimmed behind people and chat.
   AsyncImage(image,null,Modifier.matchParentSize().alpha(if(preview)1f else .88f).testTag("voice-background-image"),contentScale=ContentScale.Crop)
   Box(Modifier.matchParentSize().background(Brush.verticalGradient(if(preview)listOf(Color.Transparent,Ink.copy(alpha=.22f))else listOf(Ink.copy(alpha=.25f),Ink.copy(alpha=.56f)))))
  }
 }
}

/** Room creation sits on the same violet aurora as the approved reference: light from the top right, teal at the bottom. */
@Composable internal fun RoomCreateBackdrop(modifier:Modifier=Modifier){
 Canvas(modifier.testTag("room-create-backdrop")){
  drawRect(Ink)
  fun wash(color:Color,x:Float,y:Float,radius:Float){
   drawRect(Brush.radialGradient(listOf(color,Color.Transparent),Offset(size.width*x,size.height*y),size.maxDimension*radius))
  }
  wash(Color(0x6A4C317B),.96f,.02f,.52f)
  wash(Color(0x403D316C),.02f,.58f,.46f)
  wash(Color(0x4A5B3A9A),.92f,.98f,.42f)
  wash(Color(0x38347F91),1.02f,.86f,.30f)
  // Soft light band sweeping in from the top-right corner.
  val band=androidx.compose.ui.graphics.Path().apply{
   moveTo(size.width*.50f,size.height*.10f)
   quadraticTo(size.width*.80f,size.height*.02f,size.width*1.04f,-size.height*.02f)
  }
  val glow=Brush.linearGradient(listOf(Color.Transparent,Color(0x55B9A0FF),Color(0x88D6BAFF)),Offset(size.width*.50f,size.height*.10f),Offset(size.width,0f))
  drawPath(band,glow,style=androidx.compose.ui.graphics.drawscope.Stroke(width=size.width*.10f,cap=androidx.compose.ui.graphics.StrokeCap.Round),alpha=.35f)
  drawPath(band,glow,style=androidx.compose.ui.graphics.drawscope.Stroke(width=size.width*.025f,cap=androidx.compose.ui.graphics.StrokeCap.Round),alpha=.75f)
 }
}
private val RoomFieldFill=Panel.copy(alpha=.72f)

@Composable internal fun NativeRoomForm(
 api:NativeApi,initial:JSONObject=JSONObject(),fullScreen:Boolean=false,busy:Boolean=false,
 submissionError:String?=null,submit:(JSONObject)->Unit
){
 val identity=initial.optString("id","new")
 var mode by rememberSaveable(identity){mutableStateOf(initial.optString("mode","karaoke"))}
 var suggestions by remember{mutableStateOf(JSONObject())}
 var title by rememberSaveable(identity){mutableStateOf(initial.optString("title"))}
 var visibility by rememberSaveable(identity){mutableStateOf(initial.optString("visibility","public"))}
 var seating by rememberSaveable(identity){mutableStateOf(initial.optString("seating_mode","approval"))}
 var capacity by rememberSaveable(identity){mutableIntStateOf(initial.optInt("max_members",30).coerceIn(2,30))}
 var announcement by rememberSaveable(identity){mutableStateOf(initial.optString("announcement"))}
 var crew by rememberSaveable(identity){mutableStateOf(initial.optString("crew_id"))}
 var selectedTheme by rememberSaveable(identity){mutableStateOf(initial.optJSONObject("theme")?.optString("sku").orEmpty().ifBlank{initial.optString("theme_sku")}.ifBlank{initial.optString("background","navy")})}
 var initialThemeChosen by rememberSaveable(identity){mutableStateOf(identity!="new")}
 var themes by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var crews by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var optionsLoading by remember{mutableStateOf(true)}
 var optionsError by remember{mutableStateOf<String?>(null)}
 var retry by remember{mutableIntStateOf(0)}
 var panel by rememberSaveable{mutableStateOf("")}
 val focus=LocalFocusManager.current
 LaunchedEffect(retry){
  optionsLoading=true;optionsError=null
  try{
   val options=api.call("/api/voice/options?mode=$mode&exclude="+java.net.URLEncoder.encode(title,"UTF-8"),fresh=true)
   crews=options.optJSONArray("crews").objects()
   suggestions=options.optJSONObject("suggested_titles")?:JSONObject()
   if((title.isBlank()||retry>0)&&identity=="new")title=suggestions.optString(mode,title)
   themes=options.optJSONArray("themes").objects().filter{it.optBoolean("selectable")}
   if(!initialThemeChosen){
    val preferred=options.optString("preferred_theme").takeIf{key->themes.any{it.optString("sku")==key}}
    selectedTheme=preferred?:themes.firstOrNull()?.optString("sku")?:"navy"
    initialThemeChosen=true
   }
   if(themes.none{it.optString("sku")==selectedTheme})selectedTheme=themes.firstOrNull()?.optString("sku").orEmpty()
  }catch(e:Exception){if(e is CancellationException)throw e;optionsError=e.message?:"설정을 불러오지 못했어요."}
  finally{optionsLoading=false}
 }
 val allThemes=themes
 val selected=allThemes.find{it.optString("sku")==selectedTheme}
 val previewThemes=allThemes.take(3).let{first->if(selected==null||first.any{it.optString("sku")==selectedTheme})first else first.take(2)+selected}
 val onlyCrew=crews.singleOrNull()?.optString("id")
 LaunchedEffect(visibility,onlyCrew){if(visibility=="crew"&&onlyCrew!=null&&crew!=onlyCrew)crew=onlyCrew}
 val valid=title.isNotBlank()&&(visibility!="crew"||crews.any{it.optString("id")==crew})&&selected!=null&&!optionsLoading&&!busy
 fun open(value:String){focus.clearFocus();panel=value}
 val content:@Composable ()->Unit={
  Column(Modifier.fillMaxWidth().testTag("voice-room-form"),verticalArrangement=Arrangement.spacedBy(16.dp)){
   if(!fullScreen)Text("방 설정",fontSize=22.sp,fontWeight=FontWeight.SemiBold)
   Column{RoomFormLabel("방 유형");RoomSegment(listOf("karaoke" to "노래방","talk" to "토킹룸"),mode,!busy){mode=it;if(identity=="new")title=suggestions.optString(it,title)}}
   Column{
    Row(verticalAlignment=Alignment.CenterVertically){
     Text("방 제목",Modifier.weight(1f),fontSize=16.sp,fontWeight=FontWeight.SemiBold)
     TextButton({title=suggestions.optString(mode,title);retry++},enabled=!busy,contentPadding=PaddingValues(start=8.dp,end=0.dp)){
      Icon(Icons.Outlined.AutoAwesome,null,Modifier.size(16.dp),tint=Pink);Spacer(Modifier.width(5.dp));Text("자동 제목 생성",color=Pink,fontSize=13.sp,fontWeight=FontWeight.SemiBold)
     }
    }
    Box(Modifier.fillMaxWidth().padding(top=8.dp)){
     OutlinedTextField(title,{if(it.length<=60)title=it},Modifier.fillMaxWidth().heightIn(min=64.dp).testTag("room-title"),
      enabled=!busy,singleLine=true,placeholder={Text("어떤 이야기를 나눌까요?",color=Muted,fontSize=16.sp)},
      textStyle=LocalTextStyle.current.copy(fontSize=16.sp),shape=RoundedCornerShape(14.dp),colors=roomFieldColors(),
      keyboardOptions=KeyboardOptions(imeAction=ImeAction.Done),keyboardActions=KeyboardActions(onDone={focus.clearFocus()}))
     Text("${title.length}/60",Modifier.align(Alignment.BottomEnd).padding(end=14.dp,bottom=7.dp),fontSize=11.sp,color=Muted)
    }
   }
   Column{
    RoomFormLabel("공개 범위")
    RoomSegment(listOf("public" to "공개","private" to "초대 전용","followers" to "팔로워","crew" to "크루"),visibility,!busy){focus.clearFocus();visibility=it}
    if(visibility=="crew"){
     // A member belongs to one crew, so that crew is the audience without asking again.
     if(crews.size>1)RoomSettingRow("참여할 크루",crews.find{it.optString("id")==crew}?.optString("name")?:"선택",enabled=!busy){open("crew")}
     else crews.firstOrNull()?.let{Text("${it.optString("name")} 크루원에게 공개돼요.",Modifier.padding(top=8.dp).testTag("room-crew-audience"),color=Muted,fontSize=13.sp)}
     if(!optionsLoading&&optionsError==null&&crews.isEmpty())Text("가입한 크루가 있어야 선택할 수 있어요.",color=Muted,fontSize=12.sp)
    }
   }
   Column{
    RoomFormLabel("좌석 참여")
    RoomSegment(listOf("approval" to "허락 후 착석","free" to "자유 착석"),seating,!busy){focus.clearFocus();seating=it}
    Text(if(seating=="approval")"방장 승인 후 착석할 수 있어요." else "빈 좌석에 바로 앉을 수 있어요.",Modifier.padding(top=8.dp),color=Muted,fontSize=12.sp)
   }
   Column{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     Text("방 배경",Modifier.weight(1f),fontSize=16.sp,fontWeight=FontWeight.SemiBold)
     TextButton({open("themes")},enabled=!busy,contentPadding=PaddingValues(start=8.dp,end=0.dp)){
      Text("전체 보기",color=Muted,fontSize=12.sp);Icon(Icons.Outlined.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
     }
    }
    Row(Modifier.fillMaxWidth().padding(top=4.dp).selectableGroup(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
     previewThemes.forEach{theme->RoomThemeTile(theme,selectedTheme==theme.optString("sku"),Modifier.weight(1f),!busy){focus.clearFocus();selectedTheme=theme.optString("sku");initialThemeChosen=true}}
    }
   }
   Column{
    HorizontalDivider(color=Stroke)
    val fontScale=LocalDensity.current.fontScale
    BoxWithConstraints(Modifier.fillMaxWidth().padding(vertical=14.dp)){
     // The range note sits beside the stepper as in the reference; with large text it moves under it whole.
     val inline=maxWidth.value/fontScale>=390f
     Column{
      Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
       Text("최대 인원",fontSize=16.sp,fontWeight=FontWeight.SemiBold,maxLines=1)
       RoomCapacityStepper(capacity,!busy){focus.clearFocus();capacity=it}
       if(inline)Text("2명 ~ 30명까지 설정 가능해요.",Modifier.weight(1f),fontSize=12.sp,color=Muted,textAlign=TextAlign.End,maxLines=1)
      }
      if(!inline)Text("2명 ~ 30명까지 설정 가능해요.",Modifier.padding(top=8.dp),fontSize=13.sp,color=Muted)
     }
    }
    HorizontalDivider(color=Stroke)
   }
   Column{
    RoomFormLabel("공지사항")
    Box(Modifier.fillMaxWidth().padding(top=8.dp)){
     OutlinedTextField(announcement,{if(it.length<=200)announcement=it},Modifier.fillMaxWidth().heightIn(min=112.dp).testTag("room-announcement"),
      enabled=!busy,minLines=3,maxLines=5,shape=RoundedCornerShape(14.dp),colors=roomFieldColors(),
      placeholder={Text("방 규칙이나 안내사항을 입력해 주세요.\n(예: 매너 있게 참여해 주세요! / 신청곡은 1인 1곡이에요!)",color=Muted,fontSize=13.sp,lineHeight=19.sp)})
     Text("${announcement.length}/200",Modifier.align(Alignment.BottomEnd).padding(end=14.dp,bottom=9.dp),fontSize=11.sp,color=Muted)
    }
   }
   if(optionsLoading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink,trackColor=Stroke)
   optionsError?.let{Text(it,color=Muted,fontSize=12.sp);TextButton({retry++}){Text("다시 불러오기")}}
  }
 }
 val action:@Composable ()->Unit={
  Column(Modifier.fillMaxWidth()){
   submissionError?.let{Text(it,Modifier.padding(bottom=8.dp),color=Pink,fontSize=12.sp)}
   BrandButton(onClick={
    focus.clearFocus()
    submit(payload("mode" to mode,"title" to title.trim(),"visibility" to visibility,"seating_mode" to seating,"max_members" to capacity,
     "announcement" to announcement.trim(),"background" to selectedTheme.takeIf{it in setOf("navy","sunset","night")} .orEmpty().ifBlank{"navy"},
     "theme_sku" to selectedTheme,"crew_id" to crew.takeIf{visibility=="crew"}))
   },enabled=valid,modifier=Modifier.fillMaxWidth().heightIn(min=56.dp).testTag("room-submit"),shape=RoundedCornerShape(28.dp)){
    if(busy)CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp,color=Muted)
    Text(if(busy)"저장 중…" else if(initial.has("id"))"설정 저장" else "방 만들기",fontSize=17.sp,fontWeight=FontWeight.Bold)
   }
  }
 }
 if(fullScreen)Column(Modifier.fillMaxSize()){
  Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal=20.dp).padding(top=8.dp,bottom=16.dp)){content()}
  Box(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Ink.copy(alpha=.0f),Ink.copy(alpha=.88f)))).padding(horizontal=20.dp,vertical=12.dp)){action()}
 }else Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(20.dp)){content();action()}

 when(panel){
  "themes"->RoomChoiceDialog("방 배경",{panel=""}){
   LazyVerticalGrid(columns=GridCells.Fixed(2),modifier=Modifier.fillMaxWidth().heightIn(max=440.dp).testTag("room-theme-picker"),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
    items(allThemes,key={it.optString("sku")}){theme->RoomThemeTile(theme,selectedTheme==theme.optString("sku"),Modifier.fillMaxWidth()){selectedTheme=theme.optString("sku");initialThemeChosen=true;panel=""}}
   }
   if(themes.isEmpty())Text("사용 가능한 배경을 불러와 주세요.",Modifier.padding(top=12.dp),color=Muted,fontSize=12.sp)
  }
  "crew"->RoomChoiceDialog("참여할 크루",{panel=""}){
   LazyColumn(Modifier.fillMaxWidth().heightIn(max=360.dp)){
    items(crews,key={it.optString("id")}){item->RoomChoiceRow(item.optString("name"),crew==item.optString("id")){crew=item.optString("id");panel=""}}
   }
  }
 }
}

@Composable private fun RoomFormLabel(label:String){Text(label,fontSize=16.sp,fontWeight=FontWeight.SemiBold)}
@Composable private fun roomFieldColors()=OutlinedTextFieldDefaults.colors(unfocusedContainerColor=RoomFieldFill,focusedContainerColor=RoomFieldFill,disabledContainerColor=RoomFieldFill,unfocusedBorderColor=Stroke,focusedBorderColor=Pink,cursorColor=Pink)
@Composable private fun RoomCapacityStepper(value:Int,enabled:Boolean,change:(Int)->Unit){
 val shape=RoundedCornerShape(12.dp)
 Row(Modifier.height(48.dp).clip(shape).background(RoomFieldFill).border(1.dp,Stroke,shape).testTag("room-capacity"),verticalAlignment=Alignment.CenterVertically){
  IconButton({change((value-1).coerceAtLeast(2))},Modifier.size(48.dp).testTag("room-capacity-minus"),enabled=enabled&&value>2){Icon(Icons.Outlined.Remove,"최대 인원 줄이기",Modifier.size(20.dp))}
  VerticalDivider(Modifier.height(22.dp),color=Stroke)
  Text("${value}명",Modifier.widthIn(min=56.dp).testTag("room-capacity-value"),fontSize=16.sp,fontWeight=FontWeight.SemiBold,textAlign=TextAlign.Center,maxLines=1)
  VerticalDivider(Modifier.height(22.dp),color=Stroke)
  IconButton({change((value+1).coerceAtMost(30))},Modifier.size(48.dp).testTag("room-capacity-plus"),enabled=enabled&&value<30){Icon(Icons.Outlined.Add,"최대 인원 늘리기",Modifier.size(20.dp))}
 }
}

@Composable private fun RoomSegment(options:List<Pair<String,String>>,selected:String,enabled:Boolean,choose:(String)->Unit){
 val fontScale=LocalDensity.current.fontScale
 BoxWithConstraints(Modifier.fillMaxWidth().padding(top=8.dp)){
  val compact=options.size>2&&maxWidth.value/fontScale<260f
  Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(14.dp)).background(RoomFieldFill).border(1.dp,Stroke,RoundedCornerShape(14.dp)).selectableGroup().padding(4.dp)){
   options.forEach{(id,label)->
    Box(Modifier.weight(1f).heightIn(min=48.dp).fillMaxHeight().clip(RoundedCornerShape(11.dp))
     .background(if(selected==id)Pink else Color.Transparent)
     .selectable(selected==id,enabled=enabled,role=Role.RadioButton){choose(id)}.padding(horizontal=2.dp,vertical=10.dp),contentAlignment=Alignment.Center){
     Text(if(compact&&id=="private")"초대\n전용" else label,fontSize=15.sp,lineHeight=18.sp,textAlign=TextAlign.Center,color=if(selected==id)Ink else Muted,fontWeight=if(selected==id)FontWeight.SemiBold else FontWeight.Normal,maxLines=2)
    }
   }
  }
 }
}
@Composable private fun RoomSettingRow(label:String,value:String,enabled:Boolean=true,click:()->Unit){
 Row(Modifier.fillMaxWidth().heightIn(min=52.dp).clickable(enabled=enabled,onClick=click).padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
  Text(label,Modifier.weight(1f),fontSize=15.sp,fontWeight=FontWeight.Medium)
  Text(value,Modifier.widthIn(max=150.dp),fontSize=14.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
  Icon(Icons.Outlined.ChevronRight,null,Modifier.size(20.dp),tint=Muted)
 }
}
@Composable private fun RoomThemeTile(theme:JSONObject,selected:Boolean,modifier:Modifier=Modifier,enabled:Boolean=true,choose:()->Unit){
 val sku=theme.optString("sku")
 Column(modifier.clip(RoundedCornerShape(14.dp)).selectable(selected,enabled=enabled,role=Role.RadioButton,onClick=choose).testTag("room-theme-$sku")){
  Box(Modifier.fillMaxWidth().aspectRatio(1.9f).clip(RoundedCornerShape(14.dp)).border(if(selected)2.dp else 1.dp,if(selected)Pink else Stroke,RoundedCornerShape(14.dp))){
   VoiceRoomBackdrop(sku,theme,Modifier.matchParentSize(),preview=true)
   if(selected)Box(Modifier.align(Alignment.TopEnd).padding(7.dp).size(24.dp).background(Color.White.copy(alpha=.92f),CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Outlined.Check,null,Modifier.size(16.dp),tint=Ink)}
  }
  Text(theme.optString("name"),Modifier.padding(start=4.dp,top=8.dp,bottom=4.dp),fontSize=14.sp,color=MaterialTheme.colorScheme.onSurface.copy(alpha=if(selected)1f else .82f),maxLines=2,overflow=TextOverflow.Ellipsis)
 }
}
@Composable private fun RoomChoiceRow(label:String,selected:Boolean,click:()->Unit){
 Row(Modifier.fillMaxWidth().heightIn(min=52.dp).selectable(selected,role=Role.RadioButton,onClick=click).padding(horizontal=8.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
  Text(label,Modifier.weight(1f),fontSize=16.sp,color=if(selected)Pink else MaterialTheme.colorScheme.onSurface)
  if(selected)Icon(Icons.Outlined.Check,null,tint=Pink)
 }
}
@Composable private fun RoomChoiceDialog(title:String,close:()->Unit,content:@Composable ColumnScope.()->Unit){
 Dialog(onDismissRequest=close,properties=DialogProperties(usePlatformDefaultWidth=false)){
  Surface(Modifier.fillMaxWidth().padding(horizontal=20.dp).heightIn(max=620.dp),color=Panel,shape=RoundedCornerShape(20.dp)){
   Column(Modifier.padding(20.dp)){
    Row(Modifier.fillMaxWidth().padding(bottom=12.dp),verticalAlignment=Alignment.CenterVertically){
     Text(title,Modifier.weight(1f),fontSize=20.sp,fontWeight=FontWeight.SemiBold)
     IconButton(close){Icon(Icons.Outlined.Close,"선택창 닫기")}
    }
    content()
   }
  }
 }
}
