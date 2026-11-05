package kr.co.aifect.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.view.*
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

internal fun openMobileExperience(context:Context,route:String){
 if(!MobileExperienceRoute.valid(route))return
 context.startActivity(Intent(context,MobileExperienceActivity::class.java).putExtra("route",route).apply{if(context !is android.app.Activity)addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)})
}

/** Dedicated, bounded viewport for the same official game and live-room engines as the web. */
class MobileExperienceActivity:ComponentActivity(){
 private lateinit var web:WebView
 private lateinit var root:FrameLayout
 private lateinit var content:LinearLayout
 private lateinit var loadingBar:ProgressBar
 private lateinit var headerLabel:TextView
 private var route=""
 private var session=""
 private var permission:PermissionRequest?=null
 private var custom:View?=null
 private var customCallback:WebChromeClient.CustomViewCallback?=null
 private var suspended=false
 private var disposed=false
 private val sessionListener=android.content.SharedPreferences.OnSharedPreferenceChangeListener{_,_->if(session!=NativeSession.cookie(this))finish()}
 private val microphonePermission=registerForActivityResult(ActivityResultContracts.RequestPermission()){granted->
  val pending=permission;permission=null
  if(pending!=null){if(granted&&!isFinishing&&MobileExperienceRoute.canUseMicrophone(route,Endpoint.origin,pending.origin.toString())&&CurrentNavigation.sameOrigin(web.url.orEmpty(),Endpoint.origin))pending.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))else pending.deny()}
 }
 private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
 @SuppressLint("SetJavaScriptEnabled") override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  route=intent.getStringExtra("route").orEmpty();if(!MobileExperienceRoute.valid(route)){finish();return}
  session=NativeSession.cookie(this)
  getSharedPreferences("native_session",0).registerOnSharedPreferenceChangeListener(sessionListener)
  window.statusBarColor=Color.rgb(11,16,36);window.navigationBarColor=window.statusBarColor
  window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  root=FrameLayout(this).apply{setBackgroundColor(Color.rgb(11,16,36))}
  content=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};root.addView(content,FrameLayout.LayoutParams(-1,-1))
  val bar=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(4),0,dp(4),0)}
  fun button(label:String,description:String,action:()->Unit)=TextView(this).apply{text=label;textSize=24f;setTextColor(Color.rgb(214,186,255));gravity=Gravity.CENTER;contentDescription=description;isFocusable=true;setOnClickListener{action()};bar.addView(this,LinearLayout.LayoutParams(dp(48),dp(48)))}
  button("‹","크루로 돌아가기"){requestLeave()}
  headerLabel=TextView(this).apply{text=MobileExperienceRoute.title(route);textSize=17f;setTextColor(Color.WHITE);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END};bar.addView(headerLabel,LinearLayout.LayoutParams(0,dp(48),1f));headerLabel.gravity=Gravity.CENTER_VERTICAL
  button("⛶","전체 화면"){if(bar.visibility==View.VISIBLE){bar.visibility=View.GONE;Toast.makeText(this,"뒤로가기를 누르면 메뉴가 다시 보여요",Toast.LENGTH_SHORT).show()}}
  content.addView(bar)
  loadingBar=ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);content.addView(loadingBar,LinearLayout.LayoutParams(-1,dp(2)))
  web=WebView(this).apply{
   setBackgroundColor(Color.rgb(11,16,36));isFocusableInTouchMode=true;overScrollMode=View.OVER_SCROLL_NEVER
   settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.useWideViewPort=true;settings.loadWithOverviewMode=true
   settings.setSupportZoom(false);settings.builtInZoomControls=false;settings.displayZoomControls=false
   settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
   settings.mediaPlaybackRequiresUserGesture=true;settings.javaScriptCanOpenWindowsAutomatically=false;settings.setSupportMultipleWindows(false)
   settings.userAgentString+=" AIFECT-Mobile/"+BuildConfig.VERSION_NAME
   CookieManager.getInstance().setAcceptThirdPartyCookies(this,false)
   webChromeClient=object:WebChromeClient(){
    override fun onProgressChanged(view:WebView?,value:Int){loadingBar.progress=value;loadingBar.visibility=if(value==100)View.GONE else View.VISIBLE}
    override fun onPermissionRequest(request:PermissionRequest){
     if(!MobileExperienceRoute.canUseMicrophone(route,Endpoint.origin,request.origin.toString())||PermissionRequest.RESOURCE_AUDIO_CAPTURE !in request.resources||!CurrentNavigation.sameOrigin(url.orEmpty(),Endpoint.origin)){request.deny();return}
     permission?.deny();permission=request
     if(ContextCompat.checkSelfPermission(this@MobileExperienceActivity,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){permission=null;request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))}
     else microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
    }
    override fun onPermissionRequestCanceled(request:PermissionRequest){if(permission===request)permission=null}
    override fun onJsAlert(v:WebView,url:String,message:String,result:JsResult):Boolean{AlertDialog.Builder(this@MobileExperienceActivity).setMessage(message).setPositiveButton("확인"){_,_->result.confirm()}.setOnCancelListener{result.cancel()}.show();return true}
    override fun onJsConfirm(v:WebView,url:String,message:String,result:JsResult):Boolean{AlertDialog.Builder(this@MobileExperienceActivity).setMessage(message).setPositiveButton("확인"){_,_->result.confirm()}.setNegativeButton("취소"){_,_->result.cancel()}.setOnCancelListener{result.cancel()}.show();return true}
    override fun onShowCustomView(view:View,callback:CustomViewCallback){if(custom!=null){callback.onCustomViewHidden();return};custom=view;customCallback=callback;content.visibility=View.GONE;root.addView(view,FrameLayout.LayoutParams(-1,-1))}
    override fun onHideCustomView(){hideCustom()}
   }
   webViewClient=object:WebViewClient(){
    override fun shouldOverrideUrlLoading(v:WebView,request:WebResourceRequest):Boolean{
     if(!request.isForMainFrame)return false
     val url=request.url.toString()
     if(!CurrentNavigation.sameOrigin(url,Endpoint.origin))return true
     val next=MobileExperienceRoute.fromUrl(url,Endpoint.origin)
     if(next!=null){route=next;headerLabel.text=MobileExperienceRoute.title(next);return false}
     requestLeave();return true
    }
    override fun onPageFinished(v:WebView,url:String){if(CurrentNavigation.sameOrigin(url,Endpoint.origin)){v.evaluateJavascript(mobileExperienceScript(route),null);suspended=false}}
    override fun doUpdateVisitedHistory(v:WebView,url:String,reload:Boolean){
     if(url=="about:blank"||!CurrentNavigation.sameOrigin(url,Endpoint.origin))return
     val next=MobileExperienceRoute.fromUrl(url,Endpoint.origin)
     if(next!=null){route=next;headerLabel.text=MobileExperienceRoute.title(next)}else if(!reload)v.post{requestLeave()}
    }
    override fun onReceivedError(v:WebView,r:WebResourceRequest,e:WebResourceError){if(r.isForMainFrame&&!disposed)showError()}
    override fun onReceivedHttpError(v:WebView,r:WebResourceRequest,e:WebResourceResponse){if(r.isForMainFrame&&!disposed)showError()}
    override fun onRenderProcessGone(v:WebView,d:RenderProcessGoneDetail):Boolean{disposed=true;v.destroy();AlertDialog.Builder(this@MobileExperienceActivity).setMessage("게임 화면이 종료됐어요. 다시 열어주세요.").setPositiveButton("닫기"){_,_->finish()}.show();return true}
   }
  }
  content.addView(web,LinearLayout.LayoutParams(-1,0,1f));setContentView(root)
  ViewCompat.setOnApplyWindowInsetsListener(root){v,insets->val b=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime());v.setPadding(b.left,b.top,b.right,b.bottom);insets}
  onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed(){when{custom!=null->hideCustom();bar.visibility==View.GONE->bar.visibility=View.VISIBLE;else->requestLeave()}}})
  val cookies=CookieManager.getInstance()
  cookies.removeAllCookies{
   if(isFinishing)return@removeAllCookies
   if(session.isBlank())web.loadUrl(Endpoint.origin+MobileExperienceRoute.path(route))
   else cookies.setCookie(Endpoint.origin,session+"; Path=/; HttpOnly; SameSite=Lax; Secure"){if(!isFinishing)web.loadUrl(Endpoint.origin+MobileExperienceRoute.path(route))}
  }
 }
 private fun hideCustom(){custom?.let{root.removeView(it)};custom=null;content.visibility=View.VISIBLE;customCallback?.onCustomViewHidden();customCallback=null}
 private var leaving=false
 private fun requestLeave(){
  if(leaving||isFinishing)return;leaving=true
  AlertDialog.Builder(this).setTitle(if(route.startsWith("live/"))"노래방에서 나갈까요?" else "게임에서 나갈까요?").setMessage(if(route.startsWith("live/"))"음성 연결과 마이크가 종료돼요." else "진행 중인 도전은 게임 화면에서 먼저 마쳐주세요.").setPositiveButton("나가기"){_,_->finish()}.setNegativeButton("계속하기"){_,_->leaving=false}.setOnCancelListener{leaving=false}.show()
 }
 private fun showError(){if(isFinishing)return;AlertDialog.Builder(this).setMessage("화면을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.").setPositiveButton("다시 연결"){_,_->web.loadUrl(Endpoint.origin+MobileExperienceRoute.path(route))}.setNegativeButton("닫기"){_,_->finish()}.show()}
 override fun onPause(){if(::web.isInitialized&&!disposed){web.evaluateJavascript("window.dispatchEvent(new Event('blur'));",null);web.onPause()};super.onPause()}
 override fun onStop(){
  if(::web.isInitialized&&!disposed&&route.startsWith("live/")&&!isChangingConfigurations){permission?.deny();permission=null;web.loadUrl("about:blank");suspended=true}
  super.onStop()
 }
 override fun onResume(){super.onResume();if(::web.isInitialized&&!disposed){web.onResume();if(suspended)web.loadUrl(Endpoint.origin+MobileExperienceRoute.path(route))}}
 override fun onDestroy(){getSharedPreferences("native_session",0).unregisterOnSharedPreferenceChangeListener(sessionListener);permission?.deny();permission=null;if(::web.isInitialized&&!disposed){web.stopLoading();web.loadUrl("about:blank");web.removeAllViews();web.destroy();disposed=true};super.onDestroy()}
}

internal fun mobileExperienceScript(route:String):String {
 val live=route.startsWith("live/")
 val css="""
 :root{color-scheme:dark;--sidebar:0px;--bg:#0b1024;--panel:#1a2038}
 html,body{max-width:100%;margin:0;overscroll-behavior:none}
 body{padding:0!important;background:radial-gradient(ellipse at 70% 10%,#29245488,transparent 55%),#0b1024!important}
 .sidebar,.topbar,html body .page-wrap>.page-footer,html body .page-footer,.mobile-navigation,#menu-backdrop,body>.player{display:none!important}
 .page-wrap{margin:0!important;width:100%!important;min-height:0!important}
 #main{margin:0!important;padding:12px!important;width:100%!important;max-width:none!important;min-height:0!important}
 button,a,input,select{touch-action:manipulation}button,input:not([type=range]):not([type=checkbox]):not([type=radio]),select{min-height:44px}
 canvas,[data-jump],.lane,.touch-controls,.race-controls{touch-action:none!important;user-select:none;-webkit-user-select:none}
 dialog:not(.jump-wide-dialog){max-width:calc(100vw - 24px)!important;max-height:calc(100dvh - 24px)!important;overflow:auto}
 .wrap{width:100%;max-width:100%;box-sizing:border-box}
 .cgl-nav{flex-wrap:wrap}.arcade-lobby{padding:12px!important}
 @media(max-width:600px){.cgl-layout{grid-template-columns:minmax(0,1fr)!important}.cgl-start{min-height:48px}}
 """.trimIndent()+if(live)"""
 body.voice-room-open .page-wrap{margin:0!important;width:100%!important}
 body.voice-room-open #main{padding:8px!important}
 #main:has(>.voice-room){background:transparent!important}
 .voice-room{min-height:0!important;height:calc(100dvh - 16px)!important;max-height:none!important;border:0!important;border-radius:20px!important;background:transparent!important}
 #main .voice-room .room-header{background:transparent;border:0;padding:4px}
 #main .voice-room .room-header h1{font-size:16px}
 #main .voice-room .room-header nav{margin-left:auto}
 #main .voice-room .voice-columns{grid-template-rows:minmax(280px,67%) minmax(0,1fr);gap:8px}
 #main .voice-room .voice-stage{padding:0 4px 4px}
 #main .live-karaoke-room #live-karaoke-stage{grid-template-rows:minmax(0,1fr) auto;gap:8px}
 .live-stage-main{border:1px solid #b7a4e199!important;border-radius:22px!important;background:radial-gradient(ellipse at 20% 35%,#5743a34d,transparent 70%),linear-gradient(135deg,#171d34d9,#28264ad9)!important;padding:18px 12px!important}
 .live-lyrics{min-height:90px!important;font-size:22px!important;line-height:1.8!important}
 #main .live-karaoke-room .live-stage-main{padding:10px!important;gap:6px;flex-shrink:1}
 #main .live-karaoke-room .live-song{font-size:17px;white-space:normal;flex-shrink:0}
 #main .live-karaoke-room .live-request-area{margin:0;padding:6px!important;gap:6px}
 #main .live-karaoke-room .live-queue{max-height:none;height:62px;min-height:62px;padding:0!important}
 #main .live-karaoke-room .live-queue:has(.live-queue-empty){height:32px;min-height:32px}
 #main .live-karaoke-room .live-queue li:not(.live-queue-empty){min-width:155px;padding:4px 6px}
 .live-request-area,.voice-chat{border:1px solid #b7a4e170!important;border-radius:20px!important;background:#1b2136b0!important}
 .live-request-button{background:linear-gradient(110deg,#acf5de,#56e5d9)!important;color:#081625!important;border-radius:28px!important;min-height:52px!important}
 #main .live-karaoke-room .live-request-button :is(small,svg){color:#173d48!important}
 #main .voice-room .voice-chat-panel{padding:8px;border:1px solid #b7a4e170;border-radius:20px;background:#1b2136b0}
 #main .voice-room .voice-chat{padding:8px;border:0!important;background:transparent!important}
 .live-queue{padding:12px!important}.voice-chat-form input{font-size:16px!important}
 """.trimIndent() else ""
 return "(()=>{let s=document.getElementById('aifect-mobile-experience');if(!s){s=document.createElement('style');s.id='aifect-mobile-experience';document.head.append(s)}s.textContent="+JSONObject.quote(css)+";let v=document.querySelector('meta[name=viewport]');if(v)v.content='width=device-width, initial-scale=1, viewport-fit=cover';window.dispatchEvent(new Event('resize'));})()"
}
