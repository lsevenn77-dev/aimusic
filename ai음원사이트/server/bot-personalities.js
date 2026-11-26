import snapshot from './data/saigram-personalities.json' with {type:'json'};
import {GENRES,parseList} from '../shared/genres.js';

// Server-only, read-only Saigram personality snapshot. No dialogue examples,
// relationship state, biography, dialect, romance rules or private user data.
const hash=s=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const families={
 calm:['Ballad','Acoustic','Folk','Lo-fi','Ambient','Jazz','Classical','New Age','Chillout','Instrumental'],
 warm:['Ballad','R&B','Soul','Indie Pop','Acoustic','Folk','OST','Gospel','Children','Country'],
 bright:['K-POP','Pop','J-POP','Dance','Funk','Disco','EDM','Latin','Reggae','Afrobeats','Reggaeton','트로트'],
 direct:['Rock','Alternative','Hip-Hop','Metal','Punk','Trap','Blues','Electronic','Techno','House'],
 curious:['Fusion','Korean Folklore Fusion','국악','World Music','Dark Pop','Synth Pop','City Pop','Cinematic','Orchestral','Trance','Drum & Bass']
};
function affinity(p,genre){
 const a=p.axes,t=JSON.stringify(p.traits),groups=[];
 if(['정중함','무심함'].includes(a.social_tone)||/차분|조용|신중|담백/.test(t))groups.push('calm');
 if(['공감','조용히 들어줌','감정적으로 내 편 먼저'].includes(a.comfort_style)||/다정|배려|섬세/.test(t))groups.push('warm');
 if(['친근함','장난스러움'].includes(a.social_tone)||/밝|활발|유쾌/.test(t))groups.push('bright');
 if(['직설적','까칠함'].includes(a.social_tone)||['해결','현실 조언'].includes(a.comfort_style))groups.push('direct');
 if(['엉뚱형','관찰형'].includes(a.humor_style)||a.question_style==='구체적으로 물음')groups.push('curious');
 return groups.filter(g=>families[g].includes(genre)).length;
}
const identities=new Map();
for(const p of Object.values(snapshot.profiles))if(!identities.has(p.source_id)){
 const ranked=GENRES.map(g=>({genre:g,score:affinity(p,g)*2+hash(p.source_id+'|'+g)/2**32})).sort((a,b)=>b.score-a.score);
 identities.set(p.source_id,{...p,preferredGenres:ranked.slice(0,5).map((r,i)=>({genre:r.genre,weight:5-i}))});
}
// Retain rare genres too: assign at least three existing personalities per genre.
// This is an authored music preference, not a claim that personality predicts taste.
for(const genre of GENRES){
 let count=[...identities.values()].filter(p=>p.preferredGenres.some(g=>g.genre===genre)).length;
 for(const p of [...identities.values()].sort((a,b)=>(affinity(b,genre)-affinity(a,genre))||hash(b.source_id+genre)-hash(a.source_id+genre))){
  if(count>=3)break;if(p.preferredGenres.some(g=>g.genre===genre))continue;
  p.preferredGenres.push({genre,weight:1});count++;
 }
}
export const BOT_PERSONALITIES=new Map(Object.entries(snapshot.profiles).map(([key,p])=>[key,identities.get(p.source_id)]));
export const botPersonality=bot=>BOT_PERSONALITIES.get(bot?.source_key)||null;
export function musicGenres(target){return [...new Set([...parseList(target.genres_json),target.genre].filter(g=>typeof g==='string'&&g&&g!=='분석 대기'))];}
export function preferenceScore(personality,genres){return personality?.preferredGenres.reduce((sum,p)=>sum+(genres.includes(p.genre)?p.weight:0),0)||0;}

const tone={정중함:'차분하고 사려 깊게 표현한다.',친근함:'상대의 글에 먼저 편안하게 반응한다.',무심함:'감정을 부풀리지 않고 마음에 든 지점을 담백하게 말한다.',직설적:'돌려 말하지 않고 핵심부터 말한다.',까칠함:'과장된 칭찬에 쉽게 동조하지 않고 자기 기준에 맞는 지점을 솔직하게 말한다.',장난스러움:'곡과 글에 근거한 가벼운 유머를 상황에 맞게 섞는다.'};
const humor={관찰형:'눈에 띈 구체적인 특징에서 유머를 찾는다.',놀림형:'곡에 관한 가벼운 장난을 즐기되 창작자를 조롱하지 않는다.',자학형:'가벼운 자기 낮춤의 유머를 쓰되 허구의 과거 경험을 만들지 않는다.',건조형:'담담한 표현에서 유머가 드러난다.',엉뚱형:'뜻밖의 연상이나 비유를 즐긴다.','거의 없음':'농담을 억지로 넣지 않는다.'};
export function personalityContext(p){
 const a=p.axes;
 return {traits:p.traits,axes:a,expressionRules:[tone[a.social_tone],humor[a.humor_style],
  a.softener==='많음'?'표현을 부드럽게 감싸는 편이다.':a.softener==='거의 없음'?'불필요한 완충 표현을 줄인다.':'완충 표현은 필요할 때만 쓴다.',
  a.question_style==='거의 안 물음'?'질문보다 자신의 반응으로 마무리하는 편이다.':'질문은 궁금한 점이 실제로 있을 때만 한다. 매번 질문하지 않는다.',
  '모든 성격은 존댓말로 표현한다. 축의 이름이나 성격 설명을 댓글에 나열하지 않는다.'
 ].filter(Boolean),preferredGenres:p.preferredGenres};
}
