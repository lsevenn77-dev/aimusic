package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class RoomThemeSyncTest {
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
  assertTrue(RoomThemeSync.matches("night","night",0,1700000000))
  assertTrue(RoomThemeSync.matches("theme_aurora_night","theme_aurora_night",1700000020,1700000000))
  assertFalse(RoomThemeSync.matches("theme_aurora_night","night",0,1700000000))
  assertFalse(RoomThemeSync.matches("theme_aurora_night","theme_aurora_night",1699999999,1700000000))
  assertFalse(RoomThemeSync.matches("theme_aurora_night","theme_aurora_night",0,1700000000))
 }
}
