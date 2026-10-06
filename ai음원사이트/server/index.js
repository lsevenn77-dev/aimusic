import {profileRoute} from './profiles.js';
import {playBillingRoute,playWebhook} from './play-billing.js';
import {pushRoute,dispatchPush,retryPush} from './push.js';
import {socialRoute} from './social.js';
import {chatStreamRoute} from './chat-stream.js';
import {publicUser} from './identity.js';
import {coverRankingRoute} from './cover-rankings.js';
import {commentModerationRoute} from './comment-moderation.js';
import {trackModerationRoute} from './track-moderation.js';
import {json,fail,rate,query,now} from './db.js';
import {viewer,authRoute,hash} from './auth.js';
import {catalogRoute} from './catalog.js';
import {mediaRoute,internalRoute} from './media.js';
import {membershipRoute} from './membership.js';
import {audioAdsRoute} from './audio-ads.js';
import {lyricsRoute} from './lyrics.js';
import {alignmentRoute} from './alignment.js';
import {karaokeRoute} from './karaoke.js';
import {coverRoute} from './covers.js';
import {duetRoute} from './duets.js';
import {giftRoute} from './gifts.js';
import {payoutRoute} from './payouts.js';
import {publicPageRoute} from './public-pages.js';
import {publicMusicRoute} from './public-music.js';
import {goldCallback,goldOrderRoute} from './gold-checkout.js';
import {billingRoute,billingWebhook,billingTick} from './billing.js';
export default {async fetch(req,env,ctx){
 const url=new URL(req.url),path=url.pathname;
 try{
  if(path==='/api/play/notifications')return await playWebhook(req,env);
  if(path==='/api/gold/nicepay/callback')return await goldCallback(req,env);
  if(path==='/api/billing/nicepay/webhook')return await billingWebhook(req,env);
  if(path==='/internal/billing/tick')return await billingTick(req,env);
  if(path.startsWith('/internal/'))return await internalRoute(req,env,path);
  const musicResponse=await publicMusicRoute(req,env,path);if(musicResponse)return musicResponse;
  const publicResponse=publicPageRoute(req,path);if(publicResponse)return publicResponse;
  if(!path.startsWith('/api/')&&!path.startsWith('/media/')){
   if(!['GET','HEAD'].includes(req.method))return json({error:'허용되지 않는 요청입니다.'},405);
   return env.ASSETS.fetch(req);
  }
  // Provider form POSTs have their own browser binding and token checks.
  const oauthCallback=/^\/api\/auth\/(google|apple)\/callback$/.test(path);
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!oauthCallback){
   const origin=req.headers.get('origin');
   if(origin!==url.origin||req.headers.get('sec-fetch-site')==='cross-site')fail(403,'사이트에서 다시 요청해주세요.');
  }
  if(path.startsWith('/api/auth/')&&!path.endsWith('/callback'))await rate(env,'auth-ip:'+await hash(req.headers.get('cf-connecting-ip')||'local'),40,900);
  const maxJson=path==='/api/uploads'||/^\/api\/studio\/tracks\/[^/]+(?:\/lyrics\/align)?$/.test(path)?131072:32768;
  const binary=path==='/api/me/profile/image'||/^\/api\/uploads\/[^/]+\/(audio|cover)$/.test(path)||/^\/api\/studio\/(artists|producers|tracks)\/[^/]+\/image$/.test(path)||/^\/api\/studio\/tracks\/[^/]+\/karaoke\/mr$/.test(path);
  if(!binary&&req.body){
   if(Number(req.headers.get('content-length')||0)>maxJson)fail(413,'요청이 너무 큽니다.');
   const reader=req.body.getReader(),chunks=[];let size=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxJson){await reader.cancel().catch(()=>{});fail(413,'요청이 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
   const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
   req=new Request(req,{body});
  }
  const user=await viewer(req,env);
  const playResponse=await playBillingRoute(req,env,path,user);if(playResponse)return playResponse;
  retryPush(env,ctx);
  const pushResponse=await pushRoute(req,env,path,user);if(pushResponse)return pushResponse;
  const chatStream=await chatStreamRoute(req,env,path,user);if(chatStream)return chatStream;
  const audioAdsResponse=audioAdsRoute(req,env,path,user);if(audioAdsResponse)return audioAdsResponse;
  if(Math.random()<.005)ctx.waitUntil(env.DB.batch([
   query(env,'DELETE FROM sessions WHERE expires<?',now()),
   query(env,'DELETE FROM oauth_states WHERE expires<?',now()),
   query(env,'DELETE FROM rate_limits WHERE expires<?',now())
  ]).catch(()=>console.error('Expired authentication state cleanup failed')));
  const result=await profileRoute(req,env,path,user)||await socialRoute(req,env,path,user)||await authRoute(req,env,path,user)||await billingRoute(req,env,path,user)||await membershipRoute(req,env,path,user)||await alignmentRoute(req,env,path,user)||await karaokeRoute(req,env,path,user)||await coverRoute(req,env,path,user)||await duetRoute(req,env,path,user)||await goldOrderRoute(req,env,path,user)||await giftRoute(req,env,path,user)||await coverRankingRoute(req,env,path)||await commentModerationRoute(req,env,path,user)||await trackModerationRoute(req,env,path,user)||await payoutRoute(req,env,path,user)||await lyricsRoute(req,env,path,user)||await catalogRoute(req,env,path,user)||await mediaRoute(req,env,path,user);
  if(result){
   if(req.method==='POST'&&result.ok&&(path.startsWith('/api/dm/')||/^\/api\/tracks\/[^/]+\/(comments|gifts)$/.test(path)))ctx.waitUntil(dispatchPush(env).catch(()=>console.error('Push dispatch failed')));
   if(path.startsWith('/api/auth/')&&result.headers.get('content-type')?.includes('application/json')){
    const body=await result.clone().json();if(body.user){body.user=await publicUser(env,body.user);return new Response(JSON.stringify(body),{status:result.status,headers:result.headers});}
   }
   return result;
  }
  return json({error:'페이지를 찾을 수 없습니다.'},404);
 }catch(e){
  if(!e.status)console.error(JSON.stringify({path,error:e.name,...((path.includes('/billing/')||path.includes('/gold/')||path.includes('/play/'))?{}:{message:String(e.message).slice(0,300)})}));
  const status=e.status||500,message=e.status?e.message:'잠시 연결이 원활하지 않습니다. 입력 내용은 유지되니 다시 시도해주세요.';
  if(path.includes('/auth/')&&path.endsWith('/callback'))return new Response(null,{status:303,headers:{location:'/#account?error='+encodeURIComponent(message),'cache-control':'no-store'}});
  return json({error:message},status);
 }
}};
