package kr.co.aifect.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object Endpoint {
 var origin = "https://aifect.co.kr"
    private set
 fun configureTest(value: String?) {
  if (BuildConfig.DEBUG && BuildConfig.APPLICATION_ID.endsWith(".test") && value != null &&
      Regex("http://(127\\.0\\.0\\.1|localhost):[0-9]{2,5}").matches(value)) origin=value
 }
 fun url(path: String): String {
  require(path.startsWith("/") && !path.startsWith("//") && !path.contains(".."))
  return origin + path
 }
}
class ApiException(val status: Int, message: String): IOException(message)
fun JSONArray?.objects(): List<JSONObject> = if(this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
fun JSONObject.tracks(key: String = "tracks") = optJSONArray(key).objects().map { Song(it) }
data class MusicCollection(val title:String,val caption:String,val tracks:List<Song>,val path:String?=null,val resultKey:String="tracks")
data class Song(val raw: JSONObject) {
 val id=raw.optString("id")
 val title=raw.optString("title","제목 없음")
 val artist=raw.optString("artist")
 val producer=raw.optString("producer")
 val producerId=raw.optString("producer_id")
 val producerImageVersion=raw.optString("producer_image_version")
 val producerProfile get()=payload("id" to producerId,"name" to producer,"profile_kind" to "producer","image_version" to producerImageVersion)
 val genre=raw.optString("genre")
 val description=raw.optString("description")
 val duration=raw.optDouble("duration",0.0)
 val likes=raw.optInt("likes")
 val comments=raw.optInt("comments")
 val plays=raw.optInt("plays")
 val cover=raw.optString("kind")=="cover"
 val hasAiArtist get() = !cover && if(raw.has("has_ai_artist")) raw.optInt("has_ai_artist") == 1 else artist.trim().isNotEmpty() && artist.trim() !in setOf("없음","미등록","-","선택 안함","선택안함")
 val credit get() = if(cover&&raw.optString("cover_mode")=="duet"&&raw.optString("duet_partner_id").isNotBlank()) "${raw.optString("duet_partner")} & $producer" else (if(hasAiArtist) artist else producer).ifBlank { "AIFECT" }
 val art: String? get() {
  val own=raw.optInt("has_cover")>0
  val original=cover && raw.optInt("original_has_cover")>0
  return if(own || original) Endpoint.url("/media/${if(own) id else raw.optString("original_id")}/cover?v=${if(own) raw.optString("cover_version") else raw.optString("original_cover_version")}") else null
 }
}
class NativeApi(private val context: Context) {
 @Volatile private var googleBinding=""
 private val sessionPreferences=context.getSharedPreferences("native_session",0)
 private val reads=NativeReadCache<String>(copy={it},bytes={it.toByteArray(Charsets.UTF_8).size})
 // The encrypted vault changes whenever the account/session changes. Reading its
 // in-memory preference avoids a Keystore decrypt for each immediate UI snapshot.
 private fun readScope()=NativeReadScope(Endpoint.origin,sessionPreferences.getString("vault","")?:"")
 private val scopeLock=Any()
 private var observedScope=readScope()
 private fun synchronizeScope():NativeReadScope {
  val current=readScope()
  val changed=synchronized(scopeLock){if(current!=observedScope){observedScope=current;true}else false}
  if(changed)reads.invalidate()
  return current
 }
 val readRevision:Long get(){synchronizeScope();return reads.generation}
 fun invalidateReads(){synchronized(reads){reads.invalidate()}}
 private fun readFailure(path:String,scope:NativeReadScope,revision:Long,error:ApiException){
  // Compare and invalidate under the same monitor as mutations. A late permission
  // error from a superseded read must not cancel the next account's active reads.
  synchronized(reads){
   if(readScope()!=scope||reads.generation!=revision)throw CancellationException("A newer account or action replaced this read")
   if(error.status in listOf(401,403))reads.invalidate()else if(error.status==404)reads.evict(scope,path)
  }
 }
 fun peek(path:String):JSONObject?=reads.peek(synchronizeScope(),path)?.let{runCatching{JSONObject(it)}.getOrNull()}
 fun clearGoogleBinding(){googleBinding="";invalidateReads()}
 val client=OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(25,TimeUnit.SECONDS)
  .followRedirects(false).followSslRedirects(false)
  .addInterceptor { chain ->
   val r=chain.request()
   if(!r.url.toString().startsWith(Endpoint.origin+"/")) throw IOException("허용되지 않은 서버 주소예요.")
   val jar=listOf(NativeSession.cookie(context),googleBinding.takeIf {r.url.encodedPath.startsWith("/api/auth/google/")}?:"").filter{it.isNotBlank()}.joinToString("; ")
   chain.proceed(r.newBuilder().header("Origin",Endpoint.origin).header("Cookie",jar)
    .header("User-Agent","AIFECT-Android/${BuildConfig.VERSION_NAME}").build())
  }.build()
 private fun request(path:String,method:String,data:JSONObject?):Request {
  val body=if(method in listOf("GET","HEAD")) null else (data?.toString()?:"{}").toRequestBody("application/json; charset=utf-8".toMediaType())
  return Request.Builder().url(Endpoint.url(path)).method(method,body).build()
 }
 fun blocking(path:String,method:String="GET",data:JSONObject?=null):JSONObject {
  val mutation=method !in listOf("GET","HEAD")
  val invalidate=NativeReadPolicy.invalidatesOnMutation(path,method)
  val scope=synchronizeScope()
  if(invalidate)invalidateReads()
  val revision=reads.generation
  try{return client.newCall(request(path,method,data)).execute().use{decode(path,it)}}
  catch(e:ApiException){if(!mutation)readFailure(path,scope,revision,e)else if(e.status in listOf(401,403))invalidateReads();throw e}
  finally{if(invalidate)invalidateReads()}
 }
 private fun decode(path:String,r:Response):JSONObject {
   val source=r.body?.source();source?.request(2_000_001L)
   if((source?.buffer?.size?:0)>2_000_000L)throw IOException("서버 응답이 너무 커요.")
   val text=source?.readUtf8()
   val result=try { JSONObject(text?:"{}") }catch(e:Exception){throw IOException("서버 응답을 읽지 못했어요. 잠시 후 다시 시도해주세요.")}
   if(!r.isSuccessful)throw ApiException(r.code,result.optString("error","요청을 완료하지 못했어요."))
   if(path.startsWith("/api/auth/google/"))r.headers.values("Set-Cookie").firstOrNull{it.startsWith("aifect_google_oauth=")}?.let {
    googleBinding=it.substringBefore(";").takeUnless{it=="aifect_google_oauth="}?:""
   }
   r.headers.values("Set-Cookie").firstOrNull { it.startsWith("aifect_session=") }?.let {
    val cookie=it.substringBefore(";").takeUnless { it=="aifect_session=" }?:""
    if(NativeSession.cookie(context)!=cookie){NativeSession.put(context,"cookie",cookie);invalidateReads()}
   }
   return result
 }
 suspend fun profileImage(uri:android.net.Uri)=withContext(Dispatchers.IO){
  invalidateReads()
  try{
  val type=context.contentResolver.getType(uri)?:"image/jpeg"
  require(type in listOf("image/jpeg","image/png","image/webp")){"JPG·PNG·WebP 이미지를 선택해주세요."}
  val bytes=context.contentResolver.openInputStream(uri)?.use { input->
   val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);val limit=5*1024*1024+1
   while(out.size()<limit){val count=input.read(buffer,0,minOf(buffer.size,limit-out.size()));if(count<0)break;if(count>0)out.write(buffer,0,count)}
   out.toByteArray()
  }?:throw IOException("사진을 열 수 없어요.")
  require(bytes.size<=5*1024*1024){"사진은 5MB 이하로 선택해주세요."}
  client.newCall(Request.Builder().url(Endpoint.url("/api/me/profile/image")).put(bytes.toRequestBody(type.toMediaType())).build()).execute().use{r->
   if(!r.isSuccessful)throw IOException(runCatching{JSONObject(r.body?.string()?:"{}").optString("error")}.getOrDefault("사진을 저장하지 못했어요."))
  }
  }finally{invalidateReads()}
 }
 suspend fun call(path:String,method:String="GET",data:JSONObject?=null,fresh:Boolean=false):JSONObject {
  val mutation=method !in listOf("GET","HEAD")
  val invalidate=NativeReadPolicy.invalidatesOnMutation(path,method)
  val scope=synchronizeScope()
  if(invalidate)invalidateReads()
  val revision=reads.generation
  try{
   if(method=="GET"&&NativeReadPolicy.ttlMillis(path)!=null){
    val serialized=reads.read(scope,path,fresh,current={readScope()==scope}){network(path,method,data).toString()}
    return JSONObject(serialized)
   }
   return network(path,method,data)
  }catch(e:ApiException){
   if(!mutation)readFailure(path,scope,revision,e)else if(e.status in listOf(401,403))invalidateReads()
   throw e
  }finally{if(invalidate)invalidateReads()}
 }
 private suspend fun network(path:String,method:String,data:JSONObject?):JSONObject=suspendCancellableCoroutine{continuation->
  val call=client.newCall(request(path,method,data))
  continuation.invokeOnCancellation{call.cancel()}
  call.enqueue(object:Callback{
   override fun onFailure(call:Call,e:IOException){continuation.resumeWith(Result.failure(e))}
   override fun onResponse(call:Call,response:Response){
    val result=runCatching{response.use{decode(path,it)}}
    continuation.resumeWith(result)
   }
  })
 }
}
fun payload(vararg values: Pair<String,Any?>)=JSONObject().apply { values.forEach { put(it.first,it.second ?: JSONObject.NULL) } }
fun timeLabel(ms:Long):String { val s=(ms/1000).coerceAtLeast(0);return "%d:%02d".format(s/60,s%60) }
