package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class SongAdCadenceTest {
 @Test fun fifthCompletedSongMakesOneBreakDue(){
  val c=SongAdCadence()
  repeat(4){c.finish(180000,180000);assertFalse(c.due)}
  c.finish(180000,180000);assertTrue(c.due)
  c.shown();assertFalse(c.due);assertEquals(0,c.completed)
 }
 @Test fun shortSkipsPreviewsUnknownDurationAndSeekingToEndDoNotCount(){
  val c=SongAdCadence()
  c.finish(1000,180000);c.finish(60000,60000,true);c.finish(90000,0);c.finish(0,180000)
  assertEquals(0,c.completed)
 }
 @Test fun sixtyPercentCountsEvenWithoutReachingTheEnd(){
  val c=SongAdCadence()
  c.finish(107999,180000);assertEquals(0,c.completed)
  c.finish(108000,180000);assertEquals(1,c.completed)
  c.finish(108001,180000);assertEquals(2,c.completed)
 }
 @Test fun fifthQualifiedSkipMakesOneBreakDue(){
  val c=SongAdCadence()
  repeat(4){c.finish(108000,180000);assertFalse(c.due)}
  c.finish(108000,180000);assertTrue(c.due)
 }
 @Test fun unavailableAdsDoNotAccumulateMultipleBreaks(){
  val c=SongAdCadence(4)
  repeat(20){c.finish(180000,180000)}
  assertEquals(5,c.completed)
  c.shown();repeat(4){c.finish(180000,180000)};assertFalse(c.due)
 }
}
