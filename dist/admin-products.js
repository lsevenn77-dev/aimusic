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
 const assetRole=role=>roles[role]||roles[role.replace(/Low$/,'')]+' · 경량';
 const saleLabel=p=>p.deletePendingAt?'삭제 대기':p.archived?'보관':p.distribution==='grant'?'발송 전용':p.sale?'판매 중':p.legacy||p.activeVersion?'판매 중지':'초안';
 const operationNames={sale_resume:'판매 재개',sale_stop:'판매 중지',archive:'보관',unarchive:'보관 해제',
  delete_request:'삭제 대기',delete_cancel:'삭제 대기 해제',delete:'영구 삭제'};
 const authorLinks='<p class="product-authoring"><a href="/product-authoring/AIFECT_Product_Production_Standard_v2.0.md" download>상품 제작 가이드</a> · '+
  '<a href="/product-authoring/AIFECT_Asset_Authoring_Kit_v2.0.zip" download>스키마 및 샘플 ZIP</a> <small>표준 2.0.0</small></p>';
 const currencies={G:['골드','/assets/shop/coin-g.svg'],S:['실버','/assets/shop/coin-s.svg']};
 const num=n=>new Intl.NumberFormat('ko-KR').format(n);
 const kst=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
 const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
 const root='/api/admin/products', url=id=>root+'/'+encodeURIComponent(id);

 function mount(box,{api,esc:e,toast,jumpToGrant}){
  if(!box)return null;
  const find=(sel,el=box)=>el.querySelector(sel), all=(sel,el=box)=>[...el.querySelectorAll(sel)];
  const state={type:'',archived:false,deletion:false,page:1,listToken:0,detailToken:0,dirty:false,saving:false,
   attempts:new WeakMap(),selected:new Set(),products:new Map(),canEdit:false,canDispatch:false};
  const opts=values=>Object.entries(values).sort(([a],[b])=>Number(b==='')-Number(a==='')).map(([v,label])=>'<option value="'+e(v)+'">'+e(label)+'</option>').join('');
  const field=(label,name,type,attr='')=>'<label>'+e(label)+'<input type="'+type+'" name="'+name+'" '+attr+'></label>';
  const select=(label,name,values,attr='')=>'<label>'+e(label)+'<select name="'+name+'" '+attr+'>'+opts(values)+'</select></label>';
  const btn=(label,action,attr='')=>'<button class="small-button" type="button" data-product-action="'+action+'" '+attr+'>'+e(label)+'</button>';
  const iconBtn=(label,action,attrs,path)=>'<button class="small-button product-icon-action" type="button" data-product-action="'+action+
   '" '+attrs+' aria-label="'+label+'" title="'+label+'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg></button>';
  const showIcon='<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>';
  const downIcon='<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>';
  const submit=label=>'<button class="primary-button product-primary" type="submit">'+e(label)+'</button>';
  const actions=html=>'<div class="product-actions">'+html+'</div>';
  const message='<p class="product-message" role="status"></p>';
  const img=(path,w)=>path?'<img src="'+e(path)+'" alt="" loading="lazy" decoding="async" width="'+w+'" height="'+w+'">':'';
  const warnClose=()=>!state.dirty||window.confirm('작성 중인 내용을 닫으시겠습니까?');
  const dataId=p=>'data-id="'+e(p.id)+'"';
  const disabled=reason=>reason?' disabled title="'+e(reason)+'" aria-description="'+e(reason)+'"':'';
  const formatPrice=(value,currency)=>{
   const [label,src]=currencies[currency];
   return '<span class="product-price"><img src="'+src+'" alt="'+label+'" width="16" height="16">'+num(value)+'</span>';
  };

  box.innerHTML='<div class="section-heading product-heading"><h1>상품 관리</h1>'+
   '<div class="product-heading-actions"><button class="primary-button product-primary" type="button" data-product-action="new" hidden>상품 등록</button>'+
   btn('ZIP 일괄 등록','batch-import','hidden')+'</div></div>'+
   '<div class="product-tabs" role="group" aria-label="상품 유형과 상태">'+[['','전체'],...Object.entries(kinds),['archived','보관'],['deletion','삭제 대기']].map(([v,label])=>
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
   state.cancelUpload?.();
   state.cancelUpload=null;
   state.dirty=false;find('#product-dialog-title').textContent=title;content.innerHTML=html;
   if(!dialog.open)dialog.showModal();
   content.scrollTop=0;
  }
  function close(){
   if(state.saving||!warnClose())return;
   state.cancelUpload?.();state.cancelUpload=null;
   state.detailToken++;state.dirty=false;state.operation=null;dialog.close();content.replaceChildren();
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  content.addEventListener('input',event=>{if(event.target.closest('form'))state.dirty=true;});
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  document.addEventListener('aifect-admin-locked',()=>{
   state.cancelUpload?.();state.cancelUpload=null;state.batch=null;
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
   const available=state.deletion?['delete_cancel','delete']:state.archived?['unarchive','delete_request']:['sale_resume','sale_stop','archive','delete_request'];
   selectionBar.innerHTML='<strong role="status">'+num(total)+'개 선택</strong>'+btn('선택 해제','clear-selection')+
    btn('업로드 ZIP 일괄 다운로드','bulk-download',total>10?'disabled title="최대 10개"':'')+
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
   menu.innerHTML=p.deletePendingAt?operation('delete_cancel',operationNames.delete_cancel)+
    btn(operationNames.delete,'operation',dataId(p)+' data-operation="delete" data-tone="danger"'):
    (p.archived?'':operation(sale,operationNames[sale],saleReason))+
    btn('상품 복제','copy',dataId(p))+operation(p.archived?'unarchive':'archive',p.archived?'보관 해제':'상품 보관')+
    '<hr>'+btn('삭제 대기','operation',dataId(p)+' data-operation="delete_request" data-tone="danger"');
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
     const dispatchReason=p.deletePendingAt?'삭제 대기 상품은 발송할 수 없습니다.':p.archived?'보관된 상품은 발송할 수 없습니다.':
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
       iconBtn('적용 미리보기','quick-preview',attrs+(p.asset?'':' disabled'),showIcon)+
       iconBtn(p.asset?.originalUpload?'업로드 ZIP 다운로드':'업로드 ZIP 미보유','quick-download',attrs+(p.asset?.originalUpload?'':' disabled'),downIcon)+
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
   if(state.deletion){params.set('deletion','1');params.delete('sale');}
   tableHost.inert=true;
   result.textContent='상품을 불러오고 있습니다.';
   try{
    const d=await api(root+'?'+params);if(token!==state.listToken)return;
    state.page=d.page;state.canEdit=d.can_edit;state.canDispatch=d.can_dispatch;
    state.products=new Map(d.products.map(p=>[p.id,p]));
    find('[data-product-action=new]').hidden=!d.can_edit;
    find('[data-product-action=batch-import]').hidden=!d.can_edit;
    result.textContent=(state.deletion?'삭제 대기 상품 ':state.archived?'보관 상품 ':'상품 ')+num(d.total)+'개';tableHost.innerHTML=items(d.products);
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
  const sourceLabel=v=>({confirmed:'제작 원본 보유',upload_only:'업로드 ZIP 보유 · 제작 원본 미보유',
   legacy_files:'이전 규격 파일 · 제작 원본 미확인',missing:'제작 원본 미확인'})[v?.source_status]||'제작 원본 미확인';
  const downloadLink=(label,path)=>path?'<a class="small-button" href="'+e(path)+'" download>'+label+'</a>':'';
  const downloads=v=>downloadLink(v?.source_status==='confirmed'?'원본 ZIP 다운로드':'업로드 ZIP 다운로드',v?.downloads?.original)+
   downloadLink('운영 ZIP 다운로드',v?.downloads?.operating);
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
    ' <strong>실제 적용 검수</strong> '+e(reviewLabel)+' <strong>원본</strong> '+sourceLabel(current)+'</p>'+
    actions((p.asset?btn('적용 미리보기','preview'):'')+
     downloads(current)+(edit&&!p.archived&&!p.deletePendingAt?btn('에셋 등록/교체','upload')+(p.id==='theme_christmas'?'':btn('검증 에셋 연결','link')):'')+
     (edit&&!p.archived&&!p.deletePendingAt&&!p.grant&&review?.ready?btn('관리자 발송 허용','dispatch-enable'):'')+
     (p.legacy&&p.activeVersion&&edit&&!p.archived&&!p.deletePendingAt?btn('기존 에셋으로 복원','restore'):'') )+files+'</section>'+message);
  }

  function editor(p,copy=false,prepared=null){
   const edit=!!p&&!copy,locked=edit&&(p.archived||p.deletePendingAt||p.id==='theme_christmas');
   const current=edit&&state.detail?.versions.find(v=>v.id===p.activeVersion);
   modal(edit?'상품 수정':'상품 등록','<form class="product-form"><div class="product-form-grid">'+select('상품 유형','type',kinds,edit?'disabled':'')+
    field('상품명','name','text','required maxlength="80"')+select('상품 구분','distribution',{shop:'상점 판매',grant:'발송 전용'})+
    select('통화','currency',{G:'골드',S:'실버'})+'<div class="product-form-grid product-prices"></div>'+
    field('표시 가치 (선택)','value','number','min="0" max="100000"')+select('방 패널','uiMode',{'':'선택',dark:'블랙',light:'화이트'})+
    '<label class="product-check"><input name="eventOnly" type="checkbox"> 이벤트 한정</label>'+
    '<label class="product-span">상품 설명<textarea name="description" rows="2" maxlength="400"></textarea></label></div>'+
    (edit?'<section class="product-subsection"><h2>현재 적용 에셋</h2><div class="product-overview">'+img(p.asset?.files.thumbnail,56)+
     '<p>'+e(current?.label||(p.legacy?'기존 운영 에셋':'미등록'))+' · '+sourceLabel(current)+' · '+
     (state.detail?.active_review?.ready?'검수 완료':'검수 기록 확인 필요')+'</p></div>'+
     actions((p.asset?btn('미리보기','preview'):'')+downloads(current)+(state.detail?.versions.length?btn('버전 이력','back'):''))+'</section>':'')+
    (locked?'<p class="management-meta">'+(p.archived||p.deletePendingAt?'에셋을 교체하려면 보관 또는 삭제 대기를 해제해 주세요.':'크리스마스 테마 에셋은 전용 렌더러 빌드와 함께 검수합니다.')+'</p>':assetFields())+
    actions(submit(edit?'변경 저장':'초안 저장')+btn(edit?'상세로':'취소',edit?'back':'close')+(prepared?btn('일괄 목록','batch-back'):''))+message+'</form>');
   const form=find('form',content),f=form.elements,prices=find('.product-prices',form);
   for(const [k,v] of Object.entries({type:p?.type||'gift',name:copy?p.name.slice(0,77)+' 복제':p?.name||'',
    distribution:p?.distribution||'shop',currency:p?.currency||'G',uiMode:p?.uiMode||'',description:p?.description||'',value:p?.value??''}))f[k].value=v;
   f.eventOnly.checked=!!p?.eventOnly;
   const readType=()=>f.type.value;
   const draftPrices={...p?.options};
   const shop=()=>f.distribution.value==='shop';
   const drawPrices=()=>{
    for(const input of all('input[type=number]',prices))draftPrices[input.name.slice(6)]=input.value;
    const gift=readType()==='gift';
    if(!gift)f.currency.value='G';
    f.currency.disabled=edit||!gift;
    f.uiMode.closest('label').hidden=readType()!=='theme';f.uiMode.required=readType()==='theme';
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
   f.type.onchange=drawPrices;
   f.distribution.onchange=drawPrices;
   drawPrices();
   const upload=locked?null:bindAssetFields(form,prepared,inspection=>{
    if(edit||copy)return;
    const manifest=inspection.manifest;
    f.type.value=manifest.productType;drawPrices();
    if(!f.name.value)f.name.value=manifest.metadata?.name||'';
    if(!f.description.value)f.description.value=manifest.metadata?.description||'';
    if(!f.uiMode.value&&manifest.metadata?.uiMode)f.uiMode.value=manifest.metadata.uiMode;
   });
   form.onsubmit=event=>{
    event.preventDefault();
    const value=!shop()&&f.value.value!==''?Number(f.value.value):null;
    const previous=p?.distribution==='grant'&&value===(p.value??null)?p.options:{};
    const options=shop()?Object.fromEntries(all('input',prices).filter(x=>x.value).map(x=>[x.name.slice(6),Number(x.value)])):
     readType()==='gift'?(Object.hasOwn(previous,'unit')?{unit:previous.unit}:{}):
      Object.fromEntries(all('[name=period]:checked',prices).map(x=>[x.value,previous[x.value]??value??0]));
    const body={action:copy?'copy':edit?'edit':'create',type:readType(),currency:f.currency.value,distribution:f.distribution.value,
     name:f.name.value,description:f.description.value,eventOnly:f.eventOnly.checked,uiMode:f.uiMode.value,value,options};
    const files=upload?.data(readType(),edit?p.id:null);
    if(files===false)return;
    void write(p,body,form,files,prepared);
   };
  }

  async function send(path,body,owner,pending){
   if(state.saving)return null;
   const buttons=all('button',dialog),restore=buttons.map(b=>b.disabled),out=find('.product-message',content)||find('[role=status]',content);
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
  async function write(p,body,owner=content,files=null,prepared=null){
   if(p)body={...body,revision:p.revision};
   if(files)files.set('definition',JSON.stringify(body));
   const saved=await send(p?url(p.id):root,files??body,owner,files?'이미지 검사 및 버전 등록을 진행하고 있습니다.':'변경을 저장하고 있습니다.');
   if(!saved)return;
   if(prepared)prepared.saved=saved;
   toast(files?'상품과 에셋 검수 후보를 저장했습니다.':'상품 변경을 저장했습니다.');
   void list();
   await detail(saved.id);
   if(saved.version_id&&dialog.open&&state.detail?.product.id===saved.id)await version(saved.version_id);
  }
  function assetFields(){
   return '<fieldset class="product-package"><legend>상품 ZIP</legend>'+authorLinks+
    '<label class="product-drop">ZIP을 끌어 놓거나 선택해 주세요. 최대 8 MiB<input type="file" name="zip_package" accept=".zip,application/zip"></label>'+
    '<progress max="100" hidden aria-label="ZIP 업로드 진행률"></progress><p class="product-zip-status" role="status"></p>'+
    '<button type="button" class="small-button product-zip-clear" hidden>ZIP 제거</button><div class="product-zip-result"></div></fieldset>';
  }
  function inspectionRequest(file,signal,progress=()=>{}){
   return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest(),form=new FormData();
    form.set('package',file);request.open('POST',root+'/inspect-package');request.responseType='json';
    request.upload.onprogress=event=>progress(event.lengthComputable?100*event.loaded/event.total:null);
    request.onload=()=>request.status===200?resolve(request.response):reject(new Error(request.response?.error||'ZIP을 검사할 수 없습니다.'));
    request.onerror=()=>reject(new Error('연결을 확인한 뒤 ZIP을 다시 선택해 주세요.'));
    request.onabort=()=>reject(new DOMException('취소','AbortError'));
    signal.addEventListener('abort',()=>request.abort(),{once:true});
    request.send(form);
   });
  }
  function packageSummary(value){
   const m=value.manifest, source=m.originals.length?'제작 원본 '+m.originals.length+'개':sourceLabel({source_status:'upload_only'});
   return '<p><strong>'+e(kinds[m.productType])+'</strong> · '+e(m.assetVersion)+' · '+e(modes[m.renderMode])+' · '+e(source)+'</p>'+
    '<p class="management-meta">'+e(m.renderer.id)+' v'+e(m.renderer.version)+' · '+e(size(value.size))+' · '+m.files.length+'개 파일'+
    (m.productId?' · 대상 '+e(m.productId):'')+(value.reviewOnly?' · 검토 전용':'')+'</p>'+
    '<details><summary>파일 역할과 실제 크기</summary><ul class="product-versions">'+fileList(value.files,false,false)+'</ul></details>';
  }
  function bindAssetFields(form,prepared,onRecognized=()=>{}){
   const wrapper=find('.product-package',form),input=find('input',wrapper),progress=find('progress',wrapper),
    out=find('[role=status]',wrapper),result=find('.product-zip-result',wrapper),clearButton=find('.product-zip-clear',wrapper);
   let current=null,inspection=null,request=null,thumbnails=[];
   function clearAssets(){thumbnails.forEach(url=>URL.revokeObjectURL(url));thumbnails=[];result.replaceChildren();}
   function reset(){request?.abort();request=null;clearAssets();}
   const clear=(clearInput=true)=>{reset();current=null;inspection=null;if(clearInput)input.value='';out.textContent='';clearButton.hidden=true;progress.hidden=true;};
   state.cancelUpload=reset;
   async function accept(file,existing,keepInput=false){
    clear(!keepInput);if(!file)return;
    current=file;state.dirty=true;clearButton.hidden=false;out.textContent=file.name+' · 서버 검증 중';
    const controller=request=new AbortController();
    try{
     if(file.size>8*1024*1024)throw Error('ZIP은 8 MiB 이하여야 합니다.');
     const inspected=existing??await inspectionRequest(file,controller.signal,percent=>{
      progress.hidden=false;if(percent===null)progress.removeAttribute('value');else progress.value=percent;
      if(percent===100)out.textContent=file.name+' · 이미지와 매니페스트 확인 중';
     });
     if(controller.signal.aborted)return;
     inspection=inspected;out.textContent=file.name+' · ZIP 검증 통과';
     onRecognized(inspected);result.innerHTML=packageSummary(inspected);
     const archive=AifectProductZip.openProductZip(new Uint8Array(await file.arrayBuffer()));
     const roles=inspected.manifest.productType==='theme'?['thumbnail','desktop','mobile','roomCard']:['thumbnail'];
     const figures=document.createElement('div');figures.className='product-zip-images';
     for(const role of roles){
      const bytes=await archive.read(inspected.manifest.assets[role]);
      if(controller.signal.aborted)return;
      const blob=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));thumbnails.push(blob);
      const figure=document.createElement('figure');
      figure.innerHTML='<a href="'+e(blob)+'" target="_blank" rel="noopener">'+img(blob,96)+'</a><figcaption>'+e(assetRole(role))+'</figcaption>';
      figures.append(figure);
     }
     if(!controller.signal.aborted)result.prepend(figures);
    }catch(error){if(!controller.signal.aborted)out.textContent=error.message;}
    finally{if(request===controller)progress.hidden=true;}
   }
   input.onchange=()=>void accept(input.files[0],undefined,true);
   clearButton.onclick=()=>clear();
   wrapper.ondragover=event=>event.preventDefault();
   wrapper.ondrop=event=>{event.preventDefault();if(event.dataTransfer.files.length===1)void accept(event.dataTransfer.files[0]);else out.textContent='상품 ZIP 하나를 선택해 주세요.';};
   if(prepared)void accept(prepared.file,prepared.inspected);
   return {data(type,id,required=false){
    if(!current){if(required){out.textContent='상품 ZIP을 선택해 주세요.';return false;}return null;}
    if(!inspection){out.textContent='서버 검증이 끝난 상품 ZIP을 선택해 주세요.';return false;}
    if(inspection.manifest.productType!==type||inspection.manifest.productId&&inspection.manifest.productId!==id){
     out.textContent='ZIP의 상품 유형 또는 교체 대상 ID를 확인해 주세요.';return false;
    }
    const data=new FormData();data.set('package',current);return data;
   }};
  }
  function upload(p){
   if(p.id==='theme_christmas'){modal('에셋 등록','<p>크리스마스 테마 에셋은 전용 렌더러 빌드와 함께 검수합니다.</p>'+btn('상세로','back'));return;}
   modal('에셋 등록','<form class="product-form">'+assetFields()+actions(submit('검사 후 등록')+btn('상세로','back'))+message+'</form>');
   const form=find('form',content);
   const selection=bindAssetFields(form);
   form.onsubmit=async event=>{
    event.preventDefault();const data=selection.data(p.type,p.id,true);if(!data)return;
    const saved=await send(url(p.id)+'/versions',data,form,'파일을 확인하고 버전을 저장하고 있습니다.');
    if(saved){await detail(p.id);await version(saved.version_id);}
   };
  }
  function batchImport(reset=false){
   if(reset||!state.batch)state.batch=[];
   modal('ZIP 일괄 등록',authorLinks+
    '<label class="product-drop">최대 10개 상품 ZIP을 선택해 주세요. 각 상품의 정보를 확인하여 초안 또는 교체 버전을 등록합니다.'+
    '<input type="file" accept=".zip,application/zip" multiple></label>'+
    '<p class="product-message" role="status"></p>'+actions(btn('검사 중단','stop-batch','hidden'))+'<ul class="product-versions product-import-results"></ul>');
   const items=state.batch,drop=find('.product-drop',content),input=find('input',drop),out=find('.product-message',content),
    cancel=find('[data-product-action=stop-batch]',content),results=find('.product-import-results',content);
   let controller;
   state.cancelUpload=()=>controller?.abort();
   function render(){
    results.innerHTML=items.map((item,index)=>'<li><div><strong>'+e(item.file.name)+'</strong>'+
     (item.inspected?packageSummary(item.inspected):'<small>'+e(item.error||'검사 중')+'</small>')+'</div>'+
     (item.saved?btn('등록한 버전','batch-open','data-batch="'+index+'"'):
      item.inspected?btn(item.inspected.manifest.productId?'교체 대상 확인':'상품 초안 작성','batch-item','data-batch="'+index+'"'):'')+'</li>').join('');
   }
   render();
   async function selected(files){
    if(!files.length)return;
    if(files.length>10){out.textContent='상품 ZIP을 최대 10개 선택해 주세요.';return;}
    controller?.abort();
    const work=controller=new AbortController();
    input.disabled=true;cancel.hidden=false;items.length=0;render();
    try{
     const flattened=[];
     for(const file of files){
      if(work.signal.aborted)return;
      try{
       if(file.size>8*1024*1024)throw Error('상품 ZIP 또는 묶음은 8 MiB 이하여야 합니다.');
       const data=new Uint8Array(await file.arrayBuffer());
       let archive;
       try{archive=AifectProductZip.openProductZip(data);}catch{/* A bundle may have 8 MiB entries. */}
       if(archive?.files.has('manifest.json')){flattened.push(file);continue;}
       const bundle=AifectProductZip.openProductZip(data,{bundle:true}),names=[...bundle.files.keys()];
       if(names.some(name=>!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.zip$/i.test(name))||names.length+flattened.length>10)
        throw Error('묶음에는 루트에 개별 상품 ZIP만 넣어 주세요.');
       for(const name of names)flattened.push(new File([await bundle.read(name)],name,{type:'application/zip'}));
      }catch(error){items.push({file,error:error.message});}
     }
     if(flattened.length+items.length>10)throw Error('묶음을 포함해 상품 ZIP을 최대 10개 선택해 주세요.');
     for(const [i,file] of flattened.entries()){
      if(work.signal.aborted)break;
      const item={file};items.push(item);render();
      out.textContent=(i+1)+' / '+flattened.length+' · '+file.name+' 검사 중';
      try{item.inspected=await inspectionRequest(file,work.signal);}
      catch(error){item.error=work.signal.aborted?'검사가 중단되었습니다.':error.message;}
      if(out.isConnected)render();
     }
     if(out.isConnected)out.textContent=(work.signal.aborted?'검사를 중단했습니다. ':'')+'검증 '+items.filter(item=>item.inspected).length+'개 · 확인 필요 '+items.filter(item=>!item.inspected).length+'개';
    }catch(error){if(out.isConnected)out.textContent=error.message;}
    finally{if(controller===work){cancel.hidden=true;input.disabled=false;input.value='';}}
   }
   cancel.onclick=()=>controller?.abort();
   input.onchange=()=>void selected([...input.files]);
   drop.ondragover=event=>event.preventDefault();
   drop.ondrop=event=>{event.preventDefault();if(!input.disabled)void selected([...event.dataTransfer.files]);};
  }
  async function openBatchItem(index){
   const item=state.batch?.[index];if(!item?.inspected)return;
   if(item.saved){await detail(item.saved.id);await version(item.saved.version_id);return;}
   const id=item.inspected.manifest.productId;
   if(!id){editor(null,false,item);return;}
   await detail(id);
   const p=state.detail?.product;
   if(p?.id===id&&p.type===item.inspected.manifest.productType&&state.detail.can_edit&&!p.archived&&!p.deletePendingAt){editor(p,false,item);return;}
   modal('교체 대상 확인','<p role="alert">교체 가능한 동일 유형 상품을 찾을 수 없습니다.</p>'+btn('일괄 목록','batch-back'));
  }
  async function download(path,body,name,control){
   control.disabled=true;
   try{
    const response=await api(path,{download:true,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    const source=URL.createObjectURL(await response.blob()),link=document.createElement('a');
    link.href=source;link.download=name;link.click();
    setTimeout(()=>URL.revokeObjectURL(source),30000);
   }catch(error){toast(error.message);}
   finally{control.disabled=false;}
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
  const fileList=(files,original,links=true)=>Object.entries(files).map(([role,item])=>
   '<li>'+(links?'<a href="'+e(item.url)+'" target="_blank" rel="noopener">'+e(assetRole(role))+'</a>':'<span>'+e(assetRole(role))+'</span>')+'<small>'+
   e((original?'':item.width+'×'+item.height+' · '+item.frames+'프레임'+(item.alpha?' · 투명':'')+' · ')+size(item.size))+'</small></li>').join('');
  function paintVersion(p,{version:v,review}){
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
   const transition=state.detail.can_edit&&!p.archived&&!p.deletePendingAt&&!v.package?.reviewOnly&&p.activeVersion!==v.id?
    (review.ready&&!v.published_at?btn('에셋 적용','activate',attr):'')+(v.published_at&&(!v.package||review.ready)?btn('이 버전으로 복원','rollback',attr):''):'';
   modal('에셋 '+v.label,'<p>'+e(modes[v.mode]+' · '+v.renderer)+'</p><p class="management-meta">버전 ID '+e(v.id)+'</p>'+
    '<p>'+sourceLabel(v)+(v.package?.reviewOnly?' · 검토 전용':'')+(v.registered_by?' · 등록 '+e(v.registered_by):'')+'</p>'+
    (v.package?.manifest.metadata?.note?'<p class="management-meta">'+e(v.package.manifest.metadata.note)+'</p>':'')+
    '<details><summary>SHA-256</summary><p>업로드 ZIP <code>'+e(v.upload_sha256||'기록 없음')+'</code></p><p>운영 에셋 <code>'+e(v.hash)+'</code></p></details>'+
    actions(btn('상세로','back')+btn('적용 미리보기','preview',attr)+downloads(v)+transition+(state.batch?.some(item=>item.saved?.version_id===v.id)?btn('일괄 목록','batch-back'):''))+message+
    '<section class="product-subsection"><h2>파일</h2><details><summary>운영 파일</summary><ul class="product-versions">'+fileList(v.files,false)+'</ul></details>'+
    '<details><summary>업로드 파일</summary><ul class="product-versions">'+fileList(v.originals,true)+'</ul></details></section>'+
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
   const versions=state.detail?.product.id===p.id?state.detail.versions:[];
   const version=versions.find(v=>v.id===versionId);
   const views={service:'서비스 화면',media:'파일 단독',...(versionId&&p.asset&&p.activeVersion!==versionId?{compare:'현재 · 선택 버전 비교'}:{})};
   const presets={desktop:[['1440 × 900',1440,900,1],['PC 125% · 1152 × 720',1152,720,1.25]],
    mobile:[['390 × 844',390,844,3],['작은 화면 · 320 × 568',320,568,2],['가로 화면 · 844 × 390',844,390,3],['태블릿 · 768 × 1024',768,1024,2]],
    android:[['Android · 412 × 915',412,915,2.625],['가로 화면 · 915 × 412',915,412,2.625],['분할 화면 · 600 × 800',600,800,2]],
    ios:[['iPhone · 393 × 852',393,852,3],['가로 화면 · 852 × 393',852,393,3],['iPad · 820 × 1180',820,1180,2]]};
   modal('상품 적용 미리보기','<div class="product-filters">'+select('플랫폼','platform',platforms)+
    select('화면','surface',Object.fromEntries(screenSets[p.type].map(key=>[key,surfaces[key]])))+
    select('보기','view',views)+select('화면 크기와 배율','preset',{})+
    select('효과','quality',{auto:'자동',low:'경량',static:'정적'})+'</div>'+message+
    '<div class="product-preview-stage"></div>'+actions('<button class="small-button" type="button" data-preview-replay>다시 재생</button>'+
      (versionId?btn('버전으로','version','data-version="'+e(versionId)+'"'):btn('상세로','back'))));
   const stage=find('.product-preview-stage'),platform=find('[name=platform]',content),surface=find('[name=surface]',content),
    view=find('[name=view]',content),quality=find('[name=quality]',content),preset=find('[name=preset]',content),info=find('[role=status]',content),
    replay=find('[data-preview-replay]',content);
   const drawPresets=()=>preset.innerHTML=opts(Object.fromEntries(presets[platform.value].map(([label],i)=>[i,label])));
   const sync=()=>{
    stage.replaceChildren();
    const target=platform.value,screen=surface.value,native=target==='android'||target==='ios';
    const [,width,height,dpr]=presets[target][Number(preset.value)];
    info.textContent=native?'브라우저 시뮬레이션입니다. 실제 앱 화면은 해당 기기에서 열어 검수해 주세요.':'읽기 전용 · '+width+' × '+height+' · 에셋 선택 DPR '+dpr;
    replay.hidden=view.value==='media';
    if(view.value==='media'){
     const files=version?.files||p.asset?.files||{};
     const roles=p.type==='theme'?['desktop','mobile','roomCard','thumbnail']:['base','thumbnail','effect','fallback'];
     stage.innerHTML='<div class="product-file-preview">'+roles.map(role=>{
      const data=files[role],path=data?.url??data;if(!path)return '';
      return '<figure><a href="'+e(path)+'" target="_blank" rel="noopener">'+img(path,160)+'</a><figcaption>'+e(assetRole(role))+
       (data.width?' · '+data.width+'×'+data.height+' · '+size(data.size):'')+'</figcaption></figure>';
     }).join('')+'</div>';
     return;
    }
    const appCanOpen=target==='ios'&&/^(talk|karaoke)/.test(screen)||target==='android'&&screen.startsWith('karaoke');
    if(native&&!appCanOpen)info.textContent+=' 이 화면의 네이티브 검수 경로는 미연결 상태입니다.';
    if(appCanOpen){
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
    const compare=view.value==='compare',columns=document.createElement('div');columns.className='product-preview-columns';
    for(const [label,id] of compare?[['현재 적용',p.activeVersion],['선택 버전 '+(version?.label||''),versionId]]:[['',versionId]]){
     const column=document.createElement('section'),iframe=document.createElement('iframe'),note=document.createElement('p');
     if(compare){const tag=document.createElement('strong');tag.textContent=label;column.append(tag);}
     iframe.title=(label?label+' · ':'')+platforms[target]+' '+surfaces[screen]+(native?' 시뮬레이션':' 미리보기');
     iframe.setAttribute('sandbox','allow-scripts allow-same-origin');iframe.style.width=width+'px';iframe.style.height=height+'px';
     const roles=id?versions.find(v=>v.id===id)?.files:undefined;
     iframe.addEventListener('load',()=>{
      const room=iframe.contentDocument?.querySelector('[data-voice-room]');
      if(!room)return;
      const refresh=()=>{
       const role=room.dataset.productRole;
       if(!role)return;
       const file=roles?.[role+(room.dataset.productQuality==='low'?'Low':'')];
       note.textContent=assetRole(role)+' · '+(file?file.width+'×'+file.height+' · '+size(file.size)+' · ':'')+
        (room.hasAttribute('data-product-crop-warning')?'안전 영역 보호 · ':'')+(room.hasAttribute('data-product-theme-effect')?'효과 재생':'정적 표시');
      };
      refresh();new MutationObserver(refresh).observe(room,{attributes:true,attributeFilter:['data-product-role','data-product-quality','data-product-theme-effect','data-product-crop-warning']});
     });
     iframe.src='/api/admin/product-preview?'+new URLSearchParams({id:p.id,version:id||'',surface:screen,platform:target,quality:quality.value,dpr});
     note.className='management-meta';column.append(note,iframe);columns.append(column);
    }
    stage.append(columns);
   };
   platform.onchange=()=>{drawPresets();sync();};
   surface.onchange=view.onchange=preset.onchange=quality.onchange=replay.onclick=sync;drawPresets();sync();
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
    state.deletion=b.dataset.type==='deletion';
    state.type=state.archived||state.deletion?'':b.dataset.type;
    filters.elements.sale.closest('label').hidden=state.archived||state.deletion;
    state.page=1;
    for(const tab of all('[data-product-action=type]'))tab.setAttribute('aria-pressed',String(tab===b));
    void list();return;
   }
   if(a==='page'){state.page=Number(b.dataset.page);void list();return;}
   if(a==='reload'){void list();return;}
   if(a==='clear-selection'){clearSelection();find('[data-select-all]',tableHost)?.focus();return;}
   if(a==='apply-operation'){void applyOperation();return;}
   if(a==='bulk'){void confirmOperation(b.dataset.operation,[...state.selected].map(id=>state.products.get(id)));return;}
   if(a==='bulk-download'){void download(root+'/originals.zip',{products:[...state.selected]},'aifect-product-originals.zip',b);return;}
   if(a==='batch-import'||a==='batch-back'){if(warnClose())batchImport(a==='batch-import');return;}
   if(a==='batch-item'||a==='batch-open'){void openBatchItem(Number(b.dataset.batch));return;}
   if(a==='new'){editor(null);return;}
   if(a==='detail'){void detail(b.dataset.id);return;}
   if(row){
    if(a==='more'){openMenu(row,b);return;}
    hideMenu();
    if(a==='edit'){void detail(row.id,true);return;}
    if(a==='quick-preview'){void detail(row.id).then(()=>{if(dialog.open&&state.detail?.product.id===row.id)preview(state.detail.product);});return;}
    if(a==='quick-download'){
     void download('/api/admin/product-files/'+row.id+'/'+row.activeVersion+'/original-package.zip',null,row.id+'-'+row.activeVersion+'.zip',b);return;
    }
    if(a==='copy'){editor(row,true);return;}
    if(a==='operation'){void confirmOperation(b.dataset.operation,[row]);return;}
    if(a==='dispatch'||a==='dispatch-history'){
     jumpToGrant({product_id:row.id,history:a==='dispatch-history'});return;
    }
   }
   if(!p||(['back','version','preview'].includes(a)&&!warnClose()))return;
   if(a==='back'){void detail(p.id);return;}
   if(a==='edit'){editor(p);return;}
   if(a==='upload'){upload(p);return;}
   if(a==='link'){link(p);return;}
   if(a==='version'){void version(b.dataset.version);return;}
   if(a==='preview'){preview(p,b.dataset.version);return;}
   if(a==='review'){reviewForm(p,b.dataset.platform,b.dataset.surface);return;}
   if(a==='dispatch-enable'&&confirm('이 상품의 관리자 발송을 허용하시겠습니까?'))void write(p,{action:'status',sale:p.sale,grant:true});
   if(a==='restore')void write(p,{action:'rollback',version_id:null});
   if(a==='activate'||a==='rollback')void write(p,{action:a,version_id:b.dataset.version});
  });
  return {open:list};
 }
 window.AifectAdminProducts={mount};
})();
