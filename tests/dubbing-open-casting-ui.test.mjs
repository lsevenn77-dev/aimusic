import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('published empty scripts expose every role; one-person participant combinations are not labelled original takes',()=>{
 const c=nicknameContext({window:{addEventListener(){}},esc:String,icon:()=>'',time:String,AifectDubbing:{dubbingGenderLabel:()=>'',dubbingGenreArtwork:()=>'/art.svg'}});vm.runInContext(readFileSync(new URL('../dist/dubbing-casting.js',import.meta.url),'utf8'),c);
 const root={id:'root',title:'게시된 대본',ownerName:'원작자',roleCount:2,genres:[],roles:[{id:'a',name:'첫 배역',personality:''},{id:'b',name:'둘째 배역',personality:''}]};
 const state={data:{root,canStart:true,baseReady:false,combinations:[{id:'root',base:true,count:0,state:'open',members:[]}]},stage:0,selected:'root'};
 const html=c.castingStageHTML(state);assert.match(html,/0\/2/);assert.match(html,/첫 배역부터 시작하기/);assert.match(html,/data-dc-base/);assert.doesNotMatch(html,/원작자의 첫 목소리를 기다립니다/);
 const body=c.castingBodyHTML(state,{members:[],lines:[]});for(const id of ['a','b'])assert.ok(body.includes('value="'+id+'"'));assert.match(body,/data-dc-record/);
 state.data.combinations.push({id:'combo',count:1,state:'recording',members:[],expiresAt:999});state.stage=1;state.selected='combo';assert.doesNotMatch(c.castingStageHTML(state),/원작자 기본 녹음/);
});
