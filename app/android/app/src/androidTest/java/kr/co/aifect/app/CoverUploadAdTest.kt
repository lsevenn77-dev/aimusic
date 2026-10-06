package kr.co.aifect.app

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class CoverUploadAdTest {
 @Test fun completedCoverUsesAvailableAdImmediatelyAndSkipsPremiumOrMissingAds() {
  val instrumentation=InstrumentationRegistry.getInstrumentation()
  val context=instrumentation.targetContext
  assertTrue(context.packageName.endsWith(".test"))
  instrumentation.runOnMainSync {
   var shown=0;var paused=0;var finished=0;var available=true
   var dismiss:(()->Unit)?=null
   val presenter=object:SongAdBreaks.Host {
    override fun ready()=available
    override fun show(onShown:()->Unit,onFinished:()->Unit):Boolean {
     shown++;onShown();dismiss=onFinished;return true
    }
   }
   try {
    val owner="cover-ad-test-"+java.util.UUID.randomUUID()
    SongAdBreaks.configure(context,owner,0)
    SongAdBreaks.host=presenter
    SongAdBreaks.afterCoverUpload("cover-one",{paused++},{finished++})
    assertEquals(1,shown);assertEquals(1,paused);assertEquals(0,finished)
    dismiss!!();assertEquals(1,finished);assertFalse(SongAdBreaks.due)
    SongAdBreaks.configure(context,owner,System.currentTimeMillis()/1000+3600)
    SongAdBreaks.afterCoverUpload("premium-cover",{paused++},{finished++})
    assertEquals(1,shown);assertEquals(1,paused);assertEquals(2,finished)
    SongAdBreaks.configure(context,owner,0);available=false
    SongAdBreaks.afterCoverUpload("no-ad-cover",{paused++},{finished++})
    assertEquals(1,shown);assertEquals(1,paused);assertEquals(3,finished)
    SongAdBreaks.host=object:SongAdBreaks.Host {
     override fun ready()=true
     override fun show(onShown:()->Unit,onFinished:()->Unit)=false
    }
    SongAdBreaks.afterCoverUpload("failed-ad-cover",{paused++},{finished++})
    assertEquals(1,shown);assertEquals(2,paused);assertEquals(4,finished)
   } finally {SongAdBreaks.host=null;SongAdBreaks.configure(context,null,0)}
  }
 }
}
