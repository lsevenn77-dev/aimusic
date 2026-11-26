(() => {
 const kinds={gift:'선물',frame:'테두리',theme:'테마'}, periods={unit:'1개',P7D:'7일',P1M:'1개월',P3M:'3개월'};
 const modes={static:'정적 이미지',layered:'분리형 패키지',animated:'애니메이션 이미지'};
 const platforms={desktop:'PC웹',mobile:'모바일웹',android:'Android',ios:'iOS'};
 const surfaces={shop:'상점 카드',inventory:'인벤토리','gift-picker':'선물하기',my:'마이',profile:'회원 프로필',messages:'메시지',
  talk:'토킹룸',karaoke:'노래방','talk-muted':'토킹룸 · 음소거','karaoke-muted':'노래방 · 음소거',
  'talk-seated':'토킹룸 · 착석','talk-unseated':'토킹룸 · 미착석','karaoke-seated':'노래방 · 착석','karaoke-unseated':'노래방 · 미착석',
  'talk-dark':'토킹룸 · 블랙','talk-light':'토킹룸 · 화이트','karaoke-dark':'노래방 · 블랙','karaoke-light':'노래방 · 화이트'};
 const screenSets={gift:['shop','inventory','gift-picker','talk-seated','talk-unseated','karaoke-seated','karaoke-unseated'],
  frame:['shop','inventory','my','profile','messages','talk','talk-muted','karaoke','karaoke-muted'],
  theme:['shop','inventory','talk-dark','talk-light','karaoke-dark','karaoke-light']};
 const roles={base:'본체',effect:'효과',thumbnail:'썸네일',fallback:'정적 대체',desktop:'PC 배경',mobile:'모바일 배경',app:'앱 배경',
  roomCard:'방 카드',desktopEffect:'PC 효과',mobileEffect:'모바일 효과',appEffect:'앱 효과',package:'ZIP 원본'};
 const deadlineLabel=d=>!d?'—':d.mode==='none'?'기한 없음':d.mode==='days'?'지급일 기준 '+d.days+'일':d.date+' (KST)';
 const saleLabel=p=>p.archived?'보관':p.distribution==='grant'?'상점 미노출':p.sale?'판매 중':'판매 중지';
 const grantLabel=p=>p.grant?'지급 가능':'지급 중지';
 const num=n=>new Intl.NumberFormat('ko-KR').format(n);
 const kst=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
 const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
 const root='/api/admin/products', url=id=>root+'/'+encodeURIComponent(id);
 const readDeadline=f=>f.deadline.value==='days'?{mode:'days',days:Number(f.days.value)}:f.deadline.value==='date'?{mode:'date',date:f.date.value}:f.deadline.value?{mode:f.deadline.value}:null;

 function mount(box,{api,esc:e,toast,jumpToGrant}){
  if(!box)return null;
  const find=(sel,el=box)=>el.querySelector(sel), all=(sel,el=box)=>[...el.querySelectorAll(sel)];
  const state={type:'',page:1,listToken:0,detailToken:0,dirty:false,saving:false,attempts:new WeakMap()};
  const opts=values=>Object.entries(values).sort(([a],[b])=>Number(b==='')-Number(a==='')).map(([v,label])=>'<option value="'+e(v)+'">'+e(label)+'</option>').join('');
  const field=(label,name,type,attr='')=>'<label>'+e(label)+'<input type="'+type+'" name="'+name+'" '+attr+'></label>';
  const select=(label,name,values,attr='')=>'<label>'+e(label)+'<select name="'+name+'" '+attr+'>'+opts(values)+'</select></label>';
  const btn=(label,action,attr='')=>'<button class="small-button" type="button" data-product-action="'+action+'" '+attr+'>'+e(label)+'</button>';
  const submit=label=>'<button class="primary-button product-primary" type="submit">'+e(label)+'</button>';
  const actions=html=>'<div class="product-actions">'+html+'</div>';
  const message='<p class="product-message" role="status"></p>';
  const img=(path,w)=>path?'<img src="'+e(path)+'" alt="" loading="lazy" decoding="async" width="'+w+'" height="'+w+'">':'';
  const file=(role,required=false,accept='image/webp,image/png,image/jpeg,image/gif')=>field(roles[role]||'ZIP 패키지',role,'file','accept="'+accept+'" '+(required?'required':''));
  const warnClose=()=>!state.dirty||window.confirm('작성 중인 내용을 닫으시겠습니까?');

  box.innerHTML='<div class="section-heading product-heading"><h1>상품 관리</h1>'+
   '<button class="primary-button product-primary" type="button" data-product-action="new" hidden>상품 등록</button></div>'+
   '<div class="product-tabs" role="group" aria-label="상품 유형">'+[['','전체'],...Object.entries(kinds)].map(([v,label])=>btn(label,'type','data-type="'+v+'" aria-pressed="'+(v==='')+'"')).join('')+'</div>'+
   '<article class="admin-card product-list"><form class="product-filters">'+field('상품 검색','q','search','maxlength="100" placeholder="상품명 또는 ID"')+
   select('통화','currency',{'':'전체',G:'골드',S:'실버'})+select('상품 구분','distribution',{'':'전체',shop:'상점 판매',grant:'지급 전용'})+
   select('판매 상태','sale',{'':'전체',1:'판매 중',0:'판매 중지',archived:'보관'})+select('지급 상태','grant',{'':'전체',1:'지급 가능',0:'지급 중지'})+
   '<button type="submit" class="small-button">검색</button></form><p class="product-result" aria-live="polite"></p><div class="product-rows"></div><div class="product-pages"></div></article>'+
   '<dialog class="admin-card product-dialog" aria-labelledby="product-dialog-title"><div class="product-dialog-head"><h2 id="product-dialog-title"></h2>'+
   btn('닫기','close','autofocus')+'</div><div class="product-content"></div></dialog>';
  const filters=find('.product-filters'), dialog=find('.product-dialog'), content=find('.product-content'), result=find('.product-result');
  function modal(title,html){
   state.dirty=false;find('#product-dialog-title').textContent=title;content.innerHTML=html;
   if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
  }
  function close(){
   if(state.saving||!warnClose())return;
   state.detailToken++;state.dirty=false;dialog.close();content.replaceChildren();
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  content.addEventListener('input',event=>{if(event.target.closest('form'))state.dirty=true;});
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  document.addEventListener('aifect-admin-locked',()=>{
   state.detailToken++;state.listToken++;state.dirty=false;state.detail=null;
   if(dialog.open)dialog.close();content.replaceChildren();find('.product-rows').replaceChildren();
  });

  function items(products){
   if(!products.length)return '<p class="empty-state">검색 조건에 맞는 상품이 없습니다.</p>';
   const heads=['상품','가격 · 표시 가치','이용 기간','지급 기본 기한','판매 · 지급','보유 회원 / 지급','상세'];
   return '<table class="product-table"><thead><tr>'+heads.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+
    products.map(p=>{
     const value=p.distribution==='grant'?p.value:Math.min(...Object.values(p.options));
     const cells=['<div class="product-identity">'+(img(p.asset?.files.thumbnail,40)||'<span class="product-placeholder"></span>')+
       '<div><strong>'+e(p.name)+'</strong><small>'+e(kinds[p.type]+' · '+p.id)+'</small></div></div>',
      e(num(value)+' '+p.currency+(p.distribution==='shop'&&p.type!=='gift'?'부터':'')),
      e(Object.keys(p.options).map(k=>periods[k]).join(' / ')),e(deadlineLabel(p.grantDeadline)),
      '<span class="product-state '+(p.sale?'positive':'')+'">'+e(saleLabel(p))+'</span><span class="product-state '+(p.grant?'positive':'')+'">'+e(grantLabel(p))+'</span>',
      e(num(p.holders)+'명 / '+(p.granted==null?'—':num(p.granted)+'개')),btn('상세보기','detail','data-id="'+e(p.id)+'"')];
     return '<tr>'+cells.map((cell,i)=>'<td data-label="'+heads[i]+'">'+cell+'</td>').join('')+'</tr>';
    }).join('')+'</tbody></table>';
  }
  async function list(){
   const token=++state.listToken,params=new URLSearchParams(new FormData(filters));
   params.set('page',String(state.page));params.set('type',state.type);
   result.textContent='상품을 불러오고 있습니다.';
   try{
    const d=await api(root+'?'+params);if(token!==state.listToken)return;
    state.page=d.page;find('[data-product-action=new]').hidden=!d.can_edit;
    result.textContent='상품 '+num(d.total)+'개';find('.product-rows').innerHTML=items(d.products);
    find('.product-pages').innerHTML=d.pages>1?btn('이전','page','data-page="'+(d.page-1)+'" '+(d.page===1?'disabled':''))+
     '<span>'+d.page+' / '+d.pages+'</span>'+btn('다음','page','data-page="'+(d.page+1)+'" '+(d.page===d.pages?'disabled':'')):'';
   }catch(error){if(token!==state.listToken)return;result.textContent=error.message;find('.product-rows').replaceChildren();find('.product-pages').innerHTML=btn('다시 시도','reload');}
  }
  filters.onsubmit=event=>{event.preventDefault();state.page=1;void list();};
  filters.onchange=()=>{state.page=1;void list();};

  async function detail(id){
   const token=++state.detailToken;modal('상품 상세','<p role="status">상품 정보를 확인하고 있습니다.</p>');
   try{const data=await api(url(id));if(token!==state.detailToken)return;state.detail=data;paintDetail();}
   catch(error){if(token===state.detailToken)modal('상품 상세','<p role="alert">'+e(error.message)+'</p>'+btn('다시 시도','detail','data-id="'+e(id)+'"'));}
  }
  function paintDetail(){
   const {product:p,can_edit:edit,versions,active_review:review}=state.detail;
   const current=versions.find(v=>v.id===p.activeVersion);
   const labels={'상품 ID':p.id,'유형 · 구분':kinds[p.type]+' · '+(p.distribution==='shop'?'상점 판매':'지급 전용'),
    '이용 옵션':Object.entries(p.options).map(([k,v])=>periods[k]+(p.distribution==='shop'?' · '+num(v)+' '+p.currency:'')).join(' / '),
    ...(p.distribution==='grant'?{'지급 표시 가치':num(p.value)+' '+p.currency}:{}),
    '지급 기본 기한':deadlineLabel(p.grantDeadline),'판매 · 지급':saleLabel(p)+' / '+grantLabel(p),
    '적용 에셋':current?.label||(p.legacy?'기존 운영 에셋':'미등록'),
    '실제 적용 검수':review?(review.ready?'전 플랫폼 통과':'재검수 필요'):'미검수'};
   const controls=edit&&!p.archived?btn('수정','edit')+btn('복제','copy')+(p.distribution==='shop'?btn(p.sale?'판매 중지':'판매 재개','sale'):'')+
    btn(p.grant?'지급 중지':'지급 재개','grant')+btn('보관','archive'):'';
   const files=versions.length?'<ul class="product-versions">'+versions.map(v=>'<li><div><strong>'+e(v.label)+'</strong><small>'+
    e(kst.format(new Date(v.created*1000)))+' · '+(v.id===p.activeVersion?'적용 중':v.published_at?'이전 적용':'후보')+
    '</small></div>'+btn('검수 및 파일','version','data-version="'+e(v.id)+'"')+'</li>').join('')+'</ul>':'<p class="management-meta">등록한 에셋 버전이 없습니다.</p>';
   modal(p.name,'<div class="product-overview">'+img(p.asset?.files.thumbnail,96)+'<dl>'+Object.entries(labels).map(([k,v])=>'<div><dt>'+e(k)+'</dt><dd>'+e(v)+'</dd></div>').join('')+'</dl></div>'+
    (p.description?'<p>'+e(p.description)+'</p>':'')+(p.eventOnly?'<span class="product-state">이벤트 한정</span>':'')+
    actions(controls+(p.grant&&p.grant_executor?btn('지급하기','dispatch'):'')+(p.grant_executor?btn('지급 내역','dispatch'):''))+
    (p.grant&&!p.grant_executor?'<p class="management-meta">이 상품 유형은 선물 발송 관리 연동이 필요합니다.</p>':'')+message+
    '<section class="product-subsection"><h2>에셋 및 버전</h2>'+actions((p.asset?btn('적용 미리보기','preview'):'')+
    (edit&&!p.archived?btn('에셋 등록','upload')+(p.id==='theme_christmas'?'':btn('검증 에셋 연결','link')):'')+
    (p.legacy&&p.activeVersion&&edit?btn('기존 에셋으로 복구','restore'):'') )+files+'</section>');
  }

  function editor(p){
   modal(p?'상품 수정':'상품 등록','<form class="product-form"><div class="product-form-grid">'+select('유형','type',kinds,p?'disabled':'')+
    field('상품명','name','text','required maxlength="80"')+select('상품 구분','distribution',{shop:'상점 판매',grant:'지급 전용'})+
    select('통화','currency',{G:'골드',S:'실버'})+'<div class="product-form-grid product-prices"></div>'+
    field('지급 표시 가치','value','number','min="1" max="100000"')+select('방 패널','uiMode',{dark:'블랙',light:'화이트'})+
    '<label class="product-check"><input name="eventOnly" type="checkbox"> 이벤트 한정</label>'+
    '<label class="product-span">상품 설명<textarea name="description" rows="2" maxlength="400"></textarea></label></div>'+
    '<fieldset><legend>지급 기본 기한</legend><div class="product-form-grid">'+select('기한','deadline',{'':'미설정',days:'지급일부터',date:'고정 날짜 (KST)',none:'기한 없음'})+
    field('일수','days','number','min="1" max="3650"')+field('종료일 (한국 시간)','date','date')+'</div></fieldset>'+
    actions(submit(p?'변경 저장':'초안 저장')+btn(p?'상세로':'취소',p?'back':'close'))+message+'</form>');
   const form=find('form',content),f=form.elements,prices=find('.product-prices',form);
   for(const [k,v] of Object.entries({type:p?.type||'gift',name:p?.name||'',distribution:p?.distribution||'shop',currency:p?.currency||'G',uiMode:p?.uiMode||'dark',
    description:p?.description||'',value:p?.value??'',deadline:p?.grantDeadline?.mode||'',days:p?.grantDeadline?.days??'',date:p?.grantDeadline?.date??''}))f[k].value=v;
   f.eventOnly.checked=!!p?.eventOnly;
   const show=(input,on,req=false)=>{input.closest('label').hidden=!on;input.required=on&&req;};
   const sync=()=>{
    const gift=f.type.value==='gift',shop=f.distribution.value==='shop';
    if(!gift)f.currency.value='G';
    f.currency.disabled=!!p||!gift;show(f.uiMode,f.type.value==='theme');
    show(f.value,!shop,true);show(f.days,f.deadline.value==='days',true);show(f.date,f.deadline.value==='date',true);
    prices.hidden=gift&&!shop;
    for(const input of all('input',prices))input.required=gift&&shop;
   };
   const drawPrices=()=>{
    prices.innerHTML=(f.type.value==='gift'?['unit']:['P7D','P1M','P3M']).map(k=>
     field(k==='unit'?'판매 가격':periods[k],'price_'+k,'number','min="1" max="100000" value="'+(p?.options[k]??'')+'"')).join('');
    sync();
   };
   f.type.onchange=drawPrices;f.distribution.onchange=f.deadline.onchange=sync;drawPrices();
   form.onsubmit=event=>{
    event.preventDefault();const value=Number(f.value.value);
    const options=Object.fromEntries(all('input',prices).filter(x=>x.value).map(x=>[x.name.slice(6),Number(x.value)]));
    void write(p,{action:p?'edit':'create',type:f.type.value,currency:f.currency.value,distribution:f.distribution.value,
     name:f.name.value,description:f.description.value,eventOnly:f.eventOnly.checked,uiMode:f.uiMode.value,value,
     options:f.type.value==='gift'&&f.distribution.value==='grant'?{unit:value}:options,grantDeadline:readDeadline(f)},form);
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
  async function write(p,body,owner=content){
   const saved=await send(p?url(p.id):root,p?{...body,revision:p.revision}:body,owner,'변경을 저장하고 있습니다.');
   if(saved){toast('상품 변경을 저장했습니다.');void list();await detail(saved.id);}
  }
  function upload(p){
   if(p.id==='theme_christmas'){modal('에셋 등록','<p>크리스마스 테마의 에셋은 전용 렌더러 빌드와 함께 검수해야 합니다.</p>'+btn('상세로','back'));return;}
   modal('에셋 등록','<form class="product-form"><div class="product-form-grid">'+
    select('재생 방식','mode',p.type==='theme'?{static:modes.static,layered:modes.layered}:modes)+field('버전','asset_version','text','required maxlength="42" placeholder="1.0.0"')+
    '</div><p class="management-meta product-hint"></p><div class="product-form-grid product-files"></div>'+
    actions(submit('검사 후 등록')+btn('상세로','back'))+message+'</form>');
   const form=find('form',content),mode=form.elements.mode,files=find('.product-files',form),hint=find('.product-hint',form);
   const draw=()=>{
    if(mode.value==='layered'){
     const renderer={gift:'gift-overlay',frame:'frame-overlay',theme:'room-overlay'}[p.type];
     files.innerHTML=file('package',true,'.zip,application/zip');
     hint.textContent='매니페스트와 역할별 이미지 · '+renderer+' v1 · ZIP 8 MB 이하';
    }else{
     files.innerHTML=(p.type==='theme'?file('desktop',true)+file('mobile',true)+file('app')+file('roomCard'):
      file('base',true,mode.value==='animated'?'image/webp,image/gif':undefined)+(mode.value==='animated'?file('fallback',true):''))+file('thumbnail');
     hint.textContent='파일당 5 MB 이하 · 썸네일 미지정 시 자동 생성';
    }
   };
   mode.onchange=draw;draw();
   form.onsubmit=async event=>{
    event.preventDefault();const saved=await send(url(p.id)+'/versions',new FormData(form),form,'파일을 검사하고 있습니다.');
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
   const transition=state.detail.can_edit&&p.activeVersion!==v.id?
    (review.ready?btn('에셋 적용','activate',attr):'')+(v.published_at?btn('이 버전으로 복구','rollback',attr):''):'';
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
    if(['ios','android'].includes(platform.value)){info.textContent='이 플랫폼은 실제 앱 캡처로 검수합니다. 에셋 버전에서 캡처와 결과를 확인할 수 있습니다.';return;}
    info.textContent='웹 서비스 구성 요소 · 읽기 전용';
    const iframe=document.createElement('iframe');iframe.title=platforms[platform.value]+' '+surfaces[surface.value];iframe.className=platform.value;
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin');
    iframe.src='/api/admin/product-preview?'+new URLSearchParams({id:p.id,version:versionId||'',surface:surface.value});stage.append(iframe);
   };
   platform.onchange=surface.onchange=sync;sync();
  }

  box.addEventListener('click',event=>{
   const b=event.target.closest('button[data-product-action]');
   if(!b||b.disabled||state.saving)return;
   const a=b.dataset.productAction,p=state.detail?.product;
   if(a==='close'){close();return;}
   if(a==='type'){state.type=b.dataset.type;state.page=1;for(const tab of all('[data-product-action=type]'))tab.setAttribute('aria-pressed',String(tab===b));void list();return;}
   if(a==='page'){state.page=Number(b.dataset.page);void list();return;}
   if(a==='reload'){void list();return;}
   if(a==='new'){editor(null);return;}
   if(a==='detail'){void detail(b.dataset.id);return;}
   if(!p||(['back','version'].includes(a)&&!warnClose()))return;
   if(a==='back'){void detail(p.id);return;}
   if(a==='edit'){editor(p);return;}
   if(a==='upload'){upload(p);return;}
   if(a==='link'){link(p);return;}
   if(a==='version'){void version(b.dataset.version);return;}
   if(a==='preview'){preview(p,b.dataset.version);return;}
   if(a==='review'){reviewForm(p,b.dataset.platform,b.dataset.surface);return;}
   if(a==='dispatch'){close();jumpToGrant(p.id);return;}
   if(a==='archive'&&!window.confirm('상품을 보관하고 판매와 지급을 중지하시겠습니까? 기존 사용권은 유지됩니다.'))return;
   const body=a==='sale'||a==='grant'?{action:'status',sale:a==='sale'?!p.sale:p.sale,grant:a==='grant'?!p.grant:p.grant}:
    a==='restore'?{action:'rollback',version_id:null}:{action:a,...(b.dataset.version?{version_id:b.dataset.version}:{})};
   void write(p,body);
  });
  return {open:list};
 }
 window.AifectAdminProducts={mount};
})();
