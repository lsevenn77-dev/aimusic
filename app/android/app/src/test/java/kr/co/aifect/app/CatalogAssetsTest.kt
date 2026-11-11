package kr.co.aifect.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CatalogAssetsTest {
 @Test fun newGiftImageComesFromCatalogWithoutBuiltInIds(){
  val product=JSONObject().put("id","gift_new_2027")
   .put("name","Future Gift")
   .put("image","https://media.aifect.example/gifts/2027/future.gif?v=2")
  val catalog=CatalogAssets.giftCatalog(JSONObject()
   .put("gifts",JSONArray().put(product))
   .put("silver_gifts",JSONArray().put(JSONObject().put("id","new-silver")
    .put("image","/assets/gifts/new/silver.webp"))))
  val receipt=JSONObject().put("type","gift_new_2027").put("name","Future Gift")
  assertEquals("https://media.aifect.example/gifts/2027/future.gif?v=2",voiceGiftImage(receipt,catalog))
  assertEquals(Endpoint.origin+"/assets/gifts/new/silver.webp",
   voiceGiftImage(JSONObject().put("type","new-silver"),catalog))
 }
 @Test fun receiptMayProvideArtworkWithoutCatalogLookup(){
  val receipt=JSONObject().put("type","first-ever").put("image","/media/gifts/abc123?variant=mobile")
  assertEquals(Endpoint.origin+"/media/gifts/abc123?variant=mobile",voiceGiftImage(receipt,emptyMap()))
 }
 @Test fun newFramesAndRoomBackgroundsUseCatalogAssets(){
  val frame=JSONObject().put("sku","frame_future")
   .put("kind","PROFILE_FRAME")
   .put("assetPaths",JSONObject().put("overlay","https://cdn.example.com/new-frame.webp"))
  assertEquals("https://cdn.example.com/new-frame.webp",CatalogAssets.decorationImage(frame))
  val room=JSONObject().put("sku","future-room").put("kind","TALKING_ROOM_THEME")
   .put("assetPaths",JSONObject()
    .put("roomCard","/media/themes/future/cover.webp")
    .put("roomMobile","/media/themes/future/mobile.webp?hash=xyz"))
  assertEquals(Endpoint.origin+"/media/themes/future/cover.webp",CatalogAssets.decorationImage(room))
  assertEquals(Endpoint.origin+"/media/themes/future/mobile.webp?hash=xyz",CatalogAssets.roomMobile(room))
 }
 @Test fun assetShapesAllowServerUpgradesWithoutAppChanges(){
  val future=JSONObject().put("assets",JSONObject().put("image","/assets/v2/gifts/leaf.avif?v=99"))
  assertEquals(Endpoint.origin+"/assets/v2/gifts/leaf.avif?v=99",CatalogAssets.giftImage(future))
  val fallback=JSONObject().put("assetPaths",JSONObject().put("roomDesktop","/assets/themes/new/desktop.webp"))
  assertEquals(Endpoint.origin+"/assets/themes/new/desktop.webp",CatalogAssets.roomMobile(fallback))
 }
 @Test fun unsafeImageSourcesCannotBeLoaded(){
  val invalid=listOf(
   "javascript:alert(1)","data:image/svg+xml,evil","http://cdn.example.com/gift.png",
   "//external.test/path.webp","relative/file.webp","/assets/../admin/private",
   "https://user:password@cdn.example.com/art.webp",
   "https://cdn.example.com/art.webp#fragment",
   "https://cdn.example.com/../../private.webp",
   ""
  )
  invalid.forEach{assertNull("Rejected: $it",CatalogAssets.url(it))}
  assertEquals(Endpoint.origin+"/assets/gifts/lollipop.png",
   CatalogAssets.url("/assets/gifts/lollipop.png"))
 }
}
