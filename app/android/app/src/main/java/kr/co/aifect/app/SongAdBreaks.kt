package kr.co.aifect.app

import android.content.Context

/** Main-thread bridge. Only the resumed music Activity can present an ad. */
object SongAdBreaks {
 interface Host { fun ready():Boolean; fun show(onShown:()->Unit,onFinished:()->Unit):Boolean }
 var host:Host?=null
 // Flush the current service listen before the UI replaces its media queue.
 var finishCurrentListen:(()->Unit)?=null
 private var prefs:android.content.SharedPreferences?=null
 private var account:String?=null
 private var premiumUntil=0L
 private var cadence=SongAdCadence()
 val eligible get()=account!=null&&System.currentTimeMillis()/1000>=premiumUntil
 val due get()=eligible&&cadence.due
 fun configure(context:Context,userId:String?,premiumExpiry:Long) {
  prefs=context.getSharedPreferences("listening_ads",Context.MODE_PRIVATE)
  if(account!=userId){account=userId;cadence=SongAdCadence(prefs!!.getInt("completed_${userId?:"guest"}",0))}
  premiumUntil=premiumExpiry
  if(!eligible){cadence.shown();persist()}
 }
 private fun persist(){account?.let{prefs?.edit()?.putInt("completed_$it",cadence.completed)?.apply()}}
 fun completed(listenedMs:Long,durationMs:Long,preview:Boolean) {
  if(eligible){cadence.finish(listenedMs,durationMs,preview);persist()}
 }
 fun afterCoverUpload(uploadId:String,pause:()->Unit,onFinished:()->Unit) {
  val owner=account
  if(!eligible||owner==null||uploadId.isBlank()){onFinished();return}
  // A completion callback can be delivered again after Activity recreation.
  // Claim the placement before checking inventory so a late ad never surprises the user.
  val key="cover_uploads_$owner"
  val attempted=prefs?.getStringSet(key,emptySet()).orEmpty().toMutableSet()
  if(!attempted.add(uploadId)){onFinished();return}
  prefs?.edit()?.putStringSet(key,attempted.toList().takeLast(100).toSet())?.apply()
  val presenter=host
  if(presenter?.ready()!=true){onFinished();return}
  pause()
  if(!presenter.show({},onFinished))onFinished()
 }
 @Suppress("UNUSED_PARAMETER")
 fun atBoundary(pause:()->Unit,continuePlayback:()->Unit) {
  // Listening inventory will be audio-only. Until that provider is ready,
  // continue music immediately; never fall back to the upload interstitial.
  continuePlayback()
 }
}
