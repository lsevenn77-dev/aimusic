// Room geometry has one owner. Width fixes the stage; only the transcript flexes.
function bindRoomViewport(client){
 client.roomLayoutEvents?.abort();client.roomResizeObserver?.disconnect();
 const events=client.roomLayoutEvents=new AbortController(),options={signal:events.signal};
 const room=client.host,main=document.querySelector('#main'),composer=room.querySelector('#voice-chat-form');
 for(const button of room.querySelectorAll('#voice-chat-form > button,.room-dm-composer > button')){
  const gift=button.matches('[data-voice=gift],[data-room-dm-gift]');
  if(gift||button.type==='submit')button.innerHTML=roomFilledIcon(gift?'gift':'send');
 }
 const shell=[...document.querySelectorAll('.topbar,.mobile-navigation,#player,.player')];
 const write=(node,key,value)=>{if(node?.style.getPropertyValue(key)!==value)node?.style.setProperty(key,value);};
 const measure=()=>{
  client.roomLayoutFrame=0;if(client.closed||!room.isConnected)return;
  const vv=window.visualViewport,top=vv?.offsetTop||0,bottom=top+(vv?.height||innerHeight),mobile=innerWidth<=800;
  if(client.roomMobile!==mobile){client.roomMobile=mobile;setVoiceFocus(client.joined&&!client.closed);}
  let start=top,end=bottom;
  for(const el of shell){
   const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
   if(el.hidden||style.display==='none'||style.visibility==='hidden'||!rect.height||rect.bottom<=top||rect.top>=bottom)continue;
   if(el.matches('.topbar'))start=Math.max(start,Math.min(bottom,rect.bottom));
   else if(rect.top>start)end=Math.min(end,rect.top);
  }
  const box=room.getBoundingClientRect();
  const composerHeight=composer?.getBoundingClientRect().height;
  if(!mobile)start=Math.max(start,box.top);
  write(main,'--voice-top',start+'px');
  write(room,'--voice-viewport',Math.max(0,end-start)+'px');
  if(composerHeight)write(room,'--room-composer',composerHeight+'px');
  write(room,'--room-visual-top',top+'px');write(room,'--room-visual-height',(bottom-top)+'px');
  // Expose measured geometry for diagnostics and keep reads before writes next frame.
  client.roomBounds={top:start,bottom:end,width:box.width,visualHeight:bottom-top};
 };
 client.onViewport=()=>{if(!client.roomLayoutFrame)client.roomLayoutFrame=requestAnimationFrame(measure);};
 for(const type of ['resize','aifect:topbar-layout','aifect:input-viewport'])window.addEventListener(type,client.onViewport,options);
 window.visualViewport?.addEventListener('resize',client.onViewport,options);
 window.visualViewport?.addEventListener('scroll',client.onViewport,options);
 if(typeof ResizeObserver!=='undefined'){
  client.roomResizeObserver=new ResizeObserver(client.onViewport);
  for(const el of new Set([main,room,composer,...shell].filter(Boolean)))client.roomResizeObserver.observe(el);
 }
 measure();
}
function roomFilledIcon(kind){
 const path=kind==='send'?'M21.4 2.6a.8.8 0 0 0-.9-.2L2.8 9.5a.8.8 0 0 0 0 1.5l6.8 2.2 2.2 6.8a.8.8 0 0 0 1.5 0l8.3-16.5a.8.8 0 0 0-.2-.9ZM10.8 12.1l6.6-5.5-5.5 6.6-.9 3-.9-3-3-.9 3.7-.2Z':'M11 10H3V7h3.3A3.3 3.3 0 1 1 12 4.2 3.3 3.3 0 1 1 17.7 7H21v3h-8V7h-2v3ZM10.7 5.5C9.3 2.8 6.3 4.2 8.5 5.8L11 6l-.3-.5Zm2.6 0L13 6l2.5-.2c2.2-1.6-.8-3-2.2-.3ZM4 12h7v9H4v-9Zm9 0h7v9h-7v-9Z';
 return '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="none" aria-hidden="true"><path fill-rule="evenodd" d="'+path+'"/></svg>';
}
function patchRoomChildren(container,entries){
 const old=new Map([...container.children].map(node=>[node.dataset.roomKey,node]));
 entries.forEach(({key,html},index)=>{
  let node=old.get(key);old.delete(key);
  if(!node){const template=document.createElement('template');template.innerHTML=html;node=template.content.firstElementChild;}
  else if(node._roomHTML!==undefined&&node._roomHTML!==html){const template=document.createElement('template');template.innerHTML=html;const next=template.content.firstElementChild;node.replaceWith(next);node=next;}
  node.dataset.roomKey=key;node._roomHTML=html;
  if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);
 });
 for(const node of old.values())node.remove();
}
function roomRouteMatches(url,client){
 return url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search&&url.hash==='#'+(client.liveMode?'live':'voice')+'/'+client.id;
}
function leaveRoomForNavigation(url){
 const client=voiceController;
 if(!client||client.closed||roomRouteMatches(url,client))return;
 // leave() releases local tracks synchronously and sends a bounded keepalive POST.
 void client.leave();voiceController=null;
}
document.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('a[href]');
 if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||url.hash==='#main')return;
 leaveRoomForNavigation(url);
},{capture:true});
for(const type of ['popstate','hashchange'])window.addEventListener(type,()=>leaveRoomForNavigation(new URL(location.href)));
