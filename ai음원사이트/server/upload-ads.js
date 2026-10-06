import {json} from './db.js';
import {isPremium} from './membership.js';

// Separate inventory from listening: never use an AdMob ID or audio VAST here.
export function uploadAdsRoute(req,env,path,user){
 if(path!=='/api/ads/upload'||req.method!=='GET')return null;
 if(!user||isPremium(user)||req.cf?.country!=='KR'||env.WEB_UPLOAD_ADS_ENABLED!=='true')return json({enabled:false});
 const client=env.WEB_UPLOAD_AD_CLIENT,slot=env.WEB_UPLOAD_AD_SLOT;
 if(!/^ca-pub-\d{16}$/.test(client||'')||!/^\d{10}$/.test(slot||''))return json({enabled:false});
 return json({enabled:true,client,slot});
}
