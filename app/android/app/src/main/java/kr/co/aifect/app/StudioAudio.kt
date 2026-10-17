package kr.co.aifect.app

import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.io.File

internal data class StudioAudio(val file:File,val name:String,val extension:String)

internal suspend fun NativeApi.prepareStudioAudio(uri:Uri):StudioAudio=withContext(Dispatchers.IO){
 val resolver=appContext.contentResolver
 val name=resolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())it.getString(0)else null}.orEmpty()
 val extension=name.substringAfterLast('.').lowercase()
 require(extension in listOf("wav","flac","mp3")){"WAV · FLAC · MP3 파일을 선택해주세요."}
 val file=File.createTempFile("studio-audio-",".$extension",appContext.cacheDir)
 try{
  val input=resolver.openInputStream(uri)?:error("음원 파일을 열 수 없어요.")
  input.use{source->file.outputStream().use{out->val buffer=ByteArray(65536);var total=0L;while(true){val n=source.read(buffer);if(n<0)break;total+=n;require(total<=80L*1024*1024){"음원은 80MB 이하로 선택해주세요."};out.write(buffer,0,n)}}}
  require(file.length()>=100){"올바른 음원 파일을 선택해주세요."}
  StudioAudio(file,name,extension)
 }catch(e:Exception){file.delete();throw e}
}

internal suspend fun NativeApi.uploadStudioAudio(path:String,file:File):JSONObject=withContext(Dispatchers.IO){
 val request=Request.Builder().url(Endpoint.url(path)).put(file.asRequestBody("application/octet-stream".toMediaType())).build()
 val result=client.newBuilder().writeTimeout(180,java.util.concurrent.TimeUnit.SECONDS).readTimeout(60,java.util.concurrent.TimeUnit.SECONDS).build().newCall(request).execute().use{response->
  val result=JSONObject(response.body?.string()?:"{}")
  if(!response.isSuccessful)throw ApiException(response.code,result.optString("error","음원을 올리지 못했어요. 다시 시도해주세요."))
  result
 }
 invalidateReads();result
}
