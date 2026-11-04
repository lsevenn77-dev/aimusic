import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {nicknamePolicy} from '../shared/nickname-policy.js';
import {botNicknameStatus} from '../server/nicknames.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const mapping=JSON.parse(read('server/data/bot-display-names.json')).items;
const migration=read('drizzle/0094_bot_display_nicknames.sql');
function addBot(f,n,name,source='fixture:'+n){
 const uid='ai_'+String(n).padStart(6,'0');
 f.sql.prepare("INSERT INTO users(id,email,name,provider,account_type,created) VALUES(?,?,?,'ai_service','ai_bot',0)").run(uid,uid+'@service.invalid',name);
 f.sql.prepare("INSERT INTO ai_bots(user_id,source_key,image_sha,style,emoji,created,updated) VALUES(?,?,?,'warm','',0,0)").run(uid,source,String(n).padStart(64,'0'));
 f.sql.prepare('INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES(?,?,?,0,1)').run(uid,uid,name);
 return uid;
}
const edit=(f,uid,name)=>f.call('/api/admin/ai-bots/accounts/'+uid,'PATCH',{name,style:'warm',emoji:'',daily_limit:3,active:true});
test('335 authored bot names meet the shared policy, retain 12 originals and use verified gender metadata',()=>{
 assert.equal(mapping.length,335);assert.equal(new Set(mapping.map(i=>i.source_key)).size,335);
 assert.equal(new Set(mapping.map(i=>i.name.toLowerCase())).size,335);
 assert.equal(mapping.filter(i=>i.keep_original).length,12);
 assert.equal(mapping.filter(i=>i.gender==='unknown').length,1);
 assert.equal(mapping.find(i=>i.gender==='unknown').name,'책갈피한장');
 for(const i of mapping){assert.equal(nicknamePolicy(i.name).error,undefined,i.name);if(i.keep_original)assert.equal(i.name,i.original_name);assert.ok(['male','female','unknown'].includes(i.gender));}
 for(const re of [/^[가-힣]+$/,/^[a-z]+$/,/\d/,/_/])assert.ok(mapping.some(i=>re.test(i.name)));
 const catalog=JSON.parse(read('dist/assets/ai-bot-import/catalog.json')).items;
 for(const item of catalog)assert.equal(item.name,mapping.find(i=>i.source_key===item.source_key)?.name);
});
test('humans and bots can share a display name; each namespace rejects case-insensitive duplicates atomically',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'}),a=addBot(f,1,'Shared88'),b=addBot(f,2,'OtherBot');
 assert.equal((await edit(f,a,'Shared88')).status,200);
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'shared88'})).status,200);
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'SHARED88'},'other')).status,409);
 assert.equal((await edit(f,b,'SHARED88')).status,409);
 assert.equal(f.sql.prepare('SELECT name FROM users WHERE id=?').get(b).name,'OtherBot');
 assert.deepEqual(f.sql.prepare('SELECT normalized FROM account_handles ORDER BY normalized').all().map(r=>r.normalized),['ai:shared88','shared88']);
 assert.equal((await edit(f,b,'ninechars')).status,400);
 assert.equal((await edit(f,b,'bad name')).status,400);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_audit WHERE action='account_edit'").get().n,1);
 const claims=await Promise.all([a,b].map(uid=>edit(f,uid,'NewName8')));
 assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM account_handles WHERE normalized='ai:newname8'").get().n,1);
});
test('rename migration audits original names and handles while preserving humans, comments and stable identities',async t=>{
 const f=await fixture(t),items=mapping.slice(0,4);
 for(let i=0;i<items.length;i++){const uid=addBot(f,i+1,items[i].original_name,items[i].source_key);f.sql.prepare('INSERT INTO account_handles VALUES(?,?)').run(uid,items[i].original_name.toLowerCase());f.sql.prepare("INSERT INTO comments(id,track_id,user_id,body,created) VALUES(?,'one',?,'기존 댓글 유지',0)").run('old'+i,uid);}
 f.sql.exec("INSERT INTO account_handles VALUES('owner','qa')");
 const humans=f.sql.prepare("SELECT * FROM users WHERE account_type='human' ORDER BY id").all();
 const preserved=['comments','tracks','ai_bots','public_member_ids','public_profile_ids','follows','gifts'];
 const before=Object.fromEntries(preserved.map(n=>[n,f.sql.prepare('SELECT * FROM '+n+' ORDER BY rowid').all()]));
 f.sql.exec(migration);
 for(let i=0;i<items.length;i++){const uid='ai_'+String(i+1).padStart(6,'0'),item=items[i];assert.equal(f.sql.prepare('SELECT name FROM users WHERE id=?').get(uid).name,item.name);assert.equal(f.sql.prepare('SELECT name FROM producers WHERE user_id=?').get(uid).name,item.name);assert.equal(f.sql.prepare('SELECT normalized FROM account_handles WHERE user_id=?').get(uid).normalized,'ai:'+item.name.toLowerCase());const audit=JSON.parse(f.sql.prepare('SELECT details FROM ai_bot_audit WHERE id=?').get('bot-names:20261104:'+uid).details);assert.equal(audit.old_user_name,item.original_name);assert.equal(audit.old_handle,item.original_name.toLowerCase());}
 assert.deepEqual(f.sql.prepare("SELECT * FROM users WHERE account_type='human' ORDER BY id").all(),humans);assert.equal(f.sql.prepare("SELECT normalized FROM account_handles WHERE user_id='owner'").get().normalized,'qa');
 for(const n of preserved)assert.deepEqual(f.sql.prepare('SELECT * FROM '+n+' ORDER BY rowid').all(),before[n],n);
 const audit=f.sql.prepare('SELECT * FROM ai_bot_audit ORDER BY id').all();f.sql.exec(migration);assert.deepEqual(f.sql.prepare('SELECT * FROM ai_bot_audit ORDER BY id').all(),audit);assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 const status=await botNicknameStatus({DB:f.DB});assert.equal(status.total,4);assert.equal(status.audited,4);for(const k of ['invalid','duplicates','handle_mismatches','profile_mismatches'])assert.equal(status[k],0,k);
});
test('AI badge is limited to full profile; signup and profile editors enforce eight characters',()=>{
 assert.match(read('dist/mypage.js'),/ai-account-badge/);
 for(const file of ['profile-preview','music-ui','dubbing-community','dubbing-casting','views','admin-ai-bots'])assert.doesNotMatch(read('dist/'+file+'.js'),/ai-account-badge/,file);
 for(const file of ['views','profile-editor','account-settings','admin-ai-bots'])assert.match(read('dist/'+file+'.js'),/maxlength="8"/,file);
});
