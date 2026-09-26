import {json} from './db.js';
import {isPremium} from './membership.js';

// Do not turn an AdSense display slot or a sample tag into live audio inventory.
export function audioAdTag(value){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='pubads.g.doubleclick.net'||url.pathname!=='/gampad/ads'||url.username||url.password)return null;
  const iu=url.searchParams.get('iu');
  if(!/^\/\d+\/.+/.test(iu||'')||/sample|example|test/i.test(iu)||iu.startsWith('/21775744923/'))return null;
  if(url.searchParams.get('adtest')==='on')return null;
  url.searchParams.set('ad_type','audio');url.searchParams.set('env','instream');url.searchParams.set('vpmute','0');
  url.searchParams.set('output','vast');url.hash='';return url.href;
 }catch{return null;}
}

export function audioAdsRoute(req,env,path,user){
 if(path!=='/api/ads/audio'||req.method!=='GET')return null;
 if(!user||isPremium(user))return json({enabled:false});
 const tag=audioAdTag(env.WEB_AUDIO_AD_TAG_URL);
 if(!tag)return json({enabled:false});
 // Initial rollout is Korea only. Enable additional countries only after the
 // certified CMP for IMA has been configured and verified for those regions.
 if(req.cf?.country!=='KR')return json({enabled:false});
 return json({enabled:true,tag,interval:5});
}
