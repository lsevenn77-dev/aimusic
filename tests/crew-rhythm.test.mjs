import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {rhythmRoute} from '../server/crew-rhythm.js';
import {VERSION,RULES,notesFor,replayRhythm} from '../dist/crew-rhythm/core.js';

const monday=Date.parse('2026-11-02T08:00:00+09:00');
function perfect(diff){
  const notes=notesFor(diff),events=notes.flatMap(n=>[[Math.round(n.t*1000),n.lane,1],[Math.round((n.t+n.len)*1000)+1,n.lane,0]])
    .sort((a,b)=>a[0]-b[0]||a[2]-b[2]||a[1]-b[1]);
  return {events,finishAt:Math.ceil((Math.max(...notes.map(n=>n.t+n.len))+1.3)*1000),reason:'clear'};
}
async function setup(t){
  const f=await fixture(t);
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','리듬 크루',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','leader',0)");
  const api=async(action,body,ms=monday,uid='owner')=>{
    const path='/api/crew-rhythm/'+action;
    return (await rhythmRoute(new Request('https://aifect.test'+path,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined}),{DB:f.DB},path,{id:uid},ms)).json();
  };
  return {...f,api};
}
test('server replays all three charts at the existing score caps and validates ordered lane inputs',()=>{
  for(const diff of ['normal','hard','hell']){
    const p=perfect(diff),result=replayRhythm(diff,p.events,p.finishAt,p.reason);
    assert.equal(result.total,RULES.base[diff]*1.1);
    assert.equal(result.counts.perfect,notesFor(diff).length);assert.equal(result.counts.miss,0);
    assert.equal(result.maxCombo,notesFor(diff).length);
  }
  assert.throws(()=>replayRhythm('hard',[[5,4,1]],100,'quit'));
  assert.throws(()=>replayRhythm('hard',[[5,1,1],[4,1,0]],100,'quit'));
  assert.throws(()=>replayRhythm('hard',[],100,'clear'));
  assert.throws(()=>replayRhythm('hard',[],100,'gameover'));
  assert.throws(()=>replayRhythm('nope',[],100,'quit'));
});
test('authenticated official start, verified finish, retry and weekly individual/crew rankings',async t=>{
  const {api,call,sql}=await setup(t);
  assert.equal((await call('/api/crew-rhythm/lobby','GET',null,null)).status,401);
  await assert.rejects(api('lobby',null,monday,'other'));
  const key=crypto.randomUUID(),body={difficulty:'hard',requestId:key};
  const starts=await Promise.all([api('start',body),api('start',body)]);
  assert.equal(starts[0].id,starts[1].id);assert.equal(starts[0].version,VERSION);
  assert.equal((await api('lobby')).remaining,2);
  const p=perfect('hard'),payload={...p,id:starts[0].id,score:999999999};
  await assert.rejects(api('finish',payload,monday+100));
  await assert.rejects(api('finish',payload,monday+70000,'other'));
  const result=await api('finish',payload,monday+70000);
  assert.equal(result.score,1100000);
  assert.equal((await api('finish',{id:starts[0].id},monday+71000)).score,result.score);
  const lobby=await api('lobby',null,monday+71000);
  assert.equal(lobby.individualRanking[0].points,result.score);assert.equal(lobby.ranking[0].points,result.score);
  assert.equal(lobby.bests[0].difficulty,'hard');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM crew_rhythm_runs WHERE status='finished'").get().n,1);
  assert.equal((await api('lobby',null,monday+7*86400000)).ranking.length,0);
});
test('shared daily quota, concurrent starts, abandoned sessions, day rollover and Friday cutoff',async t=>{
  const {api}=await setup(t);
  for(let n=0;n<3;n++){
    const attempts=await Promise.allSettled([0,1].map(()=>api('start',{difficulty:n===0?'normal':'hell',requestId:crypto.randomUUID()},monday+n*1000)));
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
    const started=attempts.find(x=>x.status==='fulfilled').value;
    await api('abandon',{id:started.id});
    await assert.rejects(api('finish',{id:started.id,...perfect('normal')},monday+70000));
  }
  assert.equal((await api('lobby')).remaining,0);
  await assert.rejects(api('start',{difficulty:'hard',requestId:crypto.randomUUID()}));
  assert.equal((await api('lobby',null,monday+86400000)).remaining,3);
  const cutoff=Date.parse('2026-11-06T21:59:00+09:00');
  assert.equal((await api('lobby',null,cutoff)).open,false);
  await assert.rejects(api('start',{difficulty:'hard',requestId:crypto.randomUUID()},cutoff));
});
test('crew rankings take one best per member and only the top ten members',async t=>{
  const {api,sql}=await setup(t);
  for(let n=0;n<11;n++){
    const uid='rank-'+n;
    sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@test.local',uid);
    for(const score of [100+n,50])sql.prepare("INSERT INTO crew_rhythm_runs(id,user_id,crew_id,week,day,request_id,difficulty,version,starts,finished,status,score,max_combo) VALUES(?,?,'crew','2026-11-02','2026-11-02',?,'hard',?,0,1,'finished',?,1)").run(crypto.randomUUID(),uid,crypto.randomUUID(),VERSION,score);
  }
  const lobby=await api('lobby');
  assert.equal(lobby.ranking[0].points,Array.from({length:10},(_,i)=>101+i).reduce((a,b)=>a+b,0));
  assert.equal(lobby.individualRanking.length,11);
});
