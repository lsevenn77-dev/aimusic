export {playlistCandidates} from './playlist-items.js';
import {isPlaylistEligibleTrack,PLAYLIST_INELIGIBLE_MESSAGE} from '../shared/playlist-policy.js';
import {one,fail} from './db.js';
import {published} from './catalog.js';

export async function requirePlaylistTrack(env,tid) {
 // Read the stored discriminator before publication checks, including dubbing
 // and nonexistent IDs. Client-supplied kind fields are never trusted.
 const track=await one(env,'SELECT kind FROM tracks WHERE id=?',tid);
 if(!isPlaylistEligibleTrack(track))fail(400,PLAYLIST_INELIGIBLE_MESSAGE);
 return published(env,tid);
}
