// Test-only, same-origin viewport harness. Never included in production assets.
const frame=document.querySelector('iframe');
const report=document.createElement('pre');report.id='qa-report';
const button=document.createElement('button');button.textContent='레이아웃 검사';
document.querySelector('nav').append(button);document.body.append(report);
const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
// Exercise the built real app against preview-gifts.mjs's isolated SQLite fixture.
const run=document.createElement('button');run.textContent='선물함 전체 검사';document.querySelector('nav').append(run);
run.onclick=async()=>{
 run.disabled=true;const results=[],d=frame.contentDocument,w=frame.contentWindow,q=s=>d.querySelector(s),all=s=>[...d.querySelectorAll(s)];
 const wait=async check=>{const end=Date.now()+8000;while(!check()){if(Date.now()>end)throw Error('Timed out: '+check);await new Promise(r=>setTimeout(r,30));}};
 const check=(value,label)=>{if(!value)throw Error(label);};
 const layout=()=>({width:w.innerWidth,document:d.documentElement.clientWidth,scroll:d.documentElement.scrollWidth,balances:rect(q('.shop-balances')),heading:rect(q('.shop-heading')),actions:all('.shop-actions a').map(rect),shelves:all('.shop-track').map(row=>({id:row.id,width:row.clientWidth,scroll:row.scrollWidth,card:rect(row.firstElementChild),rows:new Set([...row.children].map(e=>Math.round(rect(e).y))).size}))});
 try{
  await wait(()=>q('.shop-page'));
  for(const width of [320,360,390,430,768,1280,1440,1920]){
   frame.width=width;frame.height=width>=1280?900:844;await new Promise(r=>setTimeout(r,100));
   const data=layout();check(data.scroll<=data.document,'Page overflow at '+width);
   check(data.shelves.every(row=>row.rows===1),'Collapsed shelf has multiple rows');
   check(data.actions.every(a=>a.x>=0&&a.x+a.width<=data.document+1),'Clipped action');
   if(width>=1280)check(data.balances.height<=52,'Desktop balance is not one line');
   for(const shelf of all('.shop-shelf')){
    const toggle=shelf.querySelector('[data-shelf-expand]'),row=shelf.querySelector('.shop-track'),other=all('.shop-shelf').filter(e=>e!==shelf);
    toggle.click();check(toggle.getAttribute('aria-expanded')==='true','Expand state');check(shelf.querySelector('.shop-arrows').hidden,'Expanded arrows visible');
    check(other.every(s=>!s.classList.contains('is-expanded')),'Another category expanded');
    check(row.scrollHeight<=row.clientHeight+1&&row.scrollWidth<=row.clientWidth+1,'Nested expanded scrollbar');
    if(width<=768&&row.children.length>1)check(new Set([...row.children].slice(0,2).map(e=>Math.round(rect(e).y))).size===1&&Math.abs(rect(row.children[0]).width-rect(row).width/2)<12,'Mobile two columns');
    const product=row.firstElementChild,name=product.querySelector('strong').textContent;product.click();await wait(()=>q('#dialog').open&&q('.shop-product-summary h3')?.textContent===name);q('#dialog-close').click();await wait(()=>!q('#dialog').open);
    toggle.click();check(toggle.getAttribute('aria-expanded')==='false','Collapse state');
    const next=shelf.querySelector('[data-direction="1"]'),prev=shelf.querySelector('[data-direction="-1"]');
    if(row.scrollWidth>row.clientWidth+1){next.click();await wait(()=>row.scrollLeft>0&&!prev.disabled);await new Promise(r=>setTimeout(r,700));const moved=row.scrollLeft;prev.click();await wait(()=>row.scrollLeft<moved);await new Promise(r=>setTimeout(r,700));check(other.every(s=>s.querySelector('.shop-track').scrollLeft===0),'Arrow moved another category');}
    else check(next.disabled&&prev.disabled,'Nonoverflow arrows active');
   }
   results.push({...data,status:'passed'});report.textContent=JSON.stringify({running:true,results},null,2);
  }
  frame.width=390;await new Promise(r=>setTimeout(r,100));
  // Large real-number formatting stays inside the balance container, without ellipsis.
  const gold=q('[data-shop-gold]'),silver=q('[data-shop-silver]'),saved=[gold.textContent,silver.textContent];
  gold.textContent='9,007,199,254,740,991 G';silver.textContent='9,007,199,254,740,991 S';
  check(d.documentElement.scrollWidth<=d.documentElement.clientWidth,'Long balance overflow');check(gold.scrollWidth<=gold.clientWidth&&silver.scrollWidth<=silver.clientWidth,'Long balance clipped');
  [gold.textContent,silver.textContent]=saved;results.push({longBalances:'passed'});
  for(const [category,balance,price] of [['gold','gold',1],['silver','silver',2]]){
   const initial=Number(q('[data-shop-'+balance+']').textContent.replace(/\D/g,''));
   const product=q('#shelf-'+category+' .shop-product'),name=product.querySelector('strong').textContent;
   product.click();await wait(()=>q('#dialog').open&&q('.shop-product-summary h3')?.textContent===name);q('#shop-order button[type=submit]').click();await wait(()=>q('.shop-checkout [role=status]'));
   await wait(()=>Number(q('[data-shop-'+balance+']').textContent.replace(/\D/g,''))===initial-price);
   q('#dialog-close').click();await wait(()=>q('.shop-page'));results.push({purchase:category,balanceRefresh:'passed'});
  }
  const navigate=async selector=>{q(selector).click();await wait(()=>!q('.shop-page'));};
  await navigate('.shop-actions a[href="#gold"]');await wait(()=>d.body.textContent.includes('골드'));w.location.hash='gifts';await wait(()=>q('.shop-page'));
  await navigate('.shop-actions a[href="#gifts/rewards"]');await wait(()=>q('#gift-shop-rewards'));
  const claim=q('[data-claim-gift="checkin"]'),before=Number(q('.free-rewards-title b').textContent.replace(/\D/g,''));
  if(claim&&!claim.disabled){claim.click();await wait(()=>Number(q('.free-rewards-title b').textContent.replace(/\D/g,''))>before);}
  w.location.hash='gifts';await wait(()=>q('.shop-page'));check(Number(q('[data-shop-silver]').textContent.replace(/\D/g,''))>=before,'Claim balance did not refresh');
  await navigate('.shop-actions a[href="#inventory"]');await wait(()=>d.body.textContent.includes('인벤토리'));w.location.hash='gifts';await wait(()=>q('.shop-page'));
  check(!q('.shop-page').textContent.includes('공식 AI 응원별'),'Official support notice remains');
  results.push({navigation:['gold','rewards','inventory'],status:'passed'});report.textContent=JSON.stringify({passed:true,results},null,2);
 }catch(error){report.textContent=JSON.stringify({passed:false,error:error.message,results},null,2);}finally{run.disabled=false;}
};
button.onclick=()=>{
 const d=frame.contentDocument,w=frame.contentWindow,style=e=>w.getComputedStyle(e),dialog=d.querySelector('#dialog'),checkout=d.querySelector('.shop-checkout');
 const shelves=[...d.querySelectorAll('.shop-track')].map(row=>({id:row.id,scrollLeft:row.scrollLeft,width:row.clientWidth,scrollWidth:row.scrollWidth,scrollHeight:row.scrollHeight,height:row.clientHeight,rows:new Set([...row.children].map(c=>Math.round(c.getBoundingClientRect().top))).size,card:rect(row.firstElementChild),gap:style(row).gap,image:rect(row.querySelector('img')),overflowX:style(row).overflowX}));
 const result={viewport:{width:w.innerWidth,height:w.innerHeight},documentWidth:d.documentElement.clientWidth,documentScrollWidth:d.documentElement.scrollWidth,shelves,sidebar:rect(d.querySelector('.sidebar')),mobileNavigation:style(d.querySelector('.mobile-navigation')).display,modal:checkout?{...rect(dialog),padding:style(dialog).padding,maxHeight:style(dialog).maxHeight,image:rect(checkout.querySelector('img')),productGap:style(checkout.querySelector('.shop-product-summary')).gap,titleGap:style(checkout.querySelector('.shop-product-summary p')).marginTop,buttons:[...checkout.querySelectorAll('.shop-checkout-actions>button')].map(rect)}:null};
 report.textContent=JSON.stringify(result,null,2);
};
