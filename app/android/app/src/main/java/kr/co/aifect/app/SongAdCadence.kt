package kr.co.aifect.app

/** Qualify at 60% actual listening, including manual skips. Seeking alone never counts. */
class SongAdCadence(count:Int=0) {
 var completed=count.coerceIn(0,5)
  private set
 val due get()=completed>=5
 fun finish(listenedMs:Long,durationMs:Long,preview:Boolean=false) {
  if(!preview&&durationMs>0&&listenedMs>=durationMs*.6)completed=(completed+1).coerceAtMost(5)
 }
 fun shown(){completed=0}
}
