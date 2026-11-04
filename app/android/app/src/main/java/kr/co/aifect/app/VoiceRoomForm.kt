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
@Composable internal fun VoiceRoomBackdrop(background:String,theme:JSONObject?=null,modifier:Modifier=Modifier){
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
   when(sku){
    "sunset"->{wash(Color(0x7770435A),.35f,.15f,.65f);wash(Color(0x66242954),.5f,1f,.65f)}
    "night"->{wash(Color(0x77233D74),.70f,.10f,.48f);wash(Color(0x5539295B),.20f,.80f,.45f)}
    else->{wash(Color(0x5529316A),.36f,.03f,.38f);wash(Color(0x33392A6D),.20f,.71f,.36f);wash(Color(0x55112B48),.75f,.65f,.44f)}
   }
  }
  if(image!=null){
   AsyncImage(image,null,Modifier.matchParentSize().alpha(.68f).testTag("voice-background-image"),contentScale=ContentScale.Crop)
   Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Ink.copy(alpha=.40f),Ink.copy(alpha=.72f)))))
  }
 }
}

@Composable internal fun NativeRoomForm(
 api:NativeApi,initial:JSONObject=JSONObject(),fullScreen:Boolean=false,busy:Boolean=false,
 submissionError:String?=null,submit:(JSONObject)->Unit
){
 val identity=initial.optString("id","new")
 var title by rememberSaveable(identity){mutableStateOf(initial.optString("title"))}
 var visibility by rememberSaveable(identity){mutableStateOf(initial.optString("visibility","public"))}
 var seating by rememberSaveable(identity){mutableStateOf(initial.optString("seating_mode","approval"))}
 var capacity by rememberSaveable(identity){mutableIntStateOf(initial.optInt("max_members",30).coerceIn(2,30))}
 var announcement by rememberSaveable(identity){mutableStateOf(initial.optString("announcement"))}
 var crew by rememberSaveable(identity){mutableStateOf(initial.optString("crew_id"))}
 var selectedTheme by rememberSaveable(identity){mutableStateOf(initial.optJSONObject("theme")?.optString("sku").orEmpty().ifBlank{initial.optString("background","navy")})}
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
   val options=api.call("/api/voice/options",fresh=true)
   crews=options.optJSONArray("crews").objects()
   themes=options.optJSONArray("themes").objects().filter{it.optBoolean("paid")&&it.optBoolean("selectable")}
   if(!initialThemeChosen){
    val preferred=options.optString("preferred_theme").takeIf{key->themes.any{it.optString("sku")==key}}
    selectedTheme=preferred?:themes.firstOrNull()?.optString("sku")?:"navy"
    initialThemeChosen=true
   }
   if(FreeRoomBackgrounds.none{it.first==selectedTheme}&&themes.none{it.optString("sku")==selectedTheme})selectedTheme="navy"
  }catch(e:Exception){if(e is CancellationException)throw e;optionsError=e.message?:"설정을 불러오지 못했어요."}
  finally{optionsLoading=false}
 }
 val allThemes=themes+FreeRoomBackgrounds.map{(id,label)->payload("sku" to id,"name" to label)}
 val selected=allThemes.find{it.optString("sku")==selectedTheme}
 val previewThemes=allThemes.take(3).let{first->if(selected==null||first.any{it.optString("sku")==selectedTheme})first else first.take(2)+selected}
 val valid=title.isNotBlank()&&(visibility!="crew"||crews.any{it.optString("id")==crew})&&selected!=null&&!optionsLoading&&!busy
 fun open(value:String){focus.clearFocus();panel=value}
 val content:@Composable ()->Unit={
  Column(Modifier.fillMaxWidth().testTag("voice-room-form"),verticalArrangement=Arrangement.spacedBy(16.dp)){
   if(!fullScreen)Text("방 설정",fontSize=22.sp,fontWeight=FontWeight.SemiBold)
   Column{
    RoomFormLabel("방 이름")
    OutlinedTextField(title,{if(it.length<=60)title=it},Modifier.fillMaxWidth().padding(top=8.dp).testTag("room-title"),
     enabled=!busy,singleLine=true,placeholder={Text("어떤 이야기를 나눌까요?",color=Muted,fontSize=15.sp)},
     shape=RoundedCornerShape(14.dp),colors=OutlinedTextFieldDefaults.colors(unfocusedContainerColor=Panel,focusedContainerColor=Panel,unfocusedBorderColor=Stroke),
     keyboardOptions=KeyboardOptions(imeAction=ImeAction.Done),keyboardActions=KeyboardActions(onDone={focus.clearFocus()}))
    Text("${title.length}/60",Modifier.align(Alignment.End).padding(top=2.dp),fontSize=11.sp,color=Muted)
   }
   Column{
    RoomFormLabel("공개 범위")
    RoomSegment(listOf("public" to "공개","private" to "초대 전용","followers" to "팔로워","crew" to "크루"),visibility,!busy){focus.clearFocus();visibility=it}
    if(visibility=="crew"){
     RoomSettingRow("참여할 크루",crews.find{it.optString("id")==crew}?.optString("name")?:"선택",enabled=!busy&&crews.isNotEmpty()){open("crew")}
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
     Text("방 배경",Modifier.weight(1f),fontSize=15.sp,fontWeight=FontWeight.SemiBold)
     TextButton({open("themes")},enabled=!busy,contentPadding=PaddingValues(start=8.dp,end=0.dp)){
      Text("전체 보기",color=Muted,fontSize=12.sp);Icon(Icons.Outlined.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
     }
    }
    Row(Modifier.fillMaxWidth().selectableGroup(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
     previewThemes.forEach{theme->RoomThemeTile(theme,selectedTheme==theme.optString("sku"),Modifier.weight(1f),!busy){focus.clearFocus();selectedTheme=theme.optString("sku");initialThemeChosen=true}}
    }
   }
   Column{
    HorizontalDivider(color=Stroke)
    RoomSettingRow("최대 인원","${capacity}명",enabled=!busy){open("capacity")}
    HorizontalDivider(color=Stroke)
    RoomSettingRow("공지",announcement.ifBlank{"선택"},enabled=!busy){open("announcement")}
    HorizontalDivider(color=Stroke)
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
    submit(payload("title" to title.trim(),"visibility" to visibility,"seating_mode" to seating,"max_members" to capacity,
     "announcement" to announcement.trim(),"background" to if(FreeRoomBackgrounds.any{it.first==selectedTheme})selectedTheme else "navy",
     "theme_sku" to selectedTheme,"crew_id" to crew.takeIf{visibility=="crew"}))
   },enabled=valid,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp).testTag("room-submit"),shape=RoundedCornerShape(14.dp)){
    if(busy)CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp,color=Muted)
    Text(if(busy)"저장 중…" else if(initial.has("id"))"설정 저장" else "방 만들기",fontSize=16.sp,fontWeight=FontWeight.SemiBold)
   }
  }
 }
 if(fullScreen)Column(Modifier.fillMaxSize()){
  Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal=20.dp).padding(top=8.dp,bottom=16.dp)){content()}
  Box(Modifier.fillMaxWidth().background(Ink).padding(horizontal=20.dp,vertical=12.dp)){action()}
 }else Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(20.dp)){content();action()}

 when(panel){
  "themes"->RoomChoiceDialog("방 배경",{panel=""}){
   LazyVerticalGrid(columns=GridCells.Fixed(2),modifier=Modifier.fillMaxWidth().heightIn(max=440.dp).testTag("room-theme-picker"),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
    items(allThemes,key={it.optString("sku")}){theme->RoomThemeTile(theme,selectedTheme==theme.optString("sku"),Modifier.fillMaxWidth()){selectedTheme=theme.optString("sku");initialThemeChosen=true;panel=""}}
   }
   if(themes.isEmpty())Text("기본 배경 3종 · 보유한 테마도 여기서 선택할 수 있어요.",Modifier.padding(top=12.dp),color=Muted,fontSize=12.sp)
  }
  "capacity"->RoomChoiceDialog("최대 인원",{panel=""}){
   LazyColumn(Modifier.fillMaxWidth().heightIn(max=360.dp).testTag("room-capacity-picker")){
    items((2..30).toList()){number->RoomChoiceRow("${number}명",capacity==number){capacity=number;panel=""}}
   }
  }
  "crew"->RoomChoiceDialog("참여할 크루",{panel=""}){
   LazyColumn(Modifier.fillMaxWidth().heightIn(max=360.dp)){
    items(crews,key={it.optString("id")}){item->RoomChoiceRow(item.optString("name"),crew==item.optString("id")){crew=item.optString("id");panel=""}}
   }
  }
  "announcement"->{
   var draft by rememberSaveable{mutableStateOf(announcement)}
   RoomChoiceDialog("공지",{panel=""}){
    OutlinedTextField(draft,{if(it.length<=200)draft=it},Modifier.fillMaxWidth().testTag("room-announcement"),placeholder={Text("참여자에게 전할 말 (선택)")},minLines=3,maxLines=5,shape=RoundedCornerShape(12.dp))
    Text("${draft.length}/200",Modifier.align(Alignment.End).padding(top=6.dp),fontSize=12.sp,color=Muted)
    BrandButton({announcement=draft.trim();panel=""},Modifier.fillMaxWidth().padding(top=16.dp).heightIn(min=48.dp)){Text("적용")}
   }
  }
 }
}

@Composable private fun RoomFormLabel(label:String){Text(label,fontSize=15.sp,fontWeight=FontWeight.SemiBold)}

@Composable private fun RoomSegment(options:List<Pair<String,String>>,selected:String,enabled:Boolean,choose:(String)->Unit){
 val fontScale=LocalDensity.current.fontScale
 BoxWithConstraints(Modifier.fillMaxWidth().padding(top=8.dp)){
  val compact=options.size>2&&maxWidth.value/fontScale<260f
  Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(12.dp)).background(Panel).selectableGroup().padding(3.dp)){
   options.forEach{(id,label)->
    Box(Modifier.weight(1f).heightIn(min=48.dp).fillMaxHeight().clip(RoundedCornerShape(10.dp))
     .background(if(selected==id)Pink else Color.Transparent)
     .selectable(selected==id,enabled=enabled,role=Role.RadioButton){choose(id)}.padding(horizontal=2.dp,vertical=10.dp),contentAlignment=Alignment.Center){
     Text(if(compact&&id=="private")"초대\n전용" else label,fontSize=13.sp,lineHeight=18.sp,textAlign=TextAlign.Center,color=if(selected==id)Ink else Muted,fontWeight=if(selected==id)FontWeight.SemiBold else FontWeight.Normal,maxLines=2)
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
 Column(modifier.clip(RoundedCornerShape(12.dp)).selectable(selected,enabled=enabled,role=Role.RadioButton,onClick=choose).testTag("room-theme-$sku")){
  Box(Modifier.fillMaxWidth().aspectRatio(1.6f).clip(RoundedCornerShape(12.dp)).border(if(selected)2.dp else 1.dp,if(selected)Pink else Stroke,RoundedCornerShape(12.dp))){
   VoiceRoomBackdrop(sku,theme,Modifier.matchParentSize())
   if(selected)Box(Modifier.align(Alignment.TopEnd).padding(6.dp).size(22.dp).background(Pink,CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Outlined.Check,null,Modifier.size(16.dp),tint=Ink)}
  }
  Text(theme.optString("name"),Modifier.padding(top=7.dp,bottom=4.dp),fontSize=12.sp,color=if(selected)MaterialTheme.colorScheme.onSurface else Muted,maxLines=2,overflow=TextOverflow.Ellipsis)
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
