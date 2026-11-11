// Only equipped avatars and the open product detail register a base image here.
// An offscreen/hidden base keeps its static PNG but no animated image node.
const frameEffects=(()=>{
 const effects=new Map();
 function paint(base,e){
  if(!base.isConnected||!e.visible||document.hidden||(e.dialog&&!e.dialog.open)){
   e.layer?.remove();e.layer=null;return;
  }
  if(!e.layer){
   const layer=document.createElement('img');layer.className='frame-fx-layer';layer.alt='';
   layer.setAttribute('aria-hidden','true');layer.decoding='async';layer.src=e.src;
   base.after(layer);e.layer=layer;
  }
 }
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const entry of entries){const e=effects.get(entry.target);if(e){e.visible=entry.isIntersecting;paint(entry.target,e);}}
 }):null;
 function forget(base){const e=effects.get(base);if(!e)return;e.layer?.remove();observer?.unobserve(base);effects.delete(base);}
 function sweep(){for(const [base,e] of effects){if(!base.isConnected||(e.dialog&&!e.dialog.open))forget(base);else paint(base,e);}}
 document.addEventListener('visibilitychange',sweep);
 document.addEventListener('close',sweep,true);
 return {set(base,src){
  if(!base)return;
  if(effects.get(base)?.src===src)return;
  forget(base);if(!observer||!src||!/^\/assets\/[\w/-]+\.webp$/.test(src))return;
  effects.set(base,{src,visible:false,layer:null,dialog:base.closest('dialog')});observer.observe(base);
 },sweep};
})();
// Shared normalized canvas artwork for existing equipped profile frames.
function profileFrameCanvasArtwork(path){
 return AifectPlayer.frameDisplayAssets(path).overlay;
}
// Display-only refresh. This never enters the audio/WebRTC graph or room socket.
(()=>{
 const frames=new Map(),themes=new Map(),assetHealth=new Map();let busy=false,queued=false,lastRead=0;
 function usableAsset(path){
  if(!validAsset(path))return false;
  if(!assetHealth.has(path)){assetHealth.set(path,'loading');const image=new Image();image.onload=()=>{assetHealth.set(path,'ready');paintThemes();};image.onerror=()=>{assetHealth.set(path,'failed');paintThemes();};image.src=path;}
  return assetHealth.get(path)!=='failed';
 }
 const validAsset=p=>typeof p==='string'&&/^\/assets\/[a-zA-Z0-9_./-]+\.(png|webp)$/.test(p)&&!p.includes('..');
 // Product thumbnails keep their original artwork. Every equipped avatar uses
 // the same normalized base/effect canvas, whose center is the photo opening.
 const canvasSource=path=>profileFrameCanvasArtwork(path);
 const paidFrameSources=new Set(Object.values(AifectPlayer.PLAYER_ITEMS).filter(item=>item.paid).flatMap(item=>[item.artwork,item.display.overlay]));
 const expired=(entry,at)=>entry?.expires_at&&entry.expires_at<=at;
 const observed=new Set(),sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>paintFrames()):null;
 function alignFrame(img,host){
  if(host.classList.contains('profile-frame-canvas'))return;
  host.classList.add('avatar-frame-host');
  // Local layout coordinates share the positioned parent's padding box. Unlike
  // client rects, they are not scaled by page/dialog entrance animations.
  const width=img.offsetWidth,height=img.offsetHeight;
  const scale=AifectPlayer.frameDisplayAssets(null).scale;
  for(const [key,value] of Object.entries({x:img.offsetLeft+width/2,y:img.offsetTop+height/2,width:width*scale,height:height*scale}))host.style.setProperty('--avatar-frame-'+key,value+'px');
  if(sizeObserver&&!observed.has(img)){sizeObserver.observe(img);observed.add(img);}
 }
 function paintFrames(){
  for(const img of observed)if(!img.isConnected){sizeObserver?.unobserve(img);observed.delete(img);}
  for(const img of document.querySelectorAll('img[data-avatar-profile]')){
   if(img.closest('.player-item-preview'))continue;
   const host=img.parentElement,entry=frames.get(img.dataset.avatarProfile),at=Date.now()/1000+(entry?.offset||0);
   for(const artwork of host.querySelectorAll(':scope > img.player-frame-artwork')){
    const src=artwork.getAttribute('src');
    if(paidFrameSources.has(src))artwork.style.visibility=entry&&(canvasSource(entry.artwork)!==canvasSource(src)||expired(entry,at))?'hidden':'';
   }
   if(host.querySelector(':scope > img.player-frame-artwork'))alignFrame(img,host);
   let overlay=host.querySelector(':scope > .decoration-avatar-overlay');
   if(!entry?.artwork||expired(entry,at)||!validAsset(entry.artwork)){frameEffects.set(overlay,null);overlay?.remove();continue;}
   if(!overlay){overlay=document.createElement('img');overlay.className='decoration-avatar-overlay';overlay.alt='';overlay.setAttribute('aria-hidden','true');host.append(overlay);host.classList.add('decoration-avatar-host');}
   const artwork=canvasSource(entry.artwork);
   if(overlay.getAttribute('src')!==artwork)overlay.src=artwork;
   const room=host.closest?.('[data-voice-room]');
   const animated=!room||(room.classList.contains('live-karaoke-room')
    ? room.dataset.singerProfile===img.dataset.avatarProfile
    : Array.from(room.querySelectorAll('#voice-seats [data-avatar-profile]')).some(face=>face.dataset.avatarProfile===img.dataset.avatarProfile));
   frameEffects.set(overlay,animated?canvasSource(entry.effect):null);
   alignFrame(img,host);
  }
  layoutProfileFrames();
 }
 function paintTheme(el,t,card=false){
  if(!t)return;
  const assets=t.assets;
  const small=matchMedia('(max-width:800px)').matches;
  const tall=small&&matchMedia('(max-aspect-ratio: 1/2)').matches;
  const visible=card?assets?.roomCard:small?(tall&&assets?.roomMobileTall||assets?.roomMobile||assets?.roomDesktop):assets?.roomDesktop;
  const active=visible&&!expired(t,Date.now()/1000+(t.offset||0))&&usableAsset(visible);
  const sku=active?t.sku:t.assets?'navy':t.sku;
  if(card)el.dataset.theme=sku;else el.dataset.background=sku;
  el.dataset.themeSku=sku;
  if(!card)el.dataset.uiMode=(!t.assets||active)&&t.uiMode==='light'?'light':'dark';
  if(active&&t.expires_at>0)el.dataset.paidTheme=sku;else delete el.dataset.paidTheme;
  const artKeys=['card','desktop','mobile','mobile-tall'];
  if(active)el.dataset.roomArtwork='';else delete el.dataset.roomArtwork;
  const paths=[assets?.roomCard,assets?.roomDesktop,assets?.roomMobile,assets?.roomMobileTall];
  artKeys.forEach((key,index)=>{
   const value=paths[index];
   if(active&&validAsset(value))el.style.setProperty('--decoration-'+key,`url("${value}")`);
   else el.style.removeProperty('--decoration-'+key);
  });
 }
 function paintThemes(){
  for(const card of document.querySelectorAll('[data-decoration-room]'))paintTheme(card,themes.get(card.dataset.decorationRoom),true);
  const room=document.querySelector('[data-voice-room]');if(room)paintTheme(room,themes.get(room.dataset.voiceRoom));
 }
 let roomThemeVersion=0;
 const remember=(id,theme)=>{
  if(!theme)return;
  const mode=theme.uiMode;
  if(mode!=null&&mode!=='light'&&mode!=='dark'&&['localhost','127.0.0.1'].includes(location.hostname))console.debug('Invalid room uiMode',mode);
  themes.set(id,{...theme,uiMode:mode==='light'?'light':'dark',offset:theme.server_now-Date.now()/1000});
 };
 async function refresh(force=false){
  if(busy){queued=true;return;}busy=true;
  try{
   const images=[...document.querySelectorAll('img[data-avatar-profile]')].filter(i=>!i.closest('.player-item-preview')),profiles=[...new Set(images.map(i=>i.dataset.avatarProfile).filter(Boolean))];
   const fresh=force||Date.now()-lastRead>=15000,missing=profiles.filter(p=>fresh||!frames.has(p));
   for(let i=0;i<missing.length;i+=80){const d=await api('/api/decorations/avatars?profiles='+encodeURIComponent(missing.slice(i,i+80).join(',')),'GET',undefined,{fresh:true});for(const p of d.avatars)frames.set(p.profile_id,{...p,offset:d.server_now-Date.now()/1000});}
   const cards=document.querySelectorAll('[data-decoration-room]');
   if(cards.length&&(fresh||[...cards].some(c=>!themes.has(c.dataset.decorationRoom)))){
    const version=roomThemeVersion,d=await voiceRequest('public-rooms');if(version===roomThemeVersion)for(const r of d.rooms)remember(r.id,r.theme);
   }
   const room=document.querySelector('[data-voice-room]'),rid=room?.dataset.voiceRoom;
   if(rid&&me&&(fresh||!themes.has(rid))){try{const version=roomThemeVersion,d=await voiceRequest('rooms/'+encodeURIComponent(rid)+'/theme');if(version===roomThemeVersion)remember(rid,d.theme);}catch{/* Joining/access errors remain owned by the existing room UI. */}}
   if(fresh)lastRead=Date.now();
  }catch{/* Fail closed for new items; previously verified entries still expire locally. */}
  finally{busy=false;paintFrames();paintThemes();if(queued){queued=false;schedule();}}
 }
 let timer;function schedule(){clearTimeout(timer);timer=setTimeout(()=>void refresh(),80);}
 const observer=new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes,...c.removedNodes].some(n=>n.nodeType===1&&!n.classList?.contains('decoration-avatar-overlay')&&!n.classList?.contains('frame-fx-layer')))){frameEffects.sweep();schedule();}});
 observer.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('load',e=>{if(e.target.matches?.('img[data-avatar-profile]'))paintFrames();},true);
 window.addEventListener('resize',()=>{paintFrames();paintThemes();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
 window.addEventListener('aifect:equipment',()=>{
  frames.clear();
  // Existing equipment action updates me before emitting this event. Refresh
  // already-open profile/edit surfaces too, without waiting for a route render.
  for(const img of document.querySelectorAll('img[data-avatar-profile]'))if(img.dataset.avatarProfile===me?.profile_id){
   const host=img.parentElement;host.querySelectorAll(':scope > .player-frame-artwork,:scope > .decoration-avatar-overlay').forEach(el=>{frameEffects.set(el,null);el.remove();});
   const path=playerFrameURL(me);host.classList.toggle('player-has-frame',!!path);
   // On canvas layouts the equipment refresh owns the paid base and effect together.
   if(path&&!(host.classList.contains('profile-frame-canvas')&&AifectPlayer.PLAYER_ITEMS[me.profile_frame]?.paid)){
    const art=document.createElement('img');art.className='player-frame-artwork';art.src=canvasSource(path);art.alt='';art.setAttribute('aria-hidden','true');host.append(art);alignFrame(img,host);
   }
  }
  layoutProfileFrames();void refresh(true);
 });
 window.addEventListener('aifect:room-theme',e=>{
  const room=e.detail?.room,version=++roomThemeVersion;
  if(!room){themes.clear();void refresh(true);return;}
  if(room.theme){remember(room.id,room.theme);paintThemes();return;}
  // A socket snapshot carries the SKU. Preserve its resolved art and mode across heartbeats.
  const sku=room.theme_sku||room.background||'navy';
  if(themes.get(room.id)?.sku===sku){paintThemes();return;}
  const needsTheme=!room.theme_sku||sku.startsWith('theme_')||sku.startsWith('basic_');
  if(!needsTheme){remember(room.id,{sku,uiMode:'dark',server_now:Date.now()/1000});paintThemes();return;}
  void voiceRequest('rooms/'+encodeURIComponent(room.id)+'/theme').then(d=>{
   if(version===roomThemeVersion){remember(room.id,d.theme);paintThemes();}
  }).catch(()=>{});
 });
 setInterval(()=>{if(document.hidden)return;paintFrames();paintThemes();void refresh();},1000);
 schedule();
})();

// Shared display geometry only: never changes equipment or ownership.
const profileFrameBounds=new Map();
function frameArtworkBounds(art){
 const metadata=art.dataset.frameBounds?.split(',').map(Number);
 if(metadata?.length===4&&metadata.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&metadata[0]<=metadata[2]&&metadata[1]<=metadata[3])return metadata;
 const key=art.currentSrc||art.src;
 if(profileFrameBounds.has(key))return profileFrameBounds.get(key);
 if(!art.complete||!art.naturalWidth)return [0,0,1,1];
 try{
  const canvas=document.createElement('canvas');canvas.width=art.naturalWidth;canvas.height=art.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(art,0,0);
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);let l=canvas.width,t=canvas.height,r=0,b=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>0){l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1);}
  const bounds=r?[l/canvas.width,t/canvas.height,r/canvas.width,b/canvas.height]:[.5,.5,.5,.5];profileFrameBounds.set(key,bounds);return bounds;
 }catch{return [0,0,1,1];}
}
function layoutProfileFrames(){
 for(const host of document.querySelectorAll('.fan-identity .artist-portrait,.mp-profile .mp-avatar,#public-profile-form .artist-portrait,.profile-preview-photo')){
  const photo=host.querySelector('.profile-avatar-image');if(!photo)continue;
  const rect=photo.getBoundingClientRect(),out={left:0,right:0,top:0,bottom:0};
  for(const art of host.querySelectorAll(':scope > .player-frame-artwork,:scope > .decoration-avatar-overlay')){
   if(getComputedStyle(art).visibility==='hidden')continue;
   const a=art.getBoundingClientRect(),[l,t,r,b]=frameArtworkBounds(art);
   out.left=Math.max(out.left,rect.left-a.left-a.width*l);out.right=Math.max(out.right,a.left+a.width*r-rect.right);
   out.top=Math.max(out.top,rect.top-a.top-a.height*t);out.bottom=Math.max(out.bottom,a.top+a.height*b-rect.bottom);
  }
  host.classList.add('profile-frame-layout');
  for(const [side,value] of Object.entries(out))host.style.setProperty('--frame-'+side,Math.ceil(Math.max(0,value))+'px');
  const row=host.closest('.mp-profile,.fan-identity'),heading=row?.querySelector('.mp-identity h2,.fan-identity-text h1');
  if(row){
   const space=host.closest('.mp-avatar-space');
   if(space){space.style.setProperty('--frame-span',Math.ceil(rect.width+out.left+out.right)+'px');space.style.setProperty('--frame-height',Math.ceil(rect.height+out.bottom)+'px');}
   if(heading){
    const old=parseFloat(host.style.getPropertyValue('--photo-align'))||0;
    host.style.setProperty('--photo-align',Math.max(0,old+heading.getBoundingClientRect().top-rect.top)+'px');
   }
   row.style.setProperty('--frame-headroom',Math.ceil(out.top)+'px');
  }
 }
}
document.addEventListener('load',e=>{if(e.target.matches?.('.player-frame-artwork,.decoration-avatar-overlay,.profile-avatar-image'))layoutProfileFrames();},true);
