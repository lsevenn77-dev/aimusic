import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';

const views=readFileSync(new URL('../dist/views.js',import.meta.url),'utf8');
const renderer=views.slice(views.indexOf('function songCommentRowHTML('),views.indexOf('function songCredits('));
assert.ok(renderer.includes('function commentsHTML('),'commentsHTML renderer exists');

const comment=(id,extras={})=>({
 id,track_id:'one',user_id:'comment-author',parent_id:null,name:'Commenter',
 body:'Hello',created:1762100000,edited:0,deleted_at:0,creator:false,
 likes:2,liked:false,can_report:true,can_delete:false,timestamp:null,
 ...extras
});

function render(comments,memberId){
 const ctx=nicknameContext({
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
 assert.match(html,/data-icon="corner-down-right"/);
 assert.match(html,/data-comment-thread="root"/);
 assert.match(html,/data-reply-author="Commenter" aria-expanded="false"/);
 assert.equal((html.match(/data-reply="root"/g)||[]).length,2);
 assert.doesNotMatch(html,/data-delete-comment/,'unrelated viewer has no delete action');
});

test('comments show newest threads first and oldest replies first within each thread',()=>{
 const html=render([
  comment('older-root',{created:10}),
  comment('newer-reply',{created:50,parent_id:'newer-root',likes:10,timestamp:5}),
  comment('older-reply',{created:30,parent_id:'newer-root'}),
  comment('newer-root',{created:20}),
  comment('older-root-reply',{created:60,parent_id:'older-root'})
 ],'viewer');
 assert.deepEqual([...html.matchAll(/data-comment-id="([^"]+)"/g)].map(([,id])=>id),
  ['newer-root','older-reply','newer-reply','older-root','older-root-reply']);
 assert.match(html,/data-seek="5"/);
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
test('the song header counts only rows rendered in the comment list',()=>{
 const comments=[comment('root'),comment('bot',{account_type:'ai_bot'}),comment('reply',{parent_id:'root'}),comment('hidden',{deleted_at:1}),comment('orphan',{parent_id:'hidden'})];
 const ctx=nicknameContext({comments});
 vm.runInContext(renderer,ctx);
 const displayed=render(comments,'viewer');
 assert.equal(vm.runInContext('songVisibleCommentCount(comments)',ctx),3);
 assert.equal((displayed.match(/data-comment-card/g)||[]).length,3);
});

test('inline reply retries return the same row and count and preserve parent and notification policy',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO comments(id,track_id,user_id,body,created) VALUES('parent','one','owner','부모 댓글',1),('elsewhere','two','owner','다른 곡',1)");
 const reply={parent_id:'parent',body:' 답글 내용 ',request_id:crypto.randomUUID()};
 const send=(data=reply,user='other')=>f.call('/api/tracks/one/comments','POST',data,user);
 assert.equal((await send(reply,null)).status,401);
 assert.equal((await send({...reply,body:'   '})).status,400);
 assert.equal((await send({...reply,parent_id:'elsewhere'})).status,400);
 const [first,retry]=await Promise.all([send(),send()]);
 assert.equal(first.status,201);assert.equal(retry.status,201);
 assert.equal(first.body.id,retry.body.id);
 assert.equal(first.body.reply.parent_id,'parent');
 assert.equal(first.body.reply.body,'답글 내용');
 assert.equal(first.body.reply.can_delete,true);assert.equal(first.body.reply.can_report,false);
 assert.equal(first.body.comment_count,2);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM comments WHERE parent_id='parent'").get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM push_outbox WHERE kind='comment' AND recipient='owner'").get().n,1);
 assert.equal((await send({...reply,parent_id:first.body.id})).status,400);
 const legacy=await f.call('/api/tracks/two/comments','POST',{parent_id:'elsewhere',body:'이전 클라이언트'},'other');
 assert.equal(legacy.status,201);assert.deepEqual(Object.keys(legacy.body),['id']);
});

test('moving a touch cancels the timer even if the browser later fires contextmenu',()=>{
 const source=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8');
 const start=source.indexOf('(function installCommentLongPressActions()'),end=source.indexOf('})();',start);
 const listeners={},timers=new Map(),card={isConnected:true},body={closest:selector=>selector==='[data-comment-card]'?card:null};
 let next=0;
 const ctx=nicknameContext({document:{addEventListener:(type,fn)=>{listeners[type]=fn;}},
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
