package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class VoiceMicIntentTest {
 @Test fun delayedEnableCannotUndoImmediateMute(){val m=VoiceMicIntent();val on=m.request(true);val off=m.request(false);m.complete(on);assertFalse(m.isCurrent(on));assertTrue(m.pending);assertFalse(m.permits(true));m.complete(off);assertFalse(m.pending)}
 @Test fun phoneCallInvalidatesAnInflightEnable(){val m=VoiceMicIntent();val on=m.request(true);m.interrupt();m.complete(on);assertFalse(m.permits(true));assertFalse(m.pending);assertFalse(m.isCurrent(on))}
 @Test fun laterExplicitTapCanEnableButCannotBypassHostLock(){val m=VoiceMicIntent();m.request(true);m.interrupt();m.request(true);assertTrue(m.permits(true));assertFalse(m.permits(false))}
 @Test fun fastOffOnRetainsLatestIntent(){val m=VoiceMicIntent();m.request(true);val off=m.request(false);val on=m.request(true);m.complete(off);assertTrue(m.pending);assertTrue(m.permits(true));m.complete(on);assertFalse(m.pending)}
}
