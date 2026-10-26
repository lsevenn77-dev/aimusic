package kr.co.aifect.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

/** Phone numbers/call logs are never requested or read. Audio focus remains the fallback. */
internal class VoiceCallMonitor(private val context:Context,private val changed:(Boolean)->Unit){
 private val phone=context.getSystemService(TelephonyManager::class.java)
 private var callback:TelephonyCallback?=null
 private var legacy:PhoneStateListener?=null
 private var last:Int?=null
 private fun dispatch(value:Int){if(last==value)return;val was=last;last=value;if(value!=TelephonyManager.CALL_STATE_IDLE||was!=null)changed(value!=TelephonyManager.CALL_STATE_IDLE)}
 fun start(){
  if(callback!=null||legacy!=null||ContextCompat.checkSelfPermission(context,Manifest.permission.READ_PHONE_STATE)!=PackageManager.PERMISSION_GRANTED)return
  try{
   if(Build.VERSION.SDK_INT>=31){val listener=object:TelephonyCallback(),TelephonyCallback.CallStateListener{override fun onCallStateChanged(state:Int){dispatch(state)}};phone.registerTelephonyCallback(context.mainExecutor,listener);callback=listener}
   else {@Suppress("DEPRECATION") val listener=object:PhoneStateListener(){override fun onCallStateChanged(state:Int,phoneNumber:String?){dispatch(state)}};@Suppress("DEPRECATION") phone.listen(listener,PhoneStateListener.LISTEN_CALL_STATE);legacy=listener}
  }catch(_:SecurityException){/* A permission can be revoked while the room remains open. */}
 }
 fun close(){try{if(Build.VERSION.SDK_INT>=31)callback?.let{phone.unregisterTelephonyCallback(it)};@Suppress("DEPRECATION") legacy?.let{phone.listen(it,PhoneStateListener.LISTEN_NONE)}}catch(_:SecurityException){};callback=null;legacy=null;last=null}
}
