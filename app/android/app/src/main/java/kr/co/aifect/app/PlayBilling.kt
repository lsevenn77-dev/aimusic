package kr.co.aifect.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
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
 private fun trace(stage:String,result:BillingResult){
  // Never log receipts, account identifiers, or ProductDetails/offer tokens.
  val detail=if(BuildConfig.DEBUG)result.debugMessage.take(240)
   .replace(Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+"),"[account]")
   .replace(Regex("[A-Za-z0-9_./+=-]{40,}"),"[redacted]") else ""
  Log.i("AifectBilling","$stage code=${result.responseCode} $detail")
 }
 private fun failure(result:BillingResult):String=when(result.responseCode){
  BillingClient.BillingResponseCode.ITEM_UNAVAILABLE->"Google Play에서 이 상품을 지금 구매할 수 없어요. 스토어 계정과 테스트 참여 상태를 확인해주세요. (오류 4)"
  BillingClient.BillingResponseCode.BILLING_UNAVAILABLE->"현재 Google Play 계정에서 결제를 사용할 수 없어요. 스토어의 결제 설정을 확인해주세요. (오류 3)"
  BillingClient.BillingResponseCode.NETWORK_ERROR,BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE,BillingClient.BillingResponseCode.SERVICE_DISCONNECTED->"Google Play 연결이 끊겼어요. 잠시 후 다시 시도해주세요. (오류 ${result.responseCode})"
  else->"Google Play 구매를 완료하지 못했어요. (오류 ${result.responseCode})"
 }
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
    override fun onBillingSetupFinished(result:BillingResult){trace("connect",result);ready=result.responseCode==BillingClient.BillingResponseCode.OK;if(ready){queryProducts();restore();client.getBillingConfigAsync(GetBillingConfigParams.newBuilder().build()){configResult,config->trace("config country=${config?.countryCode.orEmpty()}",configResult)}}else message=failure(result)}
    override fun onBillingServiceDisconnected(){ready=false}
   })
  }catch(e:Exception){if(e is CancellationException)throw e;message="결제 정보를 불러오지 못했어요. 다시 시도해주세요."}finally{busy=false}}
 }
 private fun queryProducts(){
  val expected=owner
  listOf(BillingClient.ProductType.SUBS,BillingClient.ProductType.INAPP).forEach{type->
   val list=definitions.filter{it.optString("type")==type}.map{QueryProductDetailsParams.Product.newBuilder().setProductId(it.getString("id")).setProductType(type).build()}
   if(list.isNotEmpty())client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build()){result,details->
    trace("catalog type=$type count=${details.productDetailsList.size}",result)
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
  val expected=owner
  busy=true;message=null
  // Refresh immediately before checkout; cached ProductDetails may carry stale offer tokens.
  val query=QueryProductDetailsParams.Product.newBuilder().setProductId(product.productId).setProductType(product.productType).build()
  client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(listOf(query)).build()){result,details->
   scope.launch{
    trace("checkout_query product=${product.productId} count=${details.productDetailsList.size}",result)
    if(model.user?.optString("id")!=expected||owner!=expected){busy=false;return@launch}
    if(result.responseCode!=BillingClient.BillingResponseCode.OK){busy=false;message=failure(result);return@launch}
    val fresh=details.productDetailsList.singleOrNull{it.productId==product.productId&&it.productType==product.productType}
    if(fresh==null){busy=false;message="Google Play에서 구매 가능한 상품을 찾지 못했어요. 상품 다시 불러오기를 눌러주세요.";return@launch}
    products=products.filterNot{it.productId==fresh.productId}+fresh
    if(price(fresh)!=price(product)){busy=false;message="상품 가격이 변경됐어요. 표시된 가격을 확인한 뒤 다시 선택해주세요.";return@launch}
    launchPurchase(fresh)
   }
  }
 }
 private fun launchPurchase(product:ProductDetails){
  val detail=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product)
  val token=if(product.productType==BillingClient.ProductType.SUBS)offer(product)?.offerToken else goldOffer(product)?.offerToken
  if(token.isNullOrBlank()){busy=false;message="현재 구매 가능한 옵션을 찾지 못했어요. 상품 다시 불러오기를 눌러주세요.";return}
  detail.setOfferToken(token)
  val result=client.launchBillingFlow(activity,BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(detail.build())).setObfuscatedAccountId(account).build())
  trace("launch product=${product.productId}",result)
  if(result.responseCode!=BillingClient.BillingResponseCode.OK){busy=false;if(result.responseCode==BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED)restore()else message=failure(result)}
 }
 override fun onPurchasesUpdated(result:BillingResult,purchases:MutableList<Purchase>?){
  trace("purchase_result count=${purchases?.size?:0}",result)
  busy=false
  when(result.responseCode){BillingClient.BillingResponseCode.OK->purchases?.forEach(::verify);BillingClient.BillingResponseCode.USER_CANCELED->message="구매를 취소했어요.";BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED->restore();else->message=failure(result)}
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
   trace("restore type=$type count=${purchases.size}",result)
   if(result.responseCode==BillingClient.BillingResponseCode.OK){purchases.forEach(::verify);if(purchases.isEmpty())message="현재 로그인한 Google Play 계정의 구매 내역을 확인했어요."}
   else message="구매 복원을 다시 시도해주세요."
  }}
 }
 fun manage(){activity.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions?package=kr.co.aifect.app&sku=aifect_premium_monthly")))}
}
