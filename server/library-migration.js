import {hash} from './auth.js';
import {one,rows,query,now} from './db.js';
import {normalizePlaylistTitle} from '../shared/playlist-policy.js';
import {libraryTransaction} from './library-transactions.js';

const prefix='library-v2:20261118:',actor='owner-request:20261118:library-v2';
const pending=`p.name_key IS NULL OR (EXISTS(SELECT 1 FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND t.kind='cover')) OR (NOT EXISTS(SELECT 1 FROM admin_audit done WHERE done.id='${prefix}done:'||p.id) AND EXISTS(SELECT 1 FROM admin_audit old WHERE old.action='playlist:originals:backup' AND json_extract(old.target,'$.playlist_id')=p.id))`;
export async function libraryMigrationStatus(env){
 const summary=await one(env,`SELECT (SELECT count(*) FROM playlists p WHERE ${pending}) pending,
 (SELECT count(*) FROM (SELECT name_key FROM playlists WHERE name_key IS NOT NULL GROUP BY name_key HAVING count(*)>1)) duplicate_title_groups,
 (SELECT count(*) FROM my_boxes WHERE source_playlist_id IS NOT NULL) migrated_boxes,
 (SELECT count(*) FROM my_box_items i JOIN my_boxes b ON b.id=i.box_id WHERE b.source_playlist_id IS NOT NULL) preserved_items,
 (SELECT count(*) FROM admin_audit WHERE action='library:v2:backup') backups,
 (SELECT count(*) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE t.kind NOT IN ('original','cover')) unsupported_items`);
 const plan=await one(env,'SELECT target FROM admin_audit WHERE id=?',prefix+'plan');
 return {...summary,plan:plan?JSON.parse(plan.target):null};
}
// Runs only on the authenticated existing worker heartbeat. DDL is exclusively
// in Drizzle. Each backup commits before its bounded, reentrant data transaction.
export async function migrateLibraryBatch(env){
 await query(env,`INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,'library:v2:plan',json_object('playlists',(SELECT count(*) FROM playlists),'memberships',(SELECT count(*) FROM playlist_tracks),'bookmarks',(SELECT count(*) FROM playlist_saves),'non_original_memberships',(SELECT count(*) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE t.kind!='original'),'historical_backups',(SELECT count(*) FROM admin_audit WHERE action='playlist:originals:backup')),?`,prefix+'plan',actor,now()).run();
 const candidates=await rows(env,`SELECT p.* FROM playlists p WHERE ${pending} ORDER BY p.id LIMIT 20`);
 for(const p of candidates){
  const members=await rows(env,'SELECT pt.*,t.kind FROM playlist_tracks pt LEFT JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=? ORDER BY pt.position,pt.created,pt.track_id',p.id);
  const history=await rows(env,"SELECT a.id,a.target,t.kind FROM admin_audit a JOIN tracks t ON t.id=json_extract(a.target,'$.track_id') WHERE a.action='playlist:originals:backup' AND json_extract(a.target,'$.playlist_id')=? AND t.kind='cover' ORDER BY a.created,a.id",p.id);
  const saved=await rows(env,'SELECT * FROM playlist_saves WHERE playlist_id=?',p.id),preferences=await rows(env,'SELECT * FROM playlist_preferences WHERE playlist_id=?',p.id);
  const snapshot={playlist:p,members,bookmarks:saved,preferences,historical_backups:history};
  await query(env,'INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',prefix+'backup:'+p.id+':'+(await hash(JSON.stringify(snapshot))).slice(0,20),actor,'library:v2:backup',JSON.stringify(snapshot),now()).run();
  const map=new Map();for(const item of history){const row=JSON.parse(item.target);map.set(row.track_id,{...row,kind:item.kind});}for(const item of members)if(item.kind==='cover')map.set(item.track_id,item);
  const entries=[...map.values()].sort((a,b)=>a.position-b.position||a.created-b.created||a.track_id.localeCompare(b.track_id)),bid='legacy-'+p.id;
  const statements=[query(env,'INSERT OR IGNORE INTO playlist_title_claims(key) VALUES(?)',normalizePlaylistTitle(p.name)),query(env,'UPDATE playlists SET name_key=?,updated=CASE WHEN updated=0 THEN created ELSE updated END WHERE id=?',normalizePlaylistTitle(p.name),p.id)];
  if(entries.length){
   statements.push(query(env,'INSERT OR IGNORE INTO my_boxes(id,user_id,name,created,updated,source_playlist_id) VALUES(?,?,?,?,?,?)',bid,p.user_id,p.name,p.created,now(),p.id));
   // Resolve the unique source mapping on every retry, preserving user renames.
   statements.push(query(env,"INSERT OR IGNORE INTO my_box_items(box_id,kind,content_id,position,created) SELECT (SELECT id FROM my_boxes WHERE source_playlist_id=?),'cover',json_extract(value,'$.track_id'),CAST(key AS INTEGER),json_extract(value,'$.created') FROM json_each(?)",p.id,JSON.stringify(entries)));
   statements.push(query(env,"DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id IN (SELECT i.content_id FROM my_box_items i JOIN my_boxes b ON b.id=i.box_id JOIN tracks t ON t.id=i.content_id AND t.kind='cover' WHERE b.source_playlist_id=? AND i.kind='cover')",p.id,p.id));
  }
  statements.push(query(env,"INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,'library:v2:done',?,?)",prefix+'done:'+p.id,actor,JSON.stringify({playlist_id:p.id,preserved:entries.length,title_unchanged:true}),now()));
  await libraryTransaction(env,[['EXISTS(SELECT 1 FROM playlists WHERE id=? AND name=? AND revision=?)',[p.id,p.name,p.revision]],['(SELECT count(*) FROM playlist_tracks WHERE playlist_id=?)=?',[p.id,members.length]],['NOT EXISTS(SELECT 1 FROM playlist_tracks pt WHERE pt.playlist_id=? AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,\'$.track_id\')=pt.track_id AND json_extract(j.value,\'$.position\')=pt.position))',[p.id,JSON.stringify(members)]]],statements);
 }
 return libraryMigrationStatus(env);
}
let next=0;
export function queueLibraryMigration(env,ctx){
 if(!ctx?.waitUntil||Date.now()<next)return;next=Date.now()+15000;
 ctx.waitUntil(migrateLibraryBatch(env).then(r=>{if(!r.pending)next=Date.now()+3600000;console.log('Library v2 migration',JSON.stringify(r));}).catch(()=>{next=0;console.error('Library v2 migration pending; existing records retained');}));
}
