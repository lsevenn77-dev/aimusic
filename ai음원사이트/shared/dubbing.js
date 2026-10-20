// Shared, dependency-free script contract. No provider secrets or audio generation here.
export const DUBBING_GENRES=['SF','이세계물','판타지','사극','로맨스','액션','코미디','첩보','공포','스릴러','미스터리','일상','감동'];
export const DUBBING_MOODS=['유쾌하게','설레게','진지하게','긴장감 있게','슬프게','랜덤'];
export const DUBBING_ENDINGS=['해피엔딩','새드엔딩','반전','열린 결말','랜덤'];
export const DUBBING_MODEL='gpt-6-luna';
export const DUBBING_LENGTHS=Array.from({length:10},(_,i)=>(i+1)/2);
export const DUBBING_SOUND_GOLD=50;
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const text=(v,max,label,optional=false)=>{
 if(typeof v!=='string'||v.length>max||(!optional&&!v.trim()))invalid(`${label}을 확인해주세요.`);
 return v.trim();
};
const num=(v,min,max,label)=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)invalid(`${label} 범위를 확인해주세요.`);
 return Math.round(v*100)/100;
};
const key=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(v))invalid('대본 식별자가 올바르지 않습니다.');return v;};
const array=(v,min,max,label)=>{if(!Array.isArray(v)||v.length<min||v.length>max)invalid(`${label} 개수를 확인해주세요.`);return v;};
const record=v=>{if(!v||typeof v!=='object'||Array.isArray(v))invalid('대본 항목의 형식을 확인해주세요.');return v;};
const unique=(items,label)=>{if(new Set(items).size!==items.length)invalid(`${label}이 중복되었습니다.`);};
const choice=(v,values,label)=>{if(!values.includes(v))invalid(`${label}을 선택해주세요.`);return v;};
export function dubbingOptions(v){
 if(!v||typeof v!=='object')invalid('대본 설정을 확인해주세요.');
 const genres=array(v.genres,1,2,'장르').map(g=>choice(g,DUBBING_GENRES,'장르'));
 unique(genres,'장르');
 if(!Number.isInteger(v.roleCount)||!DUBBING_LENGTHS.includes(v.minutes))invalid('인원과 길이(30초~5분)를 확인해주세요.');
 return {genres,roleCount:num(v.roleCount,1,6,'참여 인원'),minutes:v.minutes,
  mood:choice(v.mood,DUBBING_MOODS,'분위기'),ending:choice(v.ending,DUBBING_ENDINGS,'결말'),idea:text(v.idea??'',1500,'추가 설정',true)};
}
export function emptyDubbingScript(options){
 const o=dubbingOptions(options),roles=Array.from({length:o.roleCount},(_,i)=>({id:`role_${i+1}`,name:`배역 ${i+1}`,personality:''}));
 return {version:1,title:'',genres:o.genres,roles,scenes:[{id:'scene_1',title:'첫 장면',description:''}],
  lines:roles.map((r,i)=>({id:crypto.randomUUID(),order:i+1,sceneId:'scene_1',roleId:r.id,text:'',emotion:'자연스럽게',direction:'',durationSeconds:5,gapSeconds:1})),soundCues:[]};
}
export function validateDubbingScript(raw,options){
 const o=dubbingOptions(options);
 if(!raw||raw.version!==1)invalid('지원하지 않는 대본 형식입니다.');
 const roles=array(raw.roles,o.roleCount,o.roleCount,'배역').map(record).map(r=>({id:key(r.id),name:text(r.name,40,'배역 이름'),personality:text(r.personality,240,'성격',true)}));
 unique(roles.map(r=>r.id),'배역 ID');unique(roles.map(r=>r.name),'배역 이름');
 const scenes=array(raw.scenes,1,12,'장면').map(record).map(s=>({id:key(s.id),title:text(s.title,80,'장면 제목'),description:text(s.description,500,'장면 설명',true)}));
 unique(scenes.map(s=>s.id),'장면 ID');
 const lines=array(raw.lines,roles.length,120,'대사').map(record).map((l,i)=>{
  if(!roles.some(r=>r.id===l.roleId)||!scenes.some(s=>s.id===l.sceneId))invalid('대사의 배역 또는 장면이 없습니다.');
  return {id:key(l.id),order:i+1,sceneId:l.sceneId,roleId:l.roleId,text:text(l.text,700,'대사'),
   emotion:text(l.emotion,80,'감정',true),direction:text(l.direction,240,'연기 지시',true),
   durationSeconds:num(l.durationSeconds,1,40,'대사 길이'),gapSeconds:num(l.gapSeconds,0.3,8,'대사 간 여유')};
 });
 unique(lines.map(l=>l.id),'대사 ID');
 let sceneOrder=-1;
 for(const line of lines){const index=scenes.findIndex(s=>s.id===line.sceneId);if(index<sceneOrder)invalid('대사를 장면 순서대로 배치해주세요.');sceneOrder=index;}
 for(const role of roles)if(!lines.some(l=>l.roleId===role.id))invalid(`${role.name}의 대사를 추가해주세요.`);
 for(const scene of scenes)if(!lines.some(l=>l.sceneId===scene.id))invalid(`${scene.title}에 대사를 추가해주세요.`);
 const soundCues=array(raw.soundCues,0,24,'음향 연출').map(record).map(c=>{
  const line=lines.find(l=>l.id===c.lineId);
  if(!line||line.sceneId!==c.sceneId)invalid('음향 연출의 연결 대사를 확인해주세요.');
  const kind=choice(c.kind,['sfx','bgm','ambient'],'음향 종류'),durationSeconds=num(c.durationSeconds,0.5,kind==='sfx'?5:kind==='ambient'?20:30,'음향 길이');
  return {id:key(c.id),kind,prompt:text(c.prompt,500,'음향 연출'),sceneId:c.sceneId,lineId:line.id,
   anchor:choice(c.anchor,['before','after'],'음향 위치'),offsetSeconds:num(c.offsetSeconds,0,10,'음향 오프셋'),
   generationSeconds:num(c.generationSeconds,Math.max(kind==='bgm'?10:1,durationSeconds),kind==='bgm'?30:20,'생성 길이'),
   durationSeconds,volume:num(c.volume,0,0.5,'음향 볼륨'),fadeInSeconds:num(c.fadeInSeconds,0,durationSeconds/2,'페이드 인'),
   fadeOutSeconds:num(c.fadeOutSeconds,0,durationSeconds/2,'페이드 아웃')};
 });
 unique(soundCues.map(c=>c.id),'음향 ID');
 if(soundCues.filter(c=>c.kind==='bgm').length>3)invalid('배경음악은 최대 3개까지 배치할 수 있습니다.');
 const script={version:1,title:text(raw.title,100,'작품 제목'),genres:o.genres,roles,scenes,lines,soundCues};
 const timeline=dubbingTimeline(script);
 if(timeline.duration>300)invalid('여유 구간과 음향을 포함해 5분 이내로 작성해주세요.');
 return script;
}
export function dubbingTimeline(script){
 let cursor=2;
 const lines=script.lines.map(l=>{const start=cursor,end=start+l.durationSeconds;cursor=end+l.gapSeconds;return {id:l.id,roleId:l.roleId,start,end,slotEnd:cursor};});
 const sounds=script.soundCues.map(c=>{const line=lines.find(l=>l.id===c.lineId);const start=Math.max(0,(c.anchor==='before'?line.start-c.durationSeconds:line.end)+c.offsetSeconds);return {...c,start,end:start+c.durationSeconds};});
 return {lines,sounds,duration:Math.round(Math.max(cursor+2,...sounds.map(s=>s.end))*100)/100};
}

// Responses Structured Outputs: every property required, objects closed.
const string={type:'string'},number={type:'number'};
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const list=items=>({type:'array',items});
export const DUBBING_SCRIPT_SCHEMA=object({
 version:{type:'integer',enum:[1]},title:string,genres:list({type:'string',enum:DUBBING_GENRES}),
 roles:list(object({id:string,name:string,personality:string})),
 scenes:list(object({id:string,title:string,description:string})),
 lines:list(object({id:string,order:{type:'integer'},sceneId:string,roleId:string,text:string,emotion:string,direction:string,durationSeconds:number,gapSeconds:number})),
 soundCues:list(object({id:string,kind:{type:'string',enum:['sfx','bgm','ambient']},prompt:string,sceneId:string,lineId:string,
  anchor:{type:'string',enum:['before','after']},offsetSeconds:number,generationSeconds:number,durationSeconds:number,volume:number,fadeInSeconds:number,fadeOutSeconds:number}))
});
