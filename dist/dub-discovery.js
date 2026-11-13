// The casting workspace remains available at the original project/join URLs.
const dubGenres=['전체','로맨스','판타지','스릴러','공포','코미디','액션','일상','사극','SF'];
const dubCache=new Map();
function isDubDiscovery(view){
 return view.play.mode==='dubbing'&&view.play.tab==='discover'&&!new URLSearchParams(view.raw.split('?')[1]).has('project');
}
function dubSettings(raw){
 const params=new URLSearchParams(raw.split('?')[1]);
 const mode=params.get('view')==='complete'?'complete':'open';
 const section=['rank','genre','latest','beginner','versions'].includes(params.get('section'))?params.get('section'):'home';
 return {mode,section,period:params.get('period')==='all'?'all':'week',genre:params.get('genre')||'전체',query:params.get('q')||'',
  sort:['popular','title'].includes(params.get('sort'))?params.get('sort'):'latest',root:params.get('root')||''};
}
function dubHref(s,change){
 const state={...s,...change},params=new URLSearchParams({tab:'discover'});
 for(const [key,value,omit] of [['view',state.mode,'open'],['section',state.section,'home'],['period',state.period,''],['genre',state.genre,'전체'],['q',state.query,''],['sort',state.sort,'latest'],['root',state.root,'']])if(value&&value!==omit)params.set(key,value);
 return '#karaoke/dubbing?'+params;
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
 const s=dubSettings(view.raw),key=[view.account,view.revision,s.mode].join('|');
 const cached=dubCache.get(key);
 if(cached&&cached.until>Date.now())return cached.data;
 const complete=s.mode==='complete';
 const [projects,weekly]=await Promise.all([
  dubPages(readApi,'/api/dubbing/projects?tab='+(complete?'popular':'open')+'&discovery=1','projects','nextOffset'),
  complete?dubPages(readApi,'/api/community/rankings?category=dubbing&period=week','rows','next_offset'):[]
 ]);
 const data={projects,weekly};
 if(view.account===playCacheAccount()&&view.revision===playCacheRevision()){
  dubCache.set(key,{data,until:Date.now()+30000});
  while(dubCache.size>6)dubCache.delete(dubCache.keys().next().value);
 }
 return data;
}
function dubGroups(s,data){
 const groups=new Map(),positions=new Map(data.weekly.map((row,i)=>[row.id,i+1]));
 for(const version of data.projects){
  const root=version.rootId||version.id;
  let work=groups.get(root);
  if(!work){work={...version,id:root,title:version.rootTitle||version.title,ownerName:version.rootOwnerName||version.ownerName,versions:[],weeklyRank:Infinity};groups.set(root,work);}
  work.versions.push(version);
  work.weeklyRank=Math.min(work.weeklyRank,positions.get(version.id)??Infinity);
 }
 const items=[...groups.values()];
 const ranks=s.mode==='complete'?(s.period==='all'?items:items.filter(p=>Number.isFinite(p.weeklyRank)).sort((a,b)=>a.weeklyRank-b.weeklyRank)):
  items.filter(p=>s.period==='all'?Number.isInteger(p.activeCount):p.weeklyActiveCount>0)
   .sort((a,b)=>(s.period==='all'?b.activeCount-a.activeCount:b.weeklyActiveCount-a.weeklyActiveCount)||b.created-a.created||a.id.localeCompare(b.id));
 return {items,ranks};
}
function dubViewSettings(view){
 const s=dubSettings(view.raw);
 if(!new URLSearchParams(view.raw.split('?')[1]).has('period')&&!dubGroups(s,view.discovery).ranks.length)s.period='all';
 return s;
}
function dubLink(s,change,label,active,extra=''){
 return '<a href="'+esc(dubHref(s,change))+'" '+(active?'aria-current="page"':'')+' '+extra+'>'+label+'</a>';
}
function dubBadge(p,complete){
 if(complete)return '완성 더빙 '+p.versions.length+'개';
 if(!Number.isInteger(p.activeCount))return '참여 가능';
 return p.activeCount?'더빙 '+p.activeCount+'개 진행중':'진행중인 더빙 없음';
}
function dubWorkURL(s,p){
 return s.mode==='complete'?dubHref(s,{section:'versions',root:p.id}):'#dubbing/'+encodeURIComponent(p.id);
}
function dubPhoto(p){
 const genre=p.genres?.[0],url=genre?AifectDubbing.dubbingGenreArtwork(p.genres):'';
 return url?'<img loading="lazy" decoding="async" alt="" src="'+esc(url)+'">':'<span class="dub-art-empty" aria-hidden="true">'+icon('message')+'</span>';
}
function dubCover(s,p,rank,starter=false){
 const detail=starter?p.roleCount+'인극 · 약 '+Math.round(p.duration/60)+'분':p.roleCount+'인극 · '+dubBadge(p,s.mode==='complete');
 return '<a class="dub-cover" href="'+esc(dubWorkURL(s,p))+'">'+dubPhoto(p)+(rank?'<b class="dub-rank">'+rank+'</b>':'')+
 '<span class="dub-cover-copy"><strong>'+esc(p.title)+'</strong><small>'+esc(detail)+'</small></span></a>';
}
function dubRow(s,p,rank,version=false){
 const href=version?'#dubbing/'+encodeURIComponent(p.id):dubWorkURL(s,p);
 const stats=version?(Number.isInteger(p.plays)?'재생 '+p.plays+'회':'재생 수 미집계'):dubBadge(p,s.mode==='complete');
 return '<a class="dub-row" href="'+esc(href)+'">'+(rank?'<b class="dub-num">'+rank+'</b>':'')+'<span class="dub-thumb">'+dubPhoto(p)+'</span><span class="dub-row-copy"><strong>'+esc(p.title)+'</strong><small>창작자 '+esc(p.ownerName||'')+'</small><small>'+esc(p.roleCount+'인극 · '+stats)+'</small></span>'+icon('chevron')+'</a>';
}
function dubDiscoveryHTML(view){
 const s=dubViewSettings(view),done=s.mode==='complete',home=s.section==='home';
 const {items,ranks}=dubGroups(s,view.discovery);
 const q=s.query.trim().toLocaleLowerCase('ko'),filter=p=>(s.genre==='전체'||p.genres?.includes(s.genre))&&(!q||[p.title,p.ownerName,...(done?p.versions.flatMap(v=>[v.ownerName,v.title]):[])].some(t=>String(t||'').toLocaleLowerCase('ko').includes(q)));
 const positions=new Map(ranks.map((p,i)=>[p.id,i+1]));
 // Explicit curation only. Duration and role count determine priority inside that set.
 const starters=items.filter(p=>p.beginnerRecommended===true).sort((a,b)=>Number(b.roleCount===2&&b.duration>=240&&b.duration<=300)-Number(a.roleCount===2&&a.duration>=240&&a.duration<=300)||b.created-a.created);
 const base=s.section==='beginner'?starters:items;
 const list=base.filter(filter);
 if(s.sort==='title')list.sort((a,b)=>a.title.localeCompare(b.title,'ko'));
 else if(s.sort==='popular'){const all=new Map(dubGroups({...s,period:'all'},view.discovery).ranks.map((w,i)=>[w.id,i]));list.sort((a,b)=>(all.get(a.id)??Infinity)-(all.get(b.id)??Infinity));}
 else if(s.section!=='beginner')list.sort((a,b)=>b.created-a.created);
 const period='<div class="dub-period">'+['week','all'].map((p,i)=>dubLink(s,{period:p},i?'전체':'주간',s.period===p)).join('')+'</div>';
 const head=(title,trailing='')=>'<header class="dub-heading"><h2>'+title+'</h2>'+trailing+'</header>';
 const blank=label=>'<p class="dub-empty">'+label+'</p>';
 const genres='<nav class="dub-genres" aria-label="장르">'+dubGenres.map(g=>dubLink(s,{genre:g,section:home&&!done?'genre':s.section},g==='사극'?'시대극':g,g===s.genre)).join('')+'</nav>';
 const search='<form class="dub-search" data-dub-search>'+icon('search')+'<input type="search" maxlength="100" name="q" value="'+esc(s.query)+'" placeholder="작품 제목 또는 창작자 검색" aria-label="작품 제목 또는 창작자 검색"><button type="submit">검색</button></form>';
 const sort='<select data-dub-sort aria-label="작품 정렬">'+[['latest','최신순'],['popular','인기순'],['title','제목순']].map(([k,l])=>'<option value="'+k+'" '+(s.sort===k?'selected':'')+'>'+l+'</option>').join('')+'</select>';
 const more=(section)=>dubLink(s,{section},'전체보기 '+icon('chevron'),false,'class="dub-more"');
 let html='<div class="dub-hub"><nav class="dub-modes" aria-label="더빙 작품 종류">'+['open','complete'].map((m,i)=>dubLink(s,{mode:m,root:'',section:s.section==='versions'?'home':s.section},icon(i?'ui-play-action':'mic')+(i?'완성작 보기':'참여 가능'),m===s.mode)).join('')+'</nav>';
 if(s.section!=='versions')html+='<nav class="dub-sections" aria-label="더빙 탐색">'+[['home','추천'],['rank','랭킹'],['genre','장르'],['latest','신규']].map(([v,l])=>dubLink(s,{section:v,query:'',genre:'전체',root:''},l,s.section===v)).join('')+'</nav>';
 if(home||s.section==='rank'){
  if(!home)html+=genres+search;
  html+=head(done?'완성작 인기 랭킹':'작품 인기 랭킹',period);
  const found=ranks.filter(home?()=>true:filter);
  html+=found.length?(home?'<div class="dub-grid">'+found.slice(0,6).map(p=>dubCover(s,p,positions.get(p.id))).join('')+'</div>':found.map(p=>dubRow(s,p,positions.get(p.id))).join('')):blank(s.period==='week'?'이번 주 집계된 작품이 없어요.':'집계된 작품이 없어요.');
 }
 if(home&&!done)html+='<a class="dub-create" href="#dubbing/new">'+icon('edit')+'<strong>+ 더빙 대본 만들기</strong>'+icon('chevron')+'</a>';
 if(home||s.section==='genre'){html+=head('장르별 작품 찾기',home?more('genre'):'')+genres;if(!home||done)html+='<div class="dub-tools">'+search+sort+'</div>';}
 if(home&&!done){
  html+='<section class="dub-beginners">'+head('처음이라면 여기부터',starters.length?more('beginner'):'')+(starters.length?'<div class="dub-grid">'+starters.slice(0,3).map(p=>dubCover(s,p,null,true)).join('')+'</div>':blank('아직 초보자용으로 지정된 작품이 없어요.'))+'</section>';
 }
 if(s.section==='versions'){
  const p=items.find(w=>w.id===s.root);
  html+=head(p?esc(p.title)+' · 완성 더빙 '+p.versions.length+'개':'완성 더빙',dubLink(s,{section:'home',root:''},'목록으로',false));
  html+=p?p.versions.map(v=>dubRow(s,v,null,true)).join(''):blank('현재 볼 수 있는 완성 더빙이 없어요.');
 }else if(s.section!=='rank'){
  if(s.section==='latest'||s.section==='beginner')html+='<div class="dub-tools">'+search+sort+'</div>';
  html+=head(s.section==='beginner'?'처음이라면 여기부터':s.section==='genre'?'작품 '+list.length+'개':done?'완성작 리스트':'신규 참여 작품',home?more('latest'):'');
  html+=list.length?(home?list.slice(0,4):list).map(p=>dubRow(s,p)).join(''):blank('조건에 맞는 작품이 없어요.');
 }
 return html+'<footer class="dub-links"><a href="#karaoke/dubbing?tab=join">배역별 더빙 참여</a><a href="#karaoke/dubbing?tab=mine">내 더빙 작업</a></footer></div>';
}
function bindDubDiscovery(view,root){
 const s=dubViewSettings(view),form=root.querySelector('[data-dub-search]'),sort=root.querySelector('[data-dub-sort]');
 if(form)form.onsubmit=e=>{e.preventDefault();location.hash=dubHref(s,{query:form.elements.q.value.trim()});};
 if(sort)sort.onchange=()=>{location.hash=dubHref(s,{sort:sort.value});};
}
