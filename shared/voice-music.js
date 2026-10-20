// Room transport only: never creates ordinary playback/listen/settlement entries.
export const emptyRoomMusic=()=>({queue:[],index:-1,playing:false,position:0,updated:Date.now(),volume:0.7,balance:0.7,repeat:'off',revision:0,starts:0});
export function roomMusicPosition(m,now=Date.now()) {
 const duration=m.queue[m.index]?.duration||0;
 return Math.max(0,Math.min(duration,m.position+(m.playing?Math.max(0,now-m.updated)/1000:0)));
}
export function changeRoomMusic(prior,command,track,now=Date.now()) {
 const m=structuredClone(prior||emptyRoomMusic());m.position=roomMusicPosition(m,now);m.updated=now;
 const start=i=>{m.index=i;m.position=0;m.playing=i>=0;if(i>=0)m.starts++;};
 switch(command.operation){
  case 'enqueue': if(!track||m.queue.length>=50)throw Error('재생목록은 최대 50곡이에요.');m.queue.push(track);if(m.index<0)start(m.queue.length-1);break;
  case 'play':if(m.index<0&&m.queue.length)start(0);else if(m.index>=0){if(m.position>=m.queue[m.index].duration)start(m.index);m.playing=true;}break;
  case 'stop':m.playing=false;m.position=0;m.index=-1;break;
  case 'seek':{const value=Number(command.position);if(m.index<0||!Number.isFinite(value)||value<0||value>m.queue[m.index].duration)throw Error('재생 위치를 확인해주세요.');m.position=value;break;}
  case 'pause':m.playing=false;break;
  case 'restart':if(m.index>=0)start(m.index);break;
  case 'previous':start(m.index>0?m.index-1:m.queue.length?0:-1);break;
  case 'next':start(m.index+1<m.queue.length?m.index+1:m.repeat==='all'&&m.queue.length?0:-1);break;
  case 'repeat':if(!['off','all','one'].includes(command.mode))throw Error('반복 설정을 확인해주세요.');m.repeat=command.mode;break;
  case 'clear':m.queue=[];start(-1);break;
  case 'ended':if(command.revision!==m.revision)return prior;if(m.position+0.5<(m.queue[m.index]?.duration||Infinity))return prior;start(m.repeat==='one'?m.index:m.index+1<m.queue.length?m.index+1:m.repeat==='all'?0:-1);break;
  case 'remove':{const i=command.index;if(!Number.isInteger(i)||i<0||i>=m.queue.length)throw Error('대기열을 다시 확인해주세요.');m.queue.splice(i,1);if(i<m.index)m.index--;else if(i===m.index)start(i<m.queue.length?i:-1);break;}
  case 'move':{const {index,to}=command;if(!Number.isInteger(index)||!Number.isInteger(to)||index<0||to<0||index>=m.queue.length||to>=m.queue.length)throw Error('곡 순서를 확인해주세요.');const current=m.queue[m.index];m.queue.splice(to,0,m.queue.splice(index,1)[0]);m.index=current?m.queue.indexOf(current):-1;break;}
  case 'volume':case 'balance':{const key=command.operation,value=Number(command.value);if(!Number.isFinite(value)||value<0||value>1)throw Error('음량은 0~100%로 설정해주세요.');m[key]=value;if(key==='balance')m.volume=value;break;}
  default:throw Error('지원하지 않는 음악 명령이에요.');
 }
 m.revision++;return m;
}
