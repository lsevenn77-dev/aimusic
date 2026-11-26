package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class NotificationContractTest {
 private fun data(activity:String="fan_comment")=mapOf("kind" to "notifications","activity" to activity,"target" to "work-id","recipient" to "owner","notification_id" to "event:work-id:owner")
 @Test fun everyNewImmediateKindParses(){for(activity in NotificationContract.activities){assertNotNull(activity,NotificationContract.parse(data(activity),"owner"))}}
 @Test fun legacyKindsStayCompatible(){for(kind in listOf("dm","comment","gift","crew","person_gift")){assertNotNull(kind,NotificationContract.parse(data()+mapOf("kind" to kind,"activity" to ""),"owner"))}}
 @Test fun accountIsolationIsRequired(){assertNull(NotificationContract.parse(data(),null));assertNull(NotificationContract.parse(data(),"other"));assertNull(NotificationContract.parse(data()+mapOf("recipient" to ""),"owner"))}
 @Test fun malformedAndUnknownEventsNeverNavigate(){assertNull(NotificationContract.parse(data("unknown"),"owner"));assertNull(NotificationContract.parse(data()+mapOf("kind" to "unknown"),"owner"));assertNull(NotificationContract.parse(data()+mapOf("target" to "../other"),"owner"));assertNull(NotificationContract.parse(data()+mapOf("notification_id" to "../secret"),"owner"))}
 @Test fun preferenceGroupsMatchTheServer(){assertEquals("crew_important",NotificationContract.parse(data("crew_invite"),"owner")!!.preference);assertEquals("participation",NotificationContract.parse(data("dubbing_complete"),"owner")!!.preference);assertEquals("work_status",NotificationContract.parse(data("work_status"),"owner")!!.preference);assertEquals(9,NotificationContract.preferences.size)}
 @Test fun dailyDigestKeyIncludesAccountAndDay(){val a=NotificationContract.parse(data("artist_digest")+mapOf("notification_id" to "","target" to "2026-10-30"),"owner")!!;val b=NotificationContract.parse(data("artist_digest")+mapOf("notification_id" to "","target" to "2026-10-31"),"owner")!!;assertNotEquals(a.key,b.key)}
 @Test fun exactSupportedContentRoutesAreAccepted(){for(route in listOf("#notifications","#notifications?filter=artists","#notifications?request=crew-request%3Aone","#notifications?unavailable=1","#artist/artist?tab=lounge&post=reply","#song/song?comment=comment","#studio?track=failed","#crew/crew?tab=notice","#dubbing/work","#producer/person")){assertEquals(route,NotificationContract.safeRoute(route))}}
 @Test fun externalAndScriptRoutesAreRejected(){for(route in listOf("https://evil.example/","//evil.example","javascript:alert(1)","#artist/../secret","#notifications\n","#notifications#https://evil.example","#account")){assertNull(route,NotificationContract.safeRoute(route))}}
 @Test fun authenticatedCookieCannotNavigateToAnotherOrigin(){for(url in listOf("http://aifect.co.kr/#notifications","https://aifect.co.kr.evil.example/#notifications","https://evil.example/#notifications","https://owner@aifect.co.kr/#notifications","https://aifect.co.kr:443/#notifications","file:///local","https://aifect.co.kr/api/me")){assertFalse(url,NotificationContract.safeWebURL(url))};assertTrue(NotificationContract.safeWebURL("https://aifect.co.kr/#artist/artist?tab=lounge&post=reply"))}
 @Test fun pushSuppliedRouteIsIgnored(){val push=NotificationContract.parse(data()+mapOf("route" to "https://evil.example"),"owner");assertNotNull(push);assertEquals("event:work-id:owner",push!!.notificationId)}
}
