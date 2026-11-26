import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as credits from '../shared/production-credits.js';
import {fixture} from './fixture.mjs';
import {ORIGINAL_UPLOAD_TERMS_VERSION,ORIGINAL_UPLOAD_TERMS_TEXT} from '../shared/site-info.js';

test('missing, explicit no-AI and legacy free text remain distinct',()=>{
 assert.equal(credits.parseProductionCredit('').usage,'unspecified');
 assert.equal(credits.parseProductionCredit(credits.NO_AI_LABEL).usage,'none');
 const known=credits.parseProductionCredit('suno, ChatGPT, My tool');
 assert.deepEqual(known.ids,['suno','chatgpt']);assert.equal(known.other,'My tool');
 const legacy='Suno + 직접 믹싱';
 assert.equal(credits.parseProductionCredit(legacy).other,legacy);
 assert.equal(credits.productionCreditLabel('Suno, ChatGPT'),'Suno · ChatGPT');
 assert.equal(credits.productionCreditLabel(''),'');
 assert.equal(credits.serializeProductionCredit({ids:['suno','chatgpt'],other:'Suno, My tool'}),'Suno, ChatGPT, My tool');
 assert.equal(credits.serializeProductionCredit({ids:['suno'],other:'My tool',none:true}),credits.NO_AI_LABEL);
});

test('server validation accepts explicit no-AI, preserves omitted edits, and rejects contradictory credits',()=>{
 assert.deepEqual(credits.productionCreditFields({ai_tool:credits.NO_AI_LABEL,is_ai:false}),{ai_tool:credits.NO_AI_LABEL,is_ai:0});
 // A legacy client used to hardcode is_ai=true. The creator's explicit field wins.
 assert.equal(credits.productionCreditFields({ai_tool:credits.NO_AI_LABEL,is_ai:true}).is_ai,0);
 assert.deepEqual(credits.productionCreditFields({},{ai_tool:'Unlisted tool + own arrangement',is_ai:1}),{ai_tool:'Unlisted tool + own arrangement',is_ai:1});
 assert.deepEqual(credits.productionCreditFields({},{ai_tool:'',is_ai:1}),{ai_tool:'',is_ai:1});
 for(const body of [{ai_tool:''},{ai_tool:credits.NO_AI_LABEL+', Suno'},{ai_tool:'Suno',is_ai:false},{ai_tool:'x'.repeat(101)}])assert.throws(()=>credits.productionCreditFields(body),error=>error.status===400);
 assert.ok(credits.serializeProductionCredit({ids:credits.AI_TOOLS.map(t=>t.id)}).length<=100);
});

test('non-AI originals upload, publish and change AI credits without becoming covers or losing human roles',async t=>{
 const {call,sql}=await fixture(t);
 const body={title:'직접 만든 음악',producer:'QA',artist_id:'none',genre:'Rock',ai_tool:credits.NO_AI_LABEL,is_ai:false,participation:'작사, 작곡, 보컬',extension:'wav',bytes:128,rights:true,karaoke:true,upload_consent_version:ORIGINAL_UPLOAD_TERMS_VERSION,lyrics_mode:'none',tags:'그리움, 밤'};
 const upload=await call('/api/uploads','POST',body);assert.equal(upload.status,201,JSON.stringify(upload.body));
 const id=upload.body.id,stored=sql.prepare('SELECT ai_tool,is_ai,kind,participation,karaoke_terms FROM tracks WHERE id=?').get(id);
 assert.equal(stored.is_ai,0);assert.equal(stored.kind,'original');assert.equal(stored.ai_tool,credits.NO_AI_LABEL);assert.equal(stored.participation,body.participation);assert.equal(stored.karaoke_terms,ORIGINAL_UPLOAD_TERMS_VERSION);
 assert.ok(!ORIGINAL_UPLOAD_TERMS_TEXT.startsWith('AI로 제작한'));
 sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(id);
 const detail=await call('/api/tracks/'+id);assert.equal(detail.status,200);assert.equal(detail.body.track.ai_tool,credits.NO_AI_LABEL);
 const profile=(await call('/api/studio/tracks/'+id)).body.profile;
 const edited=await call('/api/studio/tracks/'+id,'PUT',{...profile,artist_id:'none',ai_tool:'Suno, ChatGPT',is_ai:true});assert.equal(edited.status,200,JSON.stringify(edited.body));
 assert.equal(sql.prepare('SELECT is_ai FROM tracks WHERE id=?').get(id).is_ai,1);
 const latest=(await call('/api/tracks/'+id)).body.track;assert.equal(latest.ai_tool,'Suno, ChatGPT');assert.equal(latest.participation,body.participation);assert.equal(latest.tags,body.tags);
 const omitted={...profile,title:'제목만 수정'};delete omitted.ai_tool;delete omitted.is_ai;
 assert.equal((await call('/api/studio/tracks/'+id,'PUT',omitted)).status,200);
 assert.equal(sql.prepare('SELECT ai_tool FROM tracks WHERE id=?').get(id).ai_tool,'Suno, ChatGPT');
 assert.equal((await call('/api/studio/tracks/'+id,'PUT',{...profile,ai_tool:credits.NO_AI_LABEL,is_ai:false},'other')).status,404);
 const withoutRights=await call('/api/uploads','POST',{...body,rights:false});assert.equal(withoutRights.status,400);
});

test('credit controls render all choices, preserve unknown strings safely, and leave human-role fields independent',()=>{
 const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const c=vm.createContext({AifectProductionCredits:credits,esc});
 vm.runInContext(readFileSync(new URL('../dist/production-credits.js',import.meta.url),'utf8'),c);
 const html=c.productionCreditsFieldsHTML('Suno, <custom>');
 for(const tool of credits.AI_TOOLS)assert.ok(html.includes('>'+tool.name+'</span>'));
 assert.match(html,/data-ai-tool value="suno"[^>]*checked/);
 assert.match(html,/data-ai-other checked/);assert.match(html,/&lt;custom>/);
 assert.doesNotMatch(html,/name="participation"/);
 const none=c.productionCreditsFieldsHTML(credits.NO_AI_LABEL);assert.match(none,/data-ai-none checked/);assert.doesNotMatch(none,/data-ai-tool[^>]*checked/);
});
