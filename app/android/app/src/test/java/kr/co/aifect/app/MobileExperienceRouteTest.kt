package kr.co.aifect.app
import org.junit.Test
import org.junit.Assert.*

class MobileExperienceRouteTest {
 private val origin="https://aifect.co.kr"
 @Test fun mapsAllFourOfficialGameRoutes(){
  assertEquals("/#crew-jump/team-1",MobileExperienceRoute.path("game/jump/team-1"))
  listOf("rhythm","racing","fishing").forEach{assertEquals("/crew-$it/?crew=team-1&from=crew",MobileExperienceRoute.path("game/$it/team-1"))}
 }
 @Test fun recoversNavigationFromOfficialPages(){
  assertEquals("game/jump/team-1",MobileExperienceRoute.fromUrl("$origin/#crew-jump/team-1",origin))
  assertEquals("game/rhythm/team-1",MobileExperienceRoute.fromUrl("$origin/crew-rhythm/?crew=team-1&from=crew",origin))
  assertEquals("live/room-1",MobileExperienceRoute.fromUrl("$origin/#live/room-1",origin))
 }
 @Test fun roomModesShareTheSameSessionNavigation(){
  for(mode in listOf("live","voice")){
   val route="$mode/room-1"
   assertTrue(MobileExperienceRoute.isRoom(route))
   assertEquals("/#$route",MobileExperienceRoute.path(route))
   assertEquals(route,MobileExperienceRoute.fromUrl("$origin/#$route",origin))
   assertTrue(MobileExperienceRoute.canUseMicrophone(route,origin,origin))
   assertFalse(MobileExperienceRoute.canUseMicrophone(route,origin,"https://evil.example"))
  }
  assertEquals("토킹룸",MobileExperienceRoute.title("voice/room-1"))
  assertFalse(MobileExperienceRoute.valid("voice/create"))
  assertFalse(MobileExperienceRoute.valid("voice/room?x=1"))
 }
 @Test fun rejectsExternalOriginsAndMalformedRoutes(){
  listOf("game/racing/../account","game/new/team","live/create","live/room?x=1","game/jump/","game/rhythm/team#account").forEach{assertFalse(it,MobileExperienceRoute.valid(it))}
  listOf("https://aifect.co.kr.evil.example/crew-rhythm/?crew=team","https://aifect.co.kr@evil.example/#live/room","http://aifect.co.kr/#live/room","https://aifect.co.kr/crew-rhythm/?crew=%2faccount").forEach{assertNull(it,MobileExperienceRoute.fromUrl(it,origin))}
 }
 @Test fun microphoneIsLimitedToLiveRoomAndExactOrigin(){
  assertTrue(MobileExperienceRoute.canUseMicrophone("live/room",origin,origin))
  assertFalse(MobileExperienceRoute.canUseMicrophone("game/rhythm/team",origin,origin))
  assertFalse(MobileExperienceRoute.canUseMicrophone("live/room",origin,"https://evil.example"))
 }
}
