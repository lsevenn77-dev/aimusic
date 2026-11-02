import {query} from './db.js';

// Callers construct this from a verified route target, never from a client label.
export function giftSourceEntry(env,currency,giftId,source){
 return query(env,'INSERT INTO gift_sources(currency,gift_id,source_type,source_id,source_title,work_kind) VALUES(?,?,?,?,?,?)',
  currency,giftId,source.type,source.id,source.title,source.workKind??null);
}

export function giftTargetSource(track,dubbing){
 if(dubbing)return {type:'work',id:dubbing.id,title:dubbing.title,workKind:'dubbing'};
 if(track.id)return {type:'work',id:track.id,title:track.title,workKind:'song'};
 return {type:'profile',id:track.producer_id,title:track.title};
}
