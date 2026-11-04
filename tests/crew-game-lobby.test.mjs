import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {rankingsMarkup} from '../dist/crew-game-lobby.js';
import {fishingRoute} from '../server/crew-fishing.js';
import {rhythmRoute} from '../server/crew-rhythm.js';
import {racingRoute} from '../server/crew-racing.js';
import {raceCalendar} from '../dist/crew-racing/catalog.js';
import {season} from '../dist/crew-fishing/rules.js';

test('leaderboards escape public names, use public profile media and keep own rank beyond the top 100',()=>{
  const html=rankingsMarkup({crewId:'crew',crews:[{crew_id:'crew',name:'<script>team</script>',image_version:9,place:1,points:1234}],
    players:[{name:'<img onerror="oops">',profile_id:'profile/id',image_version:7,place:1,points:2345},
      {name:'outside',profile_id:'mine',image_version:1,place:101,points:0,mine:1}]});
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img onerror='));assert.ok(!html.includes('<img onerror='));
  assert.ok(html.includes('/media/crew/crew?v=9'));assert.ok(html.includes('/media/producer/profile%2Fid?v=7'));
  assert.ok(html.includes('우리 크루 1위 · 1,234점'));assert.ok(html.includes('내 순위 101위 · 0점'));
  assert.ok(!html.includes('>outside<'));assert.ok(html.includes('TOP 100'));
  const fishing=rankingsMarkup({unit:'원',crewId:'crew',crews:[{id:'crew',place:1,score:1234}],players:[{mine:1,place:1,score:1234}]});
  assert.ok(fishing.includes('우리 크루 1위 · 1,234원'));assert.ok(fishing.includes('내 순위 1위 · 1,234원'));
  assert.ok(!fishing.includes('1,234점'));
});

test('all three game lobbies return actual avatar metadata without changing their scoring',async t=>{
  const f=await fixture(t),ms=Date.parse('2026-11-04T10:00:00+09:00'),{day,week}=season(ms);
  f.sql.exec("UPDATE producers SET image_version=7 WHERE id='producer'; INSERT INTO crews(id,owner_id,name,created,image_version) VALUES('crew','owner','게임 크루',0,9); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','leader',0)");
  f.sql.prepare("INSERT INTO crew_fishing_casts(id,user_id,crew_id,nickname,request_id,day,week,fish,grade,length,amount,start_ms,cycle_ms,goal,target,width,status) VALUES('fish-run','owner','crew','QA','fish-request-key',?,?,'stripe-perch','B',207984,300,0,3200,3,20,30,'caught')").run(day,week);
  f.sql.prepare("INSERT INTO crew_rhythm_runs(id,user_id,crew_id,week,day,request_id,difficulty,version,starts,finished,status,score,max_combo) VALUES('rhythm-run','owner','crew',?,?,'rhythm-request-key','hard','test',0,1,'finished',821925,44)").run(week,day);
  const race=raceCalendar(ms);
  f.sql.prepare("INSERT INTO crew_racing_runs(id,user_id,crew_id,week,course,starts,score) VALUES('race-run','owner','crew',?,?,0,543200)").run(race.week,race.course);
  for(const [route,path,points] of [[fishingRoute,'/api/crew-fishing/lobby',300],[rhythmRoute,'/api/crew-rhythm/lobby',821925],[racingRoute,'/api/crew-racing/lobby',543200]]){
    const data=await (await route(new Request('https://aifect.test'+path),{DB:f.DB},path,{id:'owner'},ms)).json();
    const person=(data.individualRanking||data.individual)[0],team=(data.ranking||data.crews)[0];
    assert.equal(person.profile_id,'producer');assert.equal(Number(person.image_version),7);assert.equal(person.mine,1);
    assert.equal(team.crew_id,'crew');assert.equal(Number(team.image_version),9);
    assert.equal(person.points??person.score,points);assert.equal(team.points??team.score,points);
    assert.equal(data.crew,'crew');
  }
});
