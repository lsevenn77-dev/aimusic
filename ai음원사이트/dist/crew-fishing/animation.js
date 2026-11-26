// Visual effects must never hold the input lock or a server-confirmed result open.
export function animationDeadline(play,ms,timers=globalThis){
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;timers.clearTimeout(timer);resolve();};
    const timer=timers.setTimeout(finish,ms);
    try{Promise.resolve(play()).then(finish,finish);}catch{finish();}
  });
}
