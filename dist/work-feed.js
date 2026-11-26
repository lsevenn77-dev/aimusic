const workFeedTypes=[
 ['all','전체'],['original','제작곡'],['cover','커버'],['duet','듀엣'],['dubbing','더빙'],['recruit','모집 중']
];
const workFeedLabels=new Map(workFeedTypes);
const workFeedBatch=16;
const workFeedStates=new Map();
let workFeedAccount;

function workFeedState(key){
 const account=me?.id||'guest';
 if(account!==workFeedAccount){workFeedStates.clear();workFeedAccount=account;}
 let state=workFeedStates.get(key);
 if(!state){state={filter:'all',order:'recent',scroll:0,pages:new Map()};workFeedStates.set(key,state);}
 if(workFeedStates.size>12)workFeedStates.delete(workFeedStates.keys().next().value);
 return state;
}

function workFeedKind(work){
 return work.kind==='cover'&&work.cover_mode==='duet'?'duet':work.kind;
}

function workFeedLink(work){
 const route=work.kind==='dubbing'?'dubbing':work.owned&&!work.work_public?'manage':'song';
 return '#'+route+'/'+encodeURIComponent(work.id);
}

function workFeedPlay(work){
 const dub=work.kind==='dubbing',playable=dub?work.audio_ready&&work.state==='complete':work.work_public!==false&&work.work_public!==0;
 if(!playable)return '';
 const action=dub?'data-mp-dubbing-play':'data-play';
 return `<button type="button" class="icon-button work-feed-play" ${action}="${esc(work.id)}" data-work-feed-play
  ${dub?'':'data-community-toggle'} aria-label="${esc(work.title)} 재생" aria-pressed="false">${icon('ui-play-action',32)}</button>`;
}

function workFeedDate(date){
 if(!(date>0))return '';
 const value=new Date(date*1000);
 if(!Number.isFinite(value.getTime()))return '';
 const absolute=value.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 const seconds=Math.max(0,Math.floor(Date.now()/1000-date));
 const relative=seconds<60?'방금 전':seconds<3600?Math.floor(seconds/60)+'분 전':
  seconds<86400?Math.floor(seconds/3600)+'시간 전':seconds<7*86400?Math.floor(seconds/86400)+'일 전':
  value.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
 return `<time datetime="${value.toISOString()}" title="${esc(absolute)}">${relative}</time>`;
}

function workFeedMetrics(work){
 const metrics=[['plays','재생','회'],['likes','좋아요','개'],['comments','댓글','개']];
 return `<span class="work-feed-metrics">${metrics.filter(([key])=>work[key]!=null).map(([key,label,unit])=>
  `<span class="metric-inline" aria-label="${label} ${number(work[key])}${unit}">${icon('ui-'+(key==='likes'?'heart':key==='comments'?'comment':key),14)}<span>${number(work[key])}</span></span>`
 ).join('')}</span>`;
}

function workFeedRow(item,{metadata,actions,metrics=false}){
 const {work,kind,key,date}=item,dub=kind==='dubbing',title=esc(work.title),href=workFeedLink(work);
 const picture=dub?`<img class="work-feed-photo" loading="lazy" decoding="async" alt="" src="${esc(work.posterUrl||AifectDubbing.dubbingGenreArtwork(work.genres||[]))}">`:
  cover(work,'work-feed-photo');
 const people=dub&&work.role_count>0&&work.participants!=null?
  `<span class="work-feed-participants" aria-label="참여 인원 ${number(work.participants)}명, 정원 ${number(work.role_count)}명">${number(work.participants)}/${number(work.role_count)}</span>`:'';
 const privateWork=item.privateWork?`<span class="work-feed-private" aria-label="비공개" title="비공개">${icon('lock',13)}</span>`:'';
 const meta=metadata(item),note=kind==='cover'&&work.description?.trim();
 const buttons=actions(item)+workFeedPlay(work);
 const versions=item.versions||[];
 return `<article class="work-feed-row" data-feed-key="${esc(key)}" data-work-kind="${kind}">
  <a class="work-feed-art" href="${href}" aria-label="${title} 상세보기">${picture}</a>
  <div class="work-feed-copy">
   <div class="work-feed-labels"><span class="work-feed-type">${workFeedLabels.get(kind)}</span>${people}${privateWork}</div>
   <a class="work-feed-title" href="${href}" title="${title}">${title}</a>
   <div class="work-feed-meta">${meta?'<span class="work-feed-credit">'+meta+'</span>':''}${workFeedDate(date)}${metrics?workFeedMetrics(work):''}</div>
   ${note?'<p class="work-feed-note">'+esc(note)+'</p>':''}
  </div>
  ${buttons?'<div class="work-feed-actions">'+buttons+'</div>':''}
  ${versions.length?`<details class="work-feed-versions"><summary>참여 버전 ${number(versions.length)}개</summary>
    ${versions.map(version=>`<div><a href="${workFeedLink(version)}">${esc(version.producer||version.owner_name||version.title)}</a>${workFeedPlay(version)}</div>`).join('')}
   </details>`:''}
 </article>`;
}

function workFeedHTML({order=false,label='작품'}={}){
 return `<section class="work-feed" aria-label="${label}" data-work-feed>
  <div class="work-feed-toolbar">
   <div class="work-feed-filters" role="group" aria-label="작품 필터">
    ${workFeedTypes.map(([key,name])=>`<button type="button" data-feed-filter="${key}" aria-pressed="${key==='all'}">${name}</button>`).join('')}
   </div>
   ${order?'<select data-dropdown="sm" data-feed-order aria-label="작품 정렬"><option value="recent">최신순</option><option value="popular">인기순</option></select>':''}
  </div>
  <div class="work-feed-grid" data-feed-grid></div>
  <div class="work-feed-foot">
   <p class="work-feed-status" data-feed-status role="status"></p>
   <button type="button" class="small-button work-feed-next" data-feed-next hidden>이전 작품 더 불러오기</button>
  </div>
 </section>`;
}

function workFeedMatches(item,filter){
 return filter==='all'||item.kind===filter||filter==='recruit'&&item.recruiting;
}

function compareWorkFeed(a,b){
 return b.date-a.date||(a.key<b.key?-1:a.key>b.key?1:0);
}

function mountWorkFeed(root,{state,loadPage,emptyText,metadata,actions,onAction,metrics,restoreScroll=false}){
 const grid=root.querySelector('[data-feed-grid]'),next=root.querySelector('[data-feed-next]');
 const status=root.querySelector('[data-feed-status]'),order=root.querySelector('[data-feed-order]');
 const filters=[...root.querySelectorAll('[data-feed-filter]')],controller=new AbortController();
 const signal=controller.signal,account=me?.id||'guest';
 const isMounted=()=>root.isConnected&&!signal.aborted&&account===(me?.id||'guest');
 const rowsOptions={metadata,actions,metrics};
 let page,restore=restoreScroll&&state.scroll;
 let revision=0;
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  if(entries.some(entry=>entry.isIntersecting)&&!page.error)void more();
 },{rootMargin:'150px 0px'}):null;
 function syncPlay(){
  for(const button of root.querySelectorAll('[data-work-feed-play]')){
   const playing=!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active&&(button.dataset.play||button.dataset.mpDubbingPlay)===current?.id;
   if(button.getAttribute('aria-pressed')===String(playing))continue;
   const label=button.getAttribute('aria-label');
   button.setAttribute('aria-label',label.replace(/ (재생|일시정지)$/u,playing?' 일시정지':' 재생'));
   button.setAttribute('aria-pressed',String(playing));
   button.innerHTML=icon(playing?'ui-pause-action':'ui-play-action',32);
  }
 }
 function syncTracks(){
  routeTracks=remember([...page.items.values()].flatMap(item=>[item.work,...(item.versions||[])]).filter(work=>
   work.kind!=='dubbing'&&work.work_public!==false&&work.work_public!==0));
  syncPlay();
 }
 function setStatus(){
  observer?.unobserve(next);
  next.hidden=(!page.started||!page.cursor)&&!page.error;
  next.disabled=!!page.pending;
  next.textContent=page.error?'다시 시도':'이전 작품 더 불러오기';
  if(!next.hidden&&!next.disabled&&!page.error)observer?.observe(next);
  status.textContent=page.error||(page.pending?'작품을 불러오는 중…':
   page.started&&!page.items.size?emptyText(state.filter):'');
  grid.setAttribute('aria-busy',String(!!page.pending));
 }
 function restorePosition(){
  if(!restore||!page.started)return;
  const top=restore;restore=0;
  requestAnimationFrame(()=>{if(isMounted()&&root.getClientRects().length)window.scrollTo({top,behavior:'instant'});});
 }
 async function more(){
  if(!isMounted()||page.pending||page.started&&!page.cursor)return;
  const target=page,stamp=revision,requestOrder=state.order,filter=state.filter;
  target.pending=true;target.error='';setStatus();
  try{
   const result=await loadPage({filter,order:requestOrder,cursor:target.cursor,signal});
   if(!isMounted()||stamp!==revision)return;
   const added=result.items.filter(item=>{
    if(target.items.has(item.key))return false;
    target.items.set(item.key,item);return true;
   });
   const previous=target.cursor;
   target.cursor=result.next_cursor===previous?null:result.next_cursor;
   target.started=true;
   if(page===target){grid.insertAdjacentHTML('beforeend',added.map(item=>workFeedRow(item,rowsOptions)).join(''));syncTracks();}
  }catch(error){
   if(isMounted()&&stamp===revision&&error.name!=='AbortError')target.error=error.message||'작품을 불러오지 못했습니다.';
  }finally{
   target.pending=false;
   if(isMounted()&&page===target){setStatus();restorePosition();if(stamp!==revision&&!target.started)void more();}
  }
 }
 function select(){
  const key=state.filter+':'+state.order;
  if(!state.pages.has(key))state.pages.set(key,{filter:state.filter,items:new Map(),cursor:null,started:false,pending:false,error:''});
  page=state.pages.get(key);
  for(const button of filters)button.setAttribute('aria-pressed',String(button.dataset.feedFilter===state.filter));
  grid.innerHTML=[...page.items.values()].map(item=>workFeedRow(item,rowsOptions)).join('');
  syncTracks();setStatus();restorePosition();
  if(!page.started&&!page.error)void more();
 }
 function replaceItems(keys,items){
  revision++;
  const fresh=new Map(items.map(item=>[item.key,item]));
  for(const entry of state.pages.values()){
   if(!entry.started)continue;
   const last=[...entry.items.values()].at(-1);
   for(const key of keys){
    const prior=entry.items.get(key),item=fresh.get(key);
    if(item&&(prior||!last||!entry.cursor||compareWorkFeed(item,last)<=0)&&workFeedMatches(item,entry.filter))entry.items.set(key,item);
    else if(prior)entry.items.delete(key);
   }
   entry.items=new Map([...entry.items.values()].sort(compareWorkFeed).map(item=>[item.key,item]));
  }
  for(const row of [...grid.children]){
   if(!keys.includes(row.dataset.feedKey))continue;
   row.remove();
  }
  let previous=null;
  const rendered=new Map([...grid.children].map(row=>[row.dataset.feedKey,row]));
  for(const item of page.items.values()){
   let row=rendered.get(item.key);
   if(!row){
    const template=document.createElement('template');template.innerHTML=workFeedRow(item,rowsOptions);
    row=template.content.firstElementChild;
    if(previous)previous.after(row);else grid.prepend(row);
   }
   previous=row;
  }
  syncTracks();setStatus();
 }
 for(const button of filters)button.onclick=()=>{
  if(state.filter===button.dataset.feedFilter)return;
  state.filter=button.dataset.feedFilter;restore=0;select();
 };
 if(order){
  order.value=state.order;
  window.AifectDropdown?.mount(order);
  order.onchange=()=>{state.order=order.value;restore=0;select();};
 }
 root.onclick=event=>{
  const button=event.target.closest('[data-work-feed-action]');if(!button||button.disabled)return;
  const item=page.items.get(button.closest('[data-feed-key]')?.dataset.feedKey);
  if(item)onAction?.(button,item);
 };
 next.onclick=()=>void more();
 for(const event of ['play','pause','ended','emptied','loadedmetadata'])audio.addEventListener(event,syncPlay,{signal});
 select();
 const dispose=registerRouteCleanup(()=>{
  if(root.getClientRects().length)state.scroll=window.scrollY||0;
  controller.abort();observer?.disconnect();
  for(const entry of state.pages.values())entry.pending=false;
 });
 return {dispose,replaceItems};
}

