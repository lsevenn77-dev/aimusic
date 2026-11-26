// Shared song entry / song-story PICK behavior. All media uses the existing
// player and all recording links retain loadSingRoute's server-side gates.
const songEntryStates=new Map(),composerPickPending=new Set();
let songEntryRequest=0;
function isSongEntryRoute(raw){
 const [path,query='']=raw.replace(/^#/,'').split('?'),q=new URLSearchParams(query);
 return /^sing\/[^/]+$/.test(path)&&!q.has('duet')&&q.get('draft')!=='1'&&!['solo','duet'].includes(q.get('mode'));
}
function songEntryState(id){
 const key=(me?.id||'guest')+':'+id;
 if(!songEntryStates.has(key))songEntryStates.set(key,{tab:'all',scroll:0,loaded:50,origin:''});
 while(songEntryStates.size>24)songEntryStates.delete(songEntryStates.keys().next().value);
 return songEntryStates.get(key);
}
function songEntryListHTML(d,tab){
 return d.covers.length?d.covers.map((t,i)=>songCoverItemHTML(t,tab,i+1,true)).join('')+songCoversMoreHTML(d):'<p class="empty-note">'+(tab==='duet'?'참여를 기다리는 듀엣이 없습니다':'아직 등록된 커버가 없습니다')+'</p>';
}
function songEntryPanelHTML(t,d,tab,error=''){
 return `<section class="song-covers-panel song-entry-panel" data-song-entry="true" data-cover-original="${esc(t.id)}" ${songPickAttributes(d?.pick)}><nav class="tabs covers-sort song-entry-tabs" role="tablist" aria-label="노래 참여 작품">${[['all','인기커버'],['duet','참여 대기 듀엣']].map(([key,label])=>`<button type="button" class="tab ${tab===key?'active':''}" role="tab" id="song-entry-tab-${key}" aria-controls="song-entry-list" aria-selected="${tab===key}" tabindex="${tab===key?'0':'-1'}" data-song-entry-tab="${key}">${label}${d?'<span class="song-cover-tab-count">'+number(d.counts[key])+'</span>':''}</button>`).join('')}</nav><div class="song-cover-list" id="song-entry-list" role="tabpanel" aria-labelledby="song-entry-tab-${tab}" aria-live="polite">${error?songEntryErrorHTML(error):d?songEntryListHTML(d,tab):'<p role="status">참여 작품을 불러오는 중…</p>'}</div></section>`;
}
function songEntryErrorHTML(message){return '<div class="song-entry-error" role="alert"><p>'+esc(message)+'</p><button type="button" class="small-button" data-song-entry-retry>다시 시도</button></div>';}
function songEntryHeaderHTML(t){
 const id=esc(t.id),title=esc(t.title),action=(mode,label,primary)=>t.karaoke_ready?`<a class="${primary?'primary-button':'small-button'}" href="#sing/${id}?mode=${mode}">${icon(mode==='solo'?'mic':'users')}<span>${label}</span></a>`:`<button class="${primary?'primary-button':'small-button'}" disabled>${icon(mode==='solo'?'mic':'users')}<span>${label}</span></button>`;
 return `<header class="song-entry-heading"><button type="button" class="icon-button" data-song-entry-back aria-label="이전 화면으로 돌아가기">${icon('chevron-left')}</button><h1>노래하기</h1></header><section class="song-entry-summary" aria-label="부를 곡 정보">${cover(t,'song-entry-art')}<div class="song-entry-copy"><h2 title="${title}">${title}</h2><div class="song-entry-credits">${credits(t)}<span>작곡가 ${trackNickname(t,'producer')}</span></div><p>${[t.genres?.length?t.genres.join(' · '):t.genre,time(t.duration)].filter(Boolean).map(esc).join(' · ')}</p><button type="button" class="small-button" data-play="${id}" data-community-toggle>${icon('play')}<span>원곡 듣기</span></button></div></section><div class="song-entry-actions">${action('solo','솔로로 부르기',true)}${action('duet','새 듀엣 시작하기',false)}</div>${t.karaoke_ready?'':'<p class="field-help">지금은 이 곡의 녹음을 준비할 수 없습니다.</p>'}`;
}
async function songEntryView(base,param,raw,readApi){
 if(base!=='sing'||!param||!isSongEntryRoute(raw))return null;
 const {track:t}=await readApi('/api/tracks/'+encodeURIComponent(param));
 if(t.kind!=='original')throw new Error('부를 원곡을 선택해 주세요.');
 const state=songEntryState(param);let data,error='';
 try{
  data=await readApi('/api/tracks/'+encodeURIComponent(param)+'/covers?view='+state.tab);
  // Rebuild the previously loaded page range before restoring scroll on Back.
  while(data.next_offset!==null&&data.covers.length<state.loaded){
   const next=await readApi('/api/tracks/'+encodeURIComponent(param)+'/covers?view='+state.tab+'&offset='+data.next_offset+'&pick_revision='+data.pick.revision);
   data={...next,covers:[...data.covers,...next.covers]};
  }
 }catch(e){if(e.name==='AbortError')throw e;error=e.message;}
 return {songEntry:param,html:'<div class="song-entry">'+songEntryHeaderHTML(t)+songEntryPanelHTML(t,data,state.tab,error)+'</div>',tracks:[t,...(data?.covers||[])]};
}
function bindSongEntry(id){
 const root=document.querySelector('.song-entry');if(!root)return;
 const state=songEntryState(id),account=me?.id||'guest';
 bindSongCoverList();bindSongEntryTabs(root.querySelector('.song-entry-panel'));
 root.querySelector('[data-song-entry-back]').onclick=()=>returnFromSongEntry(id);
 registerRouteCleanup(()=>{if(account===(me?.id||'guest')){state.scroll=window.scrollY||0;state.loaded=Math.max(50,root.querySelectorAll('.song-cover-list>.song-cover-row,.song-cover-list>.song-cover-group').length);}});
 requestAnimationFrame(()=>{if(root.isConnected)window.scrollTo({top:state.scroll,behavior:'instant'});});
}
function bindSongEntryTabs(panel){
 if(!panel||panel.dataset.entryBound)return;panel.dataset.entryBound='true';
 panel.addEventListener('click',event=>{
  const button=event.target.closest('[data-song-entry-tab],[data-song-entry-retry]');if(!button)return;
  const state=songEntryState(panel.dataset.coverOriginal),tab=button.dataset.songEntryTab||state.tab;
  if(button.dataset.songEntryTab&&button.getAttribute('aria-selected')==='true')return;
  state.tab=tab;state.loaded=50;
  void loadSongEntryTab(panel,tab);
 });
 panel.querySelector('[role=tablist]').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=[...panel.querySelectorAll('[role=tab]')],index=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?1:(index+1)%2;
  buttons[next].focus();buttons[next].click();
 });
}
async function loadSongEntryTab(panel,tab){
 const ticket=++songEntryRequest,account=me?.id||'guest',id=panel.dataset.coverOriginal,list=panel.querySelector('.song-cover-list');
 panel.querySelectorAll('[data-song-entry-tab]').forEach(b=>{const selected=b.dataset.songEntryTab===tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
 list.setAttribute('aria-labelledby','song-entry-tab-'+tab);list.setAttribute('aria-busy','true');list.innerHTML='<p role="status">참여 작품을 불러오는 중…</p>';
 try{
  const d=await api('/api/tracks/'+encodeURIComponent(id)+'/covers?view='+tab);
  if(!panel.isConnected||ticket!==songEntryRequest||account!==(me?.id||'guest'))return;
  remember(d.covers);applySongPickAttributes(panel,d.pick);list.innerHTML=songEntryListHTML(d,tab);
  panel.querySelectorAll('[data-song-entry-tab]').forEach(b=>{let count=b.querySelector('.song-cover-tab-count');if(!count){count=document.createElement('span');count.className='song-cover-tab-count';b.append(count);}count.textContent=number(d.counts[b.dataset.songEntryTab]);});
  paintInteractions();syncSongCoverPlayback();
 }catch(error){if(panel.isConnected&&ticket===songEntryRequest&&account===(me?.id||'guest'))list.innerHTML=songEntryErrorHTML(error.message);}
 finally{if(ticket===songEntryRequest)list.removeAttribute('aria-busy');}
}
function composerPickPerformer(t){return [t?.duet_partner,t?.producer].filter(Boolean).join(' & ')||'표시할 수 없는 커버';}
function applySongPickAttributes(panel,pick){Object.assign(panel.dataset,{pickId:pick?.cover_id||'',pickExists:String(!!(pick?.has_pick||pick?.cover_id)),pickRevision:String(pick?.revision||0),pickManage:String(!!pick?.can_manage),pickPerformer:composerPickPerformer(pick?.cover)});}
function composerPickMenuHTML(t){
 const panel=document.querySelector('.song-covers-panel');
 if(!panel||panel.dataset.coverOriginal!==t.original_id||panel.dataset.pickManage!=='true'||t.kind!=='cover'||!(t.cover_mode==='solo'||t.cover_mode==='duet'&&t.duet_parent_id&&!t.duet_open))return '';
 const label=panel.dataset.pickId===t.id?'PICK 해제':panel.dataset.pickExists==='true'?'이 커버로 PICK 변경':'작곡가 PICK으로 지정';
 return `<button type="button" class="track-option composer-pick-option" data-composer-pick="${esc(t.id)}" data-pick-original="${esc(t.original_id)}" ${composerPickPending.has(t.original_id)?'disabled':''}>${icon('composer-pin')}<span>${label}</span>${icon('chevron')}</button>`;
}
async function refreshComposerPickPanel(panel){
 if(!panel?.isConnected)return;
 const storyTabs=songCoverTabPanels.get(panel);
 if(storyTabs)return storyTabs.refresh();
 const id=panel.dataset.coverOriginal,entry=panel.dataset.songEntry==='true',account=me?.id||'guest',requested=entry?songEntryState(id).tab:new URLSearchParams(location.hash.split('?')[1]||'').get('covers'),tab=['all','duet','recent'].includes(requested)?requested:'all';
 const targetCount=Math.max(50,panel.querySelectorAll('.song-cover-list>.song-cover-row,.song-cover-list>.song-cover-group').length);
 let d=await api('/api/tracks/'+encodeURIComponent(id)+'/covers?view='+tab);
 while(d.next_offset!==null&&d.covers.length<targetCount){const next=await api('/api/tracks/'+encodeURIComponent(id)+'/covers?view='+tab+'&offset='+d.next_offset+'&pick_revision='+d.pick.revision);d={...next,covers:[...d.covers,...next.covers]};}
 if(!panel.isConnected||account!==(me?.id||'guest')||entry&&tab!==songEntryState(id).tab)return;
 remember(d.covers);const scroll=window.scrollY;
 panel.outerHTML=entry?songEntryPanelHTML({id},d,tab):songCoversPanelHTML({id},d,tab);
 bindSongCoverList();if(entry)bindSongEntryTabs(document.querySelector('.song-entry-panel'));
 paintInteractions();window.scrollTo({top:scroll,behavior:'instant'});
}
function confirmComposerPick(oldName,newName){
 return new Promise(resolve=>{
  dialog('<section class="composer-pick-confirm"><h2>이 커버로 PICK을 변경할까요?</h2><dl><div><dt>현재 PICK</dt><dd>'+esc(oldName)+'</dd></div><div><dt>새 PICK</dt><dd>'+esc(newName)+'</dd></div></dl><div class="inline-actions"><button type="button" class="small-button" data-pick-cancel>취소</button><button type="button" class="primary-button" data-pick-confirm>변경하기</button></div></section>');
  const modal=$('#dialog'),previous=history.state;let accepted=false,back=false,done=false;
  history.pushState({...previous,composerPickConfirm:true},'');
  const onBack=()=>{back=true;modal.close();};
  const finish=()=>{if(done)return;done=true;window.removeEventListener('popstate',onBack);modal.removeEventListener('click',outside);if(!back&&history.state?.composerPickConfirm)history.back();resolve(accepted);};
  const outside=event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}};
  window.addEventListener('popstate',onBack);modal.addEventListener('close',finish,{once:true});modal.addEventListener('click',outside);
  modal.querySelector('[data-pick-cancel]').onclick=()=>modal.close();
  modal.querySelector('[data-pick-confirm]').onclick=()=>{accepted=true;modal.close();};
 });
}
async function changeComposerPick(button){
 const id=button.dataset.pickOriginal,tid=button.dataset.composerPick,panel=document.querySelector('.song-covers-panel'),account=me?.id;
 if(!panel||panel.dataset.coverOriginal!==id||composerPickPending.has(id))return;
 const old=panel.dataset.pickId,revision=Number(panel.dataset.pickRevision),t=trackMap.get(tid),coverId=old===tid?null:tid;
 composerPickPending.add(id);button.disabled=true;
 try{
  if(panel.dataset.pickExists==='true'&&old!==tid){if(!await confirmComposerPick(panel.dataset.pickPerformer,composerPickPerformer(t)))return;}
  else $('#dialog').close();
  if(!panel.isConnected||account!==me?.id)return;
  const pick=await api('/api/tracks/'+encodeURIComponent(id)+'/cover-pick','PUT',{cover_id:coverId,expected_revision:revision});
  if(account!==me?.id)return;
  songEntryRequest++;
  if(panel.isConnected)applySongPickAttributes(panel,pick);
  // api() invalidates the shared read caches for both pages, without touching audio.
  try{await refreshComposerPickPanel(panel);}catch(error){
   if(songCoverTabPanels.has(panel)){toast('PICK은 저장했지만 목록을 다시 불러오지 못했습니다.');return;}
   if(panel.isConnected){
    const list=panel.querySelector('.song-cover-list');
    list.innerHTML='<div class="song-entry-error" role="alert"><p>PICK은 저장했지만 목록을 다시 불러오지 못했습니다.</p><button type="button" class="small-button" data-pick-refresh>다시 시도</button></div>';
    list.querySelector('[data-pick-refresh]').onclick=()=>{void refreshComposerPickPanel(panel).catch(e=>toast(e.message));};
   }
   return;
  }
  toast(coverId?'작곡가 PICK을 저장했습니다.':'PICK을 해제했습니다.');
 }catch(error){
  toast(error.message);
  if(error.status===409)await refreshComposerPickPanel(panel).catch(()=>{});
 }finally{composerPickPending.delete(id);button.disabled=false;}
}
function rememberSongEntryOrigin(id,hash,key){
 if(hash.split('?')[0]==='#sing/'+encodeURIComponent(id))return;
 Object.assign(songEntryState(id),{origin:hash,originKey:key});
}
function returnFromSongEntry(id){
 const state=songEntryState(id),nav=window.navigation,fallback=()=>{location.hash=state.origin||'#song/'+encodeURIComponent(id);};
 if(state.originKey&&nav?.entries().some(entry=>entry.key===state.originKey))nav.traverseTo(state.originKey).finished.catch(fallback);
 else fallback();
}
document.addEventListener('click',event=>{
 const pick=event.target.closest('[data-composer-pick]');if(pick){event.preventDefault();void changeComposerPick(pick);return;}
 const link=event.target.closest('a[href^="#sing/"]');
 if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!isSongEntryRoute(link.getAttribute('href')))return;
 const id=decodeURIComponent(link.getAttribute('href').split('?')[0].slice(6));
 rememberSongEntryOrigin(id,location.hash,window.navigation?.currentEntry?.key);
});
