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

private fun JSONObject.discoveryLabel(key: String, fallback: String): String =
 (opt(key) as? String)?.takeIf { it.isNotBlank() } ?: optString(fallback)

internal data class DubWork(
 val project:JSONObject, val versions:List<JSONObject>?, val finished:Boolean,
 val weeklyScore:Int, val allRank:Int?, val weeklyRank:Int?,
 val editions:List<JSONObject> = emptyList(), val rootId:String=project.getString("id")
){
 val id:String=project.getString("id")
 val title:String=project.discoveryLabel("rootTitle", "title")
 val creator:String=project.discoveryLabel("rootOwnerName", "ownerName")
 val created:Long=project.optLong("created")
 val beginner:Boolean=project.optBoolean("beginnerRecommended") || project.optJSONObject("options")?.optBoolean("beginnerRecommended")==true
 val seconds:Int=project.optInt("duration")
 val preferredBeginner:Boolean=project.optInt("roleCount")==2 && seconds in 240..300
 val plays:Long? get()=if(finished && editions.isNotEmpty() && editions.all{it.opt("plays") is Number})editions.sumOf{it.getLong("plays")} else null
 val genres=project.optJSONArray("genres").let{arr->List(arr?.length()?:0){arr!!.optString(it)}}
 val count:Int?=when{
  finished -> editions.size
  project.opt("activeCount") is Number -> project.getInt("activeCount")
  else -> versions?.count{it.optString("state") in setOf("recruiting","recording","in_progress","mixing") && it.optString("id")!=rootId && !it.optBoolean("base")}
 }
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
 val list=async{api.collectDubPages("/api/dubbing/projects?tab="+(if(finished)"popular" else "open")+"&discovery=1")}
 val chartRequest=if(finished)async{api.collectDubPages("/api/community/rankings?category=dubbing&period=week","rows","next_offset")} else null
 val projects=list.await()
 if(!finished)show(DubCatalogue(projects.map{DubWork(it,null,false,0,null,null)}))
 if(projects.isEmpty()){chartRequest?.cancel();show(DubCatalogue(emptyList()));return@coroutineScope}
 val activityRows=chartRequest?.await() ?: if(projects.any{it.opt("weeklyActiveCount") !is Number})api.collectDubPages("/api/play/participate") else emptyList()
 val recent=Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul")).apply{
  add(Calendar.DAY_OF_MONTH,-((get(Calendar.DAY_OF_WEEK)+5)%7))
  set(Calendar.HOUR_OF_DAY,0);set(Calendar.MINUTE,0);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0)
 }.timeInMillis/1000
 val weeklyActive=activityRows.filter{it.optLong("created")>=recent}.map{it.optString("id")}.toSet()
 val chart=activityRows.mapIndexed{i,p->p.optString("id").ifBlank{p.optString("href").substringAfterLast('/')} to p.optInt("rank",i+1)}.toMap()
 val slots=Semaphore(3)
 val info=projects.map{p->async{slots.withPermit{
  val enriched=if(finished)!p.isNull("rootId") else p.opt("activeCount") is Number && p.opt("weeklyActiveCount") is Number
  if(enriched)null else try{
   api.call("/api/dubbing/projects/"+p.getString("id")).optJSONObject("project")
  }catch(e:CancellationException){throw e}catch(_:Exception){null}
 }}}.awaitAll()
 val entries=projects.mapIndexed{index,p->
  val detail=info[index]
  val id=p.getString("id")
  val group=sequenceOf(p,detail).mapNotNull{it?.optString("rootId")}.firstOrNull{CurrentNavigation.safeID(it)&&it!="null"}?:id
  val versions=detail?.optJSONArray("versions")?.objects()
  val weekly=if(p.opt("weeklyActiveCount") is Number)p.getInt("weeklyActiveCount")
             else versions.orEmpty().count{it.optString("id")!=group && it.optString("id") in weeklyActive}
  DubWork(p,versions,finished,weekly,index+1,chart[id],rootId=group)
 }
 val results=if(finished)entries.groupBy{it.rootId}.values.map{group->
  val first=group.first()
  first.copy(editions=group.map{it.project},weeklyRank=group.mapNotNull{it.weeklyRank}.minOrNull())
 }else entries
 val incomplete=entries.indices.any{i->if(finished)projects[i].isNull("rootId") && info[i]==null else entries[i].count==null}
 show(DubCatalogue(results,incomplete))
}
