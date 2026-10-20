const sinoDigits=['','일','이','삼','사','오','육','칠','팔','구'];
const nativeOnes=[[''],['한','하나'],['두','둘'],['세','셋'],['네','넷'],['다섯'],['여섯'],['일곱'],['여덟'],['아홉']];
const nativeTens=['','열','스물','서른','마흔','쉰','예순','일흔','여든','아흔'];
const seconds=new Map();
for(let n=1;n<100;n++){
 const tens=Math.floor(n/10),ones=n%10;
 const sino=(tens?(tens===1?'':sinoDigits[tens])+'십':'')+sinoDigits[ones];
 for(const one of nativeOnes[ones])seconds.set(nativeTens[tens]+one,sino);
}
seconds.set('스무','이십');
// Match the entire number, not the "일곱" suffix in "열일곱".
// A following particle is allowed, but unrelated words such as 초콜릿 are not.
const secondNumber=new RegExp(`(?<![\\p{L}\\p{N}_])(${[...seconds.keys()].sort((a,b)=>b.length-a.length).join('|')})[ \\t]*초(?=$|[^\\p{L}\\p{N}_]|(?:가|는|를|의|에|도|만|로|간|쯤|씩|마다|부터|까지|동안|전|후|정도|짜리)(?=$|[^\\p{L}\\p{N}_]))`,'gu');
export function normalizeDubbingSeconds(text){
 return text.replace(secondNumber,(_,number)=>`${seconds.get(number)} 초`);
}
// Only AI output uses this correction; preserve user-authored scripts and all
// recording IDs, cue anchors, timings and character names.
export function normalizeGeneratedDubbingScript(script){
 const copy=structuredClone(script),fix=(item,fields)=>{for(const field of fields)if(typeof item[field]==='string')item[field]=normalizeDubbingSeconds(item[field]);};
 fix(copy,['title']);
 copy.roles.forEach(role=>fix(role,['personality']));
 copy.scenes.forEach(scene=>fix(scene,['title','description']));
 copy.lines.forEach(line=>fix(line,['text','emotion','direction']));
 copy.soundCues.forEach(cue=>fix(cue,['prompt']));
 return copy;
}
