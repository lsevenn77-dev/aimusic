package kr.co.aifect.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.ImageDecoderDecoder
import coil.decode.GifDecoder
import coil.decode.SvgDecoder

/** Remote catalog artwork, including animated effects and SVG thumbnails. */
class AifectApplication:Application(),ImageLoaderFactory {
 override fun newImageLoader():ImageLoader=ImageLoader.Builder(this).components {
  if(android.os.Build.VERSION.SDK_INT>=28)add(ImageDecoderDecoder.Factory())else add(GifDecoder.Factory())
  add(SvgDecoder.Factory())
 }.build()
}
