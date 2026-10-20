// Only a Google GPT grant event is a reward. Video completion, closing and
// elapsed time are not grants. Inject GPT for deterministic, impression-free QA.
export function playDubbingReward({gpt,adUnit,signal,onGranted=()=>{},onStatus=()=>{},timeoutMs=30000}){
 return new Promise((resolve,reject)=>{
  let slot=null,service=null,settled=false,granted=false,displayed=false,timer;
  const listeners=[];
  const cleanup=()=>{
   clearTimeout(timer);signal?.removeEventListener('abort',abort);
   for(const [name,fn] of listeners)try{service?.removeEventListener(name,fn);}catch{}
   if(slot)try{gpt.destroySlots([slot]);}catch{}
  };
  const finish=(error)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve({granted});};
  const abort=()=>finish(granted?null:new Error('광고 시청을 취소했어요. 작성 횟수는 그대로예요.'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>finish(new Error('지금은 광고를 불러올 수 없어요. 잠시 뒤 다시 시도해주세요.')),timeoutMs);
  const listen=(name,fn)=>{const handler=e=>{if(!settled&&e.slot===slot)fn(e);};listeners.push([name,handler]);service.addEventListener(name,handler);};
  gpt.cmd.push(()=>{
   if(settled)return;
   try{
    slot=gpt.defineOutOfPageSlot(adUnit,gpt.enums.OutOfPageFormat.REWARDED);
    if(!slot){finish(new Error('이 브라우저에서는 보상형 광고를 지원하지 않아요. 모바일 브라우저에서 다시 이용해주세요.'));return;}
    service=gpt.pubads();slot.addService(service);
    listen('slotRenderEnded',e=>{if(e.isEmpty)finish(new Error('지금 제공할 광고가 없어요. 무료 작성이나 직접 대본 쓰기는 계속 이용할 수 있어요.'));});
    listen('rewardedSlotReady',e=>{
     if(displayed)return;
     // The caller starts this only after the explicit reward opt-in button.
     displayed=true;
     try{if(e.makeRewardedVisible()===false){finish(new Error('광고를 표시하지 못했어요. 잠시 뒤 다시 시도해주세요.'));return;}}
     catch{finish(new Error('광고를 표시하지 못했어요. 잠시 뒤 다시 시도해주세요.'));return;}
     clearTimeout(timer);timer=setTimeout(()=>finish(granted?null:new Error('광고 시청 시간이 만료됐어요. 다시 이용해주세요.')),10*60*1000);
     onStatus('광고를 시청하고 있어요. 완료하면 작성 횟수를 1회 더 드려요.');
    });
    listen('rewardedSlotGranted',()=>{if(granted)return;granted=true;onGranted();});
    listen('rewardedSlotClosed',()=>finish());
    gpt.enableServices();gpt.display(slot);
   }catch{finish(new Error('광고를 불러오지 못했어요. 잠시 뒤 다시 시도해주세요.'));}
  });
 });
}
