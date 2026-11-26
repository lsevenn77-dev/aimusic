function roomRelationButton(member,self,compact=false){
 if(!member?.profile_id||member.id===self||typeof member.following!=='boolean')return '';
 const mutual=member.following&&member.follows_viewer;
 const state=mutual?'맞팔':member.following?'팔로우 중':'팔로우 가능';
 const symbol=mutual?'M14.5 14.5h7m-2-2 2 2-2 2M21.5 19.5h-7m2 2-2-2 2-2':member.following?'M14.5 17.3l2.4 2.5 4.5-5':'M18 13.5v7M14.5 17h7';
 const svg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="6.5" r="3.3"/><path d="M2.8 20v-2.2c0-3.4 2.7-5.9 6.2-5.9 3.1 0 5.1 1.7 5.7 4.4"/><path d="'+symbol+'"/></svg>';
 if(member.following)return compact?'':'<span class="room-relation" role="img" title="'+state+'" aria-label="'+state+'">'+svg+'</span>';
 return '<button type="button" class="'+(compact?'room-follow-add':'room-follow')+'" data-voice="room-follow" data-target="'+esc(member.id)+'" title="'+state+'" aria-label="'+esc(member.name)+' 팔로우">'+svg+'</button>';
}
function roomInviteButtons(invitation){
 const isSong=invitation.kind==='reservation',prefix=isSong?'reservation':'seat';
 return `<span>${isSong?'예약 초대':'좌석 초대'} <time class="room-guide-countdown" data-room-deadline="${Number(invitation.expires)}"></time></span><button type="button" data-voice="${prefix}-accept" data-target="${esc(invitation.id)}">수락</button><button type="button" data-voice="${prefix}-reject" data-target="${esc(invitation.id)}">거절</button>`;
}
Object.assign(VoiceRoomClient.prototype,{
 bindRoomRelease(){
  const options={signal:this.talkViewEvents.signal},room=this.host,uid=me?.id;
  const more = room.querySelector('details.room-more');
  if (more?.tagName === 'DETAILS') {
   const nav = more.parentElement, menu = more.querySelector('.room-more-actions');
   const secondary = ['inbox','share','settings'].map(key => nav.querySelector(`[data-voice="${key}"]`));
   const leave = nav.querySelector('[data-voice="leave"]');
   for (const button of secondary) {
    if(button.querySelector('.room-menu-label'))continue;
    const label=document.createElement('span');label.className='room-menu-label';label.textContent=button.title;
    button.append(label);
   }
   const desktop = window.matchMedia('(min-width:801px) and (hover:hover) and (pointer:fine)');
   const arrange = () => {
    more.open = false;
    more.hidden = roomUsesDesktopControls();
    nav.insertBefore(more, leave);
    for (const button of secondary) {
     if (!more.hidden) menu.append(button);
     else nav.insertBefore(button, more);
    }
   };
   arrange();
   desktop.addEventListener('change', arrange, options);
   document.addEventListener('pointerdown', event => {
    if (more.open && !more.contains(event.target)) more.open = false;
   }, options);
   more.addEventListener('keydown', event => {
    if (event.key === 'Escape' && more.open) {
     event.preventDefault();
     event.stopPropagation();
     more.open = false;
     more.querySelector('summary').focus();
    }
   }, options);
   menu.addEventListener('click', () => { more.open = false; }, options);
  }
  this.roomDMUnreadStop?.();
  let unreadLoading=false,unreadAgain=false,unreadStopped=false,unreadVersion=0;
  const unreadCurrent=()=>!!uid&&uid===me?.id&&!unreadStopped&&!this.closed&&!options.signal.aborted;
  const unread=async()=>{
   if(!unreadCurrent())return;const version=++unreadVersion;
   if(unreadLoading){unreadAgain=true;return;}unreadLoading=true;
   try{
    const d=await api('/api/dm/summary','GET',undefined,{fresh:true});
    if(unreadCurrent()&&version===unreadVersion){const button=room.querySelector('[data-voice=inbox]');button?.toggleAttribute('data-unread-dm',d.direct_unread>0);button?.setAttribute('aria-label',d.direct_unread>0?'메시지 · 안 읽은 DM 있음':'메시지');}
   }catch{}finally{unreadLoading=false;if(unreadAgain){unreadAgain=false;void unread();}}
  };
  void unread();const stopUnread=watchSocialChat('',()=>{if(!unreadCurrent())return;void unread();this.roomInboxChanged?.();},()=>{},()=>{
   if(!unreadCurrent())return;unreadStopped=true;unreadAgain=false;
   const button=room.querySelector('[data-voice=inbox]');button?.removeAttribute('data-unread-dm');button?.setAttribute('aria-label','메시지');
  });
  this.roomDMUnreadStop=()=>{unreadStopped=true;unreadAgain=false;stopUnread();window.removeEventListener('aifect:dm-read',unread);};
  window.addEventListener('aifect:dm-read',unread,options);
  const scrollTitle=()=>{
   const title=room.querySelector('.talk-track strong');
   if(!title)return;
   const overflow=title.scrollWidth-title.parentElement.clientWidth;
   title.parentElement.classList.toggle('is-overflowing',overflow>1);
   title.parentElement.style.setProperty('--room-marquee-distance',-overflow+'px');
   title.parentElement.style.setProperty('--room-marquee-time',Math.max(5,overflow/24)+'s');
  };
  this.roomTitleObserver?.disconnect();
  this.roomTitleObserver=new MutationObserver(scrollTitle);
  this.roomTitleObserver.observe(room.querySelector('#voice-music-player'),{subtree:true,childList:true});
  const viewport=()=>{
   const vv=window.visualViewport;
   if(vv)room.style.setProperty('--room-visual-height',Math.round(vv.height)+'px');
   scrollTitle();
  };
  viewport();window.addEventListener('resize',viewport,options);window.visualViewport?.addEventListener('resize',viewport,options);
  this.updateRoomClock=()=>{
   const created=this.state?.room?.created;if(!created)return;
   const now=Date.now()+(this.musicClock||0),seconds=Math.floor(Math.max(0,now-created)/1000);
   room.querySelector('[data-room-elapsed]').textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
   for(const clock of room.querySelectorAll('[data-room-deadline]')){
    const left=Math.max(0,Math.ceil((Number(clock.dataset.roomDeadline)-now)/1000));
    clock.textContent=left+'초';
    if(!left){for(const b of clock.parentElement.parentElement.querySelectorAll('button[data-request],button[data-voice$="-accept"],button[data-voice$="-reject"]'))b.disabled=true;}
   }
  };
  clearInterval(this.roomClock);this.roomClock=setInterval(()=>this.updateRoomClock(),500);
  const sound=room.querySelector('#voice-sound'),noise=room.querySelector('#voice-noise').closest('section'),extra=sound.querySelector('.voice-audio-extra');
  const preset=room.querySelector('#voice-preset'),strength=room.querySelector('#voice-reverb');
  const group=document.createElement('div');group.className='room-echo-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','에코 스타일');
  const echoLabels={studio:'스튜디오',hall:'홀',karaoke:'노래방'};
  for(const [value,label] of Object.entries(echoLabels)){
   const btn=document.createElement('button');btn.type='button';btn.dataset.echo=value;btn.textContent=label;group.append(btn);
  }
  preset.closest('label').after(group);preset.closest('label').hidden=true;
  extra.append(noise);extra.hidden=false;
  const paint=()=>{
   for(const b of group.children)b.setAttribute('aria-pressed',String(b.dataset.echo===(this.roomEchoOff?'none':preset.value)));
   strength.closest('label').hidden=!!this.roomEchoOff;
  };
  group.onclick=e=>{
   const value=e.target.closest('[data-echo]')?.dataset.echo;if(!value)return;
   this.roomEchoOff=value==='none';
   if(this.roomEchoOff){
    this.preferences.reverb=0;this.liveVocalMix=VoiceAudio.echoMix('none',0);
    for(const graph of new Set([this.processing,this.testGraph])){graph?.setReverb?.(0);graph?.setMix?.(this.liveVocalMix);}
   }else{preset.value=value;preset.dispatchEvent(new Event('change',{bubbles:true}));}
   paint();
  };paint();
 },
 async roomReleaseAction(action,target){
  const s=this.state;
  if(action==='inbox'){
   const sheet=this.host.querySelector('#room-inbox');
   if(this.talkPopup===sheet&&sheet.open){sheet.close();return true;}
   this.showSheet('room-inbox');this.roomDM?.destroy();
   this.roomDM=roomMessages(this,sheet);await this.roomDM.inbox();return true;
  }
  if(action==='room-follow'){
   const p=s.members.find(m=>m.id===target);if(!p?.profile_id||p.following)return true;
   this.pendingRoomFollows??=new Set();
   if(this.pendingRoomFollows.has(target))return true;
   this.pendingRoomFollows.add(target);
   try{
    const saved=await api('/api/producers/'+encodeURIComponent(p.profile_id)+'/follow','PUT');
    const current=this.state?.members.find(member=>member.id===target);
    if(current){current.following=!!saved.following;current.follows_viewer=!!saved.follows_viewer;this.paint();}
   }finally{this.pendingRoomFollows.delete(target);}
   window.dispatchEvent(new CustomEvent('aifect:follow-saved',{detail:{kind:'producer',id:p.profile_id,following:true}}));
   await this.refresh();return true;
  }
  if(action==='member-back'){this.closeMemberTools(true);return true;}
  if(['ask-transfer','ask-ban-day'].includes(action)){
   if(!this.canManageMember(target))return true;
   const box=this.actionTrigger?.closest('.voice-member-tools')||this.host.querySelector('#voice-member-tools .voice-member-tools'),p=s.members.find(m=>m.id===target);
   if(!box||!p)return true;
   box.innerHTML=`<p>${esc(p.name)}님${action==='ask-transfer'?'에게 방장을 넘길까요?':'을 하루 동안 추방할까요?'}</p><button type="button" data-voice="member-back">취소</button><button type="button" data-voice="${action==='ask-transfer'?'transfer-host':'ban-day'}" data-target="${esc(target)}">확인</button>`;
   return true;
  }
  if(['ban-day','transfer-host'].includes(action)){
   if(this.canManageMember(target))this.acceptState(await this.command('moderate',{operation:action,target_id:target}));
   this.closeMemberTools();await this.refresh();return true;
  }
  if(action==='reservation-invite'||action==='reservation-remove'){
   if(this.canManageMember(target))this.acceptState(await this.command('karaoke',{operation:action==='reservation-invite'?'invite':'cancel',target_id:target,request_id:crypto.randomUUID()}));
   this.closeMemberTools();return true;
  }
  if(action==='reservation-accept'||action==='reservation-reject'){
   const result=await this.command('karaoke',{operation:'answer-invite',invitation_id:target});
   this.acceptState(result);
   if(action==='reservation-accept')await liveKaraokeAction(this,'karaoke-search-open');
   return true;
  }
  return false;
 }
});
function roomMessages(client,sheet){
 const events=new AbortController(),options={signal:events.signal};
 let peer=null,serial=0,stream=null,stickers=null,editor=null,noticeCleanup=null,timer,paused=false;
 const current=t=>!client.closed&&!events.signal.aborted&&sheet.open&&t===serial;
 function reset(){serial++;clearTimeout(timer);stream?.();stream=null;client.roomInboxChanged=null;stickers?.destroy();stickers=null;editor?.destroy();editor=null;noticeCleanup?.();noticeCleanup=null;return serial;}
 const destroy=()=>{reset();events.abort();};
 sheet.addEventListener('close',()=>{if(!sheet.open&&!paused)destroy();},options);
 const report=e=>{if(!events.signal.aborted){const status=sheet.querySelector('[data-room-dm-status]');if(status)status.textContent=e.message;}};
 async function inbox(){
  const t=reset();peer=null;
  sheet.innerHTML='<header class="room-popup-heading"><h2 id="room-inbox-title">메시지</h2></header><label class="room-dm-query">팔로우 검색<input type="search" aria-label="메시지를 보낼 팔로우 검색" placeholder="닉네임 검색"></label><div class="room-dm-list"></div><small data-room-dm-status role="status"></small>';
  client.ensureRoomPopupClose?.(sheet);
  const input=sheet.querySelector('input'),list=sheet.querySelector('.room-dm-list');let search=0,noticeId=null;
  const load=async()=>{
   const q=input.value.trim(),seq=++search;
   const d=await api(q?'/api/follow-management?tab=following&kind=producers&sort=name&q='+encodeURIComponent(q):unifiedDmInboxPath,'GET',undefined,{fresh:true});
   if(!current(t)||seq!==search||q!==input.value.trim())return;
   const people=q?d.items:d.conversations;noticeId=null;
   list.innerHTML=people.map(p=>{
    const id=q?p.profile_id:p.id;if(!id)return '';
    const notice=!q&&p.is_notice===true&&p.notice_type==='official'&&p.read_only===true;
    if(notice)noticeId=id;
    const art=notice?'<span class="avatar-fallback room-welcome-art" aria-hidden="true">'+voiceGlyph('megaphone')+'</span>':avatarImage({...p,profile_id:id});
    const name=notice?'공지':userNickname(chatNickname(p),{profileId:id,userId:p.user_id});
    return `<button type="button" data-room-peer="${esc(id)}">${art}<span><strong>${name}</strong><small>${esc(AifectStickers.preview(p.last_message||''))}</small></span>${p.unread?`<b>${Number(p.unread)}</b>`:''}<time>${p.updated?esc(inboxTime(p.updated)):''}</time></button>`;
   }).join('')||'<p>표시할 대화가 없습니다.</p>';
  };
  list.onclick=e=>{const id=e.target.closest('[data-room-peer]')?.dataset.roomPeer;if(id)(id===noticeId?officialNotice():thread(id)).catch(report);};
  input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>load().catch(report),150);};
  await load();if(current(t))client.roomInboxChanged=()=>load().catch(report);
 }
 async function officialNotice(){
  const t=reset(),uid=me?.id;
  const d=await api(officialNoticePath,'GET',undefined,{fresh:true});if(!current(t)||uid!==me?.id)return;
  peer=null;
  sheet.innerHTML='<header class="room-dm-header"><button type="button" data-room-back aria-label="메시지 목록">‹</button><span class="avatar-fallback room-welcome-art" aria-hidden="true">'+voiceGlyph('megaphone')+'</span><div class="room-official-notice-title"><strong>공지</strong><small>'+esc(d.channel.name)+'</small></div></header><div class="room-welcome-guide">'+officialNoticeTimeline(d)+'</div>';
  client.ensureRoomPopupClose?.(sheet);
  sheet.querySelector('[data-room-back]').onclick=()=>inbox().catch(report);
  noticeCleanup=bindOfficialNotices(sheet,d,{onRead:()=>{
   if(!current(t)||uid!==me?.id)return;
   window.dispatchEvent(new Event('aifect:dm-read'));
   window.dispatchEvent(new Event('aifect:inbox-refresh'));
   void refreshMessageBadge();
  }});
  client.roomInboxChanged=()=>void noticeCleanup?.refresh?.();
 }
 async function thread(id){
  const t=reset(),path='/api/dm/'+encodeURIComponent(id);
  const d=await api(path,'GET',undefined,{fresh:true});if(!current(t))return;
  peer=d.peer;
  sheet.innerHTML=`<header class="room-dm-header"><button type="button" data-room-back aria-label="메시지 목록">‹</button>${avatarImage({...peer,profile_id:id})}<strong>${userNickname(chatNickname(peer),{profileId:id,userId:peer.user_id})}</strong>${dmMuteButton({...peer,muted:d.settings?.muted})}</header><div class="room-dm-log" role="log"></div>${dmEmojiPickerHTML()}${chatComposerHTML({id:'room-dm-compose',className:'room-dm-composer',rich:true,emojiAttributes:'data-dm-emoji aria-controls="dm-emoji-picker"',giftAttributes:'data-room-dm-gift',leadingHTML:'<label class="chat-ui-icon chat-ui-plain" aria-label="사진 첨부" tabindex="0">'+icon('image')+'<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>'})}<small role="status" data-room-dm-status></small>`;
  client.ensureRoomPopupClose?.(sheet);
  const log=sheet.querySelector('.room-dm-log'),form=sheet.querySelector('form'),input=form.querySelector("[data-dm-editor]"),file=form.querySelector('input[type=file]'),status=sheet.querySelector('[data-room-dm-status]');
  const messages=new Map();let cursor=0,reading=false,again=false,pending=null;
  async function merge(batch){
   if(!current(t))return;
   const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<36||!messages.size;
   for(const m of batch){messages.set(m.id,m);cursor=Math.max(cursor,m.sequence);}
   log.innerHTML=chatHTML([...messages.values()],peer);if(atEnd)log.scrollTop=log.scrollHeight;
   if(batch.some(m=>m.sender_id!==me.id)&&cursor){await api(path,'PATCH',{sequence:cursor});window.dispatchEvent(new Event('aifect:dm-read'));}
  }
  const reload=async()=>{
   if(!current(t))return;if(reading){again=true;return;}reading=true;
   try{do{again=false;const more=await api(path+'?after='+cursor,'GET',undefined,{fresh:true});if(!current(t))return;await merge(more.messages);if(more.has_more&&more.messages.length)again=true;}while(again&&current(t));}finally{reading=false;}
  };
  client.ensureRoomPopupClose?.(sheet);
  sheet.querySelector('[data-room-back]').onclick=()=>inbox().catch(report);
  editor=AifectStickers.editor(input,toast);stickers=bindDmEmoji(form,input,editor);
  file.onchange=()=>{status.textContent=file.files[0]?.name||'';pending=null;};
  form.querySelector('label').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click();}};
  form.onsubmit=async e=>{
   e.preventDefault();if(form._busy||(!editor.get().trim()&&!file.files.length)||!editor.canSend())return;
   const body=editor.get().trim(),image=file.files[0];
   if(!pending||pending.body!==body||pending.file!==image)pending={key:crypto.randomUUID(),body,file:image};
   form._busy=true;input.contentEditable="false";file.disabled=true;
   try{
    if(image&&!pending.upload)pending.upload=await uploadChatImage(path+'/images',image);
    if(!current(t))return;
    await api(path,'POST',{body:body||(image?'사진':''),request_id:pending.key,...(image?{image_id:pending.upload.id}:{})});
    if(!current(t))return;
    pending=null;file.value='';editor.set('');status.textContent='';stickers.sent();await reload();
   }catch(err){report(err);}finally{form._busy=false;input.contentEditable='true';file.disabled=false;}
  };
  bindChatEnter(input,()=>form.requestSubmit());
  sheet.querySelector('[data-room-dm-gift]').onclick=async()=>{
   if(!current(t))return;
   paused=true;
   try{
    await profileGiftDialog(id,{id:'star',fromMessage:true});
    const modal=document.querySelector('#dialog');
    if(modal.open)modal.addEventListener('close',()=>{if(client.closed||events.signal.aborted)return;paused=false;client.adoptRoomPopup(sheet);reload().catch(report);},{once:true});
    else paused=false;
   }catch(e){paused=false;report(e);}
  };
  // A read receipt can take a network round trip. Bind the visible form first.
  void merge(d.messages).catch(report);
  stream=watchSocialChat('?peer='+encodeURIComponent(id),()=>reload().catch(report),()=>{},()=>{if(current(t))inbox().catch(report);});
 }
 return {inbox,thread,destroy};
}
function bindRoomGiftWallet(form){
 const gift=form.closest('.gift-dialog'),content=gift.parentElement,modal=form.closest('dialog');
 let walletView=null;
 const active=()=>form.isConnected&&modal.open&&walletView?.isConnected;
 const back=async()=>{
  if(!active())return;
  walletView.remove();walletView=null;gift.hidden=false;
  await form._giftUI.refreshWallet();
 };
 async function open(kind){
  if(form._busy||active())return;
  walletView=document.createElement('section');walletView.className='room-wallet-view';
  content.append(walletView);gift.hidden=true;
  const title=kind==='gold'?'골드 충전':'오늘의 실버받기';
  walletView.innerHTML=`<header><button type="button" data-wallet-back aria-label="선물로 돌아가기">‹</button><strong>${title}</strong></header><div data-wallet-body role="region"></div><p role="status" data-wallet-status>불러오는 중…</p>`;
  walletView.querySelector('[data-wallet-back]').onclick=()=>back().catch(e=>toast(e.message));
  const area=walletView.querySelector('[data-wallet-body]'),status=walletView.querySelector('[data-wallet-status]');
  try{
   const d=await api('/api/gold','GET',undefined,{fresh:true});if(!active())return;status.textContent='';
   const titleNode=walletView.querySelector('header strong');
   const balance=document.createElement('span');balance.className='room-wallet-balance';balance.dataset.walletCurrency=kind==='gold'?'G':'S';titleNode.after(balance);
   if(kind==='silver'){
    const labels={checkin:'오늘 출석',cover:'커버곡 공개',listen:'노래 5곡 감상',comment1:'첫 번째 댓글',comment2:'두 번째 댓글',comment3:'세 번째 댓글'};
    const paint=free=>{
     balance.innerHTML=shopPrice(free.balance,'S',20);
     area.innerHTML=free.rewards.map(r=>`<div class="room-wallet-mission"><div><strong>${esc(labels[r.kind]||r.kind)}</strong><small>${number(r.progress)} / ${number(r.target)} · ${shopPrice(r.amount,'S')}</small></div><button type="button" data-mission="${esc(r.kind)}" ${r.claimed||!r.eligible?'disabled':''}>${r.claimed?'수령 완료':r.eligible?'받기':number(r.progress)+' / '+number(r.target)}</button></div>`).join('');
    };
    paint(d.free);
    let claiming=false;
    area.onclick=async e=>{
     const button=e.target.closest('[data-mission]');if(!button||button.disabled||claiming)return;
     claiming=true;button.disabled=true;
     try{const free=await api('/api/gifts/free/claim','POST',{kind:button.dataset.mission});if(active())paint(free);}
     catch(err){if(active()){button.disabled=false;status.textContent=err.message;}}
     finally{claiming=false;}
    };
    return;
   }
   const packs=inApp?d.packs:d.web_packs,ready=!inApp&&(d.review_only||d.checkout_available);
   balance.innerHTML=shopPrice(d.balance,'G',20);
   let chosen=packs?.[0]?.gold;
   area.innerHTML=(packs||[]).map(p=>`<button type="button" class="room-wallet-pack" data-room-pack="${Number(p.gold)}" aria-pressed="${chosen===p.gold}"><strong>${shopPrice(p.total_gold??p.gold,'G',24)}<small>${number(p.gold)} g${p.bonus_gold?' + '+number(p.bonus_gold)+' g':''}</small></strong><span>${number(p.price)}원</span></button>`).join('')+`<button class="room-wallet-confirm" type="button" ${!chosen||!ready?'disabled':''}>결제 내용 확인</button>`;
   if(!ready)status.textContent='현재 골드 충전을 이용할 수 없습니다.';
   area.onclick=async e=>{
    const item=e.target.closest('[data-room-pack]');
    if(item){chosen=Number(item.dataset.roomPack);for(const b of area.querySelectorAll('[data-room-pack]'))b.setAttribute('aria-pressed',String(b===item));return;}
    const button=e.target.closest('.room-wallet-confirm');if(!button||button.disabled)return;
    button.disabled=true;
    try{
     await openGoldCheckout(chosen,{
      render(html){if(active())area.innerHTML=html;},
      review(){if(active())area.innerHTML='<a class="primary-button" href="/checkout/toss/gold" target="_blank" rel="noopener">토스 TEST 주문서 열기</a>';}
     });
    }catch(err){if(active())status.textContent=err.message;}
    finally{button.disabled=false;}
   };
  }catch(e){if(active())status.textContent=e.message;}
 }
 for(const [cls,kind] of [['gift-charge-button','gold'],['gift-silver-button','silver']]){
  const link=form.querySelector('.'+cls);if(!link)continue;
  const button=document.createElement('button');button.type='button';button.className=cls;button.innerHTML=link.innerHTML;
  link.replaceWith(button);button.onclick=()=>open(kind);
 }
}
