@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.*
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import java.net.URI
import org.json.JSONObject

/** Authenticated gallery and crew pages; audio work uses the native performance activity. */
@Composable internal fun CurrentWorkspacePage(m:MusicModel,destination:CurrentWorkspace){
 val context=LocalContext.current
 val owner=androidx.lifecycle.compose.LocalLifecycleOwner.current
 val account=m.user?.optString("id")
 var view by remember{mutableStateOf<WebView?>(null)}
 var progress by remember{mutableIntStateOf(0)}
 var failure by remember{mutableStateOf<String?>(null)}
 var closing by remember{mutableStateOf(false)}
 var currentRoute by remember{mutableStateOf(destination.route)}
 var fileReply by remember{mutableStateOf<ValueCallback<Array<Uri>>?>(null)}
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()){r->fileReply?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode,r.data));fileReply=null}
 val route=destination.route
 fun close(){m.api.invalidateReads();m.workspace=null;if(destination.route.startsWith("profile-gallery/"))m.refreshMyDashboard(fresh=true)}
 fun requestClose(){close()}
 fun nativeDestination(raw:String):Boolean{
  val root=raw.substringBefore('?')
  when{
   root.startsWith("voice/")||root.startsWith("dubbing/")->{m.openCurrentWorkspace(root,if(root.startsWith("voice/"))"토킹룸" else "더빙")}
   root in listOf("home","voice","community")-> {m.communityMode="voice";if(root=="home")m.selectTab(0)else m.selectTab(3)}
   root=="community/crews"->{if(destination.route=="community/crews")return false;m.selectTab(3);m.communityMode="crews"}
   root=="karaoke"||root=="karaoke/dubbing"||root=="dubbing"->{m.selectTab(2);m.playMode=if(root=="karaoke")"song" else "dubbing";m.playSection=if(m.playMode=="song")"recommended" else "discover"}
   root=="karaoke/browse"->{m.selectTab(2);m.playMode="browse";m.playSection="recommended"}
   root=="profile"->{m.selectTab(6)}
   root=="account"->{if(m.user==null)m.showLogin=true else m.showAccount=true}
   root=="studio"->{m.openStudio()}
   root=="dm"||root.startsWith("dm/")->{m.selectTab(5);m.messagePeer=root.substringAfter('/',"").takeIf{it.isNotBlank()}}
   root=="gold"||root.startsWith("gold/")||root=="membership"->{m.showBilling=true}
   root.startsWith("song/")->{val id=root.substringAfter('/');if(CurrentNavigation.safeID(id))m.openCurrentSong(id)else return false}
   else->return false
  }
  close();return true
 }
 Dialog(onDismissRequest=::requestClose,properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)){
  Surface(color=Ink,modifier=Modifier.fillMaxSize()){
   Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().testTag("current-workspace")){
    TopAppBar(title={Text(destination.title,maxLines=1)},navigationIcon={IconButton(onClick={if(view?.canGoBack()==true&&!destination.route.startsWith("voice/"))view?.goBack()else requestClose()}){Icon(Icons.AutoMirrored.Rounded.ArrowBack,"이전 화면")}},actions={IconButton(onClick=::requestClose){Icon(Icons.Rounded.Close,"작업 화면 닫기")}},colors=TopAppBarDefaults.topAppBarColors(containerColor=Ink))
    if(progress in 0..99)LinearProgressIndicator(progress={progress/100f},modifier=Modifier.fillMaxWidth(),color=Pink,trackColor=Stroke)
    failure?.let{error->Column(Modifier.padding(20.dp)){Text(error,color=Muted);TextButton(onClick={failure=null;view?.reload()}){Text("다시 연결")}}}
    AndroidView(modifier=Modifier.fillMaxWidth().weight(1f),factory={ctx->WebView(ctx).apply{
     view=this
     setBackgroundColor(android.graphics.Color.rgb(12,18,27))
     settings.javaScriptEnabled=true;settings.domStorageEnabled=true
     settings.allowFileAccess=false;settings.allowContentAccess=false
     settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
     settings.mediaPlaybackRequiresUserGesture=true
     settings.javaScriptCanOpenWindowsAutomatically=false
     settings.setSupportMultipleWindows(false)
     settings.userAgentString=settings.userAgentString+" AIFECT-Android/"+BuildConfig.VERSION_NAME
     CookieManager.getInstance().setAcceptThirdPartyCookies(this,false)
     webChromeClient=object:WebChromeClient(){
      override fun onProgressChanged(v:WebView?,value:Int){progress=value}
      override fun onPermissionRequest(request:PermissionRequest){request.deny()}
      override fun onShowFileChooser(webView:WebView,reply:ValueCallback<Array<Uri>>,params:FileChooserParams):Boolean{
       fileReply?.onReceiveValue(null);fileReply=reply
       return try{picker.launch(params.createIntent());true}catch(_:Exception){fileReply?.onReceiveValue(null);fileReply=null;false}
      }
      override fun onJsAlert(v:WebView,url:String,message:String,result:JsResult):Boolean{
       android.app.AlertDialog.Builder(ctx).setMessage(message).setPositiveButton("확인"){_,_->result.confirm()}.setOnCancelListener{result.cancel()}.show();return true
      }
      override fun onJsConfirm(v:WebView,url:String,message:String,result:JsResult):Boolean{
       android.app.AlertDialog.Builder(ctx).setMessage(message).setPositiveButton("확인"){_,_->result.confirm()}.setNegativeButton("취소"){_,_->result.cancel()}.setOnCancelListener{result.cancel()}.show();return true
      }
      override fun onJsBeforeUnload(v:WebView,url:String,message:String,result:JsResult)=onJsConfirm(v,url,"저장하지 않은 작업이 있을 수 있어요. 화면을 이동할까요?",result)
     }
     webViewClient=object:WebViewClient(){
      override fun shouldOverrideUrlLoading(v:WebView,r:WebResourceRequest):Boolean{
       if(!r.isForMainFrame)return false
       val url=r.url.toString()
       if(!CurrentNavigation.sameOrigin(url,Endpoint.origin)){failure="앱 작업 화면에서 외부 페이지를 열 수 없어요.";return true}
       return false
      }
      override fun onPageFinished(v:WebView,url:String){
       if(!CurrentNavigation.sameOrigin(url,Endpoint.origin))return
       v.evaluateJavascript(workspaceStyleScript(),null)
      }
      override fun doUpdateVisitedHistory(v:WebView,url:String,isReload:Boolean){
       if(!CurrentNavigation.sameOrigin(url,Endpoint.origin))return
       val hash=runCatching{URI(url).fragment}.getOrNull()?:return
       currentRoute=hash
       if(hash==destination.route)return
       v.post{nativeDestination(hash)}
      }
      override fun onReceivedError(v:WebView,r:WebResourceRequest,e:WebResourceError){if(r.isForMainFrame)failure="연결하지 못했어요. 네트워크를 확인하고 다시 시도해주세요."}
      override fun onReceivedHttpError(v:WebView,r:WebResourceRequest,e:WebResourceResponse){if(r.isForMainFrame)failure="작업 화면을 불러오지 못했어요. (${e.statusCode})"}
      override fun onRenderProcessGone(v:WebView,detail:RenderProcessGoneDetail):Boolean{failure="작업 화면이 종료됐어요. 저장된 작업은 다시 열 수 있어요.";v.destroy();return true}
     }
     // One origin, one account. Cookies are never printed or shared with external pages.
     CookieManager.getInstance().removeAllCookies{
      if(account!=m.user?.optString("id"))return@removeAllCookies
      val cookie=NativeSession.cookie(ctx)
      val url=Endpoint.origin+"/#"+route
      if(cookie.isBlank())loadUrl(url)else CookieManager.getInstance().setCookie(Endpoint.origin,cookie+"; Path=/; HttpOnly; SameSite=Lax"+(if(Endpoint.origin.startsWith("https:"))"; Secure" else "")){loadUrl(url)}
     }
    }})
   }
  }
 }
 DisposableEffect(owner,account){
  val observer=LifecycleEventObserver{_,event->when(event){
   Lifecycle.Event.ON_STOP->view?.onPause()
   Lifecycle.Event.ON_START->view?.onResume()
   else->Unit
  }}
  owner.lifecycle.addObserver(observer)
  onDispose{
   owner.lifecycle.removeObserver(observer);fileReply?.onReceiveValue(null)
   view?.let{web->web.stopLoading();web.loadUrl("about:blank");web.removeAllViews();web.destroy()};view=null
  }
 }
 if(closing)AlertDialog(onDismissRequest={closing=false},title={Text(if(destination.route.startsWith("voice/"))"토킹룸에서 나갈까요?" else "작업 화면을 닫을까요?")},text={Text(if(destination.route.startsWith("voice/"))"음성 연결과 마이크가 종료돼요." else "저장하지 않은 변경과 녹음은 사라질 수 있어요. 임시 저장 후 닫아주세요.")},confirmButton={TextButton(onClick={closing=false;close()}){Text("닫기")}},dismissButton={TextButton(onClick={closing=false}){Text("계속하기")}})
}

private fun workspaceStyleScript():String{
 val css="""
 :root{color-scheme:dark;--sidebar:0px}
 body{padding-bottom:0!important;background:#0c121b!important}
 .sidebar,.topbar,.page-footer,.mobile-navigation,#menu-backdrop,body>.player{display:none!important}
 .page-wrap,body.voice-room-open .page-wrap{margin:0!important;width:100%!important;min-height:0!important}
 #main,body.voice-room-open #main{padding:16px!important;margin:0!important;width:100%!important;max-width:none!important;min-height:0!important}
 #main button,#main input:not([type=checkbox]):not([type=radio]):not([type=range]),#main select{min-height:44px}
 #main button,#main a{touch-action:manipulation}
 """.trimIndent()
 return "(()=>{let s=document.getElementById('aifect-native-workspace');if(!s){s=document.createElement('style');s.id='aifect-native-workspace';document.head.append(s);}s.textContent="+JSONObject.quote(css)+";})()"
}
