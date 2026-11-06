import {one,rows,query,now,id} from './db.js';
import {playlistEligibleSQL} from '../shared/playlist-policy.js';

const PREFIX='playlist-originals:20261106:';
const ACTOR='owner-request:20261106:playlist-originals';
const invalid=`NOT EXISTS(SELECT 1 FROM tracks t WHERE t.id=pt.track_id AND ${playlistEligibleSQL()})`;
const planAction='playlist:originals:plan',backupAction='playlist:originals:backup',resultAction='playlist:originals:removed';

export async function playlistCleanupStatus(env) {
 const plan=await one(env,'SELECT target FROM admin_audit WHERE id=?',PREFIX+'plan');
 const removed=await one(env,'SELECT COALESCE(sum(json_extract(target,\'$.removed\')),0) count FROM admin_audit WHERE action=? AND id LIKE ?',resultAction,PREFIX+'%');
 const remaining=await one(env,`SELECT count(*) count FROM playlist_tracks pt WHERE ${invalid}`);
 return {plan:plan?JSON.parse(plan.target):null,removed:removed.count,remaining:remaining.count};
}

// Owner-authorized one-time maintenance. The existing authenticated worker
// heartbeat runs bounded batches; reads and visitor requests never delete data.
export async function cleanupPlaylistTracks(env) {
 const at=now();
 // Commit the type/count report BEFORE deleting anything. The first snapshot is
 // durable and immutable even when heartbeat requests overlap or a batch retries.
 await query(env,`INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created)
  SELECT ?,?,?,json_object('policy','tracks.kind = original','groups',json((SELECT json_group_array(json_object('kind',kind,'cover_mode',cover_mode,'state',state,'count',n)) FROM
   (SELECT COALESCE(t.kind,'missing') kind,COALESCE(t.cover_mode,'') cover_mode,
    CASE WHEN t.kind='cover' AND t.cover_mode='duet' AND t.duet_parent_id IS NULL THEN 'recruiting' ELSE 'completed' END state,count(*) n
    FROM playlist_tracks pt LEFT JOIN tracks t ON t.id=pt.track_id WHERE ${invalid} GROUP BY t.kind,t.cover_mode,state))),
   'original_memberships',(SELECT count(*) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE ${playlistEligibleSQL()})),?`,PREFIX+'plan',ACTOR,planAction,at).run();
 const batchId=PREFIX+id();
 // Snapshot each membership (including order and creation time) for recovery.
 await query(env,`INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created)
  SELECT ?||pt.playlist_id||':'||pt.track_id||':'||pt.created||':'||pt.position,?,?,
   json_object('playlist_id',pt.playlist_id,'track_id',pt.track_id,'created',pt.created,'position',pt.position,'kind',t.kind,'cover_mode',t.cover_mode,'batch',?),?
  FROM playlist_tracks pt LEFT JOIN tracks t ON t.id=pt.track_id WHERE ${invalid}
  ORDER BY pt.playlist_id,pt.track_id LIMIT 100`,PREFIX+'entry:',ACTOR,backupAction,batchId,at).run();
 // Recheck current type inside the deletion transaction: even a track corrected
 // to original after the audit snapshot is preserved. No tracks/media are deleted.
 await env.DB.batch([
  query(env,`DELETE FROM playlist_tracks AS pt WHERE ${invalid} AND EXISTS(
   SELECT 1 FROM admin_audit a WHERE a.action=? AND a.id=?||pt.playlist_id||':'||pt.track_id||':'||pt.created||':'||pt.position
    AND json_extract(a.target,'$.position')=pt.position)`,backupAction,PREFIX+'entry:'),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,json_object('removed',changes()),?)`,batchId,ACTOR,resultAction,at)
 ]);
 return playlistCleanupStatus(env);
}
let next=0;
export function queuePlaylistCleanup(env,ctx) {
 if(!ctx?.waitUntil||Date.now()<next)return;
 next=Date.now()+60000;
 ctx.waitUntil((async()=>{
  const status=await playlistCleanupStatus(env);
  if(status.plan&&status.remaining===0)return;
  const result=await cleanupPlaylistTracks(env);
  console.log('Playlist originals cleanup',JSON.stringify(result));
 })().catch(()=>{next=0;console.error('Playlist originals cleanup pending');}));
}
