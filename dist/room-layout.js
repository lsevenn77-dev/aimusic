// Room geometry has one owner. Width fixes the stage; only the transcript flexes.
function roomUsesDesktopControls(){
 return !!window.matchMedia?.('(min-width:801px) and (hover:hover) and (pointer:fine)')?.matches
  && !window.Capacitor?.isNativePlatform?.();
}
function bindRoomViewport(client){
 client.roomLayoutEvents?.abort();client.roomResizeObserver?.disconnect();
 const events=client.roomLayoutEvents=new AbortController(),options={signal:events.signal};
 globalThis.AifectChristmasReview?.bindRoom(client.host, events.signal, client.state?.room);
 const back=()=>{
  if(client.closed)return false;
  if(client.talkPopup?.open)client.closeRoomPopup();
  else if(client.host.querySelector('#voice-emoji-picker')?.open)client.toggleEmojiPicker(false,true);
  else client.safe(()=>client.action('leave'));
  return true;
 };
 window.aifectRoomBack=back;
 events.signal.addEventListener('abort',()=>{if(window.aifectRoomBack===back)delete window.aifectRoomBack;},{once:true});
 const room=client.host,main=document.querySelector('#main'),chatPanel=room.querySelector('.voice-chat-panel'),composer=room.querySelector('#voice-chat-form'),transcript=room.querySelector('#voice-chat'),picker=room.querySelector('#voice-emoji-picker');
 room.toggleAttribute?.('data-room-low-memory',!!globalThis.navigator?.deviceMemory&&navigator.deviceMemory<=4);
 client.roomChatAtEnd=true;
 transcript?.addEventListener?.('scroll',()=>{
  // A keyboard resize must not be mistaken for the reader scrolling history.
  if(client.roomChatHeight===transcript.clientHeight)client.roomChatAtEnd=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<=2;
  client.roomChatHeight=transcript.clientHeight;
 },{...options,passive:true});
 for(const button of room.querySelectorAll('#voice-chat-form > button,.room-dm-composer > button')){
  const gift=button.matches('[data-voice=gift],[data-room-dm-gift]');
  if(gift||button.type==='submit')button.innerHTML=roomFilledIcon(gift?'gift':'send');
 }
 const shell=[...document.querySelectorAll('.topbar,.mobile-navigation,#player,.player')];
 const write=(node,key,value)=>{if(node?.style.getPropertyValue(key)!==value)node?.style.setProperty(key,value);};
 const measure=()=>{
  client.roomLayoutFrame=0;if(client.closed||!room.isConnected)return;
  const vv=window.visualViewport,top=vv?.offsetTop||0,bottom=top+(vv?.height||innerHeight),mobile=innerWidth<=800;
  const focused=!!document.activeElement?.closest?.('#voice-chat-form'),keyboard=mobile&&focused&&!!(window.AifectMobileInput?.measure?.().keyboard||document.documentElement?.hasAttribute?.('data-mobile-keyboard'));
  const stickers=!!picker?.open&&!picker.hidden;
  room.toggleAttribute?.('data-room-keyboard',keyboard);
  room.toggleAttribute?.('data-room-chat-active',mobile&&keyboard);
  room.toggleAttribute?.('data-room-stickers',stickers);
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
  const pc=roomUsesDesktopControls();
  room.toggleAttribute?.('data-room-pc-controls',pc);
  if(pc){
   write(room,'--room-width',box.width+'px');
   const content=room.querySelector('#voice-content');
   if(content)write(room,'--room-content-scrollbar',Math.max(0,content.offsetWidth-content.clientWidth)+'px');
  }
  if(pc)write(room,'--room-display-ratio',String(window.devicePixelRatio || 1));
  if(composerHeight)write(room,'--room-composer',composerHeight+'px');
  const composerTop=composer?.getBoundingClientRect().top??end;
  // Preserve the mobile bottom anchor, but keep short-screen sheets below the
  // header so the same top controls can still close or switch the open popup.
  const popupStart=mobile?Math.max(start,room.querySelector('.room-header')?.getBoundingClientRect().bottom??start):start;
  write(room,'--room-popup-available',Math.max(0,composerTop-popupStart-16)+'px');
  write(document.documentElement,'--room-toast-bottom',Math.max(0,innerHeight-composerTop+10)+'px');
  write(room,'--room-visual-top',top+'px');write(room,'--room-visual-height',(bottom-top)+'px');
  if(stickers&&composer){
   const rect=composer.getBoundingClientRect(),height=Math.max(0,Math.min(256,(bottom-top)*.4,rect.top-popupStart-16));
   write(room,'--room-emoji-left',rect.left+'px');write(room,'--room-emoji-width',rect.width+'px');
   write(room,'--room-emoji-top',Math.max(popupStart+8,rect.top-height-8)+'px');write(room,'--room-emoji-height',height+'px');
  }
  // Expose measured geometry for diagnostics and keep reads before writes next frame.
  client.roomBounds={top:start,bottom:end,width:box.width,visualHeight:bottom-top};
  positionRoomPopup(client);
  if(Number.isFinite(transcript?.scrollHeight)){
   if(client.roomChatAtEnd&&client.roomChatHeight!==transcript.clientHeight)transcript.scrollTop=transcript.scrollHeight;
   client.roomChatHeight=transcript.clientHeight;
  }
 };
 client.onViewport=()=>{if(!client.roomLayoutFrame)client.roomLayoutFrame=requestAnimationFrame(measure);};
 for(const type of ['resize','aifect:topbar-layout','aifect:input-viewport'])window.addEventListener(type,client.onViewport,options);
 window.addEventListener('scroll',client.onViewport,{...options,passive:true});
 window.visualViewport?.addEventListener('resize',client.onViewport,options);
 window.visualViewport?.addEventListener('scroll',client.onViewport,options);
 if(typeof ResizeObserver!=='undefined'){
  client.roomResizeObserver=new ResizeObserver(client.onViewport);
  for(const el of new Set([main,room,chatPanel,composer,transcript,picker,...shell].filter(Boolean)))client.roomResizeObserver.observe(el);
 }
 measure();
}
// Keep the desktop overlay inside the visible transcript, clear of its composer.
function roomPopupPlacement(chat,bounds,composerTop=chat.bottom){
 const left=Math.max(bounds.left,chat.left),right=Math.min(bounds.right,chat.right);
 const bottom=Math.min(bounds.bottom,chat.bottom,composerTop);
 const top=Math.min(bottom,Math.max(bounds.top,chat.top)+12);
 const inset=Math.min(14,Math.max(0,(right-left)/2));
 return {left:left+inset,top,width:Math.max(0,right-left-2*inset),maxHeight:Math.max(0,Math.min(560,bottom-top-10))};
}
function positionRoomPopup(client){
 const sheet=client.talkPopup;if(!sheet?.open)return;
 if(innerWidth<=800||sheet.classList.contains('room-emoji-dock')){sheet.removeAttribute('data-room-anchored');return;}
 const chat=client.host.querySelector('.voice-chat-panel');if(!chat)return;
 const vv=window.visualViewport,room=client.host.getBoundingClientRect(),top=vv?.offsetTop||0,left=vv?.offsetLeft||0;
 const bounds={left:Math.max(left,room.left),right:Math.min(left+(vv?.width||innerWidth),room.right),top,bottom:Math.min(top+(vv?.height||innerHeight),client.roomBounds?.bottom??room.bottom)};
 const placed=roomPopupPlacement(chat.getBoundingClientRect(),bounds,client.host.querySelector('#voice-chat-form')?.getBoundingClientRect().top);
 sheet.setAttribute('data-room-anchored','');
 const write=(key,value)=>{const next=value+'px';if(sheet.style.getPropertyValue(key)!==next)sheet.style.setProperty(key,next);};
 write('--room-popup-width',placed.width);write('--room-popup-max',placed.maxHeight);
 write('--room-popup-left',placed.left);write('--room-popup-top',placed.top);
}
function roomFilledIcon(kind){
 const path=kind==='send'?'M21.4 2.6a.8.8 0 0 0-.9-.2L2.8 9.5a.8.8 0 0 0 0 1.5l6.8 2.2 2.2 6.8a.8.8 0 0 0 1.5 0l8.3-16.5a.8.8 0 0 0-.2-.9ZM10.8 12.1l6.6-5.5-5.5 6.6-.9 3-.9-3-3-.9 3.7-.2Z':'M11 10H3V7h3.3A3.3 3.3 0 1 1 12 4.2 3.3 3.3 0 1 1 17.7 7H21v3h-8V7h-2v3ZM10.7 5.5C9.3 2.8 6.3 4.2 8.5 5.8L11 6l-.3-.5Zm2.6 0L13 6l2.5-.2c2.2-1.6-.8-3-2.2-.3ZM4 12h7v9H4v-9Zm9 0h7v9h-7v-9Z';
 return '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="none" aria-hidden="true"><path fill-rule="evenodd" d="'+path+'"/></svg>';
}
function patchRoomChildren(container,entries){
 const old=new Map([...container.children].map(node=>[node.dataset.roomKey,node]));
 let changed=false;
 entries.forEach(({key,html},index)=>{
  let node=old.get(key);old.delete(key);
  if(!node||node._roomHTML!==html){
   const template=document.createElement('template');template.innerHTML=html;
   const next=template.content.firstElementChild;
   next.dataset.roomKey=key;next._roomHTML=html;
   if(node)node.replaceWith(next);
   node=next;changed=true;
  }
  if(container.children[index]!==node){container.insertBefore(node,container.children[index]||null);changed=true;}
 });
 for(const node of old.values()){node.remove();changed=true;}
 return changed;
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
 if(link?.hasAttribute('data-preview-message')&&link.closest('.voice-room'))return;
 if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||url.hash==='#main')return;
 if(leaveRoomForNavigation(url)){event.preventDefault();event.stopImmediatePropagation();}
},{capture:true});
for(const type of ['popstate','hashchange'])window.addEventListener(type,()=>{
 const client=voiceController,url=new URL(location.href);
 if(leaveRoomForNavigation(url)&&client)history.replaceState(history.state,'','#'+(client.liveMode?'live/':'voice/')+client.id);
});
