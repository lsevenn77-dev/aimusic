package kr.co.aifect.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

/** Exact read allowlist: action, authorization and media endpoints never enter it. */
internal object NativeReadPolicy {
 fun invalidatesOnMutation(path:String,method:String):Boolean {
  if(method in setOf("GET","HEAD"))return false
  val base=path.substringBefore('?')
  if(base.startsWith("/api/push/"))return false
  // Chat bodies/read receipts do not change catalog, follows or playlist access.
  // Join/leave/moderation and every other mutation retain full invalidation.
  if(method in setOf("POST","PATCH")&&Regex("/api/dm/[A-Za-z0-9_-]+").matches(base))return false
  if(method=="POST"&&Regex("/api/crews/[A-Za-z0-9_-]+/messages").matches(base))return false
  return true
 }
 fun ttlMillis(path:String):Long? {
  if(!path.startsWith("/api/")||path.startsWith("//")||path.contains("..")||path.contains('#'))return null
  val base=path.substringBefore('?')
  return when {
   base in setOf("/api/library","/api/history","/api/follows","/api/duets","/api/me/profile")->10_000L
   base in setOf("/api/catalog","/api/search","/api/community","/api/playlists","/api/cover-rankings")->20_000L
   Regex("/api/(producers|artists|followers)/[A-Za-z0-9_-]+").matches(base)->20_000L
   Regex("/api/playlists/[A-Za-z0-9_-]+").matches(base)->20_000L
   Regex("/api/tracks/[A-Za-z0-9_-]+/covers").matches(base)->20_000L
   else->null
  }
 }
}

internal data class NativeReadScope(val endpoint:String,val session:String)

/** Bounded memory cache with shared GETs and cancellation when their last reader leaves. */
internal class NativeReadCache<V:Any>(
 private val copy:(V)->V,
 private val bytes:(V)->Int,
 private val now:()->Long={System.nanoTime()/1_000_000},
 private val maxEntries:Int=64,
 private val maxBytes:Int=8*1024*1024,
 private val peekRetention:Long=90_000L
) {
 private data class Key(val scope:NativeReadScope,val path:String)
 private data class Entry<V>(val value:V,val at:Long,val bytes:Int)
 private class Flight<V>(val revision:Long){
  val result=CompletableDeferred<V>()
  var readers=0
  var job:Job?=null
 }
 private val lock=Any()
 private val entries=LinkedHashMap<Key,Entry<V>>(16,.75f,true)
 private val flights=mutableMapOf<Key,Flight<V>>()
 private val workers=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 private var revision=0L
 private var totalBytes=0
 val generation:Long get()=synchronized(lock){revision}

 /** Only for painting prior read data; call(..., fresh=true) still verifies the server. */
 fun peek(scope:NativeReadScope,path:String):V? {
  if(NativeReadPolicy.ttlMillis(path)==null)return null
  return synchronized(lock){
   val key=Key(scope,path);val entry=entries[key]?:return@synchronized null
   if(now()-entry.at>peekRetention){removeLocked(key);null}else copy(entry.value)
  }
 }
 fun invalidate(){
  val pending=synchronized(lock){revision++;entries.clear();totalBytes=0;flights.values.toList().also{flights.clear()}}
  pending.forEach{it.result.completeExceptionally(CancellationException("Read invalidated"));it.job?.cancel()}
 }
 fun evict(scope:NativeReadScope,path:String){synchronized(lock){removeLocked(Key(scope,path))}}
 private fun removeLocked(key:Key){entries.remove(key)?.let{totalBytes-=it.bytes}}
 private fun stale()=CancellationException("Account or read revision changed")

 suspend fun read(scope:NativeReadScope,path:String,fresh:Boolean=false,current:()->Boolean={true},load:suspend()->V):V {
  currentCoroutineContext().ensureActive()
  if(!current())throw stale()
  val ttl=NativeReadPolicy.ttlMillis(path)
  if(ttl==null){
   val before=synchronized(lock){revision};val value=load();currentCoroutineContext().ensureActive()
   if(!current()||synchronized(lock){revision!=before})throw stale()
   return copy(value)
  }
  val key=Key(scope,path)
  var hit:V?=null
  var hitRevision=0L
  val flight=synchronized(lock){
   val saved=entries[key]
   if(!fresh&&saved!=null&&now()-saved.at<ttl){hit=copy(saved.value);hitRevision=revision;null}
   else {
    val shared=flights[key]?.takeIf{!it.result.isCompleted}?:Flight<V>(revision).also{created->
     flights[key]=created
     created.job=workers.launch(start=CoroutineStart.LAZY){
      try{
       val value=load();currentCoroutineContext().ensureActive()
       synchronized(lock){
        if(flights[key]!==created||revision!=created.revision||!current())throw stale()
        val stored=copy(value);val weight=bytes(stored)
        if(weight in 0..maxBytes){
         removeLocked(key);entries[key]=Entry(stored,now(),weight);totalBytes+=weight
         while(entries.size>maxEntries||totalBytes>maxBytes)removeLocked(entries.keys.first())
        }else removeLocked(key)
        created.result.complete(copy(value))
       }
      }catch(e:Exception){
       synchronized(lock){if(flights[key]===created)removeLocked(key)}
       created.result.completeExceptionally(e)
      }finally{synchronized(lock){if(flights[key]===created)flights.remove(key)}}
     }
    }
    shared.readers++;shared
   }
  }
  hit?.let{if(!current()||synchronized(lock){revision!=hitRevision})throw stale();return it}
  val pending=flight!!
  pending.job?.start()
  try{
   val value=pending.result.await();currentCoroutineContext().ensureActive()
   if(!current()||synchronized(lock){revision!=pending.revision})throw stale()
   return copy(value)
  }finally{
   val cancel=synchronized(lock){
    pending.readers--
    if(pending.readers==0&&!pending.result.isCompleted){if(flights[key]===pending)flights.remove(key);true}else false
   }
   if(cancel){pending.result.cancel();pending.job?.cancel()}
  }
 }
}
