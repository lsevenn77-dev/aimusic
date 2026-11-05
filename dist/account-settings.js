// Shared by browser and server. Do not canonicalize prohibited full-width characters.
const NICKNAME_DAYS=30;
const BLOCKED_NICKNAME_PARTS=['운영자','관리자','어드민','공식계정','고객센터','admin','administrator','moderator','aifect','씨발','시발','병신','개새끼','fuck','shit'];
function nicknamePolicy(value){
 const name=typeof value==='string'?value.trim():'';
 if(name.length<2||name.length>8)return {name,error:'닉네임은 2~8자로 입력해주세요.'};
 if(!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]+$/.test(name))return {name,error:'닉네임은 한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.'};
 const key=name.toLowerCase();
 if(BLOCKED_NICKNAME_PARTS.some(word=>key.replaceAll('_','').includes(word)))return {name,error:'운영자 사칭 또는 금지어가 포함된 닉네임은 사용할 수 없습니다.'};
 return {name,key};
}

function accountSettingsHTML(){
 if(!me)return '';return `<section class="surface account-settings"><h2>계정 설정</h2><label class="form-field">이메일 · 확인용<input type="email" value="${esc(me.email?.endsWith('.invalid')?'':me.email||'')}" readonly autocomplete="email" aria-label="이메일 · 확인용"></label><p class="field-help">이메일은 이 화면에서 변경할 수 없어요.</p><form id="account-nickname-form"><label class="form-field">닉네임<input name="name" value="${esc(me.name)}" required maxlength="8" autocomplete="nickname" aria-describedby="nickname-status"></label><div class="inline-actions"><button type="button" class="small-button" data-check-nickname>중복 확인</button><button type="submit" class="primary-button">닉네임 저장</button></div><p class="field-help">2~8자 · 한글, 영문, 숫자, 밑줄(_) · 변경은 30일에 1회</p><p id="nickname-status" class="field-help" role="status"></p><p class="form-error" role="alert"></p></form>${me.provider==='email'?`<details class="account-password"><summary>비밀번호 변경</summary><form id="account-password-form">${formField('현재 비밀번호','current_password','password','','required maxlength="128" autocomplete="current-password"')}${formField('새 비밀번호','new_password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}${formField('새 비밀번호 확인','confirm_password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}<p class="field-help">12자 이상으로 설정해주세요. 변경하면 다른 기기의 로그인은 해제돼요.</p><button type="submit" class="primary-button">비밀번호 저장</button><p class="form-error" role="alert"></p></form></details>`:'<p class="field-help">소셜 로그인 계정의 비밀번호는 Google·카카오·Apple에서 변경해주세요.</p>'}<p><a class="text-link" href="/account/delete">계정 삭제</a></p></section>`;
}
function bindAccountSettings(){
 const nicknameForm=$('#account-nickname-form');if(!nicknameForm)return;
 bindNicknameAvailability(nicknameForm,nicknameForm.elements.name,$('#nickname-status'));
 nicknameForm.querySelector('[data-check-nickname]').onclick=()=>nicknameForm.elements.name.dispatchEvent(new Event('input'));
 nicknameForm.onsubmit=busyForm(nicknameForm,async fd=>{const out=await api('/api/account/nickname','PUT',{name:fd.get('name')});me=out.user;updateAccount();await render();toast('닉네임을 변경했습니다.');});
 const passwordForm=$('#account-password-form');if(passwordForm)passwordForm.onsubmit=busyForm(passwordForm,async fd=>{if(fd.get('new_password')!==fd.get('confirm_password'))throw new Error('새 비밀번호 확인이 일치하지 않습니다.');await api('/api/account/password','PUT',{current_password:fd.get('current_password'),new_password:fd.get('new_password')});passwordForm.reset();passwordForm.closest('details').open=false;toast('비밀번호를 변경했습니다. 다른 기기는 다시 로그인해주세요.');});
}

function bindNicknameAvailability(form,input,status){
 if(!input||input.dataset.nicknameBound)return;input.dataset.nicknameBound='1';
 const original=input.value;let revision=0,timer;
 const submit=form.querySelector('[type=submit],button.primary-button');
 input.addEventListener('input',()=>{const serial=++revision;clearTimeout(timer);input.setCustomValidity('');if(input.value===original&&form.id!=='auth-form'){status.textContent='';if(submit)submit.disabled=false;return;}
  const result=nicknamePolicy(input.value);if(result.error){input.setCustomValidity(result.error);status.textContent=result.error;if(submit)submit.disabled=true;return;}
  status.textContent='확인 중…';if(submit)submit.disabled=true;
  timer=setTimeout(async()=>{try{const out=await api('/api/account/nickname?name='+encodeURIComponent(result.name),'GET',undefined,{fresh:true});if(serial!==revision||!input.isConnected)return;status.textContent=out.message;input.setCustomValidity(out.available?'':out.message);if(submit)submit.disabled=!out.available;}catch(e){if(serial!==revision)return;status.textContent=e.message;if(submit)submit.disabled=true;}},350);
 });
 input.addEventListener('blur',()=>{input.value=input.value.trim();});
}
function bindIdentityInputs(){
 for(const selector of ['#auth-form','#public-profile-form','#producer-form']){const form=document.querySelector(selector);if(!form)continue;const input=form.elements.name;if(!input||input.dataset.nicknameBound)continue;const status=document.createElement('p');status.className='field-help';status.setAttribute('role','status');input.closest('label').after(status);bindNicknameAvailability(form,input,status);}
}
new MutationObserver(bindIdentityInputs).observe(document.body,{childList:true,subtree:true});

document.addEventListener('click',async event=>{const button=event.target.closest('[data-copy-public-id]');if(!button)return;try{await navigator.clipboard.writeText(button.dataset.copyPublicId);toast(button.closest('.mp-own .mp-profile')?'ID가 복사되었습니다.':'고유 ID를 복사했습니다.');}catch{toast('복사할 수 없습니다. ID를 직접 선택해주세요.');}});
