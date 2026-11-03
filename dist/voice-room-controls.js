// Room controls share VoiceRoomClient's server snapshots and media graph.
Object.assign(VoiceRoomClient.prototype,{
 bindFinalControls(){
  const form=$('#voice-chat-form'),input=$('#voice-message');
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(input.value.trim())form.requestSubmit();}};
  this.host.querySelector('.voice-chat-panel').addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#voice-emoji-picker').hidden){e.preventDefault();e.stopPropagation();this.toggleEmojiPicker(false,true);}});
  if(this.host.classList?.contains('talking-room')){
   const settings=$('#voice-settings-form');settings.classList.add('talk-settings-form');
   settings.onsubmit=busyForm(settings,()=>this.saveTalkSettings(settings));this.bindTalkViews();
  }else $('#voice-settings-form').onsubmit=busyForm($('#voice-settings-form'),async()=>{const values=Object.fromEntries(new FormData($('#voice-settings-form')));const saved=await this.command('settings',{...values,max_members:Number(values.max_members),revision:this.settingsRevision});this.acceptState(saved);if(this.closed)return;await this.refresh();if(this.closed)return;if(this.liveMode)window.dispatchEvent(new Event('aifect:room-theme'));if(!$('#voice-room-settings').classList.contains('talk-docked'))$('#voice-room-settings').close();else await this.openSettings();});
  const supported=navigator.mediaDevices?.getSupportedConstraints?.()||{};
  for(const [id,key] of [['voice-echo','echoCancellation'],['voice-noise','noiseSuppression']])if(supported[key]===false){$('#'+id).disabled=true;$('#'+id).title='이 브라우저에서 지원하지 않는 설정이에요.';}
  $('#voice-echo').checked=this.preferences.echo;$('#voice-echo').onchange=()=>this.safe(async()=>{this.preferences.echo=$('#voice-echo').checked;await this.stream?.getAudioTracks()[0]?.applyConstraints({echoCancellation:this.preferences.echo});});
  $('#voice-playlist-volume').oninput=()=>{this.preferences.music=Number($('#voice-playlist-volume').value)/100;this.syncPersonalVolume();this.syncMusic();};
  this.host.addEventListener('close',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},true);
  this.host.addEventListener('cancel',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},true);
  this.host.addEventListener('input',e=>{if(e.target.id==='voice-mini-volume'||e.target.id==='voice-personal-volume'){this.preferences.music=Number(e.target.value)/100;this.syncPersonalVolume();this.syncMusic();}});
  const picker=this.host.querySelector('#talk-theme-choices');
  if(picker)picker.onsubmit=e=>{e.preventDefault();if(!picker.elements.background?.value)return;const field=$('#voice-settings-form').elements.theme_sku;field.value=picker.elements.background.value;this.syncTalkField(field);$('#talk-themes').close();};
  // No room track list is queried until the host submits a search.
  $('#voice-music-results').innerHTML='';
  this.host.addEventListener('input',e=>this.updateDesignField(e.target));
  this.host.addEventListener('change',e=>this.updateDesignField(e.target));
  this.host.addEventListener('click',e=>{if(!e.target.closest('#voice-member-tools,#talk-dock-member-tools,.voice-member-more,.talk-strip-person'))this.closeMemberTools();});
  $('#voice-members').addEventListener?.('scroll',()=>{if(this.liveMode)this.closeMemberTools();});
  $('#voice-members').addEventListener?.('close',()=>this.closeMemberTools());
  $('#voice-members').addEventListener?.('keydown',e=>{if(e.key==='Escape'&&!$('#voice-member-tools').hidden){e.preventDefault();e.stopPropagation();this.closeMemberTools(true);}});
  $('#voice-music-sheet').addEventListener?.('keydown',e=>{if(e.key==='Escape'){e.preventDefault();$('#voice-music-sheet').close();}});
 },
 updateDesignField(el){
  if(el?.type==='range'){const pct=(Number(el.value)-Number(el.min||0))/(Number(el.max||100)-Number(el.min||0))*100;el.style.setProperty('--range-fill',pct+'%');const output=this.host.querySelector(`[data-value-for="${el.id}"]`);if(output)output.textContent=Math.round(el.value)+'%';}
  if(el?.name==='announcement')el.form.querySelector('output').textContent=el.value.length+'/200';
  if(el?.name==='visibility'){const field=el.form?.querySelector('.voice-crew-setting');if(field)field.hidden=el.form.elements.visibility.value!=='crew';}
 },
 closeMemberTools(focus=false){const id=this.memberTarget;for(const box of this.host.querySelectorAll('#voice-member-tools,#talk-dock-member-tools')){box.hidden=true;box.innerHTML='';}this.memberTarget=null;for(const b of this.host.querySelectorAll('.voice-member-more,.talk-strip-person[data-voice="member-menu"]')){b.setAttribute('aria-expanded','false');if(focus&&b.dataset.target===id)b.focus();}},
 paintFinalControls(){
  const s=this.state,self=s.members.find(m=>m.id===s.self),host=self.role==='host',count=s.members.filter(m=>m.seat!==null).length;
  if(this.liveMode)this.host.dataset.background=s.room.background||'navy';
  const announcement=$('#voice-announcement');$('#voice-announcement-text').textContent=s.room.announcement||'';announcement.hidden=!s.room.announcement;
  $('#voice-members-count').innerHTML=`전체 인원수 <strong>${s.members.length}명</strong><i>·</i>좌석 참여 <strong>${count}명</strong>`;
  $('#voice-host-hint').hidden=!host;
  const members=[...s.members].sort((a,b)=>(b.role==='host')-(a.role==='host'));
  const memberActions=p=>{
   const own=p.id===self.id, name=esc(p.name), target=esc(p.id);
   const mic=voiceGlyph(p.muted||p.seat===null?'talkMicOff':'talkMic');
   const micAction=own?'toggle-mic':p.locked?'unlock':'mute-user';
   const micLabel=own?(p.muted?'내 마이크 켜기':'내 마이크 끄기'):name+(p.locked?' 마이크 제한 해제':' 마이크 제한');
   const micControl=own||host
    ?`<button type="button" data-voice="${micAction}" data-target="${target}" title="${micLabel}" aria-label="${micLabel}" ${p.seat===null||own&&p.locked?'disabled':''}>${mic}</button>`
    :`<span class="talk-mic-status" role="img" aria-label="${p.seat===null?'청취자':p.muted?'마이크 꺼짐':'마이크 켜짐'}">${mic}</span>`;
   const listenLabel=own?'내 소리 설정':name+' 목소리 듣기';
   const listenState=own?'':`aria-pressed="${(this.volumes.get(p.id)??1)>0}"`;
   return `<div class="talk-member-actions">${micControl}<button type="button" ${own&&!Number.isInteger(p.seat)?'hidden':''} data-voice="${own?'sound':'member-listen'}" data-target="${target}" aria-label="${listenLabel}" title="${listenLabel}" ${listenState}>${icon('headphones')}</button></div>`;
  };
  const memberHTML=members.map(p=>`<div class="voice-member-row" data-level-user="${esc(p.id)}"><span class="voice-member-avatar">${p.role==='host'?'<span class="voice-member-crown">'+voiceGlyph('crown')+'</span>':''}${avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})}</span><div class="voice-member-info"><strong>${esc(p.name)}${p.role==='host'?'<small>방장</small>':''}</strong><p>${voiceGlyph('wave')}<span data-member-status="${esc(p.id)}">${p.seat===null?'듣고 있는 중':'좌석 참여 중'}</span></p></div>${this.liveMode?'':memberActions(p)}${host?`<button type="button" class="voice-member-more" data-voice="member-menu" data-target="${esc(p.id)}" aria-label="${esc(p.name)} 관리" aria-expanded="false" aria-controls="voice-member-tools">${voiceGlyph(this.liveMode?'more':'talkMore')}</button>`:''}</div>`).join('');
  const memberKey=memberHTML+JSON.stringify(members.map(p=>[p.id,p.muted,p.locked]));if(memberKey!==this.memberHTML){$('#voice-members-list').innerHTML=memberHTML;this.memberHTML=memberKey;this.closeMemberTools();}
  const invitation=s.seat_invites?.[0],el=$('#voice-seat-invitation');el.hidden=!invitation;
  el.innerHTML=invitation?`<p>방장이 좌석에 초대했어요. <button data-voice="seat-accept" data-target="${esc(invitation.id)}">수락</button><button data-voice="seat-reject" data-target="${esc(invitation.id)}">거절</button></p>`:'';
  clearTimeout(this.seatInviteTimer);if(invitation)this.seatInviteTimer=setTimeout(()=>{el.hidden=true;},Math.max(0,invitation.expires-Date.now()-(this.musicClock||0)));
  $('#voice-settings-readonly').hidden=host;for(const el of $('#voice-settings-form').elements)el.disabled=!host;
  if(this.memberTarget&&(!host||!s.members.some(p=>p.id===this.memberTarget)))this.closeMemberTools();
 },
 memberTools(id,trigger){
  const s=this.state,self=s.members.find(p=>p.id===s.self),p=s.members.find(p=>p.id===id);
  if(!p||self.role!=='host')return;
  if(this.memberTarget===id){this.closeMemberTools(true);return;}
  this.closeMemberTools();
  this.memberTarget=id;const empty=Array.from({length:7},(_,i)=>i+1).filter(i=>!s.members.some(m=>m.seat===i));
  const own=id===self.id,locked=own?'disabled':'';
  const inDock=trigger?.closest('#talk-dock'),box=$(inDock?'#talk-dock-member-tools':'#voice-member-tools');
  const profile=this.liveMode?(p.profile_id?`<a href="#producer/${esc(p.profile_id)}">${voiceGlyph('person')}프로필 보기</a>`:'')
   :`<button type="button" data-voice="talk-profile" data-target="${esc(p.id)}">${voiceGlyph('person')}프로필 보기</button>`;
  box.innerHTML=`<section class="voice-member-tools" aria-label="${esc(p.name)} 관리 메뉴">${profile}<button type="button" data-voice="member-invite" ${own||p.seat!==null||!empty.length?'disabled':''}>${voiceGlyph('plus')}자리로 초대</button>${p.seat!==null&&!own?`<label>이동할 빈 좌석<select id="voice-move-seat" ${empty.length?'':'disabled'}>${empty.map(i=>`<option value="${i}">${i+1}번 자리</option>`).join('')}</select></label><button type="button" data-voice="member-move" ${empty.length?'':'disabled'}>${voiceGlyph('share')}자리 이동</button>`:''}<button type="button" data-voice="member-remove" ${own||p.seat===null?'disabled':''}>${voiceGlyph('leave')}자리에서 제거</button><button type="button" data-voice="${p.locked?'unlock':'mute-user'}" data-target="${esc(id)}" ${own||p.seat===null?'disabled':''}>${icon('mic')}${p.locked?'마이크 제한 해제':'마이크 끄기'}</button><button type="button" class="danger" data-voice="ask-kick" data-target="${esc(id)}" ${locked}>${voiceGlyph('ban')}강퇴</button></section>`;
  box.hidden=false;
  const button=trigger||[...$('#voice-members').querySelectorAll('.voice-member-more')].find(b=>b.dataset.target===id);
  if(!this.liveMode){
   const heading=document.createElement('h3');heading.textContent=p.name+' 관리';
   box.firstElementChild.prepend(heading);button.setAttribute('aria-expanded','true');
   box.querySelector('a,button:not(:disabled)')?.focus();return;
  }
  const anchor=button.getBoundingClientRect(),dialog=$('#voice-members').getBoundingClientRect();
  box.style.left=Math.max(dialog.left+10,Math.min(anchor.right-box.offsetWidth,dialog.right-box.offsetWidth-10))+'px';
  box.style.top=Math.max(dialog.top+65,Math.min(anchor.bottom+5,window.innerHeight-box.offsetHeight-12))+'px';
  button.setAttribute('aria-expanded','true');box.querySelector('a,button:not(:disabled)')?.focus();
 },
 openSeatPicker(seat){
  if(this.state.members.find(p=>p.id===this.state.self)?.role!=='host')return;
  this.invitingSeat=seat;this.showSheet('voice-seat-picker');
  $('#voice-seat-candidates').innerHTML=this.state.members.filter(p=>p.seat===null).map(p=>`<button type="button" class="voice-member-row" data-voice="invite-seat-user" data-target="${esc(p.id)}">${avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})}<span>${esc(p.name)}</span></button>`).join('')||'<p class="quiet">현재 청취 중인 참여자가 없어요.</p>';
 },
 canDock(){return !this.liveMode&&window.innerWidth>800&&window.innerHeight>=600&&this.host.clientWidth>=680;},
 paintTalkPanel(self,micOn){
  const s=this.state,owner=self.id===s.room.host_id;
  // Inheriting the host seat grants control, not permission to start capturing audio.
  if(owner&&this.previousTalkHost&&this.previousTalkHost!==self.id)this.warmSeat=this.generation;
  this.previousTalkHost=s.room.host_id;
  const seated=Number.isInteger(self.seat);
  for(const button of this.host.querySelectorAll('.talk-header [data-voice=settings],[data-talk-tab=settings]'))button.hidden=!owner;
  for(const button of this.host.querySelectorAll('.talk-header [data-voice=sound],[data-talk-tab=sound]'))button.hidden=!seated;
  if(!owner){for(const id of ['talk-themes','voice-room-settings','voice-seat-picker','voice-kick-confirm'])if($('#'+id)?.open)$('#'+id).close();}
  if(!seated){if($('#voice-sound').open)$('#voice-sound').close();if(this.talkTab==='sound')this.stopMicTest();}
  if((this.talkTab==='settings'&&!owner)||(this.talkTab==='sound'&&!seated))this.talkTab='participants';
  const applicant=owner?s.members.find(m=>m.requested):null;
  const request=$('#talk-request'),key=JSON.stringify([applicant?.id,applicant?.name,applicant?.requestVersion??applicant?.requestExpires,this.seatCommandPending,this.micState,self.requested,self.requestVersion??self.requestExpires,self.locked,self.seat,micOn]);
  if(this.talkRequestKey!==key){
   this.talkRequestKey=key;
   const busy=this.seatCommandPending?'disabled aria-busy="true"':'';
   if(applicant)request.innerHTML=`<span class="talk-applicant"><strong title="${esc(applicant.name)}">${esc(applicant.name)}</strong><small>좌석 신청</small></span><button type="button" data-voice="approve-mic" data-target="${esc(applicant.id)}" data-request="${applicant.requestVersion??applicant.requestExpires}" ${busy}>수락</button><button type="button" data-voice="reject-mic" data-target="${esc(applicant.id)}" data-request="${applicant.requestVersion??applicant.requestExpires}" ${busy}>거절</button>`;
   else if(self.requested)request.innerHTML=`<span>좌석 신청 중</span><button type="button" data-voice="cancel-mic" data-request="${self.requestVersion??self.requestExpires}" ${busy}>신청 취소</button>`;
   else request.textContent=self.locked?'마이크 사용 제한':self.seat===null?'좌석을 선택해 대화에 참여하세요.':this.micState==='failed'?'마이크 연결 실패 · 다시 시도해주세요.':this.micBusy?'마이크 연결 중…':micOn?'내 마이크 켜짐':'내 마이크 꺼짐';
  }
  const mic=this.host.querySelector('.talk-central [data-voice=toggle-mic]');
  if(mic.dataset.on!==String(micOn)){mic.dataset.on=String(micOn);mic.innerHTML=voiceGlyph(micOn?'talkMic':'talkMicOff')+'<span class="talk-switch" aria-hidden="true"></span>';}
  mic.hidden=!seated;mic.disabled=self.locked||!seated;
  mic.setAttribute('aria-pressed',String(micOn));mic.setAttribute('aria-label',micOn?'내 마이크 끄기':'내 마이크 켜기');
  mic.setAttribute('aria-busy',String(!!this.micBusy));
  const themeKey=JSON.stringify([s.room.id,s.room.host_id,s.room.settings_revision||0]);
  if(themeKey!==this.talkThemeKey||s.room.theme&&this.lastDecoratedTheme!==s.room.theme.sku){
   this.talkThemeKey=themeKey;this.lastDecoratedTheme=s.room.theme?.sku;
   window.dispatchEvent(new CustomEvent('aifect:room-theme',{detail:{room:s.room,key:themeKey}}));
  }
  this.updateTalkDock();
 },
 async talkSeatAction(action,target,button){
  if(this.seatCommandPending||!this.joined||this.closed)return;
  const self=this.state.members.find(p=>p.id===this.state.self),owner=self?.id===this.state.room.host_id;
  if(!self)return;
  if(action==='request-mic'&&owner){this.openSeatPicker(Number(target));return;}
  const responding=action==='approve-mic'||action==='reject-mic';
  const applicant=responding?this.state.members.find(p=>p.id===target):self;
  if(responding&&!owner)return;
  const payload=action==='request-mic'?{seat:Number(target)}:responding?{target_id:target}:{};
  if(action==='request-mic'){
   if(self.requested||self.locked||Number.isInteger(self.seat))return;
  }else{
   const version=applicant?.requestVersion??applicant?.requestExpires;
   if(!applicant?.requested||String(version)!==button?.dataset.request)return;
   payload.expected_request_version=version;
  }
  this.seatCommandPending=true;
  this.host.querySelectorAll('.voice-seat-empty,#talk-request button').forEach(b=>{b.disabled=true;});
  try{this.acceptState(await this.command(action,payload));}
  finally{
   try{await this.refresh();}finally{this.seatCommandPending=false;this.talkRequestKey=null;if(!this.closed)this.paint();}
  }
 },
 async openSettings(){
  if(!this.liveMode){if(this.state.self===this.state.room.host_id){this.showSheet('voice-room-settings');this.updateTalkSettings();}return;}
  const s=this.state.room,form=$('#voice-settings-form'),ticket=this.settingsTicket=(this.settingsTicket||0)+1;
  const options=await voiceRequest('options');
  if(this.closed||ticket!==this.settingsTicket)return;
  this.settingsRevision=s.settings_revision||0;
  $('#voice-settings-crew').innerHTML='<option value="">크루 선택</option>'+options.crews.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  for(const key of ['mode','title','visibility','max_members','crew_id','background','announcement'])if(form.elements[key])form.elements[key].value=s[key]??({mode:'karaoke',background:'navy',max_members:30,announcement:''}[key]||'');
  this.updateDesignField(form.elements.announcement);this.updateDesignField(form.elements.visibility[0]);
  const theme=await voiceRequest(this.path('theme'));
  if(this.closed||ticket!==this.settingsTicket)return;

  fillRoomThemeChoices(form,options,theme.theme.sku);
  this.showSheet('voice-room-settings');
 },
 toggleEmojiPicker(open,focus=false){
  const picker=$('#voice-emoji-picker'),button=this.host.querySelector('[data-voice="emoji"]');
  if(!picker)return;
  picker.hidden=!open;button?.setAttribute('aria-expanded',String(open));
  if(focus)button?.focus();
 },
 async finalAction(action,target){
  if(action==='view-queue'){this.showSheet('voice-music-sheet');return true;}
  if(action==='personal-mute'){const current=this.preferences.music;if(current)this.lastPersonalVolume=current;this.preferences.music=current?0:(this.lastPersonalVolume||1);this.syncPersonalVolume();this.syncMusic();return true;}
  if(action==='member-listen'&&!this.liveMode){
   if(target!==this.state.self&&this.state.members.some(p=>p.id===target)){
    const panel=this.actionTrigger?.closest('#talk-dock')||$('#voice-members');
    this.volumes.set(target,(this.volumes.get(target)??1)>0?0:1);
    this.applyListenVolumes();this.paintFinalControls();this.updateTalkDock();
    Array.from(panel.querySelectorAll('[data-voice=member-listen]')).find(b=>b.dataset.target===target)?.focus({preventScroll:true});
   }
   return true;
  }
  if(action==='personal-volume'){this.syncPersonalVolume();this.showSheet('talk-volume');return true;}
  if(action==='theme-picker'){
   if(this.state.self!==this.state.room.host_id)return true;
   const sheet=$('#talk-themes'),picker=$('#talk-theme-choices');
   const ticket=this.themePickerTicket=(this.themePickerTicket||0)+1;
   this.themeFromPopup=$('#voice-room-settings').open;
   const choices=picker.querySelector('.voice-backgrounds'),submit=picker.querySelector('[type=submit]');
   choices.textContent='사용 가능한 테마를 불러오는 중…';submit.disabled=true;
   this.showSheet('talk-themes');
   try{
    const options=await voiceRequest('options');
    if(!sheet.open||this.closed||ticket!==this.themePickerTicket||this.state.self!==this.state.room.host_id)return true;
    fillRoomThemeChoices(picker,options,$('#voice-settings-form').elements.theme_sku.value);
    submit.disabled=!picker.elements.background?.value;
   }catch(error){
    if(sheet.open&&ticket===this.themePickerTicket)choices.textContent=error.message;
   }
   return true;
  }
  if(action==='panel-chat'){for(const sheet of this.host.querySelectorAll('.voice-panel-docked[open]'))sheet.close();return true;}
  if(action==='talk-profile'&&!this.liveMode){
   const member=this.state.members.find(p=>p.id===target);
   if(member)await openProfilePreview(member.profile_id||(target===this.state.self?'self':'member:'+target),this.actionTrigger);
   return true;
  }
  if(action==='member-menu'){this.memberTools(target,this.actionTrigger);return true;}
  if(action==='music-down'){await this.musicCommand('move',{index:Number(target),to:Number(target)+1});return true;}
  if(action==='settings'){await this.openSettings();return true;}
  if(action==='emoji'){this.toggleEmojiPicker($('#voice-emoji-picker').hidden);return true;}
  if(action==='emoji-close'){this.toggleEmojiPicker(false,true);return true;}
  if(action==='insert-emoji'){
   const input=$('#voice-message'),start=input.selectionStart,end=input.selectionEnd;
   if(typeof target==='string'&&input.value.length-(end-start)+target.length<=input.maxLength){input.setRangeText(target,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));}
   input.focus({preventScroll:true});return true;
  }
  if(action==='send-chat'){if($('#voice-message').value.trim())$('#voice-chat-form').requestSubmit();return true;}
  if(action==='ask-kick'){this.kickTarget=target;this.showSheet('voice-kick-confirm');return true;}
  if(action==='confirm-kick'){await this.command('moderate',{target_id:this.kickTarget,operation:'kick'});$('#voice-kick-confirm').close();this.closeMemberTools();await this.refresh();return true;}
  if(action==='invite-seat-user'){await this.command('seat-invite',{target_id:target,seat:this.invitingSeat});$('#voice-seat-picker').close();await this.refresh();return true;}
  if(action==='member-invite'){const empty=Array.from({length:7},(_,i)=>i+1).find(i=>!this.state.members.some(m=>m.seat===i));if(empty===undefined)throw Error('빈 좌석이 없어요.');await this.command('seat-invite',{target_id:this.memberTarget,seat:empty});toast('좌석 초대를 보냈어요.');await this.refresh();return true;}
  if(['member-move','member-remove'].includes(action)){await this.command('moderate',{target_id:this.memberTarget,operation:action==='member-move'?'move-seat':'remove-seat',seat:Number($('#voice-move-seat')?.value)});this.closeMemberTools();await this.refresh();return true;}
  if(['seat-accept','seat-reject'].includes(action)){await this.command('seat-answer',{invitation_id:target,accept:action==='seat-accept'});await this.refresh();return true;}
  if(action==='music-repeat'){const current=this.state.music.repeat||'off';await this.musicCommand('repeat',{mode:{off:'one',one:'all',all:'off'}[current]});return true;}
  if(action==='mic-test'){if(this.testGraph)this.stopMicTest();else await this.startMicTest();return true;}
  return false;
 },
 syncPersonalVolume(){if(!this.liveMode){
  const volumeButton=this.host?.querySelector?.('#voice-music-player [data-voice=personal-volume]');
  if(volumeButton)volumeButton.innerHTML=voiceGlyph(this.preferences.music===0?'talkVolumeOff':'talkVolume');
  for(const b of this.host?.querySelectorAll?.('[data-voice=personal-mute]')||[])b.setAttribute('aria-pressed',String(this.preferences.music===0));try{localStorage.setItem('aifect.talkingRoom.listenVolume',String(this.preferences.music));}catch{}}for(const id of ['voice-music-volume','voice-playlist-volume','voice-mini-volume','voice-personal-volume']){const el=$('#'+id);if(el){el.value=this.preferences.music*100;this.updateDesignField(el);}}if(!this.liveMode&&this.talkTab==='sound')this.syncTalkSound();},
 paintFinalMusic(){
  const m=this.state.music;if(!m)return;const host=this.state.members.find(p=>p.id===this.state.self)?.role==='host',track=m.queue[m.index],hasQueue=!!m.queue.length;
  $('#voice-host-audio').hidden=!host||!this.liveMode;$('#voice-room-volume').value=m.volume*100;$('#voice-balance').value=m.balance*100;
  $('#voice-sound-current').textContent=track?'현재 곡: '+track.title+' · '+track.artist:'선택된 음악이 없어요.';
  $('#voice-music-search').hidden=!host;$('#voice-music-results').hidden=!host;$('#voice-queue-area').hidden=!hasQueue;$('#voice-playlist-empty').hidden=hasQueue;
  $('#voice-playlist-empty').querySelector('p').textContent=host?'위 검색창에서 노래를 찾아 + 버튼으로 추가해 주세요.':'방장이 추가한 음악을 이곳에서 함께 들을 수 있어요.';
  this.host.querySelector('.voice-music-transport').hidden=!host||!hasQueue;$('#voice-queue-heading').hidden=true;$('#voice-music-seek').max=track?.duration||0;
  $('#voice-queue-count').textContent=m.queue.length+'곡';this.host.querySelector('[data-voice="music-clear"]').hidden=!host;
  const key=JSON.stringify([m.revision,host]);if(key!==this.musicMarkup){this.musicMarkup=key;
   const button=(action,label,content,disabled=false)=>`<button type="button" data-voice="music-${action}" aria-label="${label}" ${disabled?'disabled':''}>${content}</button>`;
   $('#voice-music-player').hidden=false;
   if(!this.liveMode){
    const cover=`<img src="${esc(track?.cover||'/assets/voice-music-cover.svg')}" alt="">`;
    const mini=$('#voice-music-player');mini.classList.toggle('talk-host-player',host);
    const art=`<span class="talk-cover">${cover}</span>`;
    const info=`<span class="talk-track" title="${esc([track?.title,track?.artist].filter(Boolean).join(' · '))}"><strong>${esc(track?.title||'선택된 곡이 없어요')}</strong><small>${esc(track?.artist||(host?'곡 검색 · 추가':'방장의 선곡을 기다리는 중'))}</small></span>`;
    const transport=host?button('previous','이전 곡',voiceGlyph('previous'),!hasQueue)
      +button(m.playing?'pause':'play',m.playing?'일시정지':'재생',voiceGlyph(m.playing?'talkPause':'talkPlay'),!hasQueue)
      +button('next','다음 곡',voiceGlyph('next'),!hasQueue):'';
    mini.innerHTML=`<button type="button" class="talk-track-picker" data-voice="${host?'music-picker':'view-queue'}" aria-label="${host?'곡 검색 및 추가':'플레이리스트 보기'}">${art}${info}</button><div>${transport}<button type="button" data-voice="personal-volume" aria-label="개인 듣기 볼륨">${voiceGlyph(this.preferences.music===0?'talkVolumeOff':'talkVolume')}</button><input id="voice-mini-volume" type="range" min="0" max="100" value="${this.preferences.music*100}" aria-label="개인 음악 볼륨"></div>`;
   }else $('#voice-music-player').innerHTML=(track?`<img src="${esc(track.cover)}" alt=""><span><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span>`:'<span><strong>함께 들을 음악을 선택해보세요</strong></span>')+`<div>${host?button('previous','이전 곡',voiceGlyph('previous'),!hasQueue)+button(m.playing?'pause':'play',m.playing?'일시정지':'재생',(m.playing?icon('pause'):icon('audio-play')),!hasQueue)+button('next','다음 곡',voiceGlyph('next'),!hasQueue)+button('repeat','반복',voiceGlyph('repeat'),!hasQueue):''}<label class="voice-mini-volume">${icon('volume')}<input id="voice-mini-volume" type="range" min="0" max="100" value="${this.preferences.music*100}" aria-label="개인 음악 볼륨"></label>${button('picker','플레이리스트',voiceGlyph('playlist'))}</div>`;
   $('#voice-popup-current').innerHTML=track?`<img src="${esc(track.cover)}" alt=""><div><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></div>`:'';
   $('#voice-music-queue').innerHTML=m.queue.map((t,i)=>`<article class="voice-queue-row ${i===m.index?'is-current':''}" ${i===m.index?'aria-current="true"':''}><span class="voice-queue-number">${i===m.index&&m.playing?voiceGlyph('wave'):i+1}</span><img src="${esc(t.cover)}" alt=""><span class="voice-queue-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span><time>${time(t.duration)}</time>${host?`<button type="button" data-voice="music-up" data-target="${i}" aria-label="${esc(t.title)} 위로 이동" ${i===0?'disabled':''}>↑</button><button type="button" data-voice="music-down" data-target="${i}" aria-label="${esc(t.title)} 아래로 이동" ${i===m.queue.length-1?'disabled':''}>↓</button><button type="button" data-voice="music-remove" data-target="${i}" aria-label="${esc(t.title)} 삭제">${voiceGlyph('trash')}</button>`:''}</article>`).join('');
  }
  for(const b of this.host.querySelectorAll('[data-voice="music-repeat"]')){const label='반복 '+({off:'끔',all:'전체',one:'한 곡'}[m.repeat||'off']);b.innerHTML=voiceGlyph('repeat')+(m.repeat==='one'?'<sup>1</sup>':'');b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed',String(m.repeat&&m.repeat!=='off'));}
  for(const b of this.host.querySelectorAll('.voice-music-transport [data-voice="music-play"]'))b.hidden=!!m.playing;
  for(const b of this.host.querySelectorAll('.voice-music-transport [data-voice="music-pause"]'))b.hidden=!m.playing;
  for(const el of this.host.querySelectorAll('input[type=range]'))this.updateDesignField(el);
 },
 async startMicTest(){
  const attempt=this.testAttempt=(this.testAttempt||0)+1;if(this.processing){this.testGraph=this.processing;this.testOwned=false;}
  else{const raw=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});if(this.closed||attempt!==this.testAttempt){raw.getTracks().forEach(t=>t.stop());return;}this.testRaw=raw;this.testOwned=true;const graph=await VoiceAudio.microphone(raw,this.preferences.preset,this.preferences.input,this.liveMode?liveVoiceMix(this):undefined);if(this.closed||attempt!==this.testAttempt){graph.close();raw.getTracks().forEach(t=>t.stop());return;}this.testGraph=graph;if(graph.fallback){this.stopMicTest();throw Error('이 브라우저에서는 입력 레벨 분석을 지원하지 않아요.');}}
  this.startLevels();for(const button of this.host.querySelectorAll('[data-voice="mic-test"]'))button.textContent='테스트 중지';
  clearTimeout(this.micTestTimer);this.micTestTimer=setTimeout(()=>this.stopMicTest(),30000);
 },
 stopMicTest(){this.testAttempt=(this.testAttempt||0)+1;clearTimeout(this.micTestTimer);if(this.testOwned){this.testGraph?.close();this.testRaw?.getTracks().forEach(t=>t.stop());}this.testRaw=null;this.testGraph=null;this.testOwned=false;for(const button of this.host?.querySelectorAll?.('[data-voice="mic-test"]')||[])button.textContent='테스트 시작';for(const meter of this.host?.querySelectorAll?.('#voice-input-meter,.talk-test-meter')||[])meter.value=0;}
});
// The dock and popup render separate views of one room session. Audio devices,
// membership and music are still owned by VoiceRoomClient.
Object.assign(VoiceRoomClient.prototype,{
 bindTalkViews(){
  this.talkViewEvents?.abort();
  const events=this.talkViewEvents=new AbortController(),options={signal:events.signal};
  const dock=$('#talk-dock');
  $('#voice-members-list').before($('#voice-member-tools'));
  const popupIds={participants:'voice-members',settings:'voice-room-settings',sound:'voice-sound',share:'voice-invite-sheet'};
  for(const button of this.host.querySelectorAll('.talk-header [data-voice]')){
   const id=popupIds[button.dataset.voice];
   if(id){button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',id);button.setAttribute('aria-expanded','false');}
  }
  this.talkTab='participants';
  this.host.querySelector('.talk-tools nav').onclick=e=>{
   const tab=e.target.closest('[data-talk-tab]');if(!tab||tab.hidden)return;
   this.closeMemberTools();if(this.talkTab==='sound'&&tab.dataset.talkTab!=='sound')this.stopMicTest();
   this.talkTab=tab.dataset.talkTab;this.updateTalkDock();
   if(this.talkTab==='sound')void this.devices().then(()=>this.syncTalkSound()).catch(()=>{});
  };
  dock.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.memberTarget){e.preventDefault();this.closeMemberTools(true);}},options);
  dock.oninput=dock.onchange=e=>{
   const source=e.target.dataset.soundControl;
   if(!source)return;
   const input=document.getElementById(source);
   if(e.target.type==='checkbox')input.checked=e.target.checked;else input.value=e.target.value;
   input.dispatchEvent(new Event(e.type,{bubbles:true}));
  };
  this.host.addEventListener('input',e=>this.syncTalkField(e.target),options);
  this.host.addEventListener('change',e=>this.syncTalkField(e.target),options);
  this.host.addEventListener('close',e=>{
   if(this.talkPopup!==e.target||e.target.open)return;
   this.talkPopup=null;
   this.host.querySelector('.talk-header [aria-expanded=true]')?.setAttribute('aria-expanded','false');
   if(e.target.id==='talk-themes'&&this.themeFromPopup&&this.state.self===this.state.room.host_id){
    this.themeFromPopup=false;
    this.showTalkPopup('voice-room-settings',this.popupTrigger);
    $('#voice-settings-form [data-voice=theme-picker]').focus({preventScroll:true});
    return;
   }
   const trigger=this.popupTrigger;this.popupTrigger=null;
   if(trigger?.isConnected)trigger.focus({preventScroll:true});
   this.restoreTalkViewport();
   this.talkPopupViewport=null;
  },{...options,capture:true});
  this.host.addEventListener('click',e=>{
   const dialog=this.talkPopup;
   if(e.target!==dialog||!dialog?.open)return;
   const r=dialog.getBoundingClientRect();
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();
  },options);
  this.onTalkPointer=e=>{
   const popup=this.talkPopup;
   if(popup?.open&&!popup.matches(':modal')&&!popup.contains(e.target)&&!this.popupTrigger?.contains(e.target))popup.close();
  };
  this.onTalkEscape=e=>{
   if(e.key==='Escape'&&this.talkPopup?.open&&!e.defaultPrevented){
    e.preventDefault();this.talkPopup.close();
   }
  };
  document.addEventListener('pointerdown',this.onTalkPointer,options);
  document.addEventListener('keydown',this.onTalkEscape,options);
 },
 restoreTalkViewport(){
  const view=this.talkPopupViewport;
  if(view&&this.canDock()&&(window.scrollX!==view.x||window.scrollY!==view.y)){
   window.scrollTo({left:view.x,top:view.y,behavior:'instant'});
  }
 },
 showTalkPopup(id,trigger){
  const sheet=document.getElementById(id);if(!sheet)return;
  if(sheet===this.talkPopup&&sheet.open){sheet.close();return;}
  const previous=this.talkPopup,origin=trigger||document.activeElement;
  const docked=this.canDock();
  if(docked)this.talkPopupViewport??={x:window.scrollX,y:window.scrollY};
  else this.talkPopupViewport=null;
  if(previous?.open)previous.close();
  this.popupTrigger=origin?.closest('dialog')?this.popupTrigger:origin;
  this.talkPopup=sheet;
  this.host.querySelector('.talk-header [aria-expanded=true]')?.setAttribute('aria-expanded','false');
  this.host.querySelector('.talk-header [aria-controls="'+id+'"]')?.setAttribute('aria-expanded','true');
  if(docked)this.host.style.setProperty('--talk-popup-top',this.host.querySelector('.voice-chat-panel').offsetTop+4+'px');
  sheet.classList.toggle('talk-over-chat',docked);
  if(docked)sheet.show();else sheet.showModal();
  sheet.scrollTop=0;sheet.querySelector('.voice-dialog-close')?.focus({preventScroll:true});
  this.restoreTalkViewport();
 },
 syncTalkField(field){
  if(field.closest('#voice-sound'))this.syncTalkSound();
  if(!field.name||!field.closest('.talk-settings-form'))return;
  const other=field.form.id==='voice-settings-form'?$('#dock-voice-settings-form'):$('#voice-settings-form');
  if(other?.elements[field.name])other.elements[field.name].value=field.form.elements[field.name].value;
  for(const form of this.host.querySelectorAll('.talk-settings-form'))this.talkFormDetails(form);
 },
 talkFormDetails(form){
  form.querySelector('output').textContent=form.elements.announcement.value.length+'/200';
  form.querySelector('.voice-crew-setting').hidden=form.elements.visibility.value!=='crew';
 },
 updateTalkSettings(force=false){
  const room=this.state.room,owner=room.host_id===this.state.self;
  const key=JSON.stringify([room.host_id,room.settings_revision||0]);
  if(key!==this.talkSettingsKey||force){
   this.talkSettingsKey=key;this.settingsRevision=room.settings_revision||0;
   for(const form of this.host.querySelectorAll('.talk-settings-form')){
    for(const key of ['title','visibility','max_members','crew_id','announcement'])form.elements[key].value=room[key]??'';
    if(form.elements.mode)form.elements.mode.value=room.mode||'talk';
    form.elements.theme_sku.value=room.theme?.sku||room.theme_sku||room.background||'navy';
    for(const el of form.elements)el.disabled=!owner;
    this.talkFormDetails(form);
   }
  }
  if(!this.talkOptionsLoading&&!this.talkOptions&&owner&&
    (this.talkPopup?.id==='voice-room-settings'||this.talkTab==='settings')){
   this.talkOptionsLoading=true;
   this.safe(async()=>{
    try{this.talkOptions=await voiceRequest('options');if(!this.closed)this.fillTalkCrews();}
    finally{this.talkOptionsLoading=false;}
   });
  }
 },
 fillTalkCrews(){
  const room=this.state.room;
  for(const form of this.host.querySelectorAll('.talk-settings-form')){
   const select=form.elements.crew_id,selected=select.value||room.crew_id||'';
   select.innerHTML='<option value="">크루 선택</option>'+(this.talkOptions?.crews||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
   select.value=selected;
  }
 },
 async saveTalkSettings(form){
  if(this.savingTalkSettings||this.state.self!==this.state.room.host_id)return;
  this.savingTalkSettings=true;
  const values=Object.fromEntries(new FormData(form));
  try{
   const state=await this.command('settings',{...values,max_members:Number(values.max_members),revision:this.settingsRevision});
   this.acceptState(state);if(this.closed)return;await this.refresh();if(this.closed)return;
   if(form.id==='voice-settings-form')$('#voice-room-settings').close();
   toast('방 설정을 저장했어요.');
  }finally{this.savingTalkSettings=false;}
 },
 talkSoundHTML(){
  const row=(id,label)=>{
   const input=document.getElementById(id);
   const control=input.tagName==='SELECT'?`<select data-sound-control="${id}"></select>`:
    `<input type="${input.type}" data-sound-control="${id}" min="${input.min}" max="${input.max}" step="${input.step||1}">`;
   return `<label class="talk-sound-row"><span>${label}</span>${control}${input.type==='range'?`<output data-sound-output="${id}"></output>`:''}</label>`;
  };
  return [['voice-input-gain','마이크 입력 볼륨'],['voice-monitor','내 목소리 모니터링'],['voice-noise','노이즈 제거'],['voice-echo','에코 제거'],['voice-preset','마이크 효과'],['voice-reverb','리버브 강도'],['voice-input','입력 장치'],['voice-output','출력 장치'],['voice-music-volume','개인 음악 볼륨'],['voice-listen-volume','참가자 목소리']].map(([id,label])=>row(id,label)).join('')+`<div class="talk-sound-row"><label>마이크 테스트 <meter class="talk-test-meter" min="0" max="1" value="0"></meter></label><button type="button" data-voice="mic-test">${this.testGraph?'테스트 중지':'테스트 시작'}</button></div>`;
 },
 syncTalkSound(){
  for(const field of this.host.querySelectorAll('[data-sound-control]')){
   const source=document.getElementById(field.dataset.soundControl);
   if(field.tagName==='SELECT'&&field.innerHTML!==source.innerHTML)field.innerHTML=source.innerHTML;
   if(field.type==='checkbox')field.checked=source.checked;else field.value=source.value;
   field.disabled=source.disabled;
   const output=field.parentElement.querySelector('output');if(output)output.value=field.value+'%';
  }
 },
 updateTalkDock(){
  if(this.liveMode||!this.state||!this.host.isConnected)return;
  const dock=$('#talk-dock'),tab=this.talkTab||'participants',owner=this.state.self===this.state.room.host_id;
  for(const b of this.host.querySelectorAll('[data-talk-tab]'))b.setAttribute('aria-pressed',String(b.dataset.talkTab===tab));
  const changed=dock.dataset.tab!==tab;
  if(changed){dock.dataset.tab=tab;dock.scrollTop=0;this.dockMarkup=null;}
  if(tab==='settings'){
   if(changed){
    dock.innerHTML=voiceSettingsFormHTML('edit',true).replace(/id="(voice-[\w-]+)"/g,'id="dock-$1"')+'<p class="quiet talk-readonly">방장이 설정을 변경할 수 있어요.</p>';
    const form=dock.querySelector('form');form.classList.add('talk-settings-form');
    form.onsubmit=busyForm(form,()=>this.saveTalkSettings(form));
    this.fillTalkCrews();
    const original=$('#voice-settings-form');
    for(const name of ['title','visibility','max_members','crew_id','announcement','theme_sku'])form.elements[name].value=original.elements[name].value;
    if(form.elements.mode)form.elements.mode.value=original.elements.mode.value;
    this.talkFormDetails(form);
   }
   for(const el of dock.querySelector('form').elements)el.disabled=!owner;
   dock.querySelector('.talk-readonly').hidden=owner;
  }else if(tab==='sound'){
   if(changed)dock.innerHTML=this.talkSoundHTML();
   this.syncTalkSound();
  }else{
   let html;
   if(tab==='participants'){
    // Snapshot order is admission order. Stable sort preserves it among listeners.
    const members=[...this.state.members].sort((a,b)=>(a.seat??8)-(b.seat??8));
    const strip=members.map(p=>{
     const name=esc(p.name),avatar=avatarImage({profile_id:p.profile_id,name:p.name,image_version:p.image_version},'producer',false);
     return `<button type="button" class="talk-strip-person" data-voice="${owner?'member-menu':'talk-profile'}" data-target="${esc(p.id)}" aria-label="${name} ${owner?'관리':'프로필 보기'}" ${owner?'aria-controls="talk-dock-member-tools" aria-expanded="false"':'aria-haspopup="dialog"'}><span class="voice-member-avatar">${avatar}</span><strong title="${name}">${name}</strong></button>`;
    }).join('');
    html=`<h3>참여자 <small>${members.length}명</small></h3><div class="talk-member-strip">${strip}</div><div id="talk-dock-member-tools" hidden></div>`;
   }else{
    const music=this.state.music,queue=$('#voice-music-queue').innerHTML;
    html='<header class="talk-dock-heading"><h3>플레이리스트 <small>'+(music?.queue.length||0)+'곡</small></h3>'+
     (owner?'<button type="button" data-voice="music-picker">곡 검색 · 추가</button>':'')+'</header>'+
     (queue||'<p>아직 추가된 음악이 없어요.</p>');
   }
   if(html!==this.dockMarkup){
    const left=dock.querySelector('.talk-member-strip')?.scrollLeft||0,focused=document.activeElement?.closest('.talk-strip-person')?.dataset.target;
    if(this.memberTarget&&dock.querySelector('#talk-dock-member-tools:not([hidden])'))this.closeMemberTools();
    dock.innerHTML=html;this.dockMarkup=html;
    const strip=dock.querySelector('.talk-member-strip');if(strip){strip.scrollLeft=left;if(focused)[...strip.children].find(b=>b.dataset.target===focused)?.focus({preventScroll:true});}
   }
  }
  this.updateTalkSettings();
 }
});
