import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';

test('closing a room profile for chat input keeps the caret while normal dismissal restores focus',()=>{
 const input={},events=[];let focused=0,closed=0,removed=0,unlocked=0;
 const document={activeElement:input,addEventListener(){},dispatchEvent:e=>events.push(e.type),body:{style:{overflow:'hidden'}},documentElement:{removeAttribute(){unlocked++;}}};
 const origin={isConnected:true,focus(){focused++;document.activeElement=origin;}};
 const panel={open:true,classList:{contains:name=>name==='profile-preview'},close(){this.open=false;closed++;},remove(){removed++;}};
 const context=vm.createContext({VoiceRoomClient:class{},Event,document,window:{addEventListener(){}},panel,origin});
 for(const file of ['profile-preview.js','voice-room-controls.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
 const client=context.voiceController=new context.VoiceRoomClient();
 const open=()=>{
  panel.open=true;document.activeElement=input;document.body.style.overflow='hidden';client.talkPopup=panel;client.popupTrigger=origin;
  vm.runInContext("profilePreviewDialog=panel;profilePreviewOrigin=origin;profilePreviewOverflow='auto';",context);
 };
 open();client.closeRoomPopup(false);
 assert.equal(document.activeElement,input);assert.equal(focused,0);
 assert.equal(client.talkPopup,null);assert.equal(client.popupTrigger,null);assert.equal(document.body.style.overflow,'auto');
 assert.equal(closed,1);assert.equal(removed,1);assert.equal(unlocked,1);
 open();client.closeRoomPopup();
 assert.equal(document.activeElement,origin);assert.equal(focused,1);
 open();context.closeProfilePreview('dismiss');
 assert.equal(document.activeElement,origin);assert.equal(focused,2);assert.deepEqual(events,['aifect-profile-dismiss']);
});

test('profile preview returns real counts and the current crew level badge without private account data',async t=>{
 const f=await fixture(t);
 const crew=(await f.call('/api/crews','POST',{name:'Saved crew'})).body.crew;
 f.sql.prepare('UPDATE crews SET image_version=? WHERE id=?').run('saved-v2',crew.id);
 await f.call('/api/producers/producer/follow','PUT',null,'other');
 await f.call('/api/artists/artist/follow','PUT');
 const r=await f.call('/api/producers/producer/preview','GET',null,'other');
 assert.equal(r.status,200);assert.equal(r.body.profile.id,'producer');
 assert.equal(r.body.followers,1);assert.equal(r.body.following_count,1);assert.equal(r.body.following,true);
 assert.deepEqual(r.body.crew,{id:crew.id,name:'Saved crew',image_version:'saved-v2',level:1,badge_url:'/assets/crew-badges/lv1.webp'});
 assert.equal(r.body.profile.email,undefined);assert.equal(r.body.tracks,undefined);
 const guest=await f.call('/api/producers/producer/preview','GET',null,null);
 assert.equal(guest.status,200);assert.equal(guest.body.following,false);
 await f.call('/api/producers/producer/follow','DELETE',null,'other');
 assert.equal((await f.call('/api/producers/producer/preview')).body.followers,0);
});
test('preview handles no crew, missing profiles, method and block restrictions',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/producers/producer/preview')).body.crew,null);
 assert.equal((await f.call('/api/producers/missing/preview')).status,404);
 assert.equal((await f.call('/api/producers/producer/preview','POST',{})).status,405);
 await f.call('/api/blocks/owner','PUT',null,'other');
 assert.equal((await f.call('/api/producers/producer/preview','GET',null,'other')).status,403);
});

test('public profile and preview report the reverse follow independently from the viewer follow',async t=>{
 const f=await fixture(t),profile='/api/producers/producer',preview=profile+'/preview',follow=profile+'/follow';
 const reads=[profile,preview,'/api/member-preview/owner'];
 for(const path of reads){
  assert.equal((await f.call(path,'GET',null,'other')).body.follows_viewer,false,'a viewer without a profile is not followed back');
  assert.equal((await f.call(path,'GET',null,null)).body.follows_viewer,false,'guest relationship is false');
 }
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Other',0)");
 let r=await f.call(follow,'PUT',null,'other');
 assert.equal(r.body.following,true);assert.equal(r.body.follows_viewer,false,'forward follow alone is not mutual');
 await f.call('/api/producers/other-profile/follow','PUT');
 for(const path of reads){
  r=await f.call(path,'GET',null,'other');assert.equal(r.status,200);assert.equal(r.body.follows_viewer,true,path);
 }
 assert.equal((await f.call(preview,'GET',null,'other')).body.following,true);
 r=await f.call(follow,'DELETE',null,'other');
 assert.equal(r.body.following,false);assert.equal(r.body.follows_viewer,true,'unfollowing does not remove the other person’s edge');
 r=await f.call(preview,'GET',null,'other');assert.equal(r.body.following,false);assert.equal(r.body.follows_viewer,true);
 await f.call('/api/producers/other-profile/follow','DELETE');
 for(const path of reads)assert.equal((await f.call(path,'GET',null,'other')).body.follows_viewer,false);
 await f.call(follow,'PUT',null,'other');await f.call('/api/producers/other-profile/follow','PUT');
 await f.call('/api/blocks/other','PUT');
 for(const path of reads)assert.equal((await f.call(path,'GET',null,'other')).status,403,'existing block restriction is preserved');
 assert.equal((await f.call(follow,'PUT',null,'other')).status,403);
});

 test('preview includes only valid equipped frame artwork and reflects unequip',async t=>{
 const f=await fixture(t);
 await f.call('/api/crews','POST',{name:'Frame crew'});
 await f.call('/api/me/player');
 const item=f.sql.prepare("SELECT id FROM player_inventory WHERE user_id='owner' AND item_key='crew-outline'").get();
 assert.ok(item);
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id})).status,200);
 const p=(await f.call('/api/producers/producer/preview','GET',null,null)).body.profile;
 assert.equal(p.profile_frame,'crew-outline');assert.equal(p.profile_frame_artwork,'/assets/crew-basic-v2.webp');assert.equal(p.player_xp,undefined);
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:null});
 assert.equal((await f.call('/api/producers/producer/preview')).body.profile.profile_frame,null);
 });
