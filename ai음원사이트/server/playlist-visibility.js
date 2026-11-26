export const restrictedSQL = (alias='p') => `EXISTS(SELECT 1 FROM playlist_items restricted WHERE restricted.playlist_id=${alias}.id AND restricted.kind!='original')`;
export const publicPlaylistSQL = (alias='p') => `(${alias}.is_public=1 AND NOT ${restrictedSQL(alias)})`;
