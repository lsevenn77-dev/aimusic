package kr.co.aifect.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
 val genre=raw.optString("genre")
 val description=raw.optString("description")
 val duration=raw.optDouble("duration",0.0)
 val likes=raw.optInt("likes")
 val comments=raw.optInt("comments")
 val plays=raw.optInt("plays")
 val cover=raw.optString("kind")=="cover"
 val credit get() = (if(cover) producer else artist.takeUnless { it.isBlank() || it in setOf("없음","미등록") } ?: producer).ifBlank { "AIFECT" }
 val art: String? get() {
  val own=raw.optInt("has_cover")>0
  val original=cover && raw.optInt("original_has_cover")>0
  return if(own || original) Endpoint.url("/media/${if(own) id else raw.optString("original_id")}/cover?v=${if(own) raw.optString("cover_version") else raw.optString("original_cover_version")}") else null
 }
}
class NativeApi(private val context: Context) {
 @Volatile private var googleBinding=""
 fun clearGoogleBinding(){googleBinding=""}
 val client=OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(25,TimeUnit.SECONDS)
  .followRedirects(false).followSslRedirects(false)
  .addInterceptor { chain ->
   val r=chain.request()
   if(!r.url.toString().startsWith(Endpoint.origin+"/")) throw IOException("허용되지 않은 서버 주소예요.")
   val jar=listOf(NativeSession.cookie(context),googleBinding.takeIf {r.url.encodedPath.startsWith("/api/auth/google/")}?:"").filter{it.isNotBlank()}.joinToString("; ")
   chain.proceed(r.newBuilder().header("Origin",Endpoint.origin).header("Cookie",jar)
    .header("User-Agent","AIFECT-Android/${BuildConfig.VERSION_NAME}").build())
  }.build()
 fun blocking(path:String, method:String="GET", data:JSONObject?=null):JSONObject {
  val body=if(method in listOf("GET","HEAD")) null else (data?.toString()?:"{}").toRequestBody("application/json; charset=utf-8".toMediaType())
  client.newCall(Request.Builder().url(Endpoint.url(path)).method(method,body).build()).execute().use { r ->
   val source=r.body?.source();source?.request(2_000_001L)
   if((source?.buffer?.size?:0)>2_000_000L)throw IOException("서버 응답이 너무 커요.")
   val text=source?.readUtf8()
   val result=try { JSONObject(text?:"{}") }catch(e:Exception){throw IOException("서버 응답을 읽지 못했어요. 잠시 후 다시 시도해주세요.")}
   if(!r.isSuccessful)throw ApiException(r.code,result.optString("error","요청을 완료하지 못했어요."))
   if(path.startsWith("/api/auth/google/"))r.headers.values("Set-Cookie").firstOrNull{it.startsWith("aifect_google_oauth=")}?.let {
    googleBinding=it.substringBefore(";").takeUnless{it=="aifect_google_oauth="}?:""
   }
   r.headers.values("Set-Cookie").firstOrNull { it.startsWith("aifect_session=") }?.let {
    NativeSession.put(context,"cookie",it.substringBefore(";").takeUnless { it=="aifect_session=" }?:"")
   }
   return result
  }
 }
 suspend fun call(path:String,method:String="GET",data:JSONObject?=null)=withContext(Dispatchers.IO){blocking(path,method,data)}
}
fun payload(vararg values: Pair<String,Any?>)=JSONObject().apply { values.forEach { put(it.first,it.second ?: JSONObject.NULL) } }
fun timeLabel(ms:Long):String { val s=(ms/1000).coerceAtLeast(0);return "%d:%02d".format(s/60,s%60) }
