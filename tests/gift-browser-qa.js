// Same-origin real-app QA against preview-gifts.mjs's disposable SQLite database.
const frame=document.querySelector('iframe'),report=document.createElement('pre');report.id='qa-report';document.body.append(report);
const run=document.createElement('button');run.textContent='선물함 최종 검사';document.querySelector('nav').append(run);
run.onclick=async()=>{
 run.disabled=true;const results=[],d=frame.contentDocument,w=frame.contentWindow,q=s=>d.querySelector(s),all=s=>[...d.querySelectorAll(s)],style=e=>w.getComputedStyle(e),rect=e=>e.getBoundingClientRect();
 const wait=async test=>{const end=Date.now()+12000;while(!test()){if(Date.now()>end)throw Error('Timeout: '+test);await new Promise(r=>setTimeout(r,30));}};
 const check=(v,label)=>{if(!v)throw Error(label);};
 const close=async()=>{q('#dialog-close').click();await wait(()=>!q('#dialog').open);await new Promise(r=>setTimeout(r,30));};
 const money=(cls,text)=>check(q(cls)?.textContent===text,cls+' expected '+text+' got '+q(cls)?.textContent);
 const alignment=()=>{
  const buttons=all('.shop-actions a,.shop-page button:not(.shop-product),.shop-checkout button').filter(e=>rect(e).width&&rect(e).height);
  for(const b of buttons){const s=style(b);check(['flex','inline-flex'].includes(s.display)&&s.alignItems==='center'&&s.justifyContent==='center','Flex alignment: '+b.textContent);}
  return buttons.length;
 };
 const open=async selector=>{const b=q(selector),name=b.querySelector('strong').textContent;b.click();await wait(()=>q('#dialog').open&&q('#shop-order')&&q('.shop-product-summary h3')?.textContent===name);};
 const purchase=async(selector,price,balance)=>{
  const before=Number(q('[data-shop-'+balance+']').textContent.replace(/\D/g,''));await open(selector);q('#shop-order button[type=submit]').click();await wait(()=>q('.shop-checkout [role=status]'));
  await wait(()=>Number(q('[data-shop-'+balance+']').textContent.replace(/\D/g,''))===before-price);await close();
 };
 try{
  await wait(()=>q('.shop-page'));
  for(const width of [320,375,390,430,768,1024,1280,1440]){
   frame.width=width;frame.height=width>=1280?900:844;await new Promise(r=>setTimeout(r,120));
   check(d.documentElement.scrollWidth<=d.documentElement.clientWidth,'Page overflow '+width);
   check(all('[data-theme-preview]').length===3&&all('#shelf-gold [data-theme-preview],#shelf-silver [data-theme-preview],#shelf-frames [data-theme-preview]').length===0,'Theme-only preview');
   const rows=[],arrowVisual=width<=768?24:26,arrowHit=width<=768?44:26;
   check(all('.shop-balances b').every(e=>parseFloat(style(e).fontSize)<=(width<=600?13:14)),'Balance text scale');
   check(all('.shop-actions a').every(e=>parseFloat(style(e).fontSize)<=11),'Top action text scale');
   for(const shelf of all('.shop-shelf')){
    const row=shelf.querySelector('.shop-track'),toggle=shelf.querySelector('[data-shelf-expand]'),cards=[...row.querySelectorAll('.shop-product')];
    const arrows=[...shelf.querySelectorAll('[data-shelf]')],heading=shelf.querySelector('h2');
    check(arrows.every(b=>rect(b).width===arrowHit&&rect(b).height===arrowHit&&rect(b.querySelector('.shop-arrow-glyph')).width===arrowVisual&&rect(b.querySelector('.shop-arrow-glyph')).height===arrowVisual),'Arrow visual/hit sizes');
    const headingGap=rect(arrows[0].querySelector('.shop-arrow-glyph')).left-rect(heading).right;
    check(headingGap>=0&&headingGap<=10,'Arrow beside heading');
    check(rect(arrows[0]).right<=rect(arrows[1]).left,'Arrow hit targets overlap');
    check(parseFloat(style(heading).fontSize)===(width<=768?13:14),'Section title scale');
    check(new Set(cards.map(c=>Math.round(rect(c).height))).size===1,'Unequal heights');
    const expectedWidth=width<=600?76:84,expectedHeight=width<=600?98:106;
    check(cards.every(c=>rect(c).width<=expectedWidth+.1&&rect(c).height===expectedHeight),'Card dimensions');
    const rowBounds=rect(row),visible=cards.filter(c=>rect(c).left>=rowBounds.left-.5&&rect(c).right<=rowBounds.right+.5).length,capacity=Math.floor((row.clientWidth+6)/(rect(cards[0]).width+6));
    if(width===375)check(visible===Math.min(cards.length,4),'Mobile must show four complete products');
    if(width===1440)check(capacity>=11&&capacity<=12,'Desktop capacity must be 11–12');
    check(new Set(cards.map(c=>Math.round(rect(c.querySelector('span')).bottom-rect(c).top))).size===1,'Price baseline');
    check(cards.every(c=>{const r=rect(c),p=rect(c.querySelector('span'));return p.left>=r.left&&p.right<=r.right;}),'Price clipping');
    check(cards.every(c=>{const t=c.querySelector('strong');return t.scrollHeight<=t.clientHeight+1;}),'Registered product name clipped');
    check(cards.every(c=>style(c.querySelector('strong')).webkitLineClamp==='2'),'Two-line title clamp');
    check(style(cards[0].querySelector('img')).objectFit==='contain','Image fit');
    const columns=new Set([...row.children].map(c=>Math.round(rect(c).top))).size;check(columns===1,'Collapsed rows');
    toggle.click();await new Promise(r=>setTimeout(r,30));
    check(new Set([...row.children].map(c=>Math.round(rect(c).top))).size<=2,'More than 2 expanded rows');
    check(style(row).overflowX==='auto','Expanded horizontal scroll');toggle.click();
    const next=shelf.querySelector('[data-direction="1"]'),prev=shelf.querySelector('[data-direction="-1"]');
    if(row.scrollWidth>row.clientWidth+1){next.click();await wait(()=>row.scrollLeft>1);await new Promise(r=>setTimeout(r,600));prev.click();await wait(()=>row.scrollLeft<2);}
    else check(next.disabled&&prev.disabled,'Nonoverflow arrows');
    rows.push({id:row.id,card:{width:rect(cards[0]).width,height:rect(cards[0]).height},thumb:rect(cards[0].querySelector('img')).width,visible,capacity,total:cards.length,arrowVisual,arrowHit,headingGap,titleFont:style(heading).fontSize,scrollbar:w.getComputedStyle(row,'::-webkit-scrollbar').height});
   }
   await open('#shelf-frames .shop-product');
   money('.shop-value-product','50 G');money('.shop-value-payment','50 G');money('.shop-value-period','7일');
   const colors=['.shop-value-product','.shop-value-payment','.shop-value-period'].map(s=>style(q(s)).color);
   check(colors.join('|')==='rgb(142, 221, 210)|rgb(245, 156, 203)|rgb(181, 160, 244)','Value colors');
   q('[name=period][value=P1M]').click();money('.shop-value-product','150 G');money('.shop-value-payment','150 G');money('.shop-value-period','1개월');
   const r=rect(q('#dialog'));check(r.left>=0&&r.right<=w.innerWidth&&r.top>=0&&r.bottom<=w.innerHeight,'Checkout clipped '+width);
   const aligned=alignment();await close();
   const previews=all('[data-theme-preview]');
   for(const b of previews){b.click();await wait(()=>q('#dialog').open&&q('.shop-theme-preview img')?.getAttribute('src')===b.dataset.themePreview);
    const image=q('.shop-theme-preview img');await wait(()=>image.complete&&image.naturalWidth>0);
    check(q('#dialog-content').querySelectorAll('img').length===1&&!q('#shop-order')&&!q('#dialog-content button'),'Preview content');
    check(image.getAttribute('src')===b.dataset.themePreview&&image.naturalHeight>image.naturalWidth&&style(image).objectFit==='contain','Registered portrait');
    const r=rect(q('#dialog'));check(r.left>=0&&r.right<=w.innerWidth&&r.top>=0&&r.bottom<=w.innerHeight,'Preview clipped '+width);
    await close();await wait(()=>d.activeElement===b);
   }
   results.push({width,overflow:false,aligned,rows,colors,previews:3});report.textContent=JSON.stringify({running:true,results},null,2);
  }
  frame.width=390;await new Promise(r=>setTimeout(r,120));
  await open('#shelf-gold .shop-product');check(!q('.shop-value-period'),'Duration on non-duration gift');q('[data-quantity="1"]').click();money('.shop-value-product','1 G');money('.shop-value-payment','2 G');await close();
  await purchase('#shelf-gold .shop-product',1,'gold');await purchase('#shelf-silver .shop-product',2,'silver');await purchase('#shelf-frames .shop-product',50,'gold');await purchase('#shelf-themes .shop-product',100,'gold');results.push({purchase:['gold','silver','frame','theme'],balanceRefresh:true});
  // Existing recipient → optional message → review → send flow; only the local fixture receives this.
  for(const selector of ['#shelf-gold .shop-product','#shelf-silver .shop-product','#shelf-frames .shop-product','#shelf-themes .shop-product']){
   await open(selector);q('[data-step=recipient]').click();await wait(()=>q('#shop-search'));q('#shop-search').click();await wait(()=>q('[data-recipient]'));q('[data-recipient]').click();q('#shop-order button[type=submit]').click();await wait(()=>q('#shop-message'));q('#shop-message').value='로컬 UI 검증';q('#shop-order button[type=submit]').click();await wait(()=>q('.shop-review'));check(q('.shop-value-payment'),'Gift payment value');q('#shop-order button[type=submit]').click();await wait(()=>q('.shop-checkout [role=status]'));await close();
  }
  results.push({send:['gold','silver','frame','theme'],review:true});
  q('.shop-actions a[href="#inventory"]').click();await wait(()=>q('.unified-inventory'));check(d.body.textContent.includes('막대사탕')&&d.body.textContent.includes('오로라 링'),'Purchased inventory');results.push({inventory:true});
  w.location.hash='gifts';await wait(()=>q('.shop-page'));q('.shop-actions a[href="#gold"]').click();await wait(()=>!q('.shop-page'));check(d.body.textContent.includes('골드'),'Gold navigation');w.location.hash='gifts';await wait(()=>q('.shop-page'));q('.shop-actions a[href="#gifts/rewards"]').click();await wait(()=>q('#gift-shop-rewards'));w.location.hash='gifts';await wait(()=>q('.shop-page'));results.push({navigation:['gold','rewards','inventory']});
  report.textContent=JSON.stringify({passed:true,results},null,2);
 }catch(e){report.textContent=JSON.stringify({passed:false,error:e.message,results},null,2);}finally{run.disabled=false;}
};
