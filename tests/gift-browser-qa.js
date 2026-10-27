// Test-only, same-origin viewport harness. Never included in production assets.
const frame=document.querySelector('iframe');
const report=document.createElement('pre');report.id='qa-report';
const button=document.createElement('button');button.textContent='레이아웃 검사';
document.querySelector('nav').append(button);document.body.append(report);
const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
button.onclick=()=>{
 const d=frame.contentDocument,w=frame.contentWindow,style=e=>w.getComputedStyle(e),dialog=d.querySelector('#dialog'),checkout=d.querySelector('.shop-checkout');
 const shelves=[...d.querySelectorAll('.shop-track')].map(row=>({id:row.id,scrollLeft:row.scrollLeft,width:row.clientWidth,scrollWidth:row.scrollWidth,scrollHeight:row.scrollHeight,height:row.clientHeight,rows:new Set([...row.children].map(c=>Math.round(c.getBoundingClientRect().top))).size,card:rect(row.firstElementChild),gap:style(row).gap,image:rect(row.querySelector('img')),overflowX:style(row).overflowX}));
 const result={viewport:{width:w.innerWidth,height:w.innerHeight},documentWidth:d.documentElement.clientWidth,documentScrollWidth:d.documentElement.scrollWidth,shelves,sidebar:rect(d.querySelector('.sidebar')),mobileNavigation:style(d.querySelector('.mobile-navigation')).display,modal:checkout?{...rect(dialog),padding:style(dialog).padding,maxHeight:style(dialog).maxHeight,image:rect(checkout.querySelector('img')),productGap:style(checkout.querySelector('.shop-product-summary')).gap,titleGap:style(checkout.querySelector('.shop-product-summary p')).marginTop,buttons:[...checkout.querySelectorAll('.shop-checkout-actions>button')].map(rect)}:null};
 report.textContent=JSON.stringify(result,null,2);
};
