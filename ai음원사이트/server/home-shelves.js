// Home-only candidate reads. Cold selection sorts narrow public IDs once; no
// chart recalculation, mood histogram, per-card SQL or object-storage probes.
import {publicPlaylistSQL} from './playlist-visibility.js';
import {playlistEligibleSQL} from '../shared/playlist-policy.js';
import {query,rows} from './db.js';
import {CHART_ORIGINAL,chartPublication} from './popular-chart.js';
import {VISIBLE,trackList} from './catalog.js';
import {activePlaylistSQL} from './membership.js';
import {playlistSummaries} from './discovery.js';

const PAGE=64,ROUNDS=3,RECENT_SECONDS=30*86400;
const hasIds='SELECT value FROM json_each(?)';
// One deployed Worker serves one fixed DB. Share short-lived seed IDs, never
// user decisions, resolved cards, or I/O promises between Worker requests.
const seedCache=new Map();
async function seeds(key,load){
 const at=Date.now(),cached=seedCache.get(key);
 if(globalThis.caches?.default&&cached?.until>at)return cached.value;
 const value=await load();
 if(globalThis.caches?.default)seedCache.set(key,{until:at+10000,value});
 return value;
}
// Publication is committed only after both audio renditions exist. Check the
// same visibility chain as playback, and exclude broken/unfinished records.
function playable(env){
 const owners=['t.user_id','(SELECT user_id FROM producers WHERE id=t.producer_id)',
  '(SELECT ap.user_id FROM artists a JOIN producers ap ON ap.id=a.producer_id WHERE a.id=t.artist_id)',
  '(SELECT user_id FROM tracks WHERE id=t.original_id)','(SELECT user_id FROM tracks WHERE id=t.duet_parent_id)'];
 const blocked=env.AIFECT_BLOCKED?.length?' OR u.id IN (SELECT value FROM home_blocks)':'';
 return `${VISIBLE()} AND t.duration>0 AND coalesce(t.error,'')='' AND NOT EXISTS
  (SELECT 1 FROM users u WHERE u.id IN (${owners.join(',')}) AND (u.provider='deleted'${blocked}))${env.AIFECT_BLOCKED_ARTISTS?.length?' AND t.artist_id NOT IN (SELECT value FROM home_artists)':''}`;
}
function blockContext(env){
 const entries=[['home_blocks',env.AIFECT_BLOCKED],['home_artists',env.AIFECT_BLOCKED_ARTISTS]].filter(([,ids])=>ids?.length);
 return {cte:entries.length?'WITH '+entries.map(([name])=>name+'(value) AS (SELECT value FROM json_each(?))').join(',')+' ':'',args:entries.map(([,ids])=>JSON.stringify(ids))};
}

export async function homeTracks(env,requested,at=Math.floor(Date.now()/1000)){
 const slots=Math.max(6,Math.min(64,Math.floor(Number(requested))||16)),goal=slots*2+14+7;
 const {cte,args}=blockContext(env),eligible=playable(env),max=PAGE*ROUNDS;
 // Read only IDs/dates for the publication sort. An older draft can have the
 // newest publication, so ordering or pre-limiting by creation is incorrect.
 const [recent,chart,listened,liked]=await seeds('tracks',()=>env.DB.batch([
  query(env,`SELECT t.id,${chartPublication()} published_at FROM tracks t WHERE ${CHART_ORIGINAL()} AND ${chartPublication()}<=? AND t.duration>0 AND coalesce(t.error,'')='' ORDER BY published_at DESC,t.id LIMIT ?`,at,max),
  query(env,`SELECT j.value id FROM (SELECT ranks_json FROM chart_daily_snapshots WHERE period='v2:top:week' ORDER BY day DESC LIMIT 1) s,json_each(s.ranks_json) j LIMIT ?`,max),
  query(env,'SELECT track_id id FROM (SELECT track_id,qualified FROM listens ORDER BY rowid DESC LIMIT ?) WHERE qualified=1',max),
  query(env,'SELECT track_id id FROM likes ORDER BY rowid DESC LIMIT ?',max)
 ]).then(sets=>sets.map(s=>s.results)));
 const checked=new Set(),pool=new Map(),cutoff=at-RECENT_SECONDS;
 for(let i=0;i<ROUNDS;i++){
  const start=i*PAGE,end=start+PAGE;
  const ids=[...new Set([recent,chart,listened,liked].flatMap(source=>source.slice(start,end).map(t=>t.id)))].filter(id=>!checked.has(id));
  ids.forEach(id=>checked.add(id));
  if(ids.length){
   const page=await rows(env,cte+`SELECT t.id,t.created,t.artist_id,t.genre,t.moods_json,${chartPublication()} published_at,
    (SELECT count(DISTINCT listener||day) FROM listens WHERE track_id=t.id AND qualified=1)+3*(SELECT count(*) FROM likes WHERE track_id=t.id) score
    FROM tracks t WHERE t.id IN (${hasIds}) AND ${CHART_ORIGINAL()} AND ${eligible} AND ${chartPublication()}<=?`,...args,JSON.stringify(ids),at);
   for(const t of page)pool.set(t.id,t);
  }
  const releaseCount=recent.slice(0,end).filter(t=>pool.has(t.id)&&t.published_at>=cutoff).length;
  const varied=new Set([...pool.values()].map(t=>[t.artist_id,t.genre,t.moods_json].join(':'))).size>=4;
  if(pool.size>=goal&&varied&&(releaseCount>=slots||recent.length<=end||recent[end-1]?.published_at<cutoff))break;
  if([recent,chart,listened,liked].every(s=>s.length<=end))break;
 }
 const releases=[...pool.values()].filter(t=>t.published_at>=cutoff).sort((a,b)=>b.published_at-a.published_at||a.id.localeCompare(b.id)).slice(0,slots).map(t=>t.id);
 const ranked=[...pool.values()].sort((a,b)=>b.score-a.score||b.created-a.created||a.id.localeCompare(b.id));
 const groups=new Set();
 const varied=ranked.filter(t=>{const k=JSON.stringify([t.artist_id,t.genre,t.moods_json]);if(groups.has(k))return false;groups.add(k);return true;}).slice(0,14);
 const chosen=[...new Set([...releases,...ranked.slice(0,goal).map(t=>t.id),...varied.map(t=>t.id)])];
 if(!chosen.length)return {tracks:[],releases:[]};
 // Authorization was checked above; recheck on hydration without expanding a
 // block list into one D1 bind parameter per account.
 const result=await trackList({...env,AIFECT_BLOCKED:[],AIFECT_BLOCKED_ARTISTS:[]},`${CHART_ORIGINAL()} AND t.id IN (${hasIds}) AND ${eligible.replaceAll('SELECT value FROM home_blocks','SELECT value FROM json_each(?)').replaceAll('SELECT value FROM home_artists','SELECT value FROM json_each(?)')}`,
  [JSON.stringify(chosen),...args],'t.id',chosen.length);
 const details=new Map(result.map(t=>[t.id,t]));
 return {tracks:ranked.map(t=>details.get(t.id)).filter(Boolean),releases:releases.filter(id=>details.has(id))};
}

export async function homePlaylists(env,uid){
 const {cte,args}=blockContext(env),visible=playable(env)+' AND '+playlistEligibleSQL(),size=48;
 // Sort only a capped window of IDs once. Run lock, member and artwork checks
 // on bounded pages, and fetch full summaries only for the final six.
 const index=await seeds('playlists',()=>rows(env,`SELECT p.id FROM playlists p WHERE ${publicPlaylistSQL()}
  ORDER BY p.created DESC,p.id LIMIT ?`,size*ROUNDS));
 const owner="EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.provider!='deleted')"+
  (env.AIFECT_BLOCKED?.length?' AND p.user_id NOT IN (SELECT value FROM home_blocks)':'');
 const ids=[];
 for(let i=0;i<index.length&&ids.length<6;i+=size){
  const page=await rows(env,cte+`SELECT p.id FROM playlists p WHERE p.id IN (${hasIds})
   AND ${publicPlaylistSQL()} AND ${owner} AND ${activePlaylistSQL()} AND EXISTS(SELECT 1 FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id
   WHERE pt.playlist_id=p.id AND ${visible}) ORDER BY p.created DESC,p.id LIMIT ?`,...args,JSON.stringify(index.slice(i,i+size).map(p=>p.id)),6-ids.length);
  ids.push(...page.map(p=>p.id));
 }
 if(!ids.length)return [];
 return playlistSummaries(env,uid,`${publicPlaylistSQL()} AND p.id IN (${hasIds}) AND ${owner} AND ${activePlaylistSQL()}`,
  [JSON.stringify(ids)],'p.created DESC,p.id',6,[],{cte,args,visible:playable({...env,AIFECT_BLOCKED:[],AIFECT_BLOCKED_ARTISTS:[]})});
}

