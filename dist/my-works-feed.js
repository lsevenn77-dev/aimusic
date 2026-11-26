function myWorkFeedItem(work){
 const dub=work.kind==='dubbing';
 return {work,key:work.key,kind:workFeedKind(work),date:work.feed_date,recruiting:!!work.recruiting,
  privateWork:work.owned&&(dub?work.visibility==='private':!work.work_public)};
}

function myWorkFeedCredit({work}){
 if(work.kind==='original'&&hasArtist(work))return esc(work.artist);
 if(work.cover_mode!=='duet'||!work.duet_partner_id)return '';
 if(work.owned)return userNickname(work.duet_partner,{profileId:work.duet_partner_id});
 return userNickname(work.producer,{profileId:work.producer_id,userId:work.user_id});
}

function myWorkFeedMenuButton({work}){
 return work.owned?`<button class="icon-button work-feed-menu" type="button" data-work-feed-action
  aria-haspopup="dialog" aria-label="${esc(work.title)} 더보기">${icon('ui-menu-action',22)}</button>`:'';
}

function paintMyWorkCounts(summary){
 if(!summary)return;
 for(const [name,value] of Object.entries(summary)){
  const count=document.querySelector('[data-mp-work-total="'+name+'"]');
  if(count)count.textContent=number(value);
  if(myPageState?.d)myPageState.d[name]=value;
 }
}

function markMyWorkChanged(key){
 if(!me?.id)return;
 const state=workFeedState('mine');
 (state.changes??=new Set()).add(key);
 return state.refresh?.();
}

function relatedMyWorkKeys(state,changed){
 const trackIds=new Set(),dubbingIds=new Set();
 for(const key of changed){
  const [kind,id]=key.split(':');
  (kind==='track'?trackIds:dubbingIds).add(id);
 }
 const keys=new Set(changed);
 for(const page of state.pages.values()){
  for(const {work,key} of page.items.values()){
   if(trackIds.has(work.original_id)||trackIds.has(work.duet_parent_id)||dubbingIds.has(work.root_id))keys.add(key);
  }
 }
 return [...keys];
}

function mountMyWorkFeed(container,restoreScroll){
 const root=container?.querySelector('[data-work-feed]');
 if(!root)return;
 const state=workFeedState('mine'),controller=new AbortController(),account=me.id;
 const signal=controller.signal;
 const feed=mountWorkFeed(root,{
  state,restoreScroll,metrics:true,metadata:myWorkFeedCredit,actions:myWorkFeedMenuButton,onAction:openMyWorkMenu,
  emptyText:filter=>filter==='all'?'아직 작품이 없습니다.':'이 유형의 작품이 없습니다.',
  async loadPage({filter,cursor,signal}){
   const params=new URLSearchParams({filter});
   if(cursor)params.set('cursor',cursor);
   const result=await api('/api/me/works?'+params,'GET',undefined,{fresh:true,signal});
   return {...result,items:result.items.map(myWorkFeedItem)};
  }
 });
 let pending;
 async function update(){
  while(state.changes?.size&&!signal.aborted){
   const changed=[...state.changes];
   for(const key of changed)state.changes.delete(key);
   const keys=relatedMyWorkKeys(state,changed);
   try{
    for(let offset=0;offset<keys.length;offset+=48){
     const batch=keys.slice(offset,offset+48),params=new URLSearchParams();
     for(const key of batch)params.append('item',key);
     const result=await api('/api/me/works?'+params,'GET',undefined,{fresh:true,signal});
     if(signal.aborted||account!==me?.id)throw new DOMException('이전 작품 목록입니다.','AbortError');
     feed.replaceItems(batch,result.items.map(myWorkFeedItem));
     paintMyWorkCounts(result.summary);
    }
   }catch(error){
    for(const key of changed)state.changes.add(key);
    if(error.name!=='AbortError'&&root.isConnected){
     toast('작품 변경 사항을 다시 불러와 주세요.');
     const retry=root.querySelector('[data-feed-status]');
     retry.innerHTML='<button type="button" class="small-button" data-retry-my-work>변경 사항 다시 불러오기</button>';
     retry.firstElementChild.onclick=()=>void refresh();
    }
    break;
   }
  }
 }
 function refresh(){
  if(!pending)pending=update().finally(()=>{pending=null;});
  return pending;
 }
 state.refresh=refresh;
 if(state.changes?.size)void refresh();
 const release=registerRouteCleanup(()=>{
  controller.abort();
  if(state.refresh===refresh)delete state.refresh;
 });
 return ()=>{release();feed.dispose();};
}

function myWorkMenuMarkup(work){
 const id=encodeURIComponent(work.id),dub=work.kind==='dubbing';
 const studio='#manage/'+id+'?from=works',dubbing='#dubbing/'+id;
 const options=[];
 const edit=!dub?studio:work.can_edit?dubbing+'?edit=1&amp;from=works':'';
 if(edit)options.push(`<a class="small-button" href="${edit}">작품 수정</a>`);
 if(dub&&!work.casting_draft){
  if(work.visibility==='public')options.push('<button class="small-button" type="button" data-my-work-operation="hide">공개 설정 · 비공개로 전환</button>');
  else options.push(`<a class="small-button" href="${dubbing}?manage=1&amp;from=works">공개 설정</a>`);
  if(work.recruiting||!work.root_id&&work.visibility==='private')options.push(`<a class="small-button" href="${dubbing}?manage=1&amp;from=works">모집 관리</a>`);
 }
 if(!dub&&['published','hidden'].includes(work.status)){
  const hidden=work.status==='hidden';
  options.push(`<button class="small-button" type="button" data-my-work-operation="${hidden?'publish':'hide'}">공개 설정 · ${hidden?'다시 공개':'비공개로 전환'}</button>`);
 }
 options.push('<button class="small-button danger-button" type="button" data-my-work-operation="delete">작품 삭제</button>');
 return `<div class="mypage-dialog work-feed-management"><h2>작품 관리</h2><p>${esc(work.title)}</p>
  <div class="work-feed-management-actions">${options.join('')}</div><p class="form-error" role="alert"></p></div>`;
}

function openMyWorkMenu(trigger,{work,key}){
 if(!work.owned||!me?.id)return;
 dialog(myWorkMenuMarkup(work));
 const modal=$('#dialog'),menu=modal.querySelector('.work-feed-management'),account=me.id;
 const actions=[...menu.querySelectorAll('[data-my-work-operation]')];
 menu.onclick=async event=>{
  const button=event.target.closest('[data-my-work-operation]');
  if(!button||button.disabled||account!==me?.id)return;
  const operation=button.dataset.myWorkOperation,dub=work.kind==='dubbing';
  if(operation==='delete'&&!dub){
   deleteTrackDialog(work.id,work.title,work.kind,()=>markMyWorkChanged(key));
   return;
  }
  const error=menu.querySelector('[role=alert]');
  error.textContent='';actions.forEach(action=>action.disabled=true);
  try{
   const id=encodeURIComponent(work.id);
   if(dub){
    const path='/api/dubbing/projects/'+id;
    const {project}=await api(path,'GET',undefined,{fresh:true});
    if(!menu.isConnected||!modal.open||account!==me?.id)return;
    if(!project.isOwner||project.removed)return toast('작품을 관리할 권한을 확인해 주세요.');
    const message=operation==='delete'?dubbingDeleteConfirmation(project):'이 더빙을 비공개로 전환할까요?';
    if(!confirm(message))return;
    await api(path+(operation==='delete'?'':'/unpublish'),operation==='delete'?'DELETE':'POST',{revision:project.revision});
    if(operation==='delete'&&current?.kind==='dubbing'&&current.id===work.id)closePlayer();
   }else{
    if(operation==='hide'&&!confirm('이 곡을 비공개로 전환할까요?'))return;
    await api('/api/uploads/'+id+(operation==='hide'?'/unpublish':'/retry'),'POST');
   }
   if(menu.isConnected&&modal.open)modal.close();
   if(account===me?.id)await markMyWorkChanged(key);
   toast(operation==='delete'?'작품이 삭제되었습니다.':'공개 설정을 변경했습니다.');
  }catch(e){if(menu.isConnected)error.textContent=e.message;}
  finally{actions.forEach(action=>action.disabled=false);}
 };
}
