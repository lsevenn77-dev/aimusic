(()=>{
 const host=document.querySelector('#cover-compression-content');if(!host)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function load(){
  host.innerHTML='<h1>커버 파일 압축</h1><p role="status">불러오는 중…</p>';
  try{
   const r=await fetch('/api/admin/cover-compression',{credentials:'same-origin'}),d=await r.json();if(!r.ok)throw new Error(d.error);
   host.innerHTML=`<h1>커버 파일 압축</h1><p>기존 커버의 WAV·FLAC 원본만 MP3 256kbps로 변환합니다. 재생 길이·음질 설정·저장 검증 후 원본 파일을 영구 삭제합니다. 원곡·댓글·선물·기존 재생 파일은 유지합니다.</p><form id="cover-compression-form" class="admin-card"><h2>대상 ${d.targets.length}개</h2>${d.targets.map(t=>`<label class="management-card cover-source-option"><input type="checkbox" name="target" value="${esc(t.id)}"> ${esc(t.title)} · ${esc(t.original_ext.toUpperCase())} · ${(t.original_bytes/1048576).toFixed(2)}MB</label>`).join('')||'<p>압축할 기존 WAV·FLAC 커버가 없습니다.</p>'}<label class="cover-source-option"><input name="confirmed" type="checkbox" required> 선택한 커버를 변환·검증한 뒤 원본 파일을 영구 삭제합니다.</label><button class="primary-button" ${d.targets.length?'':'disabled'}>선택한 커버 변환 예약</button></form><p data-cover-status role="status"></p><button class="small-button" data-cover-refresh>상태 새로고침</button><h2>처리 기록</h2>${d.jobs.map(j=>`<article class="management-card"><strong>${esc(j.track_id)}</strong><p>${esc(j.state)} · ${(j.source_bytes/1048576).toFixed(2)}MB → ${(j.output_bytes/1048576).toFixed(2)}MB · ${esc(j.error)}</p></article>`).join('')||'<p>처리 기록이 없습니다.</p>'}`;
   host.querySelector('[data-cover-refresh]').onclick=load;
   host.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{const ids=[...f.querySelectorAll('[name="target"]:checked')].map(n=>n.value);if(!ids.length)throw new Error('대상을 선택해주세요.');const r=await fetch('/api/admin/cover-compression',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({ids,confirmed:f.elements.confirmed.checked})}),d=await r.json();if(!r.ok)throw new Error(d.error);await load();host.querySelector('[data-cover-status]').textContent='변환을 예약했어요. 검증 실패 시 원본을 유지합니다.';}catch(err){host.querySelector('[data-cover-status]').textContent=err.message;b.disabled=false;}};
  }catch(e){host.innerHTML='<h1>커버 파일 압축</h1><p role="alert">'+esc(e.message)+'</p>';}
 }
 document.addEventListener('aifect-admin-cover-compression',load);
})();
