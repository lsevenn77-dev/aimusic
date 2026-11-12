package kr.co.aifect.app

import org.json.JSONObject

/**
 * The Site's decorated room/theme response is the source of truth.
 * Transport snapshots can still contain an older fallback background ("navy")
 * while a paid SKU lives in room_decorations on the server.
 */
internal object RoomThemeSync {
 const val DEFAULT_SKU="basic_dark"
 private val freeSkus=setOf(DEFAULT_SKU,"basic_light")
 fun isRetired(sku:String)=sku=="navy"||sku=="sunset"||sku=="night"
 private fun clean(value:String?):String = value.orEmpty().trim().takeUnless{it=="null"}.orEmpty()

 private fun declaredSku(room:JSONObject):String {
  return clean(room.optString("theme_sku"))
   .ifEmpty{clean(room.optString("background"))}
   .takeUnless{it.isEmpty()||isRetired(it)}?:DEFAULT_SKU
 }

 fun validTheme(theme:JSONObject?):Boolean {
  if(theme==null)return false
  val sku=clean(theme.optString("sku"))
  return sku.isNotEmpty() && matches(sku,sku,theme.optLong("expires_at"),theme.optLong("server_now"))
 }

 fun selectedSku(room:JSONObject):String {
  // A decorated HTTP room has already been entitlement-checked by the Site.
  val decorated=room.optJSONObject("theme")
  if(validTheme(decorated))return decorated!!.optString("sku")
  return declaredSku(room)
 }

 fun canCarry(
  oldId:String,newId:String,oldHost:String,newHost:String,
  oldRevision:Int,newRevision:Int,oldSku:String,newSku:String
 ):Boolean = oldId.isNotBlank() && oldId==newId &&
  oldHost.isNotBlank() && oldHost==newHost &&
  oldRevision==newRevision && oldSku.isNotBlank() && oldSku==newSku

 fun matches(selected:String,themeSku:String,expiresAt:Long,serverNow:Long):Boolean {
  if(selected.isBlank()||selected!=themeSku||isRetired(themeSku))return false
  // Free themes need no expiry. Paid themes require an active entitlement.
  if(themeSku.startsWith("theme_")&&expiresAt<=0L)return false
  val now=if(serverNow>0L)serverNow else System.currentTimeMillis()/1000L
  return expiresAt<=0L||expiresAt>now
 }

 fun current(room:JSONObject,verified:JSONObject?):JSONObject? {
  // /api/voice/rooms/:id/theme is authoritative, even when the realtime
  // room.theme_sku is the legacy 'navy' fallback for a paid room theme.
  if(validTheme(verified))return verified
  return room.optJSONObject("theme")?.takeIf(::validTheme)
 }

 fun shownSku(room:JSONObject,verified:JSONObject?):String =
  current(room,verified)?.optString("sku").orEmpty()
   .ifBlank{selectedSku(room).takeIf{it in freeSkus}?:DEFAULT_SKU}

 fun carry(previous:JSONObject?,incoming:JSONObject):JSONObject? {
  if(previous==null||incoming.has("theme"))return null
  val prior=previous.optJSONObject("theme")?.takeIf(::validTheme)?:return null
  val oldDeclared=declaredSku(previous)
  val newDeclared=declaredSku(incoming)
  // Old voice transport revisions may omit theme_sku but keep background=navy.
  // Preserve a verified image only for the same room, host, settings revision
  // and unchanged declared selection. Changes drop the old image immediately.
  val selectionUnchanged=oldDeclared==newDeclared || (!incoming.has("theme_sku") &&
   (newDeclared==DEFAULT_SKU || clean(previous.optString("background"))==clean(incoming.optString("background"))))
  if(!selectionUnchanged)return null
  val paid=prior.optString("sku")
  if(!canCarry(
    previous.optString("id"),incoming.optString("id"),
    previous.optString("host_id"),incoming.optString("host_id"),
    previous.optInt("settings_revision"),incoming.optInt("settings_revision"),
    paid,paid
   ))return null
  return prior
 }
}
