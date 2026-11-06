// Only the generated same-origin profile host loads this adapter. The dialog,
// account lookup, follow/gift actions and responsive layout remain the app's own.
if(window.parent!==window){
 document.documentElement.classList.add('profile-embed');
 const key=new URLSearchParams(location.search).get('profile')||'';let started=false;
 const tell=data=>window.parent.postMessage(data,location.origin);
 window.handleEmbeddedProfile=async()=>{
  if(started)return true;started=true;
  if(!/^(?:(?:artist|member):)?[\w-]+$/.test(key)){tell({type:'aifect-profile-dismiss'});return true;}
  // The app boot can request its first render before the last classic script
  // initializes the shared preview state. Resume after that script stack.
  await Promise.resolve();
  await openProfilePreview(key);
  if(!document.querySelector('dialog[open]'))tell({type:'aifect-profile-dismiss'});
  return true;
 };
 document.addEventListener('aifect-profile-dismiss',()=>tell({type:'aifect-profile-dismiss'}));
 document.addEventListener('close',event=>{if(event.target.id==='dialog')tell({type:'aifect-profile-dismiss'});},true);
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');if(!link||event.defaultPrevented)return;
  event.preventDefault();tell({type:'aifect-profile-navigate',hash:link.getAttribute('href')});
 });
}
