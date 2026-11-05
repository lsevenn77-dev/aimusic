package kr.co.aifect.app
import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File
import java.security.MessageDigest

/** ResolvingDataSource obtains a new server grant per play before this byte cache is consulted. */
@UnstableApi internal object PlaybackDisk{
 @Volatile private var instance:SimpleCache?=null
 @Synchronized fun cache(c:Context):SimpleCache=instance?:SimpleCache(File(c.applicationContext.cacheDir,"media-segments-v1"),LeastRecentlyUsedCacheEvictor(64L*1024*1024),StandaloneDatabaseProvider(c.applicationContext)).also{instance=it}
 private fun hash(input:String)=MessageDigest.getInstance("SHA-256").digest(input.toByteArray()).joinToString(""){"%02x".format(it)}
 fun key(session:String,url:String,rate:Int,limit:Double)=hash(session)+":"+hash(url+"|"+rate+"|"+limit+"|"+(System.currentTimeMillis()/3_600_000L))
 fun forget(c:Context,session:String){if(session.isEmpty())return;val prefix=hash(session)+":";val cache=cache(c);cache.keys.filter{it.startsWith(prefix)}.forEach{cache.removeResource(it)}}
}
