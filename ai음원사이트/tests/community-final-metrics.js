// DOM-only layout measurements for the isolated QA page.
const iframe=document.querySelector('iframe');
const output=document.createElement('output');output.id='qa-results';output.style.cssText='display:block;position:absolute;top:20px;font:10px monospace';document.body.append(output);
setInterval(()=>{
 const d=iframe.contentDocument;if(!d?.querySelector('#main'))return;
 const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};};
 const data={viewport:[iframe.clientWidth,iframe.clientHeight],documentWidth:d.documentElement.scrollWidth,clientWidth:d.documentElement.clientWidth,dialog:rect(d.querySelector('dialog[open]')),room:rect(d.querySelector('.voice-room')),seats:d.querySelectorAll('.voice-seat').length,focus:d.querySelector('#main').hasAttribute('data-room-focus'),sidebar:d.querySelector('#sidebar')?.style.display,cards:[...d.querySelectorAll('.v3-room-art')].map(rect),rows:[...d.querySelectorAll('.gift-dashboard .gift-catalog')].map(el=>({client:el.clientWidth,scroll:el.scrollWidth})),images:[...d.querySelectorAll('img[src*="/themes/"]')].map(i=>({width:i.naturalWidth,height:i.naturalHeight,loaded:i.complete&&i.naturalWidth>0})),chat:rect(d.querySelector('#voice-chat')),input:rect(d.querySelector('#voice-message'))};
 output.textContent=JSON.stringify(data);
},600);
