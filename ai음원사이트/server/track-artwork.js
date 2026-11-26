// Both public catalogues and the protected media route resolve the current track rows.
export function trackArtworkSQL(){
 const own="(t.has_cover=1 OR t.cover_version!='') AND t.cover_version NOT LIKE 'profile-%'";
 const original="(o.has_cover=1 OR o.cover_version!='') AND o.cover_version NOT LIKE 'profile-%' AND o.status!='deleted' AND ((o.status='published' AND o.karaoke_at>0) OR o.user_id=t.user_id)";
 return `CASE WHEN ${own} THEN t.id WHEN ${original} THEN o.id END artwork_id,
  CASE WHEN ${own} OR (${original}) THEN 1 ELSE 0 END has_cover,
  CASE WHEN ${own} THEN t.cover_version WHEN ${original} THEN o.cover_version ELSE '' END cover_version,
  CASE WHEN ${own} THEN 1 ELSE 0 END work_has_cover,t.cover_version work_cover_version`;
}
export function artworkURL(track){
 return track.artwork_id?`/media/${encodeURIComponent(track.artwork_id)}/cover?artwork=track&v=${encodeURIComponent(track.cover_version||'original')}`:'/assets/aifect-mark.svg';
}

// Latest media URL for API consumers, including the web and native players.
export function currentArtworkURL(track){
 return track.artwork_id ? artworkURL(track) : '/assets/brand/20261117/aifect-icon-512.png';
}
