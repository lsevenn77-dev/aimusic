import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {nicknamePolicy} from '../shared/nickname-policy.js';

const png=readFileSync(new URL('../dist/assets/nova.png',import.meta.url));
async function setup(t){
 const objects=new Map([['images/producer/producer/old',png]]);
 const BUCKET={async put(k,v){objects.set(k,v);},async delete(k){objects.delete(k);}};
 const f=await fixture(t,{BUCKET});
 f.sql.exec("UPDATE producers SET name='기존회원',bio='이전 소개',image_version='old',image_type='image/png',nickname_confirmed=1 WHERE user_id='owner';INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','크루',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','leader',0);INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at) VALUES('frame','owner','crew-outline','reward','frame',0,unixepoch()+86400);INSERT OR REPLACE INTO player_equipment(user_id,frame_inventory_id) VALUES('owner','frame')");
 const snapshot=()=>({...f.sql.prepare("SELECT * FROM producers WHERE user_id='owner'").get()});
 const save=async({name='기존회원',bio='새 소개',image,banner,remove=false,removeBanner=false,user='owner',DB=f.DB,origin='https://aifect.test'}={})=>{
  const fd=new FormData();fd.set('name',name);fd.set('bio',bio);if(image)fd.set('image',image,'test.png');if(banner)fd.set('banner',banner,'banner.png');if(remove)fd.set('remove_image','true');if(removeBanner)fd.set('remove_banner','true');
  const r=await worker.fetch(new Request('https://aifect.test/api/me/profile',{method:'PUT',headers:{Origin:origin,...(user?{Cookie:'aifect_session='+user}:{})},body:fd}),{DB,BUCKET},{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,body:await r.json()};
 };
 return {...f,BUCKET,objects,snapshot,save};
}
test('profile draft commits photo, nickname and bio together, keeps equipment and serves fresh identity',async t=>{
 const f=await setup(t),equipment=f.sql.prepare('SELECT * FROM player_equipment').all();
 const out=await f.save({name:'새로운회원',image:new Blob([png],{type:'image/png'})});
 assert.equal(out.status,200);assert.equal(out.body.profile.name,'새로운회원');assert.equal(out.body.profile.bio,'새 소개');assert.notEqual(out.body.profile.image_version,'old');
 assert.ok(f.objects.has('images/producer/producer/'+out.body.profile.image_version));
 assert.equal(out.body.profile.profile_frame,'crew-outline');assert.deepEqual(f.sql.prepare('SELECT * FROM player_equipment').all(),equipment);
 assert.equal((await f.call('/api/me')).body.user.name,'새로운회원');assert.equal((await f.call('/api/producers/producer/preview')).body.profile.image_version,out.body.profile.image_version);
});
test('removal is persisted in the existing save endpoint, keeps original objects and frame, and survives reread',async t=>{
 const f=await setup(t),out=await f.save({remove:true});
 assert.equal(out.status,200);assert.equal(out.body.profile.image_version,'');assert.equal(f.snapshot().image_type,'');assert.equal(out.body.profile.profile_frame,'crew-outline');
 assert.ok(f.objects.has('images/producer/producer/old'));assert.equal((await f.call('/api/me/profile')).body.profile.image_version,'');
 assert.equal((await f.call('/api/me')).body.user.image_version,'');
 assert.equal((await f.save({bio:'기본 사진 소개'})).status,200);assert.equal(f.snapshot().image_version,'');
});
test('invalid, oversized and unsupported photos cannot partially save text',async t=>{
 const f=await setup(t),before=f.snapshot();
 for(const image of [new Blob(['bad'],{type:'image/png'}),new Blob(['bad'],{type:'image/gif'}),new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'})]){
  const out=await f.save({name:'변경요청',image});assert.ok([400,413].includes(out.status));assert.deepEqual(f.snapshot(),before);
 }
 assert.equal((await f.save({remove:true,image:new Blob([png],{type:'image/png'})})).status,400);assert.deepEqual(f.snapshot(),before);
});
test('nickname policy, availability and 30-day cooldown roll back photo removal and upload',async t=>{
 const f=await setup(t),before=f.snapshot();
 for(const name of ['a','abcdefghijklmn','bad name','admin1','other']){assert.ok([400,409].includes((await f.save({name,remove:true})).status));assert.deepEqual(f.snapshot(),before);}
 f.sql.exec("INSERT INTO nickname_changes(user_id,changed_at) VALUES('owner',unixepoch())");
 assert.ok((await f.call('/api/me/profile')).body.nickname_change_available_at>Date.now()/1000);
 for(const change of [{remove:true},{image:new Blob([png],{type:'image/png'})}]){assert.equal((await f.save({name:'수정된회원',...change})).status,429);assert.deepEqual(f.snapshot(),before);assert.equal(f.objects.size,1);}
 assert.equal((await f.save({remove:true})).status,200); // Unchanged name remains editable.
});
test('storage and transaction failures leave the complete previous profile intact',async t=>{
 const f=await setup(t),before=f.snapshot(),put=f.BUCKET.put;
 f.BUCKET.put=async()=>{throw Error('fixture upload failure');};assert.equal((await f.save({image:new Blob([png],{type:'image/png'})})).status,500);assert.deepEqual(f.snapshot(),before);f.BUCKET.put=put;
 const DB={...f.DB,async batch(){throw Error('fixture transaction failure');}};
 for(const change of [{remove:true},{image:new Blob([png],{type:'image/png'})}]){assert.equal((await f.save({DB,...change})).status,500);assert.deepEqual(f.snapshot(),before);assert.equal(f.objects.size,1);}
});
test('authentication stays required; a second account cannot change the owner profile',async t=>{
 const f=await setup(t),before=f.snapshot();assert.equal((await f.save({user:null,remove:true})).status,401);assert.deepEqual(f.snapshot(),before);
 assert.equal((await f.save({origin:'https://other.test',remove:true})).status,403);assert.deepEqual(f.snapshot(),before);
 const out=await f.save({user:'other',name:'다른회원',image:new Blob([png],{type:'image/png'})});assert.equal(out.status,200);assert.equal(out.body.profile.user_id,'other');assert.notEqual(out.body.profile.id,'producer');assert.deepEqual(f.snapshot(),before);
});
test('a late database failure rolls back text, nickname cooldown and image together',async t=>{
 const f=await setup(t),before=f.snapshot();
 f.sql.exec("CREATE TRIGGER fail_profile_image BEFORE UPDATE OF image_version ON producers WHEN NEW.user_id='owner' BEGIN SELECT RAISE(ABORT,'fixture late failure'); END");
 for(const change of [{remove:true},{image:new Blob([png],{type:'image/png'})}]){
  assert.equal((await f.save({name:'일괄수정',...change})).status,500);assert.deepEqual(f.snapshot(),before);assert.equal(f.objects.size,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM nickname_changes WHERE user_id='owner'").get().n,0);
 }
});
test('legacy JSON saves remain compatible and nickname endpoint cannot remove a photo',async t=>{
 const f=await setup(t);assert.equal((await f.call('/api/me/profile','PUT',{name:'기존회원',bio:'JSON 소개'})).status,200);assert.equal(f.snapshot().image_version,'old');
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'기존회원',remove_image:true})).status,200);assert.equal(f.snapshot().image_version,'old');assert.equal(f.snapshot().bio,'JSON 소개');
});
test('photo and backdrop publish together and clearing each retains original objects',async t=>{
 const f=await setup(t),photo=new Blob([png],{type:'image/png'}),out=await f.save({image:photo,banner:photo});
 assert.equal(out.status,200);assert.ok(out.body.profile.banner_version);assert.ok(out.body.profile.image_version);
 const {image_version,banner_version}=out.body.profile;
 assert.notEqual(image_version,banner_version);assert.ok(f.objects.has('images/banner/producer/'+banner_version));
 assert.equal((await f.call('/api/me/profile')).body.profile.banner_version,banner_version);
 assert.equal((await f.call('/api/producers/producer')).body.profile.banner_version,banner_version);
 const cleared=await f.save({removeBanner:true});assert.equal(cleared.status,200);assert.equal(cleared.body.profile.banner_version,'');assert.equal(cleared.body.profile.image_version,image_version);
 assert.ok(f.objects.has('images/banner/producer/'+banner_version));assert.equal((await f.save({remove:true})).body.profile.image_version,'');
 assert.ok(f.objects.has('images/producer/producer/'+image_version));
});
test('a bad second image cannot save the first image or text and invalid banner changes do not unlink the photo',async t=>{
 const f=await setup(t),before=f.snapshot(),image=new Blob([png],{type:'image/png'});
 for(const banner of [new Blob(['bad'],{type:'image/png'}),new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'})]){
  const out=await f.save({name:'두사진회원',image,banner});assert.ok([400,413].includes(out.status));assert.deepEqual(f.snapshot(),before);assert.equal(f.objects.size,1);
 }
 assert.equal((await f.save({remove:true,banner:image,removeBanner:true})).status,400);assert.deepEqual(f.snapshot(),before);
});
test('banner storage and transaction failures roll back both images without deleting retained originals',async t=>{
 const f=await setup(t),before=f.snapshot(),image=new Blob([png],{type:'image/png'}),put=f.BUCKET.put;
 f.BUCKET.put=async(key,value)=>{if(key.startsWith('images/banner/'))throw Error('fixture banner upload failure');return put(key,value);};
 assert.equal((await f.save({image,banner:image})).status,500);assert.deepEqual(f.snapshot(),before);assert.equal(f.objects.size,1);f.BUCKET.put=put;
 f.sql.exec("CREATE TRIGGER fail_profile_banner BEFORE UPDATE OF banner_version ON producers WHEN NEW.user_id='owner' BEGIN SELECT RAISE(ABORT,'fixture banner failure'); END");
 assert.equal((await f.save({name:'함께저장',image,banner:image})).status,500);assert.deepEqual(f.snapshot(),before);assert.equal(f.objects.size,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM nickname_changes WHERE user_id='owner'").get().n,0);
});
test('editor uses shared policy, accepts unchanged legacy names and exposes only compact draft controls',()=>{
 const c=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},nicknamePolicy,esc:s=>String(s??''),avatarImage:()=>'<img class="profile-avatar-image">',playerFrameURL:()=>'',playerAvatarClass:()=>'',playerBadgeHTML:()=>''});
 vm.runInContext(readFileSync(new URL('../dist/profile-editor.js',import.meta.url),'utf8'),c);
 assert.equal(c.profileIdentityName(' 기존회원(ZERO) ','기존회원','새회원'),' 새회원(ZERO) ');
 assert.equal(c.profileIdentityName('기존회원(ZERO) 프로필 사진','기존회원','새회원'),'새회원(ZERO) 프로필 사진');
 assert.equal(c.profileIdentityName('기존회원의 음악','기존회원','새회원'),'기존회원의 음악');
 assert.equal(c.profileEditorNameError('기존 이름','기존 이름',999,1),'');assert.match(c.profileEditorNameError('새이름','기존 이름',999,1),/30일/);assert.match(c.profileEditorNameError('a','기존 이름',0,1),/2~8/);assert.equal(c.profileEditorNameError('새이름','기존 이름',0,1),'');
 const html=c.profileEditorHTML({name:'기존회원',bio:'소개',image_version:''});assert.doesNotMatch(html,/프로필 수정|내 페이지|로그아웃|이용권|<h[1-6]/);assert.match(html,/type="file"[^>]* hidden/);assert.match(html,/data-profile-photo-remove hidden/);assert.match(html,/rows="3"/);
});
