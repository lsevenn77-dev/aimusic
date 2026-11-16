// Shared by own, public and legacy routes. Only the server supplies permissions and rows.
const followTabs={followers:'내 팔로워',following:'내 팔로잉',artists:'AI 아티스트',blocks:'차단 관리'};
const followOps={remove:'삭제',block:'차단',unfollow:'팔로우 취소',unblock:'차단 해제',follow:'맞팔로우'};
function followOptions(tab,artist='',user='',kind=''){
 const q=new URLSearchParams({tab});if(artist)q.set('artist',artist);if(user)q.set('user',user);if(kind)q.set('kind',kind);return q;
}
async function followManagementView(raw,readApi){
 const q=new URLSearchParams(raw.split('?')[1]),tab=q.get('tab')||'followers',aid=q.get('artist')||'';
 if(!me&&!q.has('user')&&!aid){returnRoute=location.hash;return {html:'<section class="fm-page fm-gate">'+gate()+'</section>'};}
 const params=followOptions(tab,aid,q.get('user'),q.get('kind')),initial=q.get('q')||'';
 if(initial)params.set('q',initial);
 return {html:'<section class="fm-page" aria-label="팔로우 목록"><h1>팔로우</h1><div class="fm-initial" role="status"></div></section>',followPage:{params:params.toString(),tab,aid,initial,raw,readApi}};
}
function followSkeleton(){
 return '<div class="fm-skeleton" aria-hidden="true">'+('<div><i></i><span></span></div>').repeat(4)+'</div>';
}
async function bindFollowManagement({params,tab,aid,initial,raw,readApi}){
 const root=document.querySelector('.fm-page'),pending=root.querySelector('.fm-initial');
 async function load(){
  const revision=followRevision;
  pending.innerHTML='<span class="sr-only">팔로우 목록을 불러오는 중…</span>'+followSkeleton();
  try{
   const d=await readApi('/api/follow-management?'+params,'GET',undefined,{fresh:true});
   if(!root.isConnected)return;
   if(revision!==followRevision)return load();
   root.innerHTML=followListHTML(d,tab,aid,initial,raw);
   bindFollowList(root,{params,d,tab});
  }catch(error){
   if(!root.isConnected||error.name==='AbortError')return;
   pending.innerHTML='<div class="fm-feedback" role="alert">'+esc(error.message)+' <button class="small-button" type="button">다시 시도</button></div>';
   pending.querySelector('button').onclick=load;
  }
 }
 await load();
}
function followListHTML(d,tab,aid,initial,raw){
 const href=k=>'#follow?'+esc(followOptions(k,'',d.own?'':d.owner).toString());
 const tabs=d.own?Object.keys(followTabs):aid?['artists']:['followers','following'];
 const labels=d.own?followTabs:{followers:'팔로워',following:'팔로잉',artists:'아티스트 팔로워'};
 const picker=tab==='artists'&&d.own?'<select class="fm-artist" aria-label="AI 아티스트 선택"><option value="">전체 아티스트</option>'+d.artists.map(a=>'<option value="'+esc(a.id)+'" '+(aid===a.id?'selected':'')+'>'+esc(a.name)+' · '+number(a.followers)+'명</option>').join('')+'</select>':'';
 return '<header class="fm-header"><div class="fm-top"><h1>'+esc(d.own?'팔로우 관리':d.name+(aid?' 팬':'의 팔로우'))+'</h1><span class="fm-count"></span><div class="fm-mode"></div></div>'+
 '<div class="fm-tabs-row"><nav class="tabs fm-tabs aifect-main-tabs" aria-label="팔로우 탭">'+tabs.map(k=>'<a data-tab-tone="mint" class="tab '+(k===tab?'active':'')+'" '+(k===tab?'aria-current="page"':'')+' href="'+(k==='artists'&&!d.own?'#'+esc(raw):href(k))+'">'+labels[k]+'</a>').join('')+'</nav>'+picker+'</div>'+
 '<div class="fm-tools"><label class="brand-search">'+icon('search')+'<input type="search" maxlength="100" aria-label="닉네임 검색" placeholder="닉네임 검색" value="'+esc(initial)+'"></label><select class="fm-sort" aria-label="정렬"><option value="latest">최신순</option><option value="name">이름순</option></select></div></header>'+
 '<div class="fm-list-panel"><div class="fm-status" role="status"></div><div class="fm-loading" hidden></div><ul class="fm-rows"></ul><button class="small-button fm-more" hidden>더 보기</button></div><div class="fm-bulk" hidden></div>';
}
function bindFollowList(root,{params,d,tab}){
 const find=s=>root.querySelector(s),input=find('input'),sort=find('.fm-sort'),modeBox=find('.fm-mode'),bulk=find('.fm-bulk'),list=find('ul'),status=find('.fm-status'),more=find('.fm-more'),loading=find('.fm-loading');
 const viewer=me?.id,hash=location.hash,alive=()=>root.isConnected&&location.hash===hash&&viewer===me?.id;
 let rows=d.items,mode=false,busy=false,ready=true,next=d.next,seq=0,timer,reader,base=new URLSearchParams(params),chosen=new Map();
 const btn=(action,label,disabled=false)=>'<button type="button" class="small-button" data-fm="'+action+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
 const ops=tab==='followers'||tab==='artists'?['remove','block']:tab==='following'?['unfollow','block']:['unblock'];
 const clear=()=>{chosen.clear();mode=false;};
 const label=op=>op==='remove'&&tab==='artists'?'팔로워 삭제':followOps[op];
 const allowed=r=>r.uid!==viewer||!!r.artist_id||tab==='blocks';
 function controls(){
  find('.fm-count').textContent=ready?(input.value.trim()?number(d.matched)+'/':'')+number(d.total)+'명':'…';
  modeBox.innerHTML=d.manage?(mode?btn('all',chosen.size===d.matched&&chosen.size?'전체 해제':'전체 선택',busy||!ready||!d.matched)+btn('cancel','취소',busy):btn('select','선택',busy||!ready||!d.total)):'';
  bulk.hidden=!mode||!chosen.size;root.classList.toggle('fm-has-bulk',!bulk.hidden);
  if(!bulk.hidden)bulk.innerHTML='<strong>'+number(chosen.size)+'명 선택</strong>'+ops.map(op=>btn(op,'선택 '+followOps[op],busy)).join('');
  more.hidden=next===null||!ready;more.disabled=busy;
 }
 const relationKey=r=>(r.artist_id?'artist/':r.profile_id?'producer/':'member/')+(r.artist_id||r.profile_id||r.uid);
 function rowHTML(r){
  const key=relationKey(r),profile=r.artist_id?'artist/'+encodeURIComponent(r.artist_id):r.profile_id?'producer/'+encodeURIComponent(r.profile_id):r.public_id?'member/'+encodeURIComponent(r.public_id):'follower/'+encodeURIComponent(r.uid);
  const pic=avatarImage({id:r.artist_id||r.profile_id,name:r.name,image_version:r.image_version},r.artist_id?'artist':'producer',false);
  const photo=mode?'<span class="fm-photo">'+pic+'</span>':'<button type="button" data-fm="photo" class="fm-photo" aria-haspopup="dialog" aria-label="'+esc(r.name)+' 프로필 미리보기">'+pic+'</button>';
  const check=mode?'<input class="fm-check" aria-label="'+esc(r.name)+' 선택" type="checkbox" '+(chosen.has(r.key)?'checked':'')+' '+(busy?'disabled':'')+'>':'';
  let acts='';
  if(!mode&&d.manage){
   if((tab==='followers'&&allowed(r))||tab==='following')acts+=profileFollowButton(key,!!r.following,!!r.follows_viewer,r.following||tab==='following'?'unfollow':'follow');
   acts+=ops.filter(op=>op!=='unfollow'&&(op!=='block'||allowed(r))).map(op=>btn(op,label(op),busy)).join('');
  }else if(!mode&&!d.own&&viewer&&allowed(r)&&(r.profile_id||r.artist_id)&&tab!=='blocks'){
   acts=profileFollowButton(key,!!r.following,!!r.follows_viewer,'');
  }
  const scope=r.scope_name?r.scope_name+'에서 차단':r.artist_id&&tab==='blocks'?'내가 차단한 아티스트':tab==='blocks'?'개인 계정':'';
  const badge=r.artist_id?'<span class="ai-mini">AI</span>':r.player_xp!=null?'<small class="fm-level" aria-label="레벨 '+playerLevel(r)+'">Lv. '+playerLevel(r)+'</small>':'';
  const name=mode?esc(r.name):'<a href="#'+esc(profile)+'">'+esc(r.name)+'</a>';
  return check+photo+'<div class="fm-name"><strong>'+name+badge+'</strong>'+(scope?'<small>'+esc(scope)+'</small>':'')+(r.bio?'<p>'+esc(r.bio)+'</p>':'')+'</div><div class="fm-actions">'+acts+'</div>';
 }
 function paint(){
  controls();
  const existing=new Map([...list.children].map(li=>[li.dataset.key,li]));
  let previous=null;
  for(const r of rows){
   let li=existing.get(r.key);existing.delete(r.key);
   if(!li){li=document.createElement('li');li.dataset.key=r.key;}
   const html=rowHTML(r);
   if(li.fmHTML!==html){li.innerHTML=html;li.fmHTML=html;}
   const nextNode=previous?previous.nextElementSibling:list.firstElementChild;
   if(nextNode!==li)list.insertBefore(li,nextNode);
   previous=li;
  }
  for(const li of existing.values())li.remove();
  if(ready&&!rows.length&&!status.textContent)status.textContent=input.value.trim()?'검색 결과가 없어요.':'아직 등록된 대상이 없어요.';
  status.classList.toggle('fm-feedback',!rows.length&&loading.hidden&&!!status.textContent);
 }
 function showLoading(show){
  if(show&&loading.hidden)loading.innerHTML=followSkeleton();
  loading.hidden=!show;list.setAttribute('aria-busy',String(show));
 }
 function invalidate(){clearTimeout(timer);reader?.abort();reader=new AbortController();return ++seq;}
 const options=()=>{const q=new URLSearchParams(base);q.set('q',input.value.trim());q.set('sort',sort.value);return q;};
 async function readPage(append=false){
  const ticket=invalidate(),revision=followRevision,q=options();if(append)q.set('offset',next);
  busy=true;status.textContent='';showLoading(true);controls();
  try{const res=await api('/api/follow-management?'+q,'GET',undefined,{fresh:true,signal:reader.signal});
   if(ticket!==seq||!alive())return;if(revision!==followRevision)return readPage(append);d=res;ready=true;rows=append?[...new Map([...rows,...res.items].map(r=>[r.key,r])).values()]:res.items;next=res.next;status.textContent='';
  }catch(e){if(ticket===seq&&alive()){if(!append){ready=false;rows=[];next=null;}status.innerHTML=esc(e.message)+' '+btn(append?'more':'retry','다시 시도');}}
  finally{if(ticket===seq&&alive()){busy=false;showLoading(false);paint();}}
 }
 async function selectAll(){
  if(chosen.size===d.matched&&chosen.size){chosen.clear();paint();return;}
  const ticket=invalidate(),q=options(),selection=new Map();q.set('keys','1');busy=true;status.textContent='선택 대상을 확인하고 있어요.';paint();
  try{let after='';do{q.set('after',after);const res=await api('/api/follow-management?'+q,'GET',undefined,{fresh:true,signal:reader.signal});if(!alive()||ticket!==seq)return;
   for(const r of res.items)selection.set(r.key,r.name);after=res.next;
  }while(after);chosen=selection;status.textContent='';}catch(e){if(alive()&&ticket===seq)status.textContent=e.message;}
  finally{if(alive()&&ticket===seq){busy=false;paint();}}
 }
 function confirmAction(op,targets){
  const scope=tab==='artists'?d.name+'의 팬 관계':tab==='blocks'?'선택한 각 계정·아티스트의 차단 범위':tab==='following'?'내가 팔로우한 계정·아티스트':'내 개인 계정';
  const detail=op==='unblock'?'차단을 풀어도 이전 팔로우는 복구되지 않아요.':op==='block'?'해당 범위에서 팔로우와 새 상호작용을 제한해요. 기존 기록은 유지돼요.':op==='remove'?'상대가 나를 팔로우한 관계만 해제해요.':'내가 보낸 팔로우만 해제해요.';
  dialog('<p class="popup-prompt">선택한 '+number(targets.size)+'명을 '+followOps[op]+'하시겠습니까?</p><p>'+esc(scope)+' · '+esc([...targets.values()].slice(0,3).join(', '))+(targets.size>3?' 외 '+number(targets.size-3)+'명':'')+'</p><p>'+esc(tab==='artists'&&op==='remove'?'이 아티스트를 향한 팔로우만 해제해요.':detail)+'</p><div class="fm-confirm">'+btn('dismiss','취소')+btn('confirm',followOps[op])+'</div>');
  const modal=document.querySelector('#dialog');
  const dismissOutside=event=>{
   if(event.target!==modal)return;
   const box=modal.getBoundingClientRect();
   if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)modal.close();
  };
  modal.addEventListener('click',dismissOutside);
  modal.addEventListener('close',()=>modal.removeEventListener('click',dismissOutside),{once:true});
  modal.querySelector('[data-fm=dismiss]').onclick=()=>modal.close();
  modal.querySelector('[data-fm=dismiss]').focus();
  modal.querySelector('[data-fm=confirm]').onclick=()=>{modal.close();if(alive())runAction(op,targets);};
 }
 function runAction(op,targets){
  if(!mode&&targets.size===1&&(op==='follow'||op==='unfollow')){
   const row=rows.find(r=>targets.has(r.key));
   if(row)return void changeRelation(row,op==='follow');
  }
  void apply(op,targets);
 }
 function syncRelation(row,following){
  row.following=following;
  const li=[...list.children].find(item=>item.dataset.key===row.key);
  if(d.own&&tab==='following'&&!following){
   rows=rows.filter(item=>item!==row);li?.remove();
   d.total=Math.max(0,d.total-1);d.matched=Math.max(0,d.matched-1);
   if(next!==null)next=Math.max(0,next-1);
   controls();if(!rows.length)paint();
  }else if(li){
   const button=li.querySelector('[data-follow]');
   if(button?.hasAttribute('data-fm'))button.dataset.fm=following?'unfollow':'follow';
   paintFollowState(relationKey(row),following,false,undefined,!!row.follows_viewer);
   li.fmHTML=rowHTML(row);
  }
 }
 async function changeRelation(row,following){
  const key=relationKey(row);
  if(pendingFollows.has(key)||busy||!alive())return;
  busy=true;input.readOnly=true;sort.disabled=true;
  pendingFollows.set(key,viewer);paintFollowState(key,!!row.following,true);
  try{
   const response=await api('/api/follow-management?'+base,'POST',{action:following?'follow':'unfollow',keys:[row.key]});
   if(viewer!==me?.id)return;
   if(!response.ok.includes(row.key))throw new Error('관계가 변경되었어요. 목록을 다시 확인해주세요.');
   const [kind,id]=key.split('/');
   updateFollowLocal(kind,id,following,{name:row.name,image_version:row.image_version});
   if(alive())syncRelation(row,following);
   const counter=[...document.querySelectorAll('[data-followers]')].find(el=>el.dataset.followers===key);
   const count=counter?Math.max(0,Number(counter.dataset.count)+(following?1:-1)):undefined;
   paintFollowState(key,following,false,count,!!row.follows_viewer);
   window.dispatchEvent(new CustomEvent('aifect:follow-saved',{detail:{kind,id,following,source:root,followsViewer:!!row.follows_viewer}}));
  }catch(error){
   if(viewer===me?.id){paintFollowState(key,!!row.following,false);toast(error.message);}
  }finally{
   if(pendingFollows.get(key)===viewer)pendingFollows.delete(key);
   if(alive()){busy=false;input.readOnly=false;sort.disabled=false;controls();}
  }
 }
 async function apply(op,targets){
  if(busy||!alive())return;busy=true;input.disabled=sort.disabled=true;const picker=find('.fm-artist');if(picker)picker.disabled=true;
  const failed=new Map(),ok=[],all=[...targets.keys()];let uncertain='';
  paint();status.textContent='처리 중…';
  try{for(let i=0;i<all.length;i+=80){if(viewer!==me?.id){uncertain='계정이 변경됐어요.';for(const k of all.slice(i))failed.set(k,targets.get(k));break;}const keys=all.slice(i,i+80);
   try{const r=await api('/api/follow-management?'+base,'POST',{action:op,keys});ok.push(...r.ok);for(const k of r.failed)failed.set(k,targets.get(k));}
   catch(e){uncertain=e.message;for(const k of all.slice(i))failed.set(k,targets.get(k));break;}
  }}finally{
   if(viewer===me?.id){++followRevision;void refreshLibrary(true).catch(()=>{});}
   if(!alive()&&viewer===me?.id)toast('팔로우 관리 · 완료 '+number(ok.length)+'명'+(failed.size?' · 확인 필요 '+number(failed.size)+'명':''));
   if(alive()){clear();input.disabled=sort.disabled=false;if(picker)picker.disabled=false;await readPage();
    if(alive()){
     const note=document.createElement('div');note.setAttribute('role','status');note.textContent='완료 '+number(ok.length)+'명'+(failed.size?' · '+(uncertain?'처리 미확인':'실패')+' '+number(failed.size)+'명':'')+(uncertain?' · '+uncertain:'');
     if(failed.size){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='처리 결과 보기';details.append(summary);for(const [title,keys] of [['완료',ok],[uncertain?'미확인':'실패',[...failed.keys()]]]){const p=document.createElement('p');p.textContent=title+': '+keys.map(k=>targets.get(k)).join(', ');details.append(p);}note.append(details);}status.prepend(note);
    }
   }
  }
 }
 let requested=input.value.trim();
 function search(){
  const term=input.value.trim();if(input.readOnly||term===requested)return;
  requested=term;invalidate();clear();rows=[];ready=false;busy=false;status.textContent='';
  showLoading(true);paint();timer=setTimeout(()=>readPage(),220);
 }
 input.oninput=e=>{if(!e.isComposing)search();};
 input.oncompositionend=search;
 sort.onchange=()=>{rows=[];ready=false;void readPage();};
 const nav=find('.fm-tabs'),active=nav.querySelector('[aria-current]');
 const revealActive=()=>{if(!active||!nav.clientWidth)return;const a=active.getBoundingClientRect(),n=nav.getBoundingClientRect();if(a.right>n.right)nav.scrollLeft+=a.right-n.right;else if(a.left<n.left)nav.scrollLeft+=a.left-n.left;};
 const tabWidth=new ResizeObserver(revealActive);tabWidth.observe(nav);
 const picker=find('.fm-artist');if(picker)picker.onchange=()=>{location.hash='follow?'+followOptions('artists',picker.value);};
 more.onclick=()=>{if(!busy)void readPage(true);};
 root.onchange=e=>{if(!e.target.matches('.fm-check'))return;const r=rows.find(r=>r.key===e.target.closest('li').dataset.key);if(r){if(e.target.checked)chosen.set(r.key,r.name);else chosen.delete(r.key);controls();}};
 root.onclick=e=>{
  const b=e.target.closest('[data-fm]');if(!b){if(busy&&e.target.closest('[data-follow]')){e.stopPropagation();return;}const item=e.target.closest('li[data-key]'),check=item?.querySelector('.fm-check');if(mode&&!busy&&check&&e.target!==check)check.click();return;}e.stopPropagation();if(busy||b.disabled)return;const action=b.dataset.fm,r=rows.find(r=>r.key===b.closest('li')?.dataset.key);
  if(action==='retry'||action==='more')return void readPage(action==='more');
  if(action==='photo'&&r){return void openProfilePreview(r.artist_id?'artist:'+r.artist_id:r.profile_id||'member:'+r.uid,b);}
  if(action==='select'||action==='cancel'){clear();mode=action==='select';paint();return;}
  if(action==='all')return void selectAll();const targets=r?new Map([[r.key,r.name]]):new Map(chosen);
  if(targets.size){if(action==='follow')runAction(action,targets);else confirmAction(action,targets);}
 };
 // Use actual fixed shell bounds, including the optional player and safe-area nav.
 const layers=[...document.querySelectorAll('.mobile-navigation,.player,#player-extension')];
 const layout=()=>{let reserved=0;for(const el of layers){const r=el.getBoundingClientRect();if(!r.height)continue;const style=getComputedStyle(el);
   // A player entering with translateY has not reached its final fixed position yet.
   const fixed=style.position==='fixed'?el.offsetHeight+(parseFloat(style.bottom)||0):0;
   reserved=Math.max(reserved,fixed,innerHeight-r.top);
  }root.style.setProperty('--fm-bottom',Math.ceil(reserved)+'px');};
 const onExternalFollow=event=>{
  if(!alive()||event.detail?.source===root)return;
  const {kind,id,following,followsViewer}=event.detail||{},row=rows.find(r=>relationKey(r)===kind+'/'+id);
  if(row&&!busy){if(followsViewer!==undefined)row.follows_viewer=followsViewer;syncRelation(row,following);}
  else if(d.own&&tab==='following'&&!busy)void readPage();
 };window.addEventListener('aifect:follow-saved',onExternalFollow);
 const watch=new ResizeObserver(layout);layers.forEach(el=>watch.observe(el));window.addEventListener('resize',layout);
 registerRouteCleanup(()=>{invalidate();watch.disconnect();tabWidth.disconnect();window.removeEventListener('aifect:follow-saved',onExternalFollow);window.removeEventListener('resize',layout);});layout();paint();
}
