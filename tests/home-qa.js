// DOM-only measurements inside the local preview wrapper; never bundled in the app.
let populated=false,scanning=false;
const frame=()=>document.querySelector('iframe'),sections=()=>[...(frame()?.contentDocument.querySelectorAll('[data-home-section]')||[])];
document.querySelector('#qa-jump').onclick=()=>{const n=+document.querySelector('#qa-section').value;if(!n)frame().contentWindow.scrollTo({top:0,behavior:'instant'});else sections()[n-1]?.scrollIntoView({block:'start',behavior:'instant'});};
document.querySelector('#qa-bottom').onclick=()=>frame().contentWindow.scrollTo({top:frame().contentDocument.body.scrollHeight,behavior:'instant'});
document.querySelector('#qa-scan').onclick=async()=>{scanning=true;for(const s of sections()){s.scrollIntoView({block:'start',behavior:'instant'});await new Promise(r=>setTimeout(r,180));}frame().contentWindow.scrollTo({top:0,behavior:'instant'});scanning=false;};
setInterval(()=>{
 const f=frame(),d=f?.contentDocument;if(!d)return;
 const all=sections();if(all.length&&!populated){populated=true;document.querySelector('#qa-section').innerHTML='<option value="0">맨 위</option>'+all.map((s,i)=>'<option value="'+(i+1)+'">'+(i+1)+'. '+s.getAttribute('aria-label')+'</option>').join('');}
 const controls=[...d.querySelectorAll('.aifect-home button,.home-shortcuts a')].filter(e=>!e.closest('[inert]')&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height),rects=controls.map(e=>e.getBoundingClientRect());
 const overlap=rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2));
 const data={viewport:[f.contentWindow.innerWidth,f.contentWindow.innerHeight],scrollWidth:d.documentElement.scrollWidth,sections:all.map(s=>s.getAttribute('aria-label')),busy:d.querySelectorAll('[data-home-section][aria-busy=true]').length,minControl:Math.round(Math.min(...rects.map(r=>Math.min(r.width,r.height)))),overlap,heroSlides:d.querySelectorAll('.home-hero-slide').length,railCard:Math.round(d.querySelector('.home-rail .home-album')?.getBoundingClientRect().width||0),cardsAcross:getComputedStyle(d.querySelector('.home-rail')||d.body).gridAutoColumns,failedImages:d.querySelectorAll('.image-failed').length,errors:d.documentElement.dataset.qaErrors||'',decorations:d.querySelectorAll('.decoration-avatar-overlay').length};
 document.querySelector('#qa-metrics').textContent=JSON.stringify(data);
 document.querySelector('#qa-metrics').dataset.ready=String(all.length===9&&data.busy===0&&!scanning);
 const visibleImages=[...d.querySelectorAll('.aifect-home img')].filter(img=>{const r=img.getBoundingClientRect();return r.top<f.contentWindow.innerHeight&&r.bottom>0&&r.left<f.contentWindow.innerWidth&&r.right>0;});
 document.querySelector('#qa-metrics').dataset.imagesReady=String(visibleImages.every(img=>img.complete));
},400);
