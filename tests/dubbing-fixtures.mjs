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
 const objects=new Map(),metadata=new Map();
 const size=v=>typeof v==='string'?new TextEncoder().encode(v).length:v?.byteLength||0;
 const head=key=>objects.has(key)?{key,size:size(objects.get(key)),...metadata.get(key)}:null;
 let version=0;
 return {objects,async put(key,body,{onlyIf,customMetadata}={}){
  const prior=head(key);
  if(onlyIf?.has('If-Match')&&onlyIf.get('If-Match')!=='"'+prior?.etag+'"'||onlyIf?.has('If-None-Match')&&prior)return null;
  objects.set(key,body);metadata.set(key,{etag:String(++version),uploaded:new Date(),customMetadata});return head(key);
 },async delete(k){for(const key of Array.isArray(k)?k:[k]){objects.delete(key);metadata.delete(key);}},
 async list({prefix=''}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(head),truncated:false};},
 async head(key){return head(key);},
 async get(key,{range}={}){if(!objects.has(key))return null;let body=objects.get(key);if(range){const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body.buffer??body,body.byteOffset??0,body.byteLength);body=bytes.slice(range.offset,range.offset+range.length);}return {...head(key),body,json:async()=>JSON.parse(body)};}};
}
