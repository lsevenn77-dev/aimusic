package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class CurrentNavigationTest {
 @Test fun authenticatedPagesStayOnTheExactProductOrigin(){
  val origin="https://aifect.co.kr"
  assertTrue(CurrentNavigation.sameOrigin("https://aifect.co.kr/",origin))
  assertTrue(CurrentNavigation.sameOrigin("https://aifect.co.kr:443",origin))
  for(url in listOf("http://aifect.co.kr","https://aifect.co.kr.evil.test","https://aifect.co.kr:444","https://aifect.co.kr@evil.test","file:///tmp/page","data:text/html,test"))assertFalse(url,CurrentNavigation.sameOrigin(url,origin))
 }
 @Test fun embeddedDestinationsCannotReplaceTheAppOrNavigateToArbitraryPages(){
  for(route in listOf("voice/room-123","voice/create","dubbing/new?mode=manual","dubbing/project-123?role=role_a","community/crews","crew/crew-123?tab=members","profile-gallery/own","relations","gift-inventory"))assertTrue(route,CurrentNavigation.workspaceRoute(route))
  for(route in listOf("home","account","admin","https://evil.test","//evil.test","dubbing/../admin","voice/a/b","dubbing/a\n","voice/","profile-gallery/../../secret"))assertFalse(route,CurrentNavigation.workspaceRoute(route))
 }
 @Test fun playListsUseCurrentWebEndpointsAndDoNotMixFinishedWorksWithInvitations(){
  assertEquals("/api/karaoke",CurrentNavigation.playPath("song","recommended"))
  assertEquals("/api/duets",CurrentNavigation.playPath("song","duets"))
  assertEquals("/api/play/latest",CurrentNavigation.playPath("song","latest"))
  assertEquals("/api/play/participate",CurrentNavigation.playPath("dubbing","join"))
  assertEquals("/api/dubbing/projects?tab=mine",CurrentNavigation.playPath("dubbing","mine"))
  assertEquals("/api/play/works?tab=following&type=duet",CurrentNavigation.playPath("browse","following","duet"))
 }
}
