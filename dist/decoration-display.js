// Display-only refresh. This never enters the audio/WebRTC graph or room socket.
(()=>{
 const frames=new Map(),themes=new Map();let busy=false,queued=false,lastRead=0;
 const validAsset=p=>typeof p==='string'&&/^\/assets\/[a-zA-Z0-9_./-]+\.(png|webp)$/.test(p)&&!p.includes('..');
 const expired=(entry,at)=>entry?.expires_at&&entry.expires_at<=at;
 const observed=new Set(),sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>paintFrames()):null;
 function alignFrame(img,host){
  host.classList.add('avatar-frame-host');
  // Local layout coordinates share the positioned parent's padding box. Unlike
  // client rects, they are not scaled by page/dialog entrance animations.
  const width=img.offsetWidth,height=img.offsetHeight;
  for(const [key,value] of Object.entries({x:img.offsetLeft+width/2,y:img.offsetTop+height/2,width:width*1.26,height:height*1.26}))host.style.setProperty('--avatar-frame-'+key,value+'px');
  if(sizeObserver&&!observed.has(img)){sizeObserver.observe(img);observed.add(img);}
 }
 function paintFrames(){
  for(const img of observed)if(!img.isConnected){sizeObserver?.unobserve(img);observed.delete(img);}
  for(const img of document.querySelectorAll('img[data-avatar-profile]')){
   if(img.closest('.player-item-preview'))continue;
   const host=img.parentElement,entry=frames.get(img.dataset.avatarProfile),at=Date.now()/1000+(entry?.offset||0);
   for(const artwork of host.querySelectorAll(':scope > img.player-frame-artwork[src="/assets/products/aurora_ring_frame.png"]'))artwork.style.visibility=entry&&(!entry.artwork||expired(entry,at))?'hidden':'';
   if(host.querySelector(':scope > img.player-frame-artwork'))alignFrame(img,host);
   let overlay=host.querySelector(':scope > .decoration-avatar-overlay');
   if(!entry?.artwork||expired(entry,at)||!validAsset(entry.artwork)){overlay?.remove();continue;}
   if(!overlay){overlay=document.createElement('img');overlay.className='decoration-avatar-overlay';overlay.alt='';overlay.setAttribute('aria-hidden','true');host.append(overlay);host.classList.add('decoration-avatar-host');}
   if(overlay.getAttribute('src')!==entry.artwork)overlay.src=entry.artwork;
   alignFrame(img,host);
  }
 }
 function paintTheme(el,t,card=false){
  if(!t)return;
  const active=t.assets&&!expired(t,Date.now()/1000+(t.offset||0));
  const sku=active?t.sku:t.assets?'navy':t.sku;
  if(card)el.dataset.theme=sku;else el.dataset.background=sku;
  el.dataset.themeSku=sku;
  if(active){el.dataset.paidTheme=sku;for(const [key,value] of Object.entries({card:t.assets.roomCard,desktop:t.assets.roomDesktop,mobile:t.assets.roomMobile}))if(validAsset(value))el.style.setProperty('--decoration-'+key,`url("${value}")`);}
  else{delete el.dataset.paidTheme;for(const key of ['card','desktop','mobile'])el.style.removeProperty('--decoration-'+key);}
 }
 function paintThemes(){
  for(const card of document.querySelectorAll('[data-decoration-room]'))paintTheme(card,themes.get(card.dataset.decorationRoom),true);
  const room=document.querySelector('[data-voice-room]');if(room)paintTheme(room,themes.get(room.dataset.voiceRoom));
 }
 const remember=(id,theme)=>{if(theme)themes.set(id,{...theme,offset:theme.server_now-Date.now()/1000});};
 async function refresh(force=false){
  if(busy){queued=true;return;}busy=true;
  try{
   const images=[...document.querySelectorAll('img[data-avatar-profile]')].filter(i=>!i.closest('.player-item-preview')),profiles=[...new Set(images.map(i=>i.dataset.avatarProfile).filter(Boolean))];
   const fresh=force||Date.now()-lastRead>=15000,missing=profiles.filter(p=>fresh||!frames.has(p));
   for(let i=0;i<missing.length;i+=80){const d=await api('/api/decorations/avatars?profiles='+encodeURIComponent(missing.slice(i,i+80).join(',')),'GET',undefined,{fresh:true});for(const p of d.avatars)frames.set(p.profile_id,{...p,offset:d.server_now-Date.now()/1000});}
   const cards=document.querySelectorAll('[data-decoration-room]');
   if(cards.length&&(fresh||[...cards].some(c=>!themes.has(c.dataset.decorationRoom)))){
    const d=await voiceRequest('public-rooms');for(const r of d.rooms)remember(r.id,r.theme);
   }
   const room=document.querySelector('[data-voice-room]'),rid=room?.dataset.voiceRoom;
   if(rid&&me&&(fresh||!themes.has(rid))){try{const d=await voiceRequest('rooms/'+encodeURIComponent(rid)+'/theme');remember(rid,d.theme);}catch{/* Joining/access errors remain owned by the existing room UI. */}}
   if(fresh)lastRead=Date.now();
  }catch{/* Fail closed for new items; previously verified entries still expire locally. */}
  finally{busy=false;paintFrames();paintThemes();if(queued){queued=false;schedule();}}
 }
 let timer;function schedule(){clearTimeout(timer);timer=setTimeout(()=>void refresh(),80);}
 const observer=new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes,...c.removedNodes].some(n=>n.nodeType===1&&!n.classList?.contains('decoration-avatar-overlay'))))schedule();});
 observer.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('load',e=>{if(e.target.matches?.('img[data-avatar-profile]'))paintFrames();},true);
 window.addEventListener('resize',()=>{paintFrames();paintThemes();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
 window.addEventListener('aifect:equipment',()=>{frames.clear();void refresh(true);});
 window.addEventListener('aifect:room-theme',()=>{themes.clear();void refresh(true);});
 setInterval(()=>{paintFrames();paintThemes();if(!document.hidden)void refresh();},1000);
 schedule();
})();
