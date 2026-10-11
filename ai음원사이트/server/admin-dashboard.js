import {one,rows,now,fail,json,str} from './db.js';
import {requireUser,isAdmin} from './auth.js';

const ALLOWED_DAYS=new Set([7,30,90]);
const toNumber=value=>Number(value||0);
const mwToWon=value=>Math.round(toNumber(value)/1000);

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
   FROM producers p WHERE p.name LIKE ? ORDER BY p.created DESC LIMIT 12`,like),
  rows(env,`SELECT id,name,email,provider,created,
   CASE WHEN premium_until>? OR apple_premium_until>? THEN 1 ELSE 0 END premium
   FROM users WHERE provider!='deleted' AND (name LIKE ? OR email LIKE ?)
   ORDER BY created DESC LIMIT 12`,now(),now(),like,like)
 ]);
 return {query:q,tracks,creators,users};
}

export async function adminDashboardRoute(req,env,path,user){
 if(!path.startsWith('/api/admin/dashboard'))return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'관리자만 확인할 수 있습니다.');
 if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const url=new URL(req.url);
 if(path==='/api/admin/dashboard/search'){
  const q=str(url.searchParams.get('q')||'',80,false);
  if(q.length<2)return json({query:q,tracks:[],creators:[],users:[]});
  return json(await searchDashboard(env,q));
 }
 if(path!=='/api/admin/dashboard')fail(404,'관리자 대시보드를 찾을 수 없습니다.');
 const requested=Number(url.searchParams.get('days')||7),days=ALLOWED_DAYS.has(requested)?requested:7;
 const at=now(),cutoff=at-days*86400;
 const [
  summary,playSeries,userSeries,billingRevenue,goldRevenue,giftShares,providers,topTracks,recentTracks,
  recentUsers,recentCreators,subscriptionStates,recentGold,payoutPending
 ]=await Promise.all([
  one(env,`SELECT
   (SELECT count(*) FROM users WHERE provider!='deleted') users,
   (SELECT count(*) FROM users WHERE provider!='deleted' AND created>=?) new_users,
   (SELECT count(*) FROM users WHERE provider!='deleted' AND (premium_until>? OR apple_premium_until>?)) active_subscribers,
   (SELECT count(*) FROM listens WHERE qualified=1 AND started>=?) qualified_plays,
   (SELECT count(*) FROM tracks WHERE status='published') published_tracks,
   (SELECT count(*) FROM producers) creators,
   (SELECT count(*) FROM comment_reports WHERE status='pending') pending_comment_reports,
   (SELECT count(DISTINCT track_id) FROM track_reports) reported_tracks`,cutoff,at,at,cutoff),
  rows(env,`SELECT day,count(*) n FROM listens WHERE qualified=1 AND started>=? GROUP BY day ORDER BY day`,cutoff),
  rows(env,`SELECT date(created,'unixepoch','+9 hours') day,count(*) n
   FROM users WHERE provider!='deleted' AND created>=? GROUP BY day ORDER BY day`,cutoff),
  one(env,`SELECT COALESCE(sum(CASE WHEN status IN ('paid','partialCancelled') THEN MAX(amount-refunded,0) ELSE 0 END),0) krw,
   count(CASE WHEN status IN ('paid','partialCancelled') THEN 1 END) payments
   FROM billing_payments WHERE created>=?`,cutoff),
  one(env,`SELECT COALESCE(sum(price_krw),0) gross_krw,COALESCE(sum(fee_krw),0) fee_krw,
   COALESCE(sum(tax_krw),0) tax_krw,count(*) orders
   FROM gold_purchases WHERE status='paid' AND paid_at>=?`,cutoff),
  one(env,`SELECT COALESCE(sum(platform_mw),0) platform_mw,
   COALESCE(sum(creator_mw+singer_mw),0) creator_mw,count(*) gifts
   FROM gifts WHERE created>=?`,cutoff),
  rows(env,`SELECT provider,count(*) n FROM users WHERE provider!='deleted' GROUP BY provider ORDER BY n DESC`),
  rows(env,`SELECT t.id,t.title,COALESCE(NULLIF(a.name,''),p.name) artist,count(l.id) plays,
   (SELECT count(*) FROM likes x WHERE x.track_id=t.id) likes
   FROM listens l JOIN tracks t ON t.id=l.track_id JOIN producers p ON p.id=t.producer_id
   LEFT JOIN artists a ON a.id=t.artist_id
   WHERE l.qualified=1 AND l.started>=? AND t.status='published'
   GROUP BY t.id,t.title,a.name,p.name ORDER BY plays DESC,t.created DESC LIMIT 5`,cutoff),
  rows(env,`SELECT t.id,t.title,t.genre,t.kind,t.created,t.has_cover,t.cover_version,
   COALESCE(NULLIF(a.name,''),p.name) artist
   FROM tracks t JOIN producers p ON p.id=t.producer_id LEFT JOIN artists a ON a.id=t.artist_id
   WHERE t.status='published' ORDER BY t.created DESC LIMIT 6`),
  rows(env,`SELECT id,name,email,provider,created,
   CASE WHEN premium_until>? OR apple_premium_until>? THEN 1 ELSE 0 END premium
   FROM users WHERE provider!='deleted' ORDER BY created DESC LIMIT 6`,at,at),
  rows(env,`SELECT p.id,p.name,p.created,
   (SELECT count(*) FROM tracks t WHERE t.producer_id=p.id AND t.status!='deleted') tracks,
   (SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers
   FROM producers p ORDER BY p.created DESC LIMIT 6`),
  rows(env,`SELECT state,cancel_requested,count(*) n FROM billing_subscriptions GROUP BY state,cancel_requested ORDER BY n DESC`),
  rows(env,`SELECT gp.id,gp.gold,gp.price_krw,gp.channel,gp.paid_at,u.name
   FROM gold_purchases gp JOIN users u ON u.id=gp.user_id
   WHERE gp.status='paid' ORDER BY gp.paid_at DESC LIMIT 6`),
  one(env,`SELECT count(*) n,COALESCE(sum(net_krw),0) krw
   FROM payout_statements WHERE status IN ('scheduled','held')`)
 ]);
 const response={
  generated_at:at,days,
  summary:{
   users:toNumber(summary?.users),new_users:toNumber(summary?.new_users),
   active_subscribers:toNumber(summary?.active_subscribers),qualified_plays:toNumber(summary?.qualified_plays),
   published_tracks:toNumber(summary?.published_tracks),creators:toNumber(summary?.creators),
   pending_comment_reports:toNumber(summary?.pending_comment_reports),reported_tracks:toNumber(summary?.reported_tracks)
  },
  series:{plays:playSeries.map(x=>({day:x.day,value:toNumber(x.n)})),users:userSeries.map(x=>({day:x.day,value:toNumber(x.n)}))},
  revenue:{
   subscription_krw:toNumber(billingRevenue?.krw),subscription_payments:toNumber(billingRevenue?.payments),
   gold_gross_krw:toNumber(goldRevenue?.gross_krw),gold_fee_krw:toNumber(goldRevenue?.fee_krw),
   gold_tax_krw:toNumber(goldRevenue?.tax_krw),gold_orders:toNumber(goldRevenue?.orders),
   gift_platform_krw:mwToWon(giftShares?.platform_mw),gift_creator_krw:mwToWon(giftShares?.creator_mw),
   gifts:toNumber(giftShares?.gifts)
  },
  providers:providers.map(x=>({provider:x.provider,count:toNumber(x.n)})),
  top_tracks:topTracks.map(x=>({...x,plays:toNumber(x.plays),likes:toNumber(x.likes)})),
  recent_tracks:recentTracks,recent_users:recentUsers,recent_creators:recentCreators,
  subscription_states:subscriptionStates.map(x=>({...x,n:toNumber(x.n)})),
  recent_gold:recentGold,
  payouts:{pending_count:toNumber(payoutPending?.n),pending_krw:toNumber(payoutPending?.krw)}
 };
 return json(response);
}
