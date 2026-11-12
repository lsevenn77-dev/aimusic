package kr.co.aifect.app

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class RoomThemeSyncTest {
 private fun paid()=JSONObject().put("sku","theme_aurora_night")
  .put("assets",JSONObject().put("roomMobile","/assets/themes/v20261028/theme_aurora_night/background-mobile.webp"))
  .put("expires_at",1700000200L).put("server_now",1700000000L)
 private fun room(revision:Int=4,sku:String="navy")=JSONObject()
  .put("id","room1").put("host_id","host1").put("settings_revision",revision)
  .put("theme_sku",sku).put("background","navy")

 @Test fun sameRoomAndRevisionPreserveVerifiedArtBetweenTransportSnapshots(){
  assertTrue(RoomThemeSync.canCarry("room1","room1","host1","host1",4,4,"theme_aurora_night","theme_aurora_night"))
 }
 @Test fun changedThemeNeverReusesOldImage(){
  assertFalse(RoomThemeSync.canCarry("room1","room1","host1","host1",4,4,"navy","night"))
  assertFalse(RoomThemeSync.canCarry("room1","room1","host1","host1",4,4,"theme_aurora_night","theme_neon"))
 }
 @Test fun changedRevisionOrHostInvalidatesPreviousArt(){
  assertFalse(RoomThemeSync.canCarry("room1","room1","host1","host1",4,5,"theme_aurora_night","theme_aurora_night"))
  assertFalse(RoomThemeSync.canCarry("room1","room1","host1","host2",4,4,"theme_aurora_night","theme_aurora_night"))
  assertFalse(RoomThemeSync.canCarry("room1","room2","host1","host1",4,4,"theme_aurora_night","theme_aurora_night"))
 }
 @Test fun onlyMatchingUnexpiredThemeMayRender(){
  for(sku in listOf("basic_dark","basic_light"))assertTrue(RoomThemeSync.matches(sku,sku,0,1700000000))
  for(sku in listOf("navy","sunset","night")){
   assertFalse(RoomThemeSync.matches(sku,sku,0,1700000000))
   assertEquals("basic_dark",RoomThemeSync.selectedSku(room(sku=sku)))
  }
  assertTrue(RoomThemeSync.matches("theme_aurora_night","theme_aurora_night",1700000020,1700000000))
  assertFalse(RoomThemeSync.matches("theme_aurora_night","night",0,1700000000))
  assertFalse(RoomThemeSync.matches("theme_aurora_night","theme_aurora_night",1699999999,1700000000))
  assertFalse(RoomThemeSync.matches("theme_aurora_night","theme_aurora_night",0,1700000000))
 }
 @Test fun serverDecoratedThemeOverridesLegacyTransportBackground(){
  val room=room().put("theme",paid())
  assertEquals("theme_aurora_night",RoomThemeSync.selectedSku(room))
  assertEquals("theme_aurora_night",RoomThemeSync.shownSku(room,null))
 }
 @Test fun themeEndpointTakesPriorityOverStaleRoomSku(){
  val room=room()
  assertEquals("basic_dark",RoomThemeSync.selectedSku(room))
  assertEquals("theme_aurora_night",RoomThemeSync.shownSku(room,paid()))
  assertEquals("theme_aurora_night",RoomThemeSync.current(room,paid())?.optString("sku"))
 }
 @Test fun realtimeHeartbeatCannotResetActiveDecorationToNavy(){
  val previous=room().put("theme",paid())
  val incoming=room()
  val carried=RoomThemeSync.carry(previous,incoming)
  assertNotNull(carried)
  incoming.put("theme",carried)
  assertEquals("theme_aurora_night",RoomThemeSync.shownSku(incoming,null))
 }
 @Test fun oldTransportMayOmitThemeSkuButMustKeepRoomAndRevision(){
  val previous=room().put("theme",paid())
  val incoming=room().apply{remove("theme_sku")}
  assertNotNull(RoomThemeSync.carry(previous,incoming))
  val changed=room(revision=5).apply{remove("theme_sku")}
  assertNull(RoomThemeSync.carry(previous,changed))
  val anotherHost=room().apply{remove("theme_sku");put("host_id","host2")}
  assertNull(RoomThemeSync.carry(previous,anotherHost))
 }
 @Test fun canonicalPaidHttpRoomSurvivesAnOldSocketWithoutThemeSku(){
  val paidRoom=room(sku="theme_aurora_night").put("background","theme_aurora_night").put("theme",paid())
  val paletteOnly=room().apply{remove("theme_sku");put("background","basic_dark")}
  assertEquals("theme_aurora_night",RoomThemeSync.carry(paidRoom,paletteOnly)?.optString("sku"))
  assertNull(RoomThemeSync.carry(paidRoom,paletteOnly.put("settings_revision",5)))
 }
 @Test fun settingsChangeMustDiscardOldThemeAndExpiredArt(){
  val previous=room().put("theme",paid())
  assertNull(RoomThemeSync.carry(previous,room(revision=5,sku="night")))
  assertNull(RoomThemeSync.carry(previous,room(sku="theme_cherry_blossom")))
  val expired=paid().put("expires_at",1699999999L)
  assertFalse(RoomThemeSync.validTheme(expired))
  assertEquals("basic_dark",RoomThemeSync.shownSku(room(),expired))
 }
}
