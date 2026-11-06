// Room geometry has one owner. Width fixes the stage; only the transcript flexes.
function bindRoomViewport(client){
 client.roomLayoutEvents?.abort();client.roomResizeObserver?.disconnect();
 const events=client.roomLayoutEvents=new AbortController(),options={signal:events.signal};
 const back=()=>{if(client.closed)return false;if(client.talkPopup?.open)client.closeRoomPopup();else client.safe(()=>client.action('leave'));return true;};
 window.aifectRoomBack=back;
 events.signal.addEventListener('abort',()=>{if(window.aifectRoomBack===back)delete window.aifectRoomBack;},{once:true});
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
  const composerTop=composer?.getBoundingClientRect().top??end;
  write(room,'--room-popup-available',Math.max(0,composerTop-start-16)+'px');
  write(document.documentElement,'--room-toast-bottom',Math.max(0,innerHeight-composerTop+10)+'px');
  write(room,'--room-visual-top',top+'px');write(room,'--room-visual-height',(bottom-top)+'px');
  // Expose measured geometry for diagnostics and keep reads before writes next frame.
  client.roomBounds={top:start,bottom:end,width:box.width,visualHeight:bottom-top};
  positionRoomPopup(client);
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
// Nonmodal desktop sheets use viewport coordinates, never the stretched chat column.
function roomPopupPlacement(anchor,bounds,width,height,above=false){
 const gap=8,w=Math.min(width,Math.max(0,bounds.right-bounds.left));
 const below=Math.max(0,bounds.bottom-anchor.bottom-gap),over=Math.max(0,anchor.top-bounds.top-gap);
 const up=above?over>0:below<Math.min(height,240)&&over>below;
 const limit=Math.max(0,Math.min(620,up?over:below)),h=Math.min(height,limit);
 return {left:Math.max(bounds.left,Math.min(anchor.right-w,bounds.right-w)),top:Math.max(bounds.top,Math.min(up?anchor.top-gap-h:anchor.bottom+gap,bounds.bottom-h)),width:w,maxHeight:limit};
}
function positionRoomPopup(client){
 const sheet=client.talkPopup;if(!sheet?.open)return;
 if(innerWidth<=800||sheet.id==='live-search-sheet'||sheet.classList.contains('profile-preview')){sheet.removeAttribute('data-room-anchored');return;}
 const vv=window.visualViewport,room=client.host.getBoundingClientRect(),top=vv?.offsetTop||0,left=vv?.offsetLeft||0;
 const bounds={left:Math.max(left+8,room.left),right:Math.min(left+(vv?.width||innerWidth)-8,room.right),top:top+8,bottom:Math.min(top+(vv?.height||innerHeight)-8,client.roomBounds?.bottom??Infinity)};
 const trigger=client.popupTrigger?.isConnected?client.popupTrigger:client.host.querySelector('.room-header');
 const anchor=trigger.getBoundingClientRect(),width=sheet.id==='voice-room-settings'?340:sheet.id==='voice-emoji-picker'?360:sheet.id==='dialog'||sheet.id==='room-inbox'?420:380;
 sheet.setAttribute('data-room-anchored','');
 const write=(key,value)=>{const next=value+'px';if(sheet.style.getPropertyValue(key)!==next)sheet.style.setProperty(key,next);};
 const preferred=trigger.closest('#voice-chat-form')!==null;
 const fit=roomPopupPlacement(anchor,bounds,width,620,preferred);
 write('--room-popup-width',fit.width);write('--room-popup-max',fit.maxHeight);
 const placed=roomPopupPlacement(anchor,bounds,fit.width,sheet.getBoundingClientRect().height,preferred);
 write('--room-popup-left',placed.left);write('--room-popup-top',placed.top);
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
 return url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search&&['#live/'+client.id,'#voice/'+client.id].includes(url.hash.split('?')[0]);
}
function leaveRoomForNavigation(url){
 const client=voiceController;
 if(!client||client.closed||roomRouteMatches(url,client))return false;
 if(!client.joined){void client.leave();voiceController=null;return false;}
 client.pendingRoomNavigation=url.href;
 if(client.talkPopup?.id!=='talk-leave'||!client.talkPopup.open)client.safe(()=>client.action('leave'));
 return true;
}
function retainRoomRoute(raw){
 const client=voiceController;
 if(!me||!client?.joined||client.closed||!client.host?.isConnected)return false;
 const target=new URL('#'+raw,location.href);
 if(!roomRouteMatches(target,client)&&!leaveRoomForNavigation(target))return false;
 const route=(client.liveMode?'live/':'voice/')+client.id;
 history.replaceState(history.state,'','#'+route);
 document.querySelector('#main').dataset.route=route;
 return true;
}
document.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('a[href]');
 if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||url.hash==='#main')return;
 if(leaveRoomForNavigation(url)){event.preventDefault();event.stopImmediatePropagation();}
},{capture:true});
for(const type of ['popstate','hashchange'])window.addEventListener(type,()=>{
 const client=voiceController,url=new URL(location.href);
 if(leaveRoomForNavigation(url)&&client)history.replaceState(history.state,'','#'+(client.liveMode?'live/':'voice/')+client.id);
});
