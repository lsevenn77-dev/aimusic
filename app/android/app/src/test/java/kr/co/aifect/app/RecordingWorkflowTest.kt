package kr.co.aifect.app

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class RecordingWorkflowTest {
 @get:Rule val temp=TemporaryFolder()

 @Test fun continuousSkipsEarlierAndFinishedLines(){
  fun line(id:String)=JSONObject().put("id",id)
  val lines=listOf(line("before"),line("saved"),line("sent").put("takeId","remote"),line("next"),line("last"))
  assertEquals(listOf("next","last"),pendingDubbingLines(lines,1,setOf("saved")).map{it.getString("id")})
  assertTrue(pendingDubbingLines(lines,4,setOf("last")).isEmpty())
 }

 @Test fun completedTakesAndUploadReceiptsSurviveReopen(){
  val dir=temp.newFolder()
  val old=JSONObject().put("id","first").put("uploaded",true)
  File(dir,"first.wav").writeBytes(byteArrayOf(1))
  val legacy=File(dir,"takes.json")
  legacy.writeText(JSONObject().put("intro",old).toString())
  val originalManifest=legacy.readText()
  val store=DubbingDrafts(dir)
  val second=JSONObject().put("id","second").put("uploaded",false)
  store.file(second).writeBytes(byteArrayOf(2))
  store.commit("line2",second)
  val reopened=DubbingDrafts(dir)
  assertTrue(reopened.takes.getValue("intro").getBoolean("uploaded"))
  assertFalse(reopened.takes.getValue("line2").getBoolean("uploaded"))
  reopened.uploaded("line2","second")
  assertTrue(DubbingDrafts(dir).takes.getValue("line2").getBoolean("uploaded"))
  assertEquals(originalManifest,legacy.readText())
 }

 @Test fun incompleteReplacementAndLateReceiptPreserveLatestTake(){
  val dir=temp.newFolder()
  val store=DubbingDrafts(dir)
  fun take(id:String)=JSONObject().put("id",id).put("uploaded",false)
  val old=take("old")
  store.file(old).writeBytes(byteArrayOf(1));store.commit("line",old)
  val new=take("new")
  assertTrue(runCatching{store.commit("line",new)}.isFailure)
  assertEquals("old",DubbingDrafts(dir).takes.getValue("line").getString("id"))
  store.file(new).writeBytes(byteArrayOf(2));store.commit("line",new)
  store.uploaded("line","old")
  val restored=DubbingDrafts(dir).takes.getValue("line")
  assertEquals("new",restored.getString("id"))
  assertFalse(restored.getBoolean("uploaded"))
 }

 @Test fun captureGainMutesScalesAndSaturates(){
  assertEquals(0,RecordingGain.scale(20000,0f).toInt())
  assertEquals(-10000,RecordingGain.scale(-20000,.5f).toInt())
  assertEquals(20000,RecordingGain.scale(20000,1f).toInt())
  assertEquals(32767,RecordingGain.scale(30000,2f).toInt())
  assertEquals(-32768,RecordingGain.scale(-30000,2f).toInt())
 }

 @Test fun catalogueUsesProvidedDurationOnly(){
  fun label(seconds:Int)=DubWork(JSONObject().put("id","x").put("roleCount",2).put("duration",seconds),null,false,0,null,null).formatLabel
  assertEquals("2인극 · 3:15",label(195))
  assertEquals("2인극",label(0))
 }

 @Test fun bulkDeletionRetainsFailuresAndContinues()=runBlocking{
  val works=listOf("a","b","c").map{ReferenceWork(dubbing=JSONObject().put("id",it))}
  val selected=works.map{it.id}.toMutableSet()
  val calls=mutableListOf<String>()
  deleteSelectedWorks(works,{work->
   calls.add(work.id)
   if(work.id=="dubbing-b")throw java.io.IOException()
  },{selected.remove(it)})
  assertEquals(works.map{it.id},calls)
  assertEquals(setOf("dubbing-b"),selected)
 }
}
