(() => {
 const kinds={gift:'선물',frame:'테두리',theme:'테마'}, periods={unit:'1개',P7D:'7일',P1M:'1개월',P3M:'3개월',PERMANENT:'영구'};
 const modes={static:'정적 이미지',layered:'분리형 애니메이션',animated:'애니메이션 이미지'};
 const platforms={desktop:'PC웹',mobile:'모바일웹',android:'Android',ios:'iOS'};
 const surfaces={shop:'상점 카드',inventory:'인벤토리','gift-picker':'선물하기',my:'마이',profile:'회원 프로필',messages:'메시지',
  talk:'토킹룸',karaoke:'노래방','talk-muted':'토킹룸 · 음소거','karaoke-muted':'노래방 · 음소거',
  'talk-seated':'토킹룸 · 착석','talk-unseated':'토킹룸 · 미착석','karaoke-seated':'노래방 · 착석','karaoke-unseated':'노래방 · 미착석',
  'talk-dark':'토킹룸 · 블랙','talk-light':'토킹룸 · 화이트','karaoke-dark':'노래방 · 블랙','karaoke-light':'노래방 · 화이트'};
 const screenSets={gift:['shop','inventory','gift-picker','talk-seated','talk-unseated','karaoke-seated','karaoke-unseated'],
  frame:['shop','inventory','my','profile','messages','talk','talk-muted','karaoke','karaoke-muted'],
  theme:['shop','inventory','talk-dark','talk-light','karaoke-dark','karaoke-light']};
 const roles={base:'본체',effect:'효과',thumbnail:'대표 이미지',fallback:'정적 대체 이미지',desktop:'PC 배경',mobile:'모바일 배경',app:'앱 배경',
  roomCard:'방 목록 카드',desktopEffect:'PC 효과',mobileEffect:'모바일 효과',appEffect:'앱 효과',package:'ZIP 패키지'};
 const saleLabel=p=>p.archived?'보관':p.distribution==='grant'?'발송 전용':p.sale?'판매 중':p.legacy||p.activeVersion?'판매 중지':'초안';
 const operationNames={sale_resume:'판매 재개',sale_stop:'판매 중지',archive:'보관',unarchive:'보관 해제',delete:'삭제'};
 const currencies={G:['골드','/assets/shop/coin-g.svg'],S:['실버','/assets/shop/coin-s.svg']};
 const num=n=>new Intl.NumberFormat('ko-KR').format(n);
 const kst=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
 const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
 const root='/api/admin/products', url=id=>root+'/'+encodeURIComponent(id);

 function mount(box,{api,esc:e,toast,jumpToGrant}){
  if(!box)return null;
  const find=(sel,el=box)=>el.querySelector(sel), all=(sel,el=box)=>[...el.querySelectorAll(sel)];
  const state={type:'',archived:false,page:1,listToken:0,detailToken:0,dirty:false,saving:false,
   attempts:new WeakMap(),selected:new Set(),products:new Map(),canEdit:false,canDispatch:false};
  const opts=values=>Object.entries(values).sort(([a],[b])=>Number(b==='')-Number(a==='')).map(([v,label])=>'<option value="'+e(v)+'">'+e(label)+'</option>').join('');
  const field=(label,name,type,attr='')=>'<label>'+e(label)+'<input type="'+type+'" name="'+name+'" '+attr+'></label>';
  const select=(label,name,values,attr='')=>'<label>'+e(label)+'<select name="'+name+'" '+attr+'>'+opts(values)+'</select></label>';
  const btn=(label,action,attr='')=>'<button class="small-button" type="button" data-product-action="'+action+'" '+attr+'>'+e(label)+'</button>';
  const submit=label=>'<button class="primary-button product-primary" type="submit">'+e(label)+'</button>';
  const actions=html=>'<div class="product-actions">'+html+'</div>';
  const message='<p class="product-message" role="status"></p>';
  const img=(path,w)=>path?'<img src="'+e(path)+'" alt="" loading="lazy" decoding="async" width="'+w+'" height="'+w+'">':'';
  const file=(role,required=false,accept='image/webp,image/png,image/jpeg,image/gif',label=roles[role])=>
   field(label,role,'file','accept="'+accept+'" '+(required?'required':''));
  const warnClose=()=>!state.dirty||window.confirm('작성 중인 내용을 닫으시겠습니까?');
  const dataId=p=>'data-id="'+e(p.id)+'"';
  const disabled=reason=>reason?' disabled title="'+e(reason)+'" aria-description="'+e(reason)+'"':'';
  const formatPrice=(value,currency)=>{
   const [label,src]=currencies[currency];
   return '<span class="product-price"><img src="'+src+'" alt="'+label+'" width="16" height="16">'+num(value)+'</span>';
  };

  box.innerHTML='<div class="section-heading product-heading"><h1>상품 관리</h1>'+
   '<button class="primary-button product-primary" type="button" data-product-action="new" hidden>상품 등록</button></div>'+
   '<div class="product-tabs" role="group" aria-label="상품 유형과 보관">'+[['','전체'],...Object.entries(kinds),['archived','보관']].map(([v,label])=>
    btn(label,'type','data-type="'+v+'" aria-pressed="'+(v==='')+'"')).join('')+'</div>'+
   '<article class="admin-card product-list"><form class="product-filters">'+field('상품 검색','q','search','maxlength="100" placeholder="상품명 또는 ID"')+
   select('통화','currency',{'':'전체',G:'골드',S:'실버'})+select('상품 구분','distribution',{'':'전체',shop:'상점 판매',grant:'발송 전용'})+
   select('판매 상태','sale',{'':'전체',1:'판매 중',0:'판매 중지'})+
   '<button type="submit" class="small-button">검색</button></form><p class="product-result" aria-live="polite"></p>'+
   '<div class="product-selection" hidden></div><div class="product-rows" role="region" aria-label="상품 목록" tabindex="0"></div>'+
   '<div class="product-pages"></div></article><div class="product-overflow" id="product-overflow" popover aria-label="상품 관리 작업"></div>'+
   '<dialog class="admin-card product-dialog" aria-labelledby="product-dialog-title"><div class="product-dialog-head"><h2 id="product-dialog-title"></h2>'+
   btn('닫기','close','autofocus')+'</div><div class="product-content"></div></dialog>';
  const filters=find('.product-filters'), dialog=find('.product-dialog'), content=find('.product-content'), result=find('.product-result');
  const tableHost=find('.product-rows'),selectionBar=find('.product-selection'),menu=find('.product-overflow');
  function modal(title,html){
   state.dirty=false;find('#product-dialog-title').textContent=title;content.innerHTML=html;
   if(!dialog.open)dialog.showModal();
   content.scrollTop=0;
  }
  function close(){
   if(state.saving||!warnClose())return;
   state.detailToken++;state.dirty=false;state.operation=null;dialog.close();content.replaceChildren();
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  content.addEventListener('input',event=>{if(event.target.closest('form'))state.dirty=true;});
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  document.addEventListener('aifect-admin-locked',()=>{
   state.detailToken++;state.listToken++;state.dirty=false;state.detail=null;
   if(dialog.open)dialog.close();content.replaceChildren();tableHost.replaceChildren();
   hideMenu();state.products.clear();clearSelection();
  });

  function paintSelection(){
   const total=state.selected.size,header=find('[data-select-all]',tableHost);
   if(header){
    header.checked=total===state.products.size;
    header.indeterminate=total>0&&total<state.products.size;
    for(const checkbox of all('[data-select-product]',tableHost))checkbox.checked=state.selected.has(checkbox.value);
   }
   selectionBar.hidden=!total;
   if(!total){selectionBar.replaceChildren();return;}
   const available=state.archived?['unarchive','delete']:['sale_resume','sale_stop','archive','delete'];
   selectionBar.innerHTML='<strong role="status">'+num(total)+'개 선택</strong>'+btn('선택 해제','clear-selection')+
    available.map(action=>btn(operationNames[action],'bulk','data-operation="'+action+'"'+(action==='delete'?' data-tone="danger"':''))).join('');
  }
  function clearSelection(){state.selected.clear();paintSelection();}
  tableHost.addEventListener('change',event=>{
   const input=event.target;
   if(input.matches('[data-select-all]'))state.selected=new Set(input.checked?state.products.keys():[]);
   else if(input.matches('[data-select-product]')){
    if(input.checked)state.selected.add(input.value);else state.selected.delete(input.value);
   }else return;
   paintSelection();
  });

  function hideMenu(){
   if(menu.matches(':popover-open'))menu.hidePopover();
  }
  menu.addEventListener('toggle',()=>{
   if(!menu.matches(':popover-open')){
    state.menuButton?.setAttribute('aria-expanded','false');
    state.menuButton=null;
   }
  });
  tableHost.addEventListener('scroll',hideMenu);
  window.addEventListener('resize',hideMenu);
  function openMenu(p,trigger){
   if(state.menuButton===trigger&&menu.matches(':popover-open')){hideMenu();return;}
   state.menuButton?.setAttribute('aria-expanded','false');
   state.menuButton=trigger;
   trigger.setAttribute('aria-expanded','true');
   const operation=(name,label,reason='')=>btn(label,'operation',dataId(p)+' data-operation="'+name+'"'+disabled(reason))+
    (reason?'<small>'+e(reason)+'</small>':'');
   const sale=p.sale?'sale_stop':'sale_resume';
   const saleReason=p.distribution!=='shop'?'상점 판매 상품에만 적용할 수 있습니다.':
    !p.legacy&&!p.activeVersion&&sale==='sale_resume'?'검수를 완료하고 에셋을 적용해 주세요.':'';
   menu.innerHTML=(p.archived?'':operation(sale,operationNames[sale],saleReason))+
    btn('상품 복제','copy',dataId(p))+operation(p.archived?'unarchive':'archive',p.archived?'보관 해제':'상품 보관')+
    '<hr>'+btn('상품 삭제','operation',dataId(p)+' data-operation="delete" data-tone="danger"');
   if(!menu.matches(':popover-open'))menu.showPopover();
   const bounds=trigger.getBoundingClientRect(),width=menu.offsetWidth,height=menu.offsetHeight;
   menu.style.left=Math.max(8,Math.min(bounds.right-width,window.innerWidth-width-8))+'px';
   menu.style.top=(bounds.bottom+height+8<=window.innerHeight?bounds.bottom+4:Math.max(8,bounds.top-height-4))+'px';
   find('button:not(:disabled)',menu)?.focus();
  }

  function items(products){
   if(!products.length)return '<p class="empty-state">검색 조건에 맞는 상품이 없습니다.</p>';
   const heads=['상품','가격','이용 옵션','판매 상태','보유 회원 / 발송','관리'];
   return '<table class="product-table"><thead><tr><th scope="col" class="product-checkbox"><input type="checkbox" data-select-all aria-label="현재 페이지 상품 전체 선택"'+
    (state.canEdit?'':' disabled')+'></th>'+heads.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+
    products.map(p=>{
     const attrs=dataId(p);
     const dispatchReason=p.archived?'보관된 상품은 발송할 수 없습니다.':
      !p.dispatch_available?'이 상품은 현재 발송할 수 없습니다.':!state.canDispatch?'발송 권한이 필요합니다.':'';
     const held=num(p.holders)+'명 / '+num(p.granted)+'개';
     const price=p.distribution==='shop'?formatPrice(Math.min(...Object.values(p.options)),p.currency)+
      (Object.keys(p.options).length>1?' <small>부터</small>':''):'<span aria-label="판매 가격 없음">—</span>';
     const cells=['<button class="product-identity" type="button" data-product-action="detail" '+attrs+' aria-label="'+e(p.name)+' 상세보기">'+
       (img(p.asset?.files.thumbnail,40)||'<span class="product-placeholder" aria-hidden="true"></span>')+
       '<span><strong>'+e(p.name)+'</strong><small>'+e(kinds[p.type]+' · '+p.id)+'</small></span></button>',
      price,e(Object.keys(p.options).map(k=>periods[k]||k).join(' / ')),
      '<span class="product-state '+(p.sale&&!p.archived?'positive':'')+'">'+e(saleLabel(p))+'</span>'+
       (p.eventOnly?'<small class="product-event">이벤트 한정</small>':''),
      '<span class="product-count">'+held+'</span>',
      '<div class="product-row-actions">'+btn('수정','edit',attrs+disabled(state.canEdit?'':'상품 변경 권한이 필요합니다.'))+
       btn('발송하기','dispatch',attrs+' data-tone="dispatch"'+disabled(dispatchReason))+
       btn('발송 내역','dispatch-history',attrs)+
       (state.canEdit?btn('···','more',attrs+' aria-label="'+e(p.name)+' 관리 더보기" aria-expanded="false" aria-controls="product-overflow"'):'')+'</div>'];
     return '<tr '+attrs+'><td class="product-checkbox"><input type="checkbox" value="'+e(p.id)+'" data-select-product aria-label="'+e(p.name)+' 선택"'+
      (state.canEdit?'':' disabled')+'></td>'+cells.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>';
    }).join('')+'</tbody></table>';
  }
  async function list(){
   hideMenu();clearSelection();
   const token=++state.listToken,params=new URLSearchParams(new FormData(filters));
   params.set('page',String(state.page));params.set('type',state.type);
   if(state.archived){params.set('archived','1');params.delete('sale');}
   tableHost.inert=true;
   result.textContent='상품을 불러오고 있습니다.';
   try{
    const d=await api(root+'?'+params);if(token!==state.listToken)return;
    state.page=d.page;state.canEdit=d.can_edit;state.canDispatch=d.can_dispatch;
    state.products=new Map(d.products.map(p=>[p.id,p]));
    find('[data-product-action=new]').hidden=!d.can_edit;
    result.textContent=(state.archived?'보관 상품 ':'상품 ')+num(d.total)+'개';tableHost.innerHTML=items(d.products);
    tableHost.scrollLeft=0;
    find('.product-pages').innerHTML=d.pages>1?btn('이전','page','data-page="'+(d.page-1)+'" '+(d.page===1?'disabled':''))+
     '<span>'+d.page+' / '+d.pages+'</span>'+btn('다음','page','data-page="'+(d.page+1)+'" '+(d.page===d.pages?'disabled':'')):'';
   }catch(error){
    if(token!==state.listToken)return;
    state.products.clear();result.textContent=error.message;tableHost.replaceChildren();find('.product-pages').innerHTML=btn('다시 시도','reload');
   }finally{if(token===state.listToken)tableHost.inert=false;}
  }
  filters.onsubmit=event=>{event.preventDefault();state.page=1;void list();};
  filters.onchange=event=>{if(event.target.matches('select')){state.page=1;void list();}};
  filters.elements.q.oninput=clearSelection;

  async function detail(id,edit=false){
   const token=++state.detailToken;modal('상품 상세','<p role="status">상품 정보를 확인하고 있습니다.</p>');
   try{
    const data=await api(url(id));if(token!==state.detailToken)return;
    state.detail=data;
    if(edit&&data.can_edit)editor(data.product);else paintDetail();
   }
   catch(error){if(token===state.detailToken)modal('상품 상세','<p role="alert">'+e(error.message)+'</p>'+btn('다시 시도','detail','data-id="'+e(id)+'"'));}
  }
  function paintDetail(){
   const {product:p,can_edit:edit,versions,active_review:review}=state.detail;
   const current=versions.find(v=>v.id===p.activeVersion);
   const labels={
    '상품 ID':e(p.id),'유형 · 상품 구분':e(kinds[p.type]+' · '+(p.distribution==='shop'?'상점 판매':'발송 전용')),
    '가격':p.distribution==='shop'?formatPrice(Math.min(...Object.values(p.options)),p.currency):'발송 전용',
    '이용 옵션':Object.entries(p.options).map(([k,v])=>e(periods[k]||k)+(p.distribution==='shop'&&p.type!=='gift'?' '+formatPrice(v,p.currency):'')).join(' / '),
    '판매 상태':e(saleLabel(p)+(p.eventOnly?' · 이벤트 한정':''))};
   const assetLabel=current?.label||(p.legacy?'기존 운영 에셋':'미등록');
   const reviewLabel=review?(review.ready?'해당 플랫폼 검수 통과':'재검수 필요'):'검수 기록 없음';
   const files=versions.length?'<ul class="product-versions">'+versions.map(v=>'<li><div><strong>'+e(v.label)+'</strong><small>'+
    e(kst.format(new Date(v.created*1000)))+' · '+(v.id===p.activeVersion?'적용 중':v.published_at?'이전 적용':'검수 후보')+
    '</small></div>'+btn('검수 및 파일','version','data-version="'+e(v.id)+'"')+'</li>').join('')+'</ul>':'<p class="management-meta">등록한 에셋 버전이 없습니다.</p>';
   modal(p.name,'<div class="product-overview">'+img(p.asset?.files.thumbnail,72)+'<dl>'+
    Object.entries(labels).map(([k,v])=>'<div><dt>'+e(k)+'</dt><dd>'+v+'</dd></div>').join('')+
    '</dl>'+(edit?btn('상품 수정','edit'):'')+'</div>'+
    (p.description?'<p>'+e(p.description)+'</p>':'')+
    '<section class="product-subsection"><h2>에셋 및 버전</h2><p class="product-asset-status"><strong>적용 에셋</strong> '+e(assetLabel)+
    ' <strong>실제 적용 검수</strong> '+e(reviewLabel)+'</p>'+
    actions((p.asset?btn('적용 미리보기','preview'):'')+
     (edit&&!p.archived?btn('에셋 등록/교체','upload')+(p.id==='theme_christmas'?'':btn('검증 에셋 연결','link')):'')+
     (p.legacy&&p.activeVersion&&edit&&!p.archived?btn('기존 에셋으로 복원','restore'):'') )+files+'</section>'+message);
  }

  function editor(p,copy=false){
   const edit=!!p&&!copy,locked=edit&&(p.archived||p.id==='theme_christmas');
   modal(edit?'상품 수정':'상품 등록','<form class="product-form"><div class="product-form-grid">'+select('상품 유형','type',kinds,edit?'disabled':'')+
    field('상품명','name','text','required maxlength="80"')+select('상품 구분','distribution',{shop:'상점 판매',grant:'발송 전용'})+
    select('통화','currency',{G:'골드',S:'실버'})+'<div class="product-form-grid product-prices"></div>'+
    field('표시 가치 (선택)','value','number','min="0" max="100000"')+select('방 패널','uiMode',{dark:'블랙',light:'화이트'})+
    '<label class="product-check"><input name="eventOnly" type="checkbox"> 이벤트 한정</label>'+
    '<label class="product-span">상품 설명<textarea name="description" rows="2" maxlength="400"></textarea></label></div>'+
    (locked?'<p class="management-meta">'+(p.archived?'에셋을 교체하려면 보관을 해제해 주세요.':'크리스마스 테마 에셋은 전용 렌더러 빌드와 함께 검수합니다.')+'</p>':assetFields())+
    actions(submit(edit?'변경 저장':'초안 저장')+btn(edit?'상세로':'취소',edit?'back':'close'))+message+'</form>');
   const form=find('form',content),f=form.elements,prices=find('.product-prices',form);
   for(const [k,v] of Object.entries({type:p?.type||'gift',name:copy?p.name.slice(0,77)+' 복제':p?.name||'',
    distribution:p?.distribution||'shop',currency:p?.currency||'G',uiMode:p?.uiMode||'dark',description:p?.description||'',value:p?.value??''}))f[k].value=v;
   f.eventOnly.checked=!!p?.eventOnly;
   const readType=()=>f.type.value;
   const refreshAsset=locked?null:bindAssetFields(form,readType,{
    optional:edit?'현재 적용 에셋 유지':copy&&p.activeVersion?'기존 적용 버전을 검수 후보로 복제':'나중에 등록',
    mode:edit||copy?'':'static'
   });
   const draftPrices={...p?.options};
   const shop=()=>f.distribution.value==='shop';
   const drawPrices=()=>{
    for(const input of all('input[type=number]',prices))draftPrices[input.name.slice(6)]=input.value;
    const gift=readType()==='gift';
    if(!gift)f.currency.value='G';
    f.currency.disabled=edit||!gift;
    f.uiMode.closest('label').hidden=readType()!=='theme';
    f.value.closest('label').hidden=shop();
    prices.hidden=gift&&!shop();
    if(shop()){
     prices.innerHTML=(gift?['unit']:['P7D','P1M','P3M']).map(k=>field(k==='unit'?'판매 가격':periods[k]+' 판매 가격',
      'price_'+k,'number','min="1" max="100000" '+(gift?'required ':'')+'value="'+e(draftPrices[k]||'')+'"')).join('');
    }else{
     prices.innerHTML=gift?'':'<fieldset class="product-span"><legend>사용할 이용 옵션</legend><div class="product-actions">'+
      ['P7D','P1M','P3M','PERMANENT'].map(k=>'<label class="product-check"><input type="checkbox" name="period" value="'+k+'"'+
       (draftPrices[k]!=null&&draftPrices[k]!==''?' checked':'')+'> '+periods[k]+'</label>').join('')+'</div></fieldset>';
    }
   };
   f.type.onchange=()=>{drawPrices();refreshAsset?.();};
   f.distribution.onchange=drawPrices;
   drawPrices();
   form.onsubmit=event=>{
    event.preventDefault();
    const value=!shop()&&f.value.value!==''?Number(f.value.value):null;
    const previous=p?.distribution==='grant'&&value===(p.value??null)?p.options:{};
    const options=shop()?Object.fromEntries(all('input',prices).filter(x=>x.value).map(x=>[x.name.slice(6),Number(x.value)])):
     readType()==='gift'?(Object.hasOwn(previous,'unit')?{unit:previous.unit}:{}):
      Object.fromEntries(all('[name=period]:checked',prices).map(x=>[x.value,previous[x.value]??value??0]));
    const body={action:copy?'copy':edit?'edit':'create',type:readType(),currency:f.currency.value,distribution:f.distribution.value,
     name:f.name.value,description:f.description.value,eventOnly:f.eventOnly.checked,uiMode:f.uiMode.value,value,options};
    const files=f.mode?.value?assetData(form):null;
    void write(p,body,form,files);
   };
  }

  async function send(path,body,owner,pending){
   if(state.saving)return null;
   const buttons=all('button',dialog),restore=buttons.map(b=>b.disabled),out=find('[role=status]',content);
   const multipart=body instanceof FormData;
   const fingerprint=multipart?JSON.stringify([...body].map(([k,v])=>[k,typeof v==='string'?v:[v.name,v.size,v.lastModified]])):JSON.stringify(body);
   const previous=state.attempts.get(owner),key=previous?.fingerprint===fingerprint?previous.key:crypto.randomUUID();
   state.attempts.set(owner,{fingerprint,key});
   if(multipart)body.set('request_id',key);else body=JSON.stringify({...body,request_id:key});
   state.saving=true;buttons.forEach(b=>b.disabled=true);if(out)out.textContent=pending;
   try{const r=await api(path,{method:'POST',body});state.attempts.delete(owner);state.dirty=false;return r;}
   catch(error){if(out?.isConnected)out.textContent=error.message;return null;}
   finally{state.saving=false;buttons.forEach((b,i)=>b.disabled=restore[i]);}
  }
  async function write(p,body,owner=content,files=null){
   if(p)body={...body,revision:p.revision};
   if(files)files.set('definition',JSON.stringify(body));
   const saved=await send(p?url(p.id):root,files??body,owner,files?'이미지 검사 및 버전 등록을 진행하고 있습니다.':'변경을 저장하고 있습니다.');
   if(!saved)return;
   toast(files?'상품과 에셋 검수 후보를 저장했습니다.':'상품 변경을 저장했습니다.');
   void list();
   await detail(saved.id);
   if(saved.version_id&&dialog.open&&state.detail?.product.id===saved.id)await version(saved.version_id);
  }
  function assetFields(){
   return '<fieldset><legend>실제 적용 에셋</legend><div class="product-form-grid">'+select('에셋 유형','mode',{})+
    field('버전','asset_version','text','maxlength="42" placeholder="1.0.0"')+
    '</div><p class="management-meta product-hint"></p><div class="product-form-grid product-files"></div></fieldset>';
  }
  function bindAssetFields(form,readType,{optional,mode:initial='static'}={}){
   const {mode,asset_version:label}=form.elements,files=find('.product-files',form),hint=find('.product-hint',form);
   const draw=()=>{
    label.closest('label').hidden=!mode.value;
    label.required=!!mode.value;
    label.disabled=!mode.value;
    if(!mode.value){files.replaceChildren();hint.textContent='';return;}
    const type=readType();
    if(mode.value==='layered'){
     const renderer={gift:'gift-overlay',frame:'frame-overlay',theme:'room-overlay'}[type];
     files.innerHTML=file('package',true,'.zip,application/zip');
     hint.textContent=renderer+' v1 매니페스트와 역할별 이미지를 담은 ZIP을 등록해 주세요. 최대 8 MB입니다.';
    }else{
     files.innerHTML=(type==='theme'?file('desktop',true)+file('mobile',true)+file('app')+file('roomCard'):
      file('base',true,mode.value==='animated'?'image/webp,image/gif':undefined,type==='frame'?'투명 테두리 이미지':'선물 본체 이미지')+
      (mode.value==='animated'?file('fallback',true):''))+file('thumbnail');
     hint.textContent='파일당 최대 5 MB입니다. 대표 이미지를 비워 두면 등록한 에셋에서 자동 생성합니다.';
    }
   };
   const setType=()=>{
    const chosen=mode.options.length?mode.value:initial;
    const choices=readType()==='theme'?{static:modes.static,layered:modes.layered}:modes;
    mode.innerHTML=opts(optional?{'':optional,...choices}:choices);
    mode.value=chosen in choices||!chosen&&optional?chosen:'static';
    draw();
   };
   mode.onchange=draw;setType();
   return setType;
  }
  function assetData(form){
   const files=new FormData();
   for(const [name,value] of new FormData(form)){
    if(name==='mode'||name==='asset_version'||(Object.hasOwn(roles,name)&&value instanceof File&&value.size))files.set(name,value);
   }
   return files;
  }
  function upload(p){
   if(p.id==='theme_christmas'){modal('에셋 등록','<p>크리스마스 테마 에셋은 전용 렌더러 빌드와 함께 검수합니다.</p>'+btn('상세로','back'));return;}
   modal('에셋 등록','<form class="product-form">'+assetFields()+actions(submit('검사 후 등록')+btn('상세로','back'))+message+'</form>');
   const form=find('form',content);
   bindAssetFields(form,()=>p.type);
   form.onsubmit=async event=>{
    event.preventDefault();const saved=await send(url(p.id)+'/versions',assetData(form),form,'파일을 검사하고 있습니다.');
    if(saved){await detail(p.id);await version(saved.version_id);}
   };
  }
  function link(p){
   modal('검증 에셋 연결','<form class="product-form"><p>같은 유형의 공개 적용 버전을 연결합니다.</p><div class="product-form-grid">'+
    field('원본 상품 ID','source_id','text','required maxlength="80"')+field('공개 버전 ID','version_id','text','required maxlength="36"')+
    field('새 버전 이름','asset_version','text','required maxlength="42" placeholder="1.0.0"')+'</div>'+
    actions(submit('연결')+btn('상세로','back'))+message+'</form>');
   const form=find('form',content);
   form.onsubmit=event=>{event.preventDefault();void write(p,{action:'link',...Object.fromEntries(new FormData(form))},form);};
  }
  async function version(id){
   const p=state.detail.product,token=++state.detailToken;
   modal('에셋 버전','<p role="status">에셋과 검수 정보를 확인하고 있습니다.</p>');
   try{
    const data=await api(url(p.id)+'/versions/'+encodeURIComponent(id));
    if(token!==state.detailToken)return;state.version=data;paintVersion(p,data);
   }catch(error){if(token===state.detailToken)modal('에셋 버전','<p role="alert">'+e(error.message)+'</p>'+btn('상세로','back'));}
  }
  function paintVersion(p,{version:v,review}){
   const fileList=(files,original)=>Object.entries(files).map(([role,item])=>
    '<li><a href="'+e(item.url)+'" target="_blank" rel="noopener">'+e(roles[role])+'</a><small>'+
    e((original?'':item.width+'×'+item.height+' · '+item.frames+'프레임'+(item.alpha?' · 투명':'')+' · ')+size(item.size))+'</small></li>').join('');
   const marks={pending:'미검수',failed:'불합격',stale:'재검수 필요',passed:'통과'};
   const reports=Object.entries(platforms).map(([key,label])=>{
    const records=review.items.filter(item=>item.platform===key);
    return '<details class="product-review-platform"><summary>'+label+' · '+records.filter(item=>item.status==='passed').length+' / '+records.length+
     (review.builds[key]?'':' · 대상 빌드 미지정')+'</summary><ul class="product-review-list">'+records.map(r=>'<li><div><strong>'+e(surfaces[r.surface])+'</strong><small>'+marks[r.status]+'</small></div>'+
     (r.report?'<div class="product-scores" title="'+e(r.report.condition)+'">'+r.report.samples.map(s=>'<span>'+s.ms+'ms · '+(s.pixelMatch*100).toFixed(2)+'% / '+s.ssim.toFixed(3)+
      ' <a href="'+e(s.actual.url)+'" target="_blank" rel="noopener">실제</a> <a href="'+e(s.preview.url)+'" target="_blank" rel="noopener">미리보기</a></span>').join('')+'</div>':'')+
     (state.detail.can_edit&&r.build?btn('캡처 검수','review','data-platform="'+key+'" data-surface="'+e(r.surface)+'"'):'')+'</li>').join('')+'</ul></details>';
   }).join('');
   const attr='data-version="'+e(v.id)+'"';
   const transition=state.detail.can_edit&&!p.archived&&p.activeVersion!==v.id?
    (review.ready?btn('에셋 적용','activate',attr):'')+(v.published_at?btn('이 버전으로 복원','rollback',attr):''):'';
   modal('에셋 '+v.label,'<p>'+e(modes[v.mode]+' · '+v.renderer)+'</p><p class="management-meta">버전 ID '+e(v.id)+'</p>'+
    '<details><summary>SHA-256</summary><code>'+e(v.hash)+'</code></details>'+
    actions(btn('상세로','back')+btn('적용 미리보기','preview',attr)+transition)+message+
    '<section class="product-subsection"><h2>서비스 파일</h2><ul class="product-versions">'+fileList(v.files,false)+'</ul>'+
    '<details><summary>제작 원본</summary><ul class="product-versions">'+fileList(v.originals,true)+'</ul></details></section>'+
    '<section class="product-subsection"><h2>실제 화면 검수</h2>'+reports+'</section>');
  }
  function reviewForm(p,platform,surface){
   const {version:v,review}=state.version;
   const frames=review.plan.find(item=>item.surface===surface).frames;
   const inputs=Array.from({length:frames},(_,i)=>'<fieldset><legend>캡처 '+(i+1)+'</legend><div class="product-form-grid">'+
    field('시점 (ms)','ms'+i,'number','required min="0" max="999999" value="'+(i*500)+'"')+
    field('실제 화면','actual'+i,'file','required accept="image/png,image/webp"')+
    field('적용 미리보기','preview'+i,'file','required accept="image/png,image/webp"')+'</div></fieldset>').join('');
   modal('화면 검수','<form class="product-form"><p>'+e(platforms[platform]+' · '+surfaces[surface])+'</p>'+
    '<p class="management-meta">측정 대상 빌드 '+e(review.builds[platform])+'</p>'+
    '<label>동일 캡처 조건<textarea name="condition" required rows="3" minlength="15" maxlength="1400" placeholder="기기, 해상도·DPR, 폰트, 패널, 품질, 데이터 및 애니메이션 시드"></textarea></label>'+
    select('육안 및 동작 확인','visual',{'':'선택',pass:'통과',fail:'불합격'},'required')+inputs+
    actions(submit('비교 및 기록')+btn('버전으로','version','data-version="'+e(v.id)+'"'))+message+'</form>');
   const form=find('form',content);
   form.onsubmit=async event=>{
    event.preventDefault();const body=new FormData(form);
    for(const [k,val] of Object.entries({platform,surface,build:review.builds[platform],revision:p.revision}))body.set(k,val);
    if(await send(url(p.id)+'/versions/'+v.id+'/review',body,form,'캡처 일치도를 측정하고 있습니다.'))await version(v.id);
   };
  }
  function preview(p,versionId){
   modal('상품 적용 미리보기','<div class="product-filters">'+select('플랫폼','platform',platforms)+
    select('화면','surface',Object.fromEntries(screenSets[p.type].map(key=>[key,surfaces[key]])))+'</div>'+message+
    '<div class="product-preview-stage"></div>'+actions(versionId?btn('버전으로','version','data-version="'+e(versionId)+'"'):btn('상세로','back')));
   const stage=find('.product-preview-stage'),platform=find('[name=platform]',content),surface=find('[name=surface]',content),info=find('[role=status]',content);
   const sync=()=>{
    stage.replaceChildren();
    const target=platform.value,screen=surface.value,native=target==='android'||target==='ios';
    info.textContent=native?'브라우저 시뮬레이션입니다. 실제 앱 화면은 해당 기기에서 열어 검수해 주세요.':'웹 서비스 구성 요소 · 읽기 전용';
    if(native){
     const controls=document.createElement('div');controls.className='product-native-actions';
     const button=document.createElement('button');button.className='small-button';button.type='button';button.textContent='실제 앱 링크 만들기';
     const notice=document.createElement('span');notice.setAttribute('role','status');
     controls.append(button,notice);stage.append(controls);
     button.onclick=async()=>{
      button.disabled=true;
      try{
       const result=await api('/api/admin/product-native-review',{method:'POST',
        body:JSON.stringify({id:p.id,version:versionId||null,surface:screen,platform:target})});
       if(!button.isConnected)return;
       const open=document.createElement('a');open.className='small-button';open.href=result.open_url;open.textContent=platforms[target]+' 앱에서 열기';
       button.replaceWith(open);notice.textContent='링크는 10분 동안 유효합니다.';open.focus();
      }catch(error){if(button.isConnected){notice.textContent=error.message;button.disabled=false;}}
     };
    }
    const iframe=document.createElement('iframe');
    iframe.title=platforms[target]+' '+surfaces[screen]+(native?' 시뮬레이션':' 미리보기');
    iframe.className=target==='desktop'?'desktop':'mobile';
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin');
    iframe.src='/api/admin/product-preview?'+new URLSearchParams({id:p.id,version:versionId||'',surface:screen});stage.append(iframe);
   };
   platform.onchange=surface.onchange=sync;sync();
  }

  function outcomes(items,labels){
   return Object.entries(labels).map(([status,label])=>{
    const group=items.filter(item=>item.status===status);
    if(!group.length)return '';
    return '<section class="product-operation-group"><h2>'+label+' '+num(group.length)+'개</h2><ul>'+
     group.map(item=>'<li><strong>'+e(item.name)+'</strong><small>'+e(item.id)+'</small>'+
      (item.reason?'<span>'+e(item.reason)+'</span>':'')+'</li>').join('')+'</ul></section>';
   }).join('');
  }
  async function confirmOperation(action,products){
   hideMenu();
   const token=++state.detailToken,title=operationNames[action];
   state.operation=null;
   modal(title+' 확인','<p role="status">상품 상태와 이력을 확인하고 있습니다.</p>');
   const items=products.map(({id,revision})=>({id,revision}));
   try{
    const report=await api(root+'/operations',{method:'POST',body:JSON.stringify({action,items,preview:true})});
    if(token!==state.detailToken)return;
    const confirmed_ids=report.items.filter(item=>item.status==='eligible').map(item=>item.id);
    const count=confirmed_ids.length;
    state.operation={action,items,confirmed_ids};
    const irreversible=action==='delete'?'<p class="product-delete-warning">삭제한 상품은 복구할 수 없습니다.</p>':'';
    modal(title+' 확인',irreversible+
     outcomes(report.items,{eligible:action==='delete'?'삭제 가능':'실행 대상',excluded:action==='delete'?'삭제 불가':'제외',failed:'다시 확인할 상품'})+
     actions((count?btn(num(count)+'개 '+title,'apply-operation',action==='delete'?'data-tone="danger"':'data-tone="primary"'):'')+
      btn(count?'취소':'닫기','close'))+message);
   }catch(error){
    if(token===state.detailToken)modal(title+' 확인','<p role="alert">'+e(error.message)+'</p>'+btn('닫기','close'));
   }
  }
  async function applyOperation(){
   const pending=state.operation;
   if(!pending?.confirmed_ids.length)return;
   const saved=await send(root+'/operations',pending,content,'상품 변경을 진행하고 있습니다.');
   if(!saved)return;
   state.operation=null;
   modal(operationNames[pending.action]+' 결과',outcomes(saved.items,{success:'성공',failed:'실패',excluded:'제외'})+actions(btn('닫기','close')));
   void list();
  }

  box.addEventListener('click',event=>{
   const b=event.target.closest('button[data-product-action]');
   if(!b||b.disabled||state.saving)return;
   const a=b.dataset.productAction,row=state.products.get(b.dataset.id),p=state.detail?.product;
   if(a==='close'){close();return;}
   if(a==='type'){
    state.archived=b.dataset.type==='archived';
    state.type=state.archived?'':b.dataset.type;
    filters.elements.sale.closest('label').hidden=state.archived;
    state.page=1;
    for(const tab of all('[data-product-action=type]'))tab.setAttribute('aria-pressed',String(tab===b));
    void list();return;
   }
   if(a==='page'){state.page=Number(b.dataset.page);void list();return;}
   if(a==='reload'){void list();return;}
   if(a==='clear-selection'){clearSelection();find('[data-select-all]',tableHost)?.focus();return;}
   if(a==='apply-operation'){void applyOperation();return;}
   if(a==='bulk'){void confirmOperation(b.dataset.operation,[...state.selected].map(id=>state.products.get(id)));return;}
   if(a==='new'){editor(null);return;}
   if(a==='detail'){void detail(b.dataset.id);return;}
   if(row){
    if(a==='more'){openMenu(row,b);return;}
    hideMenu();
    if(a==='edit'){void detail(row.id,true);return;}
    if(a==='copy'){editor(row,true);return;}
    if(a==='operation'){void confirmOperation(b.dataset.operation,[row]);return;}
    if(a==='dispatch'||a==='dispatch-history'){
     jumpToGrant({product_id:row.id,history:a==='dispatch-history'});return;
    }
   }
   if(!p||(['back','version'].includes(a)&&!warnClose()))return;
   if(a==='back'){void detail(p.id);return;}
   if(a==='edit'){editor(p);return;}
   if(a==='upload'){upload(p);return;}
   if(a==='link'){link(p);return;}
   if(a==='version'){void version(b.dataset.version);return;}
   if(a==='preview'){preview(p,b.dataset.version);return;}
   if(a==='review'){reviewForm(p,b.dataset.platform,b.dataset.surface);return;}
   if(a==='restore')void write(p,{action:'rollback',version_id:null});
   if(a==='activate'||a==='rollback')void write(p,{action:a,version_id:b.dataset.version});
  });
  return {open:list};
 }
 window.AifectAdminProducts={mount};
})();
