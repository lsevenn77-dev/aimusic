// Room controls share VoiceRoomClient's server snapshots and media graph.
Object.assign(VoiceRoomClient.prototype,{
 bindFinalControls(){
  const form=$('#voice-chat-form'),input=$('#voice-message');
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(input.value.trim())form.requestSubmit();}};
  this.host.querySelector('.voice-chat-panel').addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#voice-emoji-picker').hidden){e.preventDefault();e.stopPropagation();this.toggleEmojiPicker(false,true);}});
  this.bindTalkViews();
  const supported=navigator.mediaDevices?.getSupportedConstraints?.()||{};
  for(const [id,key] of [['voice-echo','echoCancellation'],['voice-noise','noiseSuppression']])if(supported[key]===false){$('#'+id).disabled=true;$('#'+id).title='이 브라우저에서 지원하지 않는 설정이에요.';}
  $('#voice-echo').checked=this.preferences.echo;$('#voice-echo').onchange=()=>this.safe(async()=>{this.preferences.echo=$('#voice-echo').checked;await this.stream?.getAudioTracks()[0]?.applyConstraints({echoCancellation:this.preferences.echo});});
  $('#voice-playlist-volume').oninput=()=>{this.preferences.music=Number($('#voice-playlist-volume').value)/100;this.syncPersonalVolume();this.syncMusic();};
  this.host.addEventListener('close',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},true);
  this.host.addEventListener('cancel',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},true);
  this.host.addEventListener('input',e=>{if(e.target.id==='voice-mini-volume'||e.target.id==='voice-personal-volume'){this.preferences.music=Number(e.target.value)/100;this.syncPersonalVolume();this.syncMusic();}});
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
    ?`<button type="button" data-voice="${micAction}" data-target="${target}" title="${micLabel}" aria-label="${micLabel}" ${own&&(p.seat===null||p.locked)?'disabled':''}>${mic}</button>`
    :`<span class="talk-mic-status" role="img" aria-label="${p.seat===null?'청취자':p.muted?'마이크 꺼짐':'마이크 켜짐'}">${mic}</span>`;
   const listenLabel=own?'내 소리 설정':name+' 목소리 듣기';
   const listenState=own?'':`aria-pressed="${(this.volumes.get(p.id)??1)>0}"`;
   return `<div class="talk-member-actions">${micControl}<button type="button" ${own&&!Number.isInteger(p.seat)?'hidden':''} data-voice="${own?'sound':'member-listen'}" data-target="${target}" aria-label="${listenLabel}" title="${listenLabel}" ${listenState}>${icon('headphones')}</button></div>`;
  };
  const memberHTML=members.map(p=>`<div class="voice-member-row" data-level-user="${esc(p.id)}"><button type="button" class="room-member-profile" data-voice="talk-profile" data-target="${esc(p.id)}" aria-label="${esc(p.name)} 프로필">${roomMemberAvatar(p)}<span class="voice-member-info"><strong>${p.role==='host'?'<span class="room-host-crown" aria-label="방장">'+voiceGlyph('crown')+'</span>':''}<span title="${esc(p.name)}">${esc(p.name)}</span></strong><small>${p.seat===null?'청취 중':p.muted?'마이크 꺼짐':'마이크 켜짐'}</small></span></button>${memberActions(p)}${host&&p.id!==self.id?`<button type="button" class="voice-member-more" data-voice="member-menu" data-target="${esc(p.id)}" aria-label="${esc(p.name)} 관리" aria-expanded="false" aria-controls="voice-member-tools">${voiceGlyph('talkMore')}</button>`:''}</div>`).join('');
  const memberKey=memberHTML+JSON.stringify(members.map(p=>[p.id,p.muted,p.locked]));if(memberKey!==this.memberHTML){$('#voice-members-list').before($('#voice-member-tools'));$('#voice-members-list').innerHTML=memberHTML;this.memberHTML=memberKey;this.closeMemberTools();}
  const invitation=s.seat_invites?.[0],el=$('#voice-seat-invitation');el.hidden=!invitation;
  el.innerHTML=invitation?`<p>방장이 좌석에 초대했어요. <button data-voice="seat-accept" data-target="${esc(invitation.id)}">수락</button><button data-voice="seat-reject" data-target="${esc(invitation.id)}">거절</button></p>`:'';
  clearTimeout(this.seatInviteTimer);if(invitation)this.seatInviteTimer=setTimeout(()=>{el.hidden=true;},Math.max(0,invitation.expires-Date.now()-(this.musicClock||0)));
  $('#voice-settings-readonly').hidden=host;if(!host){for(const el of $('#voice-settings-form').elements)el.disabled=el.dataset.voice!=='dismiss';}
  if(this.memberTarget&&(!host||!s.members.some(p=>p.id===this.memberTarget)))this.closeMemberTools();
 },
 memberTools(id,trigger){
  const s=this.state,self=s.members.find(p=>p.id===s.self),p=s.members.find(p=>p.id===id);
  if(!p||self.role!=='host'||p.id===self.id)return;
  if(this.memberTarget===id){this.closeMemberTools(true);return;}
  this.closeMemberTools();
  this.memberTarget=id;const empty=Array.from({length:7},(_,i)=>i+1).filter(i=>!s.members.some(m=>m.seat===i));
  const own=id===self.id,locked=own?'disabled':'';
  const inDock=trigger?.closest('#talk-dock'),box=$(inDock?'#talk-dock-member-tools':'#voice-member-tools');
  const profile=`<button type="button" data-voice="talk-profile" data-target="${esc(p.id)}">${voiceGlyph('person')}프로필 보기</button>`;
  box.innerHTML=`<section class="voice-member-tools" aria-label="${esc(p.name)} 관리 메뉴">${profile}<button type="button" data-voice="member-invite" ${own||p.seat!==null||!empty.length?'disabled':''}>${voiceGlyph('plus')}자리로 초대</button>${p.seat!==null&&!own?`<label>이동할 빈 좌석<select id="voice-move-seat" ${empty.length?'':'disabled'}>${empty.map(i=>`<option value="${i}">${i+1}번 자리</option>`).join('')}</select></label><button type="button" data-voice="member-move" ${empty.length?'':'disabled'}>${voiceGlyph('share')}자리 이동</button>`:''}<button type="button" data-voice="member-remove" ${own||p.seat===null?'disabled':''}>${voiceGlyph('leave')}자리에서 제거</button><button type="button" data-voice="${p.locked?'unlock':'mute-user'}" data-target="${esc(id)}" ${own?'disabled':''}>${icon('mic')}${p.locked?'마이크 허용':'마이크 회수'}</button><button type="button" class="danger" data-voice="ask-kick" data-target="${esc(id)}" ${locked}>${voiceGlyph('ban')}강퇴</button></section>`;
  if(this.liveMode)box.querySelectorAll('[data-voice="member-invite"],[data-voice="member-remove"],[data-voice="member-move"],label').forEach(el=>el.remove());
  box.hidden=false;
  const button=trigger||[...$('#voice-members').querySelectorAll('.voice-member-more')].find(b=>b.dataset.target===id);
  const row=button.closest('.voice-member-row');if(row)row.after(box);
  box.style.removeProperty('left');box.style.removeProperty('top');
  button.setAttribute('aria-expanded','true');box.querySelector('a,button:not(:disabled)')?.focus({preventScroll:true});
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
  if(!owner)for(const id of ['voice-seat-picker','voice-kick-confirm'])if($('#'+id)?.open)$('#'+id).close();
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
 toggleEmojiPicker(open,focus=false){
  const picker=$('#voice-emoji-picker'),button=this.host.querySelector('[data-voice="emoji"]');
  if(!picker)return;
  if(open){picker.hidden=false;this.adoptRoomPopup(picker,button);}else if(picker.open)picker.close();
  picker.hidden=!open;button?.setAttribute('aria-expanded',String(open));
  if(focus)button?.focus();
 },
 async finalAction(action,target){
  if(action==='view-queue'){this.showSheet('voice-music-sheet');return true;}
  if(action==='personal-mute'){const current=this.preferences.music;if(current)this.lastPersonalVolume=current;this.preferences.music=current?0:(this.lastPersonalVolume||1);this.syncPersonalVolume();this.syncMusic();return true;}
  if(action==='member-listen'){
   if(target!==this.state.self&&this.state.members.some(p=>p.id===target)){
    const panel=this.actionTrigger?.closest('#talk-dock')||$('#voice-members');
    this.volumes.set(target,(this.volumes.get(target)??1)>0?0:1);
    this.applyListenVolumes();this.paintFinalControls();
    Array.from(panel.querySelectorAll('[data-voice=member-listen]')).find(b=>b.dataset.target===target)?.focus({preventScroll:true});
   }
   return true;
  }
  if(action==='personal-volume'){this.syncPersonalVolume();this.showSheet('talk-volume');return true;}
  if(action==='panel-chat'){for(const sheet of this.host.querySelectorAll('.voice-panel-docked[open]'))sheet.close();return true;}
  if(action==='talk-profile'){
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
 syncPersonalVolume(){this.preferences.voice=this.preferences.music;this.applyListenVolumes();if(this.liveMode){this.liveVolume=this.preferences.music;if(this.liveAudio)this.liveAudio.volume=this.liveVolume;}if(!this.liveMode){
  const volumeButton=this.host?.querySelector?.('#voice-music-player [data-voice=personal-volume]');
  if(volumeButton)volumeButton.innerHTML=voiceGlyph(this.preferences.music===0?'talkVolumeOff':'talkVolume');
  for(const b of this.host?.querySelectorAll?.('[data-voice=personal-mute]')||[])b.setAttribute('aria-pressed',String(this.preferences.music===0));try{localStorage.setItem('aifect.talkingRoom.listenVolume',String(this.preferences.music));}catch{}}for(const id of ['voice-music-volume','voice-listen-volume','live-mr-volume','voice-playlist-volume','voice-mini-volume','voice-personal-volume']){const el=$('#'+id);if(el){el.value=this.preferences.music*100;this.updateDesignField(el);}}},
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
// Shared room surfaces are real dialogs, bounded by the actual chat region.
function roomMemberAvatar(p){return `<span class="room-member-photo${p.muted?' is-muted':''}">${avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})}${p.muted?'<span class="room-muted-mark" aria-label="음소거">'+voiceGlyph('muted')+'</span>':''}</span>`;}
Object.assign(VoiceRoomClient.prototype,{
 bindTalkViews(){
  this.talkViewEvents?.abort();const events=this.talkViewEvents=new AbortController(),options={signal:events.signal};
  const labels={'voice-sound':'소리 설정','voice-room-settings':'방 설정','voice-members':'참여자','voice-music-sheet':'플레이리스트','live-search-sheet':'노래 신청','talk-leave':'방 나가기','voice-kick-confirm':'참여자 강퇴','voice-seat-picker':'좌석 초대','voice-gift-sheet':'선물 보내기','talk-volume':'청취 음량'};
  for(const sheet of this.host.querySelectorAll('dialog')){sheet.classList.add('room-popup');sheet.setAttribute('aria-label',labels[sheet.id]||sheet.getAttribute('aria-label')||'방 메뉴');sheet.removeAttribute('aria-labelledby');sheet.tabIndex=-1;this.host.querySelector('.voice-chat-panel').append(sheet);}
  const ids={participants:'voice-members',sound:'voice-sound',share:'voice-invite-sheet',settings:'voice-room-settings',leave:'talk-leave','music-picker':'voice-music-sheet','view-queue':'voice-music-sheet','personal-volume':'talk-volume','karaoke-search-open':'live-search-sheet',emoji:'voice-emoji-picker',gift:'voice-gift-sheet'};
  for(const button of this.host.querySelectorAll('.room-header button')){button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',ids[button.dataset.voice]);button.setAttribute('aria-expanded','false');}
  const outside=e=>{
   const popup=this.talkPopup;if(!popup?.open||popup.contains(e.target))return;
   const entry=e.target.closest('[data-voice]');if(entry&&this.host.contains(entry)&&ids[entry.dataset.voice])return;
   if(e.type==='pointerdown'){e.preventDefault();return;}
   e.preventDefault();e.stopImmediatePropagation();this.closeRoomPopup();
  };
  document.addEventListener('pointerdown',outside,{...options,capture:true});document.addEventListener('click',outside,{...options,capture:true});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.talkPopup?.open&&!e.defaultPrevented){e.preventDefault();this.closeRoomPopup();}},{...options,capture:true});
  this.host.addEventListener('close',e=>{
   if(e.target!==this.talkPopup||e.target.open)return;
   this.talkPopup=null;this.settingsTicket=(this.settingsTicket||0)+1;
   this.host.querySelectorAll('.room-header [aria-expanded=true]').forEach(b=>b.setAttribute('aria-expanded','false'));
   if(e.target.id==='voice-sound')this.stopMicTest();
   if(e.target.id==='voice-emoji-picker'){e.target.hidden=true;this.host.querySelector('[data-voice="emoji"]')?.setAttribute('aria-expanded','false');}
   const trigger=this.popupTrigger;this.popupTrigger=null;
   if(trigger?.isConnected&&!trigger.closest('dialog:not([open])'))trigger.focus({preventScroll:true});else this.host.querySelector('.room-header button')?.focus({preventScroll:true});
  },{...options,capture:true});
  const sound=$('#voice-sound'),advanced=sound.querySelector('.voice-audio-extra');
  for(const id of ['voice-noise','voice-echo','voice-input-meter'])advanced.append($('#'+id).closest('.voice-audio-card'));
  const listen=$('#voice-music-volume').closest('label');listen.firstChild.textContent='청취 음량 ';listen.classList.add('room-listen-volume');sound.prepend(listen);
  sound.prepend($('#voice-monitor').closest('.voice-audio-card'));
  if(this.liveMode)advanced.append($('#live-delay').closest('label'));
  $('#voice-listen-volume').closest('label').hidden=true;
  this.bindRoomSettings();this.bindRoomShare();
 },
 closeRoomPopup(){const p=this.talkPopup;if(p?.classList.contains('profile-preview')){closeProfilePreview();if(this.talkPopup===p){this.talkPopup=null;this.popupTrigger?.focus({preventScroll:true});}}else p?.close();},
 showTalkPopup(id,trigger){const sheet=document.getElementById(id);if(sheet)this.adoptRoomPopup(sheet,trigger);},
 adoptRoomPopup(sheet,trigger=this.actionTrigger){
  if(sheet===this.talkPopup&&sheet.open){this.closeRoomPopup();return;}
  const origin=trigger||document.activeElement,previous=this.talkPopup;
  this.talkPopup=null;if(previous?.open){if(previous.classList.contains('profile-preview'))closeProfilePreview();else previous.close();}
  this.settingsTicket=(this.settingsTicket||0)+1;
  if(origin?.isConnected&&!origin.closest('dialog'))this.popupTrigger=origin;
  this.talkPopup=sheet;sheet.classList.add('room-popup');sheet.removeAttribute('aria-modal');sheet.tabIndex=-1;
  if(sheet.id==='dialog'&&!this.roomExternalHome)this.roomExternalHome={parent:sheet.parentNode,next:sheet.nextSibling};
  this.host.querySelector('.voice-chat-panel').append(sheet);
  this.host.querySelectorAll('.room-header [aria-expanded]').forEach(b=>b.setAttribute('aria-expanded',String(b.getAttribute('aria-controls')===sheet.id)));
  if(!sheet.open)sheet.show();sheet.scrollTop=0;sheet.focus({preventScroll:true});
 },
 releaseRoomExternal(){const sheet=document.getElementById('dialog'),home=this.roomExternalHome;if(home&&sheet){sheet.close();sheet.classList.remove('room-popup');home.parent.insertBefore(sheet,home.next?.parentNode===home.parent?home.next:null);this.roomExternalHome=null;}},
 bindRoomSettings(){
  const form=$('#voice-settings-form');
  form.onsubmit=busyForm(form,()=>this.saveTalkSettings(form));
  form.addEventListener('click',e=>{
   const capacity=e.target.closest('[data-capacity]');if(capacity){form.elements.max_members.value=capacity.dataset.capacity;form.elements.max_members.dispatchEvent(new Event('input',{bubbles:true}));}
   const generate=e.target.closest('[data-auto-title]');if(generate)this.safe(async()=>{generate.disabled=true;const ticket=this.settingsTicket;try{const d=await voiceRequest('options?mode='+(this.liveMode?'karaoke':'talk')+'&exclude='+encodeURIComponent(form.elements.title.value));if($('#voice-room-settings').open&&ticket===this.settingsTicket){form.elements.title.value=d.suggested_title;}}finally{generate.disabled=false;}});
  });
  form.addEventListener('input',()=>{form.querySelector('.voice-crew-setting').hidden=form.elements.visibility.value!=='crew';form.querySelector('output').textContent=form.elements.announcement.value.length+'/200';for(const b of form.querySelectorAll('[data-capacity]'))b.setAttribute('aria-pressed',String(Number(b.dataset.capacity)===Number(form.elements.max_members.value)));});
 },
 async openSettings(){
  const sheet=$('#voice-room-settings');if(sheet===this.talkPopup&&sheet.open){this.closeRoomPopup();return;}
  this.showSheet('voice-room-settings');
  const ticket=this.settingsTicket,form=$('#voice-settings-form'),room=this.state.room,owner=room.host_id===this.state.self;
  this.settingsRevision=room.settings_revision||0;this.settingsLoading=true;
  for(const key of ['title','visibility','max_members','announcement'])form.elements[key].value=room[key]??'';
  form.elements.crew_id.value=room.crew_id||'';
  for(const el of form.elements)el.disabled=true;
  form.querySelector('[data-voice=dismiss]').disabled=false;
  form.querySelector('.form-error').textContent='';form.querySelector('.voice-backgrounds').textContent='테마를 불러오는 중…';
  form.dispatchEvent(new Event('input',{bubbles:true}));
  try{
   const options=await voiceRequest('options?mode='+(this.liveMode?'karaoke':'talk'));
   if(this.closed||!sheet.open||ticket!==this.settingsTicket)return;
   fillRoomThemeChoices(form,options,room.theme?.sku||room.theme_sku||room.background||'navy');
   form.elements.crew_id.value=options.crews.length===1?options.crews[0].id:'';
   const crew=form.querySelector('.voice-crew-setting');crew.textContent=options.crews.length===1?options.crews[0].name:'소속 크루가 있어야 선택할 수 있어요.';crew.hidden=form.elements.visibility.value!=='crew';
   form.querySelector('[name=visibility][value=crew]').disabled=options.crews.length!==1;
   for(const el of form.elements)if(el.name!=='visibility'||el.value!=='crew')el.disabled=!owner;
   form.querySelector('[data-voice=dismiss]').disabled=false;
  }catch(e){if(ticket===this.settingsTicket)form.querySelector('.form-error').textContent=e.message;throw e;}
  finally{if(ticket===this.settingsTicket)this.settingsLoading=false;}
 },
 async saveTalkSettings(form){
  if(this.savingTalkSettings||this.settingsLoading||this.state.self!==this.state.room.host_id)return;
  const values=Object.fromEntries(new FormData(form)),capacity=Number(values.max_members);
  if(!Number.isInteger(capacity)||capacity<2||capacity>30||capacity<this.state.members.length)throw Error('최대 참여 인원은 현재 참여 인원 이상, 2~30명으로 입력해주세요.');
  this.savingTalkSettings=true;
  try{const state=await this.command('settings',{...values,mode:this.state.room.mode,max_members:capacity,revision:this.settingsRevision});this.acceptState(state);if(this.closed)return;window.dispatchEvent(new CustomEvent('aifect:room-theme',{detail:{room:this.state.room}}));$('#voice-room-settings').close();toast('방 설정을 저장했어요.');}
  finally{this.savingTalkSettings=false;}
 },
 bindRoomEcho(){
  this.echoStrengths??={studio:25,hall:35,karaoke:30};
  if(!['studio','hall','karaoke'].includes(this.preferences.preset))this.preferences.preset='studio';
  const preset=$('#voice-preset'),strength=$('#voice-reverb');preset.value=this.preferences.preset;
  const sync=()=>{strength.value=this.echoStrengths[preset.value];this.updateDesignField(strength);this.preferences.reverb=Number(strength.value)/200;this.liveVocalMix=VoiceAudio.echoMix(preset.value,Number(strength.value)/100);};sync();
  const apply=()=>{for(const graph of new Set([this.processing,this.testGraph])){if(!graph)continue;if(this.liveMode)graph.setMix?.(this.liveVocalMix);else{graph.setPreset(this.preferences.preset);graph.setReverb(this.preferences.reverb);}}};
  preset.onchange=()=>{this.preferences.preset=preset.value;sync();apply();};
  strength.oninput=()=>{this.echoStrengths[preset.value]=Number(strength.value);sync();apply();};
 },
 bindRoomShare(){
  const form=$('#voice-invite-form');this.shareSelected??=new Map();
  $('#room-share-query').oninput=()=>{clearTimeout(this.roomShareTimer);this.roomShareTimer=setTimeout(()=>this.safe(()=>this.loadRoomShare()),180);};
  $('#room-share-more').onclick=()=>this.safe(()=>this.loadRoomShare(true));
  $('#room-share-people').onchange=e=>{const input=e.target.closest('[data-share-id]');if(!input)return;const person=this.sharePeople.get(input.dataset.shareId);if(input.checked)this.shareSelected.set(person.profile_id,person);else this.shareSelected.delete(person.profile_id);this.paintShareCount();};
  form.onsubmit=busyForm(form,()=>this.sendRoomShare());
 },
 paintShareCount(){$('#room-share-count').textContent=this.shareSelected.size+'명 선택';},
 async openRoomShare(){
  const sheet=$('#voice-invite-sheet');if(sheet===this.talkPopup&&sheet.open){this.closeRoomPopup();return;}
  this.showSheet('voice-invite-sheet');const url=location.origin+'/#'+(this.liveMode?'live':'voice')+'/'+encodeURIComponent(this.id);
  sheet.querySelector('[data-share-title]').textContent=this.state.room.title;sheet.querySelector('[data-share-type]').textContent=this.liveMode?'라이브 노래방':'토킹룸';
  const link=sheet.querySelector('[data-share-link]');link.href=url;link.textContent=url;this.paintShareCount();await this.loadRoomShare();
 },
 async loadRoomShare(more=false){
  this.roomShareAbort?.abort();const controller=this.roomShareAbort=new AbortController(),q=$('#room-share-query').value.trim(),out=$('#room-share-people');
  if(!more){out.textContent='팔로우 목록을 불러오는 중…';this.sharePeople=new Map();}
  try{const d=await api('/api/follow-management?tab=following&kind=producers&sort=name&q='+encodeURIComponent(q)+'&offset='+(more?this.shareNext||0:0),'GET',undefined,{signal:controller.signal,fresh:true});
   if(this.closed||controller.signal.aborted)return;this.shareNext=d.next;for(const p of d.items)this.sharePeople.set(p.profile_id||p.key,p);
   out.innerHTML=[...this.sharePeople.values()].map(p=>`<label class="room-share-person"><input type="checkbox" data-share-id="${esc(p.profile_id||p.key)}" ${p.profile_id?'':'disabled'} ${this.shareSelected.has(p.profile_id)?'checked':''}>${avatarImage({profile_id:p.profile_id,name:p.name,image_version:p.image_version})}<span>${esc(p.name)}${p.profile_id?'':' · 메시지 수신 프로필 없음'}</span></label>`).join('')||'<p>검색된 팔로우가 없어요.</p>';
   $('#room-share-more').hidden=d.next===null;
  }catch(e){if(!controller.signal.aborted){out.textContent='목록을 불러오지 못했어요.';throw e;}}
 },
 async sendRoomShare(){
  if(this.roomShareSending)return;if(!this.shareSelected.size)throw Error('공유할 팔로우를 선택해주세요.');
  const form=$('#voice-invite-form'),message=form.elements.message.value.trim(),selected=[...this.shareSelected.values()];
  const key=JSON.stringify([message,selected.map(p=>p.profile_id).sort()]);
  if(this.shareBatch?.key!==key)this.shareBatch={key,requests:new Map(selected.map(p=>[p.profile_id,crypto.randomUUID()])),sent:new Set()};
  const batch=this.shareBatch;this.roomShareSending=true;const failures=[];
  try{for(const p of selected){if(batch.sent.has(p.profile_id))continue;try{await this.command('invite',{profile_id:p.profile_id,message,request_id:batch.requests.get(p.profile_id)});batch.sent.add(p.profile_id);}catch(e){failures.push(p.name+': '+e.message);}}
   $('#room-share-result').textContent=batch.sent.size+'명에게 전송했어요.'+(failures.length?' 전송 실패 '+failures.join(' / '):'');
   if(!failures.length){this.shareSelected.clear();this.paintShareCount();for(const el of form.querySelectorAll('[data-share-id]'))el.checked=false;}
  }finally{this.roomShareSending=false;}
 }
});
