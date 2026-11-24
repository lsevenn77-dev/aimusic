import {one} from './db.js';

// Historical totals remain available in the admin audit. Unified playlists
// deliberately retain covers, so this policy has no pending work or writer.
export async function playlistCleanupStatus(env) {
 const prefix='playlist-originals:20261106:';
 const plan=await one(env,'SELECT target FROM admin_audit WHERE id=?',prefix+'plan');
 const removed=await one(env,"SELECT COALESCE(sum(json_extract(target,'$.removed')),0) n FROM admin_audit WHERE action='playlist:originals:removed' AND id LIKE ?",prefix+'%');
 return {plan:plan?JSON.parse(plan.target):null,removed:removed.n,remaining:0,retired:true};
}
