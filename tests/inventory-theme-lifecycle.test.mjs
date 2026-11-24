import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';
import {commitRoomTheme,selectRoomEntitlement} from '../server/room-theme-application.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const sku='theme_christmas';
const uuid=()=>crypto.randomUUID();
const records=(f,table)=>f.sql.prepare('SELECT * FROM '+table).all();
async function buy(f){const r=await f.buy(sku);assert.equal(r.status,201);return r.body.order.inventory_id;}
function create(f,inventory_id,extra={}){return f.call('/api/voice/rooms','POST',{request_id:uuid(),title:'테마 이용권 검증',theme_sku:sku,inventory_id,activate_theme:true,...extra});}

test('migration links legacy ownership without changing dates or manufacturing missing activation history',()=>{
 const db=new DatabaseSync(':memory:'),dir=new URL('../drizzle/',import.meta.url),migration='0106_careless_mephistopheles.sql';
 try{
  for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<migration).sort())db.exec(readFileSync(new URL(file,dir),'utf8'));
  db.exec("INSERT INTO users(id,email,name,created) VALUES('legacy','legacy@test','Legacy',0); INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at) VALUES('old-active','legacy','theme_christmas','decoration','theme_christmas',10,100),('missing-date','legacy','theme_aurora_night','decoration','theme_aurora_night',0,0); INSERT INTO room_decorations(room_id,host_id,sku,revision,updated) VALUES('old-room','legacy','theme_christmas',3,20)");
  const before=db.prepare('SELECT * FROM player_inventory ORDER BY id').all();db.exec(readFileSync(new URL(migration,dir),'utf8'));
  assert.deepEqual(db.prepare('SELECT * FROM player_inventory ORDER BY id').all(),before);
  assert.equal(db.prepare('SELECT inventory_id FROM room_decorations').get().inventory_id,'old-active');
  assert.equal(db.prepare('SELECT count(*) n FROM decoration_redemptions').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM room_theme_applications').get().n,0);
 }finally{db.close();}
});

for(const mode of ['talk','karaoke'])test(mode+': options/preview/cancel do not start stock; confirmed creation commits exactly one rental',async t=>{
 const f=await decorationsFixture(t,{voice:true}),stock=await buy(f),untouched=records(f,'player_inventory');
 const options=(await f.call('/api/voice/options?mode='+mode)).body;
 const choice=options.themes.find(x=>x.inventory_id===stock);assert.equal(choice.status,'UNUSED');assert.equal(choice.expires_at,0);
 assert.equal(options.themes.filter(x=>!x.paid).length,2);assert.equal(options.preferred_theme,'basic_dark');
 assert.deepEqual(records(f,'player_inventory'),untouched);assert.equal(records(f,'decoration_redemptions').length,0);
 assert.equal((await create(f,stock,{mode,activate_theme:false})).status,409);assert.deepEqual(records(f,'player_inventory'),untouched);
 const request_id=uuid(),results=await Promise.all([create(f,stock,{mode,request_id}),create(f,stock,{mode,request_id})]);
 assert.ok(results.every(r=>r.status===201),JSON.stringify(results));assert.equal(records(f,'decoration_redemptions').length,1);
 const [r]=records(f,'decoration_redemptions');assert.equal(r.expires_at-r.created,7*86400);
 const room=results[0].body.room;assert.equal(room.theme.sku,sku);assert.equal(room.mode,mode);
 assert.equal(room.theme.inventory_id,r.active_inventory_id);
 const settings=(await f.call('/api/voice/options?mode='+mode+'&room_id='+request_id)).body;
 assert.equal(settings.current_theme.inventory_id,r.active_inventory_id,'settings resolves the exact paid right even when audio snapshots carry the free base');
 // The signed transport receives a free base, independent of product catalog versions.
 assert.equal(f.rooms.get(request_id).data.config.theme_sku,'basic_dark');
 const inventory=(await f.call('/api/me/player')).body;assert.equal(inventory.stored_decorations.length,0);assert.equal(inventory.decorations[0].status,'ACTIVE');assert.equal(inventory.decorations[0].applied,true);
 const retry=await create(f,stock,{mode,request_id,title:'다른 요청'});assert.equal(retry.status,201);assert.equal(retry.body.room.title,'테마 이용권 검증');assert.equal(f.sql.prepare('SELECT count(*) n FROM decoration_redemptions').get().n,1);
});

test('failed create, invalid settings, and network failure preserve stock and clocks',async t=>{
 const f=await decorationsFixture(t,{voice:true}),stock=await buy(f),before=records(f,'player_inventory');
 assert.equal((await create(f,stock,{max_members:1})).status,400);
 assert.deepEqual(records(f,'player_inventory'),before);assert.equal(records(f,'decoration_redemptions').length,0);
 const created=await f.call('/api/voice/rooms','POST',{request_id:uuid(),title:'기본 방'}),room=created.body.room.id;
 assert.equal((await f.call('/api/voice/rooms/'+room+'/settings','POST',{request_id:uuid(),theme_sku:sku,inventory_id:stock,activate_theme:true,revision:0,max_members:1})).status,400);
 assert.deepEqual(records(f,'player_inventory'),before);
 const original=globalThis.fetch;t.mock.method(globalThis,'fetch',async(url,init)=>{if(String(url).includes('voice-fixture.test'))throw Error('fixture network failure');return original(url,init);});
 assert.equal((await create(f,stock)).status,500);assert.deepEqual(records(f,'player_inventory'),before);
});

test('D1 application failure rolls activation back after voice succeeds; retry recovers without extending',async t=>{
 const f=await decorationsFixture(t,{voice:true}),stock=await buy(f),before=records(f,'player_inventory'),request_id=uuid();
 f.sql.exec("CREATE TRIGGER qa_apply_failure BEFORE INSERT ON room_decorations BEGIN SELECT RAISE(ABORT,'qa_apply_failed'); END");
 assert.equal((await create(f,stock,{request_id})).status,500);assert.deepEqual(records(f,'player_inventory'),before);assert.equal(records(f,'decoration_redemptions').length,0);assert.equal(records(f,'room_theme_applications').length,0);
 assert.equal((await f.call('/api/voice/rooms/'+request_id+'/theme')).body.theme.sku,'basic_dark');
 f.sql.exec('DROP TRIGGER qa_apply_failure');assert.equal((await create(f,stock,{request_id})).status,201);
 const after=records(f,'decoration_redemptions');assert.equal((await create(f,stock,{request_id})).status,201);assert.deepEqual(records(f,'decoration_redemptions'),after);
});

test('same SKU rights remain independent; expiry never consumes or equips a different right',async t=>{
 const f=await decorationsFixture(t,{voice:true}),one=await buy(f),two=await buy(f),three=await buy(f);
 const room=(await create(f,one)).body.room,active=room.theme.inventory_id;
 const settings={request_id:uuid(),theme_sku:sku,inventory_id:two,activate_theme:true,revision:0};
 const saved=await f.call('/api/voice/rooms/'+room.id+'/settings','POST',settings);assert.equal(saved.status,200,JSON.stringify(saved.body));
 const second=saved.body.room.theme.inventory_id;assert.notEqual(active,second);
 const rentals=records(f,'decoration_redemptions');assert.equal(rentals.length,2);assert.ok(rentals.every(r=>r.expires_at-r.created===7*86400));
 assert.equal((await f.call('/api/voice/rooms/'+room.id+'/settings','POST',settings)).status,200);assert.deepEqual(records(f,'decoration_redemptions'),rentals);
 f.sql.prepare('UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE id=?').run(second);
 assert.equal((await f.call('/api/voice/rooms/'+room.id+'/theme')).body.theme.sku,'basic_dark');
 const inventory=(await f.call('/api/me/player')).body;assert.equal(inventory.decorations.some(i=>i.id===second),false);assert.equal(inventory.stored_decorations.find(i=>i.id===three).status,'UNUSED');
 assert.equal((await f.call('/api/voice/public-rooms','GET',null,null)).body.rooms.find(r=>r.id===room.id).theme.sku,'basic_dark');
 assert.equal((await create(f,second)).status,403);assert.equal(records(f,'decoration_redemptions').length,2);
 assert.equal(f.rooms.get(room.id).data.config.closed,false);
});

test('active theme switching preserves expiry, room ID and participants, with no activation confirmation',async t=>{
 const f=await decorationsFixture(t,{voice:true}),stock=await buy(f),created=await create(f,stock),room=created.body.room;
 const root='/api/voice/rooms/'+room.id+'/';
 const joined=await f.call(root+'join','POST',{request_id:uuid()}),guest=await f.call(root+'join','POST',{request_id:uuid()},'other');assert.equal(guest.status,200);
 const before=records(f,'decoration_redemptions');
 const free=await f.call(root+'settings','POST',{request_id:uuid(),background:'basic_light',revision:0,generation:joined.body.generation});assert.equal(free.status,200);
 const paid=await f.call(root+'settings','POST',{request_id:uuid(),theme_sku:sku,inventory_id:room.theme.inventory_id,revision:1,generation:joined.body.generation});assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(paid.body.room.id,room.id);
 assert.equal(paid.body.members.length,2);assert.deepEqual(records(f,'decoration_redemptions'),before);
 assert.equal((await f.call(root+'state','GET',null,'other')).body.room.theme.sku,sku);
});

test('stale revision and refunded funds abort the entire D1 activation/application batch',async t=>{
 const f=await decorationsFixture(t,{voice:true}),stock=await buy(f),env={DB:f.DB};
 const choice=await selectRoomEntitlement(env,'owner',sku,stock,true);
 f.sql.exec("INSERT INTO room_decorations(room_id,host_id,sku,revision,updated) VALUES('stale','owner','basic_dark',2,0)");
 const metadata={key:uuid(),action:'settings',fingerprint:'test'};
 await assert.rejects(commitRoomTheme(env,'owner',{id:'stale',host_id:'owner',settings_revision:1},choice,metadata),/바뀌었습니다/);
 assert.equal(records(f,'decoration_redemptions').length,0);assert.equal(records(f,'room_theme_applications').length,0);
 f.sql.exec("INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('funds','owner','refund','refund_review',0,1,0)");
 await assert.rejects(commitRoomTheme(env,'owner',{id:'new-room',host_id:'owner'},choice,{...metadata,key:uuid()}),/바뀌었습니다/);
 assert.equal(records(f,'decoration_redemptions').length,0);
 assert.equal(f.sql.prepare('SELECT revoked,expires_at FROM player_inventory WHERE id=?').get(stock).revoked,0);
});
