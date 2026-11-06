package kr.co.aifect.app

import java.net.URI

/** Only these product-owned experiences may receive the signed-in app session. */
internal object MobileExperienceRoute {
 private val id=Regex("[A-Za-z0-9_-]{1,120}")
 private val games=setOf("rhythm","jump","racing","fishing")
 fun valid(route:String):Boolean {
  val p=route.split('/')
  return p.size==2&&p[0] in setOf("live","voice")&&id.matches(p[1])&&p[1]!="create" ||
   p.size==3&&p[0]=="game"&&p[1] in games&&id.matches(p[2])
 }
 fun path(route:String):String {
  require(valid(route))
  val p=route.split('/')
  return if(isRoom(route))"/#${p[0]}/${p[1]}" else if(p[1]=="jump")"/#crew-jump/${p[2]}" else "/crew-${p[1]}/?crew=${p[2]}&from=crew"
 }
 fun fromUrl(url:String,origin:String):String? {
  if(!CurrentNavigation.sameOrigin(url,origin))return null
  val u=runCatching{URI(url)}.getOrNull()?:return null
  val hash=u.fragment.orEmpty()
  if(isRoom(hash))return hash
  if(hash.startsWith("crew-jump/"))return "game/jump/${hash.substringAfter('/')}".takeIf(::valid)
  val game=Regex("^/crew-(rhythm|racing|fishing)/?$").matchEntire(u.path)?.groupValues?.get(1)?:return null
  val crew=u.rawQuery.orEmpty().split('&').firstOrNull{it.startsWith("crew=")}?.substringAfter('=')?:return null
  return "game/$game/$crew".takeIf(::valid)
 }
 fun isRoom(route:String)=valid(route)&&(route.startsWith("live/")||route.startsWith("voice/"))
 fun title(route:String)=if(route.startsWith("voice/"))"토킹룸" else when(route.split('/').getOrNull(1)){"rhythm"->"리듬게임";"jump"->"점프게임";"racing"->"레이싱게임";"fishing"->"낚시게임";else->"노래방"}
 fun canUseMicrophone(route:String,origin:String,requestOrigin:String)=isRoom(route)&&CurrentNavigation.sameOrigin(requestOrigin,origin)
}
