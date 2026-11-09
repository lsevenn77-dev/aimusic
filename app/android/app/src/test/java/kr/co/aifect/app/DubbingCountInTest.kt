package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class DubbingCountInTest {
 @Test fun countInPlaysTheThreeSecondsOfSoundBeforeTheLine(){
  // Mid-script: playback starts three seconds before the line, so 3 · 2 · 1 runs over those effects.
  assertEquals(9.0,dubbingLeadIn(DubbingWindow(cueStart=12.0,start=12.0,end=15.0)),1e-9)
  // A sound cue that starts even earlier is played from its own start.
  assertEquals(4.0,dubbingLeadIn(DubbingWindow(cueStart=4.0,start=12.0,end=15.0)),1e-9)
  // Near the top only the sound that exists can play; the rest of the count is silent.
  assertEquals(0.0,dubbingLeadIn(DubbingWindow(cueStart=1.2,start=1.2,end=4.0)),1e-9)
  assertEquals(3.0,DUBBING_COUNT_IN,0.0)
 }
}
