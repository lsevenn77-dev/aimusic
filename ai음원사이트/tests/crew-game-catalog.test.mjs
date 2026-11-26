import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {crewGameCatalog} from '../server/crew-game-catalog.js';
import {fixture} from './fixture.mjs';
import {DECORATIONS,frameDisplayAssets} from '../shared/decorations.js';
import {PLAYER_ITEMS} from '../shared/player.js';
const at=Date.parse('2026-11-05T09:00:00+09:00');
test('test catalog has all four; an explicit operator selection replaces it, including empty',async()=>{
 assert.deepEqual((await crewGameCatalog({},'team',at)).games.map(g=>g.id),['rhythm','jump','racing','fishing']);
 assert.deepEqual((await crewGameCatalog({CREW_GAME_VISIBLE_IDS:'fishing,fishing,invalid'},'team',at)).games.map(g=>g.id),['fishing']);
 assert.equal((await crewGameCatalog({CREW_GAME_VISIBLE_IDS:''},'team',at)).games.length,0);
});
test('one game rotates at Monday midnight KST, with the end time supplied to clients',async()=>{
 const env={CREW_GAME_MENU_MODE:'weekly'};
 const before=await crewGameCatalog(env,'team',Date.parse('2026-11-08T23:59:59+09:00'));
 const after=await crewGameCatalog(env,'team',Date.parse('2026-11-09T00:00:00+09:00'));
 assert.equal(before.games[0].id,'rhythm');assert.equal(after.games[0].id,'jump');
 assert.equal(before.ends_at,Date.parse('2026-11-09T00:00:00+09:00')/1000);
 assert.equal((await crewGameCatalog(env,'team',Date.parse('2026-11-30T00:00:00+09:00'))).games[0].id,'rhythm');
 for(const anchor of ['garbage','2026-11-03','2026-02-30'])assert.equal((await crewGameCatalog({...env,CREW_GAME_ROTATION_ANCHOR:anchor},'team',at)).games.length,0);
});
test('crew detail, refresh endpoint and web render share the exact single selection; nonmembers cannot read it',async t=>{
 t.mock.timers.enable({apis:['Date'],now:at});
 const f=await fixture(t,{CREW_GAME_VISIBLE_IDS:'racing'});
 const created=await f.call('/api/crews','POST',{name:'Catalog Crew'});assert.equal(created.status,201);
 const cid=created.body.crew.id,menu=(await f.call('/api/crews/'+cid+'/games')).body;
 assert.deepEqual(menu.games,created.body.membership.game_catalog.games);
 assert.equal(menu.games.length,1);assert.equal(menu.games[0].id,'racing');
 assert.equal((await f.call('/api/crews/'+cid+'/games','GET',null,'other')).status,403);
 assert.equal((await f.call('/api/crews/'+cid+'/games','GET',null,null)).status,401);
 const context=nicknameContext({esc:String,icon:()=>'',number:String,catalog:menu,at});
 vm.runInContext(readFileSync(new URL('../dist/social-layouts.js',import.meta.url),'utf8'),context);
 const html=vm.runInContext('crewGameMenuHTML(catalog,at)',context);
 assert.equal((html.match(/class="crew-game-entry"/g)||[]).length,1);
 assert.match(html,/터보레이스/);assert.ok(html.includes(menu.games[0].href));
 assert.match(html,/crew_weekly_turbo_race\.webp/);assert.doesNotMatch(html,/비트콤보|점프러시|월척헌터/);
});
test('the app and web share one pick across crews, from KST Monday until Saturday',async()=>{
 const ctx=nicknameContext({esc:String});
 vm.runInContext(readFileSync(new URL('../dist/social-layouts.js',import.meta.url),'utf8'),ctx);
 const monday=Date.parse('2026-11-09T00:00:00+09:00'),saturday=monday+5*86400000;
 for(const [when,expected] of [[monday-1,null],[monday,'racing'],[saturday-1,'racing'],[saturday,null],[monday+7*86400000-1,null]]){
  for(const crew of ['a','b']){
   const menu=await crewGameCatalog({},crew,when);
   assert.equal(menu.active_game_id,expected);
   const html=ctx.crewGameMenuHTML(menu,when);
   if(expected){assert.match(html,/터보레이스/);assert.equal(menu.week_start,'2026-11-09');assert.ok(html.includes('crew='+crew));}
   else assert.equal(html,'');
  }
 }
 const friday=await crewGameCatalog({},'a',saturday-1);
 assert.equal(ctx.crewGameMenuHTML(friday,saturday),'');
 const empty=await crewGameCatalog({CREW_GAME_VISIBLE_IDS:''},'a',monday);
 assert.match(ctx.crewGameMenuHTML(empty,monday),/준비 중/);
 for(const id of ['jump','rhythm','racing','fishing']){
  const menu=await crewGameCatalog({CREW_GAME_VISIBLE_IDS:id},'team',monday);
  assert.equal(menu.active_game_id,id);
  const [game]=menu.games;
  const html=ctx.crewGameMenuHTML(menu,monday);
  assert.ok(html.includes(game.href));
  assert.ok(html.includes('aria-label="이번 주 크루 경쟁 게임: '+game.banner_title+'. 플레이"'));
  assert.doesNotMatch(html,/테스트 중/);
  const art=readFileSync(new URL('../dist'+game.banner_art,import.meta.url));assert.equal(art.toString('ascii',8,12),'WEBP');
 }
});
test('all registered frames have equipment metadata; future normalized artwork remains server-driven',()=>{
 for(const p of Object.values(DECORATIONS).filter(p=>p.kind==='PROFILE_FRAME')){
  assert.equal(PLAYER_ITEMS[p.sku].artwork,p.assetPaths.overlay);
  assert.deepEqual(PLAYER_ITEMS[p.sku].display,frameDisplayAssets(p.assetPaths.overlay,p.assetPaths.effect));
 }
 assert.deepEqual(frameDisplayAssets('/assets/new/next.png','/assets/new/next-fx.webp'),{overlay:'/assets/new/next.png',effect:'/assets/new/next-fx.webp',scale:1.5});
});
