package kr.co.aifect.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.ImageDecoderDecoder
import coil.decode.GifDecoder
import coil.decode.SvgDecoder
import okhttp3.Cache
import java.io.File

/** Remote catalog artwork, including animated effects and SVG thumbnails. */
class AifectApplication:Application(),ImageLoaderFactory {
 internal val dubbingPosters by lazy {
  // HTTP revalidates versioned public posters. Private artwork returns no-store.
  // Install the cache on the authenticated client so the normal session
  // interceptor runs before OkHttp handles any conditional GET.
  val client=NativeApi(this).client.newBuilder()
   .cache(Cache(File(cacheDir,"dubbing-poster-http"),24L*1024*1024))
   .build()
  ImageLoader.Builder(this).okHttpClient(client)
   .diskCache(null)
   .memoryCachePolicy(coil.request.CachePolicy.DISABLED).build()
 }
 override fun newImageLoader():ImageLoader=ImageLoader.Builder(this).components {
  if(android.os.Build.VERSION.SDK_INT>=28)add(ImageDecoderDecoder.Factory())else add(GifDecoder.Factory())
  add(SvgDecoder.Factory())
 }.build()
}
