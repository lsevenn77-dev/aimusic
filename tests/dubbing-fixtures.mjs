import {emptyDubbingScript} from '../shared/dubbing.js';
export const options={genres:['일상','감동'],roleCount:2,minutes:1,mood:'유쾌하게',ending:'해피엔딩',idea:''};
export function sampleScript(){
 const s=emptyDubbingScript(options);s.title='[로컬 테스트] 마지막 우산';
 s.roles[0].name='하루';s.roles[0].personality='낯을 가리지만 마음이 따뜻한 사람';
 s.roles[1].name='도윤';s.roles[1].personality='작은 일에도 웃음을 찾는 사람';
 s.scenes[0].title='비 오는 정류장';s.scenes[0].description='막차가 떠난 정류장에 두 사람이 남았다.';
 s.lines[0].text='비가 그칠 때까지 같이 기다릴래요? 혼자 기다리니 시간이 길게 느껴져서요.';
 s.lines[1].text='좋아요. 사실 우산이 하나 있는데, 어디로 가야 할지 몰라서 서 있었거든요.';
 s.lines.forEach(l=>l.durationSeconds=13);
 s.soundCues=[{id:'rain',kind:'ambient',prompt:'지붕에 떨어지는 잔잔한 빗방울, 대사를 방해하지 않는 먼 배경',sceneId:s.scenes[0].id,lineId:s.lines[0].id,anchor:'before',offsetSeconds:0,generationSeconds:5,durationSeconds:5,volume:0.12,fadeInSeconds:1,fadeOutSeconds:1}];
 return s;
}
export function memoryBucket(){
 const objects=new Map();
 const size=v=>typeof v==='string'?new TextEncoder().encode(v).length:v?.byteLength||0;
 return {objects,async put(k,v){objects.set(k,v);},async delete(k){for(const key of Array.isArray(k)?k:[k])objects.delete(key);},
  async list({prefix=''}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};},
  async head(k){return objects.has(k)?{size:size(objects.get(k))}:null;},
  async get(k){return objects.has(k)?{body:objects.get(k),size:size(objects.get(k))}:null;}};
}
