package kr.co.aifect.app

import java.net.URI
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

internal fun accountPage(url:String?):Boolean {
 if(url==null || !CurrentNavigation.sameOrigin(url,Endpoint.origin))return false
 val uri=runCatching { URI(url) }.getOrNull() ?: return false
 return uri.path=="/" && uri.fragment=="account"
}

internal fun accountExternalUrl(raw:String):Boolean {
 val url=runCatching { URI(raw) }.getOrNull() ?: return false
 if(url.scheme!="https" || url.userInfo!=null || url.port !in listOf(-1,443))return false
 return when(url.host){
  URI(Endpoint.origin).host -> url.path in setOf("/terms","/privacy","/refund","/contact","/account/delete")
  "play.google.com" -> url.path in setOf("/store/account/subscriptions","/store/account/orderhistory","/store/account/orderhistory/")
  "apps.apple.com" -> url.path=="/account/subscriptions" || url.path=="/account/purchases"
  "reportaproblem.apple.com" -> url.path.isNullOrEmpty() || url.path=="/"
  else -> false
 }
}

internal fun WebView.installAccountActions(owner:String?, model:MusicModel, action:(String)->Unit, link:(String)->Unit):Boolean {
 if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return false
 WebViewCompat.addWebMessageListener(this,"AifectAccountHost",setOf(Endpoint.origin)){view,message,origin,mainFrame,_->
  if(mainFrame && CurrentNavigation.sameOrigin(origin.toString(),Endpoint.origin) && accountPage(view.url) && owner!=null && model.user?.optString("id")==owner){
   val value=message.data.orEmpty()
   if(value in setOf("purchase","restore","password","logout","delete","studio"))action(value)
   else if(value.length<=1024 && accountExternalUrl(value))link(value)
  }
 }
 if(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){
  WebViewCompat.addDocumentStartJavaScript(this,accountScript(false),setOf(Endpoint.origin))
 }
 return true
}

internal fun WebView.updateAccountCapabilities(canPurchase:Boolean){
 if(accountPage(url))evaluateJavascript(accountScript(canPurchase),null)
}

private fun accountScript(canPurchase:Boolean):String{
 val version=JSONObject.quote(BuildConfig.VERSION_NAME)
 return """
  (() => {
   if (window.top !== window || location.origin !== ${JSONObject.quote(Endpoint.origin)} || location.hash !== '#account' || location.pathname !== '/' || !window.AifectAccountHost) return;
   const previous = window.AIFECTAccountApp;
   if (!previous) {
    document.addEventListener('click', event => {
     if (!event.isTrusted || location.hash !== '#account') return;
     const link=event.target.closest && event.target.closest('a[target="_blank"][href]');
     if (link && link.protocol === 'https:') {event.preventDefault();window.AifectAccountHost.postMessage(link.href);}
    },true);
   }
   if (previous && previous.canPurchase === $canPurchase) return;
   window.AIFECTAccountApp = Object.freeze({platform:'android',version:$version,canPurchase:$canPurchase,
    perform(action){if (location.hash === '#account') window.AifectAccountHost.postMessage(String(action));}});
   window.dispatchEvent(new Event('aifect-account-capabilities'));
  })();
 """.trimIndent()
}
