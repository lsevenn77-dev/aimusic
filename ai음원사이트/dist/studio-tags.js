let songTagFieldSerial=0;
const songTagSuggestionBindings=new WeakMap();
const songTagSuggestionDelay=1200;
const songTagSuggestionTimeout=20000;

function songTagText(value){return String(value??'').trim().replace(/^#+\s*/u,'').replace(/\s+/gu,' ');}
function songTagKey(value){return songTagText(value).normalize('NFKC').toLowerCase();}
function songTagList(value){
 const seen=new Set();
 return String(value??'').split(',').map(songTagText).filter(tag=>{const key=songTagKey(tag);if(!key||seen.has(key))return false;seen.add(key);return true;});
}
function songTagPlainLyrics(value){
 return String(value??'').replace(/\[[^\]\r\n]*\]/gu,'').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/gu,'')
  .split(/\r?\n/u).map(line=>line.replace(/\s+/gu,' ').trim()).filter(Boolean).join('\n');
}
function songTagSuggestionInput(form){
 const title=String(form.querySelector('[name="title"]')?.value||'').replace(/\s+/gu,' ').trim();
 const mode=form.querySelector('#lyrics-mode')?.value;
 let lyrics='';
 if(mode==='auto')lyrics=form.querySelector('#auto-lyrics-source')?.value||'';
 else if(mode==='synced'){
  const editor=form.querySelector('#lyrics-editor'),rows=[...form.querySelectorAll('#lyrics-rows .lyric-text-input')];
  const dirty=typeof lyricEditor!=='undefined'&&lyricEditor?.root===editor&&lyricEditor.dirty;
  lyrics=rows.length&&!dirty?rows.map(row=>row.value).join('\n'):form.querySelector('#lyrics-source')?.value||'';
 }
 return {title,lyrics:songTagPlainLyrics(lyrics)};
}
function songTagInputKey(value){return JSON.stringify([value.title,value.lyrics.replace(/\s+/gu,' ')]);}
function songTagFieldHTML(value=''){
 const id='song-tags-'+(++songTagFieldSerial);
 return `<div class="song-tag-field" data-song-tags>
  <label class="form-field">태그 (쉼표로 구분)<input type="text" name="tags" maxlength="300" value="${esc(value??'')}" placeholder="예: 그리움, 밤, 새로운 시작" aria-describedby="${id}-help ${id}-status"></label>
  <div class="classification-options song-tag-selected" data-song-tag-selected aria-label="선택한 태그" hidden></div>
  <div class="song-tag-recommendations">
   <div class="song-tag-heading"><strong>추천 태그</strong><button type="button" class="small-button song-tag-refresh" data-song-tag-refresh disabled>추천 새로 받기</button></div>
   <p class="field-help" id="${id}-help">제목이나 가사를 입력하면 어울리는 태그를 추천합니다.</p>
   <div class="classification-options song-tag-suggestions" data-song-tag-suggestions aria-label="추천 태그" hidden></div>
   <p class="field-help song-tag-status" id="${id}-status" data-song-tag-status role="status" aria-live="polite"></p>
  </div>
 </div>`;
}
function bindSongTagSuggestions(root=document){
 const fields=[...(root.matches?.('[data-song-tags]')?[root]:[]),...root.querySelectorAll('[data-song-tags]')];
 for(const field of fields){
  if(songTagSuggestionBindings.has(field))continue;
  const form=field.closest('form'),input=field.querySelector('[name="tags"]');
  if(!form||!input)continue;
  const selected=field.querySelector('[data-song-tag-selected]'),suggestions=field.querySelector('[data-song-tag-suggestions]');
  const refresh=field.querySelector('[data-song-tag-refresh]'),status=field.querySelector('[data-song-tag-status]');
  const state={alive:true,serial:0,timer:null,request:null,observer:null,importHandlers:[],key:null,payload:null,tags:[],phase:'empty',message:'',tagMessage:'',tagsDirty:false,composing:false};
  const valid=()=>state.alive&&field.isConnected&&form.contains(field);
  function render(){
   if(!valid())return;
   const tags=songTagList(input.value),keys=new Set(tags.map(songTagKey));
   selected.hidden=!tags.length;
   selected.innerHTML=tags.map(tag=>`<button type="button" class="song-tag-chip is-selected" data-song-tag-remove="${esc(songTagKey(tag))}" aria-label="${esc(tag)} 태그 삭제"><span>${esc(tag)}</span><span class="song-tag-remove" aria-hidden="true">×</span></button>`).join('');
   suggestions.hidden=!state.tags.length;
   suggestions.innerHTML=state.tags.map(tag=>{const added=keys.has(songTagKey(tag));return `<button type="button" class="song-tag-chip${added?' is-added':''}" data-song-tag-add="${esc(tag)}" aria-disabled="${added}" aria-label="${esc(tag)} 태그 ${added?'추가됨':'추가'}"><span>${esc(tag)}</span>${added?'<small>추가됨</small>':''}</button>`;}).join('');
   refresh.disabled=state.phase==='loading'||!state.payload||!(state.payload.title||state.payload.lyrics)||state.composing;
   refresh.textContent=state.phase==='loading'?'추천 중…':'추천 새로 받기';
   field.setAttribute('aria-busy',String(state.phase==='loading'));
   status.textContent=state.tagMessage||state.message;
   status.classList.toggle('is-error',!!state.tagMessage||state.phase==='error');
  }
  function cancelRequest(){
   ++state.serial;
   if(state.request){clearTimeout(state.request.timeout);state.request.controller.abort();state.request=null;}
  }
  function destroy(){
   if(!state.alive)return;
   state.alive=false;clearTimeout(state.timer);cancelRequest();state.observer?.disconnect();
   for(const {target,original,wrapped} of state.importHandlers)if(target.onchange===wrapped)target.onchange=original;
   form.removeEventListener('input',onInput);form.removeEventListener('change',onChange);
   form.removeEventListener('compositionstart',onCompositionStart);form.removeEventListener('compositionend',onCompositionEnd);
   form.removeEventListener('submit',onSubmit,true);form.removeEventListener('reset',onReset);
   field.removeEventListener('click',onClick);songTagSuggestionBindings.delete(field);
  }
  function syncContent(schedule=true){
   if(!valid()){destroy();return false;}
   const payload=songTagSuggestionInput(form),key=songTagInputKey(payload);
   if(key===state.key)return false;
   clearTimeout(state.timer);state.timer=null;cancelRequest();
   state.payload=payload;state.key=key;state.tags=[];state.tagMessage='';
   const hasText=!!(payload.title||payload.lyrics);
   state.phase=hasText?'waiting':'empty';state.message=hasText?'입력을 마치면 추천 태그를 준비합니다.':'';
   render();
   if(hasText&&schedule&&!state.composing)state.timer=setTimeout(requestSuggestions,songTagSuggestionDelay);
   return true;
  }
  async function requestSuggestions(){
   if(!valid()){destroy();return;}
   clearTimeout(state.timer);state.timer=null;
   syncContent(false);
   if(state.composing||!state.payload||!(state.payload.title||state.payload.lyrics)||state.phase==='loading')return;
   cancelRequest();
   const serial=state.serial,key=state.key,payload={...state.payload},controller=new AbortController();
   state.phase='loading';state.tags=[];state.message='제목과 가사에 어울리는 태그를 찾고 있습니다.';state.tagMessage='';render();
   const current=()=>valid()&&state.serial===serial&&!state.composing;
   state.request={controller,timeout:setTimeout(()=>{
    if(!current())return;
    cancelRequest();state.phase='error';state.message='추천을 불러오지 못했습니다. 직접 입력하거나 다시 시도해 주세요.';render();
   },songTagSuggestionTimeout)};
   try{
    const data=await api('/api/studio/tag-suggestions','POST',payload,{signal:controller.signal});
    if(!current()){if(!valid())destroy();return;}
    if(songTagInputKey(songTagSuggestionInput(form))!==key){syncContent();return;}
    if(!data||!Array.isArray(data.tags))throw new Error('Invalid tag suggestions');
    const seen=new Set();
    state.tags=data.tags.filter(tag=>typeof tag==='string').map(songTagText).filter(tag=>{
     const normalized=songTagKey(tag);if(!normalized||tag.length>300||tag.includes(',')||seen.has(normalized))return false;seen.add(normalized);return true;
    }).slice(0,8);
    state.phase='ready';state.message=state.tags.length?'마음에 드는 태그를 눌러 추가하세요.':'어울리는 태그를 찾지 못했습니다. 직접 입력할 수 있습니다.';
   }catch(error){
    if(!current()){if(!valid())destroy();return;}
    state.phase='error';state.message='추천을 불러오지 못했습니다. 직접 입력하거나 다시 시도해 주세요.';
   }finally{
    if(valid()&&state.serial===serial){clearTimeout(state.request?.timeout);state.request=null;render();}
   }
  }
  function commitTags(tags){
   const value=tags.join(', '),max=input.maxLength>0?input.maxLength:300;
   if(value.length>max){state.tagMessage=`태그는 쉼표를 포함해 ${max}자까지 입력할 수 있습니다.`;render();return false;}
   input.value=value;state.tagsDirty=true;state.tagMessage='';
   input.dispatchEvent(new Event('input',{bubbles:true}));render();return true;
  }
  function onClick(event){
   const button=event.target.closest('button');if(!button||!field.contains(button))return;
   if(button.hasAttribute('data-song-tag-refresh')){requestSuggestions();return;}
   if(button.hasAttribute('data-song-tag-remove')){
    commitTags(songTagList(input.value).filter(tag=>songTagKey(tag)!==button.dataset.songTagRemove));input.focus({preventScroll:true});return;
   }
   if(!button.hasAttribute('data-song-tag-add')||state.phase==='loading')return;
   const tag=button.dataset.songTagAdd,tags=songTagList(input.value),key=songTagKey(tag);
   if(!state.tags.some(item=>songTagKey(item)===key)||tags.some(item=>songTagKey(item)===key))return;
   if(commitTags([...tags,tag]))[...suggestions.querySelectorAll('[data-song-tag-add]')].find(item=>songTagKey(item.dataset.songTagAdd)===key)?.focus({preventScroll:true});
  }
  const isSource=target=>target?.matches?.('[name="title"], #lyrics-mode, #auto-lyrics-source, #lyrics-source, .lyric-text-input');
  function onInput(event){
   if(event.target===input){state.tagsDirty=true;state.tagMessage='';render();return;}
   if(!isSource(event.target))return;
   if(event.isComposing||state.composing){clearTimeout(state.timer);state.timer=null;return;}
   syncContent();
  }
  function onChange(event){
   if(event.target===input){if(state.tagsDirty)commitTags(songTagList(input.value));return;}
   if(isSource(event.target))syncContent();
  }
  function onCompositionStart(event){
   if(!isSource(event.target))return;
   state.composing=true;clearTimeout(state.timer);state.timer=null;cancelRequest();state.tags=[];state.phase='waiting';state.message='';render();
  }
  function onCompositionEnd(event){
   if(!isSource(event.target))return;
   state.composing=false;
   if(!syncContent()&&state.payload&&(state.payload.title||state.payload.lyrics)){
    clearTimeout(state.timer);state.timer=setTimeout(requestSuggestions,songTagSuggestionDelay);render();
   }
  }
  function onSubmit(){if(state.tagsDirty)commitTags(songTagList(input.value));}
  function onReset(){setTimeout(()=>{if(valid()){state.tagsDirty=false;state.tagMessage='';state.key=null;syncContent();render();}},0);}
  form.addEventListener('input',onInput);form.addEventListener('change',onChange);
  form.addEventListener('compositionstart',onCompositionStart);form.addEventListener('compositionend',onCompositionEnd);
  form.addEventListener('submit',onSubmit,true);form.addEventListener('reset',onReset);field.addEventListener('click',onClick);
  // File readers assign textarea.value after awaiting arrayBuffer(), without an input event.
  // Preserve their handlers and compare content only after the original import completes.
  for(const selector of ['#auto-lyrics-file','#lyrics-file']){
   const target=form.querySelector(selector),original=target?.onchange;if(typeof original!=='function')continue;
   const wrapped=async function(...args){try{return await original.apply(this,args);}finally{if(valid())syncContent();}};
   target.onchange=wrapped;state.importHandlers.push({target,original,wrapped});
  }
  if(typeof MutationObserver!=='undefined'&&document.documentElement){
   const lyricRoot=form.querySelector('#lyrics-editor');
   state.observer=new MutationObserver(records=>{
    if(!valid()){destroy();return;}
    if(!state.composing&&lyricRoot&&records.some(record=>lyricRoot.contains(record.target)))syncContent();
   });
   state.observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  }
  songTagSuggestionBindings.set(field,state);syncContent();render();
 }
}
