import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const fd=(kind,consent=false)=>({get:()=>kind,has:key=>key==='duet_consent'&&consent});
function browser(){const c=nicknameContext({window:{},document:{addEventListener(){}},JSON});vm.runInContext(readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),c);return c;}
test('mobile publication keeps its explicit choice, independent of the recorder mode',()=>{
 const c=browser();
 for(const mode of ['solo','duet']){
  const s={mode,duetGuide:{version:1,mode:'free',lines:[]}};
  assert.throws(()=>c.coverPublication(s,fd('')),/공개할 종류/);
  const solo=c.coverPublication(s,fd('solo'));assert.equal(solo.cover_mode,'solo');assert.equal(solo.duet_slot,'');assert.equal(solo.duet_parent_id,null);assert.equal(solo.duet_guide,undefined);assert.equal(solo.duet_consent,false);
  assert.throws(()=>c.coverPublication(s,fd('duet_invitation')),/동의/);
  const invite=c.coverPublication(s,fd('duet_invitation',true));assert.equal(invite.cover_mode,'duet');assert.equal(invite.duet_slot,'first');assert.equal(invite.duet_guide.mode,'free');
  assert.match(c.coverPublicationHTML(s),/<option value="">공개할 종류/);
  assert.doesNotMatch(c.coverPublicationHTML(s),/selected/);
 }
});
test('desktop publication follows the recording and preserves the partner and consent values',()=>{
 const c=browser();c.window.matchMedia=()=>({matches:true});
 const solo=c.coverPublication({mode:'solo'},fd('duet_invitation',true));
 assert.equal(solo.publish_as,'solo');assert.equal(solo.duet_consent,true);assert.equal(solo.duet_slot,'');
 const first={mode:'duet',duetGuide:{version:1,mode:'lyrics',lines:[]}};
 assert.throws(()=>c.coverPublication(first,fd('solo')),/동의/);
 const invite=c.coverPublication(first,fd('solo',true));
 assert.equal(invite.publish_as,'duet_invitation');assert.equal(invite.duet_guide,first.duetGuide);
 const joined=c.coverPublication({mode:'duet',parent:'first-take'},fd('solo'));
 assert.equal(joined.publish_as,'duet_complete');assert.equal(joined.duet_parent_id,'first-take');
 c.window.Capacitor={isNativePlatform:()=>true};
 assert.equal(c.coverPublication(first,fd('solo')).publish_as,'solo');
});
test('a joined performance cannot remove its partner or become a new invitation',()=>{
 const c=browser(),s={mode:'duet',parent:'first-recording'};
 for(const kind of ['solo','duet_invitation'])assert.throws(()=>c.coverPublication(s,fd(kind,true)),/완성 듀엣/);
 const p=c.coverPublication(s,fd('duet_complete'));assert.equal(p.duet_parent_id,'first-recording');assert.equal(p.duet_slot,'second');assert.equal(p.cover_mode,'duet');
 assert.doesNotMatch(c.coverPublicationHTML(s),/<select/);
});
test('file uploads require explicit publication and stop before audio on inconsistent server metadata',async()=>{
 const form={dataset:{original:'one'}},sent=[],files=[];
 const c=nicknameContext({crypto,$:selector=>selector==='#cover-upload-form'?form:null,document:{addEventListener(){}},window:{},validateImage:async()=>{}});
 vm.runInContext(readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8').split('document.addEventListener')[0],c);
 c.uploadStage=()=>{};c.existingUploadSubmitted=async()=>false;c.sendUploadFiles=async(...args)=>files.push(args);
 c.uploadRequest=async(path,method,body)=>{sent.push(body);return {id:'draft',publish_as:body.publish_as,cover_mode:body.cover_mode,duet_parent_id:null};};
 const data=(kind,consent=false)=>({get:key=>({cover_kind:kind,audio:{name:'cover.mp3',size:128,lastModified:1}}[key]),has:key=>key==='duet_consent'?consent:true});
 await assert.rejects(c.uploadCover(data('')),/공개할 종류/);await assert.rejects(c.uploadCover(data('duet')),/동의/);assert.equal(sent.length,0);
 await c.uploadCover(data('solo'));assert.equal(sent[0].cover_mode,'solo');assert.equal(sent[0].publish_as,'solo');assert.equal(files.length,1);
 await c.uploadCover(data('duet',true));assert.equal(sent[1].cover_mode,'duet');assert.equal(sent[1].publish_as,'duet_invitation');assert.equal(files.length,2);
 form._draft=null;c.uploadRequest=async()=>({id:'wrong',cover_mode:'duet',publish_as:'duet_invitation'});
 await assert.rejects(c.uploadCover(data('solo')),/공개 종류가 선택과 달라/);assert.equal(files.length,2);
});
test('server rejects inconsistent confirmed publication before creating rows and persists correct types',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'");
 f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0)");
 const base={original_id:'one',extension:'mp3',bytes:128,own_voice:true,rights:true};
 const before=f.sql.prepare('SELECT count(*) n FROM tracks').get().n;
 for(const bad of [
  {publish_as:'solo',cover_mode:'duet',duet_consent:true},
  {publish_as:'duet_invitation',cover_mode:'solo'},
  {publish_as:'duet_complete',cover_mode:'duet',duet_consent:true},
  {publish_as:'bad',cover_mode:'solo'},{publish_as:null,cover_mode:'solo'}
 ])assert.equal((await f.call('/api/covers','POST',{...base,...bad})).status,400);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,before);
 const solo=await f.call('/api/covers','POST',{...base,publish_as:'solo',cover_mode:'solo',duet_slot:''});assert.equal(solo.status,201);assert.equal(solo.body.publish_as,'solo');
 const invitation=await f.call('/api/covers','POST',{...base,publish_as:'duet_invitation',cover_mode:'duet',duet_slot:'first',duet_consent:true},'other');assert.equal(invitation.status,201);assert.equal(invitation.body.publish_as,'duet_invitation');
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id IN (?,?)").run(solo.body.id,invitation.body.id);
 assert.deepEqual((await f.call('/api/play/works?type=solo')).body.works.map(w=>w.id),[solo.body.id]);
 assert.deepEqual((await f.call('/api/duets')).body.tracks.map(w=>w.id),[invitation.body.id]);
 const completed=await f.call('/api/covers','POST',{...base,publish_as:'duet_complete',cover_mode:'duet',duet_slot:'second',duet_parent_id:invitation.body.id});assert.equal(completed.status,201);assert.equal(completed.body.duet_parent_id,invitation.body.id);
 const rows=f.sql.prepare('SELECT cover_mode,duet_open,duet_parent_id FROM tracks WHERE id IN (?,?,?) ORDER BY id').all(solo.body.id,invitation.body.id,completed.body.id);
 assert(rows.some(r=>r.cover_mode==='solo'&&r.duet_open===0&&r.duet_parent_id===null));assert(rows.some(r=>r.cover_mode==='duet'&&r.duet_open===1&&r.duet_parent_id===null));assert(rows.some(r=>r.cover_mode==='duet'&&r.duet_open===0&&r.duet_parent_id===invitation.body.id));
});
