// Browser-visible layout measurements for the disposable iframe preview.
setInterval(()=>{
 const frame=document.querySelector('iframe'),d=frame?.contentDocument,w=d?.defaultView;if(!d?.querySelector('.song-covers-panel'))return;
 const rows=[...d.querySelectorAll('.song-cover-row')];
 const controls=rows.flatMap(row=>[...row.querySelectorAll('button,.song-cover-join')].filter(el=>w.getComputedStyle(el).display!=='none'));
 const overlap=rows.some(row=>{const r=row.getBoundingClientRect(),buttons=[...row.querySelectorAll('button,.song-cover-join')].filter(el=>w.getComputedStyle(el).display!=='none').map(el=>el.getBoundingClientRect());return buttons.some((b,i)=>b.right>r.right+.5||buttons.some((c,j)=>j>i&&b.right>c.left+.5&&c.right>b.left+.5&&b.bottom>c.top+.5&&c.bottom>b.top+.5));});
 document.getElementById('qa-metrics').textContent=JSON.stringify({viewport:[w.innerWidth,w.innerHeight],scrollWidth:d.documentElement.scrollWidth,rows:rows.length,thumbnail:rows[0]?.querySelector('.song-cover-art')?.offsetWidth,minTouch:controls.length?Math.min(...controls.flatMap(el=>[el.offsetWidth,el.offsetHeight])):null,overlap});
},500);
