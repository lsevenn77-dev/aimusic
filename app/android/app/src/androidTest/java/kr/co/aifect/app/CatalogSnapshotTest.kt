package kr.co.aifect.app

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import java.io.File

class CatalogSnapshotTest {
 private val context=InstrumentationRegistry.getInstrumentation().targetContext
 private val path="/api/catalog?section=tracks&chart=top"
 private val first=NativeReadScope("https://aifect.co.kr","session-a")
 private val data="""{"tracks":[{"id":"snapshot-track","title":"기억한 곡"}]}"""
 @Before @After fun clear(){CatalogSnapshot.clear(context)}
 @Test fun diskSnapshotSurvivesReaderRecreationButNotAnotherSessionOrHost()=runBlocking{
  CatalogSnapshot.save(context,first,path,data,CatalogSnapshot.revision){true}
  assertNotNull(CatalogSnapshot.read(context,first.copy(),path,CatalogSnapshot.revision){true})
  assertNull(CatalogSnapshot.read(context,first.copy(session="session-b"),path,CatalogSnapshot.revision){true})
  assertNull(CatalogSnapshot.read(context,first.copy(endpoint="https://another.test"),path,CatalogSnapshot.revision){true})
  assertNull(CatalogSnapshot.read(context,first,"/api/me",CatalogSnapshot.revision){true})
 }
 @Test fun invalidationRejectsAnEarlierResponseAndAlreadyStoredData()=runBlocking{
  val before=CatalogSnapshot.revision
  CatalogSnapshot.save(context,first,path,data,before){true}
  CatalogSnapshot.clear(context)
  CatalogSnapshot.save(context,first,path,data,before){true}
  assertNull(CatalogSnapshot.read(context,first,path,CatalogSnapshot.revision){true})
  CatalogSnapshot.save(context,first,path,data,CatalogSnapshot.revision){false}
  assertNull(CatalogSnapshot.read(context,first,path,CatalogSnapshot.revision){true})
 }
 @Test fun expiredOrCorruptDiskDataIsIgnored()=runBlocking{
  CatalogSnapshot.save(context,first,path,data,CatalogSnapshot.revision){true}
  val file=File(context.cacheDir,"home-catalog-v2-chart.json")
  val stored=JSONObject(file.readText()).put("savedAt",System.currentTimeMillis()-86_400_001L)
  file.writeText(stored.toString())
  assertNull(CatalogSnapshot.read(context,first,path,CatalogSnapshot.revision){true})
  file.writeText("{broken")
  assertNull(CatalogSnapshot.read(context,first,path,CatalogSnapshot.revision){true})
 }
 @Test fun listeningKeepsTheSnapshotWhileModerationAndDeletionInvalidateIt(){
  assertFalse(CatalogSnapshot.invalidatesOnMutation("/api/playback/track-id","POST"))
  assertFalse(CatalogSnapshot.invalidatesOnMutation("/api/listens/listen-id","PATCH"))
  assertTrue(CatalogSnapshot.invalidatesOnMutation("/api/blocks/user-id","POST"))
  assertTrue(CatalogSnapshot.invalidatesOnMutation("/api/uploads/track-id","DELETE"))
  assertTrue(CatalogSnapshot.invalidatesOnMutation("/api/auth/logout","POST"))
 }
}

