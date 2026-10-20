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
  $('#voice-music-results').innerHTML='<p class="quiet">곡명이나 아티스트를 검색해 추가해보세요.</p>';
 },
 paintFinalControls(){
  const s=this.state,self=s.members.find(m=>m.id===s.self),host=self.role==='host',count=s.members.filter(m=>m.seat!==null).length;
  this.host.dataset.background=s.room.background||'navy';
  const announcement=$('#voice-announcement');announcement.textContent=s.room.announcement?'방 공지 · '+s.room.announcement:'';announcement.hidden=!s.room.announcement;
  $('#voice-members-count').textContent=`전체 인원 ${s.members.length}명 · 좌석 참여 ${count}명`;
  const members=[...s.members].sort((a,b)=>(b.role==='host')-(a.role==='host'));
  $('#voice-members-list').innerHTML=members.map(p=>`<button type="button" class="voice-member-row" data-voice-person="${esc(p.id)}" data-level-user="${esc(p.id)}">${p.role==='host'?'<span class="voice-member-crown">'+voiceGlyph('crown')+'</span>':''}${avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})}<span><strong>${esc(p.name)} ${p.role==='host'?'<small>방장</small>':''}</strong><small>${p.seat===null?'청취 중':p.muted?'착석·음소거':'발언 중'}</small></span></button>`).join('');
  $('#voice-requests').innerHTML=host?s.members.filter(p=>p.requested).map(p=>`<p>${esc(p.name)} <button class="small-button" data-voice="approve-mic" data-target="${esc(p.id)}">승인</button><button class="small-button" data-voice="reject-mic" data-target="${esc(p.id)}">거절</button></p>`).join(''):'';
  const invitation=s.seat_invites?.[0],el=$('#voice-seat-invitation');el.hidden=!invitation;
  el.innerHTML=invitation?`<p>방장이 좌석에 초대했어요. <button data-voice="seat-accept" data-target="${esc(invitation.id)}">수락</button><button data-voice="seat-reject" data-target="${esc(invitation.id)}">거절</button></p>`:'';
  clearTimeout(this.seatInviteTimer);if(invitation)this.seatInviteTimer=setTimeout(()=>{el.hidden=true;},Math.max(0,invitation.expires-Date.now()-(this.musicClock||0)));
  $('#voice-settings-readonly').hidden=host;for(const el of $('#voice-settings-form').elements)el.disabled=!host;
  if(this.memberTarget&&!s.members.some(p=>p.id===this.memberTarget)){$('#voice-member-tools').innerHTML='';this.memberTarget=null;}
 },
 memberTools(id){
  const s=this.state,self=s.members.find(p=>p.id===s.self),p=s.members.find(p=>p.id===id);
  if(!p)return;
  if(self.role!=='host'||p.id===self.id){if(p.profile_id){$('#voice-member-tools').innerHTML=`<a class="small-button" href="#producer/${esc(p.profile_id)}">${esc(p.name)} 프로필 보기</a>`;}return;}
  this.memberTarget=id;const empty=Array.from({length:7},(_,i)=>i+1).filter(i=>!s.members.some(m=>m.seat===i));
  $('#voice-member-tools').innerHTML=`<section class="voice-member-tools"><h3>${esc(p.name)}</h3>${p.profile_id?`<a href="#producer/${esc(p.profile_id)}" class="small-button">프로필 보기</a>`:''}${p.seat===null?`<button class="small-button" data-voice="member-invite" ${empty.length?'':'disabled'}>자리로 초대</button>`:`<label>이동할 빈 좌석<select id="voice-move-seat">${empty.map(i=>`<option value="${i}">${i+1}번 자리</option>`).join('')}</select></label><button class="small-button" data-voice="member-move" ${empty.length?'':'disabled'}>자리 이동</button><button class="small-button" data-voice="member-remove">자리에서 제거</button><button class="small-button" data-voice="${p.locked?'unlock':'mute-user'}" data-target="${esc(id)}">${p.locked?'마이크 제한 해제':'마이크 끄기'}</button>`}<button class="small-button" data-voice="ask-kick" data-target="${esc(id)}">강퇴</button></section>`;
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
  this.showSheet('voice-room-settings');
 },
 async finalAction(action,target){
  if(action==='settings'){await this.openSettings();return true;}
  if(action==='emoji'){this.showSheet('voice-emoji-sheet');return true;}
  if(action==='insert-emoji'){const input=$('#voice-message');input.setRangeText(target,input.selectionStart,input.selectionEnd,'end');$('#voice-emoji-sheet').close();input.focus();return true;}
  if(action==='send-chat'){$('#voice-emoji-sheet').close();$('#voice-chat-form').requestSubmit();return true;}
  if(action==='ask-kick'){this.kickTarget=target;this.showSheet('voice-kick-confirm');return true;}
  if(action==='confirm-kick'){await this.command('moderate',{target_id:this.kickTarget,operation:'kick'});$('#voice-kick-confirm').close();$('#voice-member-tools').innerHTML='';await this.refresh();return true;}
  if(action==='invite-seat-user'){await this.command('seat-invite',{target_id:target,seat:this.invitingSeat});$('#voice-seat-picker').close();await this.refresh();return true;}
  if(action==='member-invite'){const empty=Array.from({length:7},(_,i)=>i+1).find(i=>!this.state.members.some(m=>m.seat===i));if(empty===undefined)throw Error('빈 좌석이 없어요.');await this.command('seat-invite',{target_id:this.memberTarget,seat:empty});toast('좌석 초대를 보냈어요.');await this.refresh();return true;}
  if(['member-move','member-remove'].includes(action)){await this.command('moderate',{target_id:this.memberTarget,operation:action==='member-move'?'move-seat':'remove-seat',seat:Number($('#voice-move-seat')?.value)});$('#voice-member-tools').innerHTML='';await this.refresh();return true;}
  if(['seat-accept','seat-reject'].includes(action)){await this.command('seat-answer',{invitation_id:target,accept:action==='seat-accept'});await this.refresh();return true;}
  if(action==='music-repeat'){const current=this.state.music.repeat||'off';await this.musicCommand('repeat',{mode:{off:'all',all:'one',one:'off'}[current]});return true;}
  if(action==='mic-test'){if(this.testGraph)this.stopMicTest();else await this.startMicTest();return true;}
  if(action==='diagnostics-export'){this.diagnostics?.download();return true;}
  return false;
 },
 syncPersonalVolume(){for(const id of ['voice-music-volume','voice-playlist-volume','voice-mini-volume']){const el=$('#'+id);if(el)el.value=this.preferences.music*100;}},
 paintFinalMusic(){
  const m=this.state.music;if(!m)return;const host=this.state.members.find(p=>p.id===this.state.self)?.role==='host',track=m.queue[m.index];
  $('#voice-host-audio').hidden=!host;$('#voice-room-volume').value=m.volume*100;$('#voice-balance').value=m.balance*100;
  $('#voice-sound-current').textContent=track?'현재 곡: '+track.title+' · '+track.artist:'선택된 음악이 없어요.';
  $('#voice-music-search').hidden=!host;$('#voice-music-results').hidden=!host;this.host.querySelector('.voice-music-transport').hidden=!host||!m.queue.length;$('#voice-queue-heading').hidden=!m.queue.length;$('#voice-music-seek').max=track?.duration||0;
  for(const b of this.host.querySelectorAll('[data-voice="music-repeat"]')){b.textContent='반복 '+({off:'끔',all:'전체',one:'한 곡'}[m.repeat||'off']);b.setAttribute('aria-pressed',String(m.repeat&&m.repeat!=='off'));}
  const key=JSON.stringify([m.revision,host]);if(key===this.musicMarkup)return;this.musicMarkup=key;
  const button=(action,label,content)=>`<button type="button" data-voice="music-${action}" aria-label="${label}">${content}</button>`;
  const repeat={off:'↻',all:'↻',one:'↻¹'}[m.repeat||'off'];
  $('#voice-music-player').hidden=false;
  $('#voice-music-player').innerHTML=(track?`<img src="${esc(track.cover)}" alt=""><span><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span>`:'<span><strong>함께 들을 음악을 선택해보세요</strong></span>')+`<div>${host?button('previous','이전 곡','‹')+button(m.playing?'pause':'play',m.playing?'일시정지':'재생',icon(m.playing?'pause':'play'))+button('next','다음 곡','›')+button('repeat','반복 '+(m.repeat||'off'),repeat):''}<input id="voice-mini-volume" type="range" min="0" max="100" value="${this.preferences.music*100}" aria-label="개인 음악 볼륨">${button('picker','플레이리스트',voiceGlyph('playlist'))}</div>`;
  $('#voice-music-queue').innerHTML=m.queue.map((t,i)=>`<article class="voice-queue-row ${i===m.index?'is-current':''}"><img src="${esc(t.cover)}" alt=""><span><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span>${host?`<button data-voice="music-up" data-target="${i}" aria-label="위로 이동" ${i===0?'disabled':''}>↑</button><button data-voice="music-remove" data-target="${i}" aria-label="곡 삭제">×</button>`:''}</article>`).join('')||'<p class="quiet">추가한 곡이 없어요.</p>';
 },
 async startMicTest(){
  const attempt=this.testAttempt=(this.testAttempt||0)+1;if(this.processing){this.testGraph=this.processing;this.testOwned=false;}
  else{const raw=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});if(this.closed||attempt!==this.testAttempt){raw.getTracks().forEach(t=>t.stop());return;}this.testRaw=raw;this.testOwned=true;const graph=await VoiceAudio.microphone(raw,this.preferences.preset,this.preferences.input);if(this.closed||attempt!==this.testAttempt){graph.close();raw.getTracks().forEach(t=>t.stop());return;}this.testGraph=graph;if(graph.fallback){this.stopMicTest();throw Error('이 브라우저에서는 입력 레벨 분석을 지원하지 않아요.');}}
  this.startLevels();this.host.querySelector('[data-voice="mic-test"]').textContent='테스트 중지';
  clearTimeout(this.micTestTimer);this.micTestTimer=setTimeout(()=>this.stopMicTest(),30000);
 },
 stopMicTest(){this.testAttempt=(this.testAttempt||0)+1;clearTimeout(this.micTestTimer);if(this.testOwned){this.testGraph?.close();this.testRaw?.getTracks().forEach(t=>t.stop());}this.testRaw=null;this.testGraph=null;this.testOwned=false;const button=this.host?.querySelector('[data-voice="mic-test"]');if(button)button.textContent='테스트 시작';const meter=$('#voice-input-meter');if(meter)meter.value=0;}
});
