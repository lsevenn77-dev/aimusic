// Standalone public pages and crew games reuse the real app's profile dialog.
import './user-nickname.js';
export function profileNickname(name,identity){return globalThis.AifectNicknames.userNickname(name,identity);}
let frame,origin,overflow;
function closeHost(){if(!frame)return;frame.remove();frame=null;document.body.style.overflow=overflow;origin?.focus({preventScroll:true});origin=null;}
function showProfile(key,target){
 if(typeof globalThis.openProfilePreview==='function'){void globalThis.openProfilePreview(key,target);return;}
 closeHost();origin=target;overflow=document.body.style.overflow;document.body.style.overflow='hidden';
 frame=document.createElement('iframe');frame.id='nickname-profile-host';frame.title=target.textContent+' 프로필';
 frame.style.cssText='position:fixed;inset:0;width:100%;height:100dvh;border:0;z-index:2147483000;background:transparent;backdrop-filter:blur(5px)';
 frame.src='/profile-popup?profile='+encodeURIComponent(key);document.body.append(frame);frame.focus();
}
if(typeof document!=='undefined'){
 const css=document.createElement('link');css.rel='stylesheet';css.href='/profile-preview.css';document.head.append(css);
 for(const type of ['click','keydown'])document.addEventListener(type,event=>{
  const target=event.target.closest('[data-user-nickname]');if(!target||typeof globalThis.openProfilePreview==='function')return;
  if(type==='keydown'&&(event.isComposing||!['Enter',' '].includes(event.key)))return;
  if(type==='click'&&event.button!==0)return;
  event.preventDefault();event.stopImmediatePropagation();showProfile(target.dataset.profilePreview,target);
 },true);
 for(const type of ['pointerdown','pointerup','touchstart','touchend','auxclick'])document.addEventListener(type,event=>{
  if(!event.target.closest('[data-user-nickname]'))return;event.stopImmediatePropagation();if(type==='auxclick')event.preventDefault();
 },true);
 window.addEventListener('message',event=>{
  if(!frame||event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='aifect-profile-dismiss')closeHost();
  if(event.data?.type==='aifect-profile-navigate'&&/^#[\w/-]+(?:\?[^\r\n]*)?$/.test(event.data.hash)){closeHost();location.href='/'+event.data.hash;}
 });
 window.addEventListener('pagehide',closeHost);
}
