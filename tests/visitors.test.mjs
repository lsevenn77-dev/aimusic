import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {visitDay} from '../server/visitors.js';
import worker from '../server/index.js';

test('Korean midnight advances the visit day',()=>{
 const midnight=Date.parse('2026-11-24T00:00:00+09:00')/1000;
 assert.equal(visitDay(midnight),visitDay(midnight-1)+1);
});

test('anonymous visits are idempotent, source-first, and visible only in admin totals',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'}),day=visitDay(),token=crypto.randomUUID();
 const send=(ua,source,body={day,token},origin='https://aifect.test')=>worker.fetch(new Request('https://aifect.test/api/visits',{
  method:'POST',headers:{origin,'content-type':'application/json','user-agent':ua,cookie:'aifect_src='+source},body:JSON.stringify(body)
 }),{DB:f.DB});
 const insert=f.sql.prepare('INSERT INTO visitor_days(day,platform,token,source) VALUES(?,?,?,?)');
 insert.run(day-90,'web','expired',null);insert.run(day-1,'web','other','ig');
 await Promise.all([send('Mozilla','yt_s'),send('Mozilla','yt_s')]);
 await send('Mozilla','ig');
 for(const ua of ['AIFECT-Android/2','AIFECT-iOS/1'])assert.equal((await send(ua,'')).status,200);
 assert.equal((await (await send('Mozilla AIFECT-Android/2','ig')).json()).recorded,false);
 assert.equal((await (await send('Mozilla','ig',{day:day-1,token})).json()).recorded,false);
 assert.equal((await send('Mozilla','ig',{day,token:'bad'})).status,400);
 assert.equal((await send('Mozilla','ig',{day,token},'https://other.test')).status,403);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM visitor_days WHERE token IN (?,?)').get(token,'expired').n,0);
 assert.equal((await f.call('/api/admin/dashboard','GET',null,null)).status,401);
 const stats=(await f.call('/api/admin/dashboard')).body.visitors;
 assert.deepEqual(stats.today,{web:1,android:1,ios:1});
 assert.deepEqual(Object.fromEntries(stats.sources.map(s=>[s.src,s.visits])),{app:2,ig:1,yt_s:1});
});
