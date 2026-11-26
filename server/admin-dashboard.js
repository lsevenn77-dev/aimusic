import * as AifectMessages from '../shared/system-messages.js';
import {eventUntilSQL,otherUntilSQL,effectiveUntilSQL} from './premium-event.js';
import {visitDay} from './visitors.js';
import {trackArtworkSQL} from './track-artwork.js';
import {one,rows,now,fail,json,str} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {publicNameSQL} from './identity.js';
import {eligibleNoticeMember} from './notice-audience.js';
import {reviewCounts} from './review-queues.js';

const ALLOWED_DAYS=new Set([7,30,90]);
const toNumber=value=>Number(value||0);
const mwToWon=value=>Math.round(toNumber(value)/1000);
const currentMember=eligibleNoticeMember;
const premiumMember=`${effectiveUntilSQL}>?`;
const kstStart=at=>Math.floor((at+9*3600)/86400)*86400-9*3600;

async function memberDirectory(env,params,at){
 const group=params.get('group')||'all',day=params.get('day'),cursor=params.get('cursor');
 if(!['all','today','premium','event'].includes(group))fail(400,'회원 구분을 확인해 주세요.');
 const conditions=[currentMember],args=[];
 if(group==='today'||day!==null){
  const start=day===null?kstStart(at):Date.parse(day+'T00:00:00+09:00')/1000;
  if(day!==null&&(group==='today'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(start)||
    new Date((start+9*3600)*1000).toISOString().slice(0,10)!==day))fail(400,'가입일을 확인해 주세요.');
  conditions.push('u.created>=? AND u.created<?');args.push(start,start+86400);
 }
 if(group==='premium'){conditions.push(premiumMember);args.push(at);}
 if(group==='event')conditions.push(`(${eventUntilSQL})>0`);
 const q=str(params.get('q')??'',100,false);
 if(q){
  conditions.push(`(instr(lower(u.id),lower(?))>0 OR instr(lower(${publicNameSQL()}),lower(?))>0)`);
  args.push(q,q);
 }
 if(cursor!==null){
  const match=/^(\d{1,12}):([^:\s]{1,128})$/.exec(cursor);
  if(!match)fail(400,'목록 위치를 확인해 주세요.');
  conditions.push('(u.created,u.id)<(?,?)');args.push(Number(match[1]),match[2]);
 }
 const pageSize=50;
 const list=await rows(env,`SELECT u.id,pp.code public_id,${publicNameSQL()} name,
  CASE WHEN u.provider='email' THEN u.email END login_email,
  u.created,u.provider,u.signup_source,${premiumMember} premium,
  ${eventUntilSQL} event_premium_until,${otherUntilSQL}>? other_premium FROM users u
  LEFT JOIN public_profile_ids pp ON pp.user_id=u.id WHERE ${conditions.join(' AND ')}
  ORDER BY u.created DESC,u.id DESC LIMIT ?`,at,at,...args,pageSize+1);
 const members=list.slice(0,pageSize),last=members.at(-1);
 return json({members,as_of:at,next_cursor:list.length>pageSize?last.created+':'+last.id:null});
}

async function searchDashboard(env,q){
 const like=`%${q}%`;
 const [tracks,creators,users]=await Promise.all([
  rows(env,`SELECT t.id,t.title,t.status,t.kind,t.created,COALESCE(NULLIF(a.name,''),p.name) artist
   FROM tracks t JOIN producers p ON p.id=t.producer_id LEFT JOIN artists a ON a.id=t.artist_id
   WHERE (t.title LIKE ? OR p.name LIKE ? OR a.name LIKE ?) AND t.status!='deleted'
   ORDER BY t.created DESC LIMIT 12`,like,like,like),
  rows(env,`SELECT p.id,p.name,p.created,
   (SELECT count(*) FROM tracks t WHERE t.producer_id=p.id AND t.status!='deleted') tracks,
   (SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers
   FROM producers p WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.account_type='human') AND p.name LIKE ? ORDER BY p.created DESC LIMIT 12`,like),
  rows(env,`SELECT id,name,email,provider,created,
   ${premiumMember} premium
   FROM users u WHERE provider!='deleted' AND account_type='human' AND (name LIKE ? OR email LIKE ?)
   ORDER BY created DESC LIMIT 12`,now(),like,like)
 ]);
 return {query:q,tracks,creators,users};
}

export async function adminDashboardRoute(req,env,path,user){
 if(!path.startsWith('/api/admin/dashboard'))return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'관리자만 확인할 수 있습니다.');
 if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
 const url=new URL(req.url);
 if(path==='/api/admin/dashboard/members')return memberDirectory(env,url.searchParams,now());
 if(path==='/api/admin/dashboard/review-counts')return json(await reviewCounts(env));
 if(path==='/api/admin/dashboard/search'){
  const q=str(url.searchParams.get('q')||'',80,false);
  if(q.length<2)return json({query:q,tracks:[],creators:[],users:[]});
  return json(await searchDashboard(env,q));
 }
 if(path!=='/api/admin/dashboard')fail(404,'관리자 대시보드를 찾을 수 없습니다.');
 const requested=Number(url.searchParams.get('days')||7),days=ALLOWED_DAYS.has(requested)?requested:7;
 const at=now(),cutoff=at-days*86400;
 const firstDay=visitDay(at)-days+1;
 const [
  visitRows,summary,playSeries,userSeries,billingRevenue,goldRevenue,giftShares,providers,signupSources,topTracks,recentTracks,
  recentUsers,recentCreators,subscriptionStates,recentGold,payoutPending,review
 ]=await Promise.all([
  rows(env,'SELECT platform,source,count(*) n,sum(day=?) today FROM visitor_days WHERE day BETWEEN ? AND ? GROUP BY platform,source',visitDay(at),firstDay,visitDay(at)),
  one(env,`SELECT
   (SELECT count(*) FROM users WHERE provider!='deleted' AND account_type='human') users,
   (SELECT count(*) FROM users WHERE provider!='deleted' AND account_type='human' AND created>=?) new_users,
   (SELECT count(*) FROM users u WHERE ${currentMember} AND u.created>=? AND u.created<?) today_users,
   (SELECT count(*) FROM users u WHERE ${currentMember} AND ${premiumMember}) active_subscribers,
   (SELECT count(*) FROM listens WHERE qualified=1 AND started>=?) qualified_plays,
   (SELECT count(*) FROM tracks WHERE status='published') published_tracks,
   (SELECT count(*) FROM producers p JOIN users u ON u.id=p.user_id WHERE u.account_type='human') creators`,cutoff,kstStart(at),kstStart(at)+86400,at,cutoff),
  rows(env,`SELECT day,count(*) n FROM listens WHERE qualified=1 AND started>=? GROUP BY day ORDER BY day`,cutoff),
  rows(env,`SELECT date(created,'unixepoch','+9 hours') day,count(*) n
   FROM users WHERE provider!='deleted' AND account_type='human' AND created>=? GROUP BY day ORDER BY day`,cutoff),
  one(env,`SELECT COALESCE(sum(CASE WHEN status IN ('paid','partialCancelled') THEN MAX(amount-refunded,0) ELSE 0 END),0) krw,
   count(CASE WHEN status IN ('paid','partialCancelled') THEN 1 END) payments
   FROM billing_payments WHERE created>=?`,cutoff),
  one(env,`SELECT COALESCE(sum(price_krw),0) gross_krw,COALESCE(sum(fee_krw),0) fee_krw,
   COALESCE(sum(tax_krw),0) tax_krw,count(*) orders
   FROM gold_purchases WHERE status='paid' AND channel IN ('web','apple','google_play') AND price_krw>0 AND paid_at>=?`,cutoff),
  one(env,`SELECT COALESCE(sum(platform_mw),0) platform_mw,
   COALESCE(sum(creator_mw+singer_mw),0) creator_mw,count(*) gifts
   FROM gifts WHERE created>=?`,cutoff),
  rows(env,`SELECT provider,count(*) n FROM users WHERE provider!='deleted' AND account_type='human' GROUP BY provider ORDER BY n DESC`),
  rows(env,`SELECT signup_source src,count(*) n FROM users u WHERE ${currentMember} AND u.created>=? GROUP BY signup_source ORDER BY n DESC,src`,kstStart(at)-(days-1)*86400),
  rows(env,`SELECT t.id,t.title,${trackArtworkSQL()},COALESCE(NULLIF(a.name,''),p.name) artist,count(l.id) plays,
   (SELECT count(*) FROM likes x WHERE x.track_id=t.id) likes
   FROM listens l JOIN tracks t ON t.id=l.track_id JOIN producers p ON p.id=t.producer_id
   LEFT JOIN artists a ON a.id=t.artist_id LEFT JOIN tracks o ON o.id=t.original_id
   WHERE l.qualified=1 AND l.started>=? AND t.status='published'
   GROUP BY t.id,t.title,a.name,p.name ORDER BY plays DESC,t.created DESC LIMIT 5`,cutoff),
  rows(env,`SELECT t.id,t.title,t.genre,t.kind,t.created,${trackArtworkSQL()},
   COALESCE(NULLIF(a.name,''),p.name) artist
   FROM tracks t JOIN producers p ON p.id=t.producer_id LEFT JOIN artists a ON a.id=t.artist_id LEFT JOIN tracks o ON o.id=t.original_id
   WHERE t.status='published' ORDER BY t.created DESC LIMIT 6`),
  rows(env,`SELECT id,name,email,provider,created,
   ${premiumMember} premium
   FROM users u WHERE provider!='deleted' AND account_type='human' ORDER BY created DESC LIMIT 6`,at),
  rows(env,`SELECT p.id,p.name,p.created,
   (SELECT count(*) FROM tracks t WHERE t.producer_id=p.id AND t.status!='deleted') tracks,
   (SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers
   FROM producers p WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.account_type='human') ORDER BY p.created DESC LIMIT 6`),
  rows(env,`SELECT state,cancel_requested,count(*) n FROM billing_subscriptions GROUP BY state,cancel_requested ORDER BY n DESC`),
  rows(env,`SELECT gp.id,gp.gold,gp.price_krw,gp.channel,gp.paid_at,u.name
   FROM gold_purchases gp JOIN users u ON u.id=gp.user_id
   WHERE gp.status='paid' AND gp.channel IN ('web','apple','google_play') AND gp.price_krw>0 ORDER BY gp.paid_at DESC LIMIT 6`),
  one(env,`SELECT count(*) n,COALESCE(sum(net_krw),0) krw
   FROM payout_statements WHERE status IN ('scheduled','held')`),
  reviewCounts(env,at)
 ]);
 const todayVisits={web:0,android:0,ios:0};
 const sources=new Map(signupSources.map(x=>[x.src,{src:x.src,signups:toNumber(x.n),visits:0}]));
 for(const row of visitRows){
  todayVisits[row.platform]+=toNumber(row.today);
  const source=sources.get(row.source)||{src:row.source,signups:0,visits:0};
  source.visits+=toNumber(row.n);
  sources.set(row.source,source);
 }
 const response={
  visitors:{today:todayVisits,sources:[...sources.values()].sort((a,b)=>b.visits-a.visits||b.signups-a.signups)},
  generated_at:at,days,
  summary:{
   users:toNumber(summary?.users),new_users:toNumber(summary?.new_users),today_users:toNumber(summary?.today_users),
   active_subscribers:toNumber(summary?.active_subscribers),qualified_plays:toNumber(summary?.qualified_plays),
   published_tracks:toNumber(summary?.published_tracks),creators:toNumber(summary?.creators),
   ...review,reported_tracks:review.track_review_candidates
  },
  series:{plays:playSeries.map(x=>({day:x.day,value:toNumber(x.n)})),users:userSeries.map(x=>({day:x.day,value:toNumber(x.n)}))},
  revenue:{
   subscription_krw:toNumber(billingRevenue?.krw),subscription_payments:toNumber(billingRevenue?.payments),
   gold_gross_krw:toNumber(goldRevenue?.gross_krw),gold_fee_krw:toNumber(goldRevenue?.fee_krw),
   gold_tax_krw:toNumber(goldRevenue?.tax_krw),gold_orders:toNumber(goldRevenue?.orders),
   gift_platform_krw:mwToWon(giftShares?.platform_mw),gift_creator_krw:mwToWon(giftShares?.creator_mw),
   gifts:toNumber(giftShares?.gifts)
  },
  signup_sources:signupSources.map(x=>({src:x.src,count:toNumber(x.n)})),
  providers:providers.map(x=>({provider:x.provider,count:toNumber(x.n)})),
  top_tracks:topTracks.map(x=>({...x,plays:toNumber(x.plays),likes:toNumber(x.likes)})),
  recent_tracks:recentTracks,recent_users:recentUsers,recent_creators:recentCreators,
  subscription_states:subscriptionStates.map(x=>({...x,n:toNumber(x.n)})),
  recent_gold:recentGold,
  payouts:{pending_count:toNumber(payoutPending?.n),pending_krw:toNumber(payoutPending?.krw)}
 };
 return json(response);
}
