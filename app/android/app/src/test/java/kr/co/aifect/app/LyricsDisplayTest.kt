package kr.co.aifect.app

import org.junit.Test
import org.junit.Assert.*

class LyricsDisplayTest {
 @Test fun simultaneousPartsRemainVisibleAndNextCueIsStillUpcoming(){
  val rows=parseDisplayLyrics("[00:10.00]내 파트\n[00:10.00]파트너 파트\n[00:10.00]\n[00:15.00]다음 가사")
  assertEquals(listOf(10.0,15.0),rows.map{it.first})
  assertEquals("내 파트 / 파트너 파트",compactLyrics(rows,10.0,"").first)
  assertEquals("다음 가사",compactLyrics(rows,10.0,"").second)
  assertEquals("내 파트 / 파트너 파트",compactLyrics(rows,9.0,"").second)
  assertEquals("다음 가사",compactLyrics(rows,15.0,"").first)
 }
 @Test fun identicalSimultaneousTagsAreNotRepeated(){
  val rows=parseDisplayLyrics("[offset:-500]\n[00:00.00][00:00.25]함께 불러요\n[00:00.25]함께 불러요")
  assertEquals(listOf(0.0 to "함께 불러요"),rows)
 }
 @Test fun repeatedTagsOffsetsAndSeeks(){
  val rows=parseDisplayLyrics("[ar:test]\n[offset:500]\n[00:10.00][00:20.00]다시 불러요\n[00:01.00]첫 가사\n[00:25.00]")
  assertEquals(listOf(1.5,10.5,20.5,25.5),rows.map{it.first})
  assertEquals("첫 가사",compactLyrics(rows,2.0,"").first)
  assertEquals("다시 불러요",compactLyrics(rows,21.0,"").first)
  assertEquals("♪",compactLyrics(rows,0.0,"").first)
  assertEquals("첫 가사",compactLyrics(rows,0.0,"").second)
  assertEquals("♪",compactLyrics(rows,28.0,"").first)
  assertEquals("가사를 불러오는 중…",compactLyrics(emptyList(),0.0,"").first)
 }
}
