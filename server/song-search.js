import {trackBlockScope} from './block-policy.js';
import {one} from './db.js';
import {producerNameSQL} from './identity.js';
import {searchRank} from './search-rank.js';
import {songTextMatch,compactSearchSQL,compactSearchText} from './search-match.js';
import {alternativeTrackMatches,initialQuery,koreanInitials} from './search-fallback.js';
import {lyricSearchScope} from './lyric-search.js';

const from = 'FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id';

// Evaluate blocks before ranking, counts, and suggestions, including attributed creators.
export function songBlockScope(blocked,artists=[]) {
 return trackBlockScope({AIFECT_BLOCKED:blocked,AIFECT_BLOCKED_ARTISTS:artists});
}

// The caller supplies the public, unblocked and taxonomy-filtered scope.
// Keep its bindings first for both the existence check and the paged result.
export function exactSongScope(q,where) {
 const initials = initialQuery(q);
 const rank = searchRank(initials ? koreanInitials(q) : q,
  ['t.title','a.name',producerNameSQL(),'t.genre','t.tags'],
  'UNION ALL SELECT value FROM json_each(t.genres_json)',false);
 const match = initials ? {sql:rank.sql+'<6',args:[rank.plan]} : songTextMatch(q);
 const semantic=initials?null:lyricSearchScope(q);
 const exactWhere = where+' AND '+(semantic?'('+match.sql+' OR '+semantic.sql+')':match.sql);
 const titlePriority = 'CASE WHEN t.title=? THEN 0 WHEN '+compactSearchSQL('t.title')+'=NULLIF(?,\'\') THEN 1 ELSE 2 END';
 return {where:exactWhere,args:[...match.args,...(semantic?.args||[])],exact:true,
  sort:semantic?semantic.sort+','+rank.sql:titlePriority+','+rank.sql,
  sortArgs:semantic?[...semantic.sortArgs,rank.plan]:[q,compactSearchText(q),rank.plan]};
}

export async function fallbackSongScope(env,q,where,params) {
 const alternative = await alternativeTrackMatches(env,q,{where,args:params,limit:4000});
 if (!alternative) return null;
 const ids = JSON.stringify(alternative.ids);
 return {
  where:where+' AND t.id IN (SELECT value FROM json_each(?))',args:[ids],
  sort:'(SELECT key FROM json_each(?) WHERE value=t.id)',sortArgs:[ids],
  correction:alternative.kind==='typo'?{type:'typo',suggestion:alternative.suggested}:null
 };
}

export async function songSearchScope(env,q,where,params) {
 const exact = exactSongScope(q,where);
 const found = await one(env,'SELECT 1 found '+from+' WHERE '+exact.where+' LIMIT 1',...params,...exact.args);
 if (found) return exact;
 return await fallbackSongScope(env,q,where,params) || {where:where+' AND 0',args:[],sort:'t.id',sortArgs:[]};
}
