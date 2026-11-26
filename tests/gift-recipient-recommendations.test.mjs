import assert from 'node:assert/strict';
import test from 'node:test';
import { decorationsFixture } from './decorations-fixture.mjs';

test('gift recommendations rank completed sends, follows, gifts and conversations, with six unique eligible profiles', async t => {
  const f = await decorationsFixture(t);
  const addUser = f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)');
  const addProfile = f.sql.prepare('INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)');
  for (const [id,name] of Object.entries({
    frequent:'자주 선물', followed:'팔로우 닉네임', member:'회원 팔로우', bulk:'묶음 선물',
    recent:'최근 선물', chat:'최근 대화', oldChat:'오래된 대화', blocked:'차단된 회원'
  })) {
    addUser.run(id,id+'@example.test',name);
    addProfile.run(id+'-profile',id,name);
  }
  f.sql.exec(`
   INSERT INTO follows(user_id,kind,target_id,created) VALUES
    ('owner','producer','followed-profile',30),('owner','member','followed',30),
    ('owner','member','member',20),('owner','producer','blocked-profile',100);
   INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('blocked','owner',1);
   INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',10);
   INSERT INTO direct_messages(id,sender_id,recipient_id,request_id,body,created) VALUES
    ('chat-1','owner','chat','chat-1','안녕하세요',40),('chat-2','oldChat','owner','chat-2','안녕하세요',10);
  `);
  const request = () => ({request_id:crypto.randomUUID()});
  const frequent = {profile_id:'frequent-profile'};
  assert.equal((await f.call('/api/gifts/checkout','POST',{...request(),...frequent,gift_type:'heart',quantity:1})).status,201);
  assert.equal((await f.call('/api/decorations/gift','POST',{...request(),...frequent,sku:'frame_aurora_ring',period:'P7D'})).status,201);
  assert.equal((await f.call('/api/gifts/checkout','POST',{...request(),profile_id:'recent-profile',gift_type:'silver-letter',quantity:1})).status,201);
  f.sql.exec("UPDATE free_gifts SET created=10 WHERE recipient_profile_id='recent-profile'");
  const units = [];
  for (let n=0;n<2;n++) {
    const order = await f.buy();
    assert.equal(order.status,201);
    units.push(order.body.order.inventory_id);
  }
  const sent = await f.call('/api/decorations/inventory/'+units[0]+'/send','POST',{
    ...request(),profile_id:'bulk-profile',inventory_ids:units
  });
  assert.equal(sent.status,200);

  const route = '/api/decorations/recipients?scope=gift';
  const result = await f.call(route);
  assert.equal(result.status,200);
  assert.deepEqual(result.body.profiles.map(p=>p.id),[
    'frequent-profile','followed-profile','member-profile','bulk-profile','recent-profile','chat-profile'
  ]);
  const followed = result.body.profiles[1];
  assert.match(followed.public_id,/^[A-Z]{3}\d{4}$/);
  assert.equal(followed.user_id,undefined);
  const search = async value => (await f.call(route+'&q='+encodeURIComponent(value))).body.profiles.map(p=>p.id);
  assert.deepEqual(await search('팔로우 닉네임'),['followed-profile']);
  assert.deepEqual(await search(followed.public_id.toLowerCase()),['followed-profile']);
  assert.deepEqual(await search('차단된 회원'),[]);
  assert.equal((await f.call(route,'GET',undefined,null)).status,401);
});
