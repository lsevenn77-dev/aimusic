import {validGenre} from '../shared/genres.js';
import {rows,now,fail,json} from './db.js';
import {trackList,published,VISIBLE,GENRES} from './catalog.js';

// Calendar periods are evaluated in Korea, regardless of the worker/device timezone.
export function rankingPeriod(period,at=now()){
 const local=new Date((at+32400)*1000),y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate();
 const midnight=Date.UTC(y,m,d)/1000-32400;
 const periods={today:{label:'오늘',from:midnight},week:{label:'이번 주',from:midnight-((local.getUTCDay()+6)%7)*86400},month:{label:'이달',from:Date.UTC(y,m,1)/1000-32400},all:{label:'명예의 전당',from:0}};
 if(!Object.hasOwn(periods,period))fail(400,'랭킹 기간을 확인해주세요.');
 return {period,...periods[period],until:at,time_zone:'Asia/Seoul'};
}

export async function coverRankingRoute(req,env,path){
 if(path!=='/api/cover-rankings')return null;
 if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const p=new URL(req.url).searchParams,period=rankingPeriod(p.get('period')||'today'),kind=p.get('kind')||'tracks';
 if(!['tracks','singers'].includes(kind))fail(400,'랭킹 종류를 확인해주세요.');
 const genre=p.get('genre')||'',q=(p.get('q')||'').trim().slice(0,100),original=p.get('original_id')||'';
 if(genre&&!validGenre(genre))fail(400,'장르를 확인해주세요.');
 if(original){const t=await published(env,original);if(t.kind!=='original')fail(400,'원곡을 선택해주세요.');}
 const requested=Number(p.get('limit')||50),limit=Number.isInteger(requested)&&requested>0?Math.min(requested,100):50;
 let where=`${VISIBLE()} AND t.kind='cover'`,args=[];
 if(genre){where+=' AND t.genre=?';args.push(genre);}
 if(original){where+=' AND t.original_id=?';args.push(original);}
 if(q){where+=' AND (t.title LIKE ? ESCAPE \'\\\' OR p.name LIKE ? ESCAPE \'\\\')';const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(term,term);}
 // Each account has one active like per cover. Unlike removes its vote immediately.
 const cte=`WITH scores AS (SELECT t.id,t.producer_id,t.created,
  (SELECT count(*) FROM likes l WHERE l.track_id=t.id AND l.created>=? AND l.created<=?) rank_likes,
  (SELECT count(*) FROM likes l WHERE l.track_id=t.id) total_likes
  FROM tracks t JOIN producers p ON p.id=t.producer_id WHERE ${where})`;
 const bound=[period.from,period.until,...args];
 let tracks=[],singers=[];
 if(kind==='tracks'){
  const ranked=await rows(env,`${cte} SELECT * FROM scores WHERE rank_likes>0 ORDER BY rank_likes DESC,total_likes DESC,created DESC,id LIMIT ?`,...bound,limit);
  if(ranked.length){const data=await trackList(env,`${VISIBLE()} AND t.id IN (${ranked.map(()=>'?').join(',')})`,ranked.map(x=>x.id),'t.id',limit),byId=new Map(data.map(t=>[t.id,t]));tracks=ranked.filter(r=>byId.has(r.id)).map((r,i)=>({...byId.get(r.id),rank:i+1,rank_likes:r.rank_likes}));}
 }else{
  singers=(await rows(env,`${cte} SELECT p.id,p.name,p.bio,p.image_version,
    sum(s.rank_likes) rank_likes,sum(s.total_likes) total_likes,count(*) ranked_covers,
    (SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers
    FROM scores s JOIN producers p ON p.id=s.producer_id WHERE s.rank_likes>0 GROUP BY p.id
    ORDER BY rank_likes DESC,total_likes DESC,p.id LIMIT ?`,...bound,limit)).map((s,i)=>({...s,rank:i+1}));
 }
 return json({...period,kind,genre,original_id:original,basis:'active_likes',limit,tracks,singers});
}
