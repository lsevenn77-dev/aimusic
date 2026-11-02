import {SEARCH_ALIASES,normalizeSearch} from '../shared/search.js';
import {rows} from './db.js';
import {producerNameSQL} from './identity.js';
import {compactSearchSQL,compactSearchText,searchText} from './search-match.js';

const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const CHOSEONG_START = 0x1100;
const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;
const FUZZY_SCAN_LIMIT = 4000;
const INITIAL_SCAN_LIMIT = 400;

export function koreanInitials(input) {
 return [...compactSearchText(input)].map(ch => {
  const code = ch.codePointAt(0);
  if (code >= SYLLABLE_START && code <= SYLLABLE_END) return INITIALS[Math.floor((code-SYLLABLE_START)/588)];
  if (code >= CHOSEONG_START && code < CHOSEONG_START+INITIALS.length) return INITIALS[code-CHOSEONG_START];
  return ch;
 }).join('');
}

export function initialQuery(input) {
 const compact = compactSearchText(input);
 if (!/^[\u1100-\u1112\u3131-\u314e]{2,16}$/u.test(compact)) return '';
 const initials = koreanInitials(compact);
 return [...initials].every(c => INITIALS.includes(c)) ? initials : '';
}

export function initialGlob(input) {
 return '*' + [...input].map(ch => {
  const index = INITIALS.indexOf(ch);
  if (index < 0) return '';
  const start = SYLLABLE_START+index*588;
  return '['+String.fromCodePoint(start)+'-'+String.fromCodePoint(start+587)+']';
 }).join('') + '*';
}

function fuzzyTolerance(length) { return length >= 7 ? 2 : length >= 3 ? 1 : 0; }

// Optimal string alignment distance: substitution, insertion, deletion and adjacent swaps.
export function typoDistance(a, b) {
 const x = [...a],y = [...b],n=x.length,m=y.length;
 let previousPrevious = null, previous = Array.from({length:m+1},(_,i)=>i);
 for (let i=1;i<=n;i++) {
  const current=[i];
  for (let j=1;j<=m;j++) {
   let distance=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(x[i-1]===y[j-1]?0:1));
   if (i>1 && j>1 && x[i-1]===y[j-2] && x[i-2]===y[j-1]) {
    distance=Math.min(distance,previousPrevious[j-2]+1);
   }
   current.push(distance);
  }
  previousPrevious=previous;
  previous=current;
 }
 return previous[m];
}

function tokenDistance(query, target) {
 const queryChars=[...query],length=queryChars.length;
 const limit=fuzzyTolerance(length);
 if(!target) return Infinity;
 if(target.includes(query)) return 0;
 if(!limit) return Infinity;
 const chars=[...target],n=chars.length;
 if(n<length-limit) return Infinity;
 let starts;
 if(length>=5 && n>length+limit) {
  // At least one adjacent pair should survive one or two typing errors.
  // Anchor comparison windows instead of running edit distance over every substring.
  const positions=new Map();
  for(let i=0;i<n-1;i++){
   const pair=chars[i]+chars[i+1],at=positions.get(pair)||[];
   at.push(i);positions.set(pair,at);
  }
  const anchored=new Set();
  for(let i=0;i<length-1;i++){
   for(const at of positions.get(queryChars[i]+queryChars[i+1])||[]){
    for(let shift=-limit;shift<=limit;shift++) {
     const start=at-i+shift;
     if(start>=0 && start<n)anchored.add(start);
    }
   }
  }
  if(!anchored.size)return Infinity;
  starts=[...anchored];
 } else starts=Array.from({length:Math.max(0,n-Math.max(1,length-limit)+1)},(_,i)=>i);
 let best=Infinity;
 for(let len=Math.max(1,length-limit);len<=Math.min(n,length+limit);len++){
  for(const start of starts){
   if(start+len>n)continue;
   const distance=typoDistance(query,chars.slice(start,start+len).join(''));
   if(distance<best)best=distance;
   if(best===1)return 1;
  }
 }
 return best<=limit?best:Infinity;
}

export function scoreTrackTypo(input, track, cache=new Map()) {
 const q=searchText(input);
 const compact=compactSearchText(q);
 if (compact.length<3 || compact.length>48 || initialQuery(q)) return Infinity;
 const fields=[track.title,track.artist,track.producer].map(compactSearchText);
 const tokens=q.split(' ').map(compactSearchText).filter(Boolean);
 const units=tokens.length>1 ? tokens : [compact];
 let errors=0,fieldPenalty=0;
 for(const token of units){
  let bestDistance=Infinity,bestField=Infinity;
  for(let field=0;field<fields.length;field++){
   const key=token+'\0'+fields[field];
   if (!cache.has(key)) cache.set(key,tokenDistance(token,fields[field]));
   const distance=cache.get(key);
   if(distance<bestDistance || (distance===bestDistance && field<bestField)){
    bestDistance=distance;bestField=field;
   }
  }
  if(!Number.isFinite(bestDistance))return Infinity;
  errors+=bestDistance;fieldPenalty+=bestField;
  if(errors>2)return Infinity;
 }
 return errors*10+fieldPenalty;
}

function scoreInitial(initials, track) {
 for (const [priority,value] of [track.title,track.artist,track.producer].entries()) {
  const text=koreanInitials(value);
  if (text.startsWith(initials)) return priority*2;
  if (text.includes(initials)) return priority*2+1;
 }
 return Infinity;
}

function sourceSQL(where) {
 const producer=producerNameSQL();
 return {
  producer,
  sql:`SELECT t.id,t.title,a.name artist,${producer} producer,t.genre,t.genres_json,t.created FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id WHERE ${where}`
 };
}

function scoreRows(candidates, q, initials, limit) {
 const words = compactSearchText(q);
 const aliases = !initials && words.length >= 4 && words.length <= 40
  ? new Set(SEARCH_ALIASES.filter(group => group.some(name => typoDistance(words,compactSearchText(name)) === 1)).flat().map(normalizeSearch))
  : new Set();
 const cache = new Map();
 function typoScore(track) {
  if ([track.genre,...JSON.parse(track.genres_json || '[]')].some(genre=>aliases.has(normalizeSearch(genre)))) return 12;
  return scoreTrackTypo(q, track, cache);
 }
 return candidates.map(track=>({track,score:initials?scoreInitial(initials,track):typoScore(track)}))
  .filter(x=>Number.isFinite(x.score))
  .sort((a,b)=>a.score-b.score||b.track.created-a.track.created||a.track.id.localeCompare(b.track.id))
  .slice(0,limit);
}

export async function alternativeTrackMatches(env, input, {where, args=[], limit=100}={}) {
 const q=searchText(input),initials=initialQuery(q),compact=compactSearchText(q);
 if (!q || (!initials && (compact.length<3 || compact.length>48))) return null;
 const base=sourceSQL(where);
 let candidates=[];
 if (initials) {
  const pattern=initialGlob(initials.slice(0,5));
  const expressions=['t.title','a.name',base.producer];
  // For long queries only use a short prefix GLOB in D1 (50-byte pattern limit).
  const checks=expressions.map(field=>compactSearchSQL(field)+' GLOB ?');
  candidates=await rows(env,base.sql+' AND ('+checks.join(' OR ')+') ORDER BY t.created DESC,t.id LIMIT '+INITIAL_SCAN_LIMIT,
   ...args,...checks.map(()=>pattern));
 } else {
  // Only run this bounded fallback if exact search returns no matching songs.
  // A small title/artist projection keeps D1 and Worker work bounded.
  candidates=await rows(env,base.sql+' ORDER BY t.created DESC LIMIT '+FUZZY_SCAN_LIMIT,...args);
 }
 const ranked=scoreRows(candidates,q,initials,limit);
 if (!ranked.length) return null;
 return {ids:ranked.map(x=>x.track.id),kind:initials?'initial':'typo',suggested:ranked[0].track.title};
}
