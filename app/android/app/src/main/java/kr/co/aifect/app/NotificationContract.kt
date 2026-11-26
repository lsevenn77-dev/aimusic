package kr.co.aifect.app

import java.net.URI

data class NativePush(val kind:String,val target:String,val recipient:String,val activity:String,val notificationId:String){
 val preference:String get()=when {kind=="crew"->"dm";kind=="person_gift"->"gift";activity=="participation"||activity.startsWith("dubbing_")->"participation";activity.startsWith("crew_")->"crew_important";kind=="notifications"->activity;else->kind}
 val key:String get()=notificationId.ifEmpty{"$recipient:$kind:$activity:$target"}
}
data class NativeNotificationRoute(val recipient:String,val href:String)
object NotificationContract {
 val preferences=linkedMapOf("dm" to "메시지 · 기존 크루 메시지","comment" to "내 작품 댓글","fan_comment" to "팬라운지 댓글·답글","participation" to "작품 참여 공개·완성","artist_follower" to "새 팔로워 · 하루 1회","artist_release" to "아티스트 신곡 · 하루 1회","crew_important" to "크루 초대·승인·참여 요청","gift" to "선물","work_status" to "작품 상태·중요 안내")
 val activities=setOf("fan_comment","crew_invite","crew_approved","crew_request","dubbing_complete","dubbing_participation","work_status","artist_digest")
 fun validId(id:String)=Regex("[A-Za-z0-9:_-]{1,200}").matches(id)
 fun parse(data:Map<String,String>,account:String?):NativePush? {
  val kind=data["kind"]?:return null;val target=data["target"]?:return null;val recipient=data["recipient"]?:return null
  if(account.isNullOrBlank()||recipient!=account||!Regex("[A-Za-z0-9-]{1,80}").matches(target))return null
  val activity=data["activity"].orEmpty();val id=data["notification_id"].orEmpty()
  if(kind !in setOf("dm","comment","gift","crew","person_gift","notifications")||kind=="notifications"&&activity !in activities||id.isNotEmpty()&&!validId(id))return null
  return NativePush(kind,target,recipient,activity,id)
 }
 fun safeRoute(href:String):String? {
  if(href.length>1000||href.any{it.code<32}||href.contains('\\')||!Regex("#(?:notifications|studio|(?:song|artist|crew|dubbing|producer)/[A-Za-z0-9%_-]+)(?:\\?[^#]*)?").matches(href))return null
  return href
 }
 fun safeWebURL(value:String,origin:String="https://aifect.co.kr"):Boolean=runCatching{val allowed=URI(origin);val u=URI(value);(origin=="https://aifect.co.kr"||Regex("http://(?:127\\.0\\.0\\.1|localhost):[0-9]{2,5}").matches(origin))&&u.scheme==allowed.scheme&&u.host==allowed.host&&u.port==allowed.port&&u.rawUserInfo==null&&(u.path=="/"||u.path.isEmpty())&&(u.rawFragment==null||safeRoute("#"+u.rawFragment)!=null)}.getOrDefault(false)
}
