package kr.co.aifect.app
import android.content.Context
import android.util.AtomicFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Only these guest catalog pages are public; do not persist user state or search. */
internal object CatalogSnapshot{
 private val files=mapOf("/api/catalog?section=tracks&chart=top" to "chart","/api/catalog?section=tracks&limit=40" to "latest")
 fun accepts(path:String)=files.containsKey(path)
 private fun file(c:Context,path:String)=AtomicFile(File(c.cacheDir,"guest-catalog-"+files.getValue(path)+".json"))
 private val lock=Any()
 suspend fun save(c:Context,path:String,data:String)=withContext(Dispatchers.IO){synchronized(lock){if(data.length<=384*1024)runCatching{val f=file(c,path);val os=f.startWrite();try{os.write(data.toByteArray());f.finishWrite(os)}catch(e:Exception){f.failWrite(os);throw e}};Unit}}
 suspend fun read(c:Context,path:String):String?=withContext(Dispatchers.IO){synchronized(lock){runCatching{val f=file(c,path);if(System.currentTimeMillis()-f.baseFile.lastModified() in 0..86_400_000L && f.baseFile.length()<=1024*1024)String(f.readFully(),Charsets.UTF_8)else null}.getOrNull()}}
}
