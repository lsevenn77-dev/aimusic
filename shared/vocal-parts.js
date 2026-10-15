export const VOCAL_PARTS_VERSION=1;
const arrangements=['mixed_duet','solo','same_gender_group','instrumental','uncertain'];
const parts=['male','female','both','unknown'];
// These are musical performance roles, not a claim about a performer's identity.
// Never manufacture alternating parts from line numbers, pitch, artist names or cover art.
export function normalizeVocalParts(value,lineCount){
 if(!value||!arrangements.includes(value.arrangement)||!Number.isInteger(lineCount)||lineCount<1||lineCount>1000||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1||!Array.isArray(value.segments)||value.segments.length>lineCount)throw new Error('Invalid vocal part analysis');
 let arrangement=value.arrangement;
 const lines=Array(lineCount).fill('unknown'),seen=new Set();
 for(const s of value.segments){
  if(!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end<s.start||s.end>=lineCount||!parts.includes(s.part)||!Number.isFinite(s.confidence)||s.confidence<0||s.confidence>1)throw new Error('Invalid lyric segment');
  for(let i=s.start;i<=s.end;i++){if(seen.has(i))throw new Error('Overlapping lyric segments');seen.add(i);if(s.confidence>=.8)lines[i]=s.part;}
 }
 if(value.confidence<.85||(arrangement==='mixed_duet'&&(!lines.includes('male')||!lines.includes('female'))))arrangement='uncertain';
 return {version:VOCAL_PARTS_VERSION,arrangement,confidence:value.confidence,lines:arrangement==='mixed_duet'?lines:[],reason:typeof value.reason==='string'?value.reason.slice(0,500):''};
}
