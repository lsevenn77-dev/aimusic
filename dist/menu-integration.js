// Navigation only: legacy handlers and every service endpoint remain available.
function menuHref(route,params={},raw=''){
 const query=new URLSearchParams(raw.includes('?')?raw.slice(raw.indexOf('?')+1):'');
 for(const [key,value] of Object.entries(params))value===null?query.delete(key):query.set(key,value);
 return '#'+route+(query.size?'?'+query:'');
}
function menuAlias(hash){
 const raw=hash.replace(/^#/,''),route=raw.split('?')[0],parts=route.split('/'),base=parts[0],section=parts[1]||'';
 if(base==='library'&&parts.length<=2){
  if(['following','followers','artists','producers'].includes(section))return menuHref('community/following',{people:section==='followers'?'followers':'following',...(['artists','producers'].includes(section)?{kind:section}:{} )},raw);
  if(['covers','originals'].includes(section))return menuHref('profile',{view:'works',section},raw);
  return menuHref('profile',{view:'library',section:['likes','history','playlists'].includes(section)?section:'likes'},raw);
 }
 if(route==='gift-inventory')return menuHref('inventory',{},raw);
 if(route==='profile'){const q=new URLSearchParams(raw.split('?')[1]||'');if(q.get('view')==='library'&&q.get('section')==='saved')return menuHref('profile',{section:'likes'},raw);}
 if(route==='following')return menuHref('community/following',{},raw);
 if(route==='payouts')return menuHref('studio/payouts',{},raw);
 if(route==='rewards')return menuHref('gifts/rewards',{},raw);
 return null;
}
function myTabHref(tab,raw=location.hash){return menuHref('profile',{view:tab,section:tab==='library'?'likes':null},raw);}
function rememberMenuLogin(base,param){
 const key='aifect-menu-return',isTarget=hash=>/^#(?:profile(?:\?|$)|community\/following(?:\?|$)|studio\/payouts(?:\?|$)|gifts\/rewards(?:\?|$))/.test(hash||'');
 try{
  if(!me&&isTarget(location.hash))sessionStorage.setItem(key,location.hash);
  else if(base==='account'){const saved=sessionStorage.getItem(key);if(isTarget(saved))returnRoute=saved;}
  else sessionStorage.removeItem(key);
 }catch{}
}
function rememberLibraryFilters(){
 if(!location.hash.startsWith('#profile?')||new URLSearchParams(location.hash.split('?')[1]).get('view')!=='library')return;
 const href=menuHref('profile',{q:collectionSearch||null,filter:collectionFilter,sort:collectionSort},location.hash);
 history.replaceState(history.state,'',href);$('#main').dataset.route=href.slice(1);
}
async function myLibraryView(raw,readApi=api){return musicLibraryView(raw,readApi);}
function followingMenu(raw){
 const q=new URLSearchParams(raw.split('?')[1]||''),selected=['following','followers'].includes(q.get('people'))?q.get('people'):'works';
 return '<nav class="tabs menu-following-tabs" aria-label="팔로잉 영역">'+[['works','작품'],['following','팔로우 관리'],['followers','팔로워']].map(([key,label])=>'<a class="tab '+(selected===key?'active':'')+'" href="'+esc(menuHref('community/following',{people:key==='works'?null:key,kind:null},raw))+'" '+(selected===key?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';
}
async function integratedMenuView(base,param,raw,readApi=api){
 if(base==='studio'&&param==='payouts'){
  const view=await improvementsView('payouts',null,raw,readApi);
  return {...view,html:'<a class="text-link" href="#studio">← 스튜디오</a>'+view.html};
 }
 if(base==='gifts'&&param==='rewards'){
  const view=await improvementsView('rewards',null,raw,readApi);
  return {...view,html:'<a class="text-link" href="#gifts">← 선물함</a>'+view.html};
 }
 if(base!=='community'||param!=='following')return null;
 const q=new URLSearchParams(raw.split('?')[1]||''),people=q.get('people');
 const shell=content=>'<div class="play-page menu-following">'+heading('커뮤니티','팔로우한 창작자의 음악과 사람들을 만나보세요.')+communityNavigation('following')+followingMenu(raw)+content+'</div>';
 if(!me){returnRoute=location.hash;return {html:shell(gate())};}
 if(people==='following'||people==='followers'){
  let body;
  if(people==='followers'){
   const d=await readApi('/api/me/profile','GET',undefined,{fresh:true});
   body=d.followers.length?peopleListHTML(d.followers,'producer'):'<p class="surface">아직 팔로워가 없어요.</p>';
  }else{
   const uid=me.id,revision=followRevision,d=await readApi('/api/follows','GET',undefined,{fresh:true});
   if(me?.id!==uid)return {html:gate()};
   if(revision===followRevision&&!pendingFollows.size)library.follows=d.follows;
   const kind=q.get('kind'),groups=kind==='artists'?[['artist','AI 아티스트']]:kind==='producers'?[['producer','창작자']]:[['producer','창작자'],['artist','AI 아티스트']];
   body='<nav class="genre-chips" aria-label="팔로우 종류">'+[['','전체'],['producers','창작자'],['artists','AI 아티스트']].map(([key,label])=>'<a class="genre-chip '+((kind||'')===key?'active':'')+'" href="'+esc(menuHref('community/following',{people:'following',kind:key||null},raw))+'">'+label+'</a>').join('')+'</nav>';
   for(const [key,label] of groups){const items=library.follows.filter(f=>f.kind===key).map(f=>({...f,id:f.target_id}));body+=section(label)+(items.length?peopleListHTML(items,key):'<p class="empty-inline">아직 팔로우한 '+label+'가 없어요. <a class="text-link" href="#'+(key==='artist'?'artists':'producers')+'">둘러보기</a></p>');}
  }
  return {html:shell(body)};
 }
 const type=['all','solo','duet','dubbing'].includes(q.get('type'))?q.get('type'):'all',search=(q.get('q')||'').slice(0,100),offset=Math.max(0,Math.min(10000,Math.floor(Number(q.get('offset'))||0)));
 const data=await readApi('/api/play/works?'+new URLSearchParams({tab:'following',type,q:search,offset}),'GET',undefined,{fresh:true});
 const view={play:{mode:'browse',tab:'following',type},items:data.works,tracks:data.works.filter(t=>t.type!=='dubbing'),nextOffset:data.nextOffset,dubbingAvailable:data.dubbingAvailable};
 const types='<nav class="genre-chips play-types" aria-label="작품 유형">'+playTypes.map(([key,label])=>'<a class="genre-chip '+(type===key?'active':'')+'" href="'+esc(menuHref('community/following',{type:key,offset:null},raw))+'">'+label+'</a>').join('')+'</nav>';
 view.html=shell(types+playToolbar(view.play).replace('name="q"','name="q" value="'+esc(search)+'"')+(data.dubbingAvailable===false?'<p class="field-help">더빙 목록은 현재 준비 중이에요.</p>':'')+'<div id="play-results" aria-live="polite">'+playResults(view)+'</div><button class="small-button play-more" id="play-more" '+(view.nextOffset===null?'hidden':'')+'>더 보기</button>');
 return view;
}
