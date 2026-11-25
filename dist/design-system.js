/* Paint the actual mixer/volume value. Playback progress remains owned by its player. */
(()=>{
  const selector='input[type="range"][data-mix],input#volume[type="range"]';
  function paint(input){
    if(!input.matches(selector))return;
    const min=Number(input.min||0),max=Number(input.max||100),value=Number(input.value);
    const progress=`${Math.min(100,Math.max(0,max>min?(value-min)/(max-min)*100:0))}%`;
    input.classList.add('design-range');
    if(input.style.getPropertyValue('--ds-range-progress')!==progress)input.style.setProperty('--ds-range-progress',progress);
  }
  function scan(root){if(root.nodeType!==1)return;if(root.matches(selector))paint(root);root.querySelectorAll(selector).forEach(paint);}
  scan(document.body);
  document.addEventListener('input',event=>{if(event.target instanceof HTMLInputElement)paint(event.target);});
  document.addEventListener('change',event=>{if(event.target instanceof HTMLInputElement)paint(event.target);});
  // Presets update input.value directly; reflect them after the existing click handler runs.
  document.addEventListener('click',()=>requestAnimationFrame(()=>document.querySelectorAll(selector).forEach(paint)));
  new MutationObserver(records=>{for(const record of records)record.addedNodes.forEach(scan);}).observe(document.body,{childList:true,subtree:true});
})();
