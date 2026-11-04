// TouchEvent must work independently of PointerEvent support and media queries.
export function bindMobileReelInput({root,mobile,playing,pull,pointerEvents=true,now=Date.now}){
  const controls='button,a,input,select,textarea,summary,dialog,[role="button"],[contenteditable]';
  const control=e=>{const element=e.target.closest?.(controls);return element&&element!==root;};
  let contact=null,consumed=false;
  const accept=(e,touch)=>playing()&&(touch||mobile())&&!control(e)&&!(e.button>0);
  const consume=e=>{consumed=true;if(e.cancelable)e.preventDefault();};
  function pointerStart(e){
    if(e.isPrimary===false)return;
    const touch=e.pointerType==='touch'||e.pointerType==='pen';
    if(!accept(e,touch)){contact=null;consumed=false;return;}
    if(touch&&contact?.kind==='touch'&&!contact.pointerSeen&&now()-contact.at<1000){
      contact.pointerSeen=true;consume(e);return;
    }
    contact={kind:'pointer',id:e.pointerId,touchSeen:false,at:now()};
    consume(e);pull();
  }
  function touchStart(e){
    if(e.touches?.length>1)return;
    if(!accept(e,true)){contact=null;consumed=false;return;}
    if(contact?.kind==='pointer'&&!contact.touchSeen&&now()-contact.at<1000){
      contact.touchSeen=true;consume(e);return;
    }
    contact={kind:'touch',pointerSeen:false,at:now()};
    consume(e);pull();
  }
  const options={capture:true,passive:false};
  if(pointerEvents){
    root.addEventListener('pointerdown',pointerStart,options);
    root.addEventListener('pointerup',e=>{if(contact?.kind==='pointer'&&contact.id===e.pointerId)contact=null;},{capture:true});
    root.addEventListener('pointercancel',()=>{contact=null;consumed=false;},{capture:true});
  }
  root.addEventListener('touchstart',touchStart,options);
  root.addEventListener('touchend',e=>{if(!e.touches?.length)contact=null;},{capture:true});
  root.addEventListener('touchcancel',()=>{contact=null;consumed=false;},{capture:true});
  root.addEventListener('click',e=>{
    if(consumed){consumed=false;e.preventDefault();e.stopImmediatePropagation();return;}
    if(!mobile()||!playing()||control(e)||e.button>0)return;
    e.preventDefault();e.stopImmediatePropagation();pull();
  },{capture:true});
}
