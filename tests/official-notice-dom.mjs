export function eventTarget(target={}){
 const listeners=new Map();
 return Object.assign(target,{
  addEventListener(type,listener,{signal}={}){
   if(!listeners.has(type))listeners.set(type,new Set());
   listeners.get(type).add(listener);
   signal?.addEventListener('abort',()=>listeners.get(type)?.delete(listener),{once:true});
  },
  removeEventListener(type,listener){listeners.get(type)?.delete(listener);},
  emit(type,event={}){for(const listener of [...(listeners.get(type)||[])])listener(event);},
  listenerCount:type=>listeners.get(type)?.size||0
 });
}

export function noticeDOM(items){
 const bounds={top:0,bottom:220,height:220};
 const pane=eventTarget({scrollTop:0,isConnected:true,getClientRects:()=>[bounds],getBoundingClientRect:()=>bounds});
 const earlier={};
 const label={textContent:''};
 const retry=eventTarget({});
 const status={hidden:true,querySelector:selector=>selector==='span'?label:retry};
 const list={children:items.map((entry,index)=>{
  const measure=(shift=0)=>({top:20+index*400-pane.scrollTop+shift,bottom:400+index*400-pane.scrollTop,height:380-shift});
  return {isConnected:true,dataset:{noticeId:entry.id},getBoundingClientRect:measure,querySelector:()=>({getBoundingClientRect:()=>measure(28)})};
 })};
 pane.querySelector=selector=>selector==='[data-official-notice-items]'?list:earlier;
 const host={querySelector:selector=>selector==='[data-official-notice-scroll]'?pane:status};
 return {host,pane,label,retry,status,list};
}
