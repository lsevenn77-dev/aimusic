import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const views=readFileSync(new URL('../dist/views.js',import.meta.url),'utf8');
const renderer=views.match(/function commentsHTML\(comments,t\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(renderer,'commentsHTML renderer exists');

const comment=(id,extras={})=>({
 id,track_id:'one',user_id:'comment-author',parent_id:null,name:'Commenter',
 body:'Hello',created:1762100000,edited:0,deleted_at:0,creator:false,
 likes:2,liked:false,can_report:true,can_delete:false,timestamp:null,
 ...extras
});

function render(comments,memberId){
 const ctx=vm.createContext({
  comments,me:memberId?{id:memberId}:null,track:{id:'one'},
  esc:value=>String(value??''),icon:name=>'<svg data-icon="'+name+'"></svg>',
  avatarImage:()=>'<span class="avatar"></span>',time:()=> '00:00'
 });
 vm.runInContext(renderer,ctx);
 return vm.runInContext('commentsHTML(comments,track)',ctx);
}

test('comment rows expose like and reply controls, including replies to a reply',()=>{
 const html=render([comment('root'),comment('child',{parent_id:'root',body:'Nested'})],'viewer');
 assert.match(html,/data-comment-card/);
 assert.match(html,/class="inline-actions song-comment-actions comment-actions-row"/);
 assert.match(html,/aria-label="\uB2F5\uAE00"/);
 assert.match(html,/data-icon="message"/);
 assert.equal((html.match(/data-reply="root"/g)||[]).length,2);
 assert.doesNotMatch(html,/data-delete-comment/,'unrelated viewer has no delete action');
});

test('author can edit/delete and post owner can delete without edit',()=>{
 const own=render([comment('own',{user_id:'writer',can_delete:true})],'writer');
 assert.match(own,/data-edit-comment="own"/);
 assert.match(own,/data-delete-comment="own"/);
 const postOwner=render([comment('foreign',{user_id:'writer',can_delete:true})],'post-owner');
 assert.match(postOwner,/data-delete-comment="foreign"/);
 assert.doesNotMatch(postOwner,/data-edit-comment=/);
});

test('guest does not receive delete, edit or report controls',()=>{
 const html=render([comment('foreign',{can_delete:false,can_report:false})],null);
 assert.doesNotMatch(html,/data-(?:delete|edit|report)-comment/);
});

test('moving a touch cancels the timer even if the browser later fires contextmenu',()=>{
 const source=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8');
 const start=source.indexOf('(function installCommentLongPressActions()'),end=source.indexOf('})();',start);
 const listeners={},timers=new Map(),card={isConnected:true},body={closest:selector=>selector==='[data-comment-card]'?card:null};
 let next=0;
 const ctx=vm.createContext({document:{addEventListener:(type,fn)=>{listeners[type]=fn;}},
  window:{matchMedia:()=>({matches:true})},setTimeout:(fn,ms)=>{assert.equal(ms,520);timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source.slice(start,end+5),ctx);
 const touch={target:body,isPrimary:true,pointerType:'touch',button:0,pointerId:1,clientX:30,clientY:30};
 for(const type of ['pointermove','scroll','pointercancel','pointerup']){
  listeners.pointerdown(touch);assert.equal(timers.size,1);
  listeners[type]({...touch,clientY:50});assert.equal(timers.size,0);
 }
 let suppressed=false;listeners.contextmenu({target:body,preventDefault:()=>{suppressed=true;}});
 assert.equal(suppressed,true);assert.equal(timers.size,0);
});
