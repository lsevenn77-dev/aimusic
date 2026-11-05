import {rows} from './db.js';
import {VISIBLE} from './catalog.js';
import {namedArtistSQL} from './artist-identity.js';
import {producerNameSQL} from './identity.js';
import {partnerBadgeSQL} from './partner-badges.js';

// Reuse the artist directory's real-follow popularity basis. Producers have no
// separate composer identity/ranking model; only published original creators qualify.
export async function profileDiscovery(env,kind,sort='popular',limit=10){
 const artist=kind==='artist',alias=artist?'a':'p',blocked=env.AIFECT_BLOCKED||[];
 const visible=`${VISIBLE()} AND t.kind='original' AND t.${kind}_id=${alias}.id`;
 const blockedSQL=blocked.length?' AND p.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':'';
 const profiles=await rows(env,`SELECT ${alias}.id,${artist?'a.name':producerNameSQL()} name,${alias}.image_version,p.user_id,${artist?'0':partnerBadgeSQL('p.user_id')} partner_eligible,
 (SELECT count(*) FROM follows f WHERE f.kind=? AND f.target_id=${alias}.id) followers,
 (SELECT max(t.created) FROM tracks t WHERE ${visible}) latest_track
 FROM ${artist?'artists a JOIN producers p ON p.id=a.producer_id':'producers p'}
 JOIN users u ON u.id=p.user_id WHERE u.provider!='deleted'${artist?' AND '+namedArtistSQL():''}
 AND EXISTS(SELECT 1 FROM tracks t WHERE ${visible})${blockedSQL}
 ORDER BY ${sort==='latest'?'latest_track DESC,followers DESC':'followers DESC,'+alias+'.created DESC'},${alias}.id LIMIT ?`,kind,...blocked,limit);
 return profiles.map(({user_id,followers,latest_track,partner_eligible,...p})=>({...p,...(!artist?{partner_badge:partner_eligible?'공식 파트너':null}:{})}));
}
