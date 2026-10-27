// DOM measurements only, against the real app and isolated SQLite preview data.
setInterval(()=>{
 const frame=document.querySelector('iframe'),d=frame?.contentDocument,w=d?.defaultView,root=d?.querySelector('#mp-recordings');if(!root)return;
 if(!frame.dataset.scrolled){root.closest('section').scrollIntoView({block:'start'});frame.dataset.scrolled='true';}
 const visible=el=>w.getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0;
 const rows=[...root.querySelectorAll('.song-cover-row')].filter(visible);
 const controls=rows.flatMap(row=>[...row.querySelectorAll('button,.song-cover-join')].filter(visible));
 const overlap=rows.some(row=>{const r=row.getBoundingClientRect(),buttons=[...row.querySelectorAll('button,.song-cover-join')].filter(visible).map(el=>el.getBoundingClientRect());return buttons.some((b,i)=>b.right>r.right+.5||buttons.some((c,j)=>j>i&&b.right>c.left+.5&&c.right>b.left+.5&&b.bottom>c.top+.5&&c.bottom>b.top+.5));});
 const tabs=[...d.querySelectorAll('.mp-filters button')];
 document.getElementById('qa-metrics').textContent=JSON.stringify({viewport:[w.innerWidth,w.innerHeight],scrollWidth:d.documentElement.scrollWidth,rows:rows.length,minTouch:Math.min(...controls.flatMap(el=>[el.offsetWidth,el.offsetHeight])),overlap,tabsOneLine:new Set(tabs.map(el=>el.offsetTop)).size===1,selected:tabs.filter(el=>el.getAttribute('aria-pressed')==='true').map(el=>({label:el.textContent,bg:w.getComputedStyle(el).backgroundImage,color:w.getComputedStyle(el).color})),join:[...root.querySelectorAll('.song-cover-join')].map(el=>({bg:w.getComputedStyle(el).backgroundImage,color:w.getComputedStyle(el).color})),expanded:root.querySelector('[aria-expanded=true]')!==null,playing:root.querySelector('[data-song-cover-toggle][aria-pressed=true]')!==null});
},500);
