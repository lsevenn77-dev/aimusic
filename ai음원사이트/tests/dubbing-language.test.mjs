import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDubbingSeconds,normalizeGeneratedDubbingScript} from '../shared/dubbing-language.js';
import {generateDubbingScript,generateDubbingSoundPlan} from '../server/dubbing-ai.js';
import {dubbingTimeline} from '../shared/dubbing.js';
import {sampleScript,options} from './dubbing-fixtures.mjs';

test('AI seconds use Sino-Korean numbers, including whole compound numbers and particles',()=>{
 for(const [before,after] of [
  ['일곱 초를 되돌려.','칠 초를 되돌려.'],
  ['일곱초 전','칠 초 전'],
  ['열일곱 초의 종소리','십칠 초의 종소리'],
  ['스물일곱 초 후','이십칠 초 후'],
  ['스무 초만 기다려.','이십 초만 기다려.'],
  ['쉰여섯 초','오십육 초'],
  ['아흔아홉 초!','구십구 초!'],
  ['한 초, 두 초, 세 초, 네 초','일 초, 이 초, 삼 초, 사 초'],
 ])assert.equal(normalizeDubbingSeconds(before),after);
 const unchanged='일곱 명이 세 시간 동안 일곱 번 읽어. 일곱 초콜릿, 일곱 초등학생. 열일곱번째. 7초. 칠 초. 0.7초.';
 assert.equal(normalizeDubbingSeconds(unchanged),unchanged);
 assert.equal(normalizeDubbingSeconds(normalizeDubbingSeconds('일곱 초')), '칠 초');
});

test('generated prose is corrected without changing identities, timing, sound anchors or source',()=>{
 const script=sampleScript();script.title='일곱 초의 종소리';
 script.lines[0].text='일곱 초를 되돌려. 세 명이 세 시간 기다렸어.';
 script.lines[0].direction='일곱 초 전을 떠올리듯';
 const original=structuredClone(script),corrected=normalizeGeneratedDubbingScript(script);
 assert.equal(corrected.title,'칠 초의 종소리');
 assert.equal(corrected.lines[0].text,'칠 초를 되돌려. 세 명이 세 시간 기다렸어.');
 assert.equal(corrected.lines[0].direction,'칠 초 전을 떠올리듯');
 assert.deepEqual(script,original);
 assert.deepEqual(corrected.roles,original.roles);
 assert.deepEqual(corrected.soundCues,original.soundCues);
 assert.equal(dubbingTimeline(corrected).duration,dubbingTimeline(script).duration);
 assert.deepEqual(corrected.lines.map(({text,direction,...line})=>line),original.lines.map(({text,direction,...line})=>line));
});

test('AI generation corrects provider prose; sound-only generation preserves an existing script',async()=>{
 const script=sampleScript();script.title='일곱 초의 종소리';
 script.lines[0].text+=' 일곱 초를 되돌릴 수 있는 건 지금뿐이야.';
 const reply=value=>Response.json({id:'response-test',status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 const env={DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'fixture'};
 const result=await generateDubbingScript(env,options,async()=>reply(script));
 assert.equal(result.script.title,'칠 초의 종소리');
 assert.match(result.script.lines[0].text,/칠 초를/);
 assert.equal(result.usage.billedUsd,null);
 const sound=await generateDubbingSoundPlan(env,script,options,async()=>reply({soundCues:script.soundCues}));
 assert.equal(sound.script.title,script.title);
 assert.equal(sound.script.lines[0].text,script.lines[0].text);
});
