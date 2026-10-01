import {readDuetGuide} from './duet-guide.js';
import {one,fail,json} from './db.js';
import {requireUser} from './auth.js';
import {trackList,VISIBLE,SINGABLE} from './catalog.js';

export const otherPart=part=>part==='male'?'female':'male';
export async function duetSource(env,tid,user){
 const source=await one(env,`SELECT t.* FROM tracks t WHERE t.id=? AND t.kind='cover' AND t.cover_mode='duet' AND t.duet_open=1 AND t.duet_parent_id IS NULL AND ${VISIBLE()}`,tid);
 if(!source)fail(404,'참여할 수 있는 듀엣을 찾을 수 없어요.');
 if(source.user_id===user.id)fail(400,'다른 사람이 올린 듀엣의 빈 파트에 참여해주세요.');
 const original=await one(env,`SELECT t.* FROM tracks t WHERE t.id=? AND ${VISIBLE()} AND ${SINGABLE()}`,source.original_id);
 if(!original)fail(404,'원곡의 부르기 제공이 종료됐어요.');
 return {source,original};
}
export async function duetRoute(req,env,path,user){
 if(path==='/api/duets'&&req.method==='GET')return json({tracks:await trackList(env,`${VISIBLE()} AND t.kind='cover' AND t.cover_mode='duet' AND t.duet_open=1 AND t.duet_parent_id IS NULL AND EXISTS(SELECT 1 FROM tracks d WHERE d.id=t.original_id AND ${SINGABLE('d')})`,[],'t.created DESC',100)});
 const match=path.match(/^\/api\/duets\/([\w-]+)$/);if(!match)return null;
 if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 requireUser(user);const {source,original}=await duetSource(env,match[1],user);
 const [track]=await trackList(env,`t.id=? AND ${VISIBLE()}`,[original.id]);
 const [partner]=await trackList(env,`t.id=? AND ${VISIBLE()}`,[source.id]);
 const job=await one(env,'SELECT words FROM karaoke_jobs WHERE track_id=?',original.id);
 // The first singer's full mix is the backing. Adding the MR again would double it.
 return json({track,words:JSON.parse(job.words||'[]'),mr:`/media/${source.id}/stream`,duet:{parent_id:source.id,slot:'second',part:otherPart(source.duet_part),guide:readDuetGuide(source.duet_guide),partner}});
}
