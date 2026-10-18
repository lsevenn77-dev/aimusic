package kr.co.aifect.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal class PageContent(
 val title:String,val back:()->Unit,val color:Color,
 val content:@Composable ColumnScope.()->Unit
)
internal class AppPageEntry internal constructor(internal val state:State<PageContent>)
internal class AppPageStack {
 internal val entries=mutableStateListOf<AppPageEntry>()
 fun closeAll(){entries.toList().asReversed().forEach{it.state.value.back()}}
}
private val LocalPageStack=staticCompositionLocalOf<AppPageStack>{error("AppPageHost is required")}

@Composable internal fun AppPageScope(stack:AppPageStack,content:@Composable ()->Unit){
 CompositionLocalProvider(LocalPageStack provides stack,content=content)
}

/** In-window pages, not dialogs: only the current page is placed or exposed to accessibility.
 * Kept compositions preserve the previous list position and unsaved fields when going back.
 * Registering at the original call site also keeps account/lifecycle and disposal ownership intact.
 */
@Composable internal fun AppPageHost(stack:AppPageStack,modifier:Modifier=Modifier,content:@Composable ()->Unit){
 val top=stack.entries.lastOrNull()
 val focus=LocalFocusManager.current
 LaunchedEffect(top){focus.clearFocus()}
 CompositionLocalProvider(LocalPageStack provides stack){
  Layout(modifier=modifier.fillMaxSize(),content={
   Box(Modifier.fillMaxSize().then(if(top!=null)Modifier.clearAndSetSemantics{} else Modifier)){content()}
   stack.entries.forEach{entry->key(entry){
    val page=entry.state.value
    val active=entry===top
    BackHandler(active){page.back()}
    Surface(color=page.color,modifier=Modifier.fillMaxSize().then(if(active)Modifier.testTag("app-page") else Modifier.clearAndSetSemantics{})){
     Column(Modifier.fillMaxSize()){
      Row(Modifier.fillMaxWidth().heightIn(min=48.dp).padding(horizontal=6.dp),verticalAlignment=Alignment.CenterVertically){
       IconButton(onClick=page.back,modifier=Modifier.testTag("page-back")){Icon(Icons.AutoMirrored.Rounded.ArrowBack,"뒤로")}
       Text(page.title,fontSize=14.sp,color=Muted,modifier=Modifier.clearAndSetSemantics{})
      }
      Column(Modifier.weight(1f).fillMaxWidth().imePadding(),content=page.content)
     }
    }
   }}
  }){children,constraints->
   val measured=children.map{it.measure(constraints)}
   layout(constraints.maxWidth,constraints.maxHeight){measured.lastOrNull()?.placeRelative(0,0)}
  }
 }
}

@Composable internal fun AppPage(title:String,onDismissRequest:()->Unit,containerColor:Color=Ink,content:@Composable ColumnScope.()->Unit){
 val stack=LocalPageStack.current
 val state=rememberUpdatedState(PageContent(title,onDismissRequest,containerColor,content))
 val entry=remember(stack){AppPageEntry(state)}
 DisposableEffect(stack,entry){stack.entries.add(entry);onDispose{stack.entries.remove(entry)}}
}

@Composable internal fun AppMenuPage(title:String,expanded:Boolean,onDismissRequest:()->Unit,content:@Composable ColumnScope.()->Unit){
 if(expanded)AppPage(title,onDismissRequest){Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp),content=content)}
}

@Composable internal fun PageMenuItem(text:@Composable ()->Unit,onClick:()->Unit,enabled:Boolean=true){
 Surface(onClick=onClick,enabled=enabled,color=Color.Transparent,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp)){
  Row(Modifier.padding(horizontal=12.dp,vertical=14.dp),verticalAlignment=Alignment.CenterVertically){text()}
 }
}

@Composable internal fun AppFormPage(onDismissRequest:()->Unit,title:@Composable ()->Unit,text:@Composable ()->Unit,confirmButton:@Composable ()->Unit,dismissButton:@Composable ()->Unit={}){
 AppPage("",onDismissRequest){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
   title();text()
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){dismissButton();confirmButton()}
  }
 }
}
