// Room controls share VoiceRoomClient's server snapshots and media graph.
Object.assign(VoiceRoomClient.prototype,{
 bindFinalControls(){
  const form=$('#voice-chat-form'),input=$('#voice-message');
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(input.value.trim())form.requestSubmit();}};
  $('#voice-settings-form').onsubmit=busyForm($('#voice-settings-form'),async()=>{const values=Object.fromEntries(new FormData($('#voice-settings-form')));await this.command('settings',{...values,max_members:Number(values.max_members)});await this.refresh();$('#voice-room-settings').close();});
  const supported=navigator.mediaDevices?.getSupportedConstraints?.()||{};
  for(const [id,key] of [['voice-echo','echoCancellation'],['voice-noise','noiseSuppression']])if(supported[key]===false){$('#'+id).disabled=true;$('#'+id).title='이 브라우저에서 지원하지 않는 설정이에요.';}
  $('#voice-echo').checked=this.preferences.echo;$('#voice-echo').onchange=()=>this.safe(async()=>{this.preferences.echo=$('#voice-echo').checked;await this.stream?.getAudioTracks()[0]?.applyConstraints({echoCancellation:this.preferences.echo});});
  $('#voice-playlist-volume').oninput=()=>{this.preferences.music=Number($('#voice-playlist-volume').value)/100;this.syncPersonalVolume();this.syncMusic();};
  this.host.addEventListener('close',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},true);
  this.host.addEventListener('cancel',e=>{if(e.target.id==='voice-sound')this.stopMicTest();},true);
  this.host.addEventListener('input',e=>{if(e.target.id==='voice-mini-volume'){this.preferences.music=Number(e.target.value)/100;this.syncPersonalVolume();this.syncMusic();}});
  // No room track list is queried until the host submits a search.
  $('#voice-music-results').innerHTML='';
  this.host.addEventListener('input',e=>this.updateDesignField(e.target));
  this.host.addEventListener('change',e=>this.updateDesignField(e.target));
  this.host.addEventListener('click',e=>{if(!e.target.closest('#voice-member-tools,.voice-member-more'))this.closeMemberTools();});
  $('#voice-members').addEventListener?.('scroll',()=>this.closeMemberTools());
  $('#voice-members').addEventListener?.('close',()=>this.closeMemberTools());
  $('#voice-members').addEventListener?.('keydown',e=>{if(e.key==='Escape'&&!$('#voice-member-tools').hidden){e.preventDefault();e.stopPropagation();this.closeMemberTools(true);}});
  $('#voice-music-sheet').addEventListener?.('keydown',e=>{if(e.key==='Escape'){e.preventDefault();$('#voice-music-sheet').close();}});
 },
 updateDesignField(el){
  if(el?.type==='range'){const pct=(Number(el.value)-Number(el.min||0))/(Number(el.max||100)-Number(el.min||0))*100;el.style.setProperty('--range-fill',pct+'%');const output=this.host.querySelector(`[data-value-for="${el.id}"]`);if(output)output.textContent=Math.round(el.value)+'%';}
  if(el?.name==='announcement')$('#voice-notice-length').textContent=el.value.length+'/200';
  if(el?.name==='visibility'){const field=this.host.querySelector('.voice-crew-setting');if(field)field.hidden=$('#voice-settings-form').elements.visibility.value!=='crew';}
 },
 closeMemberTools(focus=false){const id=this.memberTarget,box=$('#voice-member-tools');if(box){box.hidden=true;box.innerHTML='';}this.memberTarget=null;for(const b of this.host.querySelectorAll('.voice-member-more')){b.setAttribute('aria-expanded','false');if(focus&&b.dataset.target===id)b.focus();}},
 paintFinalControls(){
  const s=this.state,self=s.members.find(m=>m.id===s.self),host=self.role==='host',count=s.members.filter(m=>m.seat!==null).length;
  this.host.dataset.background=s.room.background||'navy';
  const announcement=$('#voice-announcement');$('#voice-announcement-text').textContent=s.room.announcement||'';announcement.hidden=!s.room.announcement;
  $('#voice-members-count').innerHTML=`전체 인원수 <strong>${s.members.length}명</strong><i>·</i>좌석 참여 <strong>${count}명</strong>`;
  $('#voice-host-hint').hidden=!host;
  const members=[...s.members].sort((a,b)=>(b.role==='host')-(a.role==='host'));
  const memberHTML=members.map(p=>`<div class="voice-member-row" data-level-user="${esc(p.id)}"><span class="voice-member-avatar">${p.role==='host'?'<span class="voice-member-crown">'+voiceGlyph('crown')+'</span>':''}${avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})}</span><div class="voice-member-info"><strong>${esc(p.name)}${p.role==='host'?'<small>방장</small>':''}</strong><p>${voiceGlyph('wave')}<span data-member-status="${esc(p.id)}">${p.seat===null?'듣고 있는 중':'좌석 참여 중'}</span></p></div>${host?`<button type="button" class="voice-member-more" data-voice="member-menu" data-target="${esc(p.id)}" aria-label="${esc(p.name)} 관리" aria-expanded="false" aria-controls="voice-member-tools">${voiceGlyph('more')}</button>`:''}</div>`).join('');
  const memberKey=memberHTML+JSON.stringify(members.map(p=>[p.id,p.muted,p.locked]));if(memberKey!==this.memberHTML){$('#voice-members-list').innerHTML=memberHTML;this.memberHTML=memberKey;this.closeMemberTools();}
  $('#voice-requests').innerHTML=host?s.members.filter(p=>p.requested).map(p=>`<p>${esc(p.name)} <button class="small-button" data-voice="approve-mic" data-target="${esc(p.id)}">승인</button><button class="small-button" data-voice="reject-mic" data-target="${esc(p.id)}">거절</button></p>`).join(''):'';
  const invitation=s.seat_invites?.[0],el=$('#voice-seat-invitation');el.hidden=!invitation;
  el.innerHTML=invitation?`<p>방장이 좌석에 초대했어요. <button data-voice="seat-accept" data-target="${esc(invitation.id)}">수락</button><button data-voice="seat-reject" data-target="${esc(invitation.id)}">거절</button></p>`:'';
  clearTimeout(this.seatInviteTimer);if(invitation)this.seatInviteTimer=setTimeout(()=>{el.hidden=true;},Math.max(0,invitation.expires-Date.now()-(this.musicClock||0)));
  $('#voice-settings-readonly').hidden=host;for(const el of $('#voice-settings-form').elements)el.disabled=!host;
  if(this.memberTarget&&(!host||!s.members.some(p=>p.id===this.memberTarget)))this.closeMemberTools();
 },
 memberTools(id){
  const s=this.state,self=s.members.find(p=>p.id===s.self),p=s.members.find(p=>p.id===id);
  if(!p||self.role!=='host')return;
  if(this.memberTarget===id){this.closeMemberTools(true);return;}
  this.closeMemberTools();
  this.memberTarget=id;const empty=Array.from({length:7},(_,i)=>i+1).filter(i=>!s.members.some(m=>m.seat===i));
  const own=id===self.id,locked=own?'disabled':'',box=$('#voice-member-tools');
  box.innerHTML=`<section class="voice-member-tools" aria-label="${esc(p.name)} 관리 메뉴">${p.profile_id?`<a href="#producer/${esc(p.profile_id)}">${voiceGlyph('person')}프로필 보기</a>`:''}<button type="button" data-voice="member-invite" ${own||p.seat!==null||!empty.length?'disabled':''}>${voiceGlyph('plus')}자리로 초대</button>${p.seat!==null&&!own?`<label>이동할 빈 좌석<select id="voice-move-seat" ${empty.length?'':'disabled'}>${empty.map(i=>`<option value="${i}">${i+1}번 자리</option>`).join('')}</select></label><button type="button" data-voice="member-move" ${empty.length?'':'disabled'}>${voiceGlyph('share')}자리 이동</button>`:''}<button type="button" data-voice="member-remove" ${own||p.seat===null?'disabled':''}>${voiceGlyph('leave')}자리에서 제거</button><button type="button" data-voice="${p.locked?'unlock':'mute-user'}" data-target="${esc(id)}" ${own||p.seat===null?'disabled':''}>${icon('mic')}${p.locked?'마이크 제한 해제':'마이크 끄기'}</button><button type="button" class="danger" data-voice="ask-kick" data-target="${esc(id)}" ${locked}>${voiceGlyph('ban')}강퇴</button></section>`;
  box.hidden=false;
  const button=[...this.host.querySelectorAll('.voice-member-more')].find(b=>b.dataset.target===id),anchor=button.getBoundingClientRect(),dialog=$('#voice-members').getBoundingClientRect();
  box.style.left=Math.max(dialog.left+10,Math.min(anchor.right-box.offsetWidth,dialog.right-box.offsetWidth-10))+'px';
  box.style.top=Math.max(dialog.top+65,Math.min(anchor.bottom+5,window.innerHeight-box.offsetHeight-12))+'px';
  button.setAttribute('aria-expanded','true');box.querySelector('a,button:not(:disabled)')?.focus();
 },
 openSeatPicker(seat){
  if(this.state.members.find(p=>p.id===this.state.self)?.role!=='host')return;
  this.invitingSeat=seat;this.showSheet('voice-seat-picker');
  $('#voice-seat-candidates').innerHTML=this.state.members.filter(p=>p.seat===null).map(p=>`<button type="button" class="voice-member-row" data-voice="invite-seat-user" data-target="${esc(p.id)}">${avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})}<span>${esc(p.name)}</span></button>`).join('')||'<p class="quiet">현재 청취 중인 참여자가 없어요.</p>';
 },
 async openSettings(){
  const s=this.state.room,form=$('#voice-settings-form');const options=await voiceRequest('options');
  $('#voice-settings-crew').innerHTML='<option value="">크루 선택</option>'+options.crews.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  for(const key of ['title','visibility','max_members','crew_id','background','announcement'])if(form.elements[key])form.elements[key].value=s[key]??({background:'navy',max_members:30,announcement:''}[key]||'');
  this.updateDesignField(form.elements.announcement);this.updateDesignField(form.elements.visibility[0]);
  this.showSheet('voice-room-settings');
 },
 async finalAction(action,target){
  if(action==='member-menu'){this.memberTools(target);return true;}
  if(action==='music-down'){await this.musicCommand('move',{index:Number(target),to:Number(target)+1});return true;}
  if(action==='settings'){await this.openSettings();return true;}
  if(action==='emoji'){this.showSheet('voice-emoji-sheet');return true;}
  if(action==='insert-emoji'){const input=$('#voice-message');input.setRangeText(target,input.selectionStart,input.selectionEnd,'end');$('#voice-emoji-sheet').close();input.focus();return true;}
  if(action==='send-chat'){$('#voice-emoji-sheet').close();$('#voice-chat-form').requestSubmit();return true;}
  if(action==='ask-kick'){this.kickTarget=target;this.showSheet('voice-kick-confirm');return true;}
  if(action==='confirm-kick'){await this.command('moderate',{target_id:this.kickTarget,operation:'kick'});$('#voice-kick-confirm').close();this.closeMemberTools();await this.refresh();return true;}
  if(action==='invite-seat-user'){await this.command('seat-invite',{target_id:target,seat:this.invitingSeat});$('#voice-seat-picker').close();await this.refresh();return true;}
  if(action==='member-invite'){const empty=Array.from({length:7},(_,i)=>i+1).find(i=>!this.state.members.some(m=>m.seat===i));if(empty===undefined)throw Error('빈 좌석이 없어요.');await this.command('seat-invite',{target_id:this.memberTarget,seat:empty});toast('좌석 초대를 보냈어요.');await this.refresh();return true;}
  if(['member-move','member-remove'].includes(action)){await this.command('moderate',{target_id:this.memberTarget,operation:action==='member-move'?'move-seat':'remove-seat',seat:Number($('#voice-move-seat')?.value)});this.closeMemberTools();await this.refresh();return true;}
  if(['seat-accept','seat-reject'].includes(action)){await this.command('seat-answer',{invitation_id:target,accept:action==='seat-accept'});await this.refresh();return true;}
  if(action==='music-repeat'){const current=this.state.music.repeat||'off';await this.musicCommand('repeat',{mode:{off:'all',all:'one',one:'off'}[current]});return true;}
  if(action==='mic-test'){if(this.testGraph)this.stopMicTest();else await this.startMicTest();return true;}
  if(action==='diagnostics-export'){this.diagnostics?.download();return true;}
  return false;
 },
 syncPersonalVolume(){for(const id of ['voice-music-volume','voice-playlist-volume','voice-mini-volume']){const el=$('#'+id);if(el){el.value=this.preferences.music*100;this.updateDesignField(el);}}},
 paintFinalMusic(){
  const m=this.state.music;if(!m)return;const host=this.state.members.find(p=>p.id===this.state.self)?.role==='host',track=m.queue[m.index],hasQueue=!!m.queue.length;
  $('#voice-host-audio').hidden=!host;$('#voice-room-volume').value=m.volume*100;$('#voice-balance').value=m.balance*100;
  $('#voice-sound-current').textContent=track?'현재 곡: '+track.title+' · '+track.artist:'선택된 음악이 없어요.';
  $('#voice-music-search').hidden=!host;$('#voice-music-results').hidden=!host;$('#voice-queue-area').hidden=!hasQueue;$('#voice-playlist-empty').hidden=hasQueue;
  $('#voice-playlist-empty').querySelector('p').textContent=host?'위 검색창에서 노래를 찾아 + 버튼으로 추가해 주세요.':'방장이 추가한 음악을 이곳에서 함께 들을 수 있어요.';
  this.host.querySelector('.voice-music-transport').hidden=!host||!hasQueue;$('#voice-queue-heading').hidden=true;$('#voice-music-seek').max=track?.duration||0;
  $('#voice-queue-count').textContent=m.queue.length+'곡';this.host.querySelector('[data-voice="music-clear"]').hidden=!host;
  const key=JSON.stringify([m.revision,host]);if(key!==this.musicMarkup){this.musicMarkup=key;
   const button=(action,label,content,disabled=false)=>`<button type="button" data-voice="music-${action}" aria-label="${label}" ${disabled?'disabled':''}>${content}</button>`;
   $('#voice-music-player').hidden=false;
   $('#voice-music-player').innerHTML=(track?`<img src="${esc(track.cover)}" alt=""><span><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span>`:'<span><strong>함께 들을 음악을 선택해보세요</strong></span>')+`<div>${host?button('previous','이전 곡',voiceGlyph('previous'),!hasQueue)+button(m.playing?'pause':'play',m.playing?'일시정지':'재생',icon(m.playing?'pause':'play'),!hasQueue)+button('next','다음 곡',voiceGlyph('next'),!hasQueue)+button('repeat','반복',voiceGlyph('repeat'),!hasQueue):''}<label class="voice-mini-volume">${icon('volume')}<input id="voice-mini-volume" type="range" min="0" max="100" value="${this.preferences.music*100}" aria-label="개인 음악 볼륨"></label>${button('picker','플레이리스트',voiceGlyph('playlist'))}</div>`;
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
  else{const raw=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});if(this.closed||attempt!==this.testAttempt){raw.getTracks().forEach(t=>t.stop());return;}this.testRaw=raw;this.testOwned=true;const graph=await VoiceAudio.microphone(raw,this.preferences.preset,this.preferences.input);if(this.closed||attempt!==this.testAttempt){graph.close();raw.getTracks().forEach(t=>t.stop());return;}this.testGraph=graph;if(graph.fallback){this.stopMicTest();throw Error('이 브라우저에서는 입력 레벨 분석을 지원하지 않아요.');}}
  this.startLevels();this.host.querySelector('[data-voice="mic-test"]').textContent='테스트 중지';
  clearTimeout(this.micTestTimer);this.micTestTimer=setTimeout(()=>this.stopMicTest(),30000);
 },
 stopMicTest(){this.testAttempt=(this.testAttempt||0)+1;clearTimeout(this.micTestTimer);if(this.testOwned){this.testGraph?.close();this.testRaw?.getTracks().forEach(t=>t.stop());}this.testRaw=null;this.testGraph=null;this.testOwned=false;const button=this.host?.querySelector('[data-voice="mic-test"]');if(button)button.textContent='테스트 시작';const meter=$('#voice-input-meter');if(meter)meter.value=0;}
});
