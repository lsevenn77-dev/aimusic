import {position,progressAfter} from './rules.js';

// Show the shared rules immediately; submit the same frames in order for official records.
export function createReel({initial,request,onChange,onConfirmed=()=>{},onFinish=()=>{},onError=()=>{}}){
  let confirmed={...initial},shown={...initial},queue=[],sending=false,disposed=false;
  const matches=(a,b)=>['seq','progress','warnings','status','lastPass'].every(key=>a[key]===b[key]);
  async function drain(){
    if(sending||disposed)return;
    sending=true;
    try{
      while(queue.length&&!disposed){
        const job=queue[0];let result;
        try{
          result=(await request(job.input)).cast;
          if(!result||result.id!==confirmed.id)throw Error('낚시 판정을 다시 확인해주세요.');
        }catch(error){
          if(disposed)return;
          queue=[];shown={...confirmed};onChange(shown,'reset');onError(error);return;
        }
        if(disposed)return;
        queue.shift();confirmed={...result};
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
  return {
    tap(elapsed){
      if(disposed||shown.status!=='active'||!Number.isFinite(elapsed)||elapsed<0)return false;
      const pass=Math.floor(2*elapsed/shown.cycle);
      if(pass<=shown.lastPass)return false;
      const spot=position(elapsed,shown.cycle),hit=spot>=shown.target&&spot<=shown.target+shown.width;
      const next={...shown,...progressAfter(shown,hit),seq:shown.seq+1,lastPass:pass};
      const kind=hit?'success':next.warnings>shown.warnings?'warning':'miss';
      queue.push({input:{id:shown.id,seq:next.seq,elapsed},expected:next});
      shown=next;onChange(shown,kind);void drain();return true;
    },
    dispose(){disposed=true;queue=[];},
  };
}
