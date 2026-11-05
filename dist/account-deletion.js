(() => {
 const form=document.getElementById('delete-account');
 if(!form)return;
 const input=form.elements.confirmation, button=document.getElementById('delete-submit'), status=document.getElementById('delete-status');
 let pending=false;
 function update(){button.disabled=pending||input.value!=='DELETE';}
 input.addEventListener('input',update);
 async function submit(event){
  event.preventDefault();
  if(pending||input.value!=='DELETE'||!form.reportValidity())return;
  pending=true;update();status.textContent='계정 삭제를 처리하고 있습니다.';
  try{
   const response=await fetch('/api/account/delete',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:input.value,account_id:form.dataset.account})});
   const result=await response.json();
   if(!response.ok||result.deleted!==true)throw new Error(result.error||'삭제 결과를 확인할 수 없습니다. 다시 로그인해 계정 상태를 확인해 주세요.');
   const done=document.createElement('p');done.setAttribute('role','status');done.tabIndex=-1;done.textContent='계정을 삭제했습니다.';
   form.replaceWith(done);done.focus();
  }catch(e){status.textContent=e instanceof TypeError?'연결을 확인한 뒤 계정 상태를 다시 확인해 주세요.':e.message;}
  finally{pending=false;update();}
 }
 form.addEventListener('submit',submit);
 window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 update();
})();
