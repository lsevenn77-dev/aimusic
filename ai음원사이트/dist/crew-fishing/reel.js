import {position,progressAfter,IDLE_MS} from './rules.js';

// Show the shared rules immediately; submit the same frames in order for official records.
export function createReel({initial,request,requestBatch,onChange,onConfirmed=()=>{},onFinish=()=>{},onError=()=>{}}){
  let confirmed={expiresAt:initial.start+IDLE_MS,...initial},shown={...confirmed},queue=[],sending=false,disposed=false;
  const matches=(a,b)=>['seq','progress','warnings','status','lastPass'].every(key=>a[key]===b[key]);
  async function drain(){
    if(sending||disposed)return;
    sending=true;
    try{
      while(queue.length&&!disposed){
        // A slow acknowledgement must not make each waiting tap pay another round trip.
        const jobs=[];
        if(requestBatch){for(const j of queue){if(j.input.timeout||jobs.length===24)break;jobs.push(j);}}
        const batch=jobs.length>0;if(!batch)jobs.push(queue[0]);
        const job=jobs.at(-1);let result;
        try{
          const send=()=>batch?requestBatch(jobs.map(j=>j.input)):request(job.input);
          try{result=(await send()).cast;}catch(e){
            if(disposed)return;
            if(e.retryable!==true)throw e;
            result=(await send()).cast; // Same cast and sequence, including a lost acknowledgement.
          }
          if(!result||result.id!==confirmed.id)throw Error('낚시 판정을 다시 확인해 주세요.');
        }catch(error){
          if(disposed)return;
          queue=[];shown={...confirmed};onChange(shown,'reset');onError(error);return;
        }
        if(disposed)return;
        queue.splice(0,jobs.length);confirmed={...result};
        if(!matches(confirmed,job.expected)){
          queue=[];shown={...confirmed};onChange(shown,'reset');
        }else if(!queue.length)shown={...confirmed};
        onConfirmed(confirmed,queue.length===0);
        if(confirmed.status!=='active'){
          queue=[];await onFinish(confirmed);return;
        }
      }
    }finally{sending=false;}
  }
  function expire(elapsed){
    if(disposed||shown.status!=='active'||shown.start+elapsed<shown.expiresAt)return false;
    const next={...shown,status:'escaped',notice:'idle'};
    queue.push({input:{id:shown.id,seq:shown.seq+1,timeout:true},expected:next});
    shown=next;onChange(shown,'idle');void drain();return true;
  }
  return {
    expire,
    tap(elapsed){
      if(disposed||shown.status!=='active'||!Number.isFinite(elapsed)||elapsed<0)return false;
      if(expire(elapsed))return false;
      const pass=Math.floor(2*elapsed/shown.cycle);
      if(shown.start+elapsed<shown.expiresAt-IDLE_MS)return false;
      const spot=position(elapsed,shown.cycle),hit=spot>=shown.target&&spot<=shown.target+shown.width;
      const samePass=pass<=shown.lastPass;
      const next={...shown,...(samePass?{}:progressAfter(shown,hit)),seq:shown.seq+1,lastPass:pass,expiresAt:shown.start+elapsed+IDLE_MS};
      const kind=samePass?'touch':hit?'success':next.warnings>shown.warnings?'warning':'miss';
      queue.push({input:{id:shown.id,seq:next.seq,elapsed},expected:next});
      shown=next;onChange(shown,kind);void drain();return true;
    },
    dispose(){disposed=true;queue=[];},
  };
}
