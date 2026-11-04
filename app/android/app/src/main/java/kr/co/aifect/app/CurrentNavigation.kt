package kr.co.aifect.app

import java.net.URI
import java.net.URLEncoder

/** The web audio workspaces stay inside the product origin; no arbitrary URL bridge. */
internal object CurrentNavigation {
 private val id=Regex("[A-Za-z0-9_-]{1,120}")
 fun safeID(value:String)=id.matches(value)
 fun query(value:String)=URLEncoder.encode(value,"UTF-8")
 fun workspaceRoute(route:String):Boolean {
  if(route.length>500||route.contains('\\')||route.contains("..")||route.contains('\n')||route.contains('\r'))return false
  val path=route.removePrefix("#").substringBefore('?')
  val parts=path.split('/')
  return when(parts.firstOrNull()){
   "community"->path=="community/crews"
   "dubbing"->parts.size==2&&(parts[1]=="new"||safeID(parts[1]))
   "voice","live"->parts.size==2&&safeID(parts[1])
   "crew"->parts.size==2&&safeID(parts[1])
   "profile-gallery","profile-artists","producer-songs"->parts.size==2&&safeID(parts[1])
   "relations","gift-inventory"->parts.size==1
   else->false
  }
 }
 fun sameOrigin(url:String,origin:String):Boolean=runCatching{
  val u=URI(url);val o=URI(origin)
  fun port(v:URI)=if(v.port!=-1)v.port else if(v.scheme=="https")443 else 80
  u.scheme==o.scheme&&u.host.equals(o.host,true)&&port(u)==port(o)&&u.userInfo==null
 }.getOrDefault(false)
 fun playPath(mode:String,section:String,type:String="all"):String=when(mode){
  "dubbing"->if(section=="join")"/api/play/participate" else "/api/dubbing/projects?tab="+if(section=="mine")"mine" else "open"
  "browse"->"/api/play/works?tab=${if(section in setOf("recommended","following","popular","latest"))section else "recommended"}&type=${if(type in setOf("all","solo","duet","dubbing"))type else "all"}"
  else->when(section){"duets"->"/api/duets";"latest"->"/api/community?kind=cover";else->"/api/karaoke"}
 }
}

internal data class CurrentWorkspace(val route:String,val title:String){init{require(CurrentNavigation.workspaceRoute(route))}}
