import {lyricSearchIntent,normalizeLyricTerm,LYRIC_ANALYSIS_VERSION} from '../shared/lyric-semantics.js';
import {compactSearchSQL} from './search-match.js';
import {producerNameSQL} from './identity.js';

export function lyricSearchScope(q){
 const intent=lyricSearchIntent(q),tags=JSON.stringify(intent.tags.map(t=>t.id)),terms=JSON.stringify(intent.keywords);
 if(!intent.tags.length&&!intent.keywords.length)return null;
 // Indexed postings first. Never scan lyrics or send the catalogue to the browser.
 const candidates=[],args=[];
 if(intent.tags.length){candidates.push("SELECT s.track_id FROM lyric_search_tags s JOIN lyric_analysis_jobs j ON j.track_id=s.track_id WHERE s.tag_id IN (SELECT value FROM json_each(?)) AND j.state IN ('done','no_lyrics') AND j.version=?");args.push(tags,LYRIC_ANALYSIS_VERSION);}
 if(intent.keywords.length){candidates.push("SELECT s.track_id FROM lyric_search_terms s JOIN lyric_analysis_jobs j ON j.track_id=s.track_id WHERE s.term IN (SELECT value FROM json_each(?)) AND j.state='done' AND j.version=? GROUP BY s.track_id HAVING count(DISTINCT s.term)=?");args.push(terms,LYRIC_ANALYSIS_VERSION,intent.keywords.length);}
 const score=intent.tags.length?`(SELECT COALESCE(count(*)*100+sum(s.confidence)*10+sum(CASE WHEN s.role='primary' THEN 3 ELSE 0 END),0) FROM lyric_search_tags s JOIN lyric_analysis_jobs j ON j.track_id=s.track_id WHERE s.track_id=t.id AND s.tag_id IN (SELECT value FROM json_each(?)) AND j.state IN ('done','no_lyrics') AND j.version=?)`:`(SELECT COALESCE(sum(s.weight),0) FROM lyric_search_terms s JOIN lyric_analysis_jobs j ON j.track_id=s.track_id WHERE s.track_id=t.id AND s.term IN (SELECT value FROM json_each(?)) AND j.state='done' AND j.version=?)`;
 const scoreArgs=[intent.tags.length?tags:terms,LYRIC_ANALYSIS_VERSION];
 // Tier boundaries cannot be crossed by accumulating tags.
 const title=compactSearchSQL('t.title'),artist=compactSearchSQL('a.name'),producer=compactSearchSQL(producerNameSQL()),normalized=normalizeLyricTerm(q);
 const tier=`CASE WHEN ${title}=NULLIF(?,'') THEN 0 WHEN ${artist}=NULLIF(?,'') OR ${producer}=NULLIF(?,'') THEN 1 WHEN instr(${title},NULLIF(?,''))>0 THEN 2 ELSE 3 END`;
 return {sql:`t.id IN (${candidates.join(' UNION ')})`,args,sort:`${tier},${score} DESC`,sortArgs:[normalized,normalized,normalized,normalized,...scoreArgs],intent};
}
