// One press = one reel action. Keep navigation and dialogs as normal controls.
export function bindMobileReelInput({root,mobile,playing,pull,pointerEvents=true}){
  const controls='button,a,input,select,textarea,summary,dialog,[role="button"],[contenteditable]';
  const otherControl=e=>e.target.closest?.(controls)&&!e.target.closest?.('[data-act="pull"]');
  let consumed=false;
  const press=e=>{
    if(e.isPrimary===false||e.touches?.length>1)return;
    consumed=false;
    if(!mobile()||!playing()||otherControl(e)||e.button>0)return;
    consumed=true;
    e.preventDefault();
    pull();
  };
  root.addEventListener(pointerEvents?'pointerdown':'touchstart',press,{capture:true,passive:false});
  root.addEventListener(pointerEvents?'pointercancel':'touchcancel',()=>{consumed=false},{capture:true});
  root.addEventListener('click',e=>{
    // Browsers may still synthesize click after pointerdown, even when prevented.
    // Consume it even if the pull has already switched to the result screen.
    if(!consumed){
      // A browser may deliver only click for an accessibility/legacy touch activation.
      if(!mobile()||!playing()||e.target.closest?.(controls))return;
      e.preventDefault();e.stopImmediatePropagation();pull();return;
    }
    consumed=false;
    e.preventDefault();
    e.stopImmediatePropagation();
  },{capture:true});
}
