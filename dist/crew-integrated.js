function crewGrowthHTML(g,c,m){
 const meter=`<strong>Lv.${g.level}</strong><p>${number(g.xp)} / ${g.next_xp===null?'MAX':number(g.next_xp)} XP</p><progress value="${g.progress}" max="1" aria-label="크루 성장 경험치"></progress><p>${g.next_xp===null?'최고 레벨 달성':number(Math.max(0,g.next_xp-g.xp))+' XP · 최대 인원 '+g.next_capacity+'명'+(g.next_available_at>Date.now()/1000?' · '+Math.ceil((g.next_available_at-Date.now()/1000)/86400)+'일 후 승급 가능':'')}</p>`;
 const missions=period=>'<section class="surface crew-mission-card"><h3>'+ (period==='day'?'오늘의 미션':'이번 주 미션')+'</h3><p>'+ (period==='day'?'매일':'월요일')+' 한국 시간 00시 갱신</p>'+g.missions.filter(x=>x.period===period).map(x=>'<div class="crew-mission"><span>'+icon(x.complete?'check':'users')+'</span><div><strong>'+esc(x.label)+'</strong><small>'+x.progress+'/'+x.target+' · '+(x.complete?'완료':'진행 중')+'</small></div><span>+'+x.xp+' XP</span></div>').join('')+'</section>';
 return '<section class="crew-growth"><h2>크루 소개</h2><p>'+esc(c.description)+'</p><div class="crew-growth-grid"><section class="surface">'+meter+'</section><section class="surface"><h3>크루 수용 인원</h3><strong>'+c.members+' / '+c.capacity+'명</strong><p>다음 레벨 정원 '+g.next_capacity+'명</p></section></div><p class="field-help">제작곡·커버·완성 듀엣 공개는 곡마다 한 번, 크루원별 하루 최대 5회 반영돼요. 최고 레벨은 최소 184일(약 6개월)이 필요해요. 한국 시간 자정에 한도가 초기화돼요.</p><h2>성장 미션 달성 현황</h2><div class="crew-growth-grid">'+missions('day')+missions('week')+'</div><h2>레벨별 인원 확장</h2><div class="crew-level-steps">'+(g.levels||[]).map(l=>'<div class="surface" '+(l.level===g.level?'aria-current="step"':'')+'><strong>Lv.'+l.level+'</strong><span>'+l.capacity+'명</span><small>'+number(l.xp)+' XP · 최소 '+l.min_days+'일</small></div>').join('')+'</div>'+(m?'<button class="small-button" data-leave-crew="'+esc(c.id)+'" '+(m.role==='owner'?'disabled title="크루장을 위임한 후 탈퇴할 수 있어요."':'')+'>크루 탈퇴</button>':'')+'</section>';
}
function crewNoticeFeed(items,cid,canManage){return '<div class="section-heading"><h2>크루 공지</h2></div>'+(canManage?'<button class="primary-button" data-notice-new="'+esc(cid)+'">공지 등록</button>':'')+(items.length?items.map(n=>'<article class="surface crew-notice"><header><h3>'+(n.is_pinned?'<span class="crew-pin">중요</span> ':'')+esc(n.title)+'</h3><small>'+esc(n.author_name||'크루 운영진')+' · '+new Date(n.created*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+'</small></header><p>'+esc(n.body)+'</p><div class="crew-notice-images">'+n.images.map(i=>'<button data-gallery-photo="'+esc(i.url)+'" data-photo-label="공지 이미지"><img src="'+esc(i.url)+'" alt="공지 첨부 이미지"></button>').join('')+'</div>'+(canManage?'<div class="inline-actions"><button class="small-button" data-notice-edit="'+esc(n.id)+'">수정</button><button class="text-link" data-notice-delete="'+esc(n.id)+'">삭제</button></div>':'')+'</article>').join(''):myEmpty('등록된 공지가 없어요.'));}
async function bindCrewIntegrated(){
 const active=document.querySelector('.crew-room-tabs .active');
 if(active?.parentElement){const nav=active.parentElement;nav.scrollLeft+=Math.max(0,active.getBoundingClientRect().right-nav.getBoundingClientRect().right);}
 const root=$('[data-crew-notices]');if(!root)return;try{const cid=root.dataset.crewNotices,d=await api('/api/crews/'+cid+'/notices','GET',undefined,{fresh:true});if(!root.isConnected)return;root.innerHTML=crewNoticeFeed(d.items,cid,d.can_manage);root.onclick=async e=>{const b=e.target.closest('[data-notice-new],[data-notice-edit],[data-notice-delete]');if(!b)return;const n=d.items.find(n=>n.id===(b.dataset.noticeEdit||b.dataset.noticeDelete));if(b.dataset.noticeDelete){if(!confirm('이 공지를 삭제할까요?'))return;try{await api('/api/crews/'+cid+'/notices/'+n.id,'DELETE');await bindCrewIntegrated();}catch(err){toast(err.message);}return;}crewNoticeEditor(cid,n);};}catch(e){root.textContent=e.message;}}
function crewNoticeEditor(cid,n){
 const ids=(n?.images||[]).map(i=>i.id);dialog('<h2>'+(n?'공지 수정':'공지 등록')+'</h2><form id="crew-notice-form" class="upload-form"><label class="form-field">제목<input name="title" maxlength="80" required value="'+esc(n?.title||'')+'"></label><label class="form-field">내용<textarea name="body" maxlength="2000" required>'+esc(n?.body||'')+'</textarea></label><label class="checkbox-line"><input type="checkbox" name="is_pinned" '+(n?.is_pinned?'checked':'')+'>중요 공지 (최대 2개)</label><div id="notice-existing">'+(n?.images||[]).map(i=>'<label class="checkbox-line"><input name="keep" type="checkbox" value="'+esc(i.id)+'" checked><img width="50" height="50" src="'+esc(i.url)+'" alt="첨부 사진">유지</label>').join('')+'</div><label class="form-field">이미지 추가 (총 4장 이하)<input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp"></label><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>');
 const f=$('#crew-notice-form');const uploaded=new Map();f.onsubmit=busyForm(f,async fd=>{const images=fd.getAll('keep').filter(x=>ids.includes(x)),files=fd.getAll('photos').filter(f=>f.size);if(images.length+files.length>4)throw Error('이미지는 최대 4장까지 첨부해주세요.');for(const file of files){if(!uploaded.has(file)){const result=await uploadFile('/api/crews/'+cid+'/notice-images',file);uploaded.set(file,result.id);}images.push(uploaded.get(file));}await api('/api/crews/'+cid+'/notices'+(n?'/'+n.id:''),n?'PATCH':'POST',{title:fd.get('title'),body:fd.get('body'),is_pinned:fd.get('is_pinned')==='on',images});$('#dialog').close();await bindCrewIntegrated();});
}

document.addEventListener('click',event=>{if(event.target.closest('[data-focus-crew-search]'))document.querySelector('#crew-search input')?.focus();});

const workTypes=[['original','제작곡'],['cover','커버'],['duet','듀엣'],['dubbing','더빙']];
function workIcon(kind){
 if(kind==='dubbing')return '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10h18v11H3zM3 10l-1-5 18-3 1 5zM7 4l3 4m3-5 3 4"/></svg>';
 return icon(({original:'music',cover:'mic',duet:'users'})[kind],16);
}
function workBrowserHTML(title,tracks=[],dubs=[],own=false){
 const groups=new Map();
 for(const t of [...tracks,...dubs]){
  const kind=t.kind==='dubbing'?'dubbing':t.kind==='original'?'original':t.cover_mode==='duet'?'duet':'cover';
  const root=t.duet_parent_id||t.root_id||t.id,key=kind+':'+root;
  if(!groups.has(key))groups.set(key,{kind,root,items:[]});
  groups.get(key).items.push(t);
 }
 const groupHTML=g=>{
  const t=g.items.find(v=>v.id===g.root)||g.items[0],children=g.items.filter(v=>v!==t),kind=g.kind;
  const isDub=kind==='dubbing',recruit=g.items.some(v=>v.recruiting);
  const privateMark=v=>own&&(isDub?v.visibility==='private':v.status==='hidden')?'<span class="work-private-mark" role="img" aria-label="비공개" title="비공개">'+icon('lock')+'</span>':'';
  const href=(v)=>isDub?'#dubbing/'+esc(v.id):v.status&&v.status!=='published'?'#manage/'+esc(v.id):'#song/'+esc(v.id);
  const art=v=>isDub?'<img class="work-cover" src="'+esc(AifectDubbing.dubbingGenreArtwork(v.genres||[]))+'" alt="">':cover(v,'work-cover');
  const play=v=>v.status&&v.status!=='published'||isDub&&(v.state!=='complete'||v.audio_ready===0)?'':'<button type="button" class="list-action work-play" '+(isDub?'data-mp-dubbing-play':'data-play')+'="'+esc(v.id)+'" aria-label="'+esc(v.title)+' 재생">'+icon('ui-play-action')+'</button>';
  const joinItem=g.items.find(v=>v.can_join);
  const join=joinItem?'<a class="small-button work-join" href="'+(isDub?href(joinItem):'#sing/'+esc(joinItem.original_id)+'?duet='+esc(joinItem.id))+'">참여하기</a>':'';
  const badge=recruit?'<span class="work-recruit">모집중</span>':'';
  const lead='<a class="work-title" href="'+href(t)+'">'+workIcon(kind)+'<strong>'+esc(t.title)+'</strong></a>';
  const meta='<small>'+esc(t.producer||t.owner_name||'')+'</small>';
  const manage=own&&me?.id===(t.user_id||t.owner_id)?'<a class="text-link work-manage" href="'+(isDub?href(t):'#manage/'+esc(t.id))+'">관리</a>':'';
  const wide=kind==='duet'||isDub;
  const group=wide?'<div class="work-parent"><a class="work-art" href="'+href(t)+'">'+art(t)+privateMark(t)+badge+'</a><div class="work-copy">'+lead+meta+'</div>'+join+play(t)+'</div>'+((kind==='duet'||children.length)?'<details><summary>참여 버전 '+children.length+'개</summary>'+children.map(v=>'<div class="work-child"><a href="'+href(v)+'">'+privateMark(v)+esc(v.producer||v.owner_name||v.title)+'</a>'+(own&&me?.id===(v.user_id||v.owner_id)&&!isDub?'<a class="text-link" href="#manage/'+esc(v.id)+'">관리</a>':'')+play(v)+'</div>').join('')+'</details>':'')+manage:'<div class="work-card-art"><a href="'+href(t)+'">'+art(t)+privateMark(t)+badge+'</a>'+play(t)+'</div>'+lead+meta+manage;
  return '<article class="'+(wide?'work-wide':'work-card')+'" data-kind="'+kind+'" data-recruit="'+!!recruit+'">'+group+'</article>';
 };
 const cards=[...groups.values()].sort((a,b)=>Math.max(...b.items.map(t=>t.created||0))-Math.max(...a.items.map(t=>t.created||0))).map(groupHTML).join('');
 return '<section class="work-browser"><h2>'+esc(title)+' <small data-work-count>'+groups.size+'개</small></h2><div class="work-toolbar"><div class="work-legend">'+workTypes.map(([k,n])=>'<span class="work-key-'+k+'">'+workIcon(k)+n+'</span>').join('')+'</div><select aria-label="작품 필터" data-work-filter>'+[['all','전체'],['recruit','모집중'],...workTypes].map(([k,n])=>'<option value="'+k+'">'+n+'</option>').join('')+'</select></div><div class="work-grid">'+cards+'</div><p class="mp-empty" data-work-empty '+(cards?'hidden':'')+'>조건에 맞는 작품이 없어요.</p></section>';
}
document.addEventListener('change',e=>{
 if(!e.target.matches('[data-work-filter]'))return;
 const root=e.target.closest('.work-browser');if(!root)return;
 const filter=e.target.value;let n=0;
 for(const el of root.querySelector('.work-grid').children){
  el.hidden=!(filter==='all'||filter===el.dataset.kind||filter==='recruit'&&el.dataset.recruit==='true');
  if(!el.hidden)n++;
 }
 root.querySelector('[data-work-count]').textContent=n+'개';root.querySelector('[data-work-empty]').hidden=n>0;
});
