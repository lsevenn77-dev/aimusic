import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/community.js',import.meta.url),'utf8');
function player(){
 const requests=[],events=new Map(),attrs={},style={},elapsed={textContent:''},button={dataset:{},setAttribute(k,v){attrs[k]=v;}},progress={dataset:{duration:'120'},style:{setProperty(k,v){style[k]=v;}}};
 const card={isConnected:true,dataset:{musicId:'one'},classList:{toggle(){}},querySelector(s){return s==='h3'?{textContent:'One'}:s==='[data-community-toggle]'?button:s==='[data-community-progress]'?progress:elapsed;}};
 const audio={paused:false,ended:false,currentTime:30,duration:120,getAttribute:()=>'/audio',addEventListener(k,fn){events.set(k,[...(events.get(k)||[]),fn]);},pause(){this.paused=true;},async play(){this.paused=false;}};
 const c=vm.createContext({window:{},document:{querySelectorAll:()=>[card]},audio,current:{id:'one'},routeTracks:[{id:'one'},{id:'two'}],play:async(id,queue)=>requests.push({id,queue}),icon:n=>n,time:n=>String(n),toast:()=>{}});vm.runInContext(source,c);return {c,audio,requests,events,elapsed,button,attrs,style,card};
}
test('feed toggles the same song without restarting, but uses the shared queue for a new song',async()=>{
 const {c,audio,requests}=player();await c.playCommunityTrack('one');assert.equal(audio.paused,true);assert.equal(audio.currentTime,30);await c.playCommunityTrack('one');assert.equal(audio.paused,false);assert.equal(requests.length,0);
 await c.playCommunityTrack('two');assert.equal(requests[0].id,'two');assert.equal(requests[0].queue.length,2);
 audio.ended=true;await c.playCommunityTrack('one');assert.equal(requests.length,2);
 c.window.AifectAudioAds={active:true};await c.playCommunityTrack('two');assert.equal(requests.length,2);
});
test('feed rebind does not duplicate listeners and progress follows audio, pause and route departures',()=>{
 const {c,audio,events,elapsed,button,attrs,style,card}=player();c.bindCommunityPlayback();c.bindCommunityPlayback();assert.equal(events.get('timeupdate').length,1);assert.equal(elapsed.textContent,'30');assert.equal(style['--play-progress'],'25%');assert.equal(button.innerHTML,'pause');assert.equal(attrs['aria-label'],'One 일시정지');
 audio.paused=true;events.get('pause')[0]();assert.equal(button.innerHTML,'play');assert.equal(elapsed.textContent,'30');
 c.current={id:'two'};events.get('timeupdate')[0]();assert.equal(elapsed.textContent,'0');assert.equal(style['--play-progress'],'0%');
 card.isConnected=false;assert.doesNotThrow(()=>events.get('timeupdate')[0]());
});
