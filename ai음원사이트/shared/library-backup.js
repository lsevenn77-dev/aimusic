// Identical SQL on the restored SQLite backup and live D1. Compare source values,
// including unavailable content references and the tie breakers used by My Box.
export const boxBackupSources = [
  ['boxes', 'id,user_id,name,created,updated,revision,source_playlist_id', 'my_boxes', 'id'],
  ['items', 'box_id,kind,content_id,position,created', 'my_box_items', 'box_id,position,kind,content_id']
];

export function backupPageSQL([, fields, table, order]) {
  return `SELECT json_group_array(json(row_data)) AS page FROM (
    SELECT json_array(${fields}) AS row_data FROM ${table} ORDER BY ${order} LIMIT 100 OFFSET ?)`;
}

export async function inspectBoxSource(queryOne, digest) {
  const pages = [];
  const counts = {};
  for (const source of boxBackupSources) {
    const sql = backupPageSQL(source);
    let offset = 0;
    for (;;) {
      const {page} = await queryOne(sql, offset);
      const size = JSON.parse(page).length;
      pages.push({source:source[0], sql, offset, page});
      offset += size;
      if (size < 100) break;
    }
    counts[source[0]] = offset;
  }
  // Include an empty terminal page at exact multiples of 100.
  const fingerprint = await digest(JSON.stringify(await Promise.all(pages.map(p => digest(p.page)))));
  return {counts, fingerprint, pages};
}
