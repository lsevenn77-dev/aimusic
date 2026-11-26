(() => {
 const api='/api/admin/notices';
 const max=10000;
 const types={
  all:'전체 회원',normal:'일반 회원',premium:'프리미엄 혜택 이용 회원',paid:'실제 유료 구독 회원',
  specific:'특정 회원',welcome:'신규 가입자',test:'테스트 회원'
 };
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const splitIds=value=>value.trim().split(/[,\s]+/u).filter(Boolean);
 const uniq=ids=>[...new Set(ids)];
 const requestJson=(request,path,method,data)=>request(api+path,{method,body:JSON.stringify(data)});

 function parseCsv(text){
  const rows=[];
  let row=[],field='',quoted=false;
  const addField=()=>{row.push(field);field='';};
  const addRow=()=>{addField();rows.push(row);row=[];};
  text=text.replace(/^\ufeff/,'');
  for(let index=0;index<text.length;index++){
   const character=text[index];
   if(character==='"'){
    if(quoted&&text[index+1]==='"'){field+='"';index++;}
    else quoted=!quoted;
   }else if(quoted)field+=character;
   else if(character===',')addField();
   else if(character==='\r'||character==='\n'){
    if(character==='\r'&&text[index+1]==='\n')index++;
    addRow();
   }else field+=character;
  }
  if(quoted)throw new Error('CSV 파일의 따옴표를 확인해 주세요.');
  if(field||row.length)addRow();
  const header=rows[0]?.map(cell=>cell.trim().toLowerCase())??[];
  const column=header.findIndex(cell=>cell==='user_id'||cell==='id');
  if(column>=0)rows.shift();
  return rows.map(record=>(record[Math.max(column,0)]??'').trim())
   .map(uid=>/^'(?:[\s=+\-@']|0\d+$|\d{15,}$)/.test(uid)?uid.slice(1):uid).filter(Boolean);
 }

 async function download(response,filename='aifect-members.csv'){
  const data=await response.blob(),url=URL.createObjectURL(data),link=document.createElement('a');
  link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 function rosterTools(root,{request,getIds,setIds,notify,writable=true}){
  root.innerHTML=`<div class="notice-roster-actions">
   <button type="button" data-roster-action="import">CSV 가져오기</button><input data-roster-file type="file" accept=".csv,text/csv" hidden>
   <button type="button" data-roster-action="export">CSV 내보내기</button><button type="button" data-roster-action="copy">선택한 ID 복사</button>
   <button type="button" data-roster-action="open">저장 명단</button></div>
   <dialog class="notice-dialog" data-roster-dialog aria-label="저장 명단"><h2>저장 명단</h2>
    <label class="notice-field">명단 <select data-roster-select><option value="">명단 선택</option></select></label>
    <div class="notice-actions"><button type="button" data-roster-action="more" hidden>명단 더 보기</button>
     <button type="button" data-roster-action="load">불러오기</button></div>
    <label class="notice-field">명단 이름 <input data-roster-name maxlength="100"></label>
    <p data-roster-note>현재 선택한 회원 ID를 저장합니다.</p><p data-roster-status role="status"></p>
    <div class="notice-actions"><button type="button" data-roster-action="delete" class="notice-danger">삭제</button>
     <button type="button" data-roster-action="close">닫기</button><button type="button" data-roster-action="create">새 명단 저장</button>
     <button type="button" data-roster-action="update" class="notice-primary">선택 명단 수정</button></div>
   </dialog>`;
  const $=selector=>root.querySelector(selector),dialog=$('[data-roster-dialog]'),files=$('[data-roster-file]'),
   select=$('[data-roster-select]'),name=$('[data-roster-name]');
  let next=null,saved=null,confirmDelete=false,busy=false;
  const status=message=>{if(dialog.open)$('[data-roster-status]').textContent=message;else notify(message);};
  function enable(){
   for(const key of ['create','update','delete'])$('[data-roster-action="'+key+'"]').disabled=busy||!writable||(key!=='create'&&!saved);
   $('[data-roster-action="load"]').disabled=busy||!saved;
  }
  async function list(append=false){
   const data=await request(api+'/rosters'+(append&&next?'?after='+encodeURIComponent(next):''));
   if(!append){select.innerHTML='<option value="">명단 선택</option>';saved=null;enable();}
   select.insertAdjacentHTML('beforeend',data.rosters.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+' ('+r.members+'명)</option>').join(''));
   next=data.next;$('[data-roster-action="more"]').hidden=!next;
  }
  function selected(data){
   saved=data;name.value=data?.name??'';confirmDelete=false;$('[data-roster-action="delete"]').textContent='삭제';enable();
  }
  async function act(action){
   if(action==='import'){files.click();return;}
   if(action==='close'){dialog.close();return;}
   if(action==='copy'){await navigator.clipboard.writeText(uniq(getIds()).join('\n'));status('선택한 회원 ID를 복사했습니다.');return;}
   if(action==='export'){
    const response=await request(api+'/export',{method:'POST',body:JSON.stringify({ids:uniq(getIds())}),download:true});
    await download(response);status('회원 명단을 내려받았습니다.');return;
   }
   if(action==='open'){
    selected(null);status('저장 명단을 불러오는 중입니다.');dialog.showModal();
    await list();status('');return;
   }
   if(action==='more'){await list(true);return;}
   if(action==='load'&&saved){setIds(saved.ids);dialog.close();notify(saved.ids.length+'명의 저장 명단을 불러왔습니다.');return;}
   if(action==='delete'&&saved){
    if(!confirmDelete){confirmDelete=true;$('[data-roster-action="delete"]').textContent='삭제 확인';status('이 명단을 삭제하시겠습니까?');return;}
    await requestJson(request,'/rosters/'+saved.id,'DELETE',{version:saved.version});
    selected(null);await list();status('저장 명단을 삭제했습니다.');return;
   }
   if(action==='create'||action==='update'&&saved){
    const append=action==='create',data=await requestJson(request,'/rosters'+(append?'':'/'+saved.id),append?'POST':'PUT',
     {name:name.value.trim(),ids:uniq(getIds()),version:saved?.version});
    await list();select.value=data.id;selected(data);status('명단을 저장했습니다.');
   }
  }
  root.addEventListener('click',async event=>{
   const action=event.target.closest('[data-roster-action]')?.dataset.rosterAction;
   if(!action||busy)return;
   busy=true;enable();
   try{await act(action);}catch(error){status(error.message);}finally{busy=false;enable();}
  });
  select.addEventListener('change',async()=>{
   const key=select.value;
   if(!key){selected(null);return;}
   selected(null);status('명단을 확인하는 중입니다.');
   try{const data=await request(api+'/rosters/'+key);if(select.value===key){selected(data);status('');}}
   catch(error){if(select.value===key)status(error.message);}
  });
  files.addEventListener('change',async()=>{
   try{
    const file=files.files[0];
    if(!file)return;
    if(file.size>3*1024*1024)throw new Error('3MB 이하 CSV 파일을 선택해 주세요.');
    const ids=parseCsv(await file.text());
    if(!ids.length||ids.length>max)throw new Error('CSV의 회원 ID를 확인해 주세요.');
    if(ids.some(id=>id.length>128||/[,\s\u0000-\u001f\u007f]/u.test(id)))throw new Error('CSV의 회원 ID 열을 확인해 주세요.');
    setIds(uniq([...getIds(),...ids]));
    notify(ids.length+'개의 회원 ID를 가져왔습니다.');
   }catch(error){notify(error.message);}finally{files.value='';}
  });
  enable();
  return {setWritable(value){writable=value;enable();}};
 }

 function create(root,{request,onChange,notify}){
  root.innerHTML=`<div class="notice-audience-head"><label class="notice-field">발송 대상
   <select data-audience-type><option value="">선택해 주세요</option>${Object.entries(types).slice(0,5).map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')}</select>
   </label><p>가입한 회원 중 AI 활동 계정과 탈퇴 계정을 제외합니다.</p></div>
   <div data-specific hidden>
    <label class="notice-field">회원 ID <textarea rows="3" data-member-ids placeholder="쉼표, 공백 또는 줄바꿈으로 여러 ID를 넣을 수 있습니다."></textarea></label>
    <div class="notice-inline"><input type="search" data-member-query placeholder="닉네임 또는 회원 ID" aria-label="닉네임 또는 회원 ID">
     <button type="button" data-member-search>검색</button></div>
    <div class="notice-member-search" data-search-results hidden>
     <div class="notice-actions"><button type="button" data-page-select>현재 페이지 선택</button>
      <button type="button" data-search-select>검색 결과 전체 선택</button></div>
     <ul data-member-results class="notice-member-results"></ul><button type="button" data-member-more hidden>다음 페이지</button>
    </div>
    <p data-member-status role="status"></p><div data-roster></div>
   </div>`;
  const $=s=>root.querySelector(s),type=$('[data-audience-type]'),ids=$('[data-member-ids]'),
   search=$('[data-member-query]'),results=$('[data-member-results]'),status=$('[data-member-status]');
  let page=[],next=null,lastQuery='',ticket=0;
  const value=()=>({type:type.value,ids:type.value==='specific'?splitIds(ids.value):[]});
  const say=message=>{status.textContent=message;notify?.(message);};
  function refresh(){
   const chosen=new Set(splitIds(ids.value));
   for(const toggle of results.querySelectorAll('input[type=checkbox]'))toggle.checked=chosen.has(toggle.value);
   status.textContent=chosen.size?chosen.size.toLocaleString('ko-KR')+'명 선택':'';
  }
  function setIds(chosen,changed=true){
   if(chosen.length>max){say('회원 ID는 10,000개까지 선택할 수 있습니다.');return;}
   ids.value=chosen.join('\n');refresh();if(changed)onChange(value());
  }
  const roster=rosterTools($('[data-roster]'),{request,getIds:()=>value().ids,setIds,notify:say});
  type.addEventListener('change',()=>{$('[data-specific]').hidden=type.value!=='specific';onChange(value());});
  ids.addEventListener('input',()=>{refresh();onChange(value());});
  const searchPath=(q,after)=>api+'/members?'+new URLSearchParams({q,...(after?{after}:{})});
  async function find(append=false){
   const mine=++ticket,q=append?lastQuery:search.value.trim();
   if(!q){say('닉네임 또는 회원 ID를 입력해 주세요.');return;}
   try{
    say('회원을 찾는 중입니다.');
    const result=await request(searchPath(q,append?next:null));
    if(ticket!==mine)return;
    page=result.members;next=result.next;lastQuery=q;
    $('[data-search-results]').hidden=false;
    $('[data-member-more]').hidden=!next;
    results.innerHTML=page.map(m=>'<li><label><input type="checkbox" value="'+esc(m.id)+'"> <b>'+esc(m.name)+'</b> <code>'+esc(m.id)+'</code></label></li>').join('');
    refresh();
    if(!page.length)say('검색 결과가 없습니다.');
   }catch(error){if(ticket===mine)say(error.message);}
  }
  $('[data-member-search]').onclick=()=>find();
  search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void find();}});
  $('[data-member-more]').onclick=()=>find(true);
  results.addEventListener('change',event=>{
   const item=event.target;
   if(item.type!=='checkbox')return;
   const chosen=new Set(value().ids);
   if(item.checked)chosen.add(item.value);else chosen.delete(item.value);
   setIds(Array.from(chosen));
  });
  $('[data-page-select]').onclick=()=>setIds(uniq([...value().ids,...page.map(m=>m.id)]));
  $('[data-search-select]').onclick=async event=>{
   const button=event.currentTarget;
   if(!lastQuery||button.disabled)return;
   const q=lastQuery,selected=new Set(value().ids);
   button.disabled=true;
   try{
    let after=null;
    do{
     const data=await request(searchPath(q,after));
     data.members.forEach(m=>selected.add(m.id));after=data.next;
     if(selected.size>max)throw new Error('회원 ID는 10,000개까지 선택할 수 있습니다.');
    }while(after);
    if(q===lastQuery)setIds(uniq([...value().ids,...selected]));
   }catch(error){say(error.message);}finally{button.disabled=false;}
  };
  return {value,set(input={type:'',ids:[]}){
   type.value=input.type||'';$('[data-specific]').hidden=type.value!=='specific';setIds(input.ids??[],false);
  },setWritable(writable){type.disabled=!writable;ids.disabled=!writable;roster.setWritable(writable);}};
 }
 globalThis.AifectNoticeAudience={create,rosterTools,types,download,max,esc};
})();
