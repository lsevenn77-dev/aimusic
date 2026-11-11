package kr.co.aifect.app

import org.json.JSONObject
import java.net.URI

/**
 * Server-owned product catalogue artwork. Product IDs and filenames must never
 * be compiled into the app. The Site may publish a new product and its artwork
 * without an Android release.
 *
 * Only HTTPS absolute URLs and safe same-origin paths are accepted. Credentials,
 * fragments, traversal and non-HTTP URI schemes are not image sources.
 */
internal object CatalogAssets {
 fun url(value:String?):String? {
  val source=value?.trim().orEmpty()
  if(source.isBlank()||source.length>2048||source.contains('\\')||
   source.any{it.code<32||it.code==127})return null
  return try {
   val uri=URI(source)
   if(uri.rawFragment!=null||uri.rawUserInfo!=null||uri.rawPath.orEmpty().split('/').any{it==".."||it=="."})return null
   when {
    !uri.isAbsolute && source.startsWith("/") && !source.startsWith("//") && uri.rawAuthority==null -> Endpoint.url(source)
    uri.isAbsolute && uri.scheme.equals("https",ignoreCase=true) && !uri.host.isNullOrBlank() && uri.port in -1..65535 -> uri.toASCIIString()
    else->null
   }
  }catch(_:Exception){null}
 }

 fun fromObject(product:JSONObject?,vararg names:String):String? {
  if(product==null)return null
  val groups=listOfNotNull(product.optJSONObject("assetPaths"),product.optJSONObject("assets"),product)
  for(group in groups)for(name in names)url(group.optString(name))?.let{return it}
  return null
 }

 fun giftImage(gift:JSONObject?):String?=fromObject(gift,"image","image_url","thumbnail","artwork","url")
 fun decorationImage(product:JSONObject?):String? {
  val kind=product?.optString("kind")
  return if(kind=="TALKING_ROOM_THEME")
   fromObject(product,"roomCard","thumbnail","roomMobile","roomDesktop","image","cover")
  else fromObject(product,"thumbnail","overlay","roomCard","roomMobile","image","cover")
 }
 fun roomMobile(theme:JSONObject?):String?=fromObject(theme,"roomMobile","roomDesktop","image","background","artwork")

 fun giftCatalog(json:JSONObject):Map<String,JSONObject>{
  val result=linkedMapOf<String,JSONObject>()
  for(key in listOf("gifts","silver_gifts")){
   json.optJSONArray(key).objects().forEach{product->
    product.optString("id").takeIf{it.isNotBlank()}?.let{result[it]=product}
   }
  }
  return result
 }
}
