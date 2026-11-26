package kr.co.aifect.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.*

/** Never subscribe to public topics: every delivery is bound to an authenticated device. */
object PushNotifications {
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 private val lock=Any()
 private var lastRefresh=0L
 fun refresh(c:Context){
  val user=prefs(c).getString("user",null)?:return
  synchronized(lock){val now=android.os.SystemClock.elapsedRealtime();if(now-lastRefresh<30_000)return;lastRefresh=now}
  bind(c,user)
 }
 private fun prefs(c:Context)=c.getSharedPreferences("native_push",Context.MODE_PRIVATE)
 fun channels(c:Context){
  val manager=c.getSystemService(NotificationManager::class.java)
  (NotificationContract.preferences.toList()+listOf("artist_digest" to "오늘의 아티스트 소식")).forEach{(kind,title)->
   manager.createNotificationChannel(NotificationChannel("aifect_$kind",title,NotificationManager.IMPORTANCE_DEFAULT))
  }
 }
 fun bind(c:Context,userId:String?){
  synchronized(lock){prefs(c).edit().putString("user",userId).apply()}
  if(userId==null){NotificationManagerCompat.from(c).cancelAll();return}
  if(FirebaseApp.getApps(c).isEmpty())return
  FirebaseMessaging.getInstance().token.addOnSuccessListener{token->register(c,token,userId)}
 }
 fun tokenChanged(c:Context,token:String){prefs(c).getString("user",null)?.let{register(c,token,it)}}
 private fun register(c:Context,token:String,user:String){scope.launch{
  synchronized(lock){if(prefs(c).getString("user",null)!=user)return@launch}
  runCatching{
   val api=NativeApi(c)
   api.blocking("/api/push/device","PUT",payload("token" to token,"platform" to "android","account_id" to user))
   val kinds=NotificationContract.preferences.keys.toList()
   val pending=synchronized(lock){if(prefs(c).getBoolean("$user:dirty",false))kinds.filter{prefs(c).contains("$user:$it")}.associateWith{prefs(c).getBoolean("$user:$it",true)}else null}
   if(pending!=null){
    val body=payload("account_id" to user);pending.forEach{(kind,value)->body.put(kind,value)}
    api.blocking("/api/push/preferences","PUT",body)
    synchronized(lock){if(pending.all{(kind,value)->prefs(c).getBoolean("$user:$kind",true)==value})prefs(c).edit().putBoolean("$user:dirty",false).apply()}
   }
   val settings=api.blocking("/api/push/preferences")
   synchronized(lock){if(prefs(c).getString("user",null)==user&&!prefs(c).getBoolean("$user:dirty",false)){
    val editor=prefs(c).edit()
    kinds.forEach{kind->editor.putBoolean("$user:$kind",settings.optInt(kind,1)==1)}
    editor.apply()
   }}
  }
 }}
 fun enabled(c:Context,kind:String)=prefs(c).getBoolean("${prefs(c).getString("user","")}:$kind",true)
 fun setEnabled(c:Context,kind:String,value:Boolean){
  require(kind in NotificationContract.preferences);val user=prefs(c).getString("user",null)?:return
  synchronized(lock){prefs(c).edit().putBoolean("$user:$kind",value).putBoolean("$user:dirty",true).apply()}
  scope.launch{if(prefs(c).getString("user",null)==user)runCatching{NativeApi(c).blocking("/api/push/preferences","PUT",payload(kind to value,"account_id" to user))}}
 }
 fun show(c:Context,data:Map<String,String>){
  val push=NotificationContract.parse(data,prefs(c).getString("user",null))?:return
  val kind=push.kind;val target=push.target;val user=push.recipient
  val preference=push.preference
  if(push.activity=="artist_digest"){if(!enabled(c,"artist_follower")&&!enabled(c,"artist_release"))return}else if(!enabled(c,preference))return
  channels(c)
  val key=push.key;val notificationId=key.hashCode()
  val intent=Intent(c,MainActivity::class.java).putExtra("pushKind",kind).putExtra("pushTarget",target).putExtra("pushRecipient",user).putExtra("pushActivity",push.activity).putExtra("pushNotificationId",push.notificationId)
  val pending=PendingIntent.getActivity(c,notificationId,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val title=data["title"]?.take(100)?:"AIFECT"
  val body=data["body"]?.take(300)?:"새 알림이 도착했어요."
  val notification=NotificationCompat.Builder(c,"aifect_$preference").setSmallIcon(R.drawable.ic_push)
   .setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
   .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(kind!="dm")
   .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
  try{NotificationManagerCompat.from(c).notify(notificationId,notification)}catch(_:SecurityException){ /* Notifications are optional when permission is denied. */ }
 }
}

class AifectMessagingService:FirebaseMessagingService(){
 override fun onNewToken(token:String){PushNotifications.tokenChanged(applicationContext,token)}
 override fun onMessageReceived(message:RemoteMessage){PushNotifications.show(applicationContext,message.data)}
}
