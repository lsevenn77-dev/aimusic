function roomRelationButton(member,self,compact=false){
 if(!member?.profile_id||member.id===self||typeof member.following!=='boolean')return '';
 if(member.following){
  if(compact||!member.follows_viewer)return '';
  return `<span class="room-mutual" aria-label="맞팔">${voiceGlyph('person')}<svg width="5" height="5" viewBox="0 0 10 10" aria-hidden="true"><path fill="currentColor" d="M5 9 1 5C-1 1 3-1 5 2c2-3 6-1 4 3Z"/></svg></span>`;
 }
 return `<button type="button" class="${compact?'room-follow-add':'room-follow'}" data-voice="room-follow" data-target="${esc(member.id)}" aria-label="${esc(member.name)} 팔로우">${compact?voiceGlyph('plus'):`${voiceGlyph('person')}<small>+</small>`}</button>`;
}
function roomInviteButtons(invitation){
 const isSong=invitation.kind==='reservation',prefix=isSong?'reservation':'seat';
 return `<span>${isSong?'예약 초대':'좌석 초대'} <time class="room-guide-countdown" data-room-deadline="${Number(invitation.expires)}"></time></span><button type="button" data-voice="${prefix}-accept" data-target="${esc(invitation.id)}">수락</button><button type="button" data-voice="${prefix}-reject" data-target="${esc(invitation.id)}">거절</button>`;
}
Object.assign(VoiceRoomClient.prototype,{
 bindRoomRelease(){
  const options={signal:this.talkViewEvents.signal},room=this.host;
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
  const echoLabels={none:'없음',studio:'스튜디오',hall:'홀',karaoke:'노래방'};
  for(const [value,label] of Object.entries(echoLabels)){
   const btn=document.createElement('button');btn.type='button';btn.dataset.echo=value;btn.textContent=label;group.append(btn);
  }
  preset.closest('label').after(group);preset.closest('label').hidden=true;
  sound.append(noise);extra.hidden=true;
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
   await api('/api/producers/'+encodeURIComponent(p.profile_id)+'/follow','PUT');
   window.dispatchEvent(new CustomEvent('aifect:follow-saved',{detail:{kind:'producer',id:p.profile_id,following:true}}));
   await this.refresh();return true;
  }
  if(action==='member-back'){this.closeMemberTools(true);return true;}
  if(['ask-transfer','ask-ban-day'].includes(action)){
   if(!this.canManageMember(target))return true;
   const box=this.host.querySelector('#voice-member-tools .voice-member-tools'),p=s.members.find(m=>m.id===target);
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
 let peer=null,serial=0,stream=null,stickers=null,editor=null,timer,paused=false;
 const current=t=>!client.closed&&!events.signal.aborted&&sheet.open&&t===serial;
 function reset(){serial++;clearTimeout(timer);stream?.();stream=null;stickers?.destroy();stickers=null;editor?.destroy();editor=null;return serial;}
 const destroy=()=>{reset();events.abort();};
 sheet.addEventListener('close',()=>{if(!sheet.open&&!paused)destroy();},options);
 const report=e=>{if(!events.signal.aborted){const status=sheet.querySelector('[data-room-dm-status]');if(status)status.textContent=e.message;}};
 async function inbox(){
  const t=reset();peer=null;
  sheet.innerHTML='<label class="room-dm-query">팔로우 검색<input type="search" aria-label="메시지를 보낼 팔로우 검색" placeholder="닉네임 검색"></label><div class="room-dm-list"></div><small data-room-dm-status role="status"></small>';
  const input=sheet.querySelector('input'),list=sheet.querySelector('.room-dm-list');let search=0;
  const load=async()=>{
   const q=input.value.trim(),seq=++search;
   const d=await api(q?'/api/follow-management?tab=following&kind=producers&sort=name&q='+encodeURIComponent(q):'/api/dm','GET',undefined,{fresh:true});
   if(!current(t)||seq!==search||q!==input.value.trim())return;
   const people=q?d.items:d.conversations;
   list.innerHTML=people.map(p=>{
    const id=q?p.profile_id:p.id;if(!id)return '';
    return `<button type="button" data-room-peer="${esc(id)}">${avatarImage({...p,profile_id:id})}<span><strong>${esc(chatNickname(p))}</strong><small>${esc(AifectStickers.preview(p.last_message||''))}</small></span>${p.unread?`<b>${Number(p.unread)}</b>`:''}<time>${p.updated?esc(inboxTime(p.updated)):''}</time></button>`;
   }).join('')||'<p>표시할 대화가 없어요.</p>';
  };
  list.onclick=e=>{const id=e.target.closest('[data-room-peer]')?.dataset.roomPeer;if(id)thread(id).catch(report);};
  input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>load().catch(report),150);};
  await load();if(current(t))stream=watchSocialChat('',()=>load().catch(report),()=>{},()=>load().catch(report));
 }
 async function thread(id){
  const t=reset(),path='/api/dm/'+encodeURIComponent(id);
  const d=await api(path,'GET',undefined,{fresh:true});if(!current(t))return;
  peer=d.peer;
  sheet.innerHTML=`<header class="room-dm-header"><button type="button" data-room-back aria-label="메시지 목록">‹</button>${avatarImage({...peer,profile_id:id})}<strong>${esc(chatNickname(peer))}</strong>${dmMuteButton({...peer,muted:d.settings?.muted})}</header><div class="room-dm-log" role="log"></div>${dmEmojiPickerHTML()}<form class="room-dm-composer"><label aria-label="사진 첨부" tabindex="0">${icon('image')}<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label><div class="talk-message-field"><div role="textbox" contenteditable="true" aria-multiline="true" aria-label="메시지" aria-placeholder="메시지를 입력하세요…" data-dm-editor data-limit="2000"></div><button type="button" data-dm-emoji aria-label="이모티콘">${voiceGlyph('smile')}</button></div><button aria-label="보내기">${voiceGlyph('send')}</button><button type="button" data-room-dm-gift aria-label="선물">${voiceGlyph('present')}</button></form><small role="status" data-room-dm-status></small>`;
  const log=sheet.querySelector('.room-dm-log'),form=sheet.querySelector('form'),input=form.querySelector("[data-dm-editor]"),file=form.querySelector('input[type=file]'),status=sheet.querySelector('[data-room-dm-status]');
  const messages=new Map();let cursor=0,reading=false,again=false,pending=null;
  async function merge(batch){
   if(!current(t))return;
   const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<36||!messages.size;
   for(const m of batch){messages.set(m.id,m);cursor=Math.max(cursor,m.sequence);}
   log.innerHTML=chatHTML([...messages.values()],peer);if(atEnd)log.scrollTop=log.scrollHeight;
   if(batch.some(m=>m.sender_id!==me.id)&&cursor)await api(path,'PATCH',{sequence:cursor});
  }
  const reload=async()=>{
   if(!current(t))return;if(reading){again=true;return;}reading=true;
   try{do{again=false;const more=await api(path+'?after='+cursor,'GET',undefined,{fresh:true});if(!current(t))return;await merge(more.messages);if(more.has_more&&more.messages.length)again=true;}while(again&&current(t));}finally{reading=false;}
  };
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
 return {inbox,destroy};
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
   const balance=document.createElement('span');balance.className='room-wallet-balance';titleNode.after(balance);
   if(kind==='silver'){
    const labels={checkin:'오늘 출석',cover:'커버곡 공개',listen:'노래 5곡 감상',comment1:'첫 번째 댓글',comment2:'두 번째 댓글',comment3:'세 번째 댓글'};
    const paint=free=>{
     balance.textContent=number(free.balance)+' S';
     area.innerHTML=free.rewards.map(r=>`<div class="room-wallet-mission"><div><strong>${esc(labels[r.kind]||r.kind)}</strong><small>${number(r.progress)} / ${number(r.target)} · ${number(r.amount)} S</small></div><button type="button" data-mission="${esc(r.kind)}" ${r.claimed||!r.eligible?'disabled':''}>${r.claimed?'수령 완료':r.eligible?'받기':number(r.progress)+' / '+number(r.target)}</button></div>`).join('');
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
   balance.textContent=number(d.balance)+' G';
   let chosen=packs?.[0]?.gold;
   area.innerHTML=(packs||[]).map(p=>`<button type="button" class="room-wallet-pack" data-room-pack="${Number(p.gold)}" aria-pressed="${chosen===p.gold}"><strong>${number(p.total_gold??p.gold)} G<small>${number(p.gold)} G${p.bonus_gold?' + '+number(p.bonus_gold)+' G':''}</small></strong><span>${number(p.price)}원</span></button>`).join('')+`<button class="room-wallet-confirm" type="button" ${!chosen||!ready?'disabled':''}>결제 내용 확인</button>`;
   if(!ready)status.textContent='현재 골드 충전을 이용할 수 없어요.';
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
