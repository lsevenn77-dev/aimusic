package kr.co.aifect.app

import android.content.Context
import android.util.AtomicFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

internal data class NativeDmThread(
 val peer:JSONObject?=null,
 val messages:List<JSONObject> = emptyList(),
 val earlier:Boolean=false,
 val draft:String="",
 val updated:Long=0L,
 // A confirmed POST can be newer than unseen incoming messages. Persist only
 // the cursor advanced by history reads, never the largest cached message ID.
 val readSequence:Long=0L
)
internal data class NativeDmSnapshot(
 val conversations:List<JSONObject> = emptyList(),
 val threads:Map<String,NativeDmThread> = emptyMap()
)

/** Account-scoped device history. Disk access always stays on Dispatchers.IO. */
internal object NativeChatCache {
 private const val VERSION=1
 private const val MAX_BYTES=4*1024*1024
 private const val MAX_THREADS=30
 private const val MAX_MESSAGES=150
 private val memory=ConcurrentHashMap<String,NativeDmSnapshot>()
 private val io=Mutex()

 private fun key(context:Context,accountId:String)=context.packageName+"\n"+Endpoint.origin+"\n"+accountId
 private fun file(context:Context,accountId:String):AtomicFile {
  val name=MessageDigest.getInstance("SHA-256").digest((Endpoint.origin+"\n"+accountId).toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
  return AtomicFile(File(File(context.noBackupFilesDir,"dm-history"),"$name.json"))
 }
 // Memory-only: useful on the very first frame when a sheet is reopened.
 fun peek(context:Context,accountId:String)=memory[key(context,accountId)]
 // Test/process-memory eviction does not remove the durable device history.
 internal fun forgetMemory(context:Context,accountId:String){memory.remove(key(context,accountId))}

 suspend fun read(context:Context,accountId:String):NativeDmSnapshot=withContext(Dispatchers.IO){
  io.withLock{readLocked(context,accountId)}
 }
 private fun readLocked(context:Context,accountId:String):NativeDmSnapshot {
  val key=key(context,accountId)
  memory[key]?.let{return it}
  val snapshot=runCatching{
   val bytes=file(context,accountId).openRead().use{input->
    val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
    while(out.size()<=MAX_BYTES){val count=input.read(buffer,0,minOf(buffer.size,MAX_BYTES+1-out.size()));if(count<0)break;out.write(buffer,0,count)}
    require(out.size()<=MAX_BYTES);out.toByteArray()
   }
   val json=JSONObject(String(bytes,Charsets.UTF_8))
   require(json.optInt("version")==VERSION&&json.optString("account")==accountId&&json.optString("origin")==Endpoint.origin)
   val threads=json.optJSONArray("threads").objects().take(MAX_THREADS).associate{entry->
    entry.getString("id") to NativeDmThread(
     peer=entry.optJSONObject("peer"),
     // A process restart cannot know whether an interrupted POST completed. Keep its
     // request id so an explicit retry is idempotent instead of sending twice.
     messages=entry.optJSONArray("messages").objects().takeLast(MAX_MESSAGES).map{message->
      if(message.optString("delivery")=="sending")JSONObject(message.toString()).put("delivery","failed")else message
     },
     earlier=entry.optBoolean("earlier"),draft=entry.optString("draft").take(2000),updated=entry.optLong("updated"),readSequence=entry.optLong("read_sequence").coerceAtLeast(0L)
    )
   }
   NativeDmSnapshot(json.optJSONArray("conversations").objects().take(100),threads)
  }.getOrDefault(NativeDmSnapshot())
  memory[key]=snapshot
  return snapshot
 }
 suspend fun saveConversations(context:Context,accountId:String,conversations:List<JSONObject>)=withContext(Dispatchers.IO){
  io.withLock{val old=readLocked(context,accountId);writeLocked(context,accountId,old.copy(conversations=conversations.take(100).map{JSONObject(it.toString())}))}
 }
 suspend fun saveThread(context:Context,accountId:String,peerId:String,peer:JSONObject?,messages:List<JSONObject>,earlier:Boolean,draft:String?=null,readSequence:Long?=null)=withContext(Dispatchers.IO){
  io.withLock{
   val old=readLocked(context,accountId);val previous=old.threads[peerId]?:NativeDmThread()
   val merged=mergeChat(previous.messages,messages.map{JSONObject(it.toString())})
   val thread=NativeDmThread(peer?.let{JSONObject(it.toString())}?:previous.peer,merged.takeLast(MAX_MESSAGES),earlier||merged.size>MAX_MESSAGES,draft?.take(2000)?:previous.draft,System.currentTimeMillis(),maxOf(previous.readSequence,readSequence?:0L))
   val last=thread.messages.lastOrNull()
   val conversations=if(last!=null&&thread.peer!=null){
    val person=JSONObject((old.conversations.find{it.optString("id")==peerId}?:thread.peer).toString())
     .put("last_message",last.optString("body")).put("updated",last.optLong("created"))
    listOf(person)+old.conversations.filterNot{it.optString("id")==peerId}
   }else old.conversations
   writeLocked(context,accountId,NativeDmSnapshot(conversations,old.threads+(peerId to thread)))
  }
 }
 suspend fun saveDraft(context:Context,accountId:String,peerId:String,draft:String)=withContext(Dispatchers.IO){
  io.withLock{
   val old=readLocked(context,accountId);val previous=old.threads[peerId]?:NativeDmThread()
   if(previous.draft!=draft)writeLocked(context,accountId,old.copy(threads=old.threads+(peerId to previous.copy(draft=draft.take(2000),updated=System.currentTimeMillis()))))
  }
 }
 suspend fun clear(context:Context,accountId:String,peerId:String?=null)=withContext(Dispatchers.IO){io.withLock{val old=readLocked(context,accountId);writeLocked(context,accountId,if(peerId==null)NativeDmSnapshot()else old.copy(conversations=old.conversations.filterNot{it.optString("id")==peerId},threads=old.threads-peerId))}}
 suspend fun clearThrough(context:Context,accountId:String,peerId:String,sequence:Long)=withContext(Dispatchers.IO){if(sequence>0)io.withLock{val old=readLocked(context,accountId);val thread=old.threads[peerId]?:return@withLock;val kept=thread.messages.filter{it.optLong("sequence")==0L||it.optLong("sequence")>sequence};if(kept.size!=thread.messages.size)writeLocked(context,accountId,old.copy(threads=old.threads+(peerId to thread.copy(messages=kept))))}}
 private fun encode(accountId:String,snapshot:NativeDmSnapshot)=JSONObject().put("version",VERSION).put("account",accountId).put("origin",Endpoint.origin)
  .put("conversations",JSONArray(snapshot.conversations.take(100))).put("threads",JSONArray().apply{
   snapshot.threads.forEach{(id,thread)->put(JSONObject().put("id",id).put("peer",thread.peer?:JSONObject.NULL).put("messages",JSONArray(thread.messages)).put("earlier",thread.earlier).put("draft",thread.draft).put("updated",thread.updated).put("read_sequence",thread.readSequence))}
  }).toString().toByteArray(Charsets.UTF_8)
 private fun writeLocked(context:Context,accountId:String,snapshot:NativeDmSnapshot){
  var bounded=snapshot.copy(threads=snapshot.threads.entries.sortedByDescending{it.value.updated}.take(MAX_THREADS).associate{it.key to it.value})
  var bytes=encode(accountId,bounded)
  // Drop least recently visited cached threads if long messages reach the byte cap.
  while(bytes.size>MAX_BYTES&&bounded.threads.isNotEmpty()){
   bounded=bounded.copy(threads=bounded.threads.entries.toList().dropLast(1).associate{it.key to it.value});bytes=encode(accountId,bounded)
  }
  if(bytes.size>MAX_BYTES)bounded=bounded.copy(conversations=emptyList()).also{bytes=encode(accountId,it)}
  memory[key(context,accountId)]=bounded
  var target:AtomicFile?=null
  var output:java.io.FileOutputStream?=null
  // A cache write failure must never turn a successful message into a failed send.
  try{val current=file(context,accountId);target=current;val stream=current.startWrite();output=stream;stream.write(bytes);current.finishWrite(stream)}catch(e:Exception){output?.let{target?.failWrite(it)}}
 }
}
