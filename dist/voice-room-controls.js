// Room controls share VoiceRoomClient's server snapshots and media graph.
Object.assign(VoiceRoomClient.prototype,{
 bindFinalControls(){
  this.controlEvents?.abort();this.controlEvents=new AbortController();const options={signal:this.controlEvents.signal};
  const form=$('#voice-chat-form'),input=$('#voice-message');
  const picker=$('#voice-emoji-picker');
  input.addEventListener('input',()=>resizeChatInput(input),options);form.addEventListener('reset',()=>queueMicrotask(()=>resizeChatInput(input)),options);resizeChatInput(input);
  this.stickers?.destroy();this.chatEditor?.destroy();
  this.chatEditor=AifectStickers.editor(input,toast);
  if(picker?.classList?.contains('cat-picker'))this.stickers=AifectStickers.bind({
   picker,form,input,toggle:this.host.querySelector('[data-voice="emoji"]'),glyph:voiceGlyph,
   inline:this.chatEditor,closeButton:!this.liveMode,
   close:()=>this.toggleEmojiPicker(false,true)
  });
  this.bindChatInteraction(form,input,picker,options);
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229&&!this.chatEditor.isComposing?.()){e.preventDefault();if((this.stickers?.body()??this.chatEditor.get()).trim())form.requestSubmit();}};
  this.host.querySelector('.voice-chat-panel').addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#voice-emoji-picker').hidden){e.preventDefault();e.stopPropagation();this.toggleEmojiPicker(false,true);}},options);
  this.bindTalkViews();
  const supported=navigator.mediaDevices?.getSupportedConstraints?.()||{};
  for(const [id,key] of [['voice-echo','echoCancellation'],['voice-noise','noiseSuppression']])if(supported[key]===false){$('#'+id).disabled=true;$('#'+id).title='이 브라우저에서 지원하지 않는 설정입니다.';}
  $('#voice-echo').checked=this.preferences.echo;$('#voice-echo').onchange=()=>this.safe(async()=>{this.preferences.echo=$('#voice-echo').checked;await this.stream?.getAudioTracks()[0]?.applyConstraints({echoCancellation:this.preferences.echo});});
  $('#voice-playlist-volume').oninput=e=>this.setPersonalVolume(Number(e.target.value)/100);
  this.host.addEventListener('close',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},{...options,capture:true});
  this.host.addEventListener('cancel',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},{...options,capture:true});
  this.host.addEventListener('input',e=>{if(e.target.id==='voice-mini-volume'||e.target.id==='voice-personal-volume')this.setPersonalVolume(Number(e.target.value)/100);},options);
  // No room track list is queried until the host submits a search.
  $('#voice-music-results').innerHTML='';
  this.host.addEventListener('input',e=>this.updateDesignField(e.target),options);
  this.host.addEventListener('change',e=>this.updateDesignField(e.target),options);
  this.host.addEventListener('click',e=>{if(!e.composedPath().some(node=>node.matches?.('#voice-member-tools,#talk-dock-member-tools,.voice-member-more,.talk-strip-person')))this.closeMemberTools();},options);
  $('#voice-members').addEventListener?.('scroll',()=>{if(this.liveMode)this.closeMemberTools();},options);
  $('#voice-members').addEventListener?.('close',()=>this.closeMemberTools(),options);
  $('#voice-members').addEventListener?.('keydown',e=>{if(e.key==='Escape'&&!$('#voice-member-tools').hidden){e.preventDefault();e.stopPropagation();this.closeMemberTools(true);}},options);
  $('#voice-music-sheet').addEventListener?.('keydown',e=>{if(e.key==='Escape'){e.preventDefault();$('#voice-music-sheet').close();}},options);
 },
 updateDesignField(el){
  if(el?.type==='range'){const pct=(Number(el.value)-Number(el.min||0))/(Number(el.max||100)-Number(el.min||0))*100;el.style.setProperty('--range-fill',pct+'%');const output=this.host.querySelector(`[data-value-for="${el.id}"]`);if(output)output.textContent=Math.round(el.value)+'%';}
  if(el?.name==='announcement')el.form.querySelector('output').textContent=el.value.length+'/200';
  if(el?.name==='visibility'){const field=el.form?.querySelector('.voice-crew-setting');if(field)field.hidden=el.form.elements.visibility.value!=='crew';}
 },
 closeMemberTools(focus=false){const id=this.memberTarget;for(const box of this.host.querySelectorAll('#voice-member-tools,#talk-dock-member-tools')){box.hidden=true;box.innerHTML='';}this.memberTarget=null;for(const b of this.host.querySelectorAll('.voice-member-more,.talk-strip-person[data-voice="member-menu"]')){b.setAttribute('aria-expanded','false');if(focus&&b.dataset.target===id)b.focus();}},
 paintFinalControls(){
  const s=this.state,self=s.members.find(m=>m.id===s.self),host=s.room.host_id===self.id;
  const themeKey=JSON.stringify([s.room.id,s.room.host_id,s.room.settings_revision||0,s.room.theme_sku||s.room.background]);
  if(themeKey!==this.roomThemeKey||s.room.theme&&this.lastDecoratedTheme!==s.room.theme.sku){
   this.roomThemeKey=themeKey;this.lastDecoratedTheme=s.room.theme?.sku;
   window.dispatchEvent(new CustomEvent('aifect:room-theme',{detail:{room:s.room,key:themeKey}}));
  }
  const announcement=$('#voice-announcement');$('#voice-announcement-text').textContent=s.room.announcement||'';announcement.hidden=!s.room.announcement;
  const queue=s.karaoke?.queue||[];
  const singer=s.karaoke?.active?.user_id;
  const reservations=new Map(queue.map((entry,index)=>[entry.user_id,index+1]));
  const rank=p=>this.liveMode?(p.id===singer?0:reservations.get(p.id)??Infinity):p.seat??Infinity;
  const members=[...s.members].sort((a,b)=>rank(a)-rank(b));
  const tag=p=>this.liveMode?(p.id===singer?'가창 중':reservations.has(p.id)?'예약 '+reservations.get(p.id):''):Number.isInteger(p.seat)?'좌석 '+(p.seat+1):'';
  const memberHTML=members.map(p=>`<div class="voice-member-row" data-level-user="${esc(p.id)}"><button type="button" class="room-member-profile" data-voice="talk-profile" data-target="${esc(p.id)}" aria-label="${esc(p.name)} 프로필">${roomMemberAvatar(p)}<span class="voice-member-info"><strong>${p.role==='host'?'<span class="room-host-crown" aria-label="방장">'+voiceGlyph('crown')+'</span>':''}<span title="${esc(p.name)}">${userNickname(p.name,{profileId:p.profile_id,userId:p.id})}</span></strong><small>${p.muted||!p.publishing?'마이크 꺼짐':'마이크 켜짐'}${tag(p)?' <span class="room-place-tag">'+tag(p)+'</span>':''}</small></span></button>${roomRelationButton(p,s.self)}${this.liveMode&&p.id===s.self&&s.karaoke?.queue?.some(q=>q.user_id===p.id)?'<button type="button" data-voice="karaoke-cancel">예약 취소</button>':''}${this.canManageMember(p.id)?`<button type="button" class="voice-member-more" data-voice="member-menu" data-target="${esc(p.id)}" aria-label="${esc(p.name)} 관리" aria-expanded="false" aria-controls="voice-member-tools">${voiceGlyph('talkMore')}</button>`:''}</div>`).join('');
  const memberKey=memberHTML+JSON.stringify(members.map(p=>[p.id,p.muted,p.locked]));if(memberKey!==this.memberHTML){$('#voice-members-list').before($('#voice-member-tools'));$('#voice-members-list').innerHTML=memberHTML;this.memberHTML=memberKey;this.closeMemberTools();}
  const invitation=s.seat_invites?.[0],el=$('#voice-seat-invitation');el.hidden=!invitation||!this.liveMode;
  el.innerHTML=invitation&&this.liveMode?roomInviteButtons(invitation):'';
  clearTimeout(this.seatInviteTimer);if(invitation)this.seatInviteTimer=setTimeout(()=>{el.hidden=true;},Math.max(0,invitation.expires-Date.now()-(this.musicClock||0)));
  $('#voice-settings-readonly').hidden=host;if(!host){for(const el of $('#voice-settings-form').elements)el.disabled=el.dataset.voice!=='dismiss';}
  if(this.memberTarget&&!this.canManageMember(this.memberTarget))this.closeMemberTools();
 },
 canManageMember(id){const s=this.state,p=s?.members.find(member=>member.id===id);return !!p&&s.self===s.room.host_id&&p.id!==s.self&&p.id!==s.room.host_id&&p.role!=='host';},
 memberTools(id,trigger){
  const s=this.state,self=s.members.find(p=>p.id===s.self),p=s.members.find(p=>p.id===id);
  if(!this.canManageMember(id))return;
  if(this.memberTarget===id){this.closeMemberTools(true);return;}
  this.closeMemberTools();
  this.memberTarget=id;const empty=Array.from({length:8},(_,i)=>i).filter(i=>!s.members.some(m=>m.seat===i));
  const own=id===self.id,locked=own?'disabled':'';
  const inDock=trigger?.closest('#talk-dock'),box=$(inDock?'#talk-dock-member-tools':'#voice-member-tools');
  const item=(action,label,glyph,disabled=false)=>`<button type="button" data-voice="${action}" data-target="${esc(id)}" ${disabled?'disabled':''}>${voiceGlyph(glyph)}${label}</button>`;
  const queued=s.karaoke?.queue?.some(q=>q.user_id===id);
  const currentSinger=this.liveMode&&s.karaoke?.active?.user_id===id;
  box.innerHTML=`<section class="voice-member-tools"><header>${item('member-back','뒤로','previous')}${roomMemberAvatar(p,true)}<strong>${userNickname(p.name,{profileId:p.profile_id,userId:p.id})}</strong></header>
    ${item(this.liveMode?'reservation-invite':'member-invite',this.liveMode?'예약 초대':'자리로 초대','plus',this.liveMode?queued||s.karaoke?.active?.user_id===id:p.seat!==null||!empty.length)}
    ${p.locked||currentSinger||(!this.liveMode&&Number.isInteger(p.seat))?item(p.locked?'unlock':'mute-user',p.locked?'마이크 허용':'마이크 내리기','muted'):''}
    ${item(this.liveMode?'reservation-remove':'member-remove',this.liveMode?'예약에서 제거':'자리에서 제거','leave',this.liveMode?!queued:p.seat===null)}
    ${currentSinger?`<button type="button" data-voice="karaoke-next" data-target="${esc(s.karaoke.active.invitation_id)}">현재 순서 건너뛰기</button>`:''}${item('ask-kick','강퇴','ban')}${item('ask-ban-day','1일 추방','ban')}${item('ask-transfer','방장 넘기기','crown')}</section>`;
  box.hidden=false;
  const button=trigger||[...$('#voice-members').querySelectorAll('.voice-member-more')].find(b=>b.dataset.target===id);
  const row=button.closest('.voice-member-row');if(row)row.after(box);
  box.style.removeProperty('left');box.style.removeProperty('top');
  button.setAttribute('aria-expanded','true');box.querySelector('a,button:not(:disabled)')?.focus({preventScroll:true});
 },
 openSeatPicker(seat){
  if(this.state.members.find(p=>p.id===this.state.self)?.role!=='host')return;
  this.invitingSeat=seat;this.showSheet('voice-seat-picker');
  $('#voice-seat-candidates').innerHTML=this.state.members.filter(p=>p.seat===null).map(p=>`<button type="button" class="voice-member-row" data-voice="invite-seat-user" data-target="${esc(p.id)}">${avatarImage({name:p.name,profile_id:p.profile_id,user_id:p.id,image_version:p.image_version})}<span>${userNickname(p.name,{profileId:p.profile_id,userId:p.id})}</span></button>`).join('')||'<p class="quiet">현재 청취 중인 참여자가 없습니다.</p>';
 },
 canDock(){return !this.liveMode&&window.innerWidth>800&&window.innerHeight>=600&&this.host.clientWidth>=680;},
 paintTalkPanel(self,micOn){
  const s=this.state,owner=self.id===s.room.host_id;
  // Inheriting the host seat grants control, not permission to start capturing audio.
  if(owner&&this.previousTalkHost&&this.previousTalkHost!==self.id)this.warmSeat=this.generation;
  this.previousTalkHost=s.room.host_id;
  const seated=Number.isInteger(self.seat);
  if(!owner)for(const id of ['voice-seat-picker','voice-kick-confirm'])if($('#'+id)?.open)$('#'+id).close();
  const applicant=owner?s.members.find(m=>m.requested):null;
  const request=$('#talk-request'),key=JSON.stringify([s.seat_invites?.[0]?.id,applicant?.id,applicant?.name,applicant?.requestVersion??applicant?.requestExpires,this.seatCommandPending,this.micState,self.requested,self.requestVersion??self.requestExpires,self.locked,self.seat,micOn]);
  if(this.talkRequestKey!==key){
   this.talkRequestKey=key;
   const busy=this.seatCommandPending?'disabled aria-busy="true"':'';
   if(applicant)request.innerHTML=`<span class="talk-applicant"><strong title="${esc(applicant.name)}">${userNickname(applicant.name,{profileId:applicant.profile_id,userId:applicant.id})}</strong><small>좌석 신청 <time data-room-deadline="${Number(applicant.requestExpires)}"></time></small></span><button type="button" data-voice="approve-mic" data-target="${esc(applicant.id)}" data-request="${applicant.requestVersion??applicant.requestExpires}" ${busy}>수락</button><button type="button" data-voice="reject-mic" data-target="${esc(applicant.id)}" data-request="${applicant.requestVersion??applicant.requestExpires}" ${busy}>거절</button>`;
   else if(self.requested)request.innerHTML=`<span>좌석 신청 중 <time data-room-deadline="${Number(self.requestExpires)}"></time></span><button type="button" data-voice="cancel-mic" data-request="${self.requestVersion??self.requestExpires}" ${busy}>신청 취소</button>`;
   else if(s.seat_invites?.length){const i=s.seat_invites[0];request.innerHTML=roomInviteButtons(i);}
   else request.textContent=self.locked?'마이크 사용 제한':'';
  }
  const mic=this.host.querySelector('.talk-seat-controls [data-voice=toggle-mic]');
  if(mic.dataset.on!==String(micOn)){mic.dataset.on=String(micOn);mic.innerHTML=voiceGlyph(micOn?'talkMicOff':'talkMic');}
  const sound=this.host.querySelector('.talk-seat-actions [data-voice=sound]');
  sound.hidden=!seated;
  mic.hidden=!seated;mic.disabled=self.locked||!seated||!!this.micBusy;
  const down=this.host.querySelector('.talk-seat-controls [data-voice=release-mic]');if(down){down.hidden=!seated;down.disabled=!!this.seatReleasePending;}
  mic.setAttribute('aria-pressed',String(micOn));mic.title=micOn?'음소거':'마이크 켜기';mic.setAttribute('aria-label',mic.title);
  mic.setAttribute('aria-busy',String(!!this.micBusy));


 },
 showRoomNotice(text){
  const notice=this.host.querySelector('.room-event-notice');
  if(!notice||this.closed)return;
  clearTimeout(this.roomNoticeTimer);
  notice.textContent=text;notice.classList.add('is-visible');
  this.roomNoticeTimer=setTimeout(()=>{
   notice.classList.remove('is-visible');
   this.roomNoticeTimer=setTimeout(()=>{notice.textContent='';},150);
  },2350);
 },
 updateRoomNotice(self,micOn){
  const previous=this.roomNoticeState;
  const seated=this.liveMode?this.state.karaoke?.active?.user_id===self.id:Number.isInteger(self.seat);
  this.roomNoticeState={seated,micOn,mode:this.liveMode};
  if(!previous||previous.mode!==this.liveMode)return;
  if(seated!==previous.seated)this.showRoomNotice(this.liveMode?(seated?'가창 차례입니다.':'가창에서 내려왔어요.'):(seated?'좌석에 앉았어요.':'좌석에서 내려왔어요.'));
  else if(seated&&micOn!==previous.micOn)this.showRoomNotice(micOn?'마이크가 켜졌어요.':'마이크가 꺼졌어요.');
 },
 async talkSeatAction(action,target,button){
  if(this.seatCommandPending||!this.joined||this.closed)return;
  const self=this.state.members.find(p=>p.id===this.state.self),owner=self?.id===this.state.room.host_id;
  if(!self)return;

  const responding=action==='approve-mic'||action==='reject-mic';
  const applicant=responding?this.state.members.find(p=>p.id===target):self;
  if(responding&&!owner)return;
  const payload=action==='request-mic'?{seat:Number(target)}:responding?{target_id:target}:{};
  if(action==='request-mic'){
   if(self.requested||self.locked)return;
  }else{
   const version=applicant?.requestVersion??applicant?.requestExpires;
   if(!applicant?.requested||String(version)!==button?.dataset.request)return;
   payload.expected_request_version=version;
  }
  const started=performance.now(),mayMove=action==='request-mic'&&(self.seat!==null||owner||this.state.room.seating_mode==='free');
  payload.request_id=crypto.randomUUID();this.seatCommandPending=true;
  if(mayMove)this.optimisticSeat={seat:payload.seat,request:payload.request_id};
  this.paint();
  const measurement={requestId:payload.request_id,localMs:performance.now()-started};
  try{
   const state=await this.command(action,payload);measurement.responseMs=performance.now()-started;
   this.optimisticSeat=null;this.acceptState(state);
   measurement.server=state.commandTiming||null;
   if(!state?.members)await this.refresh();
  }catch(error){this.optimisticSeat=null;this.seatHTML=null;throw error;}
  finally{
   this.seatCommandPending=false;this.talkRequestKey=null;
   if(!this.closed)this.paint();measurement.totalMs=performance.now()-started;
   this.seatMeasurements||=[];this.seatMeasurements.push(measurement);if(this.seatMeasurements.length>30)this.seatMeasurements.shift();
   this.diagnostics?.record('seatLocalMs',measurement.localMs);this.diagnostics?.record('seatResponseMs',measurement.responseMs);
   this.host?.dispatchEvent(new CustomEvent('aifect:seat-measured',{detail:measurement}));
  }
 },
 toggleEmojiPicker(open,focus=false){
  const picker=$('#voice-emoji-picker'),button=this.host.querySelector('[data-voice="emoji"]');
  if(!picker)return;
  if(open){
   this.chatEditor?.remember?.();$('#voice-message')?.blur?.();
   if(this.talkPopup?.open)this.closeRoomPopup(false);
   picker.hidden=false;if(!picker.open)picker.show();
   picker.querySelector?.('[data-cat-tab][aria-pressed=true]')?.focus({preventScroll:true});
  }else if(picker.open)picker.close();
  picker.hidden=!open;button?.setAttribute('aria-expanded',String(open));
  this.host.toggleAttribute?.('data-room-stickers',open);this.onViewport?.();
  if(focus)button?.focus({preventScroll:true});
 },
 bindChatInteraction(form,input,picker,options){
  const refresh=()=>this.onViewport?.();
  const typing=()=>{
   if(typeof window!=='undefined'&&window.innerWidth<=800&&this.talkPopup?.open)this.closeRoomPopup(false);
   if(!picker.hidden)this.toggleEmojiPicker(false);refresh();
  };
  input.addEventListener('focus',typing,options);
  input.addEventListener('pointerdown',typing,options);
  input.addEventListener('input',refresh,options);
  const toggle=this.host.querySelector('[data-voice="emoji"]');
  toggle?.addEventListener?.('pointerdown',()=>this.chatEditor?.remember?.(),options);
  form.querySelector?.('[type=submit]')?.addEventListener('pointerdown',event=>{
   // Let a composing IME commit through the button's normal focus change.
   // Once committed, keep the keyboard and draft until delivery is acknowledged.
   if(document.activeElement===input&&!this.chatEditor?.isComposing?.())event.preventDefault();
  },options);
  picker.addEventListener?.('close',()=>{picker.hidden=true;toggle?.setAttribute('aria-expanded','false');this.host.toggleAttribute?.('data-room-stickers',false);refresh();},options);
  this.host.addEventListener('pointerdown',event=>{
   if(event.target.closest?.('#voice-chat-form,#voice-emoji-picker'))return;
   if(!picker.hidden)this.toggleEmojiPicker(false);
   if(typeof window!=='undefined'&&window.innerWidth<=800&&document.activeElement===input)input.blur();
  },options);
 },
 finishChatInteraction(){
  if(typeof window==='undefined'||window.innerWidth>800)return;
  if(this.chatEditor?.isComposing?.())return;
  if(this.chatEditor?.get?.()?.trim())return;
  this.toggleEmojiPicker(false);$('#voice-message')?.blur?.();this.onViewport?.();
 },
 async finalAction(action,target){
  if(await this.roomReleaseAction?.(action,target))return true;
  if(action==='view-queue'){this.showSheet('voice-music-sheet');return true;}
  if(action==='personal-mute'){this.setPersonalVolume(this.personalMusicVolume>0?0:(this.lastPersonalVolume||this.preferences.music||1));return true;}
  if(action==='member-listen'){
   if(target!==this.state.self&&this.state.members.some(p=>p.id===target)){
    const panel=this.actionTrigger?.closest('#talk-dock')||$('#voice-members');
    this.volumes.set(target,(this.volumes.get(target)??1)>0?0:1);
    this.applyListenVolumes();this.paintFinalControls();
    Array.from(panel.querySelectorAll('[data-voice=member-listen]')).find(b=>b.dataset.target===target)?.focus({preventScroll:true});
   }
   return true;
  }
  if(action==='personal-volume'){
   if(this.host.hasAttribute('data-room-pc-controls')){
    // The player mutes the song locally while retaining the listening level for voices.
    this.playerMusicMuted=this.personalMusicVolume>0;
    if(!this.playerMusicMuted&&!this.preferences.music)this.preferences.music=this.lastPersonalVolume||1;
    this.paintPersonalMusicControls();this.syncMusic();
   }else{this.syncPersonalVolume();this.showSheet('talk-volume');}
   return true;
  }
  if(action==='panel-chat'){for(const sheet of this.host.querySelectorAll('.voice-panel-docked[open]'))sheet.close();return true;}
  if(action==='talk-profile'){
   const member=this.state.members.find(p=>p.id===target);
   if(member)await openProfilePreview(member.profile_id||(target===this.state.self?'self':'member:'+target),this.actionTrigger);
   return true;
  }
  if(action==='member-menu'){this.memberTools(target,this.actionTrigger);return true;}
  if(action==='music-down'){await this.musicCommand('move',{index:Number(target),to:Number(target)+1});return true;}
  if(action==='settings'){await this.openSettings();return true;}
  if(action==='emoji'){this.toggleEmojiPicker(!$('#voice-emoji-picker').open);return true;}
  if(action==='emoji-close'){this.toggleEmojiPicker(false,true);return true;}
  if(action==='insert-emoji'){
   const input=$('#voice-message'),start=input.selectionStart,end=input.selectionEnd;
   if(typeof target==='string'&&input.value.length-(end-start)+target.length<=input.maxLength){input.setRangeText(target,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));}
   input.focus({preventScroll:true});return true;
  }
  if(action==='send-chat'){if((this.stickers?.body()??$('#voice-message').value).trim())$('#voice-chat-form').requestSubmit();return true;}
  if(action==='ask-kick'){if(!this.canManageMember(target))return true;this.kickTarget=target;this.showSheet('voice-kick-confirm');return true;}
  if(action==='confirm-kick'){if(!this.canManageMember(this.kickTarget)){this.closeRoomPopup();return true;}await this.command('moderate',{target_id:this.kickTarget,operation:'kick'});$('#voice-kick-confirm').close();this.closeMemberTools();await this.refresh();return true;}
  if(action==='invite-seat-user'){await this.command('seat-invite',{target_id:target,seat:this.invitingSeat});$('#voice-seat-picker').close();await this.refresh();return true;}
  if(action==='member-invite'){const empty=Array.from({length:8},(_,i)=>i).find(i=>!this.state.members.some(m=>m.seat===i));if(empty===undefined)throw Error('빈 좌석이 없습니다.');await this.command('seat-invite',{target_id:this.memberTarget,seat:empty});toast('좌석 초대를 보냈습니다.');await this.refresh();return true;}
  if(['member-move','member-remove'].includes(action)){await this.command('moderate',{target_id:this.memberTarget,operation:action==='member-move'?'move-seat':'remove-seat',seat:Number($('#voice-move-seat')?.value)});this.closeMemberTools();await this.refresh();return true;}
  if(['seat-accept','seat-reject'].includes(action)){await this.command('seat-answer',{invitation_id:target,accept:action==='seat-accept'});await this.refresh();return true;}
  if(action==='music-repeat'){const current=this.state.music.repeat||'off';await this.musicCommand('repeat',{mode:{off:'one',one:'all',all:'off'}[current]});return true;}
  if(action==='mic-test'){if(this.testGraph)this.stopMicTest();else await this.startMicTest();return true;}
  return false;
 },
 setPersonalVolume(value){
  if(value>0||this.preferences.music>0)this.lastPersonalVolume=value||this.preferences.music;
  this.preferences.music=value;this.playerMusicMuted=false;
  this.syncPersonalVolume();this.syncMusic();
 },
 syncPersonalVolume(){
  this.preferences.voice=this.preferences.music;this.applyListenVolumes();
  if(this.liveMode){this.liveVolume=this.preferences.music;liveSetVolume(this,this.liveVolume);}
  else try{localStorage.setItem('aifect.talkingRoom.listenVolume',String(this.preferences.music));}catch{}
  for(const id of ['voice-music-volume','voice-listen-volume','live-mr-volume']){
   const el=$('#'+id);if(el){el.value=this.preferences.music*100;this.updateDesignField(el);}
  }
  this.paintPersonalMusicControls();
 },
 paintPersonalMusicControls(){
  const volume=this.personalMusicVolume,muted=volume===0,button=this.host.querySelector('#voice-music-player [data-voice=personal-volume]');
  if(button){
   const pc=this.host.hasAttribute('data-room-pc-controls');
   const glyph=muted?(pc?'talkVolumeSlash':'talkVolumeOff'):'talkVolume';
   if(button.dataset.speakerIcon!==glyph){button.innerHTML=voiceGlyph(glyph);button.dataset.speakerIcon=glyph;}
   button.setAttribute('aria-label',pc?'음악 음소거':'개인 듣기 볼륨');
   if(pc)button.setAttribute('aria-pressed',String(muted));else button.removeAttribute('aria-pressed');
  }
  for(const b of this.host.querySelectorAll('[data-voice=personal-mute]'))b.setAttribute('aria-pressed',String(muted));
  for(const id of ['voice-playlist-volume','voice-mini-volume','voice-personal-volume']){
   const el=$('#'+id);if(el){el.value=volume*100;this.updateDesignField(el);}
  }
 },
 paintFinalMusic(){
  this.paintTalkingPlaylist?.();
  const m=this.state.music;if(!m)return;const host=this.state.members.find(p=>p.id===this.state.self)?.role==='host',track=m.queue[m.index],hasQueue=!!m.queue.length;
  const playRequested=m.playing||m.pendingStart!=null;
  $('#voice-host-audio').hidden=!host||!this.liveMode;$('#voice-room-volume').value=m.volume*100;$('#voice-balance').value=m.balance*100;
  $('#voice-sound-current').innerHTML=track?'현재 곡: '+esc(track.title)+' · '+trackNickname(track):'선택된 음악이 없습니다.';
  $('#voice-music-search').hidden=!host;$('#voice-music-results').hidden=!host;$('#voice-queue-area').hidden=!hasQueue;$('#voice-playlist-empty').hidden=hasQueue||!!$('#voice-music-query').value.trim();
  $('#voice-playlist-empty').querySelector('p').textContent=host?'위 검색창에서 노래를 찾아 + 버튼으로 추가해 주세요.':'방장이 추가한 음악을 이곳에서 함께 들을 수 있습니다.';
  this.host.querySelector('.voice-music-transport').hidden=!host||!hasQueue;$('#voice-queue-heading').hidden=true;$('#voice-music-seek').max=track?.duration||0;
  $('#voice-queue-count').textContent=m.queue.length+'곡';this.host.querySelector('[data-voice="music-clear"]').hidden=!host;
  this.paintMusicSelection?.();
  const key=JSON.stringify([m.revision,host]);if(key!==this.musicMarkup){this.musicMarkup=key;
   const button=(action,label,content,disabled=false)=>`<button type="button" data-voice="music-${action}" aria-label="${label}" ${disabled?'disabled':''}>${content}</button>`;
   $('#voice-music-player').hidden=false;
   if(!this.liveMode){
    const mini=$('#voice-music-player');
    if(mini.dataset.roomOwner!==String(host)){
     mini.dataset.roomOwner=String(host);mini.classList.toggle('talk-host-player',host);
     const transport=host?button('previous','이전 곡',voiceGlyph('previous'))+button('play','재생',voiceGlyph('talkPlay'))+button('pause','일시정지',voiceGlyph('talkPause'))+button('next','다음 곡',voiceGlyph('next')):'';
     mini.innerHTML='<button type="button" class="talk-track-picker" data-voice="music-picker" aria-label="'+(host?'방 플레이리스트에 곡 추가':'방 플레이리스트 보기')+'"><span class="talk-cover" hidden><img alt=""></span><span class="talk-track"><span class="talk-song-title"><strong></strong><span class="room-eq" aria-hidden="true"><i></i><i></i><i></i></span></span><small></small><small class="talk-music-status" role="status" hidden></small></span></button><div>'+transport+'<button type="button" data-voice="personal-volume" aria-label="개인 듣기 볼륨">'+voiceGlyph('talkVolume')+'</button><input id="voice-mini-volume" type="range" min="0" max="100" aria-label="개인 음악 볼륨"></div>';
    }
    const art=mini.querySelector('.talk-cover'),credit=roomTrackCredit(track);
    art.hidden=!track;
    if(track){const src=track.cover||trackArtworkPath(track);if(art.firstElementChild.getAttribute('src')!==src)art.firstElementChild.src=src;}
    const title=mini.querySelector('.talk-track strong'),subtitle=mini.querySelector('.talk-track small');
    mini.toggleAttribute('data-empty-track',!track);
    title.textContent=track?.title||'여기를 눌러 재생곡을 선택해주세요.';subtitle.textContent=credit;
    mini.querySelector('.talk-track').title=[track?.title,credit].filter(Boolean).join(' · ');
    for(const b of mini.querySelectorAll('[data-voice^="music-"]:not([data-voice="music-picker"])')){
     b.disabled=!hasQueue;b.hidden=b.dataset.voice===(playRequested?'music-play':'music-pause');
    }
   }else $('#voice-music-player').innerHTML=(track?`<img src="${esc(track.cover)}" alt=""><span><strong>${esc(track.title)}</strong><small>${trackNickname(track)}</small></span>`:'<span><strong>함께 들을 음악을 선택해 보세요</strong></span>')+`<div>${host?button('previous','이전 곡',voiceGlyph('previous'),!hasQueue)+button(m.playing?'pause':'play',m.playing?'일시정지':'재생',(m.playing?icon('pause'):icon('audio-play')),!hasQueue)+button('next','다음 곡',voiceGlyph('next'),!hasQueue)+button('repeat','반복',voiceGlyph('repeat'),!hasQueue):''}<label class="voice-mini-volume">${icon('volume')}<input id="voice-mini-volume" type="range" min="0" max="100" value="${this.preferences.music*100}" aria-label="개인 음악 볼륨"></label>${button('picker','플레이리스트',voiceGlyph('playlist'))}</div>`;
   this.paintPersonalMusicControls();
   $('#voice-popup-current').innerHTML=track?`<img src="${esc(track.cover)}" alt=""><div><strong>${esc(track.title)}</strong><small>${trackNickname(track)}</small></div>`:'';
   $('#voice-music-queue').innerHTML=m.queue.map((t,i)=>`<article class="voice-queue-row ${i===m.index?'is-current':''}" ${i===m.index?'aria-current="true"':''}><span class="voice-queue-number">${i===m.index&&m.playing?voiceGlyph('wave'):i+1}</span><img src="${esc(t.cover)}" alt=""><span class="voice-queue-info"><strong>${esc(t.title)}</strong><small>${trackNickname(t)}</small></span><time>${time(t.duration)}</time>${host?`<button type="button" data-voice="music-up" data-target="${i}" aria-label="${esc(t.title)} 위로 이동" ${i===0?'disabled':''}>↑</button><button type="button" data-voice="music-down" data-target="${i}" aria-label="${esc(t.title)} 아래로 이동" ${i===m.queue.length-1?'disabled':''}>↓</button><button type="button" data-voice="music-remove" data-target="${i}" aria-label="${esc(t.title)} 삭제">${voiceGlyph('trash')}</button>`:''}</article>`).join('');
  }
  for(const b of this.host.querySelectorAll('[data-voice="music-repeat"]')){const label='반복 '+({off:'끔',all:'전체',one:'한 곡'}[m.repeat||'off']);b.innerHTML=voiceGlyph('repeat')+(m.repeat==='one'?'<sup>1</sup>':'');b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed',String(m.repeat&&m.repeat!=='off'));}
  for(const b of this.host.querySelectorAll('.voice-music-transport [data-voice="music-play"]'))b.hidden=!!playRequested;
  for(const b of this.host.querySelectorAll('.voice-music-transport [data-voice="music-pause"]'))b.hidden=!playRequested;
  for(const el of this.host.querySelectorAll('input[type=range]'))this.updateDesignField(el);
 },
 async startMicTest(){
  if(this.roomAudio&&!await this.roomAudio.allowCapture(true))return;
  const attempt=this.testAttempt=(this.testAttempt||0)+1;if(this.processing){this.testGraph=this.processing;this.testOwned=false;}
  else{
   const raw=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});
   if(this.closed||attempt!==this.testAttempt){raw.getTracks().forEach(t=>t.stop());return;}
   this.testRaw=raw;this.testOwned=true;
   if(this.roomAudio?.watchMicrophone(raw)===false){this.stopMicTest();return;}
   try{
    const graph=await VoiceAudio.microphone(raw,this.preferences.preset,this.preferences.input,this.liveVocalMix);
    if(this.closed||attempt!==this.testAttempt){graph.close();raw.getTracks().forEach(t=>t.stop());return;}
    this.testGraph=graph;
    if(graph.fallback)throw Error('이 브라우저에서는 입력 레벨 분석을 지원하지 않습니다.');
   }catch(error){
    if(attempt===this.testAttempt)this.stopMicTest();else raw.getTracks().forEach(t=>t.stop());
    if(error.code==='AUDIO_INTERRUPTED')this.roomAudio?.interrupt('context');throw error;
   }
  }
  this.startLevels();for(const button of this.host.querySelectorAll('[data-voice="mic-test"]'))button.textContent='테스트 중지';
  clearTimeout(this.micTestTimer);this.micTestTimer=setTimeout(()=>this.stopMicTest(),30000);
 },
 stopMicTest(){this.testAttempt=(this.testAttempt||0)+1;clearTimeout(this.micTestTimer);if(this.testOwned){this.testGraph?.close();this.testRaw?.getTracks().forEach(t=>t.stop());}this.testRaw=null;this.testGraph=null;this.testOwned=false;for(const button of this.host?.querySelectorAll?.('[data-voice="mic-test"]')||[])button.textContent='테스트 시작';for(const meter of this.host?.querySelectorAll?.('#voice-input-meter,.talk-test-meter')||[])meter.value=0;this.roomAudio?.updateType();}
});
// Shared room surfaces are real dialogs, bounded by the actual chat region.
function roomMemberAvatar(p,ignoreMute=false,seat=false,persistent=false){
 const muted=!ignoreMute&&!seat&&p.muted;
 const mark=seat||muted||persistent?'<span class="room-muted-mark" aria-label="음소거"'+(!muted?' hidden':'')+'>'+voiceGlyph('talkMicOff')+'</span>':'';
 return `<span class="room-member-photo${muted?' is-muted':''}">${avatarImage({name:p.name,profile_id:p.profile_id,user_id:p.id,image_version:p.image_version})}${mark}</span>`;
}
function roomMicIsOn(client,member){
 const track=client.micSender?.track;
 return !!track?.enabled&&!track.muted&&track.readyState!=='ended'&&!member?.muted&&!member?.locked
  &&!client.roomAudio?.blocked&&!client.roomAudio?.micNeedsGesture
  &&(!client.publisher||client.publisher.connectionState==='connected');
}
function setRoomAvatarMuted(photo,muted){
 const mark=photo?.querySelector('.room-muted-mark');
 if(!mark)return;
 if(mark.hidden===muted)mark.hidden=!muted;
 if(photo.classList.contains('is-muted')!==muted)photo.classList.toggle('is-muted',muted);
}

Object.assign(VoiceRoomClient.prototype,{
 bindTalkViews(){
  this.talkViewEvents?.abort();const events=this.talkViewEvents=new AbortController(),options={signal:events.signal};
  const labels={'voice-sound':'소리 설정','voice-room-settings':'방 설정','voice-members':'참여자','voice-music-sheet':'플레이리스트','live-search-sheet':'노래 예약','talk-leave':'방 나가기','voice-kick-confirm':'참여자 강퇴','voice-seat-picker':'좌석 초대','voice-gift-sheet':'선물 보내기','talk-volume':'청취 음량'};
  for(const sheet of this.host.querySelectorAll('dialog')){
   const emoji=sheet.id==='voice-emoji-picker';sheet.classList.toggle('room-popup',!emoji);sheet.classList.toggle('room-emoji-dock',emoji);
   sheet.setAttribute('aria-label',labels[sheet.id]||sheet.getAttribute('aria-label')||'방 메뉴');sheet.tabIndex=-1;
   if(emoji)this.host.querySelector('#voice-chat-form').after(sheet);else this.host.querySelector('.voice-chat-panel').append(sheet);
  }
  const ids={inbox:'room-inbox',participants:'voice-members',sound:'voice-sound',share:'voice-invite-sheet',settings:'voice-room-settings',leave:'talk-leave','music-picker':'voice-music-sheet','view-queue':'voice-music-sheet','personal-volume':'talk-volume','karaoke-search-open':'live-search-sheet',emoji:'voice-emoji-picker',gift:'voice-gift-sheet'};
  for(const button of this.host.querySelectorAll('.room-header button,[data-voice=sound]')){button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',ids[button.dataset.voice]);button.setAttribute('aria-expanded','false');}
  const confirmationOpen=()=>document.querySelector('dialog.rental-confirm[open],dialog.gift-transfer-confirm[open]');
  const outside=e=>{
   // The top modal owns dismissal while the room popup remains open beneath it.
   if(confirmationOpen())return;
   const popup=this.talkPopup;if(!popup?.open||popup.contains(e.target))return;
   const link=e.target.closest?.('a[href]');if(link&&!roomRouteMatches(new URL(link.href,location.href),this)){this.closeRoomPopup();return;}
   // Let the same mobile tap both dismiss the sheet and place the editing caret.
   if(typeof window!=='undefined'&&window.innerWidth<=800&&e.target.closest?.('#voice-message')){this.closeRoomPopup(false);return;}
   if(popup.id==='voice-emoji-picker'&&e.target.closest('#voice-chat-form'))return;
   const entry=e.target.closest('[data-voice]');if(entry&&this.host.contains(entry)&&ids[entry.dataset.voice])return;
   if(e.type==='pointerdown'){e.preventDefault();return;}
   e.preventDefault();e.stopImmediatePropagation();this.closeRoomPopup();
  };
  document.addEventListener('pointerdown',outside,{...options,capture:true});document.addEventListener('click',outside,{...options,capture:true});
  document.addEventListener('keydown',e=>{
   if(confirmationOpen())return;
   const popup=this.talkPopup;
   if(e.key==='Tab'&&popup?.open){
    const controls=[...popup.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[contenteditable=true],[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(first&&e.shiftKey&&(document.activeElement===first||document.activeElement===popup)){e.preventDefault();last.focus();return;}
    if(first&&!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();return;}
   }
   if(e.key==='Escape'&&this.talkPopup?.open&&!e.defaultPrevented){e.preventDefault();this.closeRoomPopup();}},{...options,capture:true});
  this.host.addEventListener('close',e=>{
   const restoreFocus=!this.roomPopupWithoutFocus?.has(e.target);this.roomPopupWithoutFocus?.delete(e.target);
   if(e.target!==this.talkPopup||e.target.open)return;
   this.roomResizeObserver?.unobserve?.(e.target);e.target.removeAttribute('data-room-anchored');
   this.talkPopup=null;document.documentElement?.removeAttribute('data-room-popup');this.settingsTicket=(this.settingsTicket||0)+1;
   if(e.target.id==='voice-room-settings')this.settingsDraft=null;
   this.host.querySelectorAll('.room-header button[aria-expanded=true],[data-voice=sound][aria-expanded=true]').forEach(b=>b.setAttribute('aria-expanded','false'));
   if(e.target.id==='talk-leave')this.pendingRoomNavigation=null;
   if(e.target.id==='voice-sound')this.stopMicTest();
   if(e.target.id==='voice-emoji-picker'){e.target.hidden=true;this.host.querySelector('[data-voice="emoji"]')?.setAttribute('aria-expanded','false');}
   const trigger=this.popupTrigger;this.popupTrigger=null;
   if(restoreFocus){if(trigger?.isConnected&&!trigger.closest('dialog:not([open])'))trigger.focus({preventScroll:true});else this.host.querySelector('.room-header button')?.focus({preventScroll:true});}
  },{...options,capture:true});
  const sound=$('#voice-sound'),advanced=sound.querySelector('.voice-audio-extra');
  for(const id of ['voice-noise','voice-echo','voice-input-meter'])advanced.append($('#'+id).closest('.voice-audio-card'));
  const listen=$('#voice-music-volume').closest('label');listen.firstChild.textContent='청취 음량 ';listen.classList.add('room-listen-volume');
  sound.addEventListener('change',event=>{if(event.target.matches('input,select'))this.showRoomNotice('소리설정이 변경됐어요.');},{signal:this.talkViewEvents.signal});
  sound.prepend(listen);
  sound.prepend($('#voice-monitor').closest('.voice-audio-card'));
  if(this.liveMode)advanced.append($('#live-delay').closest('label'));
  $('#voice-listen-volume').closest('label').hidden=true;
  this.bindRoomSettings();this.bindRoomShare();this.bindRoomRelease();
  // Audio controls are reordered by the existing room/audio bindings. Give the
  // final controls a single scroll owner while keeping the title in view.
  const heading=sound.querySelector('.room-popup-heading'),body=sound.querySelector('.room-popup-body')||document.createElement('div');
  body.className='room-popup-body';
  for(const child of [...sound.children])if(child!==heading&&child!==body)body.append(child);
  if(heading)sound.prepend(heading);sound.append(body);
  // Keep destructive room controls in the scrolling body, above the fixed footer.
  $('#voice-settings-form .live-form-fields').append(this.host.querySelector('#voice-room-settings [data-voice=close]'));
 },
 closeRoomPopup(restoreFocus=true){
  const p=this.talkPopup;if(!p)return;
  if(p.id&&this.popupTrigger?.getAttribute?.('aria-controls')===p.id)this.popupTrigger.setAttribute('aria-expanded','false');
  if(!restoreFocus){this.roomPopupWithoutFocus??=new WeakSet();this.roomPopupWithoutFocus.add(p);}
  if(p.classList.contains('profile-preview')){
   closeProfilePreview(undefined,restoreFocus);
   if(this.talkPopup===p){this.talkPopup=null;document.documentElement?.removeAttribute('data-room-popup');if(restoreFocus)this.popupTrigger?.focus({preventScroll:true});this.popupTrigger=null;}
  }else p.close();
 },
 showTalkPopup(id,trigger){const sheet=document.getElementById(id);if(sheet)this.adoptRoomPopup(sheet,trigger);},
 ensureRoomPopupClose(sheet){
  if(sheet.querySelector('.room-popup-close'))return;
  const button=document.createElement('button');button.type='button';button.className='room-popup-close';
  button.setAttribute('aria-label','팝업 닫기');button.textContent='×';
  button.onclick=()=>{if(this.talkPopup===sheet)this.closeRoomPopup();};
  sheet.append(button);sheet.setAttribute('data-room-has-close','');
 },
 adoptRoomPopup(sheet,trigger=this.actionTrigger){
  if(sheet.id!=='voice-emoji-picker'&&!$('#voice-emoji-picker').hidden)this.toggleEmojiPicker(false);
  if(sheet===this.talkPopup&&sheet.open){this.closeRoomPopup();return;}
  const origin=trigger||document.activeElement,previous=this.talkPopup;
  this.roomPopupWithoutFocus?.delete(sheet);
  // Native dialog close events are queued. Retire the previous surface now;
  // its late close handler must not clear or refocus the newly opened popup.
  if(previous){
   this.roomResizeObserver?.unobserve?.(previous);previous.removeAttribute('data-room-anchored');
   if(previous.id==='voice-room-settings')this.settingsDraft=null;
   if(previous.id==='voice-sound')this.stopMicTest();
   if(previous.id==='talk-leave')this.pendingRoomNavigation=null;
  }
  this.talkPopup=null;
  if(previous?.open){if(previous.classList.contains('profile-preview'))closeProfilePreview();else if(previous.id==='voice-emoji-picker')this.toggleEmojiPicker(false);else previous.close();}
  this.settingsTicket=(this.settingsTicket||0)+1;
  if(origin?.isConnected&&!origin.closest('dialog'))this.popupTrigger=origin.closest('details.room-more')?.querySelector('summary')||origin;
  this.talkPopup=sheet;document.documentElement?.setAttribute('data-room-popup','');sheet.classList.add('room-popup');sheet.removeAttribute('aria-modal');sheet.tabIndex=-1;
  if(sheet.id==='dialog'&&!this.roomExternalHome)this.roomExternalHome={parent:sheet.parentNode,next:sheet.nextSibling};
  this.host.querySelector('.voice-chat-panel').append(sheet);
  this.ensureRoomPopupClose(sheet);
  this.host.querySelectorAll('.room-header button[aria-expanded],[data-voice=sound]').forEach(b=>b.setAttribute('aria-expanded',String(b.getAttribute('aria-controls')===sheet.id)));
  if(!sheet.open)sheet.show();sheet.scrollTop=0;
  positionRoomPopup(this);this.roomResizeObserver?.observe(sheet);sheet.focus({preventScroll:true});
 },
 releaseRoomExternal(){const sheet=document.getElementById('dialog'),home=this.roomExternalHome;if(home&&sheet){sheet.close();sheet.classList.remove('room-popup');home.parent.insertBefore(sheet,home.next?.parentNode===home.parent?home.next:null);this.roomExternalHome=null;}},
 bindRoomSettings(){
  const form=$('#voice-settings-form');
  form.onsubmit=busyForm(form,()=>this.saveTalkSettings(form));
  form.addEventListener('click',e=>{
   const capacity=e.target.closest('[data-capacity]');if(capacity){form.elements.max_members.value=capacity.dataset.capacity;form.elements.max_members.dispatchEvent(new Event('input',{bubbles:true}));}
   const generate=e.target.closest('[data-auto-title]');if(generate)this.safe(async()=>{generate.disabled=true;const ticket=this.settingsTicket;try{const d=await voiceRequest('options?mode='+form.elements.mode.value+'&exclude='+encodeURIComponent(form.elements.title.value));if($('#voice-room-settings').open&&ticket===this.settingsTicket){form.elements.title.value=d.suggested_title;}}finally{generate.disabled=false;}});
  });
  form.addEventListener('input',()=>{form.querySelector('.voice-crew-setting').hidden=form.elements.visibility.value!=='crew';form.querySelector('output').textContent=form.elements.announcement.value.length+'/200';for(const b of form.querySelectorAll('[data-capacity]'))b.setAttribute('aria-pressed',String(Number(b.dataset.capacity)===Number(form.elements.max_members.value)));});
 },
 async openSettings(){
  const sheet=$('#voice-room-settings');if(sheet===this.talkPopup&&sheet.open){this.closeRoomPopup();return;}
  this.showSheet('voice-room-settings');
  const ticket=this.settingsTicket,form=$('#voice-settings-form'),room=this.state.room;
  this.settingsRevision=room.settings_revision||0;this.settingsDraft=null;this.settingsLoading=true;
  for(const key of ['title','visibility','max_members','announcement'])form.elements[key].value=room[key]??'';
  form.elements.mode.value=room.mode||'talk';
  form.elements.crew_id.value=room.crew_id||'';
  for(const el of form.elements)el.disabled=true;
  form.querySelector('[data-voice=dismiss]').disabled=false;
  form.querySelector('.form-error').textContent='';form.querySelector('.voice-backgrounds').textContent='테마를 불러오는 중…';
  form.dispatchEvent(new Event('input',{bubbles:true}));
  try{
   const options=await voiceRequest('options?mode='+(this.liveMode?'karaoke':'talk')+'&room_id='+encodeURIComponent(room.id));
   if(this.closed||!sheet.open||ticket!==this.settingsTicket)return;
   const applied=options.current_theme||room.theme;
   fillRoomThemeChoices(form,options,applied?.sku||room.theme_sku||room.background,applied?.inventory_id);
   form.elements.crew_id.value=room.crew_id||(options.crews.length===1?options.crews[0].id:'');
   const crew=form.querySelector('.voice-crew-setting');crew.textContent=options.crews.length===1?options.crews[0].name:'소속 크루가 있어야 선택할 수 있습니다.';crew.hidden=form.elements.visibility.value!=='crew';
   form.querySelector('[name=visibility][value=crew]').disabled=options.crews.length!==1;
   const stillOwner=this.state.self===this.state.room.host_id;
   for(const el of form.elements)el.disabled=!stillOwner||(el.name==='visibility'&&el.value==='crew'&&options.crews.length!==1);
   form.querySelector('[data-voice=dismiss]').disabled=false;
   // Baseline the rendered draft, including option fallbacks. A type-only save
   // must not silently rewrite a title, crew or theme that the user did not edit.
   this.settingsDraft={ticket,values:Object.fromEntries(new FormData(form)),themeIndex:form.querySelector('[data-theme-index]:checked')?.dataset.themeIndex,requestId:crypto.randomUUID()};
  }catch(e){if(ticket===this.settingsTicket)form.querySelector('.form-error').textContent=e.message;throw e;}
  finally{if(ticket===this.settingsTicket)this.settingsLoading=false;}
 },
 async saveTalkSettings(form){
  if(this.savingTalkSettings||this.settingsLoading||this.state.self!==this.state.room.host_id)return;
  const draft=this.settingsDraft,ticket=this.settingsTicket,sheet=this.host.querySelector('#voice-room-settings');
  if(!draft||draft.ticket!==ticket||!sheet?.open)return;
  const values=Object.fromEntries(new FormData(form)),capacity=Number(values.max_members);
  if(!Number.isInteger(capacity)||capacity<2||capacity>30||capacity<this.state.members.length)throw Error('최대 참여 인원은 현재 참여 인원 이상, 2~30명으로 입력해 주세요.');
  const changes={};
  for(const key of ['mode','title','visibility','crew_id','max_members','background','theme_sku','announcement'])if(key in values&&values[key]!==draft.values[key])changes[key]=values[key];
  if('max_members' in changes)changes.max_members=capacity;
  const themeChanged=form.querySelector('[data-theme-index]:checked')?.dataset.themeIndex!==draft.themeIndex;
  if(themeChanged){const theme=await confirmRoomTheme(form);if(theme===null)return;Object.assign(changes,theme);}
  if(draft!==this.settingsDraft||ticket!==this.settingsTicket||!sheet.open||this.state.self!==this.state.room.host_id)return;
  if(!Object.keys(changes).length){sheet.close();return;}
  this.savingTalkSettings=true;
  try{
   const state=await this.command('settings',{...changes,revision:this.settingsRevision,request_id:draft.requestId});
   this.acceptState(state);if(this.closed)return;
   window.dispatchEvent(new CustomEvent('aifect:room-theme',{detail:{room:this.state.room}}));
   // The server snapshot may replace the room view, or the user may have
   // opened another popup while saving. Never close that newer surface.
   if(ticket===this.settingsTicket&&sheet.isConnected&&sheet.open)sheet.close();
   this.showRoomNotice('설정이 저장됐어요.');
  }
  finally{this.savingTalkSettings=false;}
 },
 bindRoomEcho(){
  const defaultStrength=Math.round(AifectKaraoke.defaultVocalMix().strength*100);
  this.echoStrengths??={studio:defaultStrength,hall:defaultStrength,karaoke:defaultStrength};
  if(!['studio','hall','karaoke'].includes(this.preferences.preset))this.preferences.preset='studio';
  const preset=$('#voice-preset'),strength=$('#voice-reverb');preset.value=this.preferences.preset;
  const sync=()=>{strength.value=this.echoStrengths[preset.value];this.updateDesignField(strength);this.preferences.reverb=Number(strength.value)/200;this.liveVocalMix=VoiceAudio.echoMix(preset.value,Number(strength.value)/100);};sync();
  const apply=()=>{for(const graph of new Set([this.processing,this.testGraph])){if(!graph)continue;if(graph.supportsMix)graph.setMix(this.liveVocalMix);else{graph.setPreset(this.preferences.preset);graph.setReverb(this.preferences.reverb);}}};
  preset.onchange=()=>{this.preferences.preset=preset.value;sync();apply();};
  strength.oninput=()=>{this.echoStrengths[preset.value]=Number(strength.value);sync();apply();};
 },
 bindRoomShare(){
  const form=$('#voice-invite-form');this.shareSelected??=new Map();
  $('#room-share-query').oninput=()=>{clearTimeout(this.roomShareTimer);this.roomShareTimer=setTimeout(()=>this.safe(()=>this.loadRoomShare()),180);};
  $('#room-share-more').onclick=()=>this.safe(()=>this.loadRoomShare(true));
  $('#room-share-people').onchange=e=>{const input=e.target.closest('[data-share-id]');if(!input)return;const person=this.sharePeople.get(input.dataset.shareId);if(input.checked)this.shareSelected.set(person.profile_id,person);else this.shareSelected.delete(person.profile_id);this.paintShareCount();};
  const send=busyForm(form,()=>this.sendRoomShare());
  form.onsubmit=async e=>{try{await send(e);}finally{this.paintShareCount();}};
 },
 paintShareCount(){$('#room-share-count').textContent=this.shareSelected.size+'명 선택';$('#voice-invite-form button[type=submit]').disabled=!this.shareSelected.size||!!this.roomShareSending;},
 async openRoomShare(){
  const sheet=$('#voice-invite-sheet');if(sheet===this.talkPopup&&sheet.open){this.closeRoomPopup();return;}
  this.showSheet('voice-invite-sheet');const url=location.origin+'/#'+(this.liveMode?'live':'voice')+'/'+encodeURIComponent(this.id);
  sheet.querySelector('[data-share-title]').textContent=this.state.room.title;sheet.querySelector('[data-share-type]').textContent=this.liveMode?'라이브 노래방':'토킹룸';
  this.paintShareCount();await this.loadRoomShare();
 },
 async loadRoomShare(more=false){
  this.roomShareAbort?.abort();const controller=this.roomShareAbort=new AbortController(),q=$('#room-share-query').value.trim(),out=$('#room-share-people');
  if(!more){out.textContent='팔로우 목록을 불러오는 중…';this.sharePeople=new Map();}
  try{const d=await api('/api/follow-management?tab=following&kind=producers&sort=name&q='+encodeURIComponent(q)+'&offset='+(more?this.shareNext||0:0),'GET',undefined,{signal:controller.signal,fresh:true});
   if(this.closed||controller.signal.aborted)return;this.shareNext=d.next;for(const p of d.items)this.sharePeople.set(p.profile_id||p.key,p);
   out.innerHTML=[...this.sharePeople.values()].map(p=>`<label class="room-share-person"><input type="checkbox" data-share-id="${esc(p.profile_id||p.key)}" ${p.profile_id?'':'disabled'} ${this.shareSelected.has(p.profile_id)?'checked':''}>${avatarImage({profile_id:p.profile_id,name:p.name,image_version:p.image_version})}<span>${memberNickname(p)}${p.profile_id?'':' · 메시지 수신 프로필 없음'}</span></label>`).join('')||'<p>검색된 팔로우가 없습니다.</p>';
   $('#room-share-more').hidden=d.next===null;
  }catch(e){if(!controller.signal.aborted){out.textContent='목록을 불러오지 못했습니다.';throw e;}}
 },
 async sendRoomShare(){
  if(this.roomShareSending)return;if(!this.shareSelected.size)throw Error('공유할 팔로우를 선택해 주세요.');
  const form=$('#voice-invite-form'),selected=[...this.shareSelected.values()];
  const note=form.elements.note.value.trim();
  const key=JSON.stringify([selected.map(p=>p.profile_id).sort(),note]);
  if(this.shareBatch?.key!==key)this.shareBatch={key,requests:new Map(selected.map(p=>[p.profile_id,crypto.randomUUID()])),sent:new Set()};
  const batch=this.shareBatch;this.roomShareSending=true;const failures=[];
  try{for(const p of selected){if(batch.sent.has(p.profile_id))continue;try{await this.command('invite',{profile_id:p.profile_id,note,request_id:batch.requests.get(p.profile_id)});batch.sent.add(p.profile_id);}catch(e){failures.push(p.name+': '+e.message);}}
   $('#room-share-result').textContent=batch.sent.size+'명에게 전송했습니다.'+(failures.length?' 전송 실패 '+failures.join(' / '):'');
   if(!failures.length){this.shareBatch=null;form.elements.note.value='';this.shareSelected.clear();this.paintShareCount();for(const el of form.querySelectorAll('[data-share-id]'))el.checked=false;}
  }finally{this.roomShareSending=false;this.paintShareCount();}
 }
});
