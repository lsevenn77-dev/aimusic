import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8').split('function bindForms(')[0];
function harness(){
 const mainError={textContent:'',scrollIntoView(){}},hiddenError={textContent:''},status={textContent:''},bar={removeAttribute(){delete this.value;}},panel={hidden:true,dataset:{},querySelector:s=>s==='p'?status:bar};
 const button={innerHTML:'음원 업로드',disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};
 const form={querySelector(s){if(s===':scope > .form-error')return mainError;if(s==='.form-error')return hiddenError;if(s==='.upload-progress')return panel;if(s.startsWith('button'))return button;},addEventListener(){}};
 const context=vm.createContext({FormData:class{},window:{addEventListener(){},removeEventListener(){}},toast(){},setTimeout});vm.runInContext(code,context);
 return {context,form,button,mainError,hiddenError,status,panel};
}
test('upload feedback is immediate, prevents double submits and exposes errors outside hidden lyrics editor',async()=>{
 const h=harness();let reject,calls=0;const pending=new Promise((_,r)=>reject=r),submit=h.context.busyForm(h.form,()=>{calls++;return pending;});
 const event={preventDefault(){},submitter:h.button};const work=submit(event);assert.equal(h.button.disabled,true);assert.equal(h.panel.hidden,false);assert.match(h.status.textContent,/확인/);
 await submit(event);assert.equal(calls,1);reject(Error('가사 입력을 확인해주세요.'));await work;
 assert.equal(h.mainError.textContent,'가사 입력을 확인해주세요.');assert.equal(h.hiddenError.textContent,'');assert.equal(h.panel.dataset.state,'error');assert.equal(h.button.disabled,false);assert.equal(h.button.innerHTML,'음원 업로드');
 let retry=0;await h.context.busyForm(h.form,async()=>{retry++;})(event);assert.equal(retry,1);
});
test('an actual submit button is disabled instead of a nested lyric-result button',async()=>{
 const h=harness();let finish;const work=h.context.busyForm(h.form,()=>new Promise(r=>finish=r))({preventDefault(){}});assert.equal(h.button.disabled,true);finish();await work;assert.equal(h.button.disabled,false);
});
