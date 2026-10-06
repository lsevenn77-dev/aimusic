package kr.co.aifect.app

import android.app.Application
import android.content.Intent
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URI
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class ChatConnectionTest {
 @get:Rule val ui=createComposeRule()
 @Test fun sseReconnectsAndCancellationClosesTheSocket()=runBlocking {
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  assertTrue(context.packageName.endsWith(".test"))
  val server=ServerSocket(0,10,InetAddress.getByName("127.0.0.1"));val workers=Executors.newCachedThreadPool()
  Endpoint.configureTest("http://127.0.0.1:"+server.localPort)
  val connections=AtomicInteger();val closed=AtomicInteger();val refreshes=AtomicInteger()
  workers.execute{while(!server.isClosed)try{val socket=server.accept();workers.execute{
   try{socket.use{c->
    val reader=c.getInputStream().bufferedReader();val request=reader.readLine();assertTrue(request.contains("/api/chat/events?crew=test"))
    while(reader.readLine()?.isNotEmpty()==true){}
    val index=connections.incrementAndGet();val out=c.getOutputStream()
    out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\nevent: change\ndata: {}\n\n".toByteArray());out.flush()
    if(index==1){out.write("event: rotate\ndata: {}\n\n".toByteArray());out.flush()}
    else {c.soTimeout=5000;assertEquals(-1,reader.read());closed.incrementAndGet()}
   }}catch(_:Exception){}
  }}catch(_:Exception){}}
  try{
   val job=launch(Dispatchers.Default){NativeApi(context).watchChat("?crew=test",{}){refreshes.incrementAndGet()}}
   withTimeout(8000){while(refreshes.get()<2)delay(20)}
   job.cancelAndJoin();withTimeout(5000){while(closed.get()==0)delay(20)}
   assertEquals(2,connections.get());assertEquals(2,refreshes.get())
  }finally{server.close();workers.shutdownNow()}
 }
 @Test fun confirmedMessageReplacesPendingWithoutHidingOtherMessages(){
  val pending=payload("id" to "pending:request-one","request_id" to "request-one","user_id" to "me","body" to "hello","created" to 100,"delivery" to "sending")
  val other=payload("id" to "other","request_id" to "request-other","user_id" to "them","sequence" to 2,"body" to "intervening")
  val confirmed=payload("id" to "saved","request_id" to "request-one","user_id" to "me","sequence" to 3,"body" to "hello")
  val result=mergeChat(mergeChat(listOf(pending),listOf(confirmed)),listOf(other))
  assertEquals(listOf("other","saved"),result.map{it.optString("id")})
  assertTrue(result.none{it.optString("delivery").isNotEmpty()})
 }
 @Test fun dmReplyDoesNotSkipAnInterveningIncomingMessage(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  assertTrue(context.packageName.endsWith(".test"))
  val account="cursor-audit-"+UUID.randomUUID()
  val user=payload("id" to account,"name" to "Cursor listener","profile_id" to "self")
  val peer=payload("id" to "audit-peer","name" to "Cursor peer")
  val seed=payload("id" to "seed","sequence" to 1,"sender_id" to account,"recipient_id" to "peer-account","body" to "seed","created" to 100,"read_at" to 1)
  val incoming=payload("id" to "incoming","sequence" to 2,"sender_id" to "peer-account","recipient_id" to account,"body" to "Arrived before my reply","created" to 101,"read_at" to 0)
  val messages=mutableListOf(seed)
  val lock=Any();val postSeen=AtomicBoolean();val announced=AtomicInteger();val nextRead=AtomicLong(-1);val peerRead=AtomicLong();val receiptQuery=AtomicLong(-1)
  val server=ServerSocket(0,10,InetAddress.getByName("127.0.0.1"));val workers=Executors.newCachedThreadPool()
  Endpoint.configureTest("http://127.0.0.1:"+server.localPort)
  workers.execute{while(!server.isClosed)try{val socket=server.accept();workers.execute{
   try{socket.use connection@{c->
    val input=c.getInputStream().buffered()
    fun header():String {val out=ByteArrayOutputStream();while(true){val b=input.read();if(b<0||b==10)break;if(b!=13)out.write(b)};return out.toString("US-ASCII")}
    val request=header().split(" ");val method=request[0];val uri=URI(request[1]);val path=uri.path
    var length=0;while(true){val line=header();if(line.isEmpty())break;if(line.startsWith("Content-Length:",true))length=line.substringAfter(':').trim().toInt()}
    val bytes=ByteArray(length);var offset=0;while(offset<length){val n=input.read(bytes,offset,length-offset);if(n<0)break;offset+=n}
    val body=runCatching{JSONObject(String(bytes,Charsets.UTF_8))}.getOrDefault(JSONObject())
    val out=c.getOutputStream()
    if(path=="/api/chat/events"){
     out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".toByteArray());out.flush()
     var previous=-1
     repeat(600){val revision=announced.get();val event=if(revision!=previous)"change" else "heartbeat";previous=revision;out.write("event: $event\ndata: {}\n\n".toByteArray());out.flush();Thread.sleep(50)}
     return@connection
    }
    val result=when {
     path=="/api/me"->payload("user" to user,"membership" to payload(),"providers" to JSONArray(),"emailEnabled" to true)
     path=="/api/me/profile"->payload("profile" to payload("id" to "self","name" to "Cursor listener"))
     path=="/api/dm/audit-peer"&&method=="POST"->{
      val reply=payload("id" to "reply","sequence" to 3,"sender_id" to account,"recipient_id" to "peer-account","body" to body.optString("body"),"request_id" to body.optString("request_id"),"created" to 102,"read_at" to 0)
      synchronized(lock){messages.add(incoming);messages.add(reply)};postSeen.set(true);payload("message" to reply)
     }
     path=="/api/dm/audit-peer"&&method=="GET"->{
      val after=uri.rawQuery?.substringAfter("after=","")?.substringBefore('&')?.toLongOrNull()?:0L
      if(postSeen.get()&&announced.get()>0)nextRead.compareAndSet(-1,after)
      if(peerRead.get()>0)receiptQuery.compareAndSet(-1,after)
      // Delay the peer notification until the reply is confirmed in the UI.
      val available=synchronized(lock){messages.filter{(!postSeen.get()||announced.get()>0||it.optLong("sequence")<=1)&&it.optLong("sequence")>after}.map{JSONObject(it.toString())}}
      payload("peer" to peer,"messages" to JSONArray(available),"has_more" to false,"read_receipt" to payload("sequence" to peerRead.get(),"read_at" to if(peerRead.get()>0)200 else 0))
     }
     path=="/api/dm/audit-peer"->payload("ok" to true)
     else->payload("tracks" to JSONArray(),"likes" to JSONArray(),"collections" to JSONArray(),"follows" to JSONArray(),"playlists" to JSONArray(),"producers" to JSONArray())
    }.toString().toByteArray(Charsets.UTF_8)
    out.write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${result.size}\r\nConnection: close\r\n\r\n".toByteArray());out.write(result);out.flush()
   }}catch(_:Exception){}
  }}catch(_:Exception){}}
  val store=ViewModelStore()
  lateinit var model:MusicModel
  try{
   InstrumentationRegistry.getInstrumentation().runOnMainSync{
    model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(context.applicationContext as Application))[MusicModel::class.java]
    model.user=user;model.messagePeer="audit-peer"
   }
   ui.setContent{MaterialTheme{MessagesSheet(model,embedded=true)}}
   ui.waitUntil(10000){ui.onAllNodesWithTag("dm-message-seed").fetchSemanticsNodes().isNotEmpty()}
   ui.onNodeWithTag("dm-input").performTextInput("My reply");ui.onNodeWithTag("dm-input").performImeAction()
   ui.waitUntil(10000){ui.onAllNodesWithTag("dm-message-reply").fetchSemanticsNodes().isNotEmpty()}
   announced.incrementAndGet()
   ui.waitUntil(10000){ui.onAllNodesWithTag("dm-message-incoming").fetchSemanticsNodes().isNotEmpty()}
   assertEquals("The POST must not jump over the unseen incoming message",1L,nextRead.get())
   ui.onNodeWithTag("dm-message-reply").assertExists();ui.onNodeWithTag("dm-message-incoming").assertExists()
   peerRead.set(3);announced.incrementAndGet()
   ui.waitUntil(10000){ui.onAllNodesWithText("읽음").fetchSemanticsNodes().size==2}
   assertEquals("A receipt change refreshes metadata after the current cursor, not full history",3L,receiptQuery.get())
  }finally{
   ui.runOnIdle{model.user=null}
   InstrumentationRegistry.getInstrumentation().runOnMainSync{store.clear()}
   context.stopService(Intent(context,PlaybackService::class.java));server.close();workers.shutdownNow()
  }
 }
 @Test fun dmDeviceCacheKeepsTheReadCursorWhenANewerSendIsSaved()=runBlocking {
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  assertTrue(context.packageName.endsWith(".test"))
  val account="cursor-cache-"+UUID.randomUUID();val peer=payload("id" to "peer","name" to "Peer")
  val read=payload("id" to "read","sequence" to 1,"sender_id" to account,"body" to "read")
  val sent=payload("id" to "sent","sequence" to 3,"sender_id" to account,"body" to "sent")
  NativeChatCache.saveThread(context,account,"peer",peer,listOf(read),false,readSequence=1)
  NativeChatCache.saveThread(context,account,"peer",peer,listOf(sent),false)
  NativeChatCache.forgetMemory(context,account)
  val restored=NativeChatCache.read(context,account).threads.getValue("peer")
  assertEquals(listOf(1L,3L),restored.messages.map{it.optLong("sequence")})
  assertEquals("Reopening must request after the last history read, not the last sent message",1L,restored.readSequence)
 }
 @Test fun readReceiptUpdatesOnlyConfirmedOutgoingMessages(){
  val outgoing=payload("id" to "mine","sender_id" to "me","sequence" to 2,"read_at" to 0)
  val incoming=payload("id" to "theirs","sender_id" to "them","sequence" to 1,"read_at" to 0)
  val pending=payload("id" to "pending:one","sender_id" to "me","sequence" to 0,"read_at" to 0)
  val later=payload("id" to "later","sender_id" to "me","sequence" to 4,"read_at" to 0)
  val alreadyRead=payload("id" to "already-read","sender_id" to "me","sequence" to 1,"read_at" to 50)
  val messages=listOf(outgoing,incoming,pending,later,alreadyRead)
  val changed=applyDmReadReceipt(messages,"me",payload("sequence" to 3,"read_at" to 100))
  assertEquals(listOf(100L,0L,0L,0L,50L),changed.map{it.optLong("read_at")})
  assertEquals("Updating a receipt must not mutate a previously published snapshot",0L,outgoing.optLong("read_at"))
  assertSame(messages,applyDmReadReceipt(messages,"me",payload("sequence" to 0,"read_at" to 100)))
  assertSame(messages,applyDmReadReceipt(messages,"me",null))
 }
}
