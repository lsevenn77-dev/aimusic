// `tracks.kind` is the persisted content discriminator. A cover's original_id
// identifies its source; it never makes the cover itself a produced song.
export const PLAYLIST_TRACK_KIND = 'original';
export function normalizePlaylistTitle(value) {
 return String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
}
export const PLAYLIST_INELIGIBLE_MESSAGE = '플레이리스트에는 제작곡만 추가할 수 있어요.';
export function isPlaylistEligibleTrack(track) {
 return track?.kind === PLAYLIST_TRACK_KIND;
}
export function playlistEligibleSQL(alias='t') {
 if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias))throw new Error('Invalid track alias');
 return `${alias}.kind='${PLAYLIST_TRACK_KIND}'`;
}
