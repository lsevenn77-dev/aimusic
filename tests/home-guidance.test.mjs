import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

function context(){
 const c=vm.createContext({esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;'),icon:()=>'<svg></svg>'});
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);
 return c;
}

test('all seven approved banners expose a whole-image link and responsive WebP artwork',()=>{
 const c=context(),banners=vm.runInContext('homeBanners',c);
 assert.equal(banners.length,7);assert.equal(new Set(banners.map(b=>b.id)).size,7);
 for(const b of banners){
  const html=c.homeBannerHTML(b);
  assert.match(html,new RegExp('href="'+b.href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"'));
  assert.ok(html.includes(b.headline));assert.ok(html.includes(b.cta));
  assert.match(html,/width="1536" height="768"/);assert.match(html,/768w, [^"]+1536w/);
  assert.equal((html.match(/<a\b/g)||[]).length,1,'the desktop copy and complete mobile artwork share one destination');
  for(const width of [768,1536]){
   const image=readFileSync(new URL('../dist'+c.homeBannerImage(b.id,width),import.meta.url));
   assert.equal(image.toString('ascii',0,4),'RIFF');assert.equal(image.toString('ascii',8,12),'WEBP');
  }
 }
 const routes=Object.fromEntries(banners.map(b=>[b.id,b.href]));
 assert.deepEqual(routes,{studio:'#upload',play:'#karaoke',participate:'#karaoke/duets',artists:'#artists',karaoke:'#live?mode=karaoke',talking:'#voice?mode=talk',premium:'#membership'});
});

test('participation exposes a choice of open duet or dubbing projects, not completed works',()=>{
 const c=context(),choice=vm.runInContext('homeBanners.find(b=>b.id==="participate")',c);
 assert.match(c.homeBannerHTML(choice),/data-home-participate aria-haspopup="dialog"/);
 const html=c.homeParticipationHTML();
 assert.match(html,/href="#karaoke\/duets"/);
 assert.match(html,/href="#karaoke\/dubbing\?tab=join"/);
 assert.doesNotMatch(html,/href="#karaoke\/browse"|data-pay|data-follow|data-record/);
});

test('published banner variants match the visually reviewed asset manifest without duplicate scenes',()=>{
 const base=new URL('../dist/assets/home-banners/final-20261108/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
 assert.equal(manifest.banners.length,7);
 for(const width of [768,1536]){
  const hashes=new Set();
  for(const banner of manifest.banners){
   const output=banner.outputs.find(item=>item.width===width);
   assert.equal(output.filename,banner.id+'-'+width+'.webp');
   const bytes=readFileSync(new URL(output.filename,base));
   const hash=createHash('sha256').update(bytes).digest('hex');
   assert.equal(hash,output.sha256,output.filename+' differs from its reviewed image');
   assert.equal(bytes.length,output.bytes);assert.equal(output.height,width/2);
   hashes.add(hash);
  }
  assert.equal(hashes.size,7,'each destination must show its own approved scene');
 }
});

test('desktop panorama files are complete WebP scenes matching the reviewed manifest',()=>{
 const c=context(),banners=vm.runInContext('homeBanners',c);
 const base=new URL('../dist/assets/home-banners/desktop-20261109/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
 assert.equal(manifest.assets.length,banners.length);
 const hashes=new Set();
 for(const banner of banners){
  const asset=manifest.assets.find(item=>item.id===banner.id);
  assert.ok(asset,'missing desktop scene for '+banner.id);
  const bytes=readFileSync(new URL('../dist'+c.homeBannerDesktopImage(banner.id),import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'incomplete WebP: '+asset.file);
  assert.equal(bytes.length,asset.bytes);
  const hash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash,asset.sha256,asset.file+' differs from its reviewed scene');
  hashes.add(hash);
 }
 assert.equal(hashes.size,banners.length,'each banner needs its own desktop scene');
});
