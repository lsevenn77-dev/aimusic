import {one, rows, query, id, now, json, fail} from './db.js';
import {hash, requireUser} from './auth.js';
import {isConsoleAdmin} from './admin-session.js';
import {normalizePlaylistTitle} from '../shared/playlist-policy.js';
import {inspectBoxSource} from '../shared/library-backup.js';
import {libraryTransaction} from './library-transactions.js';

const verifiedKey = 'my-box:v3:verified';
const prefix = 'from-box-';
export const beforeBoxCutover = ['NOT EXISTS (SELECT 1 FROM library_unification_state WHERE key=?)', [verifiedKey]];

async function receipt(env) {
  const row = await one(env, 'SELECT value FROM library_unification_state WHERE key=?', verifiedKey);
  return row ? JSON.parse(row.value) : null;
}

export async function boxesUnified(env) {
  return !!await one(env, 'SELECT 1 ok FROM library_unification_state WHERE key=?', verifiedKey);
}

const strictSQL = "NOT EXISTS(SELECT 1 FROM playlist_items i WHERE i.playlist_id=p.id AND i.kind!='original')";

async function readPlan(env) {
  const source = await inspectBoxSource((sql, offset) => one(env, sql, offset), hash);
  const byId = new Map();
  for (const {source:table,page} of source.pages) {
    for (const row of JSON.parse(page)) {
      if (table === 'boxes') byId.set(row[0], {id:row[0],name:row[2],strict:true});
      else if (row[1] !== 'original' && byId.has(row[0])) byId.get(row[0]).strict=false;
    }
  }
  const boxes = [...byId.values()];
  const playlists = await rows(env, `SELECT p.id,p.name,p.name_key,${strictSQL} strict FROM playlists p ORDER BY p.id`);
  const strictTitles = new Map(), conflicts = [], reservedIds = new Set(playlists.map(p => p.id));
  function inspect(row, type) {
    const key = normalizePlaylistTitle(row.name);
    if (!key || (type === 'playlist' && row.name_key !== key)) conflicts.push({reason:'title_index', type, id:row.id});
    if (type === 'box' && reservedIds.has(prefix + row.id)) conflicts.push({reason:'id', type, id:row.id});
    if (!row.strict) return;
    const refs = strictTitles.get(key) || [];
    refs.push({type, id:row.id});
    strictTitles.set(key, refs);
  }
  for (const p of playlists) inspect(p, 'playlist');
  for (const b of boxes) inspect(b, 'box');
  for (const refs of strictTitles.values()) if (refs.length > 1) conflicts.push({reason:'duplicate_title', lists:refs});
  return {source, boxes, conflicts};
}

// One D1 transaction. The guards compare the backup source in the transaction
// and verify the newly written headers and memberships in both directions.
export async function applyBoxUnification(env, backup) {
  const previous = await receipt(env);
  if (previous) return previous;
  const plan = await readPlan(env);
  if (!backup || backup.format !== 1 || !/^[0-9a-f]{64}$/.test(backup.file_sha256 || '') ||
      plan.source.fingerprint !== backup.source_sha256) fail(409,'DB 백업 검증 결과가 현재 마이박스와 일치하지 않습니다. 백업을 다시 확인해 주세요.');
  if (plan.conflicts.length) fail(409,'제목 또는 식별자 충돌이 있습니다. 원본을 유지했습니다. 이전 점검 결과를 확인해 주세요.');
  const token = id(), statements = [];
  function guard(expr, ...args) {
    statements.push(query(env, `INSERT INTO library_write_guards(id,allowed) SELECT ?,CASE WHEN (${expr}) THEN 1 ELSE 0 END`, token+':'+statements.length, ...args));
  }
  guard(beforeBoxCutover[0], ...beforeBoxCutover[1]);
  for (const {sql, offset, page} of plan.source.pages) guard(`(${sql})=?`, offset, page);
  // Application code computes Unicode NFKC once. Never rename a display title.
  for (let i=0; i<plan.boxes.length; i+=100) {
    const keys = plan.boxes.slice(i,i+100).map(box => [box.id,normalizePlaylistTitle(box.name)]);
    statements.push(query(env, `INSERT INTO playlists(id,user_id,name,name_key,created,updated,is_public)
      SELECT ?||b.id,b.user_id,b.name,json_extract(j.value,'$[1]'),b.created,b.updated,0
      FROM json_each(?) j JOIN my_boxes b ON b.id=json_extract(j.value,'$[0]')`, prefix, JSON.stringify(keys)));
  }
  statements.push(query(env, `INSERT INTO playlist_tracks(playlist_id,track_id,created,position)
    SELECT ?||i.box_id,i.content_id,i.created,i.position FROM my_box_items i
    JOIN tracks t ON t.id=i.content_id AND t.kind=i.kind WHERE i.kind IN ('original','cover')`, prefix));
  statements.push(query(env, `INSERT INTO playlist_extra_items(playlist_id,kind,content_id,created,position)
    SELECT ?||i.box_id,i.kind,i.content_id,i.created,i.position FROM my_box_items i
    WHERE i.kind='dubbing' OR NOT EXISTS(SELECT 1 FROM tracks t WHERE t.id=i.content_id AND t.kind=i.kind)`, prefix));
  guard(`NOT EXISTS(SELECT 1 FROM my_boxes b LEFT JOIN playlists p ON p.id=?||b.id
    WHERE p.id IS NULL OR p.user_id!=b.user_id OR p.name!=b.name OR p.is_public!=0 OR p.created!=b.created OR p.updated!=b.updated)`, prefix);
  const original = 'SELECT box_id,kind,content_id,position,created FROM my_box_items';
  const migrated = 'SELECT b.id,i.kind,i.content_id,i.position,i.created FROM my_boxes b JOIN playlist_items i ON i.playlist_id=?||b.id';
  guard(`NOT EXISTS(${original} EXCEPT ${migrated}) AND NOT EXISTS(${migrated} EXCEPT ${original})
    AND (SELECT count(*) FROM (${migrated}))=(SELECT count(*) FROM my_box_items)`, prefix,prefix,prefix);
  guard(`NOT EXISTS(SELECT p.name_key FROM playlists p WHERE ${strictSQL} GROUP BY p.name_key HAVING count(*)>1 OR p.name_key IS NULL)`);
  statements.push(query(env,`INSERT OR IGNORE INTO playlist_title_claims(key) SELECT p.name_key FROM playlists p WHERE ${strictSQL}`));
  const result = {boxes:plan.source.counts.boxes,items:plan.source.counts.items,source_sha256:plan.source.fingerprint,
    backup_sha256:backup.file_sha256,verified_at:now()};
  statements.push(query(env,'INSERT INTO library_unification_state(key,value) VALUES(?,?)',verifiedKey,JSON.stringify(result)));
  statements.push(query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,'admin-console','library:v3:verified',?,?)",token,JSON.stringify(result),result.verified_at));
  statements.push(query(env,'DELETE FROM library_write_guards WHERE id LIKE ?',token+':%'));
  try {
    await env.DB.batch(statements);
  } catch (e) {
    const completed = await receipt(env);
    if (completed) return completed;
    if (/library_guard_allowed|UNIQUE constraint failed/.test(e.message)) fail(409,'이전 중 원본이 변경되었거나 충돌이 발생했습니다. 백업과 점검 결과를 다시 확인해 주세요.');
    throw e;
  }
  return result;
}

export async function retireMyBoxes(env, backup) {
  if (!backup || ![backup.source_sha256,backup.backup_sha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)) ||
      ![backup.boxes,backup.items].every(count => Number.isSafeInteger(count) && count >= 0)) {
    fail(400,'검증한 마이박스 백업의 체크섬과 원본 건수가 필요합니다.');
  }
  const matchesBackup = result => result?.mode === 'deleted' &&
    result.source_sha256 === backup.source_sha256 && result.backup_sha256 === backup.backup_sha256 &&
    result.boxes === backup.boxes && result.items === backup.items;
  const previous = await receipt(env);
  if (previous) {
    if (matchesBackup(previous)) return previous;
    fail(409,'마이박스 전환이 이미 완료되었습니다. 전환 결과를 확인해 주세요.');
  }

  const source = await inspectBoxSource((sql, offset) => one(env, sql, offset), hash);
  if (source.fingerprint !== backup.source_sha256 || source.counts.boxes !== backup.boxes || source.counts.items !== backup.items) {
    fail(409,'백업 이후 마이박스가 변경되었습니다. 현재 목록의 백업을 다시 확인해 주세요.');
  }

  const result = {mode:'deleted', ...source.counts, source_sha256:source.fingerprint, backup_sha256:backup.backup_sha256, verified_at:now()};
  const auditId = id();
  const guards = [beforeBoxCutover, ...source.pages.map(({sql, offset, page}) => [`(${sql})=?`, [offset, page]])];
  try {
    await libraryTransaction(env, guards, [
      query(env,'DELETE FROM my_box_items'),
      query(env,'DELETE FROM my_boxes'),
      query(env,`INSERT INTO library_write_guards(id,allowed) SELECT ?,
        CASE WHEN NOT EXISTS(SELECT 1 FROM my_boxes) AND NOT EXISTS(SELECT 1 FROM my_box_items) THEN 1 ELSE 0 END`,auditId),
      query(env,'INSERT INTO library_unification_state(key,value) VALUES(?,?)',verifiedKey,JSON.stringify(result)),
      query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,'sites-deployment','library:v3:deleted',?,?)",auditId,JSON.stringify(result),result.verified_at),
      query(env,'DELETE FROM library_write_guards WHERE id=?',auditId)
    ]);
  } catch (error) {
    const completed = await receipt(env);
    if (matchesBackup(completed)) return completed;
    throw error;
  }
  return result;
}

const retirementAttempts = new WeakMap();

// Only called by the existing authenticated jobs heartbeat. Runtime config is
// set by the Sites owner for a verified backup, never by the heartbeat caller.
export function queueConfiguredBoxRetirement(env,ctx) {
  const setting = env.AIFECT_MY_BOX_RETIREMENT;
  if (!setting || !ctx?.waitUntil) return;
  const last = retirementAttempts.get(env.DB);
  if (last?.setting === setting && Date.now() < last.next) return;
  const attempt = {setting,next:Date.now()+60000};
  retirementAttempts.set(env.DB,attempt);
  ctx.waitUntil((async () => {
    if (!await boxesUnified(env)) {
      const result = await retireMyBoxes(env,JSON.parse(setting));
      console.log('My Box retirement verified',JSON.stringify({boxes:result.boxes,items:result.items}));
    }
    attempt.next = Infinity;
  })().catch(error => console.error('My Box retirement stopped',error.status || error.name)));
}

export async function boxCutoverRoute(req,env,path,user) {
  if (path === '/api/library/unification') {
    if (req.method !== 'GET') fail(405,'지원하지 않는 요청입니다.');
    const completed = await receipt(env);
    return json({ready:!!completed, ...(completed?.mode === 'deleted' ? {legacy_boxes_removed:true} : {})});
  }
  if (path === '/api/admin/library-unification') {
    if (!isConsoleAdmin(user)) fail(403,'관리자 로그인이 필요합니다.');
    if (req.method === 'POST') return json(await applyBoxUnification(env, await req.json()));
    if (req.method !== 'GET') fail(405,'지원하지 않는 요청입니다.');
    const completed = await receipt(env);
    if (completed) return json({ready:true,receipt:completed});
    const {conflicts, source} = await readPlan(env);
    return json({ready:false,...source.counts,source_sha256:source.fingerprint,conflicts});
  }
  if (/^\/api\/my-boxes(?:\/|$)/.test(path) || (path === '/api/me/music-library' && new URL(req.url).searchParams.get('section') === 'myboxes')) {
    requireUser(user);
    if (await boxesUnified(env)) fail(410,'마이박스가 종료되었습니다. 플레이리스트를 열어 주세요.');
  }
  return null;
}
