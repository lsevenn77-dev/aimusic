import {CREW_ACTIVITIES, CREW_GENRES, CREW_JOIN_LABELS} from '../shared/crew-tags.js';
import {fail, query} from './db.js';
import {crewCapacitySQL} from './crew-growth.js';

export function storedCrewTags(crew) {
 return {
  primary_activity: crew.primary_activity ?? null,
  additional_activities: JSON.parse(crew.additional_activities ?? '[]'),
  music_genres: JSON.parse(crew.music_genres ?? '[]')
 };
}

export function includesCrewTags(input) {
 return ['primary_activity','additional_activities','music_genres'].some(key=>Object.hasOwn(input,key));
}

function checkList(value, allowed, maximum, label) {
 if (!Array.isArray(value) || value.length > maximum || new Set(value).size !== value.length ||
     value.some(tag => !allowed.includes(tag))) {
  fail(400, label+' 태그는 목록에서 중복 없이 최대 '+maximum+'개 선택해주세요.');
 }
 return value;
}

export function crewTagsForWrite(input, crew, requirePrimary) {
 const saved = storedCrewTags(crew || {});
 const tags = {...saved};
 for (const key of Object.keys(tags)) if (Object.hasOwn(input,key)) tags[key] = input[key];
 const primary = tags.primary_activity;
 if (primary !== null && !CREW_ACTIVITIES.includes(primary)) fail(400,'대표 활동을 목록에서 선택해주세요.');
 const additional = checkList(tags.additional_activities, CREW_ACTIVITIES, 2, '추가 활동');
 const genres = checkList(tags.music_genres, CREW_GENRES, 3, '음악 장르');
 if ((requirePrimary || saved.primary_activity || additional.length) && !primary) fail(400,'대표 활동을 선택해주세요.');
 if (additional.includes(primary)) fail(400,'대표 활동과 추가 활동은 중복될 수 없어요.');
 return [primary, JSON.stringify(additional), JSON.stringify(genres)];
}

export async function findCrews(env, params, crewSelect, present) {
 const filters = [], args = [];
 const q = (params.get('q') || '').trim().slice(0,80);
 const activity = params.get('activity'), genre = params.get('genre');
 const policy = params.get('policy'), recruiting = params.get('recruiting');
 if (q) {
  filters.push('(instr(lower(c.name),lower(?))>0 OR instr(lower(c.description),lower(?))>0)');
  args.push(q,q);
 }
 if (activity) {
  if (!CREW_ACTIVITIES.includes(activity)) fail(400,'활동 방향을 확인해주세요.');
  filters.push('(c.primary_activity=? OR EXISTS (SELECT 1 FROM json_each(c.additional_activities) WHERE value=?))');
  args.push(activity,activity);
 }
 if (genre) {
  if (!CREW_GENRES.includes(genre)) fail(400,'음악 장르를 확인해주세요.');
  filters.push('EXISTS (SELECT 1 FROM json_each(c.music_genres) WHERE value=?)');
  args.push(genre);
 }
 if (policy) {
  if (!Object.hasOwn(CREW_JOIN_LABELS,policy)) fail(400,'가입 방식을 확인해주세요.');
  filters.push('c.join_policy=?');
  args.push(policy);
 }
 if (recruiting) {
  if (!['open','closed'].includes(recruiting)) fail(400,'모집 상태를 확인해주세요.');
  const open = 'c.recruiting=1 AND (SELECT count(*) FROM crew_members WHERE crew_id=c.id)<('+crewCapacitySQL()+')';
  filters.push((recruiting==='closed'?'NOT ':'')+'('+open+')');
 }
 const offset = Number(params.get('offset') || 0);
 if (!Number.isSafeInteger(offset) || offset<0) fail(400,'검색 결과 위치를 확인해주세요.');
 const where = filters.length ? ' WHERE '+filters.join(' AND ') : '';
 const order = params.get('sort')==='members' ? 'members DESC,c.created DESC,c.id' : 'c.created DESC,c.id';
 const [count,page] = await env.DB.batch([
  query(env,'SELECT count(*) AS total FROM crews c'+where,...args),
  query(env,crewSelect+where+' ORDER BY '+order+' LIMIT 24 OFFSET ?',...args,offset)
 ]);
 return {total:count.results[0].total, crews:page.results.map(present)};
}

