// Local browser QA only. Never included in the production client build.
addEventListener('load',()=>{
 const proto=VoiceRoomClient.prototype,seat=proto.talkSeatAction,paint=proto.paint,command=proto.command,refresh=proto.refresh,enable=proto.enableMic,socket=proto.socket;
 proto.socket=function(...args){const result=socket.apply(this,args);this.ws?.addEventListener('message',e=>{const m=this.qaSeat;if(!m)return;try{const s=JSON.parse(e.data).state;if(s?.members?.some(p=>p.id===this.state.self&&p.seat===m.target))m.websocketArrivalMs=performance.now()-m.started;}catch{}});return result;};
 proto.paint=function(...args){const t=performance.now(),r=paint.apply(this,args),m=this.qaSeat;if(m){m.paintMs+=performance.now()-t;m.paints++;const seat=this.host?.querySelectorAll('.voice-seat')[m.target];if(m.localMs===null&&seat?.querySelector('[data-target="'+this.state.self+'"]'))m.localMs=performance.now()-m.started;}return r;};
 proto.command=async function(...args){const t=performance.now(),r=await command.apply(this,args);if(this.qaSeat){this.qaSeat.commands++;this.qaSeat.actions.push(args[0]);if(args[0]==='request-mic'){this.qaSeat.apiMs=performance.now()-t;this.qaSeat.server=r.commandTiming||null;}}return r;};
 proto.refresh=function(...args){if(this.qaSeat)this.qaSeat.refreshes++;return refresh.apply(this,args);};
 proto.enableMic=function(...args){if(this.qaSeat)this.qaSeat.micReconnects++;return enable.apply(this,args);};
 proto.talkSeatAction=async function(action,target,...rest){
  if(action!=='request-mic'||this.seatCommandPending)return seat.call(this,action,target,...rest);
  const m=this.qaSeat={started:performance.now(),target:Number(target),localMs:null,paintMs:0,paints:0,commands:0,actions:[],refreshes:0,micReconnects:0};
  const peers=[this.publisher,...this.audios.values()];
  try{return await seat.call(this,action,target,...rest);}finally{m.totalMs=performance.now()-m.started;m.sameAudio=peers.every((p,i)=>p===[this.publisher,...this.audios.values()][i]);delete m.started;console.info('QA_SEAT '+JSON.stringify(m));this.qaSeat=null;}
 };
});
