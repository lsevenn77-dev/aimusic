import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';
import {JUMP_OUTFITS} from '../dist/crew-jump-art/outfits.js';

async function setup(t,options={}){
 const f=await decorationsFixture(t,options);
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('jumpcrew','owner','점프',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('jumpcrew','owner','leader',0)");
 const path='/api/crews/jumpcrew/jump/outfits';
 return {...f,shop:(user='owner')=>f.call(path,'GET',undefined,user),action:(action,outfit,user='owner',extra={})=>f.call(path+'/'+action,'POST',{outfit,...extra},user)};
}
const purchased=f=>f.sql.prepare("SELECT * FROM player_inventory WHERE source='jump_outfit'").all();
const goldUsed=f=>f.sql.prepare("SELECT used FROM gold_purchases WHERE id='funds'").get().used;

test('jump shop uses existing prices, authenticates the account and rejects unowned equipment',async t=>{
 const f=await setup(t,{gold:123});
 const {body}=await f.shop();
 assert.equal(body.equipped,'default');assert.deepEqual(body.owned,['default']);assert.deepEqual(body.balance,{G:123,S:0});
 assert.deepEqual(body.outfits.filter(i=>i.price).map(i=>[i.id,i.price,i.unit]),[
  ['runner',500,'S'],['street',500,'S'],['idol',50,'G'],['suit',100,'G'],['princess',200,'G']]);
 assert.equal((await f.shop('')).status,401);assert.equal((await f.shop('other')).status,403);
 assert.equal((await f.action('buy','idol','other')).status,403);
 assert.equal((await f.action('equip','idol')).status,403);
 assert.equal((await f.action('buy','unknown')).status,400);
 assert.equal((await f.call('/api/crews/jumpcrew/jump/outfits/buy','GET')).status,405);
 assert.equal(goldUsed(f),0);assert.equal(purchased(f).length,0);
});

test('gold purchase equips immediately, persists and remains idempotent after replay or changing crews',async t=>{
 const f=await setup(t,{gold:150});
 let r=await f.action('buy','idol','owner',{price:0,unit:'S',user_id:'other'});
 assert.equal(r.status,200);assert.equal(r.body.equipped,'idol');assert.equal(r.body.balance.G,100);
 assert.equal(goldUsed(f),50);assert.equal(purchased(f).length,1);
 assert.equal((await f.shop()).body.equipped,'idol');
 await f.action('buy','idol');assert.equal(goldUsed(f),50);
 assert.equal((await f.action('equip','default')).body.equipped,'default');
 await f.action('buy','idol');assert.equal((await f.shop()).body.equipped,'default'); // A purchase retry does not undo a later equipment choice.
 assert.equal((await f.action('equip','idol')).body.equipped,'idol');
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('nextcrew','owner','다음 크루',0); UPDATE crew_members SET crew_id='nextcrew' WHERE user_id='owner'");
 r=await f.call('/api/crews/nextcrew/jump/outfits');assert.equal(r.body.equipped,'idol');assert.ok(r.body.owned.includes('idol'));
 const receipt=JSON.parse(purchased(f)[0].item_key);assert.equal(receipt.amount,50);assert.equal(receipt.lots[0].purchase_id,'funds');
 const history=await f.call('/api/gold/history?currency=gold');
 assert.deepEqual(history.body.spent.filter(i=>i.kind==='jump_outfit').map(i=>[i.amount,i.title]),[[50,'아이돌룩 구매']]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM crew_jump_runs').get().n,0);
});

test('silver purchase consumes exactly 500 S and insufficient funds roll back everything',async t=>{
 const f=await setup(t,{gold:0});
 assert.equal((await f.action('buy','runner')).status,409);assert.equal(purchased(f).length,0);
 f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',501)");
 let r=await f.action('buy','runner');assert.equal(r.status,200);assert.equal(r.body.equipped,'runner');assert.equal(r.body.balance.S,1);
 await f.action('buy','runner');assert.equal((await f.shop()).body.balance.S,1);
 assert.equal((await f.action('buy','street')).status,409);assert.equal((await f.action('buy','idol')).status,409);
 assert.equal((await f.shop()).body.equipped,'runner');assert.equal(purchased(f).length,1);
 const history=await f.call('/api/gold/history?currency=silver');
 assert.deepEqual(history.body.spent.filter(i=>i.kind==='jump_outfit').map(i=>[i.amount,i.title]),[[500,'육상선수룩 구매']]);
});

test('concurrent purchases cannot duplicate charges or overspend shared gold/silver balances',async t=>{
 const f=await setup(t,{gold:200});
 let results=await Promise.all([f.action('buy','idol'),f.action('buy','idol')]);
 assert.ok(results.every(r=>r.status===200));assert.equal(goldUsed(f),50);assert.equal(purchased(f).length,1);
 results=await Promise.all([f.action('buy','suit'),f.action('buy','princess')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(goldUsed(f),150);
 f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',500)");
 results=await Promise.all([f.action('buy','runner'),f.action('buy','street')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await f.shop()).body.balance.S,0);
 assert.equal(purchased(f).length,3);
});

test('a rejected equipment write rolls back the purchase receipt and gold debit together',async t=>{
 const f=await setup(t,{gold:200});
 f.sql.exec("CREATE TEMP TRIGGER reject_jump_equipment BEFORE INSERT ON player_inventory WHEN NEW.source='jump_outfit_equip' BEGIN SELECT RAISE(ABORT,'constraint: fixture rejected equipment'); END;");
 assert.equal((await f.action('buy','idol')).status,409);
 assert.equal(goldUsed(f),0);assert.equal(purchased(f).length,0);
 assert.equal((await f.shop()).body.equipped,'default');
});

test('held funding or revoked ownership cannot be bought or equipped, and worn outfits fall back to default',async t=>{
 const f=await setup(t,{gold:200});await f.action('buy','idol');
 f.sql.exec("INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('funds','owner','refund-fixture','refund_review',0,0,0)");
 let r=await f.shop();assert.equal(r.body.equipped,'default');assert.deepEqual(r.body.blocked,['idol']);assert.equal(r.body.balance.G,0);
 assert.equal((await f.action('equip','idol')).status,403);
 assert.equal((await f.action('buy','idol')).status,409);assert.equal((await f.action('buy','suit')).status,409);
 assert.equal(goldUsed(f),50);
 f.sql.exec("UPDATE gold_orders SET state='paid' WHERE id='funds'; UPDATE player_inventory SET revoked=1 WHERE source='jump_outfit'");
 assert.equal((await f.action('equip','idol')).status,403);assert.equal((await f.shop()).body.equipped,'default');
});

test('each outfit is paid in its catalog currency and every purchased item can be re-equipped',async t=>{
 const f=await setup(t,{gold:350});f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',1000)");
 for(const item of JUMP_OUTFITS.filter(i=>i.price))assert.equal((await f.action('buy',item.id)).body.equipped,item.id);
 for(const item of JUMP_OUTFITS)assert.equal((await f.action('equip',item.id)).body.equipped,item.id);
 const r=await f.shop();assert.deepEqual(r.body.balance,{G:0,S:0});assert.equal(purchased(f).length,5);
});
