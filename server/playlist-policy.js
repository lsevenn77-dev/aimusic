import {isPlaylistEligibleTrack,PLAYLIST_INELIGIBLE_MESSAGE,playlistEligibleSQL} from '../shared/playlist-policy.js';
import {one,fail,json} from './db.js';
import {published,trackList,VISIBLE} from './catalog.js';
import {requireUser} from './auth.js';
import {songTextMatch,searchText} from './search-match.js';

export async function requirePlaylistTrack(env,tid) {
 // Read the stored discriminator before publication checks, including dubbing
 // and nonexistent IDs. Client-supplied kind fields are never trusted.
 const track=await one(env,'SELECT kind FROM tracks WHERE id=?',tid);
 if(!isPlaylistEligibleTrack(track))fail(400,PLAYLIST_INELIGIBLE_MESSAGE);
 return published(env,tid);
}
export async function playlistCandidates(req,env,user) {
 requireUser(user);
 const params=new URL(req.url).searchParams,source=params.get('source')||'search';
 let where=`${VISIBLE()} AND ${playlistEligibleSQL()}`,args=[],sort='t.created DESC,t.id';
 if(source==='likes'){where+=' AND EXISTS(SELECT 1 FROM likes l WHERE l.track_id=t.id AND l.user_id=?)';args.push(user.id);}
 else if(source==='history'){where+=' AND EXISTS(SELECT 1 FROM listens l WHERE l.track_id=t.id AND l.user_id=?)';args.push(user.id);sort=`(SELECT MAX(started) FROM listens l WHERE l.track_id=t.id AND l.user_id='${user.id.replaceAll("'","''")}') DESC,t.id`;}
 else if(source!=='search')fail(400,'곡 목록을 확인해주세요.');
 const q=searchText(params.get('q'));
 if(q){const match=songTextMatch(q);where+=' AND '+match.sql;args.push(...match.args);}
 return json({tracks:await trackList(env,where,args,sort,500)});
}
