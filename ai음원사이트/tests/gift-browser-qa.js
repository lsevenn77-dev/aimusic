// Real app, local disposable SQLite only; never load this runner on production.
const frame=document.querySelector('iframe'),report=document.createElement('pre');report.id='qa-report';document.body.append(report);
const run=document.createElement('button');run.textContent='선물함 최종 검사';document.querySelector('nav').append(run);
run.onclick=async()=>{
 run.disabled=true;const results=[],d=frame.contentDocument,w=frame.contentWindow,q=s=>d.querySelector(s),all=s=>[...d.querySelectorAll(s)],style=e=>w.getComputedStyle(e),rect=e=>e.getBoundingClientRect();
 const wait=async test=>{const end=Date.now()+12000;while(!test()){if(Date.now()>end)throw Error('Timeout: '+test);await new Promise(r=>setTimeout(r,30));}};
 const check=(v,label)=>{if(!v)throw Error(label);};
 const close=async()=>{q('#dialog-close').click();await wait(()=>!q('#dialog').open);};
 const money=text=>check(q('.shop-value-payment')?.textContent===text,'Total expected '+text+' got '+q('.shop-value-payment')?.textContent);
 const open=async selector=>{const b=q(selector),name=b.querySelector('strong').textContent;b.click();await wait(()=>q('#shop-order')&&q('.shop-product-summary h3')?.textContent===name);};
 const popup=()=>{const modal=q('#dialog'),r=rect(modal),actions=rect(q('.shop-checkout-actions'));check(r.left>=0&&r.right<=w.innerWidth&&r.top>=0&&r.bottom<=w.innerHeight,'Popup viewport');check(modal.scrollWidth<=modal.clientWidth,'Popup horizontal overflow');check(r.height<650,'Compact height');check(actions.bottom<=r.bottom,'Actions clipped');check(!q('.shop-value-product')&&!q('.shop-money .shop-value-period'),'Removed duplicate summaries');};
 const purchase=async(selector,price,balance)=>{
  const before=Number(q('[data-shop-'+balance+']').textContent.replace(/\D/g,''));await open(selector);q('#shop-order button[type=submit]').click();await wait(()=>q('.shop-checkout [role=status]'));await wait(()=>Number(q('[data-shop-'+balance+']').textContent.replace(/\D/g,''))===before-price);await close();
 };
 try{
  await wait(()=>q('.shop-page'));
  for(const width of [320,360,390,768,1440]){
   frame.width=width;frame.height=width===1440?900:844;await new Promise(r=>setTimeout(r,120));
   check(d.documentElement.scrollWidth<=d.documentElement.clientWidth,'Page overflow '+width);
   check(style(q('.shop-heading h1')).display===(width<=768?'none':'block'),'Mobile-only title hiding');
   const gold=rect(q('.shop-balance-gold')),silver=rect(q('.shop-balance-silver'));
   check(gold.right<=silver.left&&Math.abs(gold.top-silver.top)<1,'Asset groups overlap or wrap');
   for(const e of all('.shop-balance b'))check(e.scrollWidth<=e.clientWidth,'Amount clipped');
   for(const e of all('.shop-price-value'))check(style(e).color===(e.closest('.is-silver')?'rgb(201, 209, 227)':'rgb(245, 200, 91)'),'Card currency color');
   const frameArt=q('.shop-frame-product img');check(Math.abs(rect(frameArt).width-(width<=600?82:90))<1,'Frame 36% larger');check(style(frameArt).objectFit==='contain','Frame clipping');
   check(!q('.shop-theme-actions [data-product-gift]'),'Only theme preview action');
   check(all('.shop-theme-product>.shop-price').every(e=>e.textContent==='100 G / 7일~'),'Registered theme price and duration');
   for(const shelf of all('.shop-shelf')){
    const row=shelf.querySelector('.shop-track'),cards=[...row.children];check(new Set(cards.map(c=>Math.round(rect(c).height))).size===1,'Card height alignment');
    const toggle=shelf.querySelector('[data-shelf-expand]');toggle.click();await new Promise(r=>setTimeout(r,30));check(new Set(cards.map(c=>Math.round(rect(c).top))).size<=2,'Expanded shelf rows');toggle.click();
   }
   await open('#shelf-gold [data-gift-buy="clover"]');money('30 G');q('[data-quantity="1"]').click();money('60 G');popup();check(style(q('.shop-value-payment')).color==='rgb(245, 200, 91)','Gold total');await close();
   await open('#shelf-silver .shop-product');money('2 S');q('[data-quantity="1"]').click();money('4 S');check(style(q('.shop-value-payment')).color==='rgb(201, 209, 227)','Silver total');popup();await close();
   await open('#shelf-frames .shop-product');money('50 G');q('[name=period][value=P1M]').click();money('150 G');q('[name=period][value=P3M]').click();money('390 G');
   check(all('.shop-periods small').every(e=>style(e).color===style(q('.shop-checkout h3')).color),'White period prices');popup();await close();
   const preview=q('[data-theme-preview]');preview.click();await wait(()=>q('.shop-theme-preview img')?.complete&&q('.shop-theme-preview img')?.naturalWidth>0);
   const image=q('.shop-theme-preview img');check(image.naturalHeight>image.naturalWidth,'Portrait preview');q('.shop-theme-preview [data-product-gift]').click();await wait(()=>q('.shop-periods'));money('100 G');q('[name=period][value=P3M]').click();money('790 G');popup();await close();
   results.push({width,pageOverflow:false,assets:true,currencyColors:true,frameSize:true,quantity:true,periods:true,previewPurchase:true,popup:true});report.textContent=JSON.stringify({running:true,results},null,2);
  }
  frame.width=390;await new Promise(r=>setTimeout(r,120));
  await open('#shelf-gold [data-gift-buy="moon"]');q('#shop-quantity').value='100';q('#shop-quantity').dispatchEvent(new w.Event('input',{bubbles:true}));money('200,000 G');check(q('#shop-order [type=submit]').disabled&&q('.shop-insufficient a').getAttribute('href')==='#gold','Insufficient funds and recharge');await close();
  await purchase('#shelf-gold .shop-product',1,'gold');await purchase('#shelf-silver .shop-product',2,'silver');await purchase('#shelf-frames .shop-product',50,'gold');await purchase('#shelf-themes .shop-product',100,'gold');results.push({purchase:['gold','silver','frame','theme'],balanceRefresh:true,insufficientFunds:true});
  for(const selector of ['#shelf-gold .shop-product','#shelf-silver .shop-product','#shelf-frames .shop-product','#shelf-themes .shop-product']){
   await open(selector);q('[data-step=recipient]').click();await wait(()=>q('#shop-search'));q('#shop-search').click();await wait(()=>q('[data-recipient]'));q('[data-recipient]').click();q('#shop-order [type=submit]').click();await wait(()=>q('#shop-message'));q('#shop-message').value='로컬 UI 검증';q('#shop-message').dispatchEvent(new w.Event('input',{bubbles:true}));q('#shop-order [type=submit]').click();await wait(()=>q('.shop-review'));check(q('.shop-value-payment'),'Gift review total');q('#shop-order [type=submit]').click();await wait(()=>q('.shop-checkout [role=status]'));await close();
  }
  results.push({send:['gold','silver','frame','theme'],review:true});
  q('.shop-actions a[href="#inventory"]').click();await wait(()=>q('.unified-inventory'));check(d.body.textContent.includes('막대사탕')&&d.body.textContent.includes('오로라 링'),'Purchased inventory');results.push({inventory:true});
  w.location.hash='gifts';await wait(()=>q('.shop-page'));q('.shop-actions a[href="#gold"]').click();await wait(()=>!q('.shop-page'));check(d.body.textContent.includes('골드'),'Gold navigation');w.location.hash='gifts';await wait(()=>q('.shop-page'));q('.shop-actions a[href="#gifts/rewards"]').click();await wait(()=>q('#gift-shop-rewards'));w.location.hash='gifts';await wait(()=>q('.shop-page'));results.push({navigation:['gold','rewards','inventory']});
  report.textContent=JSON.stringify({passed:true,results},null,2);
 }catch(e){report.textContent=JSON.stringify({passed:false,error:e.message,results},null,2);}finally{run.disabled=false;}
};
