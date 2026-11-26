import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';

const repair=readFileSync(new URL('../drizzle/0076_repair_confirmed_solo_covers.sql',import.meta.url),'utf8');
const owner='8ee92b09-75cb-41f2-b14d-0212a893bed1',producer='ff6a2f36-5277-4a99-b00d-9586543580d0';
const targets=[
 ['e8ce3d21-43f4-4eee-bf8c-e6187b417d7d','d4c239cc-d765-4ca3-a62e-97283a7c9e8b','별일 아닌 것처럼'],
 ['40d9c296-8098-4f3a-a4d5-344a3621d60f','2b4a4bce-a7e9-4f80-b688-d49b551c0cef','비행운']
];
async function setup(t){
 const f=await fixture(t);
 f.sql.prepare("INSERT INTO users(id,email,name,created) VALUES(?,'repair@example.test','Test creator',0)").run(owner);
 f.sql.prepare("INSERT INTO producers(id,user_id,name,created) VALUES(?,?,'Test creator',0)").run(producer,owner);
 for(const [id,original,title] of targets){
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,karaoke_at) VALUES(?,'owner','artist','producer',?,'Pop','QA',1,'mp3',1234,1,'published',1)").run(original,title);
  f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES(?,?,'ready',1,'ready',0,0)").run(original,'karaoke:'+original);
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,original_key,duration,created,status,kind,original_id,cover_mode,duet_part,duet_open,duet_guide) VALUES(?,?,'artist',?,?,'Pop','',1,'mp3',123456,'existing/audio.mp3',178.9,2,'published','cover',?,'duet','male',1,?)").run(id,owner,producer,title,original,'{"version":1,"mode":"free","lines":[]}');
 }
 f.sql.exec("UPDATE ai_bot_settings SET json=json_set(json,'$.enabled',json('true'),'$.comments',1,'$.gifts',json('true'),'$.kinds',json('[\"solo\",\"duet\"]')) WHERE id=1");
 return f;
}

test('confirmed solo covers enter discovery and leave duet invitations without losing audio, engagement or rewards',async t=>{
 const f=await setup(t),[first]=targets;
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner',?,0)").run(first[0]);
 const rows=()=>f.sql.prepare('SELECT * FROM tracks ORDER BY id').all().map(r=>({...r}));
 const before=rows(),xp=f.sql.prepare('SELECT * FROM player_xp ORDER BY user_id,source_key').all();
 assert.equal((await f.call('/api/play/works')).body.works.length,0);
 assert.equal((await f.call('/api/duets')).body.tracks.length,2);
 f.sql.exec(repair);
 const works=(await f.call('/api/play/works?tab=latest')).body.works;
 assert.deepEqual(works.map(w=>w.id).sort(),targets.map(x=>x[0]).sort());
 assert(works.every(w=>w.type==='solo'&&w.cover_mode==='solo'&&w.duet_open===0));
 assert.equal((await f.call('/api/duets')).body.tracks.length,0);
 for(const [id,original] of targets){
  assert.deepEqual((await f.call('/api/tracks/'+original+'/covers?mode=solo')).body.covers.map(c=>c.id),[id]);
 }
 assert.deepEqual(rows(),before.map(r=>targets.some(x=>x[0]===r.id)?{...r,cover_mode:'solo',duet_open:0,duet_part:'',duet_guide:''}:r));
 assert.deepEqual(f.sql.prepare('SELECT * FROM player_xp ORDER BY user_id,source_key').all(),xp);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM likes').get().n,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs').get().n,0,'metadata correction cannot enqueue automatic comments or gifts');
 const audit=f.sql.prepare("SELECT * FROM admin_audit WHERE action='cover_mode_correction'").all();
 assert.equal(audit.length,2);
 for(const row of audit){const change=JSON.parse(row.target);assert.equal(change.before.cover_mode,'duet');assert.equal(change.after.cover_mode,'solo');assert.equal(change.before.duet_open,1);assert(change.before.duet_guide);}
 f.sql.exec(repair);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='cover_mode_correction'").get().n,2,'replaying the migration must not duplicate changes or audit');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='repair_0076_solo_audit'").get().n,0);
});

test('a real duet child or different creator prevents correction of the target',async t=>{
 const f=await setup(t);
 f.sql.prepare("UPDATE tracks SET duet_parent_id=?,kind='cover',cover_mode='duet',original_id=? WHERE id='two'").run(targets[0][0],targets[0][1]);
 f.sql.prepare("UPDATE tracks SET user_id='other' WHERE id=?").run(targets[1][0]);
 f.sql.exec(repair);
 for(const [id] of targets)assert.equal(f.sql.prepare('SELECT cover_mode FROM tracks WHERE id=?').get(id).cover_mode,'duet');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='cover_mode_correction'").get().n,0);
});

test('an audit conflict rolls back classification instead of changing a cover without an audit',async t=>{
 const f=await setup(t);
 f.sql.prepare("INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,'test','conflict','{}',0)").run('repair-0076:'+targets[0][0]);
 assert.throws(()=>f.sql.exec(repair),/UNIQUE constraint/);
 for(const [id] of targets)assert.equal(f.sql.prepare('SELECT cover_mode FROM tracks WHERE id=?').get(id).cover_mode,'duet');
});

test('genuine publication and duet completion still enqueue the configured official support',async t=>{
 const f=await setup(t);
 f.sql.prepare('UPDATE tracks SET duet_open=0 WHERE id=?').run(targets[0][0]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs WHERE target_id=?').get(targets[0][0]).n,2);
 f.sql.prepare("UPDATE tracks SET status='processing',cover_mode='solo',duet_open=0 WHERE id=?").run(targets[1][0]);
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(targets[1][0]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs WHERE target_id=?').get(targets[1][0]).n,2);
});
