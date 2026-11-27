function productionCreditsFieldsHTML(value='',upload=false){
 const credit=AifectProductionCredits.parseProductionCredit(value),none=credit.usage==='none',hasOther=!!credit.other;
 return `<fieldset class="production-ai-field" data-production-ai><legend>사용한 AI 도구 (복수 선택)${upload?uploadRequiredMark:''}</legend>
 <p class="field-help" id="production-ai-scope">음원·가사에 사용한 도구만 선택해 주세요. 커버 이미지와 태그 추천은 제외합니다.</p>
 <input type="hidden" name="ai_tool" value="${esc(value||'')}">
 <div class="production-ai-options classification-options">${AifectProductionCredits.AI_TOOLS.map(({id,name})=>`<label><input type="checkbox" data-ai-tool value="${id}" aria-describedby="production-ai-scope production-ai-error" ${credit.ids.includes(id)?'checked':''}><span>${name}</span></label>`).join('')}<label><input type="checkbox" data-ai-other ${hasOther?'checked':''} aria-controls="production-ai-other-field"><span>기타</span></label><label class="production-ai-none"><input type="checkbox" data-ai-none ${none?'checked':''}><span>AI 사용 안 함</span></label></div>
 <label id="production-ai-other-field" class="form-field production-ai-other" ${hasOther?'':'hidden'}><span>기타 AI 도구${upload?uploadRequiredMark:''}</span><input type="text" data-ai-other-text value="${esc(credit.other)}" maxlength="100" placeholder="도구 이름을 쉼표로 구분해 주세요" ${hasOther?'':'disabled'} aria-describedby="production-ai-error"></label>
 <p class="form-error production-ai-error" id="production-ai-error" data-ai-error role="status" aria-live="polite"></p></fieldset>`;
}
function bindProductionCredits(root=document){
 root.querySelectorAll('[data-production-ai]').forEach(host=>{
  if(host.dataset.bound)return;host.dataset.bound='true';
  const saved=host.querySelector('[name="ai_tool"]'),tools=[...host.querySelectorAll('[data-ai-tool]')],other=host.querySelector('[data-ai-other]'),none=host.querySelector('[data-ai-none]'),otherField=host.querySelector('.production-ai-other'),input=host.querySelector('[data-ai-other-text]'),error=host.querySelector('[data-ai-error]'),proxy=tools[0];
  const sync=(write=true,show=false)=>{
   otherField.hidden=!other.checked;input.disabled=!other.checked;input.required=other.checked;
   const value=write?AifectProductionCredits.serializeProductionCredit({ids:tools.filter(t=>t.checked).map(t=>t.value),other:other.checked?input.value:'',none:none.checked}):saved.value;
   if(write)saved.value=value;
   const missingOther=other.checked&&!AifectProductionCredits.serializeProductionCredit({other:input.value});
   let message='';
   if(!none.checked&&!tools.some(t=>t.checked)&&!other.checked)message='사용한 AI 도구 또는 AI 사용 안 함을 선택해 주세요.';
   else if(missingOther)message='기타 AI 도구 이름을 입력해 주세요.';
   else if(value.length>AifectProductionCredits.AI_TOOL_LIMIT)message='AI 도구 이름은 합계 100자 이내로 입력해 주세요.';
   else if(!none.checked&&value.split(',').some(v=>v.trim()===AifectProductionCredits.NO_AI_LABEL))message='AI를 사용하지 않았다면 AI 사용 안 함을 선택해 주세요.';
   proxy.setCustomValidity(missingOther?'':message);input.setCustomValidity(missingOther?'기타 AI 도구 이름을 입력해 주세요.':'');
   if(!message||show||error.textContent)error.textContent=message;
   return message;
  };
  host.addEventListener('change',event=>{
   const target=event.target;
   if(target===none&&none.checked){tools.forEach(t=>t.checked=false);other.checked=false;}
   else if((tools.includes(target)||target===other)&&target.checked)none.checked=false;
   sync(true,true);if(target===other&&other.checked)input.focus();
  });
  input.addEventListener('input',()=>sync(true,true));
  proxy.addEventListener('invalid',()=>{error.textContent=proxy.validationMessage;});
  host.closest('form')?.addEventListener('reset',()=>queueMicrotask(()=>sync(true)));
  sync(false);
 });
}
function productionCreditPayload(fd){
 try{const credit=AifectProductionCredits.productionCreditFields({ai_tool:fd.get('ai_tool')});return {...credit,is_ai:credit.is_ai===1};}
 catch(error){throw Object.assign(error,{field:'[data-production-ai] input[type="checkbox"]'});}
}
