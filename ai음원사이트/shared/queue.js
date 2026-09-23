export function insertTrack(queue,trackId,currentId,placement='last'){
 if(trackId===currentId)return [...queue];
 const next=queue.filter(id=>id!==trackId);
 if(placement==='next')next.splice(Math.max(0,next.indexOf(currentId)+1),0,trackId);else next.push(trackId);
 return next;
}
export function removeTrack(queue,trackId,currentId){return trackId===currentId?[...queue]:queue.filter(id=>id!==trackId);}
export function moveTrack(queue,index,direction){const next=[...queue],to=index+direction;if(!Number.isInteger(index)||![-1,1].includes(direction)||index<0||index>=next.length||to<0||to>=next.length)return next;[next[index],next[to]]=[next[to],next[index]];return next;}
export function clearWaiting(currentId){return currentId?[currentId]:[];}
export function restoreQueue(value){
 try{const data=JSON.parse(value);if(!Array.isArray(data?.ids)||!Array.isArray(data?.tracks))return {ids:[],tracks:[]};const ids=[...new Set(data.ids)].filter(id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id)).slice(0,500);return {ids,tracks:data.tracks.filter(t=>t&&ids.includes(t.id)).map(t=>({id:t.id,title:String(t.title||'음악').slice(0,120),artist:String(t.artist||'').slice(0,60)}))};}catch{return {ids:[],tracks:[]};}
}
