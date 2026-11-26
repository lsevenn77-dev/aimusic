// The existing ai_tool text column remains readable by older clients. Empty values
// are unspecified; only an explicit sentinel means the creator declared no AI.
export const NO_AI_LABEL='AI 사용 안 함';
export const AI_TOOL_LIMIT=100;
export const AI_TOOL_GROUPS=Object.freeze([
 {id:'music',name:'음악 생성',tools:[['suno','Suno'],['udio','Udio'],['mureka','Mureka'],['aiva','AIVA'],['soundraw','SOUNDRAW']]},
 {id:'writing',name:'가사 · 아이디어',tools:[['chatgpt','ChatGPT'],['claude','Claude'],['gemini','Gemini']]},
 {id:'voice',name:'보컬 제작',tools:[['ace-studio','ACE Studio'],['synthesizer-v','Synthesizer V']]}
]);
export const AI_TOOLS=Object.freeze(AI_TOOL_GROUPS.flatMap(group=>group.tools.map(([id,name])=>({id,name,group:group.id}))));
const key=value=>String(value??'').trim().toLocaleLowerCase('en-US');
export function parseProductionCredit(value=''){
 const original=String(value??''),text=original.trim();
 if(!text)return {usage:'unspecified',ids:[],other:'',original};
 if(text===NO_AI_LABEL)return {usage:'none',ids:[],other:'',original};
 const ids=[],other=[];
 for(const part of text.split(/[,，;\n]+/).map(s=>s.trim()).filter(Boolean)){
  const known=AI_TOOLS.find(tool=>key(tool.name)===key(part));
  if(known){if(!ids.includes(known.id))ids.push(known.id);}else other.push(part);
 }
 return {usage:'used',ids,other:other.join(', '),original};
}
export function serializeProductionCredit({ids=[],other='',none=false}={}){
 if(none)return NO_AI_LABEL;
 const names=AI_TOOLS.filter(tool=>ids.includes(tool.id)).map(tool=>tool.name),seen=new Set(names.map(key));
 for(const part of String(other).split(/[,，;\n]+/).map(s=>s.trim()).filter(Boolean)){
  const normalized=key(part);if(!seen.has(normalized)){names.push(part);seen.add(normalized);}
 }
 return names.join(', ');
}
export function productionCreditFields(body,current){
 const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!Object.hasOwn(body,'ai_tool')){
  if(current)return {ai_tool:current.ai_tool??'',is_ai:current.ai_tool===NO_AI_LABEL?0:(current.is_ai===0?0:1)};
  invalid('사용한 AI 도구 또는 AI 사용 안 함을 선택해 주세요.');
 }
 if(typeof body.ai_tool!=='string')invalid('사용한 AI 도구를 확인해 주세요.');
 const tool=body.ai_tool.trim();
 if(!tool)invalid('사용한 AI 도구 또는 AI 사용 안 함을 선택해 주세요.');
 if(tool.length>AI_TOOL_LIMIT)invalid('AI 도구 이름은 합계 100자 이내로 입력해 주세요.');
 const noAI=tool===NO_AI_LABEL;
 if(!noAI&&tool.split(/[,，;\n]+/).some(value=>value.trim()===NO_AI_LABEL))invalid('AI 사용 안 함과 AI 도구를 함께 선택할 수 없습니다.');
 if(!noAI&&(body.is_ai===false||body.is_ai===0||body.is_ai==='false'||body.is_ai==='0'))invalid('AI 사용 여부와 선택한 도구를 확인해 주세요.');
 return {ai_tool:tool,is_ai:noAI?0:1};
}
export function productionCreditLabel(value){
 const text=String(value??'').trim();
 if(!text)return '';
 if(text===NO_AI_LABEL)return NO_AI_LABEL;
 return text.split(/[,，]+/).map(part=>part.trim()).filter(Boolean).join(' · ');
}
