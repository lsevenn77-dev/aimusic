package kr.co.aifect.app

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONObject

internal fun ownedGiftAvailable(item:JSONObject):Boolean {
 return item.optBoolean("available",true)&&!heldGiftExpired(item)
}
internal fun heldGiftExpired(item:JSONObject,at:Long=System.currentTimeMillis()/1000):Boolean =
 item.optBoolean("expired")||item.optLong("expires_at") in 1L..at

internal fun ownedGiftGroupKey(item:JSONObject):List<Any> = listOf(
 item.optString("gift_type"),item.optLong("expires_at"),item.optString("grant_origin"),
 ownedGiftAvailable(item),item.optBoolean("giftable",true)
)

internal fun ownedGiftDeadlineLabel(item:JSONObject):String? {
 val expires=item.optLong("expires_at")
 if(heldGiftExpired(item))return "사용 기한 만료"
 return inventoryDeadlineLabel(expires,"사용 기한")
}

internal fun inventoryDeadlineLabel(expires:Long,label:String,at:Long=System.currentTimeMillis()/1000):String? {
 if(expires<=0)return null
 val remaining=expires-at
 val format=SimpleDateFormat("M월 d일 HH:mm",Locale.KOREA).apply{timeZone=TimeZone.getTimeZone("Asia/Seoul")}
 val date=format.format(Date(expires*1000))
 val relative=when {
  remaining<=0 -> "기한 만료"
  remaining<3600 -> "1시간 미만"
  remaining<86400 -> "${(remaining+3599)/3600}시간 남음"
  else -> "${(remaining+86399)/86400}일 남음"
 }
 return relative+" · "+label+" "+date+" KST"
}
