package kr.co.aifect.app

import org.json.JSONObject
import java.net.URI
import kotlin.math.max
import kotlin.math.min

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
  fromObject(product,"catalog_thumbnail")?.let{return it}
  val kind=product?.optString("kind")
  return if(kind=="TALKING_ROOM_THEME")
   fromObject(product,"roomCard","thumbnail","roomMobile","roomDesktop","image","cover")
  else fromObject(product,"thumbnail","overlay","roomCard","roomMobile","image","cover")
 }
 fun roomMobile(theme:JSONObject?):String?=fromObject(theme,"roomApp","roomMobile","roomDesktop","image","background","artwork")

 fun roomEffect(theme:JSONObject?):String? {
  val role=when {
   fromObject(theme,"roomApp")!=null -> "appEffect"
   fromObject(theme,"roomMobile")!=null -> "mobileEffect"
   else -> "desktopEffect"
  }
  return fromObject(theme,role)
 }

 data class ThemeArtwork(
  val role:String,val source:String,val effect:String?,val fit:String,val focusX:Double,val focusY:Double,val low:Boolean,val warning:Boolean,
 )

 fun roomArtwork(theme:JSONObject?,width:Double,height:Double,dpr:Double,economy:Boolean,static:Boolean,failed:Set<String> = emptySet()):ThemeArtwork?{
  val contract=theme?.optJSONObject("artwork")?:theme?.optJSONObject("themeArtwork")?:return null
  if(!width.isFinite()||!height.isFinite()||width<=0||height<=0)return null
  val roles=if(width>=600&&width>=height*1.1)listOf("desktop","app","mobile") else listOf("app","mobile","desktop")
  val candidates=roles.mapNotNull{role->
   val spec=contract.optJSONObject(role)?:return@mapNotNull null
   val lower=spec.optJSONObject("low")
   val chooseLow=lower!=null&&(economy||width*dpr<=lower.optDouble("width")&&height*dpr<=lower.optDouble("height"))
   val candidates=if(chooseLow)listOfNotNull(lower,spec) else listOfNotNull(spec,lower)
   val pick=candidates.firstOrNull{item->url(item.optString("src"))?.let{it !in failed}==true}?:return@mapNotNull null
   val src=url(pick.optString("src"))?:return@mapNotNull null
   val imageW=pick.optDouble("width");val imageH=pick.optDouble("height")
   if(!imageW.isFinite()||!imageH.isFinite()||imageW<=0||imageH<=0)return@mapNotNull null
   val fit=if(spec.optString("fit")=="contain")"contain" else "cover"
   val focus=spec.optJSONArray("focus");val safe=spec.optJSONArray("safe")
   val x=focus?.optDouble(0,.5)?.coerceIn(0.0,1.0)?:.5
   val y=focus?.optDouble(1,.5)?.coerceIn(0.0,1.0)?:.5
   val scale=if(fit=="cover")max(width/imageW,height/imageH) else min(width/imageW,height/imageH)
   val w=imageW*scale;val h=imageH*scale;val dx=(width-w)*x;val dy=(height-h)*y
   val covered=dx+w*(safe?.optDouble(0,0.0)?:0.0)>=-.5&&dy+h*(safe?.optDouble(1,0.0)?:0.0)>=-.5&&
    dx+w*(safe?.optDouble(2,1.0)?:1.0)<=width+.5&&dy+h*(safe?.optDouble(3,1.0)?:1.0)<=height+.5
   val effect=if(economy||static)null else url(pick.optString("effect"))?.takeUnless{it in failed}
   ThemeArtwork(role,src,effect,if(covered)fit else "contain",x,y,pick===lower,!covered)
  }
  val first=candidates.firstOrNull()?:return null
  val chosen=candidates.firstOrNull{!it.warning}?:first
  return if(chosen.role!=first.role)chosen.copy(warning=true) else chosen
 }

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
