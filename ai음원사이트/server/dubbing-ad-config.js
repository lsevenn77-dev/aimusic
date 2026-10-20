// Web inventory is independent of AdMob interstitials and AdSense display slots.
export function dubbingRewardUnit(env){
 const unit=env.DUBBING_REWARDED_AD_UNIT||'';
 if(env.DUBBING_ENABLED!=='true'||env.DUBBING_REWARDED_ADS_ENABLED!=='true'||env.DUBBING_AI_ENABLED!=='true'||!(env.OPENAI_API_KEY||env.LLM_API_KEY))return null;
 if(!/^\/\d{4,16}\/[A-Za-z0-9_/-]{1,160}$/.test(unit)||/sample|example|test/i.test(unit)||unit.startsWith('/22639388115/')||unit.startsWith('/21775744923/'))return null;
 return unit;
}
export function dubbingRewardAvailable(req,env){
 // Match the existing web ad rollout. Other regions need a verified CMP first.
 return req.cf?.country==='KR'&&!!dubbingRewardUnit(env);
}
