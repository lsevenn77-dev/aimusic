import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDubbingPaste,duplicateEditorScene,orderEditorLines} from '../shared/dubbing-editor.js';
import {dubbingOptions,validateDubbingScript} from '../shared/dubbing.js';
import {dubbingEditInput,readDubbingEdit} from '../server/dubbing-edit-ai.js';
import {fixture} from './fixture.mjs';

test('paste preserves unmatched source, speakers, scene order and before/after music anchors',()=>{
 const raw='SCENE 01 — 카페 앞\n[상황]\n늦은 밤\n서준: 안녕.\n[SFX: 문소리]\n지연: 왔구나.\n[BGM: 피아노]\n장면 2 — 길\n알 수 없는 문장\n서준: 가자.';
 const {script:s,notes,raw:original}=parseDubbingPaste(raw);
 assert.equal(original,raw);assert.deepEqual(notes.map(x=>x.text),['알 수 없는 문장']);assert.equal(s.scenes[1].description,notes[0].text);
 assert.equal(s.soundCues[0].lineId,s.lines[1].id);assert.equal(s.soundCues[0].anchor,'before');assert.equal(s.soundCues[1].anchor,'after');
 const cloned=duplicateEditorScene(s,s.scenes[0].id);assert.equal(s.scenes[1].id,cloned);
 s.scenes.reverse();orderEditorLines(s);s.title='동네';const o=dubbingOptions({roleCount:2,minutes:1,genres:['일상'],idea:'',mood:'랜덤',ending:'랜덤'});assert.equal(validateDubbingScript(s,o).lines.length,5);
});
test('editing suggestions preserve target identity and reject changed structure',()=>{
 const edit=dubbingEditInput({mode:'shorter',scene:'카페',lines:[{id:'l1',speaker:'서준',text:'안녕, 오랜만이야.'}]});
 assert.deepEqual(readDubbingEdit({lines:[{id:'l1',text:'오랜만이야.'}]},edit),[{id:'l1',text:'오랜만이야.'}]);
 assert.throws(()=>readDubbingEdit({lines:[{id:'foreign',text:'x'}]},edit));assert.throws(()=>readDubbingEdit({lines:[{id:'l1',text:'x',roleId:'b'}]},edit));
});
function privateStore(){
 const rows=new Map();let version=0;
 return {async get(k){return rows.get(k);},async put(k,body,{onlyIf,customMetadata}){
  const prior=rows.get(k);
  if(onlyIf.has('If-Match')&&onlyIf.get('If-Match')!=='"'+prior?.etag+'"'||onlyIf.has('If-None-Match')&&prior)return null;
  const o={key:k,etag:String(++version),uploaded:new Date(),customMetadata,json:async()=>JSON.parse(body)};rows.set(k,o);return o;
 },async list({prefix}){return {objects:[...rows.values()].filter(x=>x.key.startsWith(prefix)),truncated:false};}};
}
test('partial autosaves stay account-private, survive stale retries, never create projects and close conditionally',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true',BUCKET:privateStore()}),id=crypto.randomUUID(),url='/api/dubbing/editor-drafts/'+id;
 const draft={id,script:{version:1,title:'보존',roles:[],scenes:[],lines:[],soundCues:[]},options:{}};
 assert.equal((await f.call(url,'PUT',{draft,etag:null},null)).status,401);
 const saved=await f.call(url,'PUT',{draft,etag:null});assert.equal(saved.status,200,JSON.stringify(saved.body));
 assert.equal((await f.call(url,'PUT',{draft,etag:null})).status,409);assert.equal((await f.call(url,'GET',undefined,'other')).status,404);
 const next=await f.call(url,'PUT',{draft:{...draft,sourceText:'가'.repeat(18000)},etag:saved.body.etag});assert.equal(next.status,200,JSON.stringify(next.body));
 assert.equal((await f.call(url,'PUT',{closed:true,etag:saved.body.etag})).status,409);
 assert.equal((await f.call('/api/dubbing/editor-drafts')).body.items[0].id,id);
 assert.equal((await f.call(url)).body.draft.sourceText.length,18000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_projects').get().n,0);
 assert.equal((await f.call(url,'PUT',{closed:true,etag:next.body.etag})).status,200);assert.equal((await f.call(url)).status,404);
});
