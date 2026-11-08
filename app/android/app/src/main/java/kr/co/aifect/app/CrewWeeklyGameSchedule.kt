package kr.co.aifect.app

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

/**
 * Korean weekly crew competition, Monday 00:00 to Saturday 00:00 KST.
 * An authoritative server pick wins when it belongs to the current week's season.
 * The stable hash fallback keeps the same game on all offline/native clients
 * until the site adds a persisted season pick to /api/crews/{crew}/games.
 */
internal object CrewWeeklyGameSchedule {
 val zone:ZoneId=ZoneId.of("Asia/Seoul")
 val gameIds=listOf("jump","fishing","rhythm","racing")
 fun date(at:Instant=Instant.now()):LocalDate=at.atZone(zone).toLocalDate()
 fun weekStart(date:LocalDate):LocalDate=date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
 fun isBannerDay(date:LocalDate):Boolean=date.dayOfWeek!=DayOfWeek.SATURDAY&&date.dayOfWeek!=DayOfWeek.SUNDAY
 fun fallbackId(date:LocalDate):String {
  val seed="aifect-crew-v1:${weekStart(date)}"
  val hash=MessageDigest.getInstance("SHA-256").digest(seed.toByteArray(StandardCharsets.UTF_8))
  return gameIds[(hash[0].toInt() and 255)%gameIds.size]
 }
 fun activeId(date:LocalDate,serverGameId:String?=null,serverWeekStart:String?=null):String? {
  if(!isBannerDay(date))return null
  return if(serverWeekStart==weekStart(date).toString()&&serverGameId in gameIds)serverGameId else fallbackId(date)
 }
 fun label(id:String):String=when(id) {
  "jump"->"점프러시"
  "fishing"->"월척헌터"
  "rhythm"->"비트콤보"
  "racing"->"터보레이스"
  else->id
 }
}
