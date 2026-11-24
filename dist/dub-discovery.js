// Shared discovery catalog; recording and casting links keep their original routes.
const dubGenres=['전체','로맨스','판타지','스릴러','공포','코미디','액션','일상','사극','SF'];
const dubCache=new Map();
function isDubDiscovery(view){
 return view.play.mode==='dubbing'&&(view.play.tab==='discover'||view.play.tab==='join')&&!new URLSearchParams(view.raw.split('?')[1]).has('project');
}
async function dubPages(readApi,path,key,next){
 const rows=[];let offset=0;
 for(;;){
  const page=await readApi(path+(offset?'&offset='+offset:''),'GET',undefined,{fresh:true});
  rows.push(...(page[key]||[]));
  if(!Number.isInteger(page[next])||page[next]<=offset)return rows;
  offset=page[next];
 }
}
async function readDubDiscovery(view,readApi){
 const key=[view.account,view.revision].join('|'),cached=dubCache.get(key);
 if(cached&&cached.until>Date.now())return cached.data;
 const projects=await dubPages(readApi,'/api/dubbing/projects?tab=open&discovery=1&castingRoles=1','projects','nextOffset');
 const data={projects};
 if(view.account===playCacheAccount()&&view.revision===playCacheRevision()){
  dubCache.set(key,{data,until:Date.now()+30000});
  while(dubCache.size>6)dubCache.delete(dubCache.keys().next().value);
 }
 return data;
}
function dubPhoto(p,eager=false){
 const hasGenre=p.genres?.some(g=>(AifectDubbing.DUBBING_GENRES||dubGenres).includes(g)),url=p.posterUrl||(hasGenre?AifectDubbing.dubbingGenreArtwork(p.genres):'');
 return url?'<img loading="'+(eager?'eager':'lazy')+'" decoding="async" alt="" src="'+esc(url)+'">':'<span class="dub-art-empty" aria-hidden="true">'+icon('message')+'</span>';
}
function dubOriginals(items){
 const originals=items.filter(p=>p.isOfficialOriginal).sort((a,b)=>b.created-a.created);
 if(!originals.length)return '';
 return '<section class="dub-originals" aria-label="AIFECT 오리지널"><h2>AIFECT 오리지널</h2><div class="dub-feature-rail">'+originals.map((p,i)=>
  '<a class="dub-feature" href="'+esc('#dubbing/'+encodeURIComponent(p.id))+'">'+dubPhoto(p,i===0)+
  '<span class="dub-feature-foot"><span class="dub-feature-copy"><small>'+esc([...(p.genres||[]),p.roleCount+'인극'].join(' · '))+'</small><strong>'+esc(p.title)+'</strong></span>'+
  '<span class="dub-feature-action">더빙하기</span></span></a>').join('')+'</div></section>';
}
function dubCard(project,tab){
 const join=tab==='join';
 const href=join?playHref('dubbing','join')+'&project='+encodeURIComponent(project.id):'#dubbing/'+encodeURIComponent(project.id);
 const genres=(project.genres||[]).map(g=>g==='사극'?'시대극':g);
 const duration=Number.isFinite(project.duration)&&project.duration>0?time(project.duration):'';
 const meta=[genres.join(' · '),duration].filter(Boolean).join(' · ');
 const status=project.state==='recording'?'녹음 진행 중':'배역 모집 중';
 const progress=Number.isInteger(project.activeCount)&&project.activeCount>0?' · '+project.activeCount+'개 조합 진행 중':'';
 const roles=join?'<small class="dub-available-roles">참여 가능 · '+esc(project.availableRoles.join(', '))+'</small>':'';
 return '<a class="dub-poster-card" href="'+esc(href)+'"><span class="dub-poster-art">'+dubPhoto(project)+'</span>'+
  '<strong>'+esc(project.title)+'</strong><small>'+esc(meta)+'</small><small>'+esc(status+progress)+'</small>'+roles+'</a>';
}
function dubBanners(){
 const link=(href,symbol,title,copy)=>'<a href="'+esc(href)+'">'+icon(symbol)+'<span><strong>'+title+'</strong><small>'+copy+'</small></span>'+icon('chevron')+'</a>';
 return '<footer class="dub-hub-banners">'+link(dubbingNewURL(),'file-pen-line','더빙 대본 만들기','나만의 이야기를 직접 만들어 보세요.')+
  link(playHref('browse','latest','dubbing'),'headphones','완성작 보러가기','다른 이용자들의 완성된 더빙을 감상해 보세요.')+'</footer>';
}
function reviewCard(){
 return '<div class="dub-review-card">'+icon('clipboard-clock')+'<span>작품 검토중</span></div>';
}
function dubDiscoveryHTML(view,limit=10){
 const state=dubSettings(view.raw),tab=dubSelection(view.play,view.raw),query=state.query.trim().toLocaleLowerCase('ko');
 const all=view.discovery.projects.filter(p=>p.reusable&&p.visibility==='public'&&
  ['recruiting','recording','in_progress','script_ready'].includes(p.state)&&p.availableRoles?.length);
 const items=all.filter(p=>(state.genre==='전체'||p.genres?.includes(state.genre))&&
  (!query||[p.title,p.ownerName].some(v=>String(v||'').toLocaleLowerCase('ko').includes(query))));
 const latest=(a,b)=>b.created-a.created||a.id.localeCompare(b.id);
 items.sort(tab==='popular'?(a,b)=>b.activeCount-a.activeCount||b.completedCount-a.completedCount||latest(a,b):latest);
 const genres='<nav class="dub-genres" aria-label="더빙 장르">'+dubGenres.map(g=>'<a href="'+esc(dubURL(tab,state.query,g))+'"'+(state.genre===g?' aria-current="page"':'')+'>'+esc(g==='사극'?'시대극':g)+'</a>').join('')+'</nav>';
 const grid=(rows,emptySlots=0)=>'<div class="dub-poster-grid">'+rows.map(p=>dubCard(p,tab)).join('')+reviewCard().repeat(emptySlots)+'</div>';
 const section=(title,body)=>'<section class="dub-section"><h2>'+title+'</h2>'+body+'</section>';
 const blank=text=>'<p class="dub-empty" role="status">'+text+'</p>';
 const filtering=Boolean(query||state.genre!=='전체');
 let body=section('장르별 작품 찾기',genres);
 if(tab==='discover'){
  body+=dubOriginals(items);
  const starters=items.filter(p=>p.beginnerRecommended===true).sort((a,b)=>Number(b.roleCount===2&&b.duration>=240&&b.duration<=300)-Number(a.roleCount===2&&a.duration>=240&&a.duration<=300)||latest(a,b)).slice(0,3);
  // Vacant editorial slots are markup only and never appear in filtered results.
  const slots=filtering?0:3-starters.length;
  body+=section('더빙이 처음이라면',starters.length||slots?grid(starters,slots):blank('조건에 맞는 추천 작품이 없습니다.'));
 }
 const title=tab==='discover'?'신규 작품':tab==='popular'?'인기더빙':'참여 가능한 작품';
 body+=section(title,items.length?grid(items.slice(0,limit))+(items.length>limit?'<button class="small-button play-more" type="button" data-dub-more>더 보기</button>':''):blank(filtering?'검색 조건에 맞는 작품이 없습니다.':'현재 참여할 수 있는 더빙 작품이 없습니다.'));
 const mine='<a class="dub-mine-link" href="'+esc(playHref('dubbing','mine'))+'">내 더빙 작업 '+icon('chevron')+'</a>';
 return '<div class="dub-hub">'+body+mine+(tab==='discover'?dubBanners():'')+'</div>';
}
function bindDubDiscovery(view,root){
 const form=root.querySelector('#play-search'),input=form.elements.q,results=root.querySelector('#play-results');
 let timer,limit=10;
 const state=dubSettings(view.raw),tab=dubSelection(view.play,view.raw);
 input.value=state.query;form.inert=false;
 function paint(){results.innerHTML=dubDiscoveryHTML(view,limit);icons();}
 function apply(){
  clearTimeout(timer);
  if(!form.isConnected||root._playView!==view)return;
  const raw=dubURL(tab,input.value.trim(),dubSettings(view.raw).genre).slice(1);
  if(raw===view.raw)return;
  history.replaceState(history.state,'','#'+raw);view.raw=raw;root.closest('#main').dataset.route=raw;window.AifectRender?.syncTarget();
  root.querySelector('.play-subbar').innerHTML=dubTabs(view.play,raw);
  limit=10;paint();
 }
 const schedule=()=>{timer=scheduleSearchInput(timer,apply);};
 input.oninput=e=>{if(e.isComposing)clearTimeout(timer);else schedule();};
 const composing=()=>clearTimeout(timer);input.addEventListener('compositionstart',composing);input.addEventListener('compositionend',schedule);
 form.onsubmit=e=>{e.preventDefault();apply();};
 const click=e=>{
  const more=e.target.closest('[data-dub-more]');
  if(more){const prior=limit;limit+=10;paint();results.querySelectorAll('.dub-section:last-of-type .dub-poster-card')[prior]?.focus({preventScroll:true});return;}
  const a=e.target.closest('.dub-genres a,.dub-hub-tabs a');
  if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  clearTimeout(timer);
  if(input.value.trim()===dubSettings(view.raw).query||a.hash.startsWith('#dubbing/new'))return;
  const params=new URLSearchParams(a.hash.split('?')[1]);if(input.value.trim())params.set('q',input.value.trim());else params.delete('q');
  a.hash=a.hash.split('?')[0]+'?'+params;
 };
 root.addEventListener('click',click);
 root._playListCleanup=()=>{clearTimeout(timer);input.oninput=null;input.removeEventListener('compositionstart',composing);input.removeEventListener('compositionend',schedule);form.onsubmit=null;root.removeEventListener('click',click);};
}
