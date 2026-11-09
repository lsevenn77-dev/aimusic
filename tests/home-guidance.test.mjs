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
function attributes(tag){return Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g),match=>[match[1],match[2]]));}
function pictureSourceAt(html,width){
 const picture=html.match(/<picture\b[^>]*>([\s\S]*?)<\/picture>/)?.[1];
 assert.ok(picture,'banner must retain a separate original-photo picture');
 const source=Array.from(picture.matchAll(/<source\b[^>]*>/g),match=>attributes(match[0])).find(source=>
  Array.from((source.media||'').matchAll(/\((min|max)-width:\s*(\d+)px\)/g)).every(([,kind,limit])=>kind==='min'?width>=Number(limit):width<=Number(limit))
 );
 return source?.srcset||attributes(picture.match(/<img\b[^>]*>/)?.[0]||'').src;
}

test('all eight service banners expose a whole-banner link and responsive WebP artwork',()=>{
 const c=context(),banners=vm.runInContext('homeBanners',c);
 assert.equal(banners.length,8);assert.equal(new Set(banners.map(b=>b.id)).size,8);
 assert.deepEqual(Array.from(banners,b=>b.id),['studio','play','participate','artists','karaoke','talking','crew','premium']);
 for(const b of banners){
  const html=c.homeBannerHTML(b);
  assert.match(html,new RegExp('href="'+b.href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"'));
  assert.ok(html.includes(b.headline));assert.ok(html.includes(b.cta));
  assert.match(html,/<img\b[^>]*width="1536" height="768"/);
  assert.match(html,/768w, [^"]+1536w/);
  assert.ok(html.includes(c.homeBannerBackgroundImage(b.id)),b.id+' must include its separate desktop scenery');
  assert.equal((html.match(/<a\b/g)||[]).length,1,'the artwork and live copy share one destination on desktop and mobile');
  for(const width of [768,1536]){
   const image=readFileSync(new URL('../dist'+c.homeBannerImage(b.id,width),import.meta.url));
   assert.equal(image.toString('ascii',0,4),'RIFF');assert.equal(image.toString('ascii',8,12),'WEBP');
  }
 }
 const routes=Object.fromEntries(banners.map(b=>[b.id,b.href]));
 assert.deepEqual(routes,{studio:'#upload',play:'#karaoke',participate:'#karaoke/duets',artists:'#artists',karaoke:'#live?mode=karaoke',talking:'#voice?mode=talk',crew:'#community/crews?browse=1',premium:'#membership'});
});

test('each banner renders one subtitle and includes it in the accessible link name',()=>{
 const c=context(),banners=vm.runInContext('homeBanners',c);
 for(const b of banners){
  assert.equal(typeof b.subtitle,'string',b.id+' needs a subtitle');
  assert.ok(b.subtitle.trim(),b.id+' needs a non-empty subtitle');
  const html=c.homeBannerHTML(b),subtitle=c.esc(b.subtitle);
  const content=html.replace(/<[^>]+>/g,''),label=html.match(/<a\b[^>]*\baria-label="([^"]*)"/)?.[1]||'';
  assert.equal(content.split(subtitle).length-1,1,b.id+' must show its subtitle once as live text');
  assert.equal(label.split(subtitle).length-1,1,b.id+' must announce its subtitle once');
  for(const text of [b.headline,b.cta])assert.ok(label.includes(c.esc(text)),b.id+' must announce its headline and destination action');
 }
});

test('participation exposes a choice of open duet or dubbing projects, not completed works',()=>{
 const c=context(),choice=vm.runInContext('homeBanners.find(b=>b.id==="participate")',c);
 assert.match(c.homeBannerHTML(choice),/data-home-participate aria-haspopup="dialog"/);
 const html=c.homeParticipationHTML();
 assert.match(html,/href="#karaoke\/duets"/);
 assert.match(html,/href="#karaoke\/dubbing\?tab=join"/);
 assert.doesNotMatch(html,/href="#karaoke\/browse"|data-pay|data-follow|data-record/);
});

test('mobile retains the seven approved photos and uses the new full-frame crew scene',()=>{
 const c=context(),banners=vm.runInContext('homeBanners',c);
 const original=JSON.parse(readFileSync(new URL('../dist/assets/home-banners/mobile-20261109/manifest.json',import.meta.url),'utf8'));
 const approved=JSON.parse(readFileSync(new URL('../dist/assets/home-banners/seamless-20261109/manifest.json',import.meta.url),'utf8'));
 assert.equal(banners.filter(banner=>banner.id!=='crew').length,7);
 for(const width of [768,1536]){
  const hashes=new Set();
  for(const banner of banners){
   const asset=(banner.id==='crew'?approved.assets:original.banners).find(item=>item.id===banner.id);
   assert.ok(asset,'missing reviewed mobile scene for '+banner.id);
   const output=asset.outputs.find(item=>item.width===width);
   assert.ok(output,'missing mobile variant for '+banner.id+' at '+width);
   assert.equal(output.filename,banner.id+'-'+width+'.webp');
   const expectedDirectory=banner.id==='crew'?'seamless-20261109':'mobile-20261109';
   assert.equal(c.homeBannerImage(banner.id,width),'/assets/home-banners/'+expectedDirectory+'/'+output.filename);
   assert.equal(c.homeBannerImage(banner.id,width),output.url,'rendered mobile photo must match its reviewed manifest');
   const bytes=readFileSync(new URL('../dist'+output.url,import.meta.url));
   const hash=createHash('sha256').update(bytes).digest('hex');
   assert.equal(hash,output.sha256,output.filename+' differs from its reviewed image');
   assert.equal(bytes.length,output.bytes);assert.equal(output.height,width/2);
   hashes.add(hash);
  }
  assert.equal(hashes.size,8,'each destination must show its own approved scene');
 }
});

test('desktop and compact desktop reuse the exact mobile photo independently from generated scenery',()=>{
 const c=context(),banners=vm.runInContext('homeBanners',c);
 for(const [index,banner] of banners.entries()){
  const original=c.homeBannerImage(banner.id,1536);
  const html=c.homeBannerHTML(banner,banners[(index+1)%banners.length]);
  const picture=html.match(/<picture\b[^>]*>[\s\S]*?<\/picture>/)?.[0];
  assert.ok(picture,banner.id+' needs the original photo as a separate layer');
  for(const width of [801,860,1150,1151,1440,1920]){
   assert.equal(pictureSourceAt(html,width),original,banner.id+' must retain the mobile original at '+width+'px');
  }
  assert.equal(attributes(picture.match(/<img\b[^>]*>/)?.[0]||'').src,original);
  const scenery=Array.from(html.matchAll(/<span\b[^>]*>/g),match=>attributes(match[0])).filter(tag=>tag.class?.split(/\s+/).includes('home-promo-scenery'));
  assert.equal(scenery.length,2,'both exposed sides need their own matching outpaint');
  for(const side of ['left','right']){
   const background=c.homeBannerBackgroundImage(banner.id,side);
   assert.ok(!picture.includes(background),'generated scenery must never replace the original portrait');
   const layer=scenery.find(tag=>tag.class.split(/\s+/).includes('home-promo-scenery-'+side));
   assert.ok(layer?.style?.includes(background),banner.id+' needs its own '+side+' extension');
   assert.equal(layer['aria-hidden'],'true','decorative scenery is not a second announced image');
  }
  assert.doesNotMatch(html,/\/assets\/home-banners\/(?:approved|desktop|desktop-close|seamless)-20261109\/[^"'\s<>]+-2172\.webp/,'old generated portraits must not return through a source or preload');
 }
});

test('desktop scenery matches reviewed WebP files and records the unchanged original photo provenance',()=>{
 const c=context(),banners=vm.runInContext('homeBanners',c);
 const base=new URL('../dist/assets/home-banners/repair-20261109/',import.meta.url);
 const manifestText=readFileSync(new URL('manifest.json',base),'utf8'),manifest=JSON.parse(manifestText);
 assert.equal(manifest.assets.length,banners.length);
 assert.deepEqual(manifest.assets.map(asset=>asset.id),Array.from(banners,banner=>banner.id));
 assert.doesNotMatch(manifestText,/\/workspace\//,'published provenance must not expose workspace paths');
 const hashes=new Set();
 for(const banner of banners){
  const asset=manifest.assets.find(item=>item.id===banner.id);
  assert.ok(asset,'missing scene extensions for '+banner.id);
  assert.equal(asset.source_url,c.homeBannerImage(banner.id,1536));
  const original=readFileSync(new URL('../dist'+asset.source_url,import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'),asset.source.sha256,'background provenance must identify the actual unchanged mobile photo');
  assert.equal(original.length,asset.source.bytes);
  assert.ok(asset.prompt.trim(),'generation prompt must be preserved for '+banner.id);
  assert.ok(asset.provenance.generated.filename.endsWith('.png'));
  assert.match(asset.provenance.generated.sha256,/^[a-f0-9]{64}$/);
  for(const [side,width] of [['left',2365],['right',768]]){
   const output=asset.outputs.find(item=>item.side===side);
   assert.ok(output,'missing '+side+' desktop scenery for '+banner.id);
   assert.equal(output.filename,banner.id+'-'+side+'-'+width+'.webp');
   assert.equal(c.homeBannerBackgroundImage(banner.id,side),output.url,'rendered scenery must match its reviewed manifest');
   assert.equal(output.width,width);
   assert.equal(output.height,768);
   const bytes=readFileSync(new URL('../dist'+output.url,import.meta.url));
   assert.equal(bytes.toString('ascii',0,4),'RIFF');
   assert.equal(bytes.toString('ascii',8,12),'WEBP');
   assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'incomplete WebP: '+output.filename);
   assert.equal(bytes.length,output.bytes);
   const hash=createHash('sha256').update(bytes).digest('hex');
   assert.equal(hash,output.sha256,output.filename+' differs from its reviewed background');
   hashes.add(hash);
  }
 }
 assert.equal(hashes.size,banners.length*2,'each banner needs its own left and right scene extension');
});
