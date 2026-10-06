package kr.co.aifect.app

/** Handles repeated LRC time tags and offsets; lyric rows remain on the playback timeline. */
internal fun parseDisplayLyrics(lrc:String):List<Pair<Double,String>> {
 val offset=Regex("\\[offset:([+-]?\\d+)\\]",RegexOption.IGNORE_CASE).find(lrc)?.groupValues?.get(1)?.toDoubleOrNull()?.div(1000)?:0.0
 val tag=Regex("\\[(\\d+):(\\d+(?:\\.\\d+)?)\\]")
  return lrc.lineSequence().flatMap{line->val tags=tag.findAll(line).toList();val text=if(tags.isEmpty())"" else line.substring(tags.last().range.last+1).trim();tags.asSequence().map{((it.groupValues[1].toDouble()*60+it.groupValues[2].toDouble()+offset).coerceAtLeast(0.0)) to text}}.sortedBy{it.first}.groupBy{it.first}.map{(time,rows)->time to rows.map{it.second}.filter{it.isNotBlank()}.distinct().joinToString(" / ")}
}
internal fun compactLyrics(rows:List<Pair<Double,String>>,seconds:Double,fallback:String):Pair<String,String?> {
 if(rows.isEmpty())return fallback.ifBlank{"가사를 불러오는 중…"} to null
 val index=rows.indexOfLast{it.first<=seconds}
 return (rows.getOrNull(index)?.second?.ifBlank{"♪"}?:"♪") to rows.getOrNull(index+1)?.second?.takeIf{it.isNotBlank()}
}
