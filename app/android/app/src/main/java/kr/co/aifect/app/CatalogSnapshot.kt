package kr.co.aifect.app

import android.content.Context
import android.util.AtomicFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** Display-only home lists, bound to the exact endpoint/session. Never cache authorization. */
internal object CatalogSnapshot {
 private val files=mapOf("/api/catalog?section=tracks&chart=top" to "chart","/api/catalog?section=tracks&limit=40" to "latest")
 private val lock=Any()
 private var generation=0L
 val revision:Long get()=synchronized(lock){generation}
 fun accepts(path:String)=files.containsKey(path)
 private fun file(c:Context,path:String)=AtomicFile(File(c.cacheDir,"home-catalog-v2-"+files.getValue(path)+".json"))
 private fun scopeKey(scope:NativeReadScope):String {
  val digest=MessageDigest.getInstance("SHA-256").digest((scope.endpoint+"\n"+scope.session).toByteArray(Charsets.UTF_8))
  val hex="0123456789abcdef"
  return buildString(digest.size*2){digest.forEach{val byte=it.toInt() and 255;append(hex[byte ushr 4]);append(hex[byte and 15])}}
 }
 fun invalidatesOnMutation(path:String,method:String):Boolean {
  if(!NativeReadPolicy.invalidatesOnMutation(path,method))return false
  val base=path.substringBefore('?')
  // Listening does not change which tracks the account is allowed to see.
  if(method=="POST"&&Regex("/api/playback/[A-Za-z0-9_-]+").matches(base))return false
  if(method=="PATCH"&&Regex("/api/listens/[A-Za-z0-9_-]+").matches(base))return false
  return true
 }
 fun clear(c:Context)=synchronized(lock){
  generation++
  files.keys.forEach{path->runCatching{file(c,path).delete()}}
 }
 suspend fun save(c:Context,scope:NativeReadScope,path:String,data:String,revision:Long,valid:()->Boolean)=withContext(Dispatchers.IO){
  if(!accepts(path)||data.toByteArray(Charsets.UTF_8).size>384*1024)return@withContext
  synchronized(lock){
   if(generation!=revision||!valid())return@synchronized
   runCatching {
    val payload=JSONObject(data)
    if(payload.optJSONArray("tracks")==null)return@runCatching
    val bytes=JSONObject().put("scope",scopeKey(scope)).put("savedAt",System.currentTimeMillis()).put("data",payload).toString().toByteArray(Charsets.UTF_8)
    val f=file(c,path);val output=f.startWrite()
    try{output.write(bytes);f.finishWrite(output)}catch(e:Exception){f.failWrite(output);throw e}
   }
   Unit
  }
 }
 suspend fun read(c:Context,scope:NativeReadScope,path:String,revision:Long,valid:()->Boolean):String?=
  withContext(Dispatchers.IO){readObject(c,scope,path,revision,valid)?.toString()}
 suspend fun readObject(c:Context,scope:NativeReadScope,path:String,revision:Long,valid:()->Boolean):JSONObject?=withContext(Dispatchers.IO){
  if(!accepts(path))return@withContext null
  synchronized(lock){
   if(generation!=revision||!valid())return@synchronized null
   runCatching {
    val f=file(c,path)
    if(f.baseFile.length()>1024*1024)return@runCatching null
    val saved=JSONObject(String(f.readFully(),Charsets.UTF_8))
    if(saved.optString("scope")!=scopeKey(scope)||System.currentTimeMillis()-saved.optLong("savedAt") !in 0..86_400_000L)return@runCatching null
    saved.optJSONObject("data")?.takeIf{it.optJSONArray("tracks")!=null}
   }.getOrNull()
  }
 }
}
