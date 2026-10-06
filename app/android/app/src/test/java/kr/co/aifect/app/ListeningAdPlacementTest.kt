package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class ListeningAdPlacementTest {
 @Test fun songTransitionsNeverOpenUploadInterstitialOrPauseMusic() {
  var checks=0
  var displays=0
  var pauses=0
  var continuations=0
  val previous=SongAdBreaks.host
  SongAdBreaks.host=object:SongAdBreaks.Host {
   override fun ready():Boolean {checks++;return true}
   override fun show(onShown:()->Unit,onFinished:()->Unit):Boolean {displays++;return true}
  }
  try {
   repeat(12){SongAdBreaks.atBoundary({pauses++},{continuations++})}
   assertEquals(12,continuations)
   assertEquals(0,checks)
   assertEquals(0,displays)
   assertEquals(0,pauses)
  } finally {SongAdBreaks.host=previous}
 }
}
