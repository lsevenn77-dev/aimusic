import {one} from './db.js';
import {producerNameSQL} from './identity.js';
import {searchRank} from './search-rank.js';
import {songTextMatch,compactSearchSQL,compactSearchText} from './search-match.js';
import {alternativeTrackMatches,initialQuery,koreanInitials} from './search-fallback.js';

const from = 'FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id';

// Evaluate blocks before ranking, counts, and suggestions, including attributed creators.
export function songBlockScope(blocked) {
 if (!blocked.length) return {sql:'',args:[]};
 return {
  sql:' AND NOT EXISTS (SELECT 1 FROM json_each(?) blocked WHERE blocked.value IN (t.user_id,p.user_id,(SELECT ap.user_id FROM producers ap WHERE ap.id=a.producer_id)))',
  args:[JSON.stringify(blocked)]
 };
}

// The caller supplies the public, unblocked and taxonomy-filtered scope.
// Keep its bindings first for both the existence check and the paged result.
export async function songSearchScope(env,q,where,params) {
 const initials = initialQuery(q);
 const rank = searchRank(initials ? koreanInitials(q) : q,
  ['t.title','a.name',producerNameSQL(),'t.genre','t.tags'],
  'UNION ALL SELECT value FROM json_each(t.genres_json)',false);
 const match = initials ? {sql:rank.sql+'<6',args:[rank.plan]} : songTextMatch(q);
 const exactWhere = where+' AND '+match.sql;
 const exists = await one(env,'SELECT 1 found '+from+' WHERE '+exactWhere+' LIMIT 1',...params,...match.args);
 if (exists) {
  const titlePriority = 'CASE WHEN t.title=? THEN 0 WHEN '+compactSearchSQL('t.title')+'=NULLIF(?,\'\') THEN 1 ELSE 2 END';
  return {where:exactWhere,args:match.args,exact:true,sort:titlePriority+','+rank.sql,sortArgs:[q,compactSearchText(q),rank.plan]};
 }

 const alternative = await alternativeTrackMatches(env,q,{where,args:params,limit:4000});
 if (!alternative) return {where:where+' AND 0',args:[],sort:'t.id',sortArgs:[]};
 const ids = JSON.stringify(alternative.ids);
 return {
  where:where+' AND t.id IN (SELECT value FROM json_each(?))',args:[ids],
  sort:'(SELECT key FROM json_each(?) WHERE value=t.id)',sortArgs:[ids],
  correction:alternative.kind==='typo'?{type:'typo',suggestion:alternative.suggested}:null
 };
}
