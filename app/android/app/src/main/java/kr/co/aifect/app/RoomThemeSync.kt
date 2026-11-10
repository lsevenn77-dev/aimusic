package kr.co.aifect.app

import org.json.JSONObject

/**
 * Native talking rooms receive realtime snapshots from the voice transport and
 * verified theme assets from the website API. Never reuse theme art across a
 * changed SKU, host, room or settings revision.
 */
internal object RoomThemeSync {
 private fun clean(value:String?):String = value.orEmpty().trim().takeUnless{it=="null"}.orEmpty()

 fun selectedSku(room:JSONObject):String {
  val saved=clean(room.optString("theme_sku"))
  if(saved.isNotEmpty())return saved
  val resolved=clean(room.optJSONObject("theme")?.optString("sku"))
  if(resolved.isNotEmpty())return resolved
  return clean(room.optString("background")).ifEmpty{"navy"}
 }

 fun canCarry(
  oldId:String,newId:String,oldHost:String,newHost:String,
  oldRevision:Int,newRevision:Int,oldSku:String,newSku:String
 ):Boolean = oldId.isNotBlank() && oldId==newId &&
  oldHost.isNotBlank() && oldHost==newHost &&
  oldRevision==newRevision && oldSku.isNotBlank() && oldSku==newSku

 fun matches(selected:String,themeSku:String,expiresAt:Long,serverNow:Long):Boolean {
  if(selected.isBlank()||selected!=themeSku)return false
  // Paid themes must carry an active entitlement; free themes expire_at is 0.
  if(themeSku.startsWith("theme_")&&expiresAt<=0L)return false
  val now=if(serverNow>0L)serverNow else System.currentTimeMillis()/1000L
  return expiresAt<=0L||expiresAt>now
 }

 private fun usable(room:JSONObject,theme:JSONObject?):Boolean {
  if(theme==null)return false
  return matches(selectedSku(room),clean(theme.optString("sku")),theme.optLong("expires_at"),theme.optLong("server_now"))
 }

 fun current(room:JSONObject,verified:JSONObject?):JSONObject? = when {
  usable(room,verified)->verified
  usable(room,room.optJSONObject("theme"))->room.optJSONObject("theme")
  else->null
 }

 fun carry(previous:JSONObject?,incoming:JSONObject):JSONObject? {
  if(previous==null||incoming.has("theme"))return null
  if(!canCarry(
    previous.optString("id"),incoming.optString("id"),
    previous.optString("host_id"),incoming.optString("host_id"),
    previous.optInt("settings_revision"),incoming.optInt("settings_revision"),
    selectedSku(previous),selectedSku(incoming)
   ))return null
  return previous.optJSONObject("theme")?.takeIf{usable(incoming,it)}
 }
}
