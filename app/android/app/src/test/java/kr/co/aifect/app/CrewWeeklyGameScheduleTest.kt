package kr.co.aifect.app

import java.time.Instant
import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test

class CrewWeeklyGameScheduleTest {
 @Test fun rotatesOncePerKoreanWeekAndHidesEntireWeekend(){
  val monday=LocalDate.of(2026,11,9)
  val friday=LocalDate.of(2026,11,13)
  val saturday=LocalDate.of(2026,11,14)
  val sunday=LocalDate.of(2026,11,15)
  val pick=CrewWeeklyGameSchedule.activeId(monday)
  assertTrue(pick in CrewWeeklyGameSchedule.gameIds)
  assertEquals(pick,CrewWeeklyGameSchedule.activeId(friday))
  assertNull(CrewWeeklyGameSchedule.activeId(saturday))
  assertNull(CrewWeeklyGameSchedule.activeId(sunday))
  assertEquals(LocalDate.of(2026,11,16),CrewWeeklyGameSchedule.weekStart(sunday.plusDays(1)))
 }
 @Test fun mondayMidnightUsesAsiaSeoulNotUtc(){
  assertEquals(LocalDate.of(2026,11,8),CrewWeeklyGameSchedule.date(Instant.parse("2026-11-08T14:59:59Z")))
  assertEquals(LocalDate.of(2026,11,9),CrewWeeklyGameSchedule.date(Instant.parse("2026-11-08T15:00:00Z")))
  assertNull(CrewWeeklyGameSchedule.activeId(CrewWeeklyGameSchedule.date(Instant.parse("2026-11-08T14:59:59Z"))))
  assertNotNull(CrewWeeklyGameSchedule.activeId(CrewWeeklyGameSchedule.date(Instant.parse("2026-11-08T15:00:00Z"))))
 }
 @Test fun matchingPersistedServerPickWinsButStaleSeasonDoesNot(){
  val week=LocalDate.of(2026,11,9)
  assertEquals("fishing",CrewWeeklyGameSchedule.activeId(week,"fishing","2026-11-09"))
  assertEquals(CrewWeeklyGameSchedule.fallbackId(week),CrewWeeklyGameSchedule.activeId(week,"fishing","2026-11-02"))
  assertEquals(CrewWeeklyGameSchedule.fallbackId(week),CrewWeeklyGameSchedule.activeId(week,"unknown","2026-11-09"))
  assertNull(CrewWeeklyGameSchedule.activeId(week.plusDays(5),"jump","2026-11-09"))
 }
 @Test fun namesMatchApprovedGameTitles(){
  assertEquals("점프러시",CrewWeeklyGameSchedule.label("jump"))
  assertEquals("월척헌터",CrewWeeklyGameSchedule.label("fishing"))
  assertEquals("비트콤보",CrewWeeklyGameSchedule.label("rhythm"))
  assertEquals("터보레이스",CrewWeeklyGameSchedule.label("racing"))
 }
}
