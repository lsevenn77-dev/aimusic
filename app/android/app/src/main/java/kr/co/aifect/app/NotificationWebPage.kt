@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/** Only server-resolved AIFECT notification routes receive an authenticated cookie. */
@SuppressLint("SetJavaScriptEnabled")
@Composable internal fun NotificationWebPage(m:MusicModel,route:NativeNotificationRoute){
 val account=m.user?.optString("id");val context=androidx.compose.ui.platform.LocalContext.current
 val origin=Endpoint.origin
 var web by remember(route){mutableStateOf<WebView?>(null)}
 var error by remember(route){mutableStateOf<String?>(null)}
 val currentAccount by rememberUpdatedState(account)
 fun close(){m.notificationRoute=null}
 AppPage(title="알림 상세",onDismissRequest={close()},containerColor=Ink){
  if(account!=route.recipient||NotificationContract.safeRoute(route.href)==null)Text("현재 계정으로 열 수 없는 알림이에요.")
  else if(error!=null)Text(error.orEmpty(),color=Muted)
  else AndroidView(modifier=Modifier.fillMaxSize(),factory={
   WebView(context).apply {
    web=this;setBackgroundColor(Color.rgb(12,18,27))
    settings.javaScriptEnabled=true;settings.domStorageEnabled=true
    settings.allowFileAccess=false;settings.allowContentAccess=false
    settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
    settings.setSupportMultipleWindows(false);settings.javaScriptCanOpenWindowsAutomatically=false
    CookieManager.getInstance().setAcceptThirdPartyCookies(this,false)
    webViewClient=object:WebViewClient(){
     override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean=currentAccount!=route.recipient||!NotificationContract.safeWebURL(request.url.toString(),origin)
     override fun onReceivedSslError(view:WebView,handler:SslErrorHandler,e:android.net.http.SslError){handler.cancel();error="안전한 연결을 확인하지 못했어요."}
     override fun onReceivedError(view:WebView,request:WebResourceRequest,e:WebResourceError){if(request.isForMainFrame)error="알림 화면을 불러오지 못했어요. 다시 열어주세요."}
    }
    val cookie=NativeSession.cookie(context)
    if(cookie.isBlank())error="로그인 후 알림을 다시 열어주세요."
    else CookieManager.getInstance().setCookie(origin,cookie+"; Path=/; HttpOnly; SameSite=Strict"+(if(origin.startsWith("https:"))"; Secure" else "")){
     if(currentAccount==route.recipient)loadUrl(origin+"/"+route.href)
    }
   }
  })
 }
 BackHandler {if(web?.canGoBack()==true)web?.goBack()else close()}
 DisposableEffect(route){onDispose{web?.stopLoading();web?.destroy();CookieManager.getInstance().setCookie(origin,"aifect_session=; Path=/; Max-Age=0; HttpOnly"+(if(origin.startsWith("https:"))"; Secure" else ""));web=null}}
}
