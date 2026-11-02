// Pure search rules shared by the browser bundle and the Worker. No source data is rewritten.
export const SEARCH_SEPARATORS=[' ','-','&','\t','\n','\r','\u00a0','\u3000'];
export const normalizeSearch=value=>SEARCH_SEPARATORS.reduce((text,c)=>text.replaceAll(c,''),String(value??'').toLowerCase());
export const SEARCH_ALIASES=[
 ['K-POP','케이팝','케이 팝'],['J-POP','제이팝'],['R&B','RNB','알앤비'],
 ['Hip-Hop','힙합'],['Ballad','발라드'],['EDM','이디엠'],['Electronic','일렉트로닉'],
 ['Rock','록','락'],['Jazz','재즈'],['Soul','소울'],['Lo-fi','로파이'],
 ['BTS','방탄소년단'],['IU','아이유'],['NewJeans','뉴진스']
];
const INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function searchInitials(value){return [...String(value)].map(c=>{const n=c.charCodeAt(0)-0xac00;return n>=0&&n<11172?INITIALS[Math.floor(n/588)]:c;}).join('');}
const globLiteral=value=>[...value].map(c=>c==='['?'[[]':c==='*'?'[*]':c==='?'?'[?]':c).join('');
function distance(a,b){
 const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
 }return d[a.length][b.length];
}
export function searchPlan(raw,allowFuzzy=true){
 raw=String(raw).trim().slice(0,100);const normalized=normalizeSearch(raw);
 const group=SEARCH_ALIASES.find(g=>g.some(v=>normalizeSearch(v)===normalized));
 const aliases=group?[...new Set(group.map(normalizeSearch))]:[];
 const initialOnly=/^[ㄱ-ㅎ]+$/.test(normalized)&&[...normalized].every(c=>INITIALS.includes(c));
 const initial=initialOnly?[...normalized].map(c=>{const start=0xac00+INITIALS.indexOf(c)*588;return '['+String.fromCharCode(start)+'-'+String.fromCharCode(start+587)+']';}).join(''):'';
 const fuzzy=new Set();
 // Whole-field edits only, at most one edit and never for short/initial queries.
 if(allowFuzzy&&!initialOnly&&normalized.length>=4&&normalized.length<=40){
  for(let i=0;i<normalized.length;i++){
   const a=globLiteral(normalized.slice(0,i)),b=globLiteral(normalized.slice(i+1));
   fuzzy.add(a+'?'+b);fuzzy.add(a+b);
   if(i+1<normalized.length)fuzzy.add(a+globLiteral(normalized[i+1]+normalized[i])+globLiteral(normalized.slice(i+2)));
  }
  for(let i=0;i<=normalized.length;i++)fuzzy.add(globLiteral(normalized.slice(0,i))+'?'+globLiteral(normalized.slice(i)));
  for(const g of SEARCH_ALIASES)if(g.some(v=>distance(normalized,normalizeSearch(v))===1))for(const v of g)fuzzy.add(globLiteral(normalizeSearch(v)));
 }
 const initialRanges=initialOnly?[...normalized].map(c=>{const start=0xac00+INITIALS.indexOf(c)*588;return '['+String.fromCharCode(start)+'-'+String.fromCharCode(start+587)+']';}):[];
 // D1 limits each GLOB pattern to 50 bytes; each initial range is matched separately.
 return {raw,normalized,aliases,initial,initialRanges,initialPrefix:initial&&normalized.length>=3?initial+'*':'',fuzzy:[...fuzzy].filter(p=>new TextEncoder().encode(p).length<=50)};
}
