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
 private var fishingPort:WebMessagePort?=null
 private var lastBiteAt=-1000L
 private fun attachFishingHaptics(v:WebView,url:String){
  fishingPort?.close();fishingPort=null
  if(MobileExperienceRoute.fromUrl(url,Endpoint.origin)?.startsWith("game/fishing/")!=true)return
  val ports=v.createWebMessageChannel()
  fishingPort=ports[0]
  ports[0].setWebMessageCallback(object:WebMessagePort.WebMessageCallback(){
   override fun onMessage(port:WebMessagePort,msg:WebMessage){
    val time=android.os.SystemClock.elapsedRealtime()
    if(ports[0]!==fishingPort||disposed||isFinishing||!v.hasWindowFocus()||msg.data!="bite"||time-lastBiteAt<750L)return
    if(MobileExperienceRoute.fromUrl(v.url.orEmpty(),Endpoint.origin)?.startsWith("game/fishing/")!=true)return
    lastBiteAt=time;v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
   }
  })
  v.postWebMessage(WebMessage("aifect:fishing-haptics",arrayOf(ports[1])),android.net.Uri.parse(Endpoint.origin))
 }
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
  if(MobileExperienceRoute.isRoom(route))bar.visibility=View.GONE
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
     if(MobileExperienceRoute.isRoom(route))finish()else requestLeave();return true
    }
    override fun onPageFinished(v:WebView,url:String){if(!disposed&&CurrentNavigation.sameOrigin(url,Endpoint.origin)){v.evaluateJavascript(mobileExperienceScript(route),null);attachFishingHaptics(v,url);suspended=false}}
    override fun doUpdateVisitedHistory(v:WebView,url:String,reload:Boolean){
     if(url=="about:blank"||!CurrentNavigation.sameOrigin(url,Endpoint.origin))return
     val next=MobileExperienceRoute.fromUrl(url,Endpoint.origin)
     if(next!=null){route=next;headerLabel.text=MobileExperienceRoute.title(next)}else if(!reload)v.post{if(MobileExperienceRoute.fromUrl(v.url.orEmpty(),Endpoint.origin)==null){if(MobileExperienceRoute.isRoom(route))finish()else requestLeave()}}
    }
    override fun onReceivedError(v:WebView,r:WebResourceRequest,e:WebResourceError){if(r.isForMainFrame&&!disposed)showError()}
    override fun onReceivedHttpError(v:WebView,r:WebResourceRequest,e:WebResourceResponse){if(r.isForMainFrame&&!disposed)showError()}
    override fun onRenderProcessGone(v:WebView,d:RenderProcessGoneDetail):Boolean{disposed=true;v.destroy();AlertDialog.Builder(this@MobileExperienceActivity).setMessage("게임 화면이 종료됐어요. 다시 열어주세요.").setPositiveButton("닫기"){_,_->finish()}.show();return true}
   }
  }
  content.addView(web,LinearLayout.LayoutParams(-1,0,1f));setContentView(root)
  ViewCompat.setOnApplyWindowInsetsListener(root){v,insets->val b=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime());v.setPadding(b.left,b.top,b.right,b.bottom);insets}
  onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed(){when{custom!=null->hideCustom();!MobileExperienceRoute.isRoom(route)&&bar.visibility==View.GONE->bar.visibility=View.VISIBLE;else->requestLeave()}}})
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
  if(MobileExperienceRoute.isRoom(route)&&!disposed&&CurrentNavigation.sameOrigin(web.url.orEmpty(),Endpoint.origin)){
   // The page owns mode, active popup and leave cleanup. Mode switches stay inside it.
   web.evaluateJavascript("typeof window.aifectRoomBack==='function' && window.aifectRoomBack()"){handled->
    if(isFinishing)return@evaluateJavascript
    if(handled=="true")leaving=false else showLeaveDialog()
   }
  }else showLeaveDialog()
 }
 private fun showLeaveDialog(){
  val room=MobileExperienceRoute.isRoom(route)
  val dialog=AlertDialog.Builder(ContextThemeWrapper(this,android.R.style.Theme_Material_Dialog_Alert))
   .setTitle(if(room)MobileExperienceRoute.title(route)+"에서 나갈까요?" else "게임에서 나갈까요?")
   .setMessage(if(room)"음성 연결과 마이크가 종료돼요." else "진행 중인 도전은 게임 화면에서 먼저 마쳐주세요.")
   .setPositiveButton("나가기"){_,_->finish()}.setNegativeButton("머무르기"){_,_->leaving=false}.setOnCancelListener{leaving=false}.create()
  dialog.setOnShowListener{
   dialog.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.rgb(19,27,38)))
   for(which in listOf(AlertDialog.BUTTON_POSITIVE,AlertDialog.BUTTON_NEGATIVE))dialog.getButton(which).setTextColor(Color.rgb(214,186,255))
  }
  dialog.show()
 }
 private fun showError(){if(isFinishing)return;AlertDialog.Builder(this).setMessage("화면을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.").setPositiveButton("다시 연결"){_,_->web.loadUrl(Endpoint.origin+MobileExperienceRoute.path(route))}.setNegativeButton("닫기"){_,_->finish()}.show()}
 override fun onPause(){if(::web.isInitialized&&!disposed){web.evaluateJavascript("window.dispatchEvent(new Event('blur'));",null);web.onPause()};super.onPause()}
 override fun onStop(){
  if(::web.isInitialized&&!disposed&&MobileExperienceRoute.isRoom(route)&&!isChangingConfigurations){permission?.deny();permission=null;web.loadUrl("about:blank");suspended=true}
  super.onStop()
 }
 override fun onResume(){super.onResume();if(::web.isInitialized&&!disposed){web.onResume();if(suspended)web.loadUrl(Endpoint.origin+MobileExperienceRoute.path(route))}}
 override fun onDestroy(){fishingPort?.close();fishingPort=null;getSharedPreferences("native_session",0).unregisterOnSharedPreferenceChangeListener(sessionListener);permission?.deny();permission=null;if(::web.isInitialized&&!disposed){web.stopLoading();web.loadUrl("about:blank");web.removeAllViews();web.destroy();disposed=true};super.onDestroy()}
}

internal fun mobileExperienceScript(route:String):String {
 val live=MobileExperienceRoute.isRoom(route)
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
 """.trimIndent()
 // For rooms the server supplies the reviewed stage, empty queue, themes, sheets and
 // chat composer. Only remove the outer website navigation inside this Activity.
 val roomCss="""
 :root{color-scheme:dark;--sidebar:0px}
 html,body{margin:0;max-width:100%;overscroll-behavior:none;background-color:#0c121b}
 .sidebar,.topbar,html body .page-footer,.mobile-navigation,#menu-backdrop,body>.player{display:none!important}
 body.voice-room-open .page-wrap,.page-wrap:has(.voice-room){width:100%!important;margin:0!important;min-height:0!important}
 #main:has(>.voice-room){width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
 /* Restore the server-selected room background for either room mode when the
    website's more-specific #main .voice-room rule hides the free backdrop. */
 #main .voice-room[data-voice-room][data-background="navy"]:not([data-paid-theme]){
   background:
     radial-gradient(ellipse at 72% 10%,rgb(123 63 228 / 62%),transparent 48%),
     radial-gradient(ellipse at 7% 80%,rgb(65 54 128 / 62%),transparent 55%),
     radial-gradient(ellipse at 94% 92%,rgb(50 168 164 / 37%),transparent 42%),
     linear-gradient(130deg,#23134c,#121631 60%,#0e2936)!important;
 }
 #main .voice-room[data-voice-room][data-background="sunset"]:not([data-paid-theme]){
   background:
     radial-gradient(ellipse 125% 12% at 58% 43%,rgb(245 135 116 / 75%),transparent 65%),
     radial-gradient(ellipse 100% 18% at 51% 41%,rgb(183 56 115 / 65%),transparent 72%),
     radial-gradient(ellipse at 14% 8%,rgb(101 60 161 / 56%),transparent 62%),
     linear-gradient(160deg,#18132f,#2e1945 51%,#11162c)!important;
 }
 #main .voice-room[data-voice-room][data-background="night"]:not([data-paid-theme]){
   background:
     radial-gradient(circle,#d8e4ff9c 1px,transparent 2px) 6px 12px / 91px 117px repeat,
     radial-gradient(circle,#b8ccff6b 1px,transparent 2px) 42px 61px / 163px 143px repeat,
     radial-gradient(ellipse at 68% 17%,rgb(67 107 202 / 49%),transparent 56%),
     linear-gradient(140deg,#080d26,#142b56 65%,#071128)!important;
 }
 #main .voice-room[data-voice-room][data-paid-theme]{
   background-color:#0c121b!important;
   background-image:linear-gradient(rgb(9 15 28 / 42%),rgb(9 15 28 / 58%)),var(--decoration-mobile)!important;
   background-position:center center!important;
   background-repeat:no-repeat!important;
   background-size:cover!important;
 }
 /* The key selector is available for an active singer, never the idle room. */
 .voice-room.live-karaoke-room:not([data-live-phase]) .room-key,
 .voice-room.live-karaoke-room[data-live-phase="idle"] .room-key{display:none!important}
 """.trimIndent()
 val roomBehavior="""
 (() => {
   if (window.__aifectMobileRoomThemeSync) {
     window.__aifectMobileRoomThemeSync.refresh();
     return;
   }
   const state = {root:null, roomId:'', theme:null, pending:null, serial:0};
   function roomNode() {
     return document.querySelector('.voice-room[data-voice-room]');
   }
   function apply(theme) {
     const root=roomNode();
     if (!root || !theme || typeof theme.sku!=='string') return;
     const sku=theme.sku;
     if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(sku)) return;
     const asset=theme.assets?.roomMobile || theme.assetPaths?.roomMobile;
     const safe=typeof asset==='string' && asset.startsWith('/assets/themes/') && asset.endsWith('.webp') && !asset.includes('..');
     const now=Number(theme.server_now)>0 ? Number(theme.server_now) : Date.now()/1000;
     const active=!sku.startsWith('theme_') || Number(theme.expires_at)>now;
     const valid=safe && active;
     // Paid themes keep the Site's fallback background and use its own image.
     if (['navy','sunset','night'].includes(sku)) root.dataset.background=sku;
     root.dataset.themeSku=sku;
     if (valid) {
       root.dataset.paidTheme=sku;
       root.style.setProperty('--decoration-mobile','url("'+asset+'")');
       root.style.setProperty('background-image','linear-gradient(rgb(9 15 28 / 42%),rgb(9 15 28 / 58%)),url("'+asset+'")','important');
       root.style.setProperty('background-position','center center','important');
       root.style.setProperty('background-size','cover','important');
     } else {
       delete root.dataset.paidTheme;
       root.style.removeProperty('--decoration-mobile');
       root.style.removeProperty('background-image');
       root.style.removeProperty('background-position');
       root.style.removeProperty('background-size');
     }
     root.dataset.mobileThemeApplied=sku;
   }
   async function readTheme() {
     const root=roomNode(), id=root?.dataset.voiceRoom;
     if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return;
     const serial=++state.serial;
     try {
       const response=await fetch('/api/voice/rooms/'+encodeURIComponent(id)+'/theme',{credentials:'same-origin',cache:'no-store'});
       if (!response.ok) throw Error('theme '+response.status);
       const data=await response.json();
       if (serial!==state.serial || roomNode()?.dataset.voiceRoom!==id || !data?.theme) return;
       state.roomId=id;
       state.theme=data.theme;
       apply(data.theme);
     } catch (error) {
       console.warn('AIFECT_MOBILE_THEME_READ_FAILED',error.message);
     }
   }
   function refresh(delay) {
     clearTimeout(state.pending);
     state.pending=setTimeout(readTheme,delay || 0);
   }
   const observer=new MutationObserver(changes => {
     const root=roomNode();
     if (!root) {state.root=null;return;}
     const id=root.dataset.voiceRoom;
     if (root!==state.root || state.roomId!==id) {
       state.root=root;
       if (state.theme && state.roomId===id) apply(state.theme);
       refresh(90);
       return;
     }
     if (!state.theme) return;
     // Room settings can change in-place without replacing the root node.
     const updated=changes.some(change=>change.type==='attributes' && change.target===root);
     if (!updated) return;
     const current=state.theme.sku;
     if (root.dataset.themeSku!==current ||
         (!current.startsWith('theme_') && root.dataset.background!==current)) {
       refresh(120);
     } else if (current.startsWith('theme_') && root.dataset.paidTheme!==current) {
       apply(state.theme);
     }
   });
   observer.observe(document.documentElement,{
     childList:true,subtree:true,attributes:true,
     attributeFilter:['data-background','data-theme-sku','data-paid-theme']
   });
   window.addEventListener('aifect:room-theme',event => {
     const active=roomNode();
     if (!active || event.detail?.room?.id!==active.dataset.voiceRoom) return;
     if (event.detail.room.theme) {
       state.theme=event.detail.room.theme;
       apply(state.theme);
     }
     refresh(120);
   });
   document.addEventListener('visibilitychange',() => {
     if (!document.hidden && roomNode()) refresh(200);
   });
   setInterval(() => {if (!document.hidden && roomNode())refresh(100);},30000);
   window.__aifectMobileRoomThemeSync={refresh};
   refresh(0);
 })();
 """.trimIndent()
 val layout="(()=>{let s=document.getElementById('aifect-mobile-experience');if(!s){s=document.createElement('style');s.id='aifect-mobile-experience';document.head.append(s)}s.textContent="+JSONObject.quote(if(live)roomCss else css)+";let v=document.querySelector('meta[name=viewport]');if(v)v.content='width=device-width, initial-scale=1, viewport-fit=cover';window.dispatchEvent(new Event('resize'));})()"
 return if(live)layout+";"+roomBehavior else layout
}
