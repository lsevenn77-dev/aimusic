package kr.co.aifect.app

/** Count completed listening, never skips or seeks to the end. Saturate while an ad is unavailable. */
class SongAdCadence(count:Int=0) {
 var completed=count.coerceIn(0,5)
  private set
 val due get()=completed>=5
 fun finish(listenedMs:Long,durationMs:Long,preview:Boolean=false) {
  if(!preview&&durationMs>0&&listenedMs>=durationMs*.9)completed=(completed+1).coerceAtMost(5)
 }
 fun shown(){completed=0}
}
