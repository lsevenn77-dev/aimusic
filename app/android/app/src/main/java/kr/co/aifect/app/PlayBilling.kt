package kr.co.aifect.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.*
import com.android.billingclient.api.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

class PlayBilling(private val activity:Activity,private val model:MusicModel):PurchasesUpdatedListener {
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 private val verification=Mutex()
 private var owner=""
 private var account=""
 private var lastResume=0L
 private var ready=false
 private var definitions=emptyList<JSONObject>()
 var products by mutableStateOf<List<ProductDetails>>(emptyList());private set
 var busy by mutableStateOf(false);private set
 var message by mutableStateOf<String?>(null);private set
 var available by mutableStateOf(false);private set
 private val client=BillingClient.newBuilder(activity).setListener(this)
  .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
  .enableAutoServiceReconnection().build()
 fun close(){scope.cancel();client.endConnection()}
 fun resume(){val now=android.os.SystemClock.elapsedRealtime();if(model.user!=null&&now-lastResume>30_000){lastResume=now;load()}}
 fun load(){
  val user=model.user?.optString("id")?:return
  if(busy)return
  busy=true;message=null
  scope.launch{try{
   val catalog=model.api.call("/api/play/catalog",fresh=true)
   if(model.user?.optString("id")!=user)return@launch
   owner=user;account=catalog.getString("account_id");definitions=catalog.optJSONArray("products").objects()
   available=catalog.optBoolean("available");products=emptyList()
   if(!available){message="Google Play 결제 준비 중이에요. 상품이 연결되면 여기에서 구매할 수 있어요.";return@launch}
   if(client.isReady){queryProducts();restore()} else client.startConnection(object:BillingClientStateListener{
    override fun onBillingSetupFinished(result:BillingResult){ready=result.responseCode==BillingClient.BillingResponseCode.OK;if(ready){queryProducts();restore()}else message="Google Play 연결을 확인하고 다시 시도해주세요."}
    override fun onBillingServiceDisconnected(){ready=false}
   })
  }catch(e:Exception){if(e is CancellationException)throw e;message="결제 정보를 불러오지 못했어요. 다시 시도해주세요."}finally{busy=false}}
 }
 private fun queryProducts(){
  val expected=owner
  listOf(BillingClient.ProductType.SUBS,BillingClient.ProductType.INAPP).forEach{type->
   val list=definitions.filter{it.optString("type")==type}.map{QueryProductDetailsParams.Product.newBuilder().setProductId(it.getString("id")).setProductType(type).build()}
   if(list.isNotEmpty())client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build()){result,details->
    if(model.user?.optString("id")==expected&&owner==expected){
     if(result.responseCode==BillingClient.BillingResponseCode.OK)products=(products.filter{it.productType!=type}+details.productDetailsList)
     else message="스토어 상품을 불러오지 못했어요. 다시 시도해주세요."
    }
   }
  }
 }
 private fun goldOffer(product:ProductDetails)=product.oneTimePurchaseOfferDetailsList?.firstOrNull{it.purchaseOptionId=="buy"&&it.offerId==null}
 private fun offer(product:ProductDetails)=product.subscriptionOfferDetails?.firstOrNull{it.basePlanId=="monthly"&&it.offerId==null}
 fun price(product:ProductDetails):String=if(product.productType==BillingClient.ProductType.SUBS)offer(product)?.pricingPhases?.pricingPhaseList?.lastOrNull()?.formattedPrice?:"가격 확인 중" else goldOffer(product)?.formattedPrice?:"가격 확인 중"
 fun buy(product:ProductDetails){
  if(busy||!available||model.user?.optString("id")!=owner||!client.isReady)return
  val detail=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product)
  if(product.productType==BillingClient.ProductType.SUBS){val offer=offer(product)?:run{message="월 구독 상품을 확인하고 있어요.";return};val token=offer.offerToken?:run{message="골드 구매 상품을 확인하고 있어요.";return};detail.setOfferToken(token)} else {val offer=goldOffer(product)?:run{message="골드 구매 상품을 확인하고 있어요.";return};val token=offer.offerToken?:run{message="골드 구매 상품을 확인하고 있어요.";return};detail.setOfferToken(token)}
  val result=client.launchBillingFlow(activity,BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(detail.build())).setObfuscatedAccountId(account).build())
  when(result.responseCode){BillingClient.BillingResponseCode.OK->busy=true;BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED->restore();else->message="구매창을 열지 못했어요. Google Play 연결을 확인해주세요."}
 }
 override fun onPurchasesUpdated(result:BillingResult,purchases:MutableList<Purchase>?){
  busy=false
  when(result.responseCode){BillingClient.BillingResponseCode.OK->purchases?.forEach(::verify);BillingClient.BillingResponseCode.USER_CANCELED->message="구매를 취소했어요.";BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED->restore();else->message="구매 내역을 확인하지 못했어요. 구매 복원으로 다시 확인해주세요."}
 }
 private fun verify(purchase:Purchase){
  if(purchase.purchaseState==Purchase.PurchaseState.PENDING){message="결제 대기 중이에요. 결제 완료 후 반영됩니다.";return}
  if(purchase.purchaseState!=Purchase.PurchaseState.PURCHASED)return
  val user=model.user?.optString("id")?:return
  if(user!=owner||purchase.accountIdentifiers?.obfuscatedAccountId!=account){message="구매한 AIFECT 계정으로 로그인한 뒤 복원해주세요.";return}
  val product=purchase.products.singleOrNull()?.takeIf{pid->definitions.any{it.optString("id")==pid}}?:return
  scope.launch{verification.withLock{busy=true;try{
   if(model.user?.optString("id")!=user)return@withLock
   model.api.call("/api/play/verify","POST",payload("purchase_token" to purchase.purchaseToken,"product_id" to product,"account_id" to user))
   if(model.user?.optString("id")==user){model.loadMe(false);message="구매 내역을 반영했어요.";model.notice=message}
  }catch(e:Exception){if(e is CancellationException)throw e;message="구매 확인이 지연되고 있어요. 다시 결제하지 말고 구매 복원을 눌러주세요."}finally{busy=false}}}
 }
 fun restore(){
  if(!available||!client.isReady||model.user?.optString("id")!=owner){load();return}
  listOf(BillingClient.ProductType.SUBS,BillingClient.ProductType.INAPP).forEach{type->client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(type).build()){result,purchases->
   if(result.responseCode==BillingClient.BillingResponseCode.OK){purchases.forEach(::verify);if(purchases.isEmpty())message="현재 로그인한 Google Play 계정의 구매 내역을 확인했어요."}
   else message="구매 복원을 다시 시도해주세요."
  }}
 }
 fun manage(){activity.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions?package=kr.co.aifect.app&sku=aifect_premium_monthly")))}
}
