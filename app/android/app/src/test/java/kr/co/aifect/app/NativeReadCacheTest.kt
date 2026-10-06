package kr.co.aifect.app

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger

class NativeReadCacheTest {
 @Test fun onlyChatWritesAndReadReceiptsKeepBrowseCaches(){
  listOf("POST" to "/api/dm/peer","PATCH" to "/api/dm/peer","POST" to "/api/crews/crew/messages").forEach{(method,path)->assertFalse("$method $path",NativeReadPolicy.invalidatesOnMutation(path,method))}
  listOf("DELETE" to "/api/dm/peer","PUT" to "/api/dm/peer","PATCH" to "/api/crews/crew/messages","POST" to "/api/crews/crew/join","POST" to "/api/crews/crew/leave","PATCH" to "/api/crews/crew/members/person","PATCH" to "/api/crews/crew","PUT" to "/api/producers/person/follow","PUT" to "/api/me/profile","POST" to "/api/auth/logout","POST" to "/api/dm/peer/other").forEach{(method,path)->assertTrue("$method $path",NativeReadPolicy.invalidatesOnMutation(path,method))}
  assertFalse(NativeReadPolicy.invalidatesOnMutation("/api/library","GET"))
 }
 private val owner=NativeReadScope("https://one.example","session-a")
 private val path="/api/catalog?section=tracks"
 private fun cache(now:()->Long={0L},maxEntries:Int=64,maxBytes:Int=1024)=NativeReadCache<String>(copy={it},bytes={it.length},now=now,maxEntries=maxEntries,maxBytes=maxBytes)
 private suspend fun <T> cancelled(task:Deferred<T>){try{task.await();fail("Invalidated read must not return a late result")}catch(expected:CancellationException){}}

 @Test fun exactAllowlistExcludesActionsAndPermissions(){
  val allowed=listOf("/api/catalog?section=tracks","/api/search?q=music","/api/community?following=1","/api/duets","/api/library","/api/history","/api/follows","/api/me/profile","/api/producers/p","/api/artists/a","/api/followers/u","/api/playlists?sort=popular","/api/playlists/p","/api/cover-rankings?period=week","/api/tracks/t/covers")
  allowed.forEach{assertNotNull(it,NativeReadPolicy.ttlMillis(it))}
  val excluded=listOf("/api/me","/api/me?state=1","/api/gold","/api/gifts","/api/rewards","/api/payouts","/api/auth/login","/api/me/profile/image","/api/me/profile/check?name=x","/api/playback/t","/api/tracks/t","/api/tracks/t/comments","/api/tracks/t/lyrics/line?at=0","/api/karaoke","/api/karaoke/t","/api/duets/t","/api/playlists/p/save","/api/playlists/p/order","/api/playlists/p/tracks/t","/api/crews","/api/crews/c/messages","/api/dm","/api/dm/p","/api/chat/events","/api/studio","/media/t","//api/catalog","/api/producers/../me","/api/catalog#other")
  excluded.forEach{assertNull(it,NativeReadPolicy.ttlMillis(it))}
 }

 @Test fun sessionAndEndpointHaveIndependentResults()=runBlocking {
  val cache=cache();var calls=0
  suspend fun read(scope:NativeReadScope)=cache.read(scope,path){"response-${++calls}"}
  assertEquals("response-1",read(owner))
  assertEquals("response-1",read(owner))
  assertEquals("response-2",read(owner.copy(session="session-b")))
  assertEquals("response-3",read(owner.copy(endpoint="https://two.example")))
  assertEquals("response-4",read(owner.copy(session="")))
  assertEquals("response-1",cache.peek(owner,path))
  assertEquals(4,calls)
 }

 @Test fun ttlFreshReadAndBoundedStalePeekAreSeparate()=runBlocking {
  var clock=0L;var calls=0;val cache=cache(now={clock})
  suspend fun read(fresh:Boolean=false)=cache.read(owner,path,fresh){"v${++calls}"}
  assertEquals("v1",read());clock=19_999
  assertEquals("v1",read());clock=20_000
  assertEquals("v1",cache.peek(owner,path))
  assertEquals("v2",read());assertEquals("v3",read(fresh=true))
  clock=110_001
  assertNull(cache.peek(owner,path));assertEquals(3,calls)
 }

 @Test fun storedAndReturnedMutableValuesAreIndependent()=runBlocking {
  val cache=NativeReadCache<MutableList<String>>(copy={it.toMutableList()},bytes={it.joinToString().length},now={0L})
  val source=mutableListOf("saved")
  val first=cache.read(owner,path){source};source[0]="mutated source";first[0]="mutated consumer"
  val peek=cache.peek(owner,path)!!;peek[0]="mutated preview"
  assertEquals(listOf("saved"),cache.read(owner,path){error("Expected cache hit")})
  assertEquals(listOf("saved"),cache.peek(owner,path))
 }

 @Test fun invalidationRejectsLateResponseWithoutOverwritingNewRead()=runBlocking {
  val cache=cache();val started=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();val finished=CompletableDeferred<Unit>()
  val old=async(start=CoroutineStart.UNDISPATCHED){cache.read(owner,path){started.complete(Unit);withContext(NonCancellable){release.await()};finished.complete(Unit);"old"}}
  withTimeout(5000){started.await()};val before=cache.generation;cache.invalidate()
  assertTrue(cache.generation>before);assertNull(cache.peek(owner,path))
  assertEquals("new",cache.read(owner,path){"new"});release.complete(Unit)
  withTimeout(5000){finished.await()};cancelled(old)
  assertEquals("new",cache.peek(owner,path))
 }

 @Test fun accountChangeRejectsResultEvenWithoutExplicitInvalidation()=runBlocking {
  val cache=cache();val started=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();var sameAccount=true
  val old=async(start=CoroutineStart.UNDISPATCHED){cache.read(owner,path,current={sameAccount}){started.complete(Unit);release.await();"private"}}
  withTimeout(5000){started.await()};sameAccount=false;release.complete(Unit);cancelled(old)
  assertNull(cache.peek(owner,path))
 }

 @Test fun concurrentReadersShareGetAndOneCancellationKeepsOtherReader()=runBlocking {
  val cache=cache();val calls=AtomicInteger();val started=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>()
  suspend fun load():String{calls.incrementAndGet();started.complete(Unit);release.await();return "shared"}
  val first=async(start=CoroutineStart.UNDISPATCHED){cache.read(owner,path){load()}}
  withTimeout(5000){started.await()}
  val second=async(start=CoroutineStart.UNDISPATCHED){cache.read(owner,path){load()}}
  first.cancelAndJoin();release.complete(Unit)
  assertEquals("shared",withTimeout(5000){second.await()});assertEquals(1,calls.get())
  assertEquals("shared",cache.peek(owner,path))
 }

 @Test fun lastReaderCancellationCancelsTransportAndAllowsNextRead()=runBlocking {
  val cache=cache();val started=CompletableDeferred<Unit>();val stopped=CompletableDeferred<Unit>()
  val first=async(start=CoroutineStart.UNDISPATCHED){cache.read(owner,path){try{started.complete(Unit);awaitCancellation()}finally{stopped.complete(Unit)}}}
  withTimeout(5000){started.await()};first.cancelAndJoin();withTimeout(5000){stopped.await()}
  assertNull(cache.peek(owner,path));assertEquals("retry",cache.read(owner,path){"retry"})
 }

 @Test fun failedFreshReadEvictsOldPreviewAndDoesNotFallback()=runBlocking {
  val cache=cache();assertEquals("old",cache.read(owner,path){"old"})
  try{cache.read(owner,path,fresh=true){throw IOException("404")};fail("Must surface network failure")}
  catch(expected:IOException){assertEquals("404",expected.message)}
  assertNull(cache.peek(owner,path));assertEquals("new",cache.read(owner,path){"new"})
 }

 @Test fun lruAndByteLimitsBoundMemory()=runBlocking {
  val cache=cache(maxEntries=2,maxBytes=5)
  val first="/api/search?q=1";val second="/api/search?q=2";val third="/api/search?q=3"
  cache.read(owner,first){"aa"};cache.read(owner,second){"bb"};cache.peek(owner,first)
  cache.read(owner,third){"cc"}
  assertEquals("aa",cache.peek(owner,first));assertNull(cache.peek(owner,second));assertEquals("cc",cache.peek(owner,third))
  assertEquals("too large",cache.read(owner,path){"too large"});assertNull(cache.peek(owner,path))
 }

 @Test fun excludedPathsAlwaysExecuteAndCannotBePeeked()=runBlocking {
  val cache=cache();var calls=0;val action="/api/tracks/private"
  assertEquals("v1",cache.read(owner,action){"v${++calls}"})
  assertEquals("v2",cache.read(owner,action){"v${++calls}"})
  assertNull(cache.peek(owner,action));assertEquals(2,calls)
 }
}
