package kr.co.aifect.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

internal data class DubWork(
 val project:JSONObject, val versions:List<JSONObject>?, val finished:Boolean,
 val weeklyScore:Int, val allRank:Int?, val weeklyRank:Int?
){
 val id:String=project.getString("id")
 val title:String=project.optString("title")
 val creator:String=project.optString("ownerName")
 val created:Long=project.optLong("created")
 val genres=project.optJSONArray("genres").let{arr->List(arr?.length()?:0){arr!!.optString(it)}}
 val count:Int?=versions?.count{if(finished)it.optString("state")=="complete" else it.optString("state") in setOf("recruiting","recording","in_progress","mixing")}
 val badge:String get()=when{
  count==null->if(finished)"완성작" else "참여 가능"
  finished->"완성 더빙 ${count}개"
  count==0->"진행 중인 더빙 없음"
  else->"더빙 ${count}개 진행 중"
 }
}

internal data class DubCatalogue(val works:List<DubWork>,val incomplete:Boolean=false){
 fun ranked(weekly:Boolean,finished:Boolean):List<DubWork>{
  val rows=works.filter{it.finished==finished}
  return if(finished)rows.filter{(if(weekly)it.weeklyRank else it.allRank)!=null}.sortedBy{if(weekly)it.weeklyRank else it.allRank}
  else rows.filter{if(weekly)it.weeklyScore>0 else it.count!=null}.sortedWith(compareByDescending<DubWork>{if(weekly)it.weeklyScore else it.count?:0}.thenByDescending{it.created}.thenBy{it.id})
 }
}

private suspend fun NativeApi.collectDubPages(path:String,key:String="projects",next:String="nextOffset"):List<JSONObject>{
 val rows=linkedMapOf<String,JSONObject>()
 var offset=0
 while(true){
  val page=call(path+(if('?' in path)"&" else "?")+"offset=$offset",fresh=true)
  page.optJSONArray(key).objects().forEach{row->
   val id=row.optString("id").ifBlank{row.optString("href").substringAfterLast('/')}
   if(CurrentNavigation.safeID(id))rows[id]=row
  }
  if(page.isNull(next))break
  val following=page.optInt(next,-1)
  if(following<=offset)break
  offset=following
 }
 return rows.values.toList()
}

internal suspend fun loadDubCatalogue(api:NativeApi,finished:Boolean,show:(DubCatalogue)->Unit)=coroutineScope{
 val list=async{api.collectDubPages("/api/dubbing/projects?tab="+if(finished)"popular" else "open")}
 val activity=async{if(finished)api.collectDubPages("/api/community/rankings?category=dubbing&period=week","rows","next_offset")
                     else api.collectDubPages("/api/play/participate")}
 val projects=list.await()
 fun plain(p:JSONObject)=DubWork(p,null,finished,0,null,null)
 show(DubCatalogue(projects.map(::plain)))
 if(projects.isEmpty()){activity.cancel();return@coroutineScope}
 val activityRows=activity.await()
 val recent=Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul")).apply{
  add(Calendar.DAY_OF_MONTH,-((get(Calendar.DAY_OF_WEEK)+5)%7))
  set(Calendar.HOUR_OF_DAY,0);set(Calendar.MINUTE,0);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0)
 }.timeInMillis/1000
 val weeklyActive=activityRows.filter{it.optLong("created")>=recent}.map{it.optString("id")}.toSet()
 val chart=activityRows.mapIndexed{i,p->p.optString("id").ifBlank{p.optString("href").substringAfterLast('/')} to p.optInt("rank",i+1)}.toMap()
 val slots=Semaphore(3)
 val info=projects.map{p->async{slots.withPermit{
  try{api.call("/api/dubbing/projects/"+p.getString("id")).optJSONObject("project")}
  catch(e:CancellationException){throw e}catch(_:Exception){null}
 }}}.awaitAll()
 val results=linkedMapOf<String,DubWork>()
 for((index,p) in projects.withIndex()){
  val detail=info[index]
  val versions=detail?.optJSONArray("versions")?.objects()
  val group=if(finished)detail?.optString("rootId").orEmpty().ifBlank{p.getString("id")} else p.getString("id")
  val ranks=(versions.orEmpty().map{it.optString("id")}+p.getString("id")).mapNotNull(chart::get)
  val item=DubWork(p,versions,finished,versions.orEmpty().count{it.optString("id") in weeklyActive},index+1,ranks.minOrNull())
  results.putIfAbsent(group,item)
 }
 show(DubCatalogue(results.values.toList(),info.any{it?.optJSONArray("versions")==null}))
}
