import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/improvements.js',import.meta.url),'utf8');
test('My crew displays only a live membership, never a recommended or departed crew',async()=>{
 const calls=[];let response={crews:[{id:'left',name:'Departed'}],detail:{crew:{id:'left',name:'Departed'},membership:null}};
 const c=vm.createContext({api:async(...args)=>{calls.push(args);return response;},esc:String,number:String,crewPicture:()=>'',icon:()=>'',setInterval(){}});
 vm.runInContext(source.slice(source.indexOf('async function loadMyCrewSummary'),source.indexOf('function crewImageEditorHTML')),c);
 const empty=await vm.runInContext('loadMyCrewSummary()',c);assert.match(empty,/현재 가입한 크루가 없어요/);assert.doesNotMatch(empty,/Departed/);
 response={detail:{crew:{id:'joined',name:'Current',level:2,members:3},membership:{role:'member'}}};
 const joined=await vm.runInContext('loadMyCrewSummary()',c);assert.match(joined,/#crew\/joined/);assert.match(joined,/Current/);assert.equal(calls.every(args=>args[3]?.fresh===true),true);
});
