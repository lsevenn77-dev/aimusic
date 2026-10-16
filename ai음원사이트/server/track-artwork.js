// Artwork is presentation metadata. Keep the original upload and stored track art intact.
export const coverArtworkVersion=profile=>'profile-'+(profile?.image_version||'default-v1');
export const trackArtworkSQL=(track='t',producer='p')=>`CASE WHEN ${track}.kind='cover' THEN 1 ELSE ${track}.has_cover END has_cover,CASE WHEN ${track}.kind='cover' THEN 'profile-'||COALESCE(NULLIF(${producer}.image_version,''),'default-v1') ELSE ${track}.cover_version END cover_version`;
export const trackArtwork=(track,profile)=>track.kind==='cover'?{...track,has_cover:1,cover_version:coverArtworkVersion(profile),producer_image_version:profile?.image_version||''}:track;
