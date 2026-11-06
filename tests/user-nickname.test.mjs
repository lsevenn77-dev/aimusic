import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';
import {fixture} from './fixture.mjs';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
test('explicit entity IDs keep artists, humans and official AI accounts separate; absent IDs remain plain text',()=>{
 const c=nicknameContext({esc});
 assert.equal(c.nicknameProfileKey({profileId:'human',artistId:'artist'}),'human');
 assert.equal(c.nicknameProfileKey({profileId:'human',artistId:'artist',entityType:'artist'}),'artist:artist');
 assert.equal(c.nicknameProfileKey({profileId:'bot',accountType:'ai_bot'}),'bot');
 assert.equal(c.nicknameProfileKey({profileId:'human',entityType:'artist'}),'');
 for(const userId of [null,undefined,'','undefined','null','<x>','a/b'])assert.equal(c.userNickname('<name>',{userId}),'&lt;name>');
 assert.match(c.userNickname('<name>',{userId:'listener'}),/data-profile-preview="member:listener"/);
 assert.match(c.userNickname('name',{profileId:'person'},{stopPropagation:false}),/data-profile-stop="false"/);
 assert.doesNotMatch(c.userNickname('<img>',{profileId:'person'}),/<img>/);
 const duet=c.trackPerformers({kind:'cover',artist_id:'original-artist',artist:'Original',producer_id:'second',producer:'Second',duet_partner_id:'first',duet_partner:'First'});
 assert.match(duet,/data-profile-preview="first"/);assert.match(duet,/data-profile-preview="second"/);assert.doesNotMatch(duet,/artist:original-artist/);
});
test('nickname inside a card, button or dialog wins before its parent; nested actions stay independent',()=>{
 const handlers={},c=nicknameContext({esc,document:{addEventListener:(type,fn)=>handlers[type]=fn},window:{addEventListener(){}}});
 vm.runInContext(readFileSync('dist/profile-preview.js','utf8'),c);
 const opened=[];c.openProfilePreview=(key)=>opened.push(key);
 const name={dataset:{profilePreview:'member:person',userNickname:'',profileStop:'true'},matches:()=>true,closest:s=>s==='[contenteditable="true"]'?null:name};
 const target={closest:s=>s==='[data-user-nickname]'?name:s==='button'?{}:null};
 for(const key of [null,'Enter',' ']){
  let prevented=false,stopped=false;const e={target:key?name:target,button:0,key,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};
  handlers[key?'keydown':'click'](e);assert.equal(prevented,true);assert.equal(stopped,true);
 }
 assert.deepEqual(opened,['member:person','member:person','member:person']);
 handlers.click({target:{closest:()=>null},button:0});assert.equal(opened.length,3);
 for(const type of ['pointerdown','touchstart','auxclick']){let stopped=false;handlers[type]({target,stopImmediatePropagation(){stopped=true;},preventDefault(){}});assert.equal(stopped,true);}
});
test('playlist preview exposes separate real artist and duet identities without changing ordered songs',async t=>{
 const f=await fixture(t);
 const p=await f.call('/api/playlists','POST',{name:'Names',is_public:true,track_ids:['one','two']});
 const data=(await f.call('/api/playlists')).body;
 const playlist=data.playlists.find(x=>x.id===p.body.id);assert.ok(playlist);
 assert.equal(playlist.user_id,'owner');assert.deepEqual(playlist.covers.map(x=>x.id),['one','two']);
 assert.equal(playlist.covers[0].artist_id,'artist');assert.equal(playlist.covers[0].producer_id,'producer');
 const c=nicknameContext({esc});assert.match(c.trackNickname(playlist.covers[0]),/data-profile-preview="artist:artist"/);
});
