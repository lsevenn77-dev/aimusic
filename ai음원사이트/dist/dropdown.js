/* Explicitly opted-in list controls. Native selects remain the form/event source. */
(()=>{
 let serial=0,opened=null;
 const instances=new Set(),mounted=new WeakMap();
 function create(host,config={}){
  const native=host instanceof HTMLSelectElement?host:null;
  const labelSources=native?Array.from(native.labels||[]):[];
  if(mounted.has(host))return mounted.get(host);
  const wrap=document.createElement('div'),button=document.createElement('button'),label=document.createElement('span');
  wrap.className='aifect-dropdown';button.className='aifect-dropdown-trigger';button.type='button';
  label.className='aifect-dropdown-label';
  button.append(label);button.insertAdjacentHTML('beforeend','<svg class="aifect-dropdown-chevron" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  host.before(wrap);wrap.append(button,host);host.classList.add('aifect-dropdown-source');
  const menu=document.createElement('div');menu.className='aifect-dropdown-menu';menu.id='aifect-dropdown-'+(++serial);menu.setAttribute('role','listbox');menu.hidden=true;menu.setAttribute('popover','manual');
  button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-controls',menu.id);button.setAttribute('aria-expanded','false');
  let options=[],active=-1,frame=0,search='',searchAt=0;
  const getOptions=()=>native?Array.from(native.options).map(o=>({value:o.value,label:o.label,disabled:o.disabled||o.parentElement.disabled})):config.options;
  const getValue=()=>native?native.value:config.value;
  function sync(){
   options=getOptions()||[];
   const text=options.find(o=>o.value===getValue())?.label||'';
   if(label.textContent!==text)label.textContent=text;
   if(config.renderIcon&&button.dataset.iconValue!==getValue()){
    if(label.previousElementSibling)label.previousElementSibling.remove();
    label.insertAdjacentHTML('beforebegin',config.renderIcon(getValue()));button.dataset.iconValue=getValue();
   }
   if(button.title!==text)button.title=text;const disabled=native?native.disabled:!!config.disabled;if(button.disabled!==disabled)button.disabled=disabled;
   const accessible=config['aria-label']||host.getAttribute('aria-label')||(native?labelSources.map(l=>{const copy=l.cloneNode(true);copy.querySelectorAll('select,.aifect-dropdown').forEach(el=>el.remove());return copy.textContent;}).join(' ').trim():'')||'목록 선택';
   if(button.getAttribute('aria-label')!==accessible)button.setAttribute('aria-label',accessible);if(menu.getAttribute('aria-label')!==accessible)menu.setAttribute('aria-label',accessible);
   wrap.dataset.size=config.size||host.dataset.dropdown||'md';
   const width=config.width??host.dataset.dropdownWidth??'auto';wrap.dataset.width=width==='full'?'full':'auto';
   wrap.style.width=width==='auto'?'fit-content':width==='full'?'100%':typeof width==='number'?width+'px':width;
   if(button.disabled&&opened===api)close();
  }
  function position(){
   frame=0;if(opened!==api)return;
   if(!wrap.isConnected||!button.getClientRects().length){close();return;}
   const r=button.getBoundingClientRect(),v=window.visualViewport;
   const leftEdge=(v?.offsetLeft||0)+12,topEdge=(v?.offsetTop||0)+12,rightEdge=leftEdge+(v?.width||innerWidth)-24,bottomEdge=topEdge+(v?.height||innerHeight)-24;
   if(r.bottom<topEdge||r.top>bottomEdge||r.right<leftEdge||r.left>rightEdge){close();return;}
   menu.style.maxWidth=Math.max(0,rightEdge-leftEdge)+'px';menu.style.minWidth=Math.min(r.width,rightEdge-leftEdge)+'px';
   menu.style.maxHeight='none';menu.style.width='max-content';
   const height=menu.scrollHeight+2,below=Math.max(0,bottomEdge-r.bottom-4),above=Math.max(0,r.top-topEdge-4),up=height>below&&above>below;
   menu.style.maxHeight=Math.min(320,up?above:below)+'px';
   const m=menu.getBoundingClientRect();menu.style.left=Math.max(leftEdge,Math.min(r.left,rightEdge-m.width))+'px';
   menu.style.top=(up?Math.max(topEdge,r.top-4-m.height):r.bottom+4)+'px';menu.dataset.placement=up?'top':'bottom';
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(position);}
  function highlight(index){
   active=index;
   Array.from(menu.children).forEach((el,i)=>{el.dataset.active=String(i===active);});
   if(active>=0){button.setAttribute('aria-activedescendant',menu.id+'-'+active);menu.children[active]?.scrollIntoView({block:'nearest'});}
   else button.removeAttribute('aria-activedescendant');
  }
  function move(step){const enabled=options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);if(!enabled.length)return;let at=enabled.indexOf(active);highlight(enabled[(at+step+enabled.length)%enabled.length]);}
  function close(){
   if(opened!==api)return;opened=null;button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');
   if(menu.hidePopover&&menu.matches(':popover-open'))menu.hidePopover();menu.hidden=true;menu.remove();
   window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);resize.disconnect();cancelAnimationFrame(frame);frame=0;
  }
  function choose(i){
   if(!options[i]||options[i].disabled)return;
   const value=options[i].value,changed=value!==getValue();close();button.focus({preventScroll:true});
   if(native){native.value=value;if(changed){native.dispatchEvent(new Event('input',{bubbles:true}));native.dispatchEvent(new Event('change',{bubbles:true}));}}
   else{config.value=value;if(changed)config.onChange?.(value);}
   sync();
  }
  function open(){
   sync();if(button.disabled)return;opened?.close();opened=api;
   menu.replaceChildren(...options.map((o,i)=>{const el=document.createElement('div');el.id=menu.id+'-'+i;el.setAttribute('role','option');el.setAttribute('aria-selected',String(o.value===getValue()));el.setAttribute('aria-disabled',String(!!o.disabled));el.textContent=o.label;if(config.renderIcon)el.insertAdjacentHTML('afterbegin',config.renderIcon(o.value));el.addEventListener('pointermove',()=>{if(!o.disabled)highlight(i);});el.addEventListener('click',()=>choose(i));return el;}));
   (button.closest('dialog[open]')||document.body).append(menu);menu.hidden=false;menu.showPopover?.();button.setAttribute('aria-expanded','true');position();highlight(options.findIndex(o=>o.value===getValue()&&!o.disabled));
   window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);resize.observe(button);resize.observe(document.body);
  }
  const resize=new ResizeObserver(schedule);
  button.addEventListener('click',()=>opened===api?close():open());
  button.addEventListener('keydown',e=>{
   if(['ArrowDown','ArrowUp','Enter',' ','Escape','Home','End'].includes(e.key)){
    e.preventDefault();if(e.key==='Escape'){close();return;}
    if(e.key==='Enter'||e.key===' '){if(opened===api)choose(active);else open();return;}
    if(opened!==api)open();
    if(e.key==='Home')highlight(options.findIndex(o=>!o.disabled));else if(e.key==='End')highlight(options.findLastIndex(o=>!o.disabled));else move(e.key==='ArrowUp'?-1:1);
   }else if(e.key==='Tab')close();
   else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(opened!==api)open();search=Date.now()-searchAt>700?e.key:search+e.key;searchAt=Date.now();const i=options.findIndex(o=>!o.disabled&&o.label.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));if(i>=0)highlight(i);}
  });
  menu.addEventListener('pointerdown',e=>e.preventDefault());
  native?.addEventListener('change',sync);native?.addEventListener('input',sync);
  if(native){
   const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
   Object.defineProperty(native,'value',{configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);sync();}});
   native.addEventListener('focus',()=>button.focus());native.form?.addEventListener('reset',()=>requestAnimationFrame(sync));
  }
  const api={element:wrap,button,close,sync,set(props){Object.assign(config,props);if(native){if(props.options)native.replaceChildren(...props.options.map(o=>Object.assign(new Option(o.label,o.value),{disabled:!!o.disabled})));if('value'in props)native.value=props.value;if('disabled'in props)native.disabled=props.disabled;}sync();},destroy(){close();resize.disconnect();instances.delete(api);wrap.remove();}};
  // onChange is additive: legacy input/change handlers remain authoritative.
  if(native&&config.onChange)native.addEventListener('change',()=>config.onChange(native.value));
  mounted.set(host,api);instances.add(api);sync();return api;
 }
 function scan(){
  for(const instance of instances){if(!instance.element.isConnected)instance.destroy();else instance.sync();}
  document.querySelectorAll('select[data-dropdown]').forEach(el=>{if(!mounted.has(el))create(el);});
  document.querySelectorAll('details.chart-period,[data-dropdown-links]').forEach(el=>{
   if(mounted.has(el))return;
   const links=Array.from(el.querySelectorAll('a')),text=el.querySelector('summary')?.textContent.trim();
   create(el,{size:el.dataset.dropdownLinks||'sm','aria-label':el.getAttribute('aria-label')||'차트 기간',value:links.find(a=>a.hasAttribute('aria-current')||a.textContent.trim()===text)?.getAttribute('href')||links[0]?.getAttribute('href'),options:links.map(a=>({value:a.getAttribute('href'),label:a.textContent.trim()})),onChange:value=>links.find(a=>a.getAttribute('href')===value)?.click()});
  });
 }
 document.addEventListener('pointerdown',e=>{if(opened&&!opened.element.contains(e.target)&&!document.querySelector('#'+opened.button.getAttribute('aria-controls'))?.contains(e.target))opened.close();});
 document.addEventListener('focusin',e=>{if(opened&&!opened.element.contains(e.target))opened.close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')opened?.close();});
 window.addEventListener('hashchange',()=>opened?.close());
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;scan();});}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label','aria-label','data-dropdown','data-dropdown-width']});
 window.AifectDropdown={mount:create,create(container,props){const select=document.createElement('select');container.append(select);const instance=create(select,props);instance.set(props);return instance;}};
 scan();
})();
