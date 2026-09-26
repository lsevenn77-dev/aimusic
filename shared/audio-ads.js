export const AUDIO_AD_INTERVAL=5;

// Native played ranges exclude jumps made with the seek control and work when
// the background tab throttles JavaScript timers.
export function playedSeconds(ranges){
 let total=0;
 for(let i=0;i<(ranges?.length||0);i++)total+=Math.max(0,ranges.end(i)-ranges.start(i));
 return total;
}

export function createAudioAdCadence(initial=0,onChange=()=>{}){
 let count=Math.max(0,Math.min(AUDIO_AD_INTERVAL,Math.floor(Number(initial)||0)));
 const completed=new Set();
 const save=value=>{count=value;onChange(count);};
 return {
  get count(){return count;},
  get due(){return count>=AUDIO_AD_INTERVAL;},
  complete({session,preview,duration,listened}){
   if(!session||preview||completed.has(session)||!(duration>0)||!Number.isFinite(duration)||!(listened>=duration*.6))return false;
   completed.add(session);if(completed.size>100)completed.delete(completed.values().next().value);
   save(Math.min(AUDIO_AD_INTERVAL,count+1));return true;
  },
  attempted(){save(0);},
  reset(){completed.clear();save(0);}
 };
}
