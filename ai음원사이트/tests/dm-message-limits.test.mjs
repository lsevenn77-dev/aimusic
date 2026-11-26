import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {dmBodyStats,fitDmInsertion,stickerWarning,token} from '../shared/chat-sticker-body.js';

const mixed = ['cat_basic_smile','cat_hand_ok','cat_text_best','cat_prop_star'].map(token).join('');
const thirty = mixed.repeat(7) + token('cat_prop_note').repeat(2);

test('DM limits measure the trimmed stored body and all known sticker categories',()=>{
 assert.deepEqual(dmBodyStats(' \n' + thirty + '🎵 \n'),{count:30,length:thirty.length+2,warning:''});
 assert.equal(dmBodyStats(thirty + '[aifect:cat_unknown]').count,30);
 assert.equal(dmBodyStats(thirty + token('cat_hand_ok')).warning,stickerWarning);
});

test('overflow clips only incoming content, preserving atomic stickers, surrogate pairs and the suffix',()=>{
 const prefix='가'.repeat(1994),suffix='마지막';
 assert.equal(fitDmInsertion(prefix,'12🎵345',suffix).value,'12');
 assert.equal(fitDmInsertion(prefix,token('cat_prop_star'),suffix).value,'');
 assert.equal(fitDmInsertion('',thirty + token('cat_basic_smile'),'끝').value,thirty);
 assert.equal(fitDmInsertion('앞',token('cat_hand_ok'),thirty).value,'');
 assert.equal(fitDmInsertion('앞',token('cat_hand_ok'),thirty.slice(token('cat_basic_smile').length)).warning,'');
});

test('direct DM POST enforces both limits and replays existing long sticker messages',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','Friend',0)");
 const post=(body,request_id=crypto.randomUUID())=>f.call('/api/dm/friend','POST',{body,request_id});
 const max='가'.repeat(2000-thirty.length)+thirty;
 const ok=await post(' '+max+' ');assert.equal(ok.status,201);assert.equal(ok.body.message.body,max);
 assert.equal((await post(max+'A')).status,400);
 const over=thirty+token('cat_hand_peace'),rejected=await post(over);
 assert.equal(rejected.status,400);assert.equal(rejected.body.error,stickerWarning);
 const id=crypto.randomUUID();
 f.sql.prepare("INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES('old','owner','other',?,?,1)").run(over,id);
 assert.equal((await post(over,id)).status,201);
 assert.equal((await post(over+'!',id)).status,409);
 const history=await f.call('/api/dm/producer','GET',undefined,'other');
 assert.deepEqual(new Set(history.body.messages.map(m=>m.body)),new Set([over,max]));
});

