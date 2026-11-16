package kr.co.aifect.app

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DubbingContinuousTest {
 private fun line(id:String,role:String,start:Int)=JSONObject()
  .put("id",id).put("roleId",role).put("start",start).put("end",start+2).put("recordEnd",start+2.5)

 @Test fun selectedPointFollowsPartnerAndSavedTurnsWithoutRecordingThem(){
  val timeline=listOf(line("earlier","me",2),line("saved","me",5),line("partner","other",8),
   line("one","me",11),line("uploaded","me",14).put("takeId","remote"),
   line("two","me",17),line("later","other",20))
  val mine=timeline.filter{it.getString("roleId")=="me"}
  val pending=pendingDubbingLines(mine,1,setOf("saved"))
  val steps=dubbingRunSteps(timeline,"saved",pending)
  assertEquals(listOf("saved","partner","one","uploaded","two"),steps.map{it.line.getString("id")})
  assertEquals(listOf("one","two"),steps.filter{it.capture}.map{it.line.getString("id")})
  assertEquals(listOf(11.0,17.0),steps.filter{it.capture}.map{dubbingWindow(it.line).start})
  assertTrue(dubbingRunSteps(timeline,"two",emptyList()).isEmpty())
 }

 @Test fun countdownNeverEndsBeforeStartingAudio(){
  // On slow or fast devices the timer can enter the last 15ms before the call to play().
  for(untilLine in listOf(.014,.0001,0.0,-.01)){
   assertTrue(dubbingCountInRemaining(0.0,0L,untilLine,false)>0)
  }
  assertEquals(0.0,dubbingCountInRemaining(0.0,0L,0.0,true),0.0)
  assertTrue(dubbingCountInRemaining(2.0,1986L,0.0,true)>0)
  assertEquals(0.0,dubbingCountInRemaining(2.0,2000L,0.0,true),0.0)
 }
}
