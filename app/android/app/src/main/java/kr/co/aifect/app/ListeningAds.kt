package kr.co.aifect.app

import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.ads.*
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.ump.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ListeningAds(private val activity:ComponentActivity):SongAdBreaks.Host {
 private val consent=UserMessagingPlatform.getConsentInformation(activity)
 private var ad:InterstitialAd?=null
 private var loadedAt=0L
 private var loading=false
 private var initialized=false
 private var initializing=false
 private var started=false
 private var showing=false
 private var lastRequest=0L
 val privacyRequired get()=consent.privacyOptionsRequirementStatus==ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
 fun prepare() {
  if(!BuildConfig.AD_NETWORK_ENABLED||activity.isDestroyed)return
  if(!started){
   started=true
   consent.requestConsentInfoUpdate(activity,ConsentRequestParameters.Builder().build(),{
    if(activity.isDestroyed)return@requestConsentInfoUpdate
    UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity){startAds()}
   },{startAds()})
  }
  startAds()
 }
 private fun startAds() {
  if(!BuildConfig.AD_NETWORK_ENABLED||!consent.canRequestAds()||!SongAdBreaks.eligible||activity.isDestroyed)return
  if(initialized){preload();return}
  if(initializing)return
  initializing=true
  activity.lifecycleScope.launch(Dispatchers.IO){MobileAds.initialize(activity.applicationContext){
   activity.runOnUiThread {initialized=true;initializing=false;preload()}
  }}
 }
 private fun preload(){
  if(!initialized||!consent.canRequestAds()||!SongAdBreaks.eligible||activity.isDestroyed||showing||loading)return
  if(ad!=null&&System.currentTimeMillis()-loadedAt<3_300_000)return
  ad=null
  if(System.currentTimeMillis()-lastRequest<60_000)return
  lastRequest=System.currentTimeMillis();loading=true
  InterstitialAd.load(activity,BuildConfig.ADMOB_INTERSTITIAL_ID,AdRequest.Builder().build(),object:InterstitialAdLoadCallback(){
   override fun onAdLoaded(value:InterstitialAd){loading=false;if(!activity.isDestroyed){ad=value;loadedAt=System.currentTimeMillis()}}
   override fun onAdFailedToLoad(error:LoadAdError){loading=false;ad=null}
  })
 }
 override fun ready():Boolean {
  if(!activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)||activity.isFinishing)return false
  preload()
  return BuildConfig.AD_NETWORK_ENABLED&&SongAdBreaks.eligible&&consent.canRequestAds()&&!showing&&ad!=null&&System.currentTimeMillis()-loadedAt<3_300_000
 }
 override fun show(onShown:()->Unit,onFinished:()->Unit):Boolean {
  if(!ready())return false
  val value=ad?:return false
  ad=null;showing=true
  var finished=false
  fun finish(){if(finished)return;finished=true;showing=false;onFinished();preload()}
  value.fullScreenContentCallback=object:FullScreenContentCallback(){
   override fun onAdShowedFullScreenContent(){onShown()}
   override fun onAdDismissedFullScreenContent(){finish()}
   override fun onAdFailedToShowFullScreenContent(error:AdError){finish()}
  }
  try{value.show(activity)}catch(_:Exception){finish()}
  return true
 }
 fun privacy(onDone:(String)->Unit){
  if(!privacyRequired){onDone("현재는 별도의 광고 동의 변경 화면이 필요하지 않아요.");return}
  UserMessagingPlatform.showPrivacyOptionsForm(activity){error->ad=null;startAds();onDone(if(error==null)"광고 개인정보 설정을 확인했어요." else "설정을 열지 못했어요. 잠시 후 다시 시도해주세요.")}
 }
 fun dispose(){if(SongAdBreaks.host===this)SongAdBreaks.host=null;ad=null}
}
