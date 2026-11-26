import {trackList,VISIBLE} from './catalog.js';
import {one,query,fail} from './db.js';
import {profileDubbingQuery,profileWorkCountsSQL} from './profile-dashboard.js';
import {duetRecruitingSQL,profileCoverParticipation} from './profile-works.js';
import {chartPublication} from './popular-chart.js';

const pageSize=16;
const workKey=/^(track|dubbing):([\w-]{1,96})$/;
const trackFilters={
 all:'',
 original:"AND t.kind='original'",
 cover:"AND t.kind='cover' AND t.cover_mode!='duet'",
 duet:"AND t.kind='cover' AND t.cover_mode='duet'",
 recruit:''
};
const placeholderList=ids=>ids.map(()=>'?').join(',');

function pageScope({keys,cursor,date,alias,kind}){
 if(keys.length){
  const ids=keys.filter(parts=>parts[1]===kind).map(parts=>parts[2]);
  return ids.length?{sql:`AND ${alias}.id IN (${placeholderList(ids)})`,args:ids}:null;
 }
 if(!cursor)return {sql:'',args:[]};
 const [,before,key]=cursor;
 return {sql:`AND (${date}<? OR (${date}=? AND ('${kind}:'||${alias}.id)>?))`,args:[Number(before),Number(before),key]};
}

export async function myWorksPage(env,user,params){
 const filter=params.get('filter')||'all',rawCursor=params.get('cursor');
 const trackDate=chartPublication();
 const keys=[...new Set(params.getAll('item'))].map(key=>key.match(workKey));
 const cursor=rawCursor?.match(/^(\d{1,13}):((?:track|dubbing):[\w-]{1,96})$/);
 if((filter!=='dubbing'&&!Object.hasOwn(trackFilters,filter))||(rawCursor&&!cursor)||keys.length>48||keys.some(key=>!key)||
    (keys.length&&(cursor||filter!=='all')))fail(400,'작품 목록 요청을 확인해 주세요.');
 const profile=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id);
 if(!profile)return {items:[],next_cursor:null};
 const tracksScope=pageScope({keys,cursor,date:trackDate,alias:'t',kind:'track'});
 const dubsScope=pageScope({keys,cursor,date:'p.created',alias:'p',kind:'dubbing'});
 const dubbingOptions={uid:user.id,viewer:user.id,own:true,profileWorks:true};
 const limit=keys.length||pageSize+1;
 const [tracks,dubbings,totals]=await Promise.all([
  filter==='dubbing'||!tracksScope?[]:trackList(env,`((t.user_id=? AND t.status!='deleted') OR ${VISIBLE()})
   AND (t.producer_id=? OR (t.kind='cover' AND dt.producer_id=?)) ${filter==='recruit'?`AND (${duetRecruitingSQL()})`:trackFilters[filter]} ${tracksScope.sql}`,
   [user.id,profile.id,profile.id,...tracksScope.args],`${trackDate} DESC,t.id`,limit,true,true),
  !['all','dubbing','recruit'].includes(filter)||!dubsScope?[]:profileDubbingQuery(env,{
   ...dubbingOptions,feed:true,filter,seek:dubsScope.sql,args:dubsScope.args,limit
  }).all().then(result=>result.results),
  keys.length?env.DB.batch([
   query(env,`SELECT ${profileWorkCountsSQL(true,'u.id')} FROM users u WHERE u.id=?`,user.id),
   profileDubbingQuery(env,{...dubbingOptions,count:true})
  ]):null
 ]);
 const items=[
  ...tracks.map(work=>({...work,key:'track:'+work.id,feed_date:work.published_at,owned:work.user_id===user.id})),
  ...dubbings.map(({options_json,...work})=>({...work,key:'dubbing:'+work.id,kind:'dubbing',feed_date:work.created,
   owned:work.owner_id===user.id,genres:JSON.parse(options_json).genres||[],recruiting:!!work.work_open&&!work.work_finished}))
 ].sort((a,b)=>b.feed_date-a.feed_date||(a.key<b.key?-1:a.key>b.key?1:0));
 const page=keys.length?items:items.slice(0,pageSize);
 await profileCoverParticipation(env,page.filter(work=>work.kind==='cover'),user);
 const last=page.at(-1),next_cursor=!keys.length&&items.length>pageSize?last.feed_date+':'+last.key:null;
 if(!totals)return {items:page,next_cursor};
 const counts=totals[0].results[0],dubbingCount=totals[1].results[0]?.total||0;
 return {items:page,next_cursor,summary:{produced_track_count:counts.produced_track_count,profile_work_count:counts.public_track_count+dubbingCount}};
}
