let dubbingRewardScript=null,dubbingRewardOperation=null;
function dubbingLoadGPT(){
 if(window.googletag?.apiReady)return Promise.resolve(window.googletag);
 if(dubbingRewardScript)return dubbingRewardScript;
 dubbingRewardScript=new Promise((resolve,reject)=>{
  window.googletag=window.googletag||{cmd:[]};
  const script=document.createElement('script');script.async=true;script.src='https://securepubads.g.doubleclick.net/tag/js/gpt.js';
  script.crossOrigin='anonymous';let done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(error){script.remove();dubbingRewardScript=null;reject(error);}else resolve(window.googletag);};
  const timer=setTimeout(()=>finish(new Error('광고 연결이 늦어지고 있어요. 잠시 뒤 다시 시도해주세요.')),20000);
  script.onerror=()=>finish(new Error('광고를 불러올 수 없어요. 광고 차단 설정이나 네트워크를 확인해주세요.'));
  script.onload=()=>finish();document.head.append(script);
 });return dubbingRewardScript;
}
const dubbingRewardKey=()=>me?'aifect-dubbing-ad:'+me.id:null;
function dubbingRewardPending(value){
 try{const key=dubbingRewardKey();if(!key)return null;if(arguments.length){value?sessionStorage.setItem(key,JSON.stringify(value)):sessionStorage.removeItem(key);return value;}
  const p=JSON.parse(sessionStorage.getItem(key)||'null');return p&&typeof p.sessionId==='string'&&typeof p.requestId==='string'?p:null;
 }catch{return null;}
}
function dubbingStopReward(){dubbingRewardOperation?.abort();}
function bindDubbingReward(view,form,updateCreate){
 const root=form.querySelector('#dubbing-quota');if(!root)return;
 const refresh=async()=>{if(!form.isConnected)return;view.config=await api('/api/dubbing/config');root.innerHTML=dubbingQuotaHTML(view.config.quota);bindDubbingReward(view,form,updateCreate);updateCreate();};
 const status=text=>{if(form.isConnected)dubbingMessage(form,text);};
 const complete=async session=>{
  const r=await api('/api/dubbing/ad-sessions/complete','POST',{...session,event:'rewardedSlotGranted'});
  dubbingRewardPending(null);status(r.granted?'대본 작성 횟수 1회를 받았어요.':'오늘의 광고 보상 4회를 모두 받았어요.');return r;
 };
 const retry=root.querySelector('[data-dubbing-reward-retry]');
 if(retry)retry.onclick=async()=>{if(dubbingRewardOperation)return;retry.disabled=true;try{const p=dubbingRewardPending();if(p)await complete(p);await refresh();}catch(err){status(err.message);if([404,409].includes(err.status)){dubbingRewardPending(null);await refresh().catch(()=>{});}else retry.disabled=false;}};
 const button=root.querySelector('[data-dubbing-reward]');if(!button)return;
 button.onclick=async()=>{
  if(dubbingRewardOperation)return;
  const controller=new AbortController();dubbingRewardOperation=controller;button.disabled=true;updateCreate();
  let session=null,granted=false,ack=null,ackError=null;
  try{
   status('광고를 준비하고 있어요…');
   const requestId=crypto.randomUUID();let start;
   try{start=await api('/api/dubbing/ad-sessions','POST',{requestId});}catch(err){if(err.status)throw err;start=await api('/api/dubbing/ad-sessions','POST',{requestId});}
   session={requestId,sessionId:start.sessionId};
   if(controller.signal.aborted)throw new Error('광고 시청을 취소했어요.');
   const gpt=await dubbingLoadGPT();
   const result=await AifectDubbingRewards.playDubbingReward({gpt,adUnit:start.adUnit,signal:controller.signal,onStatus:status,onGranted:()=>{
    granted=true;dubbingRewardPending(session);status('광고 보상을 반영하고 있어요…');
    // Start acknowledgement at grant time, even if the user leaves before close.
    ack=complete(session).catch(err=>{ackError=err;});
   }});
   if(ack)await ack;
   if(ackError)status('보상 반영을 확인하지 못했어요. 광고를 다시 보지 말고 ‘보상 다시 확인’을 눌러주세요.');
   else if(!result.granted)status('광고가 완료되기 전에 닫혔어요. 작성 횟수는 그대로예요.');
  }catch(err){status(err.message);}
  finally{
   if(session&&!granted)try{await api('/api/dubbing/ad-sessions/cancel','POST',session);}catch{}
   dubbingRewardOperation=null;
   try{await refresh();}catch{if(form.isConnected){root.innerHTML=dubbingQuotaHTML(view.config.quota);bindDubbingReward(view,form,updateCreate);updateCreate();}}
  }
 };
}
