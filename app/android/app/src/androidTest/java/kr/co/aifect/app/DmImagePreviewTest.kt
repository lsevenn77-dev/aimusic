package kr.co.aifect.app

import android.app.Application
import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.espresso.Espresso
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.util.Collections
import java.util.concurrent.Executors

class DmImagePreviewTest {
 @get:Rule val ui=createComposeRule()

 @Test fun dmPhotoOpensAuthenticatedOriginalInsideAppAndBackPreservesConversationDraft(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  assertTrue(context.packageName.endsWith(".test"))
  val server=ServerSocket(0,10,InetAddress.getByName("127.0.0.1"))
  val workers=Executors.newCachedThreadPool()
  Endpoint.configureTest("http://127.0.0.1:"+server.localPort)
  NativeSession.put(context,"cookie","aifect_session=photo-fixture")
  val headers=Collections.synchronizedList(mutableListOf<String>())
  val png=ByteArrayOutputStream().apply{Bitmap.createBitmap(80,60,Bitmap.Config.ARGB_8888).apply{eraseColor(android.graphics.Color.BLUE)}.compress(Bitmap.CompressFormat.PNG,100,this)}.toByteArray()
  val user=payload("id" to "image-viewer-fixture","name" to "사진 테스트","profile_id" to "self")
  workers.execute{while(!server.isClosed)try{val socket=server.accept();workers.execute{
   try{socket.use{c->
    val input=c.getInputStream().bufferedReader()
    val request=input.readLine().orEmpty()
    val incoming=buildList{while(true){val line=input.readLine()?:break;if(line.isEmpty())break;add(line)}}
    val image=request.contains("/media/dm/attachment-one ")
    val body=if(image){headers.add(incoming.firstOrNull{it.startsWith("Cookie:",true)}.orEmpty());png}else payload("user" to user,"profile" to payload("id" to "self","name" to "사진 테스트")).toString().toByteArray()
    val out=c.getOutputStream();out.write("HTTP/1.1 200 OK\r\nContent-Type: ${if(image)"image/png"else "application/json"}\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray());out.write(body);out.flush()
   }}catch(_:Exception){}
  }}catch(_:Exception){}}
  val store=ViewModelStore()
  lateinit var model:MusicModel
  var draft by mutableStateOf("작성 중인 대화")
  val message=JSONObject().put("id","image-message").put("image_id","attachment-one").put("image_expires",System.currentTimeMillis()/1000+3600)
  try{
   InstrumentationRegistry.getInstrumentation().runOnMainSync{
    model=ViewModelProvider(store,ViewModelProvider.AndroidViewModelFactory.getInstance(context.applicationContext as Application))[MusicModel::class.java]
    model.user=user;model.messagePeer="same-peer"
   }
   ui.setContent{MaterialTheme(colorScheme=Scheme){
    Column{ChatImage(model,message);OutlinedTextField(draft,{draft=it},modifier=Modifier.testTag("image-draft"))}
    model.photoPreview?.let{photo->ProfilePhotoViewer(model,photo){model.photoPreview=null}}
   }}
   ui.waitUntil(10000){headers.isNotEmpty()}
   ui.onNodeWithTag("dm-image-open-image-message").assertIsDisplayed().performClick()
   ui.onNodeWithTag("profile-photo-viewer").assertIsDisplayed()
   ui.waitUntil(10000){ui.onAllNodesWithTag("profile-image-loaded").fetchSemanticsNodes().isNotEmpty()}
   ui.runOnIdle{assertEquals(Endpoint.url("/media/dm/attachment-one"),model.photoPreview?.url);assertEquals("same-peer",model.messagePeer)}
   ui.onNodeWithTag("profile-photo-viewer").performTouchInput{doubleClick()}
   Espresso.pressBack()
   ui.onNodeWithTag("profile-photo-viewer").assertDoesNotExist()
   ui.onNodeWithTag("image-draft").assertTextContains("작성 중인 대화")
   ui.runOnIdle{assertNull(model.photoPreview);assertEquals("same-peer",model.messagePeer)}
   assertTrue(headers.size>=2)
   assertTrue(headers.all{it.contains("aifect_session=photo-fixture")})
  }finally{
   InstrumentationRegistry.getInstrumentation().runOnMainSync{store.clear()}
   context.stopService(Intent(context,PlaybackService::class.java))
   NativeSession.put(context,"cookie","")
   server.close();workers.shutdownNow()
  }
 }
}
