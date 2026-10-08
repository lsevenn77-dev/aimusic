package kr.co.aifect.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Request
import okhttp3.Response
import java.io.IOException

// The existing authenticated API stores messages; SSE only announces changes.
// Closing the sheet or leaving RESUMED cancels the network call immediately.
private fun NativeApi.chatEvents(query:String)=callbackFlow<Unit>{
 val call=client.newCall(Request.Builder().url(Endpoint.url("/api/chat/events$query")).header("Accept","text/event-stream").build())
 call.enqueue(object:Callback{
  override fun onFailure(call:Call,e:IOException){close(e)}
  override fun onResponse(call:Call,response:Response){
   try{response.use{r->
    if(!r.isSuccessful)throw ApiException(r.code,"대화 연결을 확인해주세요.")
    if(!r.header("Content-Type").orEmpty().startsWith("text/event-stream"))throw IOException("대화 연결을 다시 시도합니다.")
    val source=r.body?.source()?:throw IOException("대화 연결을 다시 시도합니다.")
    while(!call.isCanceled()){
     val line=source.readUtf8Line()?:break
     when(line){
      "event: change"->trySend(Unit)
      "event: revoked"->throw ApiException(403,"로그인 또는 크루 가입 상태를 다시 확인해주세요.")
      "event: retry"->throw IOException("대화 연결을 다시 시도합니다.")
     }
    }
   };close()}catch(e:Exception){close(e)}
  }
 })
 awaitClose{call.cancel()}
}.buffer(Channel.CONFLATED)

internal suspend fun NativeApi.watchChat(query:String,state:(String)->Unit,refresh:suspend()->Unit){
 var failures=0
 while(currentCoroutineContext().isActive){
  try{
   state("")
   chatEvents(query).collect{refresh();state("");failures=0}
   delay(250)
  }catch(e:Exception){
   if(e is CancellationException)throw e
   if(e is ApiException&&e.status in listOf(401,403))throw e
   failures++;state(if(failures>3)"새 메시지 연결을 확인하고 있어요." else "")
   // A gateway without streaming support can still use the original API.
   try{refresh()}catch(refreshError:Exception){
    if(refreshError is CancellationException)throw refreshError
    if(refreshError is ApiException&&refreshError.status in listOf(401,403))throw refreshError
   }
   delay(minOf(15000L,1000L shl minOf(failures,4)))
  }
 }
}
