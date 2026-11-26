import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';

test('profile counters separate actual account follows, completed public works and all owned originals without list limits',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true',BUCKET:memoryBucket()});
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0); INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','friend',0),('owner','artist','artist',0),('other','producer','producer',0); UPDATE tracks SET karaoke_at=1 WHERE id='one'");
 const insert=f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,?,?,?,?,?)");
 for(const [id,status,kind,original,mode,parent] of [['solo','published','cover','one','solo',null],['invite','published','cover','one','duet',null],['duet','published','cover','one','duet','invite'],['private-cover','hidden','cover','one','solo',null],['removed','deleted','original',null,'solo',null]])insert.run(id,id,status,kind,original,mode,parent);
 for(let i=0;i<501;i++)insert.run('original-'+i,'원곡','published','original',null,'solo',null);
 for(const [state,visibility] of [['complete','public'],['script_ready','public'],['complete','private']]){
  const created=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()});assert.equal(created.status,201);
  f.sql.prepare('UPDATE dubbing_projects SET state=?,visibility=? WHERE id=?').run(state,visibility,created.body.project.id);
 }
 const d=(await f.call('/api/producers/producer?dashboard=1')).body;
 assert.equal(d.profile_following_count,1);assert.equal(d.following_count,2);assert.equal(d.human_followers,1);
 assert.equal(d.profile_work_count,508);assert.equal(d.produced_track_count,505);assert.equal(d.tracks.length,500);
 const visitor=(await f.call('/api/producers/producer','GET',null,'other')).body;
 assert.equal(visitor.produced_track_count,504);assert.equal(visitor.profile_work_count,508);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.equal((await f.call('/api/producers/producer?dashboard=1')).body.profile_work_count,504);
});

test('own header uses unified list counts in label-first order, separate totals and persisted public ID',()=>{
 const c=nicknameContext({me:{id:'owner'},document:{addEventListener(){}},window:{addEventListener(){}},esc:String,number:String,icon:()=>'',playerAvatarClass:()=>'',avatarImage:()=>'',playerBadgeHTML:()=>''});
 vm.runInContext(readFileSync('dist/mypage.js','utf8'),c);
 const html=c.myProfileHeader({profile:{id:'p',user_id:'owner',name:'Artist',public_id:'REAL1234'},human_followers:3,followers:13,ai_followers:10,following_count:8,profile_following_count:1,profile_work_count:5,produced_track_count:4});
 assert.match(html,/팔로워 <b>13<\/b>.*팔로잉 <b>8<\/b>.*작품 <b data-mp-work-total="profile_work_count">5<\/b>.*제작곡 <b data-mp-work-total="produced_track_count">4<\/b>/s);
 assert.doesNotMatch(html,/AI 10|공개곡|>복사<|data-followers=/);assert.match(html,/data-copy-public-id="REAL1234"[^>]*><svg/);
 assert.match(html,/href="#profile\/edit"/);assert.match(html,/href="#studio"/);
});

test('a public dashboard shows only valid equipped artwork from the player identity',async t=>{
 const f=await fixture(t);
 await f.call('/api/crews','POST',{name:'Frame crew'});
 await f.call('/api/me/player');
 const item=f.sql.prepare("SELECT id FROM player_inventory WHERE user_id='owner' AND item_key='crew-outline'").get();
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id})).status,200);
 for(const viewer of ['other',null]){
  const {profile}=(await f.call('/api/producers/producer?dashboard=1','GET',null,viewer)).body;
  assert.equal(profile.profile_frame,'crew-outline');
  assert.equal(profile.profile_frame_artwork,'/assets/crew-basic-v2.webp');
  assert.equal(profile.player_xp,undefined);assert.equal(profile.player_level,undefined);
 }
 f.sql.prepare("UPDATE player_inventory SET revoked=1 WHERE id=?").run(item.id);
 assert.equal((await f.call('/api/producers/producer?dashboard=1','GET',null,null)).body.profile.profile_frame,null);
});

test('header management requires two matching IDs and blank bios leave no row',()=>{
 const c=nicknameContext({me:null,document:{addEventListener(){}},window:{addEventListener(){}},esc:String,number:String,icon:()=>'',avatarImage:()=>'',playerAvatarClass:()=>'',playerBadgeHTML:()=>''});
 vm.runInContext(readFileSync('dist/mypage.js','utf8'),c);
 const profile={id:'target',user_id:'owner',name:'Same nickname',image_version:'photo',banner_version:'banner'};
 for(const [me,userId,owner] of [[null,undefined,false],[{},undefined,false],[{id:'visitor'},'owner',false],[{id:'owner'},'owner',true]]){
  c.me=me;
  const html=c.myProfileHeader({profile:{...profile,user_id:userId,bio:'  -  '}});
  assert.equal(html.includes('data-mp-settings'),owner);
  assert.equal(html.includes('id="mp-settings-menu"'),owner);
  assert.equal(html.includes('data-quick-logout'),owner);
  assert.equal(html.includes('href="#profile/edit"'),owner);
  assert.match(html,/data-mp-share/);assert.doesNotMatch(html,/mp-profile-bio|ARTIST PROFILE/);
  assert.match(html,/src="\/media\/banner\/target\?v=banner" data-fallback="\/media\/producer\/target\?v=photo"/);
 }
});

test('copy handler writes exactly the current ID and confirms only successful clipboard writes',async()=>{
 const handlers=[],messages=[],written=[];
 const c=nicknameContext({document:{body:{},addEventListener(type,fn){if(type==='click')handlers.push(fn);}},MutationObserver:class{observe(){}},navigator:{clipboard:{async writeText(id){written.push(id);}}},toast:s=>messages.push(s)});
 vm.runInContext(readFileSync('dist/account-settings.js','utf8'),c);
 const handler=handlers.at(-1),button={dataset:{copyPublicId:'PERSISTED987'},closest:()=>true};
 await handler({target:{closest:()=>button}});assert.deepEqual(written,['PERSISTED987']);assert.deepEqual(messages,['ID가 복사되었습니다.']);
 c.navigator.clipboard.writeText=async()=>{throw Error('denied');};await handler({target:{closest:()=>button}});assert.match(messages.at(-1),/복사할 수 없습니다/);
});
