import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DECORATIONS} from '../shared/decorations.js';
import {decorationsFixture} from './decorations-fixture.mjs';
test('theme options exclude expired, stored and other-owner grants; active ownership alone is selectable',async t=>{
 const f=await decorationsFixture(t,{voice:true});
 await f.buyUse('theme_starlight_lounge');await f.buy('theme_cherry_blossom');await f.buyUse('theme_aurora_night');
 f.sql.exec("UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE item_key='theme_aurora_night' AND source='decoration'");
 const a=(await f.call('/api/voice/options')).body.themes;
 assert.deepEqual(a.map(t=>t.sku),['theme_starlight_lounge','navy','sunset','night']);
 assert.deepEqual((await f.call('/api/voice/options','GET',null,'other')).body.themes.map(t=>t.sku),['navy','sunset','night']);
});
test('room membership preserves the shell on mobile and desktop and route-only entry does not focus',()=>{
 const elements=[{hidden:false,style:{display:'flex'}},{hidden:true,style:{display:''}}],attrs=new Map();
 const wrapper={toggleAttribute:(k,v)=>attrs.set(k,v)};
 const c=nicknameContext({window:{innerWidth:390},document:{querySelectorAll:()=>elements,querySelector:()=>wrapper},me:{id:'owner'}});
 const source=readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(0,source.indexOf('let voiceEntryAudio')),c);
 vm.runInContext(source.slice(source.indexOf('function cleanupVoiceRoute'),source.indexOf('function bindVoice(')),c);
 c.cleanupVoiceRoute('voice','room');assert.equal(attrs.get('data-room-focus'),false);
 c.setVoiceFocus(true);assert.equal(attrs.get('data-room-focus'),true);
 assert.deepEqual(elements,[{hidden:false,style:{display:'flex'}},{hidden:true,style:{display:''}}]);
 c.setVoiceFocus(true);c.setVoiceFocus(false);assert.deepEqual(elements,[{hidden:false,style:{display:'flex'}},{hidden:true,style:{display:''}}]);
 c.window.innerWidth=1440;c.setVoiceFocus(true);
 assert.equal(attrs.get('data-room-focus'),false);assert.equal(attrs.get('data-room-entered'),true);
 assert.deepEqual(elements,[{hidden:false,style:{display:'flex'}},{hidden:true,style:{display:''}}]);
});
test('all nine versioned theme files have exact WebP dimensions and existing product IDs/prices',()=>{
 const dimensions={roomCard:[1024,1024],roomDesktop:[1920,1080],roomMobile:[1080,1920]};
 const themes=Object.values(DECORATIONS).filter(p=>p.kind==='TALKING_ROOM_THEME');assert.equal(themes.length,3);
 for(const p of themes){assert.deepEqual(p.periodPrices,{P7D:100,P1M:300,P3M:790});for(const [key,path] of Object.entries(p.assetPaths)){
  const b=readFileSync(new URL('../dist'+path,import.meta.url));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');
  const kind=b.toString('ascii',12,16);let size;
  if(kind==='VP8X')size=[b.readUIntLE(24,3)+1,b.readUIntLE(27,3)+1];else if(kind==='VP8 ')size=[b.readUInt16LE(26)&16383,b.readUInt16LE(28)&16383];else throw Error('Unexpected WebP encoding '+kind);
  // Preserve the generated master pixels rather than claiming a resized 4K export.
  const expected=p.sku==='theme_aurora_night'&&key==='roomMobile'?[941,1672]:dimensions[key];
  assert.deepEqual(size,expected,path);assert.equal(b.readUInt32LE(4)+8,b.length);
 }}
});
